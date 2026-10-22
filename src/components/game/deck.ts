// デッキ: 手札の3枠を引く元になる、汎用スキルの組。キャラ固有スキルと常設スキル（チャージ・シャッフル・ロック、
// 氷室の番人の氷結）はデッキに関係なく常に使える。sim/deck.js と同じ仕様（deck.test.ts が一致を確認する）。
import { CharacterId } from '../../types/Character';
import { skillCosts, SkillCosts } from './skillCosts';

/** デッキの枚数（同じスキルは1枚まで） */
export const DECK_SIZE = 12;

export type SkillCategory = 'basic' | 'token' | 'attack' | 'support' | 'control' | 'poison' | 'buds' | 'charge' | 'ice' | 'fire' | 'shikigami';

export type CatalogEntry = {
    idx: number;
    name: string;
    icon: string;
    category: SkillCategory;
    /** skillCosts のキー（基礎コストの出典） */
    costKey: keyof SkillCosts;
    /** 効果の短い説明（デッキ編集画面の表示用） */
    desc: string;
};

/** 汎用スキルの一覧（添字 = 手札の idx。Game.tsx の shuffleSkillDefs / AIPlayer.ts の SKILL_POOL_SIZE と同じ並び） */
export const SKILL_CATALOG: CatalogEntry[] = [
    { idx: 0, name: 'ライフ3', icon: '💚', category: 'support', costKey: 'onClickAddLife', desc: 'ライフを3追加します' },
    { idx: 1, name: 'バイバイン', icon: '✖️', category: 'support', costKey: 'onClickBibine', desc: 'ライフが倍になります' },
    { idx: 2, name: 'バッズ', icon: '🌱', category: 'buds', costKey: 'onClickBuds', desc: '次の一手でバッズを植えます' },
    { idx: 3, name: 'トークン', icon: '🪙', category: 'token', costKey: 'onClickToken', desc: '空きマスにランダムでコマを置きます（ターン1回）' },
    { idx: 4, name: '両トークン', icon: '🪙', category: 'token', costKey: 'onClickBothToken', desc: '空きマスに全プレイヤーのコマを1つずつ置きます（ターン1回）' },
    { idx: 5, name: 'スラッシュ', icon: '⚔️', category: 'attack', costKey: 'onClickSlash', desc: '右上から左下の斜めのマスのライフを0にします' },
    { idx: 6, name: 'バックスラッシュ', icon: '🗡️', category: 'attack', costKey: 'onClickBackSlash', desc: '左上から右下の斜めのマスのライフを0にします' },
    { idx: 7, name: 'チューチュートレイン', icon: '🚂', category: 'attack', costKey: 'onClickTsunami', desc: '相手全員のマジックを0にします' },
    { idx: 8, name: 'オピウム', icon: '💨', category: 'attack', costKey: 'onClickOpium', desc: '相手の駒全てのライフを-2し、ターンを終了します' },
    { idx: 9, name: 'バッズトークン', icon: '🪙', category: 'token', costKey: 'onClickBudsToken', desc: 'バッズ付き・ライフ3のコマをランダムに設置します（ターン1回）' },
    { idx: 10, name: 'ダブルバッズ', icon: '🌱', category: 'buds', costKey: 'onClickDoubleBuds', desc: '次の一手でバッズを2つ植えます' },
    { idx: 11, name: 'ダブルトークン', icon: '🪙', category: 'token', costKey: 'onClickDoubleToken', desc: '空きマスにランダムでコマを2つ置きます（ターン1回）' },
    { idx: 12, name: 'ダブルロック', icon: '🔑', category: 'control', costKey: 'onClickDoubleLock', desc: 'マスを2つ選んでロックします' },
    { idx: 13, name: 'トリプルロック', icon: '🔑', category: 'control', costKey: 'onClickTripleLock', desc: 'マスを3つ選んでロックします' },
    { idx: 14, name: 'ワルプルギスの夜', icon: '🌸', category: 'buds', costKey: 'onClickWalpurgisNight', desc: '全コマにバッズを植えます' },
    { idx: 15, name: 'インジェクション', icon: '💉', category: 'poison', costKey: 'onClickInjection', desc: 'マスを選び、毒を1付与します' },
    { idx: 16, name: 'ポイズントークン', icon: '🪙', category: 'poison', costKey: 'onClickPoisonToken', desc: '毒付きの自陣コマをランダムに設置します（ターン1回）' },
    { idx: 17, name: '血清', icon: '🧪', category: 'poison', costKey: 'onClickSerum', desc: '自陣のコマの毒をすべて除去します' },
    { idx: 18, name: '猛毒化', icon: '☠', category: 'poison', costKey: 'onClickIntensify', desc: '毒が付いている全マスの毒の数を倍にします' },
    { idx: 19, name: 'パンデミック', icon: '🦠', category: 'poison', costKey: 'onClickPandemic', desc: 'マスと周囲8マスのコマに毒を1付与します' },
    { idx: 20, name: '増殖', icon: '♾️', category: 'support', costKey: 'onClickProliferate', desc: '着手のたびにコマとアイテムを交互に追加し続けます（維持コストが増える）' },
    { idx: 21, name: '帯電トークン', icon: '🪙', category: 'charge', costKey: 'onClickChargeToken', desc: '⚡付きの自陣コマをランダムに設置します（ターン1回）' },
    { idx: 22, name: '帯電付与', icon: '⚡', category: 'charge', costKey: 'onClickChargeOne', desc: 'マスを選んで⚡を1つ付与します（⚡の数だけ安くなる）' },
    { idx: 23, name: '帯電ダブルトークン', icon: '🪙', category: 'charge', costKey: 'onClickDoubleChargeToken', desc: '⚡付きの自陣コマをランダムに2つ設置します（ターン1回）' },
    { idx: 24, name: '範囲帯電', icon: '⚡', category: 'charge', costKey: 'onClickChargeArea', desc: 'マスと周囲8マスに⚡を付与します' },
    { idx: 25, name: 'ランダム帯電', icon: '⚡', category: 'charge', costKey: 'onClickChargeRandom', desc: 'ランダムな1〜4マスに⚡を付与します' },
    { idx: 26, name: 'ジャマー', icon: '⚡', category: 'charge', costKey: 'onClickJammer', desc: '⚡のマスを選び、縦横隣の敵コマに⚡の数だけダメージを与えて⚡を取り除きます' },
    { idx: 27, name: 'ヘイルメアリー', icon: '🎲', category: 'support', costKey: 'onClickHailMary', desc: '固有スキル（陰陽転化を除く）をランダムに1つ、追加コストなしで発動します' },
    { idx: 28, name: 'サイレンス', icon: '🤫', category: 'control', costKey: 'onClickSilence', desc: '相手全員が次の手番、スキルを使えなくなります' },
    { idx: 29, name: '毒霧', icon: '🌫️', category: 'poison', costKey: 'onClickPoisonMist', desc: '盤上の全コマ（敵味方問わず）に毒を1付与します' },
    { idx: 30, name: '氷結', icon: '❄', category: 'ice', costKey: 'onClickFreeze', desc: 'コマや空きマスを選んで❄を1つ付与します' },
    { idx: 31, name: '火遁', icon: '🔥', category: 'fire', costKey: 'onClickIgnite', desc: 'コマを選んで🔥を1つ付与します（氷結中なら氷結が全解除）' },
    { idx: 32, name: '浄化', icon: '✨', category: 'support', costKey: 'onClickCleanse', desc: '自陣のコマの状態異常（毒・火炎・氷結・帯電）をすべて回復します' },
    { idx: 33, name: '刈り入れ前夜', icon: '🌾', category: 'buds', costKey: 'onClickHarvestEve', desc: '自陣の🌱をすべて刈り取り、刈った数だけ魔力を得ます' },
    { idx: 34, name: '冬至の種子', icon: '🌰', category: 'buds', costKey: 'onClickSolstice', desc: '次の自分の手番まで、自陣の🌱が氷結・火炎中のマスでも働きます' },
    { idx: 35, name: 'ひこばえ', icon: '🌿', category: 'buds', costKey: 'onClickSucker', desc: '🌱を持つ自陣のコマの縦横隣の自陣コマに🌱を付けます（隣が3つ以上ならランダムに2つ）' },
    { idx: 36, name: '風の落とし子', icon: '🍃', category: 'buds', costKey: 'onClickWindborne', desc: '自陣のコマにランダムで🌱を3つ配ります' },
    { idx: 37, name: '火炎トークン', icon: '🪙', category: 'fire', costKey: 'onClickFlameToken', desc: '🔥付きの自陣コマをランダムに設置します（ターン1回）' },
    { idx: 38, name: '火炎ダブルトークン', icon: '🪙', category: 'fire', costKey: 'onClickDoubleFlameToken', desc: '🔥付きの自陣コマをランダムに2つ設置します（ターン1回）' },
    { idx: 39, name: '焼畑', icon: '🌾', category: 'fire', costKey: 'onClickSwidden', desc: '🌱のあるマスを選び、🌱を全て同じ数の🔥に変えます' },
    { idx: 40, name: '殉火', icon: '🕯️', category: 'fire', costKey: 'onClickSacrifice', desc: '自陣のコマを犠牲にし、そのライフ以下の敵コマ全てに🔥を付与します' },
    { idx: 41, name: '範囲氷結', icon: '❄', category: 'ice', costKey: 'onClickFrostArea', desc: 'マスと周囲8マスに❄を付与します' },
    { idx: 42, name: '氷柱', icon: '🧊', category: 'ice', costKey: 'onClickIcicle', desc: 'マスと方向（横・縦・斜め）を選び、その線上のマスに❄を付与します' },
    { idx: 43, name: 'ランダム氷結', icon: '🌨️', category: 'ice', costKey: 'onClickRandomFreeze', desc: 'ランダムな1〜4マスに❄を付与します' },
    { idx: 44, name: '氷結拡散', icon: '❄', category: 'ice', costKey: 'onClickFreezeSpread', desc: 'コマを選び、そこから繋がる全コマに❄を付与します' },
    { idx: 45, name: '氷結トークン', icon: '🪙', category: 'ice', costKey: 'onClickFrostToken', desc: '❄付きの自陣コマをランダムに設置します（ターン1回）' },
    { idx: 46, name: '氷結ダブルトークン', icon: '🪙', category: 'ice', costKey: 'onClickDoubleFrostToken', desc: '❄付きの自陣コマをランダムに2つ設置します（ターン1回）' },
    { idx: 47, name: '砕氷', icon: '🔨', category: 'ice', costKey: 'onClickShatter', desc: '氷結中のコマの❄を砕き、❄1つにつき3ダメージを与えます' },
    { idx: 48, name: '霜降り', icon: '🌫️', category: 'ice', costKey: 'onClickFrostfall', desc: '自陣のライフ2以下のコマすべてに❄を付与します' },
    { idx: 49, name: '慈雨', icon: '⬆️', category: 'support', costKey: 'onClickBoost', desc: '自陣の全コマのライフを+1します' },
    { idx: 50, name: '縮地', icon: '👣', category: 'support', costKey: 'onClickRelocate', desc: '自陣のコマを空きマスへ移動します（エフェクトごと）' },
    { idx: 51, name: '写し身', icon: '🪞', category: 'support', costKey: 'onClickClone', desc: '自陣のコマの隣の空きマスに、ライフ半分の写しを置きます' },
    { idx: 52, name: '追い剥ぎ', icon: '🏴‍☠️', category: 'attack', costKey: 'onClickPlunder', desc: 'ライフ0の敵コマを1つ、自陣のコマ（ライフ1）にします' },
    { idx: 53, name: '特売', icon: '🏷️', category: 'support', costKey: 'onClickMarkdown', desc: '次に打つスキルのコストを3軽減します（軽減後は最低1。この手番の間だけ有効）' },
    { idx: 54, name: '付与割引', icon: '🎫', category: 'support', costKey: 'onClickEffectDiscount', desc: 'このターン、エフェクト（🌱⚡☠❄🔥）を付与するスキルのコストを、打つたびに1軽減します' },
    { idx: 55, name: 'トークン割引', icon: '🎟️', category: 'support', costKey: 'onClickTokenDiscount', desc: 'このターン、トークンを付与するスキルのコストを、打つたびに1軽減します' },
    { idx: 56, name: '活力特売', icon: '💖', category: 'support', costKey: 'onClickVitalMarkdown', desc: '次に打つスキルのコストを4軽減し、次の一手のライフを+1します' },
    { idx: 57, name: '固有割引', icon: '👑', category: 'support', costKey: 'onClickUniqueDiscount', desc: 'このターン、固有スキルのコストを6軽減します。1ターンに一度のみ・ライフ-1（ライフ2以上で使用可）' },
    { idx: 58, name: '大特価', icon: '💸', category: 'support', costKey: 'onClickClearance', desc: '次に打つスキルのコストを7軽減します（軽減後は最低1。この手番の間だけ有効）' },
    { idx: 59, name: '福引き', icon: '🎰', category: 'support', costKey: 'onClickRandomCast', desc: '自分のデッキ（12枚）の中から、基礎コスト3以下のスキルをランダムに1つ、コストを払わずに発動します（手札に出ていないスキルも対象）' },
    { idx: 60, name: '返し特売', icon: '↩️', category: 'support', costKey: 'onClickCounterMarkdown', desc: '次に打つスキルのコストを3軽減し、次の一手のライフを+1します。直前の相手の手番に相手がスキルを使っていれば、コスト0で使えます' },
    { idx: 61, name: 'バーンアウト', icon: '💥', category: 'fire', costKey: 'onClickBurnout', desc: '🔥が乗っているマスを全て破壊します（敵味方問わず。雷霆の巫の⚡無敵コマを除く）。盤面に🔥が4つ以上あればコスト0で使えます' },
    { idx: 62, name: '木枯らしの使い', icon: '🍂', category: 'buds', costKey: 'onClickLeafToken', desc: '🍂付きの自陣コマをランダムに設置します（ターン1回）。自陣の🍂は相手全員のスキルコストを🍂の数だけ増やします' },
    { idx: 63, name: '落葉松の双子', icon: '🍂', category: 'buds', costKey: 'onClickTwinLeafToken', desc: '🍂が2枚付いた自陣コマをランダムに設置します（ターン1回）' },
    { idx: 64, name: '紅葉狩り', icon: '🍂', category: 'buds', costKey: 'onClickDoubleLeafToken', desc: '🍂付きの自陣コマをランダムに2つ設置します（ターン1回）' },
    { idx: 65, name: '枯野の相席', icon: '🍂', category: 'buds', costKey: 'onClickBothLeafToken', desc: '空きマスに全プレイヤーのコマを1つずつ置きます。🍂が付くのは自分のコマだけ（ターン1回）' },
    { idx: 66, name: '焚き火の唄', icon: '🔥', category: 'buds', costKey: 'onClickBonfire', desc: '敵陣の🍂をすべて取り除きます（🔑ロックと❄氷結のマスは対象外）' },
    { idx: 67, name: '腐葉土の目覚め', icon: '🌱', category: 'buds', costKey: 'onClickMulch', desc: '自陣のランダムな🍂を1枚、🌱に変えます' },
    { idx: 68, name: '一葉知秋', icon: '🍂', category: 'buds', costKey: 'onClickAutumn', desc: '盤面のすべての🌱を🍂に変えます（敵味方問わず。🔥が付いたマスは変わりません）' },
    { idx: 69, name: '霜枯れ', icon: '🥶', category: 'ice', costKey: 'onClickLeafFrost', desc: '自陣の🍂を持つコマすべてに❄を付けます（氷結中は🍂が休眠します）' },
    { idx: 70, name: '春一番', icon: '🌬️', category: 'ice', costKey: 'onClickSpringWind', desc: '自陣の❄をすべて解除し、解除した数だけこのターンに打つスキルのコストを軽減します（軽減後は最低1）' },
    { idx: 71, name: '式神一括', icon: '📜', category: 'shikigami', costKey: 'onClickShikigamiAll', desc: '自分の式神を全て通常の自陣のコマにします（列に数えられるようになります）。コストは式神1体につき4です' },
    { idx: 72, name: '式神ランダム設置', icon: '📜', category: 'shikigami', costKey: 'onClickShikigamiRandom', desc: '式神をランダムな空きマスに置きます（トークン扱い・ターン1回）' },
    { idx: 73, name: '百鬼夜行', icon: '📜', category: 'shikigami', costKey: 'onClickShikigamiFlood', desc: '着手できる全ての空きマスに、ライフ0の式神を置きます' },
    { idx: 74, name: '鬼門封じ', icon: '⛩️', category: 'control', costKey: 'onClickKimon', desc: '敵のコマを1つ選んで破壊します（氷結中は❄が1つ減るだけ）。破壊して空きマスになったら3ターンロックします' },
    { idx: 75, name: '火の車', icon: '🛞', category: 'fire', costKey: 'onClickFireWheel', desc: 'ランダムな敵のコマ2つに🔥を1つずつ付け、その後手札をシャッフルします。このターン敵か自陣に🔥を付与していればコスト0（使うとリセット）' },
];

/** 汎用スキルの総数（手札の idx は 0..CATALOG_SIZE-1）。AIPlayer.ts の SKILL_POOL_SIZE と同値 */
export const CATALOG_SIZE = SKILL_CATALOG.length;

/**
 * キャラ別の推奨デッキ（12枚）。AIが何も指定しないときに使う（人間も未指定なら同じ）。
 * 核は「AIが使いこなせて、どのキャラにも腐らない」汎用スキル（トークン・ライフ・スラッシュ・オピウム・ロック・サイレンス）。
 * 残りをキャラの得意（バッズ・毒・帯電・氷結・火炎・トークン）に振っている。
 * 初版は手組み。強制使用A/Bの結果（docs/diary/2026-10-20.md）に合わせて見直していく。
 */
export const RECOMMENDED_DECKS: Record<CharacterId, number[]> = {
    you: [0, 2, 3, 5, 6, 8, 10, 11, 12, 14, 28, 32],
    tactician: [3, 4, 9, 11, 16, 21, 23, 37, 45, 46, 12, 28],
    magician: [2, 3, 4, 9, 10, 11, 12, 13, 35, 53, 56, 60],
    giant: [0, 1, 2, 3, 5, 6, 8, 11, 12, 13, 27, 28],
    yinYangMaster: [0, 2, 3, 5, 6, 8, 10, 12, 71, 72, 73, 53],
    necromancer: [0, 2, 3, 5, 6, 8, 11, 12, 32, 53, 57, 58],
    poisoner: [0, 12, 15, 16, 17, 18, 19, 29, 39, 45, 46, 48],
    electrician: [21, 22, 23, 24, 26, 28, 49, 50, 51, 52, 53, 58],
    cryomancer: [3, 8, 12, 28, 41, 42, 43, 44, 45, 46, 47, 48],
    pyromancer: [0, 3, 5, 8, 11, 12, 28, 31, 53, 56, 58, 61],
    fighter: [0, 2, 3, 5, 6, 8, 11, 12, 14, 28, 32, 49],
    healer: [0, 2, 3, 8, 10, 12, 14, 28, 32, 34, 35, 49],
};

/** キャラの推奨デッキ（コピー） */
export const recommendedDeck = (character: CharacterId): number[] => [...(RECOMMENDED_DECKS[character] ?? RECOMMENDED_DECKS.you)];

/**
 * 主案(RECOMMENDED_DECKS)と同等に強い別案のデッキ。あるキャラだけ書く。AI席は主案と別案からランダムに選ぶ（pickRecommendedDeck）。
 * sim の環境測定は主案だけで行う（再現性のため）。別案は主案と同程度の環境勝率であることを確かめたものだけ入れる（docs/tune/<char>.md）。
 */
export const ALT_RECOMMENDED_DECKS: Partial<Record<CharacterId, number[][]>> = {};

/** AI席のベースにするデッキ。主案と別案を同じ確率で選ぶ（別案が無ければ主案で、乱数は使わない） */
export const pickRecommendedDeck = (character: CharacterId, rng: () => number = Math.random): number[] => {
    const alts = ALT_RECOMMENDED_DECKS[character] ?? [];
    if (alts.length === 0) return recommendedDeck(character);
    const patterns = [recommendedDeck(character), ...alts.map((d) => [...d])];
    return patterns[Math.floor(rng() * patterns.length)];
};

/** デッキとして有効か: 枚数がちょうど DECK_SIZE で、重複がなく、全て汎用スキルの idx */
export const isValidDeck = (deck: readonly number[] | undefined): boolean =>
    !!deck && deck.length === DECK_SIZE && new Set(deck).size === DECK_SIZE && deck.every((i) => Number.isInteger(i) && i >= 0 && i < CATALOG_SIZE);

/** 席のデッキを決める: 有効な指定があればそれ（昇順に整える）、なければ推奨デッキ */
export const resolveDeck = (deck: readonly number[] | undefined, character: CharacterId): number[] =>
    isValidDeck(deck) ? [...(deck as number[])].sort((a, b) => a - b) : recommendedDeck(character);

/** ランダムなデッキ（rng は [0,1) を返す関数） */
export const randomDeck = (rng: () => number = Math.random): number[] => {
    const pool = Array.from({ length: CATALOG_SIZE }, (_, i) => i);
    const out: number[] = [];
    for (let k = 0; k < DECK_SIZE; k++) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
    return out.sort((a, b) => a - b);
};

/** AIが何も指定しないときのランダム入れ替えの枚数（推奨デッキの12枚中） */
export const AI_DECK_SWAPS = 3;

/**
 * キャラの勝ち筋になる「核のカード」。AIの入れ替えデッキ（variedAIDeck）でも入れ替えない。
 * 陰陽師: 百鬼夜行(73)→式神一括(71)のコンボと、特売(53)でのコスト圧縮。核が抜けるとコンボが組めず勝率が大きく落ちる（tune-top 陰陽師）。
 */
export const CORE_CARDS: Partial<Record<CharacterId, number[]>> = {
    yinYangMaster: [53, 71, 73],
};

/**
 * AIのデッキ: キャラの推奨デッキ（主案か別案）をベースに、AI_DECK_SWAPS 枚をデッキ外のスキルとランダムに入れ替える（毎試合少し違う顔ぶれになる）。
 * 入れ替えで常に有効なデッキ（12枚・重複なし）になる。CORE_CARDS のカードは入れ替えない
 */
export const variedAIDeck = (character: CharacterId, rng: () => number = Math.random, swaps: number = AI_DECK_SWAPS): number[] => {
    const deck = pickRecommendedDeck(character, rng);
    const outside = Array.from({ length: CATALOG_SIZE }, (_, i) => i).filter((i) => !deck.includes(i));
    const core = CORE_CARDS[character] ?? [];
    const swappable = deck.map((_, i) => i).filter((i) => !core.includes(deck[i]));
    for (let k = 0; k < swaps && outside.length > 0 && swappable.length > 0; k++) {
        const at = swappable[Math.floor(rng() * swappable.length)];
        const incoming = outside.splice(Math.floor(rng() * outside.length), 1)[0];
        outside.push(deck[at]);
        deck[at] = incoming;
    }
    return deck.sort((a, b) => a - b);
};

/** カテゴリの表示名と並び順（デッキ編集画面のグループ見出し） */
export const CATEGORY_ORDER: { id: SkillCategory; label: string }[] = [
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
    { id: 'basic', label: '基本' },
];

/** スキルの基礎コスト（キャラ補正・ギア補正の前の値） */
export const baseCostOf = (idx: number): number => skillCosts[SKILL_CATALOG[idx].costKey];

/** ツールチップ用の1行説明: 「名前（基礎コストN）: 効果」 */
export const describeSkill = (idx: number): string => `${SKILL_CATALOG[idx].name}（基礎コスト${baseCostOf(idx)}）: ${SKILL_CATALOG[idx].desc}`;

// ---- 保存したデッキ（ブラウザの localStorage） ----

export type SavedDeck = { name: string; deck: number[] };

/** localStorage の最小インターフェース（テストでは差し替える） */
export type DeckStorage = Pick<Storage, 'getItem' | 'setItem'>;

export const SAVED_DECKS_KEY = 'ticatactoe.decks';
/** 保存できるデッキの最大数 */
export const MAX_SAVED_DECKS = 20;
const NAME_MAX = 20;

const browserStorage = (): DeckStorage | undefined => {
    try {
        return typeof window !== 'undefined' ? window.localStorage : undefined;
    } catch {
        return undefined; // プライベートウィンドウなどで例外になることがある
    }
};

/** 保存済みデッキを読む。読めない・壊れている場合は空（不正なデッキは捨てる） */
export const loadSavedDecks = (storage: DeckStorage | undefined = browserStorage()): SavedDeck[] => {
    try {
        const raw = storage?.getItem(SAVED_DECKS_KEY);
        if (!raw) return [];
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed
            .filter((d): d is SavedDeck => !!d && typeof d.name === 'string' && isValidDeck(d.deck))
            .map((d) => ({ name: d.name.slice(0, NAME_MAX), deck: [...d.deck].sort((a, b) => a - b) }))
            .slice(0, MAX_SAVED_DECKS);
    } catch {
        return [];
    }
};

const writeSavedDecks = (decks: SavedDeck[], storage: DeckStorage | undefined): boolean => {
    try {
        if (!storage) return false;
        storage.setItem(SAVED_DECKS_KEY, JSON.stringify(decks));
        return true;
    } catch {
        return false;
    }
};

/**
 * デッキに名前をつけて保存する（同じ名前は上書き）。有効なデッキ・空でない名前のときだけ保存し、保存後の一覧を返す。
 * 保存できなかった（不正・満杯・書き込み失敗）ときは null
 */
export const saveDeck = (name: string, deck: readonly number[], storage: DeckStorage | undefined = browserStorage()): SavedDeck[] | null => {
    const trimmed = name.trim().slice(0, NAME_MAX);
    if (trimmed === '' || !isValidDeck(deck)) return null;
    const current = loadSavedDecks(storage);
    const entry: SavedDeck = { name: trimmed, deck: [...deck].sort((a, b) => a - b) };
    const at = current.findIndex((d) => d.name === trimmed);
    const next = at >= 0 ? current.map((d, i) => (i === at ? entry : d)) : [...current, entry];
    if (next.length > MAX_SAVED_DECKS) return null;
    return writeSavedDecks(next, storage) ? next : null;
};

/** 保存済みデッキを削除して、削除後の一覧を返す（書き込めなければ現状のまま） */
export const deleteSavedDeck = (name: string, storage: DeckStorage | undefined = browserStorage()): SavedDeck[] => {
    const current = loadSavedDecks(storage);
    const next = current.filter((d) => d.name !== name);
    return writeSavedDecks(next, storage) ? next : current;
};
