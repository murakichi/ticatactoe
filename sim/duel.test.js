// @ts-check
'use strict';
// 対局ドライバ (sim/duel.js) のテスト。実行: node sim/duel.test.js
const assert = require('assert');
const duel = require('./duel');
const e = require('./engine');

let pass = 0, fail = 0;
function test(name, fn) {
    try { fn(); pass++; console.log('  ✓ ' + name); }
    catch (err) { fail++; console.log('  ✗ ' + name + ' — ' + err.message); }
}
const cfg = (o = {}) => ({ me: 'you', opp: 'tactician', seat: 0, seed: 11, actions: [], ...o });

console.log('sim/duel:');

test('同じ操作列は何度再生しても同じ盤面（相手AIの手も含めて）', () => {
    const c = cfg({ actions: ['p 5', 'p 9'] });
    const a = duel.replay(c), b = duel.replay(c);
    assert.deepStrictEqual(a.s.board, b.s.board);
    assert.deepStrictEqual(a.s.magic, b.s.magic);
});

test('不正な操作は適用されず理由が返る（置けないマス・手札にない札・魔力不足）', () => {
    const c = cfg({ actions: ['p 5'] });
    assert.ok(duel.replay(c, ['p 99']).failed);
    assert.ok(/手札にない/.test(duel.replay(c, ['h 75']).failed.err));
    const hand = duel.replay(c).s.skills.find((i) => duel.costOf(duel.replay(c).s, duel.IDX_SKILL[i]) > duel.replay(c).s.magic[0]);
    if (hand !== undefined) assert.ok(/魔力不足/.test(duel.replay(c, [`h ${hand}`]).failed.err));
});

test('後手番なら開始時にAIが先に指す', () => {
    const r = duel.replay(cfg({ seat: 1 }));
    assert.strictEqual(r.s.turn, 1);
    assert.ok(r.s.board.some((sq) => sq.player === e.SYMBOLS[0]));
    assert.ok(r.opening.length > 0);
});

test('着手すると相手AIが応答して自分の手番に戻る', () => {
    const r = duel.replay(cfg({ actions: ['p 5'] }));
    assert.strictEqual(r.s.turn, 0);
    assert.strictEqual(r.turns[0].reply.length > 0, true);
});

test('固有スキルのコストが引ける（動的コスト・別名キー）', () => {
    const s = duel.build(cfg({ me: 'magician' }));
    assert.strictEqual(typeof duel.costOf(s, 'judgeDay'), 'number');
    assert.strictEqual(typeof duel.costOf(s, 'walpurgis'), 'number');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
