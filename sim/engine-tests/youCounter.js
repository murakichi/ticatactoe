// @ts-check
'use strict';
// sim/engine.test.js から読み込まれるテスト（共有の道具は ../testkit.js）
const { assert, e, test } = require('../testkit');

// ---- 「あなた」の相手別の専用ギア・デッキ（docs/tune/you.md） ----
test('web/CLI の対戦シミュレーションは、counter を付けたときだけ相手別の専用ギア・デッキを使う（付けなければ通常の推奨）', () => {
    const { aiLoadout } = require('../run');
    const rng = e.makeRng(1);
    const vsPoisoner = aiLoadout(['you', 'poisoner'], rng, { deck: true, gears: true, counter: true });
    assert.deepStrictEqual(vsPoisoner.gears[0], ['lastStand', 'spellWard', 'emptyLock']);
    // counter なしは通常の推奨ギア（専用ギアではない）
    const plain = aiLoadout(['you', 'poisoner'], e.makeRng(1), { deck: true, gears: true });
    assert.deepStrictEqual(plain.gears[0], require('../shared/gear').recommendedGears('you'));
    // 鍵師も同じ（相手別の専用ギアは counter のときだけ）
    const ksCounter = aiLoadout(['keysmith', 'pyromancer'], e.makeRng(1), { deck: true, gears: true, counter: true });
    assert.deepStrictEqual(ksCounter.gears[0], ['spellWard', 'lockBloom']);
    const ksPlain = aiLoadout(['keysmith', 'pyromancer'], e.makeRng(1), { deck: true, gears: true });
    assert.deepStrictEqual(ksPlain.gears[0], require('../shared/gear').recommendedGears('keysmith'));
    const vsWitch = aiLoadout(['witch', 'you'], rng, { deck: true, gears: true, counter: true });
    assert.ok(vsWitch.decks[1].includes(92) && vsWitch.decks[1].includes(87), '対witch の専用デッキ');
    // 相手が複数キャラなら通常の設定
    const multi = aiLoadout(['you', 'poisoner', 'giant'], rng, { deck: true, gears: true });
    assert.deepStrictEqual(multi.gears[0], require('../shared/gear').recommendedGears('you'));
});
