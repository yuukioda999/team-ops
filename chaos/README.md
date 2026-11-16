# 障害訓練

spec 009 と ADR-0025 による障害訓練の道具です。配信の途中で障害を起こし、メールがちょうど1通ずつ届くか、配信状況が最後に正しくなるかを数えます。振り返りは [docs/postmortems/](../docs/postmortems/) にあります。

| 訓練 | 起こす障害 | 受け入れ基準 |
|---|---|---|
| `smtp-temp` | 配信の始まりから2分間、Mailpit が 30% のメールに 451(一時エラー)を返す | AC-009-03 |
| `smtp-perm` | Mailpit が 10% の宛先に 550(恒久エラー)を返す | AC-009-04 |
| `relay-stop` | 公開の30秒前に notify-relay を止め、公開の3分後に起動する | AC-009-05 |
| `relay-kill` | 1割を送ったところで notify-relay を強制終了(SIGKILL)し、10秒後に起動する | AC-009-06 |
| `api-down` | 1割を送ったところで API(配信結果の受け取り)を止め、2分後に起動する | AC-009-07 |

どの訓練も、100チーム(3,000人)に予約のお知らせを同じ時刻に公開させます。宛先はすべて `loadtest.invalid` で、外には出ません。

## 動かし方

- GitHub の Actions → **Chaos drill** → Run workflow で、訓練を選びます(all で5つ、強制終了だけ3回)
- 手元では、データが空の環境で `make drill DRILL=relay-stop` のように動かします。数えは Mailpit と DB の全体を見るので、ほかのデータやメールがあると数が合いません(`docker compose down -v` で消せます。開発用のデータも消えます)

| 置き場所 | 中身 |
|---|---|
| [compose.chaos.yaml](compose.chaos.yaml) | 開発用の compose に重ねる設定。Mailpit がメールを消さないようにし、試験データの作成を許可する |
| [drill.sh](drill.sh) | 試験データを作り、時刻に合わせて障害を起こして戻し、全員の結果が出るまで待つ。起こしたことを時系列に残す |
| [report.py](report.py) | 宛先ごとの受信数、API と notify-relay の配信状況、アウトボックス、警告とエラーのログを数え、期待と比べる。メールアドレスは出さない |
