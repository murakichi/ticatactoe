'use strict';
// src/components/game/darkPot.ts の複製（ヘッドレス版）。darkPot.test.ts が一致を確認する。
const DARK_POT_EFFECTS = ['🔥', '❄', '⚡', '☠', '🌱', '🍂'];
const DARK_POT_CHANCE = 0.5;
const BURNABLE = ['❄', '🌱', '🍂'];
const darkPotRolls = (existing, rng) =>
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
module.exports = { DARK_POT_EFFECTS, DARK_POT_CHANCE, darkPotRolls };
