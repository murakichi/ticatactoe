#!/usr/bin/env node
'use strict';
/*
 * ブラウザの対戦シミュレーション(public/simWorker.js)が読む sim/ のモジュールを public/sim/ にコピーする。
 * compute.js と live.js から require('./x') を辿って必要なファイルだけを集める（テストや probe は含めない）。
 * npm start / npm run build の前に自動で走る(package.json の prestart / prebuild)。
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'sim');
const DEST = path.join(__dirname, '..', 'public', 'sim');
const ENTRIES = ['compute', 'live'];

const seen = new Set();
// name は sim/ からの相対パス(拡張子なし。例 'engine' / 'shared/gear')。require は読んだファイルのあるフォルダ基準で辿る
const visit = (name) => {
    if (seen.has(name)) return;
    seen.add(name);
    const text = fs.readFileSync(path.join(SRC, name + '.js'), 'utf8');
    for (const m of text.matchAll(/require\(\s*['"](\.[\w\-./]*?)(?:\.js)?['"]\s*\)/g)) visit(path.posix.normalize(path.posix.join(path.posix.dirname(name), m[1])));
};
ENTRIES.forEach(visit);

fs.rmSync(DEST, { recursive: true, force: true });
fs.mkdirSync(DEST, { recursive: true });
for (const name of seen) {
    fs.mkdirSync(path.dirname(path.join(DEST, name)), { recursive: true });
    fs.copyFileSync(path.join(SRC, name + '.js'), path.join(DEST, name + '.js'));
}
console.log(`copy-sim: ${[...seen].join(', ')} -> public/sim/`);
