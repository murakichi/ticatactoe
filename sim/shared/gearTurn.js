// 自動生成: src/components/game/gearTurn.ts (node scripts/gen-sim-shared.js)。手で編集しない。
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.noteSkillUsed = exports.gearCostContext = exports.advanceGearState = exports.plantedStacksTotal = void 0;
const discount_1 = require("./discount");
const gear_1 = require("./gear");
const thermal_1 = require("./thermal");
const comboCost_1 = require("./comboCost");
/** 盤面全体の🌱と🍂の総数（火口の『直前に植えられた』判定の元） */
const plantedStacksTotal = (board) => board.reduce((n, sq) => n + (0, thermal_1.budStacks)(sq) + (0, thermal_1.leafStacks)(sq), 0);
exports.plantedStacksTotal = plantedStacksTotal;
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
    // 火口: 終わる手番の間に🌱🍂の総数が増えていれば、次の席の火口は無料（植えたのが誰でもよい。無料は1手番に1回まで）
    const plantedNow = (0, exports.plantedStacksTotal)(board);
    g.plantPrev[nextSeat] = plantedNow > g.plantBase[endSeat];
    g.plantBase[nextSeat] = plantedNow;
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
/**
 * ギア補正（adjustCostByGear）の入力。手番の席は今の手番内の状態、手番でない席（パネルで非手番側のコストを出すとき）は『その席の次の手番の頭』の状態で出す。
 * @param ailments 病炎の契りの入力（自陣にある毒・火炎の種類数。ギア未装備なら 0）
 */
const gearCostContext = (g, r, seat, turnSeat, ailments) => seat === turnSeat
    ? { skillsThisTurn: g.skills[seat], echoReady: g.echoReady[seat], ailments, ruin: r.active[seat], ash: r.ashActive[seat] }
    : { skillsThisTurn: 0, echoReady: g.echoNext[seat], ailments, ruin: r.pending[seat], ash: r.ashPending[seat] };
exports.gearCostContext = gearCostContext;
/**
 * 席 seat がスキルを1回使ったことを記録する（四連の極意・連鎖割引・余韻・軽減スキル・返し特売・業火の無料権の入力）。
 * skillId はコストキー（onClickXxx）。シャッフルなど『スキル扱いでない』ものは呼ばない。g を直接書き換える
 */
const noteSkillUsed = (g, seat, skillId) => {
    g.skills[seat] += 1;
    if (skillId) {
        g.discount[seat] = (0, discount_1.afterSkill)(g.discount[seat], skillId);
        g.oppSkilled = g.oppSkilled.map((v, i) => (i === seat ? v : true));
        // 業火の無料権: 異なる種類のスキルを INFERNO_FREE_SKILLS 種類使うと付く（同じスキルの連打は1種類。業火自身は数えない）
        if (skillId !== 'onClickInferno') {
            g.kinds[seat].add(skillId);
            if (g.kinds[seat].size >= thermal_1.INFERNO_FREE_SKILLS)
                g.infernoReady[seat] = true;
        }
    }
    g.echoNext[seat] = true;
    g.echoReady[seat] = false;
};
exports.noteSkillUsed = noteSkillUsed;
