import { afterTokenPlaced, TokenAfterOptions } from './tokenAfter';
import { SquareInfo } from '../../types/SquareInfo';
import { Gears } from './gear';

const emptyBoard = (): SquareInfo[] => Array.from({ length: 16 }, () => ({ player: undefined, bind: 0, effects: [] }));
const opts = (gears: Gears, rng: () => number, chargeBuff = 0): TokenAfterOptions => ({ player: '💙', turnSeat: 0, gears, chars: ['you', 'you'], chargeBuff, rng });
const has = (sq: SquareInfo, e: string): boolean => sq.effects.some((x) => x.effect === e);

describe('afterTokenPlaced（トークン後の盤面処理の順序。Game / sim 共有）', () => {
    it('ギアが無ければ、エフェクト付きトークンの1だけ数え、乱数は使わない', () => {
        const b = emptyBoard();
        b[5] = { player: '💙', bind: 4, effects: [{ effect: '🌱' }] };
        const rng = jest.fn(() => 0);
        expect(afterTokenPlaced(b, 5, '🌱', opts(undefined, rng))).toEqual({ granted: 1, locked: false, spreadTo: null });
        expect(afterTokenPlaced(b, 5, undefined, opts(undefined, rng)).granted).toBe(0);
        expect(rng).not.toHaveBeenCalled();
    });

    it('静電気の季節は⚡を付けるが、収穫には数えない', () => {
        const b = emptyBoard();
        b[5] = { player: '💙', bind: 4, effects: [] };
        const r = afterTokenPlaced(b, 5, undefined, opts(undefined, () => 0, 2));
        expect(has(b[5], '⚡')).toBe(true);
        expect(r.granted).toBe(0);
    });

    it('道連れの鍵: 乱数がしきい値未満ならロックが付いて収穫に+1。以上なら付かない', () => {
        const b = emptyBoard();
        b[5] = { player: '💙', bind: 4, effects: [] };
        const hit = afterTokenPlaced(b, 5, undefined, opts(['bindingLock'], () => 0));
        expect(hit).toEqual({ granted: 1, locked: true, spreadTo: null });
        expect(has(b[5], '🔑')).toBe(true);
        const c = emptyBoard();
        c[5] = { player: '💙', bind: 4, effects: [] };
        const miss = afterTokenPlaced(c, 5, undefined, opts(['bindingLock'], () => 0.99));
        expect(miss.locked).toBe(false);
        expect(has(c[5], '🔑')).toBe(false);
    });

    it('伝播: effect があるときだけ、周囲の候補に同じエフェクトが広がり収穫に+1', () => {
        const b = emptyBoard();
        b[5] = { player: '💙', bind: 4, effects: [{ effect: '🌱' }] };
        b[6] = { player: '💙', bind: 4, effects: [] };
        const r = afterTokenPlaced(b, 5, '🌱', opts(['propagate'], () => 0));
        expect(r).toEqual({ granted: 2, locked: false, spreadTo: 6 });
        expect(has(b[6], '🌱')).toBe(true);
        const c = emptyBoard();
        c[5] = { player: '💙', bind: 4, effects: [] };
        c[6] = { player: '💙', bind: 4, effects: [] };
        expect(afterTokenPlaced(c, 5, undefined, opts(['propagate'], () => 0)).spreadTo).toBeNull();
    });
});
