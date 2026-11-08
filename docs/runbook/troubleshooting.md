# 困ったとき

まず状態とログを見ます。コマンドはすべて `/opt/team-ops/deploy` で実行します。

```sh
docker compose -f compose.prod.yaml ps
docker compose -f compose.prod.yaml logs --since 30m <サービス名>   # caddy / web / api / api-worker / api-scheduler / notify-relay / mysql / mailpit / alloy
free -h && df -h /
```

## デモが開けない

| 症状 | 確かめること・直し方 |
|---|---|
| ブラウザで接続できない | `docker compose ... ps` で caddy が動いているか。さくらのパケットフィルターと `sudo ufw status` で 80・443 が許可されているか |
| 証明書のエラー | `logs caddy` で証明書の取得に失敗していないか。DNS の A・AAAA がサーバーを指しているか(`dig +short demo.freie.jp`)。Let's Encrypt の回数制限に当たったら1時間ほど待つ |
| 502 Bad Gateway | web か api が止まっている。`ps` で `unhealthy` や `restarting` のものの `logs` を見る |
| `/api/health` が 503 | API から DB につながらない。`logs mysql` を見る。メモリ不足で MySQL が止まっていないか(下) |
| ログインのボタンを押すとエラー | `logs api` を見る。`.env.api` の `SANCTUM_STATEFUL_DOMAINS` と `APP_URL` が `demo.freie.jp` か |

急いで直すときは、直前のデプロイで壊れたのなら `./deploy.sh --rollback`、そうでなければ `docker compose -f compose.prod.yaml restart <サービス名>`。

## メモリが足りない

```sh
docker stats --no-stream
sudo dmesg -T | grep -i -E 'killed process|out of memory' | tail
```

- 強制終了されたプロセスがあれば、`docker compose ... up -d` で起動し直す
- 続くようなら、ADR-0022 の「見直す条件」(メモリの使用量が常に8割を超える)に当たります。プランを 4GB に上げるか、構成を見直す ADR を書く

## ディスクが足りない

```sh
docker system df
sudo du -sh /var/backups/team-ops /var/lib/docker
```

- 使っていない古いイメージを消す:`docker image prune -a`(動いているものは消えません)
- コンテナのログは1つにつき 10MB × 5 ファイルまでにしてある(`compose.prod.yaml` の logging)

## デモが混み合っています(503)と出る

存在するデモチームが500に達しています(AC-007-10)。

- `docker compose ... logs api | grep "Demo team"` で作成数の推移を見る
- 1時間ごとの削除が動いているか:`logs api-scheduler | grep demo:prune`
- 誰かが大量に作っているなら、ログの IP を見てパケットフィルターや ufw で止める。全部を消すなら `docker compose ... exec api php artisan demo:prune --all`

## メールが「送信されたメール」に出ない

- `logs api-worker` と `logs notify-relay` にエラーがないか
- `docker compose ... exec api php artisan queue:failed` に失敗したジョブがないか
- Mailpit が動いているか(`ps mailpit`)

## サーバーを作り直す

1. [setup.md](setup.md) の1〜5を行う。手順5では `init-env.sh` を使わず、控えておいた `.env`・`.env.api`・`.env.relay` を置く
2. `./deploy.sh` を実行する
3. 残したいデータがあれば [backup.md](backup.md) の手順で戻す(デモのデータなので、通常は不要です)
