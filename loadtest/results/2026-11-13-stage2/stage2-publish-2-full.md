# 結果:full(10000チーム相当) stage2-publish 2 delay=50ms limits=none workers=4 relay_concurrency=150
| 項目 | 値 |
|---|---|
| 届くはずの数 | 300,000 |
| 受け取り役が受け取った数 | 300,000 |
| 二重に届いた数 | 0 |
| 届かなかった数 | 0 |
| 開始から最初の1通まで | 3.0 秒 |
| 開始から最後の1通まで | 894.8 秒(目標 600 秒) |
| 1秒あたり | 335.3 通(目標 500 通) |
| 開始から最後の公開まで | 415.0 秒 |
| 開始から最後のアウトボックスの書き込みまで | 415.0 秒 |
| 開始から relay への最後の依頼の完了まで | 745.0 秒 |
| 開始から relay の最後の受け付けまで | 744.9 秒 |
| 試験データの作成 | 32.7 秒(目標 1万チームで 600 秒以内) |

## k6(p95・p99・平均は ms。http_req_failed の fails は失敗しなかった数)

```
k6-api-during.json
  http_req_duration{name:roster} {'p(95)': 333.6, 'p(99)': 574.2, 'avg': 130.9}
  http_req_duration{name:notices} {'avg': 117.0, 'p(95)': 307.7, 'p(99)': 552.4}
  http_req_duration{name:notice} {'avg': 117.2, 'p(95)': 317.9, 'p(99)': 499.1}
  http_req_duration {'p(95)': 330.3, 'p(99)': 548.1, 'avg': 126.9}
  http_req_duration{name:status} {'p(95)': 324.3, 'p(99)': 523.9, 'avg': 127.3}
  http_req_duration{name:home} {'p(95)': 366.2, 'p(99)': 579.5, 'avg': 144.6}
  http_req_failed {'passes': 1, 'fails': 21058}
k6-api-idle.json
  http_req_duration{name:roster} {'p(95)': 217.5, 'p(99)': 285.6, 'avg': 62.3}
  http_req_duration{name:notice} {'avg': 0, 'p(95)': 0, 'p(99)': 0}
  http_req_failed {'passes': 0, 'fails': 2982}
  http_req_duration {'p(99)': 372.8, 'avg': 62.0, 'p(95)': 217.5}
  http_req_duration{name:notices} {'avg': 38.7, 'p(95)': 123.6, 'p(99)': 220.1}
  http_req_duration{name:home} {'p(95)': 307.5, 'p(99)': 491.0, 'avg': 85.0}
  http_req_duration{name:status} {'p(95)': 0, 'p(99)': 0, 'avg': 0}
```

GitHub Actions の run: https://github.com/yuukioda999/team-ops/actions/runs/43390682039
