// コスト軽減スキル(idx 53-58)の純粋ロジック。Game.tsx / AIPlayer.ts で共有し、sim/discount.js と同じ仕様（discount.test.ts が一致を確認）。
//
// 軽減は手番内だけ有効（手番を跨がない）。軽減後のコストの下限は1（コストが0以下のスキルは対象外）。
//   - next   : 「次に打つスキル」の軽減。次に打った（軽減札でない）スキルで消費される。複数使うと足し算
//   - effect : 「エフェクトを付与するスキル」の永続軽減（そのターン中、該当スキルを打つたびに効く）
//   - token  : 「トークンを付与するスキル」の永続軽減
//   - unique : 「固有スキル」の軽減。1ターンに1度だけ使える（uniqueUsed）
// 軽減札どうしは軽減されず、「次に打つスキル」も消費しない。

export type Discount = { next: number; effect: number; token: number; unique: number; uniqueUsed: boolean };

export const emptyDiscount = (): Discount => ({ next: 0, effect: 0, token: 0, unique: 0, uniqueUsed: false });

/** 軽減札のコストキー → 効果 */
export const DISCOUNT_SKILLS = {
    onClickMarkdown: { next: 3 }, //                      特売: 次に打つスキル-3
    onClickEffectDiscount: { effect: 1 }, //              付与割引: このターン、エフェクト付与スキル-1
    onClickTokenDiscount: { token: 1 }, //                トークン割引: このターン、トークン付与スキル-1
    onClickVitalMarkdown: { next: 4, life: 1 }, //        活力特売: 次に打つスキル-4、ライフ+1
    onClickUniqueDiscount: { unique: 6, life: -1 }, //    固有割引: このターン、固有スキル-6（1ターンに一度、ライフ-1）
    onClickClearance: { next: 7 }, //                     大特価: 次に打つスキル-7
} as const;
export type DiscountKey = keyof typeof DISCOUNT_SKILLS;
export const isDiscountSkill = (key: string): key is DiscountKey => key in DISCOUNT_SKILLS;

/** エフェクト（🌱⚡☠❄🔥）を付与するスキル（トークンは除く）。コストキーで持つ */
export const EFFECT_SKILL_KEYS: ReadonlySet<string> = new Set([
    'onClickBuds', 'onClickDoubleBuds', 'onClickWalpurgisNight',
    'onClickInjection', 'onClickIntensify', 'onClickPandemic', 'onClickPoisonMist',
    'onClickChargeOne', 'onClickChargeArea', 'onClickChargeRandom',
    'onClickFreeze', 'onClickFrostArea', 'onClickIcicle', 'onClickRandomFreeze', 'onClickFreezeSpread', 'onClickFrostfall',
    'onClickIgnite', 'onClickSacrifice', 'onClickSucker', 'onClickWindborne',
]);
/** 各キャラの固有スキル（コストキー） */
export const UNIQUE_SKILL_KEYS: ReadonlySet<string> = new Set([
    'onClickStomp', 'onClickJudgeDay', 'onClickTotalAssault', 'onClickMiasma', 'onClickChargeSpread',
    'onClickGlacier', 'onClickInferno', 'onClickNecromancy', 'onClickToggleYingYang', 'onClickYingYangSkill',
]);

/** key のスキルにかかる軽減量。軽減札どうしには効かない */
export const discountAmount = (d: Discount, key: string | undefined, isToken: boolean): number => {
    if (key && isDiscountSkill(key)) return 0;
    let n = d.next;
    if (isToken) n += d.token;
    else if (key && EFFECT_SKILL_KEYS.has(key)) n += d.effect;
    if (key && UNIQUE_SKILL_KEYS.has(key)) n += d.unique;
    return n;
};
/** 軽減を掛けたコスト。コストが0以下ならそのまま、軽減後の下限は1 */
export const applyDiscount = (cost: number, amount: number): number => (cost <= 0 || amount <= 0 ? cost : Math.max(1, cost - amount));

/** スキルを打ったあとの状態。軽減札なら効果を足し、それ以外なら「次に打つスキル」の軽減を消費する */
export const afterSkill = (d: Discount, key: string): Discount => {
    if (isDiscountSkill(key)) {
        const e: Partial<Record<'next' | 'effect' | 'token' | 'unique' | 'life', number>> = DISCOUNT_SKILLS[key];
        return {
            next: d.next + (e.next ?? 0),
            effect: d.effect + (e.effect ?? 0),
            token: d.token + (e.token ?? 0),
            unique: d.unique + (e.unique ?? 0),
            uniqueUsed: d.uniqueUsed || key === 'onClickUniqueDiscount',
        };
    }
    return { ...d, next: 0 };
};
/** 軽減札が使えるか。固有割引は1ターンに一度だけ、ライフを減らす札はライフが2以上のときだけ */
export const canUseDiscountSkill = (d: Discount, key: DiscountKey, life: number): boolean =>
    !(key === 'onClickUniqueDiscount' && d.uniqueUsed) && !(('life' in DISCOUNT_SKILLS[key]) && (DISCOUNT_SKILLS[key] as { life: number }).life < 0 && life < 2);
/** 軽減札によるライフの増減（なければ0） */
export const lifeDeltaOf = (key: DiscountKey): number => ('life' in DISCOUNT_SKILLS[key] ? (DISCOUNT_SKILLS[key] as { life: number }).life : 0);
