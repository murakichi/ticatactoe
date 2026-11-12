import AIPlayer from './AIPlayer';
import { SquareInfo } from '../../types/SquareInfo';
import { CharacterId } from '../../types/Character';
import { skillCosts } from './skillCosts';
import { newObject, ONE_PIECE_MULTI_KEYS } from './objects';
import { LIFE_BAN_PLACING_KEYS } from './lifeBan';

// 汎用のオブジェクト対応（makeMove → planObjectPlays）: 縛りへの対応・解体・手札のオブジェクトの設置
describe('AI: オブジェクトへの対応', () => {
    const empty = (): SquareInfo[] => Array.from({ length: 16 }, () => ({ player: undefined, bind: 0, effects: [] }));
    const run = (me: CharacterId, opp: CharacterId, b: SquareInfo[], magic: number, hand: number[]) =>
        new AIPlayer('💙', me, ['⭕'], [me, opp]).makeMove(b, magic, skillCosts, 2, 5, hand, false);
    const quiet = (): SquareInfo[] => {
        const b = empty();
        b[0] = { player: '💙', bind: 5, effects: [] };
        b[15] = { player: '⭕', bind: 5, effects: [] };
        return b;
    };
    const keys = (r: ReturnType<typeof run>): string[] => [...(r.chargeClicks ?? []).map((c) => c.skill), ...r.skills];

    it('お一人様限りの札に縛られていると、コマを置くスキルを撃たない（札が無ければ撃つ）', () => {
        const free = keys(run('tactician', 'you', quiet(), 12, [3, 11, 9]));
        const placing = (k: string) => ONE_PIECE_MULTI_KEYS.has(k) || LIFE_BAN_PLACING_KEYS.has(k);
        expect(free.some(placing)).toBe(true); // 前提: 札が無ければトークンを撃つ盤面
        const b = quiet();
        b[3] = newObject('⭕', 'soloSign', 0, []);
        const r = run('tactician', 'you', b, 12, [3, 11, 9]);
        expect(keys(r).some(placing)).toBe(false);
        expect(r.move).not.toBeNull();
    });

    it('解体（idx 114）: 自分を縛る敵のオブジェクトを壊す。価値の低いもの（大岩）は壊さない', () => {
        const b = quiet();
        b[3] = newObject('⭕', 'soloSign', 0, []);
        const r = run('tactician', 'you', b, 12, [114, 4, 5]);
        expect(r.chargeClicks?.[0]).toEqual({ skill: 'onClickDemolish', target: 3 });
        const b2 = quiet();
        b2[3] = { player: '⭕', bind: 5, effects: [], object: 'boulder' };
        expect(keys(run('tactician', 'you', b2, 12, [114, 4, 5]))).not.toContain('onClickDemolish');
    });

    it('手札のオブジェクト（生命の泉 idx 107）を、静かな手番に空きマスへ置く。着手とは別のマス', () => {
        const r = run('you', 'tactician', quiet(), 6, [107, 0, 1]);
        const click = (r.chargeClicks ?? []).find((c) => c.skill === 'onClickSpring');
        expect(click).toBeDefined();
        expect(click!.target).not.toBe(r.move);
        // 魔力が足りなければ置かない
        expect(keys(run('you', 'tactician', quiet(), 1, [107, 0, 1]))).not.toContain('onClickSpring');
    });

    it('相手を縛るオブジェクトは、効く相手がいるときだけ置く（一言居士 idx 128: 雷霆には置く・あなたには置かない）', () => {
        expect(keys(run('you', 'electrician', quiet(), 8, [128, 0, 1]))).toContain('onClickOneWord');
        expect(keys(run('you', 'you', quiet(), 8, [128, 0, 1]))).not.toContain('onClickOneWord');
    });
});
