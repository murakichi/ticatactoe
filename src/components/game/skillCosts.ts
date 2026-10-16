export const skillCosts = {
    onClickToken: 4,
    onClickTotalAssault: 9,
    onClickToggleYingYang: 1,
    onClickYingYangSkill: 5,
    onClickStomp: 6,
    onClickJudgeDay: 11,
    onClickCharge: 3,
    onClickAddLife: 3,
    onClickDepressionCherry: 1,
    onClickShuffle: 1,
    onClickBibine: 3,
    onClickUseLock: 2,
    onClickDoubleLock: 3,
    onClickTripleLock: 4,
    onClickBuds: 4,
    onClickDoubleBuds: 6,
    onClickBudsToken: 6,
    onClickBothToken: 3,
    onClickDoubleToken: 7,
    onClickSlash: 6,
    onClickBackSlash: 6,
    onClickTsunami: 9,
    onClickOpium: 6,
    onClickWalpurgisNight: 9,
    onClickMiasma: 6,
    onClickInjection: 2,
    onClickPoisonToken: 2,
    onClickSerum: 4,
    onClickIntensify: 8,
    onClickPandemic: 6,
    onClickProliferate: 6,
    // ⚡帯電（雷霆の巫）。帯電トークン/帯電付与は汎用プール(idx 21/22)、帯電拡散は雷霆の巫の固有スキル
    onClickChargeToken: 3,
    onClickChargeOne: 2,
    onClickChargeSpread: 7,
    // ヘイルメアリー: 固有スキル(陰陽転化を除く)をランダム発動。idx 23
    onClickHailMary: 6,
};

export type SkillCosts = typeof skillCosts;

// ミアズマの実コスト下限。毒が増えるほど安くなる仕様だが、0だと連打で敵マスを確実に0にできてしまうため、
// 最低1は払う（毒使いは魔力+1/ターンなので実質ターンに1回までになる）
export const MIASMA_MIN_COST = 1;

// 毒使いの駒に毒が付いた瞬間、そのマスのライフにかかる倍率（四捨五入）。sim/engine.js の POISON_MULT と同値
export const POISON_LIFE_MULT = 1.5;
