// 自動生成: src/components/game/graveSkills.ts (node scripts/gen-sim-shared.js)。手で編集しない。
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.graveOfferingTarget = exports.placeWardPiece = exports.wardPiece = exports.wardTriggered = exports.graveDiscountAmount = exports.corpseCount = exports.POISON_WARD_LIFE = exports.POISON_WARD_TURNS = exports.GRAVE_DISCOUNT_CAP = exports.NIGHT_VEIL_SURCHARGE = void 0;
const gear_1 = require("./gear");
const thermal_1 = require("./thermal");
/** 夜の帳: 次の相手全員の手番の間、相手のスキルコストに足す量 */
exports.NIGHT_VEIL_SURCHARGE = 3;
/** 弔い割引: 軽減する死体の数の上限 */
exports.GRAVE_DISCOUNT_CAP = 3;
/** 毒返しの構え: 続く手番数（使った手番の次の自分の手番から数えて、この回数目の手番の終わりまで）と、置くコマのライフ */
exports.POISON_WARD_TURNS = 3;
exports.POISON_WARD_LIFE = 4;
/** 墓地の死体の数（基礎コスト - 現在の墓地コスト） */
const corpseCount = (baseCost, necroCost) => Math.max(0, baseCost - necroCost);
exports.corpseCount = corpseCount;
/** 弔い割引の軽減量 */
const graveDiscountAmount = (corpses) => Math.min(exports.GRAVE_DISCOUNT_CAP, Math.max(0, corpses));
exports.graveDiscountAmount = graveDiscountAmount;
/** 毒返しの構えが発動する条件: 手番開始時の持ち主(before)に対し、player のコマが破壊された、または他の席に乗っ取られた */
const wardTriggered = (before, after, player) => (0, gear_1.lostCells)(before, after, player, null).length > 0;
exports.wardTriggered = wardTriggered;
/** 毒返しの構えで置くコマ（ライフ4・☠付き） */
const wardPiece = (player) => ({ player, bind: exports.POISON_WARD_LIFE, effects: [{ effect: '☠' }] });
exports.wardPiece = wardPiece;
/** 空きマスからランダムに1つ選んで置く。置いたマスを返す（空きが無ければ -1）。pick は候補から1つ選ぶ関数（乱数の持ち方が Game.tsx と sim で違うので渡す） */
const placeWardPiece = (board, player, pick) => {
    const empties = board.map((sq, i) => (!sq.player && !(0, thermal_1.emptyBlocked)(sq) ? i : -1)).filter((i) => i >= 0); // 氷結中の空きマスには置けない
    if (empties.length === 0)
        return -1;
    const at = pick(empties);
    board[at] = (0, exports.wardPiece)(player);
    return at;
};
exports.placeWardPiece = placeWardPiece;
/** 墓守の供物: 消す自陣のコマ。ライフが最も低いコマ（同じなら番号の小さいマス）。自陣にコマが無ければ -1 */
const graveOfferingTarget = (board, player) => {
    let best = -1;
    board.forEach((sq, i) => {
        if (sq.player !== player)
            return;
        if (best < 0 || sq.bind < board[best].bind)
            best = i;
    });
    return best;
};
exports.graveOfferingTarget = graveOfferingTarget;
