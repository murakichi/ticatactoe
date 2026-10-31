export const skillCosts = {
    onClickToken: 4,
    onClickTotalAssault: 9,
    onClickToggleYingYang: 1,
    onClickShikigamiPlace: 2, // 陰: 任意の空きマスに式神を置く
    onClickShikigamiBlast: 4, // 陽: 自分の式神を1つ選んで爆破
    onClickShikigamiAll: 3, // 汎用(idx 71): 自分の式神を全て通常の自陣コマにする。コストは式神1体あたり（2は強すぎたため3: 環境勝率74%）
    onClickShikigamiRandom: 2, // 汎用(idx 63・トークン扱い): 式神をランダムな空きマスに置く
    onClickShikigamiFlood: 7, // 汎用(idx 64 百鬼夜行): 全ての空きマスにライフ0の式神を置く
    onClickShikigamiBless: 5, // 汎用(idx 88 式神の加護): 自分の式神を1体消費して、自陣のコマ全てのライフ+3
    onClickShikigamiPurge: 5, // 汎用(idx 91 式神の供犠): 自陣の式神が3体以上なら0コスト。自陣の式神をランダムに1体壊し、敵のコマ1体のライフを0にする
    onClickShikigamiCurse: 5, // 汎用(idx 89 式神の呪詛): 自分の式神を1体消費して、エフェクトが乗っている敵のコマ全てに☠を2つ
    onClickShikigamiDiscount: 2, // 汎用(idx 90 式神割引): 次に打つスキルのコストを 2＋盤面の式神の数 だけ軽減
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
    onClickRandomCast: 2, // 福引き(idx 59)
    onClickCounterMarkdown: 2, // 返し特売(idx 60)。直前の相手の手番に相手がスキルを使っていれば0
    onClickBurnout: 5, // バーンアウト(idx 61)。盤面に🔥が4つ以上あれば0
    // 🍂落ち葉系の汎用スキル(idx 62-68)。自陣の🍂は相手全員のスキルコストを枚数ぶん上げる。sim/engine.js と同値
    onClickLeafToken: 5, //       木枯らしの使い(idx 62): 🍂付きトークン（基準の5〜6に戻した。ユーザー指示で3→5）
    onClickTwinLeafToken: 7, //   落葉松の双子(idx 63): 🍂が2枚付いたトークン
    onClickDoubleLeafToken: 8, // 紅葉狩り(idx 64): 🍂付きのダブルトークン
    onClickLeafAll: 5, //         枯野の相席(idx 65): 盤面の全てのコマ（敵味方）に🍂を1つずつ付与
    onClickBonfire: 3, //         焚き火の唄(idx 66): 敵陣の🍂を全て除去（🔑・❄のマスは対象外）
    onClickMulch: 2, //           腐葉土の目覚め(idx 67): 自陣の🍂1枚を🌱に変える
    onClickAutumn: 4, //          一葉知秋(idx 68): 盤面の🌱をすべて🍂に変える
    onClickLeafFrost: 3, //       霜枯れ(idx 69): 自陣の🍂マスに❄を付ける（氷結中は🍂が休眠する）
    onClickSpringWind: 2, //      春一番(idx 70): 自陣の❄を全て解除し、解除した数だけこのターンに打つスキルを軽減する
    onClickKimon: 6, //           鬼門封じ(idx 74): 敵コマを1つ破壊（氷結中は❄-1）し、空きマスになれば3ターンロック
    onClickFireWheel: 5, //       火の車(idx 75): ランダムな敵マス2つに🔥、その後手札をシャッフル。このターン敵か自陣に🔥を付与していれば0（撃つとリセット）
    onClickStrip: 4, //           裸の王様(idx 76): 相手全員のギアを、その席の次の手番の終わりまで無効にする
    onClickChargeSeason: 7, //    静電気の季節(idx 77): 今の手番を含む3ターン、設置する駒に⚡
    onClickBristle: 6, //         総毛立つ(idx 78): 自陣の全コマ(ロック中を除く)に⚡
    onClickRelease: 5, //         落雷は忘れた頃に(idx 79): 自陣の⚡を全て取り除き、取り除いた数だけ敵の全コマにダメージ
    onClickStash: 1, //           雷神のへそくり(idx 80): 自陣を1つ選んで⚡を全て除去し、除去したスタック1つにつき次のスキルのコスト-1
    onClickThunderFire: 7, //     雷のない所に火は立たぬ(idx 81): ⚡のあるコマを1つ破壊し、周囲8マスの敵コマ2〜全部に🔥+1
    onClickDarkPot: 9, //         一寸先は闇鍋(idx 82): 敵味方の全コマに🔥❄⚡☠🌱🍂をランダムに（各最大1）。盤面のエフェクトの数だけ軽減（最低1）
    onClickChargeHeal: 6, //     雷を食らわば皿まで(idx 83): ⚡が効いている自陣のコマのライフを⚡1スタックにつき+2。この手番に付与した⚡の数だけ軽減（最低1）
    onClickLeafDrop: 1, //       落ち葉の置き土産(idx 84): ランダムな敵のコマ1つに🍂を1つ付与。敵の🍂は自分のコストも上げる（魔女は相殺）ので最安
    onClickKindling: 7, //       焚きつけ(idx 85): 敵の🍂を全て🔥に変換（1枚につき🔥1）
    onClickLeafCloak: 3, //       落葉の衣(idx 86): ランダムな自陣のコマ1つに🍂を1つ付与
    onClickTinder: 2, //         火口(idx 87): 🌱・🍂・❄のある敵コマ1つに🔥を1つ付与（直前の手番に🌱🍂が植えられていれば各ターン1回まで0。鍛冶師は🔥付与で-1）
    onClickSmallFry: 10, //      一寸の虫に魂なし(idx 92): 敵のライフ3以下のコマを全て破壊し、相手は次の手番の終わりまでライフ3以下のコマを置けない（トークン等・ネクロの蘇生も）。盤面のコマの数だけ軽減（最低1）
    onClickFirstFrost: 6, //     初霜(idx 93): トークン扱い。敵の🍂があるコマを全て凍結し、自陣にバッズトークンを置く。盤面の🍂（効力のあるもの）が3枚以上なら0
    onClickGather: 8, //         吹き寄せ(idx 94): トークン扱い。自陣にトークンを置き、盤面のエフェクトを全てそのマスに集める（氷結・⚡無敵のマスは動かさない）。エフェクト1つにつき2軽減（氷結のマスは❄の数だけ・🔑自体は数えない。最低1）
    onClickBurnOff: 9, //        山焼き(idx 95): トークン扱い。敵のエフェクトがあるマス（氷結・⚡無敵を除く）全てに🔥を1つ付け、自陣にロック付きトークンを置く。エフェクト1つにつき3軽減（氷結のマスは❄の数だけ・🔑自体は数えない。最低1）
    onClickFreeToken: 4, //      無礼講(idx 96): このターン、トークン系スキルのコストを0にする
    onClickSpark: 4, //          飛び火(idx 97): ランダムな敵コマ2つに🔥を1つずつ。直前の手番に相手がコマを2つ以上設置していれば各ターン1回まで0。基準: 🔥3×2×0.85≒5(R3)、ランダム選択で-1。鍛冶師は🔥付与で-1
    onClickNightVeil: 3, //      夜の帳(idx 98): 次の相手全員の手番の間、相手のスキルのコストを+3する（自分は影響を受けない）。基準: 🍂1枚=相手全員のコスト+2（単価約2）。1手番だけなので🍂1.5枚ぶん
    onClickGraveDiscount: 1, //  弔い割引(idx 99): 次に打つスキルを、墓地の死体の数（上限3）だけ軽減する。軽減札（R5: 節約の最大値3より安い。軽減後の下限は1）
    onClickPoisonWard: 6, //     毒返しの構え(idx 100): 3手番の間、相手の手番ごとに1度まで、自陣のコマが破壊/乗っ取られたらライフ4・☠付きの自陣コマをランダムな空きマスに置く。基準: トークン4＋☠2（自傷-1）＋ライフ補正≒6/個、期待1〜2回、反応型の導線-1
    onClickGraveOffering: 2, //  墓守の供物(idx 101): 自陣のライフが最も低いコマを1つ消して、自分の墓地に死体+1・魔力+1（実質コスト1）。ユーザー指定のコスト2
};

export type SkillCosts = typeof skillCosts;

// ミアズマの実コスト下限。毒が増えるほど安くなる仕様だが、0だと連打で敵マスを確実に0にできてしまうため、
// 最低1は払う（毒使いは魔力+1/ターンなので実質ターンに1回までになる）
export const MIASMA_MIN_COST = 1;

// 毒使いの駒に毒が付いた瞬間、そのマスのライフにかかる倍率（四捨五入）。sim/engine.js の POISON_MULT と同値
export const POISON_LIFE_MULT = 1.5;

// 帯電付与・帯電拡散は盤面の⚡の数だけ安くなる(#43)。その下限。sim/config.js の charge.minCost と同値
export const CHARGE_MIN_COST = 1;
