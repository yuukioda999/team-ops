# 障害訓練

spec 009 と ADR-0025 による障害訓練の道具です。配信の途中で障害を起こし、メールがちょうど1通ずつ届くか、配信状況が最後に正しくなるかを数えます。振り返りは [docs/postmortems/](../docs/postmortems/) にあります。

| 訓練 | 起こす障害 | 受け入れ基準 |
|---|---|---|
| `smtp-temp` | 配信の始まりから2分間、Mailpit が 30% のメールに 451(一時エラー)を返す | AC-009-03 |
| `smtp-perm` | Mailpit が 10% の宛先に 550(恒久エラー)を返す | AC-009-04 |
| `relay-stop` | 公開の30秒前に notify-relay を止め、公開の3分10秒後に起動する。起動後、手順書どおり `outbox:redispatch --now` を打つ | AC-009-05・12 |
| `relay-kill` | 1割を超えたところで notify-relay を強制終了(SIGKILL)し、10秒後に起動する(1秒おきに数えるので、実際は2〜3割で止まる) | AC-009-06 |
| `api-down` | 公開の30秒前に API(配信結果の受け取り)を止め、公開の2分後に起動する | AC-009-07 |

どの訓練も、100チーム(3,000人)に予約のお知らせを同じ時刻に公開させます。宛先はすべて `loadtest.invalid` で、外には出ません。

## 動かし方

- GitHub の Actions → **Chaos drill** → Run workflow で、訓練を選びます(all で5つ、強制終了だけ3回)
- 手元では `make drill DRILL=relay-stop` のように動かします。数えは DB の全体を見るので、お知らせやアウトボックスが残っていると止まります(`docker compose down -v` で消せます。開発用のデータも消えます)。Mailpit は訓練の最初に空にします

| 置き場所 | 中身 |
|---|---|
| [compose.chaos.yaml](compose.chaos.yaml) | 開発用の compose に重ねる設定。Mailpit がメールを消さないようにし、試験データの作成を許可する |
| [drill.sh](drill.sh) | 試験データを作り、時刻に合わせて障害を起こして戻し、全員の結果が出るまで待つ。起こしたことを時系列に残す |
| [report.py](report.py) | 宛先ごとに、受け取った回数・API の配信状況・notify-relay の状態を並べ、障害が当たったことと、最後の状態を期待と比べる。期待と違えば終了コード1。メールアドレスは出さない |
| [test_report.py](test_report.py) | report.py の数え方と判定のテスト(`python3 -m unittest discover -s chaos`) |
