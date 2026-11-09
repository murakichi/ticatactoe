#!/usr/bin/env node
'use strict';
/*
 * 火炎トークンの計測（計測専用。本番の AIPlayer は変えない）。
 * 「火炎トークン(idx37)・火炎ダブルトークン(idx38)を入れたデッキ + 道連れの鍵/伝播/収穫のギア」を組んだ席が、
 * 手札に火炎トークンがあって払えるなら、他のトークン(AIPlayer が手札にあれば撃つ)と同じ基準で撃つ、という方針を sim にだけ被せる。
 * 現行の挙動(火炎トークンにも afterTokenPlaced を通す)と、旧本番の挙動(通さない)を同じ seed・同じ組み合わせで比べる。
 *
 *   node sim/flame-probe.js --target pyromancer --gears bindingLock,propagate --games 600 --jobs 4
 *   node sim/flame-probe.js --old   # 旧本番の挙動(火炎・氷結・ダブル帯電のトークンで afterTokenPlaced を通さない)で走らせる
 */
const path = require('path');
const { spawn } = require('child_process');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true); };
const CHARS = ['you', 'tactician', 'magician', 'giant', 'yinYangMaster', 'necromancer', 'poisoner', 'electrician', 'cryomancer', 'pyromancer', 'witch', 'keysmith'];
const target = arg('target', 'pyromancer');
const gears = String(arg('gears', 'bindingLock,propagate')).split(',').filter(Boolean);
const games = +arg('games', 600);
const jobs = +arg('jobs', 4);

if (arg('child', false)) {
    const [from, to] = [+arg('from', 0), +arg('to', 0)];
    const old = !!arg('old', false);
    const engine = require('./engine');
    const gearMod = require('./shared/gear');
    const deckMod = require('./shared/deck');
    const aiDriver = require('./aiDriver');
    if (old) {
        // 旧本番の挙動: 火炎・氷結・ダブル帯電のトークンは afterTokenPlaced を通さない
        const tp = require('./shared/tokenPlace');
        const orig = tp.placeTokens;
        const ta = require('./shared/tokenAfter');
        tp.placeTokens = (board, kind, cells, c, after, afterPut) => {
            if (kind === 'flame' || kind === 'frost' || (kind === 'charge' && cells.length > 1)) {
                const placed = cells.map((idx) => { const put = tp.putToken(kind, board, idx, c); afterPut && afterPut(board, idx); return { idx, ...put, after: { granted: 0, locked: false, spreadTo: null } }; });
                return { placed, granted: 0 };
            }
            return orig(board, kind, cells, c, after, afterPut);
        };
        void ta;
    }
    const others = CHARS.filter((c) => c !== target);
    const out = [];
    for (let g = from; g < to; g++) {
        const opp = others[g % others.length];
        const seat = Math.floor(g / others.length) % 2; // 席を交互にする
        const chars = seat === 0 ? [target, opp] : [opp, target];
        const rng = engine.makeRng(31000 + g);
        const decks = chars.map((c) => deckMod.pickRecommendedDeck(c, rng));
        const gearsBySeat = chars.map((c) => gearMod.pickRecommendedGears(c, rng));
        // 対象席: 推奨デッキの先頭2枚を火炎トークン(37)・火炎ダブルトークン(38)に差し替え、ギアを指定のものにする
        const d = decks[seat].filter((i) => i !== 37 && i !== 38); d.splice(0, 2, 37, 38); decks[seat] = d.sort((a, b) => a - b);
        gearsBySeat[seat] = gears;
        const s = engine.newGame({ chars, rng, decks, gears: gearsBySeat });
        let guard = 0, passes = 0, used = 0;
        while (!s.winner && guard++ < 400) {
            if (s.turn === seat && !s.usedTokenThisTurn) {
                const hasEmpty = s.board.some((q) => !q.player && !(q.effects || []).some((e) => e.effect === '❄' || e.effect === '🔑'));
                if (hasEmpty && s.skills.includes(38) && s.magic[seat] >= 5) { engine.SKILLS.doubleFlameToken(s); used++; }
                else if (hasEmpty && s.skills.includes(37) && s.magic[seat] >= 3) { engine.SKILLS.flameToken(s); used++; }
            }
            const placed = s.placements; aiDriver.playTurn(s);
            if (s.placements !== placed) passes = 0; else if (++passes >= 20) break;
        }
        out.push([opp, seat, s.winner ? engine.seatOf(s.winner) : -1, used]);
    }
    console.log(JSON.stringify(out));
    process.exit(0);
}

// 親: current / old を同じ範囲で子プロセスに走らせて集計する
const run = (old) => Promise.all(Array.from({ length: jobs }, (_, j) => new Promise((resolve) => {
    const from = Math.floor((games * j) / jobs), to = Math.floor((games * (j + 1)) / jobs);
    const a = [__filename, '--child', '--from', from, '--to', to, '--target', target, '--gears', gears.join(',')];
    if (old) a.push('--old');
    const p = spawn(process.execPath, a, { cwd: __dirname }); let buf = '';
    p.stdout.on('data', (d) => { buf += d; });
    p.on('close', () => resolve(JSON.parse(buf)));
}))).then((r) => r.flat());
(async () => {
    const [cur, old] = [await run(false), await run(true)];
    const rate = (rows) => ({ games: rows.length, win: +(100 * rows.filter((r) => r[2] === r[1]).length / rows.length).toFixed(1), usesPerGame: +(rows.reduce((s, r) => s + r[3], 0) / rows.length).toFixed(2) });
    let changed = 0; cur.forEach((r, i) => { if (r[2] !== old[i][2]) changed++; });
    console.log(JSON.stringify({ target, gears, 旧本番の挙動: rate(old), 現行の挙動: rate(cur), 勝者が変わった試合: changed }, null, 1));
})();
