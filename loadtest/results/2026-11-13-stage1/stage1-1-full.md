# 結果:full(10000チーム相当) stage1 1 delay=50ms limits=none workers=4 relay_concurrency=150
| 項目 | 値 |
|---|---|
| 届くはずの数 | 300,000 |
| 受け取り役が受け取った数 | 300,000 |
| 二重に届いた数 | 0 |
| 届かなかった数 | 0 |
| 開始から最初の1通まで | 2.6 秒 |
| 開始から最後の1通まで | 417.8 秒(目標 600 秒) |
| 1秒あたり | 718.0 通(目標 500 通) |
| 開始から最後の公開まで | 186.0 秒 |
| 開始から最後のアウトボックスの書き込みまで | 186.0 秒 |
| 開始から relay への最後の依頼の完了まで | 252.0 秒 |
| 開始から relay の最後の受け付けまで | 252.3 秒 |
| 試験データの作成 | 22.7 秒(目標 1万チームで 600 秒以内) |

## k6(p95・p99・平均は ms。http_req_failed の fails は失敗しなかった数)

```
k6-api-during.json
  http_req_failed {'passes': 0, 'fails': 10238}
  http_req_duration{name:notices} {'p(95)': 113.6, 'p(99)': 165.1, 'avg': 44.0}
  http_req_duration{name:status} {'p(95)': 96.9, 'p(99)': 130.9, 'avg': 42.4}
  http_req_duration{name:notice} {'p(99)': 138.3, 'avg': 40.5, 'p(95)': 93.2}
  http_req_duration {'p(95)': 111.1, 'p(99)': 167.2, 'avg': 47.4}
  http_req_duration{name:home} {'p(95)': 128.9, 'p(99)': 187.6, 'avg': 60.5}
  http_req_duration{name:roster} {'p(95)': 95.6, 'p(99)': 143.7, 'avg': 45.0}
k6-api-idle.json
  http_req_duration{name:notices} {'avg': 13.0, 'p(95)': 19.8, 'p(99)': 30.4}
  http_req_duration{name:roster} {'p(95)': 28.3, 'p(99)': 42.1, 'avg': 16.2}
  http_req_duration{name:home} {'p(95)': 52.1, 'p(99)': 284.8, 'avg': 32.1}
  http_req_duration {'p(95)': 37.9, 'p(99)': 198.4, 'avg': 21.5}
  http_req_duration{name:status} {'p(95)': 0, 'p(99)': 0, 'avg': 0}
  http_req_duration{name:notice} {'avg': 0, 'p(95)': 0, 'p(99)': 0}
  http_req_failed {'passes': 0, 'fails': 3000}
```

GitHub Actions の run: https://github.com/yuukioda999/team-ops/actions/runs/43380780057
