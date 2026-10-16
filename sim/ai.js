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

const { SYMBOLS, calculateWinner, findEmptyIndexes, skillCosts, SKILLS,
        curPlayer, curChar, curMagic, calculateCost, placeMove, judgeDayCost, totalAssaultCost,
        miasmaCost, otherSeats, POOL_SIZE, chargeStacks, orthoNeighbors, isShielded, connectedPieces } = require('./engine');
const { geometryForCells } = require('./geometry');

// 多人数対応: 盤上のコマは参加者のものだけなので、自分以外のコマ = 敵。敵が複数いるときは
// 探索木では先頭の敵を「相手役」に代表させ、深さは盤サイズで制限する (AIPlayer.ts と同じ)
const isEnemy = (player, me) => player !== undefined && player !== me;
const opponentsOf = (s) => otherSeats(s).map((seat) => SYMBOLS[seat]);
const searchDepth = (board) => (board.length <= 16 ? 3 : board.length <= 25 ? 2 : 1);

const TURN_ENDING = ['charge', 'opium', 'tsunami'];
const INJ_MIN = 10; // インジェクション発動の最低ライン価値 (A/B: seed1-3 で毒使い勝率 +1.3〜+3.8pt)
const LINE_SCORES = [0, 1, 10, 50, 1000];

// 巨人ストンプ: 破壊範囲に敵が最も多い中心を選ぶ (敵2体以上で価値あり)。なければ null
function bestStompTarget(board, me) {
    const geo = geometryForCells(board.length);
    let bestIdx = null, bestEnemies = 0, bestEmptyCenter = false;
    for (let i = 0; i < board.length; i++) {
        if (shield.has(i)) continue;
        let enemies = 0;
        for (const idx of geo.stompRange(i)) if (isEnemy(board[idx].player, me)) enemies++;
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
        let op = 0, other = 0, empty = 0;
        for (const idx of line) {
            if (board[idx].player === owner) op++;
            else if (board[idx].player) other++; // 自駒や別の敵駒が混ざっていれば脅威ではない
            else empty++;
        }
        if (op === 3 && other === 0 && empty === 1) return true;
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
        const p = sq.effects.filter(e => e.effect === '☠').length + 1; // 付与後の毒数
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

// 毒使いミアズマ: 周囲に敵が最も多い自陣マスを選ぶ。敵2体以上で価値あり。
// 敵1体でも、その駒がリーチ列を作っている(どかさないと負ける)なら撃つ。
function bestMiasmaTarget(board, me) {
    const geo = geometryForCells(board.length);
    let bestIdx = null, bestScore = 0;
    for (let i = 0; i < board.length; i++) {
        if (board[i].player !== me || shield.has(i)) continue; // 自陣を選択
        let enemies = 0, critical = 0;
        for (const j of geo.surroundRange(i)) {
            if (isEnemy(board[j].player, me) && !board[j].effects.some(e => e.effect === '🔑')) {
                enemies++;
                if (inOppReachLine(board, j, me)) critical++;
            }
        }
        const score = enemies + critical * 2;
        if (score > bestScore) { bestScore = score; bestIdx = i; }
    }
    return bestScore >= MIASMA_MIN_SCORE ? bestIdx : null;
}

const MIASMA_MIN_SCORE = 2; // 敵2体、または敵1体+リーチ列(=3)

// 対ネクロ: 蘇生中は bind0 の鍵無しコマが丸ごと吸収される。自コマのうち低 bind で、通っている自ラインの価値が高いものを選ぶ
function bestAntiNecroLockTarget(board, me) {
    const geo = geometryForCells(board.length);
    let bestIdx = null, bestVal = 0;
    for (let i = 0; i < board.length; i++) {
        const sq = board[i];
        if (sq.player !== me || sq.bind > 3 || sq.effects.some(e => e.effect === '🔑')) continue;
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
function fireGain(board, i, me) {
    const size = sizeOf(board);
    let gain = 0;
    const W = Number(process.env.CHG_FIRE_W) || 1; // A/B検証用: 発火の損得の重み
    for (const k of orthoNeighbors(i, size)) {
        if (chargeStacks(board[k]) === 0) continue;
        for (const n of orthoNeighbors(k, size)) {
            const sq = board[n];
            if (!sq.player || sq.bind <= 0) continue;
            if (sq.effects.some((e) => e.effect === '🔑')) continue;
            const w = 3 + (sq.bind === 1 ? 4 : 0);
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
        if (chargeStacks(board[i]) > 0) continue;
        let attack = 0;
        for (const n of orthoNeighbors(i, size)) {
            const sq = board[n];
            if (!sq.player || sq.bind <= 0) continue;
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
        for (const k of cells) for (const n of orthoNeighbors(k, size)) if (isEnemy(board[n].player, me) && board[n].bind > 0 && !cells.includes(n)) adj.add(n);
        // 範囲内の敵コマ自身も帯電させる(隣接で巻き込める)ので、範囲内の敵(ライフ>0)も数える
        for (const k of cells) if (isEnemy(board[k].player, me) && board[k].bind > 0) adj.add(k);
        const ok = reach || (mine >= 3 && adj.size >= 2);
        if (!ok) continue;
        const score = adj.size + mine + (reach ? 10 : 0);
        if (score > bestScore) { bestScore = score; bestIdx = i; }
    }
    return bestIdx;
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
        const buds = sq.effects.filter(e => e.effect === '🌱').length;
        const hasLock = sq.effects.some(e => e.effect === '🔑');
        if (sq.player === me) { score += buds * 3 + (hasLock ? 5 : 0); }
        else if (sq.player) { score -= buds * 3 + (hasLock ? 5 : 0); }
    }
    return score;
}

function countReaches(board, player) {
    let reaches = 0;
    for (const line of geometryForCells(board.length).winLines) {
        let my = 0, op = 0;
        for (const idx of line) {
            if (board[idx].player === player) my++;
            else if (board[idx].player) op++;
        }
        if (my === 3 && op === 0) reaches++;
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
            else if (!sq.player && !(sq.effects.some(e => e.effect === '🔑') && sq.bind > 0)) emptyIdx = idx;
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
        score += fireGain(board, i, me);
        if (score > bestScore) { bestScore = score; bestMove = i; }
    }
    return bestMove;
}

// ---- strategic skill selection (mirrors AIPlayer.ts chooseSkills) ----

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
    let myPieces = 0, oppPieces = 0;
    const piecesOf = new Map();
    for (const sq of board) {
        if (sq.player === me) myPieces++;
        else if (sq.player) piecesOf.set(sq.player, (piecesOf.get(sq.player) || 0) + 1);
    }
    // 敵が複数いるときは最大勢力の敵と比べる（2人戦なら従来どおり相手の数）
    piecesOf.forEach((n) => { oppPieces = Math.max(oppPieces, n); });
    const isLosing = oppPieces > myPieces + 2 || oppReaches > 0;

    function cost(base, isToken) { return calculateCost(s, base, isToken || false); }

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
            const ncost = s.necroCost[s.turn];
            if (!active && remaining >= ncost) {
                const corpses = 10 - ncost; // 軽減量=墓地の死体数=召喚数
                let absorbable = 0;
                for (const sq of board) {
                    if (isEnemy(sq.player, me) && sq.bind >= 1 && sq.bind <= 4 && !sq.effects.some(e => e.effect === '🔑')) absorbable++;
                }
                if (corpses >= 3 || absorbable >= 2) spend(ncost, 'necromancy');
            }
        }

        // 凶荒の舞(相手-2)
        if (character === 'yinYangMaster') {
            const yyCost = cost(skillCosts.onClickYingYangSkill);
            if (remaining >= yyCost && (oppPieces > myPieces || myPieces >= 3)) spend(yyCost, 'yyDance');
        }

        if (character === 'tactician') {
            // 実コストは「9−使用トークン×2」。calculateCostの+2ペナルティは誤りなので totalAssaultCost を使う
            const taCost = totalAssaultCost(s);
            if (remaining >= taCost && myPieces >= 2) spend(taCost, 'totalAssault');
        }

        // 増殖: 空きマスが残っていて、維持コストを数ターン払える余裕があるうちに回し始める
        const proliferateActive = s.proliferate[s.turn];
        if (!proliferateActive && availableSkills.includes(20)) {
            const pCost = cost(skillCosts.onClickProliferate);
            let emptyCount = 0;
            for (const sq of board) if (!sq.player) emptyCount++;
            if (remaining >= pCost + 1 && emptyCount >= 5) spend(pCost, 'proliferate');
        }
    }

    // Opiumはリーチ防御に使わない (bindを下げるだけで空きマスは塞げない)
    // → getBestMoveでブロック配置させる

    if (skills.length === 0 && isLosing && oppReaches === 0) {
        if (availableSkills.includes(5)) {
            let oppOn = 0, myOn = 0;
            for (const idx of geo.antiDiagonal) {
                if (isEnemy(board[idx].player, me) && !board[idx].effects.some(e => e.effect === '🔑')) oppOn++;
                if (board[idx].player === me && !board[idx].effects.some(e => e.effect === '🔑')) myOn++;
            }
            if (oppOn > myOn) spend(cost(skillCosts.onClickSlash), 'slash');
        }
        if (skills.length === 0 && availableSkills.includes(6)) {
            let oppOn = 0, myOn = 0;
            for (const idx of geo.mainDiagonal) {
                if (isEnemy(board[idx].player, me) && !board[idx].effects.some(e => e.effect === '🔑')) oppOn++;
                if (board[idx].player === me && !board[idx].effects.some(e => e.effect === '🔑')) myOn++;
            }
            if (oppOn > myOn) spend(cost(skillCosts.onClickBackSlash), 'backSlash');
        }
        if (skills.length === 0 && availableSkills.includes(7) && oppMagic >= 6) {
            spend(cost(skillCosts.onClickTsunami), 'tsunami');
        }
    }

    if (skills.some(sk => TURN_ENDING.includes(sk))) return skills;

    // --- 準備スキル ---
    if (s.life <= 2 && availableSkills.includes(0)) {
        spend(cost(skillCosts.onClickAddLife), 'addLife');
    }

    if (availableSkills.includes(2) && remaining >= cost(skillCosts.onClickBuds)) {
        let emptyCount = 0, myBuds = 0;
        for (const sq of board) {
            if (!sq.player) emptyCount++;
            if (sq.player === me && sq.effects.some(e => e.effect === '🌱')) myBuds++;
        }
        if (emptyCount >= 6 && myBuds < 3) {
            spend(cost(skillCosts.onClickBuds), 'buds');
        }
    }

    // --- 血清: 自陣の毒で次の減衰までに消えそうなコマがあれば除去 ---
    if (availableSkills.includes(17)) {
        const serumCost = calculateCost(s, skillCosts.onClickSerum, false, true);
        let doomed = 0;
        for (const sq of board) {
            if (sq.player !== me) continue;
            const p = sq.effects.filter(e => e.effect === '☠').length;
            if (p > 0 && p >= sq.bind) doomed++;
        }
        if (doomed >= 1) spend(serumCost, 'serum');
    }

    // --- トークン系 ---
    if (!tokenUsed) {
        const poisonTokenCost = calculateCost(s, skillCosts.onClickPoisonToken, true, true);
        const chargeTokenCost = calculateCost(s, skillCosts.onClickChargeToken, true);
        if (character === 'poisoner' && availableSkills.includes(16) && remaining >= poisonTokenCost) {
            spend(poisonTokenCost, 'poisonToken');
        } else if (character === 'electrician' && availableSkills.includes(21) && remaining >= chargeTokenCost) {
            spend(chargeTokenCost, 'chargeToken');
        } else if (availableSkills.includes(11) && remaining >= cost(skillCosts.onClickDoubleToken, true)) {
            spend(cost(skillCosts.onClickDoubleToken, true), 'doubleToken');
        } else if (availableSkills.includes(9) && remaining >= cost(skillCosts.onClickBudsToken, true)) {
            spend(cost(skillCosts.onClickBudsToken, true), 'budsToken');
        } else if (availableSkills.includes(3) && remaining >= cost(skillCosts.onClickToken, true)) {
            spend(cost(skillCosts.onClickToken, true), 'token');
        }
    }

    return skills;
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
    for (const sq of board) { if (sq.player === me) myPieces++; else if (sq.player) oppPieces++; else if (!sq.player) empties++; }
    const enemiesOn = (idxs) => idxs.filter((i) => isEnemy(board[i].player, me) && !board[i].effects.some((e) => e.effect === '🔑')).length;
    const tokenIdx = [3, 4, 9, 11], budsIdx = [2, 10];
    const preferred = (idx) => (character === 'tactician' && tokenIdx.includes(idx)) || (character === 'magician' && budsIdx.includes(idx));
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
            case 21: return character === 'electrician' && empties >= 3; // 帯電トークン
            default: return false;
        }
    };
    const locks = [];
    for (const idx of availableSkills) { if (idx < 0 || idx >= POOL_SIZE) continue; if (preferred(idx) || valued(idx)) locks.push(idx); }
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
            if (kind === 'stomp' && sq.player === me) { sq.bind = sq.bind > 5 ? sq.bind - 5 : 0; continue; }
            if (kind === 'judge' && sq.effects.some(e => e.effect === '🔑') && sq.player === me && sq.effects.some(e => e.effect === '🌱')) continue;
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
function faithfulMakeMove(s) {
    const me = curPlayer(s);
    const opps = opponentsOf(s);
    const magic = curMagic(s);
    updateShield(s);

    // 永続スキルプール(ロックで固定される)を使用
    let availableSkills = s.skills.slice();

    // AIが盤面・キャラに応じて次ターン用にスキルをロック [要検証]
    const locks = chooseLocks(s, availableSkills);
    s.lockedSkills[s.turn] = locks;

    // マルチリーチ防御: 脅威数に応じてロック種別を選択
    const threats = Array.from(new Set(opps.flatMap((o) => findThreatSquares(s.board, o))));
    if (threats.length >= 2) {
        const lockOpts = [
            { key: 'lock', count: 1, cost: calculateCost(s, skillCosts.onClickUseLock) },
        ];
        if (availableSkills.includes(12)) lockOpts.push({ key: 'doubleLock', count: 2, cost: calculateCost(s, skillCosts.onClickDoubleLock) });
        if (availableSkills.includes(13)) lockOpts.push({ key: 'tripleLock', count: 3, cost: calculateCost(s, skillCosts.onClickTripleLock) });

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
        if (availableSkills.includes(23) && magic >= calculateCost(s, skillCosts.onClickHailMary) && findThreatSquares(s.board, me).length === 0) {
            SKILLS.hailMary(s);
            let target = null;
            if (s.useStomp) target = bestRescueCenter(s.board, me, opps, 'stomp');
            else if (s.useJudgeDay) target = bestRescueCenter(s.board, me, opps, 'judge');
            else if (s.useMiasma) target = bestMiasmaTarget(s.board, me) ?? s.board.findIndex((sq) => sq.player === me);
            else if (s.useChargeSpread) target = bestChargeSpreadTarget(s.board, me) ?? s.board.findIndex((sq) => sq.player);
            const pending = s.useStomp || s.useJudgeDay || s.useMiasma || s.useChargeSpread;
            if (pending) {
                const wasJudge = s.useJudgeDay;
                if (target === null || target < 0 || !placeMove(s, target)) {
                    s.useStomp = s.useJudgeDay = s.useMiasma = s.useChargeSpread = false; // 撃つ先がない: 不発
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

    // 対ネクロ: 敵にネクロがいるときは、吸収されそうな低bindの自コマを常にロックして守る。
    // A/B(ネクロ以外6キャラ vs ネクロ、約1200試合×seed3-5): 0.448/0.455/0.456 → 0.631/0.613/0.625 (+16〜18pt)。
    // 「蘇生中/発動間近のときだけ」ロックする版は 0.422 でむしろ悪化 (後出しでは遅い)。
    // 対照: 敵が「あなた」なら変化なし(0.686→0.693)、敵が巨人なら悪化(0.493→0.403)で、効果は対ネクロ特有。
    // 軍師はロックに+2コストが乗り、トークン運用と競合して悪化 (0.60→0.50, 0.55→0.47) するため対象外。ネクロ同士は未検証のため対象外
    if (curChar(s) !== 'tactician' && curChar(s) !== 'necromancer'
        && otherSeats(s).some((seat) => s.chars[seat] === 'necromancer')
        && magic >= calculateCost(s, skillCosts.onClickUseLock)) {
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
        if (curMagic(s) >= skillCosts.onClickChargeSpread) {
            const start = bestChargeSpreadTarget(s.board, me);
            if (start !== null) { SKILLS.chargeSpread(s); placeMove(s, start); updateShield(s); }
        }
        if (availableSkills.includes(22) && curMagic(s) >= calculateCost(s, skillCosts.onClickChargeOne)) {
            const target = bestChargeOneTarget(s.board, me);
            if (target !== null) { SKILLS.chargeOne(s); placeMove(s, target); updateShield(s); }
        }
    }

    // 毒使い インジェクション: 敵の要のコマを毒で消す (相手リーチ中でも有効。自分の勝ち手があるときは温存)
    if (curChar(s) === 'poisoner' && availableSkills.includes(15)
        && magic >= calculateCost(s, skillCosts.onClickInjection, false, true)
        && countReaches(s.board, me) === 0) {
        const target = bestInjectionTarget(s.board, me, INJ_MIN);
        if (target !== null) {
            SKILLS.injection(s);
            placeMove(s, target);
            const move = getEnhancedBestMove(s);
            return { move, turnEnded: false };
        }
    }

    // 毒使い ミアズマ: 周囲に敵がいる自陣マスを選び、隣接敵に毒を撒く (手番は進まない→通常着手)
    const ch0 = curChar(s);
    if (ch0 === 'poisoner' && magic >= miasmaCost(s)) {
        const target = bestMiasmaTarget(s.board, me);
        if (target !== null) {
            SKILLS.miasma(s);
            placeMove(s, target);
            const move = getEnhancedBestMove(s);
            return { move, turnEnded: false };
        }
    }

    // 巨人ストンプ / 魔法使い審判の日: 範囲破壊スキル (相手リーチが無いときに狙う)
    const oppReaches = opps.reduce((n, o) => n + countReaches(s.board, o), 0);
    if (oppReaches === 0) {
        const ch = curChar(s);
        if (ch === 'giant' && magic >= calculateCost(s, skillCosts.onClickStomp)) {
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
            const lockCost = calculateCost(s, skillCosts.onClickUseLock);
            const budCell = s.board.findIndex((sq) => sq.player === me && sq.effects.some((e) => e.effect === '🌱') && !sq.effects.some((e) => e.effect === '🔑'));
            if (magic >= lockCost && budCell !== -1) {
                SKILLS.lock(s);
                placeMove(s, budCell);  // ロック対象クリック(手番は進まない)
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
    const move = getEnhancedBestMove(s);
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

module.exports = { getBestMove, makeMove, chooseSkills, getEnhancedBestMove };
