// 自動生成: src/components/game/giantAura.ts (node scripts/gen-sim-shared.js)。手で編集しない。
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.giantAura = void 0;
const charge_1 = require("./charge");
const lock_1 = require("./lock");
const thermal_1 = require("./thermal");
/** board を直接書き換える（fireCharges と同じ）。me は巨人の持ち主、range は着手マスの周囲 */
const giantAura = (board, range, me, chars) => {
    const destroyed = [];
    const blocked = [];
    const locked = [];
    for (const j of range) {
        const sq = board[j];
        if (!sq.player || sq.player === me || (0, charge_1.isGuarded)(sq, chars))
            continue;
        const guard = (0, thermal_1.absorbDestroy)(sq);
        if (guard.blocked) {
            board[j] = guard.sq;
            blocked.push(j);
        }
        else {
            board[j] = { player: undefined, bind: 0, effects: [] };
            destroyed.push(j);
        }
    }
    for (const j of range) {
        const sq = board[j];
        if (!(0, thermal_1.lockable)(sq) || sq.effects.some((e) => e.effect === '🔑') || (0, charge_1.isShielded)(sq, chars))
            continue; // 帯電中の雷霆の巫のコマにはロックも付かない
        board[j] = (0, lock_1.addLock)(sq, Math.max(sq.bind, 1)); // 旧仕様（ライフが尽きるまで）と同じ長さのロック
        locked.push(j);
    }
    return { destroyed, blocked, locked };
};
exports.giantAura = giantAura;
