import { DEADLOCK_ROUNDS, breakDeadlock, isDeadlocked } from './deadlock';
import { SquareInfo } from '../../types/SquareInfo';

describe('膠着の打開', () => {
    it('最後の着手から DEADLOCK_ROUNDS 周回ったら膠着', () => {
        expect(isDeadlocked(10, 1, 2)).toBe(10 - 1 >= DEADLOCK_ROUNDS * 2);
        expect(isDeadlocked(6, 1, 2)).toBe(false);
        expect(isDeadlocked(7, 1, 2)).toBe(true);
        expect(isDeadlocked(10, 1, 4)).toBe(false);
    });
    it('氷結は❄を1つ解き、ロックは残りライフを1減らす（0で外れる）。他のマスは変えない', () => {
        const b: SquareInfo[] = [
            { player: undefined, bind: 0, effects: [{ effect: '❄' }, { effect: '❄' }] },
            { player: '⭕', bind: 2, effects: [{ effect: '🔑' }] },
            { player: '⭕', bind: 1, effects: [{ effect: '🔑' }, { effect: '🍂' }] },
            { player: '💙', bind: 5, effects: [] },
        ];
        expect(breakDeadlock(b)).toEqual([0, 1, 2]);
        expect(b[0].effects).toEqual([{ effect: '❄' }]);
        expect(b[1]).toEqual({ player: '⭕', bind: 1, effects: [{ effect: '🔑' }] });
        expect(b[2]).toEqual({ player: '⭕', bind: 0, effects: [{ effect: '🍂' }] });
        expect(b[3].bind).toBe(5);
    });
});
