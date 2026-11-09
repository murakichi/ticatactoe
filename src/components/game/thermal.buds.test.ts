import {
    budStacks,
    activeBuds,
    canBud,
    harvestBuds,
    budReceivers,
    graft,
    suckerGraft,
    GRAFT_MAX,
    sowCandidates,
    sow,
    SOW_COUNT,
} from './thermal';
import { emptyBoard, sq } from './thermalTestUtils';

describe('バッズ系の汎用スキル（刈り入れ前夜・冬至の種子・ひこばえ・風の落とし子）', () => {
    it('刈り入れ前夜: 自陣の🌱を全部除去して数を返す。他人のコマは触らない', () => {
        const b = emptyBoard();
        b[0] = sq('💙', 3, '🌱', '🌱', '☠');
        b[1] = sq('💙', 3, '🌱');
        b[2] = sq('⭕', 3, '🌱');
        expect(harvestBuds(b, '💙')).toBe(3);
        expect(b[0].effects.map((e) => e.effect)).toEqual(['☠']);
        expect(budStacks(b[1])).toBe(0);
        expect(budStacks(b[2])).toBe(1);
        expect(harvestBuds(b, '💙')).toBe(0);
    });

    it('冬至の種子: guarded なら、氷結・火炎中のマスの🌱も働く（魔力・刈り入れ前夜）', () => {
        const dormantSq = sq('💙', 3, '🌱', '❄');
        expect(activeBuds(dormantSq)).toBe(0);
        expect(activeBuds(dormantSq, true)).toBe(1);
        expect(activeBuds(sq('💙', 3, '🌱', '🔥'), true)).toBe(1);
        expect(activeBuds(sq('💙', 3, '🌱'))).toBe(1);
    });

    it('ひこばえ: 縦横隣の自陣コマ全てに🌱を1つ。氷結・火炎中のコマ・敵・空きマス・斜めには付かない', () => {
        const b = emptyBoard();
        b[5] = sq('💙', 3, '🌱');
        b[1] = sq('💙', 3);
        b[4] = sq('💙', 3, '🌱');
        b[6] = sq('💙', 3, '❄');
        b[9] = sq('💙', 3, '🔥');
        b[0] = sq('💙', 3); // 斜め
        b[10] = sq('⭕', 3);
        expect(canBud(b[6])).toBe(false);
        expect(budReceivers(b, 5, '💙', 4).sort((a, c) => a - c)).toEqual([1, 4]);
        expect(graft(b, 5, '💙', 4).sort((a, c) => a - c)).toEqual([1, 4]);
        expect(budStacks(b[1])).toBe(1);
        expect(budStacks(b[4])).toBe(2);
        expect(budStacks(b[0])).toBe(0);
        expect(budStacks(b[10])).toBe(0);
    });

    it('ひこばえ: picked を渡すと受け手のうちそのマスだけに付く（GRAFT_MAX=2）', () => {
        const b = emptyBoard();
        b[5] = sq('💙', 3, '🌱');
        [1, 4, 6, 9].forEach((k) => (b[k] = sq('💙', 3)));
        expect(GRAFT_MAX).toBe(2);
        expect(graft(b, 5, '💙', 4, [4, 9]).sort((a, c) => a - c)).toEqual([4, 9]);
        expect(budStacks(b[4])).toBe(1);
        expect(budStacks(b[9])).toBe(1);
        expect(budStacks(b[1])).toBe(0);
        expect(graft(b, 5, '💙', 4, [0, 15])).toEqual([]); // 受け手でないマスは無視
    });

    it('風の落とし子: 候補は自陣の🌱を持てるコマ。picks の各マスに🌱を1つずつ足す', () => {
        const b = emptyBoard();
        b[0] = sq('💙', 3);
        b[1] = sq('💙', 3, '❄');
        b[2] = sq('💙', 3, '🔥');
        b[3] = sq('⭕', 3);
        b[4] = sq('💙', 3, '🌱');
        expect(sowCandidates(b, '💙')).toEqual([0, 4]);
        sow(b, [0, 4]);
        expect(budStacks(b[0])).toBe(1);
        expect(budStacks(b[4])).toBe(2);
        expect(SOW_COUNT).toBe(2);
    });

});

describe('ひこばえの受け手の選び方（Game / sim 共有）', () => {
    it('受け手が GRAFT_MAX 以下なら pick を呼ばず全員に、超えるなら pick が選んだ GRAFT_MAX 個だけに🌱', () => {
        const b = emptyBoard();
        b[5] = sq('💙', 4, '🌱');
        b[1] = sq('💙', 4);
        b[4] = sq('💙', 4);
        let called = 0;
        const done = suckerGraft(b, 5, '💙', 4, (r) => { called++; return r; });
        expect(called).toBe(0);
        expect(done).toEqual([1, 4]);

        const c = emptyBoard();
        c[5] = sq('💙', 4, '🌱');
        c[1] = sq('💙', 4);
        c[4] = sq('💙', 4);
        c[6] = sq('💙', 4);
        const got = suckerGraft(c, 5, '💙', 4, (r, n) => { expect(n).toBe(GRAFT_MAX); return r.slice(0, n); });
        expect(got).toHaveLength(GRAFT_MAX);
        expect(c.filter((x) => x.effects.some((e) => e.effect === '🌱')).length).toBe(1 + GRAFT_MAX);
    });
});
