#!/usr/bin/env python3
"""Collects the result of one load test run (spec 008 AC-008-06・08, ADR-0023).

Reads the sink's counts and the times of each stage from both databases, and writes
result.json and summary.md into the given directory.

    python3 loadtest/collect.py <out-dir> --test full --teams 10000 --expected 300000 \
        --started 2026-11-13T06:00:00Z [--seed-log seed.txt] [--stopped-waiting]
"""
import argparse
import datetime as dt
import json
import pathlib
import subprocess
import urllib.request

COMPOSE = ["docker", "compose", "-f", "compose.yaml", "-f", "loadtest/compose.loadtest.yaml"]


def sql(query: str) -> list[list[str]]:
    out = subprocess.run(
        COMPOSE + ["exec", "-T", "mysql", "mysql", "-uroot", "-proot", "-N", "-B", "-e", query],
        check=True, capture_output=True, text=True,
    ).stdout
    return [line.split("\t") for line in out.strip().splitlines() if line]


def one(query: str) -> list[str | None]:
    rows = sql(query)
    return [None if v == "NULL" else v for v in rows[0]] if rows else []


def parse(ts: str | None) -> dt.datetime | None:
    if ts is None:
        return None
    t = dt.datetime.fromisoformat(ts.replace("Z", "+00:00").replace(" ", "T"))
    return t if t.tzinfo else t.replace(tzinfo=dt.timezone.utc)


def seconds(start: dt.datetime | None, end: dt.datetime | None) -> float | None:
    return None if start is None or end is None else round((end - start).total_seconds(), 1)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("out")
    ap.add_argument("--test", required=True, choices=["relay", "full"])
    ap.add_argument("--teams", type=int, default=0)
    ap.add_argument("--expected", type=int, required=True, help="mails that should arrive")
    ap.add_argument("--started", required=True, help="when the test started (ISO 8601, UTC)")
    ap.add_argument("--label", default="")
    ap.add_argument("--seed-log", help="loadtest:seed's output, for seed_seconds (AC-008-02)")
    ap.add_argument("--stopped-waiting", action="store_true", help="the wait ended before every mail arrived")
    args = ap.parse_args()
    out = pathlib.Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    with urllib.request.urlopen("http://127.0.0.1:8025/stats", timeout=10) as r:
        sink = json.load(r)
    started = parse(args.started)
    stages: dict[str, dict] = {}
    if args.test == "full":
        p = one("select count(*), min(published_at), max(published_at) from team_ops.notices where status='published'")
        o = one("select count(*), min(created_at), max(created_at), sum(status='sent'), max(sent_at) from team_ops.outbox_messages where kind like 'notice%'")
        stages["publish"] = {"notices": int(p[0]), "first": p[1], "last": p[2]}
        stages["outbox"] = {"messages": int(o[0]), "first_created": o[1], "last_created": o[2], "sent": int(o[3] or 0), "last_sent": o[4]}
        nr = sql("select delivery_status, count(*) from team_ops.notice_recipients group by delivery_status")
        stages["delivery_status"] = {k: int(v) for k, v in nr}
    d = one("select count(*), min(accepted_at), max(accepted_at), max(completed_at), sum(completed_at is null) from notify_relay.deliveries")
    stages["relay"] = {"deliveries": int(d[0]), "first_accepted": d[1], "last_accepted": d[2], "last_completed": d[3], "not_completed": int(d[4] or 0)}
    rs = sql("select status, count(*) from notify_relay.delivery_recipients group by status")
    stages["relay_recipients"] = {k: int(v) for k, v in rs}
    stages["sink"] = sink

    # relay 単体は、最初の依頼を relay が受け付けた時刻から数える(AC-008-05)。全体は予約の時刻から(AC-008-06)
    if args.test == "relay" and stages["relay"]["first_accepted"]:
        started = parse(stages["relay"]["first_accepted"])
    last = parse(sink.get("last_at"))
    seed_seconds = None
    if args.seed_log and pathlib.Path(args.seed_log).exists():
        for line in pathlib.Path(args.seed_log).read_text().splitlines():
            if line.startswith("seed_seconds="):
                seed_seconds = float(line.split("=", 1)[1])
    # 送り途中のもの(取りこぼしではない)。relay が最終状態にしていない宛先と、まだ送っていないアウトボックス
    unfinished_relay = sum(v for k, v in stages["relay_recipients"].items() if k in ("pending", "sending"))
    unfinished_outbox = (stages["outbox"]["messages"] - stages["outbox"]["sent"]) if args.test == "full" else 0
    took = seconds(started, last)
    result = {
        "test": args.test,
        "label": args.label,
        "teams": args.teams,
        "expected_mails": args.expected,
        "started": started.isoformat() if started else args.started,
        "received": sink["received"],
        "unique": sink["unique"],
        "duplicates": sink["duplicates"],
        # 待つのを打ち切った回は、届いていない分を「取りこぼし」と決めつけず「未完了」として分ける
        "finished": sink["unique"] >= args.expected,
        "stopped_waiting": args.stopped_waiting,
        "missing": (args.expected - sink["unique"]) if not args.stopped_waiting else None,
        "unfinished": (args.expected - sink["unique"]) if args.stopped_waiting else 0,
        "unfinished_relay_recipients": unfinished_relay,
        "unfinished_outbox_messages": unfinished_outbox,
        "seconds_to_first_mail": seconds(started, parse(sink.get("first_at"))),
        "seconds_to_last_mail": took,
        # 二重に届いた分を数えない(unique)
        "mails_per_second": round(sink["unique"] / max(took or 1, 1), 1),
        "seed_seconds": seed_seconds,
        "stages": stages,
    }
    if args.test == "full":
        result["seconds_to_last_publish"] = seconds(started, parse(stages["publish"]["last"]))
        result["seconds_to_last_outbox"] = seconds(started, parse(stages["outbox"]["last_created"]))
        result["seconds_to_last_outbox_sent"] = seconds(started, parse(stages["outbox"]["last_sent"]))
        result["seconds_to_last_relay_accept"] = seconds(started, parse(stages["relay"]["last_accepted"]))
    (out / "result.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")

    goal = 600
    lines = [
        f"# 結果:{args.test}({args.teams or args.expected // 30}チーム相当){(' ' + args.label) if args.label else ''}",
        "",
        "| 項目 | 値 |",
        "|---|---|",
        f"| 届くはずの数 | {args.expected:,} |",
        f"| 受け取り役が受け取った数 | {sink['received']:,} |",
        f"| 二重に届いた数 | {sink['duplicates']:,} |",
        (f"| 未完了(待つのを打ち切った時点で送り途中) | {result['unfinished']:,}(relay の送り途中 {unfinished_relay:,}、未送信のアウトボックス {unfinished_outbox:,}) |"
         if args.stopped_waiting else f"| 届かなかった数 | {result['missing']:,} |"),
        f"| 開始から最初の1通まで | {result['seconds_to_first_mail']} 秒 |",
        f"| 開始から最後の1通まで | {took if took is not None else '-'} 秒(目標 {goal} 秒){'(打ち切りの時点)' if args.stopped_waiting else ''} |",
        f"| 1秒あたり | {result['mails_per_second']:,} 通(目標 500 通) |",
    ]
    if args.test == "full":
        lines += [
            f"| 開始から最後の公開まで | {result['seconds_to_last_publish']} 秒 |",
            f"| 開始から最後のアウトボックスの書き込みまで | {result['seconds_to_last_outbox']} 秒 |",
            f"| 開始から relay への最後の依頼の完了まで | {result['seconds_to_last_outbox_sent']} 秒 |",
            f"| 開始から relay の最後の受け付けまで | {result['seconds_to_last_relay_accept']} 秒 |",
        ]
    if seed_seconds is not None:
        lines.append(f"| 試験データの作成 | {seed_seconds} 秒(目標 1万チームで 600 秒以内) |")
    (out / "summary.md").write_text("\n".join(lines) + "\n")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
