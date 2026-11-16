# 配信結果を受け取る API が2分止まっても、再開の42秒後に配信状況がそろった

- 日付:2026-11-16
- 種類:障害訓練(spec 009 の AC-009-07)
- 判定:期待どおり
- 記録:https://github.com/yuukioda999/team-ops/actions/runs/43838162895

## 概要

お知らせの公開の直前から2分間、API を止めた。公開と送信は scheduler・worker・notify-relay が続けたので、3,000通は8秒で届いた。配信結果の webhook は API に届かず、notify-relay が送り直し、API の起動の42秒後に、配信状況が3,000人とも「届いた」になった。

## 影響

- メール:二重配信・取りこぼしなし。遅れもなし
- 配信状況:API が止まっている間と起動後の42秒は、3,000人とも「送信中」のまま(実際には届いている)
- API と notify-relay の状態は、最後に3,000人とも一致

## 時系列(UTC)

| 時刻 | できごと |
|---|---|
| 09:19:55〜09:20:05 | API を止める(止まり終わったのが 09:20:05) |
| 09:20:00 | 予約の時刻。4秒後に最初の1通、8秒後に最後の1通 |
| 09:20〜09:22 | notify-relay の webhook が断られ、送り直す(400回) |
| 09:22:03 | API を起動 |
| 09:22:45 | 配信状況がそろう |

## どう気づいたか

- notify-relay のログに `webhook was not accepted; will retry` が 400件(WARN)
- 配信状況の画面で、届いているはずなのに「送信中」が残る(ただし API が止まっている間は画面も開けない)

## 原因

API が止まっていた。訓練で起こしたもの。

## どう戻したか

人は API を起動しただけ。notify-relay が webhook を 10秒から倍々の間隔で送り直した(AC-R001-19)。1時間ごとの照合(AC-006-09)を待つ必要はなかった。

## 次の手

- なし(期待どおり)。webhook の送り直しは最大1時間おきなので、長く止まると、そろうまで最大1時間かかる。手順書に書いた

## 付録:訓練の結果(chaos/report.py の出力)

## 障害訓練の結果:api-down

判定:**期待どおり**

### 時系列(UTC)

```
09:20:00 予約の時刻(お知らせの公開)
09:18:06 seed: 100 teams, 3000 recipients, notices scheduled at 2026-11-16T09:20:00Z
09:20:05 fault on: API stopped
09:22:00 while the API was down: 3000 mails arrived; API results still pending: 3000
09:22:03 fault off: API started and healthy
09:22:04 published: 100 notices
09:22:45 every recipient final (API, notify-relay and the outbox)
09:23:05 end: Mailpit holds 3000 mails
```

### メール(Mailpit)

| 項目 | 値 |
|---|---|
| 届くはずの宛先 | 3,000 |
| 1通以上届いた宛先 | 3,000 |
| ちょうど1通届いた宛先 | 3,000 |
| 2通以上届いた宛先(二重配信) | 0(余分に届いたのは 0 通) |
| 失敗と記録されずに届いていない宛先(取りこぼし) | 0 |
| 予約の時刻から最初の1通 | 4 秒 |
| 予約の時刻から最後の1通 | 8 秒 |
| 障害を止めてから最後の1通 | -115 秒 |

### 配信状況の照らし合わせ

| 項目 | 値 |
|---|---|
| API の配信状況 | {"delivered": 3000} |
| API の届かなかった理由 | {} |
| notify-relay の宛先の状態 | {"delivered": 3000} |
| notify-relay のエラーの種類 | {} |
| notify-relay の送信の回数(回数: 宛先の数) | {"1": 3000} |
| failed になった宛先の送信の回数 | {} |
| 宛先ごとに API と notify-relay をつないだ数 | 3,000(状態が食い違う宛先 0) |
| notify-relay で完了していない依頼 | 0 |
| アウトボックスの状態 | {"sent": 100} |
| アウトボックスの送信の回数(回数: 件数) | {"1": 100} |

### 警告とエラーのログ(メッセージごとの件数、上位10件)

| サービス | メッセージ | 件数 |
|---|---|---|
| notify-relay | WARN webhook was not accepted; will retry | 400 |
