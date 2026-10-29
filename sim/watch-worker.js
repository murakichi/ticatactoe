'use strict';
// cli.js watch の計算ワーカー(worker_threads)。累計の統計を一定間隔で親に送る
const { parentPort, workerData } = require('worker_threads');
const { createJob } = require('./compute');

const job = createJob(workerData);
let running = true, lastPost = 0;
parentPort.on('message', (m) => { if (m === 'stop') running = false; });
const post = (type) => parentPort.postMessage({ type, stats: job.stats });
const tick = () => {
    job.run(50);
    if (!running || job.done) { post('final'); return; }
    if (Date.now() - lastPost >= 250) { lastPost = Date.now(); post('raw'); }
    setImmediate(tick);
};
tick();
