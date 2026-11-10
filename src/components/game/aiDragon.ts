// AIPlayer のメソッド群: 龍神の巫女（#527）の計画。aiPlanMove.ts の makeMove が先に呼び、null なら通常の計画に進む
// 巫女: 盤の角を斜めに切る4マス（囲める範囲が最大6マスの型）に建造物を置いて覚醒を目指す
// 龍: 敵コマが3つ以上入る位置に建造物を置き直し、咆哮で焼き払う
import type AIPlayer from './AIPlayer';
import { SquareInfo } from '../../types/SquareInfo';
import { Player, seatOf } from '../../types/Player';
import { geometryForCells } from './boardGeometry';
import { AWAKEN_BUILDINGS, awakenPlan, ownBuildingCells, prayerUsable, roarUsable, roarVictims } from './dragon';
import { OBJECT_DEFS, objectLandable } from './objects';
import { isBuilding } from '../../types/ObjectKind';
import { AIResult } from './aiConstants';
import { PlanMoveArgs } from './aiPlanMove';
import { BOLT_SILENCE_IDX, TURN_ENDING_SKILLS } from './aiConstants';
import { BOLT_SILENCE_BOLTS, chargeStacks } from './charge';
import { isDormant } from './thermal';

/** 咆哮を撃つ最小の巻き込み数 */
export const ROAR_MIN_VICTIMS = 3;
/** 自陣の建造物の上限。建造物は列に数えないので、増やしすぎると自分の列を作るマスが無くなり、盤面が埋まって膠着する（sim で魔力1000超・盤面が建造物だらけの試合を確認） */
export const BUILDING_CAP = 5;
/** 龍が祈りで建造物を増やすのをやめる空きマスの数。建造物は列に数えないので、盤が建造物で埋まると2本目の窓が潰れて膠着する（4x4 の対強豪 +9.4pt: seed21/31/41 で +7.4/+11.8/+8.9、対ネクロが主） */
export const DRAGON_EMPTY_RESERVE = 4;
/** 1手番に祈りを重ねる上限（覚醒に必要な建造物の数） */
export const PRAYER_MAX_PER_TURN = AWAKEN_BUILDINGS;

/** 盤の4つの角を斜めに切る4マスの組（囲める範囲が最大6マス） */
export const cornerCuts = (size: number): number[][] => {
    const at = (r: number, c: number): number => r * size + c;
    const d = 3;
    return [
        [0, 1, 2, 3].map((r) => at(r, d - r)),
        [0, 1, 2, 3].map((r) => at(r, size - 1 - d + r)),
        [0, 1, 2, 3].map((r) => at(size - 1 - r, d - r)),
        [0, 1, 2, 3].map((r) => at(size - 1 - r, size - 1 - d + r)),
    ];
};

const lockedEmpty = (): SquareInfo => ({ player: undefined, bind: 0, effects: [{ effect: '🔑' as const }] });

export interface DragonMethods {
    planDragon(this: AIPlayer, args: PlanMoveArgs): AIResult | null;
    planDragonCore(this: AIPlayer, args: PlanMoveArgs): AIResult | null;
    planDragonPlan(this: AIPlayer, args: PlanMoveArgs): AIResult | null;
    /** 沈黙は雷なり: 自陣の⚡2つを払って相手の次の手番のスキルを封じる計画（撃つべきでなければ null） */
    boltSilencePlan(this: AIPlayer, args: PlanMoveArgs, real: SquareInfo[]): { clicks: { skill: string; target: number; target2?: number }[]; cost: number } | null;
    /** 巫女/龍: 相手の即勝ちマスに大岩を置いて塞ぐ（手札に大岩があり、魔力が足りるとき）。置けなければ null */
    blockWithBoulders(this: AIPlayer, args: PlanMoveArgs, real: SquareInfo[], masked: SquareInfo[]): AIResult | null;
    /** 巫女: 次に建造物を置く（祈りで引く）マス。角を斜めに切る型のうち、すでに建造物が多く置けるものへ寄せる。無ければ null */
    mikoBuildCell(this: AIPlayer, real: SquareInfo[], me: Player): number | null;
    /** 龍: 建造物を置くマス。周囲8マスの敵コマが多い空きマス。1つも巻き込めなければ null */
    dragonBuildCell(this: AIPlayer, real: SquareInfo[], me: Player): number | null;
}

export const dragonMethods: DragonMethods = {
    mikoBuildCell(this: AIPlayer, real: SquareInfo[], me: Player): number | null {
        // 4つ目（覚醒する手）: 置き先の全候補を試し、囲みの中で消える敵のコマが多く、消える自分のコマが少ないマスを選ぶ。
        // 囲みの中のコマは敵味方を問わず消滅する（仕様）ので、自分のコマを巻き込まないようにする
        if (ownBuildingCells(real, me).length === AWAKEN_BUILDINGS - 1) {
            let best: { cell: number; score: number } | null = null;
            for (let i = 0; i < real.length; i++) {
                if (!objectLandable(real[i])) continue;
                const hyp = real.map((sq, j) => (j === i ? { player: me, bind: 5, effects: [], object: 'fort' as const } : sq));
                const plan = awakenPlan(hyp, me);
                if (!plan) continue;
                const ownLost = plan.enclosed.filter((j) => real[j].player === me && !isBuilding(real[j])).length;
                const enemyGone = plan.enclosed.filter((j) => real[j].player && real[j].player !== me).length;
                const score = plan.n + 2 * enemyGone - 4 * ownLost;
                if (!best || score > best.score) best = { cell: i, score };
            }
            if (best) return best.cell;
        }
        const size = Math.round(Math.sqrt(real.length));
        const mine = (i: number): boolean => isBuilding(real[i]) && real[i].player === me;
        let best: { cell: number; score: number } | null = null;
        for (const cut of cornerCuts(size)) {
            const have = cut.filter(mine).length;
            const open = cut.filter((i) => objectLandable(real[i]));
            // 型の4マスのうち、建造物でも空きでもないマス（敵のコマなど）があれば、この型は作れない
            if (have + open.length < AWAKEN_BUILDINGS || open.length === 0) continue;
            // 角に近い（囲む範囲が広い）マスから置く。同点なら番号の小さいマス
            const cell = open[0];
            const score = have * 10 - cut.indexOf(cell);
            if (!best || score > best.score) best = { cell, score };
        }
        return best ? best.cell : null;
    },

    dragonBuildCell(this: AIPlayer, real: SquareInfo[], me: Player): number | null {
        const geo = geometryForCells(real.length);
        let best: { cell: number; hit: number } | null = null;
        for (let i = 0; i < real.length; i++) {
            if (!objectLandable(real[i])) continue;
            const hit = geo.surroundRange(i).filter((j) => real[j].player && real[j].player !== me).length;
            if (hit > 0 && (!best || hit > best.hit)) best = { cell: i, hit };
        }
        return best ? best.cell : null;
    },

    planDragon(this: AIPlayer, args: PlanMoveArgs): AIResult | null {
        const plan = this.planDragonPlan(args);
        if (!plan || plan.skills.some((sk) => TURN_ENDING_SKILLS.includes(sk))) return plan;
        // 祈り・大岩・沈黙のあとに魔力が余るなら、手札のほかのスキル（トークン・ロックなど）も撃つ（余った魔力が溜まって決着しない試合があった）
        const masked = args[0].map((sq) => (isBuilding(sq) ? lockedEmpty() : sq));
        const maskedArgs = [...args] as unknown as PlanMoveArgs;
        (maskedArgs as unknown as unknown[])[0] = masked;
        return this.extendPlan(plan, maskedArgs);
    },
    boltSilencePlan(this: AIPlayer, args: PlanMoveArgs, real: SquareInfo[]): { clicks: { skill: string; target: number; target2?: number }[]; cost: number } | null {
        const magic = args[1];
        const costs = args[2];
        const available = args[5];
        const seatMagic = args[12] ?? [];
        if (!available.includes(BOLT_SILENCE_IDX)) return null;
        const masked = real.map((sq) => (isBuilding(sq) ? lockedEmpty() : sq));
        if (this.opponents.some((o) => this.countReaches(masked, o) > 0)) return null;
        const cost = this.calculateAICost(costs.onClickBoltSilence, false, false, 'onClickBoltSilence');
        const total = real.reduce((n, sq) => (sq.player === this.playerSymbol && !isDormant(sq) ? n + chargeStacks(sq) : n), 0);
        if (total < BOLT_SILENCE_BOLTS || magic < cost || !this.opponentsCanCastBig(real, seatMagic)) return null;
        const targets: number[] = [];
        let b = real.map((sq) => ({ ...sq, effects: [...sq.effects] }));
        for (let k = 0; k < BOLT_SILENCE_BOLTS; k++) {
            const t = this.boltSilenceTarget(b);
            if (t === null) return null;
            targets.push(t);
            const at = b[t].effects.findIndex((e) => e.effect === '⚡');
            b[t] = { ...b[t], effects: b[t].effects.filter((_, j) => j !== at) };
        }
        return { clicks: [{ skill: 'onClickBoltSilence', target: targets[0], target2: targets[1] }], cost };
    },

    planDragonPlan(this: AIPlayer, args: PlanMoveArgs): AIResult | null {
        const silence = this.boltSilencePlan(args, args[0]);
        if (!silence) return this.planDragonCore(args);
        const rest = [...args] as unknown as PlanMoveArgs;
        (rest as unknown as unknown[])[1] = args[1] - silence.cost;
        const core = this.planDragonCore(rest);
        if (core) return { ...core, chargeClicks: [...silence.clicks, ...(core.chargeClicks ?? [])] };
        const masked = args[0].map((sq) => (isBuilding(sq) ? lockedEmpty() : sq));
        const move = this.getBestMove(masked, args[4]);
        return { move, skills: move === null ? ['onClickCharge'] : [], chargeClicks: silence.clicks };
    },

    blockWithBoulders(this: AIPlayer, args: PlanMoveArgs, real: SquareInfo[], masked: SquareInfo[]): AIResult | null {
        const magic = args[1];
        const costs = args[2];
        const life = args[4];
        const available = args[5];
        const prayCost = this.calculateAICost(costs.onClickPrayer, false, false, 'onClickPrayer');
        const bcost = this.calculateAICost(costs.onClickBoulder, false, false, 'onClickBoulder');
        const hasBoulder = available.includes(OBJECT_DEFS.boulder.idx);
        const threats = Array.from(new Set(this.opponents.flatMap((o) => this.findThreatSquares(masked, o)))).filter((c) => objectLandable(real[c]));
        const clicks: { skill: string; target: number }[] = [];
        const post = masked.map((sq) => ({ ...sq, effects: [...sq.effects] }));
        let left = magic;
        // 祈りを優先する: 引いた建造物はどれも空きマスをふさげる（置いた建造物は減衰せず、ライフ0でない敵には奪えない）。種類は選べないが、置き先は選べる。
        // 祈りで足りない分の脅威マスに、手札の大岩（コスト1・2ターンのロック付き）を置く
        let prayers = 0;
        let room = BUILDING_CAP - ownBuildingCells(real, this.playerSymbol).length;
        for (const c of threats) {
            if (room <= 0) break;
            room--;
            if (prayers < PRAYER_MAX_PER_TURN && left >= prayCost && prayerUsable(real, this.deck)) {
                clicks.push({ skill: 'onClickPrayer', target: c });
                left -= prayCost;
                prayers++;
            } else if (hasBoulder && left >= bcost) {
                clicks.push({ skill: 'onClickBoulder', target: c });
                left -= bcost;
            } else continue;
            post[c] = lockedEmpty();
        }
        if (clicks.length === 0) return null;
        const followup = this.getBestMove(post, life);
        return { move: followup, skills: followup === null ? ['onClickCharge'] : [], chargeClicks: clicks };
    },

    planDragonCore(this: AIPlayer, args: PlanMoveArgs): AIResult | null {
        const real = args[0];
        const magic = args[1];
        const costs = args[2];
        const life = args[4];
        const me = this.playerSymbol;
        const masked = real.map((sq) => (isBuilding(sq) ? lockedEmpty() : sq));
        // 相手にリーチがあるとき: 手札に大岩があれば、相手の即勝ちマス（リーチの要の空きマス）に大岩を置いて塞ぐ。
        // 大岩は建造物なので覚醒の4つに数えられる（妨害しながら覚醒に近づく）。無ければ通常の防御・攻めの計画に任せる
        if (this.opponents.some((o) => this.countReaches(masked, o) > 0)) return this.blockWithBoulders(args, real, masked);
        const deck = this.deck;
        const prayCost = this.calculateAICost(costs.onClickPrayer, false, false, 'onClickPrayer');
        const roarCost = this.calculateAICost(costs.onClickRoar, false, false, 'onClickRoar');
        const isDragon = this.dragonForm === 'dragon';

        // 龍: 敵が固まっていれば咆哮で焼き払う
        if (isDragon && roarUsable(real, me) && magic >= roarCost && roarVictims(real, me).length >= ROAR_MIN_VICTIMS) {
            return { move: null, skills: ['onClickRoar'] };
        }
        // 龍: 覚醒の直後は自陣の建造物が無い（消滅した）。祈りで敵の固まりの隣に建造物を置き、同じ手番にそのまま咆哮を撃つ
        // （祈りは手番を終えず、咆哮は終える）。ふつうに2手番かけると、そのあいだに相手に列を揃えられて防壁が発動し、巫女に戻ってしまう
        if (isDragon && magic >= prayCost + roarCost && prayerUsable(real, deck) && ownBuildingCells(real, me).length < BUILDING_CAP) {
            let best: { cell: number; victims: number } | null = null;
            for (let i = 0; i < real.length; i++) {
                if (!objectLandable(real[i])) continue;
                const hyp = real.map((sq, j) => (j === i ? { player: me, bind: 5, effects: [], object: 'fort' as const } : sq));
                const v = roarVictims(hyp, me).length;
                if (v >= ROAR_MIN_VICTIMS && (!best || v > best.victims)) best = { cell: i, victims: v };
            }
            if (best) return { move: null, skills: ['onClickRoar'], chargeClicks: [{ skill: 'onClickPrayer', target: best.cell }] };
        }

        // 祈りで建造物を置く（巫女は覚醒の型へ、龍は敵の固まりの隣へ）。魔力が続く限り重ねる（1手番に最大4つ）
        const clicks: { skill: string; target: number }[] = [];
        let left = magic;
        let cur = real.map((sq) => ({ ...sq, effects: [...sq.effects] }));
        if (isDragon && real.filter((sq) => !sq.player && !sq.object).length <= DRAGON_EMPTY_RESERVE) return null;
        // 巫女が火炎使いと戦うとき: 建造物は毎手番焼かれて4つ揃う前に落ちる。残りを1手番で置き切れる魔力が貯まるまで祈らない
        if (!isDragon && (globalThis as any).process?.env?.DRAGON_BURST === '1'
            && this.characters.some((c, seat) => seat !== seatOf(this.playerSymbol) && c === 'pyromancer')
            && magic < (AWAKEN_BUILDINGS - ownBuildingCells(real, me).length) * prayCost) return null;
        const maxPrayers = Math.min(isDragon ? 1 : PRAYER_MAX_PER_TURN - ownBuildingCells(real, me).length, BUILDING_CAP - ownBuildingCells(real, me).length);
        while (clicks.length < maxPrayers && left >= prayCost && prayerUsable(cur, deck)) {
            const cell = isDragon ? this.dragonBuildCell(cur, me) : this.mikoBuildCell(cur, me);
            if (cell === null) break;
            clicks.push({ skill: 'onClickPrayer', target: cell });
            left -= prayCost;
            cur = cur.map((sq, i) => (i === cell ? { player: me, bind: 5, effects: [], object: 'fort' as const } : sq));
        }
        if (clicks.length === 0) return null;
        const post = cur.map((sq) => (isBuilding(sq) ? lockedEmpty() : sq));
        const followup = this.getBestMove(post, life);
        return { move: followup, skills: followup === null ? ['onClickCharge'] : [], chargeClicks: clicks };
    },
};
