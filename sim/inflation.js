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

/**
 * マスの変化。減衰(毎手番、全コマのライフが自動で減る)は『誰も何もしていない』変化なので数えない。
 * 数えるのは、コマの有無・持ち主・効果(🌱🔑☠🔥❄⚡📜など)が変わったマス。
 * 1手番(1席の手番開始から次の手番開始まで)の間に、手番の席の行動と、そのあとの自動処理(毒・炎の継続ダメージ、補充)が入る。
 */
const cellKey = (sq) => `${sq.player || '-'}|${(sq.effects || []).map((e) => e.effect).sort().join('')}`;
const snapshotBoard = (board) => board.map(cellKey);
function boardChange(snap, board) {
    let changed = 0, pieces = 0;
    for (let i = 0; i < board.length; i++) {
        const k = cellKey(board[i]);
        if (snap && snap[i] !== k) {
            changed++;
            if ((snap[i].split('|')[0]) !== (k.split('|')[0])) pieces++; // コマが置かれた/奪われた/壊れたマス
        }
    }
    return { changed, pieces };
}

/** 1ゲーム分の記録係。手番が切り替わるたびに onTurnChange を呼ぶ */
function createTracker(s) {
    const n = s.magic.length;
    const lastEnd = s.magic.slice(); // 席ごとの前回手番終了時の魔力(初回は初期値)
    const rows = [];
    let cur = null; // { seat, turnIndex, start, snap }
    return {
        /** 手番が切り替わった直後(新しい席の魔力は付与済み)に呼ぶ */
        onTurnChange(state) {
            if (cur) {
                const end = state.magic[cur.seat];
                const { changed, pieces } = boardChange(cur.snap, state.board);
                rows.push({ seat: cur.seat, turn: cur.turnIndex, start: cur.start, end, income: cur.start - lastEnd[cur.seat], skills: state.gearSkills[cur.seat] || 0, changed, pieces, cells: state.board.length });
                lastEnd[cur.seat] = end;
            }
            cur = { seat: state.turn, turnIndex: state.currentTurn, start: state.magic[state.turn], snap: snapshotBoard(state.board) };
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
            // マスの変化(コマの有無・持ち主・効果が変わったマス)。盤の大きさで割った割合も出す
            changePerTurn: mean(rows.filter((r) => r.changed != null).map((r) => r.changed)),
            changeRate: mean(rows.filter((r) => r.changed != null).map((r) => r.changed / r.cells)),
            piecesPerTurn: mean(rows.filter((r) => r.pieces != null).map((r) => r.pieces)),
            // 盤面が動かなかった手番(チャージ・パス・効果の無いスキルだけ)の割合
            stillRate: rows.filter((r) => r.changed != null).length ? rows.filter((r) => r.changed === 0).length / rows.filter((r) => r.changed != null).length : null,
            // 魔力1あたりの盤面の変化(変換効率)。支出が無い手番は含めない
            changePerMagic: spent > 0 ? rows.reduce((a, r) => a + (r.changed || 0), 0) / spent : null,
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
    return { referenceCost: refCost, hoardMult: HOARD_MULT, bucketTurns, overall: agg(all), buckets, inflationIndex, matched: matchedAnalysis(games, refCost, bucketTurns, agg) };
}

/** 再現できる乱数(ブートストラップ用) */
function lcg(seed) { let a = seed >>> 0; return () => { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; return a / 4294967296; }; }

/**
 * 同じ試合どうしで序盤と後半を比べる。
 * 後半区間 = minGames 試合以上が届いている最後の区間(なければ null)。その区間に手番がある試合だけを集め、その試合の序盤区間と後半区間を比べる。
 * minGames の既定は max(20, 試合数の 20%)。ci95 は試合単位のブートストラップ(B 回の再標本)。
 */
function matchedAnalysis(games, refCost, bucketTurns, agg, minGamesOpt, B = 300) {
    const minGames = minGamesOpt != null ? minGamesOpt : Math.max(20, Math.ceil(0.2 * games.length));
    const bucketOf = (r) => Math.floor(r.turn / bucketTurns);
    const reach = {}; // 区間 -> その区間に手番がある試合の数
    for (const rows of games) for (const b of new Set(rows.map(bucketOf))) reach[b] = (reach[b] || 0) + 1;
    const lateBucket = Object.keys(reach).map(Number).filter((b) => b > 0 && reach[b] >= minGames).sort((a, b) => a - b).pop();
    if (lateBucket == null) return { minGames, note: `後半に ${minGames} 試合以上が届く区間が無い(試合が短い)。--bucket を小さくするか試合数を増やす`, index: null };
    const pairs = games.filter((rows) => rows.some((r) => bucketOf(r) === lateBucket)).map((rows) => ({ early: rows.filter((r) => bucketOf(r) === 0), late: rows.filter((r) => bucketOf(r) === lateBucket) }));
    const stat = (ps) => {
        const e = agg(ps.flatMap((p) => p.early)), l = agg(ps.flatMap((p) => p.late));
        return { index: e.stockToEffCost > 0 ? l.stockToEffCost / e.stockToEffCost : null, stockGrowth: e.stock > 0 ? l.stock / e.stock : null, incomeGrowth: e.income > 0 ? l.income / e.income : null, early: e, late: l };
    };
    const base = stat(pairs);
    const rnd = lcg(12345);
    const boots = [];
    for (let i = 0; i < B; i++) {
        const ps = []; for (let k = 0; k < pairs.length; k++) ps.push(pairs[Math.floor(rnd() * pairs.length)]);
        const s = stat(ps); if (s.index != null) boots.push(s.index);
    }
    boots.sort((a, b) => a - b);
    const q = (p) => (boots.length ? boots[Math.min(boots.length - 1, Math.floor(p * boots.length))] : null);
    return { minGames, lateFrom: lateBucket * bucketTurns, lateTo: (lateBucket + 1) * bucketTurns - 1, games: pairs.length, index: base.index, ci95: [q(0.025), q(0.975)], stockGrowth: base.stockGrowth, incomeGrowth: base.incomeGrowth, earlyStockToEffCost: base.early.stockToEffCost, lateStockToEffCost: base.late.stockToEffCost, earlyStillRate: base.early.stillRate, lateStillRate: base.late.stillRate, earlyChangeRate: base.early.changeRate, lateChangeRate: base.late.changeRate };
}

module.exports = { createTracker, summarize, referenceCost, matchedAnalysis, HOARD_MULT, BUCKET_TURNS };
