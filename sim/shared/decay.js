// 自動生成: src/components/game/decay.ts (node scripts/gen-sim-shared.js)。手で編集しない。
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.decayBoard = exports.crowdedDecay = exports.isCrowded = exports.CROWDED_DECAY_MIN_PLAYERS = exports.CROWDED_EMPTY_DIVISOR = exports.shouldDecay = exports.DECAY_PER_ROUND_MIN_PLAYERS = void 0;
const gear_1 = require("./gear");
const thermal_1 = require("./thermal");
// ライフの減衰(各コマ -1・毒スタック分の追加減衰・ロックの解除)を進めるタイミング。
// 2人戦は従来どおり「着手のたび」。3人以上は人数が増えるほど1周あたりの減衰が増えてコマがすぐ0になる
// (issue #30)ので、「手番が1周するごとに1回」(= 着手 N 回につき1回)にする。
/** この人数以上のとき減衰を「1周につき1回」にする（それ未満は着手ごと） */
exports.DECAY_PER_ROUND_MIN_PLAYERS = 3;
/**
 * @param placements これまでの着手(盤面クリックでコマを置いた回数)。この着手を数える前の値
 * @param seatCount 参加人数
 * @param minPlayers 「1周につき1回」にする最小人数（sim が A/B 検証で上書きする。本番は既定のまま）
 */
const shouldDecay = (placements, seatCount, minPlayers = exports.DECAY_PER_ROUND_MIN_PLAYERS) => seatCount < minPlayers || placements % seatCount === 0;
exports.shouldDecay = shouldDecay;
/** 満杯の盤面: 置ける空きマスが盤面の 1/CROWDED_EMPTY_DIVISOR 以下(6x6なら6マス)だと、減衰のたびに自然減衰がもう1回かかる
 *  （誰もライフの残ったコマを殴れず、全員が動けなくなる膠着を崩す。しきい値 1マス→3マス→6マスで、6人戦の引き分けは 36→27→13/660） */
exports.CROWDED_EMPTY_DIVISOR = 6;
/** この人数以上のときだけ満杯の追加減衰を行う（2人戦は盤が小さく、満杯でも着手で崩れるため対象外） */
exports.CROWDED_DECAY_MIN_PLAYERS = 3;
/** 置ける空きマス（コマが無く、氷結・ロックで塞がれていない）が少なく、追加の自然減衰をかけるか */
const isCrowded = (board, seatCount) => seatCount >= exports.CROWDED_DECAY_MIN_PLAYERS && board.filter((sq) => !sq.player && !(0, thermal_1.emptyBlocked)(sq)).length <= Math.floor(board.length / exports.CROWDED_EMPTY_DIVISOR);
exports.isCrowded = isCrowded;
/** 満杯の追加減衰: コマ（と🔑ロック）のライフを1減らす。氷結中・ライフ0は対象外 */
const crowdedDecay = (sq) => (sq.player || sq.effects.some((e) => e.effect === '🔑')) && sq.bind > 0 && !(0, thermal_1.isFrozen)(sq) ? { ...sq, bind: sq.bind - 1 } : sq;
exports.crowdedDecay = crowdedDecay;
/**
 * ライフの減衰を盤面全体に1回進める（着手のたび、または手番が1周するごと。shouldDecay）。
 * 自然減衰・🔥の継続ダメージ・毒（氷結の扱いは thermal.ts の decayTick）、ロックの期限切れ、毒で0になったコマの消滅を行う。
 * 空蔵の持ち主が空きマスにかけたロックが切れたら、そのマスが持ち主のコマになる。board を直接書き換える（マスは新しく作って差し替える）。
 * @param crowded 満杯の盤面か（isCrowded）。自然減衰がもう1回かかる
 * @param moveCell この着手のマス（毒で消える扱いから外す。着手でないなら -1）
 */
const decayBoard = (board, moveCell, chars, symbols, crowded = false) => {
    const res = { burnCells: [], flameKills: 0, spreadOrigins: [], emptyLockSpawns: [] };
    for (let k = 0; k < board.length; k++) {
        const before = board[k];
        if ((0, thermal_1.burnDamageOf)(before, chars) > 0)
            res.burnCells.push(k);
        const sq = (0, thermal_1.decayTick)(crowded ? (0, exports.crowdedDecay)(before) : before, chars); // 満杯の盤面は自然減衰がもう1回
        board[k] = sq;
        if (before.player && !sq.player) {
            res.flameKills++;
            continue;
        }
        const poison = (0, thermal_1.isEffectWarded)(sq) ? 0 : sq.effects.filter((e) => e.effect === '☠').length; // 術中の加護
        // 期限切れのロック。空蔵の持ち主が空きマスにかけたロックなら、そのマスが持ち主のコマになる
        const expiredLock = sq.bind === 0 ? sq.effects.find((e) => e.effect === '🔑') : undefined;
        if (sq.bind === 0)
            sq.effects = sq.effects.filter((e) => e.effect !== '🔑');
        if ((expiredLock === null || expiredLock === void 0 ? void 0 : expiredLock.value) != null && !sq.player) {
            board[k] = { player: symbols[expiredLock.value - 1], bind: gear_1.GEAR_PARAMS.emptyLockLife, effects: [] };
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
exports.decayBoard = decayBoard;
