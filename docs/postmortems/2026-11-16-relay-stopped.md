# notify-relay が3分止まっても依頼は失われず、手順どおり送り直すと5秒で送り終えた。ただし受け付けの deadlock で6分遅れた回があった

- 日付:2026-11-16
- 種類:障害訓練(spec 009 の AC-009-05・AC-009-12)
- 判定:期待どおり
- 記録:https://github.com/yuukioda999/team-ops/actions/runs/43850003897(90日で消える)
- 確かめたコード:team-ops a25ccd9、team-ops-api ec04c8e、notify-relay 7f60c9b

## 概要

お知らせの公開の30秒前に notify-relay を止め、公開の3分10秒後に起動した。止まっている間、API は100件の配信依頼をアウトボックスに持ったまま送り直しを続けた。起動のあと、手順書どおり `outbox:redispatch --now` を打つと、5秒で3,000人全員へちょうど1通ずつ届いた。

一方、同じ手順の前の run(https://github.com/yuukioda999/team-ops/actions/runs/43848283354)では、起動から最後の1通まで 350秒かかった。100件のうち1件だけ送り直しが1回多く、notify-relay の受け付けが失敗したと見ている(下の「原因」)。

## 影響

- 二重配信・取りこぼし:0
- 遅れ:最初の1通が予約の時刻から 192秒(止まっていた時間ぶん)。この run では起動から5秒で送り終えた
- 前の run では、1件(30人)が起動から約6分遅れた
- 配信状況:最後はすべて「届いた」。宛先ごとに並べて食い違いなし

## 時系列(UTC)

| 時刻 | できごと |
|---|---|
| 10:37:31 | notify-relay を止める |
| 10:38:00 | 予約の時刻。100件のお知らせが公開され(最後の公開は1秒後)、アウトボックスに入る |
| 10:38〜10:41 | API の worker が送り直すたびに断られる(300回) |
| 10:41:10 | notify-relay を起動。この時点で送っていないアウトボックスは100件、届いたメールは0通 |
| 10:41:11 | 運用する人の操作として `outbox:redispatch --now` を打つ(100件をすぐ送り直す) |
| 10:41:12〜10:41:15 | 最初と最後の1通(応答できるようになってから5秒) |

## どう気づいたか

- API のログに `notify-relay did not accept the outbox message; will retry` が 300件(WARNING)
- 送っていないアウトボックスの数を DB で数えられる(手順書に、読むだけの SQL を書いた)

## 原因

notify-relay が止まっていた。訓練で起こしたもの。

前の run の遅れの原因の見立て:起動の直後に100件の依頼が一度に届くと、notify-relay の受け付け(依頼と宛先の行の insert)が、送信の取り出し(宛先の行のロック)と MySQL の deadlock になることがある。後の run で、エラーの行(`accept delivery`、`Error 1213 Deadlock found`)を確かめた。notify-relay は送信の取り出しでは deadlock をやり直すが、受け付けではやり直さずに 500 を返す。API はそれを一時的な失敗として扱い、送り直しの間隔(このときは5分)を待った。前の run ではエラーの行を出していなかったので、遅れの1件が deadlock だったことは確かめていない。

## どう戻したか

人は notify-relay を起動し、手順書どおり `outbox:redispatch --now` を打った(AC-009-12)。送り直しは API が行った(ADR-0002・0018)。

## 次の手

- (決定済み、2026-11-16)notify-relay の受け付けでも、deadlock のときにやり直す(notify-relay #16)。やり直しだけでは同時に走らせるテストで失敗が残ったので、受け付けと取り出しのトランザクションを READ COMMITTED にする案(notify-relay の ADR-0003)を足し、人間の確認を待っている。受け付けの失敗(`accept delivery`)のログは、訓練の2つの run で出た(api-down で1件、強制終了で2件)。中身が deadlock だと確かめたのは強制終了の2件。ほかに2つの run で、アウトボックスの1件だけ送信回数が多く、同じ原因と見ている(smtp-temp と、この relay-stop の前の run)

## 付録:訓練の結果(chaos/report.py の出力)

## 障害訓練の結果:relay-stop

判定:**期待どおり**

| 確かめたこと | 結果 |
|---|---|
| 当たった:止まっている間、すべての依頼がアウトボックスに残り、1通も届いていない | はい |
| 宛先の数が API・notify-relay・試験データでそろう | はい |
| 試験データにない宛先に届いていない | はい |
| 取りこぼしがない | はい |
| 失敗と記録した宛先に届いていない | はい |
| API と notify-relay の状態が一致する | はい |
| 結果の出ていない宛先がない | はい |
| 二重配信がない | はい |
| 全員に届いた | はい |

### 時系列(UTC)

```
10:35:42 seed: 100 teams, 3000 recipients, notices scheduled at 2026-11-16T10:38:00Z
10:37:31 fault on: notify-relay stopped
10:38:00 予約の時刻(お知らせの公開)
10:41:10 fault off: notify-relay started and healthy
10:41:10 outbox while notify-relay was down: 100 messages not sent, 0 mails arrived
10:41:11 operator: php artisan outbox:redispatch --now (Moved 100 waiting outbox message(s) to now. Redispatched 100 outbox message(s). )
10:41:17 every recipient final (API, notify-relay and the outbox)
10:41:37 end: Mailpit holds 3000 mails
```

### 宛先ごとの並び(AC-009-02)

宛先ごとに、受け取った回数・API の配信状況・notify-relay の状態をつなぎ、組み合わせごとの人数にまとめた。

| 受け取った回数 | API | notify-relay | 人数 |
|---|---|---|---|
| 1回 | delivered | delivered | 3,000 |

| 項目 | 値 |
|---|---|
| 届くはずの宛先 | 3,000 |
| 2通以上届いた宛先(二重配信) | 0(余分に届いたのは 0 通) |
| 失敗と記録されずに届いていない宛先(取りこぼし) | 0 |
| 失敗と記録したのに届いた宛先 | 0 |
| API と notify-relay で状態が違う宛先 | 0 |
| 試験データにない宛先に届いた数 | 0 |
| 予約の時刻から最初の1通 | 192 秒 |
| 予約の時刻から最後の1通 | 195 秒 |
| 予約の時刻から最初と最後の公開 | 0 秒・1 秒 |
| notify-relay が応答できるようになってから最後の1通 | 5 秒 |
| API の届かなかった理由 | {} |
| notify-relay の送信の回数(回数: 宛先の数) | {"1": 3000} |
| アウトボックスの状態 | {"sent": "100"} |
| アウトボックスの送信の回数(回数: 件数) | {"4": "100"} |

### 警告とエラーのログ(メッセージごとの件数、上位10件)
