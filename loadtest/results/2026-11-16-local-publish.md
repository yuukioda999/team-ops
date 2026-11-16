# 予約の公開1件あたりの時間(ローカル、2026-11-16)

段階2(公開の並列化)が速くならなかった理由を調べるため、公開1件にかかる時間とクエリの数を手元で測った。

## 条件

- team-ops-api の main(順に公開する作り)
- データベースは手元の MariaDB(CI の MySQL 8.4 とは違う)。Docker は使っていない
- 試験データは `php artisan loadtest:seed --teams=300`(1チーム30人、300件の予約)
- 測ったのは `PublishDueNotices` の呼び出しだけ(キューは database。ジョブを積むところまでで、relay への依頼は含まない)

## 測り方

`php artisan tinker` で、次を実行した。`DB::listen` でクエリを数え、かかった時間を足す。

```php
use Illuminate\Support\Facades\DB;
$n = 0; $t = 0;
DB::listen(function ($q) use (&$n, &$t) { $n++; $t += $q->time; });
$s = microtime(true);
$c = app(App\UseCases\Notices\PublishDueNotices::class)();
printf("published %d in %.2fs, queries %d, query time %.0f ms\n", $c, microtime(true) - $s, $n, $t);
```

## 結果(1回)

| 項目 | 値 |
|---|---|
| 公開した数 | 300 件 |
| かかった時間 | 3.93 秒(1件あたり約13ミリ秒) |
| クエリの数 | 4,201 回(1件あたり約14回) |
| クエリの時間の合計 | 1,897 ミリ秒(全体の約半分) |

1件あたりのクエリの内訳は、team_memberships の select が3回、users の select が2回、ほかは1回ずつ(notices・teams・team_member_roles の select、notices の update、notice_recipients の insert と update、outbox_messages・audit_logs・jobs の insert)。

残りの約半分は PHP の処理(モデルの組み立て、権限の判定など)。宛先のメールアドレス9,000件の復号は 0.10秒で、ほとんど時間を使っていない。

1回だけの手元の測定で、GitHub Actions の数字とは直接比べられない。
