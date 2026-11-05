---
name: ai-log
description: Record how AI was used for a task and what the human changed. Use at the end of each task from tasks.md.
---

# AI活用の記録

タスクが終わるたびに `docs/ai-log/YYYY-MM-DD-<機能番号>-<短い名前>.md` を作り、次を書く。

1. タスク:どの spec のどのタスクか(リンク)
2. AIへの指示:要点を箇条書き(プロンプト全文は不要)
3. AIの出力:何を作ったか
4. 人間が直したこと:何を、なぜ直したか。ここが一番大事
5. 判断:人間が決めたこと(ADRがあればリンク)
6. 学び:次に同じことをするときに変えること

AIが間違えた点や、指示が足りなかった点も正直に書く。面接で「AIをどう管理したか」を説明する材料になる。
