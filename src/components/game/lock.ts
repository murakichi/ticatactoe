// 🔑ロックのスタック管理 (#438)。
// ロックは「ライフ(bind)を引き上げて、そのライフが尽きたら外れる」のではなく、🔑エフェクトの stack（残りターン数）で持つ。
//   - 掛けるとスタックが加算される（6 + 6 = 12）。ライフは変えない
//   - 減衰のたびにスタックが 1 減り、0 になったらロックが外れる（decayBoard / breakDeadlock）
//   - ロック中のコマは、ライフが 0 でも誰にも乗っ取られない。ライフは普通に減衰する
//   - owner は空蔵（空きマスのロックが切れたら持ち主のコマになる）の座席番号 + 1
// stack を持たない🔑（AI の先読み盤面で『置けないマス』を表すもの）は期限なしのロックとして扱い、減らない。
// Game.tsx と sim/engine.js が同じ関数を使う（gen-sim-shared.js で sim/shared/lock.js に生成される）。
import { Effect } from '../../types/Effect';
import { SquareInfo } from '../../types/SquareInfo';

const isLock = (e: Effect): boolean => e.effect === '🔑';

/** ロック中のマスか（🔑が1つでもある。stack の無い先読み用の🔑も含む） */
export const isLocked = (sq: SquareInfo): boolean => sq.effects.some(isLock);

/** マスに乗っているロックの合計スタック（期限なしのロックは数えない） */
export const lockStack = (sq: SquareInfo): number => sq.effects.reduce((n, e) => (isLock(e) ? n + (e.stack ?? 0) : n), 0);

/** スタックを持つロックの🔑エフェクトを作る */
export const lockEffect = (stack: number, owner?: number): Effect => (owner ? { effect: '🔑', stack, owner } : { effect: '🔑', stack });

/**
 * ロックを stack ターン分足した新しいマスを返す（加算）。🔑は1つにまとめる。ライフは変えない。
 * owner（空蔵）は、すでにロックに持ち主がいればそれを保ち、無ければ渡された値を使う。
 */
export const addLock = (sq: SquareInfo, stack: number, owner?: number): SquareInfo => {
    const existing = sq.effects.filter(isLock);
    const total = existing.reduce((n, e) => n + (e.stack ?? 0), 0) + stack;
    const keptOwner = existing.find((e) => e.owner)?.owner ?? owner;
    return { ...sq, effects: [...sq.effects.filter((e) => !isLock(e)), lockEffect(total, keptOwner)] };
};

/** ロックを全部外した新しいマス */
export const clearLock = (sq: SquareInfo): SquareInfo => (isLocked(sq) ? { ...sq, effects: sq.effects.filter((e) => !isLock(e)) } : sq);

export type LockTick = {
    sq: SquareInfo;
    /** このtickで切れたロック（空蔵の持ち主を読むために返す） */
    expired?: Effect;
};

/** ロックのスタックを n 減らす（0以下になったら外す）。stack の無い🔑は減らさない */
export const tickLock = (sq: SquareInfo, n: number = 1): LockTick => {
    if (!sq.effects.some((e) => isLock(e) && e.stack !== undefined)) return { sq };
    let expired: Effect | undefined;
    const effects: Effect[] = [];
    for (const e of sq.effects) {
        if (!isLock(e) || e.stack === undefined) {
            effects.push(e);
            continue;
        }
        const stack = e.stack - n;
        if (stack > 0) effects.push({ ...e, stack });
        else expired = e;
    }
    return { sq: { ...sq, effects }, expired };
};
