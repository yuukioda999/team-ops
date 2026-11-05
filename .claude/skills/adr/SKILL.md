---
name: adr
description: Write an Architecture Decision Record when a design decision comes up. Use before implementing anything that chooses between alternatives.
---

# ADRの書き方

1. `docs/adr/` の既存ファイルを見て、次の番号を決める(4桁、例:0008)
2. ファイル名は `NNNN-短い英語の要約.md`
3. 次の見出しで書く。既存のADRと同じ形にそろえる
   - タイトル:`# ADR-NNNN: 決めたことを1文で`
   - ステータス(提案中 / 承認 / 置き換え済み)、日付、決定者、関連
   - コンテキスト:なぜ決める必要があるか。制約
   - 検討した選択肢:表で、案ごとの評価。採用案を太字にする
   - 決定:何をどうするか
   - 結果:良くなること、悪くなること・受け入れるコスト
   - 見直す条件
4. 理由は正直に書く。ポートフォリオ上の目的が理由に含まれるなら、それも書く
5. 人間の確認が終わるまでステータスは「提案中」にする
