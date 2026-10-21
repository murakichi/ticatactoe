import {
    DECK_SIZE,
    CATALOG_SIZE,
    SKILL_CATALOG,
    CATEGORY_ORDER,
    RECOMMENDED_DECKS,
    ALT_RECOMMENDED_DECKS,
    pickRecommendedDeck,
    MAX_SAVED_DECKS,
    SAVED_DECKS_KEY,
    recommendedDeck,
    isValidDeck,
    resolveDeck,
    randomDeck,
    variedAIDeck,
    AI_DECK_SWAPS,
    baseCostOf,
    describeSkill,
    loadSavedDecks,
    saveDeck,
    deleteSavedDeck,
    DeckStorage,
} from './deck';
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

    it('別案のデッキは有効で、pick は主案か別案のどれか。別案が無ければ乱数を使わない', () => {
        for (const c of Object.keys(ALT_RECOMMENDED_DECKS) as CharacterId[]) {
            const patterns = [recommendedDeck(c), ...(ALT_RECOMMENDED_DECKS[c] ?? [])];
            patterns.forEach((d) => expect(isValidDeck(d)).toBe(true));
            patterns.forEach((d, i) => expect(pickRecommendedDeck(c, () => (i + 0.5) / patterns.length)).toEqual(d));
        }
        const rng = jest.fn(() => 0.9);
        expect(pickRecommendedDeck('you', rng)).toEqual(recommendedDeck('you'));
        expect(rng).not.toHaveBeenCalled();
    });

    it('sim/deck.js の別案の複製と一致する', () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        expect(require('../../../sim/deck').ALT_RECOMMENDED_DECKS).toEqual(ALT_RECOMMENDED_DECKS);
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

describe('デッキ編集の表示データ', () => {
    it('全スキルに効果の説明と、skillCosts に実在するコストのキーがある', () => {
        SKILL_CATALOG.forEach((c) => {
            expect(c.desc.length).toBeGreaterThan(5);
            expect(skillCosts[c.costKey]).toBeGreaterThan(0);
        });
        expect(baseCostOf(3)).toBe(skillCosts.onClickToken);
        expect(describeSkill(3)).toContain('トークン（基礎コスト');
    });

    it('すべてのカテゴリが表示順に載っていて、カタログのスキルがどれかの見出しに入る', () => {
        const ids = CATEGORY_ORDER.map((c) => c.id);
        SKILL_CATALOG.forEach((c) => expect(ids).toContain(c.category));
    });
});

const fakeStorage = (): DeckStorage & { data: Record<string, string> } => {
    const data: Record<string, string> = {};
    return { data, getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => void (data[k] = v) };
};

describe('保存したデッキ', () => {
    it('保存→読み込み→上書き→削除。名前は前後の空白を除き、デッキは昇順で保存される', () => {
        const st = fakeStorage();
        expect(loadSavedDecks(st)).toEqual([]);
        const d1 = recommendedDeck('you').reverse();
        const saved = saveDeck('  速攻  ', d1, st);
        expect(saved).toEqual([{ name: '速攻', deck: [...d1].sort((a, b) => a - b) }]);
        expect(loadSavedDecks(st)).toEqual(saved);
        const d2 = recommendedDeck('poisoner');
        expect(saveDeck('速攻', d2, st)).toEqual([{ name: '速攻', deck: [...d2].sort((a, b) => a - b) }]); // 同名は上書き
        expect(saveDeck('毒', d1, st)).toHaveLength(2);
        expect(deleteSavedDeck('速攻', st).map((d) => d.name)).toEqual(['毒']);
        expect(loadSavedDecks(st).map((d) => d.name)).toEqual(['毒']);
    });

    it('不正なデッキ・空の名前は保存しない', () => {
        const st = fakeStorage();
        expect(saveDeck('x', [1, 2, 3], st)).toBeNull();
        expect(saveDeck('   ', recommendedDeck('you'), st)).toBeNull();
        expect(st.data[SAVED_DECKS_KEY]).toBeUndefined();
    });

    it('上限を超える保存はできない（既存名の上書きは可）', () => {
        const st = fakeStorage();
        for (let i = 0; i < MAX_SAVED_DECKS; i++) expect(saveDeck(`d${i}`, recommendedDeck('you'), st)).not.toBeNull();
        expect(saveDeck('overflow', recommendedDeck('you'), st)).toBeNull();
        expect(saveDeck('d0', recommendedDeck('giant'), st)).not.toBeNull();
    });

    it('壊れたデータ・不正なデッキ・書き込み失敗でも落ちない', () => {
        const st = fakeStorage();
        st.data[SAVED_DECKS_KEY] = '{broken';
        expect(loadSavedDecks(st)).toEqual([]);
        st.data[SAVED_DECKS_KEY] = JSON.stringify([{ name: 'ok', deck: recommendedDeck('you') }, { name: 'bad', deck: [1] }, 5]);
        expect(loadSavedDecks(st).map((d) => d.name)).toEqual(['ok']);
        const failing: DeckStorage = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
        expect(saveDeck('x', recommendedDeck('you'), failing)).toBeNull();
        expect(loadSavedDecks(undefined)).toEqual([]);
    });
});
