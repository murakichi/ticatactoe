// @ts-check
'use strict';
/*
 * デッキ: 手札の3枠を引く元になる、汎用スキルの組。src/components/game/deck.ts と同じ仕様（deck.test.ts が一致を確認する）。
 * キャラ固有スキルと常設スキル（チャージ・シャッフル・ロック、氷室の番人の氷結）はデッキに関係なく常に使える。
 */

/** デッキの枚数（同じスキルは1枚まで） */
const DECK_SIZE = 12;

/** 汎用スキルの一覧（添字 = 手札の idx） */
const SKILL_CATALOG = [
    { idx: 0, name: 'ライフ3', icon: '💚', category: 'support' },
    { idx: 1, name: 'バイバイン', icon: '✖️', category: 'support' },
    { idx: 2, name: 'バッズ', icon: '🌱', category: 'buds' },
    { idx: 3, name: 'トークン', icon: '🪙', category: 'token' },
    { idx: 4, name: '両トークン', icon: '🪙', category: 'token' },
    { idx: 5, name: 'スラッシュ', icon: '⚔️', category: 'attack' },
    { idx: 6, name: 'バックスラッシュ', icon: '🗡️', category: 'attack' },
    { idx: 7, name: 'チューチュートレイン', icon: '🚂', category: 'attack' },
    { idx: 8, name: 'オピウム', icon: '💨', category: 'attack' },
    { idx: 9, name: 'バッズトークン', icon: '🪙', category: 'token' },
    { idx: 10, name: 'ダブルバッズ', icon: '🌱', category: 'buds' },
    { idx: 11, name: 'ダブルトークン', icon: '🪙', category: 'token' },
    { idx: 12, name: 'ダブルロック', icon: '🔑', category: 'control' },
    { idx: 13, name: 'トリプルロック', icon: '🔑', category: 'control' },
    { idx: 14, name: 'ワルプルギスの夜', icon: '🌸', category: 'buds' },
    { idx: 15, name: 'インジェクション', icon: '💉', category: 'poison' },
    { idx: 16, name: 'ポイズントークン', icon: '🪙', category: 'poison' },
    { idx: 17, name: '血清', icon: '🧪', category: 'poison' },
    { idx: 18, name: '猛毒化', icon: '☠', category: 'poison' },
    { idx: 19, name: 'パンデミック', icon: '🦠', category: 'poison' },
    { idx: 20, name: '増殖', icon: '♾️', category: 'support' },
    { idx: 21, name: '帯電トークン', icon: '🪙', category: 'charge' },
    { idx: 22, name: '帯電付与', icon: '⚡', category: 'charge' },
    { idx: 23, name: '帯電ダブルトークン', icon: '🪙', category: 'charge' },
    { idx: 24, name: '範囲帯電', icon: '⚡', category: 'charge' },
    { idx: 25, name: 'ランダム帯電', icon: '⚡', category: 'charge' },
    { idx: 26, name: 'ジャマー', icon: '⚡', category: 'charge' },
    { idx: 27, name: 'ヘイルメアリー', icon: '🎲', category: 'support' },
    { idx: 28, name: 'サイレンス', icon: '🤫', category: 'control' },
    { idx: 29, name: '毒霧', icon: '🌫️', category: 'poison' },
    { idx: 30, name: '氷結', icon: '❄', category: 'ice' },
    { idx: 31, name: '火遁', icon: '🔥', category: 'fire' },
    { idx: 32, name: '浄化', icon: '✨', category: 'support' },
    { idx: 33, name: '刈り入れ前夜', icon: '🌾', category: 'buds' },
    { idx: 34, name: '冬至の種子', icon: '🌰', category: 'buds' },
    { idx: 35, name: 'ひこばえ', icon: '🌿', category: 'buds' },
    { idx: 36, name: '風の落とし子', icon: '🍃', category: 'buds' },
    { idx: 37, name: '火炎トークン', icon: '🪙', category: 'fire' },
    { idx: 38, name: '火炎ダブルトークン', icon: '🪙', category: 'fire' },
    { idx: 39, name: '焼畑', icon: '🌾', category: 'fire' },
    { idx: 40, name: '殉火', icon: '🕯️', category: 'fire' },
    { idx: 41, name: '範囲氷結', icon: '❄', category: 'ice' },
    { idx: 42, name: '氷柱', icon: '🧊', category: 'ice' },
    { idx: 43, name: 'ランダム氷結', icon: '🌨️', category: 'ice' },
    { idx: 44, name: '氷結拡散', icon: '❄', category: 'ice' },
    { idx: 45, name: '氷結トークン', icon: '🪙', category: 'ice' },
    { idx: 46, name: '氷結ダブルトークン', icon: '🪙', category: 'ice' },
    { idx: 47, name: '砕氷', icon: '🔨', category: 'ice' },
    { idx: 48, name: '霜降り', icon: '🌫️', category: 'ice' },
    { idx: 49, name: '慈雨', icon: '⬆️', category: 'support' },
    { idx: 50, name: '縮地', icon: '👣', category: 'support' },
    { idx: 51, name: '写し身', icon: '🪞', category: 'support' },
    { idx: 52, name: '追い剥ぎ', icon: '🏴‍☠️', category: 'attack' },
    { idx: 53, name: '特売', icon: '🏷️', category: 'support' },
    { idx: 54, name: '付与割引', icon: '🎫', category: 'support' },
    { idx: 55, name: 'トークン割引', icon: '🎟️', category: 'support' },
    { idx: 56, name: '活力特売', icon: '💖', category: 'support' },
    { idx: 57, name: '固有割引', icon: '👑', category: 'support' },
    { idx: 58, name: '大特価', icon: '💸', category: 'support' },
    { idx: 59, name: '福引き', icon: '🎰', category: 'support' },
    { idx: 60, name: '返し特売', icon: '↩️', category: 'support' },
    { idx: 61, name: 'バーンアウト', icon: '💥', category: 'fire' },
    { idx: 62, name: '木枯らしの使い', icon: '🍂', category: 'buds' },
    { idx: 63, name: '落葉松の双子', icon: '🍂', category: 'buds' },
    { idx: 64, name: '紅葉狩り', icon: '🍂', category: 'buds' },
    { idx: 65, name: '枯野の相席', icon: '🍂', category: 'buds' },
    { idx: 66, name: '焚き火の唄', icon: '🔥', category: 'buds' },
    { idx: 67, name: '腐葉土の目覚め', icon: '🌱', category: 'buds' },
    { idx: 68, name: '一葉知秋', icon: '🍂', category: 'buds' },
    { idx: 69, name: '霜枯れ', icon: '🥶', category: 'ice' },
    { idx: 70, name: '春一番', icon: '🌬️', category: 'ice' },
    { idx: 71, name: '式神一括', icon: '📜', category: 'shikigami' },
    { idx: 72, name: '式神ランダム設置', icon: '📜', category: 'shikigami' },
    { idx: 73, name: '百鬼夜行', icon: '📜', category: 'shikigami' },
    { idx: 74, name: '鬼門封じ', icon: '⛩️', category: 'control' },
    { idx: 75, name: '火の車', icon: '🛞', category: 'fire' },
    { idx: 76, name: '裸の王様', icon: '👑', category: 'control' },
    { idx: 77, name: '静電気の季節', icon: '🌩️', category: 'charge' },
    { idx: 78, name: '総毛立つ', icon: '⚡', category: 'charge' },
    { idx: 79, name: '落雷は忘れた頃に', icon: '💥', category: 'charge' },
    { idx: 80, name: '雷神のへそくり', icon: '💰', category: 'charge' },
    { idx: 81, name: '雷のない所に火は立たぬ', icon: '🌋', category: 'charge' },
    { idx: 82, name: '一寸先は闇鍋', icon: '🍲', category: 'control' },
    { idx: 83, name: '雷を食らわば皿まで', icon: '🍽️', category: 'charge' },
    { idx: 84, name: '落ち葉の置き土産', icon: '🍂', category: 'buds' },
    { idx: 85, name: '焚きつけ', icon: '🔥', category: 'buds' },
    { idx: 86, name: '落葉の衣', icon: '🍂', category: 'buds' },
    { idx: 87, name: '火口', icon: '🔥', category: 'fire' },
];


/** 汎用スキルの総数（手札の idx は 0..CATALOG_SIZE-1） */
const CATALOG_SIZE = SKILL_CATALOG.length;

/** キャラ別の推奨デッキ（12枚）。deck.ts の RECOMMENDED_DECKS と同じ */
const RECOMMENDED_DECKS = {
    you: [0, 2, 3, 5, 6, 8, 10, 11, 12, 14, 28, 32],
    tactician: [3, 4, 9, 11, 16, 21, 23, 37, 45, 46, 12, 28],
    magician: [2, 3, 4, 9, 10, 11, 12, 13, 35, 53, 56, 60],
    giant: [0, 1, 2, 3, 5, 6, 8, 11, 12, 13, 27, 28],
    yinYangMaster: [0, 2, 3, 5, 6, 8, 10, 12, 71, 72, 73, 53],
    necromancer: [0, 2, 3, 5, 6, 8, 11, 12, 32, 53, 57, 58],
    poisoner: [0, 12, 15, 16, 17, 18, 19, 29, 31, 45, 46, 48],
    electrician: [21, 22, 23, 24, 26, 28, 49, 50, 51, 52, 53, 58],
    cryomancer: [3, 8, 12, 28, 41, 42, 43, 44, 45, 46, 47, 48],
    pyromancer: [0, 3, 5, 8, 11, 12, 28, 31, 53, 56, 58, 87], // バーンアウト(61)はAIが撃たないので、火口(87)と入れ替え(tune-top #35)
    witch: [5, 8, 12, 28, 36, 44, 53, 56, 62, 63, 64, 85], // 🍂付きトークン3種で自陣に🍂を撒く。氷結拡散(44)・風の落とし子(36)。ライフ3(0)・トークン(3)は入れておくだけで悪化(AIが魔力を使う)。死に札の落葉の衣(86)を活力特売(56)に(79.3→82.7%, seed2/200)
    fighter: [0, 2, 3, 5, 6, 8, 11, 12, 14, 28, 32, 49],
    healer: [0, 2, 3, 8, 10, 12, 14, 28, 32, 34, 35, 49],
};

/** キャラの推奨デッキ（コピー） */
const recommendedDeck = (character) => [...(RECOMMENDED_DECKS[character] || RECOMMENDED_DECKS.you)];

/** 主案と同等に強い別案のデッキ。deck.ts の ALT_RECOMMENDED_DECKS の複製。sim の環境測定は主案(recommendedDeck)で行う */
const ALT_RECOMMENDED_DECKS = {};
/** AI席のベースにするデッキ。主案と別案を同じ確率で選ぶ（別案が無ければ主案で、乱数は使わない） */
const pickRecommendedDeck = (character, rng = Math.random) => {
    const alts = ALT_RECOMMENDED_DECKS[character] || [];
    if (alts.length === 0) return recommendedDeck(character);
    const patterns = [recommendedDeck(character), ...alts.map((d) => [...d])];
    return patterns[Math.floor(rng() * patterns.length)];
};

/** デッキとして有効か: 枚数がちょうど DECK_SIZE で、重複がなく、全て汎用スキルの idx */
const isValidDeck = (deck) =>
    !!deck && deck.length === DECK_SIZE && new Set(deck).size === DECK_SIZE && deck.every((i) => Number.isInteger(i) && i >= 0 && i < CATALOG_SIZE);

/** 席のデッキを決める: 有効な指定があればそれ（昇順に整える）、なければ推奨デッキ */
const resolveDeck = (deck, character) => (isValidDeck(deck) ? [...deck].sort((a, b) => a - b) : recommendedDeck(character));

/** ランダムなデッキ（rng は [0,1) を返す関数） */
function randomDeck(rng = Math.random) {
    const pool = Array.from({ length: CATALOG_SIZE }, (_, i) => i);
    const out = [];
    for (let k = 0; k < DECK_SIZE; k++) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
    return out.sort((a, b) => a - b);
}

/** AIが何も指定しないときのランダム入れ替えの枚数（推奨デッキの12枚中） */
const AI_DECK_SWAPS = 3;

/** AIのデッキ: 推奨デッキをベースに swaps 枚をデッキ外のスキルとランダムに入れ替える（rng 呼び出し順は deck.ts と同じ） */
/** キャラの勝ち筋になる核のカード。AIの入れ替えデッキでも入れ替えない（deck.ts の CORE_CARDS の複製） */
const CORE_CARDS = { yinYangMaster: [53, 71, 73] };

function variedAIDeck(character, rng = Math.random, swaps = AI_DECK_SWAPS) {
    const deck = pickRecommendedDeck(character, rng);
    const outside = Array.from({ length: CATALOG_SIZE }, (_, i) => i).filter((i) => !deck.includes(i));
    const core = CORE_CARDS[character] || [];
    const swappable = deck.map((_, i) => i).filter((i) => !core.includes(deck[i]));
    for (let k = 0; k < swaps && outside.length > 0 && swappable.length > 0; k++) {
        const at = swappable[Math.floor(rng() * swappable.length)];
        const incoming = outside.splice(Math.floor(rng() * outside.length), 1)[0];
        outside.push(deck[at]);
        deck[at] = incoming;
    }
    return deck.sort((a, b) => a - b);
}

module.exports = { CORE_CARDS, DECK_SIZE, CATALOG_SIZE, SKILL_CATALOG, RECOMMENDED_DECKS, ALT_RECOMMENDED_DECKS, AI_DECK_SWAPS, recommendedDeck, pickRecommendedDeck, isValidDeck, resolveDeck, randomDeck, variedAIDeck };
