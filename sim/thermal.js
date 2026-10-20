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
/** 休眠マス: 氷結中または火炎中。そのマスの🌱 / ⚡ / ☠ は消えないが効力を発揮しない（氷結と火炎は共存しない） */
const isDormant = (sq) => isFrozen(sq) || sq.effects.some((e) => e.effect === '🔥');
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
    // 煉獄の鍛冶師のパッシブ: 持ち主以外の席に煉獄の鍛冶師が居れば、敵の火炎ダメージが1回につき+1
    const owner = sq.player ? symbols.indexOf(sq.player) : -1;
    const bonus = chars.some((c, seat) => c === 'pyromancer' && seat !== owner) ? 1 : 0;
    return stacks * FLAME_BURN_DAMAGE + bonus;
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

/**
 * cells の各マスに n スタック分、1スタックずつ火炎を付ける。氷結中のマスは「❄を全スタック解除するだけで🔥は付けない」（そのスタックは解凍に使う）。
 * 🔥が実際に付いたときだけ、縦横隣の氷結を全スタック解除する（自マスを解凍しただけなら隣は解除しない）。
 * 戻り値 thawed = 解凍されたマスの添字（重複なし）。cells を先頭から順に処理する。board を直接書き換える
 */
function ignite(board, cells, size, n = 1) {
    const thawed = new Set();
    for (const k of cells) {
        for (let t = 0; t < n; t++) {
            if (isFrozen(board[k])) {
                board[k] = thaw(board[k]); // 氷結中のマスには🔥が付かず、❄を全スタック解除する
                thawed.add(k);
                continue;
            }
            board[k] = { ...board[k], effects: [...board[k].effects, { effect: '🔥' }] }; // 🌱は消えず、休眠するだけ
            for (const nb of orthoNeighbors(k, size)) {
                if (isFrozen(board[nb])) { board[nb] = thaw(board[nb]); thawed.add(nb); }
            }
        }
    }
    return { thawed: Array.from(thawed) };
}
/** 氷結中の空きマス: 🔑ロックと同様に、誰も着手（設置）できない */
const emptyBlocked = (sq) => !sq.player && isFrozen(sq);
/** 氷結を付けられるマスか: 🔑ロック中でなく、🔥火炎も無い（空きマスにも置け、氷結済みでも重ねられる） */
const canFreeze = (sq) => !hasLock(sq) && flameStacks(sq) === 0;
function freeze(board, cells) {
    const done = [];
    for (const k of cells) {
        if (!canFreeze(board[k])) continue;
        board[k] = { ...board[k], effects: [...board[k].effects, { effect: '❄' }] }; // 🌱は消えないが、氷結中は休眠する（activeBuds）
        done.push(k);
    }
    return done;
}
/** 絶対零度の使用時効果: 🔑のない全マス（空きマス含む）に❄を1つ。付いたマスを返す。board を直接書き換える */
const freezeAll = (board) => freeze(board, board.map((_, i) => i));
/**
 * 絶対零度の発動（使用者の次の手番開始時）: 使用者 me 以外のコマで❄が付いたマスに、❄スタック数×3の
 * 倍率なしダメージ（毒扱い=氷結を貫通・通れば🔥は消える）を与えて❄を全除去。ライフが0になったら破壊（空きマス化）。
 * 空きマスの❄は（試合が止まらないよう）ダメージなしで全除去する。自陣コマの❄だけ残す。board を直接書き換える
 */
// ---- 🌱バッズ操作（刈り入れ前夜 / ひこばえ / 風の落とし子） ----
/** 新しく🌱を持てるコマ: コマがあり、氷結も火炎もしていない */
const canBud = (sq) => !!sq.player && !isFrozen(sq) && flameStacks(sq) === 0;
const budStacks = (sq) => sq.effects.filter((e) => e.effect === '🌱').length;
/** 効力を発揮している🌱の数。休眠マス（氷結・火炎中）の🌱は消えないが休眠する（魔力ボーナスに数えない）。guarded=冬至の種子で🌱だけは休眠しない */
const activeBuds = (sq, guarded = false) => (guarded || !isDormant(sq) ? budStacks(sq) : 0);
/** player のコマの🌱を全除去し、除去した🌱の総数を返す（休眠マスの🌱には触れない。guarded なら休眠マスの🌱も対象）。board を直接書き換える */
function harvestBuds(board, player, guarded = false) {
    let n = 0;
    for (let k = 0; k < board.length; k++) {
        const sq = board[k];
        if (sq.player !== player || (!guarded && isDormant(sq))) continue;
        const c = budStacks(sq);
        if (c === 0) continue;
        n += c;
        board[k] = without(sq, '🌱');
    }
    return n;
}
/** cell の縦横隣のうち player のコマで canBud なマス */
const budReceivers = (board, cell, player, size) =>
    orthoNeighbors(cell, size).filter((k) => board[k].player === player && canBud(board[k]));
/** ひこばえで🌱を受け取れる最大数。receivers がこれを超えるときは picked（呼び出し側がランダムに選ぶ）だけに足す */
const GRAFT_MAX = 2;
/** cell の縦横隣の receivers 全部（picked があればその共通部分だけ）に🌱を1つ足す。受け取ったマスを返す。board を直接書き換える */
function graft(board, cell, player, size, picked) {
    const all = budReceivers(board, cell, player, size);
    const got = picked ? all.filter((k) => picked.includes(k)) : all;
    for (const k of got) board[k] = { ...board[k], effects: [...board[k].effects, { effect: '🌱' }] };
    return got;
}
/** player のコマで canBud なマス（昇順） */
const sowCandidates = (board, player) =>
    board.map((sq, i) => (sq.player === player && canBud(sq) ? i : -1)).filter((i) => i !== -1);
/** picks の各添字（重複可）に🌱を1つずつ足す。board を直接書き換える */
function sow(board, picks) {
    for (const k of picks) board[k] = { ...board[k], effects: [...board[k].effects, { effect: '🌱' }] };
}

/** 浄化で除去する状態異常 */
const AILMENTS = ['☠', '🔥', '❄', '⚡'];
/** 浄化: player のコマの状態異常（☠🔥❄⚡）を全スタック除去する。🌱・🔑・空きマス・他人のコマは触らない。除去したマスの添字を返す。board を直接書き換える */
function cleanse(board, player) {
    const done = [];
    for (let k = 0; k < board.length; k++) {
        const sq = board[k];
        if (sq.player !== player || !sq.effects.some((e) => AILMENTS.includes(e.effect))) continue;
        board[k] = { ...sq, effects: sq.effects.filter((e) => !AILMENTS.includes(e.effect)) };
        done.push(k);
    }
    return done;
}
function detonate(board, me) {
    const damaged = [], destroyed = [];
    for (let k = 0; k < board.length; k++) {
        const sq = board[k];
        if (!sq.player) { if (isFrozen(sq)) board[k] = thaw(sq); continue; } // 空きマスの❄はダメージなしで全除去（damaged/destroyed には含めない）
        if (sq.player === me || !isFrozen(sq)) continue;
        const hit = applyDamage(sq, frozenStacks(sq) * 3, 'poison').sq;
        damaged.push(k);
        if (hit.bind <= 0) { board[k] = { player: undefined, bind: 0, effects: [] }; destroyed.push(k); }
        else board[k] = thaw(hit);
    }
    return { damaged, destroyed };
}
/** 業火（煉獄の鍛冶師）: 使用者 me 以外のコマで🔑のないマス（ライフ0も含む）。雷霆の巫の⚡無敵コマは engine 側で除く */
const infernoTargets = (board, me) =>
    board.map((sq, i) => (sq.player && sq.player !== me && !hasLock(sq) ? i : -1)).filter((i) => i !== -1);

/** 🔑ロックを掛けられるマスか: 氷結中でない */
const lockable = (sq) => !isFrozen(sq);

// ---- 焼畑 / 火炎トークン / 殉火 ----
/** 焼畑: cell の🌱を全て除去し、除去した数と同じ数だけ ignite する（氷結中なら最初のスタックで氷結が全解除、残りが🔥）。🌱が無ければ n=0。board を直接書き換える */
function swidden(board, cell, size) {
    const n = budStacks(board[cell]);
    if (n === 0) return { n: 0, thawed: [] };
    board[cell] = without(board[cell], '🌱');
    const { thawed } = ignite(board, [cell], size, n);
    return { n, thawed };
}
/** 火炎トークン: idx に player のコマ（ライフ bind）を置き、直後に🔥を1つ付けて縦横隣の氷結を全解除する。解けたマスを返す。board を直接書き換える */
function placeFlameToken(board, idx, player, bind, size) {
    board[idx] = { player, bind, effects: [] };
    return ignite(board, [idx], size, 1).thawed;
}
/** 殉火の対象の敵マス: cell の自コマのライフ L 以下の、自分以外のコマ（ライフ0も含む。🔑ロック中・isShieldedFn が真の無敵コマは除く）。昇順 */
function sacrificeTargets(board, cell, me, size, isShieldedFn) {
    const L = board[cell].bind;
    return board.map((sq, k) => (sq.player && sq.player !== me && sq.bind <= L && !hasLock(sq) && !(isShieldedFn && isShieldedFn(sq)) ? k : -1)).filter((k) => k !== -1);
}
/** 殉火: 自コマ cell（ライフ>0・🔑なし）のライフをゼロにして、ライフがそれ以下の敵コマ全てに🔥を1スタック。選べない cell なら何もしない。board を直接書き換える */
function sacrificeFlame(board, cell, me, size, isShieldedFn) {
    const sq = board[cell];
    if (!sq.player || sq.player !== me || sq.bind <= 0 || hasLock(sq)) return { threshold: 0, targets: [], thawed: [] };
    const threshold = sq.bind;
    const targets = sacrificeTargets(board, cell, me, size, isShieldedFn);
    board[cell] = zeroOut(sq);
    const { thawed } = ignite(board, targets, size, 1);
    return { threshold, targets, thawed };
}

module.exports = {
    swidden, placeFlameToken, sacrificeTargets, sacrificeFlame,
    FLAME_BURN_DAMAGE, FLAME_SKILL_MULT, isFrozen, frozenStacks, flameStacks, thaw, thawOne, isDormant, overwriteBlocked, burnDamageOf,
    applyDamage, absorbDestroy, zeroOut, ignite, canFreeze, emptyBlocked, freeze, freezeAll, detonate, cleanse, AILMENTS, infernoTargets, canBud, GRAFT_MAX, budStacks, activeBuds, harvestBuds, budReceivers, graft, sowCandidates, sow,
    lockable,
};
