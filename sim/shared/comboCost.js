// 自動生成: src/components/game/comboCost.ts (node scripts/gen-sim-shared.js)。手で編集しない。
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.comboFloor = exports.comboCut = exports.ownCharges = exports.boardPieceCount = exports.reduceCount = exports.BURN_OFF_CUT = exports.GATHER_CUT = exports.boardEffectCount = exports.ownLeaves = exports.CHARGE_GRANT_KEYS = exports.COMBO_CUT = void 0;
/** 導線が成立したときの軽減額 */
exports.COMBO_CUT = 2;
/** 総毛立つの導線になる、⚡を付与するスキル（静電気の季節・総毛立つ自身・浄化などは含まない） */
exports.CHARGE_GRANT_KEYS = new Set([
    'onClickChargeToken', 'onClickDoubleChargeToken', 'onClickChargeOne', 'onClickChargeArea', 'onClickChargeRandom', 'onClickChargeSpread',
]);
const countOwn = (board, player, effect) => board.reduce((n, sq) => (sq.player === player ? n + sq.effects.filter((e) => e.effect === effect).length : n), 0);
/** player のコマに乗っている🍂の総数（休眠中も数える） */
const ownLeaves = (board, player) => countOwn(board, player, '🍂');
exports.ownLeaves = ownLeaves;
/** 盤面（空きマスも含む）に乗っているエフェクトの総数。式神の印(📜)は数えない */
const boardEffectCount = (board) => board.reduce((n, sq) => n + sq.effects.filter((e) => e.effect !== '📜').length, 0);
exports.boardEffectCount = boardEffectCount;
/** 吹き寄せの軽減: 1エフェクトにつき */
exports.GATHER_CUT = 2;
/** 山焼きの軽減: 1エフェクトにつき */
exports.BURN_OFF_CUT = 3;
/** 吹き寄せ・山焼きの軽減に数えるエフェクトの数。氷結(❄)のあるマスは❄の数だけ（同じマスの他のエフェクトは数えない）。
 *  それ以外のマスはエフェクトを全部数えるが、🔑ロック自体と式神の印📜は数えない（ロックのマスの他のエフェクトは数える） */
const reduceCount = (board) => board.reduce((n, sq) => {
    if (sq.effects.some((e) => e.effect === '❄'))
        return n + sq.effects.filter((e) => e.effect === '❄').length;
    return n + sq.effects.filter((e) => e.effect !== '📜' && e.effect !== '🔑').length;
}, 0);
exports.reduceCount = reduceCount;
/** 盤面にあるコマの数（敵味方とも） */
const boardPieceCount = (board) => board.filter((sq) => !!sq.player).length;
exports.boardPieceCount = boardPieceCount;
/** player のコマに乗っている⚡の総数 */
const ownCharges = (board, player) => countOwn(board, player, '⚡');
exports.ownCharges = ownCharges;
/**
 * 手番の席が払うスキルの導線による軽減額（成立しなければ 0）
 * - 紅葉狩り: この手番、自陣の🍂が手番開始時（leafBase）より増えていれば
 * - 総毛立つ: この手番に⚡を付与するスキルを使っていれば（kinds=手番内に使ったスキルの種類）
 * - 静電気の季節: 自陣に⚡が1つもなければ
 * - 一寸先は闇鍋: 盤面のエフェクトの数だけ（カウント型）
 * - 一寸の虫に魂なし: 盤面のコマの数だけ（敵味方とも。カウント型）
 * - 雷を食らわば皿まで: この手番に付与した⚡の数だけ（自陣の⚡が手番開始時 chargeBase より増えたぶん。撃つと基準がリセットされる）
 */
const comboCut = (skillKey, board, player, leafBase, kinds, chargeBase = 0) => {
    if (skillKey === 'onClickDoubleLeafToken')
        return (0, exports.ownLeaves)(board, player) > leafBase ? exports.COMBO_CUT : 0;
    if (skillKey === 'onClickBristle')
        return Array.from(kinds).some((k) => exports.CHARGE_GRANT_KEYS.has(k)) ? exports.COMBO_CUT : 0;
    if (skillKey === 'onClickChargeSeason')
        return (0, exports.ownCharges)(board, player) === 0 ? exports.COMBO_CUT : 0;
    if (skillKey === 'onClickDarkPot')
        return (0, exports.boardEffectCount)(board);
    if (skillKey === 'onClickSmallFry')
        return (0, exports.boardPieceCount)(board);
    if (skillKey === 'onClickGather')
        return exports.GATHER_CUT * (0, exports.reduceCount)(board);
    if (skillKey === 'onClickBurnOff')
        return exports.BURN_OFF_CUT * (0, exports.reduceCount)(board);
    if (skillKey === 'onClickChargeHeal')
        return Math.max(0, (0, exports.ownCharges)(board, player) - chargeBase);
    return 0;
};
exports.comboCut = comboCut;
/** 軽減の下限が1のスキル（カウント型で、軽減しきると0円になってしまうもの） */
const comboFloor = (skillKey) => (skillKey === 'onClickDarkPot' || skillKey === 'onClickChargeHeal' || skillKey === 'onClickSmallFry' || skillKey === 'onClickGather' || skillKey === 'onClickBurnOff' ? 1 : 0);
exports.comboFloor = comboFloor;
