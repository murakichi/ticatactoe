// @ts-check
'use strict';
/*
 * ギア（キャラ選択時に装備する追加パッシブ）の定義と純粋関数。
 * src/components/game/gear.ts の複製（ヘッドレス版は TS を import できないため）。
 * 値がズレないよう src/components/game/gear.test.ts が一致を確認する。
 */

const GEAR_PARAMS = {
    lockBind: 6,
    ironLockBind: 9,
    emptyLockLife: 1,
    bindingLockChance: 0.7,
    quadCount: 4,
    afterglowDelta: -1,
    luckyPurseChance: 0.2,
    sturdyLife: 1,
    titanLife: 3,
    titanCost: 3,
    reinforceTokenLife: 2,
    lightTokenLife: -1,
    lightTokenCost: -1,
    harvestCap: 5,
    priceRange: 4,
    priceFloor: 2,
    gamblerStd: 5,
    vengeanceGain: 2,
    vengeancePenalty: 1,
    vengeanceCap: 4,
    varietyKinds: 2,
    varietyMagic: 1,
    ailmentDiscount: 1,
    ruinDiscount: 1,
    lastStandMagic: 4,
    lastStandLife: 2,
    scorchMagic: 2,
    scorchCap: 6,
    ashDiscount: 1,
    rootMagic: 1,
};
const P = GEAR_PARAMS;

const GEAR_IDS = [
    'emptyLock', 'ironLock', 'bindingLock', 'quadMastery', 'afterglow', 'luckyPurse', 'sturdy', 'titanCost', 'reinforce',
    'harvest', 'toxicBloom', 'priceWreck', 'chainDiscount', 'propagate', 'lightToken', 'gambler', 'vengeance',
    'colorGarden', 'ailmentPact', 'ruinSurge', 'scorchedEarth', 'ashOffering', 'frostRoot', 'conduction', 'spellWard', 'lastStand',
];

/** 装備できる枠数。固有スキルの無い「あなた」だけ3枠 */
const gearSlotsFor = (character) => (character === 'you' ? 3 : 2);

const hasGear = (gears, id) => !!gears && gears.includes(id);

const gearLifeBonus = (gears) => (hasGear(gears, 'sturdy') ? P.sturdyLife : 0) + (hasGear(gears, 'titanCost') ? P.titanLife : 0);
const gearLifeStd = (gears, base) => (hasGear(gears, 'gambler') ? P.gamblerStd : base);
const gearLockBind = (gears) => (hasGear(gears, 'ironLock') ? P.ironLockBind : P.lockBind);
const gearTokenBindDelta = (gears) => (hasGear(gears, 'reinforce') ? P.reinforceTokenLife : 0) + (hasGear(gears, 'lightToken') ? P.lightTokenLife : 0);

/** キャラ補正済みのコストにギアのコスト補正を掛ける。下げる補正は下限1（もともと0なら0のまま）。四連の極意の無料だけ0 */
/** キャラ固有のスキル（病炎の契りの対象外）。skillCosts のキー */
const EXCLUSIVE_SKILL_KEYS = [
    'onClickTotalAssault', 'onClickStomp', 'onClickJudgeDay', 'onClickToggleYingYang', 'onClickShikigamiPlace', 'onClickShikigamiBlast',
    'onClickNecromancy', 'onClickMiasma', 'onClickChargeSpread', 'onClickGlacier', 'onClickInferno',
];

/** 彩りの庭: player の自陣のマスのうち、エフェクトが varietyKinds 種類以上あるマスの数 */
function countVarietySquares(squares, player) {
    return squares.filter((sq) => sq.player === player && new Set(sq.effects.map((e) => e.effect)).size >= P.varietyKinds).length;
}

/** 病炎の契り: player の自陣にある毒・火炎の種類数(0〜2) */
function countAilmentKinds(squares, player) {
    const own = squares.filter((sq) => sq.player === player);
    return (own.some((sq) => sq.effects.some((e) => e.effect === '☠')) ? 1 : 0) + (own.some((sq) => sq.effects.some((e) => e.effect === '🔥')) ? 1 : 0);
}

/** 廃墟の底力: before(手番開始時の持ち主)に対し、player のコマが無くなった(または持ち主が変わった)マス。exclude は通常の攻撃の着手マス */
function lostCells(before, after, player, exclude) {
    return before.map((p, i) => (p === player && after[i] !== player && i !== exclude ? i : -1)).filter((i) => i >= 0);
}

const budCount = (sq) => sq.effects.filter((e) => e.effect === '🌱').length;
/** 焦土の対象: 🔥で燃えて消える🌱と🍂（枯れ葉）の数 */
const burnableCount = (sq) => sq.effects.filter((e) => e.effect === '🌱' || e.effect === '🍂').length;
const hasEffect = (sq, effect) => sq.effects.some((e) => e.effect === effect);
/** 焦土: 手番開始時の記録に対し、holder 以外のコマの🌱が🔥で消えた数 */
function burnedBudCount(owners, buds, squares, holder) {
    return squares.reduce((n, sq, i) => (owners[i] && owners[i] !== holder && sq.player === owners[i] && hasEffect(sq, '🔥') ? n + Math.max(0, buds[i] - burnableCount(sq)) : n), 0);
}
const scorchGain = (burned) => Math.min(P.scorchCap, burned * P.scorchMagic);
const flameCount = (sq) => sq.effects.filter((e) => e.effect === '🔥').length;
/** 灰の供物: 手番開始時の記録に対し、holder 以外のコマで🔥が増えたマスの数 */
function ignitedCount(owners, flames, squares, holder) {
    return squares.reduce((n, sq, i) => (owners[i] && owners[i] !== holder && sq.player === owners[i] && flameCount(sq) > flames[i] ? n + 1 : n), 0);
}
const flameCounts = (squares) => squares.map(flameCount);
const frozenBudCount = (squares) => squares.reduce((n, sq) => (hasEffect(sq, '❄') ? n + budCount(sq) : n), 0);
const rootGain = (frozenBuds) => frozenBuds * P.rootMagic;
const budCounts = (squares) => squares.map(burnableCount);

function adjustCostByGear(cost, gears, ctx, isToken = false, skillKey) {
    if (!gears || gears.length === 0) return cost;
    if (hasGear(gears, 'quadMastery') && ctx.skillsThisTurn === P.quadCount) return 0;
    let delta = 0;
    if (hasGear(gears, 'titanCost')) delta += P.titanCost;
    if (hasGear(gears, 'afterglow') && ctx.echoReady && ctx.skillsThisTurn === 0) delta += P.afterglowDelta;
    if (hasGear(gears, 'chainDiscount')) delta -= ctx.skillsThisTurn;
    if (hasGear(gears, 'lightToken') && isToken) delta += P.lightTokenCost;
    if (hasGear(gears, 'ailmentPact') && !(skillKey && EXCLUSIVE_SKILL_KEYS.includes(skillKey))) delta -= P.ailmentDiscount * (ctx.ailments || 0);
    if (hasGear(gears, 'ruinSurge') && ctx.ruin) delta -= P.ruinDiscount;
    if (hasGear(gears, 'ashOffering')) delta -= P.ashDiscount * (ctx.ash || 0);
    const next = cost + delta;
    return delta < 0 ? Math.min(cost, Math.max(1, next)) : next;
}

/** 価格破壊の対象外にするスキル（skillCosts のキー） */
const NOT_PRICEABLE = ['onClickShuffle', 'onClickCharge', 'onClickDepressionCherry'];

/** 価格破壊: スキルごとの加算値を抽選する */
function rollPriceOffsets(skillCosts, rng) {
    const out = {};
    for (const k of Object.keys(skillCosts)) {
        if (NOT_PRICEABLE.includes(k)) continue;
        out[k] = Math.floor(rng() * (2 * P.priceRange + 1)) - P.priceRange;
    }
    return out;
}

/** 基礎コストに加算値を足す。下げる方向は下限 priceFloor まで（元のコストが下限未満ならそのまま） */
function priceShift(base, offset) {
    const next = base + offset;
    return offset > 0 ? next : Math.min(base, Math.max(P.priceFloor, next));
}

/** 基礎コスト表に加算値を適用する。offsets が無ければ元の表をそのまま返す */
function applyPriceOffsets(base, offsets) {
    if (!offsets) return base;
    const out = Object.assign({}, base);
    for (const k of Object.keys(base)) {
        if (NOT_PRICEABLE.includes(k)) continue;
        out[k] = priceShift(base[k], offsets[k] || 0);
    }
    return out;
}

/** ランダム付与: 重複なく slots 個を選ぶ */
function randomGears(slots, rng = Math.random) {
    const pool = GEAR_IDS.slice();
    const out = [];
    for (let i = 0; i < slots && pool.length > 0; i++) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
    return out;
}

/** AI が席のキャラに合わせて選ぶギア。src/components/game/gear.ts の RECOMMENDED_GEARS の複製 */
const RECOMMENDED_GEARS = {
    you: ['luckyPurse', 'titanCost', 'sturdy'],
    tactician: ['lastStand', 'priceWreck'],
    magician: ['lastStand', 'ironLock'],
    giant: ['lastStand', 'sturdy'],
    yinYangMaster: ['lastStand', 'afterglow'],
    necromancer: ['vengeance', 'lastStand'],
    poisoner: ['lastStand', 'spellWard'],
    electrician: ['lightToken', 'harvest'],
    cryomancer: ['lightToken', 'lastStand'],
    pyromancer: ['afterglow', 'spellWard'], // 余韻+呪詛除け(tune-top #41: 余韻+収穫 から。4seed(各300〜400試合)で +1.7〜+2.6pt、対毒使い 6→25%。対ネクロ -6 / 対陰陽師 -6)
    witch: ['lightToken', 'bindingLock'], // 🍂トークンのコスト軽減＋道連れの鍵(トークンで置いたコマに70%でロック。ロック中は奪われず削られないので🍂が長生きする)。tune-top: 環境勝率 69.0→77.7%(seed2/200)。旧: priceWreck(21.9→33.8%)。🍂付きトークンは収穫/伝播に乗らない
};
const recommendedGears = (character) => (RECOMMENDED_GEARS[character] || ['sturdy']).slice(0, gearSlotsFor(character));

/** 主案と同等に強い別案。src/components/game/gear.ts の ALT_RECOMMENDED_GEARS の複製。sim の環境測定は主案(recommendedGears)で行う */
const ALT_RECOMMENDED_GEARS = {
    electrician: [['afterglow', 'harvest']], // 主案 lightToken,harvest と同等（docs/tune/electrician.md 試行19）
};
/** AI席が使うギア。主案と別案を同じ確率で選ぶ */
const pickRecommendedGears = (character, rng = Math.random) => {
    const patterns = [recommendedGears(character), ...(ALT_RECOMMENDED_GEARS[character] || []).map((g) => g.slice(0, gearSlotsFor(character)))];
    return patterns[Math.floor(rng() * patterns.length)];
};

module.exports = {
    GEAR_PARAMS, GEAR_IDS, gearSlotsFor, hasGear, gearLifeBonus, gearLifeStd, gearLockBind, gearTokenBindDelta,
    adjustCostByGear, EXCLUSIVE_SKILL_KEYS, countVarietySquares, countAilmentKinds, lostCells, burnedBudCount, scorchGain, ignitedCount, flameCounts, frozenBudCount, rootGain, budCounts, rollPriceOffsets, applyPriceOffsets, priceShift, randomGears, RECOMMENDED_GEARS, recommendedGears, ALT_RECOMMENDED_GEARS, pickRecommendedGears,
};
