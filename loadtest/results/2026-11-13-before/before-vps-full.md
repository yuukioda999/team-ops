# 結果:full(10000チーム相当) before vps delay=50ms limits=vps
| 項目 | 値 |
|---|---|
| 届くはずの数 | 300,000 |
| 受け取り役が受け取った数 | 300,000 |
| 二重に届いた数 | 0 |
| 届かなかった数 | 0 |
| 開始から最初の1通まで | 4.5 秒 |
| 開始から最後の1通まで | 964.7 秒(目標 600 秒) |
| 1秒あたり | 311.0 通(目標 500 通) |
| 開始から最後の公開まで | 344.0 秒 |
| 開始から最後のアウトボックスの書き込みまで | 344.0 秒 |
| 開始から relay への最後の依頼の完了まで | 845.0 秒 |
| 開始から relay の最後の受け付けまで | 845.4 秒 |
| 試験データの作成 | 37.5 秒(目標 1万チームで 600 秒以内) |

## k6(p95・p99・平均は ms。http_req_failed の fails は失敗しなかった数)

```
k6-api-during.json
  http_req_duration {'p(95)': 1148.1, 'p(99)': 1294.6, 'avg': 860.9}
  http_req_failed {'passes': 0, 'fails': 16933}
  http_req_duration{name:home} {'avg': 908.8, 'p(95)': 1205.4, 'p(99)': 1356.4}
  http_req_duration{name:notice} {'p(95)': 1133.4, 'p(99)': 1285.2, 'avg': 860.0}
  http_req_duration{name:status} {'avg': 886.3, 'p(95)': 1177.7, 'p(99)': 1300.4}
  http_req_duration{name:notices} {'p(95)': 1092.3, 'p(99)': 1190.5, 'avg': 814.4}
  http_req_duration{name:roster} {'p(95)': 1080.9, 'p(99)': 1181.3, 'avg': 833.1}
k6-api-idle.json
  http_req_failed {'fails': 3000, 'passes': 0}
  http_req_duration{name:status} {'avg': 0, 'p(95)': 0, 'p(99)': 0}
  http_req_duration {'p(95)': 96.1, 'p(99)': 946.6, 'avg': 46.6}
  http_req_duration{name:notice} {'p(95)': 0, 'p(99)': 0, 'avg': 0}
  http_req_duration{name:notices} {'p(95)': 43.8, 'p(99)': 111.3, 'avg': 21.4}
  http_req_duration{name:home} {'p(95)': 177.2, 'p(99)': 1548.0, 'avg': 80.6}
  http_req_duration{name:roster} {'p(95)': 56.4, 'p(99)': 96.1, 'avg': 24.7}
```

GitHub Actions の run: https://github.com/yuukioda999/team-ops/actions/runs/43375009751
