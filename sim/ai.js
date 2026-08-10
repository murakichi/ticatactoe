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

const { HEART, CIRCLE, calculateWinner, findEmptyIndexes, skillCosts, SKILLS,
        curPlayer, curChar, curMagic, calculateCost, placeMove, judgeDayCost, totalAssaultCost,
        miasmaCost, surroundRange } = require('./engine');

const WIN_LINES = [
    [0, 1, 2, 3], [4, 5, 6, 7], [8, 9, 10, 11], [12, 13, 14, 15],
    [0, 4, 8, 12], [1, 5, 9, 13], [2, 6, 10, 14], [3, 7, 11, 15],
    [0, 5, 10, 15], [3, 6, 9, 12],
];

const TURN_ENDING = ['charge', 'opium', 'tsunami'];
const LINE_SCORES = [0, 1, 10, 50, 1000];

// 破壊範囲 (engine.js の STOMP_AREA / JUDGE_AREA と一致)
const STOMP_AREA = {
    0: [0, 1, 4, 5], 1: [0, 1, 2, 4, 5, 6], 2: [1, 2, 3, 5, 6, 7], 3: [2, 3, 6, 7],
    4: [0, 1, 4, 5, 8, 9], 5: [0, 1, 2, 4, 5, 6, 8, 9, 10], 6: [1, 2, 3, 5, 6, 7, 9, 10, 11], 7: [2, 3, 6, 7, 10, 11],
    8: [4, 5, 8, 9, 12, 13], 9: [4, 5, 6, 8, 9, 10, 12, 13, 14], 10: [5, 6, 7, 9, 10, 11, 13, 14, 15], 11: [6, 7, 10, 11, 14, 15],
    12: [8, 9, 12, 13], 13: [8, 9, 10, 12, 13, 14], 14: [9, 10, 11, 13, 14, 15], 15: [10, 11, 14, 15],
};
const JUDGE_AREA = {
    0: [0, 1, 2, 3, 4, 5, 8, 10, 12, 15], 1: [0, 1, 2, 3, 4, 5, 6, 9, 11, 13], 2: [0, 1, 2, 3, 5, 6, 7, 8, 10, 14], 3: [0, 1, 2, 3, 6, 7, 9, 11, 12, 15],
    4: [0, 1, 4, 5, 6, 7, 8, 9, 12, 14], 5: [0, 1, 2, 4, 5, 6, 7, 8, 9, 10, 13, 15], 6: [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 14], 7: [2, 3, 4, 5, 6, 7, 10, 11, 13, 15],
    8: [0, 2, 4, 5, 8, 9, 10, 11, 12, 13], 9: [1, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14], 10: [0, 2, 5, 6, 7, 8, 9, 10, 11, 13, 14, 15], 11: [1, 3, 7, 8, 9, 10, 11, 14, 15],
    12: [0, 3, 4, 6, 8, 9, 12, 13, 14, 15], 13: [1, 5, 7, 8, 9, 10, 12, 13, 14, 15], 14: [3, 4, 6, 9, 10, 11, 12, 13, 14, 15], 15: [0, 3, 5, 7, 10, 11, 12, 13, 14, 15],
};

// 巨人ストンプ: 破壊範囲に敵が最も多い中心を選ぶ (敵2体以上で価値あり)。なければ null
function bestStompTarget(board, me, opp) {
    let bestIdx = null, bestEnemies = 0, bestEmptyCenter = false;
    for (let i = 0; i < 16; i++) {
        let enemies = 0;
        for (const idx of STOMP_AREA[i]) if (board[idx].player === opp) enemies++;
        const emptyCenter = !board[i].player; // 中心が空なら巨人のコマを配置できる
        if (enemies > bestEnemies || (enemies === bestEnemies && emptyCenter && !bestEmptyCenter)) {
            bestEnemies = enemies; bestIdx = i; bestEmptyCenter = emptyCenter;
        }
    }
    return bestEnemies >= 2 ? bestIdx : null;
}

// 魔法使い審判の日: 十字範囲で (敵破壊 - 自軍破壊) が最大の中心を選ぶ (純増2以上で価値あり)
function bestJudgeTarget(board, me, opp) {
    let bestIdx = null, bestNet = 0;
    for (let i = 0; i < 16; i++) {
        let enemy = 0, mine = 0;
        for (const idx of JUDGE_AREA[i]) {
            const sq = board[idx];
            const locked = sq.effects.some(e => e.effect === '🔑');
            const protectedBud = sq.player === me && sq.effects.some(e => e.effect === '🌱');
            if (locked && protectedBud) continue; // 守られている駒は消えない
            if (sq.player === opp) enemy++;
            else if (sq.player === me) mine++;
        }
        const net = enemy - mine;
        if (net > bestNet) { bestNet = net; bestIdx = i; }
    }
    return bestNet >= 2 ? bestIdx : null;
}

// 毒使いミアズマ: 周囲に敵が最も多い自陣マスを選ぶ (敵1体以上で価値あり)。なければ null
function bestMiasmaTarget(board, me, opp) {
    let bestIdx = null, bestEnemies = 0;
    for (let i = 0; i < 16; i++) {
        if (board[i].player !== me) continue; // 自陣を選択
        let enemies = 0;
        for (const j of surroundRange(i)) if (board[j].player === opp && !board[j].effects.some(e => e.effect === '🔑')) enemies++;
        if (enemies > bestEnemies) { bestEnemies = enemies; bestIdx = i; }
    }
    return bestEnemies >= 1 ? bestIdx : null;
}

// ---- helpers ----

function symbolsWith(board, i, symbol) {
    const syms = board.map((x) => x.player);
    syms[i] = symbol;
    return syms;
}

function evaluateBoard(board, me, opp) {
    let score = 0;
    for (const line of WIN_LINES) {
        let myCount = 0, oppCount = 0, myBindSum = 0, oppBindSum = 0;
        for (const idx of line) {
            const sq = board[idx];
            if (sq.player === me) { myCount++; myBindSum += sq.bind; }
            else if (sq.player === opp) { oppCount++; oppBindSum += sq.bind; }
        }
        if (myCount > 0 && oppCount === 0) {
            score += LINE_SCORES[myCount];
        } else if (oppCount > 0 && myCount === 0) {
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
        else if (sq.player === opp) { score -= buds * 3 + (hasLock ? 5 : 0); }
    }
    return score;
}

function countReaches(board, player, opp) {
    let reaches = 0;
    for (const line of WIN_LINES) {
        let my = 0, op = 0;
        for (const idx of line) {
            if (board[idx].player === player) my++;
            else if (board[idx].player === opp) op++;
        }
        if (my === 3 && op === 0) reaches++;
    }
    return reaches;
}

function findThreatSquares(board, player, opp) {
    const threats = [];
    for (const line of WIN_LINES) {
        let pCount = 0, oCount = 0, emptyIdx = -1;
        for (const idx of line) {
            const sq = board[idx];
            if (sq.player === player) pCount++;
            else if (sq.player === opp) oCount++;
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

function getValidMoves(board, me, opp, character, necroActive) {
    const moves = [];
    for (let i = 0; i < 16; i++) {
        const sq = board[i];
        if (sq.effects.some(e => e.effect === '🔑') && sq.bind > 0) continue;
        if (!sq.player) {
            if (!sq.effects.some(e => e.effect === '🔑')) moves.push(i);
        } else if (sq.player === opp) {
            if (sq.bind <= 0) moves.push(i);
            else if (character === 'giant') moves.push(i);
        }
    }
    return moves;
}

function getMovesFor(board, player, life) {
    const moves = [];
    for (let i = 0; i < 16; i++) {
        const sq = board[i];
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
    if (winner === opp) return -1000 - depth;
    const currentPlayer = isMax ? me : opp;
    const moves = getMovesFor(board, currentPlayer, life);
    if (depth === 0 || moves.length === 0) return evaluateBoard(board, me, opp);

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
    const opp = me === HEART ? CIRCLE : HEART;
    const character = curChar(s);
    const oppChar = s.heartTurn ? s.circleChar : s.heartChar;
    const life = s.life;
    const board = s.board;

    const necroActive = me === HEART ? s.remainHeartNecro > 0 : s.remainCircleNecro > 0;
    const empty = findEmptyIndexes(board);
    const valid = getValidMoves(board, me, opp, character, necroActive);
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
    const oppMoves = getMovesFor(board, opp, life);
    for (const i of oppMoves) {
        if (calculateWinner(simulatePlace(board, i, opp, life).map(sq => sq.player)) === opp) {
            if (seen[i]) return i;
        }
    }

    // minimax + fork bonus
    let bestScore = -Infinity;
    let bestMove = allMoves[0];
    for (const i of allMoves) {
        const sim = simulatePlace(board, i, me, life);
        let score = minimax(sim, 3, false, -Infinity, Infinity, me, opp, life);
        // テンポ/レース強化(A/B検証で +8pt): リーチ作成を重視して先に盤面を取りに行く
        const reaches = countReaches(sim, me, opp);
        if (reaches >= 2) score += 200;        // フォーク
        else if (reaches === 1) score += 40;   // シングルリーチ作成も評価
        // bind=0の敵マス乗っ取りボーナス（捕獲の戦術価値は墓地1個の損より大きいと実測で判明）
        if (board[i].player === opp && board[i].bind <= 0) score += 30;
        if (score > bestScore) { bestScore = score; bestMove = i; }
    }
    return bestMove;
}

// ---- strategic skill selection (mirrors AIPlayer.ts chooseSkills) ----

function chooseSkills(s, availableSkills) {
    const me = curPlayer(s);
    const opp = me === HEART ? CIRCLE : HEART;
    const character = curChar(s);
    const oppChar = s.heartTurn ? s.circleChar : s.heartChar;
    let remaining = curMagic(s);
    const oppMagic = s.heartTurn ? s.circleMagic : s.heartMagic;
    const board = s.board;
    const tokenUsed = s.usedTokenThisTurn;

    const oppReaches = countReaches(board, opp, me);
    let myPieces = 0, oppPieces = 0;
    for (const sq of board) {
        if (sq.player === me) myPieces++;
        else if (sq.player === opp) oppPieces++;
    }
    const isLosing = oppPieces > myPieces + 2 || oppReaches > 0;

    function cost(base, isToken) { return calculateCost(s, base, isToken || false); }

    const skills = [];
    function spend(c, name) {
        if (remaining >= c) { remaining -= c; skills.push(name); return true; }
        return false;
    }

    // --- 固有スキル (相手リーチがなければ積極的に使う) ---
    if (oppReaches === 0) {
        if (character === 'necromancer') {
            const active = me === HEART ? s.remainHeartNecro > 0 : s.remainCircleNecro > 0;
            const ncost = me === HEART ? s.currentHeartNecroCost : s.currentCircleNecroCost;
            if (!active && remaining >= ncost) {
                const corpses = 10 - ncost; // 軽減量=墓地の死体数=召喚数
                let absorbable = 0;
                for (const sq of board) {
                    if (sq.player === opp && sq.bind >= 1 && sq.bind <= 4 && !sq.effects.some(e => e.effect === '🔑')) absorbable++;
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
        const proliferateActive = me === HEART ? s.heartProliferate : s.circleProliferate;
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
            for (const idx of [3, 6, 9, 12]) {
                if (board[idx].player === opp && !board[idx].effects.some(e => e.effect === '🔑')) oppOn++;
                if (board[idx].player === me && !board[idx].effects.some(e => e.effect === '🔑')) myOn++;
            }
            if (oppOn > myOn) spend(cost(skillCosts.onClickSlash), 'slash');
        }
        if (skills.length === 0 && availableSkills.includes(6)) {
            let oppOn = 0, myOn = 0;
            for (const idx of [0, 5, 10, 15]) {
                if (board[idx].player === opp && !board[idx].effects.some(e => e.effect === '🔑')) oppOn++;
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

    // --- トークン系 ---
    if (!tokenUsed) {
        const poisonTokenCost = calculateCost(s, skillCosts.onClickPoisonToken, true, true);
        if (character === 'poisoner' && availableSkills.includes(16) && remaining >= poisonTokenCost) {
            spend(poisonTokenCost, 'poisonToken');
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
    if (s.heartTurn ? s.noLockHeart : s.noLockCircle) return [];
    const character0 = curChar(s);
    // A/B検証: 固有スキル依存のキャラ(巨人/魔法使い/陰陽師)はロックが不利だったため無効化
    if (character0 === 'giant' || character0 === 'magician' || character0 === 'yinYangMaster') return [];
    const me = curPlayer(s);
    const opp = me === HEART ? CIRCLE : HEART;
    const character = curChar(s);
    const board = s.board;
    const oppMagic = s.heartTurn ? s.circleMagic : s.heartMagic;
    const life = s.life;
    let myPieces = 0, oppPieces = 0, empties = 0;
    for (const sq of board) { if (sq.player === me) myPieces++; else if (sq.player === opp) oppPieces++; else if (!sq.player) empties++; }
    const enemiesOn = (idxs) => idxs.filter((i) => board[i].player === opp && !board[i].effects.some((e) => e.effect === '🔑')).length;
    const tokenIdx = [3, 4, 9, 11], budsIdx = [2, 10];
    const preferred = (idx) => (character === 'tactician' && tokenIdx.includes(idx)) || (character === 'magician' && budsIdx.includes(idx));
    const valued = (idx) => {
        switch (idx) {
            case 3: case 4: case 9: case 11: return empties >= 3;
            case 5: return enemiesOn([3, 6, 9, 12]) >= 2;
            case 6: return enemiesOn([0, 5, 10, 15]) >= 2;
            case 8: return oppPieces >= 3;
            case 7: return oppMagic >= 7;
            case 14: return myPieces >= 3;
            case 0: case 1: return life <= 2;
            case 2: case 10: return empties >= 8;
            case 20: return empties >= 6;   // 増殖(空きが多いほどループが伸びる)
            default: return false;
        }
    };
    const locks = [];
    for (const idx of availableSkills) { if (idx < 0 || idx > 20) continue; if (preferred(idx) || valued(idx)) locks.push(idx); }
    locks.sort((a, b) => (preferred(b) ? 1 : 0) - (preferred(a) ? 1 : 0));
    return locks.slice(0, 2);
}

// ---- main entry points ----

/** New faithful mode: enhanced AI with skills + minimax (mirrors current AIPlayer.ts) */
function faithfulMakeMove(s) {
    const me = curPlayer(s);
    const opp = me === HEART ? CIRCLE : HEART;
    const magic = curMagic(s);

    // 永続スキルプール(ロックで固定される)を使用
    let availableSkills = s.skills.slice();

    // AIが盤面・キャラに応じて次ターン用にスキルをロック [要検証]
    const locks = chooseLocks(s, availableSkills);
    if (s.heartTurn) s.heartLockedSkills = locks;
    else s.circleLockedSkills = locks;

    // マルチリーチ防御: 脅威数に応じてロック種別を選択
    const threats = findThreatSquares(s.board, opp, me);
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

    // 巨人ストンプ / 魔法使い審判の日: 範囲破壊スキル (相手リーチが無いときに狙う)
    const oppReaches = countReaches(s.board, opp, me);
    if (oppReaches === 0) {
        const ch = curChar(s);
        if (ch === 'giant' && magic >= calculateCost(s, skillCosts.onClickStomp)) {
            const target = bestStompTarget(s.board, me, opp);
            if (target !== null) {
                SKILLS.stomp(s);        // useStomp=true (手番は進まない)
                placeMove(s, target);   // exeStomp: 範囲破壊+中心配置
                const move = getEnhancedBestMove(s); // 破壊後の盤面で通常着手 (手番が進む)
                return { move, turnEnded: false };
            }
        }
        if (ch === 'magician' && magic >= judgeDayCost(s)) {
            const target = bestJudgeTarget(s.board, me, opp);
            if (target !== null) {
                SKILLS.judgeDay(s);     // useJudgeDay=true
                placeMove(s, target);   // exeJudgeDay: 十字破壊+中心配置+手番終了
                return { move: null, turnEnded: true };
            }
        }
        // 毒使い ミアズマ: 周囲に敵がいる自陣マスを選び、隣接敵に毒を撒く (手番は進まない→通常着手)
        if (ch === 'poisoner' && magic >= miasmaCost(s)) {
            const target = bestMiasmaTarget(s.board, me, opp);
            if (target !== null) {
                SKILLS.miasma(s);
                placeMove(s, target);
                const move = getEnhancedBestMove(s);
                return { move, turnEnded: false };
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
    const opp = me === HEART ? CIRCLE : HEART;
    const empties = findEmptyIndexes(s.board);

    if (mode === 'random') return empties.length ? empties[Math.floor(s.rng() * empties.length)] : null;

    // win on empty
    for (const i of empties) if (calculateWinner(symbolsWith(s.board, i, me))) return i;
    // block on empty
    for (const i of empties) if (calculateWinner(symbolsWith(s.board, i, opp))) return i;

    if (mode === 'capture') {
        const life = s.life;
        for (let i = 0; i < 16; i++) {
            const sq = s.board[i];
            if (sq.player === opp && sq.bind > 0) {
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
