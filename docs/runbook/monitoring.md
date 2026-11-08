# 監視とアラート

ADR-0022 のとおり、Grafana Cloud の無料枠を使います。サーバーの中に監視を置かないので、サーバーが落ちても監視は止まりません。

| 何を | どうやって |
|---|---|
| デモが開けるか | Grafana Cloud の Synthetic Monitoring が、5分ごとに外から `https://demo.freie.jp/api/health` を確かめる |
| コンテナのログ | サーバーの Alloy が Grafana Cloud Logs に送る |
| サーバーの CPU・メモリ・ディスク | Alloy が Grafana Cloud Metrics に送る |
| トレース | まだ送らない。API と relay に OpenTelemetry を入れる作業(T32)のときに足す |

## 1. Grafana Cloud を用意する(最初の1回)

1. grafana.com で無料のアカウントを作り、スタックを1つ作る(リージョンは Tokyo などの近いところ)
2. My Account → スタックの **Loki** の「Details」で、URL と User を控える。URL は `https://logs-prod-XXX.grafana.net` で、末尾に `/loki/api/v1/push` を付けて `GRAFANA_LOKI_URL` にします
3. 同じく **Prometheus** の「Details」で、Remote Write の URL と User を控える(`GRAFANA_PROM_URL`、`GRAFANA_PROM_USER`)
4. Access Policies で、`logs:write` と `metrics:write` だけを持つトークンを作る(`GRAFANA_CLOUD_TOKEN`)。トークンは作ったときにしか表示されません
5. サーバーの `/opt/team-ops/deploy/.env` に5つを書き、`COMPOSE_PROFILES=monitoring` にして `./deploy.sh` を実行する。Alloy と、Alloy が Docker を読むための窓口(docker-api)が起動します

確かめる:

- Grafana の Explore → Logs で `{env="demo"}` を選ぶと、`service` ごとのログが見える
- Explore → Metrics で `node_memory_MemAvailable_bytes{instance="demo"}` が出る

ログの送信の前に、Alloy がメールアドレスとトークンらしい文字列を伏せ字にします(`deploy/config.alloy`)。アプリはもともと個人情報をログに出しません(ADR-0003)。これは二重の歯止めです。Caddy のログからは、Cookie・ログイン後のセッションの Cookie・token を消してあります。

訪問者の IP アドレスとブラウザの情報(User-Agent)は、アクセスログとして Grafana Cloud に送ります(大量にデモを作る相手を止めるのに使うため。ADR-0022)。Grafana Cloud の無料枠では、ログは14日で消えます。

Alloy は root ではないユーザーで、権限を持たずに動きます。Docker のソケットには直接さわらず、コンテナの一覧とログを読むことだけを許した窓口(docker-api)を通します。

## 2. 死活監視

1. Grafana Cloud の Testing & synthetics → Synthetics → Add check → **HTTP**
2. URL:`https://demo.freie.jp/api/health`、間隔:5分、確かめる場所:Tokyo を含めて2か所
3. 期待する結果:ステータス 200

## 3. アラート

Alerting → Alert rules に次を作り、通知先(Contact point)を自分のメールにします。

| アラート | 条件 |
|---|---|
| デモが開けない | Synthetics の死活監視が10分続けて失敗 |
| メモリが足りない | `node_memory_MemAvailable_bytes{instance="demo"} / node_memory_MemTotal_bytes{instance="demo"} < 0.15` が10分続く |
| ディスクが足りない | `/` の空きが20%未満 |
| デモチームの上限 | Logs で `{env="demo", service="api"} \|= "Demo teams are full"` が1件でもある(AC-007-10) |
| 配信の照合のずれ | Logs で `{env="demo", service="api-scheduler"} \|= "do not match"` が1件でもある(ADR-0019) |

確かめる:各ルールの「Preview」で、今は発火していないことを見る。死活監視は、一度 `docker compose -f compose.prod.yaml stop web` で止めてアラートのメールが届くことを確かめ、`start web` で戻す
