// 一寸先は闇鍋: 盤上の全コマに🔥❄⚡☠🌱🍂をランダムに付ける。どのエフェクトが乗るかの抽選（純粋関数）。
// sim/darkPot.js と同じ仕様・同じ乱数の使い方（darkPot.test.ts が一致を確認する）。
export type DarkPotEffect = '🔥' | '❄' | '⚡' | '☠' | '🌱' | '🍂';

/** 抽選する順序（乱数の消費順でもある） */
export const DARK_POT_EFFECTS: readonly DarkPotEffect[] = ['🔥', '❄', '⚡', '☠', '🌱', '🍂'];

/** コマ1つあたり、各エフェクトが乗る確率 */
export const DARK_POT_CHANCE = 0.5;

/** 🔥が乗ると燃えて消える／解ける（同居できない）エフェクト */
const BURNABLE: readonly DarkPotEffect[] = ['❄', '🌱', '🍂'];

/**
 * 各コマに新しく乗せるエフェクトを決める。existing[i] = そのコマに元から乗っているエフェクトの種類。
 * - 各エフェクトは最大1（元からあるものは乗せない）
 * - 🔥は❄🌱🍂と同居できない: 元から🔥があるコマには❄🌱🍂を乗せない。🔥が出て、❄🌱🍂が（元から／今回）あるコマは、
 *   コイントスで🔥を残す（❄🌱🍂は乗せず、元からあるものは燃える／解ける）か、🔥を諦めるかを決める
 * - 乱数は、コマごとに6回（エフェクトの順）、衝突したときだけもう1回使う
 */
export const darkPotRolls = (existing: readonly (readonly string[])[], rng: () => number): DarkPotEffect[][] =>
    existing.map((have) => {
        const rolled = DARK_POT_EFFECTS.filter((e) => {
            const hit = rng() < DARK_POT_CHANCE;
            return hit && !have.includes(e);
        });
        let out = rolled.slice();
        if (have.includes('🔥')) return out.filter((e) => !BURNABLE.includes(e));
        if (out.includes('🔥') && (BURNABLE.some((e) => have.includes(e)) || out.some((e) => BURNABLE.includes(e)))) {
            if (rng() < 0.5) out = out.filter((e) => !BURNABLE.includes(e));
            else out = out.filter((e) => e !== '🔥');
        }
        return out;
    });
