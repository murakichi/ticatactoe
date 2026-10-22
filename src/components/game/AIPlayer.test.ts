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

describe('毒使いはトークン系スキルを手札でロックして残す (sim/ai.js と同じ)', () => {
    it('ポイズントークン(16)・トークン(3)を優先してロックする。両トークン(4)は対象外', () => {
        const ai = new AIPlayer('💙', 'poisoner', ['⭕']);
        const locks = ai.chooseLocks(emptyBoard(), 2, 5, [4, 16, 3, 7]);
        expect(locks).toEqual(expect.arrayContaining([16, 3]));
        expect(locks).not.toContain(4);
        expect(locks.length).toBeLessThanOrEqual(2);
    });

    it('他のキャラ(あなた)はこのロックを優先しない', () => {
        const ai = new AIPlayer('💙', 'you', ['⭕']);
        expect(ai.chooseLocks(emptyBoard(), 2, 5, [16])).not.toContain(16);
    });
});

describe('氷結・火炎への対応 (AI追随 Phase1)', () => {
    const FRZ = { effect: '❄' as const };
    const ai = new AIPlayer('💙', 'giant', ['⭕']);
    const frozen = (b: SquareInfo[], i: number, player: Player, bind = 5): void => {
        b[i] = { player, bind, effects: [FRZ] };
    };

    it('countReaches: 残り1マスが氷結中の空きマスならリーチと数えない（解けば数える）', () => {
        const b = emptyBoard();
        [0, 1, 2].forEach((i) => put(b, i, '💙'));
        expect(ai.countReaches(b, '💙')).toBe(1);
        b[3] = { player: undefined, bind: 0, effects: [FRZ] };
        expect(ai.countReaches(b, '💙')).toBe(0);
    });

    it('countReaches: ロック中（ライフ>0）の空きマスもリーチと数えない（findThreatSquares と同じ判定）', () => {
        const b = emptyBoard();
        [0, 1, 2].forEach((i) => put(b, i, '⭕'));
        b[3] = { player: undefined, bind: 3, effects: [{ effect: '🔑' }] };
        expect(ai.countReaches(b, '⭕')).toBe(0);
        expect(ai.findThreatSquares(b, '⭕')).toEqual([]);
    });

    it('evaluateBoard: 氷結中の空きマスを含むラインは評価しない', () => {
        const b = emptyBoard();
        [0, 1, 2].forEach((i) => put(b, i, '💙'));
        const open = ai.evaluateBoard(b);
        b[3] = { player: undefined, bind: 0, effects: [FRZ] };
        expect(ai.evaluateBoard(b)).toBeLessThan(open);
    });

    it('findStompTarget: 氷結中の敵は数えない（スキルダメージは❄1つが肩代わりする）', () => {
        const b = emptyBoard();
        frozen(b, 5, '⭕');
        frozen(b, 6, '⭕');
        expect(ai.findStompTarget(b)).toBeNull();
        put(b, 9, '⭕');
        expect(ai.findStompTarget(b)).toBeNull(); // 効く敵は1体だけ
        put(b, 10, '⭕');
        expect(ai.findStompTarget(b)).not.toBeNull();
    });

    it('simulateStomp: 氷結中の敵は壊れず❄が1つ減るだけ。自陣の氷結コマも守られる', () => {
        const b = emptyBoard();
        b[5] = { player: '⭕', bind: 5, effects: [FRZ, FRZ] };
        frozen(b, 6, '💙', 8);
        const nb = ai.simulateStomp(b, 5, '💙', 4);
        expect(nb[5].player).toBe('⭕');
        expect(nb[5].effects.filter((e) => e.effect === '❄')).toHaveLength(1);
        expect(nb[6].bind).toBe(8);
        expect(nb[6].effects).toHaveLength(0);
    });

    it('findJudgeTarget: 氷結中の敵は数えず、氷結中の自コマは壊れない扱い', () => {
        const b = emptyBoard();
        frozen(b, 5, '⭕');
        frozen(b, 6, '⭕');
        frozen(b, 9, '⭕');
        const mage = new AIPlayer('💙', 'magician', ['⭕']);
        expect(mage.findJudgeTarget(b)).toBeNull();
        put(b, 4, '⭕');
        put(b, 7, '⭕');
        expect(mage.findJudgeTarget(b)).not.toBeNull();
    });

    it('findRescueCenter: 氷結中の敵コマは壊せたものとして数えない', () => {
        const b = emptyBoard();
        [0, 1, 2].forEach((i) => frozen(b, i, '⭕'));
        // 氷結中の3つ並びは壊れないので、どの中心でも脅威(3)は消えない
        const c = ai.findRescueCenter(b, 'judge');
        expect(c).not.toBeNull();
        const threatsAfter = (center: number) => {
            const nb = b.map((sq) => ({ ...sq, effects: [...sq.effects] }));
            return ai.findThreatSquares(nb, '⭕').length;
        };
        expect(threatsAfter(c as number)).toBe(1);
    });
});

describe('氷室の番人: 単独のリーチは氷結で塞ぐ (AI追随 Phase2 B)', () => {
    const costs = { onClickUseLock: 2, onClickCryoFreeze: 2, onClickDoubleLock: 3, onClickTripleLock: 4 } as any;
    const threatBoard = () => {
        const b = emptyBoard();
        [0, 1, 2].forEach((i) => put(b, i, '⭕', 6));
        [4, 5].forEach((i) => put(b, i, '💙', 6));
        return b;
    };

    it('魔力が足りるとロック(=氷結)で脅威マス3を塞ぎ、着手は別のマスにする', () => {
        const ai = new AIPlayer('💙', 'cryomancer', ['⭕'], ['cryomancer', 'you']);
        const r = ai.makeMove(threatBoard(), 10, costs, 0, 4, [0, 1, 2], false);
        expect(r.skills).toEqual(['onClickUseLock']);
        expect(r.lockTargets).toEqual([3]);
        expect(r.move).not.toBeNull();
        expect(r.move).not.toBe(3);
    });

    it('魔力が足りない・氷室の番人でないときは従来どおり（脅威マスに自分で置く）', () => {
        const cryo = new AIPlayer('💙', 'cryomancer', ['⭕'], ['cryomancer', 'you']);
        expect(cryo.makeMove(threatBoard(), 1, costs, 0, 4, [0, 1, 2], false).move).toBe(3);
        const plain = new AIPlayer('💙', 'you', ['⭕'], ['you', 'you']);
        const r = plain.makeMove(threatBoard(), 10, costs, 0, 4, [0, 1, 2], false);
        expect(r.skills).not.toContain('onClickUseLock');
        expect(r.move).toBe(3);
    });
});

describe('休眠マス（氷結・火炎中）の見積もり (AI追随)', () => {
    const FRZ = { effect: '❄' as const };
    const FLM = { effect: '🔥' as const };

    it('雷霆の巫の⚡コマでも、氷結・火炎中は無敵（shield）に数えない', () => {
        const ai = new AIPlayer('💙', 'electrician', ['⭕'], ['electrician', 'you']);
        const b = emptyBoard();
        b[1] = { player: '💙', bind: 3, effects: [{ effect: '⚡' }] };
        b[2] = { player: '💙', bind: 3, effects: [{ effect: '⚡' }, FRZ] };
        b[3] = { player: '💙', bind: 3, effects: [{ effect: '⚡' }, FLM] };
        ai.updateShield(b);
        expect(ai.shield.has(1)).toBe(true);
        expect(ai.shield.has(2)).toBe(false);
        expect(ai.shield.has(3)).toBe(true); // 🔥だけでは⚡は休眠しない
    });

    it('休眠マス（氷結・火炎中）の毒は継続ダメージがないので、インジェクションの標的にしない', () => {
        const ai = new AIPlayer('💙', 'poisoner', ['⭕'], ['poisoner', 'you']);
        const b = emptyBoard();
        [0, 1, 2].forEach((i) => b[i] = { player: '⭕', bind: 1, effects: [{ effect: '☠' }] });
        expect(ai.findInjectionTarget(b, 1)).not.toBeNull();
        [0, 1, 2].forEach((i) => b[i] = { player: '⭕', bind: 1, effects: [{ effect: '☠' }, FRZ] });
        expect(ai.findInjectionTarget(b, 1)).toBeNull();
    });

    it('evaluateBoard: 休眠マスの🌱は評価しない', () => {
        const ai = new AIPlayer('💙', 'you', ['⭕']);
        const b = emptyBoard();
        b[5] = { player: '💙', bind: 3, effects: [{ effect: '🌱' }, { effect: '🌱' }] };
        const awake = ai.evaluateBoard(b);
        b[5] = { player: '💙', bind: 3, effects: [{ effect: '🌱' }, { effect: '🌱' }, FRZ] };
        expect(ai.evaluateBoard(b)).toBeLessThan(awake);
    });
});

describe('対氷結: 氷結中の空きマスで塞がれた自分のリーチを火遁で解く (AI追随)', () => {
    const FRZ = { effect: '❄' as const };
    const costs = { onClickIgnite: 3, onClickUseLock: 2, onClickDoubleLock: 3, onClickTripleLock: 4 } as any;
    const blockedBoard = () => {
        const b = emptyBoard();
        [0, 1, 2].forEach((i) => put(b, i, '💙', 5));
        b[3] = { player: undefined, bind: 0, effects: [FRZ] };
        put(b, 7, '⭕', 5);
        return b;
    };

    it('火遁が手札にあり魔力が足りれば、隣の敵コマ(7)を燃やして解凍し、そのマス(3)に着手する', () => {
        const ai = new AIPlayer('💙', 'you', ['⭕'], ['you', 'you']);
        const r = ai.makeMove(blockedBoard(), 10, costs, 0, 4, [31, 0, 1], false);
        expect(r.skills).toEqual(['onClickIgnite']);
        expect(r.lockTargets).toEqual([7]);
        expect(r.move).toBe(3);
    });

    it('火遁が無い・魔力が足りないときは使わない', () => {
        const ai = new AIPlayer('💙', 'you', ['⭕'], ['you', 'you']);
        expect(ai.makeMove(blockedBoard(), 10, costs, 0, 4, [0, 1, 2], false).skills).not.toContain('onClickIgnite');
        expect(ai.makeMove(blockedBoard(), 2, costs, 0, 4, [31, 0, 1], false).skills).not.toContain('onClickIgnite');
    });

    it('blockedReachCell / thawIgniteTarget: 敵のコマを優先し、氷結中のコマは選ばない', () => {
        const ai = new AIPlayer('💙', 'you', ['⭕'], ['you', 'you']);
        const b = blockedBoard();
        expect(ai.blockedReachCell(b)).toBe(3);
        expect(ai.thawIgniteTarget(b, 3)).toBe(7);
        b[7] = { player: '⭕', bind: 5, effects: [FRZ] };
        expect(ai.thawIgniteTarget(b, 3)).toBe(2); // 敵が氷結中 → 自陣(2)にフォールバック
    });
});

describe('鍛冶師AI: 軽減札で業火を安く撃つ', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { skillCosts } = require('./skillCosts');
    const setup = (magic: number, hand: number[]) => {
        const ai = new AIPlayer('💙', 'pyromancer', ['⭕'], ['pyromancer', 'you']);
        const b: SquareInfo[] = Array.from({ length: 16 }, () => ({ player: undefined, bind: 0, effects: [] }));
        [1, 2, 3].forEach((i) => (b[i] = { player: '⭕', bind: 5, effects: [] }));
        return ai.makeMove(b, magic, skillCosts, 2, 5, hand, false);
    };
    it('魔力が足りないとき、軽減札を先に撃ってから業火を撃つ', () => {
        const r = setup(6, [58, 0, 3]);
        expect(r.chargeClicks?.map((c) => c.skill)).toEqual(['onClickClearance', 'onClickInferno']);
    });
    it('軽減札が手札にない・魔力が足りなければ業火は撃たない', () => {
        expect(setup(6, [0, 3, 5]).chargeClicks).toBeUndefined();
        expect(setup(3, [58, 0, 3]).chargeClicks).toBeUndefined();
    });
    it('業火のあと、敵のコマが自陣より2つ以上多く壊れるならバーンアウトを撃つ（🔥合計4以上でタダ）', () => {
        const r = setup(9, [61, 0, 3]);
        expect(r.chargeClicks?.map((c) => c.skill)).toEqual(['onClickInferno', 'onClickBurnout']);
        expect(setup(9, [0, 3, 5]).chargeClicks?.map((c) => c.skill)).toEqual(['onClickInferno']);
    });
    it('鍛冶師は軽減札を固定しない（固定すると勝ち数が下がった）', () => {
        const ai = new AIPlayer('💙', 'pyromancer', ['⭕'], ['pyromancer', 'you']);
        const b: SquareInfo[] = Array.from({ length: 16 }, () => ({ player: undefined, bind: 0, effects: [] }));
        expect(ai.chooseLocks(b, 2, 5, [53, 3, 60])).not.toEqual(expect.arrayContaining([53, 60]));
    });
});

describe('軽減札を先に撃って通常スキルを撃てるようにする', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { skillCosts } = require('./skillCosts');
    const run = (magic: number, hand: number[]) => {
        const ai = new AIPlayer('💙', 'you', ['⭕'], ['you', 'you']);
        const b: SquareInfo[] = Array.from({ length: 16 }, () => ({ player: undefined, bind: 0, effects: [] }));
        // 劣勢（敵3コマ・自陣なし）で、敵が斜めに2つ並んでいる → スラッシュ（5）を撃つ
        [0, 3, 6].forEach((i) => (b[i] = { player: '⭕', bind: 5, effects: [] }));
        return ai.makeMove(b, magic, skillCosts, 2, 5, hand, false);
    };
    it('魔力4ではスラッシュ（5）を撃てないが、特売（1）を先に撃てばスラッシュが2で撃てる', () => {
        expect(run(4, [5, 12, 0]).skills).not.toContain('onClickSlash');
        const r = run(4, [53, 5, 12]);
        expect(r.chargeClicks?.map((c) => c.skill)).toEqual(['onClickMarkdown']);
        expect(r.skills).toContain('onClickSlash');
    });
    it('撃てるスキルが増えなくても、特売のコストより軽減が大きく魔力が余るなら先に撃つ', () => {
        expect(run(5, [53, 5, 12]).chargeClicks?.map((c) => c.skill)).toEqual(['onClickMarkdown']);
    });
    it('軽減札が手札にない・撃てるスキルが無いなら軽減札は撃たない', () => {
        expect(run(5, [5, 12, 0]).chargeClicks).toBeUndefined();
        expect(run(0, [53, 5, 12]).chargeClicks).toBeUndefined();
    });
});

describe('AIPlayer cryomancer frost cards (sim/ai.js F.cryoCards と同一)', () => {
    const { skillCosts } = require('./skillCosts');
    const plan = (character: 'cryomancer' | 'you', avail: number[]) => {
        const b = emptyBoard();
        put(b, 0, '💙', 1);
        put(b, 1, '💙', 2);
        put(b, 15, '⭕', 5);
        const ai = new AIPlayer('💙', character, ['⭕']);
        return ai.chooseSkills(b, 20, skillCosts, 0, 5, avail, false);
    };
    it('氷室の番人は霜降り・氷結トークンを使う', () => {
        const skills = plan('cryomancer', [45, 48]);
        expect(skills).toContain('onClickFrostfall');
        expect(skills).toContain('onClickFrostToken');
    });
    it('他キャラは使わない', () => {
        const skills = plan('you', [45, 48]);
        expect(skills).not.toContain('onClickFrostfall');
        expect(skills).not.toContain('onClickFrostToken');
    });
});

describe('魔法使いAI: 撃てるスキルが無いとき軽減札→引き直し（sim/ai.js の discountPlan>=2）', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { skillCosts } = require('./skillCosts');
    const mk = (character: 'magician' | 'giant' = 'magician') => {
        const ai = new AIPlayer('💙', character, ['⭕'], [character, 'you']);
        ai.rerollsLeft = 2;
        return ai;
    };
    const board = () => Array.from({ length: 16 }, () => ({ player: undefined, bind: 0, effects: [] } as SquareInfo));
    const run = (ai: AIPlayer, magic: number, hand: number[]) => ai.makeMove(board(), magic, skillCosts, 2, 5, hand, false);

    it('手札が軽減札だけで魔力に余裕があれば、軽減札を撃ってから引き直す', () => {
        const r = run(mk(), 12, [60, 53]);
        expect(r.reroll).toBeDefined();
        expect(r.reroll?.discount).toBeDefined();
        expect(r.skills).toEqual([]);
    });
    it('魔力が足りない（軽減札+シャッフル+撃つ分）ときは引き直さない', () => {
        expect(run(mk(), 4, [53]).reroll).toBeUndefined();
    });
    it('引き直しの回数が残っていなければ引き直さない', () => {
        const ai = mk();
        ai.rerollsLeft = 0;
        expect(run(ai, 12, [53]).reroll).toBeUndefined();
    });
    it('魔法使い以外は引き直さない', () => {
        expect(run(mk('giant'), 12, [53]).reroll).toBeUndefined();
    });
    it('引き直しの途中（軽減済み）は、魔力に余裕があればシャッフルだけ行う', () => {
        const ai = mk();
        ai.discountActive = true;
        ai.rerollsLeft = 1;
        const r = run(ai, 12, [53]);
        expect(r.reroll).toEqual({});
        expect(run(ai, 2, [53]).reroll).toBeUndefined();
    });
});

describe('魔法使いAI: バッズ駒を1手番に複数ロックする（sim/ai.js の magLockN=3）', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { skillCosts } = require('./skillCosts');
    const budBoard = (cells: number[]) => {
        const b: SquareInfo[] = Array.from({ length: 16 }, () => ({ player: undefined, bind: 0, effects: [] }));
        cells.forEach((i) => (b[i] = { player: '💙', bind: 4, effects: [{ effect: '🌱' }] }));
        return b;
    };
    const run = (cells: number[], magic: number) => {
        const ai = new AIPlayer('💙', 'magician', ['⭕'], ['magician', 'you']);
        return ai.makeMove(budBoard(cells), magic, skillCosts, 2, 5, [], false);
    };
    it('バッズ駒が複数あり魔力が足りれば、最大3つまで順にロックする', () => {
        const r = run([0, 1, 2, 3], 9);
        expect(r.chargeClicks?.map((c) => c.skill)).toEqual(['onClickUseLock', 'onClickUseLock', 'onClickUseLock']);
        expect(r.chargeClicks?.map((c) => c.target)).toEqual([0, 1, 2]);
    });
    it('魔力で払える数までに減らす', () => {
        const r = run([0, 1, 2], skillCosts.onClickUseLock * 2);
        expect(r.chargeClicks?.length).toBe(2);
    });
    it('1つだけなら従来どおり lockTargets で返す', () => {
        const r = run([5], 9);
        expect(r.skills).toEqual(['onClickUseLock']);
        expect(r.lockTargets).toEqual([5]);
        expect(r.chargeClicks).toBeUndefined();
    });
    it('魔法使い以外は複数ロックしない', () => {
        const ai = new AIPlayer('💙', 'giant', ['⭕'], ['giant', 'you']);
        const r = ai.makeMove(budBoard([0, 1, 2]), 9, skillCosts, 2, 5, [], false);
        expect(r.chargeClicks?.filter((c) => c.skill === 'onClickUseLock').length ?? 0).toBe(0);
    });
});

describe('土壇場の防壁 × 陰陽師', () => {
    const reachBoard = (): SquareInfo[] => {
        const b = emptyBoard();
        [0, 1, 2].forEach((i) => put(b, i, '⭕'));
        return b;
    };
    it('防壁が未発動の間は相手の即勝ちを塞がない', () => {
        const ai = new AIPlayer('💙', 'yinYangMaster', ['⭕']);
        ai.lastStandOpen = true;
        // 即ブロックの探索(相手の着手列挙)に入らない。Minimax 側の評価は従来どおり
        const spy = jest.spyOn(ai as any, 'getMovesFor');
        const board = reachBoard();
        ai.getBestMove(board, 5);
        expect(spy.mock.calls.some((c) => c[0] === board)).toBe(false);
    });
    it('防壁が無い(または発動済み)なら塞ぐ', () => {
        const ai = new AIPlayer('💙', 'yinYangMaster', ['⭕']);
        const spy = jest.spyOn(ai as any, 'getMovesFor');
        const board = reachBoard();
        expect(ai.getBestMove(board, 5)).toBe(3);
        expect(spy.mock.calls.some((c) => c[0] === board)).toBe(true);
    });
});

describe('陰陽師の式神運用 (sim/ai.js shikigamiTurn と同一)', () => {
    const costs = { onClickShikigamiPlace: 3, onClickShikigamiBlast: 5, onClickShikigamiAll: 6, onClickShikigamiRandom: 2, onClickToggleYingYang: 1 } as any;
    const shiki = (b: SquareInfo[], i: number, player: Player = '💙') => { b[i] = { player, bind: 2, effects: [{ effect: '📜' }] }; };
    const mk = () => new AIPlayer('💙', 'yinYangMaster', ['⭕']);

    it('陰で魔力に余裕があれば、敵コマの近くに式神を置く', () => {
        const b = emptyBoard();
        put(b, 0, '⭕', 3);
        put(b, 1, '⭕', 3);
        const plan = mk().planShikigami(b, 14, costs, [0]);
        expect(plan?.clicks[0].skill).toBe('onClickShikigamiPlace');
        expect([4, 5, 6, 2].includes(plan!.clicks[0].target!)).toBe(true);
    });

    it('式神を置いたあとに魔力が残らない（貯めたい）ときは置かない', () => {
        const b = emptyBoard();
        put(b, 0, '⭕', 3);
        expect(mk().planShikigami(b, 8, costs, [0])).toBeNull();
    });

    it('爆破の価値がある式神があれば、陰からは転化して爆破する', () => {
        const b = emptyBoard();
        shiki(b, 5);
        put(b, 0, '⭕', 3);
        put(b, 1, '⭕', 3);
        const plan = mk().planShikigami(b, 12, costs, [0]);
        expect(plan?.clicks.map((c) => c.skill)).toEqual(['onClickToggleYingYang', 'onClickShikigamiBlast']);
        expect(plan?.clicks[1].target).toBe(5);
        // 爆破後: 式神は消え、敵の0・1は壊れ、周囲の空きマスは式神になる
        expect(plan!.board[5].player).toBeUndefined();
        expect(plan!.board[0].player).toBeUndefined();
        expect(plan!.board[4].effects.some((e) => e.effect === '📜')).toBe(true);
    });

    it('式神一括: 自コマ1+式神置き3で列を完成できる魔力があればコンボを組む', () => {
        const b = emptyBoard();
        put(b, 0, '💙', 3);
        const plan = mk().planShikigami(b, 15, costs, [62, 0]);
        expect(plan?.win).toBe(true);
        expect(plan?.clicks.map((c) => c.skill)).toEqual(['onClickShikigamiPlace', 'onClickShikigamiPlace', 'onClickShikigamiPlace', 'onClickShikigamiAll']);
        expect(mk().planShikigami(b, 14, costs, [62, 0])?.win ?? false).toBe(false);
    });

    it('式神は列に数えない: 式神を含む列はリーチ扱いにならず、式神は脅威にも数えない', () => {
        const ai = mk();
        const b = emptyBoard();
        [0, 1, 2].forEach((i) => put(b, i, '⭕'));
        shiki(b, 3, '⭕');
        expect(ai.countReaches(b, '⭕')).toBe(0);
        expect(ai.findThreatSquares(b, '⭕')).not.toContain(3);
    });
});
