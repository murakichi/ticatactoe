import { calculateWinner } from '../../util';
import { setWinLengths, defaultBoardSizeFor, minBoardSizeFor } from './winRule';
import { Player } from '../../types/Player';

// 5x5 の盤面を文字列で作る（. 空き / A=💙 / B=⭕）
const board5 = (rows: string[]): (Player | undefined)[] =>
    rows.join('').split('').map((c) => (c === 'A' ? '💙' : c === 'B' ? '⭕' : undefined));

describe('勝ちの並びの長さ（巫女は5）', () => {
    afterEach(() => setWinLengths(['you', 'you']));

    it('全員4なら従来どおり4つで勝つ', () => {
        setWinLengths(['you', 'you']);
        expect(calculateWinner(board5(['AAAA.', '.....', '.....', '.....', '.....']))).toBe('💙');
    });

    it('巫女は4つ並べても勝たず、5つ並べて勝つ', () => {
        setWinLengths(['dragonMiko', 'you']);
        expect(calculateWinner(board5(['AAAA.', '.....', '.....', '.....', '.....']))).toBeUndefined();
        expect(calculateWinner(board5(['AAAAA', '.....', '.....', '.....', '.....']))).toBe('💙');
    });

    it('巫女は列でも斜めでも5つで勝つ', () => {
        setWinLengths(['dragonMiko', 'you']);
        expect(calculateWinner(board5(['A....', 'A....', 'A....', 'A....', 'A....']))).toBe('💙');
        expect(calculateWinner(board5(['A....', '.A...', '..A..', '...A.', '....A']))).toBe('💙');
        expect(calculateWinner(board5(['A....', '.A...', '..A..', '...A.', '.....']))).toBeUndefined();
    });

    it('相手（長さ4）は4つで勝てる', () => {
        setWinLengths(['dragonMiko', 'you']);
        expect(calculateWinner(board5(['AAAA.', '.....', 'BBBB.', '.....', '.....']))).toBe('⭕');
    });

    it('離れた4つずつ（別の行）は5つ並びに数えない', () => {
        setWinLengths(['dragonMiko', 'you']);
        expect(calculateWinner(board5(['AAAA.', 'AAAA.', '.....', '.....', '.....']))).toBeUndefined();
    });

    it('巫女がいれば既定の盤面は5x5以上、いなければ従来どおり', () => {
        expect(minBoardSizeFor(['dragonMiko', 'you'])).toBe(5);
        expect(defaultBoardSizeFor(['dragonMiko', 'you'])).toBe(5);
        expect(defaultBoardSizeFor(['you', 'giant'])).toBe(4);
        expect(defaultBoardSizeFor(['dragonMiko', 'you', 'giant', 'witch', 'poisoner'])).toBe(6); // 人数の既定が大きいときはそちら
    });
});
