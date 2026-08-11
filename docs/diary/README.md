---
tags: [diary, index]
---

# 作業日記 (Obsidian vault)

このフォルダは **Obsidian の vault としてそのまま開けます**（`docs/diary` を vault に指定）。
1作業＝1エントリで、ファイル名は `YYYY-MM-DD.md`（同じ日に複数回作業したら見出しを追加）。

## 書くルール

- **やったこと**より **「なぜそうしたか」「何を測ったか」「次に何が残ったか」** を残す。
  コードの内容は git log と diff が持っているので繰り返さない。
- 数値（勝率・spread・試合数・seed）は必ず書く。あとで A/B の対照群として使う。
- 未解決のものは `## 積み残し` に書き、**GitHub issue を立てたら `#12` の形で番号を残す**。
- 関連ノートは `[[2026-08-10]]` のように Obsidian のウィキリンクで繋ぐ。

## テンプレート

```markdown
---
date: YYYY-MM-DD
tags: [diary]
issues: []
---

# YYYY-MM-DD

## やったこと
## なぜ / 判断
## 計測
## 積み残し
```

## この日記を使う仕組み

- 書く側: `/work-diary`（作業のあとに呼ぶ。必要なら issue も立てる）
- 拾う側: `/diary-improve-loop`（`/loop` から回す。積み残しと open issue を1つずつ潰す）

## エントリ

- [[2026-08-10]] — 増殖スキルの追加と GitHub Pages 公開 / loop iteration 1-2
- [[2026-08-11]] — loop iteration 3-7 / キャラクター資料の作成 / 提案スキルの追加

## 資料
- [キャラクター資料](../characters.md) — コンセプト・基本ステータス・立ち回り・スキル一覧
