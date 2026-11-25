// 自動生成: src/components/game/ownSweep.ts (node scripts/gen-sim-shared.js)。手で編集しない。
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.medicineAndPoison = exports.witherAndSow = exports.ownSweepTargets = exports.MEDICINE_LIFE = void 0;
const poison_1 = require("./poison");
const thermal_1 = require("./thermal");
/** 良薬は口に毒: 自陣のコマ全てに足すライフ */
exports.MEDICINE_LIFE = 10;
const hasLock = (sq) => sq.effects.some((e) => e.effect === '🔑');
/** 対象: player のコマ（オブジェクトは除く）のうち、🔑ロック中でも❄氷結中でもないもの（昇順） */
const ownSweepTargets = (board, player) => board.map((sq, i) => (sq.player === player && sq.object === undefined && !hasLock(sq) && !(0, thermal_1.isFrozen)(sq) ? i : -1)).filter((i) => i !== -1);
exports.ownSweepTargets = ownSweepTargets;
/**
 * 枯れ木に花を咲かせましょう（🌱）/ 弱り目に落ち葉（🍂）: 対象のコマのライフを全て0にして、effect を1つ付ける。
 * ライフが残っていたコマの🔥は消える（zeroOut）。board を直接書き換える
 */
const witherAndSow = (board, cells, effect) => {
    for (const k of cells) {
        const z = (0, thermal_1.zeroOut)(board[k]);
        board[k] = { ...z, effects: [...z.effects, { effect }] };
    }
};
exports.witherAndSow = witherAndSow;
/** 良薬は口に毒: 対象のコマのライフを +MEDICINE_LIFE して、☠を1つ付ける（毒使いのコマは毒が付くとライフ1.5倍）。board を直接書き換える */
const medicineAndPoison = (board, cells, chars) => {
    for (const k of cells) {
        const sq = board[k];
        board[k] = (0, poison_1.poisonStrike)({ ...sq, bind: sq.bind + exports.MEDICINE_LIFE, effects: [...sq.effects, { effect: '☠' }] }, chars);
    }
};
exports.medicineAndPoison = medicineAndPoison;
