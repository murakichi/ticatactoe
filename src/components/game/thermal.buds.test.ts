import {
    budStacks,
    activeBuds,
    canBud,
    harvestBuds,
    budReceivers,
    graft,
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
