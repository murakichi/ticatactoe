// ❄氷結 / 🔥火炎の純粋ロジック。Game.tsx / AIPlayer.ts で共有する。
// sim/thermal.js と同じ仕様（thermal.test.ts が一致を確認する）。
//
// ❄氷結（スタックする。❄が1つでもあれば氷結中）
//   - 空きマスにも置ける。氷結中の空きマスには🔑ロック中と同様に誰も着手できない
//   - 氷結中のマスの他のエフェクト（🌱⚡☠）は消えないが休眠する（魔力・発火・継続ダメージなどに働かない）。氷結中のマスには🔑ロックを掛けられない（火炎中のマスは休眠しない）
//   - ターン進行（自然減衰・火炎の継続ダメージ）でライフが減らない。毒のダメージは受ける
//   - 隣接する⚡のダメージ（発火・ジャマー）を受けない。氷結中のマス自身の⚡は残るが休眠する（発火せず、ジャマーの起点にもならない。解凍すると再び働く）
//   - スキルでダメージを受けるとき、ダメージを受ける代わりに氷結が1スタック減る
//   - 自陣のコマへの上書き（強化）ができなくなる
//   - 氷結中のマスに🔥を付けようとすると、🔥の代わりに❄が全スタック解除される
//   - 隣（縦横）のマスに🔥が付く（発火する）と、全スタックが即座に解除される
// 🔥火炎（スタックする）
//   - 🔥が付くとそのマスの🌱は消える（冬至の種子のガード中を除く）。⚡と☠は消えず、休眠せず重複して働く
//   - ターン進行のたび、1スタックにつき2ダメージ（ライフ0が下限）。煉獄の鍛冶師がいれば敵のマスは1回の継続ダメージにつき追加で+1
//   - ダメージを受けると全スタックが消える（自然減衰と火炎自身の継続ダメージでは消えない）
//   - スキルでダメージを受けるとき、ダメージが1.5倍（切り上げ）
import { CharacterId } from '../../types/Character';
import { Effect } from '../../types/Effect';
import { seatOf } from '../../types/Player';
import { SquareInfo } from '../../types/SquareInfo';
import { orthoNeighbors } from './boardGeometry';

/** 火炎1スタックあたりの継続ダメージ */
export const FLAME_BURN_DAMAGE = 2;
/** 煉獄の鍛冶師のパッシブ: 敵（持ち主以外）が火炎ダメージを受けるとき追加で与えるダメージ */
export const PYROMANCER_EXTRA_BURN = 1;
/** 火炎状態のマスがスキルでダメージを受けるときの倍率（切り上げ） */
export const FLAME_SKILL_MULT = 1.5;
/** 🔥を付与した瞬間に与えるダメージ（スタック1つにつき。sim/thermal.js と同値） */
export const FLAME_INSTANT_DAMAGE = 1;

export const frozenStacks = (sq: SquareInfo): number => sq.effects.filter((e) => e.effect === '❄').length;
export const isFrozen = (sq: SquareInfo): boolean => sq.effects.some((e) => e.effect === '❄');
export const flameStacks = (sq: SquareInfo): number => sq.effects.filter((e) => e.effect === '🔥').length;
/** 休眠マス: 氷結中。マスの他のエフェクト（🌱⚡☠）は消えないが効力を発揮しない（火炎中のマスは休眠しない: 🌱は消え、⚡☠は重複して働く） */
export const isDormant = (sq: SquareInfo): boolean => isFrozen(sq);

const hasLock = (sq: SquareInfo): boolean => sq.effects.some((e) => e.effect === '🔑');

const without = (sq: SquareInfo, ...kinds: string[]): SquareInfo => ({
    ...sq,
    effects: sq.effects.filter((e) => !kinds.includes(e.effect)),
});

/** 氷結を全スタック解除した（マスのコピーを返す。氷結が無ければ同じ参照） */
export const thaw = (sq: SquareInfo): SquareInfo => (isFrozen(sq) ? without(sq, '❄') : sq);

/** 氷結を1スタックだけ減らした（氷結が無ければ同じ参照） */
export const thawOne = (sq: SquareInfo): SquareInfo => {
    const at = sq.effects.findIndex((e) => e.effect === '❄');
    return at === -1 ? sq : { ...sq, effects: sq.effects.filter((_, i) => i !== at) };
};

/** 氷結中の自陣コマへの上書き（強化）が禁じられているか */
export const overwriteBlocked = (sq: SquareInfo): boolean => isFrozen(sq);

/** 氷結中の空きマス: 🔑ロックと同様に、誰も着手（設置）できない */
export const emptyBlocked = (sq: SquareInfo): boolean => !sq.player && isFrozen(sq);

/** 🔑ロックを掛けられるマスか: 氷結中でない */
export const lockable = (sq: SquareInfo): boolean => !isFrozen(sq);

/**
 * ターン進行の火炎ダメージ（スタック×2。持ち主以外の席に煉獄の鍛冶師がいれば、1マスの1回の継続ダメージにつき追加で+1）。
 * 氷結中・🔑ロック中・ライフ0のマスは受けない
 */
export const burnDamageOf = (sq: SquareInfo, chars: readonly CharacterId[]): number => {
    const stacks = flameStacks(sq);
    if (stacks === 0 || sq.bind <= 0 || isFrozen(sq) || hasLock(sq) || isEffectWarded(sq)) return 0;
    const owner = sq.player ? seatOf(sq.player) : -1;
    const extra = chars.some((c, seat) => c === 'pyromancer' && seat !== owner) ? PYROMANCER_EXTRA_BURN : 0;
    return stacks * FLAME_BURN_DAMAGE + extra;
};

// ギア「術中の加護」: 効果(☠🔥⚡)のダメージを受けないマスの述語。Game.tsx / sim/engine.js が手番の状況から差し込む（既定は無し）
let effectWard: (sq: SquareInfo) => boolean = () => false;
export const setEffectWard = (fn: (sq: SquareInfo) => boolean): void => {
    effectWard = fn;
};
export const isEffectWarded = (sq: SquareInfo): boolean => !!sq.player && effectWard(sq);

/** pure = 倍率なし・氷結貫通で、通れば🔥が消える（砕氷・絶対零度）。poison は🔥を消さない */
export type DamageKind = 'skill' | 'electric' | 'poison' | 'pure';

export type DamageResult = {
    sq: SquareInfo;
    /** 実際に減ったライフ */
    dealt: number;
    /** スキルダメージが氷結に吸収された */
    blocked: boolean;
};

/**
 * マスにダメージを与える。skill は氷結に吸収され（氷結が解除されるだけ）、火炎なら1.5倍（切り上げ）。
 * electric は氷結中のマスには無効（氷結は残る）、poison は氷結を貫通する。どちらも倍率はかからない。skill は1以上ダメージが通ると🔥が全部消える（poison / electric は🔥を消さない）。
 */
export const applyDamage = (sq: SquareInfo, amount: number, kind: DamageKind): DamageResult => {
    if ((kind === 'poison' || kind === 'electric') && isEffectWarded(sq)) return { sq, dealt: 0, blocked: false }; // 術中の加護
    if (kind === 'skill' && isFrozen(sq)) return { sq: thawOne(sq), dealt: 0, blocked: true };
    // 隣接⚡のダメージは氷結に当たらない（氷結は解除されず、ダメージも無い）
    if (kind === 'electric' && isFrozen(sq)) return { sq, dealt: 0, blocked: false };
    const real = kind === 'skill' && flameStacks(sq) > 0 ? Math.ceil(amount * FLAME_SKILL_MULT) : amount;
    const bind = Math.max(0, sq.bind - real);
    const dealt = sq.bind - bind;
    const next = { ...sq, bind };
    return { sq: dealt > 0 && kind !== 'poison' && kind !== 'electric' ? without(next, '🔥') : next, dealt, blocked: false }; // 毒・電気のダメージでは🔥は消えない（毒・帯電と火炎は重複する）
};

/**
 * 「ライフを0にする／破壊する」スキルの前処理。氷結していれば解除だけして守られた（blocked）。
 * そうでなければ元のマスのまま返す（呼び出し側が破壊・ライフ0化を行う）
 */
export const absorbDestroy = (sq: SquareInfo): { sq: SquareInfo; blocked: boolean } =>
    isFrozen(sq) ? { sq: thawOne(sq), blocked: true } : { sq, blocked: false };

/** ライフを丸ごと0にする（倍率なし）。ライフが残っていたなら🔥は消える。氷結の判定は absorbDestroy で先に行う */
export const zeroOut = (sq: SquareInfo): SquareInfo => (sq.bind > 0 ? without({ ...sq, bind: 0 }, '🔥') : { ...sq, bind: 0 });

/**
 * 指定マスに🔥を n スタックずつ付ける（board を直接書き換える）。1スタックごとに、
 * 氷結中のマスなら🔥は付かず代わりに❄が全スタック解除される。🔥が実際に付いたときは、そのマスの縦横隣の氷結が全スタック即座に解除される。
 * cells は先頭から順に処理する。氷結が減った/解けたマスを返す
 */
export const ignite = (
    board: SquareInfo[],
    cells: number[],
    size: number,
    n: number = 1,
    keepBuds?: (sq: SquareInfo) => boolean
): { thawed: number[] } => {
    const thawed = new Set<number>();
    for (const k of cells) {
        for (let c = 0; c < n; c++) {
            if (isFrozen(board[k])) {
                board[k] = thaw(board[k]); // 後から火炎を付けようとすると氷結は全スタック解除される（🔥は付かない）
                thawed.add(k);
                continue;
            }
            // 🔥が付くと🌱と🍂は燃えて消える（冬至の種子のガード中は🌱だけ消えない）。⚡☠は消えず、休眠もしない
            const guarded = keepBuds?.(board[k]) ?? false;
            board[k] = { ...board[k], effects: [...board[k].effects.filter((e) => e.effect !== '🍂' && (guarded || e.effect !== '🌱')), { effect: '🔥' }] };
            // 🔥を付与した瞬間に、コマのあるマス(ライフが残り🔑でないもの)へ1ダメージ。ダメージでも🔥は消えない（火炎自身のダメージ）
            if (board[k].player && !hasLock(board[k]) && !isEffectWarded(board[k])) {
                const left = Math.max(0, board[k].bind - FLAME_INSTANT_DAMAGE);
                // 🔥でライフが0になった(すでに0だった)コマは破壊され、空きマスになる。破壊したら、そのマスにはそれ以上🔥を付けない
                if (left === 0) {
                    board[k] = { player: undefined, bind: 0, effects: [] };
                    break;
                }
                board[k] = { ...board[k], bind: left };
            }
            for (const m of orthoNeighbors(k, size)) {
                if (isFrozen(board[m])) {
                    board[m] = thaw(board[m]);
                    thawed.add(m);
                }
            }
        }
    }
    return { thawed: Array.from(thawed) };
};

/** 氷結を付けられるマスか: 🔑ロック・🔥火炎がない（空きマスにも置け、氷結済みでも重ねられる） */
export const canFreeze = (sq: SquareInfo): boolean => !hasLock(sq) && flameStacks(sq) === 0;

/** 指定マスに❄を付ける（付けられないマスは飛ばす）。⚡は消さない。付いたマスを返す。board を直接書き換える */
export const freeze = (board: SquareInfo[], cells: number[]): number[] => {
    const done: number[] = [];
    for (const k of cells) {
        if (!canFreeze(board[k])) continue;
        board[k] = { ...board[k], effects: [...board[k].effects, { effect: '❄' }] }; // 🌱は消えないが、氷結中は休眠する（activeBuds）
        done.push(k);
    }
    return done;
};

/** 「状態異常」とみなすエフェクト（浄化の対象）。🌱バッズと🔑ロックは含めない */
export const AILMENTS: Effect['effect'][] = ['☠', '🔥', '❄', '⚡'];

/** マスに付いている状態異常のスタック総数 */
export const ailmentStacks = (sq: SquareInfo): number => sq.effects.filter((e) => AILMENTS.includes(e.effect)).length;

/** 浄化（汎用スキル）: player のコマの状態異常（毒・火炎・氷結・帯電）を全スタック除去する。除去したマスを返す。board を直接書き換える */
export const cleanse = (board: SquareInfo[], player: SquareInfo['player']): number[] => {
    const done: number[] = [];
    board.forEach((sq, i) => {
        if (sq.player !== player || ailmentStacks(sq) === 0) return;
        board[i] = without(sq, ...AILMENTS);
        done.push(i);
    });
    return done;
};

/** 絶対零度の基礎コスト。sim/config.js の thermal.glacierCost と同値 */
export const GLACIER_BASE_COST = 10;
/** 絶対零度が敵コマに与えるダメージ（敵マスに乗っていた❄1スタックにつき） */
export const GLACIER_DAMAGE_PER_STACK = 3;

/**
 * 絶対零度（氷室の番人）の実コスト: 基礎コストを、氷結が作られた回数（charges。撃つとリセット）だけ軽減してから
 * キャラ補正（calc）をかけ、下限は1。sim/engine.js の glacierCost と同じ
 */
export const reducedGlacierCost = (baseCost: number, charges: number, calc: (cost: number) => number): number =>
    Math.max(1, calc(baseCost - charges));
/** 煉獄の鍛冶師のパッシブでコストが常に-1される、🔥を付与するスキル（コストキー。業火は固有スキルなので含めない）。sim/thermal.js と同じ */
export const FLAME_SKILL_KEYS: ReadonlySet<string> = new Set(['onClickIgnite', 'onClickFlameToken', 'onClickDoubleFlameToken', 'onClickSacrifice', 'onClickSwidden', 'onClickFireWheel']);
/** 業火の無料権が付く、1手番に使った異なるスキルの種類数 */
export const INFERNO_FREE_SKILLS = 3;
/** 業火の実コスト: 無料権（infernoReady）があれば0、なければ calc(基礎コスト)。sim/engine.js の infernoCost と同じ。
 *  無料権は、1手番に異なる種類のスキルを3種類使うと得られ、手番を跨いで持ち越し、業火を撃つと消える（同じスキルの連打は1回と数える） */
export const infernoCostOf = (baseCost: number, infernoReady: boolean, calc: (cost: number) => number): number =>
    infernoReady ? 0 : calc(baseCost);
/** 絶対零度の使用時: 🔑のない全マス（空きマス含む）に❄を1スタック足す。付いたマスを返す。board を直接書き換える */
export const freezeAll = (board: SquareInfo[]): number[] =>
    freeze(
        board,
        board.map((_, i) => i)
    );

export type DetonateResult = {
    /** ❄のダメージを受けたマス（破壊されたマス含む） */
    damaged: number[];
    /** ライフが0になって破壊されたマス */
    destroyed: number[];
};

/**
 * 絶対零度の発動（使用者 me の次の手番開始時）: me 以外のコマのうち❄が付いているマスに、スタック数×3ダメージ
 * （倍率なし。ダメージが通れば🔥は消える）を与えて❄を全部解除し、ライフが0になったマスは破壊（空きマス化）する。
 * 全マスが凍って誰も着手できなくなるのを避けるため、空きマスの❄も全部解除する（ダメージなし）。自陣のコマの❄だけそのまま。
 * board を直接書き換える
 */
export const detonate = (board: SquareInfo[], me: SquareInfo['player']): DetonateResult => {
    const damaged: number[] = [];
    const destroyed: number[] = [];
    board.forEach((sq, i) => {
        if (!isFrozen(sq)) return;
        if (!sq.player) {
            board[i] = thaw(sq);
            return;
        }
        if (sq.player === me) return;
        const hit = applyDamage(thaw(sq), frozenStacks(sq) * GLACIER_DAMAGE_PER_STACK, 'pure').sq;
        damaged.push(i);
        if (hit.bind <= 0) {
            board[i] = { player: undefined, bind: 0, effects: [] };
            destroyed.push(i);
        } else {
            board[i] = hit;
        }
    });
    return { damaged, destroyed };
};

/** 業火の基礎コスト。sim/config.js の thermal.infernoCost と同値 */
export const INFERNO_COST = 7;
/** 業火が敵コマ1つに足す🔥のスタック数 */
export const INFERNO_STACKS = 2;

/** 業火（煉獄の鍛冶師）の対象: 使用者以外のコマのうち、🔑ロック中でなく、雷霆の巫の⚡無敵でないもの（ライフ0も含む） */
export const infernoTargets = (board: SquareInfo[], me: SquareInfo['player'], chars: readonly CharacterId[]): number[] =>
    board
        .map((sq, i) => {
            if (!sq.player || sq.player === me || hasLock(sq)) return -1;
            if (chars[seatOf(sq.player)] === 'electrician' && sq.effects.some((e) => e.effect === '⚡')) return -1;
            return i;
        })
        .filter((i) => i !== -1);

/**
 * ターン進行1回ぶんのライフ減衰（自然減衰・🔥の継続ダメージ・毒）を1マスに適用した新しいマスを返す。
 * 氷結中は自然減衰と🔥の継続ダメージを受けず、毒は氷結を貫通する（🔥は消さない）。
 * 🔑の期限切れや毒で消えるコマの処理は呼び出し側（Game.tsx / sim/engine.js）が続けて行う。
 */
export const decayTick = (sq: SquareInfo, chars: readonly CharacterId[]): SquareInfo => {
    let next: SquareInfo = { ...sq, effects: [...sq.effects] };
    if ((next.player || hasLock(next)) && next.bind > 0 && !isFrozen(next)) next = { ...next, bind: next.bind - 1 };
    const burn = burnDamageOf(next, chars);
    if (burn > 0) next = { ...next, bind: Math.max(0, next.bind - burn) };
    // 🔥でライフが0になった(0のまま🔥が乗っている)コマは破壊され、空きマスになる（🔑ロック中・氷結中は除く）
    if (next.player && next.bind === 0 && flameStacks(next) > 0 && !isFrozen(next) && !hasLock(next) && !isEffectWarded(next)) return { player: undefined, bind: 0, effects: [] };
    // 休眠マス（氷結中・火炎中）の☠は継続ダメージを与えない
    const poison = isDormant(next) ? 0 : next.effects.filter((e) => e.effect === '☠').length;
    if (poison > 0 && next.bind > 0) next = applyDamage(next, poison, 'poison').sq;
    return next;
};

// ---- バーンアウト（汎用スキル）----
/** 盤面に🔥がこの数（スタック合計）以上あればバーンアウトはコスト0 */
export const BURNOUT_FREE_FLAMES = 4;
/** 盤面の🔥のスタック合計 */
export const totalFlames = (board: SquareInfo[]): number => board.reduce((n, sq) => n + flameStacks(sq), 0);
/** バーンアウトの実コスト: 盤面に🔥が4つ以上あれば0、なければ calc(基礎コスト)。sim/engine.js の burnoutCost と同じ */
export const burnoutCostOf = (baseCost: number, flames: number, calc: (cost: number) => number): number =>
    flames >= BURNOUT_FREE_FLAMES ? 0 : calc(baseCost);
/** バーンアウトの対象: 🔥が乗っているマス全て（敵味方問わず。🔑も関係なし）。雷霆の巫の⚡無敵コマは除く */
export const burnoutTargets = (board: SquareInfo[], chars: readonly CharacterId[]): number[] =>
    board
        .map((sq, i) => {
            if (flameStacks(sq) === 0) return -1;
            if (sq.player && chars[seatOf(sq.player)] === 'electrician' && sq.effects.some((e) => e.effect === '⚡')) return -1;
            return i;
        })
        .filter((i) => i !== -1);
/** バーンアウト: cells を空きマスにする。破壊したコマの数を返す。board を直接書き換える */
export const burnout = (board: SquareInfo[], cells: number[]): number => {
    let destroyed = 0;
    for (const k of cells) {
        if (board[k].player) destroyed++;
        board[k] = { player: undefined, bind: 0, effects: [] };
    }
    return destroyed;
};

// ---- バッズ系の汎用スキル（刈り入れ前夜・冬至の種子・ひこばえ・風の落とし子）の純粋ロジック ----
// sim/thermal.js と同じ仕様（thermal.test.ts が一致を確認する）。
// 冬至の種子の「🌱ガード」は、activeBuds / harvestBuds の guarded 引数（氷結中でも🌱が働く）と、ignite の keepBuds 述語（🔥が付いても🌱が消えない）として渡す。

/** マスの🌱の数 */
export const budStacks = (sq: SquareInfo): number => sq.effects.filter((e) => e.effect === '🌱').length;

/** 効力を発揮している🌱の数。氷結中のマスの🌱は消えないが魔力ボーナスに数えない。guarded（冬至の種子）なら休眠しない */
export const activeBuds = (sq: SquareInfo, guarded: boolean = false): number => (!guarded && isDormant(sq) ? 0 : budStacks(sq));

/** 新しく🌱を持てるコマか: コマがあり、氷結中でなく、🔥が付いていない（付けても氷結・火炎ですぐ消えるため） */
export const canBud = (sq: SquareInfo): boolean => !!sq.player && !isFrozen(sq) && flameStacks(sq) === 0;

/** 刈り入れ前夜: player のコマの🌱を全部除去して、除去した数を返す（休眠マスの🌱には触れない。guarded=冬至の種子なら触れる）。board を直接書き換える */
export const harvestBuds = (board: SquareInfo[], player: SquareInfo['player'], guarded: boolean = false): number => {
    let n = 0;
    board.forEach((sq, i) => {
        if (sq.player !== player || (!guarded && isDormant(sq))) return;
        const k = budStacks(sq);
        if (k === 0) return;
        n += k;
        board[i] = without(sq, '🌱');
    });
    return n;
};

/** ひこばえの受け手: cell の縦横隣にある player のコマのうち、🌱を持てるもの */
export const budReceivers = (board: SquareInfo[], cell: number, player: SquareInfo['player'], size: number): number[] =>
    orthoNeighbors(cell, size).filter((k) => board[k].player === player && canBud(board[k]));

/** ひこばえで🌱を受け取れる隣の最大数。受け手がこれより多いときはランダムに選ぶ */
export const GRAFT_MAX = 2;

/**
 * ひこばえ: cell の縦横隣の自陣コマに🌱を1つずつ足す。受け取ったマスを返す。board を直接書き換える。
 * picked を渡すと、受け手（budReceivers）のうち picked に含まれるマスだけに足す（呼び出し側が GRAFT_MAX 個を無作為に選ぶ）。
 * 省略時は受け手すべて
 */
export const graft = (board: SquareInfo[], cell: number, player: SquareInfo['player'], size: number, picked?: number[]): number[] => {
    const receivers = budReceivers(board, cell, player, size).filter((k) => !picked || picked.includes(k));
    for (const k of receivers) board[k] = { ...board[k], effects: [...board[k].effects, { effect: '🌱' }] };
    return receivers;
};

/** 風の落とし子の候補: player のコマで🌱を持てるマス（昇順） */
export const sowCandidates = (board: SquareInfo[], player: SquareInfo['player']): number[] =>
    board.map((sq, i) => (sq.player === player && canBud(sq) ? i : -1)).filter((i) => i !== -1);

/** 風の落とし子で撒く🌱の数。1マスに1つまで（候補が少なければ候補の数だけ） */
export const SOW_COUNT = 2;

/** 風の落とし子: picks の各マスに🌱を1つずつ足す。board を直接書き換える（呼び出し側が SOW_COUNT 個を重複なく選ぶ） */
export const sow = (board: SquareInfo[], picks: number[]): void => {
    for (const k of picks) board[k] = { ...board[k], effects: [...board[k].effects, { effect: '🌱' }] };
};

// ---- 🍂落ち葉（🌱バッズの対）。自陣にあると、相手全員のスキルコストが落ち葉の数だけ増える ----

/** マスの🍂の数 */
export const leafStacks = (sq: SquareInfo): number => sq.effects.filter((e) => e.effect === '🍂').length;

/** 効力を発揮している🍂の数。氷結中のマスの🍂は消えないが休眠する（🌱と同じ） */
export const activeLeaves = (sq: SquareInfo): number => (isDormant(sq) ? 0 : leafStacks(sq));

/** player が払うスキルコストの上乗せ: player 以外のコマに乗っている効力のある🍂の総数（全員対象・上限なし） */
export const leafSurcharge = (board: SquareInfo[], player: SquareInfo['player']): number =>
    board.reduce((n, sq) => (sq.player && sq.player !== player ? n + activeLeaves(sq) : n), 0);

// ---- 凩の魔女（🍂を使うキャラ）----

/** 盤面にある効力のある🍂の総数（敵味方問わず）。凩の魔女のパッシブ: この枚数ぶんスキルコストが下がる（下限1） */
export const boardLeaves = (board: SquareInfo[]): number => board.reduce((n, sq) => n + activeLeaves(sq), 0);

/** 凩の魔女のパッシブ: 盤面の🍂1枚につきスキルコスト-1（下限1。もともと1以下のコストは変えない） */
export const witchCostOf = (cost: number, board: SquareInfo[]): number => (cost > 1 ? Math.max(1, cost - boardLeaves(board)) : cost);

// ---- 落ち葉の置き土産・焚きつけ（敵の🍂を使う汎用スキル）----

/** 落ち葉の置き土産の対象: 使用者以外のコマのうち、guarded（🔑ロック・⚡無敵）でないもの（昇順） */
export const leafDropTargets = (board: SquareInfo[], player: SquareInfo['player'], guarded: (sq: SquareInfo, i: number) => boolean): number[] =>
    kimonTargets(board, player, guarded);

/** 落ち葉の置き土産: cell のコマに🍂を1つ付ける（氷結中でも付く。休眠するだけ）。board を直接書き換える */
export const leafDrop = (board: SquareInfo[], cell: number): void => {
    board[cell] = { ...board[cell], effects: [...board[cell].effects, { effect: '🍂' }] };
};

/** 枯野の相席の対象: 盤面の全てのコマ（敵味方問わず）のうち、guarded（🔑ロック・⚡無敵）でないもの（昇順） */
export const leafAllTargets = (board: SquareInfo[], guarded: (sq: SquareInfo, i: number) => boolean): number[] =>
    board.map((sq, i) => (sq.player && !guarded(sq, i) ? i : -1)).filter((i) => i !== -1);

/** 落葉の衣の候補: 使用者のコマ全て（🔑ロック中も含む。🍂は自陣に不利でないため）。この中からランダムに1つに🍂を付ける */
export const leafCloakTargets = (board: SquareInfo[], me: SquareInfo['player']): number[] =>
    board.map((sq, i) => (sq.player === me ? i : -1)).filter((i) => i !== -1);

/** 焚きつけの対象: 使用者以外のコマのうち、🍂を持ち、guarded でないもの（昇順） */
export const kindlingTargets = (board: SquareInfo[], player: SquareInfo['player'], guarded: (sq: SquareInfo, i: number) => boolean): number[] =>
    board.map((sq, i) => (sq.player && sq.player !== player && leafStacks(sq) > 0 && !guarded(sq, i) ? i : -1)).filter((i) => i !== -1);

/**
 * 焚きつけ: 対象マスの🍂を全て取り除き、取り除いた🍂1枚につき🔥を1つ付ける（ignite の規則どおり: 氷結中は❄が全解除されて🔥は残りのスタックぶん、
 * 付与の瞬間に1ダメージ・縦横隣の氷結も解ける）。変換した🍂の枚数と、解けたマスを返す。board を直接書き換える
 */
export const kindling = (board: SquareInfo[], cells: number[], size: number, keepBuds?: (sq: SquareInfo) => boolean): { leaves: number; thawed: number[] } => {
    let leaves = 0;
    const thawed: number[] = [];
    for (const k of cells) {
        const n = leafStacks(board[k]);
        if (n === 0) continue;
        leaves += n;
        board[k] = without(board[k], '🍂');
        thawed.push(...ignite(board, [k], size, n, keepBuds).thawed);
    }
    return { leaves, thawed };
};

/** 虎落笛で自陣のコマ全てが得るライフ */
export const MOGARIBUE_LIFE = 2;

/** 虎落笛が敵に与えるダメージ: 使用者の効力のある🍂の枚数 */
export const mogaribueDamage = (board: SquareInfo[], me: SquareInfo['player']): number =>
    board.reduce((n, sq) => (sq.player === me ? n + activeLeaves(sq) : n), 0);

/** 虎落笛の敵の対象: 使用者以外のコマのうち、ライフが残り、🔑ロック中でなく、雷霆の巫の⚡無敵でないもの */
export const mogaribueTargets = (board: SquareInfo[], me: SquareInfo['player'], chars: readonly (CharacterId | undefined)[]): number[] =>
    board
        .map((sq, i) => {
            if (!sq.player || sq.player === me || sq.bind <= 0 || hasLock(sq)) return -1;
            if (chars[seatOf(sq.player)] === 'electrician' && sq.effects.some((e) => e.effect === '⚡')) return -1;
            return i;
        })
        .filter((i) => i !== -1);

/** 虎落笛を撃てるか: 自陣のコマが1つでもある（🍂が0枚でも自陣のライフ+2は入る） */
export const canMogaribue = (board: SquareInfo[], me: SquareInfo['player']): boolean => board.some((sq) => sq.player === me);

export type MogaribueResult = {
    /** 敵に与えたダメージ（使用者の🍂の枚数） */
    damage: number;
    /** ダメージを与えようとした敵マス（氷結が肩代わりしたマスも含む） */
    hit: number[];
    /** ライフ+2を受けた自陣のマス */
    boosted: number[];
};

/**
 * 虎落笛（凩の魔女）: 自陣の🍂の枚数ぶん、敵のコマ全てにスキルダメージ（氷結中は❄が1つ減るだけ、🔥中は1.5倍）を与え、
 * 同時に自陣のコマ全てのライフを+2する。board を直接書き換える
 */
export const mogaribue = (board: SquareInfo[], me: SquareInfo['player'], chars: readonly (CharacterId | undefined)[]): MogaribueResult => {
    const damage = mogaribueDamage(board, me);
    const hit = damage > 0 ? mogaribueTargets(board, me, chars) : [];
    for (const k of hit) board[k] = applyDamage(board[k], damage, 'skill').sq;
    const boosted = board.map((sq, i) => (sq.player === me ? i : -1)).filter((i) => i !== -1);
    for (const k of boosted) board[k] = { ...board[k], bind: board[k].bind + MOGARIBUE_LIFE };
    return { damage, hit, boosted };
};

/** 🍂付きトークン: idx に player の🍂を n 枚持つコマ（ライフ bind）を置く。board を直接書き換える */
export const placeLeafToken = (board: SquareInfo[], idx: number, player: SquareInfo['player'], bind: number, n: number = 1): void => {
    board[idx] = { player, bind, effects: Array.from({ length: n }, () => ({ effect: '🍂' as const })) };
};

/** 焚き火の唄の対象: player 以外のコマのうち、🍂を持ち、🔑ロックも❄氷結もないマス（昇順） */
export const bonfireTargets = (board: SquareInfo[], player: SquareInfo['player']): number[] =>
    board.map((sq, i) => (sq.player && sq.player !== player && leafStacks(sq) > 0 && !hasLock(sq) && !isFrozen(sq) ? i : -1)).filter((i) => i !== -1);

/** 焚き火の唄: 対象マスの🍂を全て除去して、除去した枚数とマスを返す。board を直接書き換える */
export const bonfire = (board: SquareInfo[], player: SquareInfo['player']): { n: number; cells: number[] } => {
    const cells = bonfireTargets(board, player);
    let n = 0;
    for (const k of cells) {
        n += leafStacks(board[k]);
        board[k] = without(board[k], '🍂');
    }
    return { n, cells };
};

/** 腐葉土の目覚めの候補: player のコマの🍂を1枚ずつ数えた添字の列（マスの🍂が多いほど当たりやすい。ランダムに1つ選ぶ元） */
export const mulchCandidates = (board: SquareInfo[], player: SquareInfo['player']): number[] =>
    board.flatMap((sq, i) => (sq.player === player ? Array<number>(leafStacks(sq)).fill(i) : []));

/** 腐葉土の目覚め: cell の🍂を1枚だけ🌱に変える（枚数の順序は保つ）。🍂が無ければ false。board を直接書き換える */
export const mulch = (board: SquareInfo[], cell: number): boolean => {
    const at = board[cell].effects.findIndex((e) => e.effect === '🍂');
    if (at < 0) return false;
    const effects = board[cell].effects.slice();
    effects[at] = { effect: '🌱' };
    board[cell] = { ...board[cell], effects };
    return true;
};

/** 一葉知秋の対象: 🌱を持ち、🔥が付いていないマス（🔥中は🍂がすぐ燃えるので変換しない。冬至の種子で残った🌱がそれにあたる） */
export const autumnTargets = (board: SquareInfo[]): number[] =>
    board.map((sq, i) => (budStacks(sq) > 0 && flameStacks(sq) === 0 ? i : -1)).filter((i) => i !== -1);

/** 一葉知秋: 盤面の🌱をすべて🍂に変える（敵味方問わず・1枚ずつ）。変えた枚数とマスを返す。board を直接書き換える */
export const autumn = (board: SquareInfo[]): { n: number; cells: number[] } => {
    const cells = autumnTargets(board);
    let n = 0;
    for (const k of cells) {
        n += budStacks(board[k]);
        board[k] = { ...board[k], effects: board[k].effects.map((e) => (e.effect === '🌱' ? { effect: '🍂' as const } : e)) };
    }
    return { n, cells };
};

// ---- 火炎系の汎用スキル（火炎トークン・焼畑）の純粋ロジック ----

/**
 * 焼畑: cell の🌱を全て除去し、除去した数と同じ数の🔥に変える（ignite の規則どおり。氷結中なら最初のスタックで氷結が全解除）。
 * 🌱が無いマスなら何もせず n=0。board を直接書き換える。sim/thermal.js の swidden と同じ
 */
export const swidden = (board: SquareInfo[], cell: number, size: number): { n: number; thawed: number[] } => {
    const n = budStacks(board[cell]);
    if (n === 0) return { n: 0, thawed: [] };
    board[cell] = without(board[cell], '🌱');
    return { n, thawed: ignite(board, [cell], size, n).thawed };
};

/**
 * 火炎トークン: idx に player の🔥付きのコマ（ライフ bind）を置く。🔥が付くので縦横隣の氷結は全解除される。
 * 解けたマスを返す。board を直接書き換える。sim/thermal.js の placeFlameToken と同じ
 */
export const placeFlameToken = (board: SquareInfo[], idx: number, player: SquareInfo['player'], bind: number, size: number): number[] => {
    board[idx] = { player, bind, effects: [] };
    return ignite(board, [idx], size).thawed;
};

// ---- 殉火（仮名）: 自陣のコマを犠牲にして、ライフがそれ以下の敵コマ全てに🔥を付ける ----

/** 殉火の犠牲にできる自陣のコマか: 自分のコマで、ライフが残っていて、🔑ロック中でない */
export const canSacrifice = (sq: SquareInfo, me: SquareInfo['player']): boolean => !!sq.player && sq.player === me && sq.bind > 0 && !hasLock(sq);

/** 殉火の🔥の対象: 使用者以外のコマのうち、ライフが threshold 以下で、🔑ロック中でなく、雷霆の巫の⚡無敵でないもの（ライフ0も含む） */
export const sacrificeTargets = (board: SquareInfo[], threshold: number, me: SquareInfo['player'], chars: readonly CharacterId[]): number[] =>
    infernoTargets(board, me, chars).filter((i) => board[i].bind <= threshold);

/**
 * 殉火: cell の自陣のコマのライフをゼロにして、そのライフ(threshold)以下の敵コマ全てに🔥を1スタック付ける
 * （ignite の規則どおり。氷結中のマスは氷結が全解除されて🔥は付かない）。board を直接書き換える。sim/thermal.js の sacrificeFlame と同じ
 */
export const sacrificeFlame = (
    board: SquareInfo[],
    cell: number,
    me: SquareInfo['player'],
    chars: readonly CharacterId[],
    size: number,
    keepBuds?: (sq: SquareInfo) => boolean
): { threshold: number; targets: number[]; thawed: number[] } => {
    const threshold = board[cell].bind;
    board[cell] = zeroOut(board[cell]);
    const targets = sacrificeTargets(board, threshold, me, chars);
    return { threshold, targets, thawed: ignite(board, targets, size, 1, keepBuds).thawed };
};

// ---- 氷結系の汎用スキル（範囲氷結・氷柱・ランダム氷結・氷結拡散・氷結トークン・砕氷・霜降り）の純粋ロジック ----
// sim/thermal.js と同じ仕様（thermal.test.ts が一致を確認する）。氷結を作った数は絶対零度のコスト軽減に1個ずつ数える。

/** 氷結を付けられるマスの昇順配列（ランダム氷結の候補） */
export const randomFreezeCandidates = (board: SquareInfo[]): number[] => board.map((sq, i) => (canFreeze(sq) ? i : -1)).filter((i) => i !== -1);

/** 氷結トークン: idx に❄付きの player のコマ（ライフ bind）を置く。作られた❄の数（1）を返す。board を直接書き換える */
export const placeFrostToken = (board: SquareInfo[], idx: number, player: SquareInfo['player'], bind: number): number => {
    board[idx] = { player, bind, effects: [{ effect: '❄' }] };
    return 1;
};

/** 霜降り: player のコマでライフが maxLife 以下（0含む）かつ氷結を付けられるマス（昇順） */
export const frostfallTargets = (board: SquareInfo[], player: SquareInfo['player'], maxLife: number = FROSTFALL_MAX_LIFE): number[] =>
    board.map((sq, i) => (sq.player === player && sq.bind <= maxLife && canFreeze(sq) ? i : -1)).filter((i) => i !== -1);

/** 春一番の対象: player のコマで❄を持つマス（昇順。🔑ロック中でも解ける） */
export const thawTargets = (board: SquareInfo[], player: SquareInfo['player']): number[] =>
    board.map((sq, i) => (sq.player === player && isFrozen(sq) ? i : -1)).filter((i) => i !== -1);

/** 春一番: player のコマの❄を全スタック解除し、解除した❄の数とマスを返す。board を直接書き換える */
export const thawAll = (board: SquareInfo[], player: SquareInfo['player']): { stacks: number; cells: number[] } => {
    const cells = thawTargets(board, player);
    let stacks = 0;
    for (const k of cells) {
        stacks += frozenStacks(board[k]);
        board[k] = thaw(board[k]);
    }
    return { stacks, cells };
};

// ---- 雷のない所に火は立たぬ ----

/** 燃え移る敵コマの最小数（周囲の敵コマがこれより少なければ全部） */
export const THUNDER_FIRE_MIN = 2;

/**
 * 雷のない所に火は立たぬ: 周囲8マスの敵コマ（cands）から、2〜全部の個数をランダムに決め、その個数だけランダムに選ぶ（昇順）。
 * rng は [0,1) を返す関数。cands が空なら []。sim/thermal.js の thunderFireVictims と同じ
 */
export const thunderFireVictims = (cands: number[], rng: () => number): number[] => {
    const n = cands.length;
    if (n === 0) return [];
    const lo = Math.min(THUNDER_FIRE_MIN, n);
    const k = lo + Math.floor(rng() * (n - lo + 1));
    const pool = cands.slice();
    const out: number[] = [];
    for (let i = 0; i < k; i++) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
    return out.sort((a, b) => a - b);
};

// ---- 鬼門封じ / 火の車 ----

/** 鬼門封じが空きマスにかけるロックの長さ（ターン数。ロックの bind に入れる） */
export const KIMON_LOCK_TURNS = 3;

/** 盤面全体（敵味方・空きマス含む）の🔥の総数。火の車の「このターンに🔥を付与したか」を、手番開始時（や火の車を撃った直後）との差で見る */
export const fireStacksTotal = (board: SquareInfo[]): number => board.reduce((n, sq) => n + flameStacks(sq), 0);

/** 鬼門封じの対象: player 以外のコマのうち、guarded（🔑ロック・⚡無敵など）でないマス（昇順。氷結中でも選べる） */
export const kimonTargets = (board: SquareInfo[], player: SquareInfo['player'], guarded: (sq: SquareInfo, i: number) => boolean): number[] =>
    board.map((sq, i) => (sq.player && sq.player !== player && !guarded(sq, i) ? i : -1)).filter((i) => i !== -1);

/**
 * 鬼門封じ: cell のコマを破壊する（氷結中なら破壊せず❄を1つ減らすだけ）。破壊して空きマスになったら KIMON_LOCK_TURNS ターンのロックを掛ける。
 * board を直接書き換える。sim/thermal.js の kimon と同じ
 */
export const kimon = (board: SquareInfo[], cell: number): { destroyed: boolean; thawed: boolean; locked: boolean } => {
    if (isFrozen(board[cell])) {
        board[cell] = thawOne(board[cell]);
        return { destroyed: false, thawed: true, locked: false };
    }
    board[cell] = { player: undefined, bind: KIMON_LOCK_TURNS, effects: [{ effect: '🔑' }] };
    return { destroyed: true, thawed: false, locked: true };
};

/** 火の車の対象: player 以外のコマのうち、guarded（🔑ロック・⚡無敵など）でないマス（昇順。氷結中でも選べる＝🔥は付かず❄が解ける） */
export const fireWheelTargets = (board: SquareInfo[], player: SquareInfo['player'], guarded: (sq: SquareInfo, i: number) => boolean): number[] =>
    kimonTargets(board, player, guarded);

/** 火の車が🔥を付ける敵マスの数 */
export const FIRE_WHEEL_COUNT = 2;

/** 火の車: picks（呼び出し側がランダムに選んだ敵マス）に🔥を1つずつ付ける（ignite の規則どおり）。解けたマスを返す。board を直接書き換える */
export const fireWheel = (board: SquareInfo[], picks: number[], size: number, keepBuds?: (sq: SquareInfo) => boolean): number[] =>
    ignite(board, picks, size, 1, keepBuds).thawed;

/** 霜枯れ: player のコマで🍂を持ち、氷結を付けられるマス（昇順）。氷結中は🍂が休眠する点に注意 */
export const leafFrostTargets = (board: SquareInfo[], player: SquareInfo['player']): number[] =>
    board.map((sq, i) => (sq.player === player && leafStacks(sq) > 0 && canFreeze(sq) ? i : -1)).filter((i) => i !== -1);

/** 霜降りの対象になるライフの上限 */
export const FROSTFALL_MAX_LIFE = 2;

/** 砕氷が❄1スタックにつき与えるダメージ */
export const SHATTER_DAMAGE_PER_STACK = 3;

/**
 * 砕氷: 氷結中のコマのある cell の❄を全部砕き、❄1スタックにつき3ダメージ（倍率なし。ダメージが通れば🔥は消える）。
 * ライフが0以下になったら破壊（空きマス化）。コマが無い/氷結中でないマスは何もしない。board を直接書き換える
 */
export const shatter = (board: SquareInfo[], cell: number): { stacks: number; damage: number; destroyed: boolean } => {
    const sq = board[cell];
    if (!sq.player || !isFrozen(sq)) return { stacks: 0, damage: 0, destroyed: false };
    const stacks = frozenStacks(sq);
    const damage = stacks * SHATTER_DAMAGE_PER_STACK;
    const hit = applyDamage(thaw(sq), damage, 'pure').sq;
    if (hit.bind <= 0) {
        board[cell] = { player: undefined, bind: 0, effects: [] };
        return { stacks, damage, destroyed: true };
    }
    board[cell] = hit;
    return { stacks, damage, destroyed: false };
};
