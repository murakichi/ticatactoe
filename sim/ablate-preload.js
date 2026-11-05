// @ts-check
'use strict';
/*
 * 相手(や自分)の特定スキルを「何もしない」に差し替えて試合を回すための preload（アブレーション）。
 * 使い方: ABLATE=glacier,smallFry node -r ./sim/ablate-preload.js sim/probe-usage.js --chars electrician,cryomancer --games 200 --seed 9 ...
 * スキル名は engine.SKILLS のキー。差し替えたスキルは魔力を払わず効果も出ない（相手側に付けると相手に有利な方向に偏るので、差は『少なくともこれだけ』と読む）。
 * 『なぜこの相手に勝てないか』を、相手の固有スキル・主力札を1つずつ無効にして勝率の差で確かめる（tune-top の『勝てない相手の分析』）。
 */
const engine = require('./engine');
for (const name of (process.env.ABLATE || '').split(',').filter(Boolean)) {
    if (typeof engine.SKILLS[name] !== 'function') throw new Error(`ablate: unknown skill ${name}`);
    engine.SKILLS[name] = function () {};
}
