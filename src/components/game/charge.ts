// ⚡帯電（雷霆の巫）の純粋ロジック。Game.tsx / AIPlayer.ts で共有する。
// sim/engine.js の chargeStacks / orthoNeighbors / isShielded / isGuarded / fireCharges / connectedPieces と同じ仕様。
import { CharacterId } from '../../types/Character';
import { Player, seatOf } from '../../types/Player';
import { SquareInfo } from '../../types/SquareInfo';

/** 席ごとのキャラ（添字 = 席番号。シンボルからは seatOf で引く）。sim/engine.js の s.chars と同じ */
export type PlayerCharacters = readonly CharacterId[];

const charOf = (chars: PlayerCharacters, player: Player): CharacterId | undefined => chars[seatOf(player)];

/** ⚡の個数（スタック数） */
export const chargeStacks = (sq: SquareInfo): number => sq.effects.filter((e) => e.effect === '⚡').length;

/** 縦横に隣接するマス（size x size, index = row*size + col） */
export const orthoNeighbors = (i: number, size: number): number[] => {
    const r = Math.floor(i / size);
    const c = i % size;
    const out: number[] = [];
    if (r > 0) out.push(i - size);
    if (r < size - 1) out.push(i + size);
    if (c > 0) out.push(i - 1);
    if (c < size - 1) out.push(i + 1);
    return out;
};

const hasLock = (sq: SquareInfo): boolean => sq.effects.some((e) => e.effect === '🔑');

/** 雷霆の巫の⚡付き自陣マスは「無敵」。弱点として本人も含め誰も触れない */
export const isShielded = (sq: SquareInfo, chars: PlayerCharacters): boolean =>
    !!sq.player && charOf(chars, sq.player) === 'electrician' && chargeStacks(sq) > 0;

/** 🔑ロックまたは⚡の無敵＝ダメージ系スキルの対象外にするマス */
export const isGuarded = (sq: SquareInfo, chars: PlayerCharacters): boolean => hasLock(sq) || isShielded(sq, chars);

/** 無敵マスの添字集合 */
export const shieldedCells = (board: SquareInfo[], chars: PlayerCharacters): number[] =>
    board.map((sq, i) => (isShielded(sq, chars) ? i : -1)).filter((i) => i !== -1);

export type FireResult = {
    /** 発火した帯電マス */
    fired: number[];
    /** 実際に1ダメージを受けたマス */
    damaged: number[];
};

/**
 * 着手マス i の隣にある⚡を発火させる（size は盤の一辺。board を直接書き換える）。
 * 発火した帯電マス k の縦横隣接のうち、ライフ>0・🔑なしのコマが1ダメージ（k 自身は対象外、
 * 着手したコマが k の隣ならそれも含む）。発火した k の⚡は全部消える。連鎖はしない。
 */
export const fireCharges = (board: SquareInfo[], i: number, size: number): FireResult => {
    const fired: number[] = [];
    const damaged: number[] = [];
    for (const k of orthoNeighbors(i, size)) {
        if (chargeStacks(board[k]) === 0) continue;
        fired.push(k);
        for (const n of orthoNeighbors(k, size)) {
            const sq = board[n];
            if (!sq.player || sq.bind <= 0) continue;
            if (hasLock(sq)) continue; // ロックは貫通しない
            board[n] = { ...sq, bind: sq.bind - 1 };
            damaged.push(n);
        }
        board[k] = { ...board[k], effects: board[k].effects.filter((e) => e.effect !== '⚡') };
    }
    return { fired, damaged };
};

/** 固有スキル: start から、コマのあるマスだけを縦横に辿って届くすべてのマス（start 自身を含む）。空きマスなら [] */
export const connectedPieces = (board: SquareInfo[], start: number, size: number): number[] => {
    if (!board[start].player) return [];
    const seen = new Set<number>([start]);
    const queue = [start];
    while (queue.length > 0) {
        const cur = queue.shift() as number;
        for (const n of orthoNeighbors(cur, size)) {
            if (!seen.has(n) && board[n].player) {
                seen.add(n);
                queue.push(n);
            }
        }
    }
    return Array.from(seen);
};

/** 指定マスに⚡を1つずつ付与した新しい盤面を返す（元の盤面は変更しない） */
export const withCharge = (board: SquareInfo[], cells: number[]): SquareInfo[] => {
    const next = board.slice();
    for (const k of cells) next[k] = { ...next[k], effects: [...next[k].effects, { effect: '⚡' }] };
    return next;
};
