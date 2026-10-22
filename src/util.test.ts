import { calculateWinner, isShikigami, lineSymbols } from './util';

describe('式神(📜)は列の並びに数えない', () => {
    const sq = (player: '💙' | '⭕' | undefined, shiki = false) => ({ player, bind: 2, effects: shiki ? [{ effect: '📜' as const }] : [] });
    it('4つ並んでも式神を含む列は勝ちにならない', () => {
        const board = Array.from({ length: 16 }, () => sq(undefined));
        [0, 1, 2].forEach((i) => { board[i] = sq('💙'); });
        board[3] = sq('💙', true);
        expect(calculateWinner(lineSymbols(board))).toBeUndefined();
        board[3] = sq('💙');
        expect(calculateWinner(lineSymbols(board))).toBe('💙');
    });
    it('isShikigami は📜を持つマスだけ真', () => {
        expect(isShikigami(sq('💙', true))).toBe(true);
        expect(isShikigami(sq('💙'))).toBe(false);
    });
});
