// 自動生成: src/components/game/deck.ts (node scripts/gen-sim-shared.js)。手で編集しない。
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteSavedDeck = exports.saveDeck = exports.loadSavedDecks = exports.MAX_SAVED_DECKS = exports.SAVED_DECKS_KEY = exports.describeSkill = exports.baseCostOf = exports.CATEGORY_HELP = exports.CATEGORY_ORDER = exports.variedAIDeck = exports.CORE_CARDS = exports.AI_DECK_SWAPS = exports.randomDeck = exports.resolveDeck = exports.isValidDeck = exports.pickRecommendedDeck = exports.ALT_RECOMMENDED_DECKS = exports.recommendedDeckAgainst = exports.COUNTER_DECKS_FOR_YOU = exports.recommendedDeck = exports.RECOMMENDED_DECKS = exports.skillOf = exports.AVAILABLE_SKILL_IDX = exports.CATALOG_SIZE = exports.SKILL_IDX_END = exports.REMOVED_SKILL_IDX = exports.SKILL_CATALOG = exports.CUSTOM_SKILL_IDX = exports.DECK_SIZE = void 0;
const skillCosts_1 = require("./skillCosts");
/** デッキの枚数（同じスキルは1枚まで） */
exports.DECK_SIZE = 12;
/**
 * オリジナルスキル（customSkill.ts）がデッキに入るときの idx。汎用スキルの idx とは重ならない。
 * デッキの1枠を使うので、入るのは最大1枚（重複不可）。使えるのは人間席だけで、AI席・仕様が無い席では Game が外す。
 */
exports.CUSTOM_SKILL_IDX = 200;
/** 汎用スキルの一覧（添字 = 手札の idx。Game.tsx の shuffleSkillDefs / AIPlayer.ts の SKILL_POOL_SIZE と同じ並び） */
exports.SKILL_CATALOG = [
    { idx: 0, name: 'ライフ3', icon: '💚', category: 'support', costKey: 'onClickAddLife', desc: '自陣のコマのライフを3増やします' },
    { idx: 1, name: 'バイバイン', icon: '✖️', category: 'support', costKey: 'onClickBibine', desc: '自陣のコマのライフを倍にします' },
    { idx: 2, name: 'バッズ', icon: '🌱', category: 'buds', costKey: 'onClickBuds', desc: '次の一手でバッズを植えます' },
    { idx: 3, name: 'トークン', icon: '🪙', category: 'token', costKey: 'onClickToken', desc: '空きマスにランダムでコマを置きます' },
    { idx: 4, name: '両トークン', icon: '🪙', category: 'token', costKey: 'onClickBothToken', desc: '空きマスに全プレイヤーのコマを1つずつ置きます' },
    { idx: 5, name: 'スラッシュ', icon: '⚔️', category: 'attack', costKey: 'onClickSlash', desc: '右上から左下の斜めのマスのライフを0にします' },
    { idx: 6, name: 'バックスラッシュ', icon: '🗡️', category: 'attack', costKey: 'onClickBackSlash', desc: '左上から右下の斜めのマスのライフを0にします' },
    { idx: 7, name: 'チューチュートレイン', icon: '🚂', category: 'attack', costKey: 'onClickTsunami', desc: '相手全員のマジックを0にします' },
    { idx: 8, name: 'オピウム', icon: '💨', category: 'attack', costKey: 'onClickOpium', desc: '相手のコマ全てのライフを減らし、ターンを終了します' },
    { idx: 9, name: 'バッズトークン', icon: '🪙', category: 'token', costKey: 'onClickBudsToken', desc: 'バッズ付きのコマをランダムに置きます' },
    { idx: 10, name: 'ダブルバッズ', icon: '🌱', category: 'buds', costKey: 'onClickDoubleBuds', desc: '次の一手でバッズを2つ植えます' },
    { idx: 11, name: 'ダブルトークン', icon: '🪙', category: 'token', costKey: 'onClickDoubleToken', desc: '空きマスにランダムでコマを2つ置きます' },
    { idx: 12, name: 'ダブルロック', icon: '🔑', category: 'control', costKey: 'onClickDoubleLock', desc: 'マスを2つ選んでロックします' },
    { idx: 13, name: 'トリプルロック', icon: '🔑', category: 'control', costKey: 'onClickTripleLock', desc: 'マスを3つ選んでロックします' },
    { idx: 14, name: 'ワルプルギスの夜', icon: '🌸', category: 'buds', costKey: 'onClickWalpurgisNight', desc: '全てのコマにバッズを植えます' },
    { idx: 15, name: 'インジェクション', icon: '💉', category: 'poison', costKey: 'onClickInjection', desc: 'マスを選んで毒を付与します' },
    { idx: 16, name: 'ポイズントークン', icon: '🪙', category: 'poison', costKey: 'onClickPoisonToken', desc: '毒付きの自陣コマをランダムに置きます' },
    { idx: 17, name: '血清', icon: '🧪', category: 'poison', costKey: 'onClickSerum', desc: '自陣のコマの毒を全て除去します' },
    { idx: 18, name: '猛毒化', icon: '☠', category: 'poison', costKey: 'onClickIntensify', desc: '毒が付いている全てのマスの毒を倍にします' },
    { idx: 19, name: 'パンデミック', icon: '🦠', category: 'poison', costKey: 'onClickPandemic', desc: 'マスと周囲8マスのコマに毒を付与します' },
    { idx: 20, name: '増殖', icon: '♾️', category: 'support', costKey: 'onClickProliferate', desc: '着手のたびにコマとアイテムを追加し続けます' },
    { idx: 21, name: '帯電トークン', icon: '🪙', category: 'charge', costKey: 'onClickChargeToken', desc: '⚡付きの自陣コマをランダムに置きます' },
    { idx: 22, name: '帯電付与', icon: '⚡', category: 'charge', costKey: 'onClickChargeOne', desc: 'マスを選んで⚡を付与します' },
    { idx: 23, name: '帯電ダブルトークン', icon: '🪙', category: 'charge', costKey: 'onClickDoubleChargeToken', desc: '⚡付きの自陣コマをランダムに2つ置きます' },
    { idx: 24, name: '範囲帯電', icon: '⚡', category: 'charge', costKey: 'onClickChargeArea', desc: 'マスと周囲8マスに⚡を付与します' },
    { idx: 25, name: 'ランダム帯電', icon: '⚡', category: 'charge', costKey: 'onClickChargeRandom', desc: 'ランダムな1〜4マスに⚡を付与します' },
    { idx: 26, name: 'ジャマー', icon: '⚡', category: 'charge', costKey: 'onClickJammer', desc: '⚡のマスを選び、隣の敵コマにダメージを与えて⚡を取り除きます' },
    { idx: 27, name: 'ヘイルメアリー', icon: '🎲', category: 'support', costKey: 'onClickHailMary', desc: '固有スキルをランダムに1つ、コストなしで発動します' },
    { idx: 28, name: 'サイレンス', icon: '🤫', category: 'control', costKey: 'onClickSilence', desc: '相手全員が次の手番、スキルを使えなくなります' },
    { idx: 29, name: '毒霧', icon: '🌫️', category: 'poison', costKey: 'onClickPoisonMist', desc: '盤上の全てのコマに毒を付与します' },
    { idx: 30, name: '氷結', icon: '❄', category: 'ice', costKey: 'onClickFreeze', desc: 'マスを選んで❄を付与します' },
    { idx: 31, name: '火遁', icon: '🔥', category: 'fire', costKey: 'onClickIgnite', desc: 'コマを選んで🔥を付与します' },
    { idx: 32, name: '浄化', icon: '✨', category: 'support', costKey: 'onClickCleanse', desc: '自陣のコマの状態異常を全て回復します' },
    { idx: 33, name: '刈り入れ前夜', icon: '🌾', category: 'buds', costKey: 'onClickHarvestEve', desc: '自陣の🌱を全て刈り取り、刈った数だけマジックを得ます' },
    { idx: 34, name: '冬至の種子', icon: '🌰', category: 'buds', costKey: 'onClickSolstice', desc: '次の自分の手番まで、自陣の🌱が氷結・火炎中でも働きます' },
    { idx: 35, name: 'ひこばえ', icon: '🌿', category: 'buds', costKey: 'onClickSucker', desc: '🌱を持つ自陣のコマの隣の自陣コマに🌱を付けます' },
    { idx: 36, name: '風の落とし子', icon: '🍃', category: 'buds', costKey: 'onClickWindborne', desc: '自陣のコマにランダムで🌱を2つ配ります' },
    { idx: 37, name: '火炎トークン', icon: '🪙', category: 'fire', costKey: 'onClickFlameToken', desc: '🔥付きの自陣コマをランダムに置きます' },
    { idx: 38, name: '火炎ダブルトークン', icon: '🪙', category: 'fire', costKey: 'onClickDoubleFlameToken', desc: '🔥付きの自陣コマをランダムに2つ置きます' },
    { idx: 39, name: '焼畑', icon: '🌾', category: 'fire', costKey: 'onClickSwidden', desc: '🌱のあるマスを選び、🌱を全て🔥に変えます' },
    { idx: 40, name: '殉火', icon: '🕯️', category: 'fire', costKey: 'onClickSacrifice', desc: '自陣のコマを犠牲にし、そのライフ以下の敵コマ全てに🔥を付与します' },
    { idx: 41, name: '範囲氷結', icon: '❄', category: 'ice', costKey: 'onClickFrostArea', desc: 'マスと周囲8マスに❄を付与します' },
    { idx: 42, name: '氷柱', icon: '🧊', category: 'ice', costKey: 'onClickIcicle', desc: 'マスと方向を選び、その線上のマスに❄を付与します' },
    { idx: 43, name: 'ランダム氷結', icon: '🌨️', category: 'ice', costKey: 'onClickRandomFreeze', desc: 'ランダムな1〜4マスに❄を付与します' },
    { idx: 44, name: '氷結拡散', icon: '❄', category: 'ice', costKey: 'onClickFreezeSpread', desc: 'コマを選び、そこから繋がる全てのコマに❄を付与します' },
    { idx: 45, name: '氷結トークン', icon: '🪙', category: 'ice', costKey: 'onClickFrostToken', desc: '❄付きの自陣コマをランダムに置きます' },
    { idx: 46, name: '氷結ダブルトークン', icon: '🪙', category: 'ice', costKey: 'onClickDoubleFrostToken', desc: '❄付きの自陣コマをランダムに2つ置きます' },
    { idx: 47, name: '砕氷', icon: '🔨', category: 'ice', costKey: 'onClickShatter', desc: '氷結中のコマの❄を砕き、ダメージを与えます' },
    { idx: 48, name: '霜降り', icon: '🌫️', category: 'ice', costKey: 'onClickFrostfall', desc: '自陣のライフの低いコマ全てに❄を付与します' },
    { idx: 49, name: '慈雨', icon: '⬆️', category: 'support', costKey: 'onClickBoost', desc: '自陣の全てのコマのライフを1増やします' },
    { idx: 51, name: '写し身', icon: '🪞', category: 'support', costKey: 'onClickClone', desc: '自陣のコマの隣の空きマスに、ライフ半分の写しを置きます' },
    { idx: 52, name: '追い剥ぎ', icon: '🏴‍☠️', category: 'attack', costKey: 'onClickPlunder', desc: 'ライフ0の敵コマを1つ、自陣のコマにします' },
    { idx: 53, name: '特売', icon: '🏷️', category: 'support', costKey: 'onClickMarkdown', desc: '次に打つスキルのコストを3下げます' },
    { idx: 54, name: '付与割引', icon: '🎫', category: 'support', costKey: 'onClickEffectDiscount', desc: 'このターン、エフェクトを付与するスキルのコストを、打つたびに下げます' },
    { idx: 55, name: 'トークン割引', icon: '🎟️', category: 'support', costKey: 'onClickTokenDiscount', desc: 'このターン、トークンのスキルのコストを、打つたびに下げます' },
    { idx: 56, name: '活力特売', icon: '💖', category: 'support', costKey: 'onClickVitalMarkdown', desc: '次に打つスキルのコストを4下げ、次の一手のライフを増やします' },
    { idx: 57, name: '固有割引', icon: '👑', category: 'support', costKey: 'onClickUniqueDiscount', desc: 'このターン、固有スキルのコストを6下げます' },
    { idx: 58, name: '大特価', icon: '💸', category: 'support', costKey: 'onClickClearance', desc: '次に打つスキルのコストを7下げます' },
    { idx: 59, name: '福引き', icon: '🎰', category: 'support', costKey: 'onClickRandomCast', desc: '自分のデッキから基礎コストの低いスキルをランダムに1つ、コストなしで発動します' },
    { idx: 60, name: '返し特売', icon: '↩️', category: 'support', costKey: 'onClickCounterMarkdown', desc: '次に打つスキルのコストを3下げ、次の一手のライフを増やします' },
    { idx: 61, name: 'バーンアウト', icon: '💥', category: 'fire', costKey: 'onClickBurnout', desc: '🔥が乗っているマスを全て破壊します' },
    { idx: 62, name: '木枯らしの使い', icon: '🍂', category: 'buds', costKey: 'onClickLeafToken', desc: '🍂付きの自陣コマをランダムに置きます' },
    { idx: 63, name: '落葉松の双子', icon: '🍂', category: 'buds', costKey: 'onClickTwinLeafToken', desc: '🍂が2枚付いた自陣コマをランダムに置きます' },
    { idx: 64, name: '紅葉狩り', icon: '🍂', category: 'buds', costKey: 'onClickDoubleLeafToken', desc: '🍂付きの自陣コマをランダムに2つ置きます' },
    { idx: 65, name: '枯野の相席', icon: '🍂', category: 'buds', costKey: 'onClickLeafAll', desc: '盤面の全てのコマに🍂を付与します' },
    { idx: 66, name: '焚き火の唄', icon: '🔥', category: 'buds', costKey: 'onClickBonfire', desc: '敵陣の🍂を全て取り除きます' },
    { idx: 67, name: '腐葉土の目覚め', icon: '🌱', category: 'buds', costKey: 'onClickMulch', desc: '自陣のランダムな🍂を1枚、🌱に変えます' },
    { idx: 68, name: '一葉知秋', icon: '🍂', category: 'buds', costKey: 'onClickAutumn', desc: '盤面の全ての🌱を🍂に変えます' },
    { idx: 69, name: '霜枯れ', icon: '🥶', category: 'ice', costKey: 'onClickLeafFrost', desc: '自陣の🍂を持つコマ全てに❄を付与します' },
    { idx: 70, name: '春一番', icon: '🌬️', category: 'ice', costKey: 'onClickSpringWind', desc: '自陣の❄を全て解除し、解除した数だけスキルのコストを下げます' },
    { idx: 71, name: '式神一括', icon: '📜', category: 'shikigami', costKey: 'onClickShikigamiAll', desc: '自分の式神を全て通常の自陣のコマにします' },
    { idx: 72, name: '式神ランダム設置', icon: '📜', category: 'shikigami', costKey: 'onClickShikigamiRandom', desc: '式神をランダムな空きマスに置きます' },
    { idx: 73, name: '百鬼夜行', icon: '📜', category: 'shikigami', costKey: 'onClickShikigamiFlood', desc: '着手できる全ての空きマスに式神を置きます' },
    { idx: 74, name: '鬼門封じ', icon: '⛩️', category: 'control', costKey: 'onClickKimon', desc: '敵のコマを1つ選んで破壊し、空きマスをロックします' },
    { idx: 75, name: '火の車', icon: '🛞', category: 'fire', costKey: 'onClickFireWheel', desc: 'ランダムな敵のコマ2つに🔥を付与し、手札をシャッフルします' }, { idx: 76, name: '裸の王様', icon: '👑', category: 'control', costKey: 'onClickStrip', desc: '相手全員のギアを次の手番の終わりまで無効にします' }, { idx: 77, name: '静電気の季節', icon: '🌩️', category: 'charge', costKey: 'onClickChargeSeason', desc: '数ターンの間、自分が置くコマに⚡を付けます' },
    { idx: 78, name: '総毛立つ', icon: '⚡', category: 'charge', costKey: 'onClickBristle', desc: '自陣の全てのコマに⚡を付与します' }, { idx: 79, name: '落雷は忘れた頃に', icon: '💥', category: 'charge', costKey: 'onClickRelease', desc: '自陣の⚡を全て取り除き、取り除いた数だけ敵の全てのコマにダメージを与えます' }, { idx: 80, name: '雷神のへそくり', icon: '💰', category: 'charge', costKey: 'onClickStash', desc: '⚡のある自陣のコマを選んで⚡を取り除き、取り除いた数だけ次に打つスキルのコストを下げます' }, { idx: 81, name: '雷のない所に火は立たぬ', icon: '🌋', category: 'charge', costKey: 'onClickThunderFire', desc: '⚡のあるコマを1つ選んで破壊し、周囲の敵コマに🔥を付与します' }, { idx: 82, name: '一寸先は闇鍋', icon: '🍲', category: 'control', costKey: 'onClickDarkPot', desc: '盤面の全てのコマにランダムなエフェクトを付与します' }, { idx: 83, name: '雷を食らわば皿まで', icon: '🍽️', category: 'charge', costKey: 'onClickChargeHeal', desc: '⚡の付いた自陣のコマのライフを増やします' },
    { idx: 84, name: '落ち葉の置き土産', icon: '🍂', category: 'buds', costKey: 'onClickLeafDrop', desc: 'ランダムな敵のコマ1つに🍂を付与します' },
    { idx: 85, name: '焚きつけ', icon: '🔥', category: 'buds', costKey: 'onClickKindling', desc: '敵の🍂と🌱を全て🔥に変えます' },
    { idx: 86, name: '落葉の衣', icon: '🍂', category: 'buds', costKey: 'onClickLeafCloak', desc: 'ランダムな自陣のコマ1つに🍂を付与します' },
    { idx: 87, name: '火口', icon: '🔥', category: 'fire', costKey: 'onClickTinder', desc: '🌱・🍂・❄のいずれかを持つ敵のコマを1つ選んで🔥を付与します' },
    { idx: 88, name: '式神の加護', icon: '📜', category: 'shikigami', costKey: 'onClickShikigamiBless', desc: '式神を1体消費し、自陣のコマ全てのライフを増やします' },
    { idx: 89, name: '式神の呪詛', icon: '📜', category: 'shikigami', costKey: 'onClickShikigamiCurse', desc: '式神を1体消費し、エフェクトが乗っている敵のコマ全てに毒を付与します' },
    { idx: 90, name: '式神割引', icon: '📜', category: 'shikigami', costKey: 'onClickShikigamiDiscount', desc: '次に打つスキルのコストを、式神の数に応じて下げます' },
    { idx: 91, name: '式神の供犠', icon: '📜', category: 'shikigami', costKey: 'onClickShikigamiPurge', desc: '式神を1体壊し、敵のコマを1つ選んでライフを0にします' },
    { idx: 92, name: '一寸の虫に魂なし', icon: '🌶️', category: 'attack', costKey: 'onClickSmallFry', desc: '敵のライフの低いコマを全て破壊し、相手が置けるコマを制限します' },
    { idx: 93, name: '初霜', icon: '🧊', category: 'ice', costKey: 'onClickFirstFrost', desc: '敵の🍂があるコマを全て凍結し、自陣にバッズ付きのコマを置きます' },
    { idx: 94, name: '吹き寄せ', icon: '🍃', category: 'control', costKey: 'onClickGather', desc: '自陣にコマを置き、盤面のエフェクトを全てそのマスに集めます' },
    { idx: 95, name: '山焼き', icon: '🔥', category: 'fire', costKey: 'onClickBurnOff', desc: '敵のエフェクトがあるマス全てに🔥を付与し、自陣にロック付きのコマを置きます' },
    { idx: 96, name: '無礼講', icon: '🎉', category: 'support', costKey: 'onClickFreeToken', desc: 'このターン、トークンのスキルのコストを0にします' },
    { idx: 97, name: '飛び火', icon: '🔥', category: 'fire', costKey: 'onClickSpark', desc: 'ランダムな敵のコマ2つに🔥を付与します' },
    { idx: 98, name: '夜の帳', icon: '🌙', category: 'control', costKey: 'onClickNightVeil', desc: '次の相手全員の手番の間、相手のスキルのコストを上げます' },
    { idx: 99, name: '弔い割引', icon: '🪦', category: 'support', costKey: 'onClickGraveDiscount', desc: '墓地の死体の数だけ、次に打つスキルのコストを下げます' },
    { idx: 100, name: '毒返しの構え', icon: '🐍', category: 'poison', costKey: 'onClickPoisonWard', desc: '数手番の間、自陣のコマが破壊されたら、毒付きの自陣コマを置いて反撃します' },
    { idx: 101, name: '墓守の供物', icon: '⚰️', category: 'support', costKey: 'onClickGraveOffering', desc: '自陣のライフが最も低いコマを1つ消し、墓地とマジックを得ます' },
    { idx: 102, name: 'パーフェクトゲーム', icon: '🎳', category: 'attack', costKey: 'onClickPerfectGame', desc: '盤面のコマを敵味方とも全て破壊します' },
    { idx: 103, name: '超助っ人', icon: '🦸', category: 'token', costKey: 'onClickHelper', desc: 'ランダムなエフェクトを付けたコマを、自陣の空きマスに置きます' },
    { idx: 104, name: '柳の下に二匹目がいた', icon: '🐟', category: 'support', costKey: 'onClickSecondCatch', desc: '自分のデッキから基礎コストの低いスキルをランダムに1つ、コストなしで発動します' },
    { idx: 105, name: '大木', icon: '🌳', category: 'object', costKey: 'onClickBigTree', desc: '空きマスに大木を設置します。手番開始時にマジックを得ます' },
    { idx: 106, name: '枯れた大木', icon: '🪵', category: 'object', costKey: 'onClickDeadTree', desc: '空きマスに枯れた大木を設置します。手番開始時、周囲のコマに🍂を付けます' },
    { idx: 107, name: '生命の泉', icon: '⛲', category: 'object', costKey: 'onClickSpring', desc: '空きマスに生命の泉を設置します。手番開始時のライフが増えます' },
    { idx: 108, name: '砦', icon: '🏰', category: 'object', costKey: 'onClickFort', desc: '空きマスに砦を設置します。手番開始時、周囲の自陣のコマのライフが増えます' },
    { idx: 109, name: '雷雲', icon: '🌩️', category: 'object', costKey: 'onClickThundercloud', desc: '空きマスに雷雲を設置します。手番開始時、周囲のコマに⚡を付けます' },
    { idx: 110, name: '市場', icon: '🏪', category: 'object', costKey: 'onClickMarket', desc: '空きマスに市場を設置します。シャッフルが無料になります' },
    { idx: 111, name: '聖域', icon: '⛩️', category: 'object', costKey: 'onClickSanctuary', desc: '空きマスに聖域を設置します。周囲の自陣のコマのライフが減らなくなります' },
    { idx: 112, name: '毒沼', icon: '🐸', category: 'object', costKey: 'onClickPoisonSwamp', desc: '空きマスに毒沼を設置します。手番開始時、周囲の敵のコマに毒を付けます' },
    { idx: 113, name: '沈黙は雷なり', icon: '🤐', category: 'control', costKey: 'onClickBoltSilence', desc: '自陣の⚡を2つ取り除き、相手全員が次の手番、スキルを使えなくなります' },
    { idx: 114, name: '解体', icon: '🧨', category: 'object', costKey: 'onClickDemolish', desc: '敵のオブジェクトを1つ選んで壊します' },
    { idx: 115, name: '風化', icon: '🌫️', category: 'object', costKey: 'onClickWeather', desc: '敵のオブジェクトを1つ選んで、ライフを0にします' },
    { idx: 116, name: '地ならし', icon: '🚜', category: 'object', costKey: 'onClickLevelAll', desc: '敵のオブジェクトを全て壊します' },
    { idx: 117, name: '補強工事', icon: '🏗️', category: 'object', costKey: 'onClickReinforce', desc: '自陣のオブジェクトを1つ選んで、ライフを増やします' },
    { idx: 118, name: '増築', icon: '🧱', category: 'object', costKey: 'onClickExpandAll', desc: '自陣のオブジェクトの全てのライフを増やします' },
    { idx: 119, name: '分譲', icon: '🏘️', category: 'object', costKey: 'onClickDuplicate', desc: '自陣のオブジェクトを1つ選んで、同じものをもう1つ置きます' },
    { idx: 120, name: '大工房', icon: '🏭', category: 'object', costKey: 'onClickWorkshop', desc: '空きマスに大工房を設置します。コストの高いスキルが安くなります' },
    { idx: 121, name: '結界石', icon: '🪨', category: 'object', costKey: 'onClickBarrierStone', desc: '空きマスに結界石を設置します。周囲の自陣の式神のライフが減らなくなります' },
    { idx: 122, name: '護符の社', icon: '⛩️', category: 'object', costKey: 'onClickAmuletShrine', desc: '空きマスに護符の社を設置します。手番開始時、周囲の自陣の式神の数だけマジックを得ます' },
    { idx: 123, name: '招き猫', icon: '🐈', category: 'object', costKey: 'onClickLuckyCat', desc: '空きマスに招き猫を設置します。自分のスキルのコストが下がります' },
    { idx: 124, name: '泥田坊', icon: '🌾', category: 'object', costKey: 'onClickMudField', desc: '空きマスに泥田坊を設置します。相手がトークンで置くコマのライフが0になります' },
    { idx: 125, name: '閻魔の舌', icon: '👅', category: 'object', costKey: 'onClickTongueKing', desc: '空きマスに閻魔の舌を設置します。相手が自陣のコマにエフェクトを付けると、そのコマのライフが0になります' },
    { idx: 126, name: '八卦の陣', icon: '🔯', category: 'object', costKey: 'onClickEightTrigrams', desc: '空きマスに八卦の陣を設置します。周囲が全て自陣のコマで埋まると勝利します' },
    { idx: 127, name: 'お一人様限りの札', icon: '🪧', category: 'object', costKey: 'onClickSoloSign', desc: '空きマスにお一人様限りの札を設置します。相手は1ターンにコマを1つしか置けなくなります' },
    { idx: 128, name: '一言居士', icon: '🗿', category: 'object', costKey: 'onClickOneWord', desc: '空きマスに一言居士を設置します。相手は1ターンにスキルを1つしか使えなくなります' },
    { idx: 129, name: '見ざる地蔵', icon: '🙈', category: 'object', costKey: 'onClickBlindMonkey', desc: '空きマスに見ざる地蔵を設置します。周囲にはエフェクトを付けられなくなります' },
    { idx: 130, name: '錠前荒らし', icon: '🔓', category: 'control', costKey: 'onClickLockRaid', desc: '敵陣のロックを1つ解除し、そのコマにランダムなエフェクトを付与します' },
    { idx: 131, name: 'ロックの増築', icon: '🔐', category: 'control', costKey: 'onClickLockExtend', desc: '自陣のコマのロックの期間を延ばします' },
    { idx: 132, name: '施錠の加護', icon: '🛡️', category: 'control', costKey: 'onClickLockBlessing', desc: '数手番の間、設置したコマにロックが付きます' },
    { idx: 133, name: '空き家封じ', icon: '🏚️', category: 'control', costKey: 'onClickVacantSeal', desc: '空きマス全てをロックします' },
    { idx: 134, name: '錠の転換', icon: '🗝️', category: 'control', costKey: 'onClickLockConvert', desc: 'ロックのかかっているマスを1つ選んで解除し、解除した分のライフを自分に加えます' },
    { idx: 135, name: '錠前割引', icon: '🧾', category: 'support', costKey: 'onClickLockDiscount', desc: 'このターン、盤面のロックの数だけ、打つスキルのコストを下げます' },
];
/** 削除したスキルの idx（欠番）。他の番号は変えない。手札・デッキ・探索の対象から外す。縮地(50)を削除（ユーザー指示） */
exports.REMOVED_SKILL_IDX = [50];
/** 汎用スキルの idx の上限（手札の idx は 0..SKILL_IDX_END-1 のうち欠番を除く）。AIPlayer.ts の SKILL_POOL_SIZE と同値 */
exports.SKILL_IDX_END = exports.SKILL_CATALOG.length + exports.REMOVED_SKILL_IDX.length;
/** 汎用スキルの総数（欠番を除く） */
exports.CATALOG_SIZE = exports.SKILL_CATALOG.length;
/** 手札・デッキに入りうる idx（昇順。欠番を除く） */
exports.AVAILABLE_SKILL_IDX = exports.SKILL_CATALOG.map((c) => c.idx);
const SKILL_BY_IDX = new Map(exports.SKILL_CATALOG.map((c) => [c.idx, c]));
/** idx の札（欠番・範囲外なら undefined）。欠番があるので SKILL_CATALOG[idx] ではこれを使う */
const skillOf = (idx) => SKILL_BY_IDX.get(idx);
exports.skillOf = skillOf;
/**
 * キャラ別の推奨デッキ（12枚）。AIが何も指定しないときに使う（人間も未指定なら同じ）。
 * 核は「AIが使いこなせて、どのキャラにも腐らない」汎用スキル（トークン・ライフ・スラッシュ・オピウム・ロック・サイレンス）。
 * 残りをキャラの得意（バッズ・毒・帯電・氷結・火炎・トークン）に振っている。
 * 初版は手組み。強制使用A/Bの結果（docs/diary/2026-10-20.md）に合わせて見直していく。
 */
exports.RECOMMENDED_DECKS = {
    you: [0, 2, 3, 5, 6, 8, 10, 11, 12, 28, 32, 52],
    tactician: [3, 9, 11, 45, 46, 52, 64, 92, 93, 94, 95, 96],
    magician: [2, 9, 10, 13, 26, 47, 52, 53, 56, 60, 64, 92],
    giant: [0, 1, 2, 3, 5, 6, 8, 11, 12, 13, 27, 28],
    yinYangMaster: [0, 2, 3, 5, 6, 8, 10, 53, 61, 71, 72, 92],
    necromancer: [2, 3, 6, 8, 11, 22, 40, 52, 58, 89, 92, 95],
    poisoner: [0, 12, 15, 16, 17, 18, 19, 29, 45, 46, 48, 52],
    electrician: [21, 22, 23, 24, 26, 28, 52, 53, 58, 60, 92, 94],
    cryomancer: [12, 28, 41, 43, 44, 45, 46, 47, 48, 52, 73, 92],
    pyromancer: [0, 3, 5, 8, 11, 28, 52, 53, 56, 58, 87, 92],
    witch: [5, 8, 28, 44, 52, 53, 56, 62, 63, 64, 85, 92],
    keysmith: [0, 2, 5, 8, 10, 11, 12, 13, 28, 108, 110, 95],
    fighter: [0, 2, 3, 5, 6, 8, 11, 12, 14, 28, 32, 49],
    healer: [0, 2, 3, 8, 10, 12, 14, 28, 32, 34, 35, 49],
};
/** キャラの推奨デッキ（コピー） */
const recommendedDeck = (character) => { var _a; return [...((_a = exports.RECOMMENDED_DECKS[character]) !== null && _a !== void 0 ? _a : exports.RECOMMENDED_DECKS.you)]; };
exports.recommendedDeck = recommendedDeck;
/**
 * 「あなた」の相手キャラ別の専用デッキ（相手が1キャラのときだけ使う。AIPlayer.ts YOU_HOLD_VS と対）。
 * 一寸の虫に魂なし(92)・火口(87)を入れて、引いたら手札に固定して毎手番使う。docs/tune/you.md
 * （seed2/300: 対witch 2.7→30.3%、対氷室 8.0→24.0%、対雷霆 0→23.7%）。
 */
exports.COUNTER_DECKS_FOR_YOU = {
    magician: [0, 2, 3, 5, 8, 10, 11, 28, 32, 52, 87, 92],
    witch: [0, 2, 3, 5, 8, 10, 11, 28, 32, 52, 87, 92],
    cryomancer: [0, 2, 3, 5, 8, 10, 11, 12, 28, 32, 52, 92],
    electrician: [0, 2, 3, 5, 8, 10, 11, 12, 28, 32, 52, 92],
    tactician: [0, 2, 3, 5, 8, 10, 11, 28, 32, 52, 74, 92], // 一寸の虫(92)+鬼門封じ(74)を固定。対軍師 17.0→29.0%（seed2/300）
};
/** character の推奨デッキ。「あなた」は相手が1キャラで専用デッキがあればそれ */
const recommendedDeckAgainst = (character, opponents) => {
    if (character === 'you') {
        const kinds = Array.from(new Set(opponents));
        const counter = kinds.length === 1 ? exports.COUNTER_DECKS_FOR_YOU[kinds[0]] : undefined;
        if (counter)
            return [...counter];
    }
    return (0, exports.recommendedDeck)(character);
};
exports.recommendedDeckAgainst = recommendedDeckAgainst;
/**
 * 主案(RECOMMENDED_DECKS)と同等に強い別案のデッキ。あるキャラだけ書く。AI席は主案と別案からランダムに選ぶ（pickRecommendedDeck）。
 * sim の環境測定は主案だけで行う（再現性のため）。別案は主案と同程度の環境勝率であることを確かめたものだけ入れる（docs/tune/<char>.md）。
 */
exports.ALT_RECOMMENDED_DECKS = {
    // 陰陽師: 主案の8(オピウム)を大木(105)に替えた案。魔力+3/手番を立てる。対強豪平均 +1.6/+1.7（seed12/300・seed33/600）で主案以上だが統計的な採用基準は満たさないので別案にする
    yinYangMaster: [[0, 2, 3, 5, 6, 105, 10, 53, 61, 71, 72, 92]],
    // ネクロマンサー: 特売・固有割引を残す山焼き入りの旧主案と、落葉の衣・火口・無礼講の別案。統計的な基準は満たさないが同等と見て併用する(ユーザー許可)
    necromancer: [
        [0, 2, 3, 6, 8, 11, 52, 53, 57, 58, 92, 95],
        [0, 2, 6, 8, 11, 52, 58, 86, 87, 92, 95, 96],
    ],
};
/** AI席のベースにするデッキ。主案と別案を同じ確率で選ぶ（別案が無ければ主案で、乱数は使わない） */
const pickRecommendedDeck = (character, rng = Math.random) => {
    var _a;
    const alts = (_a = exports.ALT_RECOMMENDED_DECKS[character]) !== null && _a !== void 0 ? _a : [];
    if (alts.length === 0)
        return (0, exports.recommendedDeck)(character);
    const patterns = [(0, exports.recommendedDeck)(character), ...alts.map((d) => [...d])];
    return patterns[Math.floor(rng() * patterns.length)];
};
exports.pickRecommendedDeck = pickRecommendedDeck;
/** デッキとして有効か: 枚数がちょうど DECK_SIZE で、重複がなく、全て汎用スキルの idx（オリジナルスキルの idx は1枚まで） */
const isValidDeck = (deck) => !!deck &&
    deck.length === exports.DECK_SIZE &&
    new Set(deck).size === exports.DECK_SIZE &&
    deck.every((i) => Number.isInteger(i) && (exports.AVAILABLE_SKILL_IDX.includes(i) || i === exports.CUSTOM_SKILL_IDX));
exports.isValidDeck = isValidDeck;
/** 席のデッキを決める: 有効な指定があればそれ（昇順に整える）、なければ推奨デッキ */
const resolveDeck = (deck, character) => (0, exports.isValidDeck)(deck) ? [...deck].sort((a, b) => a - b) : (0, exports.recommendedDeck)(character);
exports.resolveDeck = resolveDeck;
/** ランダムなデッキ（rng は [0,1) を返す関数） */
const randomDeck = (rng = Math.random) => {
    const pool = [...exports.AVAILABLE_SKILL_IDX];
    const out = [];
    for (let k = 0; k < exports.DECK_SIZE; k++)
        out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
    return out.sort((a, b) => a - b);
};
exports.randomDeck = randomDeck;
/** variedAIDeck(ストレステスト用)のランダム入れ替えの枚数（推奨デッキの12枚中） */
exports.AI_DECK_SWAPS = 3;
/**
 * キャラの勝ち筋になる「核のカード」。ストレステスト用の入れ替えデッキ（variedAIDeck）でも入れ替えない。
 * 陰陽師: 百鬼夜行(73)→式神一括(71)のコンボと、特売(53)でのコスト圧縮。核が抜けるとコンボが組めず勝率が大きく落ちる（tune-top 陰陽師）。
 */
exports.CORE_CARDS = {
    yinYangMaster: [53, 71],
};
/**
 * 【ストレステスト専用。本番のAIデッキには使わない】推奨デッキ（主案か別案）をベースに、AI_DECK_SWAPS 枚をデッキ外のスキルとランダムに入れ替える。
 * 本番のAI席は pickRecommendedDeck（主案/別案の複数パターンからの選択のみ）を使い、カードをランダムに入れ替えない。
 * sim の頑健性確認（`probe-top.js --envDeck varied`）で「デッキが多少ずれても環境順位が崩れないか」を見るために残している。
 * 入れ替えで常に有効なデッキ（12枚・重複なし）になる。CORE_CARDS のカードは入れ替えない
 */
const variedAIDeck = (character, rng = Math.random, swaps = exports.AI_DECK_SWAPS) => {
    var _a;
    const deck = (0, exports.pickRecommendedDeck)(character, rng);
    const outside = exports.AVAILABLE_SKILL_IDX.filter((i) => !deck.includes(i));
    const core = (_a = exports.CORE_CARDS[character]) !== null && _a !== void 0 ? _a : [];
    const swappable = deck.map((_, i) => i).filter((i) => !core.includes(deck[i]));
    for (let k = 0; k < swaps && outside.length > 0 && swappable.length > 0; k++) {
        const at = swappable[Math.floor(rng() * swappable.length)];
        const incoming = outside.splice(Math.floor(rng() * outside.length), 1)[0];
        outside.push(deck[at]);
        deck[at] = incoming;
    }
    return deck.sort((a, b) => a - b);
};
exports.variedAIDeck = variedAIDeck;
/** カテゴリの表示名と並び順（デッキ編集画面のグループ見出し） */
exports.CATEGORY_ORDER = [
    { id: 'token', label: 'トークン' },
    { id: 'attack', label: '攻撃' },
    { id: 'control', label: '場の操作' },
    { id: 'support', label: '強化・補助' },
    { id: 'buds', label: 'バッズ' },
    { id: 'poison', label: '毒' },
    { id: 'charge', label: '帯電' },
    { id: 'ice', label: '氷結' },
    { id: 'fire', label: '火炎' },
    { id: 'shikigami', label: '式神' },
    { id: 'object', label: 'オブジェクト' },
    { id: 'basic', label: '基本' },
];
/**
 * ジャンルごとの説明(ツールチップ用)。エフェクトの意味はここにだけ書き、個々のスキル・キャラの説明には書かない。
 * 書式: 「<エフェクト名>: <意味>」を1〜2文で。数値などの細かい仕様は書かない。
 */
exports.CATEGORY_HELP = {
    basic: '基本の操作です。',
    token: 'トークン: 空きマスにコマを置きます。1ターンに1回だけ使えます。',
    attack: '攻撃: 敵のコマのライフを減らす・壊すスキルです。',
    support: '強化・補助: 自陣のコマを強くする、コストを下げるなどのスキルです。',
    control: '場の操作: ロックなどで盤面や相手の行動を縛ります。🔑ロック中のマスは、ライフが0でも奪われません。',
    buds: 'バッズ🌱: 付いたコマのライフが時間とともに増えます。🍂: 付いたコマの持ち主以外のスキルコストが上がります。',
    poison: '毒☠: 毒の付いたコマは時間とともにライフが減り、尽きると消えて周囲に広がります。',
    charge: '帯電⚡: 付いたコマは他のコマから触れられなくなります。周囲の敵に雷のダメージを与えることもあります。',
    ice: '氷結❄: 付いたコマはライフが減らなくなり、ダメージを肩代わりします。空きマスに付くとコマを置けません。',
    fire: '火炎🔥: 付いたコマは毎ターンダメージを受けます。',
    shikigami: '式神📜: 陰陽師の分身です。列には数えず、爆破などで使います。',
    object: 'オブジェクト: 空きマスに置く建造物です。列には数えず、手番開始時などに効果を発揮します。',
};
/** スキルの基礎コスト（キャラ補正・ギア補正の前の値） */
const baseCostOf = (idx) => skillCosts_1.skillCosts[(0, exports.skillOf)(idx).costKey];
exports.baseCostOf = baseCostOf;
/** ツールチップ用の1行説明: 「名前（基礎コストN）: 効果」 */
const describeSkill = (idx) => {
    const s = (0, exports.skillOf)(idx);
    return `${s.name}（基礎コスト${(0, exports.baseCostOf)(idx)}）: ${s.desc}`;
};
exports.describeSkill = describeSkill;
exports.SAVED_DECKS_KEY = 'ticatactoe.decks';
/** 保存できるデッキの最大数 */
exports.MAX_SAVED_DECKS = 20;
const NAME_MAX = 20;
const browserStorage = () => {
    try {
        return typeof window !== 'undefined' ? window.localStorage : undefined;
    }
    catch {
        return undefined; // プライベートウィンドウなどで例外になることがある
    }
};
/** 保存済みデッキを読む。読めない・壊れている場合は空（不正なデッキは捨てる） */
const loadSavedDecks = (storage = browserStorage()) => {
    try {
        const raw = storage === null || storage === void 0 ? void 0 : storage.getItem(exports.SAVED_DECKS_KEY);
        if (!raw)
            return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed))
            return [];
        return parsed
            .filter((d) => !!d && typeof d.name === 'string' && (0, exports.isValidDeck)(d.deck))
            .map((d) => ({ name: d.name.slice(0, NAME_MAX), deck: [...d.deck].sort((a, b) => a - b) }))
            .slice(0, exports.MAX_SAVED_DECKS);
    }
    catch {
        return [];
    }
};
exports.loadSavedDecks = loadSavedDecks;
const writeSavedDecks = (decks, storage) => {
    try {
        if (!storage)
            return false;
        storage.setItem(exports.SAVED_DECKS_KEY, JSON.stringify(decks));
        return true;
    }
    catch {
        return false;
    }
};
/**
 * デッキに名前をつけて保存する（同じ名前は上書き）。有効なデッキ・空でない名前のときだけ保存し、保存後の一覧を返す。
 * 保存できなかった（不正・満杯・書き込み失敗）ときは null
 */
const saveDeck = (name, deck, storage = browserStorage()) => {
    const trimmed = name.trim().slice(0, NAME_MAX);
    if (trimmed === '' || !(0, exports.isValidDeck)(deck))
        return null;
    const current = (0, exports.loadSavedDecks)(storage);
    const entry = { name: trimmed, deck: [...deck].sort((a, b) => a - b) };
    const at = current.findIndex((d) => d.name === trimmed);
    const next = at >= 0 ? current.map((d, i) => (i === at ? entry : d)) : [...current, entry];
    if (next.length > exports.MAX_SAVED_DECKS)
        return null;
    return writeSavedDecks(next, storage) ? next : null;
};
exports.saveDeck = saveDeck;
/** 保存済みデッキを削除して、削除後の一覧を返す（書き込めなければ現状のまま） */
const deleteSavedDeck = (name, storage = browserStorage()) => {
    const current = (0, exports.loadSavedDecks)(storage);
    const next = current.filter((d) => d.name !== name);
    return writeSavedDecks(next, storage) ? next : current;
};
exports.deleteSavedDeck = deleteSavedDeck;
