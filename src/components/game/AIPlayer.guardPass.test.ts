import AIPlayer from './AIPlayer';
import { SquareInfo } from '../../types/SquareInfo';

describe('guardPass: チャージだけで手番を終える計画でも、相手に1手で勝たれるなら塞ぐ', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { skillCosts } = require('./skillCosts');
    // 列1(1,5,9,13): 5,9,13 が相手(💙)で、1 が自分(⭕)のライフ0のコマ。相手は 1 を奪って勝てる（空きマスで完成するリーチではない）
    const board = () => {
        const b: SquareInfo[] = Array.from({ length: 16 }, () => ({ player: undefined, bind: 0, effects: [] }));
        for (const i of [5, 9, 13]) b[i] = { player: '💙', bind: 0, effects: [] };
        b[1] = { player: '⭕', bind: 0, effects: [] };
        return b;
    };
    const ai = () => new AIPlayer('⭕', 'yinYangMaster', ['💙'], ['tactician', 'yinYangMaster'], undefined, false, false);
    const args = (b: SquareInfo[]) => [b, 20, skillCosts, 5, 8, [], false] as Parameters<AIPlayer['makeMove']>;

    it('チャージのみの計画は、塞ぐ着手に差し替える', () => {
        const a = ai();
        const r = a.guardPass({ move: null, skills: ['onClickCharge'] }, args(board()));
        expect(r.skills).toEqual([]);
        expect(r.move).not.toBeNull();
    });
    it('相手に勝ち手が無ければチャージのまま', () => {
        const a = ai();
        const b = board();
        b[13] = { player: undefined, bind: 0, effects: [] };
        const r = a.guardPass({ move: null, skills: ['onClickCharge'] }, args(b));
        expect(r.skills).toEqual(['onClickCharge']);
    });
    it('チャージ以外のスキルを含む計画はそのまま', () => {
        const a = ai();
        const r = a.guardPass({ move: null, skills: ['onClickCharge', 'onClickOpium'] }, args(board()));
        expect(r.skills).toEqual(['onClickCharge', 'onClickOpium']);
    });
});

describe('immediateWinMove: 着手の前の減衰（🔥で消えるコマ）を見る', () => {
    it('列の1コマが🔥で燃え尽きるなら、4つ目を置いても勝ちと数えない', () => {
        const b: SquareInfo[] = Array.from({ length: 16 }, () => ({ player: undefined, bind: 0, effects: [] }));
        b[0] = { player: '💙', bind: 0, effects: [] };
        b[8] = { player: '💙', bind: 0, effects: [] };
        b[12] = { player: '💙', bind: 2, effects: [{ effect: '🔥' }] };
        const ai = new AIPlayer('💙', 'keysmith', ['⭕'], ['keysmith', 'pyromancer'], undefined, false, false);
        expect(ai.immediateWinMove(b, 8)).toBeNull();
        b[12] = { player: '💙', bind: 2, effects: [] };
        expect(ai.immediateWinMove(b, 8)).toBe(4);
    });
});

describe('guardPass: ロックだけの計画でも、相手に1手で勝たれるなら塞ぐ着手に差し替える', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { skillCosts } = require('./skillCosts');
    // 行0: 0,1,2 が相手(⭕)で 3 が自分(💙)のライフ0のコマ。相手は 3 を奪って勝てる
    const board = () => {
        const b: SquareInfo[] = Array.from({ length: 16 }, () => ({ player: undefined, bind: 0, effects: [] }));
        for (const i of [0, 1, 2]) b[i] = { player: '⭕', bind: 0, effects: [] };
        b[3] = { player: '💙', bind: 0, effects: [] };
        return b;
    };
    const args = (b: SquareInfo[]) => [b, 6, skillCosts, 5, 3, [], false] as Parameters<AIPlayer['makeMove']>;
    const ai = () => new AIPlayer('💙', 'keysmith', ['⭕'], ['keysmith', 'magician'], undefined, false, false);

    it('無関係なマス(6)をロックして7に置く計画は、塞ぐ着手に差し替える', () => {
        const r = ai().guardPass({ move: 7, skills: ['onClickUseLock'], lockTargets: [6] }, args(board()));
        expect(r.skills).toEqual([]);
        expect(r.move).not.toBe(7);
        expect(r.move).not.toBeNull();
    });
    it('脅威のマス(3)をロックする計画は、止まっているのでそのまま', () => {
        const plan = { move: 7, skills: ['onClickUseLock'], lockTargets: [3] };
        expect(ai().guardPass(plan, args(board()))).toEqual(plan);
    });
});
