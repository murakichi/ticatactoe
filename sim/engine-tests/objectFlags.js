// @ts-check
'use strict';
// 新スキル: 普請停止令（相手の次の手番、オブジェクトを設置できない）・付け火・お構いなし（次の自分の手番の頭まで相手のオブジェクトの効果を無視）。共有の道具は ../testkit.js
const { assert, e, test } = require('../testkit');
const objectsMod = require('../shared/objects');

const game = (...chars) => e.newGame({ chars, rng: e.makeRng(11), size: 4 });

test('普請停止令: 相手の席に旗が立ち、設置スキルが縛られる。相手の手番が終わると解除される', () => {
    const s = game('you', 'you');
    s.turn = 0;
    s.magic[0] = 30;
    e.SKILLS.buildBan(s);
    assert.strictEqual(s.objectBan[1], true);
    assert.strictEqual(s.objectBan[0], false, '自分には立たない');
    assert.strictEqual(s.magic[0], 27, 'コスト3');
    s.turn = 1;
    assert.strictEqual(e.skillRestrictedByObjects(s, 'onClickBigTree'), true);
    assert.strictEqual(e.skillRestrictedByObjects(s, 'onClickDuplicate'), true);
    assert.strictEqual(e.skillRestrictedByObjects(s, 'onClickToken'), false);
    s.currentTurn += 1; e.advanceTurn(s); // 席1の手番が終わる
    assert.strictEqual(s.objectBan[1], false);
});

test('付け火: オブジェクトに🔥。大木は燃え尽きる。コスト2', () => {
    const s = game('you', 'you');
    s.turn = 0;
    s.magic[0] = 10;
    s.board[3] = objectsMod.newObject('⭕', 'bigTree');
    s.board[12] = objectsMod.newObject('⭕', 'fort');
    e.SKILLS.arson(s);
    assert.strictEqual(s.magic[0], 8);
    assert.strictEqual(s.objectTool, 'arson');
    assert.strictEqual(e.placeMove(s, 3), true);
    assert.strictEqual(s.board[3].object, undefined, '大木は燃え尽きる');
    e.SKILLS.arson(s);
    assert.strictEqual(e.placeMove(s, 12), true);
    assert.ok(s.board[12].effects.some((x) => x.effect === '🔥'));
    assert.strictEqual(s.board[12].bind, objectsMod.OBJECT_DEFS.fort.life - 1);
});

test('お構いなし: 敵の毒沼の手番開始時の攻撃を受けず、次の自分の手番の頭で切れる。縛りもその手番は受けない', () => {
    const s = game('you', 'you');
    s.turn = 0;
    s.magic[0] = 30;
    s.board[5] = objectsMod.newObject('⭕', 'poisonSwamp');
    s.board[6] = { player: '💙', bind: 4, effects: [] };
    s.board[0] = objectsMod.newObject('⭕', 'oneWord');
    e.SKILLS.ignoreObjects(s);
    assert.strictEqual(s.objectIgnore[0], true);
    assert.strictEqual(s.magic[0], 26, 'コスト4');
    assert.strictEqual(e.skillRestrictedByObjects(s, 'onClickToken'), false, '一言居士の縛りを受けない（この手番の残り）');
    s.currentTurn += 1; e.advanceTurn(s); // 席1の手番の頭: 毒沼が働くが、💙は無視している
    assert.strictEqual(s.turn, 1);
    assert.ok(!s.board[6].effects.some((x) => x.effect === '☠'), '毒沼の☠を受けない');
    assert.strictEqual(s.objectIgnore[0], true, '席1の手番のあいだは続く');
    s.currentTurn += 1; e.advanceTurn(s); // 席0の手番の頭で切れる
    assert.strictEqual(s.turn, 0);
    assert.strictEqual(s.objectIgnore[0], false);
});
