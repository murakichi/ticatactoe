// オリジナルスキル: 人間が作成画面で「どのマスに（対象）・どう選ぶか（選択系/即発動系）・どんな効果を（いくつでも）」を選んで作る、自分専用の1枚。
// コストは選択肢から自動で出す（docs/skill-cost-rules.md の「オリジナルスキル」）。効果を重ねるほど重くなる。
// AIは使わない（人間席のデッキにだけ入る）。sim とは共有しない（ヘッドレス sim にはカスタムスキルが無い）ので、gen-sim-shared の対象外。
import { CharacterId } from '../../types/Character';
import { Player } from '../../types/Player';
import { SquareInfo } from '../../types/SquareInfo';
import { addCharge, isShielded } from './charge';
import { addPoison } from './poison';
import type { SkillCategory } from './deck';
import { OBJECT_KINDS, ObjectKind } from '../../types/ObjectKind';
import { OBJECT_DEFS, newObject, objectLandable, sweepBurntTrees } from './objects';
import { skillCosts } from './skillCosts';
import { absorbDestroy, applyDamage, canBud, canFreeze, freeze, ignite, sow } from './thermal';
import { isBuilding } from '../../types/ObjectKind';

export { CUSTOM_SKILL_IDX } from './deck';

/** 対象にするマスの種類: 自陣のコマ / 敵のコマ / 空きマス / どのマスでも */
export type CustomKind = 'own' | 'enemy' | 'empty' | 'any';
/** 対象の決め方: select=プレイヤーがマスを n 個選ぶ（選択系） / all=条件に合う全マス / random=条件に合うマスからランダムに n 個（即発動系） */
export type CustomPick = 'select' | 'random' | 'all';
export type StatusEffect = 'poison' | 'fire' | 'charge' | 'frost' | 'bud';

export type CustomOp =
    /** nダメージ。destroyOnZero なら、ライフが0になったコマは破壊される（空きマスになる）。しないなら0ライフのコマとして残る */
    | { op: 'damage'; amount: number; destroyOnZero: boolean }
    /** コマを破壊する（空きマスにする。氷結中なら❄が身代わりになる） */
    | { op: 'destroy' }
    /** エフェクトを count 個乗せる */
    | { op: 'effect'; effect: StatusEffect; count: number }
    /** ライフを +amount する */
    | { op: 'heal'; amount: number }
    /** 空きマスにオブジェクトを設置する（持ち主は使用者） */
    | { op: 'object'; object: ObjectKind }
    /**
     * 相手全員を、次の手番だけスキルを使えなくする（盤面のマスを使わない即発動の効果）。
     * mode=all は全スキル（サイレンス）、max は表示コストが n 以下、min は n 以上のスキルだけ。チャージ・シャッフル・ロックは対象外
     */
    | { op: 'silence'; mode: 'all' | 'max' | 'min'; n: number }
    /** 相手全員のギアを、その相手の次の手番の終わりまで無効にする（盤面のマスを使わない即発動の効果。裸の王様と同じ） */
    | { op: 'gearOff' };

export type CustomSkillSpec = {
    name: string;
    kind: CustomKind;
    pick: CustomPick;
    /** select / random で対象にするマスの数（all は無視） */
    count: number;
    ops: CustomOp[];
    /** 代償（ネガティブな効果）。使うたびに必ず起きて、そのぶんコストが下がる（最大 MAX_DRAWBACKS 個。割引は最大 DRAWBACK_MAX_CUT） */
    drawbacks: Drawback[];
    /** 使うと手番を終える（コスト -2） */
    endTurn: boolean;
};

/**
 * 代償: 主効果のあとに、ランダムな1コマに op を掛ける。side=own は自陣のコマ（自傷）、enemy は敵のコマ（敵を利する）。
 * 選べる組み合わせは DRAWBACK_CHOICES のとおり
 */
export type Drawback = { side: 'own' | 'enemy'; op: CustomOp };

export const KIND_DEFS: { id: CustomKind; label: string }[] = [
    { id: 'own', label: '自陣のコマ' },
    { id: 'enemy', label: '敵のコマ' },
    { id: 'empty', label: '空きマス' },
    { id: 'any', label: 'どのマスでも' },
];
export const PICK_DEFS: { id: CustomPick; label: string; mode: 'select' | 'instant' }[] = [
    { id: 'select', label: 'マスを選ぶ', mode: 'select' },
    { id: 'random', label: 'ランダム', mode: 'instant' },
    { id: 'all', label: '全て', mode: 'instant' },
];
export const COUNTS = [1, 2, 3];
export const MAX_OPS = 4;
export const MAX_DRAWBACKS = 3;
/** 代償による割引の係数（自傷・敵を利する効果の単価に掛ける。R1' の自傷割安と同じ考え方で、単価より少し安く見る） */
export const DRAWBACK_RATE = 0.7;
/** 代償での割引は、割引前のコストのこの割合まで（下限1）。代償だけでほぼ無料にはできない */
export const DRAWBACK_MAX_CUT = 0.6;
export const NAME_MAX = 10;
/** 全体を対象にするときの係数（R4: 盤面全体は対象数が増えるほど1個あたりは安いが、絶対額は上がる） */
export const ALL_FACTOR = 3.5;
export const END_TURN_DISCOUNT = 2;
export const RANDOM_DISCOUNT = 1;
/** 2つ目以降の効果ごとの上乗せ（1手で複数の仕事をする割増） */
export const EXTRA_OP_SURCHARGE = 1;

/** 「n以下」「n以上」で封じる n の選択肢 */
export const BAN_MAX_CHOICES = [2, 3, 4, 5, 6];
export const BAN_MIN_CHOICES = [3, 4, 5, 6, 7];
export const DAMAGE_AMOUNTS = [1, 2, 3, 4, 5];
export const HEAL_AMOUNTS = [1, 2, 3, 4, 5];

export const STATUS_DEFS: { id: StatusEffect; icon: string; label: string; unit: number; counts: number[] }[] = [
    { id: 'poison', icon: '☠', label: '毒', unit: 2, counts: [1, 2, 3] },
    { id: 'fire', icon: '🔥', label: '火炎', unit: 3, counts: [1, 2, 3] },
    { id: 'charge', icon: '⚡', label: '帯電', unit: 2, counts: [1, 2, 3] },
    { id: 'frost', icon: '❄', label: '氷結', unit: 3, counts: [1] },
    { id: 'bud', icon: '🌱', label: 'バッズ', unit: 4, counts: [1, 2, 3] },
];
export const statusDef = (id: StatusEffect) => STATUS_DEFS.find((d) => d.id === id) as (typeof STATUS_DEFS)[number];

/** 代償の選択肢（UI の並び）。自傷: ランダムな自陣のコマにダメージ・破壊・毒/火炎/帯電 / 敵を利する: ランダムな敵のコマのライフ+n */
export const DRAWBACK_CHOICES: { label: string; make: () => Drawback }[] = [
    { label: '自陣のコマにダメージ', make: () => ({ side: 'own', op: { op: 'damage', amount: 2, destroyOnZero: false } }) },
    { label: '自陣のコマを破壊', make: () => ({ side: 'own', op: { op: 'destroy' } }) },
    { label: '自陣のコマにエフェクト', make: () => ({ side: 'own', op: { op: 'effect', effect: 'poison', count: 1 } }) },
    { label: '敵のコマが回復', make: () => ({ side: 'enemy', op: { op: 'heal', amount: 2 } }) },
];
/** 代償ごとの選べる量 */
export const DRAWBACK_AMOUNTS = [1, 2, 3];
export const DRAWBACK_COUNTS = [1, 2];
export const DRAWBACK_STATUSES: StatusEffect[] = ['poison', 'fire', 'charge'];

/** 破壊で空きマスになったときの盤面のマス（エフェクトも消える） */
const EMPTY: SquareInfo = { player: undefined, bind: 0, effects: [] };

// ---- 効果の組み立て・検証 ----

/** その効果が、コマにしか乗らないか */
const needsPiece = (op: CustomOp): boolean =>
    op.op === 'damage' || op.op === 'destroy' || op.op === 'heal' || (op.op === 'effect' && (op.effect === 'poison' || op.effect === 'bud'));

/** 盤面のマスを使わない効果か（サイレンス・ギア封じ）。対象の種類・選び方に関係なく、使った瞬間に相手全員へ掛かる */
export const isGlobalOp = (op: CustomOp): boolean => op.op === 'silence' || op.op === 'gearOff';
export const cellOps = (spec: Pick<CustomSkillSpec, 'ops'>): CustomOp[] => spec.ops.filter((o) => !isGlobalOp(o));
export const globalOps = (spec: Pick<CustomSkillSpec, 'ops'>): CustomOp[] => spec.ops.filter(isGlobalOp);
export const hasCellOps = (spec: Pick<CustomSkillSpec, 'ops'>): boolean => spec.ops.some((o) => !isGlobalOp(o));

/** この対象の種類で意味のある効果か（空きマスにはコマ専用の効果を付けられない。オブジェクトは空きマスにだけ置ける） */
export const opAllowedFor = (op: CustomOp, kind: CustomKind): boolean =>
    isGlobalOp(op) ? true : op.op === 'object' ? kind === 'empty' || kind === 'any' : kind !== 'empty' || !needsPiece(op);

export const opLabel = (op: CustomOp): string => {
    switch (op.op) {
        case 'damage':
            return `${op.amount}ダメージ${op.destroyOnZero ? '（0で破壊）' : ''}`;
        case 'destroy':
            return '破壊';
        case 'heal':
            return `ライフ+${op.amount}`;
        case 'effect': {
            const d = statusDef(op.effect);
            return `${d.icon}×${op.count}`;
        }
        case 'object':
            return `${OBJECT_DEFS[op.object].name}設置`;
        case 'silence':
            return op.mode === 'all' ? 'スキル封じ' : op.mode === 'max' ? `コスト${op.n}以下封じ` : `コスト${op.n}以上封じ`;
        case 'gearOff':
            return 'ギア封じ';
    }
};

export const defaultOp = (kind: CustomKind): CustomOp =>
    kind === 'empty' ? { op: 'effect', effect: 'fire', count: 1 } : kind === 'own' ? { op: 'heal', amount: 3 } : { op: 'damage', amount: 2, destroyOnZero: false };

const normalizeOp = (op: CustomOp): CustomOp | null => {
    if (!op || typeof op !== 'object') return null;
    switch (op.op) {
        case 'damage':
            return DAMAGE_AMOUNTS.includes(op.amount) ? { op: 'damage', amount: op.amount, destroyOnZero: !!op.destroyOnZero } : null;
        case 'destroy':
            return { op: 'destroy' };
        case 'heal':
            return HEAL_AMOUNTS.includes(op.amount) ? { op: 'heal', amount: op.amount } : null;
        case 'effect': {
            const d = STATUS_DEFS.find((x) => x.id === op.effect);
            return d && d.counts.includes(op.count) ? { op: 'effect', effect: d.id, count: op.count } : null;
        }
        case 'object':
            return OBJECT_KINDS.includes(op.object) ? { op: 'object', object: op.object } : null;
        case 'silence':
            if (op.mode === 'all') return { op: 'silence', mode: 'all', n: 0 };
            if (op.mode === 'max') return BAN_MAX_CHOICES.includes(op.n) ? { op: 'silence', mode: 'max', n: op.n } : null;
            if (op.mode === 'min') return BAN_MIN_CHOICES.includes(op.n) ? { op: 'silence', mode: 'min', n: op.n } : null;
            return null;
        case 'gearOff':
            return { op: 'gearOff' };
        default:
            return null;
    }
};

const normalizeDrawback = (d: Drawback): Drawback | null => {
    if (!d || typeof d !== 'object' || (d.side !== 'own' && d.side !== 'enemy') || !d.op) return null;
    const op = d.op;
    if (d.side === 'enemy') return op.op === 'heal' && DRAWBACK_AMOUNTS.includes(op.amount) ? { side: 'enemy', op: { op: 'heal', amount: op.amount } } : null;
    if (op.op === 'damage') return DRAWBACK_AMOUNTS.includes(op.amount) ? { side: 'own', op: { op: 'damage', amount: op.amount, destroyOnZero: false } } : null;
    if (op.op === 'destroy') return { side: 'own', op: { op: 'destroy' } };
    if (op.op === 'effect') return DRAWBACK_STATUSES.includes(op.effect) && DRAWBACK_COUNTS.includes(op.count) ? { side: 'own', op: { op: 'effect', effect: op.effect, count: op.count } } : null;
    return null;
};

/** スキル名として使える形に整える（`-` `+` はボタン文言の区切りなので除く） */
export const sanitizeName = (name: string): string => name.replace(/[-+＋－\s]/g, '').slice(0, NAME_MAX);

/** 選択肢から決まる既定の名前 */
export const autoName = (spec: Omit<CustomSkillSpec, 'name'>): string => {
    const kind = KIND_DEFS.find((k) => k.id === spec.kind)?.label ?? '';
    const how = spec.pick === 'all' ? '全' : spec.pick === 'random' ? '乱' : '';
    const first = spec.ops[0] ? opLabel(spec.ops[0]).replace(/[（）]/g, '') : '';
    const target = hasCellOps(spec) ? `${how}${kind.replace('のコマ', '').replace('マス', '')}` : '';
    return sanitizeName(`${target}${first}${spec.ops.length > 1 ? 'ほか' : ''}`);
};

/** 選択肢が矛盾しないよう整える（不正な効果は捨て、空きマス対象にコマ専用の効果は付けない）。名前が空なら既定名 */
export const normalizeSpec = (spec: CustomSkillSpec): CustomSkillSpec => {
    const kind = KIND_DEFS.some((k) => k.id === spec.kind) ? spec.kind : 'enemy';
    const raw = (Array.isArray(spec.ops) ? spec.ops : []).map(normalizeOp).filter((o): o is CustomOp => !!o && opAllowedFor(o, kind));
    const ops = (raw.length > 0 ? raw : [defaultOp(kind)]).slice(0, MAX_OPS);
    // マスを使う効果が無ければ、対象の種類・選び方は意味を持たないので固定する。オブジェクトの設置は「全て」にできない（全ての空きマスに建つため）
    const onlyGlobal = !hasCellOps({ ops });
    const wantedPick = PICK_DEFS.some((p) => p.id === spec.pick) ? spec.pick : 'select';
    const pick = onlyGlobal ? 'all' : wantedPick === 'all' && ops.some((o) => o.op === 'object') ? 'select' : wantedPick;
    const count = pick === 'all' ? 1 : COUNTS.includes(spec.count) ? spec.count : 1;
    const drawbacks = (Array.isArray(spec.drawbacks) ? spec.drawbacks : []).map(normalizeDrawback).filter((d): d is Drawback => !!d).slice(0, MAX_DRAWBACKS);
    const base = { kind: onlyGlobal ? ('enemy' as CustomKind) : kind, pick: pick as CustomPick, count, ops, drawbacks, endTurn: !!spec.endTurn };
    return { ...base, name: sanitizeName(typeof spec.name === 'string' ? spec.name : '') || autoName(base) };
};

/** 仕様として整っているか（normalizeSpec で何も変わらない） */
export const isValidSpec = (spec: unknown): spec is CustomSkillSpec => {
    if (!spec || typeof spec !== 'object') return false;
    try {
        return JSON.stringify(normalizeSpec(spec as CustomSkillSpec)) === JSON.stringify(spec);
    } catch {
        return false;
    }
};

// ---- コスト ----

/** 効果1つの1マスあたりの単価（docs/skill-cost-rules.md の基本単価） */
export const opUnit = (op: CustomOp): number => {
    switch (op.op) {
        case 'damage':
            return 1.3 * op.amount + (op.destroyOnZero ? 1 : 0); // 0で破壊すると、ライフを削り切る価値が上がる
        case 'destroy':
            return 4.5; // 敵コマ1つの破壊 4〜5
        case 'heal':
            return op.amount; // ライフ3 = 3
        case 'effect': {
            const d = statusDef(op.effect);
            return d.unit * op.count * Math.pow(0.85, op.count - 1); // R3
        }
        case 'object':
            return skillCosts[OBJECT_DEFS[op.object].costKey]; // 設置スキルの基礎コスト（docs の『オブジェクト』の表）
        case 'silence':
            // 全スキル封じ = サイレンス 5。n以下: 小さい n ほど封じる範囲が狭い。n以上: 大きい n ほど狭い（どちらも全封じの 5 未満）
            return op.mode === 'all' ? 5 : op.mode === 'max' ? Math.min(4, Math.round(1 + 0.6 * op.n)) : Math.max(1, Math.min(4, Math.round(6.5 - 0.7 * op.n)));
        case 'gearOff':
            return 4; // 裸の王様 4
    }
};

/** 対象マス数の係数: n 個選ぶ/ランダムは R3（n × 0.85^(n-1)）、全体は ALL_FACTOR */
export const targetFactor = (spec: Pick<CustomSkillSpec, 'pick' | 'count'>): number =>
    spec.pick === 'all' ? ALL_FACTOR : spec.count * Math.pow(0.85, spec.count - 1);

/** 代償1つの割引（単価 × DRAWBACK_RATE）。割引の合計は四捨五入する */
export const drawbackValue = (d: Drawback): number => opUnit(d.op) * DRAWBACK_RATE;

/** 代償によるコスト割引（上限適用前）と、実際に引く額（割引前のコストの DRAWBACK_MAX_CUT まで） */
export const drawbackCut = (spec: Pick<CustomSkillSpec, 'drawbacks'>, before: number): number =>
    Math.min(Math.round(spec.drawbacks.reduce((n, d) => n + drawbackValue(d), 0)), Math.floor(before * DRAWBACK_MAX_CUT));

/** 代償を引く前のコスト */
export const costBeforeDrawbacks = (spec: CustomSkillSpec): number => {
    // マスを使う効果は対象マス数の係数を掛ける。サイレンス・ギア封じは相手全員に掛かる固定額（係数なし）
    const cellSum = cellOps(spec).reduce((n, op) => n + opUnit(op), 0);
    const globalSum = globalOps(spec).reduce((n, op) => n + opUnit(op), 0);
    let cost = Math.round(cellSum * targetFactor(spec)) + globalSum + EXTRA_OP_SURCHARGE * Math.max(0, spec.ops.length - 1);
    if (spec.pick === 'random' && hasCellOps(spec)) cost -= RANDOM_DISCOUNT;
    if (spec.endTurn) cost -= END_TURN_DISCOUNT;
    return Math.max(1, cost);
};

/**
 * 基礎コスト（キャラ・ギアの補正前）。docs/skill-cost-rules.md の基準で自動算出する:
 *   (マスを使う効果の単価の合計 × 対象マス数の係数 を四捨五入) + サイレンス・ギア封じの固定額 → 2つ目以降の効果ごとに +1 → ランダムは -1 → 手番終了は -2
 *   → 代償の割引（代償の単価 × 0.7 の合計。割引前の6割まで）→ 下限1
 */
export const customSkillCost = (spec: CustomSkillSpec): number => {
    const before = costBeforeDrawbacks(spec);
    return Math.max(1, before - drawbackCut(spec, before));
};

/** 効果の説明（スキルカード・作成画面の表示用） */
export const describeCustom = (spec: CustomSkillSpec): string => {
    const kind = { own: '自陣のコマ', enemy: '敵のコマ', empty: '空きマス', any: 'マス' }[spec.kind];
    const target =
        spec.pick === 'select'
            ? `${kind}を${spec.count}つ選び`
            : spec.pick === 'random'
            ? `ランダムな${kind}${spec.count}つに`
            : spec.kind === 'any'
            ? '盤面の全マスに'
            : `全ての${kind}に`;
    const verb = (op: CustomOp): string => {
        switch (op.op) {
            case 'damage':
                return `${op.amount}ダメージを与える${op.destroyOnZero ? '（ライフが0になったコマは破壊）' : ''}`;
            case 'destroy':
                return 'コマを破壊する';
            case 'heal':
                return `ライフを+${op.amount}する`;
            case 'effect': {
                const d = statusDef(op.effect);
                return op.effect === 'frost' ? '❄氷結を付与する' : `${d.icon}を${op.count}つ付与する`;
            }
            case 'object':
                return `${OBJECT_DEFS[op.object].icon}${OBJECT_DEFS[op.object].name}を設置する`;
            case 'silence':
                return op.mode === 'all' ? '相手全員は次の手番、スキルを使えない' : `相手全員は次の手番、コスト${op.n}${op.mode === 'max' ? '以下' : '以上'}のスキルを使えない（チャージ・シャッフル・ロックを除く）`;
            case 'gearOff':
                return '相手全員は次の手番、ギアを使えない';
        }
    };
    const sep = spec.pick === 'select' ? '、' : '';
    const lines: string[] = [];
    if (hasCellOps(spec)) lines.push(`${target}${sep}${cellOps(spec).map(verb).join('→')}`);
    globalOps(spec).forEach((op) => lines.push(verb(op)));
    const costs = spec.drawbacks.map((d) => {
        const who = d.side === 'own' ? '自陣のランダムなコマ' : '敵のランダムなコマ';
        const op = d.op;
        const what = op.op === 'damage' ? `${op.amount}ダメージ` : op.op === 'destroy' ? '破壊' : op.op === 'heal' ? `ライフ+${op.amount}` : op.op === 'effect' ? `${statusDef(op.effect).icon}×${op.count}` : '';
        return `${who}1つに${what}`;
    });
    if (costs.length > 0) lines.push(`代償: ${costs.join('、')}`);
    if (spec.endTurn) lines.push('使うと手番を終えます');
    lines.push('（オリジナルスキル・AIは使いません）');
    return lines.join('\n');
};

// ---- 対象 ----

const hasLockEffect = (sq: SquareInfo): boolean => sq.effects.some((f) => f.effect === '🔑');

/** 効果がそのマスに乗るか（乗らないマスは飛ばす）。⚡無敵のコマは呼び出し側で除く */
export const opApplies = (sq: SquareInfo, op: CustomOp): boolean => {
    if (isBuilding(sq)) return false;
    const piece = !!sq.player;
    switch (op.op) {
        case 'damage':
            return piece && sq.bind > 0 && !hasLockEffect(sq); // ライフ0・ロック中には当たらない
        case 'destroy':
            return piece && !hasLockEffect(sq);
        case 'heal':
            return piece;
        case 'effect':
            if (op.effect === 'poison') return piece;
            if (op.effect === 'bud') return canBud(sq);
            if (op.effect === 'frost') return canFreeze(sq);
            return true; // 火炎・帯電は空きマスにも乗る
        case 'object':
            return objectLandable(sq); // 氷結・ロック中でない空きマス
        case 'silence':
        case 'gearOff':
            return false; // マスに掛からない
    }
};

const kindMatches = (sq: SquareInfo, kind: CustomKind, me: Player): boolean => {
    if (isBuilding(sq)) return false;
    switch (kind) {
        case 'own':
            return sq.player === me;
        case 'enemy':
            return !!sq.player && sq.player !== me;
        case 'empty':
            return !sq.player;
        case 'any':
            return true;
    }
};

/** そのマスが対象になれるか: 種類が合い、⚡無敵でなく、効果のどれかが乗る */
export const isCustomTarget = (sq: SquareInfo, spec: CustomSkillSpec, me: Player, chars: readonly CharacterId[]): boolean =>
    kindMatches(sq, spec.kind, me) && !isShielded(sq, chars) && spec.ops.some((op) => opApplies(sq, op));

/** 盤面で対象になりうる全マス（昇順） */
export const customTargets = (board: SquareInfo[], spec: CustomSkillSpec, me: Player, chars: readonly CharacterId[]): number[] =>
    board.map((sq, i) => (isCustomTarget(sq, spec, me, chars) ? i : -1)).filter((i) => i !== -1);

/**
 * 今使えるか: マスを使う効果があれば対象が1つでもあるか。サイレンス・ギア封じだけなら、サイレンスはいつでも、
 * ギア封じはギアを持つ相手がいるときだけ
 */
export const canCastCustom = (board: SquareInfo[], spec: CustomSkillSpec, me: Player, chars: readonly CharacterId[], oppHasGear: boolean = true): boolean =>
    hasCellOps(spec) ? customTargets(board, spec, me, chars).length > 0 : globalOps(spec).some((op) => op.op === 'silence' || oppHasGear);

/** 選択系で実際に選ぶ数: 設定の数と、選べるマスの数の小さい方 */
export const selectCount = (board: SquareInfo[], spec: CustomSkillSpec, me: Player, chars: readonly CharacterId[]): number =>
    Math.min(spec.count, customTargets(board, spec, me, chars).length);

/** 即発動系の対象: all は全対象、random は pick で count 個（対象が少なければあるだけ）。選択系は空 */
export const customCellsAuto = (
    board: SquareInfo[],
    spec: CustomSkillSpec,
    me: Player,
    chars: readonly CharacterId[],
    pick: (cells: number[], n: number) => number[]
): number[] => {
    if (!hasCellOps(spec)) return [];
    const all = customTargets(board, spec, me, chars);
    if (spec.pick === 'all') return all;
    if (spec.pick === 'random') return pick(all, Math.min(spec.count, all.length));
    return [];
};

// ---- 適用 ----

export type CustomApplyEnv = {
    /** 使用者（オブジェクトの持ち主） */
    me: Player;
    chars: readonly CharacterId[];
    size: number;
    /** 冬至の種子のガード中か（火炎で🌱が消えない） */
    keepBuds?: (sq: SquareInfo) => boolean;
};

export type CustomResult = {
    /** 効果が乗ったマス（昇順・重複なし） */
    affected: number[];
    /** 氷結が身代わりになった（ダメージ・破壊が吸収された）マス */
    blocked: number[];
    /** 火炎で解けた氷結のマス */
    thawed: number[];
    /** 破壊されて空きマスになったマス */
    destroyed: number[];
};

/** cells に効果を順に適用する。乗らないマスは飛ばす。board を直接書き換える */
export const applyCustom = (board: SquareInfo[], cells: number[], spec: CustomSkillSpec, env: CustomApplyEnv): CustomResult => {
    const affected = new Set<number>();
    const blocked = new Set<number>();
    const thawed = new Set<number>();
    const destroyed = new Set<number>();
    for (const op of spec.ops) {
        if (isGlobalOp(op)) continue; // サイレンス・ギア封じは盤面を変えない（Game が席の状態に掛ける）
        const targets = cells.filter((k) => opApplies(board[k], op) && !isShielded(board[k], env.chars));
        switch (op.op) {
            case 'heal':
                for (const k of targets) {
                    board[k] = { ...board[k], bind: board[k].bind + op.amount };
                    affected.add(k);
                }
                break;
            case 'damage':
                for (const k of targets) {
                    const hit = applyDamage(board[k], op.amount, 'skill');
                    if (hit.blocked) {
                        board[k] = hit.sq;
                        blocked.add(k);
                    } else if (op.destroyOnZero && hit.sq.bind === 0) {
                        board[k] = { ...EMPTY };
                        destroyed.add(k);
                        affected.add(k);
                    } else {
                        board[k] = hit.sq;
                        affected.add(k);
                    }
                }
                break;
            case 'destroy':
                for (const k of targets) {
                    const guard = absorbDestroy(board[k]);
                    if (guard.blocked) {
                        board[k] = guard.sq;
                        blocked.add(k);
                    } else {
                        board[k] = { ...EMPTY };
                        destroyed.add(k);
                        affected.add(k);
                    }
                }
                break;
            case 'object':
                for (const k of targets) {
                    // 空きマスに乗っていた🔥は引き継ぐ（大木は即座に燃え尽きる）
                    board[k] = { ...newObject(env.me, op.object), effects: board[k].effects.filter((e) => e.effect === '🔥') };
                    affected.add(k);
                }
                sweepBurntTrees(board).forEach((k) => destroyed.add(k));
                break;
            case 'effect':
                if (op.effect === 'poison') addPoison(board, targets, env.chars, op.count);
                else if (op.effect === 'fire') ignite(board, targets, env.size, op.count, env.keepBuds).thawed.forEach((k) => thawed.add(k));
                else if (op.effect === 'charge') for (const k of targets) for (let n = 0; n < op.count; n++) board[k] = addCharge(board[k], env.chars);
                else if (op.effect === 'frost') freeze(board, targets);
                else for (let n = 0; n < op.count; n++) sow(board, targets);
                targets.forEach((k) => affected.add(k));
                break;
        }
    }
    const asc = (s: Set<number>) => Array.from(s).sort((a, b) => a - b);
    return { affected: asc(affected), blocked: asc(blocked), thawed: asc(thawed), destroyed: asc(destroyed) };
};

/** 代償を主効果のあとに適用する。ランダムな1コマ（候補が無ければ不発）に掛ける。board を直接書き換え、合算した結果と不発の数を返す */
export const applyDrawbacks = (
    board: SquareInfo[],
    spec: CustomSkillSpec,
    me: Player,
    env: CustomApplyEnv,
    pick: (cells: number[], n: number) => number[]
): CustomResult & { skipped: number } => {
    const total: CustomResult & { skipped: number } = { affected: [], blocked: [], thawed: [], destroyed: [], skipped: 0 };
    for (const d of spec.drawbacks) {
        const cands = board
            .map((sq, i) => (kindMatches(sq, d.side === 'own' ? 'own' : 'enemy', me) && !isShielded(sq, env.chars) && opApplies(sq, d.op) ? i : -1))
            .filter((i) => i !== -1);
        if (cands.length === 0) {
            total.skipped++;
            continue;
        }
        const r = applyCustom(board, pick(cands, 1), { ...spec, ops: [d.op] }, env);
        total.affected.push(...r.affected);
        total.blocked.push(...r.blocked);
        total.thawed.push(...r.thawed);
        total.destroyed.push(...r.destroyed);
    }
    return total;
};

/** 盤面の演出の種類（BoardEffects の SkillEffectType のうち、効果に近いもの）。複数の効果は先頭のもの */
export const customEffectType = (spec: CustomSkillSpec): 'rain' | 'opium' | 'poison' | 'flame' | 'zap' | 'freeze' | 'windborne' | 'token' | 'silence' | 'strip' => {
    const op = spec.ops[0];
    switch (op.op) {
        case 'heal':
            return 'rain';
        case 'damage':
        case 'destroy':
            return 'opium';
        case 'object':
            return 'token';
        case 'silence':
            return 'silence';
        case 'gearOff':
            return 'strip';
        case 'effect':
            return { poison: 'poison', fire: 'flame', charge: 'zap', frost: 'freeze', bud: 'windborne' }[op.effect] as 'poison' | 'flame' | 'zap' | 'freeze' | 'windborne';
    }
};

/** カードの色分け（スキルの種類）: 先頭の効果 */
export const customCategory = (spec: CustomSkillSpec): SkillCategory => {
    const op = spec.ops[0];
    if (op.op === 'heal') return 'support';
    if (op.op === 'damage' || op.op === 'destroy') return 'attack';
    if (op.op === 'object') return 'object';
    if (op.op === 'silence' || op.op === 'gearOff') return 'control';
    return { poison: 'poison', fire: 'fire', charge: 'charge', frost: 'ice', bud: 'buds' }[op.effect] as SkillCategory;
};

/** カードの見た目（アイコン）: 先頭の効果 */
export const customIcon = (spec: CustomSkillSpec): string => {
    const op = spec.ops[0];
    switch (op.op) {
        case 'heal':
            return '💚';
        case 'damage':
            return '⚔️';
        case 'destroy':
            return '💥';
        case 'object':
            return OBJECT_DEFS[op.object].icon;
        case 'silence':
            return '🤫';
        case 'gearOff':
            return '🚫';
        case 'effect':
            return statusDef(op.effect).icon;
    }
};

// ---- 保存（ブラウザの localStorage。デッキと同じく読み書きに失敗しても動く） ----

export const CUSTOM_SKILL_KEY = 'ticatactoe.customSkill';
export type CustomStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const browserStorage = (): CustomStorage | undefined => {
    try {
        return typeof window !== 'undefined' ? window.localStorage : undefined;
    } catch {
        return undefined;
    }
};

/** 保存したオリジナルスキルを読む。無い・壊れている場合は undefined（読めたものも整え直す） */
export const loadCustomSkill = (storage: CustomStorage | undefined = browserStorage()): CustomSkillSpec | undefined => {
    try {
        const raw = storage?.getItem(CUSTOM_SKILL_KEY);
        if (!raw) return undefined;
        const parsed: unknown = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return undefined;
        return normalizeSpec(parsed as CustomSkillSpec);
    } catch {
        return undefined;
    }
};

/** 保存する（整えた上で）。保存できたら整えた仕様、できなければ undefined */
export const saveCustomSkill = (spec: CustomSkillSpec, storage: CustomStorage | undefined = browserStorage()): CustomSkillSpec | undefined => {
    try {
        if (!storage) return undefined;
        const next = normalizeSpec(spec);
        storage.setItem(CUSTOM_SKILL_KEY, JSON.stringify(next));
        return next;
    } catch {
        return undefined;
    }
};

export const clearCustomSkill = (storage: CustomStorage | undefined = browserStorage()): void => {
    try {
        storage?.removeItem(CUSTOM_SKILL_KEY);
    } catch {
        // 消せなくても致命的ではない
    }
};
