#!/usr/bin/env python3
"""Collects the result of one load test run (spec 008 AC-008-06・08, ADR-0023).

Reads the sink's counts and the times of each stage from both databases, and writes
result.json and summary.md into the given directory.

    python3 loadtest/collect.py <out-dir> --test full --teams 10000 --started 2026-11-13T06:00:00Z
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

    last = parse(sink.get("last_at"))
    result = {
        "test": args.test,
        "label": args.label,
        "teams": args.teams,
        "expected_mails": args.expected,
        "started": args.started,
        "received": sink["received"],
        "duplicates": sink["duplicates"],
        "missing": args.expected - sink["unique"],
        "seconds_to_last_mail": seconds(started, last),
        "mails_per_second": round(sink["received"] / max(seconds(started, last) or 1, 1), 1),
        "stages": stages,
    }
    if args.test == "full":
        result["seconds_to_last_publish"] = seconds(started, parse(stages["publish"]["last"]))
        result["seconds_to_last_outbox"] = seconds(started, parse(stages["outbox"]["last_created"]))
        result["seconds_to_last_relay_accept"] = seconds(started, parse(stages["relay"]["last_accepted"]))
    (out / "result.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")

    goal = 600
    took = result["seconds_to_last_mail"]
    lines = [
        f"# 結果:{args.test}({args.teams or args.expected // 30}チーム相当){(' ' + args.label) if args.label else ''}",
        "",
        "| 項目 | 値 |",
        "|---|---|",
        f"| 届くはずの数 | {args.expected:,} |",
        f"| 受け取り役が受け取った数 | {sink['received']:,} |",
        f"| 二重に届いた数 | {sink['duplicates']:,} |",
        f"| 届かなかった数 | {result['missing']:,} |",
        f"| 開始から最後の1通まで | {took if took is not None else '-'} 秒(目標 {goal} 秒) |",
        f"| 1秒あたり | {result['mails_per_second']:,} 通(目標 500 通) |",
    ]
    if args.test == "full":
        lines += [
            f"| 開始から最後の公開まで | {result['seconds_to_last_publish']} 秒 |",
            f"| 開始から最後のアウトボックスの書き込みまで | {result['seconds_to_last_outbox']} 秒 |",
            f"| 開始から relay の最後の受け付けまで | {result['seconds_to_last_relay_accept']} 秒 |",
        ]
    (out / "summary.md").write_text("\n".join(lines) + "\n")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
