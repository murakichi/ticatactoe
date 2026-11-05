// 自動生成: src/components/game/placement.ts (node scripts/gen-sim-shared.js)。手で編集しない。
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.absorbDefeated = exports.resolvePlacement = void 0;
const util_1 = require("./util");
const turn_1 = require("./turn");
const poison_1 = require("./poison");
/**
 * cell（減衰を済ませた後のマス）に player が life で着手した結果。
 * - 自分のコマ: 強化（ライフ+life+1。式神は🌱付きの自陣コマになる）
 * - 敵のコマ: ライフの差で奪取/破壊/攻撃。式神は乗っ取られると空きマスになる
 * - 空きマス: ライフ life のコマ。置かれた🔥は引き継ぐ
 * @param asObject 敵のオブジェクト（ライフ0）を乗っ取るとき、自分のオブジェクトとして奪う（false は自陣の通常のコマとして置き換える）。ライフは life
 */
const resolvePlacement = (cell, player, life, asObject = false) => {
    if (cell.player === player && (0, util_1.isObject)(cell)) {
        // 自陣のオブジェクトは、いつでも通常のコマで乗っ取れる（オブジェクトは消えて、ライフ life のコマになる。設置数の制限は無い）
        return { square: { player, bind: life, effects: [...cell.effects] }, poisonSpread: false, corpse: false, reinforced: false };
    }
    if (cell.player === player) {
        // 式神を自分で補強すると、式神ではなく🌱付きの自陣コマになる
        const effects = (0, util_1.isShikigami)(cell) ? [...cell.effects.filter((e) => e.effect !== '📜'), { effect: '🌱' }] : [...cell.effects];
        return { square: { player, bind: cell.bind + life + 1, effects }, poisonSpread: false, corpse: false, reinforced: true };
    }
    if (cell.player && cell.object && cell.bind > 0 && cell.bind - life + 1 <= 0) {
        // 敵のオブジェクトはライフが0でないと乗っ取れない。ライフを削り切る攻撃（巨人・満杯の盤面）でも、ライフが0になるだけでオブジェクトは残る
        return { square: { player: cell.player, bind: 0, effects: [], object: cell.object }, poisonSpread: false, corpse: false, reinforced: false };
    }
    if (cell.player) {
        const calc = cell.bind - life + (cell.bind > 0 ? 1 : 0);
        let owner = cell.player;
        let bind = calc;
        let capturedFrom;
        if (calc < 0) {
            owner = player;
            bind = -calc;
            capturedFrom = cell.player;
        }
        else if (calc === 0) {
            owner = undefined;
            bind = 0;
        }
        // 式神は乗っ取られると空きマスになる（コマは置かれない）
        if ((0, util_1.isShikigami)(cell) && calc < 0) {
            owner = undefined;
            bind = 0;
            capturedFrom = undefined;
        }
        // 敵のオブジェクトはライフが0になって初めて乗っ取れる。ライフが残る攻撃（巨人・満杯の盤面）ではオブジェクトのまま。乗っ取るとオブジェクトは消え、持ち主の効果は引き継がない
        const kept = (owner === cell.player || (asObject && owner === player)) && cell.object ? { object: cell.object } : {};
        return { square: { player: owner, bind, effects: [], ...kept }, capturedFrom, poisonSpread: calc <= 0 && (0, poison_1.activePoison)(cell) > 0, corpse: calc <= 0, reinforced: false };
    }
    return { square: { player, bind: life, effects: cell.effects.filter((e) => e.effect === '🔥') }, poisonSpread: false, corpse: false, reinforced: false };
};
exports.resolvePlacement = resolvePlacement;
/** 蘇生発動中: ライフ0の敵コマ（🔑ロック中を除く）を自陣に吸収する。吸収したマスと元の持ち主を返す。board を直接書き換える */
const absorbDefeated = (board, player) => {
    const absorbed = [];
    board.forEach((sq, k) => {
        if (sq.player && sq.player !== player && sq.bind === 0 && !sq.effects.some((e) => e.effect === '🔑')) {
            absorbed.push({ cell: k, from: sq.player });
            board[k] = { player, bind: turn_1.NECROMANCY.reviveLife, effects: [] };
        }
    });
    return absorbed;
};
exports.absorbDefeated = absorbDefeated;
