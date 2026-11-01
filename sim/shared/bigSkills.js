// 自動生成: src/components/game/bigSkills.ts (node scripts/gen-sim-shared.js)。手で編集しない。
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.perfectGame = exports.placeHelperToken = exports.pickHelperEffect = exports.HELPER_EFFECTS = exports.SECOND_CATCH_MAX_BASE = exports.BIG_CAST_BASE = void 0;
const charge_1 = require("./charge");
const poison_1 = require("./poison");
const thermal_1 = require("./thermal");
/** 柳の下に二匹目がいた: 手番内にベースコストがこの値以上のスキルを使っていれば0コスト */
exports.BIG_CAST_BASE = 7;
/** 柳の下に二匹目がいた: 自分のデッキから発動するスキルのベースコストの上限 */
exports.SECOND_CATCH_MAX_BASE = 5;
/** 超助っ人のトークンに付くエフェクト（1つ、ランダム） */
exports.HELPER_EFFECTS = ['🔥', '❄', '⚡', '☠', '🌱', '🍂'];
/** ランダムなエフェクトを選ぶ（乱数は1回） */
const pickHelperEffect = (rng) => exports.HELPER_EFFECTS[Math.floor(rng() * exports.HELPER_EFFECTS.length)];
exports.pickHelperEffect = pickHelperEffect;
/**
 * 超助っ人: idx に、effect を1つ付けた player のトークン（ライフ bind）を置く。board を直接書き換える。
 * 🔥は付いた瞬間の1ダメージと縦横隣の氷結の解除（placeFlameToken）、⚡は乗った時点のダメージ（雷霆の巫以外）、☠は毒使いのライフ1.5倍が掛かる。
 * 解けた氷結のマスを返す
 */
const placeHelperToken = (board, idx, player, bind, effect, chars, size) => {
    switch (effect) {
        case '🔥':
            return { thawed: (0, thermal_1.placeFlameToken)(board, idx, player, bind, size) };
        case '❄':
            (0, thermal_1.placeFrostToken)(board, idx, player, bind);
            return { thawed: [] };
        case '🍂':
            (0, thermal_1.placeLeafToken)(board, idx, player, bind, 1);
            return { thawed: [] };
        case '⚡':
            board[idx] = (0, charge_1.landCharge)({ player, bind, effects: [{ effect: '⚡' }] }, chars);
            return { thawed: [] };
        case '☠':
            board[idx] = (0, poison_1.poisonStrike)({ player, bind, effects: [{ effect: '☠' }] }, chars);
            return { thawed: [] };
        default:
            board[idx] = { player, bind, effects: [{ effect: '🌱' }] };
            return { thawed: [] };
    }
};
exports.placeHelperToken = placeHelperToken;
/**
 * パーフェクトゲーム: 盤面のコマを敵味方とも全て破壊する（board を直接書き換える）。
 * 🔑ロック中・雷霆の巫の⚡で無敵のコマは壊れず、氷結中のコマは❄が1つ減るだけ（absorbDestroy）。壊したマスと、氷結が身代わりになったマスを返す
 */
const perfectGame = (board, chars) => {
    const destroyed = [];
    const blocked = [];
    board.forEach((sq, k) => {
        if (!sq.player || (0, charge_1.isGuarded)(sq, chars))
            return;
        const guard = (0, thermal_1.absorbDestroy)(sq);
        if (guard.blocked) {
            board[k] = guard.sq;
            blocked.push(k);
            return;
        }
        board[k] = { player: undefined, bind: 0, effects: [] };
        destroyed.push(k);
    });
    return { destroyed, blocked };
};
exports.perfectGame = perfectGame;
