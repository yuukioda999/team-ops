# 結果:full(10000チーム相当) before delay0 delay=0ms limits=none
| 項目 | 値 |
|---|---|
| 届くはずの数 | 300,000 |
| 受け取り役が受け取った数 | 300,000 |
| 二重に届いた数 | 0 |
| 届かなかった数 | 0 |
| 開始から最初の1通まで | 3.6 秒 |
| 開始から最後の1通まで | 490.2 秒(目標 600 秒) |
| 1秒あたり | 612.0 通(目標 500 通) |
| 開始から最後の公開まで | 147.0 秒 |
| 開始から最後のアウトボックスの書き込みまで | 147.0 秒 |
| 開始から relay への最後の依頼の完了まで | 489.0 秒 |
| 開始から relay の最後の受け付けまで | 489.9 秒 |
| 試験データの作成 | 21.2 秒(目標 1万チームで 600 秒以内) |

## k6(p95・p99・平均は ms。http_req_failed の fails は失敗しなかった数)

```
k6-api-during.json
  http_req_duration {'p(95)': 78.3, 'p(99)': 121.6, 'avg': 36.9}
  http_req_duration{name:notices} {'avg': 31.8, 'p(95)': 68.4, 'p(99)': 103.6}
  http_req_failed {'passes': 0, 'fails': 12141}
  http_req_duration{name:home} {'avg': 49.0, 'p(95)': 98.6, 'p(99)': 179.6}
  http_req_duration{name:roster} {'p(95)': 74.4, 'p(99)': 127.5, 'avg': 36.6}
  http_req_duration{name:status} {'p(95)': 73.2, 'p(99)': 123.7, 'avg': 34.9}
  http_req_duration{name:notice} {'avg': 30.6, 'p(95)': 63.2, 'p(99)': 86.4}
k6-api-idle.json
  http_req_duration {'p(95)': 30.7, 'p(99)': 183.5, 'avg': 18.9}
  http_req_duration{name:home} {'p(95)': 44.8, 'p(99)': 270.2, 'avg': 28.2}
  http_req_failed {'passes': 0, 'fails': 3000}
  http_req_duration{name:notices} {'p(95)': 15.6, 'p(99)': 25.5, 'avg': 11.4}
  http_req_duration{name:roster} {'avg': 14.4, 'p(95)': 21.5, 'p(99)': 57.4}
  http_req_duration{name:status} {'avg': 0, 'p(95)': 0, 'p(99)': 0}
  http_req_duration{name:notice} {'avg': 0, 'p(95)': 0, 'p(99)': 0}
```

GitHub Actions の run: https://github.com/yuukioda999/team-ops/actions/runs/43375002365
