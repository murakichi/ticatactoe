import { addPoison, clearOwnPoison, intensify, miasma, miasmaPlan, pandemicTargets, poisonCountFor, poisonMistTargets, poisonStrike } from './poison';
import { SquareInfo } from '../../types/SquareInfo';
import { CharacterId } from '../../types/Character';

const board = (): SquareInfo[] => Array.from({ length: 16 }, () => ({ player: undefined, bind: 0, effects: [] }));
const P = { effect: '☠' as const };
const chars: CharacterId[] = ['poisoner', 'you'];

describe('毒スキルの純粋ロジック', () => {
    it('毒使いのコマに毒が付くとライフが1.5倍（四捨五入）。他のキャラは変わらない', () => {
        expect(poisonStrike({ player: '💙', bind: 5, effects: [P] }, chars).bind).toBe(8);
        expect(poisonStrike({ player: '⭕', bind: 5, effects: [P] }, chars).bind).toBe(5);
        const b = board();
        b[0] = { player: '💙', bind: 4, effects: [] };
        b[1] = { player: '⭕', bind: 4, effects: [] };
        addPoison(b, [0, 1], chars, 2);
        expect([b[0].bind, b[0].effects.length, b[1].bind, b[1].effects.length]).toEqual([6, 2, 4, 2]);
    });

    it('ミアズマ: 自陣の効いている毒のマスごとに周囲の敵マスへ毒を1つ（重複あり）、自陣の毒は消える。氷結中の毒は数えず消えない', () => {
        const b = board();
        b[5] = { player: '💙', bind: 5, effects: [P] };
        b[6] = { player: '💙', bind: 5, effects: [P] };
        b[10] = { player: '💙', bind: 5, effects: [P, { effect: '❄' }] }; // 氷結中: 数えない・消えない
        b[1] = { player: '⭕', bind: 3, effects: [] }; // 5 と 6 の両方の周囲
        b[0] = { player: '⭕', bind: 3, effects: [{ effect: '🔑' }] }; // ロック: 対象外
        expect(Array.from(miasmaPlan(b, '💙', chars).entries())).toEqual([[1, 2]]);
        const r = miasma(b, '💙', chars);
        expect(r.targets).toEqual([1]);
        expect(r.sources).toEqual([5, 6]);
        expect(b[1].effects.filter((e) => e.effect === '☠')).toHaveLength(2);
        expect(b[5].effects).toEqual([]);
        expect(b[10].effects.some((e) => e.effect === '☠')).toBe(true);
        expect(poisonCountFor(b, '💙')).toBe(0);
    });

    it('血清は自陣の毒を全て消す。猛毒化は毒を倍にする（氷結中も）', () => {
        const b = board();
        b[0] = { player: '💙', bind: 5, effects: [P, P] };
        b[1] = { player: '⭕', bind: 5, effects: [P, { effect: '❄' }] };
        expect(intensify(b, chars)).toEqual({ affected: [0, 1], added: 3 });
        expect(b[0].effects.filter((e) => e.effect === '☠')).toHaveLength(4);
        expect(clearOwnPoison(b, '💙')).toEqual([0]);
        expect(b[1].effects.filter((e) => e.effect === '☠')).toHaveLength(2);
    });

    it('パンデミック・毒霧の対象: ロックと⚡無敵のコマは除く', () => {
        const b = board();
        b[5] = { player: '💙', bind: 5, effects: [] };
        b[6] = { player: '⭕', bind: 5, effects: [{ effect: '🔑' }] };
        b[9] = { player: '⭕', bind: 5, effects: [] };
        expect(pandemicTargets(b, 5, chars)).toEqual([5, 9]);
        expect(poisonMistTargets(b, chars)).toEqual([5, 9]);
        const sh = board();
        sh[0] = { player: '⭕', bind: 5, effects: [{ effect: '⚡' }] };
        expect(poisonMistTargets(sh, ['poisoner', 'electrician'])).toEqual([]);
    });
});
