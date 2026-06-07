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
