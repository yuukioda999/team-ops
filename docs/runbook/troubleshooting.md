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

## メールの配信の障害(障害訓練で確かめたもの)

障害訓練(spec 009)で、実際に起こして確かめた気づき方と戻し方です。結果は [docs/postmortems/](../postmortems/) にあります。DB を見るコマンドは次の形で打ちます。

```sh
docker compose -f compose.prod.yaml exec mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -e "<SQL>"'
```

| 障害 | 気づき方 | 戻し方 |
|---|---|---|
| SMTP の一時エラー(4xx、送信先が混んでいる・止まっている) | `logs notify-relay` に `"error_code":"provider_unavailable"` の行が続く。配信状況の画面で「送信中」が残る | 自動で再送する(30秒・2分・10分・30分・1時間、最大5回)。送信先が戻れば何もしなくてよい。5回とも失敗した宛先は「届かなかった」になるので、戻ったあとに未読の人への再通知を送る |
| SMTP の恒久エラー(5xx、宛先が存在しない など) | 配信状況の画面に「届かなかった」と理由(`invalid_address` など)が出る | 再送しない(同じ宛先に何度送っても届かないため)。本人にメールアドレスを直してもらう |
| notify-relay が止まった | `logs api-worker` に `notify-relay did not accept the outbox message; will retry` が続く。送っていないアウトボックス:`select count(*) from team_ops.outbox_messages where status<>'sent'` | notify-relay を起動する(`docker compose ... up -d notify-relay`)。送り直しは自動。ただし送り直しの間隔は30秒・1分・2分・5分・10分・30分と延びるので、長く止まっていたほど、起動してから送り始めるまで待つ(最大30分)。二重には届かない |
| notify-relay が強制終了した(メモリ不足など) | `logs notify-relay` の起動時に `requeued recipients interrupted by a previous stop` が出る。`dmesg` に OOM の記録 | `restart: unless-stopped` で自動で起動し、残りを送る。そのとき送信中だったメールは二重に届きうる(最大で同時に送る数、既定50通)(notify-relay の ADR-0002 で受け入れた範囲)。利用者から「2通届いた」と問い合わせがあれば、この障害による |
| API が止まり、配信結果を受け取れない | `logs notify-relay` に `webhook was not accepted; will retry` が続く。配信状況の画面で「送信中」が残る(メールは届いている) | API を戻す。notify-relay が結果を送り直す(10秒から倍々で、最大1時間おき、24時間まで)。それでも食い違えば、1時間ごとの照合(`notices:reconcile-deliveries`)が記録する |

## サーバーを作り直す

1. [setup.md](setup.md) の1〜5を行う。手順5では `init-env.sh` を使わず、控えておいた `.env`・`.env.api`・`.env.relay` を置く
2. `./deploy.sh` を実行する(タグは `.env` に入っている)
3. setup.md の7(毎日のバックアップの cron と、監視)を行う
4. 残したいデータがあれば [backup.md](backup.md) の手順で戻す(デモのデータなので、通常は不要です)
