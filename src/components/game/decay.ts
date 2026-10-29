import { SquareInfo } from '../../types/SquareInfo';
import { emptyBlocked, isFrozen } from './thermal';

// ライフの減衰(各コマ -1・毒スタック分の追加減衰・ロックの解除)を進めるタイミング。
// 2人戦は従来どおり「着手のたび」。3人以上は人数が増えるほど1周あたりの減衰が増えてコマがすぐ0になる
// (issue #30)ので、「手番が1周するごとに1回」(= 着手 N 回につき1回)にする。

/** この人数以上のとき減衰を「1周につき1回」にする（それ未満は着手ごと） */
export const DECAY_PER_ROUND_MIN_PLAYERS = 3;

/**
 * @param placements これまでの着手(盤面クリックでコマを置いた回数)。この着手を数える前の値
 * @param seatCount 参加人数
 * @param minPlayers 「1周につき1回」にする最小人数（sim が A/B 検証で上書きする。本番は既定のまま）
 */
export const shouldDecay = (placements: number, seatCount: number, minPlayers: number = DECAY_PER_ROUND_MIN_PLAYERS): boolean =>
    seatCount < minPlayers || placements % seatCount === 0;

/** 満杯の盤面: 置ける空きマスが盤面の 1/CROWDED_EMPTY_DIVISOR 以下(6x6なら6マス)だと、減衰のたびに自然減衰がもう1回かかる
 *  （誰もライフの残ったコマを殴れず、全員が動けなくなる膠着を崩す。しきい値 1マス→3マス→6マスで、6人戦の引き分けは 36→27→13/660） */
export const CROWDED_EMPTY_DIVISOR = 6;

/** この人数以上のときだけ満杯の追加減衰を行う（2人戦は盤が小さく、満杯でも着手で崩れるため対象外） */
export const CROWDED_DECAY_MIN_PLAYERS = 3;

/** 置ける空きマス（コマが無く、氷結・ロックで塞がれていない）が少なく、追加の自然減衰をかけるか */
export const isCrowded = (board: SquareInfo[], seatCount: number): boolean =>
    seatCount >= CROWDED_DECAY_MIN_PLAYERS && board.filter((sq) => !sq.player && !emptyBlocked(sq)).length <= Math.floor(board.length / CROWDED_EMPTY_DIVISOR);

/** 満杯の追加減衰: コマ（と🔑ロック）のライフを1減らす。氷結中・ライフ0は対象外 */
export const crowdedDecay = (sq: SquareInfo): SquareInfo =>
    (sq.player || sq.effects.some((e) => e.effect === '🔑')) && sq.bind > 0 && !isFrozen(sq) ? { ...sq, bind: sq.bind - 1 } : sq;
