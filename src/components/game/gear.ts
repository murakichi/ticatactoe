import { CharacterId } from '../../types/Character';
import { SkillCosts, skillCosts } from './skillCosts';

/**
 * ギア: キャラ選択時に装備する追加パッシブ。長所と短所がセットのものが多い。
 * ヘッドレス版は sim/gear.js に同じ定義を複製してある（gear.test.ts が一致を確認する）。
 * 数値はすべて GEAR_PARAMS に集め、説明文もここから描画する（説明文と実装のズレ防止）。
 */
export type GearId =
    | 'emptyLock'
    | 'ironLock'
    | 'bindingLock'
    | 'quadMastery'
    | 'afterglow'
    | 'luckyPurse'
    | 'sturdy'
    | 'titanCost'
    | 'reinforce'
    | 'harvest'
    | 'toxicBloom'
    | 'priceWreck'
    | 'chainDiscount'
    | 'propagate'
    | 'lightToken'
    | 'gambler'
    | 'vengeance'
    | 'colorGarden'
    | 'ailmentPact'
    | 'ruinSurge'
    | 'lastStand';

export const GEAR_PARAMS = {
    /** 通常のロック期間(ライフ) */
    lockBind: 6,
    /** 堅牢の鍵のロック期間 */
    ironLockBind: 9,
    /** 空蔵: 期限切れで生まれる自陣のコマのライフ */
    emptyLockLife: 1,
    /** 道連れの鍵: トークン系スキルで置いたコマにロックが付く確率 */
    bindingLockChance: 0.7,
    /** 四連の極意: この回数スキルを使うと、次のスキルが無料 */
    quadCount: 4,
    /** 余韻: 次ターン1つ目のスキルのコスト変化 */
    afterglowDelta: -1,
    /** 幸運の財布: スキルのコストが0になる確率 */
    luckyPurseChance: 0.2,
    /** 頑健: ライフ平均 */
    sturdyLife: 1,
    /** 剛腕の代償: ライフ平均とスキルコスト */
    titanLife: 3,
    titanCost: 3,
    /** 増援 / 軽量トークン: トークンスキルで置くコマのライフの変化 */
    reinforceTokenLife: 2,
    lightTokenLife: -1,
    /** 軽量トークン: トークン系スキルのコスト変化 */
    lightTokenCost: -1,
    /** 収穫: 1回のスキル使用で得られる魔力の上限 */
    harvestCap: 5,
    /** 価格破壊: 基礎コストに足すランダム値の範囲 ±N（下限1） */
    priceRange: 4,
    /** 価格破壊: ずらしたあとの基礎コストの下限（元のコストがこれ未満ならそのまま） */
    priceFloor: 2,
    /** 賭博師の骰子: ライフ値の標準偏差 */
    gamblerStd: 5,
    /** 復讐の刃: 自分のコマを奪われたときの魔力 / 自分が奪取したときの魔力 / 1手での獲得上限 */
    vengeanceGain: 2,
    vengeancePenalty: 1,
    vengeanceCap: 4,
    /** 彩りの庭: 1つのマスにこの種類数以上のエフェクトがある自陣のマス1つにつき、ターン開始時の魔力が増える量 */
    varietyKinds: 2,
    varietyMagic: 1,
    /** 病炎の契り: 自陣に毒・火炎がある種類1つにつき、固有以外のスキルのコストが下がる量 */
    ailmentDiscount: 1,
    /** 廃墟の底力: 自陣がスキルかエフェクトで破壊されたあと、次の自分の手番の終わりまでスキルのコストが下がる量 */
    ruinDiscount: 1,
    /** 土壇場の防壁: 発動後、相手の手番開始時の魔力とライフ平均への加算 */
    lastStandMagic: 4,
    lastStandLife: 2,
} as const;

export type GearDef = { id: GearId; name: string; icon: string; desc: string };

const P = GEAR_PARAMS;

export const GEARS: GearDef[] = [
    { id: 'emptyLock', name: '空蔵', icon: '🕳️', desc: `空きマスにかけたロックが切れると、そのマスがライフ${P.emptyLockLife}の自陣のコマになる` },
    { id: 'ironLock', name: '堅牢の鍵', icon: '🔒', desc: `ロックの期間が${P.ironLockBind}ターンになる（通常${P.lockBind}）` },
    { id: 'bindingLock', name: '道連れの鍵', icon: '🗝️', desc: `トークン系スキルで置いたコマに${P.bindingLockChance * 100}%でロックが付く` },
    { id: 'quadMastery', name: '四連の極意', icon: '🎴', desc: `1ターンにスキルを${P.quadCount}回使うと、そのターンの次のスキルのコストが0になる` },
    { id: 'afterglow', name: '余韻', icon: '🔔', desc: `スキルを使った次のターン、1つ目のスキルのコスト${P.afterglowDelta}（下限1）` },
    { id: 'luckyPurse', name: '幸運の財布', icon: '👛', desc: `スキル使用時、${P.luckyPurseChance * 100}%の確率で消費コストが0になる` },
    { id: 'sturdy', name: '頑健', icon: '🛡️', desc: `ライフ平均+${P.sturdyLife}` },
    { id: 'titanCost', name: '剛腕の代償', icon: '🏋️', desc: `ライフ平均+${P.titanLife}。全スキルのコスト+${P.titanCost}` },
    { id: 'reinforce', name: '増援', icon: '🪖', desc: `トークンスキルで置くコマのライフ+${P.reinforceTokenLife}` },
    { id: 'harvest', name: '収穫', icon: '🌾', desc: `エフェクト(🌱🔑☠⚡)を付与するスキルを使うと、付与した数だけ魔力+1（1回につき最大${P.harvestCap}）` },
    { id: 'toxicBloom', name: '毒花', icon: '🌺', desc: '自陣のコマに毒が付くと、そのコマにバッズも付く（自分で付けた毒でも、相手から付けられた毒でも）' },
    { id: 'priceWreck', name: '価格破壊', icon: '🏷️', desc: `試合開始時に、全スキルの基礎コストがそれぞれランダムに-${P.priceRange}〜+${P.priceRange}される（下限${P.priceFloor}。試合中は固定）` },
    { id: 'chainDiscount', name: '連鎖割引', icon: '🔗', desc: 'スキルを使うたび、そのターンの間は全スキルのコスト-1（重複する。下限1）' },
    { id: 'propagate', name: '伝播', icon: '🌊', desc: 'エフェクト付きトークンを置くと、周囲8マスのランダムなコマに同じエフェクトが広がる' },
    { id: 'lightToken', name: '軽量トークン', icon: '🪶', desc: `トークン系スキルのコスト${P.lightTokenCost}、ただし置くコマのライフ${P.lightTokenLife}` },
    { id: 'gambler', name: '賭博師の骰子', icon: '🎲', desc: `ライフ値のばらつきが大きくなる（標準偏差を${P.gamblerStd}に。平均は変わらない）` },
    { id: 'vengeance', name: '復讐の刃', icon: '🗡️', desc: `自分のコマを奪われると魔力+${P.vengeanceGain}（1手で最大+${P.vengeanceCap}）。自分が敵のコマを奪取すると魔力-${P.vengeancePenalty}` },
    { id: 'colorGarden', name: '彩りの庭', icon: '🎨', desc: `自陣に、1つのマスにエフェクトが${P.varietyKinds}種類以上あるマスがあると、1マスにつきターン開始時の魔力+${P.varietyMagic}` },
    { id: 'ailmentPact', name: '病炎の契り', icon: '🩸', desc: `自陣に毒・火炎(🔥)があると、1種類につき固有以外のスキルのコスト-${P.ailmentDiscount}（下限1）` },
    { id: 'ruinSurge', name: '廃墟の底力', icon: '🏚️', desc: `自陣がスキルかエフェクトで破壊されたとき、次の自分の手番の終わりまでスキルのコスト-${P.ruinDiscount}（下限1）` },
    { id: 'lastStand', name: '土壇場の防壁', icon: '🏰', desc: `初めて相手が列を揃えて勝つとき、かわりにその列のマスと自陣のコマがすべて消滅する（ロック・氷結を貫通）。ただしその後は、相手の手番開始時の魔力+${P.lastStandMagic}、ライフ平均+${P.lastStandLife}` },
];

export const GEAR_IDS: GearId[] = GEARS.map((g) => g.id);
export const gearDefOf = (id: GearId): GearDef => GEARS.find((g) => g.id === id)!;

/** 装備できる枠数。固有スキルの無い「あなた」だけ3枠 */
export const gearSlotsFor = (character: CharacterId): number => (character === 'you' ? 3 : 2);

type Gears = readonly GearId[] | undefined;
export const hasGear = (gears: Gears, id: GearId): boolean => !!gears && gears.includes(id);

/** ライフ平均への加算（頑健 / 剛腕の代償） */
export const gearLifeBonus = (gears: Gears): number =>
    (hasGear(gears, 'sturdy') ? P.sturdyLife : 0) + (hasGear(gears, 'titanCost') ? P.titanLife : 0);

/** ライフ値の標準偏差。賭博師の骰子があれば広がる */
export const gearLifeStd = (gears: Gears, base: number): number => (hasGear(gears, 'gambler') ? P.gamblerStd : base);

/** ロックの期間（ライフ）。堅牢の鍵で延びる */
export const gearLockBind = (gears: Gears): number => (hasGear(gears, 'ironLock') ? P.ironLockBind : P.lockBind);

/** トークンスキルで置くコマのライフ補正（増援 / 軽量トークン）。最終ライフは1以上に丸める側で行う */
export const gearTokenBindDelta = (gears: Gears): number =>
    (hasGear(gears, 'reinforce') ? P.reinforceTokenLife : 0) + (hasGear(gears, 'lightToken') ? P.lightTokenLife : 0);

/** 手番内のスキル使用状況。コスト補正の入力になる */
export type CostContext = {
    /** この手番にすでに使ったスキルの数 */
    skillsThisTurn: number;
    /** 余韻の割引が有効か（前の手番にスキルを使った）。その手番の1つ目のスキルまで */
    echoReady: boolean;
    /** 病炎の契り: 自陣にある毒・火炎の種類数(0〜2) */
    ailments?: number;
    /** 廃墟の底力: 割引が有効か（自陣が破壊されたあとの、自分の次の手番の終わりまで） */
    ruin?: boolean;
};

/** キャラ固有のスキル（病炎の契りの対象外）。skillCosts のキー */
export const EXCLUSIVE_SKILL_KEYS: readonly string[] = [
    'onClickTotalAssault',
    'onClickStomp',
    'onClickJudgeDay',
    'onClickToggleYingYang',
    'onClickYingYangSkill',
    'onClickNecromancy',
    'onClickMiasma',
    'onClickChargeSpread',
    'onClickGlacier',
    'onClickInferno',
];

/** マスの最小限の形（盤の SquareInfo と sim の盤の両方に合う） */
type SquareLike = { player?: string; effects: readonly { effect: string }[] };

/** 彩りの庭: player の自陣のマスのうち、エフェクトが varietyKinds 種類以上あるマスの数 */
export const countVarietySquares = (squares: readonly SquareLike[], player: string): number =>
    squares.filter((sq) => sq.player === player && new Set(sq.effects.map((e) => e.effect)).size >= P.varietyKinds).length;

/** 病炎の契り: player の自陣にある毒・火炎の種類数(0〜2) */
export const countAilmentKinds = (squares: readonly SquareLike[], player: string): number => {
    const own = squares.filter((sq) => sq.player === player);
    return (own.some((sq) => sq.effects.some((e) => e.effect === '☠')) ? 1 : 0) + (own.some((sq) => sq.effects.some((e) => e.effect === '🔥')) ? 1 : 0);
};

/** 廃墟の底力: before(手番開始時の持ち主)に対し、player のコマが盤から無くなった(または持ち主が変わった)マス。除外マスは通常の攻撃の着手マス */
export const lostCells = (before: readonly (string | undefined)[], after: readonly (string | undefined)[], player: string, exclude: number | null): number[] =>
    before.map((p, i) => (p === player && after[i] !== player && i !== exclude ? i : -1)).filter((i) => i >= 0);

/**
 * キャラ補正を済ませたコストに、ギアのコスト補正を掛ける。
 * 下げる方向の補正は下限1（もともと0のコストは0のまま）。四連の極意の無料だけは0にする。
 */
export const adjustCostByGear = (cost: number, gears: Gears, ctx: CostContext, isToken: boolean = false, skillKey?: string): number => {
    if (!gears || gears.length === 0) return cost;
    if (hasGear(gears, 'quadMastery') && ctx.skillsThisTurn === P.quadCount) return 0;
    let delta = 0;
    if (hasGear(gears, 'titanCost')) delta += P.titanCost;
    if (hasGear(gears, 'afterglow') && ctx.echoReady && ctx.skillsThisTurn === 0) delta += P.afterglowDelta;
    if (hasGear(gears, 'chainDiscount')) delta -= ctx.skillsThisTurn;
    if (hasGear(gears, 'lightToken') && isToken) delta += P.lightTokenCost;
    // 病炎の契り: 固有スキルは対象外。廃墟の底力: すべてのスキル
    if (hasGear(gears, 'ailmentPact') && !(skillKey && EXCLUSIVE_SKILL_KEYS.includes(skillKey))) delta -= P.ailmentDiscount * (ctx.ailments ?? 0);
    if (hasGear(gears, 'ruinSurge') && ctx.ruin) delta -= P.ruinDiscount;
    const next = cost + delta;
    return delta < 0 ? Math.min(cost, Math.max(1, next)) : next;
};

/** 価格破壊の対象にするスキル。シャッフル(1固定)とチャージは対象外。蘇生は墓地と召喚数に連動するので対象外 */
export const PRICEABLE_KEYS: (keyof SkillCosts)[] = (Object.keys(skillCosts) as (keyof SkillCosts)[]).filter(
    (k) => !['onClickShuffle', 'onClickCharge', 'onClickDepressionCherry'].includes(k)
);

export type PriceOffsets = Partial<Record<keyof SkillCosts, number>>;

/** 価格破壊: スキルごとの加算値を抽選する（rng は [0,1) を返す関数） */
export const rollPriceOffsets = (rng: () => number): PriceOffsets => {
    const out: PriceOffsets = {};
    for (const k of PRICEABLE_KEYS) out[k] = Math.floor(rng() * (2 * P.priceRange + 1)) - P.priceRange;
    return out;
};

/** 基礎コストに加算値を足す。下げる方向は下限 priceFloor まで（元のコストが下限未満ならそのまま） */
export const priceShift = (base: number, offset: number): number => {
    const next = base + offset;
    return offset > 0 ? next : Math.min(base, Math.max(GEAR_PARAMS.priceFloor, next));
};

/** 基礎コスト表に価格破壊の加算値を適用する。offsets が無ければ元の表をそのまま返す */
export const applyPriceOffsets = (base: SkillCosts, offsets: PriceOffsets | undefined): SkillCosts => {
    if (!offsets) return base;
    const out = { ...base };
    for (const k of PRICEABLE_KEYS) out[k] = priceShift(base[k], offsets[k] ?? 0);
    return out;
};

/** ランダム付与: 重複なく slots 個を選ぶ（rng は [0,1) を返す関数） */
export const randomGears = (slots: number, rng: () => number = Math.random): GearId[] => {
    const pool = [...GEAR_IDS];
    const out: GearId[] = [];
    for (let i = 0; i < slots && pool.length > 0; i++) {
        out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
    }
    return out;
};

/**
 * AI が席のキャラに合わせて選ぶギア（枠数ぶん）。キャラ×ギアの総当たり（各200試合、seed 1）の上位を選び、
 * 別 seed（400試合）で無装備より勝率が上がることを確認した組み合わせ（2026-10-19、docs/diary/2026-10-19.md）。
 * 測っていないキャラは、全キャラで一貫して効いた頑健にする。
 */
export const RECOMMENDED_GEARS: Partial<Record<CharacterId, GearId[]>> = {
    you: ['luckyPurse', 'titanCost', 'sturdy'],
    tactician: ['sturdy', 'priceWreck'],
    magician: ['sturdy', 'ironLock'],
    giant: ['titanCost', 'sturdy'],
    yinYangMaster: ['sturdy', 'ironLock'],
    necromancer: ['vengeance', 'sturdy'],
    poisoner: ['lastStand', 'sturdy'],
    electrician: ['lightToken', 'harvest'],
    // 氷室の番人・煉獄の鍛冶師は未計測。全キャラで一貫して効いた頑健＋収穫を暫定で選ぶ
    cryomancer: ['afterglow', 'sturdy'],
    pyromancer: ['sturdy', 'harvest'],
};

export const recommendedGears = (character: CharacterId): GearId[] =>
    (RECOMMENDED_GEARS[character] ?? ['sturdy']).slice(0, gearSlotsFor(character));

/**
 * 主案(RECOMMENDED_GEARS)と同等に強い別案。あるキャラだけ書く。AI席は主案と別案からランダムに選ぶ（pickRecommendedGears）。
 * sim の環境測定は主案だけで行う（再現性のため）。別案は主案と同程度の環境勝率であることを確かめたものだけ入れる（docs/tune/<char>.md）。
 */
export const ALT_RECOMMENDED_GEARS: Partial<Record<CharacterId, GearId[][]>> = {
    electrician: [['afterglow', 'harvest']], // 主案 lightToken,harvest と同等（docs/tune/electrician.md 試行19）
};

/** AI席が使うギア。主案と別案を同じ確率で選ぶ（別案が無ければ主案） */
export const pickRecommendedGears = (character: CharacterId, rng: () => number = Math.random): GearId[] => {
    const patterns = [recommendedGears(character), ...(ALT_RECOMMENDED_GEARS[character] ?? []).map((g) => g.slice(0, gearSlotsFor(character)))];
    return patterns[Math.floor(rng() * patterns.length)];
};

/** トークン系スキルが付けるエフェクト（伝播・収穫の対象） */
export type TokenEffect = '🌱' | '☠' | '⚡';
