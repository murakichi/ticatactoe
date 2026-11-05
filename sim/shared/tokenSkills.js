// 自動生成: src/components/game/tokenSkills.ts (node scripts/gen-sim-shared.js)。手で編集しない。
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.gather = exports.burnOff = exports.burnOffTargets = exports.firstFrost = exports.firstFrostTargets = exports.FIRST_FROST_FREE_LEAVES = void 0;
const charge_1 = require("./charge");
const thermal_1 = require("./thermal");
/** 初霜: 盤面の🍂（効力のあるもの）がこの枚数以上ならコスト0 */
exports.FIRST_FROST_FREE_LEAVES = 3;
const hasEffect = (sq, effect) => sq.effects.some((e) => e.effect === effect);
/** 初霜の対象: 使用者以外のコマのうち、🍂があり、🔑ロック・⚡無敵でなく、氷結を付けられるもの（昇順） */
const firstFrostTargets = (board, player, chars) => board.map((sq, i) => (sq.player && sq.player !== player && (0, thermal_1.leafStacks)(sq) > 0 && !(0, charge_1.isGuarded)(sq, chars) && (0, thermal_1.canFreeze)(sq) ? i : -1)).filter((i) => i !== -1);
exports.firstFrostTargets = firstFrostTargets;
/** 初霜: 対象を全て凍結する（バッズトークンの設置は呼び出し側）。凍結したマスを返す。board を直接書き換える */
const firstFrost = (board, player, chars) => (0, thermal_1.freeze)(board, (0, exports.firstFrostTargets)(board, player, chars));
exports.firstFrost = firstFrost;
/** 山焼きの対象: 使用者以外のコマのうち、🔑・📜以外のエフェクトがあり、氷結中でも⚡無敵でもないもの（🔑ロックのマスの他のエフェクトは対象）（昇順） */
const burnOffTargets = (board, player, chars) => board
    .map((sq, i) => (sq.player && sq.player !== player && sq.effects.some((e) => e.effect !== '📜' && e.effect !== '🔑') && !hasEffect(sq, '❄') && !(0, charge_1.isShielded)(sq, chars) ? i : -1))
    .filter((i) => i !== -1);
exports.burnOffTargets = burnOffTargets;
/** 山焼き: 対象全てに🔥を1つ付ける（ロック付きトークンの設置は呼び出し側）。実際に🔥が増えたマス数・解けた氷結・破壊されたマスを返す。board を直接書き換える */
const burnOff = (board, player, chars, size, keepBuds) => {
    const cells = (0, exports.burnOffTargets)(board, player, chars);
    const owners = board.map((sq) => sq.player);
    const before = cells.reduce((n, k) => n + (0, thermal_1.flameStacks)(board[k]), 0);
    const { thawed } = (0, thermal_1.ignite)(board, cells, size, 1, keepBuds);
    const flames = cells.reduce((n, k) => n + (0, thermal_1.flameStacks)(board[k]), 0) - before;
    const destroyed = cells.filter((k) => owners[k] && !board[k].player);
    return { cells, flames, destroyed, thawed };
};
exports.burnOff = burnOff;
/** 吹き寄せ: 空きマス token にトークン（tokenSq: 持ち主とライフ）を置き、盤面のエフェクト（token のマスに元からあったものを含む）を全部そのマスに集める。
 *  氷結(❄)のあるマスと⚡無敵のマスは動かさない。🔑ロックと式神の印📜はその場に残る。🔥は集め終えてから token のマスで処理する。
 *  移したエフェクトの数（🔥を含む）を返す。board を直接書き換える */
const gather = (board, token, tokenSq, chars, size, keepBuds) => {
    const moved = [];
    let flames = 0;
    board.forEach((sq, k) => {
        if ((0, charge_1.isShielded)(sq, chars) || hasEffect(sq, '❄'))
            return;
        const keep = [];
        for (const e of sq.effects) {
            if (e.effect === '📜' || e.effect === '🔑')
                keep.push(e);
            else if (e.effect === '🔥')
                flames++;
            else
                moved.push(e);
        }
        if (keep.length !== sq.effects.length)
            board[k] = { ...sq, effects: keep };
    });
    board[token] = { player: tokenSq.player, bind: tokenSq.bind, effects: moved };
    if (flames > 0)
        (0, thermal_1.ignite)(board, [token], size, flames, keepBuds);
    return moved.length + flames;
};
exports.gather = gather;
