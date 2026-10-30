#!/usr/bin/env node
// @ts-check
'use strict';
/*
 * Terminal front-end for the headless game engine.
 *
 *   node sim/cli.js play  [--me 💙|⭕] [--mychar you] [--aichar you] [--seed N]
 *   node sim/cli.js sim   [--games 500] [--mode prod] [--seed N] [--pair you,giant]
 *   node sim/cli.js auto  [--hchar you] [--cchar you] [--seed N] [--mode prod]   (watch one AIvsAI game)
 *
 * 多人数 (2〜8人。盤面は人数で 4x4〜7x7。issue #32):
 *   node sim/cli.js sim     --players 4 [--games 300] [--chars you,giant,..] [--mode prod] [--seed N]
 *   node sim/cli.js metrics --players 4 [--games 300] [--mode prod] [--seed N]   (JSON)
 *   node sim/cli.js auto    --chars you,giant,poisoner [--seed N]
 *   --size N で盤面の一辺(4〜10)を人数と無関係に指定（sim/metrics/auto。省略時は人数に応じた既定）
 *
 * In `play`, type a cell index (0-15) to place, `skill <name> [idx]` to use a
 * skill, `help`, or `quit`.
 */

const readline = require('readline');
const engine = require('./engine');
const aiDriver = require('./aiDriver');
const inflationMod = require('./inflation');
const live = require('./live');
const { runGame, pickChars } = require('./run');
const { HEART, CIRCLE, CHARACTERS, SKILLS, SYMBOLS, MAX_PLAYERS } = engine;

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
// 2人戦用
function runOneGame(hchar, cchar, rng, hmode, cmode) {
    if (cmode === undefined) cmode = hmode;
    return runGame([hchar, cchar], rng, [hmode, cmode]);
}

// ---------- 多人数バッチ (issue #32) ----------
function computeMultiMetrics(players, games, mode, baseSeed, fixedChars, size) {
    const seatWins = Array(players).fill(0);
    const charAgg = {};
    for (const c of CHARACTERS) charAgg[c] = { w: 0, appearances: 0 };
    let draws = 0, turns = 0;
    const pickRng = engine.makeRng(baseSeed * 2654435 + players);
    for (let g = 0; g < games; g++) {
        const chars = pickChars(players, fixedChars, pickRng);
        const rng = engine.makeRng(baseSeed * 1000003 + g * 7919 + players);
        const r = runGame(chars, rng, mode, size);
        chars.forEach((c) => { charAgg[c].appearances++; });
        if (r.winnerSeat >= 0) { seatWins[r.winnerSeat]++; charAgg[chars[r.winnerSeat]].w++; }
        else draws++;
        turns += r.turns;
    }
    const decided = games - draws;
    const charWinRate = {};
    for (const c of CHARACTERS) charWinRate[c] = charAgg[c].appearances ? charAgg[c].w / charAgg[c].appearances : null;
    return {
        players, boardSize: size != null ? size : engine.boardSizeFor(players), boardSizeFixed: size != null, mode, games, seed: baseSeed,
        chars: fixedChars || 'random',
        decayPerRoundMinPlayers: engine.DECAY_PER_ROUND_MIN_PLAYERS,
        seatWinRate: seatWins.map((w) => (decided ? w / decided : null)), // 席0=先手。均等なら 1/players
        drawRate: draws / games,
        avgTurns: turns / games,
        // キャラ別: 出場1回あたりの勝率（均等なら 1/players）
        charWinRate,
    };
}

function multiSim(args) {
    const players = parseInt(args.players, 10);
    if (!(players >= 2 && players <= MAX_PLAYERS)) throw new Error(`--players must be 2..${MAX_PLAYERS}`);
    const games = parseInt(args.games || '300', 10);
    const m = computeMultiMetrics(players, games, args.mode || 'prod', parseInt(args.seed || '1', 10), args.chars ? args.chars.split(',') : null, args.size ? parseInt(args.size, 10) : null);
    const se = (p) => Math.sqrt((p * (1 - p)) / Math.max(1, games * (1 - m.drawRate)));
    console.log(`# ${players}人戦 (${m.boardSize}x${m.boardSize})  games=${games}  AI=${m.mode}  seed=${m.seed}  chars=${Array.isArray(m.chars) ? m.chars.join(',') : 'random'}`);
    console.log(`減衰: ${players >= m.decayPerRoundMinPlayers ? '手番1周ごとに1回' : '着手のたび'}   均等なら各席 ${(100 / players).toFixed(1)}%\n`);
    console.log('## 席別の勝率 (席0=先手, 引き分け除く)');
    m.seatWinRate.forEach((p, seat) => console.log(`  ${SYMBOLS[seat]} 席${seat}: ${p == null ? 'n/a' : (p * 100).toFixed(1) + '%'}  (±${p == null ? 'n/a' : (se(p) * 100).toFixed(1)}pt)`));
    console.log(`\ndraw/打ち切り ${(m.drawRate * 100).toFixed(1)}%   avgTurns ${m.avgTurns.toFixed(1)}\n`);
    if (!m.chars || !Array.isArray(m.chars)) {
        console.log('## キャラ別の勝率 (出場1回あたり。均等なら ' + (100 / players).toFixed(1) + '%)');
        for (const c of CHARACTERS) console.log(`  ${pad(c, 14)} ${m.charWinRate[c] == null ? 'n/a' : (m.charWinRate[c] * 100).toFixed(1) + '%'}`);
    }
}

// ---------- 魔力インフレ指標 (sim/inflation.js) ----------
function inflation(args) {
    const players = parseInt(args.players || '2', 10);
    const games = parseInt(args.games || '200', 10);
    const mode = args.mode || 'prod';
    const baseSeed = parseInt(args.seed || '1', 10);
    const size = args.size ? parseInt(args.size, 10) : undefined;
    const fixed = args.chars ? args.chars.split(',') : null;
    const pickRng = engine.makeRng(baseSeed * 2654435 + players);
    const all = [];
    for (let g = 0; g < games; g++) {
        const chars = pickChars(players, fixed, pickRng);
        const rng = engine.makeRng(baseSeed * 1000003 + g * 7919 + players);
        let t;
        runGame(chars, rng, mode, size, (s) => (t = inflationMod.createTracker(s)));
        all.push(t.rows);
    }
    const out = { players, boardSize: size != null ? size : engine.boardSizeFor(players), mode, games, seed: baseSeed, chars: fixed || 'random', ...inflationMod.summarize(all, inflationMod.referenceCost(engine.skillCosts), args.bucket ? parseInt(args.bucket, 10) : undefined) };
    if (args.json) return console.log(JSON.stringify(out, null, 2));
    const f = (x, d = 2) => (x == null ? 'n/a' : x.toFixed(d));
    console.log(`# 魔力インフレ  ${players}人 ${out.boardSize}x${out.boardSize}  games=${games}  AI=${mode}  seed=${baseSeed}  基準コスト=${f(out.referenceCost, 1)}`);
    console.log(`inflationIndex = ${f(out.inflationIndex)}  (後半 stockToEffCost / 序盤 stockToEffCost。1付近=均衡、大=膨らむ)`);
    console.log('  ※従来の inflationIndex は、序盤(全試合)と後半(少数の長い試合)を混ぜて比べるので、シード違いでよく動く。下の matched を見る。');
    const mt = out.matched;
    if (mt && mt.index != null) {
        console.log(`matched index = ${f(mt.index)}  95%区間 [${f(mt.ci95[0])}, ${f(mt.ci95[1])}]  (同じ ${mt.games} 試合の 序盤 と 後半${mt.lateFrom}-${mt.lateTo}手 を比較)`);
        console.log(`  収入の伸び ${f(mt.incomeGrowth)}x  手持ちの伸び ${f(mt.stockGrowth)}x  (後半/序盤。収入=経済、手持ち=収入+AIが撃ち切れない分)`);
        const pc = (x) => (x == null ? 'n/a' : (x * 100).toFixed(1) + '%');
        console.log(`  マスの変化（盤に占める割合） 序盤 ${pc(mt.earlyChangeRate)} → 後半 ${pc(mt.lateChangeRate)}   動かない手番 序盤 ${pc(mt.earlyStillRate)} → 後半 ${pc(mt.lateStillRate)}  (魔力が余るのに盤面が動かない=撃てない/撃たない)\n`);
    } else console.log(`matched index = n/a  (${(mt && mt.note) || ''})\n`);
    console.log('区間(手番)    手番数   収入/手番  手持ち  撃数/手番  実効コスト  財布/実効  支出/収入  持ち越し率');
    for (const b of [{ ...out.overall, from: '全体', to: '' }, ...out.buckets]) {
        console.log(`${pad(b.to === '' ? '全体' : `${b.from}-${b.to}`, 12)}  ${pad(b.turns, 7)}  ${pad(f(b.income), 9)}  ${pad(f(b.stock), 6)}  ${pad(f(b.skillsPerTurn), 8)}  ${pad(f(b.effCost), 9)}  ${pad(f(b.stockToEffCost), 8)}  ${pad(f(b.spendRatio), 9)}  ${b.hoardRate == null ? 'n/a' : (b.hoardRate * 100).toFixed(1) + '%'}`);
    }
    console.log('\nマスの変化（コマの有無・持ち主・効果が変わったマス。減衰は数えない）');
    console.log('区間(手番)    変化マス/手番  盤に占める割合  コマが動く/手番  動かない手番  魔力1あたりの変化');
    for (const b of [{ ...out.overall, from: '全体', to: '' }, ...out.buckets]) {
        const pc = (x) => (x == null ? 'n/a' : (x * 100).toFixed(1) + '%');
        console.log(`${pad(b.to === '' ? '全体' : `${b.from}-${b.to}`, 12)}  ${pad(f(b.changePerTurn), 12)}  ${pad(pc(b.changeRate), 13)}  ${pad(f(b.piecesPerTurn), 14)}  ${pad(pc(b.stillRate), 11)}  ${f(b.changePerMagic)}`);
    }
}

function multiMetrics(args) {
    const players = parseInt(args.players, 10);
    const m = computeMultiMetrics(players, parseInt(args.games || '300', 10), args.mode || 'prod', parseInt(args.seed || '1', 10), args.chars ? args.chars.split(',') : null, args.size ? parseInt(args.size, 10) : null);
    if (args.tag) m.tag = args.tag;
    console.log(JSON.stringify(m, null, 2));
    if (args.log) {
        require('fs').appendFileSync(args.log, JSON.stringify(m) + '\n');
        console.error(`(appended to ${args.log})`);
    }
}

function sim(args) {
    if (args.players && (parseInt(args.players, 10) !== 2 || args.size)) return multiSim(args);
    const games = parseInt(args.games || '500', 10);
    const mode = args.mode || 'prod';
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
    // SIM_CHARS=a,b,c で対象キャラを絞れる (新キャラ追加前後の比較用)
    const CHARACTERS = process.env.SIM_CHARS ? process.env.SIM_CHARS.split(',') : engine.CHARACTERS;
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
    if (args.players && (parseInt(args.players, 10) !== 2 || args.size)) return multiMetrics(args);
    const m = computeMetrics(parseInt(args.games || '800', 10), args.mode || 'prod', parseInt(args.seed || '1', 10));
    if (args.tag) m.tag = args.tag;
    console.log(JSON.stringify(m, null, 2));
    if (args.log) {
        const fs = require('fs');
        fs.appendFileSync(args.log, JSON.stringify(m) + '\n');
        console.error(`(appended to ${args.log})`);
    }
}

// ---------- watch one AI vs AI game ----------
function auto(args) {
    const chars = args.chars ? args.chars.split(',') : [args.hchar || 'you', args.cchar || 'you'];
    const mode = args.mode || 'prod';
    const rng = engine.makeRng(parseInt(args.seed || '1', 10));
    const s = engine.newGame({ chars, rng, size: args.size ? parseInt(args.size, 10) : undefined });
    console.log(chars.map((c, seat) => `AI(${c}) ${SYMBOLS[seat]}`).join('  vs  ') + `   mode=${mode}  board=${s.size}x${s.size}\n`);
    let guard = 0;
    const limit = Math.max(400, 200 * chars.length);
    while (!s.winner && guard++ < limit) {
        const who = engine.curPlayer(s);
        const turn = s.currentTurn;
        aiDriver.playTurn(s);
        console.log(`turn ${turn}: ${who} played`);
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
    const mode = args.mode || 'prod';
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
            console.log(`AI ${engine.curPlayer(s)} plays`);
            aiDriver.playTurn(s);
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


// ---------- watch: 止めるか勝率が落ち着くまで裏で対戦し続け、統計を随時表示 ----------
function watch(args) {
    const players = parseInt(args.players || '2', 10);
    if (!(players >= 2 && players <= MAX_PLAYERS)) throw new Error(`--players must be 2..${MAX_PLAYERS}`);
    const mode = args.mode || 'prod';
    const baseSeed = parseInt(args.seed || String(Date.now() % 100000), 10);
    const size = args.size ? parseInt(args.size, 10) : undefined;
    const fixed = args.chars ? args.chars.split(',') : null;
    const maxGames = args.max ? parseInt(args.max, 10) : Infinity;
    const everyMs = parseFloat(args.interval || '1') * 1000;       // 画面更新の間隔
    // 勝率スナップショットを積む間隔(ゲーム数)。1対1は全組を1周する長さ(110)の倍数にして、周回の途中に偏らないようにする
    const ckEvery = parseInt(args.checkpoint || (players === 2 && !args.chars ? '220' : '200'), 10);
    const conv = args.forever ? null : {
        window: parseInt(args.window || '10', 10),                 // 直近何スナップショットを見るか
        eps: parseFloat(args.eps || '0.5') / 100,                  // その間の勝率の動きの許容幅(pt)
        minGames: parseInt(args['min-games'] || '2000', 10),
    };
    const jobs = Math.max(1, parseInt(args.jobs || String(require('os').cpus().length), 10)); // 並列数（worker_threads）
    const agg = live.createAggregator(CHARACTERS, players, ckEvery);
    let stats = live.aggregate(agg, []);
    const tty = process.stdout.isTTY;
    const t0 = Date.now();
    let lastDraw = 0;
    // 既定は本番AIと同じ装備。--no-gear でギアなし、--no-skill でスキルを使わない（置くだけ）
    const runOpts = { deck: !args['no-skill'], gears: !args['no-gear'], skills: !args['no-skill'] };
    const boardN = size != null ? size : engine.boardSizeFor(players);

    const render = (final) => {
        const sm = live.summarize(stats);
        const sec = (Date.now() - t0) / 1000;
        const drift = live.maxDrift(stats, conv ? conv.window : 10);
        const out = [];
        out.push(`# watch  ${players}人 ${boardN}x${boardN}  AI=${mode}  seed=${baseSeed}  chars=${fixed ? fixed.join(',') : players === 2 ? '全組を順に' : 'random'}  並列=${jobs}  スキル=${runOpts.skills ? 'あり' : 'なし'}  ギア=${runOpts.gears ? 'あり' : 'なし'}`);
        out.push(`games=${sm.games}  ${(sm.games / Math.max(sec, 0.001)).toFixed(1)}局/秒  経過 ${sec.toFixed(0)}s  draw ${(sm.drawRate * 100).toFixed(1)}%  avgTurns ${sm.avgTurns.toFixed(1)}`);
        out.push(`勝率の変動幅(直近${conv ? conv.window : 10}回の最大-最小): ${drift == null ? 'n/a' : (drift * 100).toFixed(2) + 'pt'}${conv ? `  (<=${(conv.eps * 100).toFixed(2)}pt かつ ${conv.minGames}局以上で自動停止)` : '  (--forever: 自動停止なし)'}`);
        out.push('');
        out.push(`${pad('キャラ', 14)} ${pad('出場', 7)} ${pad('勝', 7)} ${pad('勝率', 8)} ${pad('±95%', 7)} ${pad('均等比', 7)} 勝利時平均手数`);
        for (const r of sm.rows) {
            out.push(`${pad(r.id, 14)} ${pad(r.appearances, 7)} ${pad(r.wins, 7)} ${pad((r.winRate * 100).toFixed(1) + '%', 8)} ${pad(r.ci == null ? 'n/a' : (r.ci * 100).toFixed(1), 7)} ${pad((r.winRate / sm.fair).toFixed(2), 7)} ${r.avgTurnsWon == null ? 'n/a' : r.avgTurnsWon.toFixed(1)}`);
        }
        out.push('');
        out.push(`席別勝率(引き分け除く, 均等=${(sm.fair * 100).toFixed(1)}%): ` + sm.seatWinRate.map((p, i) => `${SYMBOLS[i]}${p == null ? 'n/a' : (p * 100).toFixed(1) + '%'}`).join('  '));
        const an = live.analyze(stats);
        if (an) {
            const v = live.verdict(an);
            out.push('\n## 結論: 何が強いか');
            out.push(v.headline);
            v.points.forEach((x) => out.push(`  - ${x}`));
            out.push(`${pad('キャラ', 14)} ${pad('対全平均', 9)} ${pad('対強豪', 8)} ${pad('最悪対面', 20)} ${pad('不利/有利', 10)} 均衡で選ばれる確率`);
            for (const r of an.rows) {
                out.push(`${pad(r.id, 14)} ${pad(r.fieldAvg == null ? 'n/a' : (r.fieldAvg * 100).toFixed(1) + '%', 9)} ${pad(r.strongAvg == null ? 'n/a' : (r.strongAvg * 100).toFixed(1) + '%', 8)} ${pad(r.worst ? `${(r.worst.rate * 100).toFixed(1)}% (${r.worst.id.slice(0, 9)})` : 'n/a', 20)} ${pad(`${r.unfavorable}/${r.favorable}`, 10)} ${(r.eq * 100).toFixed(1)}%`);
            }
            const beats = (id) => an.edges.filter((e) => e.from === id && e.significant).sort((x, y) => y.rate - x.rate).map((e) => `${e.to}(${(e.rate * 100).toFixed(0)}%)`);
            out.push('\n## 有利関係（有意に勝ち越す相手。左が勝つ側）');
            for (const r of an.rows) out.push(`  ${pad(r.id, 14)} > ${beats(r.id).join(' ') || '—'}`);
            const lp = an.loops;
            if (!lp.groups.length) out.push('閉ループ(三すくみなど): なし（有意な勝ち越しは一方向だけ）');
            else {
                out.push(`閉ループ(三すくみなど): ${lp.groups.length}グループ`);
                lp.groups.forEach((g) => out.push(`  互いに勝ち負けが循環するキャラ(${g.length}): ${g.join(', ')}`));
                lp.cycles.slice(0, 10).forEach((c) => out.push(`  ${c.length === 3 ? '三すくみ' : c.length + 'すくみ'}: ${c.join(' → ')} → ${c[0]}`));
                if (lp.cycles.length > 10 || lp.truncated) out.push(`  ...ほか${lp.truncated ? '多数' : lp.cycles.length - 10 + '件'}`);
            }
            out.push(`(対全平均は弱いキャラを大勝するだけで上がるので、判断は対強豪(平均の上位半分の相手だけ)で見る。不利/有利 = 勝率の95%区間が50%を有意に下回る/上回る対面の数。均衡=相手が最適に選ぶ場合。${an.minDecided}試合未満の対面は数えない)`);
        }
        if (final || args.matrix) {
            const mu = live.matchups(stats);
            const ids = sm.rows.map((r) => r.id);
            out.push('\n## 対面別勝率 (行キャラが列キャラに勝つ割合 = 行勝ち/(行勝ち+列勝ち)。括弧内は同卓数)');
            out.push(pad('', 14) + ids.map((id) => pad(id.slice(0, 9), 11)).join(''));
            for (const x of ids) {
                out.push(pad(x, 14) + ids.map((y) => {
                    const c = mu[x] && mu[x][y];
                    return pad(x === y ? '-' : !c || c.winRate == null ? 'n/a' : `${(c.winRate * 100).toFixed(0)}%(${c.meets})`, 11);
                }).join(''));
            }
        }
        if (!final) out.push('\nCtrl-C で停止' + (args.matrix ? '' : '  (--matrix で対面表を常時表示。停止時は必ず表示)'));
        if (tty && !final) process.stdout.write('\x1b[H\x1b[2J');
        console.log(out.join('\n'));
    };

    const workers = [];
    const latest = new Array(jobs).fill(null);
    const finals = new Array(jobs).fill(false);
    let finished = false;
    const finish = (why) => {
        if (finished) return;
        finished = true;
        stats = live.aggregate(agg, latest);
        workers.forEach((w) => w.terminate());
        render(true);
        console.log(`\n停止: ${why}`);
        if (args.log) {
            const sm = live.summarize(stats);
            require('fs').appendFileSync(args.log, JSON.stringify({ players, mode, seed: baseSeed, stopReason: why, ...sm, matchups: live.matchups(stats), analysis: live.analyze(stats) }) + '\n');
            console.error(`(appended to ${args.log})`);
        }
        process.exit(0);
    };
    process.on('SIGINT', () => finish('ユーザー操作 (Ctrl-C)'));
    process.on('SIGTERM', () => finish('SIGTERM'));

    // ゲーム番号 g を worker k が k, k+jobs, ... の順に担当する（結果は g だけで決まるので並列数に依らない）
    const { Worker } = require('worker_threads');
    for (let k = 0; k < jobs; k++) {
        const w = new Worker(require('path').join(__dirname, 'watch-worker.js'), {
            workerData: { players, size, mode, seed: baseSeed, fixedChars: fixed, skills: runOpts.skills, gears: runOpts.gears, offset: k, stride: jobs, maxGames: Number.isFinite(maxGames) ? maxGames : null },
        });
        w.on('message', (m) => { latest[k] = m.stats; if (m.type === 'final') finals[k] = true; });
        w.on('error', (e) => { console.error(e); process.exit(1); });
        workers.push(w);
    }
    setInterval(() => {
        stats = live.aggregate(agg, latest);
        if (finals.every(Boolean)) return finish(`--max ${maxGames} 局に到達`);
        if (conv && live.converged(stats, conv)) return finish('勝率が収束');
        if (Date.now() - lastDraw >= everyMs) { lastDraw = Date.now(); if (tty || everyMs >= 1000) render(false); }
    }, 100);
}

// ---------- dispatch ----------
const args = parseArgs(process.argv.slice(2));
const sub = args._[0] || 'help';
if (sub === 'sim') sim(args);
else if (sub === 'auto') auto(args);
else if (sub === 'watch') watch(args);
else if (sub === 'play') play(args);
else if (sub === 'inflation') inflation(args);
else if (sub === 'metrics') metrics(args);
else {
    console.log(`tictactoe headless CLI
  node sim/cli.js play    [--me 💙|⭕] [--mychar C] [--aichar C] [--mode prod] [--seed N]
  node sim/cli.js sim     [--games 500] [--mode prod] [--seed N] [--pair h,c]
  node sim/cli.js auto    [--hchar C] [--cchar C] [--mode prod] [--seed N]
  node sim/cli.js watch   [--players 2] [--size N] [--chars a,b] [--forever] [--max N] [--matrix] [--no-gear] [--no-skill] [--jobs N] [--eps 0.5] [--log f]   # 止める/収束するまで対戦し続け統計表示
  node sim/cli.js inflation [--players N] [--games 200] [--size N] [--chars ..] [--bucket 50] [--json]   # 魔力インフレ指標
  node sim/cli.js metrics [--games 800] [--mode prod] [--seed N]   # balance snapshot as JSON
  node sim/cli.js sim     --players N [--games 300] [--chars a,b,..]   # 多人数(2〜8人)の席別・キャラ別勝率
  node sim/cli.js metrics --players N [--games 300] [--seed N]         # 多人数のJSON
  node sim/cli.js auto    --chars a,b,c [--seed N]                     # 多人数の1試合を観戦
  (多人数系は --size N で盤面の一辺(4〜10)を指定できる)

characters: ${CHARACTERS.join(', ')}
AI: 本番の AIPlayer.ts そのもの（sim/shared の生成物を sim/aiDriver.js が動かす）`);
}
