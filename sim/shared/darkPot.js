// 自動生成: src/components/game/darkPot.ts (node scripts/gen-sim-shared.js)。手で編集しない。
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.darkPotRolls = exports.DARK_POT_CHANCE = exports.DARK_POT_EFFECTS = void 0;
/** 抽選する順序（乱数の消費順でもある） */
exports.DARK_POT_EFFECTS = ['🔥', '❄', '⚡', '☠', '🌱', '🍂'];
/** コマ1つあたり、各エフェクトが乗る確率 */
exports.DARK_POT_CHANCE = 0.5;
/** 🔥が乗ると燃えて消える／解ける（同居できない）エフェクト */
const BURNABLE = ['❄', '🌱', '🍂'];
/**
 * 各コマに新しく乗せるエフェクトを決める。existing[i] = そのコマに元から乗っているエフェクトの種類。
 * - 各エフェクトは最大1（元からあるものは乗せない）
 * - 🔥は❄🌱🍂と同居できない: 元から🔥があるコマには❄🌱🍂を乗せない。🔥が出て、❄🌱🍂が（元から／今回）あるコマは、
 *   コイントスで🔥を残す（❄🌱🍂は乗せず、元からあるものは燃える／解ける）か、🔥を諦めるかを決める
 * - 乱数は、コマごとに6回（エフェクトの順）、衝突したときだけもう1回使う
 */
const darkPotRolls = (existing, rng) => existing.map((have) => {
    const rolled = exports.DARK_POT_EFFECTS.filter((e) => {
        const hit = rng() < exports.DARK_POT_CHANCE;
        return hit && !have.includes(e);
    });
    let out = rolled.slice();
    if (have.includes('🔥'))
        return out.filter((e) => !BURNABLE.includes(e));
    if (out.includes('🔥') && (BURNABLE.some((e) => have.includes(e)) || out.some((e) => BURNABLE.includes(e)))) {
        if (rng() < 0.5)
            out = out.filter((e) => !BURNABLE.includes(e));
        else
            out = out.filter((e) => e !== '🔥');
    }
    return out;
});
exports.darkPotRolls = darkPotRolls;
