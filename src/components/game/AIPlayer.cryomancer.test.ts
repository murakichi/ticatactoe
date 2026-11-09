import AIPlayer from './AIPlayer';
import { SquareInfo } from '../../types/SquareInfo';
import { Player } from '../../types/Player';
import { geometryForCells } from './boardGeometry';
import { emptyBoard, put } from './aiTestUtils';

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

    it('findJudgeTarget: 氷結中の敵も数える（氷結は身代わりにならない）。バッズのある敵は数えない', () => {
        const b = emptyBoard();
        frozen(b, 5, '⭕');
        frozen(b, 6, '⭕');
        frozen(b, 9, '⭕');
        const mage = new AIPlayer('💙', 'magician', ['⭕']);
        expect(mage.findJudgeTarget(b)).not.toBeNull();
        const c = emptyBoard();
        [5, 6, 9].forEach((i) => { c[i] = { player: '⭕', bind: 4, effects: [{ effect: '🌱' }] }; });
        expect(mage.findJudgeTarget(c)).toBeNull();
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

describe('氷室の番人: 魔法使いの🌱付きコマを凍らせる (旧sim AI F.freezeBuds と同一)', () => {
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

describe('氷室の番人: 毒で倒れそうな自陣コマを先に凍らせる (旧sim AI F.antiPoison と同一)', () => {
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

describe('AIPlayer cryomancer frost cards (旧sim AI F.cryoCards と同一)', () => {
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

describe('氷室の番人の対魔女: 一寸の虫に魂なし(92)を探して固定する', () => {
    const mk = (opp: string) => new AIPlayer('💙', 'cryomancer', ['⭕'], ['cryomancer', opp] as any, undefined, false, false, [92, 12, 28, 45, 46, 48, 41, 44, 47, 43, 37, 73]);
    const costs = { onClickShuffle: 1, onClickSmallFry: 6, onClickCryoFreeze: 2, onClickUseLock: 2 } as any;

    it('魔女が相手のときだけ、手札の92を固定する', () => {
        expect(mk('witch').chooseLocks(emptyBoard(), 0, 5, [92, 12, 28])).toEqual([92]);
        expect(mk('giant').chooseLocks(emptyBoard(), 0, 5, [92, 12, 28])).not.toEqual([92]);
    });

    it('魔女戦で手札に92が無く、壊せる敵コマが2個以上あれば引き直して探す', () => {
        const b = emptyBoard();
        put(b, 1, '⭕'); put(b, 2, '⭕'); put(b, 15, '💙');
        b[1] = { ...b[1], bind: 2 }; b[2] = { ...b[2], bind: 3 };
        const ai = mk('witch');
        ai.rerollsLeft = 3;
        const r = ai.makeMove(b, 8, costs, 0, 5, [12, 28, 45], false);
        expect(r.reroll).toBeDefined();
    });

    it('魔女以外が相手なら探さない', () => {
        const b = emptyBoard();
        put(b, 1, '⭕'); put(b, 2, '⭕'); put(b, 15, '💙');
        b[1] = { ...b[1], bind: 2 }; b[2] = { ...b[2], bind: 3 };
        const ai = mk('giant');
        ai.rerollsLeft = 3;
        const r = ai.makeMove(b, 8, costs, 0, 5, [12, 28, 45], false);
        expect(r.reroll).toBeUndefined();
    });
});
