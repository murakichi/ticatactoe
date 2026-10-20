// デッキ: 手札の3枠を引く元になる、汎用スキルの組。キャラ固有スキルと常設スキル（チャージ・シャッフル・ロック、
// 氷室の番人の氷結）はデッキに関係なく常に使える。sim/deck.js と同じ仕様（deck.test.ts が一致を確認する）。
import { CharacterId } from '../../types/Character';

/** デッキの枚数（同じスキルは1枚まで） */
export const DECK_SIZE = 12;

export type SkillCategory = 'basic' | 'token' | 'attack' | 'support' | 'control' | 'poison' | 'buds' | 'charge' | 'ice' | 'fire';

export type CatalogEntry = { idx: number; name: string; icon: string; category: SkillCategory };

/** 汎用スキルの一覧（添字 = 手札の idx。Game.tsx の shuffleSkillDefs / AIPlayer.ts の SKILL_POOL_SIZE と同じ並び） */
export const SKILL_CATALOG: CatalogEntry[] = [
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
    magician: [2, 3, 8, 10, 12, 13, 14, 28, 33, 34, 35, 36],
    giant: [0, 1, 2, 3, 5, 6, 8, 11, 12, 13, 27, 28],
    yinYangMaster: [0, 2, 3, 5, 6, 8, 10, 12, 14, 27, 28, 32],
    necromancer: [0, 2, 3, 5, 6, 8, 11, 12, 13, 27, 28, 32],
    poisoner: [0, 3, 8, 12, 15, 16, 17, 18, 19, 28, 29, 32],
    electrician: [0, 3, 8, 12, 21, 22, 23, 24, 25, 26, 28, 32],
    cryomancer: [3, 8, 12, 28, 41, 42, 43, 44, 45, 46, 47, 48],
    pyromancer: [0, 3, 5, 8, 12, 28, 31, 32, 37, 38, 39, 40],
    fighter: [0, 2, 3, 5, 6, 8, 11, 12, 14, 28, 32, 49],
    healer: [0, 2, 3, 8, 10, 12, 14, 28, 32, 34, 35, 49],
};

/** キャラの推奨デッキ（コピー） */
export const recommendedDeck = (character: CharacterId): number[] => [...(RECOMMENDED_DECKS[character] ?? RECOMMENDED_DECKS.you)];

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
 * AIのデッキ: キャラの推奨デッキをベースに、AI_DECK_SWAPS 枚をデッキ外のスキルとランダムに入れ替える（毎試合少し違う顔ぶれになる）。
 * 入れ替えで常に有効なデッキ（12枚・重複なし）になる
 */
export const variedAIDeck = (character: CharacterId, rng: () => number = Math.random, swaps: number = AI_DECK_SWAPS): number[] => {
    const deck = recommendedDeck(character);
    const outside = Array.from({ length: CATALOG_SIZE }, (_, i) => i).filter((i) => !deck.includes(i));
    for (let k = 0; k < swaps && outside.length > 0; k++) {
        const at = Math.floor(rng() * deck.length);
        const incoming = outside.splice(Math.floor(rng() * outside.length), 1)[0];
        outside.push(deck[at]);
        deck[at] = incoming;
    }
    return deck.sort((a, b) => a - b);
};
