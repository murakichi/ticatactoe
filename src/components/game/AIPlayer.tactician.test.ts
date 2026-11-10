import AIPlayer from './AIPlayer';
import { SquareInfo } from '../../types/SquareInfo';
import { CharacterId } from '../../types/Character';

describe('軍師AI: 雷霆の巫が相手のとき、一寸の虫に魂なし(92)を手札に固定する', () => {
    const board = (): SquareInfo[] => Array.from({ length: 16 }, () => ({ player: undefined, bind: 0, effects: [] }));
    const locksVs = (foe: CharacterId, hand: number[]) => {
        const ai = new AIPlayer('💙', 'tactician', ['⭕'], ['tactician', foe], undefined, false, false);
        return ai.chooseLocks(board(), 2, 5, hand);
    };

    it('雷霆の巫が相手なら、92を最優先で固定する', () => {
        expect(locksVs('electrician', [3, 92, 12])).toContain(92);
        expect(locksVs('electrician', [12, 92, 28])).toContain(92);
    });
    it('雷霆の巫以外が相手なら、92は固定しない(対魔女などで裏目に出るため)', () => {
        for (const foe of ['witch', 'giant', 'poisoner', 'magician'] as CharacterId[]) {
            expect(locksVs(foe, [3, 92, 12])).not.toContain(92);
        }
    });
    it('固定の上限は2枚。トークン系と92があっても2枚までで、92は落ちない', () => {
        const locks = locksVs('electrician', [3, 9, 11, 92]);
        expect(locks).toHaveLength(2);
        expect(locks).toContain(92);
    });
});

describe('砕氷(47)の狙い（陰陽師以外）', () => {
    it('氷結で守られた敵コマを壊し切れて、自分の列の邪魔なら狙う。壊し切れない・価値が無いなら null', () => {
        const ai = new AIPlayer('💙', 'tactician', ['⭕'], ['tactician', 'cryomancer']);
        const b: SquareInfo[] = Array.from({ length: 16 }, () => ({ player: undefined, bind: 0, effects: [] }));
        b[0] = { player: '💙', bind: 3, effects: [] };
        b[1] = { player: '💙', bind: 3, effects: [] };
        b[2] = { player: '💙', bind: 3, effects: [] };
        b[3] = { player: '⭕', bind: 3, effects: [{ effect: '❄' }] }; // 自分の3つ並びの4つ目を塞ぐ氷結コマ（❄1×3ダメージで壊れる）
        ai.updateShield(b);
        expect(ai.shatterTarget(b)).toBe(3);
        b[3] = { player: '⭕', bind: 7, effects: [{ effect: '❄' }] }; // 壊し切れない
        expect(ai.shatterTarget(b)).toBeNull();
    });
});
