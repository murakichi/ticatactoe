// @ts-check
'use strict';
/*
 * Headless faithful port of the game logic in src/components/game/Game.tsx + util.ts.
 * Pure JS, zero dependencies. Runs in Node.
 *
 * Goal: let an agent / human play the game in a terminal and run batch
 * simulations for balance analysis, without a browser.
 *
 * 多人数対応 (issue #32): 2〜8人・盤面 4x4〜7x7。席ごとの状態は配列（s.chars / s.magic / ...）で持ち、
 * 手番は s.turn（席番号）。2人戦の旧フィールド名（heartMagic, circleChar, heartTurn など）は
 * newGame が getter/setter の別名として生やすので、既存のテスト・CLIはそのまま動く。
 * 2人戦の結果は多人数対応の前後で（同じseedなら）完全に一致する。
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
// 席(seat)ごとのシンボル。席番号 = 配列の添字 = 手番順。src/types/Player.ts の PLAYER_SYMBOLS と同じ
const SYMBOLS = ['💙', '⭕', '🟩', '🔶', '⭐', '🟣', '🟫', '🩷'];
const MAX_PLAYERS = SYMBOLS.length;
const HEART = SYMBOLS[0];
const CIRCLE = SYMBOLS[1];
const seatOf = (player) => SYMBOLS.indexOf(player);

/** Selectable characters (match App.tsx radio options). */
const CHARACTERS = ['you', 'tactician', 'magician', 'giant', 'yinYangMaster', 'necromancer', 'poisoner', 'electrician'];

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
const { boardSizeFor, geometryOf, geometryForCells } = require('./geometry');

// ライフ減衰のタイミング (src/components/game/decay.ts と同じ規則)。
// この人数以上では「手番が1周するごとに1回」(= 着手 N 回につき1回)。それ未満は着手のたび。issue #30
// 環境変数 DECAY_PER_ROUND_MIN_PLAYERS で上書きできる（A/B検証用。99 なら全人数で着手ごと）
const DECAY_PER_ROUND_MIN_PLAYERS = process.env.DECAY_PER_ROUND_MIN_PLAYERS != null
    ? parseInt(process.env.DECAY_PER_ROUND_MIN_PLAYERS, 10)
    : config.decayPerRoundMinPlayers != null ? config.decayPerRoundMinPlayers : 3;
function shouldDecay(placements, n) {
    return n < DECAY_PER_ROUND_MIN_PLAYERS || placements % n === 0;
}

// 長引く多人数戦の打ち切り: この人数以上では、interval ターンごとに手番開始時の魔力が全員+1ずつ増える。
// src/components/game/lateMagic.ts と同じ規則。環境変数 LATE_MAGIC_INTERVAL=0 で無効化（A/B検証用）
const LATE_MAGIC_MIN_PLAYERS = config.lateGameMagicMinPlayers != null ? config.lateGameMagicMinPlayers : 2;
const LATE_MAGIC_INTERVAL = process.env.LATE_MAGIC_INTERVAL != null
    ? parseInt(process.env.LATE_MAGIC_INTERVAL, 10)
    : config.lateGameMagicInterval != null ? config.lateGameMagicInterval : 50;
function lateMagicBonus(turn, n) {
    return n < LATE_MAGIC_MIN_PLAYERS || !LATE_MAGIC_INTERVAL ? 0 : Math.floor(turn / LATE_MAGIC_INTERVAL);
}

// [FAITHFUL] Game.tsx 増殖(ループ召喚)の定数。config.js のノブで上書きできる
const PROLIFERATE = Object.assign({ cost: 6, tokenLife: 2, upkeepStep: 1, maxStacks: 8 }, config.proliferate || {});

// 汎用スキルプールの大きさ (idx 0..POOL_SIZE-1)。#39 で 21 -> 23、#40 で 23 -> 27、ヘイルメアリー/サイレンスで 27 -> 29
const POOL_SIZE = Number(process.env.SIM_POOL_SIZE) || config.poolSize || 29; // SIM_POOL_SIZE: A/B検証用の上書き

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
// lifeBonus: 毒使いの「自陣の毒の数だけライフ期待値+1」用
function calculateLife(characterId, yinYangMode, rng, lifeBonus = 0) {
    const L = config.lifeMeans;
    let m;
    if (characterId === 'yinYangMaster') m = yinYangMode === 'yang' ? L.yinYangMaster_yang : L.yinYangMaster_ying;
    else m = L[characterId] != null ? L[characterId] : L.default;
    return Math.floor(normRand(m + lifeBonus, config.lifeStd, rng));
}

// [FAITHFUL] util.ts calculateWinner — purely by player symbol。盤サイズは配列長から決まる
function calculateWinner(symbols) {
    for (const line of geometryForCells(symbols.length).winLines) {
        const first = symbols[line[0]];
        if (first && line.every((idx) => symbols[idx] === first)) return first;
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
    onClickMiasma: 6,
    onClickInjection: 2,
    onClickPoisonToken: 2,
    onClickSerum: 4,
    onClickIntensify: 8,
    onClickPandemic: 6,
    // 増殖のコストだけは config.js のノブから引く (バランス調整ループ用)
    onClickProliferate: PROLIFERATE.cost,
    // ⚡帯電 (雷霆の巫)。idx 21=帯電トークン / 22=帯電付与。固有スキルの帯電拡散は pool に入らない
    onClickChargeToken: (config.charge && config.charge.tokenCost) || 3,
    onClickChargeOne: (config.charge && config.charge.oneCost) || 2,
    onClickChargeSpread: (config.charge && config.charge.spreadCost) || 7,
    onClickDoubleChargeToken: (config.charge && config.charge.doubleTokenCost) || 6,
    onClickChargeArea: (config.charge && config.charge.areaCost) || 5,
    onClickChargeRandom: (config.charge && config.charge.randomCost) || 3,
    onClickJammer: (config.charge && config.charge.jammerCost) || 4,
    onClickHailMary: 6, // idx 27
    onClickSilence: 5, // idx 28
};
// 盤面の⚡の数だけ、帯電付与・帯電拡散のコストを軽減する。下限（#43）
// ⚡の発火ダメージ。config.charge.fireDamage（A/B検証用に環境変数 CHG_FIRE_DMG でも上書き可）
const FIRE_DAMAGE = Number(process.env.CHG_FIRE_DMG) || (config.charge && config.charge.fireDamage) || 1;
// 過負荷: 全マスが⚡で埋まったら、全⚡と🔑ロックを取り除いて全マスのライフを0にする（ユーザー案。ロックも解除する）。
// 既定は有効。環境変数 CHG_DISCHARGE=0 / config.charge.discharge=false で無効化できる（A/B検証用）
const DISCHARGE = process.env.CHG_DISCHARGE != null ? process.env.CHG_DISCHARGE === '1' : !(config.charge && config.charge.discharge === false);
const CHARGE_MIN_COST = (config.charge && config.charge.minCost) || 1;

// [FAITHFUL] Game.tsx necromancer constants
const baseNecromancyCost = 10;
const necromancyDuration = 4;
const necromancyReviveLife = 2;
const necromancySummonCap = 5;

// 盤上で駒が消える/奪われるたびに墓地を貯める＝ネクロの蘇生コストを軽減 (敵味方問わず)
function addCorpses(s, n) {
    if (n <= 0) return;
    s.chars.forEach((c, seat) => {
        if (c === 'necromancer') s.necroCost[seat] = Math.max(0, s.necroCost[seat] - n);
    });
}

// ---- 毒（毒使い）ヘルパー --------------------------------------------------
function poisonStacks(sq) {
    return sq.effects.filter((e) => e.effect === '☠').length;
}
function boardPoisonCount(board) {
    let n = 0;
    for (const sq of board) n += poisonStacks(sq);
    return n;
}
function poisonCountFor(board, player) {
    let n = 0;
    for (const sq of board) if (sq.player === player) n += poisonStacks(sq);
    return n;
}
function poisonerInPlay(s) {
    return s.chars.includes('poisoner');
}
// 毒使いの駒に毒が付いた瞬間、そのマスのライフが1.5倍（四捨五入）になる。Game.tsx の POISON_LIFE_MULT と同値
const POISON_MULT = 1.5;
function poisonStrike(s, sq) {
    if (!s || !sq.player) return;
    const ch = s.chars[seatOf(sq.player)];
    if (ch === 'poisoner') sq.bind = Math.round(sq.bind * POISON_MULT);
}
// 周囲1マス（クリックしたマスを除く8近傍）。盤サイズは s.size
function surroundRange(s, i) {
    return geometryOf(s.size).surroundRange(i);
}
// 周囲1マスのコマ(敵味方問わず)1つにランダムで毒を1付与（毒拡散パッシブ）
function spreadPoisonAround(board, idx, rng, s) {
    const targets = surroundRange(s, idx).filter((j) => board[j].player);
    if (!targets.length) return;
    const t = randomPick(targets, rng);
    board[t].effects.push({ effect: '☠' });
    poisonStrike(s, board[t]);
}

// ---- 帯電（雷霆の巫） ------------------------------------------------------
// ⚡は {effect:'⚡'} の個数がスタック。発火: 帯電マスの縦横に隣接するマスへ誰かが着手すると、
// その帯電マスの縦横隣接のコマに1ダメージ。🔑ロック中(bind>0)のマスは貫通しない。発火した⚡は全部消える。
function chargeStacks(sq) {
    return sq.effects.filter((e) => e.effect === '⚡').length;
}
// 縦横4隣接。size = 盤の一辺 (s.size)
function orthoNeighbors(i, size) {
    const r = Math.floor(i / size), c = i % size;
    const out = [];
    if (r > 0) out.push(i - size);
    if (r < size - 1) out.push(i + size);
    if (c > 0) out.push(i - 1);
    if (c < size - 1) out.push(i + 1);
    return out;
}
function charOfPlayer(s, player) {
    return s.chars[seatOf(player)];
}
// 雷霆の巫の⚡付き自陣マスは「ライフ0でも取られない」無敵。弱点として本人も触れない
function isShielded(s, sq) {
    return !!sq.player && charOfPlayer(s, sq.player) === 'electrician' && chargeStacks(sq) > 0;
}
// 🔑ロックまたは⚡の無敵＝ダメージ系スキルの対象外にするマス
function isGuarded(s, sq) {
    return sq.effects.some((e) => e.effect === '🔑') || isShielded(s, sq);
}
// 盤面全体の⚡の数（スタック込み）
function boardChargeCount(board) {
    let n = 0;
    for (const sq of board) n += chargeStacks(sq);
    return n;
}
// 帯電付与・帯電拡散の実コスト: 盤面の⚡の数だけ軽減、下限 CHARGE_MIN_COST (#43。ミアズマと同じ流儀)
function chargeOneCost(s) {
    return Math.max(CHARGE_MIN_COST, calculateCost(s, skillCosts.onClickChargeOne - boardChargeCount(s.board)));
}
function chargeSpreadCost(s) {
    return Math.max(CHARGE_MIN_COST, calculateCost(s, skillCosts.onClickChargeSpread - boardChargeCount(s.board)));
}
// ⚡を増やす操作の直後に呼ぶ。全マスに⚡があれば全⚡と🔑を取り除き、全マスのライフを0にする
function checkDischarge(s) {
    if (!DISCHARGE) return false;
    if (!s.board.every((sq) => chargeStacks(sq) > 0)) return false;
    for (const sq of s.board) {
        sq.effects = sq.effects.filter((e) => e.effect !== '⚡' && e.effect !== '🔑');
        sq.bind = 0;
    }
    bumpStat(s, 'discharge');
    return true;
}
function bumpStat(s, key, n = 1) {
    s.stats[key] = (s.stats[key] || 0) + n;
}
// 着手マス i の隣にある⚡を発火させる。mover = 着手した側のシンボル
function fireCharges(s, i, mover) {
    const board = s.board;
    for (const k of orthoNeighbors(i, s.size)) {
        if (chargeStacks(board[k]) === 0) continue;
        bumpStat(s, 'fires');
        bumpStat(s, charOfPlayer(s, mover) === 'electrician' ? 'firesByElectrician' : 'firesByOther');
        for (const n of orthoNeighbors(k, s.size)) {
            const sq = board[n];
            if (!sq.player || sq.bind <= 0) continue;
            if (sq.effects.some((e) => e.effect === '🔑')) continue; // ロックは貫通しない
            // 雷霆の巫は、自陣由来（自分のコマが載っている⚡マス）の発火ダメージを受けない
            if (sq.player === board[k].player && charOfPlayer(s, sq.player) === 'electrician') continue;
            sq.bind = Math.max(0, sq.bind - FIRE_DAMAGE);
            // 雷霆の巫視点: 雷霆の巫の駒が受けた被害 / それ以外の駒に与えた被害
            bumpStat(s, charOfPlayer(s, sq.player) === 'electrician' ? 'dmgToElectrician' : 'dmgToOther');
        }
        board[k].effects = board[k].effects.filter((e) => e.effect !== '⚡');
    }
}
// 固有スキル: start から、コマのあるマスだけを縦横に辿れるすべてのマスの集合
function connectedPieces(board, start, size) {
    if (!board[start].player) return [];
    const seen = new Set([start]);
    const queue = [start];
    while (queue.length) {
        const cur = queue.shift();
        for (const n of orthoNeighbors(cur, size)) {
            if (!seen.has(n) && board[n].player) { seen.add(n); queue.push(n); }
        }
    }
    return [...seen];
}

// ---- Game state -----------------------------------------------------------
function newSquare() {
    return { player: undefined, bind: 0, effects: [] };
}

// 席ごとの配列フィールド名 → 2人戦の旧フィールド名（heart=席0 / circle=席1）
const LEGACY_ALIASES = {
    chars: ['heartChar', 'circleChar'],
    magic: ['heartMagic', 'circleMagic'],
    yy: ['heartYY', 'circleYY'],
    useMagicCount: ['heartUseMagicCount', 'circleUseMagicCount'],
    useTokenCount: ['heartUseTokenCount', 'circleUseTokenCount'],
    useAssault: ['heartUseAssault', 'circleUseAssault'],
    proliferate: ['heartProliferate', 'circleProliferate'],
    proliferateCount: ['heartProliferateCount', 'circleProliferateCount'],
    remainNecro: ['remainHeartNecro', 'remainCircleNecro'],
    necroCost: ['currentHeartNecroCost', 'currentCircleNecroCost'],
    lockedSkills: ['heartLockedSkills', 'circleLockedSkills'],
};

function defineLegacyAliases(state) {
    for (const [field, [heartName, circleName]] of Object.entries(LEGACY_ALIASES)) {
        Object.defineProperty(state, heartName, { get: () => state[field][0], set: (v) => { state[field][0] = v; }, enumerable: false, configurable: true });
        Object.defineProperty(state, circleName, { get: () => state[field][1], set: (v) => { state[field][1] = v; }, enumerable: false, configurable: true });
    }
    // 手番: heartTurn = 席0の手番か。代入すると席0/席1に切り替える（2人戦のテスト用）
    Object.defineProperty(state, 'heartTurn', { get: () => state.turn === 0, set: (v) => { state.turn = v ? 0 : 1; }, enumerable: false, configurable: true });
}

/**
 * Create a new game.
 * @param {{chars?:string[], heartChar?:string, circleChar?:string, seed?:number, rng?:()=>number}} [opts]
 *   chars=席順のキャラ配列(2〜8人)。省略時は heartChar/circleChar の2人戦
 */
function newGame(opts = {}) {
    const chars = opts.chars ? opts.chars.slice() : [opts.heartChar || 'you', opts.circleChar || 'you'];
    if (chars.length < 2 || chars.length > MAX_PLAYERS) throw new Error(`players must be 2..${MAX_PLAYERS}`);
    const n = chars.length;
    // opts.size で盤面サイズ(4〜10)を人数と無関係に指定できる。省略時は人数に応じた既定
    const size = opts.size != null ? Math.min(10, Math.max(4, Math.round(opts.size))) : boardSizeFor(n);
    const rng = opts.rng || makeRng(opts.seed == null ? 12345 : opts.seed);
    const fill = (v) => Array.from({ length: n }, () => v);
    const state = {
        board: Array.from({ length: size * size }, newSquare),
        size,
        chars,
        rng,
        currentTurn: 1,
        turn: 0, // 手番の席番号
        placements: 0, // 盤面に着手した回数（3人以上の減衰タイミング用）
        magic: fill(2),
        yy: fill('ying'),
        useMagicCount: fill(0),
        useTokenCount: fill(0),
        // pending two-step skill flags
        useLock: 0,
        useStomp: false,
        useJudgeDay: false,
        useMiasma: false,
        useInjection: 0,
        usePandemic: false,
        useBuds: [false, 0],
        useAssault: fill(0),
        // 増殖(ループ召喚): proliferate=発動中 / proliferateCount=これまでのループ回数(=次の維持コストの基準)
        proliferate: fill(false),
        proliferateCount: fill(0),
        silenced: fill(false), // サイレンス: 立っている席は次の手番スキルを使えない
        usedTokenThisTurn: false,
        // necromancer 蘇生 state
        remainNecro: fill(0),
        necroCost: fill(baseNecromancyCost),
        // skill pool + per-player locks (Game.tsx と同じく毎手番ロックを残して再シャッフル)
        skills: [],
        lockedSkills: Array.from({ length: n }, () => []),
        useChargeOne: false,
        useChargeSpread: false,
        useChargeArea: false,
        useJammer: false,
        stats: {},
        winner: undefined,
        log: [],
    };
    defineLegacyAliases(state);
    state.life = Math.max(1, calculateLife(chars[0], state.yy[0], rng));
    state.skills = reshuffleSkillsFor(state, 0, POOL_SIZE); // 先手(席0)の初期スキル
    return state;
}

// ロック済みスキルを残しつつ残り枠を [0,poolEnd) からランダムに埋める (Game.tsx reshuffledSkills と同じ)
// seat: 席番号（2人戦の旧呼び出し互換で true=席0 / false=席1 も受ける）
function reshuffleSkillsFor(s, seat, poolEnd) {
    if (typeof seat === 'boolean') seat = seat ? 0 : 1;
    const keep = s.lockedSkills[seat].slice(0, 3);
    const pool = [];
    for (let i = 0; i < poolEnd; i++) if (!keep.includes(i)) pool.push(i);
    const fill = randomAnyPick(pool, Math.max(0, 3 - keep.length), s.rng);
    return [...keep, ...fill];
}

const symbolsOf = (board) => board.map((x) => x.player);
const seatCount = (s) => s.chars.length;
const symbolOfSeat = (seat) => SYMBOLS[seat];
const curPlayer = (s) => SYMBOLS[s.turn];
const curChar = (s) => s.chars[s.turn];
const curYY = (s) => s.yy[s.turn];
const curMagic = (s) => s.magic[s.turn];
/** 自分以外の席番号 */
const otherSeats = (s, seat = s.turn) => s.chars.map((_, i) => i).filter((i) => i !== seat);

function spendMagic(s, amount) {
    s.magic[s.turn] -= amount;
}
function bumpMagicCount(s) {
    s.useMagicCount[s.turn]++;
}

// [FAITHFUL] Game.tsx calculateCost
function calculateCost(s, cost, isToken = false, isPoison = false) {
    const c = curChar(s);
    // 毒使い: 毒系スキルは-1、それ以外は+1
    if (c === 'poisoner') return isPoison ? cost - 1 : cost + 1;
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

// 次の手番の席 (Game.tsx judgeNextSeat。post-increment な currentTurn・直前に動いた席の s.turn で呼ぶ)
// 基本は席順。次が巨人のときだけ giantSkipModulo ターンに1回その席を飛ばす。
// 2人戦で同キャラ(巨人ミラー含む)のときは従来どおり休みなしで交互に回す
function judgeNextSeat(s) {
    if (s.currentTurn === 1) return 0;
    const n = seatCount(s);
    let next = (s.turn + 1) % n;
    const mirror = n === 2 && s.chars[0] === s.chars[1];
    const mod = config.giantSkipModulo || 0;
    if (!mirror && mod && s.chars[next] === 'giant' && s.currentTurn % mod >= mod - 1) next = (next + 1) % n;
    return next;
}
// 2人戦互換: 次が席0(heart)か
function judgeNextIsHeart(s) {
    return judgeNextSeat(s) === 0;
}

// Port of the useEffect[currentTurn]: advance to next player, grant magic & life.
function advanceTurn(s) {
    // サイレンスは「封じられた側の手番が終わるたび」に解除 (s.turn = 直前に動いた席)
    s.silenced[s.turn] = false;
    // 蘇生の残りターンは「発動した側の手番が終わるたび」に減る (s.turn = 直前に動いた席)
    if (s.chars[s.turn] === 'necromancer' && s.remainNecro[s.turn] > 0) s.remainNecro[s.turn]--;
    const next = judgeNextSeat(s);
    const sym = SYMBOLS[next];
    const ch = s.chars[next];
    const magicCharacter = ['magician'];
    // Game.tsx と同じく次の手番の席自身の魔力・バッズから計算する
    let nextMagic = s.magic[next] + 1 + lateMagicBonus(s.currentTurn, seatCount(s)) + budsCount(s.board, sym);
    if (magicCharacter.includes(ch)) nextMagic++;
    if (ch === 'yinYangMaster' && s.yy[next] === 'ying') nextMagic++;
    // 魔法使い: 自陣のバッズ1つにつき魔力回復+3 (標準+1に追加+2)
    if (ch === 'magician') nextMagic += budsCount(s.board, sym) * 2;
    // 増殖: 手番開始時に維持コストを支払う。払えなければループが途切れる
    if (s.proliferate[next]) {
        const upkeep = proliferateUpkeep(s.proliferateCount[next]);
        if (nextMagic >= upkeep) nextMagic -= upkeep;
        else { s.proliferate[next] = false; s.proliferateCount[next] = 0; }
    }
    s.magic[next] = nextMagic;
    s.life = calculateLife(ch, s.yy[next], s.rng, ch === 'poisoner' ? poisonCountFor(s.board, sym) : 0);
    if (s.life <= 0) s.life = 1;
    s.usedTokenThisTurn = false;
    s.turn = next;
    // 次の手番プレイヤーのロックを残してスキルを再シャッフル (Game.tsx [history] effect と同じ)
    s.skills = reshuffleSkillsFor(s, next, POOL_SIZE);
}

/**
 * Place / attack at index i (the core onCellClick path). Returns true if the
 * move was applied (turn advances), false if illegal (no-op).
 * [FAITHFUL] Game.tsx onCellClick
 */
function placeMove(s, i) {
    const board = s.board;

    // ジャマー: ⚡のあるマスを選ぶ。無敵マスでも**自分の**ものは選べる（弱点を解く唯一の手段）。他人の無敵マスは選べない
    if (s.useJammer) {
        if (chargeStacks(board[i]) === 0) return false;
        if (isShielded(s, board[i]) && board[i].player !== curPlayer(s)) return false;
        exeJammer(s, i);
        return true;
    }

    // 雷霆の巫の⚡付き自陣マスは、本人も相手も触れない (無敵＋弱点)
    if (isShielded(s, board[i])) return false;

    // pending targeted skills consume the click without advancing the turn
    if (s.useChargeOne) {
        board[i].effects.push({ effect: '⚡' });
        s.useChargeOne = false;
        checkDischarge(s);
        return true;
    }
    if (s.useChargeSpread) {
        exeChargeSpread(s, i);
        return true;
    }
    if (s.useChargeArea) {
        exeChargeArea(s, i);
        return true;
    }
    if (s.useLock > 0) {
        board[i].effects.push({ effect: '🔑' });
        if (board[i].bind < 6) board[i].bind = 6;
        s.useLock -= 1;
        return true;
    }
    if (s.useInjection > 0) {
        board[i].effects.push({ effect: '☠' });
        poisonStrike(s, board[i]);
        s.useInjection -= 1;
        return true;
    }
    if (s.useMiasma) {
        exeMiasma(s, i);
        return true;
    }
    if (s.usePandemic) {
        exePandemic(s, i);
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
    const necroActive = curChar(s) === 'necromancer' && s.remainNecro[s.turn] > 0;
    if (board[i].player && board[i].player !== curPlayer(s)) {
        if (board[i].bind > 0 && curChar(s) !== 'giant') return false; // can't attack a bound enemy unless giant
    }
    if (board[i].effects.find((e) => e.effect === '🔑') && board[i].bind > 0) return false;

    // decay step (+ 毒: スタック数だけ追加で bind を減らす)。3人以上は手番が1周するごとに1回だけ (issue #30)
    const decayNow = shouldDecay(s.placements, seatCount(s));
    s.placements += 1;
    const spreadOrigins = [];
    for (let k = 0; decayNow && k < board.length; k++) {
        const sq = board[k];
        if ((sq.player || sq.effects.some((e) => e.effect === '🔑')) && sq.bind > 0) sq.bind--;
        const poison = sq.effects.filter((e) => e.effect === '☠').length;
        if (poison > 0 && sq.bind > 0) sq.bind = Math.max(0, sq.bind - poison);
        if (sq.bind === 0) sq.effects = sq.effects.filter((e) => e.effect !== '🔑');
        // 毒持ちでライフが0のマスは消える（空きマスに戻る）。毒使い側は空いたマス1つにつき魔力+1。
        // 「このターンに0へ落ちた」とは限らない: ライフ0のコマに後から毒を撒いた場合も消す
        if (poison > 0 && sq.bind === 0 && sq.player && k !== i) {
            spreadOrigins.push(k);
            board[k] = { player: undefined, bind: 0, effects: [] };
            s.chars.forEach((c, seat) => { if (c === 'poisoner') s.magic[seat] += 1; });
        }
    }
    const hadPoisonAtTarget = board[i].effects.some((e) => e.effect === '☠');

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
        // 毒持ちの敵コマを奪取/破壊した場合は拡散の起点にする
        if (calc <= 0 && hadPoisonAtTarget) spreadOrigins.push(i);
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
    if (s.useAssault[s.turn] > 0) {
        const empties = findEmptyIndexes(board);
        if (empties.length) board[randomPick(empties, s.rng)] = { player: cur, bind: 0, effects: [] };
        s.useAssault[s.turn] -= 1;
    }

    // 増殖発動中: 着手のたびにコマ→アイテムを交互に1つずつ追加し続ける
    if (s.proliferate[s.turn]) {
        const nextCount = s.proliferateCount[s.turn] + 1;
        if (applyProliferate(s, nextCount)) {
            s.proliferateCount[s.turn] = nextCount;
            // 上限に達したら自然収束
            if (nextCount >= PROLIFERATE.maxStacks) {
                s.proliferate[s.turn] = false;
                s.proliferateCount[s.turn] = 0;
            }
        }
    }

    // ⚡発火: 着手マスの隣にある帯電マスが、その縦横隣接のコマへ1ダメージ
    fireCharges(s, i, cur);

    // 蘇生発動中: ライフが0になった敵コマを自動で自陣に吸収する
    if (necroActive) {
        let absorbed = 0;
        for (let k = 0; k < board.length; k++) {
            const sq = board[k];
            if (sq.player && sq.player !== cur && sq.bind === 0 && !sq.effects.some((e) => e.effect === '🔑')) {
                board[k] = { player: cur, bind: necromancyReviveLife, effects: [] };
                absorbed++;
            }
        }
        // 吸収した敵の数だけ墓地+
        if (absorbed > 0) addCorpses(s, absorbed);
    }

    // 毒拡散パッシブ: 毒で死んだ/毒持ちが奪取破壊されたマスの周囲へ毒を拡散
    if (poisonerInPlay(s) && spreadOrigins.length) {
        for (const o of spreadOrigins) spreadPoisonAround(board, o, s.rng, s);
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
    s.magic[s.turn] += skillCosts.onClickCharge;
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
    s.magic[0] -= skillCosts.onClickDepressionCherry;
    s.magic[1] -= 1;
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
    s.useTokenCount[s.turn]++;
}
function onClickDoubleToken(s) {
    const empties = findEmptyIndexes(s.board);
    const [a, b] = randomAnyPick(empties, 2, s.rng);
    if (a != null) s.board[a] = { player: curPlayer(s), bind: calculateTokenBind(s), effects: [] };
    if (b != null) s.board[b] = { player: curPlayer(s), bind: calculateTokenBind(s), effects: [] };
    spendMagic(s, calculateCost(s, skillCosts.onClickDoubleToken, true));
    bumpMagicCount(s);
    s.usedTokenThisTurn = true;
    s.useTokenCount[s.turn]++;
}
function onClickBudsToken(s) {
    const empties = findEmptyIndexes(s.board);
    if (empties.length) s.board[randomPick(empties, s.rng)] = { player: curPlayer(s), bind: calculateTokenBind(s), effects: [{ effect: '🌱' }] };
    spendMagic(s, calculateCost(s, skillCosts.onClickBudsToken, true));
    bumpMagicCount(s);
    s.usedTokenThisTurn = true;
    s.useTokenCount[s.turn]++;
}
function onClickBothToken(s) {
    // 参加者全員に1つずつ（席順に空きマスからランダムに）。空きが足りなければ先着の席だけ
    const empties = findEmptyIndexes(s.board);
    const picks = randomAnyPick(empties, Math.min(seatCount(s), empties.length), s.rng);
    picks.forEach((idx, seat) => {
        s.board[idx] = { player: SYMBOLS[seat], bind: seat === s.turn ? calculateTokenBind(s) : 4, effects: [] };
    });
    s.magic[s.turn] -= calculateCost(s, skillCosts.onClickBothToken, true);
    s.useMagicCount[s.turn]++;
    s.usedTokenThisTurn = true;
    s.useTokenCount[s.turn]++;
}
function onClickSlash(s) {
    for (const idx of geometryOf(s.size).antiDiagonal) if (!isGuarded(s, s.board[idx])) s.board[idx].bind = 0;
    spendMagic(s, calculateCost(s, skillCosts.onClickSlash));
    bumpMagicCount(s);
}
function onClickBackSlash(s) {
    for (const idx of geometryOf(s.size).mainDiagonal) if (!isGuarded(s, s.board[idx])) s.board[idx].bind = 0;
    spendMagic(s, calculateCost(s, skillCosts.onClickBackSlash));
    bumpMagicCount(s);
}
function onClickOpium(s) {
    const cur = curPlayer(s);
    for (const sq of s.board) {
        if (sq.player !== cur && sq.bind > 0 && !isGuarded(s, sq)) {
            const calc = sq.bind - 2;
            sq.bind = calc > 1 ? sq.bind - 2 : 0;
        }
    }
    spendMagic(s, calculateCost(s, skillCosts.onClickOpium));
    bumpMagicCount(s);
    endTurn(s);
}
function onClickTsunami(s) {
    // 相手全員のマジックを0に
    for (const seat of otherSeats(s)) s.magic[seat] = 0;
    s.magic[s.turn] -= calculateCost(s, skillCosts.onClickTsunami);
    s.useMagicCount[s.turn]++;
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
    s.yy[s.turn] = s.yy[s.turn] === 'yang' ? 'ying' : 'yang';
    s.magic[s.turn] -= skillCosts.onClickToggleYingYang;
}
function onClickYingYangSkill(s) {
    applyYingYangDance(s, curYY(s));
    s.magic[s.turn] -= skillCosts.onClickYingYangSkill;
}
function applyYingYangDance(s, mode) {
    const cur = curPlayer(s);
    let destroyed = 0;
    if (mode === 'yang') {
        for (const sq of s.board) if (sq.player === cur) sq.bind += 2;
    } else {
        // 凶荒の舞: 自分以外の全員のコマ
        for (const sq of s.board) if (sq.player && sq.player !== cur) { sq.bind -= 2; if (sq.bind < 1) { sq.player = undefined; sq.effects = []; sq.bind = 0; destroyed++; } }
    }
    addCorpses(s, destroyed);
}

// giant
function onClickStomp(s) {
    s.useStomp = true;
    spendMagic(s, skillCosts.onClickStomp);
}
function exeStomp(s, i) {
    const cur = curPlayer(s);
    let destroyed = 0;
    for (const idx of geometryOf(s.size).stompRange(i)) {
        if (s.board[idx].player === cur) s.board[idx].bind = s.board[idx].bind > 5 ? s.board[idx].bind - 5 : 0;
        else { if (s.board[idx].player) destroyed++; s.board[idx] = { player: undefined, bind: 0, effects: [] }; }
    }
    addCorpses(s, destroyed);
    if (s.board[i].player === undefined) s.board[i] = { player: cur, bind: s.life, effects: [] };
    s.useStomp = false;
}

// magician judge day
function judgeDayCost(s) {
    const used = s.useMagicCount[s.turn];
    return used < skillCosts.onClickJudgeDay ? skillCosts.onClickJudgeDay - used : 0;
}
function onClickJudgeDay(s) {
    spendMagic(s, judgeDayCost(s));
    s.useMagicCount[s.turn] = 0;
    s.useJudgeDay = true;
}
function exeJudgeDay(s, i) {
    const cur = curPlayer(s);
    let destroyed = 0;
    for (const idx of geometryOf(s.size).judgeRange(i)) {
        const sq = s.board[idx];
        const locked = sq.effects.some((e) => e.effect === '🔑');
        const protectedBud = sq.player === cur && sq.effects.some((e) => e.effect === '🌱');
        if (!locked || !protectedBud) { if (s.board[idx].player) destroyed++; s.board[idx] = { player: undefined, bind: 0, effects: [] }; }
    }
    addCorpses(s, destroyed);
    s.useMagicCount[s.turn] = 0;
    s.board[i] = { player: cur, bind: 2, effects: [{ effect: '🌱' }] };
    s.useJudgeDay = false;
    endTurn(s);
}

function totalAssaultCost(s) {
    return skillCosts.onClickTotalAssault - s.useTokenCount[s.turn] * 2;
}
function onClickTotalAssault(s) {
    s.useAssault[s.turn] = 3;
    s.magic[s.turn] -= totalAssaultCost(s);
    s.useTokenCount[s.turn] = 0;
}

// ---- 増殖 (ループ召喚) ----
// [FAITHFUL] Game.tsx proliferateUpkeep / applyProliferate / onClickProliferate
function proliferateUpkeep(count) {
    return count * PROLIFERATE.upkeepStep;
}
// 1ループ分を盤面に適用。奇数回=コマ(キャラ)、偶数回=アイテム。追加できなければ false（回数を進めない）
function applyProliferate(s, step) {
    const me = curPlayer(s);
    if (step % 2 === 1) {
        const empties = findEmptyIndexes(s.board);
        if (!empties.length) return false;
        s.board[randomPick(empties, s.rng)] = { player: me, bind: PROLIFERATE.tokenLife, effects: [] };
        return true;
    }
    // 毒使いだけは敵コマへの毒がアイテムになる (毒拡散パッシブとつながる)
    const isPoisoner = curChar(s) === 'poisoner';
    const targets = [];
    for (let i = 0; i < s.board.length; i++) {
        const sq = s.board[i];
        if (sq.effects.some((e) => e.effect === '🔑')) continue;
        if (isPoisoner ? sq.player && sq.player !== me : sq.player === me) targets.push(i);
    }
    if (!targets.length) return false;
    const pick = s.board[randomPick(targets, s.rng)];
    pick.effects.push({ effect: isPoisoner ? '☠' : '🌱' });
    if (isPoisoner) poisonStrike(s, pick);
    return true;
}
function onClickProliferate(s) {
    s.proliferate[s.turn] = true;
    s.proliferateCount[s.turn] = 0;
    spendMagic(s, calculateCost(s, skillCosts.onClickProliferate));
    bumpMagicCount(s);
}

// necromancer: activate 蘇生 (墓地から召喚 + 4ターンの自動吸収窓)
function necromancyCost(s) {
    return s.necroCost[s.turn];
}
function summonCorpses(s, corpses) {
    const cur = curPlayer(s);
    const empties = findEmptyIndexes(s.board);
    const summonCount = Math.min(corpses, necromancySummonCap, empties.length);
    const targets = randomAnyPick(empties, summonCount, s.rng);
    for (const idx of targets) s.board[idx] = { player: cur, bind: necromancyReviveLife, effects: [] };
}
function onClickNecromancy(s) {
    const curCost = s.necroCost[s.turn];
    // 墓地に貯まった死体数だけ召喚 (上限・空きマスでクランプ)
    summonCorpses(s, baseNecromancyCost - curCost);
    s.magic[s.turn] -= curCost;
    s.useMagicCount[s.turn]++;
    s.remainNecro[s.turn] = necromancyDuration;
    s.necroCost[s.turn] = baseNecromancyCost;
}

// ---- 毒使い スキル ----
const MIASMA_MIN_COST = 1; // Game.tsx / skillCosts.ts と同値
function miasmaCost(s) {
    return Math.max(MIASMA_MIN_COST, calculateCost(s, skillCosts.onClickMiasma - boardPoisonCount(s.board), false, true));
}
function onClickMiasma(s) {
    s.useMiasma = true;
    spendMagic(s, miasmaCost(s));
}
function exeMiasma(s, i) {
    const cur = curPlayer(s);
    const targets = surroundRange(s, i).filter(
        (j) => s.board[j].player && s.board[j].player !== cur && !isGuarded(s, s.board[j])
    );
    for (const t of targets) { s.board[t].effects.push({ effect: '☠' }); poisonStrike(s, s.board[t]); }
    s.useMiasma = false;
}
function onClickInjection(s) {
    s.useInjection += 1;
    spendMagic(s, calculateCost(s, skillCosts.onClickInjection, false, true));
    bumpMagicCount(s);
}
function onClickPoisonToken(s) {
    const empties = findEmptyIndexes(s.board);
    if (empties.length) s.board[randomPick(empties, s.rng)] = { player: curPlayer(s), bind: Math.round(calculateTokenBind(s) * (curChar(s) === 'poisoner' ? POISON_MULT : 1)), effects: [{ effect: '☠' }] };
    spendMagic(s, calculateCost(s, skillCosts.onClickPoisonToken, true, true));
    bumpMagicCount(s);
    s.usedTokenThisTurn = true;
    s.useTokenCount[s.turn]++;
}
function onClickSerum(s) {
    const cur = curPlayer(s);
    for (const sq of s.board) if (sq.player === cur) sq.effects = sq.effects.filter((e) => e.effect !== '☠');
    spendMagic(s, calculateCost(s, skillCosts.onClickSerum, false, true));
    bumpMagicCount(s);
}
function onClickIntensify(s) {
    for (const sq of s.board) {
        const p = poisonStacks(sq);
        for (let k = 0; k < p; k++) sq.effects.push({ effect: '☠' });
        if (p > 0) poisonStrike(s, sq);
    }
    spendMagic(s, calculateCost(s, skillCosts.onClickIntensify, false, true));
    bumpMagicCount(s);
}
function onClickPandemic(s) {
    s.usePandemic = true;
    spendMagic(s, calculateCost(s, skillCosts.onClickPandemic, false, true));
    bumpMagicCount(s);
}
function exePandemic(s, i) {
    const targets = geometryOf(s.size).stompRange(i).filter((j) => s.board[j].player && !isGuarded(s, s.board[j]));
    for (const t of targets) { s.board[t].effects.push({ effect: '☠' }); poisonStrike(s, s.board[t]); }
    s.usePandemic = false;
}

// ---- 雷霆の巫 スキル ----
function onClickChargeToken(s) {
    const empties = findEmptyIndexes(s.board);
    if (empties.length) s.board[randomPick(empties, s.rng)] = { player: curPlayer(s), bind: calculateTokenBind(s), effects: [{ effect: '⚡' }] };
    spendMagic(s, calculateCost(s, skillCosts.onClickChargeToken, true));
    bumpMagicCount(s);
    s.usedTokenThisTurn = true;
    s.useTokenCount[s.turn]++;
    bumpStat(s, 'chargeToken');
    checkDischarge(s);
}
function onClickChargeOne(s) {
    s.useChargeOne = true;
    spendMagic(s, chargeOneCost(s));
    bumpMagicCount(s);
    bumpStat(s, 'chargeOne');
}
// 固有スキル: 選んだコマのあるマスから、コマのあるマスだけを縦横に辿ってすべてに⚡を付与（発火はしない）
function onClickChargeSpread(s) {
    s.useChargeSpread = true;
    spendMagic(s, chargeSpreadCost(s));
    bumpStat(s, 'chargeSpread');
}
function exeChargeSpread(s, i) {
    const cells = connectedPieces(s.board, i, s.size);
    for (const k of cells) s.board[k].effects.push({ effect: '⚡' });
    bumpStat(s, 'spreadCells', cells.length);
    s.useChargeSpread = false;
    checkDischarge(s);
}

// ---- 雷霆の巫 スキル2 (#40) ----
// 帯電ダブルトークン: ⚡付きのコマを2つ設置（ターン1回）
function onClickDoubleChargeToken(s) {
    const empties = findEmptyIndexes(s.board);
    for (const idx of randomAnyPick(empties, 2, s.rng)) {
        if (idx != null) s.board[idx] = { player: curPlayer(s), bind: calculateTokenBind(s), effects: [{ effect: '⚡' }] };
    }
    spendMagic(s, calculateCost(s, skillCosts.onClickDoubleChargeToken, true));
    bumpMagicCount(s);
    s.usedTokenThisTurn = true;
    s.useTokenCount[s.turn]++;
    bumpStat(s, 'doubleChargeToken');
    checkDischarge(s);
}
// 範囲帯電: 選んだマスを中心に3x3へ⚡を付与（発火はしない）
function onClickChargeArea(s) {
    s.useChargeArea = true;
    spendMagic(s, calculateCost(s, skillCosts.onClickChargeArea));
    bumpMagicCount(s);
    bumpStat(s, 'chargeArea');
}
function exeChargeArea(s, i) {
    const cells = geometryOf(s.size).stompRange(i);
    for (const k of cells) s.board[k].effects.push({ effect: '⚡' });
    bumpStat(s, 'areaCells', cells.length);
    s.useChargeArea = false;
    checkDischarge(s);
}
// ランダム帯電: ランダムな1〜4マスに⚡（空きマス可。無敵マス・ロック中のマスは除く）
function onClickChargeRandom(s) {
    const cands = [];
    for (let k = 0; k < s.board.length; k++) {
        if (!isShielded(s, s.board[k]) && !s.board[k].effects.some((e) => e.effect === '🔑')) cands.push(k);
    }
    const n = Math.min(cands.length, 1 + Math.floor(s.rng() * 4));
    for (const k of randomAnyPick(cands, n, s.rng)) s.board[k].effects.push({ effect: '⚡' });
    spendMagic(s, calculateCost(s, skillCosts.onClickChargeRandom));
    bumpMagicCount(s);
    bumpStat(s, 'chargeRandom');
    checkDischarge(s);
}
// ジャマー: 選んだマスの⚡を発散。縦横に隣接する**敵**コマ(ライフ>0・ロックなし)に⚡のスタック数だけダメージ、⚡は消える
function onClickJammer(s) {
    s.useJammer = true;
    spendMagic(s, calculateCost(s, skillCosts.onClickJammer));
    bumpMagicCount(s);
    bumpStat(s, 'jammer');
}
function exeJammer(s, i) {
    const cur = curPlayer(s);
    const stacks = chargeStacks(s.board[i]);
    for (const j of orthoNeighbors(i, s.size)) {
        const sq = s.board[j];
        if (!sq.player || sq.player === cur || sq.bind <= 0) continue;
        if (sq.effects.some((e) => e.effect === '🔑')) continue; // ロックは貫通しない
        const before = sq.bind;
        sq.bind = Math.max(0, sq.bind - stacks);
        bumpStat(s, 'jammerDmg', before - sq.bind);
        if (sq.bind === 0) bumpStat(s, 'jammerZeroed');
    }
    s.board[i].effects = s.board[i].effects.filter((e) => e.effect !== '⚡');
    s.useJammer = false;
}

// ヘイルメアリー (idx 27): 陰陽転化を除く固有スキルを追加コストなしでランダム発動 [FAITHFUL] Game.tsx onClickHailMary
// 対象選択が要るもの(ストンプ/審判の日/ミアズマ/帯電拡散)は use* フラグを立てるだけ。対象クリックは呼び出し側(AI)の責任
function onClickHailMary(s) {
    spendMagic(s, calculateCost(s, skillCosts.onClickHailMary));
    const choices = [
        () => { s.useAssault[s.turn] = 3; s.useTokenCount[s.turn] = 0; },
        () => { s.useStomp = true; },
        () => { s.useJudgeDay = true; },
        () => applyYingYangDance(s, 'yang'),
        () => applyYingYangDance(s, 'ying'),
        () => {
            summonCorpses(s, Math.max(...s.necroCost.map((c) => baseNecromancyCost - c)));
            if (curChar(s) === 'necromancer') { s.remainNecro[s.turn] = necromancyDuration; s.necroCost[s.turn] = baseNecromancyCost; }
        },
        () => { s.useMiasma = true; },
        () => { s.useChargeSpread = true; },
    ];
    choices[Math.floor(s.rng() * choices.length)]();
}

// サイレンス (idx 28): 自分以外の全席を次の手番スキル禁止にする [FAITHFUL] Game.tsx onClickSilence
function onClickSilence(s) {
    otherSeats(s).forEach((seat) => { s.silenced[seat] = true; });
    spendMagic(s, calculateCost(s, skillCosts.onClickSilence));
}

const SKILLS = {
    charge: onClickCharge,
    miasma: onClickMiasma,
    injection: onClickInjection,
    poisonToken: onClickPoisonToken,
    serum: onClickSerum,
    intensify: onClickIntensify,
    pandemic: onClickPandemic,
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
    proliferate: onClickProliferate,
    chargeToken: onClickChargeToken,
    chargeOne: onClickChargeOne,
    chargeSpread: onClickChargeSpread,
    hailMary: onClickHailMary,
    silence: onClickSilence,
    doubleChargeToken: onClickDoubleChargeToken,
    chargeArea: onClickChargeArea,
    chargeRandom: onClickChargeRandom,
    jammer: onClickJammer,
};

// ---- Rendering ------------------------------------------------------------
function renderBoard(s) {
    const cell = (sq) => {
        const sym = sq.player || '・';
        const eff = sq.effects.map((e) => e.effect).join('');
        return `${sym}${String(sq.bind).padStart(2)}${eff ? eff : '  '}`;
    };
    const n = s.size;
    let out = '    ' + Array.from({ length: n }, (_, c) => `col${c}`.padEnd(8)).join('') + '\n';
    for (let r = 0; r < n; r++) {
        const row = [];
        for (let c = 0; c < n; c++) row.push(cell(s.board[r * n + c]));
        out += `r${r} ` + row.map((x, c) => `${String(r * n + c).padStart(2)}:${x}`).join(' ') + '\n';
    }
    return out;
}

module.exports = {
    HEART, CIRCLE, SYMBOLS, MAX_PLAYERS, seatOf, boardSizeFor, DECAY_PER_ROUND_MIN_PLAYERS, CHARACTERS, skillCosts, SKILLS,
    makeRng, normRand, calculateLife, calculateWinner, findEmptyIndexes,
    newGame, placeMove, advanceTurn, judgeNextSeat, judgeNextIsHeart, shouldDecay, lateMagicBonus, renderBoard,
    curPlayer, curChar, curMagic, symbolOfSeat, seatCount, otherSeats, symbolsOf, calculateCost, judgeDayCost, totalAssaultCost, necromancyCost, reshuffleSkillsFor,
    miasmaCost, boardPoisonCount, surroundRange,
    PROLIFERATE, proliferateUpkeep,
    POOL_SIZE, FIRE_DAMAGE, CHARGE_MIN_COST, boardChargeCount, chargeOneCost, chargeSpreadCost, chargeStacks, orthoNeighbors, isShielded, isGuarded, connectedPieces, charOfPlayer,
};
