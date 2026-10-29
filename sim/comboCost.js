'use strict';
// src/components/game/comboCost.ts の複製（ヘッドレス版）。comboCost.test.ts が一致を確認する。
const COMBO_CUT = 2;
/** 吹き寄せ: 盤面のエフェクト1つにつきの軽減額 */
const GATHER_CUT = 2;
/** 山焼き: 軽減に数えるエフェクト1つにつきの軽減額 */
const BURN_OFF_CUT = 3;
const CHARGE_GRANT_KEYS = new Set(['onClickChargeToken', 'onClickDoubleChargeToken', 'onClickChargeOne', 'onClickChargeArea', 'onClickChargeRandom', 'onClickChargeSpread']);
const countOwn = (board, player, effect) => board.reduce((n, sq) => (sq.player === player ? n + sq.effects.filter((e) => e.effect === effect).length : n), 0);
const boardEffectCount = (board) => board.reduce((n, sq) => n + sq.effects.filter((e) => e.effect !== '📜').length, 0);
/** 吹き寄せ・山焼きの軽減に数えるエフェクトの数。氷結(❄)のあるマスは❄の数だけ（他のエフェクトは数えない）、🔑ロックのあるマスは無視（🔑も数えない）。式神の印📜は数えない */
const reduceCount = (board) => board.reduce((n, sq) => {
    if (sq.effects.some((e) => e.effect === '❄')) return n + sq.effects.filter((e) => e.effect === '❄').length;
    if (sq.effects.some((e) => e.effect === '🔑')) return n;
    return n + sq.effects.filter((e) => e.effect !== '📜').length;
}, 0);
const boardPieceCount = (board) => board.filter((sq) => !!sq.player).length;
const ownLeaves = (board, player) => countOwn(board, player, '🍂');
const ownCharges = (board, player) => countOwn(board, player, '⚡');
const comboCut = (skillKey, board, player, leafBase, kinds, chargeBase = 0) => {
    if (skillKey === 'onClickDoubleLeafToken') return ownLeaves(board, player) > leafBase ? COMBO_CUT : 0;
    if (skillKey === 'onClickBristle') return Array.from(kinds).some((k) => CHARGE_GRANT_KEYS.has(k)) ? COMBO_CUT : 0;
    if (skillKey === 'onClickChargeSeason') return ownCharges(board, player) === 0 ? COMBO_CUT : 0;
    if (skillKey === 'onClickDarkPot') return boardEffectCount(board);
    if (skillKey === 'onClickSmallFry') return boardPieceCount(board);
    if (skillKey === 'onClickGather') return GATHER_CUT * reduceCount(board);
    if (skillKey === 'onClickBurnOff') return BURN_OFF_CUT * reduceCount(board);
    if (skillKey === 'onClickChargeHeal') return Math.max(0, ownCharges(board, player) - chargeBase);
    return 0;
};
const comboFloor = (skillKey) => (skillKey === 'onClickDarkPot' || skillKey === 'onClickChargeHeal' || skillKey === 'onClickSmallFry' || skillKey === 'onClickGather' || skillKey === 'onClickBurnOff' ? 1 : 0);
module.exports = { COMBO_CUT, GATHER_CUT, BURN_OFF_CUT, CHARGE_GRANT_KEYS, ownLeaves, ownCharges, boardEffectCount, reduceCount, boardPieceCount, comboCut, comboFloor };
