# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A tactical tic-tac-toe variant built with React 18 + TypeScript. 2–8 players compete on a grid (2 players = 4x4, up to 7x7 for 7–8 players) with fantasy characters (軍師, 魔法使い, 巨人, 陰陽師, ネクロマンサー), each having unique passive abilities and exclusive magic skills. Features an AI opponent.

## Commands

```bash
npm start    # Dev server (localhost:3000)
npm run build
npm test     # Jest in watch mode
```

## Architecture

**State management:** All game state is centralized in `Game.tsx` using React hooks (`useState`). No global state (Redux/Context). Per-player state (magic, lock, necro cost, …) is an array indexed by seat number (`useSeatArray`); seat order = turn order = `PLAYER_SYMBOLS` order. Historical board states are tracked for move replay.

**Board model:** Linear `size*size` array (`SquareInfo[]`), index = row * size + col. Size comes from player count (`boardSizeFor` in `boardGeometry.ts`: 2→4, 3–4→5, 5–6→6, 7–8→7). Win condition is always 4 in a row (rows, columns, diagonals; any 4-cell window). Win lines and skill ranges (stomp / judge-day / diagonals) are generated per size by `geometryOf(size)` — don't hardcode 4x4 indexes. `sim/` (headless) supports 2–8 players too (`node sim/cli.js sim --players N`); its `geometry.js` duplicates `boardGeometry.ts` and a jest test keeps them equal. From turn 50 every 50 turns, all games add +1 to the magic gained at turn start (`lateMagic.ts`, mirrored in `sim/engine.js`). Life decay runs once per round (every N placements) for 3+ players, per placement for 2 (`decay.ts`, mirrored in `sim/engine.js`).

**Data flow:**
- `App.tsx` — Setup screen (player count, per-seat character + human/AI), passes `players: PlayerConfig[]` to Game
- `Game.tsx` — Core game logic, state management, skill execution (~1000 lines)
- `Board.tsx` / `Square.tsx` — Grid rendering, click delegation
- `AIPlayer.ts` — Simple AI: checks win/block moves first, then uses skills, then random. Takes all other seats as `opponents`; search depth shrinks with board size (3/2/1)

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
