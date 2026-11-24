import { PASSIVE_SEAL_TURNS, SEALED_CHARACTER, effectiveCharacters, isPassiveSealed, tickPassiveSeal } from './passiveSeal';
import { CharacterId } from '../../types/Character';

const base: CharacterId[] = ['giant', 'poisoner', 'electrician'];

describe('能ある鷹は爪を抜かれる', () => {
    it('使った席以外が『あなた』扱いになる。誰も使っていなければ全員そのまま', () => {
        expect(effectiveCharacters(base, [0, 0, 0])).toEqual(base);
        expect(effectiveCharacters(base, [2, 0, 0])).toEqual(['giant', SEALED_CHARACTER, SEALED_CHARACTER]);
        expect(isPassiveSealed([2, 0, 0], 0)).toBe(false);
        expect(isPassiveSealed([2, 0, 0], 1)).toBe(true);
    });
    it('複数の席が使っているときは、お互いが相手に封じられる', () => {
        expect(effectiveCharacters(base, [1, 2, 0])).toEqual([SEALED_CHARACTER, SEALED_CHARACTER, SEALED_CHARACTER]);
    });
    it('使った席の手番が2回終わると切れる', () => {
        let n = PASSIVE_SEAL_TURNS;
        n = tickPassiveSeal(n);
        expect(n).toBe(1);
        expect(isPassiveSealed([n, 0], 1)).toBe(true);
        n = tickPassiveSeal(n);
        expect(n).toBe(0);
        expect(isPassiveSealed([n, 0], 1)).toBe(false);
        expect(tickPassiveSeal(0)).toBe(0);
    });
});
