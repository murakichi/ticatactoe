import AIPlayer from './AIPlayer';
import { SquareInfo } from '../../types/SquareInfo';
import { newObject, OBJECT_SKILLS } from './objects';
import { arsonTarget, buildBanWanted, ignoreObjectsWanted } from './aiObjectControl';
import { CharacterId } from '../../types/Character';

const empty = (): SquareInfo[] => Array.from({ length: 16 }, () => ({ player: undefined, bind: 0, effects: [] }));
const chars: CharacterId[] = ['you', 'you'];

describe('新スキルの狙い（aiObjectControl）', () => {
    it('付け火: 敵のオブジェクトだけを、価値の高い順に狙う。燃えているもの・自陣・🔑ロックは狙わない', () => {
        const b = empty();
        b[0] = newObject('⭕', 'fort');
        b[1] = newObject('⭕', 'bigTree');
        b[2] = newObject('💙', 'poisonSwamp');
        expect(arsonTarget(b, '💙', chars)).toBe(1);
        b[1] = { ...b[1], effects: [{ effect: '🔥' }] };
        expect(arsonTarget(b, '💙', chars)).toBe(0);
        b[0] = { ...b[0], effects: [{ effect: '🔑', value: 2 }] };
        expect(arsonTarget(b, '💙', chars)).toBeNull();
    });
    it('普請停止令: 龍神の巫女の建造物が3つ以上のときだけ', () => {
        const b = empty();
        const who = (p: string) => (p === '⭕' ? 'dragonMiko' : 'you');
        [0, 1].forEach((i) => { b[i] = newObject('⭕', 'fort'); });
        expect(buildBanWanted(b, ['⭕'], who)).toBe(false);
        b[2] = newObject('⭕', 'fort');
        expect(buildBanWanted(b, ['⭕'], who)).toBe(true);
        expect(buildBanWanted(b, ['⭕'], () => 'you')).toBe(false);
    });
    it('お構いなし: 毒沼に自陣のコマが2つ以上狙われているか、縛りのオブジェクトがあり魔力に余裕があるとき', () => {
        const b = empty();
        b[5] = newObject('⭕', 'poisonSwamp');
        b[6] = { player: '💙', bind: 3, effects: [] };
        expect(ignoreObjectsWanted(b, '💙', chars, 0)).toBe(false);
        b[4] = { player: '💙', bind: 3, effects: [] };
        expect(ignoreObjectsWanted(b, '💙', chars, 0)).toBe(true);
        const c = empty();
        c[0] = newObject('⭕', 'mudField');
        expect(ignoreObjectsWanted(c, '💙', chars, 3)).toBe(false);
        expect(ignoreObjectsWanted(c, '💙', chars, 4)).toBe(true);
    });
});

describe('AIが新スキルを撃つ', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { skillCosts } = require('./skillCosts');
    const ai = () => new AIPlayer('💙', 'you', ['⭕'], ['you', 'you'], undefined, false, false);
    it('敵の大木があり、手札に付け火があれば焼く', () => {
        const b = empty();
        b[3] = newObject('⭕', 'bigTree');
        [0, 7, 13].forEach((i) => { b[i] = { player: '💙', bind: 3, effects: [] }; });
        [2, 9, 12].forEach((i) => { b[i] = { player: '⭕', bind: 3, effects: [] }; });
        const r = ai().makeMove(b, 20, skillCosts, 5, 8, [OBJECT_SKILLS.arson.idx], false);
        expect(r.chargeClicks?.some((c) => c.skill === 'onClickArson' && c.target === 3)).toBe(true);
    });
});
