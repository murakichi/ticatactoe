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
    it('中心の氷結中の敵コマも、氷結ごと破壊されて中心に置ける（氷結は身代わりにならない）', () => {
        const b = board();
        b[5] = { player: '⭕', bind: 7, effects: [{ effect: '❄' }] };
        const r = judgeDay(b, 5, '💙');
        expect(r.broken).toEqual([5]);
        expect(r.destroyed).toBe(1);
        expect(b[5].player).toBe('💙');
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
    it('中心の敵コマにバッズが付いていたら置かれない（ロックも付かない）', () => {
        const b = board();
        b[5] = { player: '⭕', bind: 7, effects: [{ effect: '🌱' }] };
        judgeDay(b, 5, '💙', { gears: [], seat: 0 });
        expect(b[5].player).toBe('⭕');
        expect(b[5].effects.some((e) => e.effect === '🔑')).toBe(false);
    });
});

describe('審判の日の処理順（敵味方問わず、バッズのないマス: すべてのエフェクト-99→99ダメージ→0は破壊）', () => {
    const LK = (stack: number) => ({ effect: '🔑' as const, stack });
    it('空きマス: ロック・氷結・炎など全てのエフェクトが外れる', () => {
        const b = board();
        b[4] = { player: undefined, bind: 0, effects: [LK(6)] };
        b[6] = { player: undefined, bind: 0, effects: [{ effect: '❄' }, { effect: '❄' }] };
        b[1] = { player: undefined, bind: 0, effects: [{ effect: '🔥' }, LK(2)] };
        const r = judgeDay(b, 5, '💙');
        expect(b[4].effects).toEqual([]);
        expect(b[6].effects).toEqual([]);
        expect(b[1].effects).toEqual([]);
        expect(r.broken).toEqual([6]); // 氷結が解けたマス
    });
    it('敵陣: ロック付きのコマ（ライフ0でも）は全エフェクトが外れて破壊される。破壊した数が返る', () => {
        const b = board();
        b[4] = { player: '⭕', bind: 5, effects: [LK(9)] };
        b[6] = { player: '⭕', bind: 0, effects: [LK(1)] };
        const r = judgeDay(b, 5, '💙');
        expect(b[4]).toEqual({ player: undefined, bind: 0, effects: [] });
        expect(b[6]).toEqual({ player: undefined, bind: 0, effects: [] });
        expect(r.destroyed).toBe(2);
    });
    it('敵陣: オブジェクトも破壊される', () => {
        const b = board();
        b[4] = { player: '⭕', bind: 5, effects: [], object: 'bigTree' };
        const r = judgeDay(b, 5, '💙');
        expect(b[4]).toEqual({ player: undefined, bind: 0, effects: [] });
        expect(r.destroyed).toBe(1);
    });
    it('敵陣: 氷結中・ロック付き・⚡のコマも全エフェクトが外れて破壊される（氷結は身代わりにならない）', () => {
        const b = board();
        b[4] = { player: '⭕', bind: 5, effects: [{ effect: '❄' }, { effect: '❄' }, LK(6), { effect: '⚡' }] };
        const r = judgeDay(b, 5, '💙');
        expect(b[4].player).toBeUndefined();
        expect(r.broken).toEqual([4]);
        expect(r.destroyed).toBe(1);
    });
    it('バッズのあるマスは敵味方問わず対象外（コマもロックもそのまま）', () => {
        const b = board();
        b[4] = { player: '⭕', bind: 5, effects: [{ effect: '🌱' }, LK(6)] }; // 敵のバッズ付き
        b[6] = { player: '💙', bind: 5, effects: [{ effect: '🌱' }] }; // 自陣のバッズ付き（ロックなし）
        b[1] = { player: '⭕', bind: 5, effects: [{ effect: '🌱' }, { effect: '❄' }] }; // 氷結中でもそのまま
        const r = judgeDay(b, 5, '💙');
        expect(b[4].player).toBe('⭕');
        expect(b[4].effects).toEqual([{ effect: '🌱' }, LK(6)]);
        expect(b[6].player).toBe('💙');
        expect(b[1].effects).toEqual([{ effect: '🌱' }, { effect: '❄' }]);
        expect(r.destroyed).toBe(0);
    });
    it('自陣のバッズのないコマは、ロック付きでも破壊される', () => {
        const b = board();
        b[4] = { player: '💙', bind: 5, effects: [LK(6)] };
        b[6] = { player: '💙', bind: 5, effects: [] };
        const r = judgeDay(b, 5, '💙');
        expect(b[4].player).toBeUndefined();
        expect(b[6].player).toBeUndefined();
        expect(r.destroyed).toBe(2);
    });
    it('中心: 氷結中・ロック付きの空きマスにも置ける（エフェクトは全て外れ、新しい🔑を掛ける）', () => {
        const b = board();
        b[5] = { player: undefined, bind: 0, effects: [{ effect: '❄' }, LK(9)] };
        judgeDay(b, 5, '💙', { gears: [], seat: 0 });
        expect(b[5].player).toBe('💙');
        expect(b[5].effects).toEqual([{ effect: '🌱' }, LK(6)]);
    });
});
