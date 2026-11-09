import AIPlayer from './AIPlayer';
import { SquareInfo } from '../../types/SquareInfo';
import { Player } from '../../types/Player';
import { geometryForCells } from './boardGeometry';
import { emptyBoard, put } from './aiTestUtils';

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

describe('雷霆の巫は対策ロックを撃たない (旧sim AI elecNoAnti)', () => {
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

describe('雷霆の巫AIの静電気の季節・総毛立つ', () => {
    const costs = { onClickChargeSeason: 6, onClickBristle: 5 } as any;
    const own3 = () => {
        const b = emptyBoard();
        [0, 2, 5].forEach((i) => put(b, i, '💙')); // 一列に3つ並べない（即勝ちできると勝ちを優先する）
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
        for (const i of [0, 2, 5].slice(0, n)) b[i] = { player: '💙', bind: 4, effects: [{ effect: '⚡' }] }; // 一列に3つ並べない（即勝ちできると勝ちを優先する）
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

describe('雷霆AI: パーフェクトゲーム（⚡の無敵コマだけが残る全破壊）', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { skillCosts } = require('./skillCosts');
    const BOLT = { effect: '⚡' as const };
    const empty = (): SquareInfo[] => Array.from({ length: 16 }, () => ({ player: undefined, bind: 0, effects: [] }));
    const put = (b: SquareInfo[], who: '💙' | '⭕', cells: number[], bolt = false) => cells.forEach((i) => (b[i] = { player: who, bind: 5, effects: bolt ? [{ ...BOLT }] : [] }));
    const run = (b: SquareInfo[], magic: number, hand: number[]) => new AIPlayer('💙', 'electrician', ['⭕'], ['electrician', 'tactician']).makeMove(b, magic, skillCosts, 2, 5, hand, false);
    const castsPG = (r: ReturnType<typeof run>) => [...(r.skills ?? []), ...(r.chargeClicks?.map((c) => c.skill) ?? [])].includes('onClickPerfectGame');

    it('使う（即勝ち）: 自陣の⚡3つの列を敵のコマが塞いでいる → 撃ってから、その空いたマスに置いて勝つ', () => {
        const b = empty();
        put(b, '💙', [0, 1, 2], true);
        put(b, '⭕', [3, 7, 11]);
        const r = run(b, 10, [102, 21, 23]);
        expect(r.chargeClicks?.map((c) => c.skill)).toEqual(['onClickPerfectGame']);
        expect(r.move).toBe(3);
    });
    it('使う（即勝ち）: 魔力が足りなくても、大特価を先に撃てば届く', () => {
        const b = empty();
        put(b, '💙', [0, 1, 2], true);
        put(b, '⭕', [3, 7, 11]);
        const r = run(b, 7, [102, 58, 21]);
        expect(r.chargeClicks?.map((c) => c.skill)).toEqual(['onClickClearance', 'onClickPerfectGame']);
        expect(r.move).toBe(3);
    });
    it('撃たない: 塞いでいるのが🔑ロックのコマ（壊せない）なら即勝ちにならない', () => {
        const b = empty();
        put(b, '💙', [0, 1, 2], true);
        b[3] = { player: '⭕', bind: 5, effects: [{ effect: '🔑' }] };
        expect(castsPG(run(b, 10, [102, 21, 23]))).toBe(false);
    });
    it('撃たない: 自陣の3つが⚡でなく壊れてしまう（残らない）なら即勝ちにならない', () => {
        const b = empty();
        put(b, '💙', [0, 1, 2]);
        put(b, '⭕', [3, 7]);
        expect(castsPG(run(b, 10, [102, 21, 23]))).toBe(false);
    });
    it('ためる: 即勝ちが見えて魔力が足りず相手のリーチも無いとき、駒を置かずチャージで魔力をためる', () => {
        const b = empty();
        put(b, '💙', [0, 1, 2], true);
        put(b, '⭕', [3, 10]); // 敵は塞ぐコマ1つ+別の1つ（リーチなし）
        const r = run(b, 8, [102, 21, 23]);
        expect(r.skills).toEqual(['onClickCharge']);
        expect(r.move).toBeNull();
    });
    it('ためない: 届く見込みが無い（あと7魔力以上）ときはチャージで待たない', () => {
        const b = empty();
        put(b, '💙', [0, 1, 2], true);
        put(b, '⭕', [3, 10]); // 敵は塞ぐコマ1つ+別の1つ（リーチなし）
        expect(run(b, 2, [102, 21, 23]).skills).not.toContain('onClickCharge');
    });
    it('ためない: 相手にリーチがあるときは、チャージせず通常どおり守る', () => {
        const b = empty();
        put(b, '💙', [0, 1, 2], true);
        put(b, '⭕', [3, 7, 11, 5, 6]); // 4-5-6-7 の列で敵がリーチ
        expect(run(b, 8, [102, 21, 23]).skills).not.toContain('onClickCharge');
    });
    it('使う: 自陣が全て⚡で壊れず、敵の壊れるコマが4つ', () => {
        const b = empty();
        put(b, '💙', [5, 6, 9], true);
        put(b, '⭕', [0, 3, 12, 15]);
        expect(castsPG(run(b, 10, [102, 0, 3]))).toBe(true);
    });
    it('使わない: 自陣の壊れるコマの方が多い（自分が損をする）', () => {
        const b = empty();
        put(b, '💙', [0, 1, 2, 3, 4]);
        put(b, '⭕', [10, 11, 15]);
        expect(castsPG(run(b, 10, [102, 0, 3]))).toBe(false);
    });
    it('使わない: 敵の壊れるコマが少なく（2つ以下）リーチも無い', () => {
        const b = empty();
        put(b, '💙', [5], true);
        put(b, '⭕', [0, 15]);
        expect(castsPG(run(b, 10, [102, 0, 3]))).toBe(false);
    });
    it('使わない: 魔力が足りない（コスト10）', () => {
        const b = empty();
        put(b, '💙', [5, 6, 9], true);
        put(b, '⭕', [0, 3, 12, 15]);
        expect(castsPG(run(b, 6, [102, 0, 3]))).toBe(false);
    });
});

describe('雷霆AI: 夜の帳で氷室の絶対零度（実コスト = 10 − 氷結の数）を遅らせる', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { skillCosts } = require('./skillCosts');
    const FRZ = { effect: '❄' as const };
    const run = (cryoMagic: number, frost: number, hand: number[]) => {
        const ai = new AIPlayer('💙', 'electrician', ['⭕'], ['electrician', 'cryomancer']);
        const b: SquareInfo[] = Array.from({ length: 16 }, () => ({ player: undefined, bind: 0, effects: [] }));
        b[0] = { player: '💙', bind: 5, effects: [{ effect: '⚡' }] };
        b[5] = { player: '⭕', bind: 5, effects: Array.from({ length: frost }, () => ({ ...FRZ })) };
        return ai.makeMove(b, 6, skillCosts, cryoMagic, 5, hand, false, 0, 0, 99, 99, false, [6, cryoMagic]);
    };
    it('氷結が無ければ実コスト10: 氷室の次の手番の魔力が10〜12に届くなら撃つ', () => {
        expect(run(9, 0, [98, 21, 23]).skills).toContain('onClickNightVeil');
        expect(run(11, 0, [98, 21, 23]).skills).toContain('onClickNightVeil');
    });
    it('氷結が増えると実コストが下がり、その分だけ低い魔力でも撃つ（❄4つ → 実コスト6）', () => {
        expect(run(5, 4, [98, 21, 23]).skills).toContain('onClickNightVeil');
        expect(run(5, 0, [98, 21, 23]).skills ?? []).not.toContain('onClickNightVeil');
    });
    it('届かない（実コスト未満）か、+3でも遅らせられない（実コスト+3以上）なら撃たない', () => {
        expect(run(5, 0, [98, 21, 23]).skills ?? []).not.toContain('onClickNightVeil');
        expect(run(12, 0, [98, 21, 23]).skills ?? []).not.toContain('onClickNightVeil');
    });
});

describe('雷霆AI: 沈黙は雷なりで相手の固有スキルの手番を封じる', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { skillCosts } = require('./skillCosts');
    const run = (cryoMagic: number, bolts: boolean, hand: number[] = [113, 21, 23]) => {
        const ai = new AIPlayer('💙', 'electrician', ['⭕'], ['electrician', 'cryomancer']);
        const b: SquareInfo[] = Array.from({ length: 16 }, () => ({ player: undefined, bind: 0, effects: [] }));
        b[0] = { player: '💙', bind: 5, effects: bolts ? [{ effect: '⚡' }, { effect: '⚡' }] : [] };
        b[1] = { player: '💙', bind: 5, effects: bolts ? [{ effect: '⚡' }] : [] };
        b[5] = { player: '⭕', bind: 5, effects: [] };
        return ai.makeMove(b, 6, skillCosts, cryoMagic, 5, hand, false, 0, 0, 99, 99, false, [6, cryoMagic]);
    };
    it('氷室が次の手番に絶対零度（実コスト10）を撃てる魔力に届くなら、⚡の多いコマを選んで撃つ', () => {
        const r = run(9, true);
        expect(r.chargeClicks).toEqual([{ skill: 'onClickBoltSilence', target: 0, target2: 0 }]); // 2スタックのコマから2個払う
    });
    it('⚡が合計1つしか無ければ撃てない', () => {
        const ai = new AIPlayer('💙', 'electrician', ['⭕'], ['electrician', 'cryomancer']);
        const b: SquareInfo[] = Array.from({ length: 16 }, () => ({ player: undefined, bind: 0, effects: [] }));
        b[0] = { player: '💙', bind: 5, effects: [{ effect: '⚡' }] };
        b[5] = { player: '⭕', bind: 5, effects: [] };
        const r = ai.makeMove(b, 6, skillCosts, 9, 5, [113, 21, 23], false, 0, 0, 99, 99, false, [6, 9]);
        expect((r.chargeClicks ?? []).map((c) => c.skill)).not.toContain('onClickBoltSilence');
    });
    it('届かない魔力なら撃たない／自陣に⚡が無ければ撃てない', () => {
        expect(run(4, true).chargeClicks ?? []).toEqual([]);
        expect(run(9, false).chargeClicks ?? []).toEqual([]);
    });
    it('相手にリーチがあるときは撃たず、守りを優先する', () => {
        const ai = new AIPlayer('💙', 'electrician', ['⭕'], ['electrician', 'cryomancer']);
        const b: SquareInfo[] = Array.from({ length: 16 }, () => ({ player: undefined, bind: 0, effects: [] }));
        b[0] = { player: '💙', bind: 5, effects: [{ effect: '⚡' }] };
        [4, 5, 6].forEach((i) => (b[i] = { player: '⭕', bind: 5, effects: [] })); // 行1に敵のリーチ（7が空き）
        const r = ai.makeMove(b, 6, skillCosts, 9, 5, [113, 21, 23], false, 0, 0, 99, 99, false, [6, 9]);
        expect((r.chargeClicks ?? []).map((c) => c.skill)).not.toContain('onClickBoltSilence');
    });
});

describe('雷霆AI: オブジェクト（雷雲）を設置する', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { skillCosts } = require('./skillCosts');
    const empty = (): SquareInfo[] => Array.from({ length: 16 }, () => ({ player: undefined, bind: 0, effects: [] }));
    const run = (b: SquareInfo[], magic: number, hand: number[]) =>
        new AIPlayer('💙', 'electrician', ['⭕'], ['electrician', 'tactician']).makeMove(b, magic, skillCosts, 2, 5, hand, false);
    it('雷雲（idx 109）: 周囲八マスに敵のコマが2つ以上あるマスに立てる', () => {
        const b = empty();
        [5, 6].forEach((i) => (b[i] = { player: '⭕', bind: 5, effects: [] }));
        b[0] = { player: '💙', bind: 5, effects: [] };
        const r = run(b, 6, [109, 21, 23]);
        const click = (r.chargeClicks ?? []).find((c) => c.skill === 'onClickThundercloud');
        expect(click).toBeDefined();
        expect([0, 1, 2, 4, 7, 8, 9, 10].includes(click!.target as number)).toBe(true); // 敵(5,6)の隣のマス
    });
    it('雷雲: 周囲に敵のコマが1つしか立てられるマスが無ければ撃たない／魔力が足りなければ撃たない', () => {
        const b = empty();
        b[5] = { player: '⭕', bind: 5, effects: [] };
        expect((run(b, 6, [109, 21, 23]).chargeClicks ?? []).map((c) => c.skill)).not.toContain('onClickThundercloud');
        const b2 = empty();
        [5, 6].forEach((i) => (b2[i] = { player: '⭕', bind: 5, effects: [] }));
        expect((run(b2, 3, [109, 21, 23]).chargeClicks ?? []).map((c) => c.skill)).not.toContain('onClickThundercloud');
    });
    it('大木（idx 105）は撃たない（対強豪で悪化: 魔力8を貯める間の損が回収できない。docs/tune/electrician.md 試行52）', () => {
        const b = empty();
        b[5] = { player: '⭕', bind: 5, effects: [] };
        b[0] = { player: '💙', bind: 5, effects: [] };
        expect((run(b, 12, [105, 21, 23]).chargeClicks ?? []).map((c) => c.skill)).not.toContain('onClickBigTree');
    });
    it('オブジェクトのマスは AI から『置けない空きマス』に見え、自陣のコマとして列に数えられない', () => {
        const b = empty();
        b[0] = { player: '💙', bind: 5, effects: [], object: 'bigTree' };
        [1, 2, 3].forEach((i) => (b[i] = { player: '💙', bind: 5, effects: [] }));
        // 行0は 大木(オブジェクト)+3コマ。オブジェクトは列に数えないので勝ち筋のリーチではない（誤認して0に置こうとしない）
        const r = run(b, 2, [21, 23, 22]);
        expect(r.move).not.toBe(0);
    });
});
