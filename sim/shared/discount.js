// 自動生成: src/components/game/discount.ts (node scripts/gen-sim-shared.js)。手で編集しない。
"use strict";
// コスト軽減スキル(idx 53-58)の純粋ロジック。Game.tsx / AIPlayer.ts で共有し、sim/discount.js と同じ仕様（discount.test.ts が一致を確認）。
//
// 軽減は手番内だけ有効（手番を跨がない）。軽減後のコストの下限は1（コストが0以下のスキルは対象外）。
//   - next   : 「次に打つスキル」の軽減。次に打った（軽減札でない）スキルで消費される。複数使うと足し算
//   - effect : 「エフェクトを付与するスキル」の永続軽減（そのターン中、該当スキルを打つたびに効く）
//   - token  : 「トークンを付与するスキル」の永続軽減
//   - unique : 「固有スキル」の軽減。1ターンに1度だけ使える（uniqueUsed）
//   - turn   : 「このターンに打つ全スキル」の軽減（春一番が解除した氷結の数だけ。ターンを跨がない）
// 軽減札どうしは軽減されず、「次に打つスキル」も消費しない。
Object.defineProperty(exports, "__esModule", { value: true });
exports.lifeDeltaOf = exports.canUseDiscountSkill = exports.afterSkill = exports.applyDiscount = exports.discountAmount = exports.UNIQUE_SKILL_KEYS = exports.EFFECT_SKILL_KEYS = exports.isDiscountSkill = exports.DISCOUNT_SKILLS = exports.isReducerSkill = exports.GRAVE_DISCOUNT_KEY = exports.SHIKIGAMI_DISCOUNT_BASE = exports.SHIKIGAMI_DISCOUNT_KEY = exports.STASH_KEY = exports.SPRING_WIND_KEY = exports.emptyDiscount = void 0;
const emptyDiscount = () => ({ next: 0, effect: 0, token: 0, unique: 0, turn: 0, uniqueUsed: false });
exports.emptyDiscount = emptyDiscount;
/** 春一番: 氷結を解除した数だけ、このターンに打つ全スキルを軽減する。軽減量が可変なので DISCOUNT_SKILLS の表には入れず、軽減札として別に扱う */
exports.SPRING_WIND_KEY = 'onClickSpringWind';
/** 軽減札か（DISCOUNT_SKILLS の7種＋春一番）。軽減札どうしは軽減されず、「次に打つスキル」も消費しない */
/** 雷神のへそくり: 取り除いた⚡のスタック数だけ、次に打つスキルを軽減する。軽減量が可変なので、春一番と同じく表には入れず軽減札として別に扱う */
exports.STASH_KEY = 'onClickStash';
/** 式神割引: 2＋盤面の式神の数だけ、次に打つスキルを軽減する。軽減量が可変なので、へそくりと同じく表には入れず軽減札として別に扱う */
exports.SHIKIGAMI_DISCOUNT_KEY = 'onClickShikigamiDiscount';
exports.SHIKIGAMI_DISCOUNT_BASE = 2;
/** 弔い割引: 墓地の死体の数（上限 GRAVE_DISCOUNT_CAP）だけ、次に打つスキルを軽減する。軽減量が可変なので、式神割引と同じく軽減札として別に扱う */
exports.GRAVE_DISCOUNT_KEY = 'onClickGraveDiscount';
const isReducerSkill = (key) => (0, exports.isDiscountSkill)(key) || key === exports.SPRING_WIND_KEY || key === exports.STASH_KEY || key === exports.SHIKIGAMI_DISCOUNT_KEY || key === exports.GRAVE_DISCOUNT_KEY;
exports.isReducerSkill = isReducerSkill;
/** 軽減札のコストキー → 効果 */
exports.DISCOUNT_SKILLS = {
    onClickMarkdown: { next: 3 },
    onClickEffectDiscount: { effect: 1 },
    onClickTokenDiscount: { token: 1 },
    onClickVitalMarkdown: { next: 4, life: 1 },
    onClickUniqueDiscount: { unique: 6, life: -1 },
    onClickClearance: { next: 7 },
    onClickCounterMarkdown: { next: 3, life: 1 }, //      返し特売: 次に打つスキル-3、ライフ+1（直前の相手の手番に相手がスキルを使っていれば0コスト）
};
const isDiscountSkill = (key) => key in exports.DISCOUNT_SKILLS;
exports.isDiscountSkill = isDiscountSkill;
/** エフェクト（🌱⚡☠❄🔥）を付与するスキル（トークンは除く）。コストキーで持つ */
exports.EFFECT_SKILL_KEYS = new Set([
    'onClickBuds', 'onClickDoubleBuds', 'onClickWalpurgisNight',
    'onClickInjection', 'onClickIntensify', 'onClickPandemic', 'onClickPoisonMist',
    'onClickChargeOne', 'onClickChargeArea', 'onClickChargeRandom',
    'onClickFreeze', 'onClickFrostArea', 'onClickIcicle', 'onClickRandomFreeze', 'onClickFreezeSpread', 'onClickFrostfall',
    'onClickIgnite', 'onClickTinder', 'onClickSpark', 'onClickSacrifice', 'onClickSucker', 'onClickWindborne', 'onClickDarkPot',
    'onClickShikigamiCurse',
]);
/** 各キャラの固有スキル（コストキー） */
exports.UNIQUE_SKILL_KEYS = new Set([
    'onClickStomp', 'onClickJudgeDay', 'onClickTotalAssault', 'onClickMiasma', 'onClickChargeSpread',
    'onClickGlacier', 'onClickInferno', 'onClickNecromancy', 'onClickToggleYingYang', 'onClickShikigamiPlace', 'onClickShikigamiBlast',
]);
/** key のスキルにかかる軽減量。軽減札どうしには効かない */
const discountAmount = (d, key, isToken) => {
    if (key && (0, exports.isReducerSkill)(key))
        return 0;
    let n = d.next + d.turn;
    if (isToken)
        n += d.token;
    else if (key && exports.EFFECT_SKILL_KEYS.has(key))
        n += d.effect;
    if (key && exports.UNIQUE_SKILL_KEYS.has(key))
        n += d.unique;
    return n;
};
exports.discountAmount = discountAmount;
/** 軽減を掛けたコスト。コストが0以下ならそのまま、軽減後の下限は1 */
const applyDiscount = (cost, amount) => (cost <= 0 || amount <= 0 ? cost : Math.max(1, cost - amount));
exports.applyDiscount = applyDiscount;
/** スキルを打ったあとの状態。軽減札なら効果を足し、それ以外なら「次に打つスキル」の軽減を消費する */
const afterSkill = (d, key) => {
    var _a, _b, _c, _d;
    if (key === exports.SPRING_WIND_KEY || key === exports.STASH_KEY || key === exports.SHIKIGAMI_DISCOUNT_KEY || key === exports.GRAVE_DISCOUNT_KEY)
        return d; // 軽減量は解除した氷結／除去した⚡の数で決まるので、呼び出し側が turn / next に足す
    if ((0, exports.isDiscountSkill)(key)) {
        const e = exports.DISCOUNT_SKILLS[key];
        return {
            next: d.next + ((_a = e.next) !== null && _a !== void 0 ? _a : 0),
            effect: d.effect + ((_b = e.effect) !== null && _b !== void 0 ? _b : 0),
            token: d.token + ((_c = e.token) !== null && _c !== void 0 ? _c : 0),
            unique: d.unique + ((_d = e.unique) !== null && _d !== void 0 ? _d : 0),
            turn: d.turn,
            uniqueUsed: d.uniqueUsed || key === 'onClickUniqueDiscount',
        };
    }
    return { ...d, next: 0 };
};
exports.afterSkill = afterSkill;
/** 軽減札が使えるか。固有割引は1ターンに一度だけ、ライフを減らす札はライフが2以上のときだけ */
const canUseDiscountSkill = (d, key, life) => !(key === 'onClickUniqueDiscount' && d.uniqueUsed) && !(('life' in exports.DISCOUNT_SKILLS[key]) && exports.DISCOUNT_SKILLS[key].life < 0 && life < 2);
exports.canUseDiscountSkill = canUseDiscountSkill;
/** 軽減札によるライフの増減（なければ0） */
const lifeDeltaOf = (key) => ('life' in exports.DISCOUNT_SKILLS[key] ? exports.DISCOUNT_SKILLS[key].life : 0);
exports.lifeDeltaOf = lifeDeltaOf;
