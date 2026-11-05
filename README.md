# team-ops

少年スポーツチーム(少年サッカーなど)の運営ツールです。名簿・連絡・出欠・当番・会費を、保護者がスマホで回せるようにします。

このリポジトリは**入口**です。開発環境(全サービスの一括起動)と、システム全体の資料を置いています。

> **現在の状況:設計中(2026年11月)**
> 要件定義・設計判断(ADR)・受け入れ基準付きの機能仕様を作成済みです。第1弾は2027年1月にデモ環境として公開予定です。

## このプロジェクトの特徴

- **要件定義から運用保守まで、全工程の成果物を公開**:要件、設計判断、受け入れ基準付きの仕様、テスト、負荷試験、障害訓練の振り返りまでを残します
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

## ローカルでの起動(準備中)

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
make up      # 全サービスを起動し、デモデータを投入
```

## 資料

| 種類 | 場所 |
|---|---|
| 要件・立ち上げ依頼 | [docs/requirements/](docs/requirements/) |
| 設計判断の記録(ADR) | [docs/adr/](docs/adr/) |
| 構成・設計 | [docs/design/](docs/design/) |
| 機能仕様(受け入れ基準付き) | [specs/](specs/) |

## ライセンス

[MIT](LICENSE)
