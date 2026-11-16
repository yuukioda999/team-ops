# 結果:relay(10000チーム相当) before delay0 delay=0ms limits=none
| 項目 | 値 |
|---|---|
| 届くはずの数 | 300,000 |
| 受け取り役が受け取った数 | 300,000 |
| 二重に届いた数 | 0 |
| 届かなかった数 | 0 |
| 開始から最初の1通まで | 1.1 秒 |
| 開始から最後の1通まで | 810.4 秒(目標 600 秒) |
| 1秒あたり | 370.2 通(目標 500 通) |

## k6(p95・p99・平均は ms。http_req_failed の fails は失敗しなかった数)

```
k6-relay.json
  http_req_failed {'fails': 300, 'passes': 0}
  http_req_duration {'p(95)': 724.1, 'p(99)': 907.4, 'avg': 308.2}
  http_req_duration{name:create_delivery} {'p(95)': 724.1, 'p(99)': 907.4, 'avg': 308.2}
```

GitHub Actions の run: https://github.com/yuukioda999/team-ops/actions/runs/43375002365
