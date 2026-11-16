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

障害訓練(spec 009)で、実際に起こして確かめた気づき方と戻し方です。結果は [docs/postmortems/](../postmortems/) にあります。

DB は、読むだけの調べものとして、スキーマごとの利用者で次の形で見ます。`READ ONLY` は書き間違いの歯止めで、書き込めない仕組みではありません(この利用者はアプリの書き込みの権限を持つ)。書き込みの SQL は打たない約束で守ります。

```sh
docker compose -f compose.prod.yaml exec mysql sh -c 'MYSQL_PWD="$TEAM_OPS_DB_PASSWORD" mysql -uteam_ops team_ops -e "SET SESSION TRANSACTION READ ONLY; <SQL>"'
```

| 障害 | 気づき方 | 戻し方 |
|---|---|---|
| SMTP の一時エラー(4xx。送信先が混んでいる・止まっている) | `logs notify-relay` に `"error_code":"provider_unavailable"`(452 は `rate_limited`)の行が続く。配信状況で「送信中」が残る | notify-relay が自動で再送する(30秒・2分・10分・30分・1時間の間隔で最大5回。最初の送信と合わせて最大6回)。送信先が戻れば何もしなくてよい。再送を5回しても届かなかった宛先は「届かなかった」になるので、戻ったあとに未読の人へ再通知を送る |
| SMTP の恒久エラー(5xx) | 配信状況に「届かなかった」と理由が出る | 再送しない。理由が `invalid_address`(宛先の段階の 550・551・553・501)なら、本人にメールアドレスを直してもらう。`provider_rejected`(それ以外の 5xx)は送信先の設定や送信元の評価の問題なので、送信サービスのログを確かめる |
| notify-relay が止まった | `logs api-worker` に `notify-relay did not accept the outbox message; will retry` が続く。送っていないアウトボックス:`select count(*) from outbox_messages where status<>'sent'` | notify-relay を起動し(`docker compose ... up -d notify-relay`)、応答を確かめてから `docker compose ... exec api php artisan outbox:redispatch --now` を打つ。これを打たないと、毎分の定期実行が拾う送り直しの時刻(間隔は約1・1・2・5・10・30分と延びる)まで待ち、長く止まっていたほど最大31分ほど遅れる。二重には届かない。24時間送れなかった依頼は諦める(アウトボックスが `failed`、理由 `gave_up`)。自動では送られないので、お知らせの画面から未読の人へ再通知を送る |
| notify-relay が依頼の受け付けに失敗する(deadlock) | `logs notify-relay` に `"msg":"accept delivery"` と `Error 1213`。`logs api-worker` に `notify-relay did not accept the outbox message; will retry` | API が送り直すので、待てば届く(送り直しの間隔は約1・1・2・5分と延びる)。急ぐときは `outbox:redispatch --now`。続くようなら、notify-relay の不具合として調べる(障害訓練の振り返り 2026-11-16-relay-stopped) |
| notify-relay が強制終了した(メモリ不足など) | `logs notify-relay` の起動時に `requeued recipients interrupted by a previous stop` が出る。`dmesg` に OOM の記録 | `restart: unless-stopped` で自動で起動し、残りを送る。そのとき送信中だったメールは二重に届きうる(最大で同時に送る数、既定50通。notify-relay の ADR-0002 で受け入れた範囲)。利用者から「2通届いた」と問い合わせがあれば、この障害か、未読の人への再通知(件名に【再通知】が付く)かを、時刻と件名で見分ける |
| API が止まり、配信結果を受け取れない | `logs notify-relay` に `webhook was not accepted; will retry` が続く。配信状況で「送信中」が残る(メールは届いている) | API を戻す。notify-relay が結果を送り直す(10秒から倍々で、最大1時間おき、24時間まで)。それでも食い違えば、1時間ごとの照合(`notices:reconcile-deliveries`)がエラーのログに残す |

## サーバーを作り直す

1. [setup.md](setup.md) の1〜5を行う。手順5では `init-env.sh` を使わず、控えておいた `.env`・`.env.api`・`.env.relay` を置く
2. `./deploy.sh` を実行する(タグは `.env` に入っている)
3. setup.md の7(毎日のバックアップの cron と、監視)を行う
4. 残したいデータがあれば [backup.md](backup.md) の手順で戻す(デモのデータなので、通常は不要です)
