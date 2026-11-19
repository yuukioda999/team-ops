# 010 監視:トレースとメトリクス:作業分解

plan.md と ADR-0026 をもとにした作業の一覧。上から順に進める。

凡例:`[ops]` team-ops、`[api]` team-ops-api、`[relay]` notify-relay

**進み具合(2026-11-19):T01〜T03 完了。**

| No. | 作業 | 対象 | 受け入れ基準 |
|---|---|---|---|
| T01 | spec と計画 | ops | |
| T02 | 判断1〜7 の確認 | ops | |
| T03 | ADR-0026 | ops | |
| T04 | notify-relay:OpenTelemetry の Go SDK を入れる(ADR に理由)。受付・送信・webhook のスパン、traceparent の受け渡し、メトリクス、ログにトレースID | relay | AC-010-02・03・04・06・13、AC-R001-24・25 |
| T05 | API:ext-opentelemetry と Laravel の自動計装、送る前に伏せる処理、公開とアウトボックスのスパン、traceparent の保存、メトリクス、ログにトレースID | api | AC-010-01・02・03・05・06・13 |
| T06 | SLO と監視・アラートの設計(docs/ops/) | ops | AC-010-07 |
| T07 | ダッシュボードとアラートの定義、otel-lgtm への読み込み | ops | AC-010-08・10 |
| T08 | デモ環境:Alloy の OTLP の受け口と Grafana Cloud への送信、ダッシュボードとアラートを入れる手順 | ops | AC-010-09 |
| T09 | CI:smoke でトレースとメトリクスが届いたことを確かめる。障害訓練でアラートの発火を確かめる | ops | AC-010-11・12 |
| T10 | 手順書、README、ai-log | ops | |
