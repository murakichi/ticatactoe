import { CharacterId } from '../../types/Character';
import { SkillCosts, skillCosts } from './skillCosts';
import { Player } from '../../types/Player';
import { SquareInfo } from '../../types/SquareInfo';
import { geometryForCells } from './boardGeometry';
import { OBJECT_PLACE_KEYS } from './objects';

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
    | 'lastStand'
    | 'springThunder'
    | 'scorchedEarth'
    | 'ashOffering'
    | 'frostRoot'
    | 'conduction'
    | 'spellWard'
    | 'buildMania'
    | 'snowball'
    | 'reaper'
    | 'budSeed';

export const GEAR_PARAMS = {
    /** 通常のロック期間(ライフ) */
    lockStack: 6,
    /** 堅牢の鍵のロック期間 */
    ironLockStack: 9,
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
    /** 焦土: 🔥で敵の🌱が消えるたびの魔力と、1回の確認(1手番)あたりの上限 */
    scorchMagic: 2,
    scorchCap: 6,
    /** 灰の供物: 敵のマスに🔥を付与したマス1つにつき、次の自分の手番の終わりまで全スキルのコスト-N（重複する） */
    ashDiscount: 1,
    /** 普請道楽: 自陣にオブジェクトが無いときのオブジェクト設置スキルの割引と、ある間の全スキルの割引（重ならない） */
    buildPlaceCut: 2,
    buildAllCut: 3,
    /** 凍てつく根: 氷結で休眠した🌱(敵味方問わず)1つにつきの魔力(上限なし) */
    rootMagic: 1,
    /** 雪だるま: 自分の手番ごとに足されるライフ期待値 / リセットの目安にするライフの値 / その回数 */
    rampStep: 1,
    rampHighLife: 10,
    rampResetHits: 3,
    /** 死神の鎌: 自陣のライフ期待値への加算 */
    reaperLife: 2,
    /** 芽吹き: この値以上のライフのコマを設置するとき、🌱を付けて置く */
    budSeedLife: 7,
} as const;

export type GearDef = { id: GearId; name: string; icon: string; desc: string };

const P = GEAR_PARAMS;

export const GEARS: GearDef[] = [
    { id: 'emptyLock', name: '空蔵', icon: '🕳️', desc: `空きマスにかけたロックが切れると、そのマスが自陣のコマになる` },
    { id: 'ironLock', name: '堅牢の鍵', icon: '🔒', desc: `ロックの期間が${P.ironLockStack}ターンに延長` },
    { id: 'bindingLock', name: '道連れの鍵', icon: '🗝️', desc: `トークンで置いたコマに${P.bindingLockChance * 100}%でロックが付く` },
    { id: 'quadMastery', name: '四連の極意', icon: '🎴', desc: `1ターンにスキルを何度も使うと、次のスキルが無料` },
    { id: 'afterglow', name: '余韻', icon: '🔔', desc: `スキルを使った次のターン、最初のスキルのコストが軽減` },
    { id: 'luckyPurse', name: '幸運の財布', icon: '👛', desc: `スキル使用時に${P.luckyPurseChance * 100}%でコスト0` },
    { id: 'sturdy', name: '頑健', icon: '🛡️', desc: `コマのライフが上昇` },
    { id: 'titanCost', name: '剛腕の代償', icon: '🏋️', desc: `コマのライフが大きく上昇するが、全スキルのコストが増加` },
    { id: 'reinforce', name: '増援', icon: '🪖', desc: `トークンで置くコマのライフが上昇` },
    { id: 'harvest', name: '収穫', icon: '🌾', desc: `エフェクトを付与するスキルを使うと、付与した数だけマジックを獲得（最大${P.harvestCap}）` },
    { id: 'toxicBloom', name: '毒花', icon: '🌺', desc: `自陣のコマに毒が付くと、バッズも付与` },
    { id: 'priceWreck', name: '価格破壊', icon: '🏷️', desc: `試合開始時に、全スキルのコストがランダムに変動` },
    { id: 'chainDiscount', name: '連鎖割引', icon: '🔗', desc: `スキルを使うたび、そのターンの全スキルのコストが軽減` },
    { id: 'propagate', name: '伝播', icon: '🌊', desc: `エフェクト付きのトークンを置くと、周囲のコマにも同じエフェクトが拡散` },
    { id: 'lightToken', name: '軽量トークン', icon: '🪶', desc: `トークン系スキルが安いが、置くコマのライフが低い` },
    { id: 'gambler', name: '賭博師の骰子', icon: '🎲', desc: `コマのライフのばらつきが拡大（標準偏差${P.gamblerStd}）` },
    { id: 'vengeance', name: '復讐の刃', icon: '🗡️', desc: `コマを奪われるとマジックを獲得、敵のコマを奪うとマジックを喪失` },
    { id: 'colorGarden', name: '彩りの庭', icon: '🎨', desc: `1つのマスに多種類のエフェクトがあると、手番開始時にマジックを獲得` },
    { id: 'ailmentPact', name: '病炎の契り', icon: '🩸', desc: `自陣に毒・火炎があると、固有以外のスキルが安い` },
    { id: 'ruinSurge', name: '廃墟の底力', icon: '🏚️', desc: `自陣のコマが破壊されると、次の手番の終わりまでスキルが安い` },
    { id: 'scorchedEarth', name: '焦土', icon: '🌋', desc: `敵の🌱・🍂が🔥で消えるたびにマジックを獲得` },
    { id: 'ashOffering', name: '灰の供物', icon: '⚱️', desc: `敵のマスに🔥を付与すると、次の手番の終わりまでスキルが安い` },
    { id: 'frostRoot', name: '凍てつく根', icon: '🧊', desc: `手番開始時、氷結で休眠中の🌱の数だけマジックを獲得` },
    { id: 'conduction', name: '伝導', icon: '🔌', desc: `帯電したコマの毒・火炎を、ダメージを受けた敵のマスに伝播` },
    { id: 'spellWard', name: '術中の加護', icon: '🕊️', desc: `誰かがスキルを使ったターンの間、自陣のコマはエフェクトのダメージを受けない` },
    { id: 'springThunder', name: '春雷', icon: '🌩️', desc: `手番開始時、自陣のリーチを塞ぐ氷結を1つ解除` },
    { id: 'snowball', name: '雪だるま', icon: '⛄', desc: `自分の手番ごとにライフの期待値が積み上がり、高いライフを何度か引くとリセットされる` },
    { id: 'reaper', name: '死神の鎌', icon: '💀', desc: `コマのライフが上昇。ライフ0の駒は、誰のものでも手番の終わりに壊れる` },
    { id: 'budSeed', name: '芽吹き', icon: '🌷', desc: `ライフの高いコマを設置するとき、バッズを付けて設置される` },
    { id: 'buildMania', name: '普請道楽', icon: '🔨', desc: `オブジェクト設置スキルが安く、設置中は全スキルも安い` },
    { id: 'lastStand', name: '土壇場の防壁', icon: '🏰', desc: `初めて相手が列を揃えて勝つとき、かわりにその列と自陣のコマが消滅` },
];

export const GEAR_IDS: GearId[] = GEARS.map((g) => g.id);
export const gearDefOf = (id: GearId): GearDef => GEARS.find((g) => g.id === id)!;

/** 装備できる枠数。固有スキルの無い「あなた」だけ3枠 */
export const gearSlotsFor = (character: CharacterId): number => (character === 'you' ? 3 : 2);

export type Gears = readonly GearId[] | undefined;
export const hasGear = (gears: Gears, id: GearId): boolean => !!gears && gears.includes(id);

/** ライフ平均への加算（頑健 / 剛腕の代償） */
export const gearLifeBonus = (gears: Gears): number =>
    (hasGear(gears, 'sturdy') ? P.sturdyLife : 0) + (hasGear(gears, 'titanCost') ? P.titanLife : 0) + (hasGear(gears, 'reaper') ? P.reaperLife : 0);

/** ライフ値の標準偏差。賭博師の骰子があれば広がる */
export const gearLifeStd = (gears: Gears, base: number): number => (hasGear(gears, 'gambler') ? P.gamblerStd : base);

/** ロックの期間（ライフ）。堅牢の鍵で延びる */
export const gearLockStack = (gears: Gears): number => (hasGear(gears, 'ironLock') ? P.ironLockStack : P.lockStack);

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
    /** 灰の供物: 有効な割引の重ね数 */
    ash?: number;
    /** 普請道楽: 自陣にオブジェクトがあるか */
    ownObjects?: boolean;
};

/** キャラ固有のスキル（病炎の契りの対象外）。skillCosts のキー */
export const EXCLUSIVE_SKILL_KEYS: readonly string[] = [
    'onClickTotalAssault',
    'onClickStomp',
    'onClickJudgeDay',
    'onClickToggleYingYang',
    'onClickShikigamiPlace',
    'onClickShikigamiBlast',
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

const budCount = (sq: SquareLike): number => sq.effects.filter((e) => e.effect === '🌱').length;
/** 焦土の対象: 🔥で燃えて消える🌱と🍂（枯れ葉）の数 */
const burnableCount = (sq: SquareLike): number => sq.effects.filter((e) => e.effect === '🌱' || e.effect === '🍂').length;
const flameCount = (sq: SquareLike): number => sq.effects.filter((e) => e.effect === '🔥').length;
const hasEffect = (sq: SquareLike, effect: string): boolean => sq.effects.some((e) => e.effect === effect);

/** 焦土: 手番開始時の記録(owners/buds。🌱と🍂の合計)に対し、holder 以外のコマの🌱・🍂が🔥で消えた数（同じ持ち主のまま🔥があり、🌱が減ったマス） */
export const burnedBudCount = (owners: readonly (string | undefined)[], buds: readonly number[], squares: readonly SquareLike[], holder: string): number =>
    squares.reduce((n, sq, i) => (owners[i] && owners[i] !== holder && sq.player === owners[i] && hasEffect(sq, '🔥') ? n + Math.max(0, buds[i] - burnableCount(sq)) : n), 0);
export const scorchGain = (burned: number): number => Math.min(P.scorchCap, burned * P.scorchMagic);
/** 灰の供物: 手番開始時の記録(owners/flames)に対し、holder 以外のコマで🔥が増えたマスの数 */
export const ignitedCount = (owners: readonly (string | undefined)[], flames: readonly number[], squares: readonly SquareLike[], holder: string): number =>
    squares.reduce((n, sq, i) => (owners[i] && owners[i] !== holder && sq.player === owners[i] && flameCount(sq) > flames[i] ? n + 1 : n), 0);
export const flameCounts = (squares: readonly SquareLike[]): number[] => squares.map(flameCount);
/** 凍てつく根: 氷結中のマスにある🌱の数（敵味方問わず）→魔力 */
export const frozenBudCount = (squares: readonly SquareLike[]): number => squares.reduce((n, sq) => (hasEffect(sq, '❄') ? n + budCount(sq) : n), 0);
export const rootGain = (frozenBuds: number): number => frozenBuds * P.rootMagic;
/** 手番開始時の🌱の数の記録 */
export const budCounts = (squares: readonly SquareLike[]): number[] => squares.map(burnableCount);

/** 雪だるま: 席ごとの積み上げ(stack)と、10以上のライフが出た回数(hits)。最初は+0から */
export type RampState = { stack: number; hits: number };
export const rampStart = (): RampState => ({ stack: 0, hits: 0 });
/** 次に引くライフの期待値に足す加算 */
export const rampBonus = (s: RampState): number => s.stack * P.rampStep;
/** 引いたライフを数える。10以上が規定回数に達したら積み上げと回数をリセット(次は+0)。そうでなければ積み上げを1段上げる */
export const rampAfterRoll = (s: RampState, life: number): RampState => {
    const hits = s.hits + (life >= P.rampHighLife ? 1 : 0);
    return hits >= P.rampResetHits ? rampStart() : { stack: s.stack + 1, hits };
};

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
    if (hasGear(gears, 'ashOffering')) delta -= P.ashDiscount * (ctx.ash ?? 0);
    // 普請道楽: 自陣にオブジェクトが無いときはオブジェクトを設置するスキルが-2、ある間は全スキル-3（設置スキルの-2は無いときだけ。重ならない）
    if (hasGear(gears, 'buildMania')) delta -= ctx.ownObjects ? P.buildAllCut : skillKey && OBJECT_PLACE_KEYS.has(skillKey) ? P.buildPlaceCut : 0;
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
    tactician: ['lastStand', 'priceWreck'],
    magician: ['spellWard', 'luckyPurse'], // 旧主案に戻す: lastStand,luckyPurse は鍛冶師に弱い（全相手 seed241/100: 対鍛冶師 12〜17% vs 83〜87%、全相手 64.6〜65.1 vs 70.4。docs/tune/magician.md 試行56・57）
    giant: ['lastStand', 'sturdy'],
    yinYangMaster: ['lastStand', 'chainDiscount'], // 対強豪平均 42→46%（3シード各400: seed2 +5.5/seed8 +5.0/seed21 +3.7。氷室 21→36%）。旧: lastStand,afterglow
    necromancer: ['vengeance', 'lastStand'],
    poisoner: ['lastStand', 'spellWard'],
    electrician: ['lightToken', 'harvest'],
    // 氷室の番人・煉獄の鍛冶師は未計測。全キャラで一貫して効いた頑健＋収穫を暫定で選ぶ
    cryomancer: ['lightToken', 'lastStand'],
    pyromancer: ['afterglow', 'vengeance'], // 余韻+復讐の刃(tune-top #50。呪詛除けは対witch等で劣る)
    keysmith: ['lastStand', 'buildMania'], // 普請道楽: 砦/市場を1つ立てると全スキル-3（魔力が律速の鍵師の資源になる）。対強豪平均 seed9/11/13・各200: 26.3/25.6/27.1→29.7/30.8/29.8（docs/tune/keysmith.md 試行14）
    witch: ['lightToken', 'bindingLock'], // 🍂トークンのコスト軽減＋道連れの鍵(トークンで置いたコマに70%でロック。ロック中は奪われず削られないので🍂が長生きする)。tune-top: 環境勝率 69.0→77.7%(seed2/200)。旧: priceWreck(21.9→33.8%)。🍂付きトークンは収穫/伝播に乗らない
};

export const recommendedGears = (character: CharacterId): GearId[] =>
    (RECOMMENDED_GEARS[character] ?? ['sturdy']).slice(0, gearSlotsFor(character));

/**
 * 主案(RECOMMENDED_GEARS)と同等に強い別案。あるキャラだけ書く。AI席は主案と別案からランダムに選ぶ（pickRecommendedGears）。
 * sim の環境測定は主案だけで行う（再現性のため）。別案は主案と同程度の環境勝率であることを確かめたものだけ入れる（docs/tune/<char>.md）。
 */
export const ALT_RECOMMENDED_GEARS: Partial<Record<CharacterId, GearId[][]>> = {
    yinYangMaster: [['lastStand', 'luckyPurse']], // 主案 lastStand,chainDiscount との差 -1.5pt（seed8 43.6 vs 45.1）で同程度
    necromancer: [['luckyPurse', 'lastStand'], ['spellWard', 'lastStand']], // 主案 vengeance,lastStand 42.2に対し 43.8 / 42.3（seed90/150, 対強豪）で同程度。spellWard は対poisoner 16→41%（毒ダメージを防ぐ）。docs/tune/necromancer.md 試行40
    electrician: [['lightToken', 'afterglow'], ['lightToken', 'springThunder']], // 春雷: 主案と同水準（対強豪平均 52.4 vs 52.5, seed108/300）で、対氷室だけ 51→71%（氷結の壁の4つ目を解く。docs/tune/electrician.md 試行57）。 主案 lightToken,harvest と同等以上（対強豪平均 +0.8〜+2.1, seed181-183。docs/tune/electrician.md 試行41）。旧別案 afterglow,harvest は環境の変化で主案より約4pt弱くなったので外した
};

/**
 * 「あなた」の相手キャラ別の専用ギア。「あなた」は固有スキルが無く全キャラ共通の1設定では最下位なので、相手を見て組み替える
 * （docs/tune/you.md。lastStand は対 poisoner/yinYang/keysmith、spellWard は毒に効く）。相手が1キャラに決まるときだけ使う。
 * 測定（--target you --opp X, seed2）: poisoner 10.3→37.3%(300試合)、keysmith 31.8→40.8%(400)、yinYangMaster 9.3→21.0%(400)、magician 3.3→11.0%(300)。
 */
export const COUNTER_GEARS_FOR_YOU: Partial<Record<CharacterId, GearId[]>> = {
    poisoner: ['lastStand', 'spellWard', 'sturdy'],
    magician: ['lastStand', 'sturdy', 'luckyPurse'],
    pyromancer: ['spellWard', 'emptyLock', 'luckyPurse'], // 呪詛除けが🔥を止める。0.3→27.3%（seed2/300）
    giant: ['lastStand', 'emptyLock', 'luckyPurse'], // 6.3→26.7%
    necromancer: ['ironLock', 'titanCost', 'sturdy'], // 26.0→41.0%
    keysmith: ['lastStand', 'sturdy', 'luckyPurse'],
    yinYangMaster: ['lastStand', 'sturdy', 'luckyPurse'],
};

/** character の推奨ギア。「あなた」は相手キャラが1種類で専用ギアがあればそれ（なければ通常の推奨） */
export const recommendedGearsAgainst = (character: CharacterId, opponents: CharacterId[]): GearId[] => {
    if (character === 'you') {
        const kinds = Array.from(new Set(opponents));
        const counter = kinds.length === 1 ? COUNTER_GEARS_FOR_YOU[kinds[0]] : undefined;
        if (counter) return counter.slice(0, gearSlotsFor(character));
    }
    return recommendedGears(character);
};

/** AI席が使うギア。主案と別案を同じ確率で選ぶ（別案が無ければ主案） */
export const pickRecommendedGears = (character: CharacterId, rng: () => number = Math.random): GearId[] => {
    const patterns = [recommendedGears(character), ...(ALT_RECOMMENDED_GEARS[character] ?? []).map((g) => g.slice(0, gearSlotsFor(character)))];
    return patterns[Math.floor(rng() * patterns.length)];
};

/** トークン系スキルが付けるエフェクト（伝播・収穫の対象） */
export type TokenEffect = '🌱' | '☠' | '⚡';

/**
 * 春雷: player の自陣のリーチ（3つ＋空き1。敵のコマが無い列）の4つ目が氷結した空きマスなら、その❄を1つ解く。解いたマスを返す。
 * 手番開始時に呼ぶ。board を直接書き換える。氷室の番人が凍らせて塞ぐ『要のマス』を、1手番に1つ解いて完成させる
 */
export const springThunderThaw = (board: SquareInfo[], player: Player): number[] => {
    const thawed: number[] = [];
    for (const line of geometryForCells(board.length).winLines) {
        const mine = line.filter((i) => board[i].player === player).length;
        const foes = line.filter((i) => board[i].player && board[i].player !== player).length;
        const blocked = line.filter((i) => !board[i].player && board[i].effects.some((e) => e.effect === '❄'));
        if (mine !== 3 || foes !== 0 || blocked.length !== 1 || thawed.includes(blocked[0])) continue;
        const k = blocked[0];
        const at = board[k].effects.findIndex((e) => e.effect === '❄');
        board[k] = { ...board[k], effects: board[k].effects.filter((_, j) => j !== at) };
        thawed.push(k);
    }
    return thawed;
};
