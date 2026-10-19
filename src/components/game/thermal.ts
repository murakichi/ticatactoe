// ❄氷結 / 🔥火炎の純粋ロジック。Game.tsx / AIPlayer.ts で共有する。
// sim/thermal.js と同じ仕様（thermal.test.ts が一致を確認する）。
//
// ❄氷結（スタックする。❄が1つでもあれば氷結中）
//   - 空きマスにも置ける。氷結中の空きマスには🔑ロック中と同様に誰も着手できない
//   - 氷結が付いた時点でそのマスの🌱バッズは消える。氷結中のマスには🔑ロックを掛けられない
//   - ターン進行（自然減衰・火炎の継続ダメージ）でライフが減らない。毒のダメージは受ける
//   - 隣接する⚡のダメージ（発火・ジャマー）を受けない。氷結中のマス自身の⚡は残るが休眠する（発火せず、ジャマーの起点にもならない。解凍すると再び働く）
//   - スキルでダメージを受けるとき、ダメージを受ける代わりに氷結が1スタック減る
//   - 自陣のコマへの上書き（強化）ができなくなる
//   - 🔥を付けられそうになると、🔥の代わりに❄が1スタック減る
//   - 隣（縦横）のマスに🔥が付く（発火する）と、全スタックが即座に解除される
// 🔥火炎（スタックする）
//   - 🔥が付いた時点でそのマスの🌱バッズは消える
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

export const frozenStacks = (sq: SquareInfo): number => sq.effects.filter((e) => e.effect === '❄').length;
export const isFrozen = (sq: SquareInfo): boolean => sq.effects.some((e) => e.effect === '❄');
export const flameStacks = (sq: SquareInfo): number => sq.effects.filter((e) => e.effect === '🔥').length;

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

/** 氷室の番人のライフ平均への加算: 自陣コマの氷結スタック総数 × 0.5 */
export const frozenLifeBonus = (board: SquareInfo[], player: SquareInfo['player']): number =>
    board.reduce((n, sq) => (sq.player === player ? n + frozenStacks(sq) : n), 0) * 0.5;

/** 🔑ロックを掛けられるマスか: 氷結中でない */
export const lockable = (sq: SquareInfo): boolean => !isFrozen(sq);

/**
 * ターン進行の火炎ダメージ（スタック×2。持ち主以外の席に煉獄の鍛冶師がいれば、1マスの1回の継続ダメージにつき追加で+1）。
 * 氷結中・🔑ロック中・ライフ0のマスは受けない
 */
export const burnDamageOf = (sq: SquareInfo, chars: readonly CharacterId[]): number => {
    const stacks = flameStacks(sq);
    if (stacks === 0 || sq.bind <= 0 || isFrozen(sq) || hasLock(sq)) return 0;
    const owner = sq.player ? seatOf(sq.player) : -1;
    const extra = chars.some((c, seat) => c === 'pyromancer' && seat !== owner) ? PYROMANCER_EXTRA_BURN : 0;
    return stacks * FLAME_BURN_DAMAGE + extra;
};

export type DamageKind = 'skill' | 'electric' | 'poison';

export type DamageResult = {
    sq: SquareInfo;
    /** 実際に減ったライフ */
    dealt: number;
    /** スキルダメージが氷結に吸収された */
    blocked: boolean;
};

/**
 * マスにダメージを与える。skill は氷結に吸収され（氷結が解除されるだけ）、火炎なら1.5倍（切り上げ）。
 * electric は氷結中のマスには無効（氷結は残る）、poison は氷結を貫通する。どちらも倍率はかからない。1以上ダメージが通ると🔥は全部消える。
 */
export const applyDamage = (sq: SquareInfo, amount: number, kind: DamageKind): DamageResult => {
    if (kind === 'skill' && isFrozen(sq)) return { sq: thawOne(sq), dealt: 0, blocked: true };
    // 隣接⚡のダメージは氷結に当たらない（氷結は解除されず、ダメージも無い）
    if (kind === 'electric' && isFrozen(sq)) return { sq, dealt: 0, blocked: false };
    const real = kind === 'skill' && flameStacks(sq) > 0 ? Math.ceil(amount * FLAME_SKILL_MULT) : amount;
    const bind = Math.max(0, sq.bind - real);
    const dealt = sq.bind - bind;
    const next = { ...sq, bind };
    return { sq: dealt > 0 ? without(next, '🔥') : next, dealt, blocked: false };
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
 * 氷結中のマスなら🔥は付かず代わりに❄が1つ減る。🔥が実際に付いたときは、そのマスの縦横隣の氷結が全スタック即座に解除される。
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
                board[k] = thawOne(board[k]);
                thawed.add(k);
                continue;
            }
            // 🔥が付くとそのマスの🌱バッズは燃えて消える（冬至の種子のガード中は消えない）
            board[k] = { ...board[k], effects: [...(keepBuds?.(board[k]) ? board[k].effects : board[k].effects.filter((e) => e.effect !== '🌱')), { effect: '🔥' }] };
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

/** 氷結を付けられるマスか: 🔑ロック中でない（空きマスにも置け、氷結済みでも重ねられる） */
export const canFreeze = (sq: SquareInfo): boolean => !hasLock(sq);

/** 指定マスに❄を付ける（付けられないマスは飛ばす）。⚡は消さない。付いたマスを返す。board を直接書き換える */
export const freeze = (board: SquareInfo[], cells: number[], keepBuds?: (sq: SquareInfo) => boolean): number[] => {
    const done: number[] = [];
    for (const k of cells) {
        if (!canFreeze(board[k])) continue;
        board[k] = { ...board[k], effects: [...(keepBuds?.(board[k]) ? board[k].effects : board[k].effects.filter((e) => e.effect !== '🌱')), { effect: '❄' }] }; // 氷結が付くとバッズは消える（ガード中は除く）
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

/** ❄が付いているマスの数（スタック数ではなくマス数。空きマス・敵味方問わず） */
export const frozenCellCount = (board: SquareInfo[]): number => board.filter(isFrozen).length;

/**
 * 絶対零度（氷室の番人）の実コスト: 基礎コストを、盤面の❄のマス数だけ軽減してからキャラ補正（calc）をかけ、下限は1。
 * sim/engine.js の glacierCost と同じ
 */
export const reducedGlacierCost = (baseCost: number, board: SquareInfo[], calc: (cost: number) => number): number =>
    Math.max(1, calc(baseCost - frozenCellCount(board)));

/** 絶対零度の使用時: 🔑のない全マス（空きマス含む）に❄を1スタック足す。付いたマスを返す。board を直接書き換える */
export const freezeAll = (board: SquareInfo[], keepBuds?: (sq: SquareInfo) => boolean): number[] =>
    freeze(
        board,
        board.map((_, i) => i),
        keepBuds
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
        const hit = applyDamage(thaw(sq), frozenStacks(sq) * GLACIER_DAMAGE_PER_STACK, 'poison').sq;
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
export const INFERNO_COST = 9;
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
 * 氷結中は自然減衰と🔥の継続ダメージを受けず、毒は氷結を貫通して通れば🔥が消える。
 * 🔑の期限切れや毒で消えるコマの処理は呼び出し側（Game.tsx / sim/engine.js）が続けて行う。
 */
export const decayTick = (sq: SquareInfo, chars: readonly CharacterId[]): SquareInfo => {
    let next: SquareInfo = { ...sq, effects: [...sq.effects] };
    if ((next.player || hasLock(next)) && next.bind > 0 && !isFrozen(next)) next = { ...next, bind: next.bind - 1 };
    const burn = burnDamageOf(next, chars);
    if (burn > 0) next = { ...next, bind: Math.max(0, next.bind - burn) };
    const poison = next.effects.filter((e) => e.effect === '☠').length;
    if (poison > 0 && next.bind > 0) next = applyDamage(next, poison, 'poison').sq;
    return next;
};

// ---- バッズ系の汎用スキル（刈り入れ前夜・冬至の種子・ひこばえ・風の落とし子）の純粋ロジック ----
// sim/thermal.js と同じ仕様（thermal.test.ts が一致を確認する）。
// 冬至の種子の「🌱ガード」は、freeze / freezeAll / ignite の keepBuds 述語として渡す。

/** マスの🌱の数 */
export const budStacks = (sq: SquareInfo): number => sq.effects.filter((e) => e.effect === '🌱').length;

/** 新しく🌱を持てるコマか: コマがあり、氷結中でなく、🔥が付いていない（付けても氷結・火炎ですぐ消えるため） */
export const canBud = (sq: SquareInfo): boolean => !!sq.player && !isFrozen(sq) && flameStacks(sq) === 0;

/** 刈り入れ前夜: player のコマの🌱を全部除去して、除去した数を返す。board を直接書き換える */
export const harvestBuds = (board: SquareInfo[], player: SquareInfo['player']): number => {
    let n = 0;
    board.forEach((sq, i) => {
        if (sq.player !== player) return;
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

/** 風の落とし子: picks の各マス（重複可）に🌱を1つずつ足す。board を直接書き換える */
export const sow = (board: SquareInfo[], picks: number[]): void => {
    for (const k of picks) board[k] = { ...board[k], effects: [...board[k].effects, { effect: '🌱' }] };
};
