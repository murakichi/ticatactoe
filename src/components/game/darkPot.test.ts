import { darkPotRolls, DARK_POT_EFFECTS, DARK_POT_CHANCE } from './darkPot';


const seq = (values: number[]) => {
    let i = 0;
    return () => values[i++ % values.length];
};

describe('一寸先は闇鍋の抽選', () => {
    it('各エフェクトは確率50%で、元からあるものは乗せない', () => {
        // 乱数が 0.4 → 当たり、0.6 → はずれ（順は 🔥❄⚡☠🌱🍂）
        const rolls = darkPotRolls([[]], seq([0.6, 0.6, 0.4, 0.4, 0.6, 0.4]));
        expect(rolls[0]).toEqual(['⚡', '☠', '🍂']);
        expect(darkPotRolls([['⚡', '🍂']], seq([0.6, 0.6, 0.4, 0.4, 0.6, 0.4]))[0]).toEqual(['☠']);
        expect(DARK_POT_CHANCE).toBe(0.5);
    });
    it('🔥が❄🌱🍂と出会ったらコイントス: 表で🔥が勝ち、裏で🔥が消える', () => {
        const all = [0.1, 0.1, 0.6, 0.6, 0.1, 0.6]; // 🔥❄🌱が当たり
        expect(darkPotRolls([[]], seq([...all, 0.2]))[0]).toEqual(['🔥']);
        expect(darkPotRolls([[]], seq([...all, 0.7]))[0]).toEqual(['❄', '🌱']);
    });
    it('🔥だけが出たとき・元から🌱があって🔥が出たときの扱い', () => {
        expect(darkPotRolls([[]], seq([0.1, 0.6, 0.6, 0.6, 0.6, 0.6]))[0]).toEqual(['🔥']); // 衝突なし → 乱数は6回だけ
        expect(darkPotRolls([['🌱']], seq([0.1, 0.6, 0.6, 0.6, 0.6, 0.6, 0.2]))[0]).toEqual(['🔥']); // 🔥が勝つ（元の🌱は燃える）
        expect(darkPotRolls([['🌱']], seq([0.1, 0.6, 0.6, 0.6, 0.6, 0.6, 0.7]))[0]).toEqual([]); // 🔥が消える
    });
    it('元から🔥があるコマには❄🌱🍂を乗せない', () => {
        expect(darkPotRolls([['🔥']], seq([0.1, 0.1, 0.1, 0.1, 0.1, 0.1]))[0]).toEqual(['⚡', '☠']);
    });
});
