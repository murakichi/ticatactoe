# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A tactical tic-tac-toe variant built with React 18 + TypeScript. Players compete on a 4x4 grid with fantasy characters (軍師, 魔法使い, 巨人, 陰陽師, ネクロマンサー), each having unique passive abilities and exclusive magic skills. Features an AI opponent.

## Commands

```bash
npm start    # Dev server (localhost:3000)
npm run build
npm test     # Jest in watch mode
```

## Architecture

**State management:** All game state is centralized in `Game.tsx` using React hooks (`useState`). No global state (Redux/Context). Historical board states are tracked for move replay.

**Board model:** Linear 16-element array (`SquareInfo[]`), index = row * 4 + col. Win condition is 4-in-a-row (rows, columns, diagonals).

**Data flow:**
- `App.tsx` — Character selection screen, passes selected characters to Game
- `Game.tsx` — Core game logic, state management, skill execution (~1000 lines)
- `Board.tsx` / `Square.tsx` — Grid rendering, click delegation
- `AIPlayer.ts` — Simple AI: checks win/block moves first, then uses skills, then random

**Magic system:** Players gain magic per turn, spend it on skills. Skill costs are defined in `src/types/skillCosts.ts`. Cost modifiers apply per character (e.g., Tactician gets -2 on token skills). Only 3 random skills available at a time (shuffleable for 1 cost).

## Key Types (src/types/)

- `Player`: `'⭕' | '💙'`
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
変わる保留**は `gh issue create` で issue にし、日記に番号を残す。

積んだ issue と積み残しは `/diary-improve-loop`（`/loop` から回す）が
1イテレーション1件ずつ拾って潰す。

## Deployment

`master` への push で `.github/workflows/deploy.yml` が走り、
GitHub Pages（https://murakichi.github.io/ticatactoe/）へ自動デプロイされる。
アセットは `/ticatactoe/` 配下に置かれる（`package.json` の `homepage`）。
CRA は `CI=true` だと警告もエラー扱いにするため、ワークフローでは `CI: false` を指定している。
