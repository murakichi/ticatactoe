// 自動生成: src/components/game/skillCosts.ts (node scripts/gen-sim-shared.js)。手で編集しない。
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CHARGE_MIN_COST = exports.POISON_LIFE_MULT = exports.MIASMA_MIN_COST = exports.skillCosts = void 0;
exports.skillCosts = {
    onClickToken: 4,
    onClickTotalAssault: 9,
    onClickToggleYingYang: 1,
    onClickShikigamiPlace: 2,
    onClickShikigamiBlast: 4,
    onClickShikigamiAll: 3,
    onClickShikigamiRandom: 2,
    onClickShikigamiFlood: 7,
    onClickShikigamiBless: 5,
    onClickShikigamiPurge: 5,
    onClickShikigamiCurse: 5,
    onClickShikigamiDiscount: 2,
    onClickStomp: 3,
    onClickJudgeDay: 11,
    onClickCharge: 3,
    onClickAddLife: 3,
    onClickDepressionCherry: 1,
    onClickShuffle: 1,
    onClickBibine: 4,
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
    // 雷霆の巫 スキル2 (#40)。sim/config.js の charge.doubleTokenCost / areaCost / randomCost / jammerCost と同値
    onClickDoubleChargeToken: 5,
    onClickChargeArea: 5,
    onClickChargeRandom: 3,
    onClickJammer: 4,
    // ヘイルメアリー: 固有スキル(陰陽転化を除く)をランダム発動。idx 27
    onClickHailMary: 6,
    // サイレンス: 相手全員の次の手番のスキルを封じる。idx 28
    onClickSilence: 5,
    // 毒霧: 盤上の全コマ（敵味方問わず）に毒を1付与。idx 29。毒系なので毒使いは-1
    onClickPoisonMist: 6,
    // ❄氷結・🔥火炎。氷結/火炎付与は汎用プール(idx 30/31)、絶対零度は氷室の番人・業火は煉獄の鍛冶師の固有スキル
    onClickFreeze: 3,
    onClickIgnite: 3,
    onClickGlacier: 10,
    // 氷室の番人は常在のロックの代わりにこの「氷結」(マスを1つ選んで❄)を持つ
    onClickCryoFreeze: 2,
    // 浄化: 自陣のコマの状態異常（毒・火炎・氷結・帯電）を全部回復する。汎用プール(idx 32)
    onClickCleanse: 5,
    onClickInferno: 7,
    // 凩の魔女の固有スキル 虎落笛: 自陣の🍂の枚数ぶん敵全てにダメージ、自陣のライフ+2。sim/engine.js の onClickMogaribue と一致させること
    onClickMogaribue: 7,
    // バッズ系の汎用スキル(idx 33-36)。氷結・火炎で🌱が消えやすくなった環境向け
    onClickHarvestEve: 2,
    onClickSolstice: 4,
    onClickSucker: 4,
    onClickWindborne: 4,
    // 火炎系の汎用スキル(idx 37-39)。氷結への対抗手段
    onClickFlameToken: 3,
    onClickDoubleFlameToken: 5,
    onClickSwidden: 3,
    // 殉火（仮名）: 自陣のコマを犠牲にして、ライフがそれ以下の敵コマ全てに🔥。idx 40
    onClickSacrifice: 5,
    // 氷結系の汎用スキル(idx 41-48)。氷結を作った数は絶対零度のコスト軽減に1個ずつ数える
    onClickFrostArea: 5,
    onClickIcicle: 6,
    onClickRandomFreeze: 3,
    onClickFreezeSpread: 7,
    onClickFrostToken: 3,
    onClickDoubleFrostToken: 5,
    onClickShatter: 4,
    onClickFrostfall: 3,
    // 汎用スキル(idx 49-52)。慈雨・縮地・写し身・追い剥ぎ
    onClickBoost: 4,
    onClickRelocate: 3,
    onClickClone: 4,
    onClickPlunder: 5,
    // コスト軽減スキル(idx 53-58)。discount.ts
    onClickMarkdown: 1,
    onClickEffectDiscount: 1,
    onClickTokenDiscount: 1,
    onClickVitalMarkdown: 2,
    onClickUniqueDiscount: 3,
    onClickClearance: 4,
    onClickRandomCast: 2,
    onClickCounterMarkdown: 2,
    onClickBurnout: 5,
    // 🍂落ち葉系の汎用スキル(idx 62-68)。自陣の🍂は相手全員のスキルコストを枚数ぶん上げる。sim/engine.js と同値
    onClickLeafToken: 3,
    onClickTwinLeafToken: 7,
    onClickDoubleLeafToken: 9,
    onClickLeafAll: 5,
    onClickBonfire: 3,
    onClickMulch: 2,
    onClickAutumn: 4,
    onClickLeafFrost: 3,
    onClickSpringWind: 2,
    onClickKimon: 6,
    onClickFireWheel: 5,
    onClickStrip: 4,
    onClickChargeSeason: 7,
    onClickBristle: 6,
    onClickRelease: 5,
    onClickStash: 1,
    onClickThunderFire: 7,
    onClickDarkPot: 9,
    onClickChargeHeal: 6,
    onClickLeafDrop: 1,
    onClickKindling: 5,
    onClickLeafCloak: 3,
    onClickTinder: 2,
    onClickSmallFry: 10,
    onClickFirstFrost: 6,
    onClickGather: 8,
    onClickBurnOff: 9,
    onClickFreeToken: 4, //      無礼講(idx 96): このターン、トークン系スキルのコストを0にする
};
// ミアズマの実コスト下限。毒が増えるほど安くなる仕様だが、0だと連打で敵マスを確実に0にできてしまうため、
// 最低1は払う（毒使いは魔力+1/ターンなので実質ターンに1回までになる）
exports.MIASMA_MIN_COST = 1;
// 毒使いの駒に毒が付いた瞬間、そのマスのライフにかかる倍率（四捨五入）。sim/engine.js の POISON_MULT と同値
exports.POISON_LIFE_MULT = 1.5;
// 帯電付与・帯電拡散は盤面の⚡の数だけ安くなる(#43)。その下限。sim/config.js の charge.minCost と同値
exports.CHARGE_MIN_COST = 1;
