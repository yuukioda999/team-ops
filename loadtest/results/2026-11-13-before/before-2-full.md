# 結果:full(10000チーム相当) before 2 delay=50ms limits=none
| 項目 | 値 |
|---|---|
| 届くはずの数 | 300,000 |
| 受け取り役が受け取った数 | 300,000 |
| 二重に届いた数 | 0 |
| 届かなかった数 | 0 |
| 開始から最初の1通まで | 2.9 秒 |
| 開始から最後の1通まで | 930.8 秒(目標 600 秒) |
| 1秒あたり | 322.3 通(目標 500 通) |
| 開始から最後の公開まで | 299.0 秒 |
| 開始から最後のアウトボックスの書き込みまで | 299.0 秒 |
| 開始から relay への最後の依頼の完了まで | 792.0 秒 |
| 開始から relay の最後の受け付けまで | 792.7 秒 |
| 試験データの作成 | 36.5 秒(目標 1万チームで 600 秒以内) |

## k6(p95・p99・平均は ms。http_req_failed の fails は失敗しなかった数)

```
k6-api-during.json
  http_req_duration{name:roster} {'p(95)': 203.2, 'p(99)': 254.8, 'avg': 87.7}
  http_req_duration{name:home} {'p(95)': 274.0, 'p(99)': 372.8, 'avg': 125.3}
  http_req_failed {'passes': 0, 'fails': 22347}
  http_req_duration{name:notice} {'p(95)': 189.6, 'p(99)': 273.2, 'avg': 80.3}
  http_req_duration{name:status} {'p(95)': 206.4, 'p(99)': 267.0, 'avg': 88.8}
  http_req_duration{name:notices} {'p(95)': 188.8, 'p(99)': 260.7, 'avg': 79.0}
  http_req_duration {'avg': 93.6, 'p(95)': 222.6, 'p(99)': 306.8}
k6-api-idle.json
  http_req_duration{name:home} {'p(99)': 496.1, 'avg': 57.3, 'p(95)': 112.1}
  http_req_duration{name:roster} {'avg': 27.9, 'p(95)': 56.0, 'p(99)': 114.1}
  http_req_duration{name:notice} {'p(99)': 0, 'avg': 0, 'p(95)': 0}
  http_req_duration{name:notices} {'p(99)': 78.0, 'avg': 24.4, 'p(95)': 42.5}
  http_req_duration{name:status} {'avg': 0, 'p(95)': 0, 'p(99)': 0}
  http_req_duration {'avg': 38.7, 'p(95)': 78.1, 'p(99)': 307.7}
  http_req_failed {'passes': 0, 'fails': 3000}
```

GitHub Actions の run: https://github.com/yuukioda999/team-ops/actions/runs/43374995110
