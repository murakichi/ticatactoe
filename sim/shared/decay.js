// 自動生成: src/components/game/decay.ts (node scripts/gen-sim-shared.js)。手で編集しない。
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.crowdedDecay = exports.isCrowded = exports.CROWDED_DECAY_MIN_PLAYERS = exports.CROWDED_EMPTY_DIVISOR = exports.shouldDecay = exports.DECAY_PER_ROUND_MIN_PLAYERS = void 0;
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
