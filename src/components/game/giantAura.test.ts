import { giantAura } from './giantAura';
import { SquareInfo } from '../../types/SquareInfo';
import { CharacterId } from '../../types/Character';

const empty = (): SquareInfo => ({ bind: 0, player: undefined, effects: [] });
const chars: CharacterId[] = ['giant', 'you'];

describe('giantAura', () => {
    it('敵コマは破壊、空きマスと壊れたマスはライフ1のロック、自陣のコマも壊れずロックされる', () => {
        const board: SquareInfo[] = [empty(), { bind: 3, player: '⭕', effects: [] }, { bind: 3, player: '💙', effects: [] }];
        const res = giantAura(board, [0, 1, 2], '💙', chars);
        expect(res.destroyed).toEqual([1]);
        expect(board[0]).toEqual({ bind: 1, player: undefined, effects: [{ effect: '🔑' }] });
        expect(board[1]).toEqual({ bind: 1, player: undefined, effects: [{ effect: '🔑' }] });
        expect(board[2]).toEqual({ bind: 3, player: '💙', effects: [{ effect: '🔑' }] });
        expect(res.locked).toEqual([0, 1, 2]);
    });
    it('ロック中の敵コマは壊れず、氷結中の敵コマは❄が身代わりになる', () => {
        const board: SquareInfo[] = [
            { bind: 3, player: '⭕', effects: [{ effect: '🔑' }] },
            { bind: 3, player: '⭕', effects: [{ effect: '❄', value: 1 }] },
        ];
        const res = giantAura(board, [0, 1], '💙', chars);
        expect(res.destroyed).toEqual([]);
        expect(res.blocked).toEqual([1]);
        expect(board[0].player).toBe('⭕');
        expect(board[1].player).toBe('⭕');
    });
});
