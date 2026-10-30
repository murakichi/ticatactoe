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
 *   node sim/probe-top.js --target X --scan audit --games 60 --opp you,giant              # デッキの各札を1枚ずつ使用禁止(ban)・各ギアを1つずつ外した寄与。結果が基準と完全一致=「差なし」（未使用の疑い。probe-usage.js で確認）
 *   node sim/probe-top.js --target X --scan deck --swap 3 --cat ice --neighbors 40        # 3枚同時に入れ替え（シナジー探索）。--cat で入れる札のカテゴリを限る
 *

 * 共通: --envDeck pick / --oppGears pick（相手が本番どおり主案と別案から選ぶ。完了判定の2条件目）, --oppGears recommended|none|random|lastStand（lastStand=相手全員が土壇場の防壁を1枠目に装備。相手のギア。既定は推奨。人間がギアなし/好きに選ぶ場合の頑健性確認用）, --size N（盤面。既定 4）, --envDeck varied（頑健性確認: 相手のデッキを推奨から3枚ランダムに入れ替える。本番のAIデッキはこう入れ替えないので、環境の基準ではなくストレステスト）, --workers N（既定=コア数）,
 *       --opp a,b,c（相手を絞る）, --json（人が読む要約を出さず JSON のみ）
 * 出力の `field` が環境勝率（対象の対キャラ別勝率の単純平均）。`se` は標準誤差の概算。
 * 判定に使う主指標は `strong`（対強豪平均）: 弱いキャラを大勝するだけで `field` が上がるのを避けるため、強豪(環境の平均勝率の上位半分、対象自身は除く)だけとの勝率の平均。
 *   強豪の集合は `--rank --write-strong` が .tune-cache/strong.json に書き、`--target`/`--scan` はそれを固定して使う（候補の設定で集合が動いて指標をごまかせないように）。
 *   `--strong a,b,c` で明示指定もできる。集合が無いときは全相手（= field）になり、警告を出す。
 *   `--rank` は対強豪平均で並べ、最悪対面・有意な不利/有利対面数・均衡の選択確率（sim/live.js の analyze）も出す。
 */
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const engine = require('./engine');
const gearMod = require('./shared/gear');
const deckMod = require('./shared/deck');
const live = require('./live');

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
// 探索から省く候補（autotune.js が記憶から渡す）。--excludeKnobs k=v,.. / --excludeCards 5,7 / --keepCards 3,4（入れ替えで抜かない） / --skipGears slot:gear,..
const setOf = (key, num) => new Set((args[key] || '').split(',').filter(Boolean).map((x) => (num ? parseInt(x, 10) : x)));
const exKnobs = setOf('excludeKnobs'), exCards = setOf('excludeCards', true), keepCards = setOf('keepCards', true), skipGears = setOf('skipGears');
// --envFile <json>: { <char>: { deck, gears, flags } }。autotune.js が育てた設定を環境(全キャラ)の既定として使う。無いキャラ/項目は推奨のまま
const ENV = args.envFile ? JSON.parse(require('fs').readFileSync(args.envFile, 'utf8')) : {};

// ---- AIノブ: 本番 AIPlayer.ts のトップレベル数値定数（sim/shared/AIPlayer.js に生成される）を実行時に差し替える ----
// 差し替えた定数でAIモジュールを読み直した「パッチ済みドライバ」を席ごとに使う（定数はモジュール単位なので席ごとに別インスタンス）。
const AI_SRC = path.join(__dirname, 'shared', 'AIPlayer.js');
const KNOB_RE = (name) => new RegExp(`^((?:const |exports\\.)${name} = )(-?\\d+(?:\\.\\d+)?)(;)`, 'm');
/** 探索対象になる定数 { NAME: 値 } */
function readKnobs() {
    const src = require('fs').readFileSync(AI_SRC, 'utf8');
    const out = {};
    for (const m of src.matchAll(/^(?:const |exports\.)([A-Z][A-Z0-9_]*) = (-?\d+(?:\.\d+)?);/gm)) out[m[1]] = Number(m[2]);
    delete out.SKILL_POOL_SIZE; // AIの挙動ではなくスキル総数
    return out;
}
const driverCache = new Map();
function driverFor(knobs, base) {
    const keys = Object.keys(knobs || {});
    if (!keys.length) return base;
    const key = JSON.stringify(Object.entries(knobs).sort());
    if (driverCache.has(key)) return driverCache.get(key);
    const Module = require('module');
    const targets = ['aiDriver.js', 'shared/AIPlayer.js', 'shared/aiTurn.js'].map((f) => path.join(__dirname, f));
    const saved = targets.map((t) => [t, require.cache[t]]);
    targets.forEach((t) => { delete require.cache[t]; });
    const orig = Module.prototype._compile;
    Module.prototype._compile = function (content, filename) {
        if (filename === AI_SRC) {
            for (const [name, v] of Object.entries(knobs)) {
                if (!KNOB_RE(name).test(content)) throw new Error('AIノブが見つからない: ' + name);
                content = content.replace(KNOB_RE(name), `$1${v}$3`);
            }
        }
        return orig.call(this, content, filename);
    };
    let d;
    try { d = require(path.join(__dirname, 'aiDriver.js')); } finally {
        Module.prototype._compile = orig;
        targets.forEach((t) => { delete require.cache[t]; });
        for (const [t, m] of saved) if (m) require.cache[t] = m;
    }
    driverCache.set(key, d);
    return d;
}

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

/**
 * 環境のキャラ c の設定。envDeck: 'varied'=推奨から3枚ランダムに入れ替え(ストレステスト) / 'pick'=本番どおり主案と別案から選ぶだけ(入れ替えなし) / 省略=主案。
 * oppGears: 'pick'=本番どおり主案と別案から選ぶ。対象(候補側)には pick を掛けない(測定対象は主案/指定の設定)
 */
function envCfg(c, mods, rng, envDeck, oppGears) {
    const varied = envDeck === 'varied';
    const gears = oppGears === 'pick' ? gearMod.pickRecommendedGears(c, rng) : oppGears === 'none' ? [] : oppGears === 'random' ? gearMod.randomGears(gearMod.gearSlotsFor(c), rng) : oppGears === 'lastStand' ? ['lastStand', ...gearMod.recommendedGears(c).filter((g) => g !== 'lastStand').slice(0, gearMod.gearSlotsFor(c) - 1)] : gearMod.recommendedGears(c);
    // ENV(autotune の育てた設定)があれば推奨より優先。ギアなし/ランダム/防壁固定など「相手設定を揺らす」指定のときだけギアを上書きしない
    const t = ENV[c] || {};
    const useTunedGears = t.gears && !['none', 'random', 'lastStand'].includes(oppGears);
    const deck = varied ? deckMod.variedAIDeck(c, rng) : t.deck ? t.deck.slice() : envDeck === 'pick' ? deckMod.pickRecommendedDeck(c, rng) : deckMod.recommendedDeck(c);
    return { deck, gears: useTunedGears ? t.gears.slice() : gears, flags: {}, knobs: { ...(t.knobs || {}) }, mod: mods.base };
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
    const base = require(path.resolve(__dirname, 'aiDriver.js'));
    const mods = { base, A: job.modA ? require(path.resolve(__dirname, job.modA)) : base };
    const out = [];
    for (const t of job.tasks) {
        // t = { a, b, aCand (a に候補設定を与えるか), bCand, variant, cand: {...} }
        const cand = job.variants[t.variant];
        const mk = (c, isCand) => (rng) => {
            // 対象（候補側）は相手設定の揺らぎ（ギアなし/ランダム）を受けず、推奨ギア（候補が指定すればそれ）を使う
            const e = envCfg(c, mods, rng, isCand && job.envDeck === 'pick' ? undefined : job.envDeck, isCand ? 'recommended' : job.oppGears);
            // --knobsGlobal: 本番では定数が全キャラ共通なので、候補のノブを相手の席にも掛けて測る
            if (!isCand) { if (job.knobsGlobal && cand.knobs) e.knobs = { ...e.knobs, ...cand.knobs }; e.mod = driverFor(e.knobs, mods.base); return e; }
            if (cand.deck) e.deck = cand.deck;
            if (cand.gears) e.gears = cand.gears;
            if (cand.flags) e.flags = { ...e.flags, ...cand.flags };
            if (cand.knobs) e.knobs = { ...e.knobs, ...cand.knobs };
            e.mod = job.modA ? mods.A : driverFor(e.knobs, mods.base);
            return e;
        };
        const tally = pairTally(t.a, t.b, mk(t.a, t.aCand), mk(t.b, t.bCand), mods, job.from, job.to, job.seed);
        out.push({ variant: t.variant, a: t.a, b: t.b, ...tally });
    }
    process.stdout.write('OUT ' + JSON.stringify(out) + '\n');
    process.exit(0);
}

// ---- 親 ----
/**
 * --cache <dir> 指定時はタスクを小分け(--chunk、既定12)にして結果をファイルに保存する。
 * コンテナ再起動などで途切れても、同じコマンドを打ち直せば済んだ分は読み込んで再開する。
 * キーは (タスク・変種・games・seed・size・オプション・sim/*.js の中身) のハッシュなので、コードが変われば自動で無効になる。
 */
function simHash() {
    const h = require('crypto').createHash('sha1');
    const dir = __dirname;
    for (const f of require('fs').readdirSync(dir).filter((x) => x.endsWith('.js')).sort()) h.update(f + require('fs').readFileSync(require('path').join(dir, f)));
    if (args.modA) h.update(require('fs').readFileSync(args.modA));
    if (args.envFile) h.update(JSON.stringify(ENV));
    return h.digest('hex');
}
async function runWorkers(tasks, variants, workers) {
    if (!args.cache) return runWorkersRaw(tasks, variants, workers);
    const fs = require('fs'), path = require('path'), crypto = require('crypto');
    fs.mkdirSync(args.cache, { recursive: true });
    const chunk = parseInt(args.chunk || '12', 10);
    const base = simHash();
    const all = [];
    for (let i = 0; i < tasks.length; i += chunk) {
        const part = tasks.slice(i, i + chunk);
        const key = crypto.createHash('sha1').update(JSON.stringify({ base, part, variants, games, seed: seed0, size, envDeck: args.envDeck, oppGears: args.oppGears, knobsGlobal: args.knobsGlobal })).digest('hex');
        const file = path.join(args.cache, key + '.json');
        let res;
        if (fs.existsSync(file)) { res = JSON.parse(fs.readFileSync(file, 'utf8')); console.error(`[cache] hit ${i / chunk + 1}/${Math.ceil(tasks.length / chunk)}`); }
        else { res = await runWorkersRaw(part, variants, workers); fs.writeFileSync(file + '.tmp', JSON.stringify(res)); fs.renameSync(file + '.tmp', file); console.error(`[cache] saved ${i / chunk + 1}/${Math.ceil(tasks.length / chunk)}`); }
        all.push(...res);
    }
    return all;
}
function runWorkersRaw(tasks, variants, workers) {
    // 試合数を worker 数で分割（各タスクの g 範囲を分ける。席交互が崩れないよう分割幅は偶数）
    const per = Math.ceil(games / workers / 2) * 2;
    const jobs = [];
    for (let from = 0; from < games; from += per) jobs.push({ from, to: Math.min(games, from + per) });
    return Promise.all(jobs.map((j) => new Promise((resolve, reject) => {
        const job = { ...j, seed: seed0, tasks, variants, modA: args.modA, envDeck: args.envDeck, oppGears: args.oppGears, knobsGlobal: args.knobsGlobal };
        const p = spawn(process.execPath, [__filename, '--worker', ...(size ? ['--size', String(size)] : []), ...(args.envFile ? ['--envFile', args.envFile] : [])], { env: { ...process.env, TOP_JOB: JSON.stringify(job) }, stdio: ['ignore', 'pipe', 'inherit'] });
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
function summarize(results, variant, target, opps, strongSet) {
    const per = {};
    let sum = 0, varSum = 0, sSum = 0, sVar = 0, sN = 0;
    for (const o of opps) {
        const r = results.find((x) => x.variant === variant && x.a === target && x.b === o);
        const n = r.w + r.l, p = rate(r);
        per[o] = +p.toFixed(3);
        sum += p;
        varSum += n ? (p * (1 - p)) / n : 0;
        if (!strongSet || strongSet.includes(o)) { sSum += p; sVar += n ? (p * (1 - p)) / n : 0; sN++; }
    }
    const tally = results.filter((x) => x.variant === variant && x.a === target).map((x) => `${x.b}:${x.w}-${x.l}-${x.d}`).sort().join(' ');
    return {
        per, field: +(sum / opps.length).toFixed(4), se: +(Math.sqrt(varSum) / opps.length).toFixed(4), tally,
        // 対強豪平均（主指標）。集合が無ければ全相手と同じ
        strong: strongSet && sN ? +(sSum / sN).toFixed(4) : null, strongSe: strongSet && sN ? +(Math.sqrt(sVar) / sN).toFixed(4) : null, strongN: strongSet ? sN : 0,
    };
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
    if (args.set) cand.knobs = parseFlags(args.set); // --set NAME=値,.. : AIPlayer.ts の数値定数を差し替える

    const STRONG_FILE = path.resolve(__dirname, '..', '.tune-cache', 'strong.json');
    const fs = require('fs');
    let strongSet = null;
    if (args.strong) strongSet = args.strong.split(',');
    else if (!args.rank && fs.existsSync(STRONG_FILE)) strongSet = JSON.parse(fs.readFileSync(STRONG_FILE, 'utf8')).strong;
    if (!args.rank && !strongSet) console.error('警告: 強豪リストが無いので strong は全相手の平均(field)と同じです。先に `--rank --write-strong` で集合を決めてください（--strong a,b,c でも指定可）。');

    if (args.rank) {
        if (!target && ((args.oppGears && args.oppGears !== 'recommended') || args.envDeck)) {
            console.error('警告: --rank に --target が無いため、--oppGears/--envDeck が全員（各キャラ自身も）に掛かります。特定キャラの頑健性確認は --target <char> を付けてください。');
        }
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
        });
        // 対強豪平均・最悪対面・不利対面数・均衡（sim/live.js analyze。--target 付きでも候補設定を反映した対面表で出す）
        const pairs = [];
        for (let i = 0; i < CHARS.length; i++) for (let j = i + 1; j < CHARS.length; j++) {
            const direct = res.find((x) => x.a === CHARS[i] && x.b === CHARS[j]);
            pairs.push({ a: CHARS[i], b: CHARS[j], w: direct ? direct.w : 0, l: direct ? direct.l : 0 });
        }
        const an = live.analyze(live.statsFromPairs(CHARS, pairs));
        const byId = Object.fromEntries(an.rows.map((r) => [r.id, r]));
        for (const r of table) {
            const a = byId[r.char];
            r.strong = a.strongAvg == null ? null : +a.strongAvg.toFixed(4);
            r.worst = a.worst ? { char: a.worst.id, rate: +a.worst.rate.toFixed(3) } : null;
            r.unfavorable = a.unfavorable; r.favorable = a.favorable; r.eq = +a.eq.toFixed(4);
        }
        table.sort((x, y) => (y.strong ?? 0) - (x.strong ?? 0));
        if (args['write-strong']) {
            fs.mkdirSync(path.dirname(STRONG_FILE), { recursive: true });
            fs.writeFileSync(STRONG_FILE, JSON.stringify({ strong: an.strong, games, seed: seed0, size: size || 4, at: new Date().toISOString() }, null, 2));
            console.error(`強豪リストを保存: ${an.strong.join(',')} -> ${path.relative(process.cwd(), STRONG_FILE)}`);
        }
        const out = { mode: 'rank', games, seed: seed0, size: size || 4, target: target || null, candidate: target ? cand : null, strongSet: an.strong, exploit: +an.exploit.toFixed(4), table: table.map((r, i) => ({ rank: i + 1, ...r })) };
        if (args.json) { console.log(JSON.stringify(out)); return; }
        console.log(`環境順位（各ペア${games}試合・席交互・引分除く${target ? `・${target} に候補設定を反映` : ''}）`);
        console.log(`順位は対強豪平均（強豪=${an.strong.join(',')}）。field=対全キャラ平均（参考）。不利/有利=有意に負け越す/勝ち越す対面の数。均衡=相手が最適に選ぶ場合の選択確率`);
        console.log(`    ${'キャラ'.padEnd(14)} ${'対強豪'.padEnd(7)} ${'field'.padEnd(7)} ${'最悪対面'.padEnd(18)} ${'不利/有利'.padEnd(8)} 均衡`);
        table.forEach((r, i) => console.log(`${String(i + 1).padStart(2)}. ${r.char.padEnd(14)} ${((r.strong ?? 0) * 100).toFixed(1).padStart(5)}% ${((r.field) * 100).toFixed(1).padStart(5)}% ${(r.worst ? `${(r.worst.rate * 100).toFixed(0)}%(${r.worst.char.slice(0, 9)})` : 'n/a').padEnd(18)} ${`${r.unfavorable}/${r.favorable}`.padEnd(8)} ${(r.eq * 100).toFixed(1)}%${r.char === target ? '  ← target' : ''}`));
        console.log('GAP(1位 - 2位, 対強豪) ' + (((table[0].strong ?? 0) - (table[1].strong ?? 0)) * 100).toFixed(1) + 'pt   (field の GAP ' + (([...table].sort((x, y) => y.field - x.field).map((r) => r.field)).slice(0, 2).reduce((a, b) => a - b) * 100).toFixed(1) + 'pt)');
        console.log('RESULT ' + JSON.stringify(out));
        return;
    }

    if (!target || !CHARS.includes(target)) throw new Error('--target <' + CHARS.join('|') + '> が必要');

    // 変種の一覧
    let variants = [cand];
    let labels = ['candidate'];
    if (args.scan === 'gears') {
        const base = cand.gears || (ENV[target] && ENV[target].gears) || gearMod.recommendedGears(target);
        variants = []; labels = [];
        variants.push({ ...cand, gears: base }); labels.push('base ' + base.join(','));
        for (let slot = 0; slot < base.length; slot++) {
            for (const g of gearMod.GEAR_IDS) {
                if (base.includes(g) || skipGears.has(`${slot}:${g}`)) continue;
                const gs = base.slice(); gs[slot] = g;
                variants.push({ ...cand, gears: gs }); labels.push(`slot${slot}→${g}  [${gs.join(',')}]`);
            }
        }
    } else if (args.scan === 'deck') {
        const base = cand.deck || (ENV[target] && ENV[target].deck) || deckMod.recommendedDeck(target);
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
            for (let j = 0; j < k; j++) {
                const outable = keep.filter((c) => !keepCards.has(c));
                if (!outable.length) break;
                const c = outable[Math.floor(rng() * outable.length)];
                keep.splice(keep.indexOf(c), 1); outs.push(c);
            }
            if (outs.length < k) break;
            const pool = Array.from({ length: deckMod.CATALOG_SIZE }, (_, i) => i).filter((i) => !base.includes(i) && !exCards.has(i) && (!cat || deckMod.SKILL_CATALOG[i].category === cat));
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

    if (args.scan === 'knobs' || args.scan === 'flags') {
        // AIPlayer.ts の数値定数を1つずつ動かす。0 は 1 へ、小さい整数(1〜10)は ±1 と半分/2倍、大きい値は半分/2倍。--knobs a,b で絞る、--neighbors N で N 個をランダム抽出
        const defaults = readKnobs();
        const cur = { ...((ENV[target] && ENV[target].knobs) || {}), ...(cand.knobs || {}) };
        const only = args.knobs ? args.knobs.split(',') : null;
        const rng = engine.makeRng(seed0 * 977 + 11);
        const cands = [];
        for (const [k, dv] of Object.entries(defaults)) {
            if (only && !only.includes(k)) continue;
            const v = k in cur ? cur[k] : dv;
            const alts = v === 0 ? [1] : [...new Set([...(Number.isInteger(v) && v <= 10 ? [v - 1, v + 1] : []), Math.round(v / 2), Math.round(v * 2)])].filter((x) => x !== v && x >= 0);
            if (exKnobs.has(`${k}=*`)) continue; // ノブ単位の除外（autotune の無効ノブ記憶）
            for (const a of alts) if (!exKnobs.has(`${k}=${a}`)) cands.push([k, a]);
        }
        for (let i = cands.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [cands[i], cands[j]] = [cands[j], cands[i]]; }
        const n = parseInt(args.neighbors || '40', 10);
        variants = [{ ...cand }]; labels = ['base'];
        for (const [k, a] of cands.slice(0, n)) { variants.push({ ...cand, knobs: { ...cur, [k]: a } }); labels.push(`${k}=${a}`); }
    }

    if (args.scan === 'audit') {
        // 札の寄与: ban=idx で同じ乱数のまま使用だけ禁止する。AIが一度も使っていない札なら全試合の結果が基準と完全に一致する
        const deck = cand.deck || deckMod.recommendedDeck(target);
        const gears = cand.gears || gearMod.recommendedGears(target);
        variants = [{ ...cand, deck, gears }]; labels = ['base'];
        for (const idx of deck) {
            variants.push({ ...cand, deck, gears, flags: { ...(cand.flags || {}), ban: idx } });
            labels.push(`card ${idx}(${deckMod.SKILL_CATALOG[idx].name}) を禁止`);
        }
        for (const g of gears) {
            variants.push({ ...cand, deck, gears: gears.filter((x) => x !== g) });
            labels.push(`gear ${g} を外す`);
        }
    }

    const tasks = [];
    variants.forEach((_, v) => { for (const o of opps) tasks.push({ a: target, b: o, variant: v, aCand: true, bCand: false }); });
    const res = await runWorkers(tasks, variants, workers);
    const rows = variants.map((_, v) => ({ label: labels[v], cand: variants[v], ...summarize(res, v, target, opps, strongSet) }));
    const out = { mode: args.scan ? 'scan-' + args.scan : 'single', target, games, seed: seed0, size: size || 4, opponents: opps, strongSet, rows };
    if (args.json) { console.log(JSON.stringify(out)); return; }
    // 主指標: 対強豪平均（強豪の集合が無い・--opp で強豪が残らないときは field）
    const M = (r) => (r.strong != null ? r.strong : r.field);
    const SE = (r) => (r.strong != null ? r.strongSe : r.se);
    const metricName = rows[0].strong != null ? `対強豪(${rows[0].strongN}体)` : 'field';
    if (args.scan === 'audit') {
        const base = rows[0];
        console.log(`base ${(M(base) * 100).toFixed(1)}% [${metricName}]（寄与 = base − 禁止/除去後。同一シードなので差は札/ギアの寄与。「差なし」= 全試合の結果が基準と完全一致。AIが使っていないか、banが効かない経路で使っているかのどちらかなので、probe-usage.js で使用回数を確認すること）`);
        rows.slice(1).forEach((r) => console.log(`${r.tally === base.tally ? '差なし  ' : `${((M(base) - M(r)) * 100 >= 0 ? '+' : '')}${((M(base) - M(r)) * 100).toFixed(1)}pt`.padEnd(8)} ${r.label}`));
        console.log('RESULT ' + JSON.stringify(out));
        return;
    }
    const sorted = rows.map((r, i) => ({ ...r, i })).sort((x, y) => M(y) - M(x));
    console.log(`指標: ${metricName}（field=対全キャラ平均は参考で併記）`);
    for (const r of args.scan ? sorted : rows) {
        console.log(`${(M(r) * 100).toFixed(1)}% ±${(1.96 * SE(r) * 100).toFixed(1)}  (field ${(r.field * 100).toFixed(1)}%)  ${r.label}`);
        if (!args.scan) console.log('  対キャラ別: ' + Object.entries(r.per).map(([k, v]) => `${k} ${(v * 100).toFixed(0)}%`).join(' / '));
    }
    console.log('RESULT ' + JSON.stringify(out));
}

main().catch((e) => { console.error(e.message); process.exit(1); });
