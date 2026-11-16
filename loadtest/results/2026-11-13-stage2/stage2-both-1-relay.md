# 結果:relay(10000チーム相当) stage2-both 1 delay=50ms limits=none workers=4 relay_concurrency=150
| 項目 | 値 |
|---|---|
| 届くはずの数 | 300,000 |
| 受け取り役が受け取った数 | 300,000 |
| 二重に届いた数 | 0 |
| 届かなかった数 | 0 |
| 開始から最初の1通まで | 0.5 秒 |
| 開始から最後の1通まで | 718.1 秒(目標 600 秒) |
| 1秒あたり | 417.8 通(目標 500 通) |

## k6(p95・p99・平均は ms。http_req_failed の fails は失敗しなかった数)

```
k6-relay.json
  http_req_duration{name:create_delivery} {'avg': 444.9, 'p(95)': 1090.9, 'p(99)': 1350.1}
  http_req_failed {'passes': 0, 'fails': 300}
  http_req_duration {'avg': 444.9, 'p(95)': 1090.9, 'p(99)': 1350.1}
```

GitHub Actions の run: https://github.com/yuukioda999/team-ops/actions/runs/43390692392
