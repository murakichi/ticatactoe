'use strict';
// src/components/game/comboCost.ts の複製（ヘッドレス版）。comboCost.test.ts が一致を確認する。
const COMBO_CUT = 2;
const CHARGE_GRANT_KEYS = new Set(['onClickChargeToken', 'onClickDoubleChargeToken', 'onClickChargeOne', 'onClickChargeArea', 'onClickChargeRandom', 'onClickChargeSpread']);
const countOwn = (board, player, effect) => board.reduce((n, sq) => (sq.player === player ? n + sq.effects.filter((e) => e.effect === effect).length : n), 0);
const boardEffectCount = (board) => board.reduce((n, sq) => n + sq.effects.filter((e) => e.effect !== '📜').length, 0);
const ownLeaves = (board, player) => countOwn(board, player, '🍂');
const ownCharges = (board, player) => countOwn(board, player, '⚡');
const comboCut = (skillKey, board, player, leafBase, kinds) => {
    if (skillKey === 'onClickDoubleLeafToken') return ownLeaves(board, player) > leafBase ? COMBO_CUT : 0;
    if (skillKey === 'onClickBristle') return Array.from(kinds).some((k) => CHARGE_GRANT_KEYS.has(k)) ? COMBO_CUT : 0;
    if (skillKey === 'onClickChargeSeason') return ownCharges(board, player) === 0 ? COMBO_CUT : 0;
    if (skillKey === 'onClickDarkPot') return boardEffectCount(board);
    return 0;
};
module.exports = { COMBO_CUT, CHARGE_GRANT_KEYS, ownLeaves, ownCharges, boardEffectCount, comboCut };
