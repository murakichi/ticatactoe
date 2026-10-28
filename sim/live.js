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

module.exports = { createStats, record, matchups, summarize, checkpoint, maxDrift, converged };
