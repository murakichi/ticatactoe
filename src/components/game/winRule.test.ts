import { calculateWinner } from '../../util';
import { setWinNeeds, hasTwoDistinctLines } from './winRule';
import { Player } from '../../types/Player';

// 5x5 の盤面を文字列で作る（. 空き / A=💙 / B=⭕）
const board5 = (rows: string[]): (Player | undefined)[] =>
    rows.join('').split('').map((c) => (c === 'A' ? '💙' : c === 'B' ? '⭕' : undefined));

describe('二列勝利 (#526)', () => {
    afterEach(() => setWinNeeds(['you', 'you']));

    it('全員1本なら従来どおり1本で勝つ', () => {
        setWinNeeds(['you', 'you']);
        expect(calculateWinner(board5(['AAAA.', '.....', '.....', '.....', '.....']))).toBe('💙');
    });

    it('必要本数2の席は1本では勝たず、別々の2本で勝つ', () => {
        setWinNeeds(['dragonMiko', 'you']);
        expect(calculateWinner(board5(['AAAA.', '.....', '.....', '.....', '.....']))).toBeUndefined();
        expect(calculateWinner(board5(['AAAA.', 'AAAA.', '.....', '.....', '.....']))).toBe('💙');
    });

    it('相手（本数1）は1本で勝てる', () => {
        setWinNeeds(['dragonMiko', 'you']);
        expect(calculateWinner(board5(['AAAA.', '.....', 'BBBB.', '.....', '.....']))).toBe('⭕');
    });

    it('同じ行の重なった窓（共有3マス）は2本に数えない', () => {
        setWinNeeds(['dragonMiko', 'you']);
        expect(calculateWinner(board5(['AAAAA', '.....', '.....', '.....', '.....']))).toBeUndefined();
    });

    it('交差して共有1マスなら2本に数える', () => {
        setWinNeeds(['dragonMiko', 'you']);
        // 行0の0..3 と 列0の0..3 が(0,0)で交差
        expect(calculateWinner(board5(['AAAA.', 'A....', 'A....', 'A....', '.....']))).toBe('💙');
    });

    it('共有2マスは不可', () => {
        expect(hasTwoDistinctLines([[0, 1, 2, 3], [2, 3, 4, 5]])).toBe(false);
        expect(hasTwoDistinctLines([[0, 1, 2, 3], [3, 7, 11, 15]])).toBe(true);
    });
});
