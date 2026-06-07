// @ts-check
'use strict';
/*
 * Headless faithful port of the game logic in src/components/game/Game.tsx + util.ts.
 * Pure JS, zero dependencies. Runs in Node.
 *
 * Goal: let an agent / human play the game in a terminal and run batch
 * simulations for balance analysis, without a browser.
 *
 * FIDELITY NOTES (deviations from the React source are flagged in comments
 * with [FAITHFUL] = matches source exactly, or [FIX]/[NOTE] = intentional change):
 *  - Win condition, life RNG, placement/capture/decay mechanics, turn order
 *    (incl. giant skipping) are ported 1:1.
 *  - Magic accrual: the React source has a bug where the circle player's next
 *    magic is computed from heartMagic (Game.tsx:102) and always counts heart's
 *    buds. We implement the *intended* per-player version and document the bug
 *    in BALANCE.md instead of replicating a render-timing-dependent glitch.
 */

// ---- Players / characters -------------------------------------------------
const HEART = '💙';
const CIRCLE = '⭕';

/** Selectable characters (match App.tsx radio options). */
const CHARACTERS = ['you', 'tactician', 'magician', 'giant', 'yinYangMaster', 'necromancer'];

// ---- RNG (seedable) -------------------------------------------------------
/** mulberry32 PRNG -> function returning [0,1). */
function makeRng(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const config = require('./config');

// ---- util.ts port ---------------------------------------------------------
function normRand(m, s, rng) {
    const c = Math.sqrt(-2 * Math.log(rng()));
    if (0.5 - rng() > 0) {
        return c * Math.sin(Math.PI * 2 * rng()) * s + m;
    } else {
        return c * Math.cos(Math.PI * 2 * rng()) * s + m;
    }
}

// [FAITHFUL] util.ts calculateLife — means/std come from config.js (balance knobs)
function calculateLife(characterId, yinYangMode, rng) {
    const L = config.lifeMeans;
    let m;
    if (characterId === 'yinYangMaster') m = yinYangMode === 'yang' ? L.yinYangMaster_yang : L.yinYangMaster_ying;
    else m = L[characterId] != null ? L[characterId] : L.default;
    return Math.floor(normRand(m, config.lifeStd, rng));
}

const WIN_LINES = [
    [0, 1, 2, 3],
    [4, 5, 6, 7],
    [8, 9, 10, 11],
    [12, 13, 14, 15],
    [0, 4, 8, 12],
    [1, 5, 9, 13],
    [2, 6, 10, 14],
    [3, 7, 11, 15],
    [0, 5, 10, 15],
    [3, 6, 9, 12],
];

// [FAITHFUL] util.ts calculateWinner — purely by player symbol
function calculateWinner(symbols) {
    for (const [a, b, c, d] of WIN_LINES) {
        if (symbols[a] && symbols[a] === symbols[b] && symbols[a] === symbols[c] && symbols[a] === symbols[d]) {
            return symbols[a];
        }
    }
    return undefined;
}

function findEmptyIndexes(board) {
    const out = [];
    for (let i = 0; i < board.length; i++) {
        const sq = board[i];
        if (sq.player === undefined && sq.effects.filter((e) => e.effect === '🔑').length === 0) out.push(i);
    }
    return out;
}

function randomPick(ary, rng) {
    return ary[Math.floor(rng() * ary.length)];
}

function randomAnyPick(ary, n, rng) {
    const copy = ary.slice();
    const result = [];
    for (let i = 0; i < n; i++) {
        const index = Math.floor(rng() * copy.length);
        result.push(copy[index]);
        copy.splice(index, 1);
    }
    return result;
}

// [FAITHFUL] skillCosts.ts
const skillCosts = {
    onClickToken: 4,
    onClickTotalAssault: 9,
    onClickToggleYingYang: 1,
    onClickYingYangSkill: 5,
    onClickStomp: 6,
    onClickJudgeDay: 11,
    onClickCharge: 3,
    onClickAddLife: 3,
    onClickDepressionCherry: 1,
    onClickShuffle: 1,
    onClickBibine: 3,
    onClickUseLock: 2,
    onClickDoubleLock: 3,
    onClickTripleLock: 4,
    onClickBuds: 4,
    onClickDoubleBuds: 6,
    onClickBudsToken: 6,
    onClickBothToken: 3,
    onClickDoubleToken: 7,
    onClickSlash: 6,
    onClickBackSlash: 6,
    onClickTsunami: 9,
    onClickOpium: 6,
    onClickWalpurgisNight: 9,
};

// [FAITHFUL] Game.tsx necromancer constants
const baseNecromancyCost = 10;
const necromancyDuration = 4;
const necromancyReviveLife = 2;
const necromancySummonCap = 5;

// 盤上で駒が消える/奪われるたびに墓地を貯める＝ネクロの蘇生コストを軽減 (敵味方問わず)
function addCorpses(s, n) {
    if (n <= 0) return;
    if (s.heartChar === 'necromancer') s.currentHeartNecroCost = Math.max(0, s.currentHeartNecroCost - n);
    if (s.circleChar === 'necromancer') s.currentCircleNecroCost = Math.max(0, s.currentCircleNecroCost - n);
}

// ---- Game state -----------------------------------------------------------
function newSquare() {
    return { player: undefined, bind: 0, effects: [] };
}

/**
 * Create a new game.
 * @param {{heartChar?:string, circleChar?:string, seed?:number, rng?:()=>number}} [opts]
 */
function newGame(opts = {}) {
    const heartChar = opts.heartChar || 'you';
    const circleChar = opts.circleChar || 'you';
    const rng = opts.rng || makeRng(opts.seed == null ? 12345 : opts.seed);
    const heartYY = 'ying';
    const circleYY = 'ying';
    const state = {
        board: Array.from({ length: 16 }, newSquare),
        heartChar,
        circleChar,
        rng,
        currentTurn: 1,
        heartTurn: true,
        heartMagic: 2,
        circleMagic: 2,
        heartYY,
        circleYY,
        heartUseMagicCount: 0,
        circleUseMagicCount: 0,
        heartUseTokenCount: 0,
        circleUseTokenCount: 0,
        // pending two-step skill flags
        useLock: 0,
        useStomp: false,
        useJudgeDay: false,
        useBuds: [false, 0],
        heartUseAssault: 0,
        circleUseAssault: 0,
        usedTokenThisTurn: false,
        // necromancer 蘇生 state
        remainHeartNecro: 0,
        remainCircleNecro: 0,
        currentHeartNecroCost: baseNecromancyCost,
        currentCircleNecroCost: baseNecromancyCost,
        // skill pool + per-player locks (Game.tsx と同じく毎手番ロックを残して再シャッフル)
        skills: [],
        heartLockedSkills: [],
        circleLockedSkills: [],
        winner: undefined,
        log: [],
    };
    state.life = Math.max(1, calculateLife(heartChar, heartYY, rng));
    state.skills = reshuffleSkillsFor(state, true, 16); // 先手(heart)の初期スキル
    return state;
}

// ロック済みスキルを残しつつ残り枠を [0,poolEnd) からランダムに埋める (Game.tsx reshuffledSkills と同じ)
function reshuffleSkillsFor(s, isHeart, poolEnd) {
    const keep = (isHeart ? s.heartLockedSkills : s.circleLockedSkills).slice(0, 3);
    const pool = [];
    for (let i = 0; i < poolEnd; i++) if (!keep.includes(i)) pool.push(i);
    const fill = randomAnyPick(pool, Math.max(0, 3 - keep.length), s.rng);
    return [...keep, ...fill];
}

const symbolsOf = (board) => board.map((x) => x.player);
const curPlayer = (s) => (s.heartTurn ? HEART : CIRCLE);
const curChar = (s) => (s.heartTurn ? s.heartChar : s.circleChar);
const curYY = (s) => (s.heartTurn ? s.heartYY : s.circleYY);
const curMagic = (s) => (s.heartTurn ? s.heartMagic : s.circleMagic);

function spendMagic(s, amount) {
    if (s.heartTurn) s.heartMagic -= amount;
    else s.circleMagic -= amount;
}
function bumpMagicCount(s) {
    if (s.heartTurn) s.heartUseMagicCount++;
    else s.circleUseMagicCount++;
}

// [FAITHFUL] Game.tsx calculateCost
function calculateCost(s, cost, isToken = false) {
    const c = curChar(s);
    if (c === 'tactician') return isToken ? cost - 1 : cost + 2;
    if (c === 'yinYangMaster' && curYY(s) === 'yang') return cost + 1;
    return cost;
}

// [FAITHFUL] Game.tsx calculateTokenBind
function calculateTokenBind(s) {
    return curChar(s) === 'tactician' ? 6 : 4;
}

function budsCount(board, player) {
    return board
        .filter((x) => x.player === player)
        .flatMap((x) => x.effects)
        .filter((e) => e.effect === '🌱').length;
}

// [FAITHFUL] Game.tsx judgeNextIsHeart (called with post-increment currentTurn & pre-change heartTurn)
function judgeNextIsHeart(s) {
    if (s.currentTurn === 1) return true;
    if (s.circleChar === s.heartChar) return !s.heartTurn;
    const nextPlayerCharacter = s.heartTurn ? s.circleChar : s.heartChar;
    const mod = config.giantSkipModulo || 0;
    if (nextPlayerCharacter !== 'giant' || !mod) return !s.heartTurn;
    if (s.currentTurn % mod < mod - 1) return !s.heartTurn;
    return s.heartTurn;
}

// Port of the useEffect[currentTurn]: advance to next player, grant magic & life.
function advanceTurn(s) {
    // 蘇生の残りターンは「発動した側の手番が終わるたび」に減る (s.heartTurn = 直前に動いた側)
    if (s.heartTurn && s.heartChar === 'necromancer' && s.remainHeartNecro > 0) s.remainHeartNecro--;
    if (!s.heartTurn && s.circleChar === 'necromancer' && s.remainCircleNecro > 0) s.remainCircleNecro--;
    const nextIsHeart = judgeNextIsHeart(s);
    const magicCharacter = ['magician'];
    if (nextIsHeart) {
        let nextMagic = s.heartMagic + 1 + budsCount(s.board, HEART);
        if (magicCharacter.includes(s.heartChar)) nextMagic++;
        if (s.heartChar === 'yinYangMaster' && s.heartYY === 'ying') nextMagic++;
        // 魔法使い: 自陣のバッズ1つにつき魔力回復+3 (標準+1に追加+2)
        if (s.heartChar === 'magician') nextMagic += budsCount(s.board, HEART) * 2;
        s.heartMagic = nextMagic;
        s.life = calculateLife(s.heartChar, s.heartYY, s.rng);
    } else {
        // Game.tsx と同じく円プレイヤー自身の魔力・バッズから計算する
        let nextMagic = s.circleMagic + 1 + budsCount(s.board, CIRCLE);
        if (magicCharacter.includes(s.circleChar)) nextMagic++;
        if (s.circleChar === 'yinYangMaster' && s.circleYY === 'ying') nextMagic++;
        // 魔法使い: 自陣のバッズ1つにつき魔力回復+3 (標準+1に追加+2)
        if (s.circleChar === 'magician') nextMagic += budsCount(s.board, CIRCLE) * 2;
        s.circleMagic = nextMagic;
        s.life = calculateLife(s.circleChar, s.circleYY, s.rng);
    }
    if (s.life <= 0) s.life = 1;
    s.usedTokenThisTurn = false;
    s.heartTurn = nextIsHeart;
    // 次の手番プレイヤーのロックを残してスキルを再シャッフル (Game.tsx [history] effect と同じ)
    s.skills = reshuffleSkillsFor(s, nextIsHeart, 16);
}

/**
 * Place / attack at index i (the core onCellClick path). Returns true if the
 * move was applied (turn advances), false if illegal (no-op).
 * [FAITHFUL] Game.tsx onCellClick
 */
function placeMove(s, i) {
    const board = s.board;

    // pending targeted skills consume the click without advancing the turn
    if (s.useLock > 0) {
        board[i].effects.push({ effect: '🔑' });
        if (board[i].bind < 6) board[i].bind = 6;
        s.useLock -= 1;
        return true;
    }
    if (s.useStomp) {
        exeStomp(s, i);
        return true;
    }
    if (s.useJudgeDay) {
        exeJudgeDay(s, i);
        return true;
    }

    if (s.winner) return false;
    const necroActive =
        (s.heartTurn && s.heartChar === 'necromancer' && s.remainHeartNecro > 0) ||
        (!s.heartTurn && s.circleChar === 'necromancer' && s.remainCircleNecro > 0);
    const opp = s.heartTurn ? CIRCLE : HEART;
    if (board[i].player === opp) {
        if (board[i].bind > 0 && curChar(s) !== 'giant') return false; // can't attack a bound enemy unless giant
    }
    if (board[i].effects.find((e) => e.effect === '🔑') && board[i].bind > 0) return false;

    // decay step
    for (const sq of board) {
        if ((sq.player || sq.effects.some((e) => e.effect === '🔑')) && sq.bind > 0) sq.bind--;
        if (sq.bind === 0) sq.effects = sq.effects.filter((e) => e.effect !== '🔑');
    }

    const cur = curPlayer(s);
    const life = s.life;
    let newBind, newEffects, newPlayer;
    if (board[i].player === cur) {
        newPlayer = board[i].player;
        newBind = board[i].bind + life + 1;
        newEffects = board[i].effects;
    } else if (board[i].player) {
        const calc = board[i].bind - life + (board[i].bind > 0 ? 1 : 0);
        if (calc < 0) {
            newPlayer = cur;
            newBind = calc * -1;
        } else if (calc === 0) {
            newPlayer = undefined;
            newBind = 0;
        } else {
            newPlayer = board[i].player;
            newBind = calc;
        }
        newEffects = [];
        // 敵味方問わずコマが奪われる/消えるたびに墓地+1
        if (calc <= 0) addCorpses(s, 1);
    } else {
        newPlayer = cur;
        newBind = life;
        newEffects = [];
    }

    if (newPlayer === cur && s.useBuds[0]) {
        for (let k = 0; k < s.useBuds[1]; k++) newEffects.push({ effect: '🌱' });
        s.useBuds = [false, 0];
    }

    board[i] = { player: newPlayer, bind: newBind, effects: newEffects };

    // total-assault residual: drop a random 0-bind token after the move
    if (s.heartTurn && s.heartUseAssault > 0) {
        const empties = findEmptyIndexes(board);
        if (empties.length) board[randomPick(empties, s.rng)] = { player: HEART, bind: 0, effects: [] };
        s.heartUseAssault -= 1;
    } else if (!s.heartTurn && s.circleUseAssault > 0) {
        const empties = findEmptyIndexes(board);
        if (empties.length) board[randomPick(empties, s.rng)] = { player: CIRCLE, bind: 0, effects: [] };
        s.circleUseAssault -= 1;
    }

    // 蘇生発動中: ライフが0になった敵コマを自動で自陣に吸収する
    if (necroActive) {
        const opp2 = cur === HEART ? CIRCLE : HEART;
        let absorbed = 0;
        for (let k = 0; k < board.length; k++) {
            const sq = board[k];
            if (sq.player === opp2 && sq.bind === 0 && !sq.effects.some((e) => e.effect === '🔑')) {
                board[k] = { player: cur, bind: necromancyReviveLife, effects: [] };
                absorbed++;
            }
        }
        // 吸収した敵の数だけ墓地+
        if (absorbed > 0) addCorpses(s, absorbed);
    }


    s.currentTurn += 1;
    advanceTurn(s);
    s.winner = calculateWinner(symbolsOf(board));
    return true;
}

// ---- Skills (turn-ending vs not, faithful to Game.tsx) --------------------
function endTurn(s) {
    s.currentTurn += 1;
    advanceTurn(s);
    s.winner = calculateWinner(symbolsOf(s.board));
}

function onClickCharge(s) {
    if (s.heartTurn) s.heartMagic += skillCosts.onClickCharge;
    else s.circleMagic += skillCosts.onClickCharge;
    endTurn(s);
}
function onClickAddLife(s) {
    s.life += 3;
    spendMagic(s, calculateCost(s, skillCosts.onClickAddLife));
    bumpMagicCount(s);
}
function onClickBibine(s) {
    s.life *= 2;
    spendMagic(s, calculateCost(s, skillCosts.onClickBibine));
    bumpMagicCount(s);
}
function onClickDepressionCherry(s) {
    s.life -= 1;
    s.heartMagic -= skillCosts.onClickDepressionCherry;
    s.circleMagic -= 1;
}
function onClickBuds(s) {
    s.useBuds = [true, s.useBuds[1] + 1];
    spendMagic(s, calculateCost(s, skillCosts.onClickBuds));
    bumpMagicCount(s);
}
function onClickDoubleBuds(s) {
    s.useBuds = [true, s.useBuds[1] + 2];
    spendMagic(s, calculateCost(s, skillCosts.onClickDoubleBuds));
    bumpMagicCount(s);
}
function onClickUseLock(s) {
    s.useLock += 1;
    spendMagic(s, calculateCost(s, skillCosts.onClickUseLock));
    bumpMagicCount(s);
}
function onClickDoubleLock(s) {
    s.useLock += 2;
    spendMagic(s, calculateCost(s, skillCosts.onClickDoubleLock));
    bumpMagicCount(s);
}
function onClickTripleLock(s) {
    s.useLock += 3;
    spendMagic(s, calculateCost(s, skillCosts.onClickTripleLock));
    bumpMagicCount(s);
}
function onClickToken(s) {
    const empties = findEmptyIndexes(s.board);
    if (empties.length) s.board[randomPick(empties, s.rng)] = { player: curPlayer(s), bind: calculateTokenBind(s), effects: [] };
    spendMagic(s, calculateCost(s, skillCosts.onClickToken, true));
    bumpMagicCount(s);
    s.usedTokenThisTurn = true;
    if (s.heartTurn) s.heartUseTokenCount++; else s.circleUseTokenCount++;
}
function onClickDoubleToken(s) {
    const empties = findEmptyIndexes(s.board);
    const [a, b] = randomAnyPick(empties, 2, s.rng);
    if (a != null) s.board[a] = { player: curPlayer(s), bind: calculateTokenBind(s), effects: [] };
    if (b != null) s.board[b] = { player: curPlayer(s), bind: calculateTokenBind(s), effects: [] };
    spendMagic(s, calculateCost(s, skillCosts.onClickDoubleToken, true));
    bumpMagicCount(s);
    s.usedTokenThisTurn = true;
    if (s.heartTurn) s.heartUseTokenCount++; else s.circleUseTokenCount++;
}
function onClickBudsToken(s) {
    const empties = findEmptyIndexes(s.board);
    if (empties.length) s.board[randomPick(empties, s.rng)] = { player: curPlayer(s), bind: calculateTokenBind(s), effects: [{ effect: '🌱' }] };
    spendMagic(s, calculateCost(s, skillCosts.onClickBudsToken, true));
    bumpMagicCount(s);
    s.usedTokenThisTurn = true;
    if (s.heartTurn) s.heartUseTokenCount++; else s.circleUseTokenCount++;
}
function onClickBothToken(s) {
    const empties = findEmptyIndexes(s.board);
    const [eh, ec] = randomAnyPick(empties, 2, s.rng);
    if (s.heartTurn) {
        if (eh != null) s.board[eh] = { player: HEART, bind: calculateTokenBind(s), effects: [] };
        if (ec != null) s.board[ec] = { player: CIRCLE, bind: 4, effects: [] };
        s.heartMagic -= calculateCost(s, skillCosts.onClickBothToken, true);
        s.heartUseMagicCount++;
    } else {
        if (ec != null) s.board[ec] = { player: CIRCLE, bind: calculateTokenBind(s), effects: [] };
        if (eh != null) s.board[eh] = { player: HEART, bind: 4, effects: [] };
        s.circleMagic -= calculateCost(s, skillCosts.onClickBothToken, true);
        s.circleUseMagicCount++;
    }
    s.usedTokenThisTurn = true;
    if (s.heartTurn) s.heartUseTokenCount++; else s.circleUseTokenCount++;
}
function onClickSlash(s) {
    for (const idx of [3, 6, 9, 12]) if (!s.board[idx].effects.some((e) => e.effect === '🔑')) s.board[idx].bind = 0;
    spendMagic(s, calculateCost(s, skillCosts.onClickSlash));
    bumpMagicCount(s);
}
function onClickBackSlash(s) {
    for (const idx of [0, 5, 10, 15]) if (!s.board[idx].effects.some((e) => e.effect === '🔑')) s.board[idx].bind = 0;
    spendMagic(s, calculateCost(s, skillCosts.onClickBackSlash));
    bumpMagicCount(s);
}
function onClickOpium(s) {
    const cur = curPlayer(s);
    for (const sq of s.board) {
        if (sq.player !== cur && sq.bind > 0 && !sq.effects.some((e) => e.effect === '🔑')) {
            const calc = sq.bind - 2;
            sq.bind = calc > 1 ? sq.bind - 2 : 0;
        }
    }
    spendMagic(s, calculateCost(s, skillCosts.onClickOpium));
    bumpMagicCount(s);
    endTurn(s);
}
function onClickTsunami(s) {
    if (s.heartTurn) {
        s.circleMagic = 0;
        s.heartMagic -= calculateCost(s, skillCosts.onClickTsunami);
        s.heartUseMagicCount++;
    } else {
        s.heartMagic = 0;
        s.circleMagic -= calculateCost(s, skillCosts.onClickTsunami);
        s.circleUseMagicCount++;
    }
    endTurn(s);
}
function onClickWalpurgisNight(s) {
    for (const sq of s.board) {
        if (sq.player && !sq.effects.some((e) => e.effect === '🔑')) sq.effects.push({ effect: '🌱' });
    }
    spendMagic(s, calculateCost(s, skillCosts.onClickWalpurgisNight));
    bumpMagicCount(s);
}

// yinYang
function onClickToggleYingYang(s) {
    // [FAITHFUL] note: source has a known bug toggling heart's mode when reading circle; we toggle the active player's own mode.
    if (s.heartTurn) {
        s.heartYY = s.heartYY === 'yang' ? 'ying' : 'yang';
        s.heartMagic -= skillCosts.onClickToggleYingYang;
    } else {
        s.circleYY = s.circleYY === 'yang' ? 'ying' : 'yang';
        s.circleMagic -= skillCosts.onClickToggleYingYang;
    }
}
function onClickYingYangSkill(s) {
    const mode = curYY(s);
    let destroyed = 0;
    if (s.heartTurn) {
        if (mode === 'yang') {
            for (const sq of s.board) if (sq.player === HEART) sq.bind += 2;
        } else {
            for (const sq of s.board) if (sq.player === CIRCLE) { sq.bind -= 2; if (sq.bind < 1) { sq.player = undefined; sq.effects = []; sq.bind = 0; destroyed++; } }
        }
        s.heartMagic -= skillCosts.onClickYingYangSkill;
    } else {
        if (mode === 'yang') {
            for (const sq of s.board) if (sq.player === CIRCLE) sq.bind += 2;
        } else {
            for (const sq of s.board) if (sq.player === HEART) { sq.bind -= 2; if (sq.bind < 1) { sq.player = undefined; sq.effects = []; sq.bind = 0; destroyed++; } }
        }
        s.circleMagic -= skillCosts.onClickYingYangSkill;
    }
    addCorpses(s, destroyed);
}

// giant
function onClickStomp(s) {
    s.useStomp = true;
    spendMagic(s, skillCosts.onClickStomp);
}
const STOMP_AREA = {
    0: [0, 1, 4, 5], 1: [0, 1, 2, 4, 5, 6], 2: [1, 2, 3, 5, 6, 7], 3: [2, 3, 6, 7],
    4: [0, 1, 4, 5, 8, 9], 5: [0, 1, 2, 4, 5, 6, 8, 9, 10], 6: [1, 2, 3, 5, 6, 7, 9, 10, 11], 7: [2, 3, 6, 7, 10, 11],
    8: [4, 5, 8, 9, 12, 13], 9: [4, 5, 6, 8, 9, 10, 12, 13, 14], 10: [5, 6, 7, 9, 10, 11, 13, 14, 15], 11: [6, 7, 10, 11, 14, 15],
    12: [8, 9, 12, 13], 13: [8, 9, 10, 12, 13, 14], 14: [9, 10, 11, 13, 14, 15], 15: [10, 11, 14, 15],
};
function exeStomp(s, i) {
    const cur = curPlayer(s);
    let destroyed = 0;
    for (const idx of STOMP_AREA[i]) {
        if (s.board[idx].player === cur) s.board[idx].bind = s.board[idx].bind > 5 ? s.board[idx].bind - 5 : 0;
        else { if (s.board[idx].player) destroyed++; s.board[idx] = { player: undefined, bind: 0, effects: [] }; }
    }
    addCorpses(s, destroyed);
    if (s.board[i].player === undefined) s.board[i] = { player: cur, bind: s.life, effects: [] };
    s.useStomp = false;
}

// magician judge day
function judgeDayCost(s) {
    const used = s.heartTurn ? s.heartUseMagicCount : s.circleUseMagicCount;
    return used < skillCosts.onClickJudgeDay ? skillCosts.onClickJudgeDay - used : 0;
}
function onClickJudgeDay(s) {
    spendMagic(s, judgeDayCost(s));
    if (s.heartTurn) s.heartUseMagicCount = 0; else s.circleUseMagicCount = 0;
    s.useJudgeDay = true;
}
const JUDGE_AREA = {
    0: [0, 1, 2, 3, 4, 5, 8, 10, 12, 15], 1: [0, 1, 2, 3, 4, 5, 6, 9, 11, 13], 2: [0, 1, 2, 3, 5, 6, 7, 8, 10, 14], 3: [0, 1, 2, 3, 6, 7, 9, 11, 12, 15],
    4: [0, 1, 4, 5, 6, 7, 8, 9, 12, 14], 5: [0, 1, 2, 4, 5, 6, 7, 8, 9, 10, 13, 15], 6: [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 14], 7: [2, 3, 4, 5, 6, 7, 10, 11, 13, 15],
    8: [0, 2, 4, 5, 8, 9, 10, 11, 12, 13], 9: [1, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14], 10: [0, 2, 5, 6, 7, 8, 9, 10, 11, 13, 14, 15], 11: [1, 3, 7, 8, 9, 10, 11, 14, 15],
    12: [0, 3, 4, 6, 8, 9, 12, 13, 14, 15], 13: [1, 5, 7, 8, 9, 10, 12, 13, 14, 15], 14: [3, 4, 6, 9, 10, 11, 12, 13, 14, 15], 15: [0, 3, 5, 7, 10, 11, 12, 13, 14, 15],
};
function exeJudgeDay(s, i) {
    const cur = curPlayer(s);
    let destroyed = 0;
    for (const idx of JUDGE_AREA[i]) {
        const sq = s.board[idx];
        const locked = sq.effects.some((e) => e.effect === '🔑');
        const protectedBud = sq.player === cur && sq.effects.some((e) => e.effect === '🌱');
        if (!locked || !protectedBud) { if (s.board[idx].player) destroyed++; s.board[idx] = { player: undefined, bind: 0, effects: [] }; }
    }
    addCorpses(s, destroyed);
    if (s.heartTurn) s.heartUseMagicCount = 0; else s.circleUseMagicCount = 0;
    s.board[i] = { player: cur, bind: 2, effects: [{ effect: '🌱' }] };
    s.useJudgeDay = false;
    endTurn(s);
}

function totalAssaultCost(s) {
    return skillCosts.onClickTotalAssault - (s.heartTurn ? s.heartUseTokenCount : s.circleUseTokenCount) * 2;
}
function onClickTotalAssault(s) {
    if (s.heartTurn) { s.heartUseAssault = 3; s.heartMagic -= totalAssaultCost(s); s.heartUseTokenCount = 0; }
    else { s.circleUseAssault = 3; s.circleMagic -= totalAssaultCost(s); s.circleUseTokenCount = 0; }
}

// necromancer: activate 蘇生 (墓地から召喚 + 4ターンの自動吸収窓)
function necromancyCost(s) {
    return s.heartTurn ? s.currentHeartNecroCost : s.currentCircleNecroCost;
}
function onClickNecromancy(s) {
    const cur = curPlayer(s);
    const curCost = s.heartTurn ? s.currentHeartNecroCost : s.currentCircleNecroCost;
    // 墓地に貯まった死体数だけ召喚 (上限・空きマスでクランプ)
    const empties = findEmptyIndexes(s.board);
    const summonCount = Math.min(baseNecromancyCost - curCost, necromancySummonCap, empties.length);
    const targets = randomAnyPick(empties, summonCount, s.rng);
    for (const idx of targets) s.board[idx] = { player: cur, bind: necromancyReviveLife, effects: [] };
    if (s.heartTurn) {
        s.heartMagic -= s.currentHeartNecroCost;
        s.heartUseMagicCount++;
        s.remainHeartNecro = necromancyDuration;
        s.currentHeartNecroCost = baseNecromancyCost;
    } else {
        s.circleMagic -= s.currentCircleNecroCost;
        s.circleUseMagicCount++;
        s.remainCircleNecro = necromancyDuration;
        s.currentCircleNecroCost = baseNecromancyCost;
    }
}

const SKILLS = {
    charge: onClickCharge,
    addLife: onClickAddLife,
    bibine: onClickBibine,
    depressionCherry: onClickDepressionCherry,
    buds: onClickBuds,
    doubleBuds: onClickDoubleBuds,
    lock: onClickUseLock,
    doubleLock: onClickDoubleLock,
    tripleLock: onClickTripleLock,
    token: onClickToken,
    doubleToken: onClickDoubleToken,
    budsToken: onClickBudsToken,
    bothToken: onClickBothToken,
    slash: onClickSlash,
    backSlash: onClickBackSlash,
    opium: onClickOpium,
    tsunami: onClickTsunami,
    walpurgis: onClickWalpurgisNight,
    toggleYY: onClickToggleYingYang,
    yyDance: onClickYingYangSkill,
    stomp: onClickStomp,
    judgeDay: onClickJudgeDay,
    totalAssault: onClickTotalAssault,
    necromancy: onClickNecromancy,
};

// ---- Rendering ------------------------------------------------------------
function renderBoard(s) {
    const cell = (sq) => {
        const sym = sq.player || '・';
        const eff = sq.effects.map((e) => e.effect).join('');
        return `${sym}${String(sq.bind).padStart(2)}${eff ? eff : '  '}`;
    };
    let out = '   col0    col1    col2    col3\n';
    for (let r = 0; r < 4; r++) {
        const row = [];
        for (let c = 0; c < 4; c++) row.push(cell(s.board[r * 4 + c]));
        out += `r${r} ` + row.map((x, c) => `${String(r * 4 + c).padStart(2)}:${x}`).join(' ') + '\n';
    }
    return out;
}

module.exports = {
    HEART, CIRCLE, CHARACTERS, skillCosts, SKILLS,
    makeRng, normRand, calculateLife, calculateWinner, findEmptyIndexes,
    newGame, placeMove, advanceTurn, judgeNextIsHeart, renderBoard,
    curPlayer, curChar, curMagic, symbolsOf, calculateCost, judgeDayCost, totalAssaultCost, necromancyCost, reshuffleSkillsFor,
};
