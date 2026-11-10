// @ts-check
'use strict';
// sim/engine.js のゲームルールの軽量テスト。実行: node sim/engine.test.js
// テスト本体は sim/engine-tests/*.js（この順に実行）。共有の道具は sim/testkit.js
const { summary } = require('./testkit');

require('./engine-tests/rules');
require('./engine-tests/multi');
require('./engine-tests/charge');
require('./engine-tests/thermal');
require('./engine-tests/buds');
require('./engine-tests/thermalSkills');
require('./engine-tests/leaf');
require('./engine-tests/charge2');
require('./engine-tests/witch');
require('./engine-tests/aiDriver');
require('./engine-tests/night');
require('./engine-tests/keysmith');
require('./engine-tests/youCounter');
require('./engine-tests/dragon');

const { pass, fail } = summary();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
