# 結果:full(10000チーム相当) stage1 2 delay=50ms limits=none workers=4 relay_concurrency=150
| 項目 | 値 |
|---|---|
| 届くはずの数 | 300,000 |
| 受け取り役が受け取った数 | 300,000 |
| 二重に届いた数 | 0 |
| 届かなかった数 | 0 |
| 開始から最初の1通まで | 3.3 秒 |
| 開始から最後の1通まで | 575.8 秒(目標 600 秒) |
| 1秒あたり | 521.0 通(目標 500 通) |
| 開始から最後の公開まで | 311.0 秒 |
| 開始から最後のアウトボックスの書き込みまで | 311.0 秒 |
| 開始から relay への最後の依頼の完了まで | 391.0 秒 |
| 開始から relay の最後の受け付けまで | 392.0 秒 |
| 試験データの作成 | 35.7 秒(目標 1万チームで 600 秒以内) |

## k6(p95・p99・平均は ms。http_req_failed の fails は失敗しなかった数)

```
k6-api-during.json
  http_req_duration {'p(95)': 205.9, 'p(99)': 283.4, 'avg': 85.8}
  http_req_duration{name:notices} {'p(95)': 190.9, 'p(99)': 264.0, 'avg': 76.4}
  http_req_duration{name:status} {'avg': 74.1, 'p(95)': 161.2, 'p(99)': 235.0}
  http_req_failed {'passes': 1, 'fails': 13861}
  http_req_duration{name:home} {'p(95)': 244.2, 'p(99)': 353.6, 'avg': 112.6}
  http_req_duration{name:roster} {'avg': 87.7, 'p(95)': 201.3, 'p(99)': 254.6}
  http_req_duration{name:notice} {'avg': 72.0, 'p(95)': 176.7, 'p(99)': 246.8}
k6-api-idle.json
  http_req_duration{name:notice} {'p(99)': 0, 'avg': 0, 'p(95)': 0}
  http_req_duration{name:roster} {'avg': 25.8, 'p(95)': 44.5, 'p(99)': 78.1}
  http_req_duration{name:status} {'p(99)': 0, 'avg': 0, 'p(95)': 0}
  http_req_failed {'passes': 0, 'fails': 3000}
  http_req_duration {'p(95)': 62.5, 'p(99)': 258.7, 'avg': 33.0}
  http_req_duration{name:home} {'p(95)': 100.2, 'p(99)': 396.1, 'avg': 48.0}
  http_req_duration{name:notices} {'p(95)': 32.0, 'p(99)': 61.1, 'avg': 20.9}
```

GitHub Actions の run: https://github.com/yuukioda999/team-ops/actions/runs/43380789529
