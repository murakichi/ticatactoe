// 自動生成: src/components/game/deadlock.ts (node scripts/gen-sim-shared.js)。手で編集しない。
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.breakDeadlock = exports.isDeadlocked = exports.DEADLOCK_ROUNDS = void 0;
const thermal_1 = require("./thermal");
/** 着手が全く無いまま、この周回数だけ手番が回ったら膠着とみなす */
exports.DEADLOCK_ROUNDS = 3;
/** 最後に着手があった手番から数えて、膠着か */
const isDeadlocked = (currentTurn, lastPlacementTurn, seatCount) => currentTurn - lastPlacementTurn >= exports.DEADLOCK_ROUNDS * seatCount;
exports.isDeadlocked = isDeadlocked;
/** 膠着の打開: 氷結のマスは❄を1つ解き、🔑ロックのマスはロックの残りライフを1減らす（0で外れる）。変わったマスを返す。board を直接書き換える */
const breakDeadlock = (board) => {
    const changed = [];
    board.forEach((sq, k) => {
        let next = sq;
        if (next.effects.some((e) => e.effect === '❄'))
            next = (0, thermal_1.thawOne)(next);
        if (next.effects.some((e) => e.effect === '🔑')) {
            const bind = Math.max(0, next.bind - 1);
            next = { ...next, bind, effects: bind === 0 ? next.effects.filter((e) => e.effect !== '🔑') : next.effects };
        }
        if (next !== sq) {
            board[k] = next;
            changed.push(k);
        }
    });
    return changed;
};
exports.breakDeadlock = breakDeadlock;
