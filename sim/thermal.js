// @ts-check
'use strict';
/*
 * ❄氷結 / 🔥火炎の純粋ロジック。src/components/game/thermal.ts と同じ仕様（thermal.test.ts / engine.test.js が確認する）。
 * square は {player, bind, effects:[{effect}]}。関数は新しい square を返し、元は書き換えない
 * （ignite / freeze だけは thermal.ts と同じく board を直接書き換える）。
 *
 * ❄氷結（スタックする）: ターン進行でライフが減らない（毒は通る）／隣接⚡のダメージを受けず自マスの⚡は休眠／スキルダメージは❄を1つ外す代わりに無効／
 *   自陣のコマへの上書き（強化）不可／氷結中のマスにはロックが掛からない／自マスか縦横隣に🔥が付くと❄を全部解除
 * 🔥火炎（スタックする）: ターン進行で1スタック2ダメージ（煉獄の鍛冶師の自陣は受けない）／ダメージで全スタック消える
 *   （自然減衰と火炎自身の継続ダメージでは消えない）／スキルダメージ1.5倍（切り上げ）
 */

const FLAME_BURN_DAMAGE = 2;
const FLAME_SKILL_MULT = 1.5;

function orthoNeighbors(i, size) {
    const r = Math.floor(i / size), c = i % size;
    const out = [];
    if (r > 0) out.push(i - size);
    if (r < size - 1) out.push(i + size);
    if (c > 0) out.push(i - 1);
    if (c < size - 1) out.push(i + 1);
    return out;
}

const frozenStacks = (sq) => sq.effects.filter((e) => e.effect === '❄').length;
const isFrozen = (sq) => frozenStacks(sq) > 0;
const flameStacks = (sq) => sq.effects.filter((e) => e.effect === '🔥').length;
const hasLock = (sq) => sq.effects.some((e) => e.effect === '🔑');
const without = (sq, ...kinds) => ({ ...sq, effects: sq.effects.filter((e) => !kinds.includes(e.effect)) });

const thaw = (sq) => (isFrozen(sq) ? without(sq, '❄') : sq);
/** ❄を1つだけ外す */
function thawOne(sq) {
    const k = sq.effects.findIndex((e) => e.effect === '❄');
    if (k === -1) return sq;
    return { ...sq, effects: sq.effects.filter((_, j) => j !== k) };
}
const overwriteBlocked = (sq) => isFrozen(sq);

/** chars = 席ごとのキャラ配列、symbols = 席のシンボル配列（seatOf 用） */
function burnDamageOf(sq, chars, symbols) {
    const stacks = flameStacks(sq);
    if (stacks === 0 || sq.bind <= 0 || isFrozen(sq) || hasLock(sq)) return 0;
    if (sq.player && chars[symbols.indexOf(sq.player)] === 'pyromancer') return 0;
    return stacks * FLAME_BURN_DAMAGE;
}

/** kind: 'skill' | 'electric' | 'poison' */
function applyDamage(sq, amount, kind) {
    if (kind === 'skill' && isFrozen(sq)) return { sq: thawOne(sq), dealt: 0, blocked: true };
    // 隣接⚡のダメージは氷結に当たらない（氷結は解除されず、ダメージも無い）。毒は貫通する
    if (kind === 'electric' && isFrozen(sq)) return { sq, dealt: 0, blocked: false };
    const real = kind === 'skill' && flameStacks(sq) > 0 ? Math.ceil(amount * FLAME_SKILL_MULT) : amount;
    const bind = Math.max(0, sq.bind - real);
    const dealt = sq.bind - bind;
    const next = { ...sq, bind };
    return { sq: dealt > 0 ? without(next, '🔥') : next, dealt, blocked: false };
}
const absorbDestroy = (sq) => (isFrozen(sq) ? { sq: thawOne(sq), blocked: true } : { sq, blocked: false });
const zeroOut = (sq) => (sq.bind > 0 ? without({ ...sq, bind: 0 }, '🔥') : { ...sq, bind: 0 });

function ignite(board, cells, size) {
    const thawed = new Set();
    for (const k of cells) {
        board[k] = { ...board[k], effects: [...board[k].effects, { effect: '🔥' }] };
        for (const n of [k, ...orthoNeighbors(k, size)]) {
            if (isFrozen(board[n])) { board[n] = thaw(board[n]); thawed.add(n); }
        }
    }
    return { thawed: Array.from(thawed) };
}
const canFreeze = (sq) => !!sq.player && !hasLock(sq);
function freeze(board, cells) {
    const done = [];
    for (const k of cells) {
        if (!canFreeze(board[k])) continue;
        // 付くたびにそのマスの🌱を全部除去し、❄を1つ足す（スタック）
        board[k] = { ...board[k], effects: [...board[k].effects.filter((e) => e.effect !== '🌱'), { effect: '❄' }] };
        done.push(k);
    }
    return done;
}
const glacierTargets = (board, player) =>
    board.map((sq, i) => (sq.player === player && sq.bind > 0 && canFreeze(sq) && !isFrozen(sq) ? i : -1)).filter((i) => i !== -1);
const flareTargets = (board, center, size, me) =>
    [center, ...orthoNeighbors(center, size)].filter((k) => {
        const sq = board[k];
        return !!sq.player && sq.player !== me && sq.bind > 0 && !hasLock(sq);
    });

const lockable = (sq) => !isFrozen(sq);
const canThawByClick = (sq, me) => !!sq.player && sq.player !== me && sq.bind > 0 && isFrozen(sq);

module.exports = {
    FLAME_BURN_DAMAGE, FLAME_SKILL_MULT, isFrozen, frozenStacks, flameStacks, thaw, thawOne, overwriteBlocked, burnDamageOf,
    applyDamage, absorbDestroy, zeroOut, ignite, canFreeze, freeze, glacierTargets, flareTargets,
    lockable, canThawByClick,
};
