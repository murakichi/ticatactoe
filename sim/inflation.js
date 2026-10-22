// @ts-check
'use strict';
/*
 * 魔力インフレ指標。
 *
 * 「インフレ」= 魔力の収入が増え、使い道(コスト)に対して手元の魔力が膨らんでいくこと。
 * 1席の1手番ごとに次の3つを記録する:
 *   start  手番開始時の魔力(収入を受け取った後)
 *   end    手番終了時の魔力(次に自分の手番が来るまで変わらない)
 *   income start - 前回の end(=この手番で受け取った収入。初回は初期値との差)
 *   spent  start - end(=この手番の純支出。チャージ等で増えた分は負になる)
 *
 * 指標(ゲーム全体と、50手ごとの区間(lateMagic の刻み)で出す):
 *   income       手番あたりの平均収入
 *   stock        手番開始時の平均魔力
 *   skills       手番あたりのスキル使用数
 *   effCost      実効コスト = 純支出 ÷ スキル数(割引・ギア込み)
 *   stockToCost  stock ÷ 基準コスト(skillCosts の正の数値の中央値。割引を無視した素の値)
 *   stockToEffCost stock ÷ effCost。実際の払い方で何発撃てる財布か
 *   spendRatio   Σspent ÷ Σincome。1未満なら使い切れず溜まっている
 *   hoardRate    手番終了時に実効コストの HOARD_MULT 倍以上を残した手番の割合(撃ち切れず持ち越し)
 *
 * 区間幅は既定50手(--bucket で変更。2人戦は50手内に終わるので --bucket 10 など)。
 * 総合: inflationIndex = 後半区間の stockToEffCost ÷ 序盤区間の stockToEffCost。
 *   1 付近なら収入と支出が釣り合っている。大きいほど長引くほど財布が膨らむ(インフレ)。
 */

const HOARD_MULT = 3;
const BUCKET_TURNS = 50;

/** skillCosts から基準コスト(正の数値の中央値)を出す */
function referenceCost(costs) {
    const v = Object.values(costs).filter((x) => typeof x === 'number' && x > 0).sort((a, b) => a - b);
    if (!v.length) return 1;
    const mid = v.length >> 1;
    return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

/** 1ゲーム分の記録係。手番が切り替わるたびに onTurnChange を呼ぶ */
function createTracker(s) {
    const n = s.magic.length;
    const lastEnd = s.magic.slice(); // 席ごとの前回手番終了時の魔力(初回は初期値)
    const rows = [];
    let cur = null; // { seat, turnIndex, start }
    return {
        /** 手番が切り替わった直後(新しい席の魔力は付与済み)に呼ぶ */
        onTurnChange(state) {
            if (cur) {
                const end = state.magic[cur.seat];
                rows.push({ seat: cur.seat, turn: cur.turnIndex, start: cur.start, end, income: cur.start - lastEnd[cur.seat], skills: state.gearSkills[cur.seat] || 0 });
                lastEnd[cur.seat] = end;
            }
            cur = { seat: state.turn, turnIndex: state.currentTurn, start: state.magic[state.turn] };
        },
        rows,
        seats: n,
    };
}

/** 全ゲームの rows を集計する */
function summarize(games, refCost, bucketTurns = BUCKET_TURNS) {
    const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
    const agg = (rows) => {
        const income = rows.reduce((a, r) => a + r.income, 0);
        const spent = rows.reduce((a, r) => a + (r.start - r.end), 0);
        const skills = rows.reduce((a, r) => a + (r.skills || 0), 0);
        // 実効コスト: 割引・ギア込みで実際に払った魔力 ÷ スキル数。スキルを撃っていない区間は素の基準コストで代用
        const effCost = skills > 0 && spent > 0 ? spent / skills : refCost;
        const stock = mean(rows.map((r) => r.start));
        return {
            turns: rows.length,
            income: mean(rows.map((r) => r.income)),
            stock,
            skillsPerTurn: rows.length ? skills / rows.length : null,
            effCost,
            stockToCost: stock == null ? null : stock / refCost,
            stockToEffCost: stock == null ? null : stock / effCost,
            spendRatio: income > 0 ? spent / income : null,
            // 手番終了時に実効コストの HOARD_MULT 倍以上を残した手番の割合(撃ち切れず持ち越した)
            hoardRate: rows.length ? rows.filter((r) => r.end >= HOARD_MULT * effCost).length / rows.length : null,
        };
    };
    const all = games.flat();
    const byBucket = {};
    for (const r of all) {
        const b = Math.floor(r.turn / bucketTurns);
        (byBucket[b] = byBucket[b] || []).push(r);
    }
    const buckets = Object.keys(byBucket).map(Number).sort((a, b) => a - b).map((b) => ({
        from: b * bucketTurns, to: (b + 1) * bucketTurns - 1, ...agg(byBucket[b]),
    }));
    // 統計が薄い区間(序盤区間の手番数の5%未満、または30手番未満)は総合指標に使わない
    const minTurns = Math.max(30, 0.05 * (buckets[0] ? buckets[0].turns : 0));
    const solid = buckets.filter((b) => b.turns >= minTurns);
    const first = solid[0], last = solid[solid.length - 1];
    const inflationIndex = first && last && first !== last && first.stockToEffCost > 0 ? last.stockToEffCost / first.stockToEffCost : null;
    return { referenceCost: refCost, hoardMult: HOARD_MULT, bucketTurns, overall: agg(all), buckets, inflationIndex };
}

module.exports = { createTracker, summarize, referenceCost, HOARD_MULT, BUCKET_TURNS };
