import { CharacterId } from '../../types/Character';
import { Player, seatOf } from '../../types/Player';
import { SquareInfo } from '../../types/SquareInfo';
import { isObject } from '../../types/ObjectKind';
import { GEAR_PARAMS } from './gear';
import { isLocked, lockStack, tickLock } from './lock';
import { sanctuaryProtected } from './objects';
import { burnDamageOf, decayParts, emptyBlocked, isEffectWarded, isFrozen } from './thermal';

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

/** 満杯の追加減衰: コマのライフを1減らし、🔑ロックのスタックも1減らす（切れるのは通常の減衰のとき）。氷結中・ライフ0・オブジェクトはライフが対象外 */
export const crowdedDecay = (sq: SquareInfo): SquareInfo => {
    const aged = sq.player && sq.bind > 0 && !isFrozen(sq) && !isObject(sq) ? { ...sq, bind: sq.bind - 1 } : sq;
    return lockStack(aged) > 1 ? tickLock(aged).sq : aged;
};
export type DecayResult = {
    /** 🔥の継続ダメージを受けたマス（演出用） */
    burnCells: number[];
    /** 🔥でライフが0になって壊れたコマの数 */
    flameKills: number;
    /** 毒で消えたコマのマス（毒拡散の起点）。着手マス moveCell は除く */
    spreadOrigins: number[];
    /** 空蔵のロックが切れて、持ち主のコマが生えたマス */
    emptyLockSpawns: number[];
    /** コマが受けたダメージの内訳(実際に減ったライフ)。natural=自然減衰(満杯の追加分を含む)、burn=🔥、poison=☠。ダメージの表示用 */
    damage: { cell: number; natural: number; burn: number; poison: number }[];
};

/**
 * ライフの減衰を盤面全体に1回進める（着手のたび、または手番が1周するごと。shouldDecay）。
 * 自然減衰・🔥の継続ダメージ・毒（氷結の扱いは thermal.ts の decayTick）、ロックの期限切れ、毒で0になったコマの消滅を行う。
 * 空蔵の持ち主が空きマスにかけたロックが切れたら、そのマスが持ち主のコマになる。board を直接書き換える（マスは新しく作って差し替える）。
 * @param crowded 満杯の盤面か（isCrowded）。自然減衰がもう1回かかる
 * @param moveCell この着手のマス（毒で消える扱いから外す。着手でないなら -1）
 */
export const decayBoard = (board: SquareInfo[], moveCell: number, chars: readonly CharacterId[], symbols: readonly Player[], crowded: boolean = false): DecayResult => {
    const res: DecayResult = { burnCells: [], flameKills: 0, spreadOrigins: [], emptyLockSpawns: [], damage: [] };
    const sanctuary = sanctuaryProtected(board); // 聖域に守られたマスは自然減衰（満杯の追加分も）を受けない
    for (let k = 0; k < board.length; k++) {
        const before = board[k];
        if (burnDamageOf(before, chars) > 0) res.burnCells.push(k);
        const crowdedBefore = crowded && !sanctuary[k] ? crowdedDecay(before) : before; // 満杯の盤面は自然減衰がもう1回
        const parts = decayParts(crowdedBefore, chars, !sanctuary[k]);
        const sq = parts.sq;
        board[k] = sq;
        // コマが受けたダメージ(自然減衰は満杯の追加分も含む)。ロックだけのマスは対象外
        if (before.player) {
            const natural = parts.natural + (before.bind - crowdedBefore.bind);
            if (natural + parts.burn + parts.poison > 0) res.damage.push({ cell: k, natural, burn: parts.burn, poison: parts.poison });
        }
        if (before.player && !sq.player) {
            res.flameKills++;
            continue;
        }
        const poison = isEffectWarded(sq) ? 0 : sq.effects.filter((e) => e.effect === '☠').length; // 術中の加護
        // 期限切れのロック。空蔵の持ち主が空きマスにかけたロックなら、そのマスが持ち主のコマになる
        const ticked = tickLock(sq);
        sq.effects = ticked.sq.effects;
        const expiredLock = ticked.expired;
        if (expiredLock?.owner != null && !sq.player) {
            board[k] = { player: symbols[expiredLock.owner - 1], bind: GEAR_PARAMS.emptyLockLife, effects: [] };
            res.emptyLockSpawns.push(k);
            continue;
        }
        // 毒持ちのコマでライフが0のマスは消えて拡散の起点になる。「このターンに0へ落ちた」とは限らない: ライフ0のコマに後から毒を撒いた場合も消す
        if (poison > 0 && sq.bind === 0 && sq.player && k !== moveCell && !isLocked(sq)) { // ロック中のコマは毒で消えない
            res.spreadOrigins.push(k);
            board[k] = { player: undefined, bind: 0, effects: [] };
        }
    }
    return res;
};

/**
 * ライフの残った敵コマに着手（攻撃）できるか。巨人はいつでも。満杯の盤面(isCrowded)では誰でも
 * （誰もライフの残ったコマを殴れず全員が動けなくなる膠着を崩す）
 */
export const canHitBound = (character: CharacterId | undefined, board: SquareInfo[], seatCount: number): boolean =>
    character === 'giant' || isCrowded(board, seatCount);

/**
 * 雷霆の巫のコマは、ライフが0になっても着手で奪われない（ライフの残ったコマと同じ扱い。巨人と満杯の盤面だけが奪える）。
 * ライフ0の自コマを敵に取られて列を完成されるのが負けの大半だったため（ユーザー指示 2026-11-05）
 */
export const isTakeProtected = (sq: SquareInfo, chars: readonly (CharacterId | undefined)[]): boolean =>
    !!sq.player && sq.bind <= 0 && chars[seatOf(sq.player)] === 'electrician';
