// 自動生成: src/components/game/gearTurn.ts (node scripts/gen-sim-shared.js)。手で編集しない。
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.advanceGearState = void 0;
const discount_1 = require("./discount");
const gear_1 = require("./gear");
const thermal_1 = require("./thermal");
const comboCost_1 = require("./comboCost");
/**
 * 手番が endSeat から nextSeat に変わるときの更新。
 * @param gears 席ごとの装備（裸の王様で封じられている席は封じられた後の装備）
 */
const advanceGearState = (g, r, input) => {
    const { board, symbols, gears, endSeat, nextSeat } = input;
    const change = { scorch: symbols.map(() => 0), ashGained: 0, ruinTriggered: [], ashNext: 0, ruinNext: false, echoNext: false };
    // 焦土: 終わる手番の間に、敵の🌱が🔥で消えていたら魔力
    if (r.snap && r.snapBuds) {
        symbols.forEach((sym, seat) => {
            if (!(0, gear_1.hasGear)(gears[seat], 'scorchedEarth'))
                return;
            change.scorch[seat] = (0, gear_1.scorchGain)((0, gear_1.burnedBudCount)(r.snap, r.snapBuds, board, sym));
        });
    }
    // 灰の供物: この手番に敵のマスへ🔥を付与した数だけ、次の自分の手番の終わりまで割引（重複する）。終わる席の割引はここで切れる
    if (r.snap && r.snapFlames && (0, gear_1.hasGear)(gears[endSeat], 'ashOffering')) {
        const n = (0, gear_1.ignitedCount)(r.snap, r.snapFlames, board, symbols[endSeat]);
        if (n > 0) {
            r.ashPending[endSeat] += n;
            change.ashGained = n;
        }
    }
    r.ashActive[endSeat] = 0;
    r.ashActive[nextSeat] = r.ashPending[nextSeat];
    r.ashPending[nextSeat] = 0;
    change.ashNext = r.ashActive[nextSeat];
    // 廃墟の底力: 終わる手番の間に自陣が破壊されていたら、次の自分の手番から割引。終わる席の割引はここで切れる
    if (r.snap) {
        const after = board.map((sq) => sq.player);
        symbols.forEach((sym, seat) => {
            if ((0, gear_1.hasGear)(gears[seat], 'ruinSurge') && (0, gear_1.lostCells)(r.snap, after, sym, r.lastMove).length > 0) {
                r.pending[seat] = true;
                change.ruinTriggered.push(seat);
            }
        });
    }
    r.active[endSeat] = false;
    r.active[nextSeat] = r.pending[nextSeat];
    r.pending[nextSeat] = false;
    change.ruinNext = r.active[nextSeat];
    r.snap = board.map((sq) => sq.player);
    r.snapBuds = (0, gear_1.budCounts)(board);
    r.snapFlames = (0, gear_1.flameCounts)(board);
    r.lastMove = null;
    // 新しい手番のスキル使用数をリセットし、余韻を引き継ぐ
    g.skills[nextSeat] = 0;
    g.kinds[nextSeat] = new Set();
    g.discount[nextSeat] = (0, discount_1.emptyDiscount)();
    g.oppSkillPrev[nextSeat] = g.oppSkilled[nextSeat];
    g.oppSkilled[nextSeat] = false;
    g.fireBase[nextSeat] = (0, thermal_1.fireStacksTotal)(board);
    g.shikiPlaced[nextSeat] = false;
    g.leafBase[nextSeat] = (0, comboCost_1.ownLeaves)(board, symbols[nextSeat]);
    g.darkPotUsed[nextSeat] = false;
    g.tokenFree[endSeat] = false; // 無礼講は手番が終わると切れる
    g.tokenFree[nextSeat] = false;
    g.chargeBase[nextSeat] = (0, comboCost_1.ownCharges)(board, symbols[nextSeat]);
    g.echoReady[nextSeat] = g.echoNext[nextSeat];
    change.echoNext = g.echoReady[nextSeat];
    g.echoNext[nextSeat] = false;
    return change;
};
exports.advanceGearState = advanceGearState;
