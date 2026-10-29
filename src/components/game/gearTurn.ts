// 手番が変わるときの、ギア・導線まわりの席ごとの状態の更新。Game.tsx（ref の gearTurn / ruinState）と sim/engine.js（s.* の配列）が同じ関数を呼ぶ (#289)。
// 状態は席ごとの配列（と盤面のスナップショット）で、関数が直接書き換える。魔力など状態の外に効くものは戻り値で返す。
import { Player } from '../../types/Player';
import { SquareInfo } from '../../types/SquareInfo';
import { Discount, afterSkill, emptyDiscount } from './discount';
import { CostContext, Gears, budCounts, burnedBudCount, flameCounts, hasGear, ignitedCount, lostCells, scorchGain } from './gear';
import { INFERNO_FREE_SKILLS, fireStacksTotal } from './thermal';
import { ownCharges, ownLeaves } from './comboCost';

/** 手番内のスキル使用状況（席ごとの配列） */
export type GearTurnState = {
    skills: number[];
    echoReady: boolean[];
    echoNext: boolean[];
    kinds: Set<string>[];
    discount: Discount[];
    oppSkilled: boolean[];
    oppSkillPrev: boolean[];
    shikiPlaced: boolean[];
    fireBase: number[];
    leafBase: number[];
    darkPotUsed: boolean[];
    tokenFree: boolean[];
    chargeBase: number[];
};

/** 廃墟の底力・灰の供物・焦土の入力（手番開始時の盤面のスナップショットと、席ごとの割引の状態） */
export type RuinState = {
    active: boolean[];
    pending: boolean[];
    /** 手番開始時の各マスの持ち主 / 🌱の数 / 🔥の数 */
    snap: (Player | undefined)[] | null;
    snapBuds: number[] | null;
    snapFlames: number[] | null;
    ashActive: number[];
    ashPending: number[];
    /** その手番の通常の着手マス（攻撃で壊れた自コマは『スキル・エフェクトによる破壊』に数えない） */
    lastMove: number | null;
};

export type GearTurnChange = {
    /** 焦土で席ごとに得る魔力（次の手番の席の分は、手番開始の魔力に足す）。0 なら無し */
    scorch: number[];
    /** 灰の供物で、終わる手番の席が新しく得た割引の重ね数 */
    ashGained: number;
    /** 廃墟の底力が新しく『次の手番から有効』になった席 */
    ruinTriggered: number[];
    /** 次の手番の席の灰の供物（重ね数）/ 廃墟の底力（有効か）/ 余韻（1つ目のスキルが安い） */
    ashNext: number;
    ruinNext: boolean;
    echoNext: boolean;
};

/**
 * 手番が endSeat から nextSeat に変わるときの更新。
 * @param gears 席ごとの装備（裸の王様で封じられている席は封じられた後の装備）
 */
export const advanceGearState = (
    g: GearTurnState,
    r: RuinState,
    input: { board: SquareInfo[]; symbols: readonly Player[]; gears: readonly Gears[]; endSeat: number; nextSeat: number }
): GearTurnChange => {
    const { board, symbols, gears, endSeat, nextSeat } = input;
    const change: GearTurnChange = { scorch: symbols.map(() => 0), ashGained: 0, ruinTriggered: [], ashNext: 0, ruinNext: false, echoNext: false };

    // 焦土: 終わる手番の間に、敵の🌱が🔥で消えていたら魔力
    if (r.snap && r.snapBuds) {
        symbols.forEach((sym, seat) => {
            if (!hasGear(gears[seat], 'scorchedEarth')) return;
            change.scorch[seat] = scorchGain(burnedBudCount(r.snap!, r.snapBuds!, board, sym));
        });
    }
    // 灰の供物: この手番に敵のマスへ🔥を付与した数だけ、次の自分の手番の終わりまで割引（重複する）。終わる席の割引はここで切れる
    if (r.snap && r.snapFlames && hasGear(gears[endSeat], 'ashOffering')) {
        const n = ignitedCount(r.snap, r.snapFlames, board, symbols[endSeat]);
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
            if (hasGear(gears[seat], 'ruinSurge') && lostCells(r.snap!, after, sym, r.lastMove).length > 0) {
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
    r.snapBuds = budCounts(board);
    r.snapFlames = flameCounts(board);
    r.lastMove = null;

    // 新しい手番のスキル使用数をリセットし、余韻を引き継ぐ
    g.skills[nextSeat] = 0;
    g.kinds[nextSeat] = new Set();
    g.discount[nextSeat] = emptyDiscount();
    g.oppSkillPrev[nextSeat] = g.oppSkilled[nextSeat];
    g.oppSkilled[nextSeat] = false;
    g.fireBase[nextSeat] = fireStacksTotal(board);
    g.shikiPlaced[nextSeat] = false;
    g.leafBase[nextSeat] = ownLeaves(board, symbols[nextSeat]);
    g.darkPotUsed[nextSeat] = false;
    g.tokenFree[endSeat] = false; // 無礼講は手番が終わると切れる
    g.tokenFree[nextSeat] = false;
    g.chargeBase[nextSeat] = ownCharges(board, symbols[nextSeat]);
    g.echoReady[nextSeat] = g.echoNext[nextSeat];
    change.echoNext = g.echoReady[nextSeat];
    g.echoNext[nextSeat] = false;
    return change;
};

/**
 * ギア補正（adjustCostByGear）の入力。手番の席は今の手番内の状態、手番でない席（パネルで非手番側のコストを出すとき）は『その席の次の手番の頭』の状態で出す。
 * @param ailments 病炎の契りの入力（自陣にある毒・火炎の種類数。ギア未装備なら 0）
 */
export const gearCostContext = (g: GearTurnState, r: RuinState, seat: number, turnSeat: number, ailments: number): CostContext =>
    seat === turnSeat
        ? { skillsThisTurn: g.skills[seat], echoReady: g.echoReady[seat], ailments, ruin: r.active[seat], ash: r.ashActive[seat] }
        : { skillsThisTurn: 0, echoReady: g.echoNext[seat], ailments, ruin: r.pending[seat], ash: r.ashPending[seat] };

/**
 * 席 seat がスキルを1回使ったことを記録する（四連の極意・連鎖割引・余韻・軽減スキル・返し特売・業火の無料権の入力）。
 * skillId はコストキー（onClickXxx）。シャッフルなど『スキル扱いでない』ものは呼ばない。g を直接書き換える
 */
export const noteSkillUsed = (g: GearTurnState & { infernoReady: boolean[] }, seat: number, skillId?: string): void => {
    g.skills[seat] += 1;
    if (skillId) {
        g.discount[seat] = afterSkill(g.discount[seat], skillId);
        g.oppSkilled = g.oppSkilled.map((v, i) => (i === seat ? v : true));
        // 業火の無料権: 異なる種類のスキルを INFERNO_FREE_SKILLS 種類使うと付く（同じスキルの連打は1種類。業火自身は数えない）
        if (skillId !== 'onClickInferno') {
            g.kinds[seat].add(skillId);
            if (g.kinds[seat].size >= INFERNO_FREE_SKILLS) g.infernoReady[seat] = true;
        }
    }
    g.echoNext[seat] = true;
    g.echoReady[seat] = false;
};
