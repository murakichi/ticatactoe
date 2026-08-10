---
name: diary-improve-loop
description: 作業日記(docs/diary)の積み残しと GitHub の open issue を拾い、1回につき1件だけ実装・検証・記録して改善を続けるループ。`/loop 30m /diary-improve-loop` のように /loop から回す想定。何を直すか決まっていない状態から「次にやるべき1件」を選んで完了させたいときに使う。
---

# diary-improve-loop — 日記と issue を拾って改善し続ける

`/work-diary` が残した積み残しと GitHub issue を、**1イテレーション＝1件**のペースで潰す。
`/loop` から呼ばれる前提なので、**毎回きれいに終わる**こと（中途半端な作業木を残さない）。

## 1イテレーションの手順

### Step 1. 現状を読む（ここを飛ばさない）
```bash
git log --oneline -10
ls docs/diary | tail -5                      # 直近の日記
gh issue list --state open --limit 20
```
最新2エントリの `## 積み残し` と open issue を突き合わせ、**候補リスト**を作る。

### Step 2. 1件だけ選ぶ
優先順位:
1. **壊れているもの**（CI失敗・テスト失敗・公開サイトが落ちている）
2. **数値で追える保留**（「N試合では有意差なし」→ 試行数を増やせば決着する）
3. **新機能が生んだ未検証リスク**（キャラ間シナジー等）
4. その他の改善

選んだら**それだけ**やる。ついでの修正で差分を膨らませない（何が効いたか測れなくなる）。

### Step 3. やる
- バランス/AI の話なら **`/balance-loop` か `/ai-improve` に委譲する**（このスキルで再実装しない）
- 変更は必ず A/B で測る。対照群は「ノブを無効値にした同 seed の走行」:
  ```bash
  node sim/cli.js metrics --games 800 --seed 1 --tag before --log sim/iterations.jsonl
  # 変更を入れる
  node sim/cli.js metrics --games 800 --seed 1 --tag after  --log sim/iterations.jsonl
  ```
- **効かなかったら revert する**。「たぶん良くなった」で残さない
- sim を変えたら `src/`（`AIPlayer.ts` / `Game.tsx` / `skillCosts.ts`）へミラー。
  仕上げに `node sim/engine.test.js` と `npx tsc --noEmit` を通す

### Step 4. 記録して閉じる

**PR は自分でマージしてよい**（リポジトリオーナーからの許可済み）。
ただし *CI がグリーンであること* が条件。失敗しているなら直してからマージする。
```bash
gh pr create --fill && gh pr merge --squash --delete-branch
```
`master` へ直接 push でも構わないが、変更が大きいときや revert の可能性があるときは
PR にして履歴を分けたほうが後の A/B 比較がしやすい。

- `/work-diary` を呼んで日記を書く（採用/却下と数値を必ず残す）
- 解決した issue は `gh issue close <N> --comment "<結果と数値>"`
- **却下**した案も issue にコメントを残してから閉じる（同じ案を次のループで再試行しないため）
- 新たに見つかった課題は `gh issue create` で積む＝次のループの燃料
- push すると GitHub Actions が公開サイトを更新する。デプロイの成否まで確認する:
  ```bash
  gh run list --limit 1
  ```

## 終了条件

- open issue も積み残しも無い、**または** 2イテレーション連続で
  「有意差なし・採用なし」だった場合は、**ループを止めて**その旨を報告する。
  惰性で回さない（試行数だけ増やしても指標が動かないなら、課題設定の方が間違っている）。

## やってはいけないこと

- 1イテレーションで複数件に手を出す
- 測定なしでバランス値を変える
- 日記も issue も更新せずに終わる（次のループが同じ判断を繰り返す）
- `master` を壊したまま終わる。**必ず** CI がグリーンな状態で1回分を締める
