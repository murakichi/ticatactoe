#!/usr/bin/env node
// @ts-check
'use strict';
/*
 * 生成AIなしの機械的な自己改善ループ（ベストレスポンス反復）。
 *
 * 環境 = sim/tuned.json（キャラ別の { deck, gears, flags }）。無いキャラ・項目は推奨のまま。
 * 各キャラについて「他キャラを環境の設定に固定したまま、自分のギア → デッキ → AIノブを1軸ずつ探索」し、
 * 統計ゲートを通った最良の候補だけ tuned.json に採用する。全キャラが1周して採用ゼロになれば、
 * ノブ・デッキ・ギアの空間では誰も一方的に得できない状態（近似ナッシュ均衡）。
 *
 *   node sim/autotune.js --chars giant,pyromancer --axes gears,deck,flags --rounds 3 --games 60
 *   node sim/autotune.js --chars all --budget-min 240 --cache .tune-cache     # 時間切れまで回す。再実行で続きから
 *
 * 採用ゲート（tune-top SKILL と同じ）:
 *   1. 探索(seed S, games G)で、最良候補の z = (候補-基準)/√(SE²+SE基準²) が候補数に応じた閾値以上
 *   2. 別シード(--confirm-seed, --confirm-games)で再測定し、差が +1.5pt 以上かつ +1.96×SE 以上（勝者の呪い対策）
 *   3. 対キャラ別勝率が基準から -15pt を超えて悪化していない
 * 採用は tuned.json に書き、sim/autotune-log.jsonl に1行追記。ソースへの反映は sim/apply-tuned.js。
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const engine = require('./engine');

const args = {};
for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a.startsWith('--')) args[a.slice(2)] = process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : 'true';
}
const CHARS = engine.CHARACTERS;
const chars = !args.chars || args.chars === 'all' ? CHARS : args.chars.split(',');
const axes = (args.axes || 'gears,deck,flags').split(',');
const rounds = parseInt(args.rounds || '1', 10);
const games = parseInt(args.games || '60', 10);
const confirmGames = parseInt(args['confirm-games'] || '200', 10);
const seedBase = parseInt(args.seed || '1', 10);
const neighbors = parseInt(args.neighbors || '30', 10);
const swap = parseInt(args.swap || '2', 10);
const budgetMs = args['budget-min'] ? parseFloat(args['budget-min']) * 60000 : Infinity;
const dry = args.dry === 'true';
const tunedFile = path.resolve(args.tuned || path.join(__dirname, 'tuned.json'));
const logFile = path.resolve(args.log || path.join(__dirname, 'autotune-log.jsonl'));
const started = Date.now();

const load = () => (fs.existsSync(tunedFile) ? JSON.parse(fs.readFileSync(tunedFile, 'utf8')) : {});
const save = (t) => { fs.writeFileSync(tunedFile + '.tmp', JSON.stringify(t, null, 2) + '\n'); fs.renameSync(tunedFile + '.tmp', tunedFile); };
const log = (o) => fs.appendFileSync(logFile, JSON.stringify({ at: new Date().toISOString(), ...o }) + '\n');

/** 多重比較の補正（tune-top SKILL の表）。n = 探索で測った候補数 */
const zThreshold = (n) => (args.zmin ? Number(args.zmin) : n <= 5 ? 2.3 : n <= 15 ? 2.7 : n <= 40 ? 3.0 : 3.3);

function probe(extra) {
    const a = ['sim/probe-top.js', '--json', '--games', String(extra.games), '--seed', String(extra.seed), '--envFile', tunedFile, ...(args.cache ? ['--cache', args.cache] : []), ...(args.size ? ['--size', args.size] : []), ...extra.argv];
    const r = spawnSync(process.execPath, a, { cwd: path.resolve(__dirname, '..'), encoding: 'utf8', maxBuffer: 1 << 28 });
    if (r.status !== 0) throw new Error('probe-top failed: ' + (r.stderr || '').slice(-400));
    return JSON.parse(r.stdout.trim().split('\n').pop());
}

const flagStr = (f) => Object.entries(f).map(([k, v]) => `${k}=${v}`).join(',');
/** 候補 cand を probe-top の引数にする */
function candArgs(cand) {
    const o = [];
    if (cand.deck) o.push('--deck', cand.deck.join(','));
    if (cand.gears) o.push('--gears', cand.gears.length ? cand.gears.join(',') : 'none');
    if (cand.flags && Object.keys(cand.flags).length) o.push('--flags', flagStr(cand.flags));
    return o;
}

function step(char, axis, round, stepNo) {
    const seed = seedBase + round * 101 + stepNo;
    const scanArgs = { gears: ['--scan', 'gears'], deck: ['--scan', 'deck', '--neighbors', String(neighbors), '--swap', String(swap)], flags: ['--scan', 'flags', '--neighbors', String(neighbors)] }[axis];
    const scan = probe({ games, seed, argv: ['--target', char, ...scanArgs] });
    const [base, ...rest] = scan.rows;
    const z = (r) => (r.field - base.field) / Math.sqrt(r.se ** 2 + base.se ** 2);
    const best = rest.map((r) => ({ r, z: z(r) })).sort((a, b) => b.z - a.z)[0];
    const rec = { char, axis, round, seed, games, candidates: rest.length, base: base.field, best: best && { label: best.r.label, field: best.r.field, z: +best.z.toFixed(2) } };
    if (!best || best.z < zThreshold(rest.length)) { log({ ...rec, accepted: false, why: 'scan gate' }); return null; }

    // 再測定: 別シードで 基準 と 候補 を測る
    const cseed = seed + 5000;
    const c0 = probe({ games: confirmGames, seed: cseed, argv: ['--target', char] });
    const c1 = probe({ games: confirmGames, seed: cseed, argv: ['--target', char, ...candArgs(best.r.cand)] });
    const r0 = c0.rows[0], r1 = c1.rows[0];
    const delta = r1.field - r0.field, se = Math.sqrt(r0.se ** 2 + r1.se ** 2);
    const worst = Math.min(...Object.keys(r0.per).map((o) => r1.per[o] - r0.per[o]));
    const ok = args.zmin ? delta > 0 : delta >= 0.015 && delta >= 1.96 * se && worst > -0.15; // --zmin は配管の動作確認用（ゲートを緩める）
    log({ ...rec, confirm: { seed: cseed, games: confirmGames, base: r0.field, cand: r1.field, delta: +delta.toFixed(4), se: +se.toFixed(4), worst: +worst.toFixed(3) }, accepted: ok, cand: best.r.cand });
    console.log(`  ${char}/${axis}: ${best.r.label}  scan z=${best.z.toFixed(1)}  confirm ${(delta * 100).toFixed(1)}pt ±${(1.96 * se * 100).toFixed(1)} -> ${ok ? '採用' : '不採用'}`);
    return ok ? { gain: delta, cand: best.r.cand } : null;
}

function main() {
    if (!fs.existsSync(tunedFile)) save({});
    let stepNo = 0;
    for (let round = 0; round < rounds; round++) {
        let maxGain = 0, accepted = 0;
        console.log(`# round ${round + 1}/${rounds}`);
        for (const char of chars) {
            for (const axis of axes) {
                if (Date.now() - started > budgetMs) { console.log('時間切れ。再実行で続きから（--cache を付けていれば測定済みは再利用）'); return; }
                const res = step(char, axis, round, stepNo++);
                if (!res || dry) continue;
                const t = load();
                t[char] = { ...(t[char] || {}), ...res.cand };
                save(t);
                accepted++; maxGain = Math.max(maxGain, res.gain);
            }
        }
        console.log(`round ${round + 1}: 採用 ${accepted} 件 / 最大改善 ${(maxGain * 100).toFixed(1)}pt`);
        log({ round, summary: true, accepted, exploitability: +maxGain.toFixed(4) });
        if (accepted === 0) { console.log('採用ゼロ = この探索空間では収束（近似均衡）'); return; }
    }
}
main();
