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
