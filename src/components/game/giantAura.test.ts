import { giantAura } from './giantAura';
import { SquareInfo } from '../../types/SquareInfo';
import { CharacterId } from '../../types/Character';

const empty = (): SquareInfo => ({ bind: 0, player: undefined, effects: [] });
const chars: CharacterId[] = ['giant', 'you'];

describe('giantAura', () => {
    it('空きマスはライフ1のロック、敵コマは1ダメージ、自陣は触らない', () => {
        const board: SquareInfo[] = [empty(), empty(), empty()];
        board[1] = { bind: 3, player: '⭕', effects: [] };
        board[2] = { bind: 3, player: '💙', effects: [] };
        const res = giantAura(board, [0, 1, 2], '💙', chars);
        expect(res.locked).toEqual([0]);
        expect(res.hit).toEqual([1]);
        expect(board[0]).toEqual({ bind: 1, player: undefined, effects: [{ effect: '🔑' }] });
        expect(board[1].bind).toBe(2);
        expect(board[2].bind).toBe(3);
    });
    it('ロック中の敵コマには当たらない', () => {
        const board: SquareInfo[] = [{ bind: 3, player: '⭕', effects: [{ effect: '🔑' }] }];
        const res = giantAura(board, [0], '💙', chars);
        expect(res.hit).toEqual([]);
        expect(board[0].bind).toBe(3);
    });
});
