#!/usr/bin/env node
// @ts-check
'use strict';
/*
 * 生成AIなしの機械的な自己改善ループ（ベストレスポンス反復）。
 *
 * 環境 = sim/tuned.json（キャラ別の { deck, gears, knobs }）。無いキャラ・項目は推奨のまま。
 * 各キャラについて「他キャラを環境の設定に固定したまま、自分のギア → デッキ → AIノブを1軸ずつ探索」し、
 * 統計ゲートを通った最良の候補だけ tuned.json に採用する。全キャラが1周して採用ゼロになれば、
 * ノブ・デッキ・ギアの空間では誰も一方的に得できない状態（近似ナッシュ均衡）。
 *
 *   node sim/autotune.js --chars giant,pyromancer --axes gears,deck,knobs --rounds 3 --games 60
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
const axes = (args.axes || 'gears,deck,knobs').split(',').map((a) => (a === 'flags' ? 'knobs' : a)); // 旧名 flags は knobs の別名
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
const memFile = path.resolve(args.memory || path.join(__dirname, 'autotune-memory.json'));
const notesFile = path.resolve(args.notes || path.join(__dirname, '..', 'docs', 'tune', 'autotune.md'));
const PILOT_GAMES = parseInt(args['pilot-games'] || '10', 10);
const BAD_Z = -2;          // 札/ギア/ノブの平均 z がこれ以下(=明らかに悪い)なら以後その候補は探索から外す
const BAD_MIN_N = 3;       // 外すのに必要な観測数（1回の悪い結果で外さない）
const BAD_TTL_ROUNDS = 6;  // 悪い候補を外しておく周回数（周りの環境が変わるので期限付き。コードが変われば即失効）

const load = () => (fs.existsSync(tunedFile) ? JSON.parse(fs.readFileSync(tunedFile, 'utf8')) : {});
const save = (t) => { fs.writeFileSync(tunedFile + '.tmp', JSON.stringify(t, null, 2) + '\n'); fs.renameSync(tunedFile + '.tmp', tunedFile); };
const log = (o) => fs.appendFileSync(logFile, JSON.stringify({ at: new Date().toISOString(), ...o }) + '\n');

// ---- 記憶: 「効かないもの」を覚えて次回から探索に入れない ----
//  inert[char]      : AIノブ k=v のうち、基準と全試合の結果が完全一致したもの（そのキャラのAIがそのノブを使わない）。コード(ai.js 等)が変わると失効
//  cards[char][idx] : デッキ札ごとの観測。入れた時/抜いた時の z の累計。入れて明らかに悪い札は挿入候補から、抜いて明らかに悪い札は入れ替え対象から外す
//  gears[char]['slot:gear'] / flags[char]['k=v'] : 1回の観測ごとの z。BAD_MIN_N 回以上で平均が BAD_Z 以下なら外す
//  自分の設定(tuned[char])が変わったらそのキャラの bad 系は破棄する（相互作用が変わるため）
function codeHash() {
    const h = require('crypto').createHash('sha1');
    // 本番TSから生成した sim/shared/*.js（AI・ギア・デッキ本体）も対象。推奨表は apply-tuned.js が書き換えるので除く
    const files = [...fs.readdirSync(__dirname).filter((x) => x.endsWith('.js') && !/autotune|apply-tuned|probe-|test|cli/.test(x)).map((x) => path.join(__dirname, x)),
        ...(fs.existsSync(path.join(__dirname, 'shared')) ? fs.readdirSync(path.join(__dirname, 'shared')).filter((x) => x.endsWith('.js')).map((x) => path.join(__dirname, 'shared', x)) : [])].sort();
    for (const f of files) h.update(path.relative(__dirname, f) + fs.readFileSync(f, 'utf8').replace(/(?:const|exports\.)\s*RECOMMENDED_(DECKS|GEARS) = \{[\s\S]*?\n\};/, ''));
    return h.digest('hex').slice(0, 12);
}
const HASH = codeHash();
function loadMem() {
    const m = fs.existsSync(memFile) ? JSON.parse(fs.readFileSync(memFile, 'utf8')) : {};
    if (m.codeHash !== HASH) { // コードが変わったら観測は全て無効
        if (m.codeHash) console.log(`コード変更を検知(${m.codeHash} -> ${HASH})。記憶を破棄します`);
        return { codeHash: HASH, inert: {}, cards: {}, gears: {}, flags: {} };
    }
    return m;
}
const mem = loadMem();
const saveMem = () => { fs.writeFileSync(memFile + '.tmp', JSON.stringify(mem, null, 1) + '\n'); fs.renameSync(memFile + '.tmp', memFile); writeNotes(); };
const slot = (o, ...ks) => ks.reduce((a, k) => (a[k] = a[k] || {}), o);
const isBad = (e, round) => e && e.n >= BAD_MIN_N && e.sum / e.n <= BAD_Z && e.max < 0 && round - e.last < BAD_TTL_ROUNDS;
function observe(o, key, z, round) { const e = o[key] || (o[key] = { n: 0, sum: 0, max: -Infinity, last: round }); e.n++; e.sum += z; e.max = Math.max(e.max, z); e.last = round; }
function forget(char) { for (const k of ['cards', 'gears', 'flags']) delete mem[k][char]; }

/** 人が読むメモ。docs/tune/autotune.md に毎回書き出す */
function writeNotes() {
    const L = ['# autotune 記憶(自動生成)', '', `sim/autotune.js が「効かない/明らかに悪い」と判断して探索から外したもの。コード(sim/*.js)が変わると失効する。コード版: \`${HASH}\``, '',
        '- **無効ノブ**: そのキャラのAIが使わず、動かしても全試合の結果が基準と完全一致したノブ（`k=*` は全ての値が一致）（pilot / 本探索で判定）',
        `- **悪い候補**: 観測${BAD_MIN_N}回以上で平均 z ≤ ${BAD_Z} かつ一度も改善しなかったもの（${BAD_TTL_ROUNDS}周回で失効）`, ''];
    const chars_ = new Set([...Object.keys(mem.inert), ...Object.keys(mem.cards), ...Object.keys(mem.gears), ...Object.keys(mem.flags)]);
    for (const c of [...chars_].sort()) {
        L.push(`## ${c}`);
        if ((mem.inert[c] || []).length) L.push(`- 無効ノブ(${mem.inert[c].length}): ${mem.inert[c].join(', ')}`);
        const bad = (o) => Object.entries(o || {}).filter(([, e]) => e.n >= BAD_MIN_N && e.sum / e.n <= BAD_Z && e.max < 0).map(([k, e]) => `${k}(z̄${(e.sum / e.n).toFixed(1)}, n=${e.n})`);
        const bi = Object.entries(mem.cards[c] || {}).filter(([, e]) => e.ins && e.ins.n >= BAD_MIN_N && e.ins.sum / e.ins.n <= BAD_Z && e.ins.max < 0).map(([k, e]) => `${k}(z̄${(e.ins.sum / e.ins.n).toFixed(1)}, n=${e.ins.n})`);
        const bo = Object.entries(mem.cards[c] || {}).filter(([, e]) => e.out && e.out.n >= BAD_MIN_N && e.out.sum / e.out.n <= BAD_Z && e.out.max < 0).map(([k, e]) => `${k}(z̄${(e.out.sum / e.out.n).toFixed(1)}, n=${e.out.n})`);
        if (bi.length) L.push(`- 入れると悪い札: ${bi.join(', ')}`);
        if (bo.length) L.push(`- 抜くと悪い札(必須): ${bo.join(', ')}`);
        if (bad(mem.gears[c]).length) L.push(`- 悪いギア差し替え(slot:gear): ${bad(mem.gears[c]).join(', ')}`);
        if (bad(mem.flags[c]).length) L.push(`- 悪いノブ値: ${bad(mem.flags[c]).join(', ')}`);
        L.push('');
    }
    fs.mkdirSync(path.dirname(notesFile), { recursive: true });
    fs.writeFileSync(notesFile, L.join('\n'));
}

// 判定の主指標は tune-top と同じ「対強豪平均(strong)」。強豪リストは .tune-cache/strong.json に固定（無ければ最初に作る）。無ければ field にフォールバック
const STRONG_FILE = path.resolve(__dirname, '..', '.tune-cache', 'strong.json');
const hasStrong = () => fs.existsSync(STRONG_FILE);
const M = (r) => (hasStrong() && r.strong != null ? r.strong : r.field);
const SE = (r) => (hasStrong() && r.strongSe != null ? r.strongSe : r.se);
const metricName = () => (hasStrong() ? 'strong' : 'field');

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
    if (cand.knobs && Object.keys(cand.knobs).length) o.push('--set', flagStr(cand.knobs), '--knobsGlobal');
    return o;
}

const tunedOf = (char) => load()[char] || {};
const curDeck = (char) => tunedOf(char).deck || require('./shared/deck').recommendedDeck(char);
const curGears = (char) => tunedOf(char).gears || require('./shared/gear').recommendedGears(char);

/** そのキャラのAIが使わないノブを pilot（少数試合）で洗い出す。基準と全試合の結果が完全一致 = 無効。コードが変わるまで再測定しない */
/** 基準と全試合一致した行をノブ単位にまとめる。そのノブの全ての値が一致なら `k=*`（値が増えても再測定しない）、一部だけなら `k=v` */
function inertLabels(base, rest) {
    const byKnob = {};
    for (const x of rest) { const k = x.label.split('=')[0]; (byKnob[k] = byKnob[k] || []).push(x); }
    const out = [];
    for (const [k, xs] of Object.entries(byKnob)) {
        const same = xs.filter((x) => x.tally === base.tally);
        if (same.length === xs.length) out.push(`${k}=*`); else out.push(...same.map((x) => x.label));
    }
    return out;
}
function pilotInert(char, round) {
    if (mem.inert[char]) return;
    const r = probe({ games: PILOT_GAMES, seed: 7777, argv: ['--target', char, '--scan', 'knobs', '--neighbors', '9999', '--excludeKnobs', (mem.inertDone || []).join(',')] });
    const [base, ...rest] = r.rows;
    mem.inert[char] = inertLabels(base, rest);
    console.log(`  ${char}: pilot(${PILOT_GAMES}試合) 無効ノブ ${mem.inert[char].length}/${rest.length} を除外`);
    saveMem();
}

/** 探索結果を記憶に反映する（無効ノブ・悪い候補の学習） */
function learn(char, axis, base, rest, z, round) {
    if (axis === 'knobs') {
        // 本探索で基準と完全一致 = 無効（pilot で拾えなかった稀に効くノブも、ここで十分な試合数で判定できる）
        const inert = new Set(mem.inert[char] || []);
        for (const r of rest) { if (r.tally === base.tally) inert.add(r.label); else observe(slot(mem.flags, char), r.label, z(r), round); }
        mem.inert[char] = [...inert];
    } else if (axis === 'gears') {
        const bg = curGears(char);
        for (const r of rest) { const i = r.cand.gears.findIndex((g, j) => g !== bg[j]); observe(slot(mem.gears, char), `${i}:${r.cand.gears[i]}`, z(r), round); }
    } else {
        const bd = curDeck(char);
        for (const r of rest) {
            const zz = z(r);
            for (const c of r.cand.deck.filter((x) => !bd.includes(x))) observe(slot(mem.cards, char, c), 'ins', zz, round);
            for (const c of bd.filter((x) => !r.cand.deck.includes(x))) observe(slot(mem.cards, char, c), 'out', zz, round);
        }
    }
    saveMem();
}

function step(char, axis, round, stepNo) {
    const seed = seedBase + round * 101 + stepNo;
    const ex = [];
    if (axis === 'knobs') {
        pilotInert(char, round);
        const dead = new Set([...(mem.inert[char] || [])]);
        for (const [k, e] of Object.entries(slot(mem.flags, char))) if (isBad(e, round)) dead.add(k);
        if (dead.size) ex.push('--excludeKnobs', [...dead].join(','));
    } else if (axis === 'deck') {
        const cs = slot(mem.cards, char);
        const noIns = Object.entries(cs).filter(([, e]) => isBad(e.ins, round)).map(([k]) => k);
        const keep = Object.entries(cs).filter(([, e]) => isBad(e.out, round)).map(([k]) => k);
        if (noIns.length) ex.push('--excludeCards', noIns.join(','));
        if (keep.length) ex.push('--keepCards', keep.join(','));
    } else if (axis === 'gears') {
        const dead = Object.entries(slot(mem.gears, char)).filter(([, e]) => isBad(e, round)).map(([k]) => k);
        if (dead.length) ex.push('--skipGears', dead.join(','));
    }
    if (ex.length) console.log(`  ${char}/${axis}: 記憶により除外 ${ex[1].split(',').length} 件`);
    const scanArgs = { gears: ['--scan', 'gears'], deck: ['--scan', 'deck', '--neighbors', String(neighbors), '--swap', String(swap)], knobs: ['--scan', 'knobs', '--neighbors', String(neighbors)] }[axis];
    const scan = probe({ games, seed, argv: ['--target', char, ...scanArgs, ...ex] });
    const [base, ...rest] = scan.rows;
    const z = (r) => (M(r) - M(base)) / Math.sqrt(SE(r) ** 2 + SE(base) ** 2);
    learn(char, axis, base, rest, z, round);
    const best = rest.map((r) => ({ r, z: z(r) })).sort((a, b) => b.z - a.z)[0];
    const rec = { char, axis, round, seed, games, candidates: rest.length, metric: metricName(), base: M(base), best: best && { label: best.r.label, value: M(best.r), z: +best.z.toFixed(2) } };
    if (!best || best.z < zThreshold(rest.length)) { log({ ...rec, accepted: false, why: 'scan gate' }); return null; }

    // 再測定: 別シードで 基準 と 候補 を測る
    const cseed = seed + 5000;
    const c0 = probe({ games: confirmGames, seed: cseed, argv: ['--target', char] });
    const c1 = probe({ games: confirmGames, seed: cseed, argv: ['--target', char, ...candArgs(best.r.cand)] });
    const r0 = c0.rows[0], r1 = c1.rows[0];
    const delta = M(r1) - M(r0), se = Math.sqrt(SE(r0) ** 2 + SE(r1) ** 2);
    const diffs = Object.keys(r0.per).map((o) => [o, r1.per[o] - r0.per[o]]).sort((a, b) => a[1] - b[1]);
    // 強豪は環境の変化で入れ替わる（2026-10-30 ユーザー指示）。固定の強豪リストだけに最適化して「今の強豪にだけ効く」案を採らないよう、
    //  (1) 強豪リストは実行のたびに最新の順位表で作り直す  (2) 対強豪平均に加えて全相手平均(field)が悪化しないことを要求する
    //  (3) -15pt の悪化禁止は、その時点の強豪相手にだけ適用する（強豪以外の相手への悪化は許容）
    const strongList = hasStrong() ? JSON.parse(fs.readFileSync(STRONG_FILE, 'utf8')).strong : null;
    const gated = strongList ? diffs.filter(([o]) => strongList.includes(o)) : diffs;
    const worst = (gated[0] || diffs[0])[1], worstOpp = (gated[0] || diffs[0])[0];
    const fieldDelta = r1.field - r0.field;
    const passEffect = delta >= 0.015 && delta >= 1.96 * se && fieldDelta > -0.01;
    const ok = args.zmin ? delta > 0 : passEffect && worst > -0.15;
    // 効果は十分なのに強豪への大幅悪化(-15pt超)だけで落ちた候補は、人が判断できるよう印を付けて残す
    const blockedBy = !ok && passEffect && worst <= -0.15 ? { worstOpp, worst: +worst.toFixed(3), diffs: Object.fromEntries(diffs.map(([o, d]) => [o, +d.toFixed(3)])) } : undefined; // --zmin は配管の動作確認用（ゲートを緩める）
    log({ ...rec, confirm: { seed: cseed, games: confirmGames, base: M(r0), cand: M(r1), delta: +delta.toFixed(4), se: +se.toFixed(4), worst: +worst.toFixed(3), field: { base: r0.field, cand: r1.field }, worstAll: { opp: diffs[0][0], diff: +diffs[0][1].toFixed(3) } }, accepted: ok, blockedBy, cand: best.r.cand });
    console.log(`  ${char}/${axis}: ${best.r.label}  scan z=${best.z.toFixed(1)}  confirm ${(delta * 100).toFixed(1)}pt ±${(1.96 * se * 100).toFixed(1)} -> ${ok ? '採用' : '不採用'}${blockedBy ? `（${blockedBy.worstOpp} への ${(worst * 100).toFixed(0)}pt 悪化で保留。人の判断待ち）` : ''}`);
    return ok ? { gain: delta, cand: best.r.cand } : null;
}

function main() {
    if (!fs.existsSync(tunedFile)) save({});
    // 強豪リストは毎回作り直す（--keep-strong で固定）。順位表は --envFile で育てた設定を反映した環境で取る
    if (args['keep-strong'] !== 'true' || !hasStrong()) { console.log('強豪リストを最新の順位表で作成(--rank --write-strong)'); probe({ games: 60, seed: 1, argv: ['--rank', '--write-strong'] }); console.log('  強豪: ' + JSON.parse(fs.readFileSync(STRONG_FILE, 'utf8')).strong.join(',')); }
    // --inert-from <probe-top --scan flags --json の出力> --inert-char <char>: 既に測った pilot を記憶に取り込む（再測定を省く）
    if (args['inert-from'] && args['inert-char']) {
        const o = JSON.parse(fs.readFileSync(args['inert-from'], 'utf8'));
        mem.inert[args['inert-char']] = inertLabels(o.rows[0], o.rows.slice(1));
        saveMem();
        console.log(`pilot を取り込み: ${args['inert-char']} 無効 ${mem.inert[args['inert-char']].length} 件`);
    }
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
                forget(char); saveMem(); // 自分の設定が変わったので、そのキャラの「悪い候補」の記憶は作り直す（無効ノブは残す）
                accepted++; maxGain = Math.max(maxGain, res.gain);
            }
        }
        console.log(`round ${round + 1}: 採用 ${accepted} 件 / 最大改善 ${(maxGain * 100).toFixed(1)}pt`);
        log({ round, summary: true, accepted, exploitability: +maxGain.toFixed(4) });
        if (accepted === 0) { console.log('採用ゼロ = この探索空間では収束（近似均衡）'); return; }
    }
}
main();
