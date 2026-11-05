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
    onClickKindling: 7, //       焚きつけ(idx 85): 敵の🍂と🌱を全て🔥に変換（1つにつき🔥1）。盤面の🍂1枚につき3・🌱1つにつき2軽減（最低1。カウント型）
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
    onClickPerfectGame: 10, //   パーフェクトゲーム(idx 102): 盤面のコマを敵味方とも全て破壊する（🔑ロック・無敵は除く、氷結中は❄-1だけ）。基準: 大量破壊は重く基本10（軽減なし）
    onClickHelper: 3, //         超助っ人(idx 103): トークン。🔥❄⚡☠🌱🍂のうちランダムな1つを付けた自陣のコマを1つ置く（ターン1回）。基準: 素のトークン4 −1（☠🔥⚡が出ると自傷するので）
    onClickSecondCatch: 6, //    柳の下に二匹目がいた(idx 104): 自分のデッキから基礎コスト5以下のスキルを1つランダムに、コストを払わず発動する。この手番に基礎コスト7以上のスキルを使っていれば0（コンボ型の導線）
    // オブジェクト（objects.ts）。空きマスを選んで設置する。基準は docs/skill-cost-rules.md の「オブジェクトの算出」
    onClickBigTree: 8, //       大木(idx 105): 手番開始時マジック+3。火炎で即壊れる。基準: 手番ごと+3×期待2.5手番≒7.5
    onClickDeadTree: 5, //      枯れた大木(idx 106): 手番開始時、周囲八マスのランダムなコマに🍂。基準: 🍂約2×期待3手番−ランダム選択1
    onClickSpring: 5, //        生命の泉(idx 107): 手番開始時のライフ期待値+2。基準: 慈雨(4)の+ライフ×期待3手番に、設置1手番ぶんの割引
    onClickFort: 6, //          砦(idx 108): 手番開始時、周囲八マスの自陣のコマのライフ+1。基準: 周囲の自陣コマ平均3個×期待3手番。ライフは全種類5
    onClickThundercloud: 5, //  雷雲(idx 109): 手番開始時、周囲八マスのランダムなコマに⚡。基準: ⚡2×期待3手番−ランダム選択1−自傷の恐れ1
    onClickMarket: 3, //        市場(idx 110): 手番ごとに1回シャッフル(コスト1)が無料。基準: R5 節約の最大値(1×期待3手番=3)より安く、設置の機会損失ぶんの導線なしで2〜3 → 3
    onClickSanctuary: 5, //     聖域(idx 111): 周囲八マスの自陣のコマが時間経過の減衰を受けない。基準: 周囲の自陣コマ平均3個 × 減衰1/周 × 期待3手番 = 約9ライフ相当。ライフ+1の砦(6)より効く場面が限られるので5
    onClickPoisonSwamp: 5, //   毒沼(idx 112): 手番開始時、周囲八マスのランダムな敵コマに☠。基準: ☠(単価2) × 期待3手番 = 6、ランダム選択 −1。敵だけを選ぶので自傷の割引は掛けない
    onClickBoltSilence: 4, //    沈黙は雷なり(idx 113): 自陣の⚡を2つ(合計2スタック。同じコマからでも可)払って、相手全員が次の手番スキルを使えなくなる。汎用サイレンス(5)に⚡2つ(単価2×2)を足した実質8でR6を満たす（⚡を払うので汎用より重く、代わりにコストは4）。自陣の⚡が合計2つ無いと使えない
    // オブジェクトを壊す・強くするスキル(idx 114〜119)。基準は docs/skill-cost-rules.md の「オブジェクトを壊す・強くするスキル」
    onClickDemolish: 4, //      解体(idx 114): 敵のオブジェクトを1つ壊す。基準: 敵コマ1つの破壊4〜5、対象がオブジェクトに限られる −1
    onClickWeather: 3, //       風化(idx 115): 敵のオブジェクトのライフを0にする（壊さず、乗っ取れるようにする）。基準: 破壊4 −1（壊れない・乗っ取りに着手が要る）
    onClickLevelAll: 8, //      地ならし(idx 116): 敵のオブジェクトを全て壊す。基準: R4 盤面全体7〜9。対象が敵のオブジェクトだけなので下限寄り
    onClickReinforce: 3, //     補強工事(idx 117): 自陣のオブジェクト1つのライフ+3。基準: ライフ+3のスキル(ライフ3 = 3)と同じ単価
    onClickExpandAll: 4, //     増築(idx 118): 自陣のオブジェクト全てのライフ+2。基準: R4 全体系（平均2〜3個で合計+4〜6）、補強工事(3)より1個あたり安く
    onClickDuplicate: 6, //     分譲(idx 119): 自陣のオブジェクトを複製してランダムな空きマスに置く。基準: オブジェクトの設置は3〜8（平均5）、複製元を選べる(+1)がランダム置き(−1)で、写し身(4)より重い設置物のぶん上乗せ
    onClickWorkshop: 6, //      大工房(idx 120): 働いている間ベースコスト7以上のスキルのコスト-3（重ならない）。設置は直前の相手の手番にベースコスト7以上のスキルか合計7以上のマジックが使われていれば0（反応型の導線）。基準: 大技を期待2回撃って6得、導線で最大-2が許されるので6
    onClickBarrierStone: 4, //  結界石(idx 121): 周囲八マスの自陣の式神が時間経過の減衰を受けない。基準: 聖域(5・自陣のコマ全て)より対象が式神に限られるので −1。式神(ライフ2)は毎周1ずつ減って消えるので効きは大きい
    onClickAmuletShrine: 6, //  護符の社(idx 122): 手番開始時、周囲八マスの自陣の式神1体につきマジック+1(最大+3)。基準: 大木(8・毎手番+3)と同じ上限だが、式神を並べる前提(式神設置は2〜)なので −2
    // 相手を縛るオブジェクト・招き猫・八卦の陣(idx 123〜129)。基準は docs/skill-cost-rules.md の「縛りのオブジェクト」
    onClickLuckyCat: 5, //      招き猫(idx 123): 働いている間、自分のスキルのコスト-1(下限1・重ならない)。基準: 毎手番のスキル1〜2回 × 期待3手番 = 3〜6
    onClickMudField: 5, //      泥田坊(idx 124): 働いている間、相手がトークンで置くコマのライフが0になる。基準: トークン1回のライフ4を毎手番削る(慣れた相手はトークンを控える)
    onClickTongueKing: 5, //    閻魔の舌(idx 125): 働いている間、相手が自分のコマにエフェクトを付けると、そのコマのライフが0になる。基準: エフェクト戦略の相手に刺さる反応型の妨害
    onClickEightTrigrams: 8, // 八卦の陣(idx 126): 周囲八マスを自陣のコマで囲うと勝利。基準: 条件なしの勝ち筋は重い(R7)。囲うには8コマ要り、敵に崩されるので導線は付けずに8
    onClickSoloSign: 5, //      お一人様限りの札(idx 127): 働いている間、相手は1ターンに新しいコマを1つしか置けない。基準: トークン連打の抑止（ダブルトークン等を封じる）
    onClickOneWord: 6, //       一言居士(idx 128): 働いている間、相手は1ターンにスキルを1つしか使えない。基準: 相手の連続スキル(コンボ)を丸ごと封じるので、サイレンス(5)に近い6
    onClickBlindMonkey: 5, //   見ざる地蔵(idx 129): 周囲八マスには新しくエフェクトを付けられない。基準: 自陣を守る側にも自分が使う側にも効く範囲型。聖域(5)と同じ
};

export type SkillCosts = typeof skillCosts;

// ミアズマの実コスト下限。毒が増えるほど安くなる仕様だが、0だと連打で敵マスを確実に0にできてしまうため、
// 最低1は払う（毒使いは魔力+1/ターンなので実質ターンに1回までになる）
export const MIASMA_MIN_COST = 1;

// 毒使いの駒に毒が付いた瞬間、そのマスのライフにかかる倍率（四捨五入）。sim/engine.js の POISON_MULT と同値
export const POISON_LIFE_MULT = 1.5;

// 帯電付与・帯電拡散は盤面の⚡の数だけ安くなる(#43)。その下限。sim/config.js の charge.minCost と同値
export const CHARGE_MIN_COST = 1;
