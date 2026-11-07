# team-ops

少年スポーツチーム(少年サッカーなど)の運営ツールです。名簿・連絡・出欠・当番・会費を、保護者がスマホで回せるようにします。

このリポジトリは**入口**です。開発環境(全サービスの一括起動)と、システム全体の資料を置いています。

> **現在の状況:開発中(2026年11月)。001 アカウントとチーム作成(メールのリンクでログイン、表示名、チームの作成と切り替え)、002 招待と参加承認(招待リンク・QR、参加申請、承認)、003 名簿(選手の登録、保護者の紐づけ、CSV の一括登録、役割に応じた閲覧範囲)、004 役割と権限(役割の変更、代表の交代、除名、監査ログ)まで完成。`make up` で動かせる**
> 要件定義・設計判断(ADR)・受け入れ基準付きの機能仕様を作成済みです。第1弾は2027年1月にデモ環境として公開予定です。

## 画面(001 アカウントとチーム作成)

| ログイン | リンクの確認 | チームの用意 | チームのホーム |
|---|---|---|---|
| <img src="https://raw.githubusercontent.com/yuukioda999/team-ops-web/main/docs/screenshots/001/01-login.png" width="180" alt="メールアドレスを入力するログイン画面"> | <img src="https://raw.githubusercontent.com/yuukioda999/team-ops-web/main/docs/screenshots/001/03-verify.png" width="180" alt="ボタンを押してログインする確認画面"> | <img src="https://raw.githubusercontent.com/yuukioda999/team-ops-web/main/docs/screenshots/001/05-start.png" width="180" alt="チームを作成するか招待から参加するかを選ぶ画面"> | <img src="https://raw.githubusercontent.com/yuukioda999/team-ops-web/main/docs/screenshots/001/08-team-home.png" width="180" alt="チーム名と役割が表示されたチームのホーム"> |

ほかの画面は [team-ops-web/docs/screenshots/001](https://github.com/yuukioda999/team-ops-web/tree/main/docs/screenshots/001) にあります。

## 見どころ(どこを見れば何が分かるか)

| 見てほしい点 | 場所 |
|---|---|
| 要件から仕様への落とし込み | [立ち上げ依頼](docs/requirements/project-brief.md) → [001 の仕様(受け入れ基準)](specs/001-account-and-team/spec.md) → [計画と判断 D1〜D8](specs/001-account-and-team/plan.md) → [作業分解](specs/001-account-and-team/tasks.md) |
| 設計判断の記録 | [ADR 一覧](docs/adr/)。例:[Goへの配信の切り出し](docs/adr/0002-extract-delivery-to-go.md)、[個人情報を持たない設計](docs/adr/0003-minimize-personal-data.md)、[マジックリンク](docs/adr/0008-magic-link-login.md) |
| AIの使い方と人間の判断 | [ai-log](docs/ai-log/2026-11-06-001-account-and-team.md)、[最終レビューの指摘と判断](specs/001-account-and-team/review-t30.md)。AIのレビューの指摘と、人間が決めたことを分けて記録しています |
| 受け入れ基準とテストの対応 | テスト名に受け入れ基準のIDを入れています。例:[API の Feature テスト](https://github.com/yuukioda999/team-ops-api/tree/main/tests/Feature/Auth)、[他チームのデータは404](https://github.com/yuukioda999/team-ops-api/blob/main/tests/Tenancy/TeamIsolationTest.php) |
| 全サービスを通したテスト | [E2E(Playwright)](e2e/tests/001-account-and-team.spec.ts)。CI の [smoke](.github/workflows/smoke.yml) が、docker compose の環境に対して毎回動かします |
| Laravel の作り | Controller → UseCase → Model の層分け、[ログインのUseCase](https://github.com/yuukioda999/team-ops-api/tree/main/app/UseCases/Auth)、[アウトボックスと配信の依頼](https://github.com/yuukioda999/team-ops-api/tree/main/app/Support/NotifyRelay) |
| Go の作り | [notify-relay](https://github.com/yuukioda999/notify-relay):domain・usecase・adapter・infra の層分け、[重複防止と再送、デッドロック時のやり直し](https://github.com/yuukioda999/notify-relay/blob/main/internal/infra/mysqlstore/store.go) |

## このプロジェクトの特徴

- **要件定義から運用保守まで、全工程の成果物を公開**:要件、設計判断、受け入れ基準付きの仕様、テストを公開しています。負荷試験と障害訓練の振り返りは、今後追加します
- **仕様駆動のAI駆動開発**:仕様 → 計画 → 作業分解 → 実装の順にAI(Claude Code)と進め、AIへの指示と人間が直した内容を記録します
- **個人情報を「持たない」設計**:住所・生年月日・写真などは項目自体を持たず、持つ情報は暗号化・監査ログ・期限付き削除で扱います
- **ローカルで本番相当を再現**:障害注入(SMTPエラー、配信サービスの停止)や負荷試験も、ローカルだけで実行できます

## 構成

| リポジトリ | 技術 | 役割 |
|---|---|---|
| **team-ops**(このリポジトリ) | docker compose | 開発環境とシステム全体の資料 |
| [team-ops-api](https://github.com/yuukioda999/team-ops-api) | Laravel 13 | 認証・権限・マルチテナント・業務ロジック |
| [team-ops-web](https://github.com/yuukioda999/team-ops-web) | React + TypeScript | スマホ向けのWeb画面 |
| [notify-relay](https://github.com/yuukioda999/notify-relay) | Go 1.26 | メール配信サービス(OSS)。流量制御・再送・二重配信の防止 |

## ローカルでの起動

4つのリポジトリを同じフォルダに並べて、team-ops から起動します。

```
作業フォルダ/
├── team-ops/        ← ここで make up
├── team-ops-api/
├── team-ops-web/
└── notify-relay/
```

```sh
git clone https://github.com/yuukioda999/team-ops.git
cd team-ops
make setup   # 残り3つのリポジトリを隣に clone
make up      # 全サービスを起動
```

| 画面 | URL |
|---|---|
| Web | http://localhost:5173 |
| API | http://localhost:8000/api/health |
| notify-relay | http://localhost:8080/healthz |
| Mailpit(受信したメール) | http://localhost:8025 |
| Grafana(トレース・メトリクス・ログ) | http://localhost:3000 |

### ログインしてみる

ローカルは実在のアドレスにメールを送りません(`RECIPIENTS_INVALID_ONLY=true`。宛先は `.invalid` で終わるアドレスだけ)。それ以外のアドレスを入れると、入力欄にエラーを表示します。

`.invalid` は、実在しないことが決まっている予約済みのドメインです(RFC 2606)。インターネットでは届かないので、`coach@example.invalid`、`parent1@test.invalid` のように名前は自由に付けられます。メールはすべて Mailpit に届きます。画面とサービスのポート(Mailpit・MySQL を含む)は、このPCからだけ開けます。

1. http://localhost:5173 を開き、`coach@example.invalid` のようなアドレスを入力して「ログイン用のリンクを送る」を押す
2. http://localhost:8025(Mailpit)で届いたメールを開き、リンクを押す
3. 「ログインする」を押し、表示名を登録する。続けてチームを作成できる

メールは Web → API(アウトボックス)→ notify-relay → Mailpit の順に届きます。

### テスト

```sh
make test   # API(team_ops_test を使う)、Web、notify-relay(notify_relay_test を使う)
make e2e    # 起動中の環境に対して、ブラウザで 001 の流れを通しで確かめる(Node.js が必要)
```

`make e2e` は [e2e/](e2e/) の Playwright のテストです。ログイン用リンクのメールは Mailpit の API から読み取ります。CI(smoke)でも `make up` 相当の環境に対して毎回動かしています。

テスト用のDB(`notify_relay_test` など)は、MySQL のデータ領域を初めて作るときに用意されます。以前に `make up` したことがある場合は、`docker compose down -v` で一度作り直してください(ローカルのデータは消えます)。

初回の `make up` は、依存関係のインストールとDBの準備で数分かかります。`make ps` で api が healthy になれば使えます。

`make help` でコマンドの一覧を表示できます。障害訓練用に `make chaos-smtp`(SMTPエラーを発生)と `make chaos-relay-down`(配信サービスを停止)を用意しています。

## 資料

| 種類 | 場所 |
|---|---|
| 要件・立ち上げ依頼 | [docs/requirements/](docs/requirements/) |
| 設計判断の記録(ADR) | [docs/adr/](docs/adr/) |
| 構成・設計 | [docs/design/](docs/design/) |
| 機能仕様(受け入れ基準付き) | [specs/](specs/) |

## ライセンス

[MIT](LICENSE)
