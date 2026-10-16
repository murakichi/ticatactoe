import { chargeStacks, orthoNeighbors, fireCharges, connectedPieces, isShielded, isGuarded, withCharge } from './charge';
import { SquareInfo } from '../../types/SquareInfo';
import { Player } from '../../types/Player';
import AIPlayer from './AIPlayer';

const emptyBoard = (): SquareInfo[] => Array.from({ length: 16 }, () => ({ player: undefined, bind: 0, effects: [] }));
const put = (b: SquareInfo[], i: number, player: Player, bind = 4, zap = false): void => {
    b[i] = { player, bind, effects: zap ? [{ effect: '⚡' }] : [] };
};
const chars = { '💙': 'you', '⭕': 'electrician' } as const;

describe('帯電 ⚡ helpers', () => {
    it('orthoNeighbors は縦横のみ', () => {
        expect(orthoNeighbors(0).sort((a, b) => a - b)).toEqual([1, 4]);
        expect(orthoNeighbors(5).sort((a, b) => a - b)).toEqual([1, 4, 6, 9]);
    });

    it('fireCharges: 帯電マスの縦横隣のコマが1ダメージ、⚡は消え、斜め・ロックは対象外', () => {
        const b = emptyBoard();
        b[5] = { player: undefined, bind: 0, effects: [{ effect: '⚡' }] };
        put(b, 4, '💙', 5); // 着手したコマ (帯電マスの左隣)
        put(b, 6, '⭕', 4);
        put(b, 9, '⭕', 4);
        put(b, 10, '⭕', 4); // 斜め
        b[1] = { player: '⭕', bind: 4, effects: [{ effect: '🔑' }] };
        const r = fireCharges(b, 4);
        expect(r.fired).toEqual([5]);
        expect([b[4].bind, b[6].bind, b[9].bind, b[10].bind, b[1].bind]).toEqual([4, 3, 3, 4, 4]);
        expect(chargeStacks(b[5])).toBe(0);
    });

    it('fireCharges: 連鎖しない / 帯電マスの隣でなければ何も起きない', () => {
        const b = emptyBoard();
        b[5] = { player: undefined, bind: 0, effects: [{ effect: '⚡' }] };
        put(b, 6, '⭕', 4, true);
        fireCharges(b, 4);
        expect(chargeStacks(b[6])).toBe(1);
        expect(fireCharges(b, 15).fired).toEqual([]);
    });

    it('isShielded: 電気使いの⚡付き自陣だけ。isGuarded は🔑も含む', () => {
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
        expect(connectedPieces(b, 0).sort((a, c) => a - c)).toEqual([0, 1, 5]);
        expect(connectedPieces(b, 2)).toEqual([]);
    });

    it('withCharge は元の盤面を変えない', () => {
        const b = emptyBoard();
        const n = withCharge(b, [3]);
        expect(chargeStacks(b[3])).toBe(0);
        expect(chargeStacks(n[3])).toBe(1);
    });
});

describe('帯電 AI', () => {
    it('無敵マスは候補手から除外される', () => {
        const ai = new AIPlayer('💙', 'you', 'electrician');
        const b = emptyBoard();
        put(b, 3, '⭕', 0, true); // ライフ0でも奪えない
        ai.makeMove(b, 0, { onClickChargeSpread: 7, onClickChargeOne: 2 } as never, 0, 5, [], false);
        expect(ai.getValidMoves(b, 5)).not.toContain(3);
    });

    it('電気使いは敵が密集していて魔力があれば帯電拡散を起点クリック付きで選ぶ', () => {
        const ai = new AIPlayer('⭕', 'electrician', 'you');
        const b = emptyBoard();
        [0, 1, 2].forEach((i) => put(b, i, '⭕', 3));
        [4, 5].forEach((i) => put(b, i, '💙', 3));
        const costs = { onClickChargeSpread: 7, onClickChargeOne: 2, onClickChargeToken: 3 } as never;
        const r = ai.makeMove(b, 7, costs, 0, 5, [], false);
        expect(r.chargeClicks?.[0].skill).toBe('onClickChargeSpread');
    });
});
