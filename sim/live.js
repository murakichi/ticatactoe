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
//   metaAvg    : 対強豪平均（重み付き。判断に使う主指標）。fieldAvg は弱いキャラを大勝するだけで上がるので、相手ごとに重みを付けて平均する。
//                重み = 相手が選ばれやすさ（強いほど大きい。ロジット量子応答均衡 metaWeights）。一強なら一強に勝つことが重く評価され、下位は小さい重みで残る
//   strongAvg  : 旧・対強豪平均（平均勝率の上位半分の相手(自分除く)を同じ重みで平均。重みが0/1の二択で、線の内外で不連続）。比較用に残す
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

// 相手の重み: 「相手が選ぶキャラの分布 p」を、強いキャラほど選ばれやすい(ロジット応答)として自己無撞着に決める。
//   p_i ∝ exp(β · U_i),  U_i = Σ_j A[i][j] · p_j   （U_i = 分布 p に対するキャラ i の勝率 − 50%）
// ロジット量子応答均衡。β=0 で全員同じ重み(= 単純平均)、β→∞ でナッシュ均衡(最強にだけ重みが集まる)に近づく。
// 一強なら、一強の重みが自動で大きくなる（一強に勝つことが重く評価される）。順位で線を引かず、全員に連続の重みが付く。
// A は対称ゼロ和の利得行列(solveSymmetric と同じ)。収束しないときは打ち切り時点の平均を返す
const META_BETA = 8; // 勝率の差0.1につき重みが約 e^0.8≒2.2 倍。0で単純平均、大きいほど強い相手に集中
function metaWeights(A, beta = META_BETA, maxIter = 5000) {
    const n = A.length;
    let p = Array(n).fill(1 / n);
    for (let t = 0; t < maxIter; t++) {
        const u = A.map((row) => row.reduce((a, v, j) => a + v * p[j], 0));
        const m = Math.max(...u);
        const e = u.map((x) => Math.exp(beta * (x - m)));
        const sum = e.reduce((a, v) => a + v, 0);
        const q = e.map((v) => v / sum);
        const next = p.map((v, i) => 0.7 * v + 0.3 * q[i]); // 減衰（対称ゼロ和は素朴な反復だと振動しやすい）
        const diff = Math.max(...next.map((v, i) => Math.abs(v - p[i])));
        p = next;
        if (diff < 1e-10) break;
    }
    return p;
}

const READY_SHARE = 0.9; // 結論を出すのに必要な、minDecided に届いた対面(組)の割合
const MIN_DECIDED = 20; // 最悪対面・有利/不利に数える最低試合数（これ未満の対面は誤差が大きすぎる）

function analyze(st, { minDecided = MIN_DECIDED, beta = META_BETA } = {}) {
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
    // 重み付きの対強豪平均(metaAvg): 相手 j の重み p_j（強い相手ほど大きい）で、自分以外の相手との勝率を平均する。
    // 自分自身(ミラー)は除いて残りの重みで正規化する。実測の勝率を使う（重みの計算だけ、少数試合の対面は50%寄りに補正した行列を使う）
    const weights = metaWeights(A, beta);
    const idxOf = Object.fromEntries(ids.map((id, i) => [id, i]));
    rows.forEach((r) => {
        let num = 0, den = 0;
        for (const y of ids) {
            if (y === r.id) continue;
            const c = cell(r.id, y);
            if (c.rate == null) continue;
            num += weights[idxOf[y]] * c.rate;
            den += weights[idxOf[y]];
        }
        r.metaAvg = den > 0 ? num / den : null;
        r.weight = weights[idxOf[r.id]];
    });
    rows.sort((a, b) => b.eq - a.eq || (b.metaAvg || 0) - (a.metaAvg || 0));
    const pairs = [];
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) pairs.push(cell(ids[i], ids[j]).d);
    // 引き分け（打ち切り）が多い組があると、全組が minDecided に届くのを待つといつまでも結論が出ない。
    // 届いていない組は最悪対面・有利/不利の数から除いてあるので、9割の組が届けば結論を出す
    const solidPairs = pairs.filter((d) => d >= minDecided).length;
    const ready = solidPairs >= Math.ceil(pairs.length * READY_SHARE);
    const edges = advantageEdges(ids, cell, minDecided);
    return { rows, edges, ids, loops: findLoops(ids, edges.filter((e) => e.significant)), strong: [...strong], beta, weights: Object.fromEntries(ids.map((id, i) => [id, weights[i]])), exploit, minPairDecided: Math.min(...pairs), solidPairs, totalPairs: pairs.length, ready, minDecided, players: st.players, games: st.games };
}

// 有利・不利の有向グラフ。勝つ側 from → 負ける側 to。minDecided 試合以上ある組だけで、勝率がちょうど50%の組は辺を作らない。
// significant = 勝つ側の勝率の95%区間(Wilson)の下限が50%超（偶然では説明しにくい差）。そうでない辺は「傾向」
function advantageEdges(ids, cell, minDecided) {
    const edges = [];
    for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
            const c = cell(ids[i], ids[j]);
            if (c.d < minDecided || c.rate === 0.5) continue;
            const aWins = c.rate > 0.5;
            const [from, to] = aWins ? [ids[i], ids[j]] : [ids[j], ids[i]];
            const rate = aWins ? c.rate : 1 - c.rate;
            const lo = aWins ? c.lo : 1 - c.hi;
            edges.push({ from, to, rate, decided: c.d, lo, significant: lo > 0.5 });
        }
    }
    return edges;
}

// 勝ち負けの閉ループ（三すくみ a→b→c→a や、もっと長い循環）。edges（勝つ側→負ける側）でできる有向グラフから求める。
//   groups    : 互いに行き来できるキャラの集まり（強連結成分。2キャラ以上）。ここに入る辺は、必ずどこかの閉ループの一部
//   cycles    : 具体的な循環（長さ maxLen まで、id 列。各循環は ids の並びで最小のキャラから1回だけ数える）
//   loopEdges : 閉ループに入っている辺（'from>to'）。長さ maxLen を超える循環の辺も含む
//   truncated : maxCount で打ち切ったか
// 長いループは「一強がいない・相性で選ぶ余地がある」ことの目印で、1体が全員に勝つ（辺が出るだけ）状態とは区別できる
function findLoops(ids, edges, { maxLen = 5, maxCount = 40 } = {}) {
    const idx = new Map(ids.map((id, i) => [id, i]));
    const adj = ids.map(() => []);
    for (const e of edges) if (idx.has(e.from) && idx.has(e.to)) adj[idx.get(e.from)].push(idx.get(e.to));
    // Tarjan 法で強連結成分
    const n = ids.length, index = Array(n).fill(-1), low = Array(n).fill(0), on = Array(n).fill(false), comp = Array(n).fill(-1);
    const stack = [], comps = [];
    let counter = 0;
    const visit = (v) => {
        index[v] = low[v] = counter++; stack.push(v); on[v] = true;
        for (const w of adj[v]) {
            if (index[w] === -1) { visit(w); low[v] = Math.min(low[v], low[w]); }
            else if (on[w]) low[v] = Math.min(low[v], index[w]);
        }
        if (low[v] === index[v]) {
            const c = [];
            let w;
            do { w = stack.pop(); on[w] = false; comp[w] = comps.length; c.push(w); } while (w !== v);
            comps.push(c);
        }
    };
    for (let v = 0; v < n; v++) if (index[v] === -1) visit(v);
    const groups = comps.filter((c) => c.length >= 2).map((c) => c.slice().sort((a, b) => a - b).map((i) => ids[i])).sort((a, b) => b.length - a.length);
    const loopEdges = edges.filter((e) => idx.has(e.from) && idx.has(e.to) && comp[idx.get(e.from)] === comp[idx.get(e.to)] && comps[comp[idx.get(e.from)]].length >= 2).map((e) => e.from + '>' + e.to);
    // 具体的な循環: 開始点より大きい番号だけを通り、同じ成分の中で開始点へ戻る
    const cycles = [];
    let truncated = false;
    const path = [];
    const dfs = (start, v) => {
        for (const w of adj[v]) {
            if (cycles.length >= maxCount) { truncated = true; return; }
            if (w === start) { cycles.push(path.map((i) => ids[i])); continue; }
            if (w < start || comp[w] !== comp[start] || path.includes(w) || path.length >= maxLen) continue;
            path.push(w); dfs(start, w); path.pop();
        }
    };
    for (let start = 0; start < n && !truncated; start++) {
        if (comps[comp[start]].length < 2) continue;
        path.length = 0; path.push(start); dfs(start, start);
    }
    cycles.sort((a, b) => a.length - b.length);
    return { groups, cycles, loopEdges, truncated };
}

// 分析から日本語の結論を作る。何を根拠にしたかを points に1行ずつ残す
function verdict(an, label = (id) => id) {
    if (!an) return { headline: 'データが足りません', points: [] };
    const top = (key, dir = 1) => an.rows.filter((r) => r[key] != null).reduce((a, r) => (a == null || dir * r[key] > dir * a[key] ? r : a), null);
    const topEq = top('eq'), topAvg = top('metaAvg');
    const topWorst = an.rows.filter((r) => r.worst).reduce((a, r) => (a == null || r.worst.rate > a.worst.rate ? r : a), null);
    const pts = [];
    const f = (x) => `${(x * 100).toFixed(1)}%`;
    let headline;
    const allSame = topWorst && topEq.id === topAvg.id && topEq.id === topWorst.id;
    if (!an.ready) {
        headline = `まだ標本が少なく結論は出せません（${an.minDecided}試合に届いた対面は ${an.solidPairs}/${an.totalPairs}。${Math.round(READY_SHARE * 100)}%に届くまで）`;
    } else if (allSame && topEq.unfavorable === 0 && topEq.eq >= 0.5) {
        headline = `${label(topEq.id)}が突出しています（対強豪平均・最悪対面・均衡のすべてで1位、有意な不利対面なし）`;
    } else if (topEq.eq >= 0.5) {
        headline = `実質的に${label(topEq.id)}が最強です（相手を見て選ぶと${f(topEq.eq)}がこのキャラに集中）`;
    } else if (topAvg.id !== topEq.id) {
        headline = `対強豪平均の1位は${label(topAvg.id)}ですが、相手を見て選ぶなら${label(topEq.id)}が最有力です`;
    } else {
        headline = `突出したキャラはいません（均衡の選択確率が分散）。最有力は${label(topEq.id)}`;
    }
    pts.push(`対強豪平均(強い相手ほど重く見る)の1位: ${label(topAvg.id)} ${f(topAvg.metaAvg)}`);
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

// ---------- 1対1の組み合わせ / 並列集計 ----------
// 1対1は、キャラをランダムに引かず「異なる2キャラ（席順つき）」の全組を線形に1周し、それを繰り返す。
// どの組も先手・後手とも同じ回数になり、全組の試合数が最速で揃う（ランダムだと偏って、最少の対面が増えにくい）。
// 同じ組でもライフ・AIのデッキに乱数が入るので、周回ごとに結果は変わる。同キャラ対戦は対面表に入らないので除く。
function roundRobinPairs(ids) {
    const out = [];
    for (const a of ids) for (const b of ids) if (a !== b) out.push([a, b]);
    return out;
}

// 複数ワーカーの createStats を足し合わせる（履歴は持たない）。ワーカーごとの累計を渡す
function mergeStats(ids, players, parts) {
    const st = createStats(ids, players);
    for (const p of parts) {
        if (!p) continue;
        st.games += p.games; st.draws += p.draws; st.turns += p.turns;
        p.seatWins.forEach((w, i) => { st.seatWins[i] += w; });
        for (const [id, a] of Object.entries(p.perChar)) {
            const t = st.perChar[id] || (st.perChar[id] = { appearances: 0, wins: 0, turnsWon: 0 });
            t.appearances += a.appearances; t.wins += a.wins; t.turnsWon += a.turnsWon;
        }
        for (const [k, m] of Object.entries(p.vs)) {
            const t = st.vs[k] || (st.vs[k] = { a: m.a, b: m.b, meets: 0, aWins: 0, bWins: 0 });
            t.meets += m.meets; t.aWins += m.aWins; t.bWins += m.bWins;
        }
    }
    return st;
}

// 並列で回すときの集計役。ワーカーの累計を足して、ckEvery 局ごとに勝率のスナップショットを積む（収束判定用）
function createAggregator(ids, players, ckEvery) {
    return { ids, players, ckEvery, next: ckEvery, history: [] };
}
function aggregate(agg, parts) {
    const st = mergeStats(agg.ids, agg.players, parts);
    st.history = agg.history;
    if (st.games >= agg.next) { checkpoint(st); agg.next = (Math.floor(st.games / agg.ckEvery) + 1) * agg.ckEvery; }
    return st;
}

module.exports = { metaWeights, META_BETA, findLoops, roundRobinPairs, mergeStats, createAggregator, aggregate, statsFromPairs, createStats, record, matchups, summarize, checkpoint, maxDrift, converged, wilson, solveSymmetric, analyze, verdict };
