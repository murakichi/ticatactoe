// @ts-check
'use strict';
// sim/engine.test.js と sim/engine-tests/*.js が共有するテスト用の道具（assert・test・盤面ヘルパー）。
const assert = require('assert');
const e = require('./engine');

let pass = 0, fail = 0;
function test(name, fn) {
    try { fn(); pass++; console.log('  ✓ ' + name); }
    catch (err) { fail++; console.log('  ✗ ' + name + ' — ' + err.message); }
}
const summary = () => ({ pass, fail });

const game = (h = 'you', c = 'you') => e.newGame({ heartChar: h, circleChar: c, rng: e.makeRng(42) });

const P = { effect: '☠' };

const stacks = (sq) => sq.effects.filter((x) => x.effect === '☠').length;

const gameN = (...chars) => e.newGame({ chars, rng: e.makeRng(42) });

const zap = () => ({ player: undefined, bind: 0, effects: [{ effect: '⚡' }] });

const FRZ = { effect: '❄' }, FLM = { effect: '🔥' };

const BUD = { effect: '🌱' };

const budsOn = (sq) => sq.effects.filter((x) => x.effect === '🌱').length;

const flames = (sq) => sq.effects.filter((x) => x.effect === '🔥').length;

const frosts = (sq) => sq.effects.filter((x) => x.effect === '❄').length;

const geo4 = require('./shared/boardGeometry');

const chargeOf = (st) => st.glacierCharge.slice();

const LEAF = { effect: '🍂' };

const leavesOn = (sq) => sq.effects.filter((x) => x.effect === '🍂').length;

const BOLT = { effect: '⚡' };

const boltsOn = (sq) => sq.effects.filter((x) => x.effect === '⚡').length;

const fx = (...kinds) => kinds.map((k) => ({ effect: k }));

const cnt = (sq, k) => sq.effects.filter((x) => x.effect === k).length;

module.exports = { assert, e, test, summary, game, P, stacks, gameN, zap, FRZ, BUD, budsOn, flames, frosts, geo4, chargeOf, LEAF, leavesOn, BOLT, boltsOn, fx, cnt, FLM };
