import { PlayerCharacters, chargeStacks, orthoNeighbors, fireCharges, connectedPieces, isShielded, isGuarded, shieldedCells, withCharge } from './charge';
import { SquareInfo } from '../../types/SquareInfo';
import { Player } from '../../types/Player';
import AIPlayer from './AIPlayer';

const emptyBoard = (size = 4): SquareInfo[] => Array.from({ length: size * size }, () => ({ player: undefined, bind: 0, effects: [] }));
const put = (b: SquareInfo[], i: number, player: Player, bind = 4, zap = false): void => {
    b[i] = { player, bind, effects: zap ? [{ effect: '⚡' }] : [] };
};
// 席ごとのキャラ（添字 = 席番号）。💙=席0, ⭕=席1, 🟩=席2
const chars: PlayerCharacters = ['you', 'electrician'];
const chars3: PlayerCharacters = ['you', 'tactician', 'electrician'];

describe('帯電 ⚡ helpers', () => {
    it('orthoNeighbors は縦横のみ', () => {
        expect(orthoNeighbors(0, 4).sort((a, b) => a - b)).toEqual([1, 4]);
        expect(orthoNeighbors(5, 4).sort((a, b) => a - b)).toEqual([1, 4, 6, 9]);
    });

    it('fireCharges: 帯電マスの縦横隣のコマが1ダメージ、⚡は消え、斜め・ロックは対象外', () => {
        const b = emptyBoard();
        b[5] = { player: undefined, bind: 0, effects: [{ effect: '⚡' }] };
        put(b, 4, '💙', 5); // 着手したコマ (帯電マスの左隣)
        put(b, 6, '⭕', 4);
        put(b, 9, '⭕', 4);
        put(b, 10, '⭕', 4); // 斜め
        b[1] = { player: '⭕', bind: 4, effects: [{ effect: '🔑' }] };
        const r = fireCharges(b, 4, 4);
        expect(r.fired).toEqual([5]);
        expect([b[4].bind, b[6].bind, b[9].bind, b[10].bind, b[1].bind]).toEqual([4, 3, 3, 4, 4]);
        expect(chargeStacks(b[5])).toBe(0);
    });

    it('fireCharges: 連鎖しない / 帯電マスの隣でなければ何も起きない', () => {
        const b = emptyBoard();
        b[5] = { player: undefined, bind: 0, effects: [{ effect: '⚡' }] };
        put(b, 6, '⭕', 4, true);
        fireCharges(b, 4, 4);
        expect(chargeStacks(b[6])).toBe(1);
        expect(fireCharges(b, 15, 4).fired).toEqual([]);
    });

    it('isShielded: 雷霆の巫の⚡付き自陣だけ。isGuarded は🔑も含む', () => {
        const b = emptyBoard();
        put(b, 0, '⭕', 0, true);
        put(b, 1, '💙', 0, true);
        b[2] = { player: '💙', bind: 3, effects: [{ effect: '🔑' }] };
        expect(isShielded(b[0], chars)).toBe(true);
        expect(isShielded(b[1], chars)).toBe(false);
        expect(isGuarded(b[2], chars)).toBe(true);
    });

    it('connectedPieces: コマのあるマスだけを縦横に辿る', () => {
        const b = emptyBoard();
        [0, 1, 5, 10].forEach((i) => put(b, i, i === 1 ? '⭕' : '💙'));
        expect(connectedPieces(b, 0, 4).sort((a, c) => a - c)).toEqual([0, 1, 5]);
        expect(connectedPieces(b, 2, 4)).toEqual([]);
    });

    it('withCharge は元の盤面を変えない', () => {
        const b = emptyBoard();
        const n = withCharge(b, [3]);
        expect(chargeStacks(b[3])).toBe(0);
        expect(chargeStacks(n[3])).toBe(1);
    });
});

describe('帯電 ⚡ 5x5 / 3人', () => {
    it('orthoNeighbors は盤サイズに従う (5x5 の端と、4x4 なら隣接しないマス)', () => {
        expect(orthoNeighbors(4, 5).sort((a, b) => a - b)).toEqual([3, 9]); // 右端: 次の行の先頭とは隣接しない
        expect(orthoNeighbors(5, 5).sort((a, b) => a - b)).toEqual([0, 6, 10]); // 左端
        expect(orthoNeighbors(12, 5).sort((a, b) => a - b)).toEqual([7, 11, 13, 17]);
    });

    it('fireCharges: 5x5 でも着手マスの隣の帯電が縦横隣を削る', () => {
        const b = emptyBoard(5);
        b[12] = { player: undefined, bind: 0, effects: [{ effect: '⚡' }] };
        put(b, 11, '💙', 4); // 着手したコマ (帯電マスの左隣)
        put(b, 7, '⭕', 4);
        put(b, 17, '🟩', 4);
        put(b, 13, '⭕', 4);
        put(b, 6, '⭕', 4); // 斜め
        put(b, 5, '⭕', 4); // 4x4 の添字で隣と誤認しやすい位置
        const r = fireCharges(b, 11, 5);
        expect(r.fired).toEqual([12]);
        expect([b[11].bind, b[7].bind, b[17].bind, b[13].bind, b[6].bind, b[5].bind]).toEqual([3, 3, 3, 3, 4, 4]);
        expect(chargeStacks(b[12])).toBe(0);
    });

    it('fireCharges: 5x5 の右端の着手は次の行の先頭の帯電に反応しない', () => {
        const b = emptyBoard(5);
        b[5] = { player: undefined, bind: 0, effects: [{ effect: '⚡' }] };
        put(b, 0, '⭕', 4);
        expect(fireCharges(b, 4, 5).fired).toEqual([]);
        expect(chargeStacks(b[5])).toBe(1);
    });

    it('3人戦: 席ごとのキャラで無敵を判定する (雷霆の巫は席2の🟩)', () => {
        const b = emptyBoard(5);
        put(b, 0, '🟩', 0, true);
        put(b, 1, '⭕', 0, true);
        put(b, 2, '🟩', 3);
        expect(isShielded(b[0], chars3)).toBe(true);
        expect(isShielded(b[1], chars3)).toBe(false); // ⭕は軍師
        expect(isShielded(b[2], chars3)).toBe(false); // ⚡なし
        expect(shieldedCells(b, chars3)).toEqual([0]);
        expect(isGuarded(b[0], chars3)).toBe(true);
    });

    it('3人戦のAI: 無敵マスは (自分が雷霆の巫でなくても) 席のキャラ表から除外される', () => {
        const ai = new AIPlayer('💙', 'you', ['⭕', '🟩'], chars3);
        const b = emptyBoard(5);
        put(b, 3, '🟩', 0, true); // ライフ0でも奪えない
        ai.makeMove(b, 0, { onClickChargeSpread: 7, onClickChargeOne: 2 } as never, 0, 5, [], false);
        expect(ai.getValidMoves(b, 5)).not.toContain(3);
        expect(ai.getMovesFor(b, '⭕', 5)).not.toContain(3);
    });
});

describe('帯電 AI', () => {
    it('無敵マスは候補手から除外される', () => {
        const ai = new AIPlayer('💙', 'you', ['⭕'], ['you', 'electrician']);
        const b = emptyBoard();
        put(b, 3, '⭕', 0, true); // ライフ0でも奪えない
        ai.makeMove(b, 0, { onClickChargeSpread: 7, onClickChargeOne: 2 } as never, 0, 5, [], false);
        expect(ai.getValidMoves(b, 5)).not.toContain(3);
    });

    it('雷霆の巫は敵が密集していて魔力があれば帯電拡散を起点クリック付きで選ぶ', () => {
        const ai = new AIPlayer('⭕', 'electrician', ['💙'], ['you', 'electrician']);
        const b = emptyBoard();
        [0, 1, 2].forEach((i) => put(b, i, '⭕', 3));
        [4, 5].forEach((i) => put(b, i, '💙', 3));
        const costs = { onClickChargeSpread: 7, onClickChargeOne: 2, onClickChargeToken: 3 } as never;
        const r = ai.makeMove(b, 7, costs, 0, 5, [], false);
        expect(r.chargeClicks?.[0].skill).toBe('onClickChargeSpread');
    });
});
