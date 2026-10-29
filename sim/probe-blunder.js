// @ts-check
'use strict';
/*
 * 戦術ミスの検出: 各手番の前後で「自分の即勝ち手があったのに勝てなかった」「相手の単独リーチがあったのに塞がなかった」を数える。
 * 使い方: node sim/probe-blunder.js [--games 20] [--seed 1] [--size 4] [--chars a,b]（省略時は全キャラ総当たり）
 * 数えるのは空きマスで完成するライン(findThreatSquares)のみ。捕獲での勝ち・スキルで盤面が変わる手番は「疑い」として出す。
 */
const engine = require('./engine');
const thermal = require('./shared/thermal');
const ai = require('./aiDriver'); // 本番AI(AIPlayer.ts の生成物)
const args = {};
for (let i = 2; i < process.argv.length; i++) { const a = process.argv[i]; if (a.startsWith('--')) args[a.slice(2)] = process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : '1'; }
const games = parseInt(args.games || '20', 10), seed0 = parseInt(args.seed || '1', 10), size = args.size ? parseInt(args.size, 10) : undefined;
const pairs = [];
if (args.chars) pairs.push(args.chars.split(','));
else {
    // 式神(陰陽師)・氷結(氷室)は簡易な勝ち判定に載らず誤検出が多いので、--skip yinYangMaster,cryomancer で組ごと除ける
    const skip = (args.skip || '').split(',');
    for (const a of engine.CHARACTERS) for (const b of engine.CHARACTERS) if (!skip.includes(a) && !skip.includes(b)) pairs.push([a, b]);
}
/** player が今 1 手で勝てるマス(空き + bind0 の敵コマの奪取。巨人は bind>0 の敵も)。式神のライン・氷結中の空きマス・⚡無敵のコマは engine と同じく勝ちに数えない */
function winCells(s, player) {
    const out = [];
    const syms = engine.symbolsOf(s.board); // 式神は undefined 扱い
    const giant = s.chars[engine.seatOf(player)] === 'giant';
    for (let i = 0; i < s.board.length; i++) {
        const q = s.board[i];
        if (q.effects.some((e) => e.effect === '🔑') && q.bind > 0) continue;
        if (thermal.emptyBlocked(q)) continue;
        if (q.player && engine.isShikigami(q) && q.player !== player) continue; // 式神は奪うと空きマスになるだけ(自コマにならない)
        // 奪えるのは bind0 の敵コマ。巨人は自分のライフが bind+1 を超えれば bind>0 の敵コマも奪える(simulatePlace の calc<0)
        if (q.player && (q.player === player || (q.bind > 0 && !(giant && q.bind - s.life + 1 < 0)))) continue;
        if (q.player && engine.isShielded(s, q)) continue;
        const keep = syms[i]; syms[i] = player;
        if (engine.calculateWinner(syms) === player) out.push(i);
        syms[i] = keep;
    }
    return out;
}
/** 状態の複製(関数は共有、Set/Map/配列/オブジェクトは再帰コピー)。乱数関数は共有されるので、使う側で c.rng を差し替える */
function deepClone(x) {
    if (x === null || typeof x !== 'object') return x;
    if (x instanceof Set) return new Set([...x].map(deepClone));
    if (x instanceof Map) return new Map([...x].map(([k, v]) => [k, deepClone(v)]));
    if (Array.isArray(x)) return x.map(deepClone);
    const o = {};
    for (const k of Object.keys(x)) o[k] = deepClone(x[k]);
    return o;
}
/** 簡易判定の候補マスのうち、実際に置くと勝つもの(着手後の減衰・炎・毒を含む)。乱数は別のものを使う */
function exactWinCells(s, me, cands) {
    return cands.filter((i) => {
        const c = deepClone(s);
        c.rng = engine.makeRng(777);
        try { engine.placeMove(c, i); } catch (e) { return false; }
        return c.winner === me;
    });
}
/** 複製した手番前の状態で、置き直せば相手の勝ち手を残さずに済んだ着手を探す */
function avoidingMoves(pre, me, exclude) {
    const out = [];
    for (let i = 0; i < pre.board.length; i++) {
        if (i === exclude) continue;
        const q = pre.board[i];
        if (q.effects.some((e) => e.effect === '🔑') && q.bind > 0) continue;
        if (q.player === me || (q.player && q.bind > 0)) continue;
        const c = deepClone(pre);
        c.rng = engine.makeRng(777); // 本体の乱数列を進めない(再現できるように)
        let ok = false;
        try { ok = engine.placeMove(c, i) !== false; } catch (e) { ok = false; }
        if (!ok) continue;
        if (c.winner === me || (!c.winner && !engine.otherSeats(c).concat([]).some(() => false) && engine.SYMBOLS.every((_, k) => k === engine.seatOf(me) || k >= engine.seatCount(c) || winCells(c, engine.SYMBOLS[k]).length === 0))) out.push(i);
    }
    return out;
}
const stat = {};
const get = (c) => (stat[c] ||= { turns: 0, missWin: 0, missBlock: 0, avoidable: 0, samples: [] });
for (const chars of pairs) {
    for (let g = 0; g < games; g++) {
        const s = engine.newGame({ chars, rng: engine.makeRng(seed0 * 100000 + g), size });
        let n = 0;
        while (!s.winner && n++ < 400) {
            const me = engine.curPlayer(s), ch = engine.curChar(s);
            const myT = exactWinCells(s, me, winCells(s, me)); // 簡易判定で勝てそうなマスを、複製して実際に置いて確かめる(減衰・炎・毒で列が崩れるものを除く)
            const oppT = engine.otherSeats(s).map((k) => winCells(s, engine.SYMBOLS[k]));
            const ls = (s.gears[s.turn] || []).includes('lastStand') && !s.lastStandUsed[s.turn]; // 土壇場の防壁が未発動なら守りは意図的に捨てる
            const flatPre = [...new Set(oppT.flat())];
            const pre = flatPre.length === 1 && !ls && !myT.length ? deepClone(s) : null; // 手番前の複製(単独リーチのときだけ)
            const r = ai.makeMove(s);
            const st = get(ch); st.turns++;
            let placed = false;
            if (!r.turnEnded && r.move != null) { engine.placeMove(s, r.move); placed = true; }
            else if (!r.turnEnded) engine.SKILLS.charge(s);
            // 勝てるはずのマスに置いて勝てなかった=式神のライン等の簡易判定のずれは除く
            if (myT.length && !(s.winner === me) && !(placed && myT.includes(r.move))) { st.missWin++; if (st.samples.length < 12) st.samples.push({ kind: 'win', chars, g, n, myT, move: r.move, skills: r.skills || r.used, placed }); }
            else if (!s.winner) {
                // 単独リーチ(相手1人・脅威マス1つ)を、着手後も残している
                const flat = [...new Set(oppT.flat())];
                if (flat.length === 1 && !ls) {
                    const after = engine.otherSeats(s).length; // dummy to keep lint quiet
                    const prevSeat = engine.seatOf(me);
                    const still = engine.SYMBOLS.map((_, k) => k).filter((k) => k !== prevSeat && k < engine.seatCount(s)).some((k) => winCells(s, engine.SYMBOLS[k]).length > 0);
                    if (still) {
                        st.missBlock++;
                        const alt = pre ? avoidingMoves(pre, me, r.move) : [];
                        if (alt.length) { st.avoidable++; if (st.samples.length < 12) st.samples.push({ kind: 'block', chars, g, n, threat: flat, move: r.move, avoid: alt, skills: r.skills || r.used, placed }); }
                    }
                }
            }
        }
    }
}
let tt = 0, tw = 0, tb = 0, ta = 0;
for (const [c, v] of Object.entries(stat)) { tt += v.turns; tw += v.missWin; tb += v.missBlock; ta += v.avoidable; console.log(c.padEnd(14), 'turns', v.turns, 'missWin', v.missWin, 'missBlock', v.missBlock, 'avoidable', v.avoidable); for (const x of v.samples) console.log('   ', JSON.stringify(x)); }
console.log('TOTAL turns', tt, 'missWin', tw, 'missBlock', tb, 'avoidable', ta);
