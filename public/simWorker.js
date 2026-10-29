/* ブラウザ内の対戦シミュレーション用 Web Worker（計算だけ。集計・分析は画面側）。
 * sim/ の CommonJS モジュール(public/sim/ にコピーされたもの)を同期XHRで読み、require を自前で用意して動かす。
 * 画面は端末のコア数ぶんこの Worker を立て、ゲーム番号 g = offset, offset+stride, ... を分担させる。
 *   -> { cmd: 'start', players, size, mode, seed, fixedChars, skills, gears, offset, stride, maxGames }
 *   -> { cmd: 'stop' }
 *   <- { type: 'raw', stats }（累計の統計を一定間隔で。停止・完了時は type: 'final'）/ { type: 'error', message }
 */
'use strict';
const base = new URL('sim/', self.location.href).href;
const cache = {};
function load(name) {
    const key = name.replace(/^\.\//, '').replace(/\.js$/, '');
    if (cache[key]) return cache[key].exports;
    const xhr = new XMLHttpRequest();
    xhr.open('GET', base + key + '.js', false);
    xhr.send();
    if (xhr.status !== 200) throw new Error('failed to load ' + key + ' (' + xhr.status + ')');
    const module = { exports: {} };
    cache[key] = module;
    new Function('module', 'exports', 'require', 'process', xhr.responseText + '\n//# sourceURL=sim/' + key + '.js')(module, module.exports, load, { env: {} });
    return module.exports;
}

let running = false;
self.onmessage = (e) => {
    const m = e.data;
    if (m.cmd === 'stop') { running = false; return; }
    if (m.cmd !== 'start') return;
    try { start(m); } catch (err) { self.postMessage({ type: 'error', message: String((err && err.message) || err) }); }
};

function start(o) {
    const job = load('compute').createJob(o);
    let lastPost = 0;
    running = true;
    const post = (type) => self.postMessage({ type, stats: job.stats });
    // メッセージ(stop)を受け取れるよう、50msぶん回すごとにイベントループへ戻る
    const tick = () => {
        if (!running) return post('final');
        job.run(50);
        if (job.done) { running = false; return post('final'); }
        if (Date.now() - lastPost >= 300) { lastPost = Date.now(); post('raw'); }
        setTimeout(tick, 0);
    };
    tick();
}
