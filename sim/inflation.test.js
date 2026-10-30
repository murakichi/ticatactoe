'use strict';
const { summarize, referenceCost } = require('./inflation');

describe('inflation metrics', () => {
    test('referenceCost is the median of positive numeric costs', () => {
        expect(referenceCost({ a: 1, b: 3, c: 10, d: 0, e: 'x' })).toBe(3);
        expect(referenceCost({ a: 2, b: 4 })).toBe(3);
    });

    test('flat economy gives index 1 and spendRatio 1', () => {
        const rows = [];
        for (let t = 0; t < 200; t++) rows.push({ seat: 0, turn: t, start: 4, end: 0, income: 4, skills: 1 });
        const m = summarize([rows], 4);
        expect(m.inflationIndex).toBeCloseTo(1);
        expect(m.overall.spendRatio).toBeCloseTo(1);
        expect(m.overall.hoardRate).toBe(0);
    });

    test('growing unspent stock raises the index', () => {
        const rows = [];
        for (let t = 0; t < 200; t++) rows.push({ seat: 0, turn: t, start: 4 + t, end: 4 + t, income: 1 });
        const m = summarize([rows], 4);
        expect(m.inflationIndex).toBeGreaterThan(3);
        expect(m.overall.spendRatio).toBe(0);
    });

    test('matched index ignores a few long games that would dominate the pooled late bucket (survivorship)', () => {
        const games = [];
        // 短い試合30本: 手持ちは膨らまない(start=4, 毎手番使い切る)
        for (let g = 0; g < 30; g++) { const rows = []; for (let t = 0; t < 20; t++) rows.push({ seat: 0, turn: t, start: 4, end: 0, income: 4, skills: 1 }); games.push(rows); }
        // 長く膠着した試合4本: 手持ちが際限なく膨らむ（後半の各区間に40行 = 従来の総合指標が使う30行以上）
        for (let g = 0; g < 4; g++) { const rows = []; for (let t = 0; t < 200; t++) rows.push({ seat: 0, turn: t, start: 4 + t, end: 4 + t, income: 1, skills: 0 }); games.push(rows); }
        const m = summarize(games, 4, 10);
        expect(m.inflationIndex).toBeGreaterThan(5); // 従来: 少数の長い試合に引っぱられて大きく出る
        expect(m.matched.index === null || m.matched.index < 1.5).toBe(true); // matched: 後半に十分な試合が届かないので引っぱられない(null か ~1)
    });

    test('matched index compares the same games early vs late and reports a confidence interval', () => {
        const games = [];
        for (let g = 0; g < 40; g++) { const rows = []; for (let t = 0; t < 40; t++) rows.push({ seat: 0, turn: t, start: 4 + t * 0.5, end: 0 + t * 0.5, income: 4, skills: 1 }); games.push(rows); }
        const m = summarize(games, 4, 10).matched;
        expect(m.games).toBe(40);
        expect(m.index).toBeGreaterThan(1);
        expect(m.ci95[0]).toBeLessThanOrEqual(m.index);
        expect(m.ci95[1]).toBeGreaterThanOrEqual(m.index);
        expect(m.stockGrowth).toBeGreaterThan(1);
        expect(m.incomeGrowth).toBeCloseTo(1);
    });

    test('matched is null with a note when too few games reach a late bucket', () => {
        const rows = []; for (let t = 0; t < 12; t++) rows.push({ seat: 0, turn: t, start: 4, end: 0, income: 4, skills: 1 });
        const m = summarize([rows, rows], 4, 10).matched;
        expect(m.index).toBeNull();
        expect(typeof m.note).toBe('string');
    });
});
