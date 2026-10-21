// @ts-check
'use strict';
/*
 * AI players for the simulator.
 *
 * 'faithful'  -> mirrors src/components/game/AIPlayer.ts (enhanced version):
 *                evaluation function + minimax + strategic skill usage.
 * 'capture'   -> win/block/capture/random (legacy stronger baseline).
 * 'random'    -> pure random (strength benchmark baseline).
 */

const { SYMBOLS, calculateWinner, findEmptyIndexes, costsOf, gearCost, necromancyPay, SKILLS,
        curPlayer, curChar, curMagic, calculateCost, placeMove, judgeDayCost, totalAssaultCost,
        miasmaCost, miasmaPlan, otherSeats, POOL_SIZE, suckerTargets, bestSuckerTarget, ownBuds, infernoTargets, hasAilment, glacierCost, infernoCost, INFERNO_FREE_SKILLS, FIRE_DAMAGE, chargeOneCost, chargeSpreadCost, chargeStacks, orthoNeighbors, isShielded, connectedPieces } = require('./engine');
const { geometryForCells } = require('./geometry');
const thermal = require('./thermal');
const E = require('./engine');
const discountMod = require('./discount');
const { lineCells } = require('./geometry');

// 多人数対応: 盤上のコマは参加者のものだけなので、自分以外のコマ = 敵。敵が複数いるときは
// 探索木では先頭の敵を「相手役」に代表させ、深さは盤サイズで制限する (AIPlayer.ts と同じ)
const isEnemy = (player, me) => player !== undefined && player !== me;
const opponentsOf = (s) => otherSeats(s).map((seat) => SYMBOLS[seat]);
const searchDepth = (board) => (board.length <= 16 ? 3 : board.length <= 25 ? 2 : 1);

const TURN_ENDING = ['charge', 'opium', 'tsunami'];

// ---- A/B 検証用のノブ ----
// 採用済みの設定は AI_DEFAULTS に書く。検証中は s.aiFlags[seat] = { 名前: 値 } で席ごとに上書きできる
// （probe-ai.js が同一シードで改修前後を paired 比較する）。採用が決まったら AI_DEFAULTS へ移し、不採用なら分岐ごと消す。
// ban='33|36' はそのスキルidxを手札にあっても使わない（スキル単体の寄与を測る用）。
const AI_DEFAULTS = {
    frzBlock: 1, // 氷室の番人が単独の脅威を氷結で塞ぐ（A/B採用）
    cryoCards: 1, // 氷室の番人が霜降り・氷結トークン・氷結ダブルトークンを使う（tune-top: 環境勝率 seed2/200 で +9.1pt）
    pyroLock: 0, // 鍛冶師が軽減札を手札に固定する。A/Bで勝ち数が下がった(あなた-8/巨人-8)ので無効（1で有効）
    burnoutAfter: 1, // 鍛冶師が業火のあと（🔥のマスで敵が自陣より2つ以上多く壊れるなら）バーンアウトを撃つ（A/B）
    discountInferno: 1, // 固有スキル(業火)が撃てる状況なら、軽減札で無料でなくても安く撃てる/撃てるようになるとき軽減札を先に撃つ（A/B）
    discountPlan: 1, // 軽減札(特売・活力特売・大特価)を、撃てるスキルが増えるときに先に撃つ。2なら手札に無いとき1コストで引き直して探す（A/B）
    pyroChain: 1, // 煉獄の鍛冶師が軽いスキルを連打して業火を無料で撃つ（ユーザー指定。0で無効にして A/B 比較できる）
    cryoPoison: 1, // 毒使いが霜降り・氷結トークン系を使う(自陣の毒マスを凍らせて毒ダメージから守る)。デッキに45/46/48を入れる前提(tune-top poisoner: 環境勝率 seed5/150 +7.7pt, seed6/200 +4.5pt)
    magLockN: 3, // 魔法使いが1手番にロックするバッズ駒の最大数（A/B: 環境勝率 +2.9/+3.0/+3.5pt。本番は AIPlayer.ts の MAGICIAN_MAX_LOCKS）
    unblock: 2,  // 自分のリーチを塞ぐ氷結空きマスを、火遁(idx31)で隣のコマ（敵優先・無ければ自陣）を燃やして解凍し同じ手番で完成させる（A/B採用）
};
let F = AI_DEFAULTS;
function loadFlags(s) {
    const o = s.aiFlags && s.aiFlags[s.turn];
    F = o ? Object.assign({}, AI_DEFAULTS, o) : AI_DEFAULTS;
}
const INJ_MIN = 10; // インジェクション発動の最低ライン価値 (A/B: seed1-3 で毒使い勝率 +1.3〜+3.8pt)
// 対策ロックの対象(敵がこのキャラなら、自コマを事前にロックして守る)
const ANTI_LOCK_VS = ['necromancer', 'poisoner', 'yinYangMaster'];
const LINE_SCORES = [0, 1, 10, 50, 1000];

// 巨人ストンプ: 破壊範囲に敵が最も多い中心を選ぶ (敵2体以上で価値あり)。なければ null
function bestStompTarget(board, me) {
    const geo = geometryForCells(board.length);
    let bestIdx = null, bestEnemies = 0, bestEmptyCenter = false;
    for (let i = 0; i < board.length; i++) {
        if (shield.has(i)) continue;
        let enemies = 0;
        // 氷結中の敵コマはスキルダメージを❄1つ肩代わりするだけで壊れないので数えない
        for (const idx of geo.stompRange(i)) if (isEnemy(board[idx].player, me) && !thermal.isFrozen(board[idx])) enemies++;
        const emptyCenter = !board[i].player; // 中心が空なら巨人のコマを配置できる
        if (enemies > bestEnemies || (enemies === bestEnemies && emptyCenter && !bestEmptyCenter)) {
            bestEnemies = enemies; bestIdx = i; bestEmptyCenter = emptyCenter;
        }
    }
    return bestEnemies >= 2 ? bestIdx : null;
}

// 魔法使い審判の日: 十字範囲で (敵破壊 - 自軍破壊) が最大の中心を選ぶ (純増2以上で価値あり)
function bestJudgeTarget(board, me) {
    const geo = geometryForCells(board.length);
    let bestIdx = null, bestNet = 0;
    for (let i = 0; i < board.length; i++) {
        if (shield.has(i)) continue;
        let enemy = 0, mine = 0;
        for (const idx of geo.judgeRange(i)) {
            const sq = board[idx];
            const locked = sq.effects.some(e => e.effect === '🔑');
            const protectedBud = sq.player === me && sq.effects.some(e => e.effect === '🌱');
            if (locked && protectedBud) continue; // 守られている駒は消えない
            if (thermal.isFrozen(sq)) continue; // 氷結中は❄1つが身代わりになり、敵も自陣も壊れない
            if (isEnemy(sq.player, me)) enemy++;
            else if (sq.player === me) mine++;
        }
        const net = enemy - mine;
        if (net > bestNet) { bestNet = net; bestIdx = i; }
    }
    return bestNet >= 2 ? bestIdx : null;
}

// 敵駒 i が「どかさないと負ける列」(その持ち主が3つ揃い・自駒なし・他の敵駒なし・残り1マスが空き) に含まれるか
function inOppReachLine(board, i, me) {
    const owner = board[i].player;
    for (const line of geometryForCells(board.length).winLines) {
        if (!line.includes(i)) continue;
        let op = 0, other = 0, empty = 0, blocked = false;
        for (const idx of line) {
            if (board[idx].player === owner) op++;
            else if (board[idx].player) other++; // 自駒や別の敵駒が混ざっていれば脅威ではない
            else { empty++; if (thermal.emptyBlocked(board[idx])) blocked = true; } // 着手不能（氷結中の空き）な4つ目は脅威ではない
        }
        if (op === 3 && other === 0 && empty === 1 && !blocked) return true;
    }
    return false;
}

// 毒使い インジェクション: 敵コマ1つに毒を1付与。次の着手の減衰で bind が 0 になれば消える。
// 消えるまでの手数が少なく、そのコマが通る敵ライン(自駒・他の敵駒なし)の価値(LINE_SCORES)が高いものを狙う。なければ null
function bestInjectionTarget(board, me, minValue) {
    const geo = geometryForCells(board.length);
    let bestIdx = null, bestVal = 0;
    for (let i = 0; i < board.length; i++) {
        const sq = board[i];
        if (!isEnemy(sq.player, me) || shield.has(i)) continue;
        const p = sq.effects.filter(e => e.effect === '☠').length + 1; // 付与後の毒数（休眠マスは継続ダメージが無く、毒では倒れない）
        if (thermal.isDormant(sq)) continue;
        const turns = Math.ceil(sq.bind / (1 + p)); // 1手ごとに 1+毒数 減る
        if (turns > 2) continue;
        let val = 0;
        for (const line of geo.winLines) {
            if (!line.includes(i)) continue;
            let oc = 0, foreign = 0;
            for (const idx of line) { if (board[idx].player === sq.player) oc++; else if (board[idx].player) foreign++; }
            if (foreign === 0) val += LINE_SCORES[Math.min(oc, 4)];
        }
        val = turns === 1 ? val : val / 2;
        if (val > bestVal) { bestVal = val; bestIdx = i; }
    }
    return bestVal >= minValue ? bestIdx : null;
}

// 毒使いミアズマ: 自陣の毒マスの周囲の敵マスに毒を撒き、自陣の毒は消える（対象選択なし）。
// 敵2マス以上、または敵1マス+リーチ列(=3)なら撃つ価値あり。
function miasmaScore(s, me) {
    const plan = miasmaPlan(s, me);
    let critical = 0;
    for (const j of plan.keys()) if (inOppReachLine(s.board, j, me)) critical++;
    return plan.size + critical * 2;
}

const MIST_MIN_ENEMIES = Number(process.env.MIST_MIN_ENEMIES) || 4; // 毒霧を撃つ敵コマ数の下限
const MIST_MIN_LEAD = Number(process.env.MIST_MIN_LEAD) || 2;       // 敵コマが自コマより何個多いか
const MIASMA_MIN_SCORE = 2; // 敵2マス、または敵1マス+リーチ列(=3)

// 対ネクロ: 蘇生中は bind0 の鍵無しコマが丸ごと吸収される。自コマのうち低 bind で、通っている自ラインの価値が高いものを選ぶ
function bestAntiNecroLockTarget(board, me) {
    const geo = geometryForCells(board.length);
    let bestIdx = null, bestVal = 0;
    for (let i = 0; i < board.length; i++) {
        const sq = board[i];
        // ⚡で無敵の自コマは誰も触れず、ロックの対象にもできない(クリックが空振りしてロックの選択待ちで止まる)
        if (sq.player !== me || sq.bind > 3 || shield.has(i) || sq.effects.some(e => e.effect === '🔑')) continue;
        let val = 1;
        for (const line of geo.winLines) {
            if (!line.includes(i)) continue;
            let mc = 0, foreign = 0;
            for (const idx of line) { if (board[idx].player === me) mc++; else if (board[idx].player) foreign++; }
            if (foreign === 0) val += LINE_SCORES[Math.min(mc, 4)];
        }
        if (val > bestVal) { bestVal = val; bestIdx = i; }
    }
    return bestIdx;
}

// ---- 帯電（雷霆の巫）AI ----
// 無敵(⚡付き雷霆の巫の自陣マス)は誰も触れない。手番開始時に集合を作り、候補列挙・スキル対象から除外する
let shield = new Set();
function updateShield(s) {
    shield = new Set();
    for (let i = 0; i < s.board.length; i++) if (isShielded(s, s.board[i])) shield.add(i);
}
const sizeOf = (board) => Math.round(Math.sqrt(board.length));

// 着手マス i が発火させる⚡の損得。敵コマ(ライフ>0)を削れば加点、自コマを削れば減点。
// ライフ1のコマは0になる(=奪取可能になる/守りが剥がれる)ので重く見る
// 雷霆の巫の席のシンボル集合（自陣由来の発火ダメージが効かない側）
function electricianSymbols(s) {
    const set = new Set();
    s.chars.forEach((c, seat) => { if (c === 'electrician') set.add(SYMBOLS[seat]); });
    return set;
}
function fireGain(board, i, me, electricians) {
    const size = sizeOf(board);
    let gain = 0;
    const W = Number(process.env.CHG_FIRE_W) || 1; // A/B検証用: 発火の損得の重み
    for (const k of orthoNeighbors(i, size)) {
        if (chargeStacks(board[k]) === 0 || thermal.isDormant(board[k])) continue; // 休眠マス（氷結中）の⚡は発火しない
        for (const n of orthoNeighbors(k, size)) {
            const sq = board[n];
            if (!sq.player || sq.bind <= 0) continue;
            if (sq.effects.some((e) => e.effect === '🔑') || thermal.isFrozen(sq)) continue;
            if (sq.player === board[k].player && electricians.has(sq.player)) continue; // 自陣由来の発火は雷霆の巫に効かない
            // 発火ダメージで 0 になる(=奪取可能になる/守りが剥がれる)コマは重く見る
            const w = 3 * Math.min(FIRE_DAMAGE, sq.bind) + (sq.bind <= FIRE_DAMAGE ? 4 : 0);
            gain += (isEnemy(sq.player, me) ? w : -w) * W;
        }
    }
    return gain;
}

// 自コマ i が入っている列のうち、他の席のコマが無く自コマが最も多い列の自コマ数 (i を含む)
function bestOwnLineCount(board, i, me) {
    let best = 0;
    for (const line of geometryForCells(board.length).winLines) {
        if (!line.includes(i)) continue;
        let mine = 0, bad = false;
        for (const idx of line) {
            if (board[idx].player === me) mine++;
            else if (board[idx].player) bad = true;
        }
        if (!bad && mine > best) best = mine;
    }
    return best;
}

// 帯電付与の対象。2通りの価値の大きいほう:
//  攻め: 縦横隣接の (敵コマ数 − 自コマ数)（ライフ>0のコマのみ）
//  守り: ライフ0〜1(奪われやすい)の自コマが、他の席のいない列で自コマ2つ以上(リーチ列なら3つ)の一部なら、
//        ⚡の無敵で守る (雷霆の巫のパッシブ)
// 値が MIN 以上なら撃つ。ロック中・無敵マス・すでに帯電したマスは除く
const CHARGE_ONE_MIN_SCORE = Number(process.env.CHG_ONE_MIN) || 2; // CHG_ONE_MIN: A/B検証用の上書き
function bestChargeOneTarget(board, me) {
    const size = sizeOf(board);
    let bestIdx = null, bestScore = 0;
    for (let i = 0; i < board.length; i++) {
        if (shield.has(i) || board[i].effects.some((e) => e.effect === '🔑')) continue;
        if (chargeStacks(board[i]) > 0 || thermal.isDormant(board[i])) continue; // 休眠マスの⚡は働かない
        let attack = 0;
        for (const n of orthoNeighbors(i, size)) {
            const sq = board[n];
            if (!sq.player || sq.bind <= 0 || thermal.isFrozen(sq)) continue; // 氷結中のコマは隣接⚡のダメージを受けない
            if (isEnemy(sq.player, me)) attack++; else attack--;
        }
        let defend = 0;
        if (board[i].player === me && board[i].bind <= 1) {
            const own = bestOwnLineCount(board, i, me);
            if (own >= 3) defend = 4; else if (own === 2) defend = 2;
        }
        const score = Math.max(attack, defend);
        if (score > bestScore) { bestScore = score; bestIdx = i; }
    }
    return bestScore >= CHARGE_ONE_MIN_SCORE ? bestIdx : null;
}

// 固有スキル(帯電拡散): 辿れる範囲(コマのあるマスだけ)が
//  - 他の席のいない列で自コマ3つ(リーチ列)を含む → 無敵で守る、または
//  - 自コマ3つ以上で、範囲内/縦横隣接に敵コマ(ライフ>0)が2体以上
// のとき、その起点を選ぶ
function bestChargeSpreadTarget(board, me) {
    const size = sizeOf(board);
    let bestIdx = null, bestScore = 0;
    for (let i = 0; i < board.length; i++) {
        if (!board[i].player || shield.has(i)) continue;
        const cells = connectedPieces(board, i, size);
        const mine = cells.filter((k) => board[k].player === me).length;
        let reach = false;
        for (const k of cells) if (board[k].player === me && bestOwnLineCount(board, k, me) >= 3) reach = true;
        const adj = new Set();
        for (const k of cells) for (const n of orthoNeighbors(k, size)) if (isEnemy(board[n].player, me) && board[n].bind > 0 && !thermal.isFrozen(board[n]) && !cells.includes(n)) adj.add(n);
        // 範囲内の敵コマ自身も帯電させる(隣接で巻き込める)ので、範囲内の敵(ライフ>0)も数える
        for (const k of cells) if (isEnemy(board[k].player, me) && board[k].bind > 0 && !thermal.isFrozen(board[k])) adj.add(k);
        const ok = reach || (mine >= 3 && adj.size >= 2);
        if (!ok) continue;
        const score = adj.size + mine + (reach ? 10 : 0);
        if (score > bestScore) { bestScore = score; bestIdx = i; }
    }
    return bestIdx;
}

// 範囲帯電(3x3): 範囲内の (敵コマ数 − 自コマ数)（ライフ>0のコマのみ）が 2 以上の中心を選ぶ（3 だと 0.01回/試合で撃たれず、2 に緩めた）
const CHARGE_AREA_MIN_SCORE = Number(process.env.CHG_AREA_MIN) || 2; // A/B検証用の上書き
function bestChargeAreaTarget(board, me) {
    const geo = geometryForCells(board.length);
    let bestIdx = null, bestScore = 0;
    for (let i = 0; i < board.length; i++) {
        if (shield.has(i)) continue;
        let score = 0;
        for (const k of geo.stompRange(i)) {
            const sq = board[k];
            if (!sq.player || sq.bind <= 0 || thermal.isFrozen(sq)) continue;
            if (isEnemy(sq.player, me)) score++; else score--;
        }
        if (score > bestScore) { bestScore = score; bestIdx = i; }
    }
    return bestScore >= CHARGE_AREA_MIN_SCORE ? bestIdx : null;
}

// ジャマー: ⚡マスを選び、縦横隣接の敵コマ(ライフ>0・ロックなし)に⚡のスタック数のダメージ。
// ライフ0にできる敵が2体以上、敵のリーチ列の要(どかさないと負ける駒)をライフ0にできる、または与ダメージ合計が2以上なら撃つ。
// ライフ0になった敵は同じ手番で奪取できる。他人の無敵マスは選べない
const JAM_MIN_DMG = process.env.JAM_MIN_DMG != null ? Number(process.env.JAM_MIN_DMG) : 2; // 与ダメージ合計がこの値以上でも撃つ（0=無効。A/B検証用に上書き可）
function bestJammerTarget(board, me) {
    const size = sizeOf(board);
    let bestIdx = null, bestScore = 0;
    for (let k = 0; k < board.length; k++) {
        const n = chargeStacks(board[k]);
        if (n === 0 || thermal.isDormant(board[k]) || (shield.has(k) && board[k].player !== me)) continue; // 氷結中の⚡は休眠
        let zeroed = 0, critical = 0, dmg = 0;
        for (const j of orthoNeighbors(k, size)) {
            const sq = board[j];
            if (!isEnemy(sq.player, me) || sq.bind <= 0 || sq.effects.some((e) => e.effect === '🔑') || thermal.isFrozen(sq)) continue;
            dmg += Math.min(n, sq.bind);
            if (sq.bind <= n) { zeroed++; if (inOppReachLine(board, j, me)) critical++; }
        }
        if (zeroed >= 2 || critical >= 1 || (JAM_MIN_DMG > 0 && dmg >= JAM_MIN_DMG)) {
            const score = zeroed + critical * 2 + dmg * 0.1;
            if (score > bestScore) { bestScore = score; bestIdx = k; }
        }
    }
    return bestIdx;
}

// 対氷結の能動策 (ai-improve)。自分のリーチの4つ目が氷結中の空きマスで塞がれているときの、そのマスと、解凍に使える隣のコマ
function blockedReachCell(board, me) {
    for (const line of geometryForCells(board.length).winLines) {
        let mine = 0, other = 0, blockedIdx = -1, free = 0;
        for (const idx of line) {
            const sq = board[idx];
            if (sq.player === me) mine++;
            else if (sq.player) other++;
            else if (thermal.emptyBlocked(sq)) blockedIdx = idx;
            else free++;
        }
        if (mine === 3 && other === 0 && blockedIdx !== -1 && free === 0) return blockedIdx;
    }
    return null;
}
// 火炎付与で k の氷結を解く対象: k の縦横隣のコマで氷結・ロック・無敵でないもの（敵を優先。allowOwn なら自陣も可）
function thawIgniteTarget(board, k, me, allowOwn) {
    const size = sizeOf(board);
    let own = null;
    for (const n of orthoNeighbors(k, size)) {
        const sq = board[n];
        if (!sq.player || thermal.isFrozen(sq) || shield.has(n) || sq.effects.some((e) => e.effect === '🔑')) continue;
        if (isEnemy(sq.player, me)) return n;
        if (own === null) own = n;
    }
    return allowOwn ? own : null;
}

// ---- スキル単体の強さを測るための強制使用 (F.force) ----
// F.force='33|36': そのidxのスキルが手札にあり（F.forceAny なら手札に関わらず毎手番使える扱い）、魔力が足り、使える状況なら、
// 手番の中で1回、簡易評価で最善の対象を選んで撃つ。自分に即勝ちの着手がある手番は撃たない。AI本体の方針（撃つ条件）の検証ではなく、
// 「撃てたときの価値」を測るための較正用。F.useNew は暫定の採用候補（別途）。
function forceEval(board, me) {
    let sc = evaluateBoard(board, me);
    for (const sq of board) {
        if (!sq.player || sq.bind <= 0) continue;
        const sgn = sq.player === me ? -1 : 1; // 敵に付けば+、自陣に付けば−
        sc += sgn * 3 * Math.min(3, thermal.flameStacks(sq));
        sc += sgn * 2 * (sq.effects.filter((e) => e.effect === '☠').length);
        sc -= sgn * 2 * Math.min(2, thermal.frozenStacks(sq)); // 氷結は自陣に付けば+、敵に付けば−
        sc += sgn * 1 * Math.min(2, sq.effects.filter((e) => e.effect === '⚡').length);
    }
    return sc;
}
const copyBoard = (board) => board.map((sq) => ({ ...sq, effects: sq.effects.slice() }));
function pickByEval(s, me, cands, apply) {
    let best = null, bestSc = -Infinity;
    for (const c of cands) {
        const b = copyBoard(s.board);
        apply(b, c);
        const sc = forceEval(b, me);
        if (sc > bestSc) { bestSc = sc; best = c; }
    }
    return best;
}
const pieceCells = (s) => s.board.map((sq, i) => (sq.player && !shield.has(i) ? i : -1)).filter((i) => i !== -1);
const allCells = (s) => s.board.map((_, i) => i).filter((i) => !shield.has(i));
function forceTable(s, me) {
    const size = s.size;
    const geo = geometryForCells(s.board.length);
    const empties = () => findEmptyIndexes(s.board).length > 0;
    return {
        2: { key: 'buds', cost: 'onClickBuds' },
        10: { key: 'doubleBuds', cost: 'onClickDoubleBuds' },
        3: { key: 'token', cost: 'onClickToken', token: true, legal: empties },
        14: { key: 'walpurgis', cost: 'onClickWalpurgisNight', legal: () => s.board.some((sq) => sq.player) },
        15: { key: 'injection', cost: 'onClickInjection', poison: true, cands: () => pieceCells(s).filter((i) => isEnemy(s.board[i].player, me)), apply: (b, c) => b[c].effects.push({ effect: '☠' }) },
        19: { key: 'pandemic', cost: 'onClickPandemic', poison: true, cands: () => allCells(s), apply: (b, c) => { for (const k of geo.stompRange(c)) if (b[k].player) b[k].effects.push({ effect: '☠' }); } },
        22: { key: 'chargeOne', costFn: () => chargeOneCost(s), cands: () => allCells(s).filter((i) => !s.board[i].effects.some((e) => e.effect === '🔑')), apply: (b, c) => b[c].effects.push({ effect: '⚡' }), pick: () => bestChargeOneTarget(s.board, me) },
        29: { key: 'poisonMist', cost: 'onClickPoisonMist', poison: true, legal: () => s.board.some((sq) => sq.player) },
        30: { key: 'freeze', cost: 'onClickFreeze', cands: () => allCells(s).filter((i) => thermal.canFreeze(s.board[i])), apply: (b, c) => thermal.freeze(b, [c]) },
        31: { key: 'ignite', cost: 'onClickIgnite', cands: () => pieceCells(s), apply: (b, c) => thermal.ignite(b, [c], size, 1) },
        32: { key: 'cleanse', cost: 'onClickCleanse', legal: () => hasAilment(s.board, me) },
        33: { key: 'harvestEve', cost: 'onClickHarvestEve', legal: () => ownBuds(s) >= 1 },
        34: { key: 'solstice', cost: 'onClickSolstice', legal: () => !s.budGuard[s.turn] },
        35: { key: 'sucker', cost: 'onClickSucker', cands: () => E.suckerTargets(s), pick: () => bestSuckerTarget(s) },
        36: { key: 'windborne', cost: 'onClickWindborne', legal: () => thermal.sowCandidates(s.board, me).length > 0 },
        37: { key: 'flameToken', cost: 'onClickFlameToken', token: true, legal: empties },
        38: { key: 'doubleFlameToken', cost: 'onClickDoubleFlameToken', token: true, legal: empties },
        39: { key: 'swidden', cost: 'onClickSwidden', cands: () => E.swiddenTargets(s), apply: (b, c) => thermal.swidden(b, c, size) },
        40: { key: 'sacrifice', cost: 'onClickSacrifice', cands: () => E.sacrificeCandidates(s), apply: (b, c) => thermal.sacrificeFlame(b, c, me, size, null) },
        41: { key: 'frostArea', cost: 'onClickFrostArea', cands: () => allCells(s), apply: (b, c) => thermal.freeze(b, geo.stompRange(c)) },
        42: { key: 'icicle', cost: 'onClickIcicle', cands: () => { const o = []; for (const c of allCells(s)) for (const d of ['row', 'col', 'diag', 'anti']) o.push({ c, d }); return o; }, apply: (b, x) => thermal.freeze(b, lineCells(size, x.c, x.d)), place: (x) => { s.icicleDir = x.d; return x.c; } },
        43: { key: 'randomFreeze', cost: 'onClickRandomFreeze', legal: () => thermal.randomFreezeCandidates(s.board).length > 0 },
        44: { key: 'freezeSpread', cost: 'onClickFreezeSpread', cands: () => pieceCells(s), apply: (b, c) => thermal.freeze(b, connectedPieces(b, c, size)) },
        45: { key: 'frostToken', cost: 'onClickFrostToken', token: true, legal: empties },
        46: { key: 'doubleFrostToken', cost: 'onClickDoubleFrostToken', token: true, legal: empties },
        47: { key: 'shatter', cost: 'onClickShatter', cands: () => E.shatterTargets(s), apply: (b, c) => thermal.shatter(b, c) },
        48: { key: 'frostfall', cost: 'onClickFrostfall', legal: () => thermal.frostfallTargets(s.board, me).length > 0 },
    };
}
// 撃つ順（ライフ3→バイバインの順で次の駒のライフが伸びる。刈り入れ前夜は🌱を刈るので最後）。0/1 は常に撃てる
// 軽減札を使った連携: 軽減札(大特価・活力特売・特売)を先に撃つと、この手番に撃てるスキルが増える/魔力が余るなら撃つ。
// 判定は chooseSkills をそのまま使い、軽減を掛けた状態で選び直した結果と比べる。discountPlan>=2 なら、撃てるスキルが出ないとき
// 魔力に余裕があれば軽減札を撃ってから1コストで引き直し（最大2回）、軽減で撃てる別のスキルを探す
const DISCOUNT_REDUCERS = [
    { idx: 60, key: 'counterMarkdown', cost: 'onClickCounterMarkdown' }, // 直前に相手がスキルを使っていれば0コスト
    { idx: 58, key: 'clearance', cost: 'onClickClearance' },
    { idx: 56, key: 'vitalMarkdown', cost: 'onClickVitalMarkdown' },
    { idx: 53, key: 'markdown', cost: 'onClickMarkdown' },
];
const DISCOUNT_ALL = DISCOUNT_REDUCERS.concat([{ idx: 57, key: 'uniqueDiscount', cost: 'onClickUniqueDiscount' }]);
function discountPlan(s, me, availableSkills) {
    if (!F.discountPlan || s.silenced[s.turn]) return;
    const seat = s.turn;
    // 業火: 撃てる状況(ライフが残る敵コマ3個以上)なら、軽減札で業火が安くなる/撃てるようになるとき、合計コストが最小の軽減札を先に撃つ
    if (F.discountInferno && curChar(s) === 'pyromancer' && !s.infernoReady[seat]
        && s.board.filter((sq) => sq.player && sq.player !== me && sq.bind > 0).length >= 3 && infernoTargets(s).length > 0) {
        for (let i = 0; i < 3; i++) {
            const cur = infernoCost(s);
            if (cur === 0) break;
            let pick = null;
            for (const r of DISCOUNT_ALL) {
                if (!availableSkills.includes(r.idx) || !discountMod.canUseDiscountSkill(s.discount[seat], r.cost, s.life)) continue;
                const rc = calculateCost(s, costsOf(s)[r.cost], false, false, r.cost);
                if (curMagic(s) < rc) continue;
                const prevD = s.discount[seat];
                s.discount[seat] = discountMod.afterSkill(prevD, r.cost);
                const ic = infernoCost(s);
                s.discount[seat] = prevD;
                const total = rc + ic;
                if (total <= curMagic(s) && total < cur && (!pick || total < pick.total)) pick = { r, total };
            }
            if (!pick) break;
            SKILLS[pick.r.key](s);
            availableSkills = availableSkills.filter((x) => x !== pick.r.idx);
        }
    }
    if (s.discount[seat].next > 0) return;
    const base = chooseSkills(s, availableSkills);
    if (base.some((sk) => TURN_ENDING.includes(sk))) return;
    const baseLeft = curMagic(s) - base.spent;
    let best = null;
    for (const r of DISCOUNT_REDUCERS) {
        if (!availableSkills.includes(r.idx)) continue;
        const rc = calculateCost(s, costsOf(s)[r.cost], false, false, r.cost);
        if (curMagic(s) < rc) continue;
        const prevMagic = s.magic[seat], prevD = s.discount[seat];
        s.magic[seat] -= rc;
        s.discount[seat] = discountMod.afterSkill(prevD, r.cost);
        const plan = chooseSkills(s, availableSkills.filter((i) => i !== r.idx));
        const left = s.magic[seat] - plan.spent;
        s.magic[seat] = prevMagic; s.discount[seat] = prevD;
        if (plan.length > base.length || (plan.length === base.length && plan.length > 0 && left > baseLeft)) {
            if (!best || plan.length > best.n || (plan.length === best.n && left > best.left)) best = { r, n: plan.length, left };
        }
    }
    if (best) { SKILLS[best.r.key](s); return; }
    // 手札では撃てるスキルが増えない: 魔力に余裕があれば、軽減してから引き直して探す
    if ((F.discountPlan >= 2 || curChar(s) === 'magician') && base.length === 0) { // 魔法使いは引き直しが有効（A/B: 環境勝率 +1.7pt）。本番AIは AIPlayer.planReroll
        const r = DISCOUNT_REDUCERS.find((x) => availableSkills.includes(x.idx) && curMagic(s) >= calculateCost(s, costsOf(s)[x.cost], false, false, x.cost) + 2 + 4);
        if (!r) return;
        SKILLS[r.key](s);
        for (let i = 0; i < 2; i++) {
            if (curMagic(s) < costsOf(s).onClickShuffle + 2) return;
            E.shuffleHand(s);
            if (chooseSkills(s, s.skills.filter((x) => x !== r.idx)).length > 0) return;
        }
    }
}
// 鍛冶師が手札に固定する軽量スキル: 軽減札（特売・付与割引・トークン割引・活力特売・返し特売）。毎ターン手札に残して連携に使う
const PYRO_LOCK = [60, 53, 54, 55, 56];
const PYRO_FILLERS = [53, 54, 55, 56, 36, 0, 1, 34, 32, 33];
const PYRO_EXTRA = {
    0: { key: 'addLife', cost: 'onClickAddLife' }, 1: { key: 'bibine', cost: 'onClickBibine' },
    // コスト軽減札(idx 53-56)は1〜2コストで、足りない種類数を安く埋められる
    53: { key: 'markdown', cost: 'onClickMarkdown' }, 54: { key: 'effectDiscount', cost: 'onClickEffectDiscount' },
    55: { key: 'tokenDiscount', cost: 'onClickTokenDiscount' }, 56: { key: 'vitalMarkdown', cost: 'onClickVitalMarkdown' },
};
// 軽量→シャッフル→軽量: 手札に軽いスキルが無ければ1コストで引き直しながら、異なる3種類を揃える。
// 揃えるのに必要な魔力（軽い順の3種類 + シャッフル余裕）が手元にあるときだけ始める
const PYRO_COSTS = [1, 1, 1, 2, 2, 3];
function pyroChainShuffle(s, me, table) {
    const kinds = s.skillKinds[s.turn];
    let need = INFERNO_FREE_SKILLS - kinds.size;
    const budget = PYRO_COSTS.slice(0, need).reduce((n, c) => n + c, 0) + need;
    if (curMagic(s) < budget) return;
    for (let step = 0; step < 8 && need > 0; step++) {
        const picks = [];
        for (const idx of PYRO_FILLERS) {
            const t = PYRO_EXTRA[idx] || table[idx];
            if (!s.skills.includes(idx) || !t || kinds.has(t.cost) || (t.legal && !t.legal())) continue;
            picks.push({ t, cost: calculateCost(s, costsOf(s)[t.cost]) });
        }
        picks.sort((a, b) => a.cost - b.cost);
        if (picks.length && curMagic(s) >= picks[0].cost) { SKILLS[picks[0].t.key](s); need = INFERNO_FREE_SKILLS - kinds.size; continue; }
        if (curMagic(s) < costsOf(s).onClickShuffle + 2) return;
        E.shuffleHand(s);
    }
}
function pyroChain(s, me, availableSkills) {
    if (!F.pyroChain || curChar(s) !== 'pyromancer') return;
    // 無料権は手番を跨いで持ち越せるので、業火を撃てる状況でなくても先に貯める（業火が撃てる状況なら直後に無料で撃つ）
    const kinds = s.skillKinds[s.turn];
    const need = INFERNO_FREE_SKILLS - kinds.size;
    const normal = infernoCost(s);
    if (s.infernoReady[s.turn] || need <= 0 || normal === 0) return;
    const table = forceTable(s, me);
    if (F.pyroChain >= 2) { pyroChainShuffle(s, me, table); return; }
    const picks = [];
    for (const idx of PYRO_FILLERS) {
        const t = PYRO_EXTRA[idx] || table[idx];
        if (!availableSkills.includes(idx) || !t || kinds.has(t.cost) || (t.legal && !t.legal())) continue;
        picks.push({ idx, t, cost: calculateCost(s, costsOf(s)[t.cost]) });
    }
    const chosen = picks.sort((a, b) => a.cost - b.cost).slice(0, need);
    if (chosen.length < need) return;
    const total = chosen.reduce((n, c) => n + c.cost, 0);
    if (total > normal || total > curMagic(s)) return;
    chosen.sort((a, b) => PYRO_FILLERS.indexOf(a.idx) - PYRO_FILLERS.indexOf(b.idx));
    for (const c of chosen) {
        if (c.t.legal && !c.t.legal()) return;
        if (curMagic(s) < calculateCost(s, costsOf(s)[c.t.cost])) return;
        SKILLS[c.t.key](s);
    }
}
/** 強制使用。撃ったら true */
function forceUse(s, me, availableSkills) {
    const list = String(F.force).split('|').map(Number);
    const table = forceTable(s, me);
    // 勝ち手があるなら先に着手する
    const moves = new Set([...findEmptyIndexes(s.board), ...getValidMoves(s.board, me, curChar(s))]);
    for (const m of moves) if (calculateWinner(simulatePlace(s.board, m, me, s.life).map((q) => q.player)) === me) return false;
    for (const idx of list) {
        if (!(F.forceAny || availableSkills.includes(idx))) continue;
        const t = table[idx];
        if (!t) continue;
        if (t.token && s.usedTokenThisTurn) continue;
        if (t.legal && !t.legal()) continue;
        const cost = t.costFn ? t.costFn() : calculateCost(s, costsOf(s)[t.cost], !!t.token, !!t.poison);
        if (curMagic(s) < cost) continue;
        let target = null;
        if (t.cands) {
            const cands = t.cands();
            if (!cands.length) continue;
            target = t.pick ? t.pick() : null;
            if (target === null || target === undefined) target = t.apply ? pickByEval(s, me, cands, t.apply) : cands[0];
            if (target === null || target === undefined) continue;
            // 評価の改善幅が F.forceGain 未満なら撃たない（選んで撃つ: 無条件の強制使用は魔力を浪費して悪化したため）
            if (F.forceGain && t.apply) {
                const b = copyBoard(s.board);
                t.apply(b, target);
                if (forceEval(b, me) - forceEval(s.board, me) < F.forceGain) continue;
            }
        }
        SKILLS[t.key](s);
        if (t.cands) placeMove(s, t.place ? t.place(target) : target);
        return true;
    }
    return false;
}

// ---- helpers ----

function symbolsWith(board, i, symbol) {
    const syms = board.map((x) => x.player);
    syms[i] = symbol;
    return syms;
}

function evaluateBoard(board, me) {
    let score = 0;
    for (const line of geometryForCells(board.length).winLines) {
        // 氷結中の空きマスを含むライン（着手不能な4つ目）は完成させられないので評価しない
        if (line.some((idx) => thermal.emptyBlocked(board[idx]))) continue;
        let myCount = 0, oppCount = 0, myBindSum = 0, oppBindSum = 0;
        // 敵が1人だけのラインでのみ脅威として数える（複数の敵が混在するラインは互いに潰し合う）
        const enemiesInLine = new Set();
        for (const idx of line) {
            const sq = board[idx];
            if (sq.player === me) { myCount++; myBindSum += sq.bind; }
            else if (sq.player) { oppCount++; oppBindSum += sq.bind; enemiesInLine.add(sq.player); }
        }
        if (myCount > 0 && oppCount === 0) {
            score += LINE_SCORES[myCount];
        } else if (oppCount > 0 && myCount === 0 && enemiesInLine.size === 1) {
            score -= LINE_SCORES[oppCount];
            if (oppCount === 2) {
                let emptyInLine = 0;
                for (const idx of line) { if (!board[idx].player) emptyInLine++; }
                if (emptyInLine === 2) score -= 20;
            }
        }
        score += myBindSum * 0.5 - oppBindSum * 0.5;
    }
    for (const sq of board) {
        const buds = thermal.activeBuds(sq); // 氷結中の🌱は休眠
        const hasLock = sq.effects.some(e => e.effect === '🔑');
        if (sq.player === me) { score += buds * 3 + (hasLock ? 5 : 0); }
        else if (sq.player) { score -= buds * 3 + (hasLock ? 5 : 0); }
    }
    return score;
}

function countReaches(board, player) {
    let reaches = 0;
    for (const line of geometryForCells(board.length).winLines) {
        let my = 0, op = 0, blocked = false;
        for (const idx of line) {
            const sq = board[idx];
            if (sq.player === player) my++;
            else if (sq.player) op++;
            // 残り1マスが着手不能（氷結中の空きマス・ロック中の空きマス）ならリーチではない（findThreatSquares と同じ判定）
            else if (thermal.emptyBlocked(sq) || (sq.effects.some(e => e.effect === '🔑') && sq.bind > 0)) blocked = true;
        }
        if (my === 3 && op === 0 && !blocked) reaches++;
    }
    return reaches;
}

function findThreatSquares(board, player) {
    const threats = [];
    for (const line of geometryForCells(board.length).winLines) {
        let pCount = 0, oCount = 0, emptyIdx = -1;
        for (const idx of line) {
            const sq = board[idx];
            if (sq.player === player) pCount++;
            else if (sq.player) oCount++;
            else if (!sq.player && !(sq.effects.some(e => e.effect === '🔑') && sq.bind > 0) && !thermal.emptyBlocked(sq)) emptyIdx = idx;
        }
        if (pCount === 3 && oCount === 0 && emptyIdx !== -1) {
            if (!threats.includes(emptyIdx)) threats.push(emptyIdx);
        }
    }
    return threats;
}

function simulatePlace(board, index, player, life) {
    const nb = board.map(sq => ({ player: sq.player, bind: sq.bind, effects: sq.effects.slice() }));
    const sq = nb[index];
    if (!sq.player) {
        nb[index] = { player, bind: life, effects: [] };
    } else if (sq.player !== player) {
        if (sq.bind <= 0) {
            nb[index] = { player, bind: life, effects: [] };
        } else {
            const calc = sq.bind - life + 1;
            if (calc < 0) nb[index] = { player, bind: -calc, effects: [] };
            else if (calc === 0) nb[index] = { player: undefined, bind: 0, effects: [] };
            else nb[index] = { player: sq.player, bind: calc, effects: [] };
        }
    } else {
        nb[index] = { player: sq.player, bind: sq.bind + life + 1, effects: sq.effects.slice() };
    }
    return nb;
}

function getValidMoves(board, me, character) {
    const moves = [];
    for (let i = 0; i < board.length; i++) {
        const sq = board[i];
        if (shield.has(i)) continue;
        if (sq.effects.some(e => e.effect === '🔑') && sq.bind > 0) continue;
        if (thermal.emptyBlocked(sq)) continue; // 氷結中の空きマスには置けない
        if (!sq.player) {
            if (!sq.effects.some(e => e.effect === '🔑')) moves.push(i);
        } else if (isEnemy(sq.player, me)) {
            if (sq.bind <= 0) moves.push(i);
            else if (character === 'giant') moves.push(i);
        }
    }
    return moves;
}

function getMovesFor(board, player, life) {
    const moves = [];
    for (let i = 0; i < board.length; i++) {
        const sq = board[i];
        if (shield.has(i)) continue;
        if (sq.effects.some(e => e.effect === '🔑') && sq.bind > 0) continue;
        if (thermal.emptyBlocked(sq)) continue;
        if (!sq.player) {
            if (!sq.effects.some(e => e.effect === '🔑')) moves.push(i);
        } else if (sq.player !== player) {
            if (sq.bind <= 0) moves.push(i);
        }
    }
    return moves;
}

function minimax(board, depth, isMax, alpha, beta, me, opp, life) {
    const winner = calculateWinner(board.map(sq => sq.player));
    if (winner === me) return 1000 + depth;
    if (winner) return -1000 - depth;
    const currentPlayer = isMax ? me : opp;
    const moves = getMovesFor(board, currentPlayer, life);
    if (depth === 0 || moves.length === 0) return evaluateBoard(board, me);

    if (isMax) {
        let best = -Infinity;
        for (const idx of moves) {
            const score = minimax(simulatePlace(board, idx, me, life), depth - 1, false, alpha, beta, me, opp, life);
            best = Math.max(best, score);
            alpha = Math.max(alpha, score);
            if (beta <= alpha) break;
        }
        return best;
    } else {
        let best = Infinity;
        for (const idx of moves) {
            const score = minimax(simulatePlace(board, idx, opp, life), depth - 1, true, alpha, beta, me, opp, life);
            best = Math.min(best, score);
            beta = Math.min(beta, score);
            if (beta <= alpha) break;
        }
        return best;
    }
}

// ---- enhanced best move (minimax + fork detection) ----

function getEnhancedBestMove(s) {
    const me = curPlayer(s);
    const opps = opponentsOf(s);
    const opp = opps[0];
    const character = curChar(s);
    const life = s.life;
    const board = s.board;

    const empty = findEmptyIndexes(board);
    const valid = getValidMoves(board, me, character);
    const seen = {};
    const allMoves = [];
    for (const m of empty) { if (!seen[m]) { seen[m] = true; allMoves.push(m); } }
    for (const m of valid) { if (!seen[m]) { seen[m] = true; allMoves.push(m); } }

    if (allMoves.length === 0) return null;

    // immediate win
    for (const i of allMoves) {
        if (calculateWinner(simulatePlace(board, i, me, life).map(sq => sq.player)) === me) return i;
    }
    // block opponent win (including captures)
    for (const o of opps) {
        const oppMoves = getMovesFor(board, o, life);
        for (const i of oppMoves) {
            if (calculateWinner(simulatePlace(board, i, o, life).map(sq => sq.player)) === o) {
                if (seen[i]) return i;
            }
        }
    }

    // minimax + fork bonus
    let bestScore = -Infinity;
    let bestMove = allMoves[0];
    for (const i of allMoves) {
        const sim = simulatePlace(board, i, me, life);
        let score = minimax(sim, searchDepth(board), false, -Infinity, Infinity, me, opp, life);
        // テンポ/レース強化(A/B検証で +8pt): リーチ作成を重視して先に盤面を取りに行く
        const reaches = countReaches(sim, me);
        if (reaches >= 2) score += 200;        // フォーク
        else if (reaches === 1) score += 40;   // シングルリーチ作成も評価
        // bind=0の敵マス乗っ取りボーナス（捕獲の戦術価値は墓地1個の損より大きいと実測で判明）
        if (isEnemy(board[i].player, me) && board[i].bind <= 0) score += 30;
        // ⚡の発火: 隣の帯電マスが敵を削れば加点、自コマを削れば減点
        score += fireGain(board, i, me, electricianSymbols(s));
        if (score > bestScore) { bestScore = score; bestMove = i; }
    }
    return bestMove;
}

// ---- strategic skill selection (mirrors AIPlayer.ts chooseSkills) ----

// 固有スキルを撃てる魔力の目安(次の手番の魔力がこれ以上なら撃ってくるとみなす)。AIPlayer.ts と同値
const EXCLUSIVE_MIN_MAGIC = { giant: 6, tactician: 7, magician: 6, yinYangMaster: 5, necromancer: 5, poisoner: 4, electrician: 7, cryomancer: 7, pyromancer: 9 };

function chooseSkills(s, availableSkills) {
    const me = curPlayer(s);
    const opps = opponentsOf(s);
    const character = curChar(s);
    let remaining = curMagic(s);
    // 敵が複数いるときは最も魔力の多い相手を基準にする（2人戦なら従来どおり相手の魔力）
    const oppMagic = Math.max(...otherSeats(s).map((seat) => s.magic[seat]));
    const board = s.board;
    const tokenUsed = s.usedTokenThisTurn;
    const geo = geometryForCells(board.length);

    const oppReaches = opps.reduce((n, o) => n + countReaches(board, o), 0);
    let myPieces = 0, oppPieces = 0, oppHit = 0;
    const piecesOf = new Map(), hitOf = new Map();
    for (const sq of board) {
        if (sq.player === me) myPieces++;
        else if (sq.player) {
            piecesOf.set(sq.player, (piecesOf.get(sq.player) || 0) + 1);
            if (!thermal.isFrozen(sq)) hitOf.set(sq.player, (hitOf.get(sq.player) || 0) + 1); // スキルダメージが通る敵コマ
        }
    }
    // 敵が複数いるときは最大勢力の敵と比べる（2人戦なら従来どおり相手の数）
    piecesOf.forEach((n) => { oppPieces = Math.max(oppPieces, n); });
    hitOf.forEach((n) => { oppHit = Math.max(oppHit, n); });
    const isLosing = oppPieces > myPieces + 2 || oppReaches > 0;

    function cost(base, isToken, key) { return calculateCost(s, base, isToken || false, false, key); }

    const skills = [];
    // 固有スキル用の魔力温存: ネクロは蘇生のコスト分を下回る汎用スキル(バッズ/トークン/ライフ)の支払いを控える。
    // A/B(約1200試合×seed1-3): ネクロ +2.1/+5.2/+5.8pt。巨人(ストンプ)は +0.8/+1.1/+1.0pt と誤差内で対象外、
    // 軍師は全軍突撃のコストをトークンで下げるため温存すると 0.468→0.198 と大幅悪化
    let reserve = 0;
    if (character === 'necromancer') {
        if (!(s.remainNecro[s.turn] > 0)) reserve = s.necroCost[s.turn];
    }
    const RESERVE_SKIP = ['buds', 'addLife', 'token', 'budsToken', 'doubleToken'];
    function spend(c, name) {
        if (reserve && RESERVE_SKIP.includes(name) && remaining - c < reserve) return false;
        if (remaining >= c) { remaining -= c; skills.push(name); return true; }
        return false;
    }

    // --- 固有スキル (相手リーチがなければ積極的に使う) ---
    if (oppReaches === 0) {
        if (character === 'necromancer') {
            const active = s.remainNecro[s.turn] > 0;
            const ncost = s.necroCost[s.turn]; // 墓地で決まる基礎コスト（召喚数の計算に使う）
            const npay = necromancyPay(s); // 実際に払う額（ギア補正込み）
            if (!active && remaining >= npay) {
                const corpses = 10 - ncost; // 軽減量=墓地の死体数=召喚数
                let absorbable = 0;
                for (const sq of board) {
                    if (isEnemy(sq.player, me) && sq.bind >= 1 && sq.bind <= 4 && !sq.effects.some(e => e.effect === '🔑')) absorbable++;
                }
                // 死体が1つでもあれば即発動。相手がロックで守っても蘇生の窓(4手番)の間に切れるので待つ意味がない
                // (A/B: 条件を corpses>=3||吸収候補2 から変えると他キャラの勝率が -3〜-4.6pt、seed 6-8)
                if (corpses >= 1 || absorbable >= 2) spend(npay, 'necromancy');
            }
        }

        // 凶荒の舞(相手-2)
        if (character === 'yinYangMaster') {
            const yyCost = cost(costsOf(s).onClickYingYangSkill, false, 'onClickYingYangSkill');
            if (remaining >= yyCost && (oppHit > myPieces || myPieces >= 3)) spend(yyCost, 'yyDance');
        }

        if (character === 'tactician') {
            // 実コストは「9−使用トークン×2」。calculateCostの+2ペナルティは誤りなので totalAssaultCost を使う
            const taCost = totalAssaultCost(s);
            if (remaining >= taCost && myPieces >= 2) spend(taCost, 'totalAssault');
        }

        // 増殖: 空きマスが残っていて、維持コストを数ターン払える余裕があるうちに回し始める
        const proliferateActive = s.proliferate[s.turn];
        if (!proliferateActive && availableSkills.includes(20)) {
            const pCost = cost(costsOf(s).onClickProliferate, false, 'onClickProliferate');
            let emptyCount = 0;
            for (const sq of board) if (!sq.player) emptyCount++;
            if (remaining >= pCost + 1 && emptyCount >= 5) spend(pCost, 'proliferate');
        }
    }

    // 毒霧: 毒使いが、敵コマが自コマより2つ以上多いとき撃つ（全コマに毒を撒くと敵が多く削れ、自コマはライフ1.5倍で耐える）
    if (character === 'poisoner' && availableSkills.includes(29)) {
        let mine = 0, theirs = 0;
        for (const sq of board) {
            if (!sq.player || sq.effects.some((e) => e.effect === '🔑')) continue;
            if (sq.player === me) mine++; else theirs++;
        }
        if (theirs >= MIST_MIN_ENEMIES && theirs >= mine + MIST_MIN_LEAD) spend(calculateCost(s, costsOf(s).onClickPoisonMist, false, true, 'onClickPoisonMist'), 'poisonMist');
    }

    // 🌱バッズ系: 氷室の番人・煉獄の鍛冶師が他席にいるとき、🌱を守る/換金する
    const thermalFoe = otherSeats(s).some((seat) => s.chars[seat] === 'cryomancer' || s.chars[seat] === 'pyromancer');
    const myBuds = ownBuds(s);
    // 刈り入れ前夜: 魔法使い以外が🌱を4個以上抱えていて、燃やされ/凍らされる相手がいるなら魔力に換える
    if (character !== 'magician' && availableSkills.includes(33) && myBuds >= 4 && thermalFoe) spend(calculateCost(s, costsOf(s).onClickHarvestEve, false, false, 'onClickHarvestEve'), 'harvestEve');
    // 冬至の種子: 自陣の休眠マス（氷結中）の🌱が2以上あり、まだガード中でなければ（ガード中は🌱が働く）
    const dormantBuds = board.reduce((n, sq) => (sq.player === me && thermal.isDormant(sq) ? n + thermal.budStacks(sq) : n), 0);
    if (availableSkills.includes(34) && dormantBuds >= 2 && !s.budGuard[s.turn]) spend(calculateCost(s, costsOf(s).onClickSolstice, false, false, 'onClickSolstice'), 'solstice');
    // 風の落とし子: 自陣のコマ(🌱を持てる)が3個以上あり🌱が3個未満なら撒く
    if (availableSkills.includes(36) && myBuds < 3 && thermal.sowCandidates(board, me).length >= 3) spend(calculateCost(s, costsOf(s).onClickWindborne, false, false, 'onClickWindborne'), 'windborne');

    // 浄化: 自陣のライフが残るコマの状態異常が合計3スタック以上で撃つ（雷霆の巫の自陣⚡無敵コマの⚡は数えない。雷霆の巫AIは⚡を剥がすので撃たない）
    if (character !== 'electrician' && availableSkills.includes(32) && hasAilment(board, me)) {
        let stacks = 0;
        board.forEach((sq) => {
            if (sq.player !== me || sq.bind <= 0) return;
            for (const e of sq.effects) if (thermal.AILMENTS.includes(e.effect)) stacks++;
        });
        if (stacks >= 3) spend(calculateCost(s, costsOf(s).onClickCleanse, false, false, 'onClickCleanse'), 'cleanse');
    }

    // サイレンス: 相手が次の手番に固有スキルを撃てそうなら先回りで封じる (自分に即勝ちがあるときは勝ち優先)
    if (oppReaches === 0 && availableSkills.includes(28) && countReaches(board, me) === 0
        && otherSeats(s).some((seat) => s.magic[seat] + 1 >= (EXCLUSIVE_MIN_MAGIC[s.chars[seat]] || Infinity))) {
        spend(cost(costsOf(s).onClickSilence, false, 'onClickSilence'), 'silence');
    }

    // Opiumはリーチ防御に使わない (bindを下げるだけで空きマスは塞げない)
    // → getBestMoveでブロック配置させる

    if (skills.length === 0 && isLosing && oppReaches === 0) {
        if (availableSkills.includes(5)) {
            let oppOn = 0, myOn = 0;
            for (const idx of geo.antiDiagonal) {
                if (thermal.isFrozen(board[idx])) continue; // 氷結中は❄1つが身代わり（敵も自陣も無傷）
                if (isEnemy(board[idx].player, me) && !board[idx].effects.some(e => e.effect === '🔑')) oppOn++;
                if (board[idx].player === me && !board[idx].effects.some(e => e.effect === '🔑')) myOn++;
            }
            if (oppOn > myOn) spend(cost(costsOf(s).onClickSlash, false, 'onClickSlash'), 'slash');
        }
        if (skills.length === 0 && availableSkills.includes(6)) {
            let oppOn = 0, myOn = 0;
            for (const idx of geo.mainDiagonal) {
                if (thermal.isFrozen(board[idx])) continue;
                if (isEnemy(board[idx].player, me) && !board[idx].effects.some(e => e.effect === '🔑')) oppOn++;
                if (board[idx].player === me && !board[idx].effects.some(e => e.effect === '🔑')) myOn++;
            }
            if (oppOn > myOn) spend(cost(costsOf(s).onClickBackSlash, false, 'onClickBackSlash'), 'backSlash');
        }
        if (skills.length === 0 && availableSkills.includes(7) && oppMagic >= 6) {
            spend(cost(costsOf(s).onClickTsunami, false, 'onClickTsunami'), 'tsunami');
        }
    }

    if (skills.some(sk => TURN_ENDING.includes(sk))) { skills.spent = curMagic(s) - remaining; return skills; }

    // --- 準備スキル ---
    if (s.life <= 2 && availableSkills.includes(0)) {
        spend(cost(costsOf(s).onClickAddLife, false, 'onClickAddLife'), 'addLife');
    }

    if (availableSkills.includes(2) && remaining >= cost(costsOf(s).onClickBuds, false, 'onClickBuds')) {
        let emptyCount = 0, myBuds = 0;
        for (const sq of board) {
            if (!sq.player) emptyCount++;
            if (sq.player === me && sq.effects.some(e => e.effect === '🌱')) myBuds++;
        }
        if (emptyCount >= 6 && myBuds < 3) {
            spend(cost(costsOf(s).onClickBuds, false, 'onClickBuds'), 'buds');
        }
    }

    // --- 血清: 自陣の毒で次の減衰までに消えそうなコマがあれば除去 ---
    if (availableSkills.includes(17)) {
        const serumCost = calculateCost(s, costsOf(s).onClickSerum, false, true, 'onClickSerum');
        let doomed = 0;
        for (const sq of board) {
            if (sq.player !== me) continue;
            const p = thermal.isDormant(sq) ? 0 : sq.effects.filter(e => e.effect === '☠').length; // 休眠マス（氷結中）の毒は継続ダメージなし
            if (p > 0 && p >= sq.bind) doomed++;
        }
        if (doomed >= 1) spend(serumCost, 'serum');
    }

    // --- トークン系 ---
    const freeCells = findEmptyIndexes(board).length;
    const frostUse = F.useNew || (F.cryoCards && character === 'cryomancer') || (F.cryoPoison && character === 'poisoner');
    // 暫定(F.useNew)/氷室(F.cryoCards): 霜降り(idx48)。ライフ2以下の自陣コマが2つ以上あれば凍らせて減衰から守る
    if (frostUse && availableSkills.includes(48) && thermal.frostfallTargets(board, me).length >= 2 && remaining >= cost(costsOf(s).onClickFrostfall, false, 'onClickFrostfall')) spend(cost(costsOf(s).onClickFrostfall, false, 'onClickFrostfall'), 'frostfall');
    if (!tokenUsed) {
        const poisonTokenCost = calculateCost(s, costsOf(s).onClickPoisonToken, true, true, 'onClickPoisonToken');
        const chargeTokenCost = calculateCost(s, costsOf(s).onClickChargeToken, true, false, 'onClickChargeToken');
        if (character === 'poisoner' && availableSkills.includes(16) && remaining >= poisonTokenCost) {
            spend(poisonTokenCost, 'poisonToken');
        } else if (character === 'electrician' && availableSkills.includes(23) && remaining >= calculateCost(s, costsOf(s).onClickDoubleChargeToken, true, false, 'onClickDoubleChargeToken')) {
            spend(calculateCost(s, costsOf(s).onClickDoubleChargeToken, true, false, 'onClickDoubleChargeToken'), 'doubleChargeToken');
        } else if (character === 'electrician' && availableSkills.includes(21) && remaining >= chargeTokenCost) {
            spend(chargeTokenCost, 'chargeToken');
        } else if (frostUse && freeCells >= 4 && availableSkills.includes(46) && remaining >= cost(costsOf(s).onClickDoubleFrostToken, true, 'onClickDoubleFrostToken')) {
            spend(cost(costsOf(s).onClickDoubleFrostToken, true, 'onClickDoubleFrostToken'), 'doubleFrostToken');
        } else if (frostUse && freeCells >= 3 && availableSkills.includes(45) && remaining >= cost(costsOf(s).onClickFrostToken, true, 'onClickFrostToken')) {
            spend(cost(costsOf(s).onClickFrostToken, true, 'onClickFrostToken'), 'frostToken');
        } else if (F.useNew && freeCells >= 4 && availableSkills.includes(38) && remaining >= cost(costsOf(s).onClickDoubleFlameToken, true, 'onClickDoubleFlameToken')) {
            spend(cost(costsOf(s).onClickDoubleFlameToken, true, 'onClickDoubleFlameToken'), 'doubleFlameToken');
        } else if (F.useNew && freeCells >= 3 && availableSkills.includes(37) && remaining >= cost(costsOf(s).onClickFlameToken, true, 'onClickFlameToken')) {
            spend(cost(costsOf(s).onClickFlameToken, true, 'onClickFlameToken'), 'flameToken');
        } else if (availableSkills.includes(11) && remaining >= cost(costsOf(s).onClickDoubleToken, true, 'onClickDoubleToken')) {
            spend(cost(costsOf(s).onClickDoubleToken, true, 'onClickDoubleToken'), 'doubleToken');
        } else if (availableSkills.includes(9) && remaining >= cost(costsOf(s).onClickBudsToken, true, 'onClickBudsToken')) {
            spend(cost(costsOf(s).onClickBudsToken, true, 'onClickBudsToken'), 'budsToken');
        } else if (availableSkills.includes(3) && remaining >= cost(costsOf(s).onClickToken, true, 'onClickToken')) {
            spend(cost(costsOf(s).onClickToken, true, 'onClickToken'), 'token');
        }
    }

    // 雷霆の巫: 他に撃つものが無く、魔力に余裕があるときだけランダム帯電（コスト+1 以上残る。+3 だと発動が稀すぎた）
    const RAND_MARGIN = Number(process.env.CHG_RAND_MARGIN) || 1; // A/B検証用の上書き
    if (character === 'electrician' && skills.length === 0 && availableSkills.includes(25)) {
        const rc = calculateCost(s, costsOf(s).onClickChargeRandom, false, false, 'onClickChargeRandom');
        if (remaining >= rc + RAND_MARGIN) spend(rc, 'chargeRandom');
    }

    { skills.spent = curMagic(s) - remaining; return skills; }
}

// 盤面・キャラに応じて固定したいスキルを返す (AIPlayer.ts chooseLocks と同一ロジック)。最大2つ。
// NO_AI_LOCK=1 でロック無効化(A/B検証用)
function chooseLocks(s, availableSkills) {
    if (process.env.NO_AI_LOCK === '1') return [];
    // 片側だけロック無効化(A/B検証用): s.noLockHeart / s.noLockCircle
    if (s.turn === 0 ? s.noLockHeart : s.turn === 1 ? s.noLockCircle : false) return [];
    const character0 = curChar(s);
    // A/B検証: 固有スキル依存のキャラ(巨人/魔法使い/陰陽師)はロックが不利だったため無効化
    if (character0 === 'giant' || character0 === 'magician' || character0 === 'yinYangMaster') return [];
    const me = curPlayer(s);
    const character = curChar(s);
    const board = s.board;
    const geo = geometryForCells(board.length);
    const oppMagic = Math.max(...otherSeats(s).map((seat) => s.magic[seat]));
    const life = s.life;
    let myPieces = 0, oppPieces = 0, empties = 0;
    // オピウム等のダメージが通る敵コマだけを数える（氷結中は肩代わりされる）
    for (const sq of board) { if (sq.player === me) myPieces++; else if (sq.player) { if (!thermal.isFrozen(sq)) oppPieces++; } else if (!thermal.isFrozen(sq)) empties++; }
    const enemiesOn = (idxs) => idxs.filter((i) => isEnemy(board[i].player, me) && !thermal.isFrozen(board[i]) && !board[i].effects.some((e) => e.effect === '🔑')).length;
    const tokenIdx = [3, 4, 9, 11], budsIdx = [2, 10];
    const preferred = (idx) => (character === 'tactician' && tokenIdx.includes(idx)) || (character === 'magician' && budsIdx.includes(idx)) || (F.pyroLock && character === 'pyromancer' && PYRO_LOCK.includes(idx));
    const valued = (idx) => {
        switch (idx) {
            case 3: case 4: case 9: case 11: return empties >= 3;
            case 5: return enemiesOn(geo.antiDiagonal) >= 2;
            case 6: return enemiesOn(geo.mainDiagonal) >= 2;
            case 8: return oppPieces >= 3;
            case 7: return oppMagic >= 7;
            case 14: return myPieces >= 3;
            case 0: case 1: return life <= 2;
            case 2: case 10: return empties >= 8;
            case 20: return empties >= 6;   // 増殖(空きが多いほどループが伸びる)
            case 21: case 23: return character === 'electrician' && empties >= 3; // 帯電トークン/帯電ダブルトークン
            default: return false;
        }
    };
    const locks = [];
    for (const idx of availableSkills) { if (idx < 0 || idx >= Math.max(POOL_SIZE, 62)) continue; if (preferred(idx) || valued(idx)) locks.push(idx); }
    locks.sort((a, b) => (preferred(b) ? 1 : 0) - (preferred(a) ? 1 : 0));
    return locks.slice(0, 2);
}

// ---- main entry points ----

// ヘイルメアリー用: 範囲破壊(ストンプ/審判の日)を撃った後に敵の勝ち筋(脅威マス)が最も減る中心を選ぶ。
// 同点なら壊せる敵駒が多い方。判断の詰み具合に関係なく必ず1つ返す(盤が全マス使えないときだけ null)
function bestRescueCenter(board, me, opps, kind) {
    const geo = geometryForCells(board.length);
    let bestIdx = null, bestThreats = Infinity, bestKilled = -1;
    for (let i = 0; i < board.length; i++) {
        if (shield.has(i)) continue;
        const nb = board.map((sq) => ({ player: sq.player, bind: sq.bind, effects: sq.effects.slice() }));
        let killed = 0;
        for (const idx of (kind === 'stomp' ? geo.stompRange(i) : geo.judgeRange(i))) {
            const sq = nb[idx];
            if (kind === 'stomp' && sq.player === me) { nb[idx] = thermal.applyDamage(sq, 5, 'skill').sq; continue; }
            if (kind === 'judge' && sq.effects.some(e => e.effect === '🔑') && sq.player === me && sq.effects.some(e => e.effect === '🌱')) continue;
            const guard = thermal.absorbDestroy(sq);
            if (guard.blocked) { nb[idx] = guard.sq; continue; } // 氷結は❄1つが身代わりになる
            if (isEnemy(sq.player, me)) killed++;
            nb[idx] = { player: undefined, bind: 0, effects: [] };
        }
        if (!nb[i].player) nb[i] = { player: me, bind: kind === 'stomp' ? 1 : 2, effects: [] };
        const threats = new Set(opps.flatMap((o) => findThreatSquares(nb, o))).size;
        if (threats < bestThreats || (threats === bestThreats && killed > bestKilled)) { bestThreats = threats; bestKilled = killed; bestIdx = i; }
    }
    return bestIdx;
}

/** New faithful mode: enhanced AI with skills + minimax (mirrors current AIPlayer.ts) */
// 対象選択に失敗したスキルの待ち状態（氷結・ロック・ひこばえ・火炎付与）が次の着手を塞がないよう、手を返す前に必ず解く
function clearPending(s) {
    s.useFreeze = false; s.useLock = 0; s.useSucker = false; s.useIgnite = false; s.useSwidden = false; s.useSacrifice = false; s.useFrostArea = false; s.useIcicle = false; s.useFrostSpread = false; s.useShatter = false;
}
function faithfulMakeMove(s) {
    clearPending(s);
    const r = faithfulMakeMoveInner(s);
    if (!r.turnEnded) clearPending(s);
    return r;
}
function faithfulMakeMoveInner(s) {
    loadFlags(s);
    const me = curPlayer(s);
    const opps = opponentsOf(s);
    const magic = curMagic(s);
    updateShield(s);

    // サイレンス中はスキルを使えない: 通常の着手だけ行う
    if (s.silenced[s.turn]) return { move: getEnhancedBestMove(s), turnEnded: false };

    // 永続スキルプール(ロックで固定される)を使用
    let availableSkills = s.skills.slice();
    // A/B検証用: F.ban='33|36' のように指定したスキルidxは手札にあっても使わない（スキル単体の寄与を測る）
    if (F.ban !== undefined) { const ban = String(F.ban).split('|'); availableSkills = availableSkills.filter((i) => !ban.includes(String(i))); }

    // 検証用: 指定スキルを強制的に1回撃つ
    if (F.force !== undefined && forceUse(s, me, availableSkills)) availableSkills = availableSkills.filter(() => true);

    // AIが盤面・キャラに応じて次ターン用にスキルをロック [要検証]
    const locks = chooseLocks(s, availableSkills);
    s.lockedSkills[s.turn] = locks;

    // 対氷結(B): 自分のリーチの4つ目が氷結中の空きマスで塞がれているとき、火炎付与で隣のコマを燃やして解凍し、同じ手番で完成させる
    if (F.unblock && availableSkills.includes(31) && curMagic(s) >= calculateCost(s, costsOf(s).onClickIgnite, false, false, 'onClickIgnite')) {
        const k = blockedReachCell(s.board, me);
        const t = k === null ? null : thawIgniteTarget(s.board, k, me, F.unblock >= 2);
        if (t !== null) {
            SKILLS.ignite(s);
            placeMove(s, t);
            const mv = getEnhancedBestMove(s);
            if (mv !== null) return { move: mv, turnEnded: false };
        }
    }

    // マルチリーチ防御: 脅威数に応じてロック種別を選択
    const threats = Array.from(new Set(opps.flatMap((o) => findThreatSquares(s.board, o))));
    // 氷室の番人: ロックが氷結に置き換わっている。単独の脅威は氷結で塞げば着手を使わずに済み、その手番を攻めに使える
    // （A/B: 氷室の番人の勝率 +11.7pt vs あなた(n=400)、全キャラ相手でほぼ向上。非氷室は手札に氷結が来ないと撃てず差なしなので対象外）
    if (F.frzBlock && curChar(s) === 'cryomancer' && threats.length === 1 && !s.silenced[s.turn] && thermal.canFreeze(s.board[threats[0]])
        && curMagic(s) >= calculateCost(s, costsOf(s).onClickCryoFreeze, false, false, 'onClickCryoFreeze')) {
        SKILLS.lock(s); // 氷室の番人ではロック=氷結（対象1マス）
        if (placeMove(s, threats[0])) {
            const move = getEnhancedBestMove(s);
            if (move === null) { SKILLS.charge(s); return { move: null, turnEnded: true }; }
            return { move, turnEnded: false };
        }
        s.useFreeze = false; s.useLock = 0;
    }
    if (threats.length >= 2) {
        const lockOpts = [
            { key: 'lock', count: 1, cost: calculateCost(s, costsOf(s).onClickUseLock, false, false, 'onClickUseLock') },
        ];
        if (availableSkills.includes(12)) lockOpts.push({ key: 'doubleLock', count: 2, cost: calculateCost(s, costsOf(s).onClickDoubleLock, false, false, 'onClickDoubleLock') });
        if (availableSkills.includes(13)) lockOpts.push({ key: 'tripleLock', count: 3, cost: calculateCost(s, costsOf(s).onClickTripleLock, false, false, 'onClickTripleLock') });

        const needed = threats.length - 1;
        const viable = lockOpts.filter(o => o.count >= needed && magic >= o.cost).sort((a, b) => a.cost - b.cost);
        if (viable.length > 0) {
            const chosen = viable[0];
            SKILLS[chosen.key](s);
            const lockTargets = threats.slice(0, chosen.count);
            for (const t of lockTargets) placeMove(s, t);
            // 占有先の脅威が残っていればそこへ、全脅威をロック済みなら通常の最善手(ロック済みは自動除外)
            let moveTarget = threats.find(t => !lockTargets.includes(t));
            if (moveTarget === undefined) moveTarget = getEnhancedBestMove(s);
            return { move: moveTarget, turnEnded: false };
        }
        // 詰み(ロックでは全脅威を塞げない)で自分に即勝ちもない: ヘイルメアリーに賭ける
        if (availableSkills.includes(27) && magic >= calculateCost(s, costsOf(s).onClickHailMary, false, false, 'onClickHailMary') && findThreatSquares(s.board, me).length === 0) {
            SKILLS.hailMary(s);
            let target = null;
            if (s.useStomp) target = bestRescueCenter(s.board, me, opps, 'stomp');
            else if (s.useJudgeDay) target = bestRescueCenter(s.board, me, opps, 'judge');
            else if (s.useChargeSpread) target = bestChargeSpreadTarget(s.board, me) ?? s.board.findIndex((sq) => sq.player);
            const pending = s.useStomp || s.useJudgeDay || s.useChargeSpread;
            if (pending) {
                const wasJudge = s.useJudgeDay;
                if (target === null || target < 0 || !placeMove(s, target)) {
                    s.useStomp = s.useJudgeDay = s.useChargeSpread = false; // 撃つ先がない: 不発
                } else if (wasJudge) { // 審判の日は着手で手番終了
                    return { move: null, turnEnded: true };
                }
            }
            const move = getEnhancedBestMove(s);
            return { move, turnEnded: false };
        }
        // ロックだけでは足りない: 単ロックで最低1つは塞ぐ
        // (かつてここに「シャッフルで防御札を引き直す」分岐があったが、発火条件が
        //  同時脅威3つ以上で実測 3,631手番中1回(0.03%)。閾値を2つに緩めても直接対決
        //  980試合で 49.1%±3.1pt と効果が無く、削除した。詳細は issue #10)
        if (magic >= lockOpts[0].cost) {
            SKILLS.lock(s);
            placeMove(s, threats[0]);
            return { move: threats[1], turnEnded: false };
        }
    }

    // 対策ロック: 敵にネクロ/毒使い/陰陽師がいるときは、吸収・毒・凶荒の舞(全コマ-2)で失いそうな低bind(<=3)の自コマを
    // 事前にロックして守る(ロックはライフを6以上にして貫通を防ぐ)。後出し(蘇生中だけ等)では遅く悪化する。
    // A/B(自キャラ側の勝率): 対ネクロ 0.448/0.455/0.456 → 0.631/0.613/0.625 (seed3-5)、対陰陽師 +4.5〜+13pt (seed3-5)、
    // 対毒使い +3.4/+4.4/+12.2/-0.8pt (seed3-6)。対照: 敵が「あなた」なら変化なし、敵が巨人なら悪化(0.493→0.403)で効果は敵の特性に由来
    // 対象外: 軍師と毒使いはロックに+2/+1コストが乗り運用と競合して悪化。ネクロ同士は未検証。雷霆の巫は変化なし(+0.6pt)
    if (curChar(s) !== 'tactician' && curChar(s) !== 'poisoner'
        && otherSeats(s).some((seat) => ANTI_LOCK_VS.includes(s.chars[seat]) && !(s.chars[seat] === 'necromancer' && curChar(s) === 'necromancer'))
        && magic >= calculateCost(s, costsOf(s).onClickUseLock, false, false, 'onClickUseLock')) {
        const target = bestAntiNecroLockTarget(s.board, me);
        if (target !== null) {
            SKILLS.lock(s);
            placeMove(s, target);
            const move = getEnhancedBestMove(s);
            return { move, turnEnded: false };
        }
    }

    // 雷霆の巫: 固有スキル(帯電拡散)・帯電付与は対象マスをクリックする2段階スキル。
    // 手番は進まないので、撃った後は通常の着手/他スキルの判断へ続ける
    if (curChar(s) === 'electrician' && opps.every((o) => countReaches(s.board, o) === 0)) {
        if (curMagic(s) >= chargeSpreadCost(s)) {
            const start = bestChargeSpreadTarget(s.board, me);
            if (start !== null) { SKILLS.chargeSpread(s); placeMove(s, start); updateShield(s); }
        }
        if (availableSkills.includes(24) && curMagic(s) >= calculateCost(s, costsOf(s).onClickChargeArea, false, false, 'onClickChargeArea')) {
            const center = bestChargeAreaTarget(s.board, me);
            if (center !== null) { SKILLS.chargeArea(s); placeMove(s, center); updateShield(s); }
        }
        if (availableSkills.includes(22) && curMagic(s) >= chargeOneCost(s)) {
            const target = bestChargeOneTarget(s.board, me);
            if (target !== null) { SKILLS.chargeOne(s); placeMove(s, target); updateShield(s); }
        }
    }
    // ジャマー: 相手にリーチがあっても撃てる（要の駒をライフ0にして、同じ手番で奪って崩す）
    if (curChar(s) === 'electrician' && availableSkills.includes(26) && curMagic(s) >= calculateCost(s, costsOf(s).onClickJammer, false, false, 'onClickJammer')) {
        const target = bestJammerTarget(s.board, me);
        if (target !== null) { SKILLS.jammer(s); placeMove(s, target); updateShield(s); }
    }

    // 煉獄の鍛冶師: 業火は前回の業火から3回スキルを使うと無料。手札のクリック不要の軽いスキル（ライフ3・バイバイン・風の落とし子・冬至の種子・浄化・刈り入れ前夜）を
    // 足りない種類数だけ先に撃ち、その合計が業火の通常コスト以下なら連打してから無料で業火を撃つ
    if (F.discountPlan) { discountPlan(s, me, availableSkills); availableSkills = s.skills.slice(); } // 軽減札を撃った/引き直したので手札を取り直す
    pyroChain(s, me, availableSkills);
    if (F.pyroChain >= 2) availableSkills = s.skills.slice(); // シャッフルで手札が変わった

    // 煉獄の鍛冶師 業火: 魔力が足り、ライフが残る敵コマが3個以上あれば撃つ（クリック不要・手番は進まない。相手リーチ条件なし）
    if (curChar(s) === 'pyromancer' && curMagic(s) >= infernoCost(s)
        && s.board.filter((sq) => sq.player && sq.player !== me && sq.bind > 0).length >= 3
        && infernoTargets(s).length > 0) {
        SKILLS.inferno(s);
    }
    // バーンアウト: 🔥のマスを全て壊す。敵のコマが2つ以上多く壊れるなら撃つ（業火の直後は敵全員が🔥2つなので、合計4以上でタダになりやすい）
    if (curChar(s) === 'pyromancer' && availableSkills.includes(61) && F.burnoutAfter) {
        const targets = E.burnoutTargets(s);
        const foes = targets.filter((k) => s.board[k].player && s.board[k].player !== me).length;
        const own = targets.filter((k) => s.board[k].player === me).length;
        if (foes - own >= 2 && curMagic(s) >= E.burnoutCost(s)) SKILLS.burnout(s);
    }

    // ひこばえ: 🌱を持つ自陣コマの隣に受け取れる自陣コマが2つ以上あれば撃つ（対象クリックが要る2段階スキル。手番は進まない）
    if (availableSkills.includes(35) && curMagic(s) >= calculateCost(s, costsOf(s).onClickSucker, false, false, 'onClickSucker')) {
        const target = bestSuckerTarget(s);
        if (target !== null && thermal.budReceivers(s.board, target, me, sizeOf(s.board)).length >= 2) {
            SKILLS.sucker(s);
            placeMove(s, target);
        }
    }

    // 氷室の番人 絶対零度: 発動待ちでなく、魔力が足り、ライフが残る敵コマが3個以上あれば撃つ（クリック不要・手番は進まない）
    if (curChar(s) === 'cryomancer' && !s.glacierPending[s.turn] && curMagic(s) >= glacierCost(s)
        && s.board.filter((sq) => sq.player && sq.player !== me && sq.bind > 0).length >= (F.glacierMin || 3)) {
        SKILLS.glacier(s);
    }

    // 毒使い インジェクション: 敵の要のコマを毒で消す (相手リーチ中でも有効。自分の勝ち手があるときは温存)
    if (curChar(s) === 'poisoner' && availableSkills.includes(15)
        && magic >= calculateCost(s, costsOf(s).onClickInjection, false, true, 'onClickInjection')
        && countReaches(s.board, me) === 0) {
        const target = bestInjectionTarget(s.board, me, INJ_MIN);
        if (target !== null) {
            SKILLS.injection(s);
            placeMove(s, target);
            const move = getEnhancedBestMove(s);
            return { move, turnEnded: false };
        }
    }

    // 毒使い ミアズマ: 自陣の毒マスの周囲の敵に毒を撒く (手番は進まない→通常着手)
    const ch0 = curChar(s);
    if (ch0 === 'poisoner' && magic >= miasmaCost(s) && miasmaScore(s, me) >= MIASMA_MIN_SCORE) {
        SKILLS.miasma(s);
        const move = getEnhancedBestMove(s);
        return { move, turnEnded: false };
    }
    // ミアズマの種: 自陣に毒マスが無いとき、敵に囲まれた自コマに自分でインジェクションする（毒使いは毒が付くとライフ1.5倍）。
    // 実測では発動が稀で勝率にはほぼ効かない（手札にインジェクションが来る手番しか撃てない）
    if (ch0 === 'poisoner' && availableSkills.includes(15)
        && magic >= calculateCost(s, costsOf(s).onClickInjection, false, true, 'onClickInjection') && countReaches(s.board, me) === 0
        && !s.board.some((sq) => sq.player === me && sq.effects.some((e) => e.effect === '☠'))) {
        const geo = geometryForCells(s.board.length);
        let best = null, bestN = 1;
        s.board.forEach((sq, i) => {
            if (sq.player !== me || shield.has(i)) return;
            const n = geo.surroundRange(i).filter((j) => isEnemy(s.board[j].player, me) && !s.board[j].effects.some((e) => e.effect === '🔑')).length;
            if (n > bestN) { bestN = n; best = i; }
        });
        if (best !== null) {
            SKILLS.injection(s);
            placeMove(s, best);
            const move = getEnhancedBestMove(s);
            return { move, turnEnded: false };
        }
    }

    // 巨人ストンプ / 魔法使い審判の日: 範囲破壊スキル (相手リーチが無いときに狙う)
    const oppReaches = opps.reduce((n, o) => n + countReaches(s.board, o), 0);
    if (oppReaches === 0) {
        const ch = curChar(s);
        if (ch === 'giant' && magic >= calculateCost(s, costsOf(s).onClickStomp, false, false, 'onClickStomp')) {
            const target = bestStompTarget(s.board, me);
            if (target !== null) {
                SKILLS.stomp(s);        // useStomp=true (手番は進まない)
                placeMove(s, target);   // exeStomp: 範囲破壊+中心配置
                const move = getEnhancedBestMove(s); // 破壊後の盤面で通常着手 (手番が進む)
                return { move, turnEnded: false };
            }
        }
        if (ch === 'magician' && magic >= judgeDayCost(s)) {
            const target = bestJudgeTarget(s.board, me);
            if (target !== null) {
                SKILLS.judgeDay(s);     // useJudgeDay=true
                placeMove(s, target);   // exeJudgeDay: 十字破壊+中心配置+手番終了
                return { move: null, turnEnded: true };
            }
        }
        // 魔法使い: 審判を撃たないなら、未ロックのバッズ駒を🔑ロックして魔力エンジンを守る
        if (ch === 'magician') {
            // 1手番に複数のバッズ駒をロックしてよい（魔力が許す限り最大 magLockN 個）。本番は AIPlayer.ts の MAGICIAN_MAX_LOCKS
            let locked = 0;
            while (locked < F.magLockN) {
                const lockCost = calculateCost(s, costsOf(s).onClickUseLock, false, false, 'onClickUseLock');
                const budCell = s.board.findIndex((sq) => sq.player === me && sq.effects.some((e) => e.effect === '🌱') && !sq.effects.some((e) => e.effect === '🔑'));
                if (!(curMagic(s) >= lockCost && budCell !== -1)) break;
                SKILLS.lock(s);
                placeMove(s, budCell);  // ロック対象クリック(手番は進まない)
                locked++;
            }
            if (locked > 0) {
                const move = getEnhancedBestMove(s);
                return { move, turnEnded: false };
            }
        }
    }

    const skills = chooseSkills(s, availableSkills);
    for (const sk of skills) {
        SKILLS[sk](s);
        if (TURN_ENDING.includes(sk)) return { move: null, turnEnded: true };
    }
    updateShield(s); // スキル(ランダム帯電など)で⚡の無敵マスが増えたぶんを反映してから着手を選ぶ
    const move = getEnhancedBestMove(s);
    // 打てるマスが無い（無敵の⚡マスだらけ・全部ロックなど）ときはチャージでパスする。放置すると手番が進まず止まる
    if (move === null) {
        SKILLS.charge(s);
        return { move: null, turnEnded: true };
    }
    return { move, turnEnded: false };
}

/** Legacy getBestMove for capture/random modes (no skill usage) */
function getBestMove(s, mode) {
    const me = curPlayer(s);
    const opps = opponentsOf(s);
    const empties = findEmptyIndexes(s.board);

    if (mode === 'random') return empties.length ? empties[Math.floor(s.rng() * empties.length)] : null;

    // win on empty
    for (const i of empties) if (calculateWinner(symbolsWith(s.board, i, me))) return i;
    // block on empty
    for (const i of empties) for (const o of opps) if (calculateWinner(symbolsWith(s.board, i, o))) return i;

    if (mode === 'capture') {
        const life = s.life;
        for (let i = 0; i < s.board.length; i++) {
            const sq = s.board[i];
            if (isEnemy(sq.player, me) && sq.bind > 0) {
                const calc = sq.bind - life + 1;
                if (calc < 0 && calculateWinner(symbolsWith(s.board, i, me))) return i;
            }
        }
    }

    return empties.length ? empties[Math.floor(s.rng() * empties.length)] : null;
}

/** Unified entry: returns { move, turnEnded } */
function makeMove(s, mode) {
    if (mode === 'faithful') return faithfulMakeMove(s);
    const mv = getBestMove(s, mode);
    return { move: mv, turnEnded: false };
}

module.exports = { getBestMove, makeMove, chooseSkills, getEnhancedBestMove, countReaches, evaluateBoard, findThreatSquares, bestStompTarget, bestJudgeTarget, bestRescueCenter };
