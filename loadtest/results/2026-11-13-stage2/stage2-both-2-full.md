# 結果:full(10000チーム相当) stage2-both 2 delay=50ms limits=none workers=4 relay_concurrency=150
| 項目 | 値 |
|---|---|
| 届くはずの数 | 300,000 |
| 受け取り役が受け取った数 | 300,000 |
| 二重に届いた数 | 0 |
| 届かなかった数 | 0 |
| 開始から最初の1通まで | 11.9 秒 |
| 開始から最後の1通まで | 733.3 秒(目標 600 秒) |
| 1秒あたり | 409.1 通(目標 500 通) |
| 開始から最後の公開まで | 315.0 秒 |
| 開始から最後のアウトボックスの書き込みまで | 315.0 秒 |
| 開始から relay への最後の依頼の完了まで | 732.0 秒 |
| 開始から relay の最後の受け付けまで | 732.1 秒 |
| 試験データの作成 | 34.4 秒(目標 1万チームで 600 秒以内) |

## k6(p95・p99・平均は ms。http_req_failed の fails は失敗しなかった数)

```
k6-api-during.json
  http_req_failed {'passes': 0, 'fails': 17327}
  http_req_duration {'p(99)': 461.7, 'avg': 128.9, 'p(95)': 325.7}
  http_req_duration{name:notices} {'avg': 113.8, 'p(95)': 295.7, 'p(99)': 417.9}
  http_req_duration{name:status} {'p(95)': 308.4, 'p(99)': 427.5, 'avg': 119.1}
  http_req_duration{name:roster} {'p(95)': 322.4, 'p(99)': 452.5, 'avg': 134.3}
  http_req_duration{name:notice} {'p(95)': 295.7, 'p(99)': 417.1, 'avg': 112.0}
  http_req_duration{name:home} {'p(99)': 529.3, 'avg': 162.5, 'p(95)': 380.2}
k6-api-idle.json
  http_req_duration{name:status} {'p(95)': 0, 'p(99)': 0, 'avg': 0}
  http_req_duration{name:home} {'p(99)': 445.9, 'avg': 55.2, 'p(95)': 108.2}
  http_req_duration{name:notice} {'p(95)': 0, 'p(99)': 0, 'avg': 0}
  http_req_duration {'p(95)': 76.6, 'p(99)': 292.4, 'avg': 36.9}
  http_req_duration{name:roster} {'avg': 27.1, 'p(95)': 50.2, 'p(99)': 80.5}
  http_req_duration{name:notices} {'p(99)': 56.4, 'avg': 22.6, 'p(95)': 33.1}
  http_req_failed {'passes': 0, 'fails': 3000}
```

GitHub Actions の run: https://github.com/yuukioda999/team-ops/actions/runs/43390704248
