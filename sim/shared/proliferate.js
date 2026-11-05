// 自動生成: src/components/game/proliferate.ts (node scripts/gen-sim-shared.js)。手で編集しない。
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.proliferateStep = void 0;
const util_1 = require("./util");
const poison_1 = require("./poison");
const turn_1 = require("./turn");
/** 1ループ分を board に適用する（追加できなければ null。回数を進めない）。毒を付けたマスの毒花は呼び出し側が処理する。board を直接書き換える */
const proliferateStep = (board, step, player, character, chars, rng = Math.random, tokenLife = turn_1.PROLIFERATE.tokenLife) => {
    const pick = (cells) => cells[Math.floor(rng() * cells.length)];
    if (step % 2 === 1) {
        const empties = (0, util_1.findEmptyIndexes)(board);
        if (empties.length === 0)
            return null;
        const cell = pick(empties);
        board[cell] = { player, bind: tokenLife, effects: [] };
        return { cell, added: 'piece' };
    }
    // 毒使いだけは敵コマへの毒がアイテムになる（毒拡散パッシブとつながる）
    const isPoisoner = character === 'poisoner';
    const targets = board
        .map((_, idx) => idx)
        .filter((idx) => {
        const sq = board[idx];
        if (sq.effects.some((e) => e.effect === '🔑'))
            return false;
        return isPoisoner ? !!sq.player && sq.player !== player : sq.player === player;
    });
    if (targets.length === 0)
        return null;
    const cell = pick(targets);
    const item = isPoisoner ? { effect: '☠' } : { effect: '🌱' };
    board[cell] = { ...board[cell], effects: [...board[cell].effects, item] };
    if (isPoisoner)
        board[cell] = (0, poison_1.poisonStrike)(board[cell], chars);
    return { cell, added: item.effect };
};
exports.proliferateStep = proliferateStep;
