/* ブラウザ内の対戦シミュレーション用 Web Worker。
 * sim/ の CommonJS モジュール(public/sim/ にコピーされたもの)を同期XHRで読み、require を自前で用意して動かす。
 * メインスレッドとのやりとり:
 *   -> { cmd: 'start', players, size, mode, seed, fixedChars, skills(既定true), gears(既定true), conv: {window, eps, minGames} | null, maxGames }
 *   -> { cmd: 'stop' }
 *   <- { type: 'progress' | 'done', reason?, summary, matchups, drift, elapsed }
 */
'use strict';
const base = new URL('sim/', self.location.href).href;
const cache = {};
// name は require の引数。from は require したファイルのキー(sim/ からの相対パス、拡張子なし)。sim/shared/ のように入れ子でも解決できる
function load(name, from) {
    const parts = (from ? from.split('/').slice(0, -1) : []).concat(name.replace(/\.js$/, '').split('/'));
    const out = [];
    for (const p of parts) { if (p === '..') out.pop(); else if (p !== '.' && p !== '') out.push(p); }
    const key = out.join('/');
    if (cache[key]) return cache[key].exports;
    const xhr = new XMLHttpRequest();
    xhr.open('GET', base + key + '.js', false);
    xhr.send();
    if (xhr.status !== 200) throw new Error('failed to load ' + key + ' (' + xhr.status + ')');
    const module = { exports: {} };
    cache[key] = module;
    new Function('module', 'exports', 'require', 'process', xhr.responseText + '\n//# sourceURL=sim/' + key + '.js')(module, module.exports, (n) => load(n, key), { env: {} });
    return module.exports;
}

let running = false;
self.onmessage = (e) => {
    const m = e.data;
    if (m.cmd === 'stop') { running = false; return; }
    if (m.cmd !== 'start') return;
    try { start(m); } catch (err) { self.postMessage({ type: 'error', message: String(err && err.message || err) }); }
};

function start(o) {
    const engine = load('engine');
    const { runGame, pickChars } = load('run');
    const live = load('live');
    const stats = live.createStats(engine.CHARACTERS, o.players);
    const pickRng = engine.makeRng(o.seed * 2654435 + o.players);
    const t0 = Date.now();
    const window_ = o.conv ? o.conv.window : 10;
    let g = 0, lastPost = 0;
    running = true;

    const analysisOf = () => {
        const an = live.analyze(stats);
        return an ? { ...an, verdict: live.verdict(an) } : null;
    };
    const post = (type, reason) => self.postMessage({
        type, reason,
        summary: live.summarize(stats),
        matchups: live.matchups(stats),
        analysis: analysisOf(),
        drift: live.maxDrift(stats, window_),
        elapsed: (Date.now() - t0) / 1000,
    });

    // メッセージ(stop)を受け取れるよう、50msぶん回すごとにイベントループへ戻る
    const tick = () => {
        if (!running) return post('done', 'stopped');
        const end = Date.now() + 50;
        while (Date.now() < end && g < o.maxGames) {
            const chars = pickChars(o.players, o.fixedChars, pickRng);
            const rng = engine.makeRng(o.seed * 1000003 + g * 7919 + o.players);
            live.record(stats, chars, runGame(chars, rng, o.mode, o.size, undefined, { deck: o.skills !== false, gears: o.gears !== false, skills: o.skills !== false }));
            g++;
            if (g % o.checkpoint === 0) live.checkpoint(stats);
        }
        if (g >= o.maxGames) { running = false; return post('done', 'max'); }
        if (o.conv && live.converged(stats, o.conv)) { running = false; return post('done', 'converged'); }
        if (Date.now() - lastPost >= 500) { lastPost = Date.now(); post('progress'); }
        setTimeout(tick, 0);
    };
    tick();
}
