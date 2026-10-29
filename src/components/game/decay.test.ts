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

describe('満杯の盤面の追加減衰', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { isCrowded, crowdedDecay } = require('./decay');
    const sq = (player?: string, bind = 0, effects: { effect: string }[] = []) => ({ player, bind, effects });

    it('置ける空きマスが1つ以下で3人以上のときだけ満杯とみなす', () => {
        const cells = (n: number, empty: number) => Array.from({ length: n }, (_, i) => (i < empty ? sq() : sq('💙', 3)));
        expect(isCrowded(cells(36, 6), 3)).toBe(true); // 6x6 で空き6
        expect(isCrowded(cells(36, 7), 3)).toBe(false);
        expect(isCrowded(cells(36, 0), 2)).toBe(false);
        // 氷結で塞がれた空きマスは数えない
        const frozen = Array.from({ length: 36 }, (_, i) => (i < 20 ? sq(undefined, 0, [{ effect: '❄' }]) : sq('💙', 3)));
        expect(isCrowded(frozen, 3)).toBe(true);
    });

    it('追加減衰はライフの残ったコマを1減らす。氷結中・ライフ0は変えない', () => {
        expect(crowdedDecay(sq('💙', 3)).bind).toBe(2);
        expect(crowdedDecay(sq('💙', 0)).bind).toBe(0);
        expect(crowdedDecay(sq('💙', 3, [{ effect: '❄' }])).bind).toBe(3);
        expect(crowdedDecay(sq()).bind).toBe(0);
    });
});
