import AIPlayer from './AIPlayer';
import { SquareInfo } from '../../types/SquareInfo';
import { Player } from '../../types/Player';
import { calculateWinner } from '../../util';

const emptyBoard = (): SquareInfo[] => Array.from({ length: 16 }, () => ({ player: undefined, bind: 0, effects: [] }));
const put = (b: SquareInfo[], i: number, player: Player, bind = 5): void => {
    b[i] = { player, bind, effects: [] };
};

describe('calculateWinner', () => {
    it('detects a row win', () => {
        const b = emptyBoard();
        [0, 1, 2, 3].forEach((i) => put(b, i, '💙'));
        expect(calculateWinner(b.map((s) => s.player))).toBe('💙');
    });
    it('detects a diagonal win', () => {
        const b = emptyBoard();
        [0, 5, 10, 15].forEach((i) => put(b, i, '⭕'));
        expect(calculateWinner(b.map((s) => s.player))).toBe('⭕');
    });
    it('no winner on empty board', () => {
        expect(calculateWinner(emptyBoard().map((s) => s.player))).toBeUndefined();
    });
});

describe('AIPlayer pure logic', () => {
    const ai = new AIPlayer('💙', 'you', ['⭕']);

    it('countReaches counts a 3-in-a-row with empty 4th', () => {
        const b = emptyBoard();
        [0, 1, 2].forEach((i) => put(b, i, '💙'));
        expect(ai.countReaches(b, '💙')).toBe(1);
    });

    it('findThreatSquares returns the completing cell', () => {
        const b = emptyBoard();
        [0, 1, 2].forEach((i) => put(b, i, '⭕'));
        expect(ai.findThreatSquares(b, '⭕')).toContain(3);
    });

    it('simulatePlace: empty cell gets my piece at life', () => {
        const nb = ai.simulatePlace(emptyBoard(), 5, '💙', 5);
        expect(nb[5].player).toBe('💙');
        expect(nb[5].bind).toBe(5);
    });

    it('simulatePlace: captures a bind-0 enemy', () => {
        const b = emptyBoard();
        b[5] = { player: '⭕', bind: 0, effects: [] };
        expect(ai.simulatePlace(b, 5, '💙', 5)[5].player).toBe('💙');
    });

    it('getBestMove takes an immediate win', () => {
        const b = emptyBoard();
        [0, 1, 2].forEach((i) => put(b, i, '💙'));
        expect(ai.getBestMove(b, 5)).toBe(3);
    });

    it('getBestMove blocks an opponent win', () => {
        const b = emptyBoard();
        [4, 5, 6].forEach((i) => put(b, i, '⭕'));
        expect(ai.getBestMove(b, 5)).toBe(7);
    });
});

describe('AIPlayer signature-skill targeting (uses shared boardGeometry)', () => {
    it('giant findStompTarget needs >=2 enemies in range', () => {
        const giant = new AIPlayer('💙', 'giant', ['⭕']);
        const two = emptyBoard();
        put(two, 0, '⭕');
        put(two, 1, '⭕');
        expect(giant.findStompTarget(two)).not.toBeNull();

        const one = emptyBoard();
        put(one, 0, '⭕');
        expect(giant.findStompTarget(one)).toBeNull();
    });

    it('magician findJudgeTarget fires when net enemy destruction >=2', () => {
        const mag = new AIPlayer('💙', 'magician', ['⭕']);
        const b = emptyBoard();
        [0, 1, 2].forEach((i) => put(b, i, '⭕'));
        expect(mag.findJudgeTarget(b)).not.toBeNull();
    });
});

describe('AIPlayer 多人数', () => {
    const emptyN = (size: number): SquareInfo[] => Array.from({ length: size * size }, () => ({ player: undefined, bind: 0, effects: [] }));
    const putN = (b: SquareInfo[], i: number, player: Player, bind = 5): void => {
        b[i] = { player, bind, effects: [] };
    };

    it('3人戦(5x5): 2人の敵のうち片方のリーチも塞ぐ', () => {
        const ai = new AIPlayer('💙', 'you', ['⭕', '🟩']);
        const b = emptyN(5);
        [5, 6, 7].forEach((i) => putN(b, i, '🟩'));
        putN(b, 20, '⭕');
        // 5x5 の行は [5,6,7,8] か [4,5,6,7] で4連続 → 8 か 4 を塞ぐ必要がある（どちらかを塞げば即死は避けられる）
        expect([4, 8]).toContain(ai.getBestMove(b, 5));
    });

    it('3人戦: 自分の4連続完成を最優先する', () => {
        const ai = new AIPlayer('🟩', 'you', ['💙', '⭕']);
        const b = emptyN(5);
        [10, 11, 12].forEach((i) => putN(b, i, '🟩'));
        [0, 1, 2].forEach((i) => putN(b, i, '💙'));
        expect([9, 13]).toContain(ai.getBestMove(b, 5));
    });

    it('findThreatSquares / countReaches は他の敵コマが混ざったラインを数えない', () => {
        const ai = new AIPlayer('💙', 'you', ['⭕', '🟩']);
        const b = emptyN(5);
        [0, 1, 2].forEach((i) => putN(b, i, '⭕'));
        putN(b, 3, '🟩');
        expect(ai.countReaches(b, '⭕')).toBe(0);
        expect(ai.findThreatSquares(b, '⭕')).not.toContain(3);
    });

    it('巨人のストンプ対象は複数の敵コマを数える', () => {
        const giant = new AIPlayer('💙', 'giant', ['⭕', '🟩']);
        const b = emptyN(6);
        putN(b, 0, '⭕');
        putN(b, 1, '🟩');
        expect(giant.findStompTarget(b)).not.toBeNull();
    });

    it('8人戦(7x7)でもmakeMoveが妥当な手を返し、実用的な時間で終わる', () => {
        const symbols: Player[] = ['💙', '⭕', '🟩', '🔶', '⭐', '🟣', '🟫', '🩷'];
        const b = emptyN(7);
        symbols.forEach((p, k) => {
            putN(b, k * 6, p, 3);
            putN(b, k * 6 + 1, p, 3);
        });
        const ai = new AIPlayer('💙', 'you', symbols.slice(1));
        const costs = { onClickToken: 4 } as never;
        const t0 = Date.now();
        const result = ai.makeMove(b, 2, costs, 2, 5, [0, 3], false);
        expect(Date.now() - t0).toBeLessThan(5000);
        expect(result.move).not.toBeNull();
        expect(b[result.move as number].player === undefined || b[result.move as number].bind <= 0).toBe(true);
    });

    it('10x10 でも2人戦のAIが実用的な時間で手を返す', () => {
        const b = emptyN(10);
        for (let k = 0; k < 12; k++) putN(b, k * 7, k % 2 ? '⭕' : '💙', 3);
        const ai = new AIPlayer('💙', 'you', ['⭕']);
        const t0 = Date.now();
        const move = ai.getBestMove(b, 5);
        expect(Date.now() - t0).toBeLessThan(5000);
        expect(move).not.toBeNull();
    });
});

describe('ヘイルメアリー (詰みでの使用)', () => {
    const costs = { onClickHailMary: 6, onClickUseLock: 2, onClickDoubleLock: 3, onClickTripleLock: 4 } as any;
    // ⭕が3つの脅威マス(3, 12, 15)を同時に持つ: 単ロックでは塞げない
    const lostBoard = () => {
        const b = emptyBoard();
        [0, 1, 2, 4, 8, 5, 10].forEach((i) => put(b, i, '⭕'));
        return b;
    };

    it('ロックで防げない詰みなら、魔力が足りてスロットにあれば使う', () => {
        const ai = new AIPlayer('💙', 'you', ['⭕']);
        const r = ai.makeMove(lostBoard(), 10, costs, 0, 5, [27, 0, 1], false);
        expect(r.hailMary).toBe(true);
    });
    it('魔力不足・スロットなし・自分に即勝ちがあるときは使わない', () => {
        const ai = new AIPlayer('💙', 'you', ['⭕']);
        expect(ai.makeMove(lostBoard(), 5, costs, 0, 5, [27, 0, 1], false).hailMary).toBeUndefined();
        expect(ai.makeMove(lostBoard(), 10, costs, 0, 5, [0, 1, 2], false).hailMary).toBeUndefined();
        const b = lostBoard();
        [13, 14, 15].forEach((i) => put(b, i, '💙')); // 12 に置けば 💙 の勝ち
        expect(ai.makeMove(b, 10, costs, 0, 5, [27, 0, 1], false).hailMary).toBeUndefined();
    });
    it('planHailMary: ストンプは敵の脅威を減らす中心を返し、審判の日は着手を返さない', () => {
        const ai = new AIPlayer('💙', 'you', ['⭕']);
        const stomp = ai.planHailMary(lostBoard(), 'ストンプ', 5);
        expect(stomp.target).not.toBeNull();
        expect(ai.planHailMary(lostBoard(), '審判の日', 5).move).toBeNull();
        expect(ai.planHailMary(lostBoard(), '蘇生', 5).target).toBeNull();
    });
});

describe('サイレンス (先回りの封印)', () => {
    const costs = { onClickSilence: 5 } as any;
    const quiet = () => {
        const b = emptyBoard();
        put(b, 0, '💙');
        put(b, 15, '⭕');
        return b;
    };
    it('相手が次の手番に固有スキルを撃てそうなら使う', () => {
        const ai = new AIPlayer('💙', 'you', ['⭕'], ['you', 'giant']);
        const r = ai.makeMove(quiet(), 8, costs, 5, 5, [28, 0, 1], false, 0, 0, 99, 99, false, [8, 5]);
        expect(r.skills).toContain('onClickSilence');
    });
    it('相手の魔力が足りない・固有スキルがない・スロットにない・魔力不足なら使わない', () => {
        const ai = new AIPlayer('💙', 'you', ['⭕'], ['you', 'giant']);
        expect(ai.makeMove(quiet(), 8, costs, 3, 5, [28, 0, 1], false, 0, 0, 99, 99, false, [8, 3]).skills).not.toContain('onClickSilence');
        expect(ai.makeMove(quiet(), 8, costs, 9, 5, [0, 1, 2], false, 0, 0, 99, 99, false, [8, 9]).skills).not.toContain('onClickSilence');
        expect(ai.makeMove(quiet(), 4, costs, 9, 5, [28, 0, 1], false, 0, 0, 99, 99, false, [4, 9]).skills).not.toContain('onClickSilence');
        const plain = new AIPlayer('💙', 'you', ['⭕'], ['you', 'fighter']);
        expect(plain.makeMove(quiet(), 8, costs, 9, 5, [28, 0, 1], false, 0, 0, 99, 99, false, [8, 9]).skills).not.toContain('onClickSilence');
    });
});

describe('毒使いのミアズマと毒花 (sim/ai.js と同じ動き)', () => {
    const costs = { onClickInjection: 2, onClickMiasma: 6, onClickToken: 4 } as never;
    const poisonedPiece = (bind: number, poison = 1): SquareInfo => ({
        player: '💙',
        bind,
        effects: Array.from({ length: poison }, () => ({ effect: '☠' as const })),
    });

    it('自陣の毒マスの周囲に敵が2マス以上いれば、ミアズマを撃つ', () => {
        const b = emptyBoard();
        b[5] = poisonedPiece(6);
        put(b, 6, '⭕', 3);
        put(b, 9, '⭕', 3);
        const ai = new AIPlayer('💙', 'poisoner', ['⭕']);
        const r = ai.makeMove(b, 10, costs, 2, 5, [], false);
        expect(r.skills).toContain('onClickMiasma');
    });

    it('敵が周囲に1マスだけ(リーチ列でもない)ならミアズマは撃たない', () => {
        const b = emptyBoard();
        b[5] = poisonedPiece(6);
        put(b, 6, '⭕', 3);
        const ai = new AIPlayer('💙', 'poisoner', ['⭕']);
        expect(ai.makeMove(b, 10, costs, 2, 5, [], false).skills).not.toContain('onClickMiasma');
    });

    it('毒花を装備した毒使いは、インジェクションが手札にあれば敵に隣接する自コマへ毒を盛る', () => {
        const b = emptyBoard();
        put(b, 5, '💙', 6);
        put(b, 6, '⭕', 3);
        const ai = new AIPlayer('💙', 'poisoner', ['⭕'], [], undefined, true);
        const r = ai.makeMove(b, 10, costs, 2, 5, [15], false);
        expect(r.skills).toEqual(['onClickInjection']);
        expect(r.stompTarget).toBe(5);
    });

    it('毒花が無ければ、同じ盤面でも自コマへ毒は盛らない', () => {
        const b = emptyBoard();
        put(b, 5, '💙', 6);
        put(b, 6, '⭕', 3);
        const ai = new AIPlayer('💙', 'poisoner', ['⭕']);
        const r = ai.makeMove(b, 10, costs, 2, 5, [15], false);
        expect(r.stompTarget).not.toBe(5);
    });

    it('毒花: 自陣の毒が多すぎる/ライフが低い自コマには盛らない', () => {
        const ai = new AIPlayer('💙', 'poisoner', ['⭕'], [], undefined, true);
        const many = emptyBoard();
        many[5] = poisonedPiece(9, 3);
        put(many, 6, '⭕', 3);
        expect(ai.makeMove(many, 10, costs, 2, 5, [15], false).stompTarget).not.toBe(5);
        const weak = emptyBoard();
        put(weak, 5, '💙', 3);
        put(weak, 6, '⭕', 3);
        expect(ai.makeMove(weak, 10, costs, 2, 5, [15], false).stompTarget).not.toBe(5);
    });
});
