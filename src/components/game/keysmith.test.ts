import { SquareInfo } from '../../types/SquareInfo';
import { CharacterId } from '../../types/Character';
import { addLock, isLocked, lockStack } from './lock';
import { SEAL_EMPTY_STACK, SEAL_OWN_STACK, lockBlocksPlacement, seal, sealBaseCost, sealReleaseCells } from './keysmith';
import { canPlaceAt } from './aiTurn';

const sq = (over: Partial<SquareInfo> = {}): SquareInfo => ({ player: undefined, bind: 0, effects: [], ...over });
const chars: CharacterId[] = ['keysmith', 'you'];

describe('鍵師 (#439)', () => {
    it('パッシブ: 鍵師は空きマスのロックを無視して置ける。コマのロックは無視できない。他キャラは止まる', () => {
        const emptyLocked = addLock(sq(), 2);
        const pieceLocked = addLock(sq({ player: '⭕', bind: 3 }), 2);
        expect(lockBlocksPlacement(emptyLocked, 'keysmith')).toBe(false);
        expect(lockBlocksPlacement(pieceLocked, 'keysmith')).toBe(true);
        expect(lockBlocksPlacement(emptyLocked, 'you')).toBe(true);
        expect(canPlaceAt([emptyLocked], 0, '💙', 'keysmith', chars)).toBe(true);
        expect(canPlaceAt([emptyLocked], 0, '⭕', 'you', chars)).toBe(false);
    });
    it('封鎖の断: 自陣に7・空きマスに2のロック。敵のロックは解除してその数だけダメージ', () => {
        const b = [
            sq({ player: '💙', bind: 3 }), // 自陣
            sq(), // 空き
            addLock(sq({ player: '⭕', bind: 5 }), 4), // 敵+ロック
            addLock(sq({ player: '⭕', bind: 5 }), 1), // 敵+ロック
            sq({ player: '⭕', bind: 4 }), // 敵
            sq({ player: '⭕', bind: 0 }), // ライフ0の敵はダメージ対象外
        ];
        expect(sealReleaseCells(b, '💙')).toEqual([2, 3]);
        const r = seal(b, '💙', chars);
        expect(r.released).toEqual([2, 3]);
        expect(r.damage).toBe(2);
        expect(r.hit).toEqual([2, 3, 4]);
        expect(lockStack(b[0])).toBe(SEAL_OWN_STACK);
        expect(lockStack(b[1])).toBe(SEAL_EMPTY_STACK);
        expect(isLocked(b[2])).toBe(false);
        expect(b[2].bind).toBe(3);
        expect(b[3].bind).toBe(3);
        expect(b[4].bind).toBe(2);
        expect(b[5].bind).toBe(0);
    });
    it('封鎖の断: 解除するロックが無くても最低1ダメージ。氷結中のマスにはロックを掛けない', () => {
        const b = [sq({ player: '⭕', bind: 3 }), sq({ effects: [{ effect: '❄' }] }), sq()];
        const r = seal(b, '💙', chars);
        expect(r.released).toEqual([]);
        expect(r.damage).toBe(1);
        expect(b[0].bind).toBe(2);
        expect(isLocked(b[1])).toBe(false);
        expect(r.empty).toEqual([2]);
    });
    it('封鎖の断: 敵陣のロックの数だけ基礎コストが下がる（下限5）', () => {
        expect(sealBaseCost(10, 0)).toBe(10);
        expect(sealBaseCost(10, 3)).toBe(7);
        expect(sealBaseCost(10, 9)).toBe(5);
    });
});
