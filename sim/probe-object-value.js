#!/usr/bin/env node
// @ts-check
'use strict';
/*
 * オブジェクトの「価値」を魔力に換算する測定（docs/skill-cost-rules.md の『オブジェクトの算出』の根拠）。
 *
 * テスト席の k 回目の手番の頭に、介入を1つだけ無料で入れて、勝率の変化を見る。AI の『置くかどうか』の判断に依らず、置いたものの価値だけを測る。
 *   none            何もしない（対照）
 *   <kind>:<where>  その種類のオブジェクトを where のマスに無料で置く（where = quiet | own | enemy）
 *   body:<where>    効果もロックも無いオブジェクト（大岩からロックを外したもの）
 *   magic<N>        魔力を N だけ足す（勝率→魔力の換算表）
 *   buy<C>:<kind>:<where>  k 回目以降の手番の頭で、魔力が C 以上ある最初の手番に C を払って置く（価格 C の検算。適正な価格なら対照と同じ勝率になる）
 * 基準は大岩（効果なし）: 「種類 X の効果の価値」= X:<where> と boulder:<where> の差。同じ seed・同じマス選びなので、介入までの試合は一致する。
 *
 *   node sim/probe-object-value.js --arms none,boulder:quiet,bigTree:quiet,magic4 --chars you,giant --opps you,giant --games 100 --k 2 --seed 1 [--players 2] [--out file.jsonl]
 *
 * マス選び: quiet = 自分の生きた列が少なく相手の生きた列が多い空きマス / own = 周囲の自陣コマが多い / enemy = 周囲の敵コマが多い（同点は quiet の点）。
 * 出力は (arm, char, opp) ごとの1行 JSON（outcomes は試合ごとの 1/0/0.5。集計は probe-object-value-sum.js）。
 */
const engine = require('./engine');
const drv = require('./aiDriver');
const deckMod = require('./shared/deck');
const gearMod = require('./shared/gear');
const objs = require('./shared/objects');
const geoMod = require('./shared/boardGeometry');
const fs = require('fs');

const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].slice(2)] = process.argv[i + 1];
const arms = (args.arms || 'none').split(',');
const chars = (args.chars || 'you').split(',');
const opps = (args.opps || 'giant').split(',');
const games = parseInt(args.games || '100', 10);
const K = parseInt(args.k || '2', 10);
const seed0 = parseInt(args.seed || '1', 10);
const players = parseInt(args.players || '2', 10);
const size = args.size ? parseInt(args.size, 10) : undefined;
const out = args.out;

const isPiece = (q) => !!q.player && !q.object;

function pickCell(s, sym, where) {
    const geo = geoMod.geometryForCells(s.board.length);
    let best = -1, bs = -Infinity;
    s.board.forEach((q, i) => {
        if (!objs.objectLandable(q)) return;
        let ownLive = 0, oppLive = 0;
        for (const line of geo.winLines) {
            if (!line.includes(i)) continue;
            const cells = line.map((j) => s.board[j]);
            if (cells.some((c) => c.object)) continue;
            if (!cells.some((c) => c.player && c.player !== sym)) ownLive++;
            if (!cells.some((c) => c.player === sym)) oppLive++;
        }
        const quiet = oppLive - ownLive;
        const ring = geo.surroundRange(i).map((j) => s.board[j]).filter(isPiece);
        const own = ring.filter((c) => c.player === sym).length;
        const enemy = ring.length - own;
        const sc = where === 'own' ? own * 100 + quiet : where === 'enemy' ? enemy * 100 + quiet : quiet;
        if (sc > bs) { bs = sc; best = i; }
    });
    return best;
}

function intervene(s, me, arm) {
    if (arm === 'none') return null;
    const m = /^magic(-?\d+)$/.exec(arm);
    if (m) { s.magic[me] = Math.max(0, s.magic[me] + parseInt(m[1], 10)); return null; }
    const b = /^buy(\d+):(.+)$/.exec(arm);
    const price = b ? parseInt(b[1], 10) : 0;
    if (s.magic[me] < price) return 'wait';
    const [kind, where = 'quiet'] = (b ? b[2] : arm).split(':');
    const sym = engine.SYMBOLS[me];
    const cell = pickCell(s, sym, where);
    if (cell < 0) return null;
    s.magic[me] -= price;
    const carried = s.board[cell].effects.filter((e) => e.effect === '🔥');
    if (kind === 'body') s.board[cell] = { player: sym, bind: objs.OBJECT_LIFE, effects: [...carried], object: 'boulder' };
    else s.board[cell] = objs.newObject(sym, kind, 0, carried);
    return { cell, kind: kind === 'body' ? 'boulder' : kind, work: 0, alive: true, end: 'gameEnd' };
}

function runPair(arm, c1, c2) {
    const outcomes = [];
    let placed = 0, work = 0, myTurnsAfter = 0, myTurnsTotal = 0, objMagic = 0, objEffect = 0;
    const ends = {};
    for (let g = 0; g < games; g++) {
        const me = g % players;
        const cs = Array.from({ length: players }, (_, i) => (i === me ? c1 : c2));
        const s = engine.newGame({ chars: cs, size, rng: engine.makeRng(seed0 * 100003 + g), decks: cs.map((c) => deckMod.recommendedDeck(c)), gears: cs.map((c) => gearMod.recommendedGears(c)) });
        s.aiFlags = cs.map(() => ({}));
        const sym = engine.SYMBOLS[me];
        let n = 0, mine = 0, tag = null, done = false;
        while (!s.winner && n++ < 400) {
            if (s.turn === me) {
                mine++;
                if (tag && tag.alive) {
                    const q = s.board[tag.cell];
                    if (q.object === tag.kind && q.player === sym) { if (!q.effects.some((e) => e.effect === '❄')) tag.work++; }
                    else { tag.alive = false; tag.end = q.player === sym ? 'selfOverwrite' : q.player ? 'captured' : 'destroyed'; }
                }
                if (tag) myTurnsAfter++;
                if (mine >= K && !done) {
                    const r = intervene(s, me, arm);
                    if (r !== 'wait') { done = true; tag = r; if (tag) placed++; }
                }
            }
            drv.playTurn(s);
        }
        myTurnsTotal += mine;
        if (tag) { work += tag.work; ends[tag.end] = (ends[tag.end] || 0) + 1; }
        objMagic += s.stats.objectMagic || 0;
        objEffect += s.stats.objectEffect || 0;
        outcomes.push(s.winner ? (engine.seatOf(s.winner) === me ? 1 : 0) : 0.5);
    }
    return { arm, char: c1, opp: c2, k: K, players, size: size || null, seed: seed0, games, placed, work, myTurnsAfter, myTurnsTotal, objMagic, objEffect, ends, outcomes: outcomes.join(',') };
}

for (const arm of arms) for (const c of chars) for (const o of opps) {
    const r = runPair(arm, c, o);
    const line = JSON.stringify(r);
    if (out) fs.appendFileSync(out, line + '\n'); else console.log(line);
}
