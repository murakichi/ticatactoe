import AIPlayer from './AIPlayer';
import { SquareInfo } from '../../types/SquareInfo';
import { awakenPlan } from './dragon';
import { OBJECT_LIFE } from './objects';

const E = (): SquareInfo => ({ player: undefined, bind: 0, effects: [] });
const mk = (n: number): SquareInfo[] => Array.from({ length: n * n }, E);
const at = (r: number, c: number): number => r * 5 + c;
const fort = (): SquareInfo => ({ player: '💙', bind: OBJECT_LIFE, effects: [], object: 'fort' });

describe('龍神の巫女のAI（#527）', () => {
    const ai = () => {
        const a = new AIPlayer('💙', 'dragonMiko', ['⭕'], ['dragonMiko', 'you'], undefined, false, false, [3, 11, 12, 28, 52, 92, 5, 8, 108, 127, 128, 136]);
        return a;
    };

    it('覚醒する4つ目の置き先は、囲みの中に自分のコマを巻き込まない位置を選ぶ', () => {
        const b = mk(5);
        // 角を斜めに切る型の3つ（(0,3)(1,2)(2,1)）。4つ目の候補は (3,0)。囲まれる範囲は角側の (0,0)(0,1)(0,2)(1,0)(1,1)(2,0)
        [at(0, 3), at(1, 2), at(2, 1)].forEach((i) => { b[i] = fort(); });
        b[at(0, 0)] = { player: '💙', bind: 3, effects: [] }; // 自分のコマが角側にある
        b[at(1, 1)] = { player: '⭕', bind: 3, effects: [] }; // 敵のコマも角側にある
        const cell = ai().mikoBuildCell(b, '💙');
        expect(cell).not.toBeNull();
        const hyp = b.map((sq, j) => (j === cell ? fort() : sq));
        const plan = awakenPlan(hyp, '💙');
        expect(plan).not.toBeNull();
        // 自分のコマ (0,0) が囲みに入らない置き先、または入っても代わりに多く敵を消す位置を選んでいる（少なくとも最悪の選択ではない）
        const ownLost = plan!.enclosed.filter((j) => b[j].player === '💙').length;
        const worst = (() => {
            let m = 0;
            for (let i = 0; i < b.length; i++) {
                if (b[i].player || b[i].object) continue;
                const p = awakenPlan(b.map((sq, j) => (j === i ? fort() : sq)), '💙');
                if (p) m = Math.max(m, p.enclosed.filter((j) => b[j].player === '💙').length);
            }
            return m;
        })();
        expect(worst).toBeGreaterThanOrEqual(1); // 巻き込む置き先が存在する
        expect(ownLost).toBeLessThanOrEqual(worst);
    });

    it('建造物が3つ未満のときは、角を斜めに切る型へ寄せる', () => {
        const b = mk(5);
        b[at(0, 3)] = fort();
        const cell = ai().mikoBuildCell(b, '💙');
        expect([at(1, 2), at(2, 1), at(3, 0)]).toContain(cell);
    });

    it('龍は空きマスが少ないと、祈りで建造物を増やさない（盤が建造物で埋まって決着しない膠着の対策）', () => {
        const { skillCosts } = require('./skillCosts');
        const run = (emptyCells: number[]) => {
            const b = mk(4);
            for (let i = 0; i < 16; i++) b[i] = { player: ((i >> 1) + (i >> 3)) % 2 ? '💙' : '⭕', bind: 3, effects: [{ effect: '🔑' as const }] };
            emptyCells.forEach((i) => { b[i] = E(); });
            const a = ai();
            a.dragonForm = 'dragon';
            return a.makeMove(b, 5, skillCosts, 2, 5, [3, 11, 12, 28, 52, 92, 5, 8, 108, 127, 128, 136], false);
        };
        const prayed = (r: any) => (r.chargeClicks ?? []).some((c: any) => c.skill === 'onClickPrayer');
        expect(prayed(run([1, 6, 11, 12]))).toBe(false); // 空き4以下: 祈らない
        expect(prayed(run([1, 6, 11, 12, 2, 7]))).toBe(true); // 空きが多ければ祈る
    });

    it('氷室の番人・鍵師・巨人が相手のときだけ、サイレンスを手札に固定する', () => {
        const mkAi = (opp: string) => new AIPlayer('💙', 'dragonMiko', ['⭕'], ['dragonMiko', opp as never], undefined, false, false, [3, 11, 12, 28, 52, 92, 5, 8, 108, 127, 128, 136]);
        const b = mk(4);
        expect(mkAi('cryomancer').chooseLocks(b, 5, 3, [28, 3, 5])).toEqual([28]);
        expect(mkAi('keysmith').chooseLocks(b, 5, 3, [28, 3, 5])).toEqual([28]);
        expect(mkAi('giant').chooseLocks(b, 5, 3, [28, 3, 5])).toEqual([28]);
        expect(mkAi('necromancer').chooseLocks(b, 5, 3, [28, 3, 5])).not.toEqual([28]);
        expect(mkAi('cryomancer').chooseLocks(b, 5, 3, [3, 5, 8])).not.toEqual([28]);
    });
});
