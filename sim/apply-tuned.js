#!/usr/bin/env node
// @ts-check
'use strict';
/*
 * sim/tuned.json（autotune.js の採用結果）をソースに反映する。
 *   node sim/apply-tuned.js            # 変更内容を表示（書き換えない）
 *   node sim/apply-tuned.js --write    # 推奨デッキ・推奨ギアを sim/ と src/components/game/ の4ファイルに書き込む
 * AIノブ(flags)は自動では書かない。キャラ別の値なので、AIPlayer.ts / sim/ai.js への移植は人間(Claude)が差分を見て行う。
 */
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const write = process.argv.includes('--write');
const tunedFile = path.join(__dirname, 'tuned.json');
const tuned = fs.existsSync(tunedFile) ? JSON.parse(fs.readFileSync(tunedFile, 'utf8')) : {};

/** `const NAME ... = {` から対応する `};` までの範囲で `  key: [ ... ],` を置き換える */
function rewrite(file, objName, key, items, quote) {
    const p = path.join(root, file);
    let src = fs.readFileSync(p, 'utf8');
    const start = src.indexOf(objName);
    if (start < 0) throw new Error(`${file}: ${objName} が見つからない`);
    const end = src.indexOf('\n};', start);
    const body = src.slice(start, end);
    const re = new RegExp(`(\\n\\s+${key}: )\\[[^\\]]*\\](,)`);
    if (!re.test(body)) throw new Error(`${file}: ${objName}.${key} が見つからない`);
    const lit = '[' + items.map((x) => (quote ? `'${x}'` : x)).join(', ') + ']';
    const nb = body.replace(re, `$1${lit}$2`);
    if (nb === body) return false;
    src = src.slice(0, start) + nb + src.slice(end);
    if (write) fs.writeFileSync(p, src);
    return true;
}

let changed = 0;
for (const [char, t] of Object.entries(tuned)) {
    if (t.deck) {
        const d = t.deck.slice().sort((a, b) => a - b);
        for (const f of ['sim/deck.js', 'src/components/game/deck.ts'].filter((x) => fs.existsSync(path.join(root, x)))) if (rewrite(f, 'RECOMMENDED_DECKS', char, d, false)) { console.log(`deck  ${char} -> [${d.join(', ')}]  (${f})`); changed++; }
    }
    if (t.gears) {
        for (const f of ['sim/gear.js', 'src/components/game/gear.ts'].filter((x) => fs.existsSync(path.join(root, x)))) if (rewrite(f, 'RECOMMENDED_GEARS', char, t.gears, true)) { console.log(`gears ${char} -> [${t.gears.join(', ')}]  (${f})`); changed++; }
    }
    if (t.flags && Object.keys(t.flags).length) console.log(`flags ${char}: ${JSON.stringify(t.flags)}  ← 手動で sim/ai.js / AIPlayer.ts に移植`);
}
// 本番TSが正。sim/shared/*.js は生成物なので書き換えたら再生成する（simShared.test.ts が古さを検出する）
if (write && changed) { const r = require('child_process').spawnSync(process.execPath, ['scripts/gen-sim-shared.js'], { cwd: root, stdio: 'inherit' }); if (r.status !== 0) process.exitCode = 1; }
console.log(changed ? (write ? `${changed} 箇所を書き込みました。次: npm test -- --watchAll=false と node --test sim/` : `${changed} 箇所に変更あり（--write で書き込み）`) : '推奨設定との差分なし');
