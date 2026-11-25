import { MEDICINE_LIFE, ownSweepTargets, witherAndSow, medicineAndPoison } from './ownSweep';
import { SquareInfo } from '../../types/SquareInfo';
import { CharacterId } from '../../types/Character';

const sq = (player: SquareInfo['player'], bind: number, effects: SquareInfo['effects'] = [], object?: SquareInfo['object']): SquareInfo => ({ player, bind, effects, ...(object ? { object } : {}) });
const board = (): SquareInfo[] => [
    sq('💙', 5), sq('💙', 3, [{ effect: '🔥' }]), sq('💙', 4, [{ effect: '🔑' }]), sq('💙', 4, [{ effect: '❄' }]), sq('💙', 4, [], 'bigTree'), sq('⭕', 4), sq(undefined, 0),
];
const chars: CharacterId[] = ['you', 'you'];

describe('自陣全体の3スキル', () => {
    it('対象は自陣のコマのうち、🔑ロック・❄氷結・オブジェクトでないもの', () => {
        expect(ownSweepTargets(board(), '💙')).toEqual([0, 1]);
        expect(ownSweepTargets(board(), '⭕')).toEqual([5]);
    });
    it('枯れ木に花を咲かせましょう/弱り目に落ち葉: ライフを0にして🌱/🍂を1つ。🔥は消える', () => {
        const b = board();
        witherAndSow(b, [0, 1], '🌱');
        expect(b[0]).toEqual({ player: '💙', bind: 0, effects: [{ effect: '🌱' }] });
        expect(b[1].bind).toBe(0);
        expect(b[1].effects.map((e) => e.effect)).toEqual(['🌱']);
        expect(b[2].bind).toBe(4);
        const l = board();
        witherAndSow(l, [0], '🍂');
        expect(l[0].effects).toEqual([{ effect: '🍂' }]);
    });
    it('良薬は口に毒: ライフ+10と☠。毒使いはライフ1.5倍', () => {
        const b = board();
        medicineAndPoison(b, [0, 1], chars);
        expect(b[0].bind).toBe(5 + MEDICINE_LIFE);
        expect(b[0].effects).toEqual([{ effect: '☠' }]);
        expect(b[1].bind).toBe(3 + MEDICINE_LIFE);
        const p = board();
        medicineAndPoison(p, [0], ['poisoner', 'you']);
        expect(p[0].bind).toBe(Math.round((5 + MEDICINE_LIFE) * 1.5));
    });
});
