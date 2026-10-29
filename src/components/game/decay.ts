import { CharacterId } from '../../types/Character';
import { Player } from '../../types/Player';
import { SquareInfo } from '../../types/SquareInfo';
import { GEAR_PARAMS } from './gear';
import { burnDamageOf, decayTick, isEffectWarded } from './thermal';

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

export type DecayResult = {
    /** 🔥の継続ダメージを受けたマス（演出用） */
    burnCells: number[];
    /** 🔥でライフが0になって壊れたコマの数 */
    flameKills: number;
    /** 毒で消えたコマのマス（毒拡散の起点）。着手マス moveCell は除く */
    spreadOrigins: number[];
    /** 空蔵のロックが切れて、持ち主のコマが生えたマス */
    emptyLockSpawns: number[];
};

/**
 * ライフの減衰を盤面全体に1回進める（着手のたび、または手番が1周するごと。shouldDecay）。
 * 自然減衰・🔥の継続ダメージ・毒（氷結の扱いは thermal.ts の decayTick）、ロックの期限切れ、毒で0になったコマの消滅を行う。
 * 空蔵の持ち主が空きマスにかけたロックが切れたら、そのマスが持ち主のコマになる。board を直接書き換える（マスは新しく作って差し替える）。
 * @param moveCell この着手のマス（毒で消える扱いから外す。着手でないなら -1）
 */
export const decayBoard = (board: SquareInfo[], moveCell: number, chars: readonly CharacterId[], symbols: readonly Player[]): DecayResult => {
    const res: DecayResult = { burnCells: [], flameKills: 0, spreadOrigins: [], emptyLockSpawns: [] };
    for (let k = 0; k < board.length; k++) {
        const before = board[k];
        if (burnDamageOf(before, chars) > 0) res.burnCells.push(k);
        const sq = decayTick(before, chars);
        board[k] = sq;
        if (before.player && !sq.player) {
            res.flameKills++;
            continue;
        }
        const poison = isEffectWarded(sq) ? 0 : sq.effects.filter((e) => e.effect === '☠').length; // 術中の加護
        // 期限切れのロック。空蔵の持ち主が空きマスにかけたロックなら、そのマスが持ち主のコマになる
        const expiredLock = sq.bind === 0 ? sq.effects.find((e) => e.effect === '🔑') : undefined;
        if (sq.bind === 0) sq.effects = sq.effects.filter((e) => e.effect !== '🔑');
        if (expiredLock?.value != null && !sq.player) {
            board[k] = { player: symbols[expiredLock.value - 1], bind: GEAR_PARAMS.emptyLockLife, effects: [] };
            res.emptyLockSpawns.push(k);
            continue;
        }
        // 毒持ちのコマでライフが0のマスは消えて拡散の起点になる。「このターンに0へ落ちた」とは限らない: ライフ0のコマに後から毒を撒いた場合も消す
        if (poison > 0 && sq.bind === 0 && sq.player && k !== moveCell) {
            res.spreadOrigins.push(k);
            board[k] = { player: undefined, bind: 0, effects: [] };
        }
    }
    return res;
};
