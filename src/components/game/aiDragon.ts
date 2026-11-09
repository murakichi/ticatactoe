// AIPlayer のメソッド群: 龍神の巫女（#527）の計画。aiPlanMove.ts の makeMove が先に呼び、null なら通常の計画に進む
// 巫女: 盤の角を斜めに切る4マス（囲める範囲が最大6マスの型）に建造物を置いて覚醒を目指す
// 龍: 敵コマが3つ以上入る位置に建造物を置き直し、咆哮で焼き払う
import type AIPlayer from './AIPlayer';
import { SquareInfo } from '../../types/SquareInfo';
import { Player } from '../../types/Player';
import { geometryForCells } from './boardGeometry';
import { AWAKEN_BUILDINGS, ownBuildingCells, prayerUsable, roarUsable, roarVictims } from './dragon';
import { objectLandable } from './objects';
import { isBuilding } from '../../types/ObjectKind';
import { AIResult } from './aiConstants';
import { PlanMoveArgs } from './aiPlanMove';

/** 咆哮を撃つ最小の巻き込み数 */
export const ROAR_MIN_VICTIMS = 3;
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
    /** 巫女: 次に建造物を置く（祈りで引く）マス。角を斜めに切る型のうち、すでに建造物が多く置けるものへ寄せる。無ければ null */
    mikoBuildCell(this: AIPlayer, real: SquareInfo[], me: Player): number | null;
    /** 龍: 建造物を置くマス。周囲8マスの敵コマが多い空きマス。1つも巻き込めなければ null */
    dragonBuildCell(this: AIPlayer, real: SquareInfo[], me: Player): number | null;
}

export const dragonMethods: DragonMethods = {
    mikoBuildCell(this: AIPlayer, real: SquareInfo[], me: Player): number | null {
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
        const real = args[0];
        const magic = args[1];
        const costs = args[2];
        const life = args[4];
        const me = this.playerSymbol;
        const masked = real.map((sq) => (isBuilding(sq) ? lockedEmpty() : sq));
        // 相手にリーチがあるときは、通常の防御・攻めの計画に任せる
        if (this.opponents.some((o) => this.countReaches(masked, o) > 0)) return null;
        const deck = this.deck;
        const prayCost = this.calculateAICost(costs.onClickPrayer, false, false, 'onClickPrayer');
        const roarCost = this.calculateAICost(costs.onClickRoar, false, false, 'onClickRoar');
        const isDragon = this.dragonForm === 'dragon';

        // 龍: 敵が固まっていれば咆哮で焼き払う
        if (isDragon && roarUsable(real, me) && magic >= roarCost && roarVictims(real, me).length >= ROAR_MIN_VICTIMS) {
            return { move: null, skills: ['onClickRoar'] };
        }

        // 祈りで建造物を置く（巫女は覚醒の型へ、龍は敵の固まりの隣へ）。魔力が続く限り重ねる（1手番に最大4つ）
        const clicks: { skill: string; target: number }[] = [];
        let left = magic;
        let cur = real.map((sq) => ({ ...sq, effects: [...sq.effects] }));
        const maxPrayers = isDragon ? 1 : PRAYER_MAX_PER_TURN - ownBuildingCells(real, me).length;
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
