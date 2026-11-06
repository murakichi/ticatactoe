import { judgeDay, stomp } from './blast';
import { SquareInfo } from '../../types/SquareInfo';

const board = (): SquareInfo[] => Array.from({ length: 16 }, () => ({ player: undefined, bind: 0, effects: [] }));

describe('ストンプ', () => {
    it('範囲の敵コマは破壊（氷結は身代わり）、自陣のコマは-5、中心の空きマスに自分のコマを置く', () => {
        const b = board();
        b[0] = { player: '⭕', bind: 3, effects: [] };
        b[1] = { player: '⭕', bind: 3, effects: [{ effect: '❄' }] };
        b[4] = { player: '💙', bind: 8, effects: [] };
        const r = stomp(b, 5, '💙', 6);
        expect(r.destroyed).toBe(1);
        expect(r.broken).toEqual([1]);
        expect(b[0].player).toBeUndefined();
        expect(b[1].player).toBe('⭕');
        expect(b[4].bind).toBe(3);
        expect(b[5]).toEqual({ player: '💙', bind: 6, effects: [] });
    });
    it('中心が氷結中の空きマスなら着手しない', () => {
        const b = board();
        b[5] = { player: undefined, bind: 0, effects: [{ effect: '❄' }, { effect: '❄' }] };
        stomp(b, 5, '💙', 6);
        expect(b[5].player).toBeUndefined();
    });
});

describe('審判の日', () => {
    it('範囲（斜めを含む）を壊し、中心は🌱付きのライフ2。自陣の🌱付きロックマスは守られる', () => {
        const b = board();
        b[5] = { player: '⭕', bind: 7, effects: [] };
        b[1] = { player: '💙', bind: 5, effects: [{ effect: '🌱' }, { effect: '🔑' }] };
        b[4] = { player: '⭕', bind: 3, effects: [] };
        b[3] = { player: '⭕', bind: 3, effects: [] }; // 範囲の外
        const r = judgeDay(b, 5, '💙');
        expect(r.destroyed).toBe(2);
        expect(b[5]).toEqual({ player: '💙', bind: 2, effects: [{ effect: '🌱' }] });
        expect(b[1].player).toBe('💙');
        expect(b[4].player).toBeUndefined();
        expect(b[3].player).toBe('⭕');
    });
    it('中心の敵コマを氷結が守ったら、中心は奪えない', () => {
        const b = board();
        b[5] = { player: '⭕', bind: 7, effects: [{ effect: '❄' }] };
        const r = judgeDay(b, 5, '💙');
        expect(r.broken).toEqual([5]);
        expect(b[5].player).toBe('⭕');
    });
});

describe('審判の日で置いたマスはロック付き', () => {
    it('中心は🌱＋🔑のロック付きで置かれ、スタックは通常のロック(6)でライフは2のまま。ロック引数が無ければ従来どおり（🔑なし）', () => {
        const b = board();
        judgeDay(b, 5, '💙', { gears: [], seat: 0 });
        expect(b[5].player).toBe('💙');
        expect(b[5].effects).toEqual([{ effect: '🌱' }, { effect: '🔑', stack: 6 }]);
        expect(b[5].bind).toBe(2); // ロックはライフを変えない(#438)
        const b2 = board();
        judgeDay(b2, 5, '💙');
        expect(b2[5].effects).toEqual([{ effect: '🌱' }]);
        expect(b2[5].bind).toBe(2);
    });
    it('堅牢の鍵があればロックのスタックが延びる(9)', () => {
        const b = board();
        judgeDay(b, 5, '💙', { gears: ['ironLock', 'luckyPurse'], seat: 0 });
        expect(b[5].effects).toEqual([{ effect: '🌱' }, { effect: '🔑', stack: 9 }]);
    });
    it('置いたコマ(🌱＋🔑)は、次の審判の日で自分が撃っても壊れない', () => {
        const b = board();
        judgeDay(b, 5, '💙', { gears: [], seat: 0 });
        b[6] = { player: '⭕', bind: 3, effects: [] };
        const r = judgeDay(b, 6, '💙', { gears: [], seat: 0 });
        expect(b[5].player).toBe('💙');
        expect(r.destroyed).toBe(1);
    });
    it('中心の敵コマを氷結が守ったときは置かれないのでロックも付かない', () => {
        const b = board();
        b[5] = { player: '⭕', bind: 7, effects: [{ effect: '❄' }] };
        judgeDay(b, 5, '💙', { gears: [], seat: 0 });
        expect(b[5].player).toBe('⭕');
        expect(b[5].effects.some((e) => e.effect === '🔑')).toBe(false);
    });
});
