---
name: balance-loop
description: Pit the game's built-in AIs against each other (headless, no browser), analyze game balance and AI strength, and run an iterative improvement loop — hypothesize a tweak, measure, keep or revert. Use when the user wants to analyze or improve tictactoe balance / AI, run AI-vs-AI simulations, or tune characters/skills.
---

# balance-loop

Headless AI-vs-AI analysis + improvement loop for this tic-tac-toe variant.
Everything runs through `sim/` (zero-dependency Node — **never use Playwright/the
browser**, it is slow and burns tokens). Engine is a faithful port of
`src/components/game/Game.tsx` + `src/util.ts`; see `sim/README.md`.

## Tools you will use

```bash
node sim/cli.js metrics --games 800 --mode faithful --seed 1   # balance snapshot (JSON)
node sim/cli.js bench   --games 1500 --char you --seed 1       # AI strength (vs random + head-to-head)
node sim/cli.js sim     --games 2000 --pair giant,you          # drill into one matchup
node sim/cli.js auto    --hchar giant --cchar you              # watch one game (sanity)
```
`--mode`: `faithful` (= real `AIPlayer.ts`: スキル・捕獲・ロック・レース全部入り。
バランス分析は基本これ), `capture` (旧ベースライン: 捕獲のみ、スキル無し),
`random` (最弱基準)。Add `--log sim/iterations.jsonl --tag <label>` to `metrics`
to append the snapshot for comparison.

## Key metrics (from `metrics`)

- `drawRate` — fraction of games drawn. Lower = more decisive.
- `firstAdvantage` — firstWin − secondWin. Closer to 0 = fairer.
- `nonGiantSpread` — max−min overall win-rate among non-giant chars. 固有スキルが
  発火する今は意味のある差。大きすぎ=特定キャラが支配的。
- `giantGap` — mean(non-giant win-rate) − giant win-rate。**正=giantが弱い / 負=giantが強い**。
  ストンプ採用後は負(giantが上位)に振れやすい。
- `charWinRate` — per-character overall win-rate (draws excluded).

## Balance knobs (edit these, then re-measure)

1. `sim/config.js` — `lifeMeans` per character, `lifeStd`, `giantSkipModulo`,
   `proliferate`(増殖: `cost`/`tokenLife`/`upkeepStep`/`maxStacks`)。
   **Lowest risk; start here.** 増殖のノブは `src/.../skillCosts.ts` と
   `Game.tsx` の `proliferate*` 定数にも同じ値をミラーすること。
2. `sim/engine.js` `skillCosts` — magic costs. AIがスキルを使うので効く。キャラ固有の
   コスト(蘇生/全軍突撃/審判)や per-bud 魔力(魔法使い+3)も `engine.js`/`Game.tsx` に。
3. `sim/engine.js` `judgeNextIsHeart` — turn order / giant cadence。巨人が強い今は
   スキップ頻度を上げる(巨人の手番を減らす)のがナーフ手段。
4. `sim/ai.js` — AI behavior (`getEnhancedBestMove`, `chooseSkills`, `chooseLocks`,
   `faithfulMakeMove`)。眼を変えたら src `AIPlayer.ts` へミラー。

## Loop procedure

1. **Baseline.** Run `metrics` (faithful) and `bench`. Record the JSON
   (`--log sim/iterations.jsonl --tag baseline`). Optionally `auto` a couple games
   to sanity-check behavior.
2. **Diagnose.** Compare against the targets below; pick the single worst issue.
   **弱キャラ外れ値チェック:** ある1キャラの `charWinRate` が他から突出して低い
   （= `nonGiantSpread` の最小値が他より大きく離れている。目安: 2番目に低いキャラより
   0.08+ 低い、または明確な最下位の外れ値）なら、**バランス調整より先に AI の改善を試す**
   → 次ステップ参照。
3. **弱キャラはまず AI 改善を試みる（ナーフ/バフ前に）.** キャラが弱いのは
   「ゲームの数値が弱い」のではなく「AI がそのキャラをうまく使えていない」可能性がある。
   ステータスやコストをいじる前に、まず **ai-improve** で当該キャラの立ち回りを改善する:
   - `node sim/cli.js auto --hchar <weak> --cchar <strong>` で数ゲーム観戦し、
     ai-improve の Phase 1 #4（固有スキルのタイミング適切性・布石）/ #5（相手キャラ考慮）の
     監査表で悪手を特定（例: 割引前に固有スキル即撃ち、効果範囲に対象がいないのに発動、布石を打たない）。
   - 修正案を `sim/ai.js`（+ `src/AIPlayer.ts` にミラー）に最小変更で適用。
   - **サイド検証（必須）:** 当該キャラの総合勝率を同一シードで改修前後比較
     （`metrics --seed 1` の `charWinRate.<weak>`、必要なら `sim --pair <weak>,<strong>`）。
     **そのキャラの勝率が上がったときだけ残す。上がらなければ撤回**し、ai-improve の
     「検証済みルールのログ」に却下として記録（同じ案の再試行を防ぐ）。
   - AI 改善で是正できた → そのイテレーションは完了。まだ外れ値で弱い／AI 側に伸び代が
     尽きた場合に限り、次の **4** のバランス調整（life/コスト等）へ進む。
4. **Hypothesize one change.** Smallest knob that should move that metric. Change
   ONE thing at a time so effects are attributable.
5. **Apply** to the relevant `sim/` file.
6. **Re-measure.** Same `metrics`/`bench` command + seed; `--tag <change>` to log.
7. **Decide.** Keep if the target metric improved AND no other target regressed
   past its threshold; otherwise revert. Note the result.
8. **Repeat** from 2 until targets met or no further improvement (cap ~6
   iterations unless the user says otherwise).
9. **Mirror to the real game.** For each kept change, apply the equivalent edit to
   `src/` (lifeMeans → `src/util.ts` `calculateLife`; skillCosts →
   `src/components/game/skillCosts.ts`; turn order → `Game.tsx`; AI →
   `AIPlayer.ts` / its callbacks). Keep `sim/` and `src/` in sync.
10. **Report.** Summarize baseline → final metrics, which changes were kept/reverted
   and why, and append findings to `sim/BALANCE.md`.

## Targets (defaults; adjust to the user's intent)

| metric | target | rationale |
|---|---|---|
| `giantGap` | within ±0.10 of 0 | every character should be viable |
| `nonGiantSpread` | 0.03–0.15 | distinct but not dominant characters |
| `firstAdvantage` | ≤ 0.05 | fairness between first/second |
| `drawRate` | ≤ 0.55 | games should resolve |
| AI strength (`bench`) | faithful win-ex-draw vs random ≥ 0.90 | AI not braindead |

## Critical context (current AI — verified from source)

The AI was substantially reworked; it is **no longer** a plain 4-in-a-row player.
(The old "skills are no-ops / never captures / giant is weakest" notes are obsolete.)

- **The AI uses skills.** `makeMove`/`chooseSkills` (src `AIPlayer.ts`) and
  `faithfulMakeMove`/`chooseSkills` (sim) actually fire them: character signatures
  (巨人ストンプ, 魔法使い審判の日, 軍師全軍突撃, ネクロ蘇生, 陰陽凶荒の舞) + トークン/
  バッズ/ロック等. ストンプ/審判は2段階(マス選択)スキル。Game.tsx は
  `executeSkillForAI` + `pendingAIMove`(複数クリック=ロック/ストンプ対象→着手)で実行。
- **The AI captures.** `getBestMove`/`getEnhancedBestMove` は空きマス+bind0敵
  (巨人・蘇生中ネクロは bind>0 敵も)を列挙し、捕獲ボーナス+30。⇒ life/bind は
  結果に効く(捕獲・巨人の bind>0 攻撃・ネクロの bind0 吸収)。「bind0で結果が変わらない」は過去の話。
- **スキルプールは永続＋プレイヤー別ロック。** `s.skills` が手番を跨いで持続し、
  各手番その人の `heart/circleLockedSkills` を残して再シャッフル。AIは `chooseLocks`
  でロック(採用: あなた/軍師/ネクロ。巨人/魔法/陰陽は無効化)。守備が要る時は解除して引き直す。
- **テンポ/レース強化(採用, +8pt):** フォーク+200 / シングルリーチ+40 で先取りを急ぐ。
- **Giant is now strong** (ストンプ解禁で上位)。`giantGap` は負(giant が平均超)になりうる。
- **魔法使いコンセプト:** 自陣バッズ1個=魔力+3、審判はスキル使用回数でコスト逓減。
- 既知バグ修正済み: 円(後手)の魔力が自分基準で計算される(以前は先手の値で上書き)。
- 相手キャラはAIに渡してある(`opponentCharacter`/sim は `s.heart/circleChar`)が、
  挙動補正は現状なし(対ネクロ破壊回避はA/Bで却下)。

AI関数: sim `getEnhancedBestMove`/`chooseSkills`/`chooseLocks`/`minimax`(深さ3)/`faithfulMakeMove`
↔ src `getBestMove`/`chooseSkills`/`chooseLocks`/`minimax`/`makeMove`。
**片方を変えたら必ずもう片方にミラー。** 検証で採用/却下したルールは
`.claude/skills/ai-improve/SKILL.md` の「検証済みルールのログ」を参照(同じ案の再試行を避ける)。
