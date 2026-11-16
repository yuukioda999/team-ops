# 結果:full(10000チーム相当) before 1 delay=50ms limits=none
| 項目 | 値 |
|---|---|
| 届くはずの数 | 300,000 |
| 受け取り役が受け取った数 | 300,000 |
| 二重に届いた数 | 0 |
| 届かなかった数 | 0 |
| 開始から最初の1通まで | 3.8 秒 |
| 開始から最後の1通まで | 903.7 秒(目標 600 秒) |
| 1秒あたり | 332.0 通(目標 500 通) |
| 開始から最後の公開まで | 303.0 秒 |
| 開始から最後のアウトボックスの書き込みまで | 303.0 秒 |
| 開始から relay への最後の依頼の完了まで | 760.0 秒 |
| 開始から relay の最後の受け付けまで | 760.7 秒 |
| 試験データの作成 | 32.6 秒(目標 1万チームで 600 秒以内) |

## k6(p95・p99・平均は ms。http_req_failed の fails は失敗しなかった数)

```
k6-api-during.json
  http_req_duration{name:status} {'p(95)': 198.1, 'p(99)': 295.5, 'avg': 84.3}
  http_req_duration{name:notice} {'avg': 77.2, 'p(95)': 194.0, 'p(99)': 269.7}
  http_req_duration {'p(95)': 222.5, 'p(99)': 318.1, 'avg': 90.2}
  http_req_duration{name:home} {'p(95)': 280.0, 'p(99)': 388.3, 'avg': 120.9}
  http_req_duration{name:notices} {'p(95)': 190.6, 'p(99)': 267.1, 'avg': 77.2}
  http_req_failed {'fails': 21627, 'passes': 0}
  http_req_duration{name:roster} {'avg': 83.7, 'p(95)': 199.9, 'p(99)': 274.3}
k6-api-idle.json
  http_req_duration{name:roster} {'avg': 25.3, 'p(95)': 41.9, 'p(99)': 75.6}
  http_req_duration{name:status} {'p(95)': 0, 'p(99)': 0, 'avg': 0}
  http_req_duration {'avg': 33.9, 'p(95)': 60.8, 'p(99)': 286.7}
  http_req_duration{name:notices} {'avg': 20.2, 'p(95)': 33.0, 'p(99)': 47.7}
  http_req_duration{name:home} {'avg': 51.0, 'p(95)': 99.7, 'p(99)': 461.4}
  http_req_failed {'passes': 0, 'fails': 3000}
  http_req_duration{name:notice} {'avg': 0, 'p(95)': 0, 'p(99)': 0}
```

GitHub Actions の run: https://github.com/yuukioda999/team-ops/actions/runs/43374987390
