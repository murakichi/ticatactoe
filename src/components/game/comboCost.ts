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

/** 盤面（空きマスも含む）に乗っているエフェクトの総数。式神の印(📜)は数えない */
export const boardEffectCount = (board: SquareInfo[]): number =>
    board.reduce((n, sq) => n + sq.effects.filter((e) => e.effect !== '📜').length, 0);

/** 吹き寄せの軽減: 1エフェクトにつき */
export const GATHER_CUT = 2;
/** 山焼きの軽減: 1エフェクトにつき */
export const BURN_OFF_CUT = 3;

/** 吹き寄せ・山焼きの軽減に数えるエフェクトの数。氷結(❄)のあるマスは❄の数だけ（同じマスの他のエフェクトは数えない）。
 *  それ以外のマスはエフェクトを全部数えるが、🔑ロック自体と式神の印📜は数えない（ロックのマスの他のエフェクトは数える） */
export const reduceCount = (board: SquareInfo[]): number =>
    board.reduce((n, sq) => {
        if (sq.effects.some((e) => e.effect === '❄')) return n + sq.effects.filter((e) => e.effect === '❄').length;
        return n + sq.effects.filter((e) => e.effect !== '📜' && e.effect !== '🔑').length;
    }, 0);

/** 焚きつけ: 盤面（敵味方とも）の🍂1枚につき3、🌱1つにつき2だけ軽減する */
export const KINDLING_LEAF_CUT = 3;
export const KINDLING_BUD_CUT = 2;

/** 盤面のエフェクト effect の総数（敵味方・空きマスとも。休眠中も数える） */
const effectCount = (board: SquareInfo[], effect: '🍂' | '🌱'): number =>
    board.reduce((n, sq) => n + sq.effects.filter((e) => e.effect === effect).length, 0);

/** 盤面にあるコマの数（敵味方とも） */
export const boardPieceCount = (board: SquareInfo[]): number => board.filter((sq) => !!sq.player).length;

/** player のコマに乗っている⚡の総数 */
export const ownCharges = (board: SquareInfo[], player: Player): number => countOwn(board, player, '⚡');

/**
 * 手番の席が払うスキルの導線による軽減額（成立しなければ 0）
 * - 紅葉狩り: この手番、自陣の🍂が手番開始時（leafBase）より増えていれば
 * - 総毛立つ: この手番に⚡を付与するスキルを使っていれば（kinds=手番内に使ったスキルの種類）
 * - 静電気の季節: 自陣に⚡が1つもなければ
 * - 一寸先は闇鍋: 盤面のエフェクトの数だけ（カウント型）
 * - 一寸の虫に魂なし: 盤面のコマの数だけ（敵味方とも。カウント型）
 * - 焚きつけ: 盤面の🍂1枚につき3、🌱1つにつき2（カウント型。敵味方とも）
 * - 雷を食らわば皿まで: この手番に付与した⚡の数だけ（自陣の⚡が手番開始時 chargeBase より増えたぶん。撃つと基準がリセットされる）
 */
export const comboCut = (skillKey: string | undefined, board: SquareInfo[], player: Player, leafBase: number, kinds: ReadonlySet<string>, chargeBase: number = 0): number => {
    if (skillKey === 'onClickDoubleLeafToken') return ownLeaves(board, player) > leafBase ? COMBO_CUT : 0;
    if (skillKey === 'onClickBristle') return Array.from(kinds).some((k) => CHARGE_GRANT_KEYS.has(k)) ? COMBO_CUT : 0;
    if (skillKey === 'onClickChargeSeason') return ownCharges(board, player) === 0 ? COMBO_CUT : 0;
    if (skillKey === 'onClickDarkPot') return boardEffectCount(board);
    if (skillKey === 'onClickKindling') return KINDLING_LEAF_CUT * effectCount(board, '🍂') + KINDLING_BUD_CUT * effectCount(board, '🌱');
    if (skillKey === 'onClickSmallFry') return boardPieceCount(board);
    if (skillKey === 'onClickGather') return GATHER_CUT * reduceCount(board);
    if (skillKey === 'onClickBurnOff') return BURN_OFF_CUT * reduceCount(board);
    if (skillKey === 'onClickChargeHeal') return Math.max(0, ownCharges(board, player) - chargeBase);
    return 0;
};

/** 軽減の下限が1のスキル（カウント型で、軽減しきると0円になってしまうもの） */
export const comboFloor = (skillKey: string | undefined): number => (skillKey === 'onClickDarkPot' || skillKey === 'onClickChargeHeal' || skillKey === 'onClickSmallFry' || skillKey === 'onClickGather' || skillKey === 'onClickBurnOff' || skillKey === 'onClickKindling' ? 1 : 0);
