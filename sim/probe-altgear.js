#!/usr/bin/env node
// @ts-check
'use strict';
/*
 * AI の推奨ギアの「別案」を選ぶための計測。キャラごとに主案(RECOMMENDED_GEARS)と候補の組を、同じシード・同じ相手(推奨ギア)で
 * probe-top.js の環境勝率で比べ、主案より著しく低くない（既定: -1.5pt 以内）ものを別案として出す。
 *
 *   node sim/probe-altgear.js <char> [games=150] [seed=31] [--cand a,b;c,d;...] [--margin 0.015]
 *   node sim/probe-altgear.js <char> [games=150] [seed=31] --deck [--neighbors 8] [--swap 1|2]   # デッキの別案: 主案から札を1〜2枚入れ替えた近傍をランダムにN個測る（核のカードは動かさない）
 *   候補を省略すると、docs/tune の知見から選んだ既定の候補（下の DEFAULT_CANDIDATES）を測る。
 * 出力: 行ごとに JSON（gears, field, se, diffFromMain）と、最後に別案の推奨。
 */
const { spawnSync } = require('child_process');
// 主指標は probe-top の strong（対強豪平均）。強豪リストが無いとき(strong=null)は field。出力キーの `field` はこの値を指す
const metric = (row) => (row.strong != null ? row.strong : row.field);
const path = require('path');
const gear = require('./gear');

const argv = process.argv.slice(2);
const flag = (name, def) => { const i = argv.indexOf('--' + name); return i >= 0 ? argv[i + 1] : def; };
const pos = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--')));
const char = pos[0];
const games = pos[1] || '150';
const seed = pos[2] || '31';
const margin = parseFloat(flag('margin', '0.015'));

// docs/tune の走査で主案と誤差内だった組、または直前まで主案だった組
const DEFAULT_CANDIDATES = {
    you: [['luckyPurse', 'titanCost', 'lastStand'], ['luckyPurse', 'sturdy', 'lastStand'], ['luckyPurse', 'titanCost', 'vengeance'], ['titanCost', 'sturdy', 'lastStand']],
    tactician: [['vengeance', 'priceWreck'], ['sturdy', 'priceWreck'], ['luckyPurse', 'priceWreck'], ['lastStand', 'luckyPurse']],
    magician: [['sturdy', 'ironLock'], ['vengeance', 'ironLock'], ['lastStand', 'luckyPurse'], ['lastStand', 'sturdy']],
    giant: [['vengeance', 'sturdy'], ['afterglow', 'sturdy'], ['priceWreck', 'sturdy'], ['lastStand', 'vengeance']],
    yinYangMaster: [['lastStand', 'ironLock'], ['lastStand', 'emptyLock'], ['sturdy', 'ironLock'], ['vengeance', 'sturdy']],
    necromancer: [['lastStand', 'sturdy'], ['vengeance', 'sturdy'], ['vengeance', 'afterglow'], ['lastStand', 'ironLock']],
    poisoner: [['toxicBloom', 'lastStand'], ['lastStand', 'propagate'], ['lastStand', 'reinforce'], ['lastStand', 'vengeance']],
    electrician: [['luckyPurse', 'harvest'], ['afterglow', 'lightToken'], ['lastStand', 'harvest'], ['sturdy', 'harvest']],
    cryomancer: [['afterglow', 'lightToken'], ['afterglow', 'lastStand'], ['vengeance', 'sturdy'], ['lastStand', 'sturdy']],
    pyromancer: [['emptyLock', 'sturdy'], ['ironLock', 'harvest'], ['emptyLock', 'ironLock'], ['emptyLock', 'lastStand']],
};
const deckMode = argv.includes('--deck');
const cands = deckMode ? [] : flag('cand', null) ? flag('cand', '').split(';').map((s) => s.split(',')) : DEFAULT_CANDIDATES[char];
if (deckMode) { runDeck(); process.exit(0); }
if (!char || !cands) { console.error('usage: probe-altgear.js <char> [games] [seed] [--cand a,b;c,d]'); process.exit(1); }

function runDeck() {
    const deckMod = require('./deck');
    const engine = require('./engine');
    const n = parseInt(flag('neighbors', '8'), 10);
    const k = Math.max(1, parseInt(flag('swap', '1'), 10));
    const base = deckMod.recommendedDeck(char);
    const core = (deckMod.CORE_CARDS && deckMod.CORE_CARDS[char]) || [];
    const rng = engine.makeRng(parseInt(seed, 10) * 977 + 11);
    const sets = [base];
    const seen = new Set();
    for (let guard = 0; sets.length < n + 1 && guard < n * 30; guard++) {
        const keep = base.slice();
        const movable = keep.filter((c) => !core.includes(c));
        const outs = [];
        for (let j = 0; j < k; j++) outs.push(movable.splice(Math.floor(rng() * movable.length), 1)[0]);
        const rest = keep.filter((c) => !outs.includes(c));
        const pool = Array.from({ length: deckMod.CATALOG_SIZE }, (_, i) => i).filter((i) => !base.includes(i));
        const ins = [];
        for (let j = 0; j < k; j++) ins.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
        const d = rest.concat(ins).sort((a, b) => a - b);
        const key = d.join();
        if (seen.has(key)) continue;
        seen.add(key);
        sets.push(d);
    }
    const rows = [];
    for (const d of sets) {
        const r = spawnSync(process.execPath, [path.join(__dirname, 'probe-top.js'), '--target', char, '--deck', d.join(','), '--games', games, '--seed', seed, '--json'], { encoding: 'utf8', maxBuffer: 1 << 26 });
        if (r.status !== 0) throw new Error(r.stderr);
        const row = JSON.parse(r.stdout.trim().split('\n').pop()).rows[0];
        rows.push({ deck: d, field: metric(row), se: row.strong != null ? row.strongSe : row.se });
        console.log(JSON.stringify({ char, deck: d, field: metric(row), se: row.strong != null ? row.strongSe : row.se, diffFromMain: +(metric(row) - rows[0].field).toFixed(4) }));
    }
    const alts = rows.slice(1).filter((r) => r.field - rows[0].field >= -margin).sort((a, b) => b.field - a.field);
    console.log('ALT_DECK ' + JSON.stringify({ char, main: base, mainField: rows[0].field, alts: alts.map((r) => ({ deck: r.deck, field: r.field, diff: +(r.field - rows[0].field).toFixed(4) })) }));
}

const main = gear.recommendedGears(char);
const slots = gear.gearSlotsFor(char);
const sets = [main, ...cands.map((c) => c.slice(0, slots)).filter((c) => c.slice().sort().join() !== main.slice().sort().join())];

function measure(set) {
    const r = spawnSync(process.execPath, [path.join(__dirname, 'probe-top.js'), '--target', char, '--gears', set.join(','), '--games', games, '--seed', seed, '--json'], { encoding: 'utf8', maxBuffer: 1 << 26 });
    if (r.status !== 0) throw new Error(r.stderr);
    const out = JSON.parse(r.stdout.trim().split('\n').pop());
    return out.rows[0];
}
const rows = [];
for (const set of sets) {
    const row = measure(set);
    rows.push({ gears: set, field: metric(row), se: row.strong != null ? row.strongSe : row.se });
    console.log(JSON.stringify({ char, gears: set, field: metric(row), se: row.strong != null ? row.strongSe : row.se, diffFromMain: +(metric(row) - rows[0].field).toFixed(4) }));
}
const alts = rows.slice(1).filter((r) => r.field - rows[0].field >= -margin).sort((a, b) => b.field - a.field);
console.log('ALT ' + JSON.stringify({ char, main, mainField: rows[0].field, alts: alts.map((r) => ({ gears: r.gears, field: r.field, diff: +(r.field - rows[0].field).toFixed(4) })) }));
