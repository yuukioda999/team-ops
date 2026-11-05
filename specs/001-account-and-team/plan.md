# 001 アカウントとチーム作成:実装計画

spec.md の受け入れ基準をどう作るかを決める。「要確認」の項目は、レビューで決まってからADRに記録する。

## 全体の流れ

```
[Web] メールアドレス入力
  → [API] POST /api/auth/login-links
      トークン発行(DBにはハッシュ値のみ)・回数制限・アウトボックスに配信依頼を記録
  → [API ワーカー] アウトボックスから notify-relay に依頼(dedupe_key 付き、HMAC署名)
  → [notify-relay] SMTP(ローカルは Mailpit)で送信
[メールのリンク] /login/verify?token=...(Web の画面)
  → 「ログインする」ボタン(要確認1)
  → [API] POST /api/auth/login-links/consume → セッション開始
  → 未登録なら表示名の入力画面、登録済みならチーム一覧
```

## 決めること

### 要確認1:リンクを開いたときの動作

| 案 | 内容 |
|---|---|
| **A(推奨)** | リンクは画面を開くだけ。画面の「ログインする」ボタンでログインする |
| B | リンクを開いた時点でログインする |

推奨の理由:会社や携帯会社のメールは、迷惑メール対策でリンクを自動的に開くことがある。Bだと、本人が開く前にリンクが使用済みになり、AC-001-04 の「2回目は無効」とぶつかる。タップが1回増えるだけで済む。

### 要確認2:チームの切り替えの持ち方(AC-001-13)

| 案 | 内容 |
|---|---|
| **A(推奨)** | APIのURLにチームIDを入れる(`/api/teams/{team}/members` など) |
| B | 選択中のチームをサーバー側のセッションに覚えておく |

推奨の理由:どのチームのデータを扱うかがリクエストごとに明確になり、他チームのデータを返さないこと(AC-000-01)をルーティングとPolicyでまとめて検査できる。タブを2つ開いて別のチームを見ても混ざらない。

### 要確認3:notify-relay の作る範囲

ログイン用メールは notify-relay 経由で送る(spec の補足)。今の notify-relay はヘルスチェックしかない。

| 案 | 内容 |
|---|---|
| **A(推奨)** | 001 と並行して、notify-relay の受付(AC-R001-01〜04、06)と1回の送信だけを作る。再送・webhook・流量制御は 005 の前に作る |
| B | 001 では Laravel から Mailpit に直接送り、あとで notify-relay に切り替える |

推奨の理由:Bは切り替えの作業と、ADR-0002 から外れる期間が生まれる。Aなら最初から本番と同じ経路を通り、Go側の見せ場(署名検証・重複防止)も早く形になる。

## 決めたこと(既存のADRに沿うもの)

| 項目 | 内容 | 根拠 |
|---|---|---|
| 認証 | Laravel Sanctum の SPA 認証(Cookieのセッション、CSRF対策付き)。Web と API は同じオリジン(Vite・nginx のプロキシ) | トークンをブラウザのJSに持たせない |
| セッションの期限 | 最後の操作から30日(AC-001-07)。ログアウトでセッションを破棄し、IDを再発行 | spec |
| ログイン用トークン | 32バイトの乱数。DBには SHA-256 のみ保存。15分で失効、使ったら即無効 | AC-001-03・04 |
| 回数制限 | メールアドレスのハッシュ値ごとに1時間5回。IPごとの制限も別にかける | AC-001-05 |
| 登録の有無を隠す | 未登録・登録済みで、応答の内容と時間を揃える(どちらもキューに積んで即応答) | AC-001-02 |
| アカウントの作成時期 | リンクを使った時点で作る。リンクを要求しただけでは作らない | AC-001-03 |
| 個人情報の保存 | メールアドレスと表示名は暗号化キャスト。照合用にメールアドレスの HMAC-SHA256(専用の鍵)を別の列に持つ | ADR-0003 |
| メール変更 | 新しいアドレス宛ての確認トークン(ログインと同じ仕組み、用途を分ける)。確定したら旧アドレスに通知 | AC-001-09・10 |
| チーム作成の上限 | 代表として作成したチームを数え、6つ目は422 | AC-001-12 |
| 配信依頼 | アウトボックス表に記録 → ワーカーが送る。dedupe_key は `login-link:{トークンID}` のように依頼ごとに一意 | ADR-0002 |

## データ(team-ops スキーマ)

| 表 | 主な列 |
|---|---|
| users | id, email(暗号化), email_index(HMAC、一意), display_name(暗号化、未入力はNULL), timestamps |
| login_tokens | id, purpose(login / email_change), email(暗号化), email_index, user_id(NULL可), token_hash(一意), expires_at, used_at |
| teams | id(ULID), name, sport(soccer / baseball / other), created_by, timestamps |
| team_memberships | team_id, user_id, role(001では representative のみ。004で増やす), timestamps |
| outbox_messages | id, kind, dedupe_key(一意), payload(暗号化), status, attempts, next_attempt_at, sent_at |
| sessions | Laravel 標準(DBドライバ) |

チームIDはURLに出るので、連番ではなくULIDにする(件数を推測させない)。

## API

| メソッド・パス | 内容 | 受け入れ基準 |
|---|---|---|
| POST /api/auth/login-links | ログイン用リンクの要求 | 01, 02, 05 |
| POST /api/auth/login-links/consume | リンクのトークンでログイン | 03, 04 |
| POST /api/auth/logout | ログアウト | 06 |
| GET /api/me | 自分の情報と所属チーム一覧 | 14 |
| PATCH /api/me | 表示名の登録・変更 | 08 |
| POST /api/me/email-changes | メール変更の申請 | 09 |
| POST /api/me/email-changes/consume | メール変更の確定 | 09, 10 |
| POST /api/teams | チーム作成 | 11, 12 |
| GET /api/teams/{team} | チームの情報(所属していなければ404) | 13, AC-000-01 |

入出力は FormRequest と Resource で定義し、openapi/ に書く。web の型は OpenAPI から生成する。

## 画面(team-ops-web)

| 画面 | パス |
|---|---|
| ログイン(メールアドレス入力・送信済み・回数超過) | /login |
| リンク確認(ログインするボタン・期限切れ) | /login/verify |
| 表示名の入力 | /welcome |
| チームがない人向け(作成・招待から参加の2つの導線) | /start |
| チーム作成 | /teams/new |
| チームのホーム(001ではチーム名と切り替えだけ) | /teams/:teamId |
| アカウント設定(表示名・メール変更) | /settings |
| メール変更の確定 | /settings/email/verify |

デザインは ADR-0007(マッチセンター)。「招待リンクから参加する」は 002 で中身を作り、001 では導線だけ置く。

## テスト

- API:受け入れ基準ごとの Feature テスト(MySQL)。テナント分離(AC-000-01)は tests/Tenancy
- AC-000-04:ログと例外通知にメールアドレス・表示名が出ないことを、ログを捕まえて検査する
- Web:画面ごとに Testing Library(APIはモック)
- notify-relay:受付のテーブル駆動テスト
- 通しの確認:ローカルで `make up` → ログイン → Mailpit でメールを開く → チーム作成まで

## 作るADR

- ADR-0008 ログイン方式(マジックリンク、Sanctum SPA 認証、リンクを開いたときの動作)
- ADR-0009 チームの指定方法(URLにチームIDを入れる)
