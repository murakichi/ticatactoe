import { boardSizeFor, geometryOf, WIN_LENGTH } from './boardGeometry';
import { calculateWinner } from '../../util';
import { Player } from '../../types/Player';

// 4x4 版の手書きテーブル（多人数対応前の実装）。可変サイズ化後も2人戦の挙動が変わらないことの回帰基準。
// 審判の日のテーブルは旧実装に誤記が2か所あった(11番に6が無い / 14番に2でなく3)ので、その2点だけ正しい値に直してある
const WIN_LINES: number[][] = [
    [0, 1, 2, 3], [4, 5, 6, 7], [8, 9, 10, 11], [12, 13, 14, 15],
    [0, 4, 8, 12], [1, 5, 9, 13], [2, 6, 10, 14], [3, 7, 11, 15],
    [0, 5, 10, 15], [3, 6, 9, 12],
];
const STOMP_AREA: Record<number, number[]> = {
    0: [0, 1, 4, 5], 1: [0, 1, 2, 4, 5, 6], 2: [1, 2, 3, 5, 6, 7], 3: [2, 3, 6, 7],
    4: [0, 1, 4, 5, 8, 9], 5: [0, 1, 2, 4, 5, 6, 8, 9, 10], 6: [1, 2, 3, 5, 6, 7, 9, 10, 11], 7: [2, 3, 6, 7, 10, 11],
    8: [4, 5, 8, 9, 12, 13], 9: [4, 5, 6, 8, 9, 10, 12, 13, 14], 10: [5, 6, 7, 9, 10, 11, 13, 14, 15], 11: [6, 7, 10, 11, 14, 15],
    12: [8, 9, 12, 13], 13: [8, 9, 10, 12, 13, 14], 14: [9, 10, 11, 13, 14, 15], 15: [10, 11, 14, 15],
};
const JUDGE_AREA: Record<number, number[]> = {
    0: [0, 1, 2, 3, 4, 5, 8, 10, 12, 15], 1: [0, 1, 2, 3, 4, 5, 6, 9, 11, 13], 2: [0, 1, 2, 3, 5, 6, 7, 8, 10, 14], 3: [0, 1, 2, 3, 6, 7, 9, 11, 12, 15],
    4: [0, 1, 4, 5, 6, 7, 8, 9, 12, 14], 5: [0, 1, 2, 4, 5, 6, 7, 8, 9, 10, 13, 15], 6: [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 14], 7: [2, 3, 4, 5, 6, 7, 10, 11, 13, 15],
    8: [0, 2, 4, 5, 8, 9, 10, 11, 12, 13], 9: [1, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14], 10: [0, 2, 5, 6, 7, 8, 9, 10, 11, 13, 14, 15], 11: [1, 3, 6, 7, 8, 9, 10, 11, 14, 15], // 旧テーブルは6が抜けていた
    12: [0, 3, 4, 6, 8, 9, 12, 13, 14, 15], 13: [1, 5, 7, 8, 9, 10, 12, 13, 14, 15], 14: [2, 4, 6, 9, 10, 11, 12, 13, 14, 15], 15: [0, 3, 5, 7, 10, 11, 12, 13, 14, 15],
};
const stompRange = (i: number): number[] => STOMP_AREA[i] ?? [];
const judgeRange = (i: number): number[] => JUDGE_AREA[i] ?? [];

const sorted = (a: number[]) => [...a].sort((x, y) => x - y);

describe('boardSizeFor', () => {
    it.each([
        [2, 4],
        [3, 5],
        [4, 5],
        [5, 6],
        [6, 6],
        [7, 7],
        [8, 7],
    ])('%i人 → %ix%i', (players, size) => {
        expect(boardSizeFor(players)).toBe(size);
    });
});

describe('geometryOf(4) は従来の4x4テーブルと一致する', () => {
    const g = geometryOf(4);
    it('勝利ライン', () => {
        expect(g.winLines.map(sorted).sort()).toEqual(WIN_LINES.map(sorted).sort());
    });
    it('ストンプ範囲', () => {
        for (let i = 0; i < 16; i++) expect(sorted(g.stompRange(i))).toEqual(sorted(STOMP_AREA[i]));
    });
    it('審判の日の範囲', () => {
        for (let i = 0; i < 16; i++) expect(sorted(g.judgeRange(i))).toEqual(sorted(JUDGE_AREA[i]));
    });
    it('対角線', () => {
        expect(g.antiDiagonal).toEqual([3, 6, 9, 12]);
        expect(g.mainDiagonal).toEqual([0, 5, 10, 15]);
    });
});

describe('大きい盤でも勝利条件は4マス連続', () => {
    it('勝利ラインはすべて長さ4', () => {
        for (const size of [4, 5, 6, 7]) {
            expect(geometryOf(size).winLines.every((l) => l.length === WIN_LENGTH)).toBe(true);
        }
    });
    it('ライン数: 行/列は size*(size-3) ずつ、斜めは (size-3)^2 ずつ', () => {
        for (const size of [4, 5, 6, 7]) {
            const expected = 2 * size * (size - 3) + 2 * (size - 3) * (size - 3);
            expect(geometryOf(size).winLines.length).toBe(expected);
        }
    });
    it('5x5: 行の途中の4連続も勝ち', () => {
        const b: (Player | undefined)[] = Array(25).fill(undefined);
        [6, 7, 8, 9].forEach((i) => (b[i] = '🟩'));
        expect(calculateWinner(b)).toBe('🟩');
    });
    it('7x7: 斜め4連続(右上→左下)も勝ち', () => {
        const b: (Player | undefined)[] = Array(49).fill(undefined);
        [10, 16, 22, 28].forEach((i) => (b[i] = '🩷')); // 7列: (1,3)(2,2)(3,1)(4,0)
        expect(calculateWinner(b)).toBe('🩷');
    });
    it('3連続や別プレイヤー混在は勝ちにならない', () => {
        const b: (Player | undefined)[] = Array(25).fill(undefined);
        [0, 1, 2].forEach((i) => (b[i] = '💙'));
        b[3] = '⭕';
        expect(calculateWinner(b)).toBeUndefined();
    });
});

describe('可変サイズの範囲スキル', () => {
    it('7x7 のストンプは角で4マス、中央で9マス', () => {
        const g = geometryOf(7);
        expect(g.stompRange(0)).toHaveLength(4);
        expect(g.stompRange(24)).toHaveLength(9);
    });
    it('7x7 の審判の日は中央で行+列+両対角（25マス）', () => {
        expect(geometryOf(7).judgeRange(24)).toHaveLength(7 + 7 + 7 + 7 - 3);
    });
    it('対角線の長さは盤の一辺', () => {
        expect(geometryOf(6).antiDiagonal).toHaveLength(6);
        expect(geometryOf(6).mainDiagonal).toHaveLength(6);
    });
});
