#!/usr/bin/env python3
"""障害訓練の結果をまとめる(spec 009 の AC-009-01・02、ADR-0025)。

chaos/drill.sh のあとに、team-ops/ で動かす:
    python3 chaos/report.py <drill.sh と同じ出力先>

Mailpit の宛先ごとの受信数、API の配信状況、notify-relay の宛先の状態、アウトボックスを数え、
宛先ごとに API と notify-relay の状態を照らし合わせて、訓練ごとの期待と比べる。
メールアドレスは出さない(数だけ)。
"""

import collections
import datetime as dt
import json
import pathlib
import re
import subprocess
import sys
import urllib.request

COMPOSE = ["docker", "compose", "-f", "compose.yaml", "-f", "chaos/compose.chaos.yaml"]
MAILPIT = "http://127.0.0.1:8025"
SEND_CONCURRENCY = 50  # notify-relay の既定(開発用の compose では変えていない)


def sql(query: str) -> list[list[str]]:
    out = subprocess.run(COMPOSE + ["exec", "-T", "mysql", "mysql", "-uroot", "-proot", "-N", "-B", "-e", query],
                         check=True, capture_output=True, text=True).stdout
    return [line.split("\t") for line in out.strip().splitlines() if line]


def counts(query: str) -> dict[str, int]:
    return {(k if k != "NULL" else "-"): int(v) for k, v in sql(query)}


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


def log_summary(service: str, text: str) -> list[str]:
    """警告とエラーのログを、メッセージごとに数える(上位10件)。"""
    seen: collections.Counter[str] = collections.Counter()
    for line in text.splitlines():
        m = re.search(r'level=(WARN|ERROR) msg="([^"]*)"', line) or re.search(r"\.(WARNING|ERROR): ([^{\[]*)", line)
        if m:
            seen[f"{m.group(1)} {m.group(2).strip()[:120]}"] += 1
    return [f"| {service} | {msg} | {n} |" for msg, n in seen.most_common(10)]


def compose_logs(service: str) -> str:
    return subprocess.run(COMPOSE + ["logs", "--no-color", "--no-log-prefix", service], capture_output=True, text=True).stdout


def main() -> None:
    out = pathlib.Path(sys.argv[1])
    env = dict(line.split("=", 1) for line in (out / "drill.env").read_text().split())
    scenario, expected, at = env["scenario"], int(env["expected"]), parse(env["scheduled_at"])
    timeline = (out / "timeline.txt").read_text().splitlines()

    # Mailpit:宛先ごとの受信数
    messages = mailpit_messages()
    per_address: collections.Counter[str] = collections.Counter()
    times = []
    for m in messages:
        for to in m.get("To") or []:
            per_address[to["Address"].lower()] += 1
        times.append(parse(m["Created"]))
    received_once = sum(1 for n in per_address.values() if n == 1)
    twice = sum(1 for n in per_address.values() if n >= 2)
    extra = sum(n - 1 for n in per_address.values() if n >= 2)
    unique = len(per_address)

    api = counts("select delivery_status, count(*) from team_ops.notice_recipients group by delivery_status")
    api_err = counts("select delivery_error, count(*) from team_ops.notice_recipients where delivery_status<>'delivered' group by delivery_error")
    relay = counts("select status, count(*) from notify_relay.delivery_recipients group by status")
    relay_err = counts("select error_code, count(*) from notify_relay.delivery_recipients where status<>'delivered' group by error_code")
    relay_attempts = counts("select attempts, count(*) from notify_relay.delivery_recipients group by attempts")
    failed_attempts = counts("select attempts, count(*) from notify_relay.delivery_recipients where status='failed' group by attempts")
    outbox = counts("select status, count(*) from team_ops.outbox_messages group by status")
    outbox_attempts = counts("select attempts, count(*) from team_ops.outbox_messages group by attempts")
    joined, mismatch = (int(v) for v in sql(
        "select count(*), coalesce(sum(r.status <> n.delivery_status), 0)"
        " from notify_relay.delivery_recipients r"
        " join notify_relay.deliveries d on d.id = r.delivery_id"
        " join team_ops.notice_recipients n"
        "   on n.notice_id = cast(substring_index(substring_index(d.dedupe_key, ':notice:', -1), ':', 1) as unsigned)"
        "  and r.recipient_ref = convert(concat('user_', n.user_id) using utf8mb4) collate utf8mb4_bin")[0])
    not_completed = int(sql("select count(*) from notify_relay.deliveries where completed_at is null")[0][0])

    failed = api.get("failed", 0)
    missing = expected - unique - failed  # 失敗と記録されずに届いていない宛先
    fault_off = next((parse(f"{at.date()}T{line[:8]}Z") for line in reversed(timeline) if "fault off" in line), None)
    first, last = (min(times), max(times)) if times else (None, None)

    def secs(a, b):
        return "-" if a is None or b is None else f"{(b - a).total_seconds():.0f} 秒"

    left_sending = None
    for line in timeline:
        m = re.search(r"recipients left sending: (\d+)", line)
        if m:
            left_sending = int(m.group(1))

    base = missing == 0 and api.get("pending", 0) == 0 and mismatch == 0 and joined == expected
    checks = {
        "smtp-temp": base and twice == 0 and api.get("delivered", 0) == expected,
        "smtp-perm": base and twice == 0 and failed > 0 and failed == relay.get("failed", 0) == expected - unique
        and set(failed_attempts) == {"1"},
        "relay-stop": base and twice == 0 and api.get("delivered", 0) == expected,
        # 判断4:二重に届いた数が、同時に送る数(SEND_CONCURRENCY、50)以下なら設計どおり
        "relay-kill": base and extra <= SEND_CONCURRENCY,
        "api-down": base and twice == 0 and api.get("delivered", 0) == expected,
    }
    ok = checks[scenario]

    lines = [
        f"# 障害訓練の結果:{scenario}",
        "",
        f"判定:**{'期待どおり' if ok else '期待と違う(振り返りで原因を調べる)'}**",
        "",
        "## 時系列(UTC)",
        "",
        "```",
        f"{at:%H:%M:%S} 予約の時刻(お知らせの公開)",
        *timeline,
        "```",
        "",
        "## メール(Mailpit)",
        "",
        "| 項目 | 値 |",
        "|---|---|",
        f"| 届くはずの宛先 | {expected:,} |",
        f"| 1通以上届いた宛先 | {unique:,} |",
        f"| ちょうど1通届いた宛先 | {received_once:,} |",
        f"| 2通以上届いた宛先(二重配信) | {twice:,}(余分に届いたのは {extra:,} 通) |",
        f"| 失敗と記録されずに届いていない宛先(取りこぼし) | {missing:,} |",
        f"| 予約の時刻から最初の1通 | {secs(at, first)} |",
        f"| 予約の時刻から最後の1通 | {secs(at, last)} |",
        f"| 障害を止めてから最後の1通 | {secs(fault_off, last)} |",
        "",
        "## 配信状況の照らし合わせ",
        "",
        "| 項目 | 値 |",
        "|---|---|",
        f"| API の配信状況 | {json.dumps(api, ensure_ascii=False)} |",
        f"| API の届かなかった理由 | {json.dumps(api_err, ensure_ascii=False)} |",
        f"| notify-relay の宛先の状態 | {json.dumps(relay, ensure_ascii=False)} |",
        f"| notify-relay のエラーの種類 | {json.dumps(relay_err, ensure_ascii=False)} |",
        f"| notify-relay の送信の回数(回数: 宛先の数) | {json.dumps(relay_attempts, ensure_ascii=False)} |",
        f"| failed になった宛先の送信の回数 | {json.dumps(failed_attempts, ensure_ascii=False)} |",
        f"| 宛先ごとに API と notify-relay をつないだ数 | {joined:,}(状態が食い違う宛先 {mismatch:,}) |",
        f"| notify-relay で完了していない依頼 | {not_completed:,} |",
        f"| アウトボックスの状態 | {json.dumps(outbox, ensure_ascii=False)} |",
        f"| アウトボックスの送信の回数(回数: 件数) | {json.dumps(outbox_attempts, ensure_ascii=False)} |",
    ]
    if left_sending is not None:
        lines.append(f"| 強制終了のあとに sending のまま残った宛先 | {left_sending:,}(取り出した分で、送ったかどうかは問わない。起動時に pending に戻る) |")
        lines.append(f"| 二重配信の上限(同時に送る数) | {SEND_CONCURRENCY} |")
    lines += ["", "## 警告とエラーのログ(メッセージごとの件数、上位10件)", "", "| サービス | メッセージ | 件数 |", "|---|---|---|"]
    lines += log_summary("notify-relay", compose_logs("notify-relay"))
    # API・worker・scheduler は、開発用の構成では同じファイル(マウントしたコードの storage/logs)に書く
    laravel = pathlib.Path("../team-ops-api/storage/logs/laravel.log")
    lines += log_summary("API(worker・scheduler を含む)", laravel.read_text(errors="replace") if laravel.exists() else "")
    text = "\n".join(lines) + "\n"
    (out / "report.md").write_text(text)
    print(text)


if __name__ == "__main__":
    main()
