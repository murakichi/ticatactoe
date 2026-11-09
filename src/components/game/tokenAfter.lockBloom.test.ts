import { applyLockAt } from './tokenAfter';
import { SquareInfo } from '../../types/SquareInfo';

describe('芽吹きの錠: ロックを掛けた低ライフの自陣のコマにバッズ', () => {
    const board = (sq: Partial<SquareInfo>): SquareInfo[] => {
        const b: SquareInfo[] = Array.from({ length: 16 }, () => ({ player: undefined, bind: 0, effects: [] }));
        b[5] = { player: '💙', bind: 2, effects: [], ...sq };
        return b;
    };
    const buds = (b: SquareInfo[]) => b[5].effects.filter((e) => e.effect === '🌱').length;

    it('ライフ2以下でバッズの無い自陣のコマに掛けるとバッズ+1', () => {
        const b = board({});
        expect(applyLockAt(b, 5, ['lockBloom'], 0)).toBe(true);
        expect(buds(b)).toBe(1);
        expect(b[5].effects.some((e) => e.effect === '🔑')).toBe(true);
    });
    it('ギアが無ければバッズは付かない', () => {
        const b = board({});
        applyLockAt(b, 5, [], 0);
        expect(buds(b)).toBe(0);
    });
    it('ライフ3以上・すでにバッズあり・敵のコマ・空きマスには付かない', () => {
        const high = board({ bind: 3 });
        applyLockAt(high, 5, ['lockBloom'], 0);
        expect(buds(high)).toBe(0);
        const has = board({ effects: [{ effect: '🌱' }] });
        applyLockAt(has, 5, ['lockBloom'], 0);
        expect(buds(has)).toBe(1);
        const foe = board({ player: '⭕' });
        applyLockAt(foe, 5, ['lockBloom'], 0);
        expect(buds(foe)).toBe(0);
        const empty = board({ player: undefined, bind: 0 });
        applyLockAt(empty, 5, ['lockBloom'], 0);
        expect(buds(empty)).toBe(0);
    });
});
