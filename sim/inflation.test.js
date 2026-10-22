'use strict';
const { summarize, referenceCost } = require('./inflation');

describe('inflation metrics', () => {
    test('referenceCost is the median of positive numeric costs', () => {
        expect(referenceCost({ a: 1, b: 3, c: 10, d: 0, e: 'x' })).toBe(3);
        expect(referenceCost({ a: 2, b: 4 })).toBe(3);
    });

    test('flat economy gives index 1 and spendRatio 1', () => {
        const rows = [];
        for (let t = 0; t < 200; t++) rows.push({ seat: 0, turn: t, start: 4, end: 0, income: 4 });
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
});
