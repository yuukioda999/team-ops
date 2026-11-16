# 結果:full(10000チーム相当) stage2-publish 1 delay=50ms limits=none workers=4 relay_concurrency=150
| 項目 | 値 |
|---|---|
| 届くはずの数 | 300,000 |
| 受け取り役が受け取った数 | 300,000 |
| 二重に届いた数 | 0 |
| 届かなかった数 | 0 |
| 開始から最初の1通まで | 13.2 秒 |
| 開始から最後の1通まで | 746.0 秒(目標 600 秒) |
| 1秒あたり | 402.1 通(目標 500 通) |
| 開始から最後の公開まで | 290.0 秒 |
| 開始から最後のアウトボックスの書き込みまで | 290.0 秒 |
| 開始から relay への最後の依頼の完了まで | 590.0 秒 |
| 開始から relay の最後の受け付けまで | 589.9 秒 |
| 試験データの作成 | 34.1 秒(目標 1万チームで 600 秒以内) |

## k6(p95・p99・平均は ms。http_req_failed の fails は失敗しなかった数)

```
k6-api-during.json
  http_req_duration{name:roster} {'p(95)': 290.0, 'p(99)': 398.5, 'avg': 115.0}
  http_req_duration{name:status} {'p(95)': 269.3, 'p(99)': 378.1, 'avg': 113.4}
  http_req_duration {'avg': 124.0, 'p(95)': 300.4, 'p(99)': 407.4}
  http_req_failed {'passes': 0, 'fails': 17586}
  http_req_duration{name:home} {'avg': 161.1, 'p(95)': 357.2, 'p(99)': 496.0}
  http_req_duration{name:notices} {'p(95)': 270.6, 'p(99)': 352.3, 'avg': 110.4}
  http_req_duration{name:notice} {'p(95)': 260.2, 'p(99)': 360.5, 'avg': 107.3}
k6-api-idle.json
  http_req_duration {'avg': 36.3, 'p(95)': 67.7, 'p(99)': 270.7}
  http_req_failed {'passes': 0, 'fails': 3000}
  http_req_duration{name:home} {'avg': 54.0, 'p(95)': 95.1, 'p(99)': 425.1}
  http_req_duration{name:notices} {'p(95)': 33.3, 'p(99)': 61.5, 'avg': 22.7}
  http_req_duration{name:roster} {'p(99)': 65.6, 'avg': 25.9, 'p(95)': 39.2}
  http_req_duration{name:notice} {'avg': 0, 'p(95)': 0, 'p(99)': 0}
  http_req_duration{name:status} {'avg': 0, 'p(95)': 0, 'p(99)': 0}
```

GitHub Actions の run: https://github.com/yuukioda999/team-ops/actions/runs/43390671466
