// 自動生成: src/components/game/giantTurn.ts (node scripts/gen-sim-shared.js)。手で編集しない。
"use strict";
// 巨人は「GIANT_ACT_EVERY ラウンドに1回」しか行動しない。
// 手番の並びは「全員が1周 → 巨人を除いて (GIANT_ACT_EVERY-1) 周」の繰り返し。
// 並びは currentTurn だけで決まる（judgeNextSeat が何度呼ばれても同じ答えになる）。
// sim は judgeNextSeat からこの seatForTurn を直接呼ぶ（A/B 検証では actEvery だけ上書きする）。
Object.defineProperty(exports, "__esModule", { value: true });
exports.seatForTurn = exports.GIANT_ACT_EVERY = void 0;
/** 巨人が何ラウンドに1回行動するか（2 なら2ターンに1回） */
exports.GIANT_ACT_EVERY = 2;
/**
 * これから動く席。
 * @param currentTurn Game の currentTurn（これから始まる手番の番号。1手目は1）
 * @param characters 席順のキャラ（'giant' を含むか見る）
 * @param prevSeat 直前に動いた席。並びとずれているとき（途中から始めた盤など）は席順どおり次の席にする
 * @param actEvery 巨人が何ラウンドに1回動くか（1以下なら休みなし）
 */
const seatForTurn = (currentTurn, characters, prevSeat, actEvery = exports.GIANT_ACT_EVERY) => {
    const n = characters.length;
    if (currentTurn <= 1)
        return 0;
    const roundRobin = (prevSeat + 1) % n;
    // 2人戦で同キャラ（巨人ミラー含む）は休みなしで交互に回す
    const mirror = n === 2 && characters[0] === characters[1];
    const others = characters.map((c, seat) => (c === 'giant' ? -1 : seat)).filter((seat) => seat >= 0);
    if (mirror || actEvery <= 1 || others.length === n || others.length === 0)
        return roundRobin;
    const cycle = characters.map((_, seat) => seat);
    for (let k = 1; k < actEvery; k++)
        cycle.push(...others);
    if (cycle[(currentTurn - 2) % cycle.length] !== prevSeat)
        return roundRobin;
    return cycle[(currentTurn - 1) % cycle.length];
};
exports.seatForTurn = seatForTurn;
