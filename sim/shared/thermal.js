// 自動生成: src/components/game/thermal.ts (node scripts/gen-sim-shared.js)。手で編集しない。
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sowCandidates = exports.graft = exports.GRAFT_MAX = exports.budReceivers = exports.harvestBuds = exports.canBud = exports.activeBuds = exports.budStacks = exports.burnout = exports.burnoutTargets = exports.burnoutCostOf = exports.totalFlames = exports.BURNOUT_FREE_FLAMES = exports.decayTick = exports.infernoTargets = exports.INFERNO_STACKS = exports.INFERNO_COST = exports.detonate = exports.freezeAll = exports.infernoCostOf = exports.INFERNO_FREE_SKILLS = exports.FLAME_SKILL_KEYS = exports.reducedGlacierCost = exports.GLACIER_DAMAGE_PER_STACK = exports.GLACIER_BASE_COST = exports.cleanse = exports.ailmentStacks = exports.AILMENTS = exports.freeze = exports.canFreeze = exports.ignite = exports.zeroOut = exports.absorbDestroy = exports.applyDamage = exports.isEffectWarded = exports.setEffectWard = exports.burnDamageOf = exports.lockable = exports.emptyBlocked = exports.overwriteBlocked = exports.thawOne = exports.thaw = exports.isDormant = exports.flameStacks = exports.isFrozen = exports.frozenStacks = exports.FLAME_INSTANT_DAMAGE = exports.FLAME_SKILL_MULT = exports.PYROMANCER_EXTRA_BURN = exports.FLAME_BURN_DAMAGE = void 0;
exports.shatter = exports.SHATTER_DAMAGE_PER_STACK = exports.FROSTFALL_MAX_LIFE = exports.leafFrostTargets = exports.fireWheel = exports.FIRE_WHEEL_COUNT = exports.fireWheelTargets = exports.kimon = exports.kimonTargets = exports.fireStacksTotal = exports.KIMON_LOCK_TURNS = exports.thunderFireVictims = exports.THUNDER_FIRE_MIN = exports.thawAll = exports.thawTargets = exports.frostfallTargets = exports.placeFrostToken = exports.randomFreezeCandidates = exports.sacrificeFlame = exports.sacrificeTargets = exports.canSacrifice = exports.placeFlameToken = exports.swidden = exports.autumn = exports.autumnTargets = exports.mulch = exports.mulchCandidates = exports.bonfire = exports.bonfireTargets = exports.placeLeafToken = exports.mogaribue = exports.canMogaribue = exports.mogaribueTargets = exports.mogaribueDamage = exports.MOGARIBUE_LIFE = exports.kindling = exports.kindlingTargets = exports.tinderTargets = exports.leafCloakTargets = exports.leafAllTargets = exports.leafDrop = exports.leafDropTargets = exports.witchCostOf = exports.boardLeaves = exports.leafSurcharge = exports.activeLeaves = exports.leafStacks = exports.sow = exports.SOW_COUNT = void 0;
const Player_1 = require("./Player");
const boardGeometry_1 = require("./boardGeometry");
/** 火炎1スタックあたりの継続ダメージ */
exports.FLAME_BURN_DAMAGE = 2;
/** 煉獄の鍛冶師のパッシブ: 敵（持ち主以外）が火炎ダメージを受けるとき追加で与えるダメージ */
exports.PYROMANCER_EXTRA_BURN = 1;
/** 火炎状態のマスがスキルでダメージを受けるときの倍率（切り上げ） */
exports.FLAME_SKILL_MULT = 1.5;
/** 🔥を付与した瞬間に与えるダメージ（スタック1つにつき。sim/thermal.js と同値） */
exports.FLAME_INSTANT_DAMAGE = 1;
/** 指定エフェクトの個数（配列を作らない数え方。シミュレーションで大量に呼ぶので速さのため） */
const countEffect = (sq, kind) => {
    let n = 0;
    const ef = sq.effects;
    for (let i = 0; i < ef.length; i++)
        if (ef[i].effect === kind)
            n++;
    return n;
};
const frozenStacks = (sq) => countEffect(sq, '❄');
exports.frozenStacks = frozenStacks;
const isFrozen = (sq) => (0, exports.frozenStacks)(sq) > 0;
exports.isFrozen = isFrozen;
const flameStacks = (sq) => countEffect(sq, '🔥');
exports.flameStacks = flameStacks;
/** 休眠マス: 氷結中。マスの他のエフェクト（🌱⚡☠）は消えないが効力を発揮しない（火炎中のマスは休眠しない: 🌱は消え、⚡☠は重複して働く） */
const isDormant = (sq) => (0, exports.isFrozen)(sq);
exports.isDormant = isDormant;
const hasLock = (sq) => countEffect(sq, '🔑') > 0;
const without = (sq, ...kinds) => ({
    ...sq,
    effects: sq.effects.filter((e) => !kinds.includes(e.effect)),
});
/** 氷結を全スタック解除した（マスのコピーを返す。氷結が無ければ同じ参照） */
const thaw = (sq) => ((0, exports.isFrozen)(sq) ? without(sq, '❄') : sq);
exports.thaw = thaw;
/** 氷結を1スタックだけ減らした（氷結が無ければ同じ参照） */
const thawOne = (sq) => {
    const at = sq.effects.findIndex((e) => e.effect === '❄');
    return at === -1 ? sq : { ...sq, effects: sq.effects.filter((_, i) => i !== at) };
};
exports.thawOne = thawOne;
/** 氷結中の自陣コマへの上書き（強化）が禁じられているか */
const overwriteBlocked = (sq) => (0, exports.isFrozen)(sq);
exports.overwriteBlocked = overwriteBlocked;
/** 氷結中の空きマス: 🔑ロックと同様に、誰も着手（設置）できない */
const emptyBlocked = (sq) => !sq.player && (0, exports.isFrozen)(sq);
exports.emptyBlocked = emptyBlocked;
/** 🔑ロックを掛けられるマスか: 氷結中でない */
const lockable = (sq) => !(0, exports.isFrozen)(sq);
exports.lockable = lockable;
/**
 * ターン進行の火炎ダメージ（スタック×2。持ち主以外の席に煉獄の鍛冶師がいれば、1マスの1回の継続ダメージにつき追加で+1）。
 * 氷結中・🔑ロック中・ライフ0のマスは受けない
 */
const burnDamageOf = (sq, chars) => {
    const stacks = (0, exports.flameStacks)(sq);
    if (stacks === 0 || sq.bind <= 0 || (0, exports.isFrozen)(sq) || hasLock(sq) || (0, exports.isEffectWarded)(sq))
        return 0;
    const owner = sq.player ? (0, Player_1.seatOf)(sq.player) : -1;
    const extra = chars.some((c, seat) => c === 'pyromancer' && seat !== owner) ? exports.PYROMANCER_EXTRA_BURN : 0;
    return stacks * exports.FLAME_BURN_DAMAGE + extra;
};
exports.burnDamageOf = burnDamageOf;
// ギア「術中の加護」: 効果(☠🔥⚡)のダメージを受けないマスの述語。Game.tsx / sim/engine.js が手番の状況から差し込む（既定は無し）
let effectWard = () => false;
const setEffectWard = (fn) => {
    effectWard = fn;
};
exports.setEffectWard = setEffectWard;
const isEffectWarded = (sq) => !!sq.player && effectWard(sq);
exports.isEffectWarded = isEffectWarded;
/**
 * マスにダメージを与える。skill は氷結に吸収され（氷結が解除されるだけ）、火炎なら1.5倍（切り上げ）。
 * electric は氷結中のマスには無効（氷結は残る）、poison は氷結を貫通する。どちらも倍率はかからない。skill は1以上ダメージが通ると🔥が全部消える（poison / electric は🔥を消さない）。
 */
const applyDamage = (sq, amount, kind) => {
    if ((kind === 'poison' || kind === 'electric') && (0, exports.isEffectWarded)(sq))
        return { sq, dealt: 0, blocked: false }; // 術中の加護
    if (kind === 'skill' && (0, exports.isFrozen)(sq))
        return { sq: (0, exports.thawOne)(sq), dealt: 0, blocked: true };
    // 隣接⚡のダメージは氷結に当たらない（氷結は解除されず、ダメージも無い）
    if (kind === 'electric' && (0, exports.isFrozen)(sq))
        return { sq, dealt: 0, blocked: false };
    const real = kind === 'skill' && (0, exports.flameStacks)(sq) > 0 ? Math.ceil(amount * exports.FLAME_SKILL_MULT) : amount;
    const bind = Math.max(0, sq.bind - real);
    const dealt = sq.bind - bind;
    const next = { ...sq, bind };
    return { sq: dealt > 0 && kind !== 'poison' && kind !== 'electric' ? without(next, '🔥') : next, dealt, blocked: false }; // 毒・電気のダメージでは🔥は消えない（毒・帯電と火炎は重複する）
};
exports.applyDamage = applyDamage;
/**
 * 「ライフを0にする／破壊する」スキルの前処理。氷結していれば解除だけして守られた（blocked）。
 * そうでなければ元のマスのまま返す（呼び出し側が破壊・ライフ0化を行う）
 */
const absorbDestroy = (sq) => (0, exports.isFrozen)(sq) ? { sq: (0, exports.thawOne)(sq), blocked: true } : { sq, blocked: false };
exports.absorbDestroy = absorbDestroy;
/** ライフを丸ごと0にする（倍率なし）。ライフが残っていたなら🔥は消える。氷結の判定は absorbDestroy で先に行う */
const zeroOut = (sq) => (sq.bind > 0 ? without({ ...sq, bind: 0 }, '🔥') : { ...sq, bind: 0 });
exports.zeroOut = zeroOut;
/**
 * 指定マスに🔥を n スタックずつ付ける（board を直接書き換える）。1スタックごとに、
 * 氷結中のマスなら🔥は付かず代わりに❄が全スタック解除される。🔥が実際に付いたときは、そのマスの縦横隣の氷結が全スタック即座に解除される。
 * cells は先頭から順に処理する。氷結が減った/解けたマスを返す
 */
const ignite = (board, cells, size, n = 1, keepBuds) => {
    var _a;
    const thawed = new Set();
    for (const k of cells) {
        for (let c = 0; c < n; c++) {
            if ((0, exports.isFrozen)(board[k])) {
                board[k] = (0, exports.thaw)(board[k]); // 後から火炎を付けようとすると氷結は全スタック解除される（🔥は付かない）
                thawed.add(k);
                continue;
            }
            // 🔥が付くと🌱と🍂は燃えて消える（冬至の種子のガード中は🌱だけ消えない）。⚡☠は消えず、休眠もしない
            const guarded = (_a = keepBuds === null || keepBuds === void 0 ? void 0 : keepBuds(board[k])) !== null && _a !== void 0 ? _a : false;
            board[k] = { ...board[k], effects: [...board[k].effects.filter((e) => e.effect !== '🍂' && (guarded || e.effect !== '🌱')), { effect: '🔥' }] };
            // 🔥を付与した瞬間に、コマのあるマス(ライフが残り🔑でないもの)へ1ダメージ。ダメージでも🔥は消えない（火炎自身のダメージ）
            if (board[k].player && !hasLock(board[k]) && !(0, exports.isEffectWarded)(board[k])) {
                const left = Math.max(0, board[k].bind - exports.FLAME_INSTANT_DAMAGE);
                // 🔥でライフが0になった(すでに0だった)コマは破壊され、空きマスになる。破壊したら、そのマスにはそれ以上🔥を付けない
                if (left === 0) {
                    board[k] = { player: undefined, bind: 0, effects: [] };
                    break;
                }
                board[k] = { ...board[k], bind: left };
            }
            for (const m of (0, boardGeometry_1.orthoNeighbors)(k, size)) {
                if ((0, exports.isFrozen)(board[m])) {
                    board[m] = (0, exports.thaw)(board[m]);
                    thawed.add(m);
                }
            }
        }
    }
    return { thawed: Array.from(thawed) };
};
exports.ignite = ignite;
/** 氷結を付けられるマスか: 🔑ロック・🔥火炎がない（空きマスにも置け、氷結済みでも重ねられる） */
const canFreeze = (sq) => !hasLock(sq) && (0, exports.flameStacks)(sq) === 0;
exports.canFreeze = canFreeze;
/** 指定マスに❄を付ける（付けられないマスは飛ばす）。⚡は消さない。付いたマスを返す。board を直接書き換える */
const freeze = (board, cells) => {
    const done = [];
    for (const k of cells) {
        if (!(0, exports.canFreeze)(board[k]))
            continue;
        board[k] = { ...board[k], effects: [...board[k].effects, { effect: '❄' }] }; // 🌱は消えないが、氷結中は休眠する（activeBuds）
        done.push(k);
    }
    return done;
};
exports.freeze = freeze;
/** 「状態異常」とみなすエフェクト（浄化の対象）。🌱バッズと🔑ロックは含めない */
exports.AILMENTS = ['☠', '🔥', '❄', '⚡'];
/** マスに付いている状態異常のスタック総数 */
const ailmentStacks = (sq) => sq.effects.filter((e) => exports.AILMENTS.includes(e.effect)).length;
exports.ailmentStacks = ailmentStacks;
/** 浄化（汎用スキル）: player のコマの状態異常（毒・火炎・氷結・帯電）を全スタック除去する。除去したマスを返す。board を直接書き換える */
const cleanse = (board, player) => {
    const done = [];
    board.forEach((sq, i) => {
        if (sq.player !== player || (0, exports.ailmentStacks)(sq) === 0)
            return;
        board[i] = without(sq, ...exports.AILMENTS);
        done.push(i);
    });
    return done;
};
exports.cleanse = cleanse;
/** 絶対零度の基礎コスト。sim/config.js の thermal.glacierCost と同値 */
exports.GLACIER_BASE_COST = 10;
/** 絶対零度が敵コマに与えるダメージ（敵マスに乗っていた❄1スタックにつき） */
exports.GLACIER_DAMAGE_PER_STACK = 3;
/**
 * 絶対零度（氷室の番人）の実コスト: 基礎コストを、氷結が作られた回数（charges。撃つとリセット）だけ軽減してから
 * キャラ補正（calc）をかけ、下限は1。sim/engine.js の glacierCost と同じ
 */
const reducedGlacierCost = (baseCost, charges, calc) => Math.max(1, calc(baseCost - charges));
exports.reducedGlacierCost = reducedGlacierCost;
/** 煉獄の鍛冶師のパッシブでコストが常に-1される、🔥を付与するスキル（コストキー。業火は固有スキルなので含めない）。sim/thermal.js と同じ */
exports.FLAME_SKILL_KEYS = new Set(['onClickIgnite', 'onClickTinder', 'onClickSpark', 'onClickFlameToken', 'onClickDoubleFlameToken', 'onClickSacrifice', 'onClickSwidden', 'onClickFireWheel']);
/** 業火の無料権が付く、1手番に使った異なるスキルの種類数 */
exports.INFERNO_FREE_SKILLS = 3;
/** 業火の実コスト: 無料権（infernoReady）があれば0、なければ calc(基礎コスト)。sim/engine.js の infernoCost と同じ。
 *  無料権は、1手番に異なる種類のスキルを3種類使うと得られ、手番を跨いで持ち越し、業火を撃つと消える（同じスキルの連打は1回と数える） */
const infernoCostOf = (baseCost, infernoReady, calc) => infernoReady ? 0 : calc(baseCost);
exports.infernoCostOf = infernoCostOf;
/** 絶対零度の使用時: 🔑のない全マス（空きマス含む）に❄を1スタック足す。付いたマスを返す。board を直接書き換える */
const freezeAll = (board) => (0, exports.freeze)(board, board.map((_, i) => i));
exports.freezeAll = freezeAll;
/**
 * 絶対零度の発動（使用者 me の次の手番開始時）: me 以外のコマのうち❄が付いているマスに、スタック数×3ダメージ
 * （倍率なし。ダメージが通れば🔥は消える）を与えて❄を全部解除し、ライフが0になったマスは破壊（空きマス化）する。
 * 全マスが凍って誰も着手できなくなるのを避けるため、空きマスの❄も全部解除する（ダメージなし）。自陣のコマの❄だけそのまま。
 * board を直接書き換える
 */
const detonate = (board, me) => {
    const damaged = [];
    const destroyed = [];
    board.forEach((sq, i) => {
        if (!(0, exports.isFrozen)(sq))
            return;
        if (!sq.player) {
            board[i] = (0, exports.thaw)(sq);
            return;
        }
        if (sq.player === me)
            return;
        const hit = (0, exports.applyDamage)((0, exports.thaw)(sq), (0, exports.frozenStacks)(sq) * exports.GLACIER_DAMAGE_PER_STACK, 'pure').sq;
        damaged.push(i);
        if (hit.bind <= 0) {
            board[i] = { player: undefined, bind: 0, effects: [] };
            destroyed.push(i);
        }
        else {
            board[i] = hit;
        }
    });
    return { damaged, destroyed };
};
exports.detonate = detonate;
/** 業火の基礎コスト。sim/config.js の thermal.infernoCost と同値 */
exports.INFERNO_COST = 7;
/** 業火が敵コマ1つに足す🔥のスタック数 */
exports.INFERNO_STACKS = 2;
/** 業火（煉獄の鍛冶師）の対象: 使用者以外のコマのうち、🔑ロック中でなく、雷霆の巫の⚡無敵でないもの（ライフ0も含む） */
const infernoTargets = (board, me, chars) => board
    .map((sq, i) => {
    if (!sq.player || sq.player === me || hasLock(sq))
        return -1;
    // 氷結中のコマは⚡が休眠して無敵も働かない（charge.ts の isShielded と同じ）
    if (chars[(0, Player_1.seatOf)(sq.player)] === 'electrician' && sq.effects.some((e) => e.effect === '⚡') && !(0, exports.isDormant)(sq))
        return -1;
    return i;
})
    .filter((i) => i !== -1);
exports.infernoTargets = infernoTargets;
/**
 * ターン進行1回ぶんのライフ減衰（自然減衰・🔥の継続ダメージ・毒）を1マスに適用した新しいマスを返す。
 * 氷結中は自然減衰と🔥の継続ダメージを受けず、毒は氷結を貫通する（🔥は消さない）。
 * 🔑の期限切れや毒で消えるコマの処理は呼び出し側（Game.tsx / sim/engine.js）が続けて行う。
 */
const decayTick = (sq, chars) => {
    let next = { ...sq, effects: [...sq.effects] };
    if ((next.player || hasLock(next)) && next.bind > 0 && !(0, exports.isFrozen)(next))
        next = { ...next, bind: next.bind - 1 };
    const burn = (0, exports.burnDamageOf)(next, chars);
    if (burn > 0)
        next = { ...next, bind: Math.max(0, next.bind - burn) };
    // 🔥でライフが0になった(0のまま🔥が乗っている)コマは破壊され、空きマスになる（🔑ロック中・氷結中は除く）
    if (next.player && next.bind === 0 && (0, exports.flameStacks)(next) > 0 && !(0, exports.isFrozen)(next) && !hasLock(next) && !(0, exports.isEffectWarded)(next))
        return { player: undefined, bind: 0, effects: [] };
    // 休眠マス（氷結中・火炎中）の☠は継続ダメージを与えない
    const poison = (0, exports.isDormant)(next) ? 0 : next.effects.filter((e) => e.effect === '☠').length;
    if (poison > 0 && next.bind > 0)
        next = (0, exports.applyDamage)(next, poison, 'poison').sq;
    return next;
};
exports.decayTick = decayTick;
// ---- バーンアウト（汎用スキル）----
/** 盤面に🔥がこの数（スタック合計）以上あればバーンアウトはコスト0 */
exports.BURNOUT_FREE_FLAMES = 4;
/** 盤面の🔥のスタック合計 */
const totalFlames = (board) => board.reduce((n, sq) => n + (0, exports.flameStacks)(sq), 0);
exports.totalFlames = totalFlames;
/** バーンアウトの実コスト: 盤面に🔥が4つ以上あれば0、なければ calc(基礎コスト)。sim/engine.js の burnoutCost と同じ */
const burnoutCostOf = (baseCost, flames, calc) => flames >= exports.BURNOUT_FREE_FLAMES ? 0 : calc(baseCost);
exports.burnoutCostOf = burnoutCostOf;
/** バーンアウトの対象: 🔥が乗っているマス全て（敵味方問わず。🔑も関係なし）。雷霆の巫の⚡無敵コマは除く */
const burnoutTargets = (board, chars) => board
    .map((sq, i) => {
    if ((0, exports.flameStacks)(sq) === 0)
        return -1;
    if (sq.player && chars[(0, Player_1.seatOf)(sq.player)] === 'electrician' && sq.effects.some((e) => e.effect === '⚡'))
        return -1;
    return i;
})
    .filter((i) => i !== -1);
exports.burnoutTargets = burnoutTargets;
/** バーンアウト: cells を空きマスにする。破壊したコマの数を返す。board を直接書き換える */
const burnout = (board, cells) => {
    let destroyed = 0;
    for (const k of cells) {
        if (board[k].player)
            destroyed++;
        board[k] = { player: undefined, bind: 0, effects: [] };
    }
    return destroyed;
};
exports.burnout = burnout;
// ---- バッズ系の汎用スキル（刈り入れ前夜・冬至の種子・ひこばえ・風の落とし子）の純粋ロジック ----
// sim/thermal.js と同じ仕様（thermal.test.ts が一致を確認する）。
// 冬至の種子の「🌱ガード」は、activeBuds / harvestBuds の guarded 引数（氷結中でも🌱が働く）と、ignite の keepBuds 述語（🔥が付いても🌱が消えない）として渡す。
/** マスの🌱の数 */
const budStacks = (sq) => countEffect(sq, '🌱');
exports.budStacks = budStacks;
/** 効力を発揮している🌱の数。氷結中のマスの🌱は消えないが魔力ボーナスに数えない。guarded（冬至の種子）なら休眠しない */
const activeBuds = (sq, guarded = false) => (!guarded && (0, exports.isDormant)(sq) ? 0 : (0, exports.budStacks)(sq));
exports.activeBuds = activeBuds;
/** 新しく🌱を持てるコマか: コマがあり、氷結中でなく、🔥が付いていない（付けても氷結・火炎ですぐ消えるため） */
const canBud = (sq) => !!sq.player && !(0, exports.isFrozen)(sq) && (0, exports.flameStacks)(sq) === 0;
exports.canBud = canBud;
/** 刈り入れ前夜: player のコマの🌱を全部除去して、除去した数を返す（休眠マスの🌱には触れない。guarded=冬至の種子なら触れる）。board を直接書き換える */
const harvestBuds = (board, player, guarded = false) => {
    let n = 0;
    board.forEach((sq, i) => {
        if (sq.player !== player || (!guarded && (0, exports.isDormant)(sq)))
            return;
        const k = (0, exports.budStacks)(sq);
        if (k === 0)
            return;
        n += k;
        board[i] = without(sq, '🌱');
    });
    return n;
};
exports.harvestBuds = harvestBuds;
/** ひこばえの受け手: cell の縦横隣にある player のコマのうち、🌱を持てるもの */
const budReceivers = (board, cell, player, size) => (0, boardGeometry_1.orthoNeighbors)(cell, size).filter((k) => board[k].player === player && (0, exports.canBud)(board[k]));
exports.budReceivers = budReceivers;
/** ひこばえで🌱を受け取れる隣の最大数。受け手がこれより多いときはランダムに選ぶ */
exports.GRAFT_MAX = 2;
/**
 * ひこばえ: cell の縦横隣の自陣コマに🌱を1つずつ足す。受け取ったマスを返す。board を直接書き換える。
 * picked を渡すと、受け手（budReceivers）のうち picked に含まれるマスだけに足す（呼び出し側が GRAFT_MAX 個を無作為に選ぶ）。
 * 省略時は受け手すべて
 */
const graft = (board, cell, player, size, picked) => {
    const receivers = (0, exports.budReceivers)(board, cell, player, size).filter((k) => !picked || picked.includes(k));
    for (const k of receivers)
        board[k] = { ...board[k], effects: [...board[k].effects, { effect: '🌱' }] };
    return receivers;
};
exports.graft = graft;
/** 風の落とし子の候補: player のコマで🌱を持てるマス（昇順） */
const sowCandidates = (board, player) => board.map((sq, i) => (sq.player === player && (0, exports.canBud)(sq) ? i : -1)).filter((i) => i !== -1);
exports.sowCandidates = sowCandidates;
/** 風の落とし子で撒く🌱の数。1マスに1つまで（候補が少なければ候補の数だけ） */
exports.SOW_COUNT = 2;
/** 風の落とし子: picks の各マスに🌱を1つずつ足す。board を直接書き換える（呼び出し側が SOW_COUNT 個を重複なく選ぶ） */
const sow = (board, picks) => {
    for (const k of picks)
        board[k] = { ...board[k], effects: [...board[k].effects, { effect: '🌱' }] };
};
exports.sow = sow;
// ---- 🍂落ち葉（🌱バッズの対）。自陣にあると、相手全員のスキルコストが落ち葉の数だけ増える ----
/** マスの🍂の数 */
const leafStacks = (sq) => sq.effects.filter((e) => e.effect === '🍂').length;
exports.leafStacks = leafStacks;
/** 効力を発揮している🍂の数。氷結中のマスの🍂は消えないが休眠する（🌱と同じ） */
const activeLeaves = (sq) => ((0, exports.isDormant)(sq) ? 0 : (0, exports.leafStacks)(sq));
exports.activeLeaves = activeLeaves;
/** player が払うスキルコストの上乗せ: player 以外のコマに乗っている効力のある🍂の総数（全員対象・上限なし） */
const leafSurcharge = (board, player) => board.reduce((n, sq) => (sq.player && sq.player !== player ? n + (0, exports.activeLeaves)(sq) : n), 0);
exports.leafSurcharge = leafSurcharge;
// ---- 凩の魔女（🍂を使うキャラ）----
/** 盤面にある効力のある🍂の総数（敵味方問わず）。凩の魔女のパッシブ: この枚数ぶんスキルコストが下がる（下限1） */
const boardLeaves = (board) => board.reduce((n, sq) => n + (0, exports.activeLeaves)(sq), 0);
exports.boardLeaves = boardLeaves;
/** 凩の魔女のパッシブ: 盤面の🍂1枚につきスキルコスト-1（下限1。もともと1以下のコストは変えない） */
const witchCostOf = (cost, board) => (cost > 1 ? Math.max(1, cost - (0, exports.boardLeaves)(board)) : cost);
exports.witchCostOf = witchCostOf;
// ---- 落ち葉の置き土産・焚きつけ（敵の🍂を使う汎用スキル）----
/** 落ち葉の置き土産の対象: 使用者以外のコマのうち、guarded（🔑ロック・⚡無敵）でないもの（昇順） */
const leafDropTargets = (board, player, guarded) => (0, exports.kimonTargets)(board, player, guarded);
exports.leafDropTargets = leafDropTargets;
/** 落ち葉の置き土産: cell のコマに🍂を1つ付ける（氷結中でも付く。休眠するだけ）。board を直接書き換える */
const leafDrop = (board, cell) => {
    board[cell] = { ...board[cell], effects: [...board[cell].effects, { effect: '🍂' }] };
};
exports.leafDrop = leafDrop;
/** 枯野の相席の対象: 盤面の全てのコマ（敵味方問わず）のうち、guarded（🔑ロック・⚡無敵）でないもの（昇順） */
const leafAllTargets = (board, guarded) => board.map((sq, i) => (sq.player && !guarded(sq, i) ? i : -1)).filter((i) => i !== -1);
exports.leafAllTargets = leafAllTargets;
/** 落葉の衣の候補: 使用者のコマ全て（🔑ロック中も含む。🍂は自陣に不利でないため）。この中からランダムに1つに🍂を付ける */
const leafCloakTargets = (board, me) => board.map((sq, i) => (sq.player === me ? i : -1)).filter((i) => i !== -1);
exports.leafCloakTargets = leafCloakTargets;
/** 火口の対象: 使用者以外のコマのうち、🌱か🍂か❄を持ち、guarded でないもの（昇順）。❄のコマは🔥で氷結が解ける */
const tinderTargets = (board, player, guarded) => board.map((sq, i) => (sq.player && sq.player !== player && ((0, exports.budStacks)(sq) > 0 || (0, exports.leafStacks)(sq) > 0 || (0, exports.isFrozen)(sq)) && !guarded(sq, i) ? i : -1)).filter((i) => i !== -1);
exports.tinderTargets = tinderTargets;
/** 焚きつけの対象: 使用者以外のコマのうち、🍂を持ち、guarded でないもの（昇順） */
const kindlingTargets = (board, player, guarded) => board.map((sq, i) => (sq.player && sq.player !== player && (0, exports.leafStacks)(sq) > 0 && !guarded(sq, i) ? i : -1)).filter((i) => i !== -1);
exports.kindlingTargets = kindlingTargets;
/**
 * 焚きつけ: 対象マスの🍂を全て取り除き、取り除いた🍂1枚につき🔥を1つ付ける（ignite の規則どおり: 氷結中は❄が全解除されて🔥は残りのスタックぶん、
 * 付与の瞬間に1ダメージ・縦横隣の氷結も解ける）。変換した🍂の枚数と、解けたマスを返す。board を直接書き換える
 */
const kindling = (board, cells, size, keepBuds) => {
    let leaves = 0;
    const thawed = [];
    for (const k of cells) {
        const n = (0, exports.leafStacks)(board[k]);
        if (n === 0)
            continue;
        leaves += n;
        board[k] = without(board[k], '🍂');
        thawed.push(...(0, exports.ignite)(board, [k], size, n, keepBuds).thawed);
    }
    return { leaves, thawed };
};
exports.kindling = kindling;
/** 虎落笛で自陣のコマ全てが得るライフ */
exports.MOGARIBUE_LIFE = 2;
/** 虎落笛が敵に与えるダメージ: 使用者の効力のある🍂の枚数 */
const mogaribueDamage = (board, me) => board.reduce((n, sq) => (sq.player === me ? n + (0, exports.activeLeaves)(sq) : n), 0);
exports.mogaribueDamage = mogaribueDamage;
/** 虎落笛の敵の対象: 使用者以外のコマのうち、ライフが残り、🔑ロック中でなく、雷霆の巫の⚡無敵でないもの */
const mogaribueTargets = (board, me, chars) => board
    .map((sq, i) => {
    if (!sq.player || sq.player === me || sq.bind <= 0 || hasLock(sq))
        return -1;
    if (chars[(0, Player_1.seatOf)(sq.player)] === 'electrician' && sq.effects.some((e) => e.effect === '⚡'))
        return -1;
    return i;
})
    .filter((i) => i !== -1);
exports.mogaribueTargets = mogaribueTargets;
/** 虎落笛を撃てるか: 自陣のコマが1つでもある（🍂が0枚でも自陣のライフ+2は入る） */
const canMogaribue = (board, me) => board.some((sq) => sq.player === me);
exports.canMogaribue = canMogaribue;
/**
 * 虎落笛（凩の魔女）: 自陣の🍂の枚数ぶん、敵のコマ全てにスキルダメージ（氷結中は❄が1つ減るだけ、🔥中は1.5倍）を与え、
 * 同時に自陣のコマ全てのライフを+2する。board を直接書き換える
 */
const mogaribue = (board, me, chars) => {
    const damage = (0, exports.mogaribueDamage)(board, me);
    const hit = damage > 0 ? (0, exports.mogaribueTargets)(board, me, chars) : [];
    for (const k of hit)
        board[k] = (0, exports.applyDamage)(board[k], damage, 'skill').sq;
    const boosted = board.map((sq, i) => (sq.player === me ? i : -1)).filter((i) => i !== -1);
    for (const k of boosted)
        board[k] = { ...board[k], bind: board[k].bind + exports.MOGARIBUE_LIFE };
    return { damage, hit, boosted };
};
exports.mogaribue = mogaribue;
/** 🍂付きトークン: idx に player の🍂を n 枚持つコマ（ライフ bind）を置く。board を直接書き換える */
const placeLeafToken = (board, idx, player, bind, n = 1) => {
    board[idx] = { player, bind, effects: Array.from({ length: n }, () => ({ effect: '🍂' })) };
};
exports.placeLeafToken = placeLeafToken;
/** 焚き火の唄の対象: player 以外のコマのうち、🍂を持ち、🔑ロックも❄氷結もないマス（昇順） */
const bonfireTargets = (board, player) => board.map((sq, i) => (sq.player && sq.player !== player && (0, exports.leafStacks)(sq) > 0 && !hasLock(sq) && !(0, exports.isFrozen)(sq) ? i : -1)).filter((i) => i !== -1);
exports.bonfireTargets = bonfireTargets;
/** 焚き火の唄: 対象マスの🍂を全て除去して、除去した枚数とマスを返す。board を直接書き換える */
const bonfire = (board, player) => {
    const cells = (0, exports.bonfireTargets)(board, player);
    let n = 0;
    for (const k of cells) {
        n += (0, exports.leafStacks)(board[k]);
        board[k] = without(board[k], '🍂');
    }
    return { n, cells };
};
exports.bonfire = bonfire;
/** 腐葉土の目覚めの候補: player のコマの🍂を1枚ずつ数えた添字の列（マスの🍂が多いほど当たりやすい。ランダムに1つ選ぶ元） */
const mulchCandidates = (board, player) => board.flatMap((sq, i) => (sq.player === player ? Array((0, exports.leafStacks)(sq)).fill(i) : []));
exports.mulchCandidates = mulchCandidates;
/** 腐葉土の目覚め: cell の🍂を1枚だけ🌱に変える（枚数の順序は保つ）。🍂が無ければ false。board を直接書き換える */
const mulch = (board, cell) => {
    const at = board[cell].effects.findIndex((e) => e.effect === '🍂');
    if (at < 0)
        return false;
    const effects = board[cell].effects.slice();
    effects[at] = { effect: '🌱' };
    board[cell] = { ...board[cell], effects };
    return true;
};
exports.mulch = mulch;
/** 一葉知秋の対象: 🌱を持ち、🔥が付いていないマス（🔥中は🍂がすぐ燃えるので変換しない。冬至の種子で残った🌱がそれにあたる） */
const autumnTargets = (board) => board.map((sq, i) => ((0, exports.budStacks)(sq) > 0 && (0, exports.flameStacks)(sq) === 0 ? i : -1)).filter((i) => i !== -1);
exports.autumnTargets = autumnTargets;
/** 一葉知秋: 盤面の🌱をすべて🍂に変える（敵味方問わず・1枚ずつ）。変えた枚数とマスを返す。board を直接書き換える */
const autumn = (board) => {
    const cells = (0, exports.autumnTargets)(board);
    let n = 0;
    for (const k of cells) {
        n += (0, exports.budStacks)(board[k]);
        board[k] = { ...board[k], effects: board[k].effects.map((e) => (e.effect === '🌱' ? { effect: '🍂' } : e)) };
    }
    return { n, cells };
};
exports.autumn = autumn;
// ---- 火炎系の汎用スキル（火炎トークン・焼畑）の純粋ロジック ----
/**
 * 焼畑: cell の🌱を全て除去し、除去した数と同じ数の🔥に変える（ignite の規則どおり。氷結中なら最初のスタックで氷結が全解除）。
 * 🌱が無いマスなら何もせず n=0。board を直接書き換える。sim/thermal.js の swidden と同じ
 */
const swidden = (board, cell, size) => {
    const n = (0, exports.budStacks)(board[cell]);
    if (n === 0)
        return { n: 0, thawed: [] };
    board[cell] = without(board[cell], '🌱');
    return { n, thawed: (0, exports.ignite)(board, [cell], size, n).thawed };
};
exports.swidden = swidden;
/**
 * 火炎トークン: idx に player の🔥付きのコマ（ライフ bind）を置く。🔥が付くので縦横隣の氷結は全解除される。
 * 解けたマスを返す。board を直接書き換える。sim/thermal.js の placeFlameToken と同じ
 */
const placeFlameToken = (board, idx, player, bind, size) => {
    board[idx] = { player, bind, effects: [] };
    return (0, exports.ignite)(board, [idx], size).thawed;
};
exports.placeFlameToken = placeFlameToken;
// ---- 殉火（仮名）: 自陣のコマを犠牲にして、ライフがそれ以下の敵コマ全てに🔥を付ける ----
/** 殉火の犠牲にできる自陣のコマか: 自分のコマで、ライフが残っていて、🔑ロック中でない */
const canSacrifice = (sq, me) => !!sq.player && sq.player === me && sq.bind > 0 && !hasLock(sq);
exports.canSacrifice = canSacrifice;
/** 殉火の🔥の対象: 使用者以外のコマのうち、ライフが threshold 以下で、🔑ロック中でなく、雷霆の巫の⚡無敵でないもの（ライフ0も含む） */
const sacrificeTargets = (board, threshold, me, chars) => (0, exports.infernoTargets)(board, me, chars).filter((i) => board[i].bind <= threshold);
exports.sacrificeTargets = sacrificeTargets;
/**
 * 殉火: cell の自陣のコマのライフをゼロにして、そのライフ(threshold)以下の敵コマ全てに🔥を1スタック付ける
 * （ignite の規則どおり。氷結中のマスは氷結が全解除されて🔥は付かない）。board を直接書き換える。sim/thermal.js の sacrificeFlame と同じ
 */
const sacrificeFlame = (board, cell, me, chars, size, keepBuds) => {
    const threshold = board[cell].bind;
    board[cell] = (0, exports.zeroOut)(board[cell]);
    const targets = (0, exports.sacrificeTargets)(board, threshold, me, chars);
    return { threshold, targets, thawed: (0, exports.ignite)(board, targets, size, 1, keepBuds).thawed };
};
exports.sacrificeFlame = sacrificeFlame;
// ---- 氷結系の汎用スキル（範囲氷結・氷柱・ランダム氷結・氷結拡散・氷結トークン・砕氷・霜降り）の純粋ロジック ----
// sim/thermal.js と同じ仕様（thermal.test.ts が一致を確認する）。氷結を作った数は絶対零度のコスト軽減に1個ずつ数える。
/** 氷結を付けられるマスの昇順配列（ランダム氷結の候補） */
const randomFreezeCandidates = (board) => board.map((sq, i) => ((0, exports.canFreeze)(sq) ? i : -1)).filter((i) => i !== -1);
exports.randomFreezeCandidates = randomFreezeCandidates;
/** 氷結トークン: idx に❄付きの player のコマ（ライフ bind）を置く。作られた❄の数（1）を返す。board を直接書き換える */
const placeFrostToken = (board, idx, player, bind) => {
    board[idx] = { player, bind, effects: [{ effect: '❄' }] };
    return 1;
};
exports.placeFrostToken = placeFrostToken;
/** 霜降り: player のコマでライフが maxLife 以下（0含む）かつ氷結を付けられるマス（昇順） */
const frostfallTargets = (board, player, maxLife = exports.FROSTFALL_MAX_LIFE) => board.map((sq, i) => (sq.player === player && sq.bind <= maxLife && (0, exports.canFreeze)(sq) ? i : -1)).filter((i) => i !== -1);
exports.frostfallTargets = frostfallTargets;
/** 春一番の対象: player のコマで❄を持つマス（昇順。🔑ロック中でも解ける） */
const thawTargets = (board, player) => board.map((sq, i) => (sq.player === player && (0, exports.isFrozen)(sq) ? i : -1)).filter((i) => i !== -1);
exports.thawTargets = thawTargets;
/** 春一番: player のコマの❄を全スタック解除し、解除した❄の数とマスを返す。board を直接書き換える */
const thawAll = (board, player) => {
    const cells = (0, exports.thawTargets)(board, player);
    let stacks = 0;
    for (const k of cells) {
        stacks += (0, exports.frozenStacks)(board[k]);
        board[k] = (0, exports.thaw)(board[k]);
    }
    return { stacks, cells };
};
exports.thawAll = thawAll;
// ---- 雷のない所に火は立たぬ ----
/** 燃え移る敵コマの最小数（周囲の敵コマがこれより少なければ全部） */
exports.THUNDER_FIRE_MIN = 2;
/**
 * 雷のない所に火は立たぬ: 周囲8マスの敵コマ（cands）から、2〜全部の個数をランダムに決め、その個数だけランダムに選ぶ（昇順）。
 * rng は [0,1) を返す関数。cands が空なら []。sim/thermal.js の thunderFireVictims と同じ
 */
const thunderFireVictims = (cands, rng) => {
    const n = cands.length;
    if (n === 0)
        return [];
    const lo = Math.min(exports.THUNDER_FIRE_MIN, n);
    const k = lo + Math.floor(rng() * (n - lo + 1));
    const pool = cands.slice();
    const out = [];
    for (let i = 0; i < k; i++)
        out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
    return out.sort((a, b) => a - b);
};
exports.thunderFireVictims = thunderFireVictims;
// ---- 鬼門封じ / 火の車 ----
/** 鬼門封じが空きマスにかけるロックの長さ（ターン数。ロックの bind に入れる） */
exports.KIMON_LOCK_TURNS = 3;
/** 盤面全体（敵味方・空きマス含む）の🔥の総数。火の車の「このターンに🔥を付与したか」を、手番開始時（や火の車を撃った直後）との差で見る */
const fireStacksTotal = (board) => board.reduce((n, sq) => n + (0, exports.flameStacks)(sq), 0);
exports.fireStacksTotal = fireStacksTotal;
/** 鬼門封じの対象: player 以外のコマのうち、guarded（🔑ロック・⚡無敵など）でないマス（昇順。氷結中でも選べる） */
const kimonTargets = (board, player, guarded) => board.map((sq, i) => (sq.player && sq.player !== player && !guarded(sq, i) ? i : -1)).filter((i) => i !== -1);
exports.kimonTargets = kimonTargets;
/**
 * 鬼門封じ: cell のコマを破壊する（氷結中なら破壊せず❄を1つ減らすだけ）。破壊して空きマスになったら KIMON_LOCK_TURNS ターンのロックを掛ける。
 * board を直接書き換える。sim/thermal.js の kimon と同じ
 */
const kimon = (board, cell) => {
    if ((0, exports.isFrozen)(board[cell])) {
        board[cell] = (0, exports.thawOne)(board[cell]);
        return { destroyed: false, thawed: true, locked: false };
    }
    board[cell] = { player: undefined, bind: exports.KIMON_LOCK_TURNS, effects: [{ effect: '🔑' }] };
    return { destroyed: true, thawed: false, locked: true };
};
exports.kimon = kimon;
/** 火の車の対象: player 以外のコマのうち、guarded（🔑ロック・⚡無敵など）でないマス（昇順。氷結中でも選べる＝🔥は付かず❄が解ける） */
const fireWheelTargets = (board, player, guarded) => (0, exports.kimonTargets)(board, player, guarded);
exports.fireWheelTargets = fireWheelTargets;
/** 火の車が🔥を付ける敵マスの数 */
exports.FIRE_WHEEL_COUNT = 2;
/** 火の車: picks（呼び出し側がランダムに選んだ敵マス）に🔥を1つずつ付ける（ignite の規則どおり）。解けたマスを返す。board を直接書き換える */
const fireWheel = (board, picks, size, keepBuds) => (0, exports.ignite)(board, picks, size, 1, keepBuds).thawed;
exports.fireWheel = fireWheel;
/** 霜枯れ: player のコマで🍂を持ち、氷結を付けられるマス（昇順）。氷結中は🍂が休眠する点に注意 */
const leafFrostTargets = (board, player) => board.map((sq, i) => (sq.player === player && (0, exports.leafStacks)(sq) > 0 && (0, exports.canFreeze)(sq) ? i : -1)).filter((i) => i !== -1);
exports.leafFrostTargets = leafFrostTargets;
/** 霜降りの対象になるライフの上限 */
exports.FROSTFALL_MAX_LIFE = 2;
/** 砕氷が❄1スタックにつき与えるダメージ */
exports.SHATTER_DAMAGE_PER_STACK = 3;
/**
 * 砕氷: 氷結中のコマのある cell の❄を全部砕き、❄1スタックにつき3ダメージ（倍率なし。ダメージが通れば🔥は消える）。
 * ライフが0以下になったら破壊（空きマス化）。コマが無い/氷結中でないマスは何もしない。board を直接書き換える
 */
const shatter = (board, cell) => {
    const sq = board[cell];
    if (!sq.player || !(0, exports.isFrozen)(sq))
        return { stacks: 0, damage: 0, destroyed: false };
    const stacks = (0, exports.frozenStacks)(sq);
    const damage = stacks * exports.SHATTER_DAMAGE_PER_STACK;
    const hit = (0, exports.applyDamage)((0, exports.thaw)(sq), damage, 'pure').sq;
    if (hit.bind <= 0) {
        board[cell] = { player: undefined, bind: 0, effects: [] };
        return { stacks, damage, destroyed: true };
    }
    board[cell] = hit;
    return { stacks, damage, destroyed: false };
};
exports.shatter = shatter;
