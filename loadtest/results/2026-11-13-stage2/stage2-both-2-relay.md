# 結果:relay(10000チーム相当) stage2-both 2 delay=50ms limits=none workers=4 relay_concurrency=150
| 項目 | 値 |
|---|---|
| 届くはずの数 | 300,000 |
| 受け取り役が受け取った数 | 300,000 |
| 二重に届いた数 | 0 |
| 届かなかった数 | 0 |
| 開始から最初の1通まで | 0.4 秒 |
| 開始から最後の1通まで | 628.2 秒(目標 600 秒) |
| 1秒あたり | 477.6 通(目標 500 通) |

## k6(p95・p99・平均は ms。http_req_failed の fails は失敗しなかった数)

```
k6-relay.json
  http_req_failed {'passes': 0, 'fails': 300}
  http_req_duration{name:create_delivery} {'avg': 520.0, 'p(95)': 1256.8, 'p(99)': 1671.2}
  http_req_duration {'avg': 520.0, 'p(95)': 1256.8, 'p(99)': 1671.2}
```

GitHub Actions の run: https://github.com/yuukioda999/team-ops/actions/runs/43390704248
