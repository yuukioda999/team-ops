# 009 障害訓練と振り返り:作業分解

plan.md と ADR-0025 をもとにした作業の一覧。上から順に進める。

凡例:`[ops]` team-ops

**進み具合(2026-11-16):T01〜T09 完了。次の手は、すぐ送り直すコマンド(team-ops-api #29)、画面の注意書き(team-ops-web #23)、受け付けの deadlock(notify-relay #16、ADR-0003 は確認待ち)の PR にした。**

| No. | 作業 | 対象 | 受け入れ基準 |
|---|---|---|---|
| T01 | spec と計画 | ops | |
| T02 | 判断1〜6 の確認 | ops | |
| T03 | ADR-0025 | ops | |
| T04 | 道具:`chaos/`(compose の設定、drill.sh、report.py)、`chaos.yml`、`make drill` | ops | AC-009-01・02 |
| T05 | 5つの訓練を動かす(強制終了は3回) | ops | AC-009-03〜07 |
| T06 | 振り返りの雛形と、訓練ごとの振り返り | ops | AC-009-08 |
| T07 | 期待と違う結果があれば、直し方を選択肢と推奨で示して人間が決める | 各 | AC-009-09 |
| T08 | 手順書(troubleshooting.md)に、障害ごとの気づき方と戻し方を書く | ops | AC-009-10 |
| T09 | README から振り返りへリンクする、ai-log | ops | AC-009-11 |
