# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A tactical 4-in-a-row game (title: 戦術四目並べ; repo name ticatactoe is historical) built with React 18 + TypeScript. 2–8 players compete on a grid (2 players = 4x4, up to 7x7 for 7–8 players) with fantasy characters (軍師, 魔法使い, 巨人, 陰陽師, ネクロマンサー), each having unique passive abilities and exclusive magic skills. Features an AI opponent.

## Commands

```bash
npm start    # Dev server (localhost:3000)
npm run build
npm test     # Jest in watch mode
```

## Architecture

**State management:** All game state is centralized in `Game.tsx` using React hooks (`useState`). No global state (Redux/Context). Per-player state (magic, lock, necro cost, …) is an array indexed by seat number (`useSeatArray`); seat order = turn order = `PLAYER_SYMBOLS` order. Historical board states are tracked for move replay.

**Board model:** Linear `size*size` array (`SquareInfo[]`), index = row * size + col. Size defaults from player count (`boardSizeFor` in `boardGeometry.ts`: 2→4, 3–4→5, 5–6→6, 7–8→7) but can be chosen freely 4–10 regardless of player count (`Game`'s `boardSize` prop, setup screen's マス数, `sim --size N`). Win condition is always 4 in a row (rows, columns, diagonals; any 4-cell window). Win lines and skill ranges (stomp / judge-day / diagonals) are generated per size by `geometryOf(size)` — don't hardcode 4x4 indexes. `sim/` (headless) supports 2–8 players too (`node sim/cli.js sim --players N`); its geometry is generated from `boardGeometry.ts`. From turn 50 every 50 turns, all games add +1 to the magic gained at turn start (`lateMagic.ts`, shared with `sim/engine.js`). Life decay runs once per round (every N placements) for 3+ players, per placement for 2 (`decay.ts`, shared with `sim/engine.js`).

**sim と本番の共有 (#289):** ルールの純粋ロジックと AI は `src/components/game/*.ts` が唯一の実装で、ヘッドレス `sim/` は `scripts/gen-sim-shared.js` が生成した `sim/shared/*.js`（コミットする）を使う。**共有対象の TS を直したら `node scripts/gen-sim-shared.js` を実行してコミットする**（`npm start/build` の前にも自動で走る。古いと `simShared.test.ts` が落ちる）。AIの1手番の計画（AIに渡す状態・返った結果の実行順・止まらないためのチャージ・着手マスが埋まったときの打ち直し）は `aiTurn.ts` の `planAITurn` / `resolveMoveCell` で、`Game.tsx` の `runAIMove` と `sim/aiDriver.js` が同じ関数を呼ぶ。sim の既定の `--mode prod` は本番AIそのもの。共有済みの規則: 実コスト(`cost.ts`)、手番開始の魔力・増殖・蘇生の定数(`turn.ts`)、毒(`poison.ts`)、ストンプ・審判の日(`blast.ts`)、式神(`shikigami.ts`)、サーマル系(`thermal.ts`)など。残る二重実装は `engine.js` と `Game.tsx` の「状態の持ち方と更新の順序」（スキルの支払い・フラグ・乱数）だけで、まだ両方に書いてあるスキルは盤面の計算を TS の純粋関数に出して両方から呼ぶ。新しい純粋ロジックは `Game.tsx`/`engine.js` の両方に書かず、TS の純粋関数に書いて両方から呼ぶ。旧 sim 版AI(`sim/ai.js`)は廃止予定で、新しいAI改修は `AIPlayer.ts` にだけ入れる。

**スキルのコスト:** スキルを新規に作る・コストを変えるときは、必ず `docs/skill-cost-rules.md` の基準（単価・複数付与の割引式・派手さと導線）で値を出す。基準から外すなら理由を日記に書く。

**ギア:** キャラ選択時に席ごとに装備する追加パッシブ(通常2枠、「あなた」だけ3枠)。定義と純粋関数は `src/components/game/gear.ts`(`GEAR_PARAMS` が数値の唯一の出典。説明文もここから描画)、ヘッドレス版は `sim/shared/gear.js`(生成物)。`PlayerConfig.gears` で `Game` に渡し、`Game.tsx` では `gearCost`(コスト補正) / `spendMagic`(幸運の財布・スキル使用数) / `applyLock` / `afterTokenPlaced` などが、`sim/engine.js` では `gearCost` / `spendMagic` / `applyLock` / `afterTokenPlaced` / `costsOf` が対応する。コスト表は席ごとに `costTableFor(seat)`(価格破壊で引き直す)から引き、`skillCosts` を直接参照しない。手番内のスキル使用数は `Game.tsx` では ref(`gearTurn`)、sim では `s.gearSkills` で持つ。ギアなしの試合は乱数を消費しないので従来と同じ結果になる。

**Data flow:**
- `App.tsx` — Setup screen (player count, per-seat character + gears + human/AI), passes `players: PlayerConfig[]` to Game
- `Game.tsx` — Core game logic, state management, skill execution (~1000 lines)
- `Board.tsx` / `Square.tsx` — Grid rendering, click delegation
- `AIPlayer.ts` — Simple AI: checks win/block moves first, then uses skills, then random. Takes all other seats as `opponents`; search depth shrinks with board size (3/2/1)
  - AI は自分のデッキを把握する: `AIPlayer` のコンストラクタ `deck`(`Game.tsx` が `deckBySeat[seat]` を渡す)、sim の `aiDriver.js` も `s.decks[seat]` を渡す。`inDeck(idx)`/`comboReachable()`で『引き直し・温存が報われるか』を判定し、陰陽師はコンボ札(71/73)がデッキに無ければ探索・温存しない。特売(53)が無ければコンボ計画は『特売が引ける前提』にしない。デッキ未指定は従来どおり全て引ける扱い

**Magic system:** Players gain magic per turn, spend it on skills. Skill costs are defined in `src/types/skillCosts.ts`. Cost modifiers apply per character (e.g., Tactician gets -2 on token skills). Only 3 random skills available at a time (shuffleable for 1 cost).

## Key Types (src/types/)

- `Player`: one of `PLAYER_SYMBOLS` (`'💙' | '⭕' | '🟩' | '🔶' | '⭐' | '🟣' | '🟫' | '🩷'`); `seatOf(player)` gives the seat index
- `CharacterId`: `'you' | 'tactician' | 'magician' | 'giant' | 'yinYangMaster' | 'necromancer'` etc.
- `SquareInfo`: `{ bind: number, player: Player | undefined, effects: Effect[] }`
- `Effect`: `{ effect: '🌱' | '🔑' | '☠', value?: number }`

## Conventions

- UI text is in Japanese; emoji symbols for players (💙 ⭕) and effects (🌱 🔑 ☠)
- Functional components with hooks only (no class components)
- Event handlers: `onClickXxx` or `exeXxx`; components: PascalCase
- Life values use normal distribution RNG (`normRand` in `util.ts`)

## Workflow

**作業のまとまりが終わったら、必ず作業日記を書く。** `/work-diary` を使い、
`docs/diary/YYYY-MM-DD.md`（Obsidian vault）に「なぜそう判断したか・何を測ったか・
何が残ったか」を残す。git log と diff で分かることは書かない。

積み残しのうち、**未検証のバランスリスク / スコープ外のバグ / 試行数を増やせば結論が
変わる保留**は `gh issue create` で issue にし、日記に番号を残す
（`gh` が使えないクラウドセッションでは GitHub MCP の `issue_write`（method=create）で起票する）。
**日記の「積み残し」に書いたものは、例外なく issue にも起票する**（日記だけに残さない）。

積んだ issue と積み残しは `/diary-improve-loop`（`/loop` から回す）が
1イテレーション1件ずつ拾って潰す。

拾う issue が尽きたら `/propose-game` で新スキル/新キャラを提案し、
採用基準を満たしたものだけ起票する（提案と実装は分ける。実装はループ側の仕事）。

**PR はオーナー確認なしでマージしてよい**（許可済み）。条件は CI がグリーンなこと。

## Deployment

`master` への push で `.github/workflows/deploy.yml` が走り、
GitHub Pages（https://murakichi.github.io/ticatactoe/）へ自動デプロイされる。
アセットは `/ticatactoe/` 配下に置かれる（`package.json` の `homepage`）。
CRA は `CI=true` だと警告もエラー扱いにするため、ワークフローでは `CI: false` を指定している。
