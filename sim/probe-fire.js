'use strict';
/*
 * 鍛冶師の分析: 🔥付与→敵コマが落ちるまでの手数、勝ち/負け別のスキル使用、収穫ギアの魔力。
 * 使い方: node sim/probe-fire.js --games 100 --seed 11 [--opps a,b] [--size N]
 * 注意: 収穫の魔力(stats.harvestMagic)は全席の合計。相手に収穫ギアがあると混ざる(推奨ギアで収穫を持つのは雷霆の巫だけ)。
 */
const path = __dirname + '/';
const engine = require(path + 'engine');
const ai = require(path + 'ai');
const deckMod = require(path + 'deck');
const gearMod = require(path + 'gear');
const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].slice(2)] = process.argv[i + 1];
const games = parseInt(args.games || '100', 10);
const seed0 = parseInt(args.seed || '1', 10);
const opps = (args.opps || 'you,tactician,magician,giant,yinYangMaster,necromancer,poisoner,electrician,cryomancer').split(',');
const size = args.size ? parseInt(args.size, 10) : undefined;
const ME = 'pyromancer';

// スキル使用を席・手番ごとに記録
const names = Object.keys(engine.SKILLS);
let cur = null; // { seat, t, log }
for (const n of names) {
    const orig = engine.SKILLS[n];
    engine.SKILLS[n] = function (s) {
        const before = s.magic[s.turn];
        const r = orig.apply(this, arguments);
        if (cur && cur.seat === s.turn && (s.magic[s.turn] !== before || n === 'harvestEve')) cur.log.push({ name: n, t: cur.t });
        return r;
    };
}
const FIRE_SKILLS = new Set(['inferno','flameToken','doubleFlameToken','ignite','swidden','sacrifice','burnout','flame','fireSpark']);
const flames = (sq) => sq.effects.filter((e) => e.effect === '🔥').length;

const rows = [];
const falls = []; // { dur, stacks, bind, outcome }
const usedNames = {};
for (const opp of opps) {
    for (let g = 0; g < games; g++) {
        const first = g % 2 === 0;
        const chars = first ? [ME, opp] : [opp, ME];
        const me = first ? 0 : 1;
        const opts = { chars, rng: engine.makeRng(seed0 * 100003 + g), size };
        opts.decks = chars.map((c) => deckMod.recommendedDeck(c));
        opts.gears = chars.map((c) => gearMod.recommendedGears(c));
        const s = engine.newGame(opts);
        s.aiFlags = chars.map(() => ({}));
        const log = [];
        const track = new Map();
        const magicAt = {};
        let t = 0, myTurn = 0;
        while (!s.winner && t++ < 600) {
            if (s.turn === me) { myTurn++; magicAt[myTurn] = s.magic[me]; }
            cur = s.turn === me ? { seat: s.turn, t, log } : null; // 鍛冶師の席のスキルだけを数える
            const r = ai.makeMove(s, 'faithful');
            if (!r.turnEnded && r.move != null) engine.placeMove(s, r.move);
            else if (!r.turnEnded) engine.SKILLS.charge(s);
            cur = null;
            const meSym = engine.SYMBOLS ? engine.SYMBOLS[me] : null;
            s.board.forEach((sq, k) => {
                const tr = track.get(k);
                const enemyFlamed = sq.player && sq.player !== meSym && flames(sq) > 0;
                if (tr) {
                    if (sq.player !== tr.owner) { falls.push({ dur: t - tr.start, outcome: 'replaced', stacks: tr.stacks, bind: tr.bind }); track.delete(k); }
                    else if (sq.bind === 0) { falls.push({ dur: t - tr.start, outcome: 'fell', stacks: tr.stacks, bind: tr.bind }); track.delete(k); }
                    else if (flames(sq) === 0) { falls.push({ dur: t - tr.start, outcome: 'cleared', stacks: tr.stacks, bind: tr.bind }); track.delete(k); }
                } else if (enemyFlamed && sq.bind > 0) {
                    track.set(k, { start: t, bind: sq.bind, owner: sq.player, stacks: flames(sq) });
                }
            });
        }
        const won = s.winner && engine.seatOf(s.winner) === me;
        for (const x of log) usedNames[x.name] = (usedNames[x.name] || 0) + 1;
        rows.push({
            opp, won: !!won, decided: !!s.winner, turns: t, first,
            fire: log.filter((x) => FIRE_SKILLS.has(x.name)).length,
            inferno: log.filter((x) => x.name === 'inferno').map((x) => x.t),
            firstFire: (log.find((x) => FIRE_SKILLS.has(x.name)) || {}).t || null,
            skills: log.length,
            harvest: (s.stats.harvestMagic||0), myTurns: myTurn, magic10: magicAt[10] ?? null, magic6: magicAt[6] ?? null,
        });
    }
}
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const pct = (x) => (x * 100).toFixed(1) + '%';
const dec = rows.filter((r) => r.decided);
console.log(`試合数 ${rows.length} 勝率 ${pct(dec.filter((r) => r.won).length / dec.length)}  平均手数(全体) ${avg(rows.map((r) => r.turns)).toFixed(1)}`);
console.log('鍛冶師が使ったスキル(全試合合計の上位):', Object.entries(usedNames).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, v]) => `${k}:${v}`).join(' '));
console.log('\n[勝ち/負け別]');
for (const [label, f] of [['勝ち', (r) => r.won], ['負け', (r) => r.decided && !r.won]]) {
    const a = dec.filter(f);
    console.log(`${label} n=${a.length}  手数 ${avg(a.map((r) => r.turns)).toFixed(1)}  スキル使用 ${avg(a.map((r) => r.skills)).toFixed(2)}  🔥系 ${avg(a.map((r) => r.fire)).toFixed(2)}  業火回数 ${avg(a.map((r) => r.inferno.length)).toFixed(2)}  業火1回目の手 ${avg(a.filter((r) => r.inferno.length).map((r) => r.inferno[0])).toFixed(1)}  🔥初回 ${avg(a.filter((r) => r.firstFire).map((r) => r.firstFire)).toFixed(1)}  業火を撃った試合 ${pct(a.filter((r) => r.inferno.length).length / a.length)}  🔥を使った試合 ${pct(a.filter((r) => r.fire).length / a.length)}  6手目魔力 ${avg(a.filter((r) => r.magic6 != null).map((r) => r.magic6)).toFixed(1)}  10手目魔力 ${avg(a.filter((r) => r.magic10 != null).map((r) => r.magic10)).toFixed(1)}`);
}
console.log('\n[対キャラ別]');
for (const opp of opps) {
    const a = dec.filter((r) => r.opp === opp);
    console.log(`${opp.padEnd(14)} 勝率 ${pct(a.filter((r) => r.won).length / a.length)}  手数 ${avg(a.map((r) => r.turns)).toFixed(1)}  🔥を使った試合 ${pct(a.filter((r) => r.fire).length / a.length)}  業火を撃った試合 ${pct(a.filter((r) => r.inferno.length).length / a.length)}`);
}
console.log('\n[🔥が付いた敵コマの行方(全試合合計)。手数は全プレイヤー合計の手番数]');
const by = {};
for (const f of falls) (by[f.outcome] ||= []).push(f);
for (const [k, a] of Object.entries(by)) {
    const d = a.map((x) => x.dur).sort((x, y) => x - y);
    console.log(`${k.padEnd(9)} ${a.length} (${pct(a.length / falls.length)})  平均 ${avg(d).toFixed(1)}手  中央値 ${d[Math.floor(d.length / 2)]}  開始時ライフ平均 ${avg(a.map((x) => x.bind)).toFixed(1)}`);
}
console.log(`1試合あたり 🔥付きの敵コマ ${(falls.length / rows.length).toFixed(2)} 個`);

console.log('[収穫ギア]');
console.log('1試合あたり 収穫で得た魔力', avg(rows.map((r)=>r.harvest)).toFixed(2), ' 自分の手番数', avg(rows.map((r)=>r.myTurns)).toFixed(1), ' (素の魔力 +1/手番)');
for (const [label, f] of [['勝ち', (r) => r.won], ['負け', (r) => r.decided && !r.won]]) { const a = dec.filter(f); console.log(label, '収穫魔力', avg(a.map((r)=>r.harvest)).toFixed(2)); }
for (const opp of opps) { const a = rows.filter((r)=>r.opp===opp); console.log(opp.padEnd(14), '収穫魔力', avg(a.map((r)=>r.harvest)).toFixed(2), '手番', avg(a.map((r)=>r.myTurns)).toFixed(1)); }
