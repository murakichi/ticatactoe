import { shouldDecay, DECAY_PER_ROUND_MIN_PLAYERS } from './decay';

describe('shouldDecay (issue #30)', () => {
    it('2人戦は従来どおり着手のたびに減衰する', () => {
        for (let p = 0; p < 10; p++) expect(shouldDecay(p, 2)).toBe(true);
    });

    it('3人以上は着手 N 回につき1回（最初の着手でその周の分を処理）', () => {
        for (const n of [3, 5, 8]) {
            const decays = Array.from({ length: 2 * n }, (_, p) => shouldDecay(p, n));
            expect(decays.filter(Boolean)).toHaveLength(2);
            expect(decays[0]).toBe(true);
            expect(decays[n]).toBe(true);
        }
    });

    it('境界は3人', () => {
        expect(DECAY_PER_ROUND_MIN_PLAYERS).toBe(3);
        expect(shouldDecay(1, DECAY_PER_ROUND_MIN_PLAYERS - 1)).toBe(true);
        expect(shouldDecay(1, DECAY_PER_ROUND_MIN_PLAYERS)).toBe(false);
    });
});
