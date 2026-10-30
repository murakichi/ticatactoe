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

    test('board change metrics: stillRate counts turns with no cell change, change ignores life (decay) only', () => {
        const rows = [];
        for (let t = 0; t < 10; t++) rows.push({ seat: 0, turn: t, start: 4, end: 0, income: 4, skills: 1, changed: t % 2 === 0 ? 0 : 3, pieces: t % 2 === 0 ? 0 : 1, cells: 16 });
        const m = summarize([rows], 4, 10).overall;
        expect(m.stillRate).toBeCloseTo(0.5);
        expect(m.changePerTurn).toBeCloseTo(1.5);
        expect(m.changeRate).toBeCloseTo(1.5 / 16);
        expect(m.changePerMagic).toBeCloseTo(15 / 40);
    });

    test('createTracker counts owner/effect changes but not bind (life) changes', () => {
        const { createTracker } = require('./inflation');
        const mk = (cells) => ({ magic: [5, 5], gearSkills: [0, 0], turn: 0, currentTurn: 0, board: cells });
        const board0 = [{ player: undefined, bind: 0, effects: [] }, { player: '💙', bind: 5, effects: [] }, { player: '⭕', bind: 3, effects: [] }, { player: undefined, bind: 0, effects: [] }];
        const s = mk(board0.map((c) => ({ ...c, effects: [...c.effects] })));
        const tr = createTracker(s);
        tr.onTurnChange(s);
        const next = mk([
            { player: '💙', bind: 5, effects: [] },                 // 空き→コマ: 変化
            { player: '💙', bind: 4, effects: [] },                 // ライフだけ(減衰): 変化なし
            { player: '💙', bind: 3, effects: [] },                 // 持ち主が変わった: 変化
            { player: undefined, bind: 0, effects: [{ effect: '🔑' }] }, // 効果が付いた: 変化
        ]);
        next.turn = 1; next.currentTurn = 1;
        tr.onTurnChange(next);
        expect(tr.rows[0].changed).toBe(3);
        expect(tr.rows[0].pieces).toBe(2);
    });
});
