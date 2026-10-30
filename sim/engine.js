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
const CHARACTERS = ['you', 'tactician', 'magician', 'giant', 'yinYangMaster', 'necromancer', 'poisoner', 'electrician', 'cryomancer', 'pyromancer', 'witch'];

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
const { boardSizeFor, geometryOf, geometryForCells, lineCells } = require('./shared/boardGeometry');
const gear = require('./shared/gear');
const deckMod = require('./shared/deck');
const discountMod = require('./shared/discount');
const comboMod = require('./shared/comboCost');
const lifeBanMod = require('./shared/lifeBan');
const bigMod = require('./shared/bigSkills');
const darkPotMod = require('./shared/darkPot');
const thermal = require('./shared/thermal');
const poisonMod = require('./shared/poison');
const blastMod = require('./shared/blast');
const shikiMod = require('./shared/shikigami');
const turnMod = require('./shared/turn');
const gearTurnMod = require('./shared/gearTurn');
const graveMod = require('./shared/graveSkills');
const placementMod = require('./shared/placement');
const proliferateMod = require('./shared/proliferate');
const tokenAfterMod = require('./shared/tokenAfter');
const deadlockMod = require('./shared/deadlock');
const chargeMod = require('./shared/charge');
const tokenSkillsMod = require('./shared/tokenSkills');
const genericMod = require('./shared/generic');
const giantAuraMod = require('./shared/giantAura');
const giantTurnMod = require('./shared/giantTurn');
// 巨人が何ラウンドに1回動くか。A/B検証用に config.giantActEvery で上書きできる（未設定なら本番の GIANT_ACT_EVERY）
const GIANT_ACT_EVERY = config.giantActEvery != null ? config.giantActEvery : giantTurnMod.GIANT_ACT_EVERY;
const { GEAR_PARAMS: GP, hasGear } = gear;

// ライフ減衰・長期戦の魔力ボーナスの規則は本番(decay.ts / lateMagic.ts)の生成物を使う(#289)。
// A/B検証用に環境変数で上書きできる:
//   DECAY_PER_ROUND_MIN_PLAYERS=99 … 全人数で着手ごとに減衰 / LATE_MAGIC_INTERVAL=0 … 魔力ボーナスを無効化
const decayMod = require('./shared/decay');
const lateMagicMod = require('./shared/lateMagic');
const DECAY_PER_ROUND_MIN_PLAYERS = process.env.DECAY_PER_ROUND_MIN_PLAYERS != null
    ? parseInt(process.env.DECAY_PER_ROUND_MIN_PLAYERS, 10)
    : decayMod.DECAY_PER_ROUND_MIN_PLAYERS;
const LATE_MAGIC_INTERVAL = process.env.LATE_MAGIC_INTERVAL != null
    ? parseInt(process.env.LATE_MAGIC_INTERVAL, 10)
    : lateMagicMod.LATE_MAGIC_INTERVAL;
const shouldDecay = (placements, n) => decayMod.shouldDecay(placements, n, DECAY_PER_ROUND_MIN_PLAYERS);
const lateMagicBonus = (turn, n) => lateMagicMod.lateMagicBonus(turn, n, LATE_MAGIC_INTERVAL);

// [FAITHFUL] Game.tsx 増殖(ループ召喚)の定数。config.js のノブで上書きできる
const PROLIFERATE = Object.assign({}, turnMod.PROLIFERATE, config.proliferate || {});

// 汎用スキルプールの大きさ (idx 0..POOL_SIZE-1)。#39 で 21 -> 23、#40 で 23 -> 27、ヘイルメアリー/サイレンスで 27 -> 29、毒霧で 29 -> 30
const { SHIKIGAMI_LIFE, SHIKIGAMI_BLAST_DAMAGE, newShikigami } = shikiMod;
const POOL_SIZE = Number(process.env.SIM_POOL_SIZE) || config.poolSize || 49; // SIM_POOL_SIZE: A/B検証用の上書き

// ---- util.ts（本番の生成物。乱数は rng を渡す） ---------------------------------
const utilMod = require('./shared/util');
const { LIFE_STD, calculateWinner, findEmptyIndexes, normRand } = utilMod;
// lifeBonus: 毒使いの「自陣の毒の数だけライフ期待値+1」用
function calculateLife(characterId, yinYangMode, rng, lifeBonus = 0, std = LIFE_STD) {
    return utilMod.calculateLife(characterId, yinYangMode, lifeBonus, std, rng);
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

// コスト表は本番(skillCosts.ts)の生成物をそのまま使う(#289)。SIM_COSTS で上書きするので浅いコピーを持つ
const skillCosts = { ...require('./shared/skillCosts').skillCosts };
// A/B検証用: SIM_COSTS='onClickFrostToken=5,onClickWindborne=4' のようにコストを上書きできる（既定は未設定＝上の値）
if (process.env.SIM_COSTS) for (const kv of process.env.SIM_COSTS.split(',')) { const [k, v] = kv.split('='); if (k in skillCosts) skillCosts[k] = Number(v); }
// 盤面の⚡の数だけ、帯電付与・帯電拡散のコストを軽減する。下限（#43）
// ⚡の発火ダメージ。config.charge.fireDamage（A/B検証用に環境変数 CHG_FIRE_DMG でも上書き可）
/** 雷霆の巫以外のコマは、⚡が乗った時点でこのダメージを受ける（charge.ts の CHARGE_LANDING_DAMAGE と同値） */
const CHARGE_LANDING_DAMAGE = 2;
const FIRE_DAMAGE = Number(process.env.CHG_FIRE_DMG) || (config.charge && config.charge.fireDamage) || 1;
// 過負荷: 全マスが⚡で埋まったら、全⚡と🔑ロックを取り除いて全マスのライフを0にする（ユーザー案。ロックも解除する）。
// 既定は有効。環境変数 CHG_DISCHARGE=0 / config.charge.discharge=false で無効化できる（A/B検証用）
const DISCHARGE = process.env.CHG_DISCHARGE != null ? process.env.CHG_DISCHARGE === '1' : !(config.charge && config.charge.discharge === false);
const CHARGE_MIN_COST = (config.charge && config.charge.minCost) || 1;

// [FAITHFUL] Game.tsx necromancer constants
const baseNecromancyCost = turnMod.NECROMANCY.baseCost;
const necromancyDuration = turnMod.NECROMANCY.duration;
const necromancyReviveLife = turnMod.NECROMANCY.reviveLife;
const necromancySummonCap = turnMod.NECROMANCY.summonCap;

// 盤上で駒が消える/奪われるたびに墓地を貯める＝ネクロの蘇生コストを軽減 (敵味方問わず)
function addCorpses(s, n) {
    if (n <= 0) return;
    s.chars.forEach((c, seat) => {
        if (c === 'necromancer') s.necroCost[seat] = Math.max(0, s.necroCost[seat] - n);
    });
}

// ---- 毒（毒使い）ヘルパー --------------------------------------------------
// 効力のある毒の数。休眠マス（氷結・火炎中）の☠は消えないが休眠する（継続ダメージ・毒数に依存する処理に数えない）
const poisonStacks = poisonMod.activePoison;
const boardPoisonCount = poisonMod.boardPoisonCount;
const poisonCountFor = poisonMod.poisonCountFor;
function poisonerInPlay(s) {
    return s.chars.includes('poisoner');
}
function poisonStrike(s, sq) {
    if (!s || !sq.player) return;
    sq.bind = poisonMod.poisonStrike(sq, s.chars).bind; // 毒使いの駒に毒が付いた瞬間、そのマスのライフが1.5倍（本番 poison.ts）
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
    toxicBloom(s, [t]);
}

// ---- 帯電（雷霆の巫） ------------------------------------------------------
// ⚡は {effect:'⚡'} の個数がスタック。発火: 帯電マスの縦横に隣接するマスへ誰かが着手すると、
// その帯電マスの縦横隣接のコマに1ダメージ。🔑ロック中(bind>0)のマスは貫通しない。発火した⚡は全部消える。
const chargeStacks = chargeMod.chargeStacks;
// 縦横4隣接。size = 盤の一辺 (s.size)
const orthoNeighbors = chargeMod.orthoNeighbors;
function charOfPlayer(s, player) {
    return s.chars[seatOf(player)];
}
// 雷霆の巫の⚡付き自陣マスは「ライフ0でも取られない」無敵。弱点として本人も触れない
function isShielded(s, sq) {
    return chargeMod.isShielded(sq, s.chars);
}
// 🔑ロックまたは⚡の無敵＝ダメージ系スキルの対象外にするマス
function isGuarded(s, sq) {
    return chargeMod.isGuarded(sq, s.chars);
}
// 盤面全体の⚡の数（スタック込み。氷結中のマスの⚡は休眠なので数えない）
const boardChargeCount = chargeMod.boardChargeCount;
// 帯電付与・帯電拡散の実コスト: 盤面の⚡の数だけ軽減、下限 CHARGE_MIN_COST (#43。ミアズマと同じ流儀)
function chargeOneCost(s) {
    return Math.max(CHARGE_MIN_COST, calculateCost(s, costsOf(s).onClickChargeOne - boardChargeCount(s.board), false, false, 'onClickChargeOne'));
}
function chargeSpreadCost(s) {
    return Math.max(CHARGE_MIN_COST, calculateCost(s, costsOf(s).onClickChargeSpread - boardChargeCount(s.board), false, false, 'onClickChargeSpread'));
}
// ⚡を増やす操作の直後に呼ぶ。全マスに⚡があれば全⚡と🔑を取り除き、全マスのライフを0にする
function checkDischarge(s) {
    if (!DISCHARGE) return false;
    const next = chargeMod.applyOverload(s.board); // 全マスが⚡（休眠マスは⚡なし扱い）なら、全⚡と🔑を取り除き全マスのライフを0に（本番 charge.ts）
    if (next === s.board) return false;
    next.forEach((sq, k) => { s.board[k] = sq; });
    bumpStat(s, 'discharge');
    return true;
}
function bumpStat(s, key, n = 1) {
    s.stats[key] = (s.stats[key] || 0) + n;
}
// 純粋版: すでに⚡が乗ったマス sq に「乗った時点のダメージ」をかけたマスを返す。ライフ0・🔑・氷結中・空きマス・雷霆の巫は受けない
const landedCharge = (chars, sq) => chargeMod.landCharge(sq, chars);
// s.board[k] に⚡を1つ付与する（雷霆の巫以外のコマは乗った時点で2ダメージ）
function addCharge(s, k) {
    s.board[k].effects.push({ effect: '⚡' });
    landCharge(s, k);
}
// すでに⚡が乗った s.board[k] に、乗った時点のダメージだけをかける（トークン用）
function landCharge(s, k) {
    s.board[k] = landedCharge(s.chars, s.board[k]);
}
// 着手マス i の隣にある⚡を発火させる。mover = 着手した側のシンボル
function fireCharges(s, i, mover) {
    const conductors = s.gears.map((g) => hasGear(g, 'conduction'));
    const owners = s.board.map((sq) => sq.player);
    const { fired, damaged } = chargeMod.fireCharges(s.board, i, s.size, s.chars, conductors, FIRE_DAMAGE);
    for (let n = 0; n < fired.length; n++) {
        bumpStat(s, 'fires');
        bumpStat(s, charOfPlayer(s, mover) === 'electrician' ? 'firesByElectrician' : 'firesByOther');
    }
    // 雷霆の巫視点: 雷霆の巫の駒が受けた被害 / それ以外の駒に与えた被害
    for (const n of damaged) bumpStat(s, charOfPlayer(s, owners[n]) === 'electrician' ? 'dmgToElectrician' : 'dmgToOther');
}
// 固有スキル: start から、コマのあるマスだけを縦横に辿れるすべてのマスの集合
const connectedPieces = chargeMod.connectedPieces;

// ---- ギアのエフェクト系ヘルパー ----
// ロックを付ける。期間(ライフ)は堅牢の鍵で延びる。空きマスなら空蔵の持ち主を記録しておく
function applyLock(s, idx) {
    tokenAfterMod.applyLockAt(s.board, idx, s.gears[s.turn], s.turn);
}
// 毒花: 毒が付いたコマ(cells)のうち、持ち主が毒花を装備しているものに、1つずつバッズも付く。
// 誰が付けた毒でも発動する（自分で付けた毒でも、相手から付けられた毒でも。毒を付ける側の装備は関係ない）
function toxicBloom(s, cells) {
    for (const k of cells) {
        const sq = s.board[k];
        if (!sq.player || !hasGear(s.gears[seatOf(sq.player)], 'toxicBloom')) continue;
        sq.effects.push({ effect: '🌱' });
        bumpStat(s, 'toxicBloom');
    }
}
// トークン系スキルでコマを置いた後の処理: 道連れの鍵(確率でロック) と 伝播(周囲のコマに同じエフェクト)。
// effect はトークンが持つエフェクト(🌱/☠/⚡)、無ければ undefined。収穫に渡す「付与したエフェクト数」を返す
function afterTokenPlaced(s, idx, effect) {
    // 静電気の季節: 設置したトークンに⚡（収穫・伝播には数えない）
    if (s.chargeBuff[s.turn] > 0 && s.board[idx].player === curPlayer(s)) addCharge(s, idx);
    const g = s.gears[s.turn];
    let granted = effect ? 1 : 0;
    if (hasGear(g, 'bindingLock') && s.rng() < GP.bindingLockChance) {
        applyLock(s, idx);
        granted += 1;
        bumpStat(s, 'bindingLock');
    }
    if (effect && hasGear(g, 'propagate')) {
        if (tokenAfterMod.propagate(s.board, idx, effect, curPlayer(s), s.chars, s.rng) !== null) {
            granted += 1;
            bumpStat(s, 'propagate');
        }
    }
    return granted;
}
// 復讐の刃: 魔力の増減を席ごとに記録するための上限つき加算
function vengeanceGain(s, seat, gained) {
    if (!hasGear(s.gears[seat], 'vengeance')) return;
    const room = GP.vengeanceCap - (gained[seat] || 0);
    const add = Math.min(GP.vengeanceGain, room);
    if (add <= 0) return;
    s.magic[seat] += add;
    gained[seat] = (gained[seat] || 0) + add;
    bumpStat(s, 'vengeanceMagic', add);
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
    // ギア: 席ごとの装備 (opts.gears[seat] = GearId[])。省略時は全席なし
    const gears = chars.map((_, i) => ((opts.gears && opts.gears[i]) || []).slice());
    // opts.decks: 席ごとのデッキ（idx 12枚。null/不正なら推奨デッキ）。true なら全席が推奨デッキ。省略時は従来どおり 0..POOL_SIZE から引く
    const decks = opts.decks ? chars.map((c, i) => deckMod.resolveDeck(Array.isArray(opts.decks) ? opts.decks[i] : null, c)) : null;
    const state = {
        decks,
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
        useInjection: 0,
        usePandemic: false,
        useBuds: [false, 0],
        useAssault: fill(0),
        // 増殖(ループ召喚): proliferate=発動中 / proliferateCount=これまでのループ回数(=次の維持コストの基準)
        proliferate: fill(false),
        proliferateCount: fill(0),
        silenced: fill(false), // サイレンス: 立っている席は次の手番スキルを使えない
        lifeBan: fill(false), // 一寸の虫に魂なし: 立っている席は、その席の次の手番の終わりまでライフ3以下のコマを置けない
        chargeBuff: fill(0), // 静電気の季節: 残りターン数（その席が設置する駒に⚡）
        gearOff: fill(false), // 裸の王様: 立っている席のギアは、その席の次の手番の終わりまで無効（s.gears[seat] を空にして、元の装備を gearHeld に預かる）
        gearHeld: fill(null),
        usedTokenThisTurn: false,
        // necromancer 蘇生 state
        remainNecro: fill(0),
        necroCost: fill(baseNecromancyCost),
        // skill pool + per-player locks (Game.tsx と同じく毎手番ロックを残して再シャッフル)
        skills: [],
        lockedSkills: Array.from({ length: n }, () => []),
        useChargeOne: false,
        useChargeSpread: false,
        // ギア。gearSkills=この手番に使ったスキル数 / echoReady=余韻の割引が有効 / echoNext=次の手番に余韻が付く
        gears,
        // 検証用: ギアを持たない席にも、そのギア向けのAI戦略だけを使わせる（opts.forceAi[seat] = ギアIDの配列）。通常は空
        forceAi: chars.map((_, i) => ((opts.forceAi && opts.forceAi[i]) || []).slice()),
        gearSkills: fill(0),
        skillKinds: Array.from({ length: n }, () => new Set()), // 手番内に使ったスキルの種類（業火の無料権の数え方）
        infernoReady: fill(false), // 業火の無料権。手番を跨いで持ち越し、業火を撃つと消える
        discount: Array.from({ length: n }, () => discountMod.emptyDiscount()), // コスト軽減スキルの状態（手番内だけ有効）
        oppSkilled: fill(false), // 自分の前の手番以降に他の席がスキルを使った
        oppSkillPrev: fill(false), // 今の手番の頭の時点での oppSkilled（返し特売の0コスト条件）
        plantPrev: fill(false), // 直前の手番に🌱🍂が増えた（火口の無料条件。撃つと消える）
        plantBase: fill(0), // 手番開始時点の盤面の🌱🍂の総数
        placedPrev: fill(false), // 直前の手番に相手がコマを2つ以上設置した（飛び火の無料条件。撃つと消える）
        placeBase: fill(0), // 手番開始時点の自陣のコマ数
        echoReady: fill(false),
        echoNext: fill(false),
        // 廃墟の底力: ruinActive=割引が有効（自陣が破壊された後の、自分の次の手番の終わりまで）/ ruinPending=次の自分の手番から有効
        // snapOwners=手番開始時の各マスの持ち主 / lastMoveCell=その手番の通常の着手マス（攻撃による破壊は「スキル・エフェクトによる破壊」から除く）
        ruinActive: fill(false),
        ruinPending: fill(false),
        snapOwners: null,
        snapBuds: null,
        snapFlames: null,
        ashActive: fill(0), // 灰の供物: 有効な割引の重ね数 / 次の自分の手番から有効になる重ね数
        ashPending: fill(0),
        lastMoveCell: null,
        // 土壇場の防壁: 使用済みの席（初めて相手が勝つときに1度だけ。発動後は相手の魔力+2・ライフ+1）
        lastStandUsed: fill(false),
        // 価格破壊: 席ごとのコスト表（試合開始時に1回だけ抽選）。装備していない席は null
        priceTables: gears.map((g) => (hasGear(g, 'priceWreck') ? gear.applyPriceOffsets(skillCosts, gear.rollPriceOffsets(rng)) : null)),
        useChargeArea: false,
        useJammer: false,
        useFreeze: false,
        useSucker: false,
        useShikigamiPlace: false,
        useShikigamiBlast: false,
        useShikigamiBless: false,
        useShikigamiCurse: false,
        useShikigamiPurge: false,
        useSwidden: false,
        useFrostArea: false,
        useIcicle: false,
        icicleDir: 'row', // 氷柱の方向（AI/テストは exeIcicle に直接渡す。placeMove 経由のときはこの値）
        useFrostSpread: false,
        useShatter: false,
        useSacrifice: false,
        useKimon: false,
        usePlunder: false,
        useRelocate: false,
        relocateFrom: null,
        useStash: false,
        useThunderFire: false,
        leafBase: fill(0), // 手番開始時点の自陣の🍂の総数（紅葉狩りの導線）
        tokenFree: fill(false), // 無礼講: この手番、トークン系スキルのコストが0
        bigCast: fill(false), // 柳の下に二匹目がいた: この手番に基礎コスト7以上のスキルを使った
        veil: fill(false), // 夜の帳: この席の今の手番はスキルコスト+3
        veilNext: fill(false), // 夜の帳: この席の次の手番から効く
        ward: fill(0), // 毒返しの構え: 残りの手番数（その席の手番が終わるたびに1減る）
        wardFresh: fill(false), // 毒返しの構えを使った手番（その手番の終わりでは減らさない）
        darkPotUsed: fill(false), // 一寸先は闇鍋をこの手番に使った（1手番に1度まで）
        chargeBase: fill(0), // 手番開始時点（と雷を食らわば皿までを撃った直後）の自陣の⚡の総数
        shikiPlaced: Array(n).fill(false), // 陰陽師: この手番に式神を置いたか（置くと以降の全スキルのコスト-1）
        fireBase: fill(0), // 手番開始時点（と火の車を撃った直後）の盤面全体の🔥の総数（火の車の無料条件）
        budGuard: fill(false), // 冬至の種子: 🌱ガード中の席（その席の次の手番開始時に解除）
        glacierCharge: fill(0), // 絶対零度の軽減カウンタ: 氷結スキルで❄が作られるたび全席+1、撃った席だけ0に戻る
        glacierPending: fill(false), // 絶対零度: 次の自分の手番開始時に発動待ちの席
        useIgnite: false,
        useTinder: false,
        stats: {},
        winner: undefined,
        log: [],
    };
    defineLegacyAliases(state);
    state.life = Math.max(1, calculateLife(chars[0], state.yy[0], rng, gear.gearLifeBonus(gears[0]), gear.gearLifeStd(gears[0], LIFE_STD)));
    state.skills = reshuffleSkillsFor(state, 0, POOL_SIZE); // 先手(席0)の初期スキル
    armWard(state);
    return state;
}

// ロック済みスキルを残しつつ残り枠を [0,poolEnd) からランダムに埋める (Game.tsx reshuffledSkills と同じ)
// seat: 席番号（2人戦の旧呼び出し互換で true=席0 / false=席1 も受ける）
function reshuffleSkillsFor(s, seat, poolEnd) {
    if (typeof seat === 'boolean') seat = seat ? 0 : 1;
    const keep = s.lockedSkills[seat].slice(0, 3);
    const pool = [];
    if (s.decks) { for (const i of s.decks[seat]) if (!keep.includes(i)) pool.push(i); }
    else for (let i = 0; i < poolEnd; i++) if (!keep.includes(i)) pool.push(i);
    const fill = randomAnyPick(pool, Math.max(0, 3 - keep.length), s.rng);
    return [...keep, ...fill];
}

// 式神(📜)は列の並びに数えない
const isShikigami = (sq) => sq.effects.some((e) => e.effect === '📜');
const symbolsOf = (board) => board.map((x) => (isShikigami(x) ? undefined : x.player));
const seatCount = (s) => s.chars.length;
const symbolOfSeat = (seat) => SYMBOLS[seat];
const curPlayer = (s) => SYMBOLS[s.turn];
const curChar = (s) => s.chars[s.turn];
const curMagic = (s) => s.magic[s.turn];
/** 自分以外の席番号 */
const otherSeats = (s, seat = s.turn) => s.chars.map((_, i) => i).filter((i) => i !== seat);

// ---- ギア ----
/** 席ごとのスキルコスト表。価格破壊を装備していればその席の抽選結果、なければ基礎表 */
function costsOf(s, seat = s.turn) {
    if (s.gearOff && s.gearOff[seat]) return skillCosts; // 裸の王様: 価格破壊も無効
    return s.priceTables[seat] || skillCosts;
}
function gearCtx(s, seat) {
    const ailments = hasGear(s.gears[seat], 'ailmentPact') ? gear.countAilmentKinds(s.board, SYMBOLS[seat]) : 0;
    const [g, r] = gearTurnView(s);
    return gearTurnMod.gearCostContext(g, r, seat, s.turn, ailments);
}
// 実コスト(キャラ補正 → ギア補正 → 導線 → 軽減スキル)の計算は本番(cost.ts)の生成物。ここは席の状況を詰めるだけ
const costMod = require('./shared/cost');
function costEnv(s, seat) {
    return {
        board: s.board,
        seat,
        player: SYMBOLS[seat],
        turnSeat: s.turn,
        characters: s.chars,
        yinYangMode: s.yy[seat],
        gears: s.gears[seat],
        ctx: gearCtx(s, seat),
        leafBase: s.leafBase[seat],
        kinds: s.skillKinds[seat],
        chargeBase: s.chargeBase[seat],
        shikiPlaced: s.shikiPlaced[seat],
        tokenFree: s.tokenFree[seat],
        bigCast: s.bigCast[seat],
        veil: s.veil[seat],
        oppSkillPrev: s.oppSkillPrev[seat],
        fireBase: s.fireBase[seat],
        plantPrev: s.plantPrev[seat],
        placedPrev: s.placedPrev[seat],
        discount: s.discount[seat],
    };
}
// withLeaf: 敵の🍂の増加分を、ギアの補正・割引より先に足す（増加分→減少分の順）。calculateCost は characterCostOf の中で足し済みなので false で呼ぶ
function gearCost(s, cost, isToken = false, seat = s.turn, key, withLeaf = true) {
    return costMod.gearCostOf(costEnv(s, seat), cost, isToken, key, withLeaf);
}
// 術中の加護: スキルを使った手番の間、装備した席のコマは効果(☠🔥⚡)のダメージを受けない。thermal の述語を、この試合の状態で差し込む
function armWard(s) {
    thermal.setEffectWard((sq) => hasGear(s.gears[SYMBOLS.indexOf(sq.player)], 'spellWard') && s.gearSkills[s.turn] > 0);
}
/** スキルを1回使ったことを記録する（四連の極意・連鎖割引・余韻の入力） */
function noteSkillUsed(s, skillId) {
    armWard(s);
    const [g] = gearTurnView(s);
    g.infernoReady = s.infernoReady;
    gearTurnMod.noteSkillUsed(g, s.turn, skillId);
    s.oppSkilled = g.oppSkilled; // 作り直された配列を戻す
}
/** 収穫: エフェクトをn個付与したぶん魔力を得る（上限あり） */
function harvestMagic(s, n) {
    if (!hasGear(s.gears[s.turn], 'harvest') || n <= 0) return;
    const gain = Math.min(n, GP.harvestCap);
    s.magic[s.turn] += gain;
    bumpStat(s, 'harvestMagic', gain);
}

// スキル使用で魔力を払う。幸運の財布なら確率で0円
function spendMagic(s, amount, skillId) {
    if (amount > 0 && hasGear(s.gears[s.turn], 'luckyPurse') && s.rng() < GP.luckyPurseChance) {
        amount = 0;
        bumpStat(s, 'luckyFree');
    }
    s.magic[s.turn] -= amount;
    noteSkillUsed(s, skillId);
}
// シャッフル: 手札をデッキ（なければプール）から引き直す。スキル扱いではないので無料権のカウントには入らない
function shuffleHand(s) {
    s.magic[s.turn] -= costsOf(s).onClickShuffle;
    s.skills = reshuffleSkillsFor(s, s.turn, POOL_SIZE);
    s.useMagicCount[s.turn]++;
}
function bumpMagicCount(s) {
    s.useMagicCount[s.turn]++;
}

function calculateCost(s, cost, isToken = false, isPoison = false, key) {
    return costMod.calculateCostOf(costEnv(s, s.turn), cost, isToken, isPoison, key);
}

function calculateTokenBind(s) {
    return costMod.tokenBindOf(curChar(s), s.gears[s.turn]);
}

// 魔力ボーナスに数える🌱（休眠マスの🌱は数えない。guarded=冬至の種子で🌱だけは休眠しない）
function budsCount(board, player, guarded = false) {
    return board
        .filter((x) => x.player === player && (guarded || !thermal.isDormant(x)))
        .flatMap((x) => x.effects)
        .filter((e) => e.effect === '🌱').length;
}

// 次の手番の席 (Game.tsx judgeNextSeat = src/components/game/giantTurn.ts seatForTurn と同じ並び)
// 巨人は giantActEvery ラウンドに1回しか動かない: 「全員1周 → 巨人を除いて (giantActEvery-1) 周」の繰り返し。
// 並びは currentTurn と直前の席で決まる。2人戦で同キャラ(巨人ミラー含む)は休みなしで交互に回す
function judgeNextSeat(s) {
    return giantTurnMod.seatForTurn(s.currentTurn, s.chars, s.turn, GIANT_ACT_EVERY);
}
// 2人戦互換: 次が席0(heart)か
function judgeNextIsHeart(s) {
    return judgeNextSeat(s) === 0;
}

// 廃墟の底力: 手番中にスキルかエフェクトで自陣のコマが盤から無くなった（持ち主が変わった）席を記録する
// gearTurn.ts が書き換える席ごとの状態の見え方。配列は spendMagic などで作り直されるので、呼ぶたびに作る
function gearTurnView(s) {
    const g = {
        skills: s.gearSkills, echoReady: s.echoReady, echoNext: s.echoNext, kinds: s.skillKinds, discount: s.discount,
        oppSkilled: s.oppSkilled, oppSkillPrev: s.oppSkillPrev, shikiPlaced: s.shikiPlaced, fireBase: s.fireBase, plantPrev: s.plantPrev, plantBase: s.plantBase, placedPrev: s.placedPrev, placeBase: s.placeBase,
        leafBase: s.leafBase, darkPotUsed: s.darkPotUsed, tokenFree: s.tokenFree, bigCast: s.bigCast, chargeBase: s.chargeBase,
        veil: s.veil, veilNext: s.veilNext, ward: s.ward, wardFresh: s.wardFresh,
    };
    const r = {
        active: s.ruinActive, pending: s.ruinPending, ashActive: s.ashActive, ashPending: s.ashPending,
        get snap() { return s.snapOwners; }, set snap(v) { s.snapOwners = v; },
        get snapBuds() { return s.snapBuds; }, set snapBuds(v) { s.snapBuds = v; },
        get snapFlames() { return s.snapFlames; }, set snapFlames(v) { s.snapFlames = v; },
        get lastMove() { return s.lastMoveCell; }, set lastMove(v) { s.lastMoveCell = v; },
    };
    return [g, r];
}
// 土壇場の防壁: seat 以外の誰かが使用済みなら有効（seat は「発動した側の相手」）
function lastStandActiveAgainst(s, seat) {
    return s.lastStandUsed.some((used, holder) => used && holder !== seat);
}
// 勝者の確定。初めて相手が列を揃えたとき、土壇場の防壁を持つ席がいれば、かわりにその列のマスを消滅させる（ロック・氷結を貫通）
function settleWinner(s) {
    let w = calculateWinner(symbolsOf(s.board));
    if (w) {
        const holder = s.gears.findIndex((g, seat) => hasGear(g, 'lastStand') && !s.lastStandUsed[seat] && SYMBOLS[seat] !== w);
        if (holder >= 0) {
            for (const line of geometryForCells(s.board.length).winLines) {
                if (line.every((idx) => s.board[idx].player === w)) for (const idx of line) s.board[idx] = newSquare();
            }
            // 代償: 持ち主の自陣のコマもすべて消滅する
            for (let idx = 0; idx < s.board.length; idx++) if (s.board[idx].player === SYMBOLS[holder]) s.board[idx] = newSquare();
            s.lastStandUsed[holder] = true;
            bumpStat(s, 'lastStand');
            w = undefined;
        }
    }
    s.winner = w;
}

// Port of the useEffect[currentTurn]: advance to next player, grant magic & life.
// 手番をまたいで残ってはいけない「次のクリックで対象を選ぶ」待ち状態。ターン終了スキル(チャージなど)で手番が終わったときに、
// 次の席の最初のクリックが前の席のスキルの対象として使われてしまうのを防ぐ（Game.tsx の手番切り替えでも同じ一覧を解除する）
const PENDING_TARGET_FLAGS = ['useShikigamiPlace', 'useShikigamiBlast', 'useShikigamiBless', 'useShikigamiCurse', 'useShikigamiPurge', 'useFreeze', 'useSucker', 'useIgnite', 'useSwidden', 'useSacrifice', 'useKimon', 'usePlunder', 'useRelocate', 'useStash', 'useThunderFire', 'useFrostArea', 'useIcicle', 'useFrostSpread', 'useShatter'];
function clearPendingTargets(s) {
    for (const k of PENDING_TARGET_FLAGS) s[k] = false;
    s.relocateFrom = null;
    s.useLock = 0;
}
function advanceTurn(s) {
    clearPendingTargets(s);
    // 膠着の打開(本番 deadlock.ts): 着手が何周も無いと氷結とロックが一段解ける
    if (!s.deadlock || s.deadlock.placements !== s.placements) s.deadlock = { placements: s.placements, turn: s.currentTurn };
    else if (deadlockMod.isDeadlocked(s.currentTurn, s.deadlock.turn, seatCount(s))) {
        if (deadlockMod.breakDeadlock(s.board).length > 0) bumpStat(s, 'deadlockBreak');
        s.deadlock = { placements: s.placements, turn: s.currentTurn };
    }
    // サイレンスは「封じられた側の手番が終わるたび」に解除 (s.turn = 直前に動いた席)
    s.silenced[s.turn] = false;
    s.tokenFree[s.turn] = false; // 無礼講は手番が終わると切れる
    s.lifeBan[s.turn] = false;
    // 静電気の季節の残りターンは、自分の手番が終わるたびに1減る
    s.chargeBuff[s.turn] = Math.max(0, s.chargeBuff[s.turn] - 1);
    // 裸の王様は、ギアを封じられた側の手番が終わるたびに解除（預かっていた装備を戻す）
    if (s.gearOff[s.turn]) {
        s.gearOff[s.turn] = false;
        s.gears[s.turn] = s.gearHeld[s.turn] || s.gears[s.turn];
        s.gearHeld[s.turn] = null;
    }
    // 蘇生の残りターンは「発動した側の手番が終わるたび」に減る (s.turn = 直前に動いた席)
    if (s.chars[s.turn] === 'necromancer' && s.remainNecro[s.turn] > 0) s.remainNecro[s.turn]--;
    const next = judgeNextSeat(s);
    const sym = SYMBOLS[next];
    const ch = s.chars[next];
    // 席ごとのギア・導線・廃墟の状態の更新は本番(gearTurn.ts)の生成物。魔力などは戻り値を見て足す
    const change = gearTurnMod.advanceGearState(...gearTurnView(s), { board: s.board, symbols: SYMBOLS.slice(0, seatCount(s)), gears: s.gears, endSeat: s.turn, nextSeat: next });
    let scorchForNext = 0;
    change.scorch.forEach((gain, seat) => {
        if (gain <= 0) return;
        if (seat === next) scorchForNext = gain;
        else s.magic[seat] += gain;
        bumpStat(s, 'scorchedEarth', gain);
    });
    if (change.ashGained > 0) bumpStat(s, 'ashOffering', change.ashGained);
    change.ruinTriggered.forEach(() => bumpStat(s, 'ruinTriggered'));
    // 毒返しの構え: 終わった手番の間に自陣が破壊/乗っ取られた席に、ライフ4・☠付きのコマを置く
    change.wardPlace.forEach((seat) => {
        if (graveMod.placeWardPiece(s.board, SYMBOLS[seat], (cells) => cells[Math.floor(s.rng() * cells.length)]) >= 0) bumpStat(s, 'poisonWardPlaced');
    });
    // 手番開始時の魔力の規則は本番(turn.ts)の生成物。Game.tsx と同じく次の手番の席自身の魔力・バッズから計算する
    const root = hasGear(s.gears[next], 'frostRoot') ? gear.rootGain(gear.frozenBudCount(s.board)) : 0;
    if (root > 0) bumpStat(s, 'frostRoot', root);
    let nextMagic = turnMod.turnStartMagic({
        magic: s.magic[next],
        turn: s.currentTurn,
        seatCount: seatCount(s),
        character: ch,
        yinYangMode: s.yy[next],
        buds: budsCount(s.board, sym, s.budGuard[next]),
        garden: hasGear(s.gears[next], 'colorGarden') ? gear.countVarietySquares(s.board, sym) * GP.varietyMagic : 0, // 彩りの庭: エフェクトが2種類以上あるマス1つにつき+1
        standBonus: lastStandActiveAgainst(s, next), // 土壇場の防壁: 発動後は相手の手番開始時に+2
        scorch: scorchForNext, // 焦土(上で計算)
        root, // 凍てつく根: 氷結で休眠した🌱(敵味方問わず)1つにつき+1
    });
    // 増殖: 手番開始時に維持コストを支払う。払えなければループが途切れる
    if (s.proliferate[next]) {
        const upkeep = proliferateUpkeep(s.proliferateCount[next]);
        if (nextMagic >= upkeep) nextMagic -= upkeep;
        else { s.proliferate[next] = false; s.proliferateCount[next] = 0; }
    }
    s.magic[next] = nextMagic;
    // 絶対零度: 使用者の手番開始時に敵の❄マスを爆破（ダメージ→❄全除去、0以下なら破壊=墓地+）
    // 冬至の種子の🌱ガードは、その席の次の自分の手番開始時に解除
    s.budGuard[next] = false;
    if (s.glacierPending[next]) {
        s.glacierPending[next] = false;
        const det = thermal.detonate(s.board, sym);
        addCorpses(s, det.destroyed.length);
        bumpStat(s, 'glacierDestroyed', det.destroyed.length);
    }
    s.life = calculateLife(ch, s.yy[next], s.rng, (ch === 'poisoner' ? poisonCountFor(s.board, sym) : 0) + gear.gearLifeBonus(s.gears[next]) + (lastStandActiveAgainst(s, next) ? GP.lastStandLife : 0), gear.gearLifeStd(s.gears[next], LIFE_STD));
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
    armWard(s);

    // 雷のない所に火は立たぬ: ⚡のあるコマを選ぶ。無敵マスでも自分のものは選べる（無敵の早期リターンより前に判定する）
    if (s.useThunderFire) {
        if (!exeThunderFire(s, i)) return false; // ⚡のないマス・守られた他人のコマは選び直せる
        s.useThunderFire = false;
        return true;
    }

    // 雷神のへそくり: ⚡のある自陣のコマを選ぶ。無敵マスでも自分のものは選べる（雷霆の巫の⚡マスはすべて無敵なので、無敵の早期リターンより前に判定する）
    if (s.useStash) {
        if (!exeStash(s, i)) return false; // ⚡のない・自陣でないマスは選び直せる
        s.useStash = false;
        return true;
    }

    // ジャマー: ⚡のあるマスを選ぶ。無敵マスでも**自分の**ものは選べる（弱点を解く唯一の手段）。他人の無敵マスは選べない
    if (s.useJammer) {
        if (chargeStacks(board[i]) === 0 || thermal.isDormant(board[i])) return false; // 休眠マスの⚡はジャマーの起点にならない
        if (isShielded(s, board[i]) && board[i].player !== curPlayer(s)) return false;
        exeJammer(s, i);
        return true;
    }

    // 雷霆の巫の⚡付き自陣マスは、本人も相手も触れない (無敵＋弱点)
    if (isShielded(s, board[i])) return false;

    // pending targeted skills consume the click without advancing the turn
    if (s.useChargeOne) {
        addCharge(s, i);
        harvestMagic(s, 1);
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
    if (s.useFrostArea) {
        exeFrostArea(s, i);
        s.useFrostArea = false;
        return true;
    }
    if (s.useIcicle) {
        exeIcicle(s, i, s.icicleDir);
        s.useIcicle = false;
        return true;
    }
    if (s.useFrostSpread) {
        if (!exeFreezeSpread(s, i)) return false; // 空きマスは起点にできない
        s.useFrostSpread = false;
        return true;
    }
    if (s.useShatter) {
        if (!exeShatter(s, i)) return false; // 氷結中のコマを選び直す
        s.useShatter = false;
        return true;
    }
    if (s.useSwidden) {
        if (!exeSwidden(s, i)) return false; // 🌱の無いマスは選び直せる
        s.useSwidden = false;
        return true;
    }
    if (s.useRelocate) {
        // 縮地: 動かす自陣のコマを選び、空きマスを選ぶ。選べないマスは選び直せる
        if (genericMod.canRelocate(s.board[i], curPlayer(s))) { s.relocateFrom = i; return false; }
        if (s.relocateFrom === null) return false;
        if (!genericMod.relocate(s.board, s.relocateFrom, i, curPlayer(s))) return false;
        s.useRelocate = false;
        s.relocateFrom = null;
        return true;
    }
    if (s.usePlunder) {
        if (!genericMod.plunderTargets(s.board, curPlayer(s), s.chars).includes(i)) return false; // 対象外は選び直せる
        genericMod.plunder(s.board, i, curPlayer(s));
        addCorpses(s, 1);
        s.usePlunder = false;
        return true;
    }
    if (s.useKimon) {
        if (!exeKimon(s, i)) return false; // 選べないマスは選び直せる
        s.useKimon = false;
        return true;
    }
    if (s.useSacrifice) {
        if (!exeSacrifice(s, i)) return false;
        s.useSacrifice = false;
        return true;
    }
    if (s.useSucker) {
        if (!exeSucker(s, i)) return false; // 選べないコマは選び直せる
        s.useSucker = false;
        return true;
    }
    if (s.useFreeze) {
        if (!thermal.canFreeze(board[i])) return false; // 空きマス・氷結済み・ロック中は選び直せる
        chargeGlacier(s, thermal.freeze(board, [i]).length); // 氷結が作られるたび、全席の絶対零度が安くなる
        s.useFreeze = false;
        return true;
    }
    if (s.useIgnite) {
        thermal.ignite(board, [i], s.size, 1, keepBudsOf(s));
        s.useIgnite = false;
        return true;
    }
    if (s.useTinder) {
        if (!tinderCandidates(s).includes(i)) return false; // 🌱も🍂も無いコマは選び直せる
        thermal.ignite(board, [i], s.size, 1, keepBudsOf(s));
        s.useTinder = false;
        return true;
    }
    if (s.useLock > 0) {
        if (thermal.isFrozen(board[i])) return false; // 氷結中は選べない
        applyLock(s, i);
        harvestMagic(s, 1);
        s.useLock -= 1;
        return true;
    }
    if (s.useInjection > 0) {
        board[i].effects.push({ effect: '☠' });
        poisonStrike(s, board[i]);
        harvestMagic(s, 1);
        toxicBloom(s, [i]);
        s.useInjection -= 1;
        return true;
    }
    if (s.usePandemic) {
        exePandemic(s, i);
        return true;
    }
    if (s.useShikigamiPlace) {
        // 陰: 任意の空きマスに式神を置く。埋まっている/氷結中/ロック中の空きマスは選び直せる
        if (!shikiMod.shikigamiLandable(board[i])) return false;
        board[i] = newShikigami(curPlayer(s));
        s.shikiPlaced[s.turn] = true;
        s.useShikigamiPlace = false;
        return true;
    }
    if (s.useShikigamiBlast) {
        if (!exeShikigamiBlast(s, i)) return false; // 自分の式神でなければ選び直せる
        s.useShikigamiBlast = false;
        return true;
    }
    if (s.useShikigamiBless) {
        if (!exeShikigamiBless(s, i)) return false; // 自分の式神でなければ選び直せる
        s.useShikigamiBless = false;
        return true;
    }
    if (s.useShikigamiCurse) {
        if (!exeShikigamiCurse(s, i)) return false; // 自分の式神でなければ選び直せる
        s.useShikigamiCurse = false;
        return true;
    }
    if (s.useShikigamiPurge) {
        if (!exeShikigamiPurge(s, i)) return false; // 対象でない敵コマなら選び直せる
        s.useShikigamiPurge = false;
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
    if (lifeBanMod.moveBlocked(s.lifeBan[s.turn], s.life)) return false; // ライフ3以下のコマは置けない
    const necroActive = curChar(s) === 'necromancer' && s.remainNecro[s.turn] > 0;
    if (board[i].player && board[i].player !== curPlayer(s)) {
        if (board[i].bind > 0 && !decayMod.canHitBound(curChar(s), board, seatCount(s))) return false; // can't attack a bound enemy unless giant (or a crowded board)
    }
    if (board[i].effects.find((e) => e.effect === '🔑') && board[i].bind > 0) return false;
    // 氷結中の空きマスには誰も着手できない
    if (thermal.emptyBlocked(board[i])) return false;
    // ❄氷結中の自陣コマには重ねて強化できない（氷室の番人は除く）
    if (board[i].player === curPlayer(s) && thermal.overwriteBlocked(board[i])) return false;

    s.lastMoveCell = i; // 廃墟の底力: 通常の着手マス（攻撃で壊れた自コマは「スキル・エフェクトによる破壊」に数えない）
    // decay step (+ 毒: スタック数だけ追加で bind を減らす)。3人以上は手番が1周するごとに1回だけ (issue #30)
    const decayNow = shouldDecay(s.placements, seatCount(s));
    s.placements += 1;
    const spreadOrigins = [];
    if (decayNow) {
        // 自然減衰・🔥と毒の継続ダメージ・ロックの期限切れ・毒で0になったコマの消滅は本番(decay.ts)の生成物
        const d = decayMod.decayBoard(board, i, s.chars, SYMBOLS, decayMod.isCrowded(board, seatCount(s))); // 満杯の盤面は自然減衰がもう1回
        if (d.flameKills > 0) bumpStat(s, 'flameKill', d.flameKills);
        if (d.emptyLockSpawns.length > 0) bumpStat(s, 'emptyLockSpawn', d.emptyLockSpawns.length);
        for (const k of d.spreadOrigins) {
            spreadOrigins.push(k);
            s.chars.forEach((c, seat) => { if (c === 'poisoner') s.magic[seat] += 1; }); // 毒使い側は空いたマス1つにつき魔力+1
        }
    }
    const cur = curPlayer(s);
    const life = s.life;
    // 着手の結果（強化・奪取・破壊・攻撃・新規）は本番(placement.ts)の生成物
    const placed = placementMod.resolvePlacement(board[i], cur, life);
    const placedNew = !placed.reinforced; // 静電気の季節: 補強は設置ではない
    const capturedFrom = placed.capturedFrom; // 通常の攻撃で奪取した相手のシンボル（復讐の刃）
    if (placed.poisonSpread) spreadOrigins.push(i); // 毒持ちの敵コマを奪取/破壊した場合は拡散の起点にする
    if (placed.corpse) addCorpses(s, 1); // 敵味方問わずコマが奪われる/消えるたびに墓地+1
    const newPlayer = placed.square.player;
    const newEffects = placed.square.effects;
    if (newPlayer === cur && s.useBuds[0]) {
        for (let k = 0; k < s.useBuds[1]; k++) newEffects.push({ effect: '🌱' });
        s.useBuds = [false, 0];
    }

    board[i] = { player: newPlayer, bind: placed.square.bind, effects: newEffects };

    // 復讐の刃: 奪われた側は魔力を得る（1手の獲得は上限あり）。奪った側が装備していれば魔力を失う
    const vengeanceGained = {};
    if (capturedFrom) {
        vengeanceGain(s, seatOf(capturedFrom), vengeanceGained);
        if (hasGear(s.gears[s.turn], 'vengeance')) s.magic[s.turn] = Math.max(0, s.magic[s.turn] - GP.vengeancePenalty);
    }

    // total-assault residual: drop a random 0-bind token after the move
    if (s.useAssault[s.turn] > 0) {
        const empties = findEmptyIndexes(board);
        if (empties.length) {
            const tk = randomPick(empties, s.rng);
            board[tk] = { player: cur, bind: 0, effects: [] };
            if (s.chargeBuff[s.turn] > 0) addCharge(s, tk);
        }
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

    // 静電気の季節: 新しく置いた（奪った）自分のコマに⚡。発火のあとに付けるので自分では発火しない
    if (s.chargeBuff[s.turn] > 0 && placedNew && board[i].player === cur) {
        addCharge(s, i);
        checkDischarge(s);
    }

    // 巨人のオーラ: コマを置くと周囲8マスの敵コマが破壊され、周囲8マス全部がロックされる
    if (curChar(s) === 'giant' && board[i].player === cur) giantAura(s, surroundRange(s, i), cur);

    // 蘇生発動中: ライフが0になった敵コマを自動で自陣に吸収する
    if (necroActive) {
        const absorbedCells = placementMod.absorbDefeated(board, cur);
        absorbedCells.forEach((c) => vengeanceGain(s, seatOf(c.from), vengeanceGained));
        const absorbed = absorbedCells.length;
        // 吸収した敵の数だけ墓地+
        if (absorbed > 0) addCorpses(s, absorbed);
    }

    // 毒拡散パッシブ: 毒で死んだ/毒持ちが奪取破壊されたマスの周囲へ毒を拡散
    if (poisonerInPlay(s) && spreadOrigins.length) {
        for (const o of spreadOrigins) spreadPoisonAround(board, o, s.rng, s);
    }

    s.currentTurn += 1;
    settleWinner(s); // 土壇場の防壁は、次の手番のボーナスに間に合うよう手番を進める前にも判定する
    advanceTurn(s);
    settleWinner(s);
    return true;
}

// 巨人のパッシブ（src/components/game/giantAura.ts と同じ規則）。周囲8マスの敵コマを破壊し（氷結は身代わり）、そのあと周囲8マス全部をロックする（空きマスはライフ1）
function giantAura(s, range, me) {
    const { destroyed } = giantAuraMod.giantAura(s.board, range, me, s.chars);
    if (destroyed.length > 0) addCorpses(s, destroyed.length);
}

// ---- Skills (turn-ending vs not, faithful to Game.tsx) --------------------
function endTurn(s) {
    s.currentTurn += 1;
    settleWinner(s);
    advanceTurn(s);
    settleWinner(s);
}

function onClickCharge(s) {
    s.magic[s.turn] += costsOf(s).onClickCharge;
    endTurn(s);
}
function onClickAddLife(s) {
    s.life += 3;
    spendMagic(s, calculateCost(s, costsOf(s).onClickAddLife, false, false, 'onClickAddLife'), 'onClickAddLife');
    bumpMagicCount(s);
}
// コスト軽減スキル(idx 53-58)。効果の中身は discount.js。使えないときは何もしない
function useDiscountSkill(s, key) {
    if (!discountMod.canUseDiscountSkill(s.discount[s.turn], key, s.life)) return;
    spendMagic(s, calculateCost(s, costsOf(s)[key], false, false, key), key);
    s.life += discountMod.lifeDeltaOf(key);
    bumpMagicCount(s);
}
function onClickBibine(s) {
    s.life *= 2;
    spendMagic(s, calculateCost(s, costsOf(s).onClickBibine, false, false, 'onClickBibine'), 'onClickBibine');
    bumpMagicCount(s);
}
function onClickDepressionCherry(s) {
    s.life -= 1;
    s.magic[0] -= costsOf(s).onClickDepressionCherry;
    s.magic[1] -= 1;
}
function onClickBuds(s) {
    s.useBuds = [true, s.useBuds[1] + 1];
    harvestMagic(s, 1);
    spendMagic(s, calculateCost(s, costsOf(s).onClickBuds, false, false, 'onClickBuds'), 'onClickBuds');
    bumpMagicCount(s);
}
function onClickDoubleBuds(s) {
    s.useBuds = [true, s.useBuds[1] + 2];
    harvestMagic(s, 2);
    spendMagic(s, calculateCost(s, costsOf(s).onClickDoubleBuds, false, false, 'onClickDoubleBuds'), 'onClickDoubleBuds');
    bumpMagicCount(s);
}
function onClickUseLock(s) {
    // 氷室の番人: 常在のロックは「氷結」（コスト2・対象1マスに❄。空きマス可）に置き換わる
    if (curChar(s) === 'cryomancer') {
        s.useFreeze = true;
        spendMagic(s, calculateCost(s, costsOf(s).onClickCryoFreeze, false, false, 'onClickCryoFreeze'), 'onClickCryoFreeze');
        bumpMagicCount(s);
        bumpStat(s, 'cryoFreeze');
        return;
    }
    s.useLock += 1;
    spendMagic(s, calculateCost(s, costsOf(s).onClickUseLock, false, false, 'onClickUseLock'), 'onClickUseLock');
    bumpMagicCount(s);
}
function onClickDoubleLock(s) {
    s.useLock += 2;
    spendMagic(s, calculateCost(s, costsOf(s).onClickDoubleLock, false, false, 'onClickDoubleLock'), 'onClickDoubleLock');
    bumpMagicCount(s);
}
function onClickTripleLock(s) {
    s.useLock += 3;
    spendMagic(s, calculateCost(s, costsOf(s).onClickTripleLock, false, false, 'onClickTripleLock'), 'onClickTripleLock');
    bumpMagicCount(s);
}
function onClickToken(s) {
    const empties = findEmptyIndexes(s.board);
    let granted = 0;
    if (empties.length) {
        const idx = randomPick(empties, s.rng);
        s.board[idx] = { player: curPlayer(s), bind: calculateTokenBind(s), effects: [] };
        granted = afterTokenPlaced(s, idx, undefined);
    }
    harvestMagic(s, granted);
    spendMagic(s, calculateCost(s, costsOf(s).onClickToken, true, false, 'onClickToken'), 'onClickToken');
    bumpMagicCount(s);
    s.usedTokenThisTurn = true;
    s.useTokenCount[s.turn]++;
}
function onClickDoubleToken(s) {
    const empties = findEmptyIndexes(s.board);
    const [a, b] = randomAnyPick(empties, 2, s.rng);
    let granted = 0;
    if (a != null) { s.board[a] = { player: curPlayer(s), bind: calculateTokenBind(s), effects: [] }; granted += afterTokenPlaced(s, a, undefined); }
    if (b != null) { s.board[b] = { player: curPlayer(s), bind: calculateTokenBind(s), effects: [] }; granted += afterTokenPlaced(s, b, undefined); }
    harvestMagic(s, granted);
    spendMagic(s, calculateCost(s, costsOf(s).onClickDoubleToken, true, false, 'onClickDoubleToken'), 'onClickDoubleToken');
    bumpMagicCount(s);
    s.usedTokenThisTurn = true;
    s.useTokenCount[s.turn]++;
}
function onClickBudsToken(s) {
    const empties = findEmptyIndexes(s.board);
    let granted = 0;
    if (empties.length) {
        const idx = randomPick(empties, s.rng);
        s.board[idx] = { player: curPlayer(s), bind: calculateTokenBind(s), effects: [{ effect: '🌱' }] };
        granted = afterTokenPlaced(s, idx, '🌱');
    }
    harvestMagic(s, granted);
    spendMagic(s, calculateCost(s, costsOf(s).onClickBudsToken, true, false, 'onClickBudsToken'), 'onClickBudsToken');
    bumpMagicCount(s);
    s.usedTokenThisTurn = true;
    s.useTokenCount[s.turn]++;
}
function onClickBothToken(s) {
    // 参加者全員に1つずつ（席順に空きマスからランダムに）。空きが足りなければ先着の席だけ
    const empties = findEmptyIndexes(s.board);
    const picks = randomAnyPick(empties, Math.min(seatCount(s), empties.length), s.rng);
    let granted = 0;
    picks.forEach((idx, seat) => {
        s.board[idx] = { player: SYMBOLS[seat], bind: seat === s.turn ? calculateTokenBind(s) : 4, effects: [] };
        if (seat === s.turn) granted += afterTokenPlaced(s, idx, undefined);
    });
    harvestMagic(s, granted);
    spendMagic(s, calculateCost(s, costsOf(s).onClickBothToken, true, false, 'onClickBothToken'), 'onClickBothToken');
    s.useMagicCount[s.turn]++;
    s.usedTokenThisTurn = true;
    s.useTokenCount[s.turn]++;
}
// 「ライフを0にする」スキルを1マスに当てる。氷結中なら氷結だけ解除、そうでなければ0にして🔥も消す
function zeroBySkill(s, idx) {
    const guard = thermal.absorbDestroy(s.board[idx]);
    s.board[idx] = guard.blocked ? guard.sq : thermal.zeroOut(s.board[idx]);
}
function onClickSlash(s) {
    for (const idx of geometryOf(s.size).antiDiagonal) if (!isGuarded(s, s.board[idx])) zeroBySkill(s, idx);
    spendMagic(s, calculateCost(s, costsOf(s).onClickSlash, false, false, 'onClickSlash'), 'onClickSlash');
    bumpMagicCount(s);
}
function onClickBackSlash(s) {
    for (const idx of geometryOf(s.size).mainDiagonal) if (!isGuarded(s, s.board[idx])) zeroBySkill(s, idx);
    spendMagic(s, calculateCost(s, costsOf(s).onClickBackSlash, false, false, 'onClickBackSlash'), 'onClickBackSlash');
    bumpMagicCount(s);
}
function onClickOpium(s) {
    const cur = curPlayer(s);
    for (let k = 0; k < s.board.length; k++) {
        const sq = s.board[k];
        if (sq.player !== cur && sq.bind > 0 && !isGuarded(s, sq)) {
            // スキルダメージ: 氷結なら解除だけ、🔥なら1.5倍。-2して1以下になったマスはライフ0
            const hit = thermal.applyDamage(sq, 2, 'skill');
            s.board[k] = hit.blocked || hit.sq.bind > 1 ? hit.sq : { ...hit.sq, bind: 0 };
        }
    }
    spendMagic(s, calculateCost(s, costsOf(s).onClickOpium, false, false, 'onClickOpium'), 'onClickOpium');
    bumpMagicCount(s);
    endTurn(s);
}
function onClickTsunami(s) {
    // 相手全員のマジックを0に
    for (const seat of otherSeats(s)) s.magic[seat] = 0;
    spendMagic(s, calculateCost(s, costsOf(s).onClickTsunami, false, false, 'onClickTsunami'), 'onClickTsunami');
    s.useMagicCount[s.turn]++;
    endTurn(s);
}
function onClickWalpurgisNight(s) {
    let planted = 0;
    for (const sq of s.board) {
        if (sq.player && !sq.effects.some((e) => e.effect === '🔑')) { sq.effects.push({ effect: '🌱' }); planted++; }
    }
    harvestMagic(s, planted);
    spendMagic(s, calculateCost(s, costsOf(s).onClickWalpurgisNight, false, false, 'onClickWalpurgisNight'), 'onClickWalpurgisNight');
    bumpMagicCount(s);
}

// yinYang
function onClickToggleYingYang(s) {
    // [FAITHFUL] note: source has a known bug toggling heart's mode when reading circle; we toggle the active player's own mode.
    s.yy[s.turn] = s.yy[s.turn] === 'yang' ? 'ying' : 'yang';
    spendMagic(s, gearCost(s, costsOf(s).onClickToggleYingYang, false, s.turn, 'onClickToggleYingYang'), 'onClickToggleYingYang');
}
function onClickShikigamiPlace(s) {
    s.useShikigamiPlace = true;
    spendMagic(s, gearCost(s, costsOf(s).onClickShikigamiPlace, false, s.turn, 'onClickShikigamiPlace'), 'onClickShikigamiPlace');
}
function onClickShikigamiBlast(s) {
    s.useShikigamiBlast = true;
    spendMagic(s, gearCost(s, costsOf(s).onClickShikigamiBlast, false, s.turn, 'onClickShikigamiBlast'), 'onClickShikigamiBlast');
}
// 自分の式神 i を爆破: 式神は消え、周囲8マスの敵陣に4ダメージ(0になったら破壊)、空きマスは式神になる（本番 shikigami.ts）
function exeShikigamiBlast(s, i) {
    const cur = curPlayer(s);
    if (s.board[i].player !== cur || !isShikigami(s.board[i])) return false;
    const { destroyed } = shikiMod.blast(s.board, i, cur, s.chars);
    addCorpses(s, destroyed);
    return true;
}
// 汎用(idx 88 式神の加護・コスト5): 自分の式神を1体選んで消費し、自陣のコマ全て（式神を除く）のライフを+3する。自陣のコマが無いと使えない [FAITHFUL] Game.tsx exeShikigamiBless
const ownShikigamiCells = (s) => shikiMod.ownShikigamiCells(s.board, curPlayer(s));
const blessTargets = (s) => shikiMod.blessTargets(s.board, curPlayer(s));
function shikigamiBlessLegal(s) { return ownShikigamiCells(s).length > 0 && blessTargets(s).length > 0; }
function onClickShikigamiBless(s) {
    if (!shikigamiBlessLegal(s)) return;
    s.useShikigamiBless = true;
    spendMagic(s, calculateCost(s, costsOf(s).onClickShikigamiBless, false, false, 'onClickShikigamiBless'), 'onClickShikigamiBless');
    bumpMagicCount(s);
}
function exeShikigamiBless(s, i) {
    if (!ownShikigamiCells(s).includes(i)) return false;
    shikiMod.bless(s.board, i, curPlayer(s));
    return true;
}
// 汎用(idx 89 式神の呪詛・コスト5): 自分の式神を1体選んで消費し、エフェクトが乗っている敵のコマ全て（🔑ロック・無敵を除く）に☠を2つ付与する。対象が無いと使えない [FAITHFUL] Game.tsx exeShikigamiCurse
const SHIKIGAMI_CURSE_STACKS = shikiMod.SHIKIGAMI_CURSE_STACKS;
const curseTargets = (s) => shikiMod.curseTargets(s.board, curPlayer(s), s.chars);
function shikigamiCurseLegal(s) { return ownShikigamiCells(s).length > 0 && curseTargets(s).length > 0; }
function onClickShikigamiCurse(s) {
    if (!shikigamiCurseLegal(s)) return;
    s.useShikigamiCurse = true;
    spendMagic(s, calculateCost(s, costsOf(s).onClickShikigamiCurse, false, false, 'onClickShikigamiCurse'), 'onClickShikigamiCurse');
    bumpMagicCount(s);
}
function exeShikigamiCurse(s, i) {
    if (!ownShikigamiCells(s).includes(i)) return false;
    const targets = shikiMod.curse(s.board, i, curPlayer(s), s.chars);
    harvestMagic(s, targets.length * SHIKIGAMI_CURSE_STACKS);
    toxicBloom(s, targets);
    return true;
}
// 汎用(idx 91 式神の供犠・コスト5、自陣の式神3体以上で0): 自陣の式神をランダムに1体壊し、続けて選んだ敵のコマ1体（式神を除く・🔑ロック/無敵を除く）のライフを0にする [FAITHFUL] Game.tsx exeShikigamiPurge
const SHIKIGAMI_PURGE_FREE = costMod.SHIKIGAMI_PURGE_FREE;
const purgeTargets = (s) => shikiMod.purgeTargets(s.board, curPlayer(s), s.chars);
function shikigamiPurgeLegal(s) { return ownShikigamiCells(s).length > 0 && purgeTargets(s).length > 0; }
function onClickShikigamiPurge(s) {
    if (!shikigamiPurgeLegal(s)) return;
    s.useShikigamiPurge = true;
    spendMagic(s, calculateCost(s, costsOf(s).onClickShikigamiPurge, false, false, 'onClickShikigamiPurge'), 'onClickShikigamiPurge');
    bumpMagicCount(s);
    const mine = ownShikigamiCells(s);
    s.board[randomPick(mine, s.rng)] = { player: undefined, bind: 0, effects: [] }; // 先に1体壊す（コストは壊す前の式神の数で決まる）
}
function exeShikigamiPurge(s, i) {
    if (!purgeTargets(s).includes(i)) return false;
    shikiMod.purge(s.board, i);
    return true;
}
// 汎用(idx 90 式神割引・コスト2): 次に打つスキルのコストを 2＋盤面にある式神の数 だけ軽減する（軽減札なので「次に打つスキル」を消費せず、足す）
function onClickShikigamiDiscount(s) {
    const n = discountMod.SHIKIGAMI_DISCOUNT_BASE + s.board.filter((sq) => isShikigami(sq)).length;
    spendMagic(s, calculateCost(s, costsOf(s).onClickShikigamiDiscount, false, false, 'onClickShikigamiDiscount'), 'onClickShikigamiDiscount');
    s.discount[s.turn] = Object.assign({}, s.discount[s.turn], { next: s.discount[s.turn].next + n });
    bumpMagicCount(s);
}
// 汎用(1体あたりコスト2): 自分の式神を全て通常の自陣コマにする。式神がいなければ何もしない
const shikigamiAllBase = (s) => costsOf(s).onClickShikigamiAll * s.board.filter((sq) => sq.player === curPlayer(s) && isShikigami(sq)).length;
function onClickShikigamiAll(s) {
    const cur = curPlayer(s);
    const base = shikigamiAllBase(s);
    if (base === 0) return;
    for (const sq of s.board) if (sq.player === cur && isShikigami(sq)) sq.effects = sq.effects.filter((e) => e.effect !== '📜');
    spendMagic(s, calculateCost(s, base, false, false, 'onClickShikigamiAll'), 'onClickShikigamiAll');
    bumpMagicCount(s);
}
// 汎用(百鬼夜行・コスト7): 着手できる全ての空きマスにライフ0の式神を置く
function onClickShikigamiFlood(s) {
    const cur = curPlayer(s);
    let placed = 0;
    for (let k = 0; k < s.board.length; k++) {
        const sq = s.board[k];
        if (shikiMod.shikigamiLandable(sq)) { s.board[k] = newShikigami(cur, 0); placed++; }
    }
    spendMagic(s, calculateCost(s, costsOf(s).onClickShikigamiFlood, false, false, 'onClickShikigamiFlood'), 'onClickShikigamiFlood');
    bumpMagicCount(s);
    if (placed > 0) s.shikiPlaced[s.turn] = true; // 置いたあとのスキルから-1
}
// 汎用(コスト2・トークン扱い): 式神をランダムな空きマスに置く
function onClickShikigamiRandom(s) {
    const empties = findEmptyIndexes(s.board);
    let granted = 0;
    if (empties.length) {
        const idx = randomPick(empties, s.rng);
        // トークン系ギア(補強・軽量)のライフ補正を受ける
        s.board[idx] = newShikigami(curPlayer(s), Math.max(1, SHIKIGAMI_LIFE + gear.gearTokenBindDelta(s.gears[s.turn])));
        granted = afterTokenPlaced(s, idx, undefined);
    }
    harvestMagic(s, granted);
    spendMagic(s, calculateCost(s, costsOf(s).onClickShikigamiRandom, true, false, 'onClickShikigamiRandom'), 'onClickShikigamiRandom');
    bumpMagicCount(s);
    if (empties.length) s.shikiPlaced[s.turn] = true;
    s.usedTokenThisTurn = true;
    s.useTokenCount[s.turn]++;
}

// giant
function onClickStomp(s) {
    s.useStomp = true;
    spendMagic(s, gearCost(s, costsOf(s).onClickStomp, false, s.turn, 'onClickStomp'), 'onClickStomp');
}
function exeStomp(s, i) {
    const { destroyed } = blastMod.stomp(s.board, i, curPlayer(s), s.life);
    addCorpses(s, destroyed);
    s.useStomp = false;
}

// magician judge day
function judgeDayCost(s) {
    return gearCost(s, costMod.judgeDayBase(costsOf(s).onClickJudgeDay, s.useMagicCount[s.turn]), false, s.turn, 'onClickJudgeDay');
}
function onClickJudgeDay(s) {
    spendMagic(s, judgeDayCost(s), 'onClickJudgeDay');
    s.useMagicCount[s.turn] = 0;
    s.useJudgeDay = true;
}
function exeJudgeDay(s, i) {
    const { destroyed } = blastMod.judgeDay(s.board, i, curPlayer(s));
    addCorpses(s, destroyed);
    s.useMagicCount[s.turn] = 0;
    s.useJudgeDay = false;
    endTurn(s);
}

function totalAssaultCost(s) {
    return gearCost(s, costMod.totalAssaultBase(costsOf(s).onClickTotalAssault, s.useTokenCount[s.turn]), false, s.turn, 'onClickTotalAssault');
}
function onClickTotalAssault(s) {
    s.useAssault[s.turn] = 3;
    const pay = totalAssaultCost(s);
    s.useTokenCount[s.turn] = 0;
    spendMagic(s, pay, 'onClickTotalAssault');
}

// ---- 増殖 (ループ召喚) ----
// [FAITHFUL] Game.tsx proliferateUpkeep / applyProliferate / onClickProliferate
function proliferateUpkeep(count) {
    return turnMod.proliferateUpkeep(count, PROLIFERATE.upkeepStep);
}
// 1ループ分を盤面に適用。奇数回=コマ(キャラ)、偶数回=アイテム。追加できなければ false（回数を進めない）
function applyProliferate(s, step) {
    const r = proliferateMod.proliferateStep(s.board, step, curPlayer(s), curChar(s), s.chars, s.rng, PROLIFERATE.tokenLife);
    if (!r) return false;
    if (r.added === '☠') toxicBloom(s, [r.cell]);
    return true;
}
function onClickProliferate(s) {
    s.proliferate[s.turn] = true;
    s.proliferateCount[s.turn] = 0;
    spendMagic(s, calculateCost(s, costsOf(s).onClickProliferate, false, false, 'onClickProliferate'), 'onClickProliferate');
    bumpMagicCount(s);
}

// necromancer: activate 蘇生 (墓地から召喚 + 4ターンの自動吸収窓)
function necromancyCost(s) {
    return s.necroCost[s.turn];
}
// 実際に払う魔力（ギア補正込み）。召喚数は墓地(necroCost)で決まり、ギアでは変わらない
function necromancyPay(s) {
    return gearCost(s, s.necroCost[s.turn], false, s.turn, 'onClickNecromancy');
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
    spendMagic(s, gearCost(s, curCost, false, s.turn, 'onClickNecromancy'), 'onClickNecromancy');
    s.useMagicCount[s.turn]++;
    s.remainNecro[s.turn] = necromancyDuration;
    s.necroCost[s.turn] = baseNecromancyCost;
}

// ---- 毒使い スキル ----
const MIASMA_MIN_COST = 1; // Game.tsx / skillCosts.ts と同値
// ミアズマの実コスト: 基礎 - 自陣の毒の数、毒使い割引(-1)、下限は MIASMA_MIN_COST
function miasmaCost(s) {
    return Math.max(MIASMA_MIN_COST, calculateCost(s, costsOf(s).onClickMiasma - poisonCountFor(s.board, curPlayer(s)), false, true, 'onClickMiasma'));
}
// 自陣の毒が乗っているマスの周囲1マスにいる敵マス（ロック/守りは除く）→ 付与する毒の数（本番 poison.ts）
function miasmaPlan(s, me = curPlayer(s)) {
    return poisonMod.miasmaPlan(s.board, me, s.chars);
}
// 効果: 上の plan どおりに敵マスへ毒を付与し、自陣の毒はすべて消える。対象選択は無い
function exeMiasma(s) {
    const { targets } = poisonMod.miasma(s.board, curPlayer(s), s.chars);
    harvestMagic(s, targets.length);
    toxicBloom(s, targets);
}
function onClickMiasma(s) {
    spendMagic(s, miasmaCost(s), 'onClickMiasma');
    exeMiasma(s);
}
function onClickInjection(s) {
    s.useInjection += 1;
    spendMagic(s, calculateCost(s, costsOf(s).onClickInjection, false, true, 'onClickInjection'), 'onClickInjection');
    bumpMagicCount(s);
}
function onClickPoisonToken(s) {
    const empties = findEmptyIndexes(s.board);
    let granted = 0;
    if (empties.length) {
        const idx = randomPick(empties, s.rng);
        s.board[idx] = poisonMod.poisonStrike({ player: curPlayer(s), bind: calculateTokenBind(s), effects: [{ effect: '☠' }] }, s.chars);
        granted = afterTokenPlaced(s, idx, '☠');
        toxicBloom(s, [idx]);
    }
    harvestMagic(s, granted);
    spendMagic(s, calculateCost(s, costsOf(s).onClickPoisonToken, true, true, 'onClickPoisonToken'), 'onClickPoisonToken');
    bumpMagicCount(s);
    s.usedTokenThisTurn = true;
    s.useTokenCount[s.turn]++;
}
function onClickSerum(s) {
    poisonMod.clearOwnPoison(s.board, curPlayer(s));
    spendMagic(s, calculateCost(s, costsOf(s).onClickSerum, false, true, 'onClickSerum'), 'onClickSerum');
    bumpMagicCount(s);
}
function onClickIntensify(s) {
    const { affected, added } = poisonMod.intensify(s.board, s.chars); // 氷結中の毒も倍にできる
    harvestMagic(s, added);
    toxicBloom(s, affected);
    spendMagic(s, calculateCost(s, costsOf(s).onClickIntensify, false, true, 'onClickIntensify'), 'onClickIntensify');
    bumpMagicCount(s);
}
function onClickPandemic(s) {
    s.usePandemic = true;
    spendMagic(s, calculateCost(s, costsOf(s).onClickPandemic, false, true, 'onClickPandemic'), 'onClickPandemic');
    bumpMagicCount(s);
}
function exePandemic(s, i) {
    const targets = poisonMod.pandemicTargets(s.board, i, s.chars);
    poisonMod.addPoison(s.board, targets, s.chars);
    harvestMagic(s, targets.length);
    toxicBloom(s, targets);
    s.usePandemic = false;
}

// 毒霧 (idx 29): 盤上の全コマ（敵味方問わず。🔑ロック・無敵は除く）に毒を1付与する。対象選択なし [FAITHFUL] Game.tsx onClickPoisonMist
function onClickPoisonMist(s) {
    spendMagic(s, calculateCost(s, costsOf(s).onClickPoisonMist, false, true, 'onClickPoisonMist'), 'onClickPoisonMist');
    bumpMagicCount(s);
    const poisoned = poisonMod.poisonMistTargets(s.board, s.chars);
    poisonMod.addPoison(s.board, poisoned, s.chars);
    harvestMagic(s, poisoned.length);
    toxicBloom(s, poisoned);
}

// 一寸先は闇鍋 (idx 82): 敵味方を問わず全コマ（🔑ロック・無敵は除く）に🔥❄⚡☠🌱🍂をランダムに付ける。各エフェクト最大1、複数種類は同居。
// 🔥を先に付け（氷結の解除・燃焼は他を乗せる前に済ませる）、そのあと⚡☠🌱🍂❄の順 [FAITHFUL] Game.tsx onClickDarkPot
function onClickDarkPot(s) {
    if (s.darkPotUsed[s.turn]) return; // 1手番に1度まで
    s.darkPotUsed[s.turn] = true;
    spendMagic(s, calculateCost(s, costsOf(s).onClickDarkPot, false, false, 'onClickDarkPot'), 'onClickDarkPot');
    bumpMagicCount(s);
    const targets = [];
    s.board.forEach((sq, k) => { if (sq.player && !isGuarded(s, sq)) targets.push(k); });
    const rolls = darkPotMod.darkPotRolls(targets.map((k) => s.board[k].effects.map((e) => e.effect)), s.rng);
    const has = (k, e) => s.board[k].effects.some((x) => x.effect === e);
    const owners = s.board.map((sq) => sq.player);
    let granted = 0;
    targets.forEach((k, n) => {
        if (!rolls[n].includes('🔥')) return;
        const f = thermal.flameStacks(s.board[k]);
        thermal.ignite(s.board, [k], s.size, 1, keepBudsOf(s));
        if (thermal.flameStacks(s.board[k]) > f) granted++;
    });
    const destroyed = targets.filter((k) => owners[k] && !s.board[k].player).length;
    if (destroyed > 0) addCorpses(s, destroyed);
    const poisoned = [];
    targets.forEach((k, n) => {
        for (const e of rolls[n]) {
            if (!s.board[k].player || e === '🔥' || e === '❄' || has(k, e)) continue;
            if (e === '⚡') addCharge(s, k);
            else if (e === '☠') { s.board[k].effects.push({ effect: '☠' }); poisonStrike(s, s.board[k]); poisoned.push(k); }
            else s.board[k].effects.push({ effect: e });
            granted++;
        }
        if (s.board[k].player && rolls[n].includes('❄') && !has(k, '❄') && thermal.canFreeze(s.board[k])) granted += thermal.freeze(s.board, [k]).length;
    });
    harvestMagic(s, granted);
    toxicBloom(s, poisoned);
    bumpStat(s, 'darkPot');
    checkDischarge(s);
}

// 雷を食らわば皿まで (idx 83): ⚡が効いている（休眠中でない）自陣のコマのライフを、⚡のスタック1つにつき+2する。⚡のコマが無ければ使えない。
// この手番に付与した⚡の数だけコスト軽減（撃つとリセット） [FAITHFUL] Game.tsx onClickChargeHeal
const CHARGE_HEAL = 2;
function chargeHealCells(s) { return s.board.map((sq, k) => (sq.player === curPlayer(s) && chargeStacks(sq) > 0 && !thermal.isDormant(sq) ? k : -1)).filter((k) => k !== -1); }
function chargeHealLegal(s) { return chargeHealCells(s).length > 0; }
function onClickChargeHeal(s) {
    const cells = chargeHealCells(s);
    if (cells.length === 0) return;
    chargeMod.healCharged(s.board, curPlayer(s));
    spendMagic(s, calculateCost(s, costsOf(s).onClickChargeHeal, false, false, 'onClickChargeHeal'), 'onClickChargeHeal');
    bumpMagicCount(s);
    bumpStat(s, 'chargeHeal');
    s.chargeBase[s.turn] = comboMod.ownCharges(s.board, curPlayer(s)); // 条件のリセット
}

// 落ち葉の置き土産 (idx 84): ランダムな敵のコマ1つに🍂を1つ付ける（🔑ロック・⚡無敵のコマは除く）。対象が無ければ使えない
function leafDropCandidates(s) { return thermal.leafDropTargets(s.board, curPlayer(s), (sq) => isGuarded(s, sq)); }
function leafDropLegal(s) { return leafDropCandidates(s).length > 0; }
function onClickLeafDrop(s) {
    const cands = leafDropCandidates(s);
    if (cands.length === 0) return;
    const pay = calculateCost(s, costsOf(s).onClickLeafDrop, false, false, 'onClickLeafDrop'); // 払うコストは付与する前の盤面で決まる（画面の表示と同じ）
    thermal.leafDrop(s.board, randomPick(cands, s.rng));
    spendMagic(s, pay, 'onClickLeafDrop');
    bumpMagicCount(s);
    bumpStat(s, 'leafDrop');
}
// 落葉の衣 (idx 86): ランダムな自陣のコマ1つに🍂を1つ付与する。クリック不要・手番は続く。自陣のコマが無ければ使えない
function leafCloakCells(s) { return thermal.leafCloakTargets(s.board, curPlayer(s)); }
function leafCloakLegal(s) { return leafCloakCells(s).length > 0; }
function onClickLeafCloak(s) {
    const cells = leafCloakCells(s);
    if (cells.length === 0) return;
    const pay = calculateCost(s, costsOf(s).onClickLeafCloak, false, false, 'onClickLeafCloak'); // 払うコストは付与する前の盤面で決まる
    thermal.leafDrop(s.board, randomPick(cells, s.rng));
    spendMagic(s, pay, 'onClickLeafCloak');
    bumpMagicCount(s);
    bumpStat(s, 'leafCloak');
}
// 焚きつけ (idx 85): 敵の🍂を全て🔥に変換する（🍂1枚につき🔥1つ。🔑ロック・⚡無敵のコマは除く）。対象が無ければ使えない
function kindlingCandidates(s) { return thermal.kindlingTargets(s.board, curPlayer(s), (sq) => isGuarded(s, sq), keepBudsOf(s)); }
function kindlingLegal(s) { return kindlingCandidates(s).length > 0; }
function onClickKindling(s) {
    const cands = kindlingCandidates(s);
    if (cands.length === 0) return;
    const pay = calculateCost(s, costsOf(s).onClickKindling, false, false, 'onClickKindling');
    const r = thermal.kindling(s.board, cands, s.size, keepBudsOf(s));
    spendMagic(s, pay, 'onClickKindling');
    bumpMagicCount(s);
    bumpStat(s, 'kindling');
    bumpStat(s, 'kindlingLeaves', r.leaves);
    bumpStat(s, 'kindlingBuds', r.buds);
}


// 初霜 (idx 93): 敵の🍂があるコマを全て凍結し（🔑ロック・⚡無敵は除く）、自陣にバッズトークンを1つ置く。トークン扱い（1手番に1度）。
// 盤面の🍂（効力のあるもの）が3枚以上ならコスト0 [FAITHFUL] Game.tsx onClickFirstFrost
function firstFrostTargets(s) {
    return tokenSkillsMod.firstFrostTargets(s.board, curPlayer(s), s.chars);
}
function firstFrostLegal(s) { return !s.usedTokenThisTurn && firstFrostTargets(s).length > 0; }
function onClickFirstFrost(s) {
    if (!firstFrostLegal(s)) return;
    const pay = calculateCost(s, costsOf(s).onClickFirstFrost, true, false, 'onClickFirstFrost'); // 凍結で🍂が休眠する前のコストで払う
    const frozen = thermal.freeze(s.board, firstFrostTargets(s));
    chargeGlacier(s, frozen.length);
    const empties = findEmptyIndexes(s.board);
    let granted = 0;
    if (empties.length) {
        const idx = randomPick(empties, s.rng);
        s.board[idx] = { player: curPlayer(s), bind: calculateTokenBind(s), effects: [{ effect: '🌱' }] };
        granted = afterTokenPlaced(s, idx, '🌱');
    }
    harvestMagic(s, granted);
    spendMagic(s, pay, 'onClickFirstFrost');
    bumpMagicCount(s);
    s.usedTokenThisTurn = true;
    s.useTokenCount[s.turn]++;
    bumpStat(s, 'firstFrost');
    bumpStat(s, 'firstFrostFrozen', frozen.length);
}

// 無礼講 (idx 96): このターン、トークン系スキルのコストを0にする。すでに効いているときは撃てない [FAITHFUL] Game.tsx onClickFreeToken
function freeTokenLegal(s) { return !s.tokenFree[s.turn]; }
function onClickFreeToken(s) {
    if (!freeTokenLegal(s)) return;
    const pay = calculateCost(s, costsOf(s).onClickFreeToken, false, false, 'onClickFreeToken');
    s.tokenFree[s.turn] = true;
    spendMagic(s, pay, 'onClickFreeToken');
    bumpMagicCount(s);
    bumpStat(s, 'freeToken');
}

// 夜の帳 (idx 98): 次の相手全員の手番の間、相手のスキルコストを+3する（自分は影響を受けない） [FAITHFUL] Game.tsx onClickNightVeil
function nightVeilLegal() { return true; }
function onClickNightVeil(s) {
    const pay = calculateCost(s, costsOf(s).onClickNightVeil, false, false, 'onClickNightVeil');
    otherSeats(s).forEach((seat) => { s.veilNext[seat] = true; });
    spendMagic(s, pay, 'onClickNightVeil');
    bumpMagicCount(s);
    bumpStat(s, 'nightVeil');
}
// 弔い割引 (idx 99): 墓地の死体の数（上限3）だけ、次に打つスキルのコストを軽減する（軽減札）。死体が無ければ撃てない [FAITHFUL] Game.tsx onClickGraveDiscount
const graveDiscountNow = (s) => graveMod.graveDiscountAmount(graveMod.corpseCount(baseNecromancyCost, s.necroCost[s.turn]));
function graveDiscountLegal(s) { return graveDiscountNow(s) > 0; }
function onClickGraveDiscount(s) {
    const n = graveDiscountNow(s);
    if (n === 0) return;
    spendMagic(s, calculateCost(s, costsOf(s).onClickGraveDiscount, false, false, 'onClickGraveDiscount'), 'onClickGraveDiscount');
    s.discount[s.turn] = Object.assign({}, s.discount[s.turn], { next: s.discount[s.turn].next + n });
    bumpMagicCount(s);
    bumpStat(s, 'graveDiscount');
}
// 毒返しの構え (idx 100): 3手番の間、相手の手番ごとに1度まで、自陣のコマが破壊/乗っ取られたらライフ4・☠付きの自陣コマを置く。すでに効いているときは撃てない [FAITHFUL] Game.tsx onClickPoisonWard
function poisonWardLegal(s) { return s.ward[s.turn] <= 0; }
function onClickPoisonWard(s) {
    if (!poisonWardLegal(s)) return;
    s.ward[s.turn] = graveMod.POISON_WARD_TURNS;
    s.wardFresh[s.turn] = true;
    spendMagic(s, calculateCost(s, costsOf(s).onClickPoisonWard, false, false, 'onClickPoisonWard'), 'onClickPoisonWard');
    bumpMagicCount(s);
    bumpStat(s, 'poisonWard');
}

// 山焼き (idx 95): 敵のエフェクトがあるマス（敵のコマで、氷結(❄)・⚡無敵のマスは無視。🔑ロック自体は数えないが、ロックのマスの他のエフェクトは対象）全てに🔥を1つ付け、自陣にロック付きのトークンを1つ置く。トークン扱い（1手番に1度）。
// エフェクト1つにつき3軽減（最低1。氷結のマスは❄の数だけ・🔑ロック自体は数えない） [FAITHFUL] Game.tsx onClickBurnOff
function burnOffTargets(s) {
    return tokenSkillsMod.burnOffTargets(s.board, curPlayer(s), s.chars);
}
function burnOffLegal(s) { return !s.usedTokenThisTurn && (burnOffTargets(s).length > 0 || findEmptyIndexes(s.board).length > 0); }
function onClickBurnOff(s) {
    if (!burnOffLegal(s)) return;
    const pay = calculateCost(s, costsOf(s).onClickBurnOff, true, false, 'onClickBurnOff'); // 燃やす前のエフェクトの数で軽減する
    const { cells, flames: lit, destroyed: destroyedCells } = tokenSkillsMod.burnOff(s.board, curPlayer(s), s.chars, s.size, keepBudsOf(s));
    const destroyed = destroyedCells.length;
    if (destroyed > 0) addCorpses(s, destroyed);
    const empties = findEmptyIndexes(s.board);
    let granted = 0;
    if (empties.length) {
        const idx = randomPick(empties, s.rng);
        s.board[idx] = { player: curPlayer(s), bind: calculateTokenBind(s), effects: [] };
        applyLock(s, idx);
        granted = afterTokenPlaced(s, idx, undefined);
    }
    harvestMagic(s, granted);
    spendMagic(s, pay, 'onClickBurnOff');
    bumpMagicCount(s);
    s.usedTokenThisTurn = true;
    s.useTokenCount[s.turn]++;
    bumpStat(s, 'burnOff');
    bumpStat(s, 'burnOffCells', cells.length);
    bumpStat(s, 'burnOffFlames', lit);
}

// 吹き寄せ (idx 94): 自陣にトークンを1つ置き、盤面のすべてのエフェクト（式神の印📜は除く。氷結(❄)のあるマス・🔑ロックのマス・⚡無敵のマスは無視して動かさない）をそのマスに移す。
// 🔥が含まれる場合は、全て乗せ終わったあとに🔥の処理をする。トークン扱い（1手番に1度）。エフェクト1つにつき2軽減（最低1。氷結のマスは❄の数だけ・🔑ロック自体は数えない） [FAITHFUL] Game.tsx onClickGather
function gatherLegal(s) { return !s.usedTokenThisTurn && findEmptyIndexes(s.board).length > 0; }
function onClickGather(s) {
    if (!gatherLegal(s)) return;
    const pay = calculateCost(s, costsOf(s).onClickGather, true, false, 'onClickGather'); // 移す前のエフェクトの数で軽減する
    const idx = randomPick(findEmptyIndexes(s.board), s.rng);
    const movedCount = tokenSkillsMod.gather(s.board, idx, { player: curPlayer(s), bind: calculateTokenBind(s) }, s.chars, s.size, keepBudsOf(s));
    const granted = afterTokenPlaced(s, idx, undefined);
    harvestMagic(s, granted);
    spendMagic(s, pay, 'onClickGather');
    bumpMagicCount(s);
    s.usedTokenThisTurn = true;
    s.useTokenCount[s.turn]++;
    bumpStat(s, 'gather');
    bumpStat(s, 'gatherEffects', movedCount);
    checkDischarge(s);
}

// 一寸の虫に魂なし (idx 92): 敵のライフ3以下のコマを全て破壊し（氷結中は❄-1だけ・🔑ロックと無敵は除く）、相手全員を次の手番の終わりまで「ライフ3以下のコマを置けない」縛りにする。
// コストは盤面のコマの数だけ軽減（最低1） [FAITHFUL] Game.tsx onClickSmallFry
function smallFryTargets(s) {
    return lifeBanMod.smallFryTargets(s.board, curPlayer(s), s.chars);
}
// 実際に壊れる敵コマの数（氷結中は❄が減るだけ）
const smallFryDestroyable = (s) => smallFryTargets(s).filter((k) => !thermal.absorbDestroy(s.board[k]).blocked).length;
function onClickSmallFry(s) {
    const cost = calculateCost(s, costsOf(s).onClickSmallFry, false, false, 'onClickSmallFry');
    const destroyed = lifeBanMod.smallFry(s.board, curPlayer(s), s.chars).destroyed.length;
    if (destroyed > 0) addCorpses(s, destroyed);
    otherSeats(s).forEach((seat) => { s.lifeBan[seat] = true; });
    spendMagic(s, cost, 'onClickSmallFry');
    bumpMagicCount(s);
    bumpStat(s, 'smallFry');
    bumpStat(s, 'smallFryDestroyed', destroyed);
}

// パーフェクトゲーム (idx 101): 盤面のコマを敵味方とも全て破壊する（🔑ロック・無敵は除き、氷結中は❄-1だけ） [FAITHFUL] Game.tsx onClickPerfectGame
function perfectGameLegal(s) { return s.board.some((sq) => !!sq.player); }
function onClickPerfectGame(s) {
    const cost = calculateCost(s, costsOf(s).onClickPerfectGame, false, false, 'onClickPerfectGame');
    const r = bigMod.perfectGame(s.board, s.chars);
    if (r.destroyed.length > 0) addCorpses(s, r.destroyed.length);
    spendMagic(s, cost, 'onClickPerfectGame');
    bumpMagicCount(s);
    bumpStat(s, 'perfectGame');
    bumpStat(s, 'perfectGameDestroyed', r.destroyed.length);
}
// 超助っ人 (idx 102): 🔥❄⚡☠🌱🍂のうちランダムな1つを付けたトークンを自陣のランダムな空きマスに置く（トークン扱い・ターン1回） [FAITHFUL] Game.tsx onClickHelper
function onClickHelper(s) {
    const empties = findEmptyIndexes(s.board);
    const effect = bigMod.pickHelperEffect(s.rng);
    let granted = 0;
    if (empties.length) {
        const idx = randomPick(empties, s.rng);
        bigMod.placeHelperToken(s.board, idx, curPlayer(s), calculateTokenBind(s), effect, s.chars, s.size);
        granted = afterTokenPlaced(s, idx, effect === '🌱' || effect === '☠' || effect === '⚡' ? effect : undefined);
        if (effect === '☠') toxicBloom(s, [idx]);
    }
    harvestMagic(s, granted);
    spendMagic(s, calculateCost(s, costsOf(s).onClickHelper, true, false, 'onClickHelper'), 'onClickHelper');
    bumpMagicCount(s);
    s.usedTokenThisTurn = true;
    s.useTokenCount[s.turn]++;
    bumpStat(s, 'helper');
    checkDischarge(s);
}

// ---- 雷霆の巫 スキル ----
function onClickChargeToken(s) {
    const empties = findEmptyIndexes(s.board);
    let granted = 0;
    if (empties.length) {
        const idx = randomPick(empties, s.rng);
        s.board[idx] = { player: curPlayer(s), bind: calculateTokenBind(s), effects: [{ effect: '⚡' }] };
        landCharge(s, idx);
        granted = afterTokenPlaced(s, idx, '⚡');
    }
    harvestMagic(s, granted);
    spendMagic(s, calculateCost(s, costsOf(s).onClickChargeToken, true, false, 'onClickChargeToken'), 'onClickChargeToken');
    bumpMagicCount(s);
    s.usedTokenThisTurn = true;
    s.useTokenCount[s.turn]++;
    bumpStat(s, 'chargeToken');
    checkDischarge(s);
}
function onClickChargeOne(s) {
    s.useChargeOne = true;
    spendMagic(s, chargeOneCost(s), 'onClickChargeOne');
    bumpMagicCount(s);
    bumpStat(s, 'chargeOne');
}
// 固有スキル: 選んだコマのあるマスから、コマのあるマスだけを縦横に辿ってすべてに⚡を付与（発火はしない）
function onClickChargeSpread(s) {
    s.useChargeSpread = true;
    spendMagic(s, chargeSpreadCost(s), 'onClickChargeSpread');
    bumpStat(s, 'chargeSpread');
}
function exeChargeSpread(s, i) {
    const cells = connectedPieces(s.board, i, s.size);
    for (const k of cells) addCharge(s, k);
    harvestMagic(s, cells.length);
    bumpStat(s, 'spreadCells', cells.length);
    s.useChargeSpread = false;
    checkDischarge(s);
}

// ---- 雷霆の巫 スキル2 (#40) ----
// 帯電ダブルトークン: ⚡付きのコマを2つ設置（ターン1回）
function onClickDoubleChargeToken(s) {
    const empties = findEmptyIndexes(s.board);
    for (const idx of randomAnyPick(empties, 2, s.rng)) {
        if (idx != null) { s.board[idx] = { player: curPlayer(s), bind: calculateTokenBind(s), effects: [{ effect: '⚡' }] }; landCharge(s, idx); }
    }
    spendMagic(s, calculateCost(s, costsOf(s).onClickDoubleChargeToken, true, false, 'onClickDoubleChargeToken'), 'onClickDoubleChargeToken');
    bumpMagicCount(s);
    s.usedTokenThisTurn = true;
    s.useTokenCount[s.turn]++;
    bumpStat(s, 'doubleChargeToken');
    checkDischarge(s);
}
// 範囲帯電: 選んだマスを中心に3x3へ⚡を付与（発火はしない）
function onClickChargeArea(s) {
    s.useChargeArea = true;
    spendMagic(s, calculateCost(s, costsOf(s).onClickChargeArea, false, false, 'onClickChargeArea'), 'onClickChargeArea');
    bumpMagicCount(s);
    bumpStat(s, 'chargeArea');
}
function exeChargeArea(s, i) {
    const cells = geometryOf(s.size).stompRange(i);
    for (const k of cells) addCharge(s, k);
    bumpStat(s, 'areaCells', cells.length);
    s.useChargeArea = false;
    checkDischarge(s);
}
// ランダム帯電: ランダムな1〜4マスに⚡（空きマス可。無敵マス・ロック中のマスは除く）
function onClickChargeRandom(s) {
    const cands = chargeMod.randomChargeCandidates(s.board, s.chars);
    const n = Math.min(cands.length, 1 + Math.floor(s.rng() * 4));
    for (const k of randomAnyPick(cands, n, s.rng)) addCharge(s, k);
    spendMagic(s, calculateCost(s, costsOf(s).onClickChargeRandom, false, false, 'onClickChargeRandom'), 'onClickChargeRandom');
    bumpMagicCount(s);
    bumpStat(s, 'chargeRandom');
    checkDischarge(s);
}
// ジャマー: 選んだマスの⚡を発散。縦横に隣接する**敵**コマ(ライフ>0・ロックなし)に⚡のスタック数だけダメージ、⚡は消える
function onClickJammer(s) {
    s.useJammer = true;
    spendMagic(s, calculateCost(s, costsOf(s).onClickJammer, false, false, 'onClickJammer'), 'onClickJammer');
    bumpMagicCount(s);
    bumpStat(s, 'jammer');
}
function exeJammer(s, i) {
    const before = s.board.map((sq) => sq.bind);
    const { damaged, zeroed } = chargeMod.applyJammer(s.board, i, s.size, curPlayer(s)); // 縦横隣接の敵に⚡のスタック数だけダメージ（本番 charge.ts）
    for (const j of damaged) bumpStat(s, 'jammerDmg', before[j] - s.board[j].bind);
    if (zeroed.length) bumpStat(s, 'jammerZeroed', zeroed.length);
    s.useJammer = false;
}

// ヘイルメアリー (idx 27): 陰陽転化を除く固有スキルを追加コストなしでランダム発動 [FAITHFUL] Game.tsx onClickHailMary
// 対象選択が要るもの(ストンプ/審判の日/帯電拡散)は use* フラグを立てるだけ。ミアズマは対象選択が無いのでその場で発動。対象クリックは呼び出し側(AI)の責任
// 当選するスキル。名前と順序は Game.tsx の hailMaryChoices と同じ（AI が当選に合わせて対象を決める aiTurn.ts が名前で指定する）
const HAIL_MARY_CHOICES = [
    ['全軍突撃', (s) => { s.useAssault[s.turn] = 3; s.useTokenCount[s.turn] = 0; }],
    ['ストンプ', (s) => { s.useStomp = true; }],
    ['審判の日', (s) => { s.useJudgeDay = true; }],
    ['式神設置', (s) => { s.useShikigamiPlace = true; }],
    ['蘇生', (s) => {
        summonCorpses(s, Math.max(...s.necroCost.map((c) => baseNecromancyCost - c)));
        if (curChar(s) === 'necromancer') { s.remainNecro[s.turn] = necromancyDuration; s.necroCost[s.turn] = baseNecromancyCost; }
    }],
    ['ミアズマ', (s) => exeMiasma(s)],
    ['帯電拡散', (s) => { s.useChargeSpread = true; }],
];
const HAIL_MARY_NAMES = HAIL_MARY_CHOICES.map(([name]) => name);
// forcedName: AI が事前に対象を決めた当選スキル。省略時は rng で選ぶ
function onClickHailMary(s, forcedName) {
    spendMagic(s, calculateCost(s, costsOf(s).onClickHailMary, false, false, 'onClickHailMary'), 'onClickHailMary');
    const forced = HAIL_MARY_CHOICES.find(([name]) => name === forcedName);
    (forced || HAIL_MARY_CHOICES[Math.floor(s.rng() * HAIL_MARY_CHOICES.length)])[1](s);
}

// サイレンス (idx 28): 自分以外の全席を次の手番スキル禁止にする [FAITHFUL] Game.tsx onClickSilence
function onClickSilence(s) {
    otherSeats(s).forEach((seat) => { s.silenced[seat] = true; });
    spendMagic(s, calculateCost(s, costsOf(s).onClickSilence, false, false, 'onClickSilence'), 'onClickSilence');
}

// ---- 氷結・火炎 (src/components/game/thermal.ts) ----
// 氷結 (idx 30): 選んだコマに❄。火炎付与 (idx 31): 選んだコマに🔥（そのマスと縦横隣の氷結は解ける）
function onClickFreeze(s) {
    s.useFreeze = true;
    spendMagic(s, calculateCost(s, costsOf(s).onClickFreeze, false, false, 'onClickFreeze'), 'onClickFreeze');
    bumpMagicCount(s);
    bumpStat(s, 'freeze');
}
// 火口 (idx 87): 🌱か🍂のある敵コマを1つ選んで🔥を1つ付ける（2段階。対象が無ければ使えない） [FAITHFUL] Game.tsx onClickTinder
function tinderCandidates(s) { return thermal.tinderTargets(s.board, curPlayer(s), (sq) => isGuarded(s, sq)); }
function tinderLegal(s) { return tinderCandidates(s).length > 0; }
function onClickTinder(s) {
    if (!tinderLegal(s)) return;
    s.useTinder = true;
    spendMagic(s, calculateCost(s, costsOf(s).onClickTinder, false, false, 'onClickTinder'), 'onClickTinder');
    s.plantPrev[s.turn] = false; // 無料で撃てるのは1手番に1回まで
    bumpMagicCount(s);
    bumpStat(s, 'tinder');
}
function onClickIgnite(s) {
    s.useIgnite = true;
    spendMagic(s, calculateCost(s, costsOf(s).onClickIgnite, false, false, 'onClickIgnite'), 'onClickIgnite');
    bumpMagicCount(s);
    bumpStat(s, 'ignite');
}
// 氷室の番人の固有スキル 氷河期: 自陣のライフが残るコマすべてに❄（クリック不要・ターン継続）
// 絶対零度（氷室の番人）: 全マスに❄を足し、次の自分の手番開始時に敵の❄マスを爆破する。
// 氷結スキルで❄が作られるたび（誰が使っても）全席のカウンタが+1され、実コスト=max(1, calc(10−カウンタ))。撃った席のカウンタは0に戻る
function glacierCost(s, seat = s.turn) {
    return Math.max(1, calculateCost(s, costsOf(s).onClickGlacier - s.glacierCharge[seat], false, false, 'onClickGlacier'));
}
function onClickGlacier(s) {
    if (s.glacierPending[s.turn]) return; // 発動待ちの間は再使用不可
    const cost = glacierCost(s);
    s.glacierCharge[s.turn] = 0; // 自身の freezeAll で付く❄は数えない
    const done = thermal.freezeAll(s.board);
    s.glacierPending[s.turn] = true;
    spendMagic(s, cost, 'onClickGlacier');
    bumpStat(s, 'glacier');
    bumpStat(s, 'glacierCells', done.length);
}
// 煉獄の鍛冶師の固有スキル フレアバースト: 選んだマスと縦横隣の敵コマに🔥
// 浄化 (idx 32): 自陣のコマの状態異常（☠🔥❄⚡）を全スタック除去する。クリック不要・手番は続く。自陣に状態異常が無ければ不発
function hasAilment(board, player) {
    return board.some((sq) => sq.player === player && sq.effects.some((e) => thermal.AILMENTS.includes(e.effect)));
}
// ---- 🌱バッズ系の汎用スキル (idx 33〜36) ----
// 冬至の種子の🌱ガード: 次の自分の手番開始まで、自陣の🌱は休眠しない（氷結・火炎中のマスでも魔力ボーナスに数えられ、刈り入れ前夜の対象になる）
// 刈り入れ前夜 (idx 33): 自陣の🌱を全部取り除き、取り除いた数だけ魔力を得る。自陣に🌱が無ければ不発
function ownBuds(s) {
    return s.board.reduce((n, sq) => (sq.player === curPlayer(s) ? n + thermal.activeBuds(sq, s.budGuard[s.turn]) : n), 0); // 休眠マスの🌱は数えない（ガード中を除く）
}
function onClickHarvestEve(s) {
    if (ownBuds(s) < 1) return;
    const n = thermal.harvestBuds(s.board, curPlayer(s), s.budGuard[s.turn]);
    spendMagic(s, calculateCost(s, costsOf(s).onClickHarvestEve, false, false, 'onClickHarvestEve'), 'onClickHarvestEve');
    s.magic[s.turn] += n;
    bumpMagicCount(s);
    bumpStat(s, 'harvestEve');
    bumpStat(s, 'harvestEveBuds', n);
}
// 冬至の種子 (idx 34): 自分に🌱ガードを付ける（次の自分の手番開始まで自陣の🌱が休眠しない）。ガード中の再使用は不可
function onClickSolstice(s) {
    if (s.budGuard[s.turn]) return;
    s.budGuard[s.turn] = true;
    spendMagic(s, calculateCost(s, costsOf(s).onClickSolstice, false, false, 'onClickSolstice'), 'onClickSolstice');
    bumpMagicCount(s);
    bumpStat(s, 'solstice');
}
// ひこばえ (idx 35): 🌱を持つ自陣コマ1つを選ぶと、その縦横隣の自陣コマ(canBud)全てに🌱を1つずつ足す
function suckerTargets(s) {
    const me = curPlayer(s);
    const out = [];
    s.board.forEach((sq, i) => {
        if (sq.player === me && thermal.budStacks(sq) > 0 && thermal.budReceivers(s.board, i, me, s.size).length > 0) out.push(i);
    });
    return out;
}
/** 受け取れる隣が最も多い対象（なければ null）。AI 用 */
function bestSuckerTarget(s) {
    let best = null, bestN = 0;
    for (const i of suckerTargets(s)) {
        const n = thermal.budReceivers(s.board, i, curPlayer(s), s.size).length;
        if (n > bestN) { bestN = n; best = i; }
    }
    return best;
}
function exeSucker(s, i) {
    if (!suckerTargets(s).includes(i)) return false;
    // 受け手は最大2つ: 3つ以上あるときはその中からランダムに2つ（重複なし）
    const recv = thermal.budReceivers(s.board, i, curPlayer(s), s.size);
    const picked = recv.length > thermal.GRAFT_MAX ? randomAnyPick(recv, thermal.GRAFT_MAX, s.rng) : undefined;
    const got = thermal.graft(s.board, i, curPlayer(s), s.size, picked);
    bumpStat(s, 'suckerCells', got.length);
    return true;
}
function onClickSucker(s) {
    if (suckerTargets(s).length === 0) return; // 選べるコマが無ければ不発
    s.useSucker = true;
    spendMagic(s, calculateCost(s, costsOf(s).onClickSucker, false, false, 'onClickSucker'), 'onClickSucker');
    bumpMagicCount(s);
    bumpStat(s, 'sucker');
}
// 風の落とし子 (idx 36): 自陣の🌱を持てるコマから重複なしでランダムに SOW_COUNT 個選び、🌱を1つずつ足す
function onClickWindborne(s) {
    const cands = thermal.sowCandidates(s.board, curPlayer(s));
    if (!cands.length) return;
    const picks = randomAnyPick(cands, Math.min(thermal.SOW_COUNT, cands.length), s.rng);
    thermal.sow(s.board, picks);
    spendMagic(s, calculateCost(s, costsOf(s).onClickWindborne, false, false, 'onClickWindborne'), 'onClickWindborne');
    bumpMagicCount(s);
    bumpStat(s, 'windborne');
}

// ---- 氷結スキル群 (idx 41〜48) ----
// 氷結が実際に1スタック作られる度に、全席の絶対零度の軽減カウンタを+1する（作れなかったマスは数えない）
function chargeGlacier(s, made) {
    for (let seat = 0; seat < s.glacierCharge.length; seat++) s.glacierCharge[seat] += made;
}
function freezeCells(s, cells) {
    const made = thermal.freeze(s.board, cells).length;
    chargeGlacier(s, made);
    return made;
}
// 範囲氷結 (idx41): 中心と周囲8マス(盤端で切れる3x3)の canFreeze なマスに❄+1
function onClickFrostArea(s) {
    s.useFrostArea = true;
    spendMagic(s, calculateCost(s, costsOf(s).onClickFrostArea, false, false, 'onClickFrostArea'), 'onClickFrostArea');
    bumpMagicCount(s);
    bumpStat(s, 'frostArea');
}
function exeFrostArea(s, i) {
    bumpStat(s, 'frostAreaCells', freezeCells(s, geometryOf(s.size).stompRange(i)));
}
// 氷柱 (idx42): マスと方向を選び、その線（盤の端から端まで）の canFreeze なマス全部に❄+1
function onClickIcicle(s) {
    s.useIcicle = true;
    spendMagic(s, calculateCost(s, costsOf(s).onClickIcicle, false, false, 'onClickIcicle'), 'onClickIcicle');
    bumpMagicCount(s);
    bumpStat(s, 'icicle');
}
function exeIcicle(s, i, dir) {
    bumpStat(s, 'icicleCells', freezeCells(s, lineCells(s.size, i, dir)));
}
// ランダム氷結 (idx43): canFreeze なマス（空きマス含む）から重複なしにランダムな1〜4マスに❄+1。クリック不要
function onClickRandomFreeze(s) {
    const cands = thermal.randomFreezeCandidates(s.board);
    const n = Math.min(cands.length, 1 + Math.floor(s.rng() * 4));
    freezeCells(s, randomAnyPick(cands, n, s.rng));
    spendMagic(s, calculateCost(s, costsOf(s).onClickRandomFreeze, false, false, 'onClickRandomFreeze'), 'onClickRandomFreeze');
    bumpMagicCount(s);
    bumpStat(s, 'randomFreeze');
}
// 氷結拡散 (idx44): コマを選ぶと、コマのあるマスだけを縦横に辿って届く全コマ（敵味方問わず）の canFreeze なマスに❄+1
function onClickFreezeSpread(s) {
    s.useFrostSpread = true;
    spendMagic(s, calculateCost(s, costsOf(s).onClickFreezeSpread, false, false, 'onClickFreezeSpread'), 'onClickFreezeSpread');
    bumpMagicCount(s);
    bumpStat(s, 'freezeSpread');
}
function exeFreezeSpread(s, i) {
    if (!s.board[i].player) return false;
    bumpStat(s, 'freezeSpreadCells', freezeCells(s, connectedPieces(s.board, i, s.size)));
    return true;
}
// 氷結トークン (idx45) / 氷結ダブルトークン (idx46): 空きマスにランダムで❄付きの自陣のコマを置く。トークン扱い（ターン1回）
function placeFrostTokens(s, n, costKey) {
    const empties = findEmptyIndexes(s.board);
    const picks = n === 1 ? (empties.length ? [randomPick(empties, s.rng)] : []) : randomAnyPick(empties, n, s.rng);
    for (const idx of picks) {
        if (idx == null) continue;
        chargeGlacier(s, thermal.placeFrostToken(s.board, idx, curPlayer(s), calculateTokenBind(s)));
        harvestMagic(s, afterTokenPlaced(s, idx)); // トークンのエフェクトは持たない扱い
    }
    spendMagic(s, calculateCost(s, costsOf(s)[costKey], true, false, costKey), costKey);
    bumpMagicCount(s);
    s.usedTokenThisTurn = true;
    s.useTokenCount[s.turn]++;
}
function onClickFrostToken(s) { placeFrostTokens(s, 1, 'onClickFrostToken'); bumpStat(s, 'frostToken'); }
function onClickDoubleFrostToken(s) { placeFrostTokens(s, 2, 'onClickDoubleFrostToken'); bumpStat(s, 'doubleFrostToken'); }
// 砕氷 (idx47): 氷結中のコマ（敵味方どちらでも）を選ぶと、❄を全除去して❄1スタックにつき3ダメージ。ライフ0以下で破壊。氷結は作られないのでカウンタは増えない
function shatterTargets(s) {
    const out = [];
    s.board.forEach((sq, i) => { if (sq.player && thermal.isFrozen(sq)) out.push(i); });
    return out;
}
function onClickShatter(s) {
    if (shatterTargets(s).length === 0) return;
    s.useShatter = true;
    spendMagic(s, calculateCost(s, costsOf(s).onClickShatter, false, false, 'onClickShatter'), 'onClickShatter');
    bumpMagicCount(s);
    bumpStat(s, 'shatter');
}
function exeShatter(s, i) {
    const r = thermal.shatter(s.board, i);
    if (r.stacks === 0) return false;
    if (r.destroyed) addCorpses(s, 1);
    bumpStat(s, 'shatterDamage', r.damage);
    return true;
}
// 霜降り (idx48): 自陣のコマでライフ2以下（0含む）かつ canFreeze なものすべてに❄+1。クリック不要。対象が0なら使えない
function onClickFrostfall(s) {
    const targets = thermal.frostfallTargets(s.board, curPlayer(s));
    if (targets.length === 0) return;
    freezeCells(s, targets);
    spendMagic(s, calculateCost(s, costsOf(s).onClickFrostfall, false, false, 'onClickFrostfall'), 'onClickFrostfall');
    bumpMagicCount(s);
    bumpStat(s, 'frostfall');
}

// ---- 🍂落ち葉系の汎用スキル (idx 62〜68) ----
// 🍂付きのトークンはトークンのエフェクトを持たない扱い（収穫/伝播ギアとは連動しない。火炎トークンと同じ）
function placeLeafTokens(s, count, leaves) {
    const empties = findEmptyIndexes(s.board);
    for (const idx of randomAnyPick(empties, Math.min(count, empties.length), s.rng)) {
        if (idx == null) continue;
        thermal.placeLeafToken(s.board, idx, curPlayer(s), calculateTokenBind(s), leaves);
        harvestMagic(s, afterTokenPlaced(s, idx));
    }
}
// 払うコストは置く前の盤面で決める（紅葉狩りの導線が、自分で置いた🍂で成立してしまわないように）
const leafTokenCost = (s, key) => calculateCost(s, costsOf(s)[key], true, false, key);
function finishLeafToken(s, key, stat, cost) {
    spendMagic(s, cost, key);
    bumpMagicCount(s);
    s.usedTokenThisTurn = true;
    s.useTokenCount[s.turn]++;
    bumpStat(s, stat);
}
// 木枯らしの使い (idx62): 🍂付きトークン
function onClickLeafToken(s) { const cost = leafTokenCost(s, 'onClickLeafToken'); placeLeafTokens(s, 1, 1); finishLeafToken(s, 'onClickLeafToken', 'leafToken', cost); }
// 落葉松の双子 (idx63): 🍂が2枚付いたトークン
function onClickTwinLeafToken(s) { const cost = leafTokenCost(s, 'onClickTwinLeafToken'); placeLeafTokens(s, 1, 2); finishLeafToken(s, 'onClickTwinLeafToken', 'twinLeafToken', cost); }
// 紅葉狩り (idx64): 🍂付きのダブルトークン
function onClickDoubleLeafToken(s) { const cost = leafTokenCost(s, 'onClickDoubleLeafToken'); placeLeafTokens(s, 2, 1); finishLeafToken(s, 'onClickDoubleLeafToken', 'doubleLeafToken', cost); }
// 枯野の相席 (idx65): 盤面の全てのコマ（敵味方・🔑ロック中と⚡無敵を除く）に🍂を1つずつ付ける。クリック不要・手番は続く
function leafAllCells(s) { return thermal.leafAllTargets(s.board, (sq) => isGuarded(s, sq)); }
function leafAllLegal(s) { return leafAllCells(s).length > 0; }
function onClickLeafAll(s) {
    const cells = leafAllCells(s);
    if (cells.length === 0) return;
    const pay = calculateCost(s, costsOf(s).onClickLeafAll, false, false, 'onClickLeafAll'); // 払うコストは付与する前の盤面で決まる
    for (const k of cells) thermal.leafDrop(s.board, k);
    spendMagic(s, pay, 'onClickLeafAll');
    bumpMagicCount(s);
    bumpStat(s, 'leafAll');
}
// 焚き火の唄 (idx66): 敵陣の🍂を全て除去（🔑ロック・❄氷結のマスは対象外）。対象が無ければ使えない
function bonfireLegal(s) { return thermal.bonfireTargets(s.board, curPlayer(s)).length > 0; }
function onClickBonfire(s) {
    const pay = calculateCost(s, costsOf(s).onClickBonfire, false, false, 'onClickBonfire'); // 払うコストは除去する前の盤面で決まる（画面の表示と同じ）
    thermal.bonfire(s.board, curPlayer(s));
    spendMagic(s, pay, 'onClickBonfire');
    bumpMagicCount(s);
    bumpStat(s, 'bonfire');
}
// 腐葉土の目覚め (idx67): 自陣のランダムな🍂1枚を🌱に変える。自陣に🍂が無ければ使えない
function mulchLegal(s) { return thermal.mulchCandidates(s.board, curPlayer(s)).length > 0; }
function onClickMulch(s) {
    const cands = thermal.mulchCandidates(s.board, curPlayer(s));
    const pay = calculateCost(s, costsOf(s).onClickMulch, false, false, 'onClickMulch');
    if (cands.length) thermal.mulch(s.board, randomPick(cands, s.rng));
    spendMagic(s, pay, 'onClickMulch');
    bumpMagicCount(s);
    bumpStat(s, 'mulch');
}
// 一葉知秋 (idx68): 盤面の🌱をすべて🍂に変える（敵味方問わず）。盤上に🌱が無ければ使えない
function autumnLegal(s) { return thermal.autumnTargets(s.board).length > 0; }
function onClickAutumn(s) {
    const pay = calculateCost(s, costsOf(s).onClickAutumn, false, false, 'onClickAutumn');
    thermal.autumn(s.board);
    spendMagic(s, pay, 'onClickAutumn');
    bumpMagicCount(s);
    bumpStat(s, 'autumn');
}

// 霜枯れ (idx69): 自陣の🍂を持つマス（氷結を付けられるもの）すべてに❄+1。氷結中は🍂が休眠する。クリック不要。対象が無ければ使えない
function leafFrostLegal(s) { return thermal.leafFrostTargets(s.board, curPlayer(s)).filter((i) => !isShielded(s, s.board[i])).length > 0; }
function onClickLeafFrost(s) {
    const targets = thermal.leafFrostTargets(s.board, curPlayer(s)).filter((i) => !isShielded(s, s.board[i]));
    if (targets.length === 0) return;
    freezeCells(s, targets);
    spendMagic(s, calculateCost(s, costsOf(s).onClickLeafFrost, false, false, 'onClickLeafFrost'), 'onClickLeafFrost');
    bumpMagicCount(s);
    bumpStat(s, 'leafFrost');
}

// 春一番 (idx70): 自陣の❄を全て解除し、解除した❄の数だけ、このターンに打つ全スキルを軽減する（軽減札。自分自身は軽減されない）。クリック不要。自陣に❄が無ければ使えない
function springWindLegal(s) { return thermal.thawTargets(s.board, curPlayer(s)).length > 0; }
function onClickSpringWind(s) {
    const { stacks } = thermal.thawAll(s.board, curPlayer(s));
    if (stacks === 0) return;
    spendMagic(s, calculateCost(s, costsOf(s).onClickSpringWind, false, false, 'onClickSpringWind'), 'onClickSpringWind');
    s.discount[s.turn] = Object.assign({}, s.discount[s.turn], { turn: s.discount[s.turn].turn + stacks });
    bumpMagicCount(s);
    bumpStat(s, 'springWind');
}

// ---- 火炎系の汎用スキル (idx 37〜40) ----
// 火炎トークン (idx37): 空きマスにランダムで自陣のコマを置き、直後に🔥を1つ付ける（縦横隣の氷結は全解除）。トークン扱い
function onClickFlameToken(s) {
    const empties = findEmptyIndexes(s.board);
    if (empties.length) {
        const idx = randomPick(empties, s.rng);
        thermal.placeFlameToken(s.board, idx, curPlayer(s), calculateTokenBind(s), s.size);
        harvestMagic(s, afterTokenPlaced(s, idx)); // トークンのエフェクトは持たない（収穫/伝播ギアとは連動しない）
    }
    spendMagic(s, calculateCost(s, costsOf(s).onClickFlameToken, true, false, 'onClickFlameToken'), 'onClickFlameToken');
    bumpMagicCount(s);
    s.usedTokenThisTurn = true;
    s.useTokenCount[s.turn]++;
    bumpStat(s, 'flameToken');
}
// 火炎ダブルトークン (idx38): 空きマス2つに同様
function onClickDoubleFlameToken(s) {
    const empties = findEmptyIndexes(s.board);
    for (const idx of randomAnyPick(empties, 2, s.rng)) {
        if (idx == null) continue;
        thermal.placeFlameToken(s.board, idx, curPlayer(s), calculateTokenBind(s), s.size);
        harvestMagic(s, afterTokenPlaced(s, idx));
    }
    spendMagic(s, calculateCost(s, costsOf(s).onClickDoubleFlameToken, true, false, 'onClickDoubleFlameToken'), 'onClickDoubleFlameToken');
    bumpMagicCount(s);
    s.usedTokenThisTurn = true;
    s.useTokenCount[s.turn]++;
    bumpStat(s, 'doubleFlameToken');
}
// 焼畑 (idx39): 🌱を持つマス（敵味方どちらでも）を選ぶと、🌱を全て除去し、同数だけ火炎を付ける。盤上に🌱が無ければ使えない
function swiddenTargets(s) {
    const out = [];
    s.board.forEach((sq, i) => { if (thermal.budStacks(sq) > 0 && !isShielded(s, sq)) out.push(i); });
    return out;
}
function exeSwidden(s, i) {
    if (!swiddenTargets(s).includes(i)) return false;
    const r = thermal.swidden(s.board, i, s.size);
    bumpStat(s, 'swiddenBuds', r.n);
    return true;
}
function onClickSwidden(s) {
    if (swiddenTargets(s).length === 0) return;
    s.useSwidden = true;
    spendMagic(s, calculateCost(s, costsOf(s).onClickSwidden, false, false, 'onClickSwidden'), 'onClickSwidden');
    bumpMagicCount(s);
    bumpStat(s, 'swidden');
}
// 殉火 (idx40・仮名): 自コマ（ライフ>0・🔑なし）を選ぶと、そのライフをゼロにして、ライフがそれ以下の敵コマ全てに🔥を1つ。対象の敵が0なら使えない
function sacrificeCandidates(s) {
    const me = curPlayer(s);
    const out = [];
    s.board.forEach((sq, i) => {
        if (sq.player === me && sq.bind > 0 && !sq.effects.some((e) => e.effect === '🔑') && thermal.sacrificeTargets(s.board, sq.bind, me, s.chars).length > 0) out.push(i);
    });
    return out;
}
function exeSacrifice(s, i) {
    if (!sacrificeCandidates(s).includes(i)) return false;
    const r = thermal.sacrificeFlame(s.board, i, curPlayer(s), s.chars, s.size, keepBudsOf(s));
    bumpStat(s, 'sacrificeTargets', r.targets.length);
    return true;
}
function onClickSacrifice(s) {
    if (sacrificeCandidates(s).length === 0) return;
    s.useSacrifice = true;
    spendMagic(s, calculateCost(s, costsOf(s).onClickSacrifice, false, false, 'onClickSacrifice'), 'onClickSacrifice');
    bumpMagicCount(s);
    bumpStat(s, 'sacrifice');
}

// 縮地 (idx50): 自陣のコマを1つ選び、空きマスへ動かす（ライフ・エフェクトごと）。手番は続く
function onClickRelocate(s) {
    s.useRelocate = true;
    s.relocateFrom = null;
    spendMagic(s, calculateCost(s, costsOf(s).onClickRelocate, false, false, 'onClickRelocate'), 'onClickRelocate');
    bumpMagicCount(s);
    bumpStat(s, 'relocate');
}
// 追い剥ぎ (idx52): ライフ0の敵コマを1つ選んで自陣のコマ（ライフ1）にする。手番は続く。対象が無ければ使えない
function onClickPlunder(s) {
    if (genericMod.plunderTargets(s.board, curPlayer(s), s.chars).length === 0) return;
    s.usePlunder = true;
    spendMagic(s, calculateCost(s, costsOf(s).onClickPlunder, false, false, 'onClickPlunder'), 'onClickPlunder');
    bumpMagicCount(s);
    bumpStat(s, 'plunder');
}
// 鬼門封じ (idx74): 敵マスを1つ選んで破壊（氷結中なら❄-1だけ）。破壊して空きマスになったら3ターンロック。対象が無ければ使えない
function kimonCandidates(s) { return thermal.kimonTargets(s.board, curPlayer(s), (sq) => isGuarded(s, sq)); }
function onClickKimon(s) {
    if (kimonCandidates(s).length === 0) return;
    s.useKimon = true;
    spendMagic(s, calculateCost(s, costsOf(s).onClickKimon, false, false, 'onClickKimon'), 'onClickKimon');
    bumpMagicCount(s);
    bumpStat(s, 'kimon');
}
function exeKimon(s, i) {
    if (!kimonCandidates(s).includes(i)) return false;
    const r = thermal.kimon(s.board, i);
    if (r.destroyed) addCorpses(s, 1);
    return true;
}
// 静電気の季節 (idx77): 今の手番を含む3ターン、自分が設置する駒（着手・トークン・全軍突撃のトークン）に⚡。クリック不要。掛かっている間は撃てない
function chargeSeasonLegal(s) { return s.chargeBuff[s.turn] === 0; }
function onClickChargeSeason(s) {
    if (!chargeSeasonLegal(s)) return;
    s.chargeBuff[s.turn] = 3;
    spendMagic(s, calculateCost(s, costsOf(s).onClickChargeSeason, false, false, 'onClickChargeSeason'), 'onClickChargeSeason');
    bumpMagicCount(s);
    bumpStat(s, 'chargeSeason');
}
// 総毛立つ (idx78): 自陣の全コマ（🔑ロック中を除く）に⚡を1つずつ。対象が無ければ使えない
function bristleTargets(s) { return s.board.map((sq, i) => (sq.player === curPlayer(s) && !sq.effects.some((e) => e.effect === '🔑') ? i : -1)).filter((i) => i !== -1); }
function bristleLegal(s) { return bristleTargets(s).length > 0; }
function onClickBristle(s) {
    const cells = bristleTargets(s);
    if (cells.length === 0) return;
    for (const k of cells) addCharge(s, k);
    spendMagic(s, calculateCost(s, costsOf(s).onClickBristle, false, false, 'onClickBristle'), 'onClickBristle');
    bumpMagicCount(s);
    bumpStat(s, 'bristle');
    checkDischarge(s);
}

// 落雷は忘れた頃に (idx79): 自陣のコマの⚡をすべて取り除き、取り除いた数だけ敵の全コマにダメージ（ライフは0まで。ライフ0・ロック・無敵・氷結中は受けない）。⚡が無ければ使えない
function ownChargeStacks(s) { return s.board.reduce((n, sq) => (sq.player === curPlayer(s) ? n + chargeStacks(sq) : n), 0); }
function releaseCharges(s) {
    return chargeMod.releaseCharges(s.board, curPlayer(s), s.chars).removed;
}
function releaseLegal(s) { return ownChargeStacks(s) > 0; }
function onClickRelease(s) {
    if (!releaseLegal(s)) return;
    const pay = calculateCost(s, costsOf(s).onClickRelease, false, false, 'onClickRelease');
    const n = releaseCharges(s);
    spendMagic(s, pay, 'onClickRelease');
    bumpMagicCount(s);
    bumpStat(s, 'release');
    bumpStat(s, 'releaseBolts', n);
}

// 雷のない所に火は立たぬ (idx81): ⚡のあるコマ（自分の無敵マスは可。🔑ロック中と他人の無敵マスは不可）を1つ選んで破壊（氷結中なら❄-1だけで火は燃え移らない）し、
// 周囲8マスの敵コマ（守られていないもの）のうち2〜全部をランダムに選んで🔥+1。⚡のあるコマが無ければ使えない
function thunderFireTargets(s) {
    const me = curPlayer(s);
    return s.board.map((sq, i) => (sq.player && chargeStacks(sq) > 0 && !sq.effects.some((e) => e.effect === '🔑') && (sq.player === me || !isShielded(s, sq)) ? i : -1)).filter((i) => i !== -1);
}
function thunderFireLegal(s) { return thunderFireTargets(s).length > 0; }
function onClickThunderFire(s) {
    if (!thunderFireLegal(s)) return;
    s.useThunderFire = true;
    spendMagic(s, calculateCost(s, costsOf(s).onClickThunderFire, false, false, 'onClickThunderFire'), 'onClickThunderFire');
    bumpMagicCount(s);
    bumpStat(s, 'thunderFire');
}
function exeThunderFire(s, i) {
    if (!thunderFireTargets(s).includes(i)) return false;
    if (thermal.isFrozen(s.board[i])) {
        s.board[i] = thermal.thawOne(s.board[i]);
        return true;
    }
    const me = curPlayer(s);
    s.board[i] = { player: undefined, bind: 0, effects: [] };
    addCorpses(s, 1);
    const cands = surroundRange(s, i).filter((j) => s.board[j].player && s.board[j].player !== me && !isGuarded(s, s.board[j]));
    const picks = thermal.thunderFireVictims(cands, s.rng);
    thermal.ignite(s.board, picks, s.size, 1, keepBudsOf(s));
    bumpStat(s, 'thunderFireVictims', picks.length);
    return true;
}

// 雷神のへそくり (idx80): ⚡のある自陣のコマを1つ選んで⚡を全て取り除き、取り除いたスタック1つにつき次に打つスキルのコスト-1（軽減札）。⚡のある自陣のコマが無ければ使えない
function stashTargets(s) { return s.board.map((sq, i) => (sq.player === curPlayer(s) && chargeStacks(sq) > 0 ? i : -1)).filter((i) => i !== -1); }
function stashLegal(s) { return stashTargets(s).length > 0; }
function onClickStash(s) {
    if (!stashLegal(s)) return;
    s.useStash = true;
    spendMagic(s, calculateCost(s, costsOf(s).onClickStash, false, false, 'onClickStash'), 'onClickStash');
    bumpMagicCount(s);
    bumpStat(s, 'stash');
}
function exeStash(s, i) {
    if (!stashTargets(s).includes(i)) return false;
    const n = chargeStacks(s.board[i]);
    s.board[i] = { ...s.board[i], effects: s.board[i].effects.filter((e) => e.effect !== '⚡') };
    s.discount[s.turn] = Object.assign({}, s.discount[s.turn], { next: s.discount[s.turn].next + n }); // 軽減札なので「次に打つスキル」を消費せず、足す
    bumpStat(s, 'stashBolts', n);
    return true;
}

// 裸の王様 (idx76): 自分以外の全席のギアを、その席の次の手番の終わりまで無効にする（ギアを装備していて、まだ無効でない席が対象）。クリック不要
function stripSeats(s) { return otherSeats(s).filter((seat) => s.gears[seat].length > 0 && !s.gearOff[seat]); }
function stripLegal(s) { return stripSeats(s).length > 0; }
function onClickStrip(s) {
    const seats = stripSeats(s);
    if (seats.length === 0) return;
    for (const seat of seats) {
        s.gearOff[seat] = true;
        s.gearHeld[seat] = s.gears[seat];
        s.gears[seat] = [];
    }
    spendMagic(s, calculateCost(s, costsOf(s).onClickStrip, false, false, 'onClickStrip'), 'onClickStrip');
    bumpMagicCount(s);
    bumpStat(s, 'strip');
}

// 火の車 (idx75): ランダムな敵マス2つに🔥+1、その後自分の手札をシャッフル（無料）。このターン敵か自陣に🔥を付与していれば0コスト（撃つとリセット）。クリック不要
function fireWheelCandidates(s) { return thermal.fireWheelTargets(s.board, curPlayer(s), (sq) => isGuarded(s, sq)); }
function fireWheelLegal(s) { return fireWheelCandidates(s).length > 0; }
// 飛び火 (idx97): ランダムな敵マス2つに🔥+1（火の車からシャッフルを除いたもの）。直前の手番に相手がコマを2つ以上設置していれば0コスト（撃つとリセット） [FAITHFUL] Game.tsx onClickSpark
function onClickSpark(s) {
    const cands = fireWheelCandidates(s);
    if (cands.length === 0) return;
    const pay = calculateCost(s, costsOf(s).onClickSpark, false, false, 'onClickSpark'); // 無料かは撃つ前の状態で決まる
    const picks = randomAnyPick(cands, Math.min(thermal.FIRE_WHEEL_COUNT, cands.length), s.rng);
    thermal.fireWheel(s.board, picks, s.size, keepBudsOf(s));
    spendMagic(s, pay, 'onClickSpark');
    s.placedPrev[s.turn] = false; // 無料で撃てるのは1手番に1回まで
    bumpMagicCount(s);
    bumpStat(s, 'spark');
}
function onClickFireWheel(s) {
    const cands = fireWheelCandidates(s);
    if (cands.length === 0) return;
    const pay = calculateCost(s, costsOf(s).onClickFireWheel, false, false, 'onClickFireWheel'); // 無料かは撃つ前の盤面で決まる
    const picks = randomAnyPick(cands, Math.min(thermal.FIRE_WHEEL_COUNT, cands.length), s.rng);
    thermal.fireWheel(s.board, picks, s.size, keepBudsOf(s));
    spendMagic(s, pay, 'onClickFireWheel');
    s.fireBase[s.turn] = thermal.fireStacksTotal(s.board); // 条件のリセット（この札自身が付けた🔥は数えない）
    s.skills = reshuffleSkillsFor(s, s.turn, POOL_SIZE); // 手札のシャッフル（無料。スキル扱いではない）
    bumpMagicCount(s);
    bumpStat(s, 'fireWheel');
}

function onClickCleanse(s) {
    if (!hasAilment(s.board, curPlayer(s))) return;
    const done = thermal.cleanse(s.board, curPlayer(s));
    spendMagic(s, calculateCost(s, costsOf(s).onClickCleanse, false, false, 'onClickCleanse'), 'onClickCleanse');
    bumpMagicCount(s);
    bumpStat(s, 'cleanse');
    bumpStat(s, 'cleanseCells', done.length);
}
function infernoTargets(s) {
    return thermal.infernoTargets(s.board, curPlayer(s), s.chars).filter((k) => !isShielded(s, s.board[k]));
}
/** 冬至の種子のガード中の席のコマは、🔥が付いても🌱が消えない */
function keepBudsOf(s) {
    return (sq) => !!sq.player && !!s.budGuard[seatOf(sq.player)];
}
// 業火の実コスト: 無料権があれば0、なければ calc(基礎)。無料権は1手番に異なる種類のスキルを INFERNO_FREE_SKILLS(3) 種類使うと付き、手番を跨いで持ち越し、撃つと消える
const INFERNO_FREE_SKILLS = 3;
function infernoCost(s, seat = s.turn) {
    return s.infernoReady[seat] ? 0 : calculateCost(s, costsOf(s).onClickInferno, false, false, 'onClickInferno');
}
// バーンアウト: 🔥が乗っているマスを全て破壊する。盤面に🔥が4つ以上あればコスト0。クリック不要・手番は続く
function burnoutTargets(s) {
    return s.board.map((sq, i) => (thermal.flameStacks(sq) > 0 && !isShielded(s, sq) ? i : -1)).filter((i) => i !== -1);
}
function burnoutCost(s) {
    return thermal.burnoutCostOf(costsOf(s).onClickBurnout, thermal.totalFlames(s.board), (c) => calculateCost(s, c, false, false, 'onClickBurnout'));
}
function onClickBurnout(s) {
    const targets = burnoutTargets(s);
    if (!targets.length) return;
    const cost = burnoutCost(s);
    addCorpses(s, thermal.burnout(s.board, targets));
    spendMagic(s, cost, 'onClickBurnout');
    bumpStat(s, 'burnout');
}
function onClickInferno(s) {
    const targets = infernoTargets(s);
    if (!targets.length) return; // 対象なしは不発
    thermal.ignite(s.board, targets, s.size, 2, keepBudsOf(s));
    spendMagic(s, infernoCost(s), 'onClickInferno');
    s.infernoReady[s.turn] = false; // 撃ったら無料権とカウントをリセット
    s.skillKinds[s.turn] = new Set();
    bumpStat(s, 'inferno');
    bumpStat(s, 'infernoCells', targets.length);
}

// 固有スキル 虎落笛（凩の魔女）: 自陣の🍂の枚数ぶん敵全てにスキルダメージ、自陣のコマ全てのライフ+2。クリック不要・手番は続く
function mogaribueCost(s) {
    return calculateCost(s, costsOf(s).onClickMogaribue, false, false, 'onClickMogaribue');
}
function onClickMogaribue(s) {
    const me = curPlayer(s);
    if (!thermal.canMogaribue(s.board, me)) return; // 自陣のコマが無ければ不発
    const r = thermal.mogaribue(s.board, me, (sq) => isShielded(s, sq));
    spendMagic(s, mogaribueCost(s), 'onClickMogaribue');
    bumpStat(s, 'mogaribue');
    bumpStat(s, 'mogaribueDamage', r.damage * r.hit.length);
}

const SKILLS = {
    charge: onClickCharge,
    miasma: onClickMiasma,
    injection: onClickInjection,
    poisonToken: onClickPoisonToken,
    serum: onClickSerum,
    intensify: onClickIntensify,
    pandemic: onClickPandemic,
    poisonMist: onClickPoisonMist,
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
    shikigamiPlace: onClickShikigamiPlace,
    shikigamiBlast: onClickShikigamiBlast,
    shikigamiAll: onClickShikigamiAll,
    shikigamiRandom: onClickShikigamiRandom,
    shikigamiFlood: onClickShikigamiFlood,
    shikigamiBless: onClickShikigamiBless,
    shikigamiCurse: onClickShikigamiCurse,
    shikigamiPurge: onClickShikigamiPurge,
    shikigamiDiscount: onClickShikigamiDiscount,
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
    freeze: onClickFreeze,
    ignite: onClickIgnite,
    glacier: onClickGlacier,
    cleanse: onClickCleanse,
    harvestEve: onClickHarvestEve,
    flameToken: onClickFlameToken,
    leafToken: onClickLeafToken,
    twinLeafToken: onClickTwinLeafToken,
    doubleLeafToken: onClickDoubleLeafToken,
    leafAll: onClickLeafAll,
    bonfire: onClickBonfire,
    mulch: onClickMulch,
    autumn: onClickAutumn,
    leafFrost: onClickLeafFrost,
    springWind: onClickSpringWind,
    kimon: onClickKimon,
    plunder: onClickPlunder,
    relocate: onClickRelocate,
    fireWheel: onClickFireWheel,
    spark: onClickSpark,
    strip: onClickStrip,
    chargeSeason: onClickChargeSeason,
    bristle: onClickBristle,
    release: onClickRelease,
    stash: onClickStash,
    thunderFire: onClickThunderFire,
    darkPot: onClickDarkPot,
    chargeHeal: onClickChargeHeal,
    leafDrop: onClickLeafDrop,
    kindling: onClickKindling,
    tinder: onClickTinder,
    leafCloak: onClickLeafCloak,
    doubleFlameToken: onClickDoubleFlameToken,
    swidden: onClickSwidden,
    frostArea: onClickFrostArea,
    icicle: onClickIcicle,
    randomFreeze: onClickRandomFreeze,
    freezeSpread: onClickFreezeSpread,
    frostToken: onClickFrostToken,
    doubleFrostToken: onClickDoubleFrostToken,
    shatter: onClickShatter,
    frostfall: onClickFrostfall,
    sacrifice: onClickSacrifice,
    solstice: onClickSolstice,
    sucker: onClickSucker,
    windborne: onClickWindborne,
    inferno: onClickInferno,
    mogaribue: onClickMogaribue,
    burnout: onClickBurnout,
    markdown: (s) => useDiscountSkill(s, 'onClickMarkdown'),
    effectDiscount: (s) => useDiscountSkill(s, 'onClickEffectDiscount'),
    tokenDiscount: (s) => useDiscountSkill(s, 'onClickTokenDiscount'),
    vitalMarkdown: (s) => useDiscountSkill(s, 'onClickVitalMarkdown'),
    uniqueDiscount: (s) => useDiscountSkill(s, 'onClickUniqueDiscount'),
    counterMarkdown: (s) => useDiscountSkill(s, 'onClickCounterMarkdown'),
    clearance: (s) => useDiscountSkill(s, 'onClickClearance'),
    smallFry: onClickSmallFry,
    perfectGame: onClickPerfectGame,
    helper: onClickHelper,
    firstFrost: onClickFirstFrost,
    gather: onClickGather,
    burnOff: onClickBurnOff,
    freeToken: onClickFreeToken,
    nightVeil: onClickNightVeil,
    graveDiscount: onClickGraveDiscount,
    poisonWard: onClickPoisonWard,
};
// 一寸の虫に魂なし: 縛られた席は、ライフ3以下のコマを置くスキルを使えない（何も起きず、魔力も減らない）
for (const key of lifeBanMod.LIFE_BAN_PLACING_KEYS) {
    const name = key.replace(/^onClick/, '').replace(/^./, (c) => c.toLowerCase());
    const orig = SKILLS[name];
    if (typeof orig !== 'function') continue;
    SKILLS[name] = function (s, ...rest) {
        if (lifeBanMod.placeBlocked(s.lifeBan[s.turn], key, calculateTokenBind(s))) return;
        return orig.call(this, s, ...rest);
    };
}

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
    perfectGameLegal, smallFryTargets, nightVeilLegal, graveDiscountLegal, poisonWardLegal, firstFrostLegal, firstFrostTargets, gatherLegal, burnOffLegal, burnOffTargets, freeTokenLegal,
    tinderLegal, tinderCandidates, bonfireLegal, mulchLegal, autumnLegal, leafFrostLegal, springWindLegal, kimonCandidates, fireWheelLegal, stripLegal, chargeSeasonLegal, bristleLegal, chargeHealLegal, leafDropLegal, leafAllLegal, leafCloakLegal, kindlingLegal, releaseLegal, stashLegal, thunderFireLegal, thunderFireTargets,
    spendMagic, shuffleHand, HEART, CIRCLE, SYMBOLS, MAX_PLAYERS, seatOf, boardSizeFor, DECAY_PER_ROUND_MIN_PLAYERS, CHARACTERS, skillCosts, SKILLS,
    makeRng, normRand, calculateLife, calculateWinner, settleWinner, findEmptyIndexes, SHIKIGAMI_BLAST_DAMAGE, isShikigami, newShikigami, exeShikigamiBlast, SHIKIGAMI_LIFE,
    blessTargets, curseTargets, purgeTargets, SHIKIGAMI_PURGE_FREE, smallFryDestroyable,
    HAIL_MARY_NAMES, onClickHailMary, bumpStat, calculateTokenBind, newGame, placeMove, advanceTurn, judgeNextSeat, judgeNextIsHeart, shouldDecay, lateMagicBonus, renderBoard,
    curPlayer, curChar, curMagic, symbolOfSeat, seatCount, otherSeats, symbolsOf, calculateCost, judgeDayCost, totalAssaultCost, necromancyCost, reshuffleSkillsFor,
    miasmaCost, miasmaPlan, poisonCountFor, boardPoisonCount, surroundRange, costsOf, gearCost, necromancyPay,
    PROLIFERATE, proliferateUpkeep,
    POOL_SIZE, shatterTargets, exeIcicle, swiddenTargets, sacrificeCandidates, suckerTargets, bestSuckerTarget, ownBuds, infernoTargets, hasAilment, glacierCost, infernoCost, mogaribueCost, burnoutCost, burnoutTargets, INFERNO_FREE_SKILLS, FIRE_DAMAGE, CHARGE_LANDING_DAMAGE, landedCharge, CHARGE_MIN_COST, boardChargeCount, chargeOneCost, chargeSpreadCost, chargeStacks, orthoNeighbors, isShielded, isGuarded, connectedPieces, charOfPlayer,
};
