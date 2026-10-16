// ⚡帯電（雷霆の巫）の純粋ロジック。Game.tsx / AIPlayer.ts で共有する。
// sim/engine.js の chargeStacks / orthoNeighbors / isShielded / isGuarded / fireCharges / connectedPieces と同じ仕様。
import { CharacterId } from '../../types/Character';
import { Player, seatOf } from '../../types/Player';
import { SquareInfo } from '../../types/SquareInfo';
import { CHARGE_MIN_COST } from './skillCosts';

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

/** 盤面全体の⚡の数（スタック込み）。sim/engine.js の boardChargeCount と同じ */
export const boardChargeCount = (board: SquareInfo[]): number => board.reduce((n, sq) => n + chargeStacks(sq), 0);

/**
 * 帯電付与・帯電拡散の実コスト: 盤面の⚡の数だけ基礎コストを軽減してからキャラ補正（calc）をかけ、
 * 下限は CHARGE_MIN_COST (#43)。sim/engine.js の chargeOneCost / chargeSpreadCost と同じ
 */
export const reducedChargeCost = (baseCost: number, board: SquareInfo[], calc: (cost: number) => number): number =>
    Math.max(CHARGE_MIN_COST, calc(baseCost - boardChargeCount(board)));

/** ランダム帯電の候補マス: 空きマス含む全マスから、無敵マスと🔑ロック中のマスを除く */
export const randomChargeCandidates = (board: SquareInfo[], chars: PlayerCharacters): number[] =>
    board.map((sq, i) => (!isShielded(sq, chars) && !hasLock(sq) ? i : -1)).filter((i) => i !== -1);

/** ジャマーが選べるマスか: ⚡があり、無敵マスなら自分のものだけ（弱点を解く唯一の手段）。他人の無敵マスは不可 */
export const canJam = (board: SquareInfo[], i: number, current: Player, chars: PlayerCharacters): boolean =>
    chargeStacks(board[i]) > 0 && !(isShielded(board[i], chars) && board[i].player !== current);

/** ジャマーのダメージ対象: i の縦横隣接の敵コマ（ライフ>0・🔑なし。current 以外のコマ） */
export const jammerTargets = (board: SquareInfo[], i: number, size: number, current: Player): number[] =>
    orthoNeighbors(i, size).filter((j) => {
        const sq = board[j];
        return !!sq.player && sq.player !== current && sq.bind > 0 && !hasLock(sq);
    });

export type JammerResult = {
    /** ライフを減らされたマス */
    damaged: number[];
    /** ライフが0になったマス */
    zeroed: number[];
};

/**
 * ジャマー: i の⚡のスタック数ぶん、縦横隣接の敵コマのライフを減らし（最小0）、i の⚡を全部消す。
 * 自分のコマ・🔑付きのコマは対象外。board を直接書き換える。sim/engine.js の exeJammer と同じ
 */
export const applyJammer = (board: SquareInfo[], i: number, size: number, current: Player): JammerResult => {
    const stacks = chargeStacks(board[i]);
    const damaged = jammerTargets(board, i, size, current);
    const zeroed: number[] = [];
    for (const j of damaged) {
        const bind = Math.max(0, board[j].bind - stacks);
        board[j] = { ...board[j], bind };
        if (bind === 0) zeroed.push(j);
    }
    board[i] = { ...board[i], effects: board[i].effects.filter((e) => e.effect !== '⚡') };
    return { damaged, zeroed };
};

/** 全マス（空きマス含む）に⚡が1つ以上あるか。sim/engine.js checkDischarge の判定と同じ */
export const isFullyCharged = (board: SquareInfo[]): boolean => board.length > 0 && board.every((sq) => chargeStacks(sq) > 0);

/**
 * 過負荷: 全マスが⚡で埋まっていたら、全⚡と全🔑を取り除き、全マスのライフを0にした新しい盤面を返す。
 * 埋まっていなければ同じ盤面をそのまま返す（元の盤面は変更しない）。sim/engine.js の checkDischarge が同仕様になる想定（ロックも解除）
 */
export const applyOverload = (board: SquareInfo[]): SquareInfo[] => {
    if (!isFullyCharged(board)) return board;
    return board.map((sq) => ({
        ...sq,
        effects: sq.effects.filter((e) => e.effect !== '⚡' && e.effect !== '🔑'),
        bind: 0,
    }));
};
