// ❄氷結 / 🔥火炎の純粋ロジック。Game.tsx / AIPlayer.ts で共有する。
// sim/thermal.js と同じ仕様（thermal.test.ts が一致を確認する）。
//
// ❄氷結（スタックしない）
//   - ターン進行（自然減衰・火炎の継続ダメージ）でライフが減らない。毒のダメージは受ける
//   - 隣接する⚡のダメージ（発火・ジャマー）を受けない。氷結中のマス自身の⚡は残るが休眠する（発火せず、ジャマーの起点にもならない。解凍すると再び働く）
//   - スキルでダメージを受けるとき、ダメージの代わりに氷結が解除される
//   - 自陣のコマへの上書き（強化）ができなくなる（氷室の番人は除く）
//   - 隣（縦横）のマスや自マスに🔥が付く（発火する）と即座に解除される
// 🔥火炎（スタックする）
//   - ターン進行のたび、1スタックにつき2ダメージ（ライフ0が下限）。煉獄の鍛冶師の自陣コマは受けない
//   - ダメージを受けると全スタックが消える（自然減衰と火炎自身の継続ダメージでは消えない）
//   - スキルでダメージを受けるとき、ダメージが1.5倍（切り上げ）
import { CharacterId } from '../../types/Character';
import { seatOf } from '../../types/Player';
import { SquareInfo } from '../../types/SquareInfo';
import { orthoNeighbors } from './boardGeometry';

/** 火炎1スタックあたりの継続ダメージ */
export const FLAME_BURN_DAMAGE = 2;
/** 火炎状態のマスがスキルでダメージを受けるときの倍率（切り上げ） */
export const FLAME_SKILL_MULT = 1.5;

export const isFrozen = (sq: SquareInfo): boolean => sq.effects.some((e) => e.effect === '❄');
export const flameStacks = (sq: SquareInfo): number => sq.effects.filter((e) => e.effect === '🔥').length;

const hasLock = (sq: SquareInfo): boolean => sq.effects.some((e) => e.effect === '🔑');

const without = (sq: SquareInfo, ...kinds: string[]): SquareInfo => ({
    ...sq,
    effects: sq.effects.filter((e) => !kinds.includes(e.effect)),
});

/** 氷結を解除した（マスのコピーを返す。氷結が無ければ同じ参照） */
export const thaw = (sq: SquareInfo): SquareInfo => (isFrozen(sq) ? without(sq, '❄') : sq);

/** 氷結中の自陣コマへの上書き（強化）が禁じられているか。氷室の番人は氷結していても強化できる */
export const overwriteBlocked = (sq: SquareInfo, mover: CharacterId | undefined): boolean =>
    isFrozen(sq) && mover !== 'cryomancer';

/** ターン進行の火炎ダメージ（スタック×2）。煉獄の鍛冶師の自陣・氷結・🔑ロックは受けない */
export const burnDamageOf = (sq: SquareInfo, chars: readonly CharacterId[]): number => {
    const stacks = flameStacks(sq);
    if (stacks === 0 || sq.bind <= 0 || isFrozen(sq) || hasLock(sq)) return 0;
    if (sq.player && chars[seatOf(sq.player)] === 'pyromancer') return 0;
    return stacks * FLAME_BURN_DAMAGE;
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
    if (kind === 'skill' && isFrozen(sq)) return { sq: thaw(sq), dealt: 0, blocked: true };
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
    isFrozen(sq) ? { sq: thaw(sq), blocked: true } : { sq, blocked: false };

/** ライフを丸ごと0にする（倍率なし）。ライフが残っていたなら🔥は消える。氷結の判定は absorbDestroy で先に行う */
export const zeroOut = (sq: SquareInfo): SquareInfo => (sq.bind > 0 ? without({ ...sq, bind: 0 }, '🔥') : { ...sq, bind: 0 });

/** 指定マスに🔥を1つずつ付ける。付いたマスと縦横隣の氷結は即座に解除される（board を直接書き換える） */
export const ignite = (board: SquareInfo[], cells: number[], size: number): { thawed: number[] } => {
    const thawed = new Set<number>();
    for (const k of cells) {
        board[k] = { ...board[k], effects: [...board[k].effects, { effect: '🔥' }] };
        for (const n of [k, ...orthoNeighbors(k, size)]) {
            if (isFrozen(board[n])) {
                board[n] = thaw(board[n]);
                thawed.add(n);
            }
        }
    }
    return { thawed: Array.from(thawed) };
};

/** 氷結を付けられるマスか: コマがあり、まだ氷結しておらず、🔑ロック中でない */
export const canFreeze = (sq: SquareInfo): boolean => !!sq.player && !isFrozen(sq) && !hasLock(sq);

/** 指定マスに❄を付ける（付けられないマスは飛ばす）。⚡は消さない。付いたマスを返す。board を直接書き換える */
export const freeze = (board: SquareInfo[], cells: number[]): number[] => {
    const done: number[] = [];
    for (const k of cells) {
        if (!canFreeze(board[k])) continue;
        board[k] = { ...board[k], effects: [...board[k].effects, { effect: '❄' }] };
        done.push(k);
    }
    return done;
};

/** 氷河期（氷室の番人）: 自陣のライフが残っているコマで、まだ氷結していないマス */
export const glacierTargets = (board: SquareInfo[], player: SquareInfo['player']): number[] =>
    board.map((sq, i) => (sq.player === player && sq.bind > 0 && canFreeze(sq) ? i : -1)).filter((i) => i !== -1);

/** フレアバースト（煉獄の鍛冶師）: 中心と縦横隣のうち、🔥を付けられる敵コマ（ライフ>0・🔑なし） */
export const flareTargets = (board: SquareInfo[], center: number, size: number, me: SquareInfo['player']): number[] =>
    [center, ...orthoNeighbors(center, size)].filter((k) => {
        const sq = board[k];
        return !!sq.player && sq.player !== me && sq.bind > 0 && !hasLock(sq);
    });

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
