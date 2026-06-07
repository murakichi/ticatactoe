// @ts-check
'use strict';
// sim/engine.js のゲームルールの軽量テスト。実行: node sim/engine.test.js
const assert = require('assert');
const e = require('./engine');

let pass = 0, fail = 0;
function test(name, fn) {
    try { fn(); pass++; console.log('  ✓ ' + name); }
    catch (err) { fail++; console.log('  ✗ ' + name + ' — ' + err.message); }
}
const game = (h = 'you', c = 'you') => e.newGame({ heartChar: h, circleChar: c, rng: e.makeRng(42) });

console.log('sim/engine game rules:');

test('newGame: 16 empty squares, heart moves first', () => {
    const s = game();
    assert.strictEqual(s.board.length, 16);
    assert.ok(s.board.every((x) => x.player === undefined));
    assert.strictEqual(s.heartTurn, true);
});

test('placeMove on empty: current player placed at life bind', () => {
    const s = game();
    s.life = 5;
    e.placeMove(s, 5);
    assert.strictEqual(s.board[5].player, '💙'); // 💙
    assert.strictEqual(s.board[5].bind, 5);
});

test('placeMove: capturing a bind-0 enemy flips ownership', () => {
    const s = game();
    s.heartTurn = true; s.life = 5;
    s.board[6] = { player: '⭕', bind: 0, effects: [] }; // ⭕
    e.placeMove(s, 6);
    assert.strictEqual(s.board[6].player, '💙');
});

test('token skill places one piece for the current player', () => {
    const s = game('tactician', 'you');
    s.heartTurn = true;
    const before = s.board.filter((x) => x.player === '💙').length;
    e.SKILLS.token(s);
    const after = s.board.filter((x) => x.player === '💙').length;
    assert.strictEqual(after, before + 1);
});

test('necromancer 蘇生: bind-0 enemies absorbed on necro turn', () => {
    const s = e.newGame({ heartChar: 'necromancer', circleChar: 'you', rng: e.makeRng(42) });
    s.heartTurn = true; s.remainHeartNecro = 4; s.life = 5;
    s.board[2] = { player: '⭕', bind: 0, effects: [] };
    s.board[7] = { player: '⭕', bind: 0, effects: [] };
    e.placeMove(s, 0);
    assert.strictEqual(s.board[2].player, '💙');
    assert.strictEqual(s.board[7].player, '💙');
});

test('magician: +3 magic per friendly bud (2 buds → 8 from 0)', () => {
    const s = e.newGame({ heartChar: 'magician', circleChar: 'you', rng: e.makeRng(42) });
    s.board[0] = { player: '💙', bind: 5, effects: [{ effect: '🌱' }, { effect: '🌱' }] }; // 2 buds
    s.heartMagic = 0; s.heartTurn = false; s.currentTurn = 2;
    e.advanceTurn(s); // next is heart → magic accrues
    // 0 +1(turn) +2(buds std) +1(magician flat) +4(magician bud +2 each) = 8
    assert.strictEqual(s.heartMagic, 8);
});

test('tactician token discount is -1 (post-nerf)', () => {
    const s = game('tactician', 'you');
    s.heartTurn = true;
    assert.strictEqual(e.calculateCost(s, 4, true), 3); // 4 - 1
    assert.strictEqual(e.calculateCost(s, 4, false), 6); // 4 + 2 (non-token penalty)
});

test('calculateWinner detects 4-in-a-row', () => {
    const syms = Array(16).fill(undefined);
    [0, 1, 2, 3].forEach((i) => (syms[i] = '💙'));
    assert.strictEqual(e.calculateWinner(syms), '💙');
    assert.strictEqual(e.calculateWinner(Array(16).fill(undefined)), undefined);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
