// 龍神の巫女（#527）の純粋ロジック。Game.tsx・sim/engine.js・AIPlayer.ts が同じ関数を呼ぶ (#289)。
//  - 巫女: 自陣の建造物（isBuilding。式神を除く）が AWAKEN_BUILDINGS 個になると龍に覚醒する
//  - 覚醒: 建造物が囲んだ範囲と自陣の建造物をすべて消滅させ、消したマスの数 N を記録する
//  - 龍: ライフ平均 5+N+4、手番開始魔力 +N。防壁（相手が列を揃える勝ちを止める）を内蔵し、発動すると巫女に戻る
//  - 龍の咆哮: 自陣のオブジェクト全ての周囲8マスの敵コマを破壊し、そのあと自陣のオブジェクト全てに⚡を設置する
import { CharacterId } from '../../types/Character';
import { isBuilding } from '../../types/ObjectKind';
import { Player } from '../../types/Player';
import { SquareInfo } from '../../types/SquareInfo';
import { geometryForCells } from './boardGeometry';
import { addCharge, chargeStacks } from './charge';
import { absorbDestroy } from './thermal';
import { OBJECT_DEFS, OBJECT_KINDS, ObjectKind, objectLandableCells } from './objects';

/** 覚醒に必要な自陣の建造物の数 */
export const AWAKEN_BUILDINGS = 4;
/** 巫女のライフ平均（通常5から-2）。util.ts の LIFE_MEANS.dragonMiko と同値 */
export const MIKO_LIFE_MEAN = 3;
/** 龍のライフ平均 = 通常のベース + N + この値 */
export const DRAGON_LIFE_BASE = 5;
export const DRAGON_LIFE_PLUS = 4;
/** 覚醒の N の上限（暫定: 上限なし。測定してから決める。#527 の数値の懸念） */
export const DRAGON_N_CAP = Infinity;

export type DragonForm = 'miko' | 'dragon';

/** 席ごとの形態。n は覚醒時に消したマスの数（巫女のときは 0） */
export type DragonState = { form: DragonForm; n: number };
export const newDragonState = (): DragonState => ({ form: 'miko', n: 0 });

export const isDragonMiko = (c: CharacterId | undefined): boolean => c === 'dragonMiko';

const empty = (): SquareInfo => ({ player: undefined, bind: 0, effects: [] });

/** 自陣の建造物のマス（昇順） */
export const ownBuildingCells = (board: SquareInfo[], player: Player): number[] =>
    board.map((sq, i) => (isBuilding(sq) && sq.player === player ? i : -1)).filter((i) => i !== -1);

/**
 * 自陣の建造物が囲んだマス（建造物自身は含まない）。
 * 壁 = 自陣の建造物（盤の端も壁）。壁以外のマスを縦横の連結で分け、最も大きい連結成分を『外』、それ以外をすべて『囲まれた範囲』とする。
 * 盤の端が壁なので、4つの建造物で盤の角を斜めに切ると、角側の三角形（最大6マス）が囲まれる。
 * 最大の成分が同数なら、最も小さい番号のマスを含む成分を『外』にする（結果を決まりにするため）。
 */
export const enclosedCells = (board: SquareInfo[], player: Player): number[] => {
    const size = Math.round(Math.sqrt(board.length));
    const wall = (i: number): boolean => isBuilding(board[i]) && board[i].player === player;
    const comp = new Array<number>(board.length).fill(-1);
    const groups: number[][] = [];
    for (let start = 0; start < board.length; start++) {
        if (wall(start) || comp[start] !== -1) continue;
        const id = groups.length;
        const cells: number[] = [];
        const stack = [start];
        comp[start] = id;
        while (stack.length) {
            const i = stack.pop() as number;
            cells.push(i);
            const r = Math.floor(i / size);
            const c = i % size;
            const next = [r > 0 ? i - size : -1, r < size - 1 ? i + size : -1, c > 0 ? i - 1 : -1, c < size - 1 ? i + 1 : -1];
            for (const j of next) {
                if (j >= 0 && !wall(j) && comp[j] === -1) {
                    comp[j] = id;
                    stack.push(j);
                }
            }
        }
        groups.push(cells);
    }
    if (groups.length <= 1) return [];
    // 外 = 最大の成分（同数なら先に見つかった＝最小番号のマスを含む成分）
    let outside = 0;
    groups.forEach((g, k) => {
        if (g.length > groups[outside].length) outside = k;
    });
    const out: number[] = [];
    groups.forEach((g, k) => {
        if (k !== outside) out.push(...g);
    });
    return out.sort((a, b) => a - b);
};

export type AwakenPlan = {
    /** 囲まれた範囲 */
    enclosed: number[];
    /** 自陣の建造物 */
    buildings: number[];
    /** 消すマスの数 N（囲まれた範囲＋建造物） */
    n: number;
};

/** 覚醒できるか（自陣の建造物が4つ以上）。できるなら消すマスの計画を返す */
export const awakenPlan = (board: SquareInfo[], player: Player): AwakenPlan | null => {
    const buildings = ownBuildingCells(board, player);
    if (buildings.length < AWAKEN_BUILDINGS) return null;
    const enclosed = enclosedCells(board, player);
    return { enclosed, buildings, n: Math.min(DRAGON_N_CAP, enclosed.length + buildings.length) };
};

/** 覚醒の消滅を適用する（board を直接書き換える。『消滅』なのでロック・氷結・エフェクトを無視して空きマスにする）。消したマスの数 N を返す */
export const applyAwaken = (board: SquareInfo[], plan: AwakenPlan): number => {
    for (const i of plan.enclosed) board[i] = empty();
    for (const i of plan.buildings) board[i] = empty();
    return plan.n;
};

/** 龍のライフ平均の加算分（巫女のライフ平均 MIKO_LIFE_MEAN に対して、龍は DRAGON_LIFE_BASE+N+DRAGON_LIFE_PLUS） */
export const dragonLifeBonus = (state: DragonState): number =>
    state.form === 'dragon' ? DRAGON_LIFE_BASE + state.n + DRAGON_LIFE_PLUS - MIKO_LIFE_MEAN : 0;

/** 龍の手番開始時の魔力加算 */
export const dragonMagicBonus = (state: DragonState): number => (state.form === 'dragon' ? state.n : 0);

/** 咆哮の対象: 自陣のオブジェクト全ての周囲8マスにある敵のコマ（オブジェクトを含む）。昇順 */
export const roarVictims = (board: SquareInfo[], player: Player): number[] => {
    const geo = geometryForCells(board.length);
    const set = new Set<number>();
    for (let i = 0; i < board.length; i++) {
        if (!board[i].object || board[i].player !== player) continue;
        for (const j of geo.surroundRange(i)) if (board[j].player && board[j].player !== player) set.add(j);
    }
    return Array.from(set).sort((a, b) => a - b);
};

export type RoarResult = {
    /** 壊したコマの数（墓地に積む数） */
    destroyed: number;
    /** 氷結が身代わりになって壊れなかったマス */
    blocked: number[];
    /** ⚡を設置した自陣のオブジェクトのマス */
    charged: number[];
    /** 破壊の対象だったマス（演出用） */
    range: number[];
};

/**
 * 龍の咆哮。自陣のオブジェクト全ての周囲8マスの敵コマを破壊し（氷結は身代わり）、そのあと自陣のオブジェクト全てに⚡を設置する。
 * ⚡の着地ダメージは通常どおり入る（オブジェクトも例外にしない）。board を直接書き換える。
 */
export const roar = (board: SquareInfo[], player: Player, chars: readonly (CharacterId | undefined)[]): RoarResult => {
    const range = roarVictims(board, player);
    let destroyed = 0;
    const blocked: number[] = [];
    for (const i of range) {
        const guard = absorbDestroy(board[i]);
        if (guard.blocked) {
            board[i] = guard.sq;
            blocked.push(i);
            continue;
        }
        destroyed++;
        board[i] = empty();
    }
    const charged: number[] = [];
    for (let i = 0; i < board.length; i++) {
        if (!board[i].object || board[i].player !== player || chargeStacks(board[i]) > 0) continue;
        board[i] = addCharge(board[i], chars);
        charged.push(i);
    }
    return { destroyed, blocked, charged, range };
};

/** 咆哮を撃てるか（自陣のオブジェクトがある） */
export const roarUsable = (board: SquareInfo[], player: Player): boolean =>
    board.some((sq) => sq.object !== undefined && sq.player === player);

/** 八百万の祈りが引ける建造物の種類: デッキの中のオブジェクト設置スキル（deck が無ければ全種類） */
export const prayerKinds = (deck?: readonly number[]): ObjectKind[] =>
    OBJECT_KINDS.filter((k) => !deck || deck.includes(OBJECT_DEFS[k].idx));

/** 祈りを使えるか（引ける種類があり、置ける空きマスがある） */
export const prayerUsable = (board: SquareInfo[], deck?: readonly number[]): boolean =>
    prayerKinds(deck).length > 0 && objectLandableCells(board).length > 0;

/** 祈りで引く種類を抽選する。rng は [0,1) */
export const pickPrayerKind = (deck: readonly number[] | undefined, rng: () => number): ObjectKind | undefined => {
    const kinds = prayerKinds(deck);
    return kinds.length ? kinds[Math.floor(rng() * kinds.length)] : undefined;
};

/**
 * 龍の防壁。相手 winner が列を揃えたとき、揃った列のマスと龍の持ち主 holder の自陣のコマをすべて消滅させる
 * （土壇場の防壁と同じ処理。ロック・氷結を貫通）。board を直接書き換える。ほかの席への永続ボーナスは付けない。
 */
export const applyBulwark = (board: SquareInfo[], winner: Player, holder: Player): void => {
    for (const line of geometryForCells(board.length).winLines) {
        if (line.every((idx) => !board[idx].object && board[idx].player === winner)) for (const idx of line) board[idx] = empty();
    }
    for (let idx = 0; idx < board.length; idx++) if (board[idx].player === holder) board[idx] = empty();
};
