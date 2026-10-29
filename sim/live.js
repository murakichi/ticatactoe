'use strict';
/*
 * `cli.js watch` の統計部分。ゲームを回さない純粋関数だけを置く（live.test.js で検証）。
 * 勝率は「出場1回あたり」(均等なら 1/人数)。引き分け/打ち切りは勝者なし扱い。
 */

const Z95 = 1.96;

function createStats(chars, players) {
    const perChar = {};
    for (const c of chars) perChar[c] = { appearances: 0, wins: 0, turnsWon: 0 };
    return { players, games: 0, draws: 0, turns: 0, seatWins: Array(players).fill(0), perChar, history: [], vs: {} };
}

// r = { winnerSeat, turns }, seatChars = そのゲームの席順キャラ
function record(st, seatChars, r) {
    st.games++;
    st.turns += r.turns;
    seatChars.forEach((c) => { st.perChar[c].appearances++; });
    if (r.winnerSeat >= 0) {
        st.seatWins[r.winnerSeat]++;
        const w = st.perChar[seatChars[r.winnerSeat]];
        w.wins++; w.turnsWon += r.turns;
    } else st.draws++;
    // 対面別: 同じゲームに出た異キャラの組ごとに、どちらが勝ったか（第三者の勝ちはどちらにも数えない）
    const winC = r.winnerSeat >= 0 ? seatChars[r.winnerSeat] : null;
    const uniq = Array.from(new Set(seatChars)).sort();
    for (let i = 0; i < uniq.length; i++) {
        for (let j = i + 1; j < uniq.length; j++) {
            const a = uniq[i], b = uniq[j], key = a + '|' + b;
            const m = st.vs[key] || (st.vs[key] = { a, b, meets: 0, aWins: 0, bWins: 0 });
            m.meets++;
            if (winC === a) m.aWins++; else if (winC === b) m.bWins++;
        }
    }
}

// 対面表: matrix[x][y] = x が y と同卓したとき、x か y が勝った試合のうち x が勝った割合
function matchups(st) {
    const out = {};
    for (const m of Object.values(st.vs)) {
        const d = m.aWins + m.bWins;
        (out[m.a] = out[m.a] || {})[m.b] = { meets: m.meets, wins: m.aWins, losses: m.bWins, winRate: d ? m.aWins / d : null };
        (out[m.b] = out[m.b] || {})[m.a] = { meets: m.meets, wins: m.bWins, losses: m.aWins, winRate: d ? m.bWins / d : null };
    }
    return out;
}

// Wilson 95% 区間の半幅ではなく単純な正規近似の標準誤差（表示と収束判定用）
function halfWidth(p, n) { return n ? Z95 * Math.sqrt((p * (1 - p)) / n) : null; }

function summarize(st) {
    const decided = st.games - st.draws;
    const rows = Object.entries(st.perChar)
        .filter(([, a]) => a.appearances > 0)
        .map(([id, a]) => {
            const winRate = a.wins / a.appearances;
            return { id, appearances: a.appearances, wins: a.wins, winRate, ci: halfWidth(winRate, a.appearances), avgTurnsWon: a.wins ? a.turnsWon / a.wins : null };
        })
        .sort((x, y) => y.winRate - x.winRate);
    return {
        games: st.games,
        drawRate: st.games ? st.draws / st.games : 0,
        avgTurns: st.games ? st.turns / st.games : 0,
        fair: 1 / st.players,
        seatWinRate: st.seatWins.map((w) => (decided ? w / decided : null)),
        rows,
    };
}

// 定期的に勝率スナップショットを積み、直近 window 個のスナップショット間で
// 全キャラの勝率が eps 以内でしか動いていなければ「変動しなくなった」とみなす。
function checkpoint(st) {
    const snap = {};
    for (const [id, a] of Object.entries(st.perChar)) if (a.appearances) snap[id] = a.wins / a.appearances;
    st.history.push({ games: st.games, snap });
    return snap;
}
function maxDrift(st, window) {
    const h = st.history;
    if (h.length < window) return null;
    const recent = h.slice(-window);
    let drift = 0;
    for (const id of Object.keys(recent[recent.length - 1].snap)) {
        const vals = recent.map((x) => x.snap[id]).filter((v) => v != null);
        if (vals.length < window) return null;
        drift = Math.max(drift, Math.max(...vals) - Math.min(...vals));
    }
    return drift;
}
function converged(st, { window, eps, minGames }) {
    if (st.games < minGames) return false;
    const d = maxDrift(st, window);
    return d != null && d <= eps;
}

// ---------- 「何が強いか」の総合分析 ----------
// 平均勝率だけでは、相手を見てキャラを選べる場合の強さ（苦手な相手がいると選ばれない）が分からない。
// そこで、同じ対面表から次の4つを出す。
//   fieldAvg   : 対全キャラ平均。相手が全キャラ均等に出る場合の勝率（probe-top の「環境勝率」と同じ）
//   strongAvg  : 対強豪平均。fieldAvg は弱いキャラを大勝するだけで上がるので、平均勝率の上位半分の相手(自分除く)だけで平均した勝率
//   worst      : 最悪対面。出会う確率が低くても、カウンターが1体いるだけで選ばれにくくなる
//   unfavorable: 有意に負け越す対面の数（勝率の95%区間の上限が50%未満）。favorable は逆（下限が50%超）
//   eq         : 相手が最適に選ぶときの均衡の選択確率（対称ゼロ和ゲームのナッシュ均衡）。
//                0に近いキャラは「他に上位互換がいる」、1体に集中すれば「そのキャラを出せば済む」
// 勝率は同卓した試合のうち「どちらかが勝った試合」の中の割合（引き分け・第三者の勝ちは除く）。
// 3人以上では第三者が絡むので、この分析は2人戦の読みが基本で、多人数では参考値。

// Wilson 95% 区間（n が小さい対面でも 0/1 に張り付かない）
function wilson(w, n) {
    if (!n) return { lo: null, hi: null };
    const p = w / n, z2 = Z95 * Z95, den = 1 + z2 / n;
    const mid = (p + z2 / (2 * n)) / den, h = (Z95 * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / den;
    return { lo: Math.max(0, mid - h), hi: Math.min(1, mid + h) };
}

// 対称ゼロ和ゲーム(A[i][j] = -A[j][i], 値は0)の均衡を乗法的重み更新の平均で近似する。
// exploit = 均衡戦略に対する最良応答の利得（0に近いほど収束している）
function solveSymmetric(A, iters = 4000) {
    const n = A.length;
    let x = Array(n).fill(1 / n);
    const avg = Array(n).fill(0);
    const eta = 2 * Math.sqrt(Math.log(Math.max(n, 2)) / iters);
    for (let t = 0; t < iters; t++) {
        for (let i = 0; i < n; i++) avg[i] += x[i];
        const nx = x.map((xi, i) => xi * Math.exp(eta * A[i].reduce((a, v, j) => a + v * x[j], 0)));
        const sum = nx.reduce((a, v) => a + v, 0);
        x = nx.map((v) => v / sum);
    }
    const sum = avg.reduce((a, v) => a + v, 0);
    const eq = avg.map((v) => v / sum);
    const exploit = Math.max(...A.map((row) => row.reduce((a, v, j) => a + v * eq[j], 0)));
    return { eq, exploit };
}

const MIN_DECIDED = 20; // 最悪対面・有利/不利に数える最低試合数（これ未満の対面は誤差が大きすぎる）

function analyze(st, { minDecided = MIN_DECIDED } = {}) {
    const ids = Object.entries(st.perChar).filter(([, a]) => a.appearances > 0).map(([id]) => id);
    if (ids.length < 2) return null;
    const mu = matchups(st);
    const cell = (x, y) => {
        const c = mu[x] && mu[x][y];
        const d = c ? c.wins + c.losses : 0;
        return { w: c ? c.wins : 0, d, rate: d ? c.wins / d : null, ...wilson(c ? c.wins : 0, d) };
    };
    // 先に素朴な平均を出し、その上位半分を「強豪」とする（弱いキャラを大勝して平均が上がるのを避けるため）
    const plain = Object.fromEntries(ids.map((x) => {
        const rs = ids.filter((y) => y !== x).map((y) => cell(x, y).rate).filter((r) => r != null);
        return [x, rs.length ? rs.reduce((a, r) => a + r, 0) / rs.length : 0];
    }));
    const strong = new Set([...ids].sort((a, b) => plain[b] - plain[a]).slice(0, Math.ceil(ids.length / 2)));
    const rows = ids.map((x) => {
        const cs = ids.filter((y) => y !== x).map((y) => ({ y, ...cell(x, y) }));
        const seen = cs.filter((c) => c.rate != null);
        const solid = cs.filter((c) => c.d >= minDecided);
        const worstC = solid.length ? solid.reduce((a, c) => (c.rate < a.rate ? c : a)) : null;
        return {
            id: x,
            strongAvg: (() => { const ss = seen.filter((c) => strong.has(c.y)); return ss.length ? ss.reduce((a, c) => a + c.rate, 0) / ss.length : null; })(),
            fieldAvg: seen.length ? seen.reduce((a, c) => a + c.rate, 0) / seen.length : null,
            worst: worstC ? { id: worstC.y, rate: worstC.rate, decided: worstC.d } : null,
            unfavorable: solid.filter((c) => c.hi < 0.5).length,
            favorable: solid.filter((c) => c.lo > 0.5).length,
            solidOpponents: solid.length,
            opponents: cs.length,
        };
    });
    // 均衡用の行列: 少数試合の対面は50%側へ寄せる（+1勝+1敗の仮想データ）。A[i][j] = -A[j][i] になる
    const A = ids.map((x) => ids.map((y) => { if (x === y) return 0; const c = cell(x, y); return (c.w + 1) / (c.d + 2) - 0.5; }));
    const { eq, exploit } = solveSymmetric(A);
    rows.forEach((r, i) => { r.eq = eq[i]; });
    rows.sort((a, b) => b.eq - a.eq || (b.strongAvg || 0) - (a.strongAvg || 0));
    const pairs = [];
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) pairs.push(cell(ids[i], ids[j]).d);
    return { rows, strong: [...strong], exploit, minPairDecided: Math.min(...pairs), minDecided, players: st.players, games: st.games };
}

// 分析から日本語の結論を作る。何を根拠にしたかを points に1行ずつ残す
function verdict(an, label = (id) => id) {
    if (!an) return { headline: 'データが足りません', points: [] };
    const top = (key, dir = 1) => an.rows.filter((r) => r[key] != null).reduce((a, r) => (a == null || dir * r[key] > dir * a[key] ? r : a), null);
    const topEq = top('eq'), topAvg = top('strongAvg');
    const topWorst = an.rows.filter((r) => r.worst).reduce((a, r) => (a == null || r.worst.rate > a.worst.rate ? r : a), null);
    const pts = [];
    const f = (x) => `${(x * 100).toFixed(1)}%`;
    let headline;
    const allSame = topWorst && topEq.id === topAvg.id && topEq.id === topWorst.id;
    if (an.minPairDecided < an.minDecided) {
        headline = `まだ標本が少なく結論は出せません（全対面が${an.minDecided}試合に届くまで。最少の対面は今 ${an.minPairDecided}/${an.minDecided}試合）`;
    } else if (allSame && topEq.unfavorable === 0 && topEq.eq >= 0.5) {
        headline = `${label(topEq.id)}が突出しています（対強豪平均・最悪対面・均衡のすべてで1位、有意な不利対面なし）`;
    } else if (topEq.eq >= 0.5) {
        headline = `実質的に${label(topEq.id)}が最強です（相手を見て選ぶと${f(topEq.eq)}がこのキャラに集中）`;
    } else if (topAvg.id !== topEq.id) {
        headline = `対強豪平均の1位は${label(topAvg.id)}ですが、相手を見て選ぶなら${label(topEq.id)}が最有力です`;
    } else {
        headline = `突出したキャラはいません（均衡の選択確率が分散）。最有力は${label(topEq.id)}`;
    }
    pts.push(`対強豪平均(平均勝率の上位半分の相手だけ)の1位: ${label(topAvg.id)} ${f(topAvg.strongAvg)}`);
    if (topWorst) pts.push(`最悪対面が最も良い: ${label(topWorst.id)}（最悪でも ${f(topWorst.worst.rate)}・対${label(topWorst.worst.id)}）`);
    pts.push(`均衡の選択確率の1位: ${label(topEq.id)} ${f(topEq.eq)}（最良応答の利得 ${(an.exploit * 100).toFixed(2)}pt。0に近いほど収束）`);
    const dead = an.rows.filter((r) => r.eq < 0.01).length;
    pts.push(`均衡でほぼ選ばれない（1%未満）: ${dead}/${an.rows.length}キャラ`);
    if (an.players >= 3) pts.push('3人以上では第三者が勝つ試合が混ざるので、この分析は参考値です（2人戦での読みが基本）');
    return { headline, points: pts };
}

// probe-top のように「ペアごとの勝敗数」だけが分かる計測から、analyze に渡せる統計を組み立てる（2人戦）。
// pairs = [{ a, b, w, l }]（a から見た勝ち・負け。引き分けは除く）
function statsFromPairs(chars, pairs) {
    const st = createStats(chars, 2);
    for (const c of chars) st.perChar[c].appearances = 1;
    for (const { a, b, w, l } of pairs) {
        const [x, y, xw, yw] = a < b ? [a, b, w, l] : [b, a, l, w];
        st.vs[x + '|' + y] = { a: x, b: y, meets: w + l, aWins: xw, bWins: yw };
    }
    return st;
}

module.exports = { statsFromPairs, createStats, record, matchups, summarize, checkpoint, maxDrift, converged, wilson, solveSymmetric, analyze, verdict };
