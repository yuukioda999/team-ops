# notify-relay を送信の途中で強制終了すると、取りこぼしはないが、最大47通が二重に届いた

- 日付:2026-11-16
- 種類:障害訓練(spec 009 の AC-009-06)
- 判定:期待どおり
- 記録:https://github.com/yuukioda999/team-ops/actions/runs/43838162895

## 概要

送信の途中で notify-relay を強制終了(SIGKILL)し、10秒後に起動した。3回とも取りこぼしはなかった。二重に届いたメールは 46・47・47通で、合否の基準(同時に送る数 50 以下、判断4)には収まったが、上限の近くだった。

## 影響

| 回 | 強制終了の時点で届いていた数 | 二重に届いた数 | 取りこぼし | 最後の1通(予約の時刻から) |
|---|---|---|---|---|
| 1 | 690 | 46 | 0 | 62 秒 |
| 2 | 562 | 47 | 0 | 64 秒 |
| 3 | 926 | 47 | 0 | 63 秒 |

- 二重に届いた保護者には、同じお知らせのメールが2通届く
- 配信状況:最後はすべて「届いた」。API と notify-relay で食い違いなし

## 時系列(UTC、1回目)

| 時刻 | できごと |
|---|---|
| 09:20:00 | 予約の時刻。4秒後に最初の1通 |
| 09:20:05 | 690通が届いたところで強制終了。sending のまま残った宛先は356 |
| 09:20:16 | 起動。sending の宛先を pending に戻して送り直す |
| 09:21:02 | 最後の1通 |

## どう気づいたか

- notify-relay の起動時のログに `requeued recipients interrupted by a previous stop`(WARN)が1件
- 本番では、メモリ不足なら `dmesg` に記録が残る
- 何通が二重に届いたかは、運用の手段では分からない(訓練では Mailpit で数えた)

## 原因

notify-relay は、送る直前に宛先を sending にし、送ったあとに結果を記録する(notify-relay の ADR-0002)。送ってから記録するまでの間に強制終了すると、起動時にその宛先を「まだ送っていない」として送り直すので、二重に届く。ADR では、この時間を「送信1通ぶん」に限ったとしている。

二重に届いた数が同時に送る数(50)に近かったのは、送信先の Mailpit がすぐ応答するため、送信の時間のほとんどが「送ってから記録するまで」だったからと見ている(まだ確かめていない)。本物の SMTP サーバーは応答が遅いので、この割合は下がる見込み。

## どう戻したか

人は起動しただけ(本番では `restart: unless-stopped` で自動で起動する)。

## 次の手(人間の判断が要る)

- 二重に届いたメールを、受け取る側でまとめられるようにするか。notify-relay は Message-ID を毎回乱数で作っている。宛先と依頼ごとに同じ Message-ID にすれば、同じ Message-ID のメールを1通にまとめるメールサービスもある(どのサービスがまとめるかは確かめが要る)。notify-relay の spec の変更になる
- お知らせのメールの文面に、まれに2通届くことがあると書くか(notify-relay の ADR-0002 は「業務アプリ側はその前提で文面を作る」としているが、いまの文面には書いていない)

## 付録:訓練の結果(chaos/report.py の出力)

## 障害訓練の結果:relay-kill

判定:**期待どおり**

### 時系列(UTC)

```
09:20:00 予約の時刻(お知らせの公開)
09:18:18 seed: 100 teams, 3000 recipients, notices scheduled at 2026-11-16T09:20:00Z
09:20:05 fault on: notify-relay killed (SIGKILL) at 690 mails; recipients left sending: 356
09:20:16 fault off: notify-relay started
09:20:16 published: 100 notices
09:21:07 every recipient final (API, notify-relay and the outbox)
09:21:27 end: Mailpit holds 3046 mails
```

### メール(Mailpit)

| 項目 | 値 |
|---|---|
| 届くはずの宛先 | 3,000 |
| 1通以上届いた宛先 | 3,000 |
| ちょうど1通届いた宛先 | 2,954 |
| 2通以上届いた宛先(二重配信) | 46(余分に届いたのは 46 通) |
| 失敗と記録されずに届いていない宛先(取りこぼし) | 0 |
| 予約の時刻から最初の1通 | 4 秒 |
| 予約の時刻から最後の1通 | 62 秒 |
| 障害を止めてから最後の1通 | 46 秒 |

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
| アウトボックスの送信の回数(回数: 件数) | {"1": 82, "2": 18} |
| 強制終了のあとに sending のまま残った宛先 | 356(取り出した分で、送ったかどうかは問わない。起動時に pending に戻る) |
| 二重配信の上限(同時に送る数) | 50 |

### 警告とエラーのログ(メッセージごとの件数、上位10件)

| サービス | メッセージ | 件数 |
|---|---|---|
| notify-relay | WARN requeued recipients interrupted by a previous stop | 1 |
| API(worker・scheduler を含む) | WARNING notify-relay did not accept the outbox message; will retry | 18 |

## 障害訓練の結果:relay-kill

判定:**期待どおり**

### 時系列(UTC)

```
09:20:00 予約の時刻(お知らせの公開)
09:17:45 seed: 100 teams, 3000 recipients, notices scheduled at 2026-11-16T09:20:00Z
09:20:04 fault on: notify-relay killed (SIGKILL) at 562 mails; recipients left sending: 485
09:20:15 fault off: notify-relay started
09:20:15 published: 100 notices
09:21:06 every recipient final (API, notify-relay and the outbox)
09:21:26 end: Mailpit holds 3047 mails
```

### メール(Mailpit)

| 項目 | 値 |
|---|---|
| 届くはずの宛先 | 3,000 |
| 1通以上届いた宛先 | 3,000 |
| ちょうど1通届いた宛先 | 2,953 |
| 2通以上届いた宛先(二重配信) | 47(余分に届いたのは 47 通) |
| 失敗と記録されずに届いていない宛先(取りこぼし) | 0 |
| 予約の時刻から最初の1通 | 3 秒 |
| 予約の時刻から最後の1通 | 64 秒 |
| 障害を止めてから最後の1通 | 49 秒 |

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
| アウトボックスの送信の回数(回数: 件数) | {"1": 66, "2": 34} |
| 強制終了のあとに sending のまま残った宛先 | 485(取り出した分で、送ったかどうかは問わない。起動時に pending に戻る) |
| 二重配信の上限(同時に送る数) | 50 |

### 警告とエラーのログ(メッセージごとの件数、上位10件)

| サービス | メッセージ | 件数 |
|---|---|---|
| notify-relay | WARN requeued recipients interrupted by a previous stop | 1 |
| API(worker・scheduler を含む) | WARNING notify-relay did not accept the outbox message; will retry | 34 |

## 障害訓練の結果:relay-kill

判定:**期待どおり**

### 時系列(UTC)

```
09:20:00 予約の時刻(お知らせの公開)
09:17:41 seed: 100 teams, 3000 recipients, notices scheduled at 2026-11-16T09:20:00Z
09:20:03 fault on: notify-relay killed (SIGKILL) at 926 mails; recipients left sending: 121
09:20:14 fault off: notify-relay started
09:20:15 published: 100 notices
09:21:06 every recipient final (API, notify-relay and the outbox)
09:21:26 end: Mailpit holds 3047 mails
```

### メール(Mailpit)

| 項目 | 値 |
|---|---|
| 届くはずの宛先 | 3,000 |
| 1通以上届いた宛先 | 3,000 |
| ちょうど1通届いた宛先 | 2,953 |
| 2通以上届いた宛先(二重配信) | 47(余分に届いたのは 47 通) |
| 失敗と記録されずに届いていない宛先(取りこぼし) | 0 |
| 予約の時刻から最初の1通 | 3 秒 |
| 予約の時刻から最後の1通 | 63 秒 |
| 障害を止めてから最後の1通 | 49 秒 |

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
| アウトボックスの送信の回数(回数: 件数) | {"1": 93, "2": 7} |
| 強制終了のあとに sending のまま残った宛先 | 121(取り出した分で、送ったかどうかは問わない。起動時に pending に戻る) |
| 二重配信の上限(同時に送る数) | 50 |

### 警告とエラーのログ(メッセージごとの件数、上位10件)

| サービス | メッセージ | 件数 |
|---|---|---|
| notify-relay | WARN requeued recipients interrupted by a previous stop | 1 |
| API(worker・scheduler を含む) | WARNING notify-relay did not accept the outbox message; will retry | 7 |
