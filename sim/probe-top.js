#!/usr/bin/env node
// @ts-check
'use strict';
/*
 * 「特定キャラを環境トップにする」チューニング用の計測器（/tune-top スキルが使う）。
 * 環境 = 全キャラが推奨デッキ・推奨ギア・既定AIで戦う状態。対象キャラにだけ「候補の設定」（デッキ / ギア / AIフラグ / 別AIファイル）を与え、
 * 対象が他の全キャラ（各キャラと同数）に対して何%勝つか（= 環境勝率。引き分け除く）を測る。席は試合ごとに交互、シードは全候補で共通（paired）。
 *
 *   node sim/probe-top.js --target pyromancer --games 100 --seed 1                       # 現状の環境勝率（対キャラ別も）
 *   node sim/probe-top.js --target pyromancer --gears sturdy,harvest --deck 0,3,5,...     # 候補の設定
 *   node sim/probe-top.js --target pyromancer --flags pyroChain=0,burnoutAfter=1 --modA ai.new.js
 *   node sim/probe-top.js --rank --games 60 --seed 1 [--target X --gears ..]              # 全キャラ総当たり→環境順位表（--target があればその設定を環境に反映）
 *   node sim/probe-top.js --target X --scan gears --games 60                              # ギア1枠ずつ差し替えた近傍を全部測る
 *   node sim/probe-top.js --target X --scan deck --neighbors 30 --games 60                # デッキ1枚差し替えの近傍をランダムに N 個測る
 *   node sim/probe-top.js --target X --scan deck --swap 3 --cat ice --neighbors 40        # 3枚同時に入れ替え（シナジー探索）。--cat で入れる札のカテゴリを限る
 *
 * 共通: --size N（盤面。既定 4）, --envDeck varied（相手は本番と同じ「推奨から3枚入れ替え」デッキ。既定は推奨のまま）, --workers N（既定=コア数）,
 *       --opp a,b,c（相手を絞る）, --json（人が読む要約を出さず JSON のみ）
 * 出力の `field` が環境勝率（対象の対キャラ別勝率の単純平均）。`se` は標準誤差の概算。
 */
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const engine = require('./engine');
const gearMod = require('./gear');
const deckMod = require('./deck');

const args = {};
for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a.startsWith('--')) args[a.slice(2)] = process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : 'true';
}
const parseFlags = (str) => {
    const o = {};
    if (!str) return o;
    for (const kv of str.split(',')) { const [k, v] = kv.split('='); o[k] = v === undefined ? true : v === 'true' ? true : v === 'false' ? false : Number.isNaN(Number(v)) ? v : Number(v); }
    return o;
};
const ints = (str) => (str ? str.split(',').map((x) => parseInt(x, 10)) : null);

const CHARS = engine.CHARACTERS;
const games = parseInt(args.games || '100', 10);
const seed0 = parseInt(args.seed || '1', 10);
const size = args.size ? parseInt(args.size, 10) : undefined;
const maxTurns = 600;

/** 1試合。cfg[seat] = { deck, gears, flags, mod }。勝者の席（なければ -1） */
function play(chars, cfgs, seed) {
    const rng = engine.makeRng(seed);
    const s = engine.newGame({ chars, rng, size, decks: cfgs.map((c) => c.deck || null), gears: cfgs.map((c) => c.gears) });
    s.aiFlags = cfgs.map((c) => c.flags || {});
    let g = 0;
    while (!s.winner && g++ < maxTurns) {
        const r = cfgs[s.turn].mod.makeMove(s, 'faithful');
        if (!r.turnEnded && r.move != null) engine.placeMove(s, r.move);
        else if (!r.turnEnded) engine.SKILLS.charge(s);
    }
    return s.winner ? engine.seatOf(s.winner) : -1;
}

/** 環境のキャラ c の標準設定。deckRng が渡れば本番どおり「推奨から3枚入れ替え」 */
function envCfg(c, mods, deckRng) {
    return { deck: deckRng ? deckMod.variedAIDeck(c, deckRng) : deckMod.recommendedDeck(c), gears: gearMod.recommendedGears(c), flags: {}, mod: mods.base };
}

/** ワーカー: a と b の組を games 試合（席交互）。a の勝ち・負け・引分を返す */
function pairTally(a, b, cfgA, cfgB, mods, from, to, seedBase) {
    const t = { w: 0, l: 0, d: 0 };
    for (let g = from; g < to; g++) {
        const aFirst = g % 2 === 0;
        const chars = aFirst ? [a, b] : [b, a];
        const seed = seedBase * 100003 + g;
        const rng = engine.makeRng(seed * 31 + 7);
        const ca = cfgA(rng), cb = cfgB(rng);
        const cfgs = aFirst ? [ca, cb] : [cb, ca];
        const w = play(chars, cfgs, seed);
        if (w === -1) t.d++; else if (w === (aFirst ? 0 : 1)) t.w++; else t.l++;
    }
    return t;
}

// ---- ワーカー（子プロセス）----
if (args.worker) {
    const job = JSON.parse(process.env.TOP_JOB || '{}');
    const base = require(path.resolve(__dirname, 'ai.js'));
    const mods = { base, A: job.modA ? require(path.resolve(__dirname, job.modA)) : base };
    const out = [];
    for (const t of job.tasks) {
        // t = { a, b, aCand (a に候補設定を与えるか), bCand, variant, cand: {...} }
        const cand = job.variants[t.variant];
        const mk = (c, isCand) => (rng) => {
            const e = envCfg(c, mods, job.envDeck === 'varied' ? rng : null);
            if (!isCand) return e;
            if (cand.deck) e.deck = cand.deck;
            if (cand.gears) e.gears = cand.gears;
            if (cand.flags) e.flags = cand.flags;
            e.mod = mods.A;
            return e;
        };
        const tally = pairTally(t.a, t.b, mk(t.a, t.aCand), mk(t.b, t.bCand), mods, job.from, job.to, job.seed);
        out.push({ variant: t.variant, a: t.a, b: t.b, ...tally });
    }
    process.stdout.write('OUT ' + JSON.stringify(out) + '\n');
    process.exit(0);
}

// ---- 親 ----
function runWorkers(tasks, variants, workers) {
    // 試合数を worker 数で分割（各タスクの g 範囲を分ける。席交互が崩れないよう分割幅は偶数）
    const per = Math.ceil(games / workers / 2) * 2;
    const jobs = [];
    for (let from = 0; from < games; from += per) jobs.push({ from, to: Math.min(games, from + per) });
    return Promise.all(jobs.map((j) => new Promise((resolve, reject) => {
        const job = { ...j, seed: seed0, tasks, variants, modA: args.modA, envDeck: args.envDeck };
        const p = spawn(process.execPath, [__filename, '--worker', ...(size ? ['--size', String(size)] : [])], { env: { ...process.env, TOP_JOB: JSON.stringify(job) }, stdio: ['ignore', 'pipe', 'inherit'] });
        let buf = '';
        p.stdout.on('data', (d) => { buf += d; });
        p.on('close', (code) => {
            const line = buf.split('\n').find((l) => l.startsWith('OUT '));
            if (code !== 0 || !line) return reject(new Error('worker failed'));
            resolve(JSON.parse(line.slice(4)));
        });
    }))).then((parts) => {
        const merged = {};
        for (const part of parts) for (const r of part) {
            const k = `${r.variant}|${r.a}|${r.b}`;
            const m = merged[k] || (merged[k] = { variant: r.variant, a: r.a, b: r.b, w: 0, l: 0, d: 0 });
            m.w += r.w; m.l += r.l; m.d += r.d;
        }
        return Object.values(merged);
    });
}

const rate = (t) => { const n = t.w + t.l; return n ? t.w / n : 0.5; };

/** 変種 v の対象キャラ target の環境勝率（対キャラ別と平均） */
function summarize(results, variant, target, opps) {
    const per = {};
    let sum = 0, varSum = 0;
    for (const o of opps) {
        const r = results.find((x) => x.variant === variant && x.a === target && x.b === o);
        const n = r.w + r.l, p = rate(r);
        per[o] = +p.toFixed(3);
        sum += p;
        varSum += n ? (p * (1 - p)) / n : 0;
    }
    return { per, field: +(sum / opps.length).toFixed(4), se: +(Math.sqrt(varSum) / opps.length).toFixed(4) };
}

async function main() {
    const workers = parseInt(args.workers || String(os.cpus().length), 10);
    const target = args.target;
    const opps = (args.opp ? args.opp.split(',') : CHARS).filter((c) => c !== target);
    const cand = {};
    if (args.deck) {
        const d = ints(args.deck);
        if (!deckMod.isValidDeck(d)) throw new Error('--deck は 0〜' + (deckMod.CATALOG_SIZE - 1) + ' の重複なし12個');
        cand.deck = d;
    }
    if (args.gears) cand.gears = args.gears === 'none' ? [] : args.gears.split(',');
    if (args.flags) cand.flags = parseFlags(args.flags);

    if (args.rank) {
        // 全キャラ総当たり。target があればその設定（cand）を環境に反映する
        const tasks = [];
        for (let i = 0; i < CHARS.length; i++) for (let j = i + 1; j < CHARS.length; j++) {
            const a = CHARS[i], b = CHARS[j];
            tasks.push({ a, b, variant: 0, aCand: a === target, bCand: b === target });
        }
        const res = await runWorkers(tasks, [target ? cand : {}], workers);
        const table = CHARS.map((c) => {
            const per = {};
            let sum = 0;
            for (const o of CHARS) {
                if (o === c) continue;
                const direct = res.find((x) => x.a === c && x.b === o);
                const rev = res.find((x) => x.a === o && x.b === c);
                const p = direct ? rate(direct) : 1 - rate(rev);
                per[o] = +p.toFixed(3);
                sum += p;
            }
            return { char: c, field: +(sum / (CHARS.length - 1)).toFixed(4), per };
        }).sort((x, y) => y.field - x.field);
        const out = { mode: 'rank', games, seed: seed0, size: size || 4, target: target || null, candidate: target ? cand : null, table: table.map((r, i) => ({ rank: i + 1, ...r })) };
        if (args.json) { console.log(JSON.stringify(out)); return; }
        console.log(`環境順位（各ペア${games}試合・席交互・引分除く${target ? `・${target} に候補設定を反映` : ''}）`);
        table.forEach((r, i) => console.log(`${String(i + 1).padStart(2)}. ${r.char.padEnd(14)} ${(r.field * 100).toFixed(1)}%${r.char === target ? '  ← target' : ''}`));
        console.log('GAP(1位 - 2位) ' + ((table[0].field - table[1].field) * 100).toFixed(1) + 'pt');
        console.log('RESULT ' + JSON.stringify(out));
        return;
    }

    if (!target || !CHARS.includes(target)) throw new Error('--target <' + CHARS.join('|') + '> が必要');

    // 変種の一覧
    let variants = [cand];
    let labels = ['candidate'];
    if (args.scan === 'gears') {
        const base = cand.gears || gearMod.recommendedGears(target);
        variants = []; labels = [];
        variants.push({ ...cand, gears: base }); labels.push('base ' + base.join(','));
        for (let slot = 0; slot < base.length; slot++) {
            for (const g of gearMod.GEAR_IDS) {
                if (base.includes(g)) continue;
                const gs = base.slice(); gs[slot] = g;
                variants.push({ ...cand, gears: gs }); labels.push(`slot${slot}→${g}  [${gs.join(',')}]`);
            }
        }
    } else if (args.scan === 'deck') {
        const base = cand.deck || deckMod.recommendedDeck(target);
        const n = parseInt(args.neighbors || '30', 10);
        const rng = engine.makeRng(seed0 * 977 + 5);
        variants = [{ ...cand, deck: base.slice().sort((a, b) => a - b) }]; labels = ['base'];
        const seen = new Set();
        let guard = 0;
        const k = Math.max(1, parseInt(args.swap || '1', 10)); // 同時に入れ替える枚数。2〜3 にすると組み合わせ（シナジー）でしか効かない変更が見つかる
        const cat = args.cat || null; // 入れる札をこのカテゴリ（support/buds/token/attack/control/poison/charge/ice/fire）に限る
        while (variants.length < n + 1 && guard++ < n * 20) {
            const keep = base.slice();
            const outs = [], ins = [];
            for (let j = 0; j < k; j++) outs.push(keep.splice(Math.floor(rng() * keep.length), 1)[0]);
            const pool = Array.from({ length: deckMod.CATALOG_SIZE }, (_, i) => i).filter((i) => !base.includes(i) && (!cat || deckMod.SKILL_CATALOG[i].category === cat));
            if (pool.length < k) break;
            for (let j = 0; j < k; j++) ins.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
            const key = outs.slice().sort().join('.') + '>' + ins.slice().sort().join('.');
            if (seen.has(key)) continue;
            seen.add(key);
            const d = keep.concat(ins).sort((a, b) => a - b);
            variants.push({ ...cand, deck: d });
            const nm = (i) => `${i}(${deckMod.SKILL_CATALOG[i].name})`;
            labels.push(`-${outs.map(nm).join(',')} +${ins.map(nm).join(',')}  [${d.join(',')}]`);
        }
    }

    const tasks = [];
    variants.forEach((_, v) => { for (const o of opps) tasks.push({ a: target, b: o, variant: v, aCand: true, bCand: false }); });
    const res = await runWorkers(tasks, variants, workers);
    const rows = variants.map((_, v) => ({ label: labels[v], cand: variants[v], ...summarize(res, v, target, opps) }));
    const out = { mode: args.scan ? 'scan-' + args.scan : 'single', target, games, seed: seed0, size: size || 4, opponents: opps, rows };
    if (args.json) { console.log(JSON.stringify(out)); return; }
    const sorted = rows.map((r, i) => ({ ...r, i })).sort((x, y) => y.field - x.field);
    for (const r of args.scan ? sorted : rows) {
        console.log(`${(r.field * 100).toFixed(1)}% ±${(1.96 * r.se * 100).toFixed(1)}  ${r.label}`);
        if (!args.scan) console.log('  対キャラ別: ' + Object.entries(r.per).map(([k, v]) => `${k} ${(v * 100).toFixed(0)}%`).join(' / '));
    }
    console.log('RESULT ' + JSON.stringify(out));
}

main().catch((e) => { console.error(e.message); process.exit(1); });
