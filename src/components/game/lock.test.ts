import { SquareInfo } from '../../types/SquareInfo';
import { addLock, clearLock, isLocked, lockEffect, lockStack, tickLock } from './lock';
import { decayBoard } from './decay';
import { canPlaceAt } from './aiTurn';

const sq = (over: Partial<SquareInfo> = {}): SquareInfo => ({ player: undefined, bind: 0, effects: [], ...over });

describe('ロックのスタック (#438)', () => {
    it('addLock: ライフは変えず、スタックが加算される（🔑は1つにまとまる）', () => {
        const a = addLock(sq({ player: '💙', bind: 3 }), 6);
        expect(a).toEqual({ player: '💙', bind: 3, effects: [{ effect: '🔑', stack: 6 }] });
        const b = addLock(a, 6);
        expect(b.effects).toEqual([{ effect: '🔑', stack: 12 }]);
        expect(b.bind).toBe(3);
        expect(lockStack(b)).toBe(12);
    });
    it('addLock: 他のエフェクトは残り、空蔵の持ち主は最初にかけた人が保たれる', () => {
        const a = addLock(sq({ effects: [{ effect: '🌱' }] }), 2, 1);
        const b = addLock(a, 2, 2);
        expect(b.effects).toEqual([{ effect: '🌱' }, { effect: '🔑', stack: 4, owner: 1 }]);
    });
    it('tickLock: 1ずつ減り、0で外れる。切れたロックを返す。stack の無い🔑は減らない', () => {
        let s = addLock(sq(), 2, 1);
        s = tickLock(s).sq;
        expect(lockStack(s)).toBe(1);
        const t = tickLock(s);
        expect(isLocked(t.sq)).toBe(false);
        expect(t.expired).toEqual(lockEffect(1, 1));
        const legacy = sq({ effects: [{ effect: '🔑' }] });
        expect(tickLock(legacy).sq).toBe(legacy);
    });
    it('clearLock: ロックだけ外す', () => {
        expect(clearLock(sq({ effects: [{ effect: '🌱' }, lockEffect(3)] })).effects).toEqual([{ effect: '🌱' }]);
    });
    it('ロック中のコマはライフ0でも着手で乗っ取れない。切れたら乗っ取れる', () => {
        const chars = ['you', 'you'] as const;
        const board = [addLock(sq({ player: '⭕', bind: 0 }), 1)];
        expect(canPlaceAt(board, 0, '💙', 'you', chars)).toBe(false);
        decayBoard(board, -1, chars, ['💙', '⭕']);
        expect(canPlaceAt(board, 0, '💙', 'you', chars)).toBe(true);
    });
    it('ロック中のコマのライフは普通に減る。ロックは減衰のたびにスタックが減る', () => {
        const chars = ['you', 'you'] as const;
        const board = [addLock(sq({ player: '⭕', bind: 5 }), 3)];
        decayBoard(board, -1, chars, ['💙', '⭕']);
        expect(board[0].bind).toBe(4);
        expect(lockStack(board[0])).toBe(2);
    });
    it('ロック中のコマは毒でライフ0になっても消えない', () => {
        const chars = ['you', 'you'] as const;
        const board = [addLock(sq({ player: '⭕', bind: 0, effects: [{ effect: '☠' }] }), 3)];
        const r = decayBoard(board, -1, chars, ['💙', '⭕']);
        expect(board[0].player).toBe('⭕');
        expect(r.spreadOrigins).toEqual([]);
    });
    it('満杯の追加減衰ではロックのスタックも1余計に減る（最後の1は通常の減衰で外れる）', () => {
        const chars = ['you', 'you'] as const;
        const board = [addLock(sq(), 3)];
        decayBoard(board, -1, chars, ['💙', '⭕'], true);
        expect(lockStack(board[0])).toBe(1);
    });
});
