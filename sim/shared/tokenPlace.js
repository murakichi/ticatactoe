// 自動生成: src/components/game/tokenPlace.ts (node scripts/gen-sim-shared.js)。手で編集しない。
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.placeBothTokens = exports.placeTokens = exports.putToken = exports.pickEmptyCells = void 0;
const util_1 = require("./util");
const bigSkills_1 = require("./bigSkills");
const charge_1 = require("./charge");
const poison_1 = require("./poison");
const shikigami_1 = require("./shikigami");
const tokenAfter_1 = require("./tokenAfter");
const thermal_1 = require("./thermal");
/** 空きマスから n 個選ぶ（空きが足りなければあるだけ。空きが無ければ []）。pick が乱数を持つ */
const pickEmptyCells = (board, n, pick) => {
    const empties = (0, util_1.findEmptyIndexes)(board);
    return empties.length === 0 || n <= 0 ? [] : pick(empties, Math.min(n, empties.length));
};
exports.pickEmptyCells = pickEmptyCells;
/** idx に kind のコマを置く。board を直接書き換える */
const putToken = (kind, board, idx, c) => {
    var _a, _b, _c;
    const none = { frost: 0, thawed: [] };
    switch (kind) {
        case 'plain':
            board[idx] = { player: c.player, bind: c.bind, effects: [] };
            return none;
        case 'buds':
            board[idx] = { player: c.player, bind: c.bind, effects: [{ effect: '🌱' }] };
            return { ...none, effect: '🌱' };
        case 'poison':
            board[idx] = (0, poison_1.poisonStrike)({ player: c.player, bind: c.bind, effects: [{ effect: '☠' }] }, c.chars);
            return { ...none, effect: '☠' };
        case 'charge':
            board[idx] = (0, charge_1.landCharge)({ player: c.player, bind: c.bind, effects: [{ effect: '⚡' }] }, c.chars);
            return { ...none, effect: '⚡' };
        case 'flame':
            return { ...none, thawed: (0, thermal_1.placeFlameToken)(board, idx, c.player, c.bind, c.size) };
        case 'frost':
            return { ...none, frost: (0, thermal_1.placeFrostToken)(board, idx, c.player, c.bind) };
        case 'leaf':
            (0, thermal_1.placeLeafToken)(board, idx, c.player, c.bind, (_a = c.leaves) !== null && _a !== void 0 ? _a : 1);
            return none;
        case 'shikigami':
            board[idx] = (0, shikigami_1.newShikigami)(c.player, (_b = c.shikigamiBind) !== null && _b !== void 0 ? _b : shikigami_1.SHIKIGAMI_LIFE);
            return none;
        case 'helper': {
            const effect = (_c = c.helperEffect) !== null && _c !== void 0 ? _c : '🌱';
            const { thawed } = (0, bigSkills_1.placeHelperToken)(board, idx, c.player, c.bind, effect, c.chars, c.size);
            return { ...none, thawed, effect: effect === '🌱' || effect === '☠' || effect === '⚡' ? effect : undefined };
        }
    }
};
exports.putToken = putToken;
/**
 * cells の各マスに kind のコマを順に置き、置くたびに afterTokenPlaced を通す。board を直接書き換える。
 * granted は収穫に渡す『付与したエフェクト数』の合計
 */
const placeTokens = (board, kind, cells, c, after, 
/** 置いた直後、afterTokenPlaced の前に盤面へ足す処理（山焼きのロックなど） */
afterPut) => {
    let granted = 0;
    const placed = cells.map((idx) => {
        const put = (0, exports.putToken)(kind, board, idx, c);
        afterPut === null || afterPut === void 0 ? void 0 : afterPut(board, idx);
        const result = (0, tokenAfter_1.afterTokenPlaced)(board, idx, put.effect, after);
        granted += result.granted;
        return { idx, ...put, after: result };
    });
    return { placed, granted };
};
exports.placeTokens = placeTokens;
/**
 * 両トークン: 参加者全員に1つずつ（席順に cells へ）。自分の席のコマはトークン扱い(bind・afterTokenPlaced)、他の席は固定ライフ。
 * 戻りは placeTokens と同じ形（他の席の after は null）
 */
const placeBothTokens = (board, cells, symbols, turnSeat, ownBind, otherBind, after) => {
    let granted = 0;
    const placed = cells.map((idx, seat) => {
        board[idx] = { player: symbols[seat], bind: seat === turnSeat ? ownBind : otherBind, effects: [] };
        const result = seat === turnSeat ? (0, tokenAfter_1.afterTokenPlaced)(board, idx, undefined, after) : null;
        if (result)
            granted += result.granted;
        return { idx, frost: 0, thawed: [], after: result };
    });
    return { placed, granted };
};
exports.placeBothTokens = placeBothTokens;
