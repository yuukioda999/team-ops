# 結果:full(10000チーム相当) stage2-both 1 delay=50ms limits=none workers=4 relay_concurrency=150
| 項目 | 値 |
|---|---|
| 届くはずの数 | 300,000 |
| 受け取り役が受け取った数 | 300,000 |
| 二重に届いた数 | 0 |
| 届かなかった数 | 0 |
| 開始から最初の1通まで | 8.6 秒 |
| 開始から最後の1通まで | 602.0 秒(目標 600 秒) |
| 1秒あたり | 498.3 通(目標 500 通) |
| 開始から最後の公開まで | 303.0 秒 |
| 開始から最後のアウトボックスの書き込みまで | 303.0 秒 |
| 開始から relay への最後の依頼の完了まで | 599.0 秒 |
| 開始から relay の最後の受け付けまで | 599.6 秒 |
| 試験データの作成 | 35.0 秒(目標 1万チームで 600 秒以内) |

## k6(p95・p99・平均は ms。http_req_failed の fails は失敗しなかった数)

```
k6-api-during.json
  http_req_duration{name:notices} {'avg': 74.5, 'p(95)': 182.0, 'p(99)': 255.8}
  http_req_duration{name:roster} {'p(95)': 200.9, 'p(99)': 276.9, 'avg': 87.0}
  http_req_duration{name:home} {'avg': 109.8, 'p(95)': 243.4, 'p(99)': 370.3}
  http_req_duration{name:notice} {'p(95)': 185.1, 'p(99)': 241.1, 'avg': 75.6}
  http_req_duration{name:status} {'p(95)': 193.6, 'p(99)': 246.8, 'avg': 82.6}
  http_req_failed {'passes': 0, 'fails': 14472}
  http_req_duration {'p(95)': 203.9, 'p(99)': 290.1, 'avg': 86.3}
k6-api-idle.json
  http_req_duration{name:home} {'p(95)': 76.3, 'p(99)': 389.6, 'avg': 45.9}
  http_req_duration{name:notice} {'p(99)': 0, 'avg': 0, 'p(95)': 0}
  http_req_duration{name:status} {'p(95)': 0, 'p(99)': 0, 'avg': 0}
  http_req_duration {'p(95)': 51.8, 'p(99)': 262.1, 'avg': 31.2}
  http_req_duration{name:roster} {'avg': 23.8, 'p(95)': 32.4, 'p(99)': 65.7}
  http_req_duration{name:notices} {'p(95)': 29.3, 'p(99)': 55.2, 'avg': 19.5}
  http_req_failed {'passes': 0, 'fails': 3000}
```

GitHub Actions の run: https://github.com/yuukioda999/team-ops/actions/runs/43390692392
