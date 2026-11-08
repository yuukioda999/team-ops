# バックアップと戻し方

毎日、2つの DB(team_ops と notify_relay)を書き出し、サーバー上の `/var/backups/team-ops` に7日分残します(ADR-0022)。デモのデータは24時間で消える架空のものなので、サーバーの外には置きません。

## 毎日のバックアップを設定する(最初の1回)

```sh
sudo crontab -e
```

次の1行を足します(毎日 4:15。サーバーの時刻は日本時間)。

```
15 4 * * * /opt/team-ops/deploy/backup.sh >> /var/log/team-ops-backup.log 2>&1
```

確かめる:

```sh
sudo /opt/team-ops/deploy/backup.sh
sudo ls -l /var/backups/team-ops      # 日時-team_ops.sql.gz と 日時-notify_relay.sql.gz がある
```

翌日、`/var/log/team-ops-backup.log` に `saved` の行が増えていることも確かめます。

## 戻す

```sh
cd /opt/team-ops/deploy
sudo ls -l /var/backups/team-ops
sudo ./restore.sh /var/backups/team-ops/<日時>-team_ops.sql.gz
```

`yes` と入力すると、次を順に行います。戻している間(数秒〜数十秒)、デモは止まります。

1. API・キューの処理・定期処理・relay・web を止める
2. その DB を消してバックアップから作り直す
3. すべてを起動し直す

notify_relay も戻すときは、同じように `…-notify_relay.sql.gz` で実行します。2つは同じ時刻のものをそろえて戻してください。

戻したあとに確かめる:`https://demo.freie.jp` でデモとしてログインできる

## 戻す練習(公開したら一度、その後は半年に一度)

本当に戻せるかは、戻してみないと分かりません。公開したら一度、次を行って結果を ai-log か運用の記録に残します。

1. デモとしてログインし、お知らせを1件送る
2. `sudo ./backup.sh`
3. もう1件お知らせを送る
4. `sudo ./restore.sh <さっきの team_ops のファイル>`
5. 1のお知らせはあり、3のお知らせはないことを確かめる

同じ手順は、CI(`.github/workflows/deploy-check.yml`)でも毎回確かめています。

## 注意

- 暗号化した項目は `.env.api` の `APP_KEY` と `BLIND_INDEX_KEY` がないと読めません。サーバーを作り直すときは、バックアップと一緒にこの2つも必要です
- 7日より古いファイルは `backup.sh` が消します
