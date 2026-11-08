# HTTPS の証明書

証明書は Caddy が Let's Encrypt から自動で取り、期限の30日ほど前に自動で更新します。普段は何もしなくてかまいません。

## 期限を確かめる

手元の PC かサーバーで実行します。

```sh
echo | openssl s_client -connect demo.freie.jp:443 -servername demo.freie.jp 2>/dev/null | openssl x509 -noout -issuer -enddate
```

`notAfter` が期限です。Let's Encrypt の証明書は90日なので、60日より先になっていれば更新されています。

更新の記録は Caddy のログにあります。

```sh
cd /opt/team-ops/deploy
docker compose -f compose.prod.yaml logs caddy | grep -iE 'certificate|renew|obtain'
```

## 気をつけること

- **`caddy-data` のボリュームを消さない**:証明書と Let's Encrypt のアカウントが入っています。消すと次の起動で取り直しになり、何度も繰り返すと Let's Encrypt の回数制限(同じ名前で1週間に5回など)に当たって、しばらく HTTPS で開けなくなります。`docker compose down -v` は使わないでください
- **DNS を変えるとき**:A・AAAA がこのサーバーを指していないと、更新に失敗します。サーバーを移すときは、新しいサーバーで起動する前に DNS を切り替えます
- **80番ポートを閉じない**:Let's Encrypt の確認(HTTP-01)と、http から https への転送に使います
- 期限切れなどの連絡は、`.env` の `ACME_EMAIL` に届きます

## 更新に失敗したとき

1. `logs caddy` でエラーを見る
2. `dig +short demo.freie.jp A` と `AAAA` がこのサーバーのアドレスか確かめる
3. さくらのパケットフィルターと `sudo ufw status` で 80・443 が開いているか確かめる
4. 直したら `docker compose -f compose.prod.yaml restart caddy`
