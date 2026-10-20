import { DECK_SIZE, CATALOG_SIZE, SKILL_CATALOG, RECOMMENDED_DECKS, recommendedDeck, isValidDeck, resolveDeck, randomDeck, variedAIDeck, AI_DECK_SWAPS } from './deck';
import { CharacterId } from '../../types/Character';
import { skillCosts } from './skillCosts';
import { SKILL_POOL_SIZE } from './AIPlayer';

// 決定的な疑似乱数
const lcg = (seed: number) => () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
};

describe('デッキ', () => {
    it('カタログは idx 0..N-1 が連番で、プールの大きさ（AIPlayer の SKILL_POOL_SIZE）と一致する', () => {
        expect(SKILL_CATALOG.map((c) => c.idx)).toEqual(Array.from({ length: CATALOG_SIZE }, (_, i) => i));
        expect(CATALOG_SIZE).toBe(SKILL_POOL_SIZE);
        expect(new Set(SKILL_CATALOG.map((c) => c.name)).size).toBe(CATALOG_SIZE); // 名前に重複なし
    });

    it('全キャラの推奨デッキが有効（12枚・重複なし・範囲内）', () => {
        (Object.keys(RECOMMENDED_DECKS) as CharacterId[]).forEach((c) => expect(isValidDeck(RECOMMENDED_DECKS[c])).toBe(true));
    });

    it('推奨デッキはコピーを返す（書き換えても元に影響しない）', () => {
        const d = recommendedDeck('you');
        d.pop();
        expect(recommendedDeck('you')).toHaveLength(DECK_SIZE);
    });

    it('isValidDeck: 枚数違い・重複・範囲外・未指定は無効', () => {
        expect(isValidDeck(undefined)).toBe(false);
        expect(isValidDeck([1, 2, 3])).toBe(false);
        expect(isValidDeck([...recommendedDeck('you').slice(0, 11), recommendedDeck('you')[0]])).toBe(false);
        expect(isValidDeck([...recommendedDeck('you').slice(0, 11), CATALOG_SIZE])).toBe(false);
    });

    it('resolveDeck: 有効な指定は昇順に整えて採用、無効・未指定は推奨デッキ', () => {
        const d = recommendedDeck('magician').reverse();
        expect(resolveDeck(d, 'you')).toEqual([...d].sort((a, b) => a - b));
        expect(resolveDeck([1, 2], 'poisoner')).toEqual(recommendedDeck('poisoner'));
        expect(resolveDeck(undefined, 'poisoner')).toEqual(recommendedDeck('poisoner'));
    });

    it('randomDeck は常に有効なデッキ', () => {
        for (let s = 1; s <= 30; s++) expect(isValidDeck(randomDeck(lcg(s)))).toBe(true);
    });

    it('variedAIDeck: 推奨ベースで AI_DECK_SWAPS 枚前後だけ入れ替わり、常に有効。乱数で顔ぶれが変わる', () => {
        const base = recommendedDeck('electrician');
        const seen = new Set<string>();
        for (let s = 1; s <= 40; s++) {
            const d = variedAIDeck('electrician', lcg(s));
            expect(isValidDeck(d)).toBe(true);
            const kept = d.filter((x) => base.includes(x)).length;
            expect(kept).toBeGreaterThanOrEqual(DECK_SIZE - AI_DECK_SWAPS);
            seen.add(d.join(','));
        }
        expect(seen.size).toBeGreaterThan(5);
        expect(variedAIDeck('you', lcg(1), 0)).toEqual(recommendedDeck('you')); // 入れ替え0なら推奨そのまま
    });

    it('すべての汎用スキルにコストが定義されている（デッキに入れて撃てる）', () => {
        expect(Object.keys(skillCosts).length).toBeGreaterThan(CATALOG_SIZE);
    });
});
