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
const { boardSizeFor, geometryOf, geometryForCells, lineCells } = require('./geometry');
const gear = require('./gear');
const deckMod = require('./deck');
const discountMod = require('./discount');
const comboMod = require('./comboCost');
const lifeBanMod = require('./lifeBan');
const darkPotMod = require('./darkPot');
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
const SHIKIGAMI_LIFE = 2;
const SHIKIGAMI_BLAST_DAMAGE = 4; // 式神のライフ
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
    const lines = geometryForCells(symbols.length).winLines;
    for (let l = 0; l < lines.length; l++) {
        const line = lines[l];
        const first = symbols[line[0]];
        if (!first) continue;
        let all = true;
        for (let k = 1; k < line.length; k++) if (symbols[line[k]] !== first) { all = false; break; }
        if (all) return first;
    }
    return undefined;
}

const hasKeyEffect = (sq) => { const ef = sq.effects; for (let i = 0; i < ef.length; i++) if (ef[i].effect === '🔑') return true; return false; };
function findEmptyIndexes(board) {
    const out = [];
    for (let i = 0; i < board.length; i++) {
        const sq = board[i];
        if (sq.player === undefined && !hasKeyEffect(sq) && !thermal.emptyBlocked(sq)) out.push(i);
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
    onClickShikigamiPlace: 2, // 陰: 任意の空きマスに式神を置く
    onClickShikigamiBlast: 4, // 陽: 自分の式神を1つ選んで爆破
    onClickShikigamiAll: 2, // 汎用: 自分の式神を全て通常の自陣コマにする。コストは式神1体あたり
    onClickShikigamiRandom: 2, // 汎用(トークン扱い): 式神をランダムな空きマスに置く
    onClickShikigamiFlood: 7, // 汎用(百鬼夜行): 全ての空きマスにライフ0の式神を置く
    onClickShikigamiBless: 5, // 汎用(idx 88 式神の加護): 自分の式神を1体消費して、自陣のコマ全てのライフ+3
    onClickShikigamiPurge: 5, // 汎用(idx 91 式神の供犠): 自陣の式神が3体以上なら0コスト。自陣の式神をランダムに1体壊し、敵のコマ1体のライフを0にする
    onClickShikigamiCurse: 5, // 汎用(idx 89 式神の呪詛): 自分の式神を1体消費して、エフェクトが乗っている敵のコマ全てに☠を2つ
    onClickShikigamiDiscount: 2, // 汎用(idx 90 式神割引): 次に打つスキルのコストを 2＋盤面の式神の数 だけ軽減
    onClickStomp: 3,
    onClickJudgeDay: 11,
    onClickCharge: 3,
    onClickAddLife: 3,
    onClickDepressionCherry: 1,
    onClickShuffle: 1,
    onClickBibine: 4,
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
    onClickDoubleChargeToken: (config.charge && config.charge.doubleTokenCost) || 5,
    onClickChargeArea: (config.charge && config.charge.areaCost) || 5,
    onClickChargeRandom: (config.charge && config.charge.randomCost) || 3,
    onClickJammer: (config.charge && config.charge.jammerCost) || 4,
    onClickHailMary: 6, // idx 27
    onClickSilence: 5, // idx 28
    onClickPoisonMist: 6, // idx 29
    // ❄氷結・🔥火炎。氷結/火炎付与は汎用プール(idx 30/31)、氷河期は氷室の番人・フレアバーストは煉獄の鍛冶師の固有スキル
    onClickFreeze: (config.thermal && config.thermal.freezeCost) || 3,
    onClickIgnite: (config.thermal && config.thermal.igniteCost) || 3,
    onClickGlacier: (config.thermal && config.thermal.glacierCost) || 10,
    onClickCryoFreeze: (config.thermal && config.thermal.cryoFreezeCost) || 2, // 氷室の番人のロック置換
    onClickCleanse: (config.thermal && config.thermal.cleanseCost) || 5, // idx 32
    onClickInferno: (config.thermal && config.thermal.infernoCost) || 9,
    onClickMogaribue: 7, // 凩の魔女の固有スキル 虎落笛。src/components/game/skillCosts.ts と一致させること
    // 🌱バッズ系の汎用スキル idx 33〜36
    onClickHarvestEve: (config.thermal && config.thermal.harvestEveCost) || 2,
    onClickSolstice: (config.thermal && config.thermal.solsticeCost) || 4,
    onClickSucker: (config.thermal && config.thermal.suckerCost) || 4,
    onClickWindborne: (config.thermal && config.thermal.windborneCost) || 4,
    // 火炎系の汎用スキル idx 37〜40（対氷結の手段）
    onClickFlameToken: (config.thermal && config.thermal.flameTokenCost) || 3,
    onClickDoubleFlameToken: (config.thermal && config.thermal.flameDoubleTokenCost) || 5,
    onClickSwidden: (config.thermal && config.thermal.swiddenCost) || 3,
    onClickSacrifice: (config.thermal && config.thermal.sacrificeCost) || 5,
    // 氷結スキル群 idx 41〜48
    onClickFrostArea: (config.thermal && config.thermal.frostAreaCost) || 5,
    onClickIcicle: (config.thermal && config.thermal.icicleCost) || 6,
    onClickRandomFreeze: (config.thermal && config.thermal.randomFreezeCost) || 3,
    onClickFreezeSpread: (config.thermal && config.thermal.freezeSpreadCost) || 7,
    onClickFrostToken: (config.thermal && config.thermal.frostTokenCost) || 3,
    onClickDoubleFrostToken: (config.thermal && config.thermal.doubleFrostTokenCost) || 5,
    onClickShatter: (config.thermal && config.thermal.shatterCost) || 4,
    onClickFrostfall: (config.thermal && config.thermal.frostfallCost) || 3,
    // 汎用スキル(idx 49-52)。コスト表のキー順をブラウザ版と揃える（sim 側のスキル実装は未対応）
    onClickBoost: 4,
    onClickRelocate: 3,
    onClickClone: 4,
    onClickPlunder: 5,
    // コスト軽減スキル(idx 53-58)。discount.ts
    onClickMarkdown: 1,
    onClickEffectDiscount: 1,
    onClickTokenDiscount: 1,
    onClickVitalMarkdown: 2,
    onClickUniqueDiscount: 3,
    onClickClearance: 4,
    onClickRandomCast: 2, // 福引き(idx 59)
    onClickCounterMarkdown: 2, // 返し特売(idx 60)。直前の相手の手番に相手がスキルを使っていれば0
    onClickBurnout: 5, // バーンアウト(idx 61)。盤面に🔥が4つ以上あれば0
    // 🍂落ち葉系の汎用スキル(idx 62-68)。src/components/game/skillCosts.ts と同値
    onClickLeafToken: 3,
    onClickTwinLeafToken: 7,
    onClickDoubleLeafToken: 9,
    onClickLeafAll: 5, // 枯野の相席(idx 65): 盤面の全てのコマに🍂
    onClickBonfire: 3,
    onClickMulch: 2,
    onClickAutumn: 4,
    onClickLeafFrost: 3, // 霜枯れ(idx 69)
    onClickSpringWind: 2, // 春一番(idx 70)
    onClickKimon: 6, // 鬼門封じ(idx 74)
    onClickFireWheel: 5, // 火の車(idx 75)。このターン敵か自陣に🔥を付与していれば0（撃つとリセット）
    onClickStrip: 4, // 裸の王様(idx 76)
    onClickChargeSeason: 7, // 静電気の季節(idx 77)
    onClickBristle: 6, // 総毛立つ(idx 78)
    onClickRelease: 5, // 落雷は忘れた頃に(idx 79)
    onClickStash: 1, // 雷神のへそくり(idx 80)
    onClickThunderFire: 7, // 雷のない所に火は立たぬ(idx 81)
    onClickDarkPot: 9, // 一寸先は闇鍋(idx 82)。盤面のエフェクトの数だけ軽減（最低1）
    onClickChargeHeal: 6, // 雷を食らわば皿まで(idx 83)。この手番に付与した⚡の数だけ軽減（最低1）
    onClickLeafDrop: 1, // 落ち葉の置き土産(idx 84)
    onClickKindling: 5, // 焚きつけ(idx 85)
    onClickLeafCloak: 3, // 落葉の衣(idx 86)
    onClickTinder: 2, // 火口(idx 87): 🌱か🍂のある敵コマ1つに🔥を1つ付ける（鍛冶師は🔥付与で-1）
    onClickSmallFry: 10, // 一寸の虫に魂なし(idx 92)。盤面のコマの数だけ軽減（最低1）
    onClickFirstFrost: 6, // 初霜(idx 93)。トークン扱い。盤面の🍂（効力のあるもの）が3枚以上なら0
    onClickGather: 8, // 吹き寄せ(idx 94)。トークン扱い。エフェクト1つにつき2軽減（氷結のマスは❄だけ・ロックのマスは数えない。最低1）
    onClickBurnOff: 9, // 山焼き(idx 95)。トークン扱い。エフェクト1つにつき3軽減（氷結のマスは❄だけ・ロックのマスは数えない。最低1）
    onClickFreeToken: 4, // 無礼講(idx 96)。このターン、トークン系スキルのコストを0にする
};
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
    toxicBloom(s, [t]);
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
    return Math.max(CHARGE_MIN_COST, calculateCost(s, costsOf(s).onClickChargeOne - boardChargeCount(s.board), false, false, 'onClickChargeOne'));
}
function chargeSpreadCost(s) {
    return Math.max(CHARGE_MIN_COST, calculateCost(s, costsOf(s).onClickChargeSpread - boardChargeCount(s.board), false, false, 'onClickChargeSpread'));
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
// 純粋版: すでに⚡が乗ったマス sq に「乗った時点のダメージ」をかけたマスを返す。ライフ0・🔑・氷結中・空きマス・雷霆の巫は受けない
function landedCharge(chars, sq) {
    if (!sq.player || sq.bind <= 0 || sq.effects.some((e) => e.effect === '🔑') || chars[seatOf(sq.player)] === 'electrician') return sq;
    return thermal.applyDamage(sq, CHARGE_LANDING_DAMAGE, 'electric').sq;
}
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
            board[n] = thermal.applyDamage(sq, FIRE_DAMAGE, 'electric').sq; // 隣接⚡のダメージは氷結中のマスには通らない。🔥は消えない（帯電と火炎は重複する）
            // 雷霆の巫視点: 雷霆の巫の駒が受けた被害 / それ以外の駒に与えた被害
            bumpStat(s, charOfPlayer(s, sq.player) === 'electrician' ? 'dmgToElectrician' : 'dmgToOther');
            // 帯電していたコマの毒・火炎を、ダメージを受けた敵のマスへ1スタック移す
            const owner = board[k].player;
            if (owner && sq.player !== owner && hasGear(s.gears[seatOf(owner)], 'conduction')) {
                if (board[k].effects.some((e) => e.effect === '☠')) board[n] = { ...board[n], effects: [...board[n].effects, { effect: '☠' }] };
                if (board[k].effects.some((e) => e.effect === '🔥')) thermal.ignite(board, [n], s.size);
            }
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
        priceTables: gears.map((g) => (hasGear(g, 'priceWreck') ? gear.applyPriceOffsets(skillCosts, gear.rollPriceOffsets(skillCosts, rng)) : null)),
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
        useStash: false,
        useThunderFire: false,
        leafBase: fill(0), // 手番開始時点の自陣の🍂の総数（紅葉狩りの導線）
        tokenFree: fill(false), // 無礼講: この手番、トークン系スキルのコストが0
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
    state.life = Math.max(1, calculateLife(chars[0], state.yy[0], rng, gear.gearLifeBonus(gears[0]), gear.gearLifeStd(gears[0], config.lifeStd)));
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
const isShikigami = (sq) => { const ef = sq.effects; for (let i = 0; i < ef.length; i++) if (ef[i].effect === '📜') return true; return false; };
const newShikigami = (player, bind = SHIKIGAMI_LIFE) => ({ player, bind, effects: [{ effect: '📜' }] });
const symbolsOf = (board) => board.map((x) => (isShikigami(x) ? undefined : x.player));
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
    if (s.gearOff && s.gearOff[seat]) return skillCosts; // 裸の王様: 価格破壊も無効
    return s.priceTables[seat] || skillCosts;
}
function gearCtx(s, seat) {
    return {
        skillsThisTurn: s.gearSkills[seat],
        echoReady: s.echoReady[seat],
        ailments: hasGear(s.gears[seat], 'ailmentPact') ? gear.countAilmentKinds(s.board, SYMBOLS[seat]) : 0,
        ruin: s.ruinActive[seat],
        ash: hasGear(s.gears[seat], 'ashOffering') ? s.ashActive[seat] : 0,
    };
}
/** キャラ補正済みのコストにギアの補正を掛ける */
// withLeaf: 敵の🍂の増加分を、ギアの補正・割引より先に足す（増加分→減少分の順）。calculateCost は characterCost の中で足し済みなので false で呼ぶ
// 式神を置くスキル（陰陽師のパッシブ: 置いた手番の全スキル-1。置くスキル自身も安い）
const SHIKIGAMI_PLACING_KEYS = new Set(['onClickShikigamiPlace', 'onClickShikigamiRandom', 'onClickShikigamiFlood']);
function gearCost(s, cost, isToken = false, seat = s.turn, key, withLeaf = true) {
    const leafAdd = withLeaf ? thermal.leafSurcharge(s.board, SYMBOLS[seat]) : 0; // 🍂落ち葉: 他の席のコマに乗っている🍂の枚数ぶん、スキルコストが上がる（上限なし）
    const cut = seat === s.turn ? comboMod.comboCut(key, s.board, SYMBOLS[seat], s.leafBase[seat], s.skillKinds[seat], s.chargeBase[seat]) : 0; // 導線（コンボ）による軽減
    let adjusted = Math.max(comboMod.comboFloor(key), gear.adjustCostByGear(cost + leafAdd, s.gears[seat], gearCtx(s, seat), isToken, key) - cut); // カウント型の導線は下限1
    // 陰陽師のパッシブ: 式神を置く手番は、全スキル（陰陽転化・式神設置/爆破を含む）のコスト-1（下限1）。置くスキル自身も-1。Game.tsx gearCost と同値
    if (seat === s.turn && s.chars[seat] === 'yinYangMaster' && (s.shikiPlaced[seat] || SHIKIGAMI_PLACING_KEYS.has(key)) && adjusted > 1) adjusted -= 1;
    if (key === 'onClickShikigamiPurge' && seat === s.turn && ownShikigamiCells(s).length >= SHIKIGAMI_PURGE_FREE) return 0; // 供犠: 自陣の式神が3体以上なら0
    if (key === 'onClickCounterMarkdown' && s.oppSkillPrev[seat]) return 0; // 返し特売: 直前に相手がスキルを使っていれば0
    if (isToken && seat === s.turn && s.tokenFree[seat]) return 0; // 無礼講: この手番、トークン系スキルのコストは0
    if (key === 'onClickFirstFrost' && seat === s.turn && thermal.boardLeaves(s.board) >= FIRST_FROST_FREE_LEAVES) return 0; // 初霜: 盤面の🍂が3枚以上なら0
    if (key === 'onClickFireWheel' && seat === s.turn && thermal.fireStacksTotal(s.board) > s.fireBase[seat]) return 0; // 火の車: このターン敵か自陣に🔥を付与していれば0
    // コスト軽減スキル（手番内だけ有効なので手番でない席には掛けない）
    const discounted = seat === s.turn ? discountMod.applyDiscount(adjusted, discountMod.discountAmount(s.discount[seat], key, isToken)) : adjusted;
    return discounted;
}
// 術中の加護: スキルを使った手番の間、装備した席のコマは効果(☠🔥⚡)のダメージを受けない。thermal の述語を、この試合の状態で差し込む
function armWard(s) {
    thermal.setEffectWard((sq) => hasGear(s.gears[SYMBOLS.indexOf(sq.player)], 'spellWard') && s.gearSkills[s.turn] > 0);
}
/** スキルを1回使ったことを記録する（四連の極意・連鎖割引・余韻の入力） */
function noteSkillUsed(s) {
    armWard(s);
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
    if (skillId) {
        s.discount[s.turn] = discountMod.afterSkill(s.discount[s.turn], skillId);
        s.oppSkilled = s.oppSkilled.map((v, i) => (i === s.turn ? v : true));
    }
    // 業火の無料権: 異なる種類のスキルを INFERNO_FREE_SKILLS 種類使うと付く（同じスキルの連打は1種類。業火自身は数えない）
    if (skillId && skillId !== 'onClickInferno') {
        s.skillKinds[s.turn].add(skillId);
        if (s.skillKinds[s.turn].size >= INFERNO_FREE_SKILLS) s.infernoReady[s.turn] = true;
    }
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

// [FAITHFUL] Game.tsx calculateCost
function characterCost(s, baseCost, isToken, isPoison, key) {
    const c = curChar(s);
    // 敵の🍂による増加分を先に足す（キャラの減少分・割引はそのあと）
    const cost = baseCost + thermal.leafSurcharge(s.board, curPlayer(s));
    // 煉獄の鍛冶師: 🔥を付与するスキルは常に-1（下限1）
    if (c === 'pyromancer') return key && thermal.FLAME_SKILL_KEYS.has(key) && cost > 1 ? cost - 1 : cost;
    // 凩の魔女: 盤面にある🍂（敵味方問わず・効力のあるもの）の枚数ぶん、スキルコスト-1（下限1）
    if (c === 'witch') return thermal.witchCostOf(cost, s.board);
    // 毒使い: 毒系スキルは-1、それ以外は+1
    if (c === 'poisoner') return isPoison ? cost - 1 : cost + 1;
    if (c === 'tactician') return isToken ? cost - 1 : cost + 2;
    if (c === 'yinYangMaster' && curYY(s) === 'yang') return cost + 1;
    return cost;
}
function calculateCost(s, cost, isToken = false, isPoison = false, key) {
    return gearCost(s, characterCost(s, cost, isToken, isPoison, key), isToken, s.turn, key, false);
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

// 次の手番の席 (Game.tsx judgeNextSeat = src/components/game/giantTurn.ts seatForTurn と同じ並び)
// 巨人は giantActEvery ラウンドに1回しか動かない: 「全員1周 → 巨人を除いて (giantActEvery-1) 周」の繰り返し。
// 並びは currentTurn と直前の席で決まる。2人戦で同キャラ(巨人ミラー含む)は休みなしで交互に回す
function judgeNextSeat(s) {
    const n = seatCount(s);
    if (s.currentTurn <= 1) return 0;
    const base = (s.turn + 1) % n; // 並びとずれているとき（途中から始めた盤など）も席順どおり次の席
    const actEvery = config.giantActEvery || 1;
    const mirror = n === 2 && s.chars[0] === s.chars[1];
    const others = [];
    for (let seat = 0; seat < n; seat++) if (s.chars[seat] !== 'giant') others.push(seat);
    if (mirror || actEvery <= 1 || others.length === n || others.length === 0) return base;
    const cycle = [];
    for (let seat = 0; seat < n; seat++) cycle.push(seat);
    for (let k = 1; k < actEvery; k++) cycle.push(...others);
    if (cycle[(s.currentTurn - 2) % cycle.length] !== s.turn) return base;
    return cycle[(s.currentTurn - 1) % cycle.length];
}
// 2人戦互換: 次が席0(heart)か
function judgeNextIsHeart(s) {
    return judgeNextSeat(s) === 0;
}

// 廃墟の底力: 手番中にスキルかエフェクトで自陣のコマが盤から無くなった（持ち主が変わった）席を記録する
function ruinDetect(s) {
    if (!s.snapOwners) return;
    const after = s.board.map((sq) => sq.player);
    s.gears.forEach((g, seat) => {
        if (!hasGear(g, 'ruinSurge')) return;
        if (gear.lostCells(s.snapOwners, after, SYMBOLS[seat], s.lastMoveCell).length > 0) {
            s.ruinPending[seat] = true;
            bumpStat(s, 'ruinTriggered');
        }
    });
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
function advanceTurn(s) {
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
    const magicCharacter = ['magician', 'cryomancer', 'witch']; // 凩の魔女も+1（魔力が律速。ユーザー指示。ライフ平均-1とセット）。 氷室の番人も+1（issue #94。tune-top 上限実験: 毎ターン+1で環境勝率 42.7→61.7%）
    // 廃墟の底力: 終わる手番の間に自陣が破壊されていたら、次の自分の手番から割引。終わる席の割引はここで切れる
    ruinDetect(s);
    // 焦土: 終わる手番の間に敵の🌱が🔥で消えていたら魔力
    let scorchForNext = 0;
    if (s.snapOwners && s.snapBuds) {
        s.gears.forEach((g, seat) => {
            if (!hasGear(g, 'scorchedEarth')) return;
            const gain = gear.scorchGain(gear.burnedBudCount(s.snapOwners, s.snapBuds, s.board, SYMBOLS[seat]));
            if (gain <= 0) return;
            if (seat === next) scorchForNext = gain;
            else s.magic[seat] += gain;
            bumpStat(s, 'scorchedEarth', gain);
        });
    }
    // 灰の供物: この手番に敵のマスへ🔥を付与した数だけ、次の自分の手番の終わりまで割引。終わる席の割引はここで切れる
    if (s.snapOwners && s.snapFlames && hasGear(s.gears[s.turn], 'ashOffering')) {
        const n = gear.ignitedCount(s.snapOwners, s.snapFlames, s.board, SYMBOLS[s.turn]);
        if (n > 0) { s.ashPending[s.turn] += n; bumpStat(s, 'ashOffering', n); }
    }
    s.ashActive[s.turn] = 0;
    s.ashActive[next] = s.ashPending[next];
    s.ashPending[next] = 0;
    s.ruinActive[s.turn] = false;
    s.ruinActive[next] = s.ruinPending[next];
    s.ruinPending[next] = false;
    // Game.tsx と同じく次の手番の席自身の魔力・バッズから計算する
    let nextMagic = s.magic[next] + 1 + lateMagicBonus(s.currentTurn, seatCount(s)) + budsCount(s.board, sym, s.budGuard[next]);
    if (magicCharacter.includes(ch)) nextMagic++;
    if (ch === 'yinYangMaster' && s.yy[next] === 'ying') nextMagic++;
    // 魔法使い: 自陣のバッズ1つにつき魔力回復+3 (標準+1に追加+2)
    if (ch === 'magician') nextMagic += budsCount(s.board, sym, s.budGuard[next]) * 2;
    // 彩りの庭: エフェクトが2種類以上あるマス1つにつき+1。土壇場の防壁: 発動後は相手の手番開始時に+2
    if (hasGear(s.gears[next], 'colorGarden')) nextMagic += gear.countVarietySquares(s.board, sym) * GP.varietyMagic;
    if (lastStandActiveAgainst(s, next)) nextMagic += GP.lastStandMagic;
    // 焦土(上で計算)と凍てつく根: 氷結で休眠した🌱(敵味方問わず)1つにつき+1
    nextMagic += scorchForNext;
    if (hasGear(s.gears[next], 'frostRoot')) {
        const root = gear.rootGain(gear.frozenBudCount(s.board));
        nextMagic += root;
        if (root > 0) bumpStat(s, 'frostRoot', root);
    }
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
    s.life = calculateLife(ch, s.yy[next], s.rng, (ch === 'poisoner' ? poisonCountFor(s.board, sym) : 0) + gear.gearLifeBonus(s.gears[next]) + (lastStandActiveAgainst(s, next) ? GP.lastStandLife : 0), gear.gearLifeStd(s.gears[next], config.lifeStd));
    if (s.life <= 0) s.life = 1;
    s.usedTokenThisTurn = false;
    // ギア: 新しい手番のスキル使用数をリセットし、余韻を引き継ぐ
    s.gearSkills[next] = 0;
    s.skillKinds[next] = new Set();
    s.discount[next] = discountMod.emptyDiscount();
    s.oppSkillPrev[next] = s.oppSkilled[next];
    s.fireBase[next] = thermal.fireStacksTotal(s.board);
    s.shikiPlaced[next] = false;
    s.leafBase[next] = comboMod.ownLeaves(s.board, SYMBOLS[next]);
    s.darkPotUsed[next] = false;
    s.chargeBase[next] = comboMod.ownCharges(s.board, SYMBOLS[next]);
    s.oppSkilled[next] = false;
    s.echoReady[next] = s.echoNext[next];
    s.echoNext[next] = false;
    s.snapOwners = s.board.map((sq) => sq.player);
    s.snapBuds = gear.budCounts(s.board);
    s.snapFlames = gear.flameCounts(s.board);
    s.lastMoveCell = null;
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
        // 陰: 任意の空きマスに式神を置く。埋まっている/氷結中の空きマスは選び直せる
        if (board[i].player || thermal.emptyBlocked(board[i])) return false;
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
        if (board[i].bind > 0 && curChar(s) !== 'giant') return false; // can't attack a bound enemy unless giant
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
    for (let k = 0; decayNow && k < board.length; k++) {
        const sq = board[k];
        // ❄氷結中のマスはターン進行でライフが減らない（自然減衰・🔥の継続ダメージとも）
        if ((sq.player || sq.effects.some((e) => e.effect === '🔑')) && sq.bind > 0 && !thermal.isFrozen(sq)) sq.bind--;
        // 🔥火炎: スタック×2の継続ダメージ（🔥自体は消えない）
        const burn = thermal.burnDamageOf(sq, s.chars, SYMBOLS);
        if (burn > 0) sq.bind = Math.max(0, sq.bind - burn);
        // 🔥でライフが0になった(0のまま🔥が乗っている)コマは破壊され、空きマスになる（🔑ロック中・氷結中は除く）
        if (sq.player && sq.bind === 0 && thermal.flameStacks(sq) > 0 && !thermal.isFrozen(sq) && !sq.effects.some((e) => e.effect === '🔑') && !thermal.isEffectWarded(sq)) {
            board[k] = { player: undefined, bind: 0, effects: [] };
            bumpStat(s, 'flameKill');
            continue;
        }
        const poison = thermal.isEffectWarded(sq) ? 0 : poisonStacks(sq); // 氷結中のマスの☠は休眠（継続ダメージなし・消滅もしない）。術中の加護も同様
        if (poison > 0 && sq.bind > 0) {
            // 毒のダメージでは🔥は消えない
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
    const placedNew = board[i].player !== cur; // 静電気の季節: 補強は設置ではない
    let newBind, newEffects, newPlayer;
    let capturedFrom; // 通常の攻撃で奪取した相手のシンボル（復讐の刃）
    const shikigamiHere = isShikigami(board[i]);
    if (board[i].player === cur) {
        newPlayer = board[i].player;
        newBind = board[i].bind + life + 1;
        newEffects = board[i].effects;
        // 式神を自分で補強すると、式神ではなく🌱付きの自陣コマになる
        if (shikigamiHere) newEffects = newEffects.filter((e) => e.effect !== '📜').concat([{ effect: '🌱' }]);
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
        // 式神は乗っ取られると空きマスになる（コマは置かれない）
        if (shikigamiHere && calc < 0) { newPlayer = undefined; newBind = 0; capturedFrom = undefined; }
        // 敵味方問わずコマが奪われる/消えるたびに墓地+1
        if (calc <= 0) addCorpses(s, 1);
    } else {
        newPlayer = cur;
        newBind = life;
        newEffects = board[i].effects.filter((e) => e.effect === '🔥'); // 空きマスに置かれた🔥は、そこに置かれたコマ(誰のコマでも)に引き継がれる
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
    settleWinner(s); // 土壇場の防壁は、次の手番のボーナスに間に合うよう手番を進める前にも判定する
    advanceTurn(s);
    settleWinner(s);
    return true;
}

// 巨人のパッシブ（src/components/game/giantAura.ts と同じ規則）。周囲8マスの敵コマを破壊し（氷結は身代わり）、そのあと周囲8マス全部をロックする（空きマスはライフ1）
function giantAura(s, range, me) {
    let destroyed = 0;
    for (const j of range) {
        const sq = s.board[j];
        if (!sq.player || sq.player === me || isGuarded(s, sq)) continue;
        const guard = thermal.absorbDestroy(sq);
        if (guard.blocked) { s.board[j] = guard.sq; continue; }
        s.board[j] = { player: undefined, bind: 0, effects: [] };
        destroyed++;
    }
    if (destroyed > 0) addCorpses(s, destroyed);
    for (const j of range) {
        const sq = s.board[j];
        if (thermal.isFrozen(sq) || sq.effects.some((e) => e.effect === '🔑')) continue;
        s.board[j] = { ...sq, bind: sq.player ? sq.bind : Math.max(sq.bind, 1), effects: [...sq.effects, { effect: '🔑' }] };
    }
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
// 自分の式神 i を爆破: 式神は消え、周囲8マスの敵陣に4ダメージ(0になったら破壊)、空きマスは式神になる
function exeShikigamiBlast(s, i) {
    const cur = curPlayer(s);
    if (s.board[i].player !== cur || !isShikigami(s.board[i])) return false;
    s.board[i] = { player: undefined, bind: 0, effects: [] };
    let destroyed = 0;
    for (const j of surroundRange(s, i)) {
        const sq = s.board[j];
        if (!sq.player) {
            if (!thermal.emptyBlocked(sq)) s.board[j] = newShikigami(cur);
            continue;
        }
        if (sq.player === cur || isGuarded(s, sq)) continue;
        const hit = thermal.applyDamage(sq, SHIKIGAMI_BLAST_DAMAGE, 'skill'); // 氷結なら解除だけ、🔥なら1.5倍
        if (hit.blocked) { s.board[j] = hit.sq; continue; }
        if (hit.sq.bind < 1) { s.board[j] = { player: undefined, bind: 0, effects: [] }; destroyed++; }
        else s.board[j] = hit.sq;
    }
    addCorpses(s, destroyed);
    return true;
}
// 汎用(idx 88 式神の加護・コスト5): 自分の式神を1体選んで消費し、自陣のコマ全て（式神を除く）のライフを+3する。自陣のコマが無いと使えない [FAITHFUL] Game.tsx exeShikigamiBless
const SHIKIGAMI_BLESS_LIFE = 3;
const ownShikigamiCells = (s) => s.board.map((sq, i) => (sq.player === curPlayer(s) && isShikigami(sq) ? i : -1)).filter((i) => i !== -1);
const blessTargets = (s) => s.board.map((sq, i) => (sq.player === curPlayer(s) && !isShikigami(sq) ? i : -1)).filter((i) => i !== -1);
function shikigamiBlessLegal(s) { return ownShikigamiCells(s).length > 0 && blessTargets(s).length > 0; }
function onClickShikigamiBless(s) {
    if (!shikigamiBlessLegal(s)) return;
    s.useShikigamiBless = true;
    spendMagic(s, calculateCost(s, costsOf(s).onClickShikigamiBless, false, false, 'onClickShikigamiBless'), 'onClickShikigamiBless');
    bumpMagicCount(s);
}
function exeShikigamiBless(s, i) {
    if (!ownShikigamiCells(s).includes(i)) return false;
    s.board[i] = { player: undefined, bind: 0, effects: [] };
    for (const k of blessTargets(s)) s.board[k] = { ...s.board[k], bind: s.board[k].bind + SHIKIGAMI_BLESS_LIFE };
    return true;
}
// 汎用(idx 89 式神の呪詛・コスト5): 自分の式神を1体選んで消費し、エフェクトが乗っている敵のコマ全て（🔑ロック・無敵を除く）に☠を2つ付与する。対象が無いと使えない [FAITHFUL] Game.tsx exeShikigamiCurse
const SHIKIGAMI_CURSE_STACKS = 2;
const curseTargets = (s) => s.board.map((sq, i) => (sq.player && sq.player !== curPlayer(s) && !isShikigami(sq) && sq.effects.length > 0 && !isGuarded(s, sq) ? i : -1)).filter((i) => i !== -1);
function shikigamiCurseLegal(s) { return ownShikigamiCells(s).length > 0 && curseTargets(s).length > 0; }
function onClickShikigamiCurse(s) {
    if (!shikigamiCurseLegal(s)) return;
    s.useShikigamiCurse = true;
    spendMagic(s, calculateCost(s, costsOf(s).onClickShikigamiCurse, false, false, 'onClickShikigamiCurse'), 'onClickShikigamiCurse');
    bumpMagicCount(s);
}
function exeShikigamiCurse(s, i) {
    if (!ownShikigamiCells(s).includes(i)) return false;
    const targets = curseTargets(s); // 消費する式神は自陣なので、対象は消費の前後で変わらない
    s.board[i] = { player: undefined, bind: 0, effects: [] };
    for (const k of targets) {
        for (let n = 0; n < SHIKIGAMI_CURSE_STACKS; n++) { s.board[k].effects.push({ effect: '☠' }); poisonStrike(s, s.board[k]); }
    }
    harvestMagic(s, targets.length * SHIKIGAMI_CURSE_STACKS);
    toxicBloom(s, targets);
    return true;
}
// 汎用(idx 91 式神の供犠・コスト5、自陣の式神3体以上で0): 自陣の式神をランダムに1体壊し、続けて選んだ敵のコマ1体（式神を除く・🔑ロック/無敵を除く）のライフを0にする [FAITHFUL] Game.tsx exeShikigamiPurge
const SHIKIGAMI_PURGE_FREE = 3;
const purgeTargets = (s) => s.board.map((sq, i) => (sq.player && sq.player !== curPlayer(s) && !isShikigami(sq) && sq.bind > 0 && !isGuarded(s, sq) ? i : -1)).filter((i) => i !== -1);
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
    s.board[i] = { ...s.board[i], bind: 0 };
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
        if (!sq.player && !thermal.emptyBlocked(sq)) { s.board[k] = newShikigami(cur, 0); placed++; }
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
    return gearCost(s, base, false, s.turn, 'onClickJudgeDay');
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
    return gearCost(s, costsOf(s).onClickTotalAssault - s.useTokenCount[s.turn] * 2, false, s.turn, 'onClickTotalAssault');
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
    const pickIdx = randomPick(targets, s.rng);
    const pick = s.board[pickIdx];
    pick.effects.push({ effect: isPoisoner ? '☠' : '🌱' });
    if (isPoisoner) { poisonStrike(s, pick); toxicBloom(s, [pickIdx]); }
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
    toxicBloom(s, Array.from(plan.keys()));
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
        s.board[idx] = { player: curPlayer(s), bind: Math.round(calculateTokenBind(s) * (curChar(s) === 'poisoner' ? POISON_MULT : 1)), effects: [{ effect: '☠' }] };
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
    const cur = curPlayer(s);
    for (const sq of s.board) if (sq.player === cur) sq.effects = sq.effects.filter((e) => e.effect !== '☠');
    spendMagic(s, calculateCost(s, costsOf(s).onClickSerum, false, true, 'onClickSerum'), 'onClickSerum');
    bumpMagicCount(s);
}
function onClickIntensify(s) {
    let added = 0;
    const poisoned = [];
    s.board.forEach((sq, idx) => {
        const p = sq.effects.filter((e) => e.effect === '☠').length; // 氷結中の毒も倍にできる（付与は従来どおり）
        for (let k = 0; k < p; k++) sq.effects.push({ effect: '☠' });
        if (p > 0) { poisonStrike(s, sq); poisoned.push(idx); }
        added += p;
    });
    harvestMagic(s, added);
    toxicBloom(s, poisoned);
    spendMagic(s, calculateCost(s, costsOf(s).onClickIntensify, false, true, 'onClickIntensify'), 'onClickIntensify');
    bumpMagicCount(s);
}
function onClickPandemic(s) {
    s.usePandemic = true;
    spendMagic(s, calculateCost(s, costsOf(s).onClickPandemic, false, true, 'onClickPandemic'), 'onClickPandemic');
    bumpMagicCount(s);
}
function exePandemic(s, i) {
    const targets = geometryOf(s.size).stompRange(i).filter((j) => s.board[j].player && !isGuarded(s, s.board[j]));
    for (const t of targets) { s.board[t].effects.push({ effect: '☠' }); poisonStrike(s, s.board[t]); }
    harvestMagic(s, targets.length);
    toxicBloom(s, targets);
    s.usePandemic = false;
}

// 毒霧 (idx 29): 盤上の全コマ（敵味方問わず。🔑ロック・無敵は除く）に毒を1付与する。対象選択なし [FAITHFUL] Game.tsx onClickPoisonMist
function onClickPoisonMist(s) {
    spendMagic(s, calculateCost(s, costsOf(s).onClickPoisonMist, false, true, 'onClickPoisonMist'), 'onClickPoisonMist');
    bumpMagicCount(s);
    let n = 0;
    const poisoned = [];
    s.board.forEach((sq, idx) => {
        if (!sq.player || isGuarded(s, sq)) return;
        sq.effects.push({ effect: '☠' });
        poisonStrike(s, sq);
        poisoned.push(idx);
        n++;
    });
    harvestMagic(s, n);
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
    for (const k of cells) s.board[k] = { ...s.board[k], bind: s.board[k].bind + chargeStacks(s.board[k]) * CHARGE_HEAL };
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
function kindlingCandidates(s) { return thermal.kindlingTargets(s.board, curPlayer(s), (sq) => isGuarded(s, sq)); }
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
}


// 初霜 (idx 93): 敵の🍂があるコマを全て凍結し（🔑ロック・⚡無敵は除く）、自陣にバッズトークンを1つ置く。トークン扱い（1手番に1度）。
// 盤面の🍂（効力のあるもの）が3枚以上ならコスト0 [FAITHFUL] Game.tsx onClickFirstFrost
const FIRST_FROST_FREE_LEAVES = 3;
function firstFrostTargets(s) {
    const me = curPlayer(s);
    return s.board.map((sq, i) => (sq.player && sq.player !== me && thermal.leafStacks(sq) > 0 && !isGuarded(s, sq) && thermal.canFreeze(sq) ? i : -1)).filter((i) => i !== -1);
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

// 山焼き (idx 95): 敵のエフェクトがあるマス（敵のコマで、氷結(❄)・⚡無敵のマスは無視。🔑ロック自体は数えないが、ロックのマスの他のエフェクトは対象）全てに🔥を1つ付け、自陣にロック付きのトークンを1つ置く。トークン扱い（1手番に1度）。
// エフェクト1つにつき3軽減（最低1。氷結のマスは❄の数だけ・🔑ロック自体は数えない） [FAITHFUL] Game.tsx onClickBurnOff
function burnOffTargets(s) {
    const me = curPlayer(s);
    return s.board.map((sq, i) => (sq.player && sq.player !== me && sq.effects.some((e) => e.effect !== '📜' && e.effect !== '🔑') && !sq.effects.some((e) => e.effect === '❄') && !isShielded(s, sq) ? i : -1)).filter((i) => i !== -1);
}
function burnOffLegal(s) { return !s.usedTokenThisTurn && (burnOffTargets(s).length > 0 || findEmptyIndexes(s.board).length > 0); }
function onClickBurnOff(s) {
    if (!burnOffLegal(s)) return;
    const pay = calculateCost(s, costsOf(s).onClickBurnOff, true, false, 'onClickBurnOff'); // 燃やす前のエフェクトの数で軽減する
    const cells = burnOffTargets(s);
    const owners = s.board.map((sq) => sq.player);
    const before = cells.reduce((n, k) => n + thermal.flameStacks(s.board[k]), 0);
    thermal.ignite(s.board, cells, s.size, 1, keepBudsOf(s));
    const lit = cells.reduce((n, k) => n + thermal.flameStacks(s.board[k]), 0) - before;
    const destroyed = cells.filter((k) => owners[k] && !s.board[k].player).length;
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
    const moved = [];
    let flames = 0;
    s.board.forEach((sq, k) => {
        if (isShielded(s, sq) || sq.effects.some((e) => e.effect === '❄')) return; // 氷結のあるマスと⚡無敵のマスは無視する（🔑ロック自体は動かさないが、ロックのマスの他のエフェクトは動かす）
        const keep = [];
        for (const e of sq.effects) {
            if (e.effect === '📜' || e.effect === '🔑') keep.push(e);
            else if (e.effect === '🔥') flames++;
            else moved.push(e);
        }
        if (keep.length !== sq.effects.length) s.board[k] = { ...sq, effects: keep };
    });
    s.board[idx] = { player: curPlayer(s), bind: calculateTokenBind(s), effects: moved };
    if (flames > 0) thermal.ignite(s.board, [idx], s.size, flames, keepBudsOf(s));
    const granted = afterTokenPlaced(s, idx, undefined);
    harvestMagic(s, granted);
    spendMagic(s, pay, 'onClickGather');
    bumpMagicCount(s);
    s.usedTokenThisTurn = true;
    s.useTokenCount[s.turn]++;
    bumpStat(s, 'gather');
    bumpStat(s, 'gatherEffects', moved.length + flames);
    checkDischarge(s);
}

// 一寸の虫に魂なし (idx 92): 敵のライフ3以下のコマを全て破壊し（氷結中は❄-1だけ・🔑ロックと無敵は除く）、相手全員を次の手番の終わりまで「ライフ3以下のコマを置けない」縛りにする。
// コストは盤面のコマの数だけ軽減（最低1） [FAITHFUL] Game.tsx onClickSmallFry
function smallFryTargets(s) {
    const me = curPlayer(s);
    return s.board.map((sq, i) => (sq.player && sq.player !== me && sq.bind <= lifeBanMod.LIFE_BAN_MAX && !isGuarded(s, sq) ? i : -1)).filter((i) => i !== -1);
}
// 実際に壊れる敵コマの数（氷結中は❄が減るだけ）
const smallFryDestroyable = (s) => smallFryTargets(s).filter((k) => !thermal.absorbDestroy(s.board[k]).blocked).length;
function onClickSmallFry(s) {
    const cost = calculateCost(s, costsOf(s).onClickSmallFry, false, false, 'onClickSmallFry');
    let destroyed = 0;
    for (const k of smallFryTargets(s)) {
        const guard = thermal.absorbDestroy(s.board[k]);
        if (guard.blocked) { s.board[k] = guard.sq; continue; }
        s.board[k] = { player: undefined, bind: 0, effects: [] };
        destroyed++;
    }
    if (destroyed > 0) addCorpses(s, destroyed);
    otherSeats(s).forEach((seat) => { s.lifeBan[seat] = true; });
    spendMagic(s, cost, 'onClickSmallFry');
    bumpMagicCount(s);
    bumpStat(s, 'smallFry');
    bumpStat(s, 'smallFryDestroyed', destroyed);
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
    const cands = [];
    for (let k = 0; k < s.board.length; k++) {
        if (!isShielded(s, s.board[k]) && !s.board[k].effects.some((e) => e.effect === '🔑')) cands.push(k);
    }
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
    spendMagic(s, calculateCost(s, costsOf(s).onClickHailMary, false, false, 'onClickHailMary'), 'onClickHailMary');
    const choices = [
        () => { s.useAssault[s.turn] = 3; s.useTokenCount[s.turn] = 0; },
        () => { s.useStomp = true; },
        () => { s.useJudgeDay = true; },
        () => { s.useShikigamiPlace = true; },
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
    spendMagic(s, calculateCost(s, costsOf(s).onClickSacrifice, false, false, 'onClickSacrifice'), 'onClickSacrifice');
    bumpMagicCount(s);
    bumpStat(s, 'sacrifice');
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
    const me = curPlayer(s);
    let removed = 0;
    s.board.forEach((sq, i) => {
        if (sq.player !== me || chargeStacks(sq) === 0) return;
        removed += chargeStacks(sq);
        s.board[i] = { ...sq, effects: sq.effects.filter((e) => e.effect !== '⚡') };
    });
    if (removed === 0) return 0;
    s.board.forEach((sq, i) => {
        if (!sq.player || sq.player === me || sq.bind <= 0 || thermal.isFrozen(sq) || isGuarded(s, sq)) return;
        s.board[i] = thermal.applyDamage(sq, removed, 'electric').sq;
    });
    return removed;
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
    return thermal.infernoTargets(s.board, curPlayer(s)).filter((k) => !isShielded(s, s.board[k]));
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
    fireWheel: onClickFireWheel,
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
    firstFrost: onClickFirstFrost,
    gather: onClickGather,
    burnOff: onClickBurnOff,
    freeToken: onClickFreeToken,
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
    smallFryTargets, firstFrostLegal, firstFrostTargets, gatherLegal, burnOffLegal, burnOffTargets, freeTokenLegal,
    tinderLegal, tinderCandidates, bonfireLegal, mulchLegal, autumnLegal, leafFrostLegal, springWindLegal, kimonCandidates, fireWheelLegal, stripLegal, chargeSeasonLegal, bristleLegal, chargeHealLegal, leafDropLegal, leafAllLegal, leafCloakLegal, kindlingLegal, releaseLegal, stashLegal, thunderFireLegal, thunderFireTargets,
    spendMagic, shuffleHand, HEART, CIRCLE, SYMBOLS, MAX_PLAYERS, seatOf, boardSizeFor, DECAY_PER_ROUND_MIN_PLAYERS, CHARACTERS, skillCosts, SKILLS,
    makeRng, normRand, calculateLife, calculateWinner, settleWinner, findEmptyIndexes, SHIKIGAMI_BLAST_DAMAGE, isShikigami, newShikigami, exeShikigamiBlast, SHIKIGAMI_LIFE,
    blessTargets, curseTargets, purgeTargets, SHIKIGAMI_PURGE_FREE, smallFryDestroyable,
    newGame, placeMove, advanceTurn, judgeNextSeat, judgeNextIsHeart, shouldDecay, lateMagicBonus, renderBoard,
    curPlayer, curChar, curMagic, symbolOfSeat, seatCount, otherSeats, symbolsOf, calculateCost, judgeDayCost, totalAssaultCost, necromancyCost, reshuffleSkillsFor,
    miasmaCost, miasmaPlan, poisonCountFor, boardPoisonCount, surroundRange, costsOf, gearCost, necromancyPay,
    PROLIFERATE, proliferateUpkeep,
    POOL_SIZE, shatterTargets, exeIcicle, swiddenTargets, sacrificeCandidates, suckerTargets, bestSuckerTarget, ownBuds, infernoTargets, hasAilment, glacierCost, infernoCost, mogaribueCost, burnoutCost, burnoutTargets, INFERNO_FREE_SKILLS, FIRE_DAMAGE, CHARGE_LANDING_DAMAGE, landedCharge, CHARGE_MIN_COST, boardChargeCount, chargeOneCost, chargeSpreadCost, chargeStacks, orthoNeighbors, isShielded, isGuarded, connectedPieces, charOfPlayer,
};
