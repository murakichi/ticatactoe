// 導線（条件付き軽減）の純粋ロジック。docs/skill-cost-rules.md の R7。sim/comboCost.js と同じ仕様（comboCost.test.ts が一致を確認）。
import { Player } from '../../types/Player';
import { SquareInfo } from '../../types/SquareInfo';

/** 導線が成立したときの軽減額 */
export const COMBO_CUT = 2;

/** 総毛立つの導線になる、⚡を付与するスキル（静電気の季節・総毛立つ自身・浄化などは含まない） */
export const CHARGE_GRANT_KEYS: ReadonlySet<string> = new Set([
    'onClickChargeToken', 'onClickDoubleChargeToken', 'onClickChargeOne', 'onClickChargeArea', 'onClickChargeRandom', 'onClickChargeSpread',
]);

const countOwn = (board: SquareInfo[], player: Player, effect: '🍂' | '⚡'): number =>
    board.reduce((n, sq) => (sq.player === player ? n + sq.effects.filter((e) => e.effect === effect).length : n), 0);

/** player のコマに乗っている🍂の総数（休眠中も数える） */
export const ownLeaves = (board: SquareInfo[], player: Player): number => countOwn(board, player, '🍂');

/** player のコマに乗っている⚡の総数 */
export const ownCharges = (board: SquareInfo[], player: Player): number => countOwn(board, player, '⚡');

/**
 * 手番の席が払うスキルの導線による軽減額（成立しなければ 0）
 * - 紅葉狩り: この手番、自陣の🍂が手番開始時（leafBase）より増えていれば
 * - 総毛立つ: この手番に⚡を付与するスキルを使っていれば（kinds=手番内に使ったスキルの種類）
 * - 静電気の季節: 自陣に⚡が1つもなければ
 */
export const comboCut = (skillKey: string | undefined, board: SquareInfo[], player: Player, leafBase: number, kinds: ReadonlySet<string>): number => {
    if (skillKey === 'onClickDoubleLeafToken') return ownLeaves(board, player) > leafBase ? COMBO_CUT : 0;
    if (skillKey === 'onClickBristle') return Array.from(kinds).some((k) => CHARGE_GRANT_KEYS.has(k)) ? COMBO_CUT : 0;
    if (skillKey === 'onClickChargeSeason') return ownCharges(board, player) === 0 ? COMBO_CUT : 0;
    return 0;
};
