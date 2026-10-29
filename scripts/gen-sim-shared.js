#!/usr/bin/env node
'use strict';
/*
 * 本番(src/)の純粋ロジック(TS)を、ヘッドレス sim 用の CommonJS に変換して sim/shared/ に出力する (#289)。
 * これで gear / deck / thermal ... のルールは src/components/game/*.ts が唯一の実装になり、
 * sim/ は生成物を require するだけになる(手書きの複製と「一致テスト」が要らない)。
 *
 *   node scripts/gen-sim-shared.js          # sim/shared/ を書き出す(生成物はコミットする)
 *   node scripts/gen-sim-shared.js --check  # 生成物が最新か確認する(古ければ exit 1)。CI は jest 側で同じことを確認する
 *
 * ルール:
 *  - ENTRIES から相対 import を辿って必要なファイルだけを変換する(React に依存するファイルは含めない)
 *  - 出力は sim/shared/<ファイル名>.js にフラットに置き、require のパスも './<ファイル名>' に書き換える
 *  - 生成物は手で編集しない(古いと shared.test.ts が落ちる)
 */
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const ROOT = path.join(__dirname, '..');
const GAME = path.join(ROOT, 'src', 'components', 'game');
const OUT = path.join(ROOT, 'sim', 'shared');

// sim が使う純粋モジュール(src/components/game/ 直下)。ここを増やすと生成物が増える
const ENTRIES = [
    'boardGeometry', 'skillCosts', 'gear', 'deck', 'discount', 'comboCost', 'lifeBan', 'darkPot', 'generic', 'thermal',
    'charge', 'tokenSkills', 'giantAura', 'giantTurn', 'decay', 'lateMagic', '../../util',
    'AIPlayer', 'aiTurn',
];

const resolveTs = (from, spec) => {
    const base = path.resolve(path.dirname(from), spec);
    for (const ext of ['.ts', '.tsx']) if (fs.existsSync(base + ext)) return base + ext;
    throw new Error(`cannot resolve ${spec} from ${path.relative(ROOT, from)}`);
};

function generate() {
    const files = new Map(); // 出力名 -> 内容
    const owner = new Map(); // 出力名 -> 元ファイル
    const visit = (file) => {
        const name = path.basename(file).replace(/\.tsx?$/, '');
        if (owner.has(name)) {
            if (owner.get(name) !== file) throw new Error(`name collision: ${name} (${owner.get(name)} / ${file})`);
            return;
        }
        owner.set(name, file);
        const source = fs.readFileSync(file, 'utf8');
        const out = ts.transpileModule(source, {
            compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, esModuleInterop: true, removeComments: false },
            fileName: file,
        }).outputText;
        const rewritten = out.replace(/require\((["'])(\.[^"']*)\1\)/g, (_, q, spec) => {
            const dep = resolveTs(file, spec);
            visit(dep);
            return `require(${q}./${path.basename(dep).replace(/\.tsx?$/, '')}${q})`;
        });
        const rel = path.relative(ROOT, file).split(path.sep).join('/');
        files.set(name + '.js', `// 自動生成: ${rel} (node scripts/gen-sim-shared.js)。手で編集しない。\n${rewritten}`);
    };
    ENTRIES.forEach((e) => visit(path.resolve(GAME, e + '.ts')));
    return files;
}

if (require.main === module) {
    const files = generate();
    if (process.argv.includes('--check')) {
        const stale = [...files].filter(([n, c]) => !fs.existsSync(path.join(OUT, n)) || fs.readFileSync(path.join(OUT, n), 'utf8') !== c).map(([n]) => n);
        const extra = fs.existsSync(OUT) ? fs.readdirSync(OUT).filter((n) => !files.has(n)) : [];
        if (stale.length || extra.length) {
            console.error(`sim/shared が古い: ${[...stale, ...extra].join(', ')}。node scripts/gen-sim-shared.js を実行してコミットする`);
            process.exit(1);
        }
        console.log('sim/shared: up to date');
    } else {
        fs.rmSync(OUT, { recursive: true, force: true });
        fs.mkdirSync(OUT, { recursive: true });
        for (const [n, c] of files) fs.writeFileSync(path.join(OUT, n), c);
        console.log(`gen-sim-shared: ${[...files.keys()].join(', ')} -> sim/shared/`);
    }
}
module.exports = { generate };
