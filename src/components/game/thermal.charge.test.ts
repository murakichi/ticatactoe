import {
    THUNDER_FIRE_MIN,
    thunderFireVictims,
} from './thermal';

describe('雷のない所に火は立たぬ (thunderFireVictims)', () => {
    // 決定的な疑似乱数列（0.0, 0.25, 0.5, 0.75, 0.99 を繰り返す）
    const seq = (vals: number[]) => {
        let n = 0;
        return () => vals[n++ % vals.length];
    };
    it('候補が無ければ空。候補が2未満なら全部', () => {
        expect(thunderFireVictims([], Math.random)).toEqual([]);
        expect(thunderFireVictims([5], Math.random)).toEqual([5]);
        expect(THUNDER_FIRE_MIN).toBe(2);
    });
    it('個数は最小2〜全部のあいだ（rng が0に近いと2、1に近いと全部）で、選ばれるのは候補の部分集合（昇順・重複なし）', () => {
        const cands = [1, 3, 5, 7, 9];
        expect(thunderFireVictims(cands, seq([0, 0, 0])).length).toBe(2);
        expect(thunderFireVictims(cands, seq([0.999, 0, 0, 0, 0, 0])).length).toBe(5);
        for (let t = 0; t < 200; t++) {
            const r = thunderFireVictims(cands, Math.random);
            expect(r.length).toBeGreaterThanOrEqual(2);
            expect(r.length).toBeLessThanOrEqual(5);
            expect(new Set(r).size).toBe(r.length);
            expect(r.every((c) => cands.includes(c))).toBe(true);
            expect([...r].sort((a, b) => a - b)).toEqual(r);
        }
    });
});
