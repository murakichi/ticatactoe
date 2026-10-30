#!/usr/bin/env node
// @ts-check
'use strict';
/*
 * sim/tuned.json（autotune.js の採用結果）をソースに反映する。
 *   node sim/apply-tuned.js            # 変更内容を表示（書き換えない）
 *   node sim/apply-tuned.js --write    # 推奨デッキ・推奨ギアを sim/ と src/components/game/ の4ファイルに書き込む
 * AIノブ(knobs)は AIPlayer.ts のトップレベル数値定数を書き換える（全キャラ共通の値。autotune の再測定は --knobsGlobal で相手席にも掛けて行う）。
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
const knobWant = {};
for (const [char, t] of Object.entries(tuned)) {
    if (t.deck) {
        const d = t.deck.slice().sort((a, b) => a - b);
        for (const f of ['sim/deck.js', 'src/components/game/deck.ts'].filter((x) => fs.existsSync(path.join(root, x)))) if (rewrite(f, 'RECOMMENDED_DECKS', char, d, false)) { console.log(`deck  ${char} -> [${d.join(', ')}]  (${f})`); changed++; }
    }
    if (t.gears) {
        for (const f of ['sim/gear.js', 'src/components/game/gear.ts'].filter((x) => fs.existsSync(path.join(root, x)))) if (rewrite(f, 'RECOMMENDED_GEARS', char, t.gears, true)) { console.log(`gears ${char} -> [${t.gears.join(', ')}]  (${f})`); changed++; }
    }
    for (const [name, v] of Object.entries(t.knobs || {})) (knobWant[name] = knobWant[name] || []).push([char, v]);
}
// AIノブ: 本番 AIPlayer.ts のトップレベル数値定数。全キャラ共通の値なので、キャラ間で食い違うときは書かない
for (const [name, list] of Object.entries(knobWant)) {
    if (new Set(list.map(([, v]) => v)).size > 1) { console.log(`knob  ${name}: キャラ間で値が食い違うため書き込まない ${JSON.stringify(list)}`); continue; }
    const f = 'src/components/game/AIPlayer.ts', p = path.join(root, f);
    const re = new RegExp(`^((?:export )?const ${name}(?:: number)? = )(-?\\d+(?:\\.\\d+)?)(;)`, 'm');
    const src = fs.readFileSync(p, 'utf8');
    if (!re.test(src)) { console.log(`knob  ${name}: ${f} に数値定数が見つからない`); continue; }
    const out = src.replace(re, `$1${list[0][1]}$3`);
    if (out !== src) { if (write) fs.writeFileSync(p, out); console.log(`knob  ${name} -> ${list[0][1]}  (${f}, ${list.map(([c]) => c).join(',')} で測定)`); changed++; }
}
// 本番TSが正。sim/shared/*.js は生成物なので書き換えたら再生成する（simShared.test.ts が古さを検出する）
if (write && changed) { const r = require('child_process').spawnSync(process.execPath, ['scripts/gen-sim-shared.js'], { cwd: root, stdio: 'inherit' }); if (r.status !== 0) process.exitCode = 1; }
console.log(changed ? (write ? `${changed} 箇所を書き込みました。次: npm test -- --watchAll=false と node --test sim/` : `${changed} 箇所に変更あり（--write で書き込み）`) : '推奨設定との差分なし');
