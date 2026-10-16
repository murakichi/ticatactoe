import { lateMagicBonus, LATE_MAGIC_INTERVAL, LATE_MAGIC_MIN_PLAYERS } from './lateMagic';

describe('lateMagicBonus', () => {
    it('50ターンごとに+1ずつ増える（3人以上）', () => {
        expect(lateMagicBonus(2, 3)).toBe(0);
        expect(lateMagicBonus(49, 3)).toBe(0);
        expect(lateMagicBonus(50, 3)).toBe(1);
        expect(lateMagicBonus(99, 8)).toBe(1);
        expect(lateMagicBonus(100, 4)).toBe(2);
        expect(lateMagicBonus(250, 5)).toBe(5);
    });

    it('2人戦でも同じように増える', () => {
        expect(lateMagicBonus(49, 2)).toBe(0);
        expect(lateMagicBonus(50, 2)).toBe(1);
        expect(lateMagicBonus(500, 2)).toBe(10);
    });

    it('定数', () => {
        expect(LATE_MAGIC_INTERVAL).toBe(50);
        expect(LATE_MAGIC_MIN_PLAYERS).toBe(2);
    });
});
