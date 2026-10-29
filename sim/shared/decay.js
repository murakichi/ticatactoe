// 自動生成: src/components/game/decay.ts (node scripts/gen-sim-shared.js)。手で編集しない。
"use strict";
// ライフの減衰(各コマ -1・毒スタック分の追加減衰・ロックの解除)を進めるタイミング。
// 2人戦は従来どおり「着手のたび」。3人以上は人数が増えるほど1周あたりの減衰が増えてコマがすぐ0になる
// (issue #30)ので、「手番が1周するごとに1回」(= 着手 N 回につき1回)にする。
Object.defineProperty(exports, "__esModule", { value: true });
exports.shouldDecay = exports.DECAY_PER_ROUND_MIN_PLAYERS = void 0;
/** この人数以上のとき減衰を「1周につき1回」にする（それ未満は着手ごと） */
exports.DECAY_PER_ROUND_MIN_PLAYERS = 3;
/**
 * @param placements これまでの着手(盤面クリックでコマを置いた回数)。この着手を数える前の値
 * @param seatCount 参加人数
 * @param minPlayers 「1周につき1回」にする最小人数（sim が A/B 検証で上書きする。本番は既定のまま）
 */
const shouldDecay = (placements, seatCount, minPlayers = exports.DECAY_PER_ROUND_MIN_PLAYERS) => seatCount < minPlayers || placements % seatCount === 0;
exports.shouldDecay = shouldDecay;
