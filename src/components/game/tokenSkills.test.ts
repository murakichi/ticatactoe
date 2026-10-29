import { firstFrostTargets, firstFrost, burnOffTargets, burnOff, gather, FIRST_FROST_FREE_LEAVES } from './tokenSkills';
import { Effect } from '../../types/Effect';
import { SquareInfo } from '../../types/SquareInfo';
import { CharacterId } from '../../types/Character';

// sim/engine.test.js の同名スキルのテストと同じ盤面・同じ期待値（二重実装のずれを防ぐ）
const fx = (...kinds: Effect['effect'][]): Effect[] => kinds.map((effect) => ({ effect }));
const empty = (): SquareInfo => ({ player: undefined, bind: 0, effects: [] });
const board16 = (): SquareInfo[] => Array.from({ length: 16 }, empty);
const chars: CharacterId[] = ['you', 'you'];
const kinds = (sq: SquareInfo) => sq.effects.map((e) => e.effect);

describe('初霜', () => {
    test('敵の🍂があるコマを全て凍結。🔑・氷結を付けられない(🔥)・🍂なしは対象外', () => {
        const b = board16();
        b[0] = { player: '💙', bind: 3, effects: [] };
        b[4] = { player: '⭕', bind: 5, effects: fx('🍂') };
        b[5] = { player: '⭕', bind: 5, effects: fx('🍂', '🔑') };
        b[6] = { player: '⭕', bind: 5, effects: [] };
        b[7] = { player: '⭕', bind: 5, effects: fx('🍂', '🔥') };
        expect(firstFrostTargets(b, '💙', chars)).toEqual([4]);
        expect(firstFrost(b, '💙', chars)).toEqual([4]);
        expect(kinds(b[4])).toEqual(['🍂', '❄']);
        expect(kinds(b[5])).toEqual(['🍂', '🔑']);
        expect(kinds(b[7])).toEqual(['🍂', '🔥']);
    });
    test('無料になる🍂の枚数は3', () => {
        expect(FIRST_FROST_FREE_LEAVES).toBe(3);
    });
});

describe('山焼き', () => {
    test('敵のエフェクトがあるマス（氷結・⚡無敵を除く。🔑ロックのマスの他のエフェクトは対象）に🔥を1つ付ける', () => {
        const b = board16();
        b[0] = { player: '💙', bind: 3, effects: fx('🌱') };
        b[4] = { player: '⭕', bind: 5, effects: fx('🍂') };
        b[5] = { player: '⭕', bind: 5, effects: fx('🌱', '🔑') };
        b[15] = { player: '⭕', bind: 5, effects: fx('❄', '🌱') };
        b[7] = { player: '⭕', bind: 5, effects: [] };
        expect(burnOffTargets(b, '💙', chars)).toEqual([4, 5]);
        const r = burnOff(b, '💙', chars, 4);
        expect(r.cells).toEqual([4, 5]);
        expect(kinds(b[4])).toEqual(['🔥']); // 🍂は燃えて🔥が付く
        expect(kinds(b[5]).sort()).toEqual(['🔥', '🔑'].sort()); // ロックは残り、🌱は燃える
        expect(kinds(b[15])).toEqual(['❄', '🌱']);
        expect(kinds(b[7])).toEqual([]);
    });
});

describe('吹き寄せ', () => {
    test('トークンのマスに全エフェクトを集める。🔑と📜は残り、氷結のマスは動かさない。🔥は集め終えてから処理（🌱🍂が燃える）', () => {
        const b = board16();
        b[0] = { player: '💙', bind: 3, effects: fx('🌱') };
        b[1] = { player: '⭕', bind: 5, effects: fx('🍂', '☠') };
        b[2] = { player: '⭕', bind: 5, effects: fx('❄', '🌱') };
        b[3] = { player: '💙', bind: 5, effects: fx('🔑', '⚡') };
        b[5] = { player: '⭕', bind: 5, effects: fx('🔥', '🌱') };
        const moved = gather(b, 8, { player: '💙', bind: 4 }, chars, 4);
        expect(moved).toBe(6); // 🌱(0) 🍂☠(1) ⚡(3) 🌱(5) と 🔥(5)
        expect(b[8].player).toBe('💙');
        expect(kinds(b[8]).sort()).toEqual(['☠', '⚡', '🔥'].sort());
        expect(kinds(b[0])).toEqual([]);
        expect(kinds(b[1])).toEqual([]);
        expect(kinds(b[2])).toEqual(['❄', '🌱']);
        expect(kinds(b[3])).toEqual(['🔑']);
        expect(kinds(b[5])).toEqual([]);
    });
});
