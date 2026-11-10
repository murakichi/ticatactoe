// 自動生成: src/components/game/gear.ts (node scripts/gen-sim-shared.js)。手で編集しない。
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.springThunderThaw = exports.pickRecommendedGears = exports.recommendedGearsAgainst = exports.counterGearsFor = exports.COUNTER_GEARS = exports.COUNTER_GEARS_FOR_YOU = exports.ALT_RECOMMENDED_GEARS = exports.recommendedGears = exports.RECOMMENDED_GEARS = exports.randomGears = exports.applyPriceOffsets = exports.priceShift = exports.rollPriceOffsets = exports.PRICEABLE_KEYS = exports.adjustCostByGear = exports.rampAfterRoll = exports.rampBonus = exports.rampStart = exports.objectBuildLife = exports.rentGain = exports.budCounts = exports.rootGain = exports.frozenBudCount = exports.flameCounts = exports.ignitedCount = exports.scorchGain = exports.burnedBudCount = exports.lostCells = exports.countAilmentKinds = exports.countVarietySquares = exports.EXCLUSIVE_SKILL_KEYS = exports.gearTokenBindDelta = exports.gearLockStack = exports.gearLifeStd = exports.gearLifeBonus = exports.hasGear = exports.gearSlotsFor = exports.gearDefOf = exports.GEAR_IDS = exports.GEARS = exports.GEAR_PARAMS = void 0;
const skillCosts_1 = require("./skillCosts");
const boardGeometry_1 = require("./boardGeometry");
const objects_1 = require("./objects");
exports.GEAR_PARAMS = {
    /** 芽吹きの錠: ロックを掛けた自陣のコマのうち、ライフがこの値以下でバッズの無いものにバッズが付く */
    lockBloomMaxLife: 2,
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
    /** 地代: 働いている自陣のオブジェクト1つにつきの手番開始時の魔力（上限なし） */
    rentMagic: 1,
    /** 頑丈な建材: 設置するオブジェクトの初期ライフへの加算 */
    buildLife: 3,
};
const P = exports.GEAR_PARAMS;
exports.GEARS = [
    { id: 'lockBloom', name: '芽吹きの錠', icon: '🌸', desc: `ロックをかけた低ライフの自陣のコマにバッズが付く` },
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
    { id: 'groundRent', name: '地代', icon: '💰', desc: `手番開始時、自陣のオブジェクトの数だけマジックを獲得` },
    { id: 'sturdyBuild', name: '頑丈な建材', icon: '🧱', desc: `設置するオブジェクトの初期ライフが上昇` },
    { id: 'buildMania', name: '普請道楽', icon: '🔨', desc: `オブジェクト設置スキルが安く、設置中は全スキルも安い` },
    { id: 'lastStand', name: '土壇場の防壁', icon: '🏰', desc: `初めて相手が列を揃えて勝つとき、かわりにその列と自陣のコマが消滅` },
];
exports.GEAR_IDS = exports.GEARS.map((g) => g.id);
const gearDefOf = (id) => exports.GEARS.find((g) => g.id === id);
exports.gearDefOf = gearDefOf;
/** 装備できる枠数。固有スキルの無い「あなた」だけ3枠 */
const gearSlotsFor = (character) => (character === 'you' ? 3 : 2);
exports.gearSlotsFor = gearSlotsFor;
const hasGear = (gears, id) => !!gears && gears.includes(id);
exports.hasGear = hasGear;
/** ライフ平均への加算（頑健 / 剛腕の代償） */
const gearLifeBonus = (gears) => ((0, exports.hasGear)(gears, 'sturdy') ? P.sturdyLife : 0) + ((0, exports.hasGear)(gears, 'titanCost') ? P.titanLife : 0) + ((0, exports.hasGear)(gears, 'reaper') ? P.reaperLife : 0);
exports.gearLifeBonus = gearLifeBonus;
/** ライフ値の標準偏差。賭博師の骰子があれば広がる */
const gearLifeStd = (gears, base) => ((0, exports.hasGear)(gears, 'gambler') ? P.gamblerStd : base);
exports.gearLifeStd = gearLifeStd;
/** ロックの期間（ライフ）。堅牢の鍵で延びる */
const gearLockStack = (gears) => ((0, exports.hasGear)(gears, 'ironLock') ? P.ironLockStack : P.lockStack);
exports.gearLockStack = gearLockStack;
/** トークンスキルで置くコマのライフ補正（増援 / 軽量トークン）。最終ライフは1以上に丸める側で行う */
const gearTokenBindDelta = (gears) => ((0, exports.hasGear)(gears, 'reinforce') ? P.reinforceTokenLife : 0) + ((0, exports.hasGear)(gears, 'lightToken') ? P.lightTokenLife : 0);
exports.gearTokenBindDelta = gearTokenBindDelta;
/** キャラ固有のスキル（病炎の契りの対象外）。skillCosts のキー */
exports.EXCLUSIVE_SKILL_KEYS = [
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
/** 彩りの庭: player の自陣のマスのうち、エフェクトが varietyKinds 種類以上あるマスの数 */
const countVarietySquares = (squares, player) => squares.filter((sq) => sq.player === player && new Set(sq.effects.map((e) => e.effect)).size >= P.varietyKinds).length;
exports.countVarietySquares = countVarietySquares;
/** 病炎の契り: player の自陣にある毒・火炎の種類数(0〜2) */
const countAilmentKinds = (squares, player) => {
    const own = squares.filter((sq) => sq.player === player);
    return (own.some((sq) => sq.effects.some((e) => e.effect === '☠')) ? 1 : 0) + (own.some((sq) => sq.effects.some((e) => e.effect === '🔥')) ? 1 : 0);
};
exports.countAilmentKinds = countAilmentKinds;
/** 廃墟の底力: before(手番開始時の持ち主)に対し、player のコマが盤から無くなった(または持ち主が変わった)マス。除外マスは通常の攻撃の着手マス */
const lostCells = (before, after, player, exclude) => before.map((p, i) => (p === player && after[i] !== player && i !== exclude ? i : -1)).filter((i) => i >= 0);
exports.lostCells = lostCells;
const budCount = (sq) => sq.effects.filter((e) => e.effect === '🌱').length;
/** 焦土の対象: 🔥で燃えて消える🌱と🍂（枯れ葉）の数 */
const burnableCount = (sq) => sq.effects.filter((e) => e.effect === '🌱' || e.effect === '🍂').length;
const flameCount = (sq) => sq.effects.filter((e) => e.effect === '🔥').length;
const hasEffect = (sq, effect) => sq.effects.some((e) => e.effect === effect);
/** 焦土: 手番開始時の記録(owners/buds。🌱と🍂の合計)に対し、holder 以外のコマの🌱・🍂が🔥で消えた数（同じ持ち主のまま🔥があり、🌱が減ったマス） */
const burnedBudCount = (owners, buds, squares, holder) => squares.reduce((n, sq, i) => (owners[i] && owners[i] !== holder && sq.player === owners[i] && hasEffect(sq, '🔥') ? n + Math.max(0, buds[i] - burnableCount(sq)) : n), 0);
exports.burnedBudCount = burnedBudCount;
const scorchGain = (burned) => Math.min(P.scorchCap, burned * P.scorchMagic);
exports.scorchGain = scorchGain;
/** 灰の供物: 手番開始時の記録(owners/flames)に対し、holder 以外のコマで🔥が増えたマスの数 */
const ignitedCount = (owners, flames, squares, holder) => squares.reduce((n, sq, i) => (owners[i] && owners[i] !== holder && sq.player === owners[i] && flameCount(sq) > flames[i] ? n + 1 : n), 0);
exports.ignitedCount = ignitedCount;
const flameCounts = (squares) => squares.map(flameCount);
exports.flameCounts = flameCounts;
/** 凍てつく根: 氷結中のマスにある🌱の数（敵味方問わず）→魔力 */
const frozenBudCount = (squares) => squares.reduce((n, sq) => (hasEffect(sq, '❄') ? n + budCount(sq) : n), 0);
exports.frozenBudCount = frozenBudCount;
const rootGain = (frozenBuds) => frozenBuds * P.rootMagic;
exports.rootGain = rootGain;
/** 手番開始時の🌱の数の記録 */
const budCounts = (squares) => squares.map(burnableCount);
exports.budCounts = budCounts;
/** 地代: 働いている自陣のオブジェクトの数 → 手番開始時の魔力 */
const rentGain = (activeObjects) => activeObjects * P.rentMagic;
exports.rentGain = rentGain;
/** 頑丈な建材: 設置するオブジェクトの初期ライフへの加算 */
const objectBuildLife = (gears) => ((0, exports.hasGear)(gears, 'sturdyBuild') ? P.buildLife : 0);
exports.objectBuildLife = objectBuildLife;
const rampStart = () => ({ stack: 0, hits: 0 });
exports.rampStart = rampStart;
/** 次に引くライフの期待値に足す加算 */
const rampBonus = (s) => s.stack * P.rampStep;
exports.rampBonus = rampBonus;
/** 引いたライフを数える。10以上が規定回数に達したら積み上げと回数をリセット(次は+0)。そうでなければ積み上げを1段上げる */
const rampAfterRoll = (s, life) => {
    const hits = s.hits + (life >= P.rampHighLife ? 1 : 0);
    return hits >= P.rampResetHits ? (0, exports.rampStart)() : { stack: s.stack + 1, hits };
};
exports.rampAfterRoll = rampAfterRoll;
/**
 * キャラ補正を済ませたコストに、ギアのコスト補正を掛ける。
 * 下げる方向の補正は下限1（もともと0のコストは0のまま）。四連の極意の無料だけは0にする。
 */
const adjustCostByGear = (cost, gears, ctx, isToken = false, skillKey) => {
    var _a, _b;
    if (!gears || gears.length === 0)
        return cost;
    if ((0, exports.hasGear)(gears, 'quadMastery') && ctx.skillsThisTurn === P.quadCount)
        return 0;
    let delta = 0;
    if ((0, exports.hasGear)(gears, 'titanCost'))
        delta += P.titanCost;
    if ((0, exports.hasGear)(gears, 'afterglow') && ctx.echoReady && ctx.skillsThisTurn === 0)
        delta += P.afterglowDelta;
    if ((0, exports.hasGear)(gears, 'chainDiscount'))
        delta -= ctx.skillsThisTurn;
    if ((0, exports.hasGear)(gears, 'lightToken') && isToken)
        delta += P.lightTokenCost;
    // 病炎の契り: 固有スキルは対象外。廃墟の底力: すべてのスキル
    if ((0, exports.hasGear)(gears, 'ailmentPact') && !(skillKey && exports.EXCLUSIVE_SKILL_KEYS.includes(skillKey)))
        delta -= P.ailmentDiscount * ((_a = ctx.ailments) !== null && _a !== void 0 ? _a : 0);
    if ((0, exports.hasGear)(gears, 'ruinSurge') && ctx.ruin)
        delta -= P.ruinDiscount;
    if ((0, exports.hasGear)(gears, 'ashOffering'))
        delta -= P.ashDiscount * ((_b = ctx.ash) !== null && _b !== void 0 ? _b : 0);
    // 普請道楽: 自陣にオブジェクトが無いときはオブジェクトを設置するスキルが-2、ある間は全スキル-3（設置スキルの-2は無いときだけ。重ならない）
    if ((0, exports.hasGear)(gears, 'buildMania'))
        delta -= ctx.ownObjects ? P.buildAllCut : skillKey && objects_1.OBJECT_PLACE_KEYS.has(skillKey) ? P.buildPlaceCut : 0;
    const next = cost + delta;
    return delta < 0 ? Math.min(cost, Math.max(1, next)) : next;
};
exports.adjustCostByGear = adjustCostByGear;
/** 価格破壊の対象にするスキル。シャッフル(1固定)とチャージは対象外。蘇生は墓地と召喚数に連動するので対象外 */
exports.PRICEABLE_KEYS = Object.keys(skillCosts_1.skillCosts).filter((k) => !['onClickShuffle', 'onClickCharge', 'onClickDepressionCherry'].includes(k));
/** 価格破壊: スキルごとの加算値を抽選する（rng は [0,1) を返す関数） */
const rollPriceOffsets = (rng) => {
    const out = {};
    for (const k of exports.PRICEABLE_KEYS)
        out[k] = Math.floor(rng() * (2 * P.priceRange + 1)) - P.priceRange;
    return out;
};
exports.rollPriceOffsets = rollPriceOffsets;
/** 基礎コストに加算値を足す。下げる方向は下限 priceFloor まで（元のコストが下限未満ならそのまま） */
const priceShift = (base, offset) => {
    const next = base + offset;
    return offset > 0 ? next : Math.min(base, Math.max(exports.GEAR_PARAMS.priceFloor, next));
};
exports.priceShift = priceShift;
/** 基礎コスト表に価格破壊の加算値を適用する。offsets が無ければ元の表をそのまま返す */
const applyPriceOffsets = (base, offsets) => {
    var _a;
    if (!offsets)
        return base;
    const out = { ...base };
    for (const k of exports.PRICEABLE_KEYS)
        out[k] = (0, exports.priceShift)(base[k], (_a = offsets[k]) !== null && _a !== void 0 ? _a : 0);
    return out;
};
exports.applyPriceOffsets = applyPriceOffsets;
/** ランダム付与: 重複なく slots 個を選ぶ（rng は [0,1) を返す関数） */
const randomGears = (slots, rng = Math.random) => {
    const pool = [...exports.GEAR_IDS];
    const out = [];
    for (let i = 0; i < slots && pool.length > 0; i++) {
        out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
    }
    return out;
};
exports.randomGears = randomGears;
/**
 * AI が席のキャラに合わせて選ぶギア（枠数ぶん）。キャラ×ギアの総当たり（各200試合、seed 1）の上位を選び、
 * 別 seed（400試合）で無装備より勝率が上がることを確認した組み合わせ（2026-10-19、docs/diary/2026-10-19.md）。
 * 測っていないキャラは、全キャラで一貫して効いた頑健にする。
 */
exports.RECOMMENDED_GEARS = {
    you: ['luckyPurse', 'titanCost', 'sturdy'],
    tactician: ['lastStand', 'priceWreck'],
    magician: ['snowball', 'ironLock'],
    giant: ['lastStand', 'sturdy'],
    yinYangMaster: ['reaper', 'snowball'],
    necromancer: ['reaper', 'lastStand'],
    poisoner: ['snowball', 'spellWard'],
    electrician: ['budSeed', 'harvest'],
    // 氷室の番人・煉獄の鍛冶師は未計測。全キャラで一貫して効いた頑健＋収穫を暫定で選ぶ
    cryomancer: ['lightToken', 'lastStand'],
    pyromancer: ['afterglow', 'budSeed'],
    keysmith: ['lastStand', 'lockBloom'],
    witch: ['buildMania', 'reaper'], // 普請道楽+死神の鎌(砦/市場を立てるAIと砦/市場入りデッキとセット。tune-top 試行44: 最新masterで対強豪平均 seed3/200 29.9→52.7%、seed2/100 41.3→52.3%。ギアだけ・札だけだと16〜23%に悪化)。旧: lightToken+bindingLock。以下は旧: 🍂トークンのコスト軽減＋道連れの鍵(トークンで置いたコマに70%でロック。ロック中は奪われず削られないので🍂が長生きする)。tune-top: 環境勝率 69.0→77.7%(seed2/200)。旧: priceWreck(21.9→33.8%)。🍂付きトークンは収穫/伝播に乗らない
};
const recommendedGears = (character) => { var _a; return ((_a = exports.RECOMMENDED_GEARS[character]) !== null && _a !== void 0 ? _a : ['sturdy']).slice(0, (0, exports.gearSlotsFor)(character)); };
exports.recommendedGears = recommendedGears;
/**
 * 主案(RECOMMENDED_GEARS)と同等に強い別案。あるキャラだけ書く。AI席は主案と別案からランダムに選ぶ（pickRecommendedGears）。
 * sim の環境測定は主案だけで行う（再現性のため）。別案は主案と同程度の環境勝率であることを確かめたものだけ入れる（docs/tune/<char>.md）。
 */
exports.ALT_RECOMMENDED_GEARS = {
    yinYangMaster: [['lastStand', 'reaper'], ['lastStand', 'chainDiscount']],
    necromancer: [['reaper', 'snowball']],
    electrician: [['lightToken', 'budSeed']], // 主案との差 -1.5pt（61.3 vs 62.8, seed2/200）。旧別案(afterglow/springThunder 系)は主案が変わったので外した（docs/tune/electrician.md）
};
/**
 * 「あなた」の相手キャラ別の専用ギア。「あなた」は固有スキルが無く全キャラ共通の1設定では最下位なので、相手を見て組み替える
 * （docs/tune/you.md。lastStand は対 poisoner/yinYang/keysmith、spellWard は毒に効く）。相手が1キャラに決まるときだけ使う。
 * 測定（--target you --opp X, seed2）: poisoner 10.3→37.3%(300試合)、keysmith 31.8→40.8%(400)、yinYangMaster 9.3→21.0%(400)、magician 3.3→11.0%(300)。
 */
exports.COUNTER_GEARS_FOR_YOU = {
    poisoner: ['lastStand', 'spellWard', 'sturdy'],
    magician: ['lastStand', 'sturdy', 'luckyPurse'],
    pyromancer: ['spellWard', 'emptyLock', 'luckyPurse'],
    giant: ['lastStand', 'emptyLock', 'luckyPurse'],
    necromancer: ['ironLock', 'titanCost', 'sturdy'],
    keysmith: ['lastStand', 'sturdy', 'luckyPurse'],
    yinYangMaster: ['lastStand', 'sturdy', 'luckyPurse'],
};
/**
 * 相手キャラ別の専用ギア（「あなた」以外）。相手が1種類のキャラに決まるときだけ使う。
 * 春雷（自陣のリーチを塞ぐ氷結を1つ解く）は氷室の番人の氷結の壁に効く:
 * 軍師 36→60%（seed2/3, 各150試合）、毒使い 10→67%（同）。氷室以外の相手には通常の推奨のまま（#465）
 */
exports.COUNTER_GEARS = {
    tactician: {
        cryomancer: ['springThunder', 'priceWreck'],
    },
    giant: {
        cryomancer: ['lastStand', 'budSeed'], // 35→60%（同）
    },
    pyromancer: { yinYangMaster: ['afterglow', 'snowball'] },
    poisoner: { cryomancer: ['springThunder', 'spellWard'] },
    necromancer: { cryomancer: ['springThunder', 'lastStand'] },
    cryomancer: {
        electrician: ['lightToken', 'reaper'], // 24→64%（同）
    },
};
/** character が、相手が1種類のキャラのときに使う専用ギア（無ければ undefined。「あなた」は COUNTER_GEARS_FOR_YOU） */
const counterGearsFor = (character, opponents) => {
    var _a;
    const kinds = Array.from(new Set(opponents));
    if (kinds.length !== 1)
        return undefined;
    const counter = character === 'you' ? exports.COUNTER_GEARS_FOR_YOU[kinds[0]] : (_a = exports.COUNTER_GEARS[character]) === null || _a === void 0 ? void 0 : _a[kinds[0]];
    return counter ? counter.slice(0, (0, exports.gearSlotsFor)(character)) : undefined;
};
exports.counterGearsFor = counterGearsFor;
/** character の推奨ギア。相手キャラが1種類で専用ギアがあればそれ（なければ通常の推奨） */
const recommendedGearsAgainst = (character, opponents) => {
    var _a;
    return (_a = (0, exports.counterGearsFor)(character, opponents)) !== null && _a !== void 0 ? _a : (0, exports.recommendedGears)(character);
};
exports.recommendedGearsAgainst = recommendedGearsAgainst;
/** AI席が使うギア。主案と別案を同じ確率で選ぶ（別案が無ければ主案） */
const pickRecommendedGears = (character, rng = Math.random) => {
    var _a;
    const patterns = [(0, exports.recommendedGears)(character), ...((_a = exports.ALT_RECOMMENDED_GEARS[character]) !== null && _a !== void 0 ? _a : []).map((g) => g.slice(0, (0, exports.gearSlotsFor)(character)))];
    return patterns[Math.floor(rng() * patterns.length)];
};
exports.pickRecommendedGears = pickRecommendedGears;
/**
 * 春雷: player の自陣のリーチ（3つ＋空き1。敵のコマが無い列）の4つ目が氷結した空きマスなら、その❄を1つ解く。解いたマスを返す。
 * 手番開始時に呼ぶ。board を直接書き換える。氷室の番人が凍らせて塞ぐ『要のマス』を、1手番に1つ解いて完成させる
 */
const springThunderThaw = (board, player) => {
    const thawed = [];
    for (const line of (0, boardGeometry_1.geometryForCells)(board.length).winLines) {
        const mine = line.filter((i) => board[i].player === player).length;
        const foes = line.filter((i) => board[i].player && board[i].player !== player).length;
        const blocked = line.filter((i) => !board[i].player && board[i].effects.some((e) => e.effect === '❄'));
        if (mine !== 3 || foes !== 0 || blocked.length !== 1 || thawed.includes(blocked[0]))
            continue;
        const k = blocked[0];
        const at = board[k].effects.findIndex((e) => e.effect === '❄');
        board[k] = { ...board[k], effects: board[k].effects.filter((_, j) => j !== at) };
        thawed.push(k);
    }
    return thawed;
};
exports.springThunderThaw = springThunderThaw;
