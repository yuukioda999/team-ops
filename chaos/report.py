#!/usr/bin/env python3
"""障害訓練の結果をまとめる(spec 009 の AC-009-01・02、ADR-0025)。

chaos/drill.sh のあとに、team-ops/ で動かす:
    python3 chaos/report.py <drill.sh と同じ出力先>

宛先ごとに、Mailpit が受け取った回数、API の配信状況、notify-relay の状態を並べ(AC-009-02)、
訓練ごとの期待と比べる。期待と違えば終了コード1で終わる。
メールアドレスは出さない(試験用のアドレスと利用者IDの対応は <出力先>-private/ にあり、アップロードしない)。
"""

from __future__ import annotations

import collections
import dataclasses
import datetime as dt
import json
import pathlib
import re
import subprocess
import sys
import urllib.request

COMPOSE = ["docker", "compose", "-f", "compose.yaml", "-f", "chaos/compose.chaos.yaml"]
MAILPIT = "http://127.0.0.1:8025"
SEND_CONCURRENCY = 50  # notify-relay の既定(開発用の compose では変えていない)。判断4の二重配信の上限


@dataclasses.dataclass
class Recipient:
    received: int = 0  # Mailpit が受け取った回数
    api: str = "-"  # API の delivery_status(行がなければ -)
    api_error: str = "-"
    relay: str = "-"  # notify-relay の status(行がなければ -)
    relay_error: str = "-"
    attempts: int = 0  # notify-relay の送信の回数


@dataclasses.dataclass
class Summary:
    expected: int
    recipients: dict[int, Recipient]
    unknown_addresses: int = 0  # 試験データにない宛先に届いた数

    def count(self, pred) -> int:
        return sum(1 for r in self.recipients.values() if pred(r))

    @property
    def lost(self) -> int:  # 失敗と記録されずに届いていない(取りこぼし)
        return self.count(lambda r: r.received == 0 and r.api != "failed")

    @property
    def failed_but_received(self) -> int:
        return self.count(lambda r: r.received > 0 and r.api == "failed")

    @property
    def twice(self) -> int:
        return self.count(lambda r: r.received >= 2)

    @property
    def extra(self) -> int:
        return sum(r.received - 1 for r in self.recipients.values() if r.received >= 2)

    @property
    def mismatch(self) -> int:  # API と notify-relay で状態が違う
        return self.count(lambda r: r.api != r.relay)

    def status(self, side: str) -> dict[str, int]:
        return dict(collections.Counter(getattr(r, side) for r in self.recipients.values()))

    def table(self) -> list[tuple[str, str, str, int]]:
        """宛先ごとの並び(受信回数・API・notify-relay)を、組み合わせごとの人数にまとめる(AC-009-02)。"""
        def times(n: int) -> str:
            return "2回以上" if n >= 2 else f"{n}回"
        c = collections.Counter((times(r.received), r.api, r.relay) for r in self.recipients.values())
        return [(a, b, d, n) for (a, b, d), n in sorted(c.items())]


def judge(scenario: str, s: Summary, facts: dict[str, str]) -> list[tuple[str, bool]]:
    """訓練ごとの期待(spec の AC-009-03〜07)。前半は「障害が確かめたい処理の最中に当たった」こと。"""
    f = {k: int(v) for k, v in facts.items() if v.lstrip("-").isdigit()}
    teams, expected = f.get("teams", 0), s.expected
    delivered = s.status("api").get("delivered", 0)
    hit: list[tuple[str, bool]] = {
        "smtp-temp": [("当たった:一時エラーで再送した宛先がある", s.count(lambda r: r.attempts >= 2) > 0)],
        "smtp-perm": [("当たった:恒久エラーで失敗した宛先がある", s.status("api").get("failed", 0) > 0)],
        "relay-stop": [("当たった:止まっている間、すべての依頼がアウトボックスに残り、1通も届いていない",
                        f.get("unsent_outbox_while_down") == teams and f.get("mails_while_down") == 0)],
        "relay-kill": [("当たった:送信の途中(届いた数が0より多く、全員より少ない)で止めた",
                        0 < f.get("mails_at_kill", 0) < expected)],
        "api-down": [("当たった:止まっている間、配信結果が API に届いていない",
                      f.get("pending_while_down", 0) > 0),
                     ("当たった:止まっている間も送信は続いた(公開と送信は API の外で動く)",
                      f.get("mails_while_down", 0) > 0)],
    }[scenario]
    common = [
        ("宛先の数が API・notify-relay・試験データでそろう",
         len(s.recipients) == expected and s.count(lambda r: r.api == "-" or r.relay == "-") == 0),
        ("試験データにない宛先に届いていない", s.unknown_addresses == 0),
        ("取りこぼしがない", s.lost == 0),
        ("失敗と記録した宛先に届いていない", s.failed_but_received == 0),
        ("API と notify-relay の状態が一致する", s.mismatch == 0),
        ("結果の出ていない宛先がない", s.status("api").get("pending", 0) == 0),
    ]
    each = {
        "smtp-temp": [("二重配信がない", s.twice == 0), ("全員に届いた", delivered == expected)],
        "smtp-perm": [("二重配信がない", s.twice == 0),
                      ("失敗の理由はすべて invalid_address", set(r.api_error for r in s.recipients.values() if r.api == "failed") == {"invalid_address"}),
                      ("失敗した宛先は再送していない(送信1回)", s.count(lambda r: r.api == "failed" and r.attempts != 1) == 0)],
        "relay-stop": [("二重配信がない", s.twice == 0), ("全員に届いた", delivered == expected)],
        "relay-kill": [(f"二重に届いた数が同時に送る数({SEND_CONCURRENCY})以下", s.extra <= SEND_CONCURRENCY),
                       ("全員に届いた", delivered == expected)],
        "api-down": [("二重配信がない", s.twice == 0), ("全員に届いた", delivered == expected)],
    }[scenario]
    return hit + common + each


def log_summary(service: str, text: str) -> list[str]:
    """警告とエラーのログを、メッセージごとに数える(上位10件)。"""
    seen: collections.Counter[str] = collections.Counter()
    for line in text.splitlines():
        if line.startswith("{"):  # notify-relay (JSON)。送信の失敗は INFO で、error_code が付く
            try:
                e = json.loads(line)
            except ValueError:
                continue
            if e.get("level") in ("WARN", "ERROR") or e.get("error_code"):
                code = f"(error_code={e['error_code']})" if e.get("error_code") else ""
                seen[f"{e.get('level')} {str(e.get('msg', ''))[:120]}{code}"] += 1
            continue
        m = re.search(r"\.(WARNING|ERROR): ([^{\[]*)", line)
        if m:
            seen[f"{m.group(1)} {m.group(2).strip()[:120]}"] += 1
    return [f"| {service} | {msg} | {n} |" for msg, n in seen.most_common(10)]


# ここから下は、動いている環境を読む


def sql(query: str) -> list[list[str]]:
    done = subprocess.run(COMPOSE + ["exec", "-T", "mysql", "mysql", "-uroot", "-proot", "-N", "-B", "-e", query],
                          capture_output=True, text=True)
    if done.returncode != 0:
        sys.exit(f"The query failed: {done.stderr.strip()}\n{query}")
    return [line.split("\t") for line in done.stdout.strip().splitlines() if line]


def mailpit_messages() -> list[dict]:
    found, start = [], 0
    while True:
        with urllib.request.urlopen(f"{MAILPIT}/api/v1/messages?start={start}&limit=500", timeout=30) as r:
            page = json.load(r)
        found += page["messages"]
        start += len(page["messages"])
        if not page["messages"] or start >= page["total"]:
            return found


def parse(ts: str) -> dt.datetime:
    t = dt.datetime.fromisoformat(ts.replace("Z", "+00:00"))
    return t if t.tzinfo else t.replace(tzinfo=dt.timezone.utc)


def collect(out: pathlib.Path, expected: int) -> tuple[Summary, list[dt.datetime]]:
    by_address: dict[str, int] = json.loads((pathlib.Path(f"{out}-private") / "recipients.json").read_text())
    recipients = {uid: Recipient() for uid in by_address.values()}
    unknown = 0
    times = []
    for m in mailpit_messages():
        times.append(parse(m["Created"]))
        for to in m.get("To") or []:
            uid = by_address.get(to["Address"].lower())
            if uid is None:
                unknown += 1
            else:
                recipients[uid].received += 1
    for uid, status, error in sql("select user_id, delivery_status, coalesce(delivery_error, '-') from team_ops.notice_recipients"):
        r = recipients.setdefault(int(uid), Recipient())
        r.api, r.api_error = status, error
    for ref, status, error, attempts in sql(
            "select recipient_ref, status, coalesce(error_code, '-'), attempts from notify_relay.delivery_recipients"):
        if not ref.startswith("user_"):
            continue
        r = recipients.setdefault(int(ref[5:]), Recipient())
        r.relay, r.relay_error, r.attempts = status, error, int(attempts)
    return Summary(expected=expected, recipients=recipients, unknown_addresses=unknown), times


def main() -> None:
    out = pathlib.Path(sys.argv[1])
    facts: dict[str, str] = {}
    for line in (out / "drill.env").read_text().splitlines():
        if "=" in line:
            k, v = line.split("=", 1)
            facts[k] = v
    scenario, expected, at = facts["scenario"], int(facts["expected"]), parse(facts["scheduled_at"])
    s, times = collect(out, expected)
    checks = judge(scenario, s, facts)
    ok = all(passed for _, passed in checks)

    def epoch(key: str) -> dt.datetime | None:
        return dt.datetime.fromtimestamp(int(facts[key]), dt.timezone.utc) if key in facts else None

    def secs(a: dt.datetime | None, b: dt.datetime | None) -> str:
        return "-" if a is None or b is None else f"{(b - a).total_seconds():.0f} 秒"

    first, last = (min(times), max(times)) if times else (None, None)
    published = sql("select min(published_at), max(published_at) from team_ops.notices where status='published'")[0]
    timing = [
        ("予約の時刻から最初の1通", secs(at, first)),
        ("予約の時刻から最後の1通", secs(at, last)),
        ("予約の時刻から最初と最後の公開", f"{secs(at, parse(published[0]))}・{secs(at, parse(published[1]))}" if published[0] != "NULL" else "-"),
    ]
    timing += {
        "smtp-temp": [("障害を止めてから最後の1通", secs(epoch("fault_off"), last))],
        "smtp-perm": [],
        "relay-stop": [("notify-relay が応答できるようになってから最後の1通", secs(epoch("fault_off"), last))],
        "relay-kill": [("notify-relay の起動から最後の1通", secs(epoch("fault_off"), last))],
        "api-down": [("API が応答できるようになってから配信状況がそろうまで(2秒おきに確かめた)", secs(epoch("fault_off"), epoch("all_final")))],
    }[scenario]

    # 時刻で安定に並べる(同じ秒のできごとは書いた順のまま。予約の時刻は同じ秒のできごとの前に置く)
    timeline = (out / "timeline.txt").read_text().splitlines()
    timeline = sorted([f"{at:%H:%M:%S} 予約の時刻(お知らせの公開)"] + timeline, key=lambda line: line[:8])

    attempts = collections.Counter(r.attempts for r in s.recipients.values())
    outbox = dict(sql("select status, count(*) from team_ops.outbox_messages group by status"))
    outbox_attempts = dict(sql("select attempts, count(*) from team_ops.outbox_messages group by attempts"))

    lines = [
        f"# 障害訓練の結果:{scenario}",
        "",
        f"判定:**{'期待どおり' if ok else '期待と違う(振り返りで原因を調べる)'}**",
        "",
        "| 確かめたこと | 結果 |",
        "|---|---|",
        *[f"| {name} | {'はい' if passed else '**いいえ**'} |" for name, passed in checks],
        "",
        "## 時系列(UTC)",
        "",
        "```",
        *timeline,
        "```",
        "",
        "## 宛先ごとの並び(AC-009-02)",
        "",
        "宛先ごとに、受け取った回数・API の配信状況・notify-relay の状態をつなぎ、組み合わせごとの人数にまとめた。",
        "",
        "| 受け取った回数 | API | notify-relay | 人数 |",
        "|---|---|---|---|",
        *[f"| {a} | {b} | {d} | {n:,} |" for a, b, d, n in s.table()],
        "",
        "| 項目 | 値 |",
        "|---|---|",
        f"| 届くはずの宛先 | {expected:,} |",
        f"| 2通以上届いた宛先(二重配信) | {s.twice:,}(余分に届いたのは {s.extra:,} 通) |",
        f"| 失敗と記録されずに届いていない宛先(取りこぼし) | {s.lost:,} |",
        f"| 失敗と記録したのに届いた宛先 | {s.failed_but_received:,} |",
        f"| API と notify-relay で状態が違う宛先 | {s.mismatch:,} |",
        f"| 試験データにない宛先に届いた数 | {s.unknown_addresses:,} |",
        *[f"| {name} | {value} |" for name, value in timing],
        f"| API の届かなかった理由 | {json.dumps(collections.Counter(r.api_error for r in s.recipients.values() if r.api == 'failed'), ensure_ascii=False)} |",
        f"| notify-relay の送信の回数(回数: 宛先の数) | {json.dumps(dict(sorted(attempts.items())), ensure_ascii=False)} |",
        f"| アウトボックスの状態 | {json.dumps(outbox, ensure_ascii=False)} |",
        f"| アウトボックスの送信の回数(回数: 件数) | {json.dumps(outbox_attempts, ensure_ascii=False)} |",
    ]
    if "left_sending" in facts:
        lines.append(f"| 強制終了のあとに sending のまま残った宛先 | {int(facts['left_sending']):,}(取り出した分で、送ったかどうかは問わない。起動時に pending に戻る) |")
    lines += ["", "## 警告とエラーのログ(メッセージごとの件数、上位10件)", "", "| サービス | メッセージ | 件数 |", "|---|---|---|"]
    relay_log = subprocess.run(COMPOSE + ["logs", "--no-color", "--no-log-prefix", "notify-relay"], capture_output=True, text=True).stdout
    lines += log_summary("notify-relay", relay_log)
    # API・worker・scheduler は、開発用の構成では同じファイル(マウントしたコードの storage/logs)に書く。訓練の分だけ数える
    laravel = pathlib.Path("../team-ops-api/storage/logs/laravel.log")
    text = ""
    if laravel.exists():
        with laravel.open("rb") as fh:
            fh.seek(int(facts.get("laravel_log_offset", "0")))
            text = fh.read().decode(errors="replace")
    lines += log_summary("API(worker・scheduler を含む)", text)
    report = "\n".join(lines) + "\n"
    (out / "report.md").write_text(report)
    print(report)
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
