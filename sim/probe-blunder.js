// @ts-check
'use strict';
/*
 * 戦術ミスの検出: 各手番の前後で「自分の即勝ち手があったのに勝てなかった」「相手の単独リーチがあったのに塞がなかった」を数える。
 * 使い方: node sim/probe-blunder.js [--games 20] [--seed 1] [--size 4] [--chars a,b]（省略時は全キャラ総当たり）
 * 数えるのは空きマスで完成するライン(findThreatSquares)のみ。捕獲での勝ち・スキルで盤面が変わる手番は「疑い」として出す。
 */
const engine = require('./engine');
const ai = require('./ai');
const args = {};
for (let i = 2; i < process.argv.length; i++) { const a = process.argv[i]; if (a.startsWith('--')) args[a.slice(2)] = process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : '1'; }
const games = parseInt(args.games || '20', 10), seed0 = parseInt(args.seed || '1', 10), size = args.size ? parseInt(args.size, 10) : undefined;
const pairs = [];
if (args.chars) pairs.push(args.chars.split(','));
else for (const a of engine.CHARACTERS) for (const b of engine.CHARACTERS) pairs.push([a, b]);
const stat = {};
const get = (c) => (stat[c] ||= { turns: 0, missWin: 0, missBlock: 0, samples: [] });
for (const chars of pairs) {
    for (let g = 0; g < games; g++) {
        const s = engine.newGame({ chars, rng: engine.makeRng(seed0 * 100000 + g), size });
        let n = 0;
        while (!s.winner && n++ < 400) {
            const me = engine.curPlayer(s), ch = engine.curChar(s);
            const myT = ai.findThreatSquares(s.board, me);
            const oppT = engine.otherSeats(s).map((k) => ai.findThreatSquares(s.board, engine.SYMBOLS[k]));
            const before = JSON.stringify(s.board.map((q) => q.player));
            const r = ai.makeMove(s, 'faithful');
            const st = get(ch); st.turns++;
            let placed = false;
            if (!r.turnEnded && r.move != null) { engine.placeMove(s, r.move); placed = true; }
            else if (!r.turnEnded) engine.SKILLS.charge(s);
            if (myT.length && !(s.winner === me)) { st.missWin++; if (st.samples.length < 4) st.samples.push({ kind: 'win', chars, g, n, myT, move: r.move, skills: r.skills || r.used, placed }); }
            else if (!s.winner) {
                // 単独リーチ(相手1人・脅威マス1つ)を、着手後も残している
                const flat = [...new Set(oppT.flat())];
                if (flat.length === 1) {
                    const after = engine.otherSeats(s).length; // dummy to keep lint quiet
                    const prevSeat = engine.seatOf(me);
                    const still = engine.SYMBOLS.map((_, k) => k).filter((k) => k !== prevSeat && k < engine.seatCount(s)).some((k) => ai.findThreatSquares(s.board, engine.SYMBOLS[k]).includes(flat[0]));
                    if (still) { st.missBlock++; if (st.samples.length < 4) st.samples.push({ kind: 'block', chars, g, n, threat: flat, move: r.move, skills: r.skills || r.used, placed }); }
                }
            }
        }
    }
}
let tt = 0, tw = 0, tb = 0;
for (const [c, v] of Object.entries(stat)) { tt += v.turns; tw += v.missWin; tb += v.missBlock; console.log(c.padEnd(14), 'turns', v.turns, 'missWin', v.missWin, 'missBlock', v.missBlock); for (const x of v.samples) console.log('   ', JSON.stringify(x)); }
console.log('TOTAL turns', tt, 'missWin', tw, 'missBlock', tb);
