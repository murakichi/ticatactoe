// 自動生成: src/components/game/lock.ts (node scripts/gen-sim-shared.js)。手で編集しない。
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tickLock = exports.clearLock = exports.addLock = exports.lockEffect = exports.lockStack = exports.isLocked = void 0;
const isLock = (e) => e.effect === '🔑';
/** ロック中のマスか（🔑が1つでもある。stack の無い先読み用の🔑も含む） */
const isLocked = (sq) => sq.effects.some(isLock);
exports.isLocked = isLocked;
/** マスに乗っているロックの合計スタック（期限なしのロックは数えない） */
const lockStack = (sq) => sq.effects.reduce((n, e) => { var _a; return (isLock(e) ? n + ((_a = e.stack) !== null && _a !== void 0 ? _a : 0) : n); }, 0);
exports.lockStack = lockStack;
/** スタックを持つロックの🔑エフェクトを作る */
const lockEffect = (stack, owner) => (owner ? { effect: '🔑', stack, owner } : { effect: '🔑', stack });
exports.lockEffect = lockEffect;
/**
 * ロックを stack ターン分足した新しいマスを返す（加算）。🔑は1つにまとめる。ライフは変えない。
 * owner（空蔵）は、すでにロックに持ち主がいればそれを保ち、無ければ渡された値を使う。
 */
const addLock = (sq, stack, owner) => {
    var _a, _b;
    const existing = sq.effects.filter(isLock);
    const total = existing.reduce((n, e) => { var _a; return n + ((_a = e.stack) !== null && _a !== void 0 ? _a : 0); }, 0) + stack;
    const keptOwner = (_b = (_a = existing.find((e) => e.owner)) === null || _a === void 0 ? void 0 : _a.owner) !== null && _b !== void 0 ? _b : owner;
    return { ...sq, effects: [...sq.effects.filter((e) => !isLock(e)), (0, exports.lockEffect)(total, keptOwner)] };
};
exports.addLock = addLock;
/** ロックを全部外した新しいマス */
const clearLock = (sq) => ((0, exports.isLocked)(sq) ? { ...sq, effects: sq.effects.filter((e) => !isLock(e)) } : sq);
exports.clearLock = clearLock;
/** ロックのスタックを n 減らす（0以下になったら外す）。stack の無い🔑は減らさない */
const tickLock = (sq, n = 1) => {
    if (!sq.effects.some((e) => isLock(e) && e.stack !== undefined))
        return { sq };
    let expired;
    const effects = [];
    for (const e of sq.effects) {
        if (!isLock(e) || e.stack === undefined) {
            effects.push(e);
            continue;
        }
        const stack = e.stack - n;
        if (stack > 0)
            effects.push({ ...e, stack });
        else
            expired = e;
    }
    return { sq: { ...sq, effects }, expired };
};
exports.tickLock = tickLock;
