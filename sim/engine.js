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
const CHARACTERS = ['you', 'tactician', 'magician', 'giant', 'yinYangMaster', 'necromancer', 'poisoner', 'electrician', 'cryomancer', 'pyromancer'];

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
const { boardSizeFor, geometryOf, geometryForCells, lineCells } = require('./geometry');
const gear = require('./gear');
const deckMod = require('./deck');
const thermal = require('./thermal');
const { GEAR_PARAMS: GP, hasGear } = gear;

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

// 汎用スキルプールの大きさ (idx 0..POOL_SIZE-1)。#39 で 21 -> 23、#40 で 23 -> 27、ヘイルメアリー/サイレンスで 27 -> 29、毒霧で 29 -> 30
const POOL_SIZE = Number(process.env.SIM_POOL_SIZE) || config.poolSize || 49; // SIM_POOL_SIZE: A/B検証用の上書き

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
function calculateLife(characterId, yinYangMode, rng, lifeBonus = 0, std = config.lifeStd) {
    const L = config.lifeMeans;
    let m;
    if (characterId === 'yinYangMaster') m = yinYangMode === 'yang' ? L.yinYangMaster_yang : L.yinYangMaster_ying;
    else m = L[characterId] != null ? L[characterId] : L.default;
    return Math.floor(normRand(m + lifeBonus, std, rng));
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
        if (sq.player === undefined && sq.effects.filter((e) => e.effect === '🔑').length === 0 && !thermal.emptyBlocked(sq)) out.push(i);
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
    onClickPoisonMist: 7, // idx 29
    // ❄氷結・🔥火炎。氷結/火炎付与は汎用プール(idx 30/31)、氷河期は氷室の番人・フレアバーストは煉獄の鍛冶師の固有スキル
    onClickFreeze: (config.thermal && config.thermal.freezeCost) || 3,
    onClickIgnite: (config.thermal && config.thermal.igniteCost) || 3,
    onClickGlacier: (config.thermal && config.thermal.glacierCost) || 10,
    onClickCryoFreeze: (config.thermal && config.thermal.cryoFreezeCost) || 2, // 氷室の番人のロック置換
    onClickCleanse: (config.thermal && config.thermal.cleanseCost) || 5, // idx 32
    onClickInferno: (config.thermal && config.thermal.infernoCost) || 9,
    // 🌱バッズ系の汎用スキル idx 33〜36
    onClickHarvestEve: (config.thermal && config.thermal.harvestEveCost) || 2,
    onClickSolstice: (config.thermal && config.thermal.solsticeCost) || 4,
    onClickSucker: (config.thermal && config.thermal.suckerCost) || 4,
    onClickWindborne: (config.thermal && config.thermal.windborneCost) || 3,
    // 火炎系の汎用スキル idx 37〜40（対氷結の手段）
    onClickFlameToken: (config.thermal && config.thermal.flameTokenCost) || 3,
    onClickDoubleFlameToken: (config.thermal && config.thermal.flameDoubleTokenCost) || 6,
    onClickSwidden: (config.thermal && config.thermal.swiddenCost) || 3,
    onClickSacrifice: (config.thermal && config.thermal.sacrificeCost) || 5,
    // 氷結スキル群 idx 41〜48
    onClickFrostArea: (config.thermal && config.thermal.frostAreaCost) || 5,
    onClickIcicle: (config.thermal && config.thermal.icicleCost) || 6,
    onClickRandomFreeze: (config.thermal && config.thermal.randomFreezeCost) || 3,
    onClickFreezeSpread: (config.thermal && config.thermal.freezeSpreadCost) || 7,
    onClickFrostToken: (config.thermal && config.thermal.frostTokenCost) || 3,
    onClickDoubleFrostToken: (config.thermal && config.thermal.doubleFrostTokenCost) || 6,
    onClickShatter: (config.thermal && config.thermal.shatterCost) || 4,
    onClickFrostfall: (config.thermal && config.thermal.frostfallCost) || 3,
    // 汎用スキル(idx 49-52)。コスト表のキー順をブラウザ版と揃える（sim 側のスキル実装は未対応）
    onClickBoost: 4,
    onClickRelocate: 3,
    onClickClone: 4,
    onClickPlunder: 5,
};
// A/B検証用: SIM_COSTS='onClickFrostToken=5,onClickWindborne=4' のようにコストを上書きできる（既定は未設定＝上の値）
if (process.env.SIM_COSTS) for (const kv of process.env.SIM_COSTS.split(',')) { const [k, v] = kv.split('='); if (k in skillCosts) skillCosts[k] = Number(v); }
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
// 効力のある毒の数。休眠マス（氷結・火炎中）の☠は消えないが休眠する（継続ダメージ・毒数に依存する処理に数えない）
function poisonStacks(sq) {
    return thermal.isDormant(sq) ? 0 : sq.effects.filter((e) => e.effect === '☠').length;
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
    return !!sq.player && charOfPlayer(s, sq.player) === 'electrician' && chargeStacks(sq) > 0 && !thermal.isDormant(sq); // 休眠中（氷結・火炎）は無敵でない（⚡が休眠）
}
// 🔑ロックまたは⚡の無敵＝ダメージ系スキルの対象外にするマス
function isGuarded(s, sq) {
    return sq.effects.some((e) => e.effect === '🔑') || isShielded(s, sq);
}
// 盤面全体の⚡の数（スタック込み。氷結中のマスの⚡は休眠なので数えない）
function boardChargeCount(board) {
    let n = 0;
    for (const sq of board) if (!thermal.isDormant(sq)) n += chargeStacks(sq);
    return n;
}
// 帯電付与・帯電拡散の実コスト: 盤面の⚡の数だけ軽減、下限 CHARGE_MIN_COST (#43。ミアズマと同じ流儀)
function chargeOneCost(s) {
    return Math.max(CHARGE_MIN_COST, calculateCost(s, costsOf(s).onClickChargeOne - boardChargeCount(s.board)));
}
function chargeSpreadCost(s) {
    return Math.max(CHARGE_MIN_COST, calculateCost(s, costsOf(s).onClickChargeSpread - boardChargeCount(s.board)));
}
// ⚡を増やす操作の直後に呼ぶ。全マスに⚡があれば全⚡と🔑を取り除き、全マスのライフを0にする
function checkDischarge(s) {
    if (!DISCHARGE) return false;
    if (!s.board.every((sq) => chargeStacks(sq) > 0 && !thermal.isDormant(sq))) return false; // 休眠マスの⚡は⚡なし扱い
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
        if (chargeStacks(board[k]) === 0 || thermal.isDormant(board[k])) continue; // 休眠マス（氷結・火炎中）の⚡は発火しない（消えもしない）
        bumpStat(s, 'fires');
        bumpStat(s, charOfPlayer(s, mover) === 'electrician' ? 'firesByElectrician' : 'firesByOther');
        for (const n of orthoNeighbors(k, s.size)) {
            const sq = board[n];
            if (!sq.player || sq.bind <= 0) continue;
            if (sq.effects.some((e) => e.effect === '🔑')) continue; // ロックは貫通しない
            if (thermal.isFrozen(sq)) continue; // 氷結中のマスは隣接⚡のダメージを受けない
            // 雷霆の巫は、自陣由来（自分のコマが載っている⚡マス）の発火ダメージを受けない
            if (sq.player === board[k].player && charOfPlayer(s, sq.player) === 'electrician') continue;
            board[n] = thermal.applyDamage(sq, FIRE_DAMAGE, 'electric').sq; // 電気は氷結を貫通する。ダメージが通れば🔥は消える
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

// ---- ギアのエフェクト系ヘルパー ----
// ロックを付ける。期間(ライフ)は堅牢の鍵で延びる。空きマスなら空蔵の持ち主を記録しておく
function applyLock(s, idx) {
    const sq = s.board[idx];
    if (thermal.isFrozen(sq)) return; // 氷結中のマスにはロックが掛からない
    const g = s.gears[s.turn];
    const owner = hasGear(g, 'emptyLock') && !sq.player ? s.turn + 1 : undefined;
    sq.effects.push(owner ? { effect: '🔑', value: owner } : { effect: '🔑' });
    const bind = gear.gearLockBind(g);
    if (sq.bind < bind) sq.bind = bind;
}
// 毒花: 毒を付与するスキルを使ったとき、自陣のコマ1つにバッズも付く。target が自陣のコマならそこ、なければランダムな自陣のコマ
function toxicBloom(s, target) {
    if (!hasGear(s.gears[s.turn], 'toxicBloom')) return;
    const me = curPlayer(s);
    let idx = target;
    if (idx == null || s.board[idx].player !== me) {
        const mine = [];
        s.board.forEach((sq, k) => { if (sq.player === me && !isGuarded(s, sq)) mine.push(k); });
        if (!mine.length) return;
        idx = randomPick(mine, s.rng);
    }
    s.board[idx].effects.push({ effect: '🌱' });
    bumpStat(s, 'toxicBloom');
}
// トークン系スキルでコマを置いた後の処理: 道連れの鍵(確率でロック) と 伝播(周囲のコマに同じエフェクト)。
// effect はトークンが持つエフェクト(🌱/☠/⚡)、無ければ undefined。収穫に渡す「付与したエフェクト数」を返す
function afterTokenPlaced(s, idx, effect) {
    const g = s.gears[s.turn];
    let granted = effect ? 1 : 0;
    if (hasGear(g, 'bindingLock') && s.rng() < GP.bindingLockChance) {
        applyLock(s, idx);
        granted += 1;
        bumpStat(s, 'bindingLock');
    }
    if (effect && hasGear(g, 'propagate')) {
        const me = curPlayer(s);
        // 周囲8マスのコマのうち、ロックされておらず、エフェクトの種類に合うもの（バッズ=自陣 / 毒=敵 / ⚡=誰でも）
        const cands = surroundRange(s, idx).filter((j) => {
            const sq = s.board[j];
            if (!sq.player || isGuarded(s, sq)) return false;
            if (effect === '🌱') return sq.player === me;
            if (effect === '☠') return sq.player !== me;
            return true;
        });
        if (cands.length) {
            const j = randomPick(cands, s.rng);
            s.board[j].effects.push({ effect });
            if (effect === '☠') poisonStrike(s, s.board[j]);
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
        gearSkills: fill(0),
        skillKinds: Array.from({ length: n }, () => new Set()), // 手番内に使ったスキルの種類（業火の無料権の数え方）
        infernoReady: fill(false), // 業火の無料権。手番を跨いで持ち越し、業火を撃つと消える
        echoReady: fill(false),
        echoNext: fill(false),
        // 価格破壊: 席ごとのコスト表（試合開始時に1回だけ抽選）。装備していない席は null
        priceTables: gears.map((g) => (hasGear(g, 'priceWreck') ? gear.applyPriceOffsets(skillCosts, gear.rollPriceOffsets(skillCosts, rng)) : null)),
        useChargeArea: false,
        useJammer: false,
        useFreeze: false,
        useSucker: false,
        useSwidden: false,
        useFrostArea: false,
        useIcicle: false,
        icicleDir: 'row', // 氷柱の方向（AI/テストは exeIcicle に直接渡す。placeMove 経由のときはこの値）
        useFrostSpread: false,
        useShatter: false,
        useSacrifice: false,
        budGuard: fill(false), // 冬至の種子: 🌱ガード中の席（その席の次の手番開始時に解除）
        glacierCharge: fill(0), // 絶対零度の軽減カウンタ: 氷結スキルで❄が作られるたび全席+1、撃った席だけ0に戻る
        glacierPending: fill(false), // 絶対零度: 次の自分の手番開始時に発動待ちの席
        useIgnite: false,
        stats: {},
        winner: undefined,
        log: [],
    };
    defineLegacyAliases(state);
    state.life = Math.max(1, calculateLife(chars[0], state.yy[0], rng, gear.gearLifeBonus(gears[0]), gear.gearLifeStd(gears[0], config.lifeStd)));
    state.skills = reshuffleSkillsFor(state, 0, POOL_SIZE); // 先手(席0)の初期スキル
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

const symbolsOf = (board) => board.map((x) => x.player);
const seatCount = (s) => s.chars.length;
const symbolOfSeat = (seat) => SYMBOLS[seat];
const curPlayer = (s) => SYMBOLS[s.turn];
const curChar = (s) => s.chars[s.turn];
const curYY = (s) => s.yy[s.turn];
const curMagic = (s) => s.magic[s.turn];
/** 自分以外の席番号 */
const otherSeats = (s, seat = s.turn) => s.chars.map((_, i) => i).filter((i) => i !== seat);

// ---- ギア ----
/** 席ごとのスキルコスト表。価格破壊を装備していればその席の抽選結果、なければ基礎表 */
function costsOf(s, seat = s.turn) {
    return s.priceTables[seat] || skillCosts;
}
function gearCtx(s, seat) {
    return { skillsThisTurn: s.gearSkills[seat], echoReady: s.echoReady[seat] };
}
/** キャラ補正済みのコストにギアの補正を掛ける */
function gearCost(s, cost, isToken = false, seat = s.turn) {
    return gear.adjustCostByGear(cost, s.gears[seat], gearCtx(s, seat), isToken);
}
/** スキルを1回使ったことを記録する（四連の極意・連鎖割引・余韻の入力） */
function noteSkillUsed(s) {
    s.gearSkills[s.turn]++;
    s.echoNext[s.turn] = true;
    s.echoReady[s.turn] = false;
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
    noteSkillUsed(s);
    // 業火の無料権: 異なる種類のスキルを INFERNO_FREE_SKILLS 種類使うと付く（同じスキルの連打は1種類。業火自身は数えない）
    if (skillId && skillId !== 'onClickInferno') {
        s.skillKinds[s.turn].add(skillId);
        if (s.skillKinds[s.turn].size >= INFERNO_FREE_SKILLS) s.infernoReady[s.turn] = true;
    }
}
function bumpMagicCount(s) {
    s.useMagicCount[s.turn]++;
}

// [FAITHFUL] Game.tsx calculateCost
function characterCost(s, cost, isToken, isPoison) {
    const c = curChar(s);
    // 毒使い: 毒系スキルは-1、それ以外は+1
    if (c === 'poisoner') return isPoison ? cost - 1 : cost + 1;
    if (c === 'tactician') return isToken ? cost - 1 : cost + 2;
    if (c === 'yinYangMaster' && curYY(s) === 'yang') return cost + 1;
    return cost;
}
function calculateCost(s, cost, isToken = false, isPoison = false) {
    return gearCost(s, characterCost(s, cost, isToken, isPoison), isToken);
}

// [FAITHFUL] Game.tsx calculateTokenBind
function calculateTokenBind(s) {
    const base = curChar(s) === 'tactician' ? 6 : 4;
    const delta = gear.gearTokenBindDelta(s.gears[s.turn]);
    return delta === 0 ? base : Math.max(1, base + delta);
}

// 魔力ボーナスに数える🌱（休眠マスの🌱は数えない。guarded=冬至の種子で🌱だけは休眠しない）
function budsCount(board, player, guarded = false) {
    return board
        .filter((x) => x.player === player && (guarded || !thermal.isDormant(x)))
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
    let nextMagic = s.magic[next] + 1 + lateMagicBonus(s.currentTurn, seatCount(s)) + budsCount(s.board, sym, s.budGuard[next]);
    if (magicCharacter.includes(ch)) nextMagic++;
    if (ch === 'yinYangMaster' && s.yy[next] === 'ying') nextMagic++;
    // 魔法使い: 自陣のバッズ1つにつき魔力回復+3 (標準+1に追加+2)
    if (ch === 'magician') nextMagic += budsCount(s.board, sym, s.budGuard[next]) * 2;
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
    s.life = calculateLife(ch, s.yy[next], s.rng, (ch === 'poisoner' ? poisonCountFor(s.board, sym) : 0) + gear.gearLifeBonus(s.gears[next]), gear.gearLifeStd(s.gears[next], config.lifeStd));
    if (s.life <= 0) s.life = 1;
    s.usedTokenThisTurn = false;
    // ギア: 新しい手番のスキル使用数をリセットし、余韻を引き継ぐ
    s.gearSkills[next] = 0;
    s.skillKinds[next] = new Set();
    s.echoReady[next] = s.echoNext[next];
    s.echoNext[next] = false;
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
        if (chargeStacks(board[i]) === 0 || thermal.isDormant(board[i])) return false; // 休眠マスの⚡はジャマーの起点にならない
        if (isShielded(s, board[i]) && board[i].player !== curPlayer(s)) return false;
        exeJammer(s, i);
        return true;
    }

    // 雷霆の巫の⚡付き自陣マスは、本人も相手も触れない (無敵＋弱点)
    if (isShielded(s, board[i])) return false;

    // pending targeted skills consume the click without advancing the turn
    if (s.useChargeOne) {
        board[i].effects.push({ effect: '⚡' });
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
        if (!board[i].player) return false;
        thermal.ignite(board, [i], s.size, 1, keepBudsOf(s));
        s.useIgnite = false;
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
        toxicBloom(s, i);
        s.useInjection -= 1;
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
    // 氷結中の空きマスには誰も着手できない
    if (thermal.emptyBlocked(board[i])) return false;
    // ❄氷結中の自陣コマには重ねて強化できない（氷室の番人は除く）
    if (board[i].player === curPlayer(s) && thermal.overwriteBlocked(board[i])) return false;

    // decay step (+ 毒: スタック数だけ追加で bind を減らす)。3人以上は手番が1周するごとに1回だけ (issue #30)
    const decayNow = shouldDecay(s.placements, seatCount(s));
    s.placements += 1;
    const spreadOrigins = [];
    for (let k = 0; decayNow && k < board.length; k++) {
        const sq = board[k];
        // ❄氷結中のマスはターン進行でライフが減らない（自然減衰・🔥の継続ダメージとも）
        if ((sq.player || sq.effects.some((e) => e.effect === '🔑')) && sq.bind > 0 && !thermal.isFrozen(sq)) sq.bind--;
        // 🔥火炎: スタック×2の継続ダメージ（🔥自体は消えない）
        const burn = thermal.burnDamageOf(sq, s.chars, SYMBOLS);
        if (burn > 0) sq.bind = Math.max(0, sq.bind - burn);
        const poison = poisonStacks(sq); // 氷結中のマスの☠は休眠（継続ダメージなし・消滅もしない）
        if (poison > 0 && sq.bind > 0) {
            // ダメージが通れば🔥は消える
            const hit = thermal.applyDamage(sq, poison, 'poison').sq;
            sq.bind = hit.bind;
            sq.effects = hit.effects;
        }
        // 期限切れのロック。空蔵の持ち主が空きマスにかけたロックなら、そのマスが持ち主のコマになる
        const expiredLock = sq.bind === 0 ? sq.effects.find((e) => e.effect === '🔑') : undefined;
        if (sq.bind === 0) sq.effects = sq.effects.filter((e) => e.effect !== '🔑');
        if (expiredLock && expiredLock.value != null && !sq.player) {
            board[k] = { player: SYMBOLS[expiredLock.value - 1], bind: GP.emptyLockLife, effects: [] };
            bumpStat(s, 'emptyLockSpawn');
            continue;
        }
        // 毒持ちでライフが0のマスは消える（空きマスに戻る）。毒使い側は空いたマス1つにつき魔力+1。
        // 「このターンに0へ落ちた」とは限らない: ライフ0のコマに後から毒を撒いた場合も消す
        if (poison > 0 && sq.bind === 0 && sq.player && k !== i) {
            spreadOrigins.push(k);
            board[k] = { player: undefined, bind: 0, effects: [] };
            s.chars.forEach((c, seat) => { if (c === 'poisoner') s.magic[seat] += 1; });
        }
    }
    const hadPoisonAtTarget = poisonStacks(board[i]) > 0;

    const cur = curPlayer(s);
    const life = s.life;
    let newBind, newEffects, newPlayer;
    let capturedFrom; // 通常の攻撃で奪取した相手のシンボル（復讐の刃）
    if (board[i].player === cur) {
        newPlayer = board[i].player;
        newBind = board[i].bind + life + 1;
        newEffects = board[i].effects;
    } else if (board[i].player) {
        const calc = board[i].bind - life + (board[i].bind > 0 ? 1 : 0);
        if (calc < 0) {
            newPlayer = cur;
            newBind = calc * -1;
            capturedFrom = board[i].player;
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

    // 復讐の刃: 奪われた側は魔力を得る（1手の獲得は上限あり）。奪った側が装備していれば魔力を失う
    const vengeanceGained = {};
    if (capturedFrom) {
        vengeanceGain(s, seatOf(capturedFrom), vengeanceGained);
        if (hasGear(s.gears[s.turn], 'vengeance')) s.magic[s.turn] = Math.max(0, s.magic[s.turn] - GP.vengeancePenalty);
    }

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
                vengeanceGain(s, seatOf(sq.player), vengeanceGained);
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
    s.magic[s.turn] += costsOf(s).onClickCharge;
    endTurn(s);
}
function onClickAddLife(s) {
    s.life += 3;
    spendMagic(s, calculateCost(s, costsOf(s).onClickAddLife), 'onClickAddLife');
    bumpMagicCount(s);
}
function onClickBibine(s) {
    s.life *= 2;
    spendMagic(s, calculateCost(s, costsOf(s).onClickBibine), 'onClickBibine');
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
    spendMagic(s, calculateCost(s, costsOf(s).onClickBuds), 'onClickBuds');
    bumpMagicCount(s);
}
function onClickDoubleBuds(s) {
    s.useBuds = [true, s.useBuds[1] + 2];
    harvestMagic(s, 2);
    spendMagic(s, calculateCost(s, costsOf(s).onClickDoubleBuds), 'onClickDoubleBuds');
    bumpMagicCount(s);
}
function onClickUseLock(s) {
    // 氷室の番人: 常在のロックは「氷結」（コスト2・対象1マスに❄。空きマス可）に置き換わる
    if (curChar(s) === 'cryomancer') {
        s.useFreeze = true;
        spendMagic(s, calculateCost(s, costsOf(s).onClickCryoFreeze), 'onClickCryoFreeze');
        bumpMagicCount(s);
        bumpStat(s, 'cryoFreeze');
        return;
    }
    s.useLock += 1;
    spendMagic(s, calculateCost(s, costsOf(s).onClickUseLock), 'onClickUseLock');
    bumpMagicCount(s);
}
function onClickDoubleLock(s) {
    s.useLock += 2;
    spendMagic(s, calculateCost(s, costsOf(s).onClickDoubleLock), 'onClickDoubleLock');
    bumpMagicCount(s);
}
function onClickTripleLock(s) {
    s.useLock += 3;
    spendMagic(s, calculateCost(s, costsOf(s).onClickTripleLock), 'onClickTripleLock');
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
    spendMagic(s, calculateCost(s, costsOf(s).onClickToken, true), 'onClickToken');
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
    spendMagic(s, calculateCost(s, costsOf(s).onClickDoubleToken, true), 'onClickDoubleToken');
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
    spendMagic(s, calculateCost(s, costsOf(s).onClickBudsToken, true), 'onClickBudsToken');
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
    spendMagic(s, calculateCost(s, costsOf(s).onClickBothToken, true), 'onClickBothToken');
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
    spendMagic(s, calculateCost(s, costsOf(s).onClickSlash), 'onClickSlash');
    bumpMagicCount(s);
}
function onClickBackSlash(s) {
    for (const idx of geometryOf(s.size).mainDiagonal) if (!isGuarded(s, s.board[idx])) zeroBySkill(s, idx);
    spendMagic(s, calculateCost(s, costsOf(s).onClickBackSlash), 'onClickBackSlash');
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
    spendMagic(s, calculateCost(s, costsOf(s).onClickOpium), 'onClickOpium');
    bumpMagicCount(s);
    endTurn(s);
}
function onClickTsunami(s) {
    // 相手全員のマジックを0に
    for (const seat of otherSeats(s)) s.magic[seat] = 0;
    spendMagic(s, calculateCost(s, costsOf(s).onClickTsunami), 'onClickTsunami');
    s.useMagicCount[s.turn]++;
    endTurn(s);
}
function onClickWalpurgisNight(s) {
    let planted = 0;
    for (const sq of s.board) {
        if (sq.player && !sq.effects.some((e) => e.effect === '🔑')) { sq.effects.push({ effect: '🌱' }); planted++; }
    }
    harvestMagic(s, planted);
    spendMagic(s, calculateCost(s, costsOf(s).onClickWalpurgisNight), 'onClickWalpurgisNight');
    bumpMagicCount(s);
}

// yinYang
function onClickToggleYingYang(s) {
    // [FAITHFUL] note: source has a known bug toggling heart's mode when reading circle; we toggle the active player's own mode.
    s.yy[s.turn] = s.yy[s.turn] === 'yang' ? 'ying' : 'yang';
    spendMagic(s, gearCost(s, costsOf(s).onClickToggleYingYang), 'onClickToggleYingYang');
}
function onClickYingYangSkill(s) {
    applyYingYangDance(s, curYY(s));
    spendMagic(s, gearCost(s, costsOf(s).onClickYingYangSkill), 'onClickYingYangSkill');
}
function applyYingYangDance(s, mode) {
    const cur = curPlayer(s);
    let destroyed = 0;
    if (mode === 'yang') {
        for (const sq of s.board) if (sq.player === cur) sq.bind += 2;
    } else {
        // 凶荒の舞: 自分以外の全員のコマ
        for (let k = 0; k < s.board.length; k++) {
            const sq = s.board[k];
            if (!sq.player || sq.player === cur) continue;
            const hit = thermal.applyDamage(sq, 2, 'skill'); // 氷結なら解除だけ、🔥なら1.5倍
            if (hit.blocked) { s.board[k] = hit.sq; continue; }
            if (hit.sq.bind < 1) { s.board[k] = { player: undefined, bind: 0, effects: [] }; destroyed++; }
            else s.board[k] = hit.sq;
        }
    }
    addCorpses(s, destroyed);
}

// giant
function onClickStomp(s) {
    s.useStomp = true;
    spendMagic(s, gearCost(s, costsOf(s).onClickStomp), 'onClickStomp');
}
function exeStomp(s, i) {
    const cur = curPlayer(s);
    let destroyed = 0;
    for (const idx of geometryOf(s.size).stompRange(i)) {
        if (s.board[idx].player === cur) s.board[idx] = thermal.applyDamage(s.board[idx], 5, 'skill').sq; // 自陣は-5（氷結なら解除だけ・🔥は1.5倍）
        else {
            const guard = thermal.absorbDestroy(s.board[idx]);
            if (guard.blocked) { s.board[idx] = guard.sq; continue; } // 氷結が身代わりになる
            if (s.board[idx].player) destroyed++;
            s.board[idx] = { player: undefined, bind: 0, effects: [] };
        }
    }
    addCorpses(s, destroyed);
    if (s.board[i].player === undefined && !thermal.emptyBlocked(s.board[i])) s.board[i] = { player: cur, bind: s.life, effects: [] };
    s.useStomp = false;
}

// magician judge day
function judgeDayCost(s) {
    const used = s.useMagicCount[s.turn];
    const base = used < costsOf(s).onClickJudgeDay ? costsOf(s).onClickJudgeDay - used : 0;
    return gearCost(s, base);
}
function onClickJudgeDay(s) {
    spendMagic(s, judgeDayCost(s), 'onClickJudgeDay');
    s.useMagicCount[s.turn] = 0;
    s.useJudgeDay = true;
}
function exeJudgeDay(s, i) {
    const cur = curPlayer(s);
    let destroyed = 0;
    let centerSurvived = false;
    for (const idx of geometryOf(s.size).judgeRange(i)) {
        const sq = s.board[idx];
        const locked = sq.effects.some((e) => e.effect === '🔑');
        const protectedBud = sq.player === cur && sq.effects.some((e) => e.effect === '🌱');
        if (!locked || !protectedBud) {
            const guard = thermal.absorbDestroy(sq);
            if (guard.blocked) { s.board[idx] = guard.sq; if (idx === i) centerSurvived = true; continue; } // 氷結が身代わりになる
            if (s.board[idx].player) destroyed++;
            s.board[idx] = { player: undefined, bind: 0, effects: [] };
        }
    }
    addCorpses(s, destroyed);
    s.useMagicCount[s.turn] = 0;
    // 中心は自分のコマになる。ただし氷結が身代わりになって残った敵コマは奪えない
    if (!centerSurvived) s.board[i] = { player: cur, bind: 2, effects: [{ effect: '🌱' }] };
    s.useJudgeDay = false;
    endTurn(s);
}

function totalAssaultCost(s) {
    return gearCost(s, costsOf(s).onClickTotalAssault - s.useTokenCount[s.turn] * 2);
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
    spendMagic(s, calculateCost(s, costsOf(s).onClickProliferate), 'onClickProliferate');
    bumpMagicCount(s);
}

// necromancer: activate 蘇生 (墓地から召喚 + 4ターンの自動吸収窓)
function necromancyCost(s) {
    return s.necroCost[s.turn];
}
// 実際に払う魔力（ギア補正込み）。召喚数は墓地(necroCost)で決まり、ギアでは変わらない
function necromancyPay(s) {
    return gearCost(s, s.necroCost[s.turn]);
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
    spendMagic(s, gearCost(s, curCost), 'onClickNecromancy');
    s.useMagicCount[s.turn]++;
    s.remainNecro[s.turn] = necromancyDuration;
    s.necroCost[s.turn] = baseNecromancyCost;
}

// ---- 毒使い スキル ----
const MIASMA_MIN_COST = 1; // Game.tsx / skillCosts.ts と同値
// ミアズマの実コスト: 基礎 - 自陣の毒の数、毒使い割引(-1)、下限は MIASMA_MIN_COST
function miasmaCost(s) {
    return Math.max(MIASMA_MIN_COST, calculateCost(s, costsOf(s).onClickMiasma - poisonCountFor(s.board, curPlayer(s)), false, true));
}
// 自陣の毒が乗っているマスの周囲1マスにいる敵マス（ロック/守りは除く）→ 付与する毒の数。
// 毒マスごとに1つずつ付与する（重複あり: 毒マスが隣り合うほど同じ敵マスに積み上がる）
function miasmaPlan(s, me = curPlayer(s)) {
    const plan = new Map();
    s.board.forEach((sq, i) => {
        if (sq.player !== me || poisonStacks(sq) === 0) return; // 氷結中の毒は数えない
        for (const j of surroundRange(s, i)) {
            const t = s.board[j];
            if (t.player && t.player !== me && !isGuarded(s, t)) plan.set(j, (plan.get(j) || 0) + 1);
        }
    });
    return plan;
}
// 効果: 上の plan どおりに敵マスへ毒を付与し、自陣の毒はすべて消える。対象選択は無い
function exeMiasma(s) {
    const me = curPlayer(s);
    const plan = miasmaPlan(s, me);
    for (const [j, n] of plan) {
        for (let k = 0; k < n; k++) s.board[j].effects.push({ effect: '☠' });
        poisonStrike(s, s.board[j]);
    }
    for (const sq of s.board) if (sq.player === me && !thermal.isFrozen(sq)) sq.effects = sq.effects.filter((e) => e.effect !== '☠');
    harvestMagic(s, plan.size);
    if (plan.size) toxicBloom(s, null);
}
function onClickMiasma(s) {
    spendMagic(s, miasmaCost(s), 'onClickMiasma');
    exeMiasma(s);
}
function onClickInjection(s) {
    s.useInjection += 1;
    spendMagic(s, calculateCost(s, costsOf(s).onClickInjection, false, true), 'onClickInjection');
    bumpMagicCount(s);
}
function onClickPoisonToken(s) {
    const empties = findEmptyIndexes(s.board);
    let granted = 0;
    if (empties.length) {
        const idx = randomPick(empties, s.rng);
        s.board[idx] = { player: curPlayer(s), bind: Math.round(calculateTokenBind(s) * (curChar(s) === 'poisoner' ? POISON_MULT : 1)), effects: [{ effect: '☠' }] };
        granted = afterTokenPlaced(s, idx, '☠');
        toxicBloom(s, idx);
    }
    harvestMagic(s, granted);
    spendMagic(s, calculateCost(s, costsOf(s).onClickPoisonToken, true, true), 'onClickPoisonToken');
    bumpMagicCount(s);
    s.usedTokenThisTurn = true;
    s.useTokenCount[s.turn]++;
}
function onClickSerum(s) {
    const cur = curPlayer(s);
    for (const sq of s.board) if (sq.player === cur) sq.effects = sq.effects.filter((e) => e.effect !== '☠');
    spendMagic(s, calculateCost(s, costsOf(s).onClickSerum, false, true), 'onClickSerum');
    bumpMagicCount(s);
}
function onClickIntensify(s) {
    let added = 0;
    for (const sq of s.board) {
        const p = sq.effects.filter((e) => e.effect === '☠').length; // 氷結中の毒も倍にできる（付与は従来どおり）
        for (let k = 0; k < p; k++) sq.effects.push({ effect: '☠' });
        if (p > 0) poisonStrike(s, sq);
        added += p;
    }
    harvestMagic(s, added);
    if (added) toxicBloom(s, null);
    spendMagic(s, calculateCost(s, costsOf(s).onClickIntensify, false, true), 'onClickIntensify');
    bumpMagicCount(s);
}
function onClickPandemic(s) {
    s.usePandemic = true;
    spendMagic(s, calculateCost(s, costsOf(s).onClickPandemic, false, true), 'onClickPandemic');
    bumpMagicCount(s);
}
function exePandemic(s, i) {
    const targets = geometryOf(s.size).stompRange(i).filter((j) => s.board[j].player && !isGuarded(s, s.board[j]));
    for (const t of targets) { s.board[t].effects.push({ effect: '☠' }); poisonStrike(s, s.board[t]); }
    harvestMagic(s, targets.length);
    if (targets.length) toxicBloom(s, null);
    s.usePandemic = false;
}

// 毒霧 (idx 29): 盤上の全コマ（敵味方問わず。🔑ロック・無敵は除く）に毒を1付与する。対象選択なし [FAITHFUL] Game.tsx onClickPoisonMist
function onClickPoisonMist(s) {
    spendMagic(s, calculateCost(s, costsOf(s).onClickPoisonMist, false, true), 'onClickPoisonMist');
    bumpMagicCount(s);
    let n = 0;
    for (const sq of s.board) {
        if (!sq.player || isGuarded(s, sq)) continue;
        sq.effects.push({ effect: '☠' });
        poisonStrike(s, sq);
        n++;
    }
    harvestMagic(s, n);
    if (n) toxicBloom(s, null);
}

// ---- 雷霆の巫 スキル ----
function onClickChargeToken(s) {
    const empties = findEmptyIndexes(s.board);
    let granted = 0;
    if (empties.length) {
        const idx = randomPick(empties, s.rng);
        s.board[idx] = { player: curPlayer(s), bind: calculateTokenBind(s), effects: [{ effect: '⚡' }] };
        granted = afterTokenPlaced(s, idx, '⚡');
    }
    harvestMagic(s, granted);
    spendMagic(s, calculateCost(s, costsOf(s).onClickChargeToken, true), 'onClickChargeToken');
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
    for (const k of cells) s.board[k].effects.push({ effect: '⚡' });
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
        if (idx != null) s.board[idx] = { player: curPlayer(s), bind: calculateTokenBind(s), effects: [{ effect: '⚡' }] };
    }
    spendMagic(s, calculateCost(s, costsOf(s).onClickDoubleChargeToken, true), 'onClickDoubleChargeToken');
    bumpMagicCount(s);
    s.usedTokenThisTurn = true;
    s.useTokenCount[s.turn]++;
    bumpStat(s, 'doubleChargeToken');
    checkDischarge(s);
}
// 範囲帯電: 選んだマスを中心に3x3へ⚡を付与（発火はしない）
function onClickChargeArea(s) {
    s.useChargeArea = true;
    spendMagic(s, calculateCost(s, costsOf(s).onClickChargeArea), 'onClickChargeArea');
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
    spendMagic(s, calculateCost(s, costsOf(s).onClickChargeRandom), 'onClickChargeRandom');
    bumpMagicCount(s);
    bumpStat(s, 'chargeRandom');
    checkDischarge(s);
}
// ジャマー: 選んだマスの⚡を発散。縦横に隣接する**敵**コマ(ライフ>0・ロックなし)に⚡のスタック数だけダメージ、⚡は消える
function onClickJammer(s) {
    s.useJammer = true;
    spendMagic(s, calculateCost(s, costsOf(s).onClickJammer), 'onClickJammer');
    bumpMagicCount(s);
    bumpStat(s, 'jammer');
}
function exeJammer(s, i) {
    const cur = curPlayer(s);
    const stacks = chargeStacks(s.board[i]);
    for (const j of orthoNeighbors(i, s.size)) {
        const sq = s.board[j];
        if (!sq.player || sq.player === cur || sq.bind <= 0) continue;
        if (sq.effects.some((e) => e.effect === '🔑') || thermal.isFrozen(sq)) continue; // ロックは貫通しない・氷結中は電気を受けない
        const before = sq.bind;
        s.board[j] = thermal.applyDamage(sq, stacks, 'electric').sq; // ジャマーの電気も氷結を貫通する
        bumpStat(s, 'jammerDmg', before - s.board[j].bind);
        if (s.board[j].bind === 0) bumpStat(s, 'jammerZeroed');
    }
    s.board[i].effects = s.board[i].effects.filter((e) => e.effect !== '⚡');
    s.useJammer = false;
}

// ヘイルメアリー (idx 27): 陰陽転化を除く固有スキルを追加コストなしでランダム発動 [FAITHFUL] Game.tsx onClickHailMary
// 対象選択が要るもの(ストンプ/審判の日/帯電拡散)は use* フラグを立てるだけ。ミアズマは対象選択が無いのでその場で発動。対象クリックは呼び出し側(AI)の責任
function onClickHailMary(s) {
    spendMagic(s, calculateCost(s, costsOf(s).onClickHailMary), 'onClickHailMary');
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
        () => exeMiasma(s),
        () => { s.useChargeSpread = true; },
    ];
    choices[Math.floor(s.rng() * choices.length)]();
}

// サイレンス (idx 28): 自分以外の全席を次の手番スキル禁止にする [FAITHFUL] Game.tsx onClickSilence
function onClickSilence(s) {
    otherSeats(s).forEach((seat) => { s.silenced[seat] = true; });
    spendMagic(s, calculateCost(s, costsOf(s).onClickSilence), 'onClickSilence');
}

// ---- 氷結・火炎 (src/components/game/thermal.ts) ----
// 氷結 (idx 30): 選んだコマに❄。火炎付与 (idx 31): 選んだコマに🔥（そのマスと縦横隣の氷結は解ける）
function onClickFreeze(s) {
    s.useFreeze = true;
    spendMagic(s, calculateCost(s, costsOf(s).onClickFreeze), 'onClickFreeze');
    bumpMagicCount(s);
    bumpStat(s, 'freeze');
}
function onClickIgnite(s) {
    s.useIgnite = true;
    spendMagic(s, calculateCost(s, costsOf(s).onClickIgnite), 'onClickIgnite');
    bumpMagicCount(s);
    bumpStat(s, 'ignite');
}
// 氷室の番人の固有スキル 氷河期: 自陣のライフが残るコマすべてに❄（クリック不要・ターン継続）
// 絶対零度（氷室の番人）: 全マスに❄を足し、次の自分の手番開始時に敵の❄マスを爆破する。
// 氷結スキルで❄が作られるたび（誰が使っても）全席のカウンタが+1され、実コスト=max(1, calc(10−カウンタ))。撃った席のカウンタは0に戻る
function glacierCost(s, seat = s.turn) {
    return Math.max(1, calculateCost(s, costsOf(s).onClickGlacier - s.glacierCharge[seat]));
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
    spendMagic(s, calculateCost(s, costsOf(s).onClickHarvestEve), 'onClickHarvestEve');
    s.magic[s.turn] += n;
    bumpMagicCount(s);
    bumpStat(s, 'harvestEve');
    bumpStat(s, 'harvestEveBuds', n);
}
// 冬至の種子 (idx 34): 自分に🌱ガードを付ける（次の自分の手番開始まで自陣の🌱が休眠しない）。ガード中の再使用は不可
function onClickSolstice(s) {
    if (s.budGuard[s.turn]) return;
    s.budGuard[s.turn] = true;
    spendMagic(s, calculateCost(s, costsOf(s).onClickSolstice), 'onClickSolstice');
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
    spendMagic(s, calculateCost(s, costsOf(s).onClickSucker), 'onClickSucker');
    bumpMagicCount(s);
    bumpStat(s, 'sucker');
}
// 風の落とし子 (idx 36): 自陣の🌱を持てるコマから重複を許してランダムに3回選び、🌱を1つずつ足す
function onClickWindborne(s) {
    const cands = thermal.sowCandidates(s.board, curPlayer(s));
    if (!cands.length) return;
    const picks = [0, 1, 2].map(() => randomPick(cands, s.rng));
    thermal.sow(s.board, picks);
    spendMagic(s, calculateCost(s, costsOf(s).onClickWindborne), 'onClickWindborne');
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
    spendMagic(s, calculateCost(s, costsOf(s).onClickFrostArea), 'onClickFrostArea');
    bumpMagicCount(s);
    bumpStat(s, 'frostArea');
}
function exeFrostArea(s, i) {
    bumpStat(s, 'frostAreaCells', freezeCells(s, geometryOf(s.size).stompRange(i)));
}
// 氷柱 (idx42): マスと方向を選び、その線（盤の端から端まで）の canFreeze なマス全部に❄+1
function onClickIcicle(s) {
    s.useIcicle = true;
    spendMagic(s, calculateCost(s, costsOf(s).onClickIcicle), 'onClickIcicle');
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
    spendMagic(s, calculateCost(s, costsOf(s).onClickRandomFreeze), 'onClickRandomFreeze');
    bumpMagicCount(s);
    bumpStat(s, 'randomFreeze');
}
// 氷結拡散 (idx44): コマを選ぶと、コマのあるマスだけを縦横に辿って届く全コマ（敵味方問わず）の canFreeze なマスに❄+1
function onClickFreezeSpread(s) {
    s.useFrostSpread = true;
    spendMagic(s, calculateCost(s, costsOf(s).onClickFreezeSpread), 'onClickFreezeSpread');
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
    spendMagic(s, calculateCost(s, costsOf(s)[costKey], true), costKey);
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
    spendMagic(s, calculateCost(s, costsOf(s).onClickShatter), 'onClickShatter');
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
    spendMagic(s, calculateCost(s, costsOf(s).onClickFrostfall), 'onClickFrostfall');
    bumpMagicCount(s);
    bumpStat(s, 'frostfall');
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
    spendMagic(s, calculateCost(s, costsOf(s).onClickFlameToken, true), 'onClickFlameToken');
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
    spendMagic(s, calculateCost(s, costsOf(s).onClickDoubleFlameToken, true), 'onClickDoubleFlameToken');
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
    spendMagic(s, calculateCost(s, costsOf(s).onClickSwidden), 'onClickSwidden');
    bumpMagicCount(s);
    bumpStat(s, 'swidden');
}
// 殉火 (idx40・仮名): 自コマ（ライフ>0・🔑なし）を選ぶと、そのライフをゼロにして、ライフがそれ以下の敵コマ全てに🔥を1つ。対象の敵が0なら使えない
function sacrificeCandidates(s) {
    const me = curPlayer(s);
    const out = [];
    s.board.forEach((sq, i) => {
        if (sq.player === me && sq.bind > 0 && !sq.effects.some((e) => e.effect === '🔑') && thermal.sacrificeTargets(s.board, i, me, s.size, (t) => isShielded(s, t)).length > 0) out.push(i);
    });
    return out;
}
function exeSacrifice(s, i) {
    if (!sacrificeCandidates(s).includes(i)) return false;
    const r = thermal.sacrificeFlame(s.board, i, curPlayer(s), s.size, (t) => isShielded(s, t), keepBudsOf(s));
    bumpStat(s, 'sacrificeTargets', r.targets.length);
    return true;
}
function onClickSacrifice(s) {
    if (sacrificeCandidates(s).length === 0) return;
    s.useSacrifice = true;
    spendMagic(s, calculateCost(s, costsOf(s).onClickSacrifice), 'onClickSacrifice');
    bumpMagicCount(s);
    bumpStat(s, 'sacrifice');
}

function onClickCleanse(s) {
    if (!hasAilment(s.board, curPlayer(s))) return;
    const done = thermal.cleanse(s.board, curPlayer(s));
    spendMagic(s, calculateCost(s, costsOf(s).onClickCleanse), 'onClickCleanse');
    bumpMagicCount(s);
    bumpStat(s, 'cleanse');
    bumpStat(s, 'cleanseCells', done.length);
}
function infernoTargets(s) {
    return thermal.infernoTargets(s.board, curPlayer(s)).filter((k) => !isShielded(s, s.board[k]));
}
/** 冬至の種子のガード中の席のコマは、🔥が付いても🌱が消えない */
function keepBudsOf(s) {
    return (sq) => !!sq.player && !!s.budGuard[seatOf(sq.player)];
}
// 業火の実コスト: 無料権があれば0、なければ calc(基礎)。無料権は1手番に異なる種類のスキルを INFERNO_FREE_SKILLS(3) 種類使うと付き、手番を跨いで持ち越し、撃つと消える
const INFERNO_FREE_SKILLS = 3;
function infernoCost(s, seat = s.turn) {
    return s.infernoReady[seat] ? 0 : calculateCost(s, costsOf(s).onClickInferno);
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
    freeze: onClickFreeze,
    ignite: onClickIgnite,
    glacier: onClickGlacier,
    cleanse: onClickCleanse,
    harvestEve: onClickHarvestEve,
    flameToken: onClickFlameToken,
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
    spendMagic, HEART, CIRCLE, SYMBOLS, MAX_PLAYERS, seatOf, boardSizeFor, DECAY_PER_ROUND_MIN_PLAYERS, CHARACTERS, skillCosts, SKILLS,
    makeRng, normRand, calculateLife, calculateWinner, findEmptyIndexes,
    newGame, placeMove, advanceTurn, judgeNextSeat, judgeNextIsHeart, shouldDecay, lateMagicBonus, renderBoard,
    curPlayer, curChar, curMagic, symbolOfSeat, seatCount, otherSeats, symbolsOf, calculateCost, judgeDayCost, totalAssaultCost, necromancyCost, reshuffleSkillsFor,
    miasmaCost, miasmaPlan, boardPoisonCount, surroundRange, costsOf, gearCost, necromancyPay,
    PROLIFERATE, proliferateUpkeep,
    POOL_SIZE, shatterTargets, exeIcicle, swiddenTargets, sacrificeCandidates, suckerTargets, bestSuckerTarget, ownBuds, infernoTargets, hasAilment, glacierCost, infernoCost, INFERNO_FREE_SKILLS, FIRE_DAMAGE, CHARGE_MIN_COST, boardChargeCount, chargeOneCost, chargeSpreadCost, chargeStacks, orthoNeighbors, isShielded, isGuarded, connectedPieces, charOfPlayer,
};
