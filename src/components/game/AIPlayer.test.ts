import AIPlayer from './AIPlayer';
import { SquareInfo } from '../../types/SquareInfo';
import { Player } from '../../types/Player';
import { calculateWinner } from '../../util';
import { geometryForCells } from './boardGeometry';

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
    it('giant findStompTarget fires with >=1 enemy in range (stomp costs 2)', () => {
        const giant = new AIPlayer('💙', 'giant', ['⭕']);
        const two = emptyBoard();
        put(two, 0, '⭕');
        put(two, 1, '⭕');
        expect(giant.findStompTarget(two)).not.toBeNull();

        const one = emptyBoard();
        put(one, 0, '⭕');
        expect(giant.findStompTarget(one)).not.toBeNull();

        expect(giant.findStompTarget(emptyBoard())).toBeNull();
    });

    it('giant applyAuraSim: 周囲の敵コマを壊し、周囲8マスをロックする', () => {
        const giant = new AIPlayer('💙', 'giant', ['⭕']);
        const b = emptyBoard();
        put(b, 0, '⭕', 3);
        put(b, 2, '💙', 3);
        const sim = giant.applyAuraSim(b.map((sq) => ({ ...sq, effects: [...sq.effects] })), 1);
        expect(sim[0].player).toBeUndefined();
        expect(sim[0].effects.some((e) => e.effect === '🔑')).toBe(true);
        expect(sim[2].player).toBe('💙');
        expect(sim[2].effects.some((e) => e.effect === '🔑')).toBe(true);
    });

    it('giant stomps to cut an opponent reach before locking (stompDef)', () => {
        const giant = new AIPlayer('💙', 'giant', ['⭕']);
        const b = emptyBoard();
        [0, 1, 2].forEach((i) => put(b, i, '⭕', 3)); // ⭕が3つ並び、4つ目の3が脅威
        const stompCosts = { onClickStomp: 3, onClickUseLock: 2 } as never;
        const r = giant.makeMove(b, 6, stompCosts, 2, 5, [], false);
        expect(r.skills).toEqual(['onClickStomp']);
        expect(r.stompTarget).not.toBeNull();
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
        expect(ai.findStompTarget(b)).toBeNull(); // 氷結中の敵だけでは撃たない
        put(b, 9, '⭕');
        expect(ai.findStompTarget(b)).not.toBeNull(); // 効く敵が1体いれば撃つ（コスト2）
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

describe('氷室の番人: 魔法使いの🌱付きコマを凍らせる (sim/ai.js F.freezeBuds と同一)', () => {
    const costs = { onClickUseLock: 2, onClickCryoFreeze: 2, onClickDoubleLock: 3, onClickTripleLock: 4 } as any;
    const budBoard = (budEffects: SquareInfo['effects'] = [{ effect: '🌱' }]) => {
        const b = emptyBoard();
        put(b, 5, '💙', 6);
        put(b, 10, '⭕', 3);
        b[10] = { ...b[10], effects: budEffects };
        return b;
    };
    it('魔法使いの🌱付きでロックされていないコマを氷結する', () => {
        const ai = new AIPlayer('💙', 'cryomancer', ['⭕'], ['cryomancer', 'magician']);
        const r = ai.makeMove(budBoard(), 10, costs, 0, 4, [0, 1, 2], false);
        expect(r.skills).toEqual(['onClickUseLock']);
        expect(r.lockTargets).toEqual([10]);
    });
    it('ロックされている・魔法使い以外・魔力不足なら凍らせない', () => {
        const ai = new AIPlayer('💙', 'cryomancer', ['⭕'], ['cryomancer', 'magician']);
        expect(ai.makeMove(budBoard([{ effect: '🌱' }, { effect: '🔑' }]), 10, costs, 0, 4, [0, 1, 2], false).lockTargets).toBeUndefined();
        expect(ai.makeMove(budBoard(), 1, costs, 0, 4, [0, 1, 2], false).lockTargets).toBeUndefined();
        const vsPoisoner = new AIPlayer('💙', 'cryomancer', ['⭕'], ['cryomancer', 'poisoner']);
        expect(vsPoisoner.makeMove(budBoard(), 10, costs, 0, 4, [0, 1, 2], false).lockTargets).toBeUndefined();
    });
});

describe('氷室の番人: 毒で倒れそうな自陣コマを先に凍らせる (sim/ai.js F.antiPoison と同一)', () => {
    const costs = { onClickUseLock: 2, onClickCryoFreeze: 2, onClickDoubleLock: 3, onClickTripleLock: 4 } as any;
    const poisonBoard = (poison: number, life = 3) => {
        const b = emptyBoard();
        put(b, 5, '💙', life);
        b[5] = { ...b[5], effects: Array.from({ length: poison }, () => ({ effect: '☠' as const })) };
        put(b, 10, '⭕', 6);
        return b;
    };
    it('毒≥ライフ-2 の自陣コマを氷結する', () => {
        const ai = new AIPlayer('💙', 'cryomancer', ['⭕'], ['cryomancer', 'giant']);
        const r = ai.makeMove(poisonBoard(1), 10, costs, 0, 4, [0, 1, 2], false);
        expect(r.skills).toEqual(['onClickUseLock']);
        expect(r.lockTargets).toEqual([5]);
    });
    it('毒が無い・ライフに余裕がある・魔力不足・氷室の番人でないときは凍らせない', () => {
        const ai = new AIPlayer('💙', 'cryomancer', ['⭕'], ['cryomancer', 'giant']);
        expect(ai.makeMove(poisonBoard(0), 10, costs, 0, 4, [0, 1, 2], false).lockTargets).toBeUndefined();
        expect(ai.makeMove(poisonBoard(1, 6), 10, costs, 0, 4, [0, 1, 2], false).lockTargets).toBeUndefined();
        expect(ai.makeMove(poisonBoard(1), 1, costs, 0, 4, [0, 1, 2], false).lockTargets).toBeUndefined();
        const plain = new AIPlayer('💙', 'you', ['⭕'], ['you', 'giant']);
        expect(plain.makeMove(poisonBoard(1), 10, costs, 0, 4, [0, 1, 2], false).lockTargets).toBeUndefined();
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
        // 火遁(固有)は撃つが、業火は撃たない
        expect(setup(6, [0, 3, 5]).chargeClicks?.map((c) => c.skill)).toEqual(['onClickIgnite']);
        expect(setup(3, [58, 0, 3]).chargeClicks?.map((c) => c.skill)).not.toContain('onClickInferno');
    });
    it('業火のあと、敵のコマが自陣より2つ以上多く壊れるならバーンアウトを撃つ（🔥合計4以上でタダ）', () => {
        const r = setup(9, [61, 0, 3]);
        // 火遁(固有)→業火→バーンアウトの順。火遁で魔力を使っても業火が撃てるときだけ火遁を撃つ
        expect(r.chargeClicks?.map((c) => c.skill)).toEqual(['onClickIgnite', 'onClickInferno', 'onClickBurnout']);
        expect(setup(9, [0, 3, 5]).chargeClicks?.map((c) => c.skill)).toEqual(['onClickIgnite', 'onClickInferno']);
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
    it('魔法使い以外は、魔力が有り余っていなければ引き直さない', () => {
        expect(run(mk('giant'), 11, [53]).reroll).toBeUndefined();
    });
    it('魔法使い以外も、魔力が有り余っていて撃てるスキルが無ければ、軽減札を使わずシャッフルだけ行う', () => {
        const r = run(mk('poisoner'), 12, [53]);
        expect(r.reroll).toEqual({});
        expect(r.skills).toEqual([]);
    });
    it('魔法使い以外が有り余っていても、引き直しの回数が残っていなければ引き直さない', () => {
        const ai = mk('poisoner');
        ai.rerollsLeft = 0;
        expect(run(ai, 12, [53]).reroll).toBeUndefined();
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

describe('AIPlayer: 着手後の減衰で奪われる自コマ', () => {
    it('ライフ1の自コマが減衰で0になり相手の4つ目になるなら、その自コマを補強する', () => {
        const ai = new AIPlayer('💙', 'you', ['⭕']);
        const b = emptyBoard();
        put(b, 0, '💙', 1);
        [1, 2, 3].forEach((i) => put(b, i, '⭕', 5));
        expect(ai.getBestMove(b, 3)).toBe(0);
    });

    it('3人以上で減衰しない着手なら、ライフ1のコマを見込みで守らなくてよい', () => {
        const ai = new AIPlayer('💙', 'you', ['⭕', '🟩'], ['you', 'you', 'you']);
        ai.seatCount = 3;
        ai.placements = 1; // 1 % 3 !== 0: この着手では減衰しない
        const b = emptyBoard();
        put(b, 0, '💙', 1);
        [1, 2, 3].forEach((i) => put(b, i, '⭕', 5));
        expect(ai.simulatePlace(b, 5, '💙', 3, 0)[0].bind).toBe(1);
        ai.placements = 0;
        expect(ai.simulatePlace(b, 5, '💙', 3, 0)[0].bind).toBe(0);
    });
});

describe('AIPlayer: 補強は必要なときだけ', () => {
    it('奪われても負けないライフ1の自コマは補強の候補にしない', () => {
        const ai = new AIPlayer('💙', 'you', ['⭕']);
        const b = emptyBoard();
        put(b, 0, '💙', 1);
        [5, 6].forEach((i) => put(b, i, '⭕', 5));
        expect(ai.reinforceMoves(b, 3)).toEqual([]);
    });
    it('奪われると相手が4つ揃うライフ1の自コマは補強の候補にする', () => {
        const ai = new AIPlayer('💙', 'you', ['⭕']);
        const b = emptyBoard();
        put(b, 0, '💙', 1);
        [1, 2, 3].forEach((i) => put(b, i, '⭕', 5));
        expect(ai.reinforceMoves(b, 3)).toEqual([0]);
    });
});

describe('陰陽師の式神運用 (sim/ai.js shikigamiTurn と同一)', () => {
    const costs = { onClickShikigamiPlace: 3, onClickShikigamiBlast: 5, onClickShikigamiAll: 2, onClickShikigamiRandom: 2, onClickToggleYingYang: 1 } as any; // 式神一括は式神1体あたり2
    // 終盤の盤面: 行0(0〜3)だけが空き、残りは敵のコマ。百鬼夜行で空き4マスが式神になり、行0が敵のいない列になる
    const nearFull = (): SquareInfo[] => {
        const b = emptyBoard();
        // 行1〜3: ⭕⭕💙💙 / 💙💙⭕⭕ / ⭕⭕💙💙（どの列にもリーチが出ない並び）
        const pattern: Player[] = ['⭕', '⭕', '💙', '💙', '💙', '💙', '⭕', '⭕', '⭕', '⭕', '💙', '💙'];
        pattern.forEach((p, k) => put(b, 4 + k, p, 3));
        return b;
    };
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
        const plan = mk().planShikigami(b, 15, costs, [71, 0]);
        expect(plan?.win).toBe(true);
        expect(plan?.clicks.map((c) => c.skill)).toEqual(['onClickShikigamiPlace', 'onClickShikigamiPlace', 'onClickShikigamiPlace', 'onClickShikigamiAll']);
        expect(mk().planShikigami(b, 11, costs, [71, 0])?.win ?? false).toBe(false); // 式神を置くパッシブ（2体目以降の設置と一括が各-1）で総額が3安く、最低魔力は12
    });

    it('百鬼夜行+式神一括: 空きマスを全て自コマにして列が完成するなら一手番でコンボを撃つ', () => {
        const flood = { ...costs, onClickShikigamiFlood: 7 };
        const b = nearFull(); // 式神になる空き4マス → 式神一括は 2×4 = 8
        const plan = mk().planShikigami(b, 15, flood, [73, 71]);
        expect(plan?.win).toBe(true);
        expect(plan?.clicks.map((c) => c.skill)).toEqual(['onClickShikigamiFlood', 'onClickShikigamiAll']);
        expect(mk().planShikigami(b, 13, flood, [73, 71])?.win ?? false).toBe(false); // 魔力が足りない
        // 序盤（空きが多い）は式神一括が式神の数に比例して重く、盤面を埋めるコンボは撃てない
        const early = emptyBoard();
        put(early, 0, '⭕', 3);
        expect(mk().planShikigami(early, 30, flood, [73, 71])?.win ?? false).toBe(false);
    });

    it('特売(53)が手札にあれば重ね撃ちしてコンボのコストを圧縮する（特売×2→百鬼夜行→特売×2→式神一括。終盤の盤面で 7+8=15 → 7）', () => {
        const withMd = { ...costs, onClickShikigamiFlood: 7, onClickMarkdown: 1 };
        const b = nearFull();
        const plan = mk().planShikigami(b, 7, withMd, [73, 71, 53]);
        expect(plan?.win).toBe(true);
        expect(plan?.clicks.map((c) => c.skill)).toEqual([
            'onClickMarkdown', 'onClickMarkdown', 'onClickShikigamiFlood', 'onClickMarkdown', 'onClickMarkdown', 'onClickShikigamiAll',
        ]);
        // 5魔力では足りない。特売が無ければ（式神を置くパッシブで-1して）7+7=14 必要
        expect(mk().planShikigami(b, 5, withMd, [73, 71, 53])?.win ?? false).toBe(false);
        expect(mk().planShikigami(b, 13, withMd, [73, 71])?.win ?? false).toBe(false);
    });

    it('シャッフル探索: 勝てる盤面でコンボ札が揃わず、魔力が足りるなら引き直す。揃っているか魔力が足りなければ引き直さない', () => {
        const dig = { ...costs, onClickShikigamiFlood: 7, onClickMarkdown: 1, onClickShuffle: 1 };
        const b = nearFull(); // 特売が引ける前提のコンボは 7 、探索に +1
        const ai = mk();
        ai.rerollsLeft = 8;
        expect(ai.makeMove(b, 8, dig, 3, 2, [2, 0, 3], false).reroll).toBeDefined(); // 札が無く、7+1 以上ある
        expect(ai.makeMove(b, 6, dig, 3, 2, [2, 0, 3], false).reroll).toBeUndefined(); // 魔力が足りない
        expect(ai.makeMove(b, 8, dig, 3, 2, [71, 73, 53], false).reroll).toBeUndefined(); // 揃っている
        ai.rerollsLeft = 0;
        expect(ai.makeMove(b, 8, dig, 3, 2, [2, 0, 3], false).reroll).toBeUndefined(); // 引き直しの回数切れ
    });

    it('デッキを把握している: コンボ札がデッキに無ければ、引き直しても揃わないので探さない。特売が無ければ「引ける前提」の計画にしない', () => {
        const dig = { ...costs, onClickShikigamiFlood: 7, onClickMarkdown: 1, onClickShuffle: 1 };
        const b = nearFull();
        const rest = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
        const mkDeck = (deck: number[]) => { const ai = new AIPlayer('💙', 'yinYangMaster', ['⭕'], [], undefined, false, false, deck); ai.rerollsLeft = 8; return ai; };
        expect(mkDeck([71, 73, ...rest]).makeMove(b, 20, dig, 3, 2, [2, 0, 3], false).reroll).toBeDefined(); // 札はデッキにある
        expect(mkDeck([73, 53, ...rest]).makeMove(b, 20, dig, 3, 2, [2, 0, 3], false).reroll).toBeUndefined(); // 百鬼夜行が無い
        expect(mkDeck([71, 53, ...rest]).makeMove(b, 20, dig, 3, 2, [2, 0, 3], false).reroll).toBeUndefined(); // 式神一括が無い
        const noMd = mkDeck([71, 73, ...rest]);
        expect(noMd.inDeck(53, [0])).toBe(false);
        expect(noMd.inDeck(53, [53])).toBe(true); // 手札にあればデッキにある
        // 特売が無いデッキの計画は、特売を引ける前提(assumeMd)でも特売なしのコストになる
        expect(noMd.comboPlan(b, dig, [0], true).total).toBeGreaterThan(mk().comboPlan(b, dig, [0], true).total);
    });

    it('チャージ待ち: 勝てる盤面で相手のリーチが無く、探索に足りない魔力なら、駒を置かずチャージする', () => {
        const dig = { ...costs, onClickShikigamiFlood: 7, onClickMarkdown: 1, onClickShuffle: 1 };
        const b = nearFull();
        const r = mk().makeMove(b, 4, dig, 3, 2, [2, 0, 3], false);
        expect(r.skills).toEqual(['onClickCharge']);
        expect(r.move).toBeNull();
        // 魔力が足りれば（探索に回る）チャージしない
        expect(mk().makeMove(b, 8, dig, 3, 2, [2, 0, 3], false).skills).not.toContain('onClickCharge');
        // 相手のリーチがあるときは防御を優先する
        const threat = emptyBoard();
        [4, 5, 6].forEach((i) => put(threat, i, '⭕'));
        expect(mk().makeMove(threat, 4, dig, 3, 2, [2, 0, 3], false).skills).not.toContain('onClickCharge');
    });

    it('引き直しのたびに固定し直すと、見つけたコンボ札は次のシャッフルで失われず、やがて3枚揃う（Game.tsx の reshuffledSkills と同じ規則）', () => {
        // Game.tsx reshuffledSkills: 固定(最大3)を残し、残り枠をデッキから埋める
        let seed = 12345;
        const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
        const deck = [0, 2, 3, 5, 6, 8, 10, 12, 71, 72, 73, 53];
        const reshuffle = (locks: number[]): number[] => {
            const keep = locks.slice(0, 3);
            const pool = deck.filter((i) => !keep.includes(i)).sort(() => rnd() - 0.5);
            return [...keep, ...pool.slice(0, 3 - keep.length)];
        };
        const ai = mk();
        let hand = reshuffle([]);
        let prevFound: number[] = [];
        for (let step = 0; step < 60 && !(hand.includes(71) && hand.includes(73) && hand.includes(53)); step++) {
            const locks = ai.chooseLocks(emptyBoard(), 0, 5, hand); // 引き直しのたび（再計画のたび）に走る
            hand = reshuffle(locks);
            prevFound.forEach((c) => expect(hand).toContain(c)); // 見つけた札は残る
            prevFound = locks;
        }
        expect([71, 73, 53].every((c) => hand.includes(c))).toBe(true);
    });

    it('コンボ札(71/73)と特売(53)を手札に固定する', () => {
        expect(mk().chooseLocks(emptyBoard(), 0, 5, [53, 71, 3, 73])).toEqual([53, 71, 73]);
    });

    it('コンボ札(71/73)だけを手札に固定する', () => {
        const ai = mk();
        expect(ai.chooseLocks(emptyBoard(), 0, 5, [0, 71, 3, 73])).toEqual([71, 73]);
        expect(ai.chooseLocks(emptyBoard(), 0, 5, [0, 2, 3])).toEqual([]);
    });

    it('コンボ札を持っていて魔力が足りないうちは、他のスキルに魔力を使わず貯める。相手のリーチがあるときは防御する', () => {
        const hold = { ...costs, onClickShikigamiFlood: 7, onClickBuds: 2, onClickAddLife: 3 };
        const b = emptyBoard();
        put(b, 0, '⭕', 3);
        const r = mk().makeMove(b, 8, hold, 3, 2, [71, 2, 0], false);
        expect(r.skills).toEqual([]);
        expect(r.chargeClicks).toBeUndefined();
        // 札が無いときは従来どおり撃つ
        const free = mk().makeMove(b, 8, hold, 3, 2, [2, 0, 3], false);
        expect(free.skills.length + (free.chargeClicks?.length ?? 0)).toBeGreaterThan(0);
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

describe('鍛冶師AI: 空蔵で自分の列の要になる空きマスを先にロックする（sim/ai.js の EL_AI）', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { skillCosts } = require('./skillCosts');
    // 行0に💙が2つ(0,1)あり、2が空き(3つ並びの要)。相手のリーチは無い
    const board = () => {
        const b: SquareInfo[] = Array.from({ length: 16 }, () => ({ player: undefined, bind: 0, effects: [] }));
        b[0] = { player: '💙', bind: 4, effects: [] };
        b[1] = { player: '💙', bind: 4, effects: [] };
        return b;
    };
    const run = (hasEmptyLock: boolean, magic: number, b: SquareInfo[] = board()) => {
        const ai = new AIPlayer('💙', 'pyromancer', ['⭕'], ['pyromancer', 'you'], undefined, false, hasEmptyLock);
        return ai.makeMove(b, magic, skillCosts, 2, 5, [], false);
    };

    it('空蔵を装備していれば、空きマスをロックする（lockTargets に空きマスが入る）', () => {
        const r = run(true, 6);
        expect(r.skills).toEqual(['onClickUseLock']);
        expect(r.lockTargets).toHaveLength(1);
        expect(board()[r.lockTargets![0]].player).toBeUndefined();
    });
    it('空蔵を装備していなければロックしない', () => {
        expect(run(false, 6).lockTargets).toBeUndefined();
    });
    it('魔力がロックのコストに足りなければロックしない', () => {
        expect(run(true, 1).lockTargets).toBeUndefined();
    });
    it('自分がかけた空きマスロックが上限(2)に達していればかけない', () => {
        const b = board();
        b[2] = { player: undefined, bind: 6, effects: [{ effect: '🔑', value: 1 }] };
        b[3] = { player: undefined, bind: 6, effects: [{ effect: '🔑', value: 1 }] };
        expect(run(true, 6, b).lockTargets).toBeUndefined();
    });
});

describe('鍛冶師AI: 固有の火遁で敵コマを燃やす（sim/ai.js の igniteSig=1 / igniteSkip=1）', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { skillCosts } = require('./skillCosts');
    const board = () => {
        const b: SquareInfo[] = Array.from({ length: 16 }, () => ({ player: undefined, bind: 0, effects: [] }));
        b[0] = { player: '💙', bind: 4, effects: [] };
        b[5] = { player: '⭕', bind: 4, effects: [] };
        b[6] = { player: '⭕', bind: 2, effects: [] };
        return b;
    };
    const run = (foe: 'you' | 'necromancer', magic: number, b: SquareInfo[] = board()) => {
        const ai = new AIPlayer('💙', 'pyromancer', ['⭕'], ['pyromancer', foe]);
        return ai.makeMove(b, magic, skillCosts, 2, 5, [], false);
    };

    it('魔力が足りれば、ライフが残る敵コマに火遁を撃つ（ライフの高いほう）', () => {
        const r = run('you', 6);
        const click = r.chargeClicks?.find((c) => c.skill === 'onClickIgnite');
        expect(click).toBeDefined();
        expect(click?.target).toBe(5);
    });
    it('魔力が火遁のコストに足りなければ撃たない', () => {
        expect(run('you', 0).chargeClicks?.some((c) => c.skill === 'onClickIgnite') ?? false).toBe(false);
    });
    it('ネクロマンサーが相手のときは撃たない（墓地が増えて蘇生の資源になる）', () => {
        expect(run('necromancer', 6).chargeClicks?.some((c) => c.skill === 'onClickIgnite') ?? false).toBe(false);
    });
    it('すでに🔥が付いた敵コマは狙わない（残りの敵コマを狙う）', () => {
        const b = board();
        b[5] = { player: '⭕', bind: 4, effects: [{ effect: '🔥' }] };
        const click = run('you', 6, b).chargeClicks?.find((c) => c.skill === 'onClickIgnite');
        expect(click?.target).toBe(6);
    });
});

describe('鍛冶師AI: 火口(idx 87)は🌱か🍂のある敵コマを火遁より先に燃やす（sim/ai.js の火口と同一）', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { skillCosts } = require('./skillCosts');
    const board = () => {
        const b: SquareInfo[] = Array.from({ length: 16 }, () => ({ player: undefined, bind: 0, effects: [] }));
        b[0] = { player: '💙', bind: 4, effects: [] };
        b[5] = { player: '⭕', bind: 6, effects: [] };
        b[6] = { player: '⭕', bind: 3, effects: [{ effect: '🌱' }] };
        return b;
    };
    const run = (hand: number[], magic: number, foe: 'you' | 'necromancer' = 'you') => {
        const ai = new AIPlayer('💙', 'pyromancer', ['⭕'], ['pyromancer', foe]);
        return ai.makeMove(board(), magic, skillCosts, 2, 5, hand, false);
    };

    it('手札に火口があれば🌱のある敵コマに撃ち、そのあと火遁は残りのコマに撃つ', () => {
        const clicks = run([87], 8).chargeClicks ?? [];
        expect(clicks.find((c) => c.skill === 'onClickTinder')?.target).toBe(6);
        expect(clicks.find((c) => c.skill === 'onClickIgnite')?.target).toBe(5);
    });
    it('手札に火口が無ければ撃たない', () => {
        expect(run([], 8).chargeClicks?.some((c) => c.skill === 'onClickTinder') ?? false).toBe(false);
    });
    it('ネクロマンサーが相手のときは撃たない', () => {
        expect(run([87], 8, 'necromancer').chargeClicks?.some((c) => c.skill === 'onClickTinder') ?? false).toBe(false);
    });
});

describe('鍛冶師AI: 相手に魔法使いがいるとき火口を手札に固定する（sim/ai.js の tinderLock=2）', () => {
    const board = () => Array.from({ length: 16 }, () => ({ player: undefined, bind: 0, effects: [] } as SquareInfo));
    const locks = (foe: 'magician' | 'you') => new AIPlayer('💙', 'pyromancer', ['⭕'], ['pyromancer', foe]).chooseLocks(board(), 0, 5, [87, 0, 1]);

    it('相手に魔法使いがいれば火口(87)を固定する', () => {
        expect(locks('magician')).toContain(87);
    });
    it('魔法使いがいなければ固定しない', () => {
        expect(locks('you')).not.toContain(87);
    });
});

describe('鍛冶師AI: 火遁は魔法使いの🌱コマを優先して燃やす（sim/ai.js の igniteBud）', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { skillCosts } = require('./skillCosts');
    it('ライフが同じ敵コマが2つあるとき、魔法使いなら🌱のあるほうを狙う', () => {
        const b: SquareInfo[] = Array.from({ length: 16 }, () => ({ player: undefined, bind: 0, effects: [] }));
        b[0] = { player: '💙', bind: 4, effects: [] };
        b[5] = { player: '⭕', bind: 4, effects: [] };
        b[10] = { player: '⭕', bind: 4, effects: [{ effect: '🌱' }] };
        const ai = new AIPlayer('💙', 'pyromancer', ['⭕'], ['pyromancer', 'magician']);
        const click = ai.makeMove(b, 6, skillCosts, 2, 5, [], false).chargeClicks?.find((c) => c.skill === 'onClickIgnite');
        expect(click?.target).toBe(10);
    });
    it('魔法使い以外の相手なら🌱の有無は考えない（ライフが同じなら先に見つかったマス）', () => {
        const b: SquareInfo[] = Array.from({ length: 16 }, () => ({ player: undefined, bind: 0, effects: [] }));
        b[0] = { player: '💙', bind: 4, effects: [] };
        b[5] = { player: '⭕', bind: 4, effects: [] };
        b[10] = { player: '⭕', bind: 4, effects: [{ effect: '🌱' }] };
        const ai = new AIPlayer('💙', 'pyromancer', ['⭕'], ['pyromancer', 'you']);
        const click = ai.makeMove(b, 6, skillCosts, 2, 5, [], false).chargeClicks?.find((c) => c.skill === 'onClickIgnite');
        expect(click?.target).toBe(5);
    });
});

describe('AIPlayer 土壇場の防壁 (lastStandReady)', () => {
    // ⭕が3と7の二箇所で勝ち筋を持つ(片方しか塞げない)。💙は8,9で並べている
    const setup = () => {
        const b = emptyBoard();
        [0, 1, 2, 4, 5, 6].forEach((i) => put(b, i, '⭕'));
        [8, 9].forEach((i) => put(b, i, '💙'));
        return b;
    };

    it('防壁なしなら相手の即勝ちマス(3か7)を塞ぐ', () => {
        const ai = new AIPlayer('💙', 'tactician', ['⭕']);
        expect([3, 7]).toContain(ai.getBestMove(setup(), 3));
    });

    it('防壁が未発動なら塞ぎ手を強制せず、自分の列(10)を伸ばす', () => {
        const ai = new AIPlayer('💙', 'tactician', ['⭕']);
        ai.lastStandReady = true;
        expect([3, 7]).not.toContain(ai.getBestMove(setup(), 3));
    });
});

describe('🍂落ち葉スキルのAI使用', () => {
    const costs = { onClickLeafToken: 3, onClickTwinLeafToken: 5, onClickDoubleLeafToken: 6, onClickBonfire: 3, onClickMulch: 2, onClickAutumn: 4 } as any;
    const lone = () => {
        const b = emptyBoard();
        put(b, 0, '💙');
        put(b, 15, '⭕');
        return b;
    };

    it('pickLeafToken: ダブル(空き4以上)→双子→1枚の順に、払える最初のものを選ぶ', () => {
        const ai = new AIPlayer('💙', 'you', ['⭕']);
        expect(ai.pickLeafToken([62, 63, 64], 10, 10, costs)).toEqual({ skill: 'onClickDoubleLeafToken', cost: 6 });
        expect(ai.pickLeafToken([62, 63, 64], 10, 5, costs)).toEqual({ skill: 'onClickTwinLeafToken', cost: 5 });
        expect(ai.pickLeafToken([62, 63, 64], 10, 3, costs)).toEqual({ skill: 'onClickLeafToken', cost: 3 });
        expect(ai.pickLeafToken([62, 63, 64], 10, 2, costs)).toBeNull();
        expect(ai.pickLeafToken([0, 1], 10, 10, costs)).toBeNull();
        expect(ai.pickLeafToken([64], 3, 10, costs)).toBeNull(); // 空きが足りない
    });

    it('トークンを撃てる手番では、🍂付きトークンを普通のトークンより先に撃つ（固有トークン持ち以外）', () => {
        const ai = new AIPlayer('💙', 'you', ['⭕']);
        const r = ai.makeMove(lone(), 10, { ...costs, onClickToken: 4 } as any, 0, 5, [62, 3, 0], false);
        expect(r.skills).toContain('onClickLeafToken');
        expect(r.skills).not.toContain('onClickToken');
    });

    it('焚き火の唄: 敵陣の🍂が2枚以上あるときだけ撃つ', () => {
        const ai = new AIPlayer('💙', 'you', ['⭕']);
        const b = lone();
        b[15] = { player: '⭕', bind: 5, effects: [{ effect: '🍂' }, { effect: '🍂' }] };
        const r = ai.makeMove(b, 10, costs, 0, 5, [66, 0, 1], false);
        expect(r.chargeClicks?.map((c) => c.skill)).toContain('onClickBonfire');
        const one = lone();
        one[15] = { player: '⭕', bind: 5, effects: [{ effect: '🍂' }] };
        expect(ai.makeMove(one, 10, costs, 0, 5, [66, 0, 1], false).chargeClicks?.map((c) => c.skill) ?? []).not.toContain('onClickBonfire');
    });
});

describe('霜枯れのAI使用', () => {
    const costs = { onClickLeafFrost: 3 } as any;
    const leafy = () => {
        const b = emptyBoard();
        put(b, 0, '💙'); put(b, 1, '💙'); put(b, 15, '⭕');
        b[0] = { ...b[0], effects: [{ effect: '🍂' }] };
        b[1] = { ...b[1], effects: [{ effect: '🍂' }] };
        return b;
    };
    it('煉獄の鍛冶師が敵にいて、自陣の🍂マスが2つ以上あるときだけ撃つ', () => {
        const withPyro = new AIPlayer('💙', 'you', ['⭕'], ['you', 'pyromancer']);
        expect(withPyro.makeMove(leafy(), 10, costs, 0, 5, [69, 0, 1], false).skills).toContain('onClickLeafFrost');
        const noPyro = new AIPlayer('💙', 'you', ['⭕'], ['you', 'giant']);
        expect(noPyro.makeMove(leafy(), 10, costs, 0, 5, [69, 0, 1], false).skills).not.toContain('onClickLeafFrost');
        const one = leafy();
        one[1] = { ...one[1], effects: [] };
        expect(withPyro.makeMove(one, 10, costs, 0, 5, [69, 0, 1], false).skills).not.toContain('onClickLeafFrost');
    });
});

describe('ネクロマンサー: 割引札のロックと対陰陽師の列カバー', () => {
    // seat0=💙 ネクロ / seat1=⭕ 陰陽師
    const mk = (oppChar: 'yinYangMaster' | 'giant') => new AIPlayer('💙', 'necromancer', ['⭕'], ['necromancer', oppChar]);

    it('割引札(特売53・固有割引57・大特価58)を手札に固定する(降霊のコストを圧縮するため)', () => {
        const locks = mk('giant').chooseLocks(emptyBoard(), 0, 5, [3, 57, 53, 58]);
        expect(locks).toHaveLength(2); // 最大2つ
        locks.forEach((i) => expect([53, 57, 58]).toContain(i));
    });

    it('割引札以外はこれまでどおり(盤面で価値が低ければ固定しない)', () => {
        expect(mk('giant').chooseLocks(emptyBoard(), 0, 5, [27, 28])).toEqual([]);
    });

    it('相手に陰陽師がいるかを見分ける', () => {
        expect((mk('yinYangMaster') as any).facingYinYang()).toBe(true);
        expect((mk('giant') as any).facingYinYang()).toBe(false);
    });

    it('自コマが入っている勝ち筋の列の数を数える(百鬼夜行→式神一括は自コマが入った列には効かない)', () => {
        const ai = mk('yinYangMaster') as any;
        expect(ai.coveredLines(emptyBoard())).toBe(0);
        const b = emptyBoard();
        put(b, 5, '💙'); // 4x4: 行1・列1・主対角の3本
        expect(ai.coveredLines(b)).toBe(3);
        put(b, 6, '💙'); // 行1は既に数え済み。列2と反対角が増える
        expect(ai.coveredLines(b)).toBe(5);
    });
});

describe('雷霆の巫の対陰陽師(百鬼夜行→式神一括)対策', () => {
    // 自陣のコマが1つも無い勝ち筋の線の数
    const uncoveredLines = (b: SquareInfo[], me: Player): number =>
        geometryForCells(b.length).winLines.filter((line) => !line.some((k) => b[k].player === me)).length;

    // 💙が1,6 / ⭕が8,12 の盤面。線カバー無しだと自コマの無い線が残る手を選ぶ位置（探索で見つけた）
    const setup = () => {
        const b = emptyBoard();
        [1, 6].forEach((i) => put(b, i, '💙'));
        [8, 12].forEach((i) => put(b, i, '⭕'));
        return b;
    };
    const mk = (opponents: string[]) => new AIPlayer('💙', 'electrician', ['⭕'], opponents as any);
    const afterUncovered = (b: SquareInfo[], i: number) => { const c = b.map((sq) => ({ ...sq })); c[i] = { player: '💙', bind: 4, effects: [] }; return uncoveredLines(c, '💙'); };

    it('相手に陰陽師がいると、自コマの無い線が最も少なくなる手を選ぶ（重み0だと選ばない）', () => {
        const b = setup();
        const best = Math.min(...b.map((sq, i) => (sq.player ? Infinity : afterUncovered(b, i))));
        const off = mk(['electrician', 'yinYangMaster']);
        off.floodCoverWeight = 0;
        expect(afterUncovered(b, off.getBestMove(b, 4) as number)).toBeGreaterThan(best);
        const on = mk(['electrician', 'yinYangMaster']);
        expect(afterUncovered(b, on.getBestMove(b, 4) as number)).toBe(best);
    });

    it('相手に陰陽師がいなければ線カバーは効かない（重みの有無で同じ手）', () => {
        const b = setup();
        const off = mk(['electrician', 'tactician']);
        off.floodCoverWeight = 0;
        expect(mk(['electrician', 'tactician']).getBestMove(b, 4)).toBe(off.getBestMove(b, 4));
    });
});

describe('氷室の番人の対陰陽師の列カバー', () => {
    const uncoveredLines = (b: SquareInfo[], me: Player): number =>
        geometryForCells(b.length).winLines.filter((line) => !line.some((k) => b[k].player === me)).length;
    const setup = () => {
        const b = emptyBoard();
        [1, 6].forEach((i) => put(b, i, '💙'));
        [8, 12].forEach((i) => put(b, i, '⭕'));
        return b;
    };
    const mk = (opponents: string[]) => new AIPlayer('💙', 'cryomancer', ['⭕'], opponents as any);
    const afterUncovered = (b: SquareInfo[], i: number) => { const c = b.map((sq) => ({ ...sq })); c[i] = { player: '💙', bind: 4, effects: [] }; return uncoveredLines(c, '💙'); };

    it('相手に陰陽師がいると、自コマの無い線が最も少なくなる手を選ぶ', () => {
        const b = setup();
        const best = Math.min(...b.map((sq, i) => (sq.player ? Infinity : afterUncovered(b, i))));
        expect(afterUncovered(b, mk(['cryomancer', 'yinYangMaster']).getBestMove(b, 4) as number)).toBe(best);
    });

    it('相手に陰陽師がいなければ線カバーは効かない', () => {
        const b = setup();
        const best = Math.min(...b.map((sq, i) => (sq.player ? Infinity : afterUncovered(b, i))));
        expect(afterUncovered(b, mk(['cryomancer', 'tactician']).getBestMove(b, 4) as number)).toBeGreaterThan(best);
    });
});

describe('雷霆の巫は対策ロックを撃たない (sim/ai.js elecNoAnti)', () => {
    const costs = { onClickUseLock: 2, onClickDoubleLock: 3, onClickTripleLock: 4 } as any;
    const board = () => {
        const b = emptyBoard();
        [0, 1].forEach((i) => put(b, i, '💙', 1));
        return b;
    };

    it('敵がネクロでも、低bindの自コマをロックしない（魔力は他の用途に回す）', () => {
        const ai = new AIPlayer('💙', 'electrician', ['⭕'], ['electrician', 'necromancer']);
        const r = ai.makeMove(board(), 10, costs, 0, 4, [], false);
        expect(r.skills ?? []).not.toContain('onClickUseLock');
    });

    it('対照: 同じ盤でも「あなた」はネクロ相手に対策ロックを撃つ', () => {
        const ai = new AIPlayer('💙', 'you', ['⭕'], ['you', 'necromancer']);
        const r = ai.makeMove(board(), 10, costs, 0, 4, [], false);
        expect(r.skills).toContain('onClickUseLock');
    });
});

describe('凩の魔女は対策ロックを撃たない (sim/ai.js witchNoAnti)', () => {
    const costs = { onClickUseLock: 2, onClickDoubleLock: 3, onClickTripleLock: 4 } as any;
    const board = () => {
        const b = emptyBoard();
        [0, 1].forEach((i) => put(b, i, '💙', 1));
        return b;
    };

    it('敵がネクロ・毒使いでも、低bindの自コマをロックしない（魔力を🍂トークンに回す）', () => {
        for (const foe of ['necromancer', 'poisoner'] as const) {
            const ai = new AIPlayer('💙', 'witch', ['⭕'], ['witch', foe]);
            const r = ai.makeMove(board(), 10, costs, 0, 4, [], false);
            expect(r.skills ?? []).not.toContain('onClickUseLock');
        }
    });
});

describe('凩の魔女は🍂トークンの分の魔力を温存する (sim/ai.js witchReserve)', () => {
    const costs = { onClickAddLife: 3, onClickLeafToken: 3, onClickUseLock: 2, onClickDoubleLock: 3, onClickTripleLock: 4 } as any;
    const board = () => {
        const b = emptyBoard();
        put(b, 0, '💙', 1);
        return b;
    };

    it('魔力が🍂トークン1枚ぶんしか無いとき、ライフ3に使わず🍂トークンを撃つ', () => {
        const ai = new AIPlayer('💙', 'witch', ['⭕'], ['witch', 'you']);
        const r = ai.makeMove(board(), 4, costs, 0, 1, [0, 62], false);
        expect(r.skills ?? []).toContain('onClickLeafToken');
        expect(r.skills ?? []).not.toContain('onClickAddLife');
    });
});

describe('コストの計算順: 敵の🍂の増加分を先に足し、魔女のパッシブの減少分をそのあとに引く', () => {
    it('魔女: 敵の🍂3枚だけの盤面で、コスト2は2のまま（以前は下限1のあとに+3で4）', () => {
        const b = emptyBoard();
        put(b, 4, '⭕', 3);
        b[4] = { ...b[4], effects: [{ effect: '🍂' }, { effect: '🍂' }, { effect: '🍂' }] };
        const ai = new AIPlayer('💙', 'witch', ['⭕'], ['witch', 'you']);
        ai.updateShield(b);
        expect(ai.calculateAICost(2)).toBe(2);
        expect(ai.calculateAICost(7)).toBe(7);
    });
    it('魔女以外: 敵の🍂の増加分はそのまま乗る', () => {
        const b = emptyBoard();
        put(b, 4, '⭕', 3);
        b[4] = { ...b[4], effects: [{ effect: '🍂' }, { effect: '🍂' }] };
        const ai = new AIPlayer('💙', 'you', ['⭕'], ['you', 'you']);
        ai.updateShield(b);
        expect(ai.calculateAICost(3)).toBe(5);
    });
});

describe('氷室の番人の対ネクロ: 敵コマの奪取を避ける', () => {
    // 💙番人が2に居て、ライフ0の⭕が5にある。奪取(5)は墓地+1になるので、空きマスの手を選ぶ
    const setup = () => {
        const b = emptyBoard();
        put(b, 5, '⭕'); b[5] = { ...b[5], bind: 0 };
        return b;
    };
    it('相手にネクロがいると、ライフ0の敵コマを奪わず空きマスに置く', () => {
        const b = setup();
        const ai = new AIPlayer('💙', 'cryomancer', ['⭕'], ['cryomancer', 'necromancer']);
        expect(ai.getBestMove(b, 4)).not.toBe(5);
    });
    it('ネクロ以外が相手なら奪取ボーナスが残る（5を奪う）', () => {
        const b = setup();
        const ai = new AIPlayer('💙', 'cryomancer', ['⭕'], ['cryomancer', 'tactician']);
        expect(ai.getBestMove(b, 4)).toBe(5);
    });
});

describe('氷室の番人の対ネクロ: 降霊の召喚先になる空きマスを先に凍らせる', () => {
    const costs = { onClickCryoFreeze: 2, onClickUseLock: 2 } as any;
    // ⭕ネクロが行0に2つ（0,1）。自コマは無い。墓地が貯まっていれば行0の空き(2か3)を凍らせる
    const setup = () => {
        const b = emptyBoard();
        put(b, 0, '⭕'); put(b, 1, '⭕'); put(b, 15, '💙');
        return b;
    };
    const mk = () => new AIPlayer('💙', 'cryomancer', ['⭕'], ['cryomancer', 'necromancer']);
    it('墓地が1以上なら、ネクロの列の空きマスを氷結する', () => {
        const r = mk().makeMove(setup(), 10, costs, 0, 5, [], false, 0, 10, 99, 99, false, [], 10, [10, 9]);
        expect(r.skills).toContain('onClickUseLock');
        expect([2, 3]).toContain((r.lockTargets as number[])[0]);
    });
    it('墓地が0なら凍らせない', () => {
        const r = mk().makeMove(setup(), 10, costs, 0, 5, [], false, 0, 10, 99, 99, false, [], 10, [10, 10]);
        expect(r.lockTargets ?? []).toHaveLength(0);
    });
});

describe('氷室の番人の対陰陽師: 百鬼夜行の置き場になる空きマスを先に凍らせる', () => {
    const costs = { onClickCryoFreeze: 2, onClickUseLock: 2 } as any;
    const mk = () => new AIPlayer('💙', 'cryomancer', ['⭕'], ['cryomancer', 'yinYangMaster']);
    const board = () => { const b = emptyBoard(); put(b, 5, '💙'); return b; };
    it('陰陽師の魔力が12以上なら、自コマの入っていない列の空きマスを氷結する', () => {
        const r = mk().makeMove(board(), 10, costs, 0, 5, [], false, 0, 10, 99, 99, false, [10, 12]);
        expect(r.skills).toContain('onClickUseLock');
    });
    it('陰陽師の魔力が少なければ凍らせない', () => {
        const r = mk().makeMove(board(), 10, costs, 0, 5, [], false, 0, 10, 99, 99, false, [10, 11]);
        expect(r.lockTargets ?? []).toHaveLength(0);
    });
});

describe('裸の王様のAI使用', () => {
    const costs = { onClickStrip: 4 } as any;
    const quiet = () => {
        const b = emptyBoard();
        put(b, 0, '💙');
        put(b, 15, '⭕');
        return b;
    };
    it('相手の有効なギアが2つ以上あるときに使う。1つ以下・スキルがスロットに無いときは使わない', () => {
        const ai = new AIPlayer('💙', 'you', ['⭕']);
        ai.oppGearCount = 2;
        expect(ai.makeMove(quiet(), 10, costs, 0, 5, [76, 0, 1], false).skills).toContain('onClickStrip');
        expect(ai.makeMove(quiet(), 10, costs, 0, 5, [0, 1, 2], false).skills).not.toContain('onClickStrip');
        ai.oppGearCount = 1;
        expect(ai.makeMove(quiet(), 10, costs, 0, 5, [76, 0, 1], false).skills).not.toContain('onClickStrip');
    });
    it('自分にリーチがあって、相手に使える土壇場の防壁があるときは、ギアが1つでも使う', () => {
        const ai = new AIPlayer('💙', 'you', ['⭕']);
        ai.oppGearCount = 1;
        ai.oppLastStand = true;
        const b = quiet();
        [1, 2, 3].forEach((i) => put(b, i + 4, '💙')); // 5,6,7 の3つ → 4 に置けば勝ち
        expect(ai.makeMove(b, 10, costs, 0, 5, [76, 0, 1], false).skills).toContain('onClickStrip');
        expect(ai.makeMove(quiet(), 10, costs, 0, 5, [76, 0, 1], false).skills).not.toContain('onClickStrip');
    });
});

describe('雷霆の巫AIの静電気の季節・総毛立つ', () => {
    const costs = { onClickChargeSeason: 6, onClickBristle: 5 } as any;
    const own3 = () => {
        const b = emptyBoard();
        [0, 1, 2].forEach((i) => put(b, i, '💙'));
        put(b, 15, '⭕');
        return b;
    };
    it('雷霆の巫は、掛かっていなければ静電気の季節を、⚡なしの自陣コマが3つ以上なら総毛立つを撃つ', () => {
        const ai = new AIPlayer('💙', 'electrician', ['⭕']);
        const r = ai.makeMove(own3(), 20, costs, 0, 5, [77, 78, 0], false);
        expect(r.skills).toContain('onClickChargeSeason');
        expect(r.skills).toContain('onClickBristle');
    });
    it('静電気の季節が掛かっている間は掛け直さない。雷霆の巫以外は撃たない', () => {
        const ai = new AIPlayer('💙', 'electrician', ['⭕']);
        ai.chargeBuffActive = true;
        expect(ai.makeMove(own3(), 20, costs, 0, 5, [77, 0, 1], false).skills).not.toContain('onClickChargeSeason');
        const other = new AIPlayer('💙', 'you', ['⭕']);
        expect(other.makeMove(own3(), 20, costs, 0, 5, [77, 78, 0], false).skills).not.toContain('onClickBristle');
    });
});

describe('落雷は忘れた頃にのAI使用', () => {
    const costs = { onClickRelease: 5, onClickChargeSeason: 6, onClickBristle: 5 } as any;
    const bolts = (n: number) => {
        const b = emptyBoard();
        for (let i = 0; i < n; i++) b[i] = { player: '💙', bind: 4, effects: [{ effect: '⚡' }] };
        put(b, 14, '⭕', 5);
        put(b, 15, '⭕', 5);
        return b;
    };
    it('雷霆の巫は、自陣の⚡が3つ以上たまり、ダメージの通る敵のコマが2つ以上あれば撃つ', () => {
        const ai = new AIPlayer('💙', 'electrician', ['⭕']);
        expect(ai.makeMove(bolts(3), 20, costs, 0, 5, [79, 0, 1], false).skills).toContain('onClickRelease');
        expect(ai.makeMove(bolts(2), 20, costs, 0, 5, [79, 0, 1], false).skills).not.toContain('onClickRelease'); // 溜まりが足りない
        const one = bolts(3);
        one[15] = { player: undefined, bind: 0, effects: [] };
        expect(ai.makeMove(one, 20, costs, 0, 5, [79, 0, 1], false).skills).not.toContain('onClickRelease'); // 敵が1つだけ
        const other = new AIPlayer('💙', 'you', ['⭕']);
        expect(other.makeMove(bolts(3), 20, costs, 0, 5, [79, 0, 1], false).skills).not.toContain('onClickRelease');
    });
});

describe('魔法使いはネクロマンサー相手に審判の日を撃たない (sim/ai.js noJudgeNecro と同じ)', () => {
    // 💙(魔法使い)の周りに⭕のコマが固まっていて、審判の日なら2つ以上巻き込める盤面
    const board = () => {
        const b = emptyBoard();
        [5, 6, 9, 10].forEach((i) => put(b, i, '⭕', 4));
        return b;
    };
    const plan = (foe: 'tactician' | 'necromancer') => {
        const ai = new AIPlayer('💙', 'magician', ['⭕'], ['magician', foe]);
        return ai.makeMove(board(), 20, { onClickToken: 4, onClickLock: 2, onClickUseLock: 2 } as never, 2, 4, [], false, 0, 0, 5);
    };

    it('ネクロマンサー相手なら審判の日を撃たない', () => {
        expect(plan('necromancer').skills).not.toContain('onClickJudgeDay');
    });
    it('ほかの相手なら審判の日を撃つ', () => {
        expect(plan('tactician').skills).toContain('onClickJudgeDay');
    });
});

describe('魔法使いは氷室が相手のとき審判の日より先に自陣のコマをロックする (sim/ai.js lockFirstCryo と同じ)', () => {
    // 💙(魔法使い)のコマ 0(🌱付き)・6・11。⭕のコマ 5・10・12・15。氷室は ロックされていないコマを凍らせる
    const board = () => {
        const b = emptyBoard();
        [0, 6, 11].forEach((i) => put(b, i, '💙', 4));
        b[0] = { ...b[0], effects: [{ effect: '🌱' }] };
        [5, 10, 12, 15].forEach((i) => put(b, i, '⭕', 4));
        return b;
    };
    const planOf = (foe: 'tactician' | 'cryomancer' | 'pyromancer') => {
        const ai = new AIPlayer('💙', 'magician', ['⭕'], ['magician', foe]);
        return ai.makeMove(board(), 20, { onClickToken: 4, onClickUseLock: 2 } as never, 2, 4, [], false, 0, 0, 5);
    };
    const lockTargetsOf = (foe: 'tactician' | 'cryomancer' | 'pyromancer') => {
        const r = planOf(foe);
        return [...(r.lockTargets ?? []), ...(r.chargeClicks ?? []).map((c) => c.target)];
    };

    it('氷室が相手なら、🌱付きのコマを先頭に自陣のコマを全てロックする', () => {
        const targets = lockTargetsOf('cryomancer');
        expect(targets[0]).toBe(0);
        expect([...targets].sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([0, 6, 11]);
    });
    it('鍛冶師（🔥はロック中のコマに付かない）が相手のときも同じく全てロックする', () => {
        const targets = lockTargetsOf('pyromancer');
        expect(targets[0]).toBe(0);
        expect([...targets].sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([0, 6, 11]);
    });
    it('ほかの相手なら従来どおり審判の日を撃つ（ロックを先にしない）', () => {
        expect(planOf('tactician').skills).toContain('onClickJudgeDay');
        expect(lockTargetsOf('tactician')).toEqual([]);
    });
});

describe('AIPlayer 対魔女の新スキル(初霜・吹き寄せ・山焼き・無礼講・一寸の虫に魂なし)', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { skillCosts } = require('./skillCosts');
    const mk = (me: string, foe: string, deck?: number[]) => new AIPlayer('💙', me as 'you', ['⭕'], [me, foe] as never, undefined, false, false, deck);
    const leafBoard = (): SquareInfo[] => {
        const b = emptyBoard();
        b[4] = { player: '⭕', bind: 5, effects: [{ effect: '🍂' }] };
        b[5] = { player: '⭕', bind: 5, effects: [{ effect: '🍂' }] };
        return b;
    };

    it('魔女が相手のとき、初霜/吹き寄せ/山焼きを手札に固定する。魔女以外が相手なら固定しない', () => {
        const hand = [93, 94, 95, 3];
        expect(mk('you', 'witch').chooseLocks(emptyBoard(), 0, 5, hand)).toEqual(expect.arrayContaining([93, 94]));
        expect(mk('you', 'giant').chooseLocks(emptyBoard(), 0, 5, hand)).not.toContain(93);
    });

    it('魔女が相手で、新スキルが手札に無くデッキにあり、魔力に余裕があれば引き直す。手札にあれば引き直さない', () => {
        const ai = mk('tactician', 'witch', [3, 9, 93, 94, 95]);
        ai.rerollsLeft = 2;
        expect(ai.makeMove(emptyBoard(), 8, skillCosts, 2, 5, [3, 9, 11], false).reroll).toBeDefined();
        expect(ai.makeMove(emptyBoard(), 8, skillCosts, 2, 5, [3, 93, 11], false).reroll).toBeUndefined();
        ai.rerollsLeft = 0;
        expect(ai.makeMove(emptyBoard(), 8, skillCosts, 2, 5, [3, 9, 11], false).reroll).toBeUndefined();
    });

    it('陰陽師が魔女と戦うとき、一寸の虫に魂なし(92)が手札に無くデッキにあり、魔力に余裕があれば引き直す。手札にあれば固定する', () => {
        const ai = mk('yinYangMaster', 'witch', [0, 2, 3, 5, 6, 8, 10, 92, 71, 72, 73, 53]);
        ai.rerollsLeft = 8;
        expect(ai.makeMove(emptyBoard(), 8, skillCosts, 2, 5, [0, 2, 3], false).reroll).toBeDefined();
        expect(ai.makeMove(emptyBoard(), 3, skillCosts, 2, 5, [0, 2, 3], false).reroll).toBeUndefined(); // シャッフルのあとに魔力3が残らない
        expect(ai.makeMove(emptyBoard(), 8, skillCosts, 2, 5, [0, 2, 92], false).reroll).toBeUndefined(); // 手札にある
        expect(ai.chooseLocks(emptyBoard(), 0, 5, [0, 92, 71])).toEqual([92, 71]);
        const noCard = mk('yinYangMaster', 'witch', [0, 2, 3, 5, 6, 8, 10, 71, 72, 73, 53, 12]); // デッキに92が無ければ探さない
        noCard.rerollsLeft = 8;
        expect(noCard.makeMove(emptyBoard(), 8, skillCosts, 2, 5, [0, 2, 3], false).reroll).toBeUndefined();
    });

    it('敵の🍂が2枚以上あれば吹き寄せ・山焼き、敵の🍂のコマがあれば初霜を撃つ', () => {
        expect(mk('you', 'witch').makeMove(leafBoard(), 22, skillCosts, 2, 5, [94], false).skills).toContain('onClickGather');
        expect(mk('you', 'witch').makeMove(leafBoard(), 22, skillCosts, 2, 5, [95], false).skills).toContain('onClickBurnOff');
        const one = emptyBoard();
        one[4] = { player: '⭕', bind: 5, effects: [{ effect: '🍂' }] };
        expect(mk('you', 'witch').makeMove(one, 22, skillCosts, 2, 5, [93], false).skills).toContain('onClickFirstFrost');
        expect(mk('you', 'witch').makeMove(one, 22, skillCosts, 2, 5, [93], true).skills).not.toContain('onClickFirstFrost'); // トークンはターン1回
    });

    it('高いトークンを撃つ予定なら、先に無礼講を撃つ（トークンが無礼講より安いときは撃たない）', () => {
        const r = mk('you', 'witch').makeMove(leafBoard(), 22, skillCosts, 2, 5, [95, 96], false).skills;
        expect(r.indexOf('onClickFreeToken')).toBeGreaterThanOrEqual(0);
        expect(r.indexOf('onClickFreeToken')).toBeLessThan(r.indexOf('onClickBurnOff'));
        const cheap = mk('you', 'witch');
        expect(cheap.makeMove(emptyBoard(), 22, skillCosts, 2, 5, [3, 96], false).skills).not.toContain('onClickFreeToken');
        const active = mk('you', 'witch');
        active.tokenFree = true;
        expect(active.makeMove(leafBoard(), 22, skillCosts, 2, 5, [95, 96], false).skills).not.toContain('onClickFreeToken');
    });

    it('一寸の虫に魂なし: 壊せる（ライフ3以下の）敵コマが2個以上のとき撃つ', () => {
        const b = emptyBoard();
        b[4] = { player: '⭕', bind: 3, effects: [] };
        b[5] = { player: '⭕', bind: 2, effects: [] };
        expect(mk('you', 'witch').makeMove(b, 22, skillCosts, 2, 5, [92], false).skills).toContain('onClickSmallFry');
        b[5] = { player: '⭕', bind: 6, effects: [] };
        expect(mk('you', 'witch').makeMove(b, 22, skillCosts, 2, 5, [92], false).skills).not.toContain('onClickSmallFry');
    });
});

describe('AIPlayer 対策ロックと絶対零度（膠着の修正 #300）', () => {
    const ai = new AIPlayer('💙', 'cryomancer', ['⭕']);
    it('対策ロックは氷結中の自コマを対象にしない（氷室はロック=氷結で、同じコマを毎手番凍らせ続けていた）', () => {
        const b = emptyBoard();
        b[5] = { player: '💙', bind: 2, effects: [{ effect: '❄' }] };
        b[6] = { player: '💙', bind: 3, effects: [] };
        expect(ai.findAntiNecroLockTarget(b)).toBe(6);
        b[6] = { player: '💙', bind: 3, effects: [{ effect: '❄' }] };
        expect(ai.findAntiNecroLockTarget(b)).toBeNull();
    });
    it('絶対零度は🔑ロック中の敵コマを数えない', () => {
        const b = emptyBoard();
        [0, 1, 2].forEach((i) => { b[i] = { player: '⭕', bind: 4, effects: [{ effect: '🔑' }] }; });
        expect(ai.shouldGlacier(b)).toBe(false);
        [3, 4, 5].forEach((i) => put(b, i, '⭕', 4));
        expect(ai.shouldGlacier(b)).toBe(true);
    });
});

describe('AIPlayer 軍師の氷結トークン（凍ったコマは☠🔥のダメージを受けない）', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { skillCosts } = require('./skillCosts');
    const tac = () => new AIPlayer('💙', 'tactician', ['⭕'], ['tactician', 'poisoner']);

    it('軍師も氷結トークン(45)・氷結ダブルトークン(46)を撃つ', () => {
        expect(tac().makeMove(emptyBoard(), 22, skillCosts, 2, 5, [45], false).skills).toContain('onClickFrostToken');
        expect(tac().makeMove(emptyBoard(), 22, skillCosts, 2, 5, [46], false).skills).toContain('onClickDoubleFrostToken');
    });
    it('氷結トークンを手札に固定する（毎手番撃てるように）', () => {
        expect(tac().chooseLocks(emptyBoard(), 0, 5, [45, 46, 3, 28])).toEqual(expect.arrayContaining([45]));
    });
    it('氷結札を使うのは軍師・氷室・毒使いだけ（巨人は撃たない）', () => {
        const giant = new AIPlayer('💙', 'giant', ['⭕'], ['giant', 'poisoner']);
        expect(giant.makeMove(emptyBoard(), 22, skillCosts, 2, 5, [45], false).skills).not.toContain('onClickFrostToken');
    });
});

describe('魔力が有り余るとき（多人数戦・防壁で長引いた試合）', () => {
    const { skillCosts } = require('./skillCosts');
    const you = () => new AIPlayer('💙', 'you', ['⭕', '🟩'], ['you', 'poisoner', 'witch']);

    it('魔力に余裕があればライフ+3とバイバインで置くコマを厚くする。余裕が無ければ撃たない', () => {
        const rich = you().makeMove(emptyBoard(), 20, skillCosts, 2, 5, [0, 1], false).skills;
        expect(rich).toEqual(['onClickAddLife', 'onClickBibine']);
        expect(you().makeMove(emptyBoard(), 8, skillCosts, 2, 5, [0, 1], false).skills).toEqual([]);
    });

    it('魔力が大きく余り、使う額が少ない手札なら、引き直し回数を使い切っても引き直す', () => {
        const ai = you();
        ai.rerollsLeft = 0;
        expect(ai.makeMove(emptyBoard(), 40, skillCosts, 2, 5, [3], false).reroll).toBeDefined();
        const spent = you();
        spent.rerollsLeft = 0;
        expect(spent.makeMove(emptyBoard(), 20, skillCosts, 2, 5, [3], false).reroll).toBeUndefined();
        const deep = you();
        deep.rerollsLeft = -8;
        expect(deep.makeMove(emptyBoard(), 40, skillCosts, 2, 5, [], false).reroll).toBeUndefined();
    });

    it('魔力が有り余るときは、劣勢でなくても斜めの敵コマを一掃するスラッシュを撃つ', () => {
        const geo = geometryForCells(16);
        const b = emptyBoard();
        geo.antiDiagonal.slice(0, 2).forEach((i) => { b[i] = { player: '⭕', bind: 4, effects: [] }; });
        expect(you().makeMove(b, 22, skillCosts, 2, 5, [5], false).skills).toContain('onClickSlash');
        expect(you().makeMove(b, 8, skillCosts, 2, 5, [5], false).skills).not.toContain('onClickSlash');
    });

    it('魔力が有り余るとき、敵コマが多ければオピウムを撃つ', () => {
        const b = emptyBoard();
        [0, 2, 5, 7, 10].forEach((i) => { b[i] = { player: i % 2 ? '🟩' : '⭕', bind: 4, effects: [] }; });
        expect(you().makeMove(b, 30, skillCosts, 2, 5, [8], false).skills).toContain('onClickOpium');
        expect(you().makeMove(b, 10, skillCosts, 2, 5, [8], false).skills).not.toContain('onClickOpium');
    });
});

describe('巨人のストンプ連打（1手番で4つ並べる）', () => {
    const { skillCosts } = require('./skillCosts');
    const giant = () => new AIPlayer('💙', 'giant', ['⭕'], ['giant', 'you']);

    it('魔力が足りれば、ストンプを連打して1列を自陣にして勝つ。足りなければ連打しない', () => {
        const b = emptyBoard();
        const r = giant().makeMove(b, 12, skillCosts, 2, 5, [], false);
        const clicks = r.chargeClicks ?? [];
        expect(clicks.length).toBe(4);
        expect(clicks.every((c) => c.skill === 'onClickStomp' && c.target !== undefined)).toBe(true);
        const none = giant().makeMove(b, 6, skillCosts, 2, 5, [], false);
        expect(none.chargeClicks ?? []).toEqual([]);
    });

    it('自陣のコマが3つ並んでいれば、残り1マスのストンプ1回で揃える', () => {
        const b = emptyBoard();
        [0, 1, 2].forEach((i) => { b[i] = { player: '💙', bind: 6, effects: [] }; });
        const r = giant().makeMove(b, 3, skillCosts, 2, 5, [], false);
        expect(r.chargeClicks).toEqual([{ skill: 'onClickStomp', target: 3 }]);
    });
});

describe('毒使い: 魔力が有り余るときの連打', () => {
    const { skillCosts } = require('./skillCosts');
    const poisoner = () => new AIPlayer('💙', 'poisoner', ['⭕'], ['poisoner', 'you']);
    const ring = (): SquareInfo[] => {
        const b = emptyBoard();
        b[5] = { player: '💙', bind: 6, effects: [] };
        [0, 1, 4, 6].forEach((i) => { b[i] = { player: '⭕', bind: 4, effects: [] }; });
        return b;
    };

    it('毒霧→ミアズマを連打する（魔力に余裕があるときだけ）', () => {
        expect(poisoner().makeMove(ring(), 40, skillCosts, 2, 5, [29], false).skills).toEqual(['onClickPoisonMist', 'onClickMiasma']);
        expect(poisoner().makeMove(ring(), 9, skillCosts, 2, 5, [29], false).skills).not.toContain('onClickMiasma');
    });

    it('パンデミック→猛毒化: 敵が集まる3×3に毒を撒き、その毒を倍にする', () => {
        const b = ring();
        b[5] = { player: undefined, bind: 0, effects: [] };
        const r = poisoner().makeMove(b, 23, skillCosts, 2, 5, [19], false);
        expect(r.chargeClicks?.[0]).toEqual({ skill: 'onClickPandemic', target: expect.any(Number) });
        expect(poisoner().makeMove(b, 12, skillCosts, 2, 5, [19], false).chargeClicks ?? []).toEqual([]);
    });
});
