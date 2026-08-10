#!/usr/bin/env node
// @ts-check
'use strict';
/*
 * Terminal front-end for the headless game engine.
 *
 *   node sim/cli.js play  [--me 💙|⭕] [--mychar you] [--aichar you] [--seed N]
 *   node sim/cli.js sim   [--games 500] [--mode faithful|capture] [--seed N] [--pair you,giant]
 *   node sim/cli.js auto  [--hchar you] [--cchar you] [--seed N] [--mode faithful]   (watch one AIvsAI game)
 *
 * In `play`, type a cell index (0-15) to place, `skill <name> [idx]` to use a
 * skill, `help`, or `quit`.
 */

const readline = require('readline');
const engine = require('./engine');
const ai = require('./ai');
const { HEART, CIRCLE, CHARACTERS, SKILLS } = engine;

function parseArgs(argv) {
    const out = { _: [] };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a.startsWith('--')) {
            const key = a.slice(2);
            const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
            out[key] = val;
        } else out._.push(a);
    }
    return out;
}

// ---------- batch simulation (balance analysis) ----------
// hmode/cmode let the two sides use different AIs (for AI-strength benchmarking).
function runOneGame(hchar, cchar, rng, hmode, cmode) {
    if (cmode === undefined) cmode = hmode;
    const s = engine.newGame({ heartChar: hchar, circleChar: cchar, rng });
    let guard = 0;
    while (!s.winner && guard++ < 400) {
        const mode = s.heartTurn ? hmode : cmode;
        const result = ai.makeMove(s, mode);
        if (result.turnEnded) continue;
        if (result.move === null) break;
        const before = s.currentTurn;
        engine.placeMove(s, result.move);
        if (s.currentTurn === before) break;
    }
    return { winner: s.winner, turns: s.currentTurn };
}

function sim(args) {
    const games = parseInt(args.games || '500', 10);
    const mode = args.mode || 'faithful';
    const baseSeed = parseInt(args.seed || '1', 10);
    const pairs = args.pair ? [args.pair.split(',')] : crossProduct(CHARACTERS, CHARACTERS);

    console.log(`# Balance simulation  games/pair=${games}  AI=${mode}  seed=${baseSeed}\n`);
    const charAgg = {}; // char -> {first:{w,l,d}, second:{w,l,d}}
    for (const c of CHARACTERS) charAgg[c] = { first: { w: 0, l: 0, d: 0 }, second: { w: 0, l: 0, d: 0 } };

    let totalHeartWins = 0, totalCircleWins = 0, totalDraws = 0, totalTurns = 0, n = 0;
    const matrix = [];

    for (const [h, c] of pairs) {
        let hw = 0, cw = 0, d = 0, turns = 0;
        for (let g = 0; g < games; g++) {
            const rng = engine.makeRng(baseSeed * 1000003 + g + h.length * 31 + c.length * 7 + hash(h + c));
            const r = runOneGame(h, c, rng, mode);
            if (r.winner === HEART) hw++;
            else if (r.winner === CIRCLE) cw++;
            else d++;
            turns += r.turns;
        }
        totalHeartWins += hw; totalCircleWins += cw; totalDraws += d; totalTurns += turns; n += games;
        // heart=first mover, circle=second mover
        charAgg[h].first.w += hw; charAgg[h].first.l += cw; charAgg[h].first.d += d;
        charAgg[c].second.w += cw; charAgg[c].second.l += hw; charAgg[c].second.d += d;
        matrix.push({ h, c, hw, cw, d, avgTurns: (turns / games).toFixed(1) });
    }

    if (args.pair) {
        for (const m of matrix) {
            const tot = m.hw + m.cw + m.d;
            console.log(`${pad(m.h, 14)}(💙先) vs ${pad(m.c, 14)}(⭕後): 💙 ${pct(m.hw, tot)}  ⭕ ${pct(m.cw, tot)}  draw ${pct(m.d, tot)}  avgTurns ${m.avgTurns}`);
        }
        return;
    }

    console.log(`## First-move advantage (all matchups)`);
    console.log(`first(💙) wins ${pct(totalHeartWins, n)}   second(⭕) wins ${pct(totalCircleWins, n)}   draws ${pct(totalDraws, n)}   avgTurns ${(totalTurns / n).toFixed(1)}\n`);

    console.log(`## Per-character win-rate (excludes draws)`);
    console.log(`${pad('char', 14)} ${pad('as FIRST(💙)', 16)} ${pad('as SECOND(⭕)', 16)} overall`);
    for (const c of CHARACTERS) {
        const f = charAgg[c].first, s2 = charAgg[c].second;
        const fwr = wr(f.w, f.l), swr = wr(s2.w, s2.l), owr = wr(f.w + s2.w, f.l + s2.l);
        console.log(`${pad(c, 14)} ${pad(fwr, 16)} ${pad(swr, 16)} ${owr}`);
    }
    console.log('\n(win-rate = wins / (wins+losses), draws excluded)');
}

function hash(str) { let h = 0; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0; return Math.abs(h); }
function crossProduct(a, b) { const out = []; for (const x of a) for (const y of b) out.push([x, y]); return out; }
function pad(s, n) { s = String(s); return s + ' '.repeat(Math.max(0, n - s.length)); }
function pct(x, tot) { return tot ? `${((100 * x) / tot).toFixed(1)}%` : 'n/a'; }
function wr(w, l) { return w + l ? `${((100 * w) / (w + l)).toFixed(1)}%` : 'n/a'; }

// ---------- metrics: single comparable JSON snapshot (for the improvement loop) ----------
function computeMetrics(games, mode, baseSeed) {
    const pairs = crossProduct(CHARACTERS, CHARACTERS);
    const charAgg = {};
    for (const c of CHARACTERS) charAgg[c] = { w: 0, l: 0, d: 0 };
    let fw = 0, sw = 0, dr = 0, turns = 0, n = 0;
    for (const [h, c] of pairs) {
        for (let g = 0; g < games; g++) {
            const rng = engine.makeRng(baseSeed * 1000003 + g + hash(h + '|' + c));
            const r = runOneGame(h, c, rng, mode);
            if (r.winner === HEART) { fw++; charAgg[h].w++; charAgg[c].l++; }
            else if (r.winner === CIRCLE) { sw++; charAgg[c].w++; charAgg[h].l++; }
            else { dr++; charAgg[h].d++; charAgg[c].d++; }
            turns += r.turns; n++;
        }
    }
    const charWR = {};
    for (const c of CHARACTERS) { const a = charAgg[c]; charWR[c] = a.w + a.l ? a.w / (a.w + a.l) : null; }
    const nonGiant = CHARACTERS.filter((c) => c !== 'giant').map((c) => charWR[c]).filter((x) => x != null);
    const spread = Math.max(...nonGiant) - Math.min(...nonGiant);
    const meanNonGiant = nonGiant.reduce((a, b) => a + b, 0) / nonGiant.length;
    return {
        mode, games, seed: baseSeed, n,
        drawRate: dr / n,
        firstWin: fw / n,
        secondWin: sw / n,
        firstAdvantage: (fw - sw) / n,
        avgTurns: turns / n,
        charWinRate: charWR,
        nonGiantSpread: spread,            // 0 = 非giantキャラが完全に均衡
        giantGap: charWR.giant == null ? null : meanNonGiant - charWR.giant, // 大きいほどgiantが弱い
    };
}
function metrics(args) {
    const m = computeMetrics(parseInt(args.games || '800', 10), args.mode || 'faithful', parseInt(args.seed || '1', 10));
    if (args.tag) m.tag = args.tag;
    console.log(JSON.stringify(m, null, 2));
    if (args.log) {
        const fs = require('fs');
        fs.appendFileSync(args.log, JSON.stringify(m) + '\n');
        console.error(`(appended to ${args.log})`);
    }
}

// ---------- bench: AI strength ----------
function headToHead(games, charH, charC, modeH, modeC, baseSeed) {
    let hw = 0, cw = 0, d = 0;
    for (let g = 0; g < games; g++) {
        const rng = engine.makeRng(baseSeed * 7919 + g + hash(modeH + modeC + charH + charC));
        const r = runOneGame(charH, charC, rng, modeH, modeC);
        if (r.winner === HEART) hw++; else if (r.winner === CIRCLE) cw++; else d++;
    }
    return { hw, cw, d, games };
}
// strength of `mode` = win-rate vs pure-random, averaged over playing first & second (char fixed).
function strengthVsRandom(games, mode, char, baseSeed) {
    const a = headToHead(games, char, char, mode, 'random', baseSeed);     // mode first
    const b = headToHead(games, char, char, 'random', mode, baseSeed + 1); // mode second
    const w = a.hw + b.cw, l = a.cw + b.hw, dd = a.d + b.d, tot = games * 2;
    return { winRate: (w) / tot, lossRate: l / tot, drawRate: dd / tot, wExclDraw: w + l ? w / (w + l) : null };
}
function bench(args) {
    const games = parseInt(args.games || '1500', 10);
    const char = args.char || 'you';
    const seed = parseInt(args.seed || '1', 10);
    console.log(`# AI strength bench  games=${games}/side  char=${char}  seed=${seed}\n`);
    for (const mode of ['random', 'faithful', 'capture']) {
        const s = strengthVsRandom(games, mode, char, seed);
        console.log(`${pad(mode, 9)} vs random:  win ${pct(s.winRate * 100, 100)}  loss ${pct(s.lossRate * 100, 100)}  draw ${pct(s.drawRate * 100, 100)}  (win ex-draw ${s.wExclDraw == null ? 'n/a' : (s.wExclDraw * 100).toFixed(1) + '%'})`);
    }
    console.log('');
    const h2h = headToHead(games, char, char, 'capture', 'faithful', seed);
    const h2h2 = headToHead(games, char, char, 'faithful', 'capture', seed + 1);
    const capW = h2h.hw + h2h2.cw, faiW = h2h.cw + h2h2.hw, dd = h2h.d + h2h2.d, tot = games * 2;
    console.log(`head-to-head capture vs faithful (${char}): capture ${pct(capW, tot)}  faithful ${pct(faiW, tot)}  draw ${pct(dd, tot)}`);
    console.log('\n強さの目安: 対randomの「win ex-draw」が高いほど強い。capture>faithful なら捕獲考慮が有効。');
}

// ---------- watch one AI vs AI game ----------
function auto(args) {
    const hchar = args.hchar || 'you';
    const cchar = args.cchar || 'you';
    const mode = args.mode || 'faithful';
    const rng = engine.makeRng(parseInt(args.seed || '1', 10));
    const s = engine.newGame({ heartChar: hchar, circleChar: cchar, rng });
    console.log(`AI(${hchar}) 💙  vs  AI(${cchar}) ⭕   mode=${mode}\n`);
    let guard = 0;
    while (!s.winner && guard++ < 400) {
        const who = engine.curPlayer(s);
        const result = ai.makeMove(s, mode);
        if (result.turnEnded) {
            console.log(`turn ${s.currentTurn - 1}: ${who} used turn-ending skill`);
            continue;
        }
        if (result.move === null) { console.log('-- no moves: draw --'); break; }
        engine.placeMove(s, result.move);
        console.log(`turn ${s.currentTurn - 1}: ${who} -> ${result.move}`);
    }
    console.log('\n' + engine.renderBoard(s));
    console.log(s.winner ? `Winner: ${s.winner}` : 'Draw');
}

// ---------- interactive play ----------
function play(args) {
    const meSym = args.me === '⭕' ? CIRCLE : HEART;
    const hchar = args.mychar && meSym === HEART ? args.mychar : args.hchar || (meSym === HEART ? args.mychar || 'you' : args.aichar || 'you');
    // simpler: explicit
    const heartChar = meSym === HEART ? (args.mychar || 'you') : (args.aichar || 'you');
    const circleChar = meSym === CIRCLE ? (args.mychar || 'you') : (args.aichar || 'you');
    const mode = args.mode || 'capture';
    const s = engine.newGame({ heartChar, circleChar, seed: parseInt(args.seed || '1', 10) });

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    console.log(`You are ${meSym} (char=${meSym === HEART ? heartChar : circleChar}). Opponent AI is ${meSym === HEART ? CIRCLE : HEART} (char=${meSym === HEART ? circleChar : heartChar}).`);
    console.log(`Type a cell number 0-15 to play, "skill <name> [idx]", "help", or "quit".\n`);

    function showState() {
        console.log(engine.renderBoard(s));
        console.log(`turn ${s.currentTurn}  next=${engine.curPlayer(s)}  life=${s.life}  magic 💙:${s.heartMagic} ⭕:${s.circleMagic}`);
        if (s.useLock) console.log(`  (pending LOCK x${s.useLock}: choose a cell)`);
        if (s.useStomp) console.log(`  (pending STOMP: choose a cell)`);
        if (s.useJudgeDay) console.log(`  (pending JUDGE DAY: choose a cell)`);
        if (s.useBuds[0]) console.log(`  (pending BUDS x${s.useBuds[1]} on next placement)`);
        if (s.heartProliferate) console.log(`  (💙 PROLIFERATE loop ${s.heartProliferateCount}, next upkeep ${engine.proliferateUpkeep(s.heartProliferateCount)})`);
        if (s.circleProliferate) console.log(`  (⭕ PROLIFERATE loop ${s.circleProliferateCount}, next upkeep ${engine.proliferateUpkeep(s.circleProliferateCount)})`);
    }
    function aiTurnsIfNeeded() {
        let guard = 0;
        while (!s.winner && engine.curPlayer(s) !== meSym && guard++ < 50) {
            const result = ai.makeMove(s, mode);
            if (result.turnEnded) { console.log(`AI ${engine.curPlayer(s)} used turn-ending skill`); continue; }
            if (result.move === null) break;
            console.log(`AI ${engine.curPlayer(s)} plays ${result.move}`);
            engine.placeMove(s, result.move);
        }
    }

    function loop() {
        if (s.winner) { console.log(`\n*** Winner: ${s.winner} ***`); rl.close(); return; }
        showState();
        rl.question(`${meSym}> `, (line) => {
            const cmd = line.trim();
            if (cmd === 'quit' || cmd === 'q') { rl.close(); return; }
            if (cmd === 'help' || cmd === 'h') {
                console.log('cells: 0-15. skills: ' + Object.keys(SKILLS).join(', '));
                console.log('e.g.  "5"  |  "skill token"  |  "skill lock" then "5"  |  "skill charge"');
                return loop();
            }
            if (cmd.startsWith('skill')) {
                const [, name] = cmd.split(/\s+/);
                const fn = SKILLS[name];
                if (!fn) { console.log('unknown skill: ' + name); return loop(); }
                try { fn(s); } catch (e) { console.log('skill error: ' + e.message); }
                if (s.winner) return loop();
                aiTurnsIfNeeded();
                return loop();
            }
            const i = parseInt(cmd, 10);
            if (Number.isNaN(i) || i < 0 || i > 15) { console.log('enter 0-15, "skill <name>", or "help"'); return loop(); }
            const ok = engine.placeMove(s, i);
            if (!ok) { console.log('illegal move there.'); return loop(); }
            aiTurnsIfNeeded();
            return loop();
        });
    }
    aiTurnsIfNeeded();
    loop();
}

// ---------- dispatch ----------
const args = parseArgs(process.argv.slice(2));
const sub = args._[0] || 'help';
if (sub === 'sim') sim(args);
else if (sub === 'auto') auto(args);
else if (sub === 'play') play(args);
else if (sub === 'metrics') metrics(args);
else if (sub === 'bench') bench(args);
else {
    console.log(`tictactoe headless CLI
  node sim/cli.js play    [--me 💙|⭕] [--mychar C] [--aichar C] [--mode capture] [--seed N]
  node sim/cli.js sim     [--games 500] [--mode faithful|capture|random] [--seed N] [--pair h,c]
  node sim/cli.js auto    [--hchar C] [--cchar C] [--mode faithful] [--seed N]
  node sim/cli.js metrics [--games 800] [--mode faithful] [--seed N]   # balance snapshot as JSON
  node sim/cli.js bench   [--games 1500] [--char you] [--seed N]       # AI strength vs random / head-to-head

characters: ${CHARACTERS.join(', ')}
modes: faithful (=AIPlayer.ts同一), capture (捕獲考慮), random (ランダム基準)`);
}
