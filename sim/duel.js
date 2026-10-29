#!/usr/bin/env node
// @ts-check
'use strict';
/*
 * 人（=Claude）が sim で実際に対局するための、ステートレスなリプレイ式ドライバ（/play-learn スキルが使う）。
 * 対局は設定(JSON) + 自分の操作列だけをファイルに持ち、呼ぶたびに最初から再生する。
 * 乱数は seed 固定なので、同じ操作列なら必ず同じ盤面になる（相手AIの手も含めて）。
 *
 *   node sim/duel.js new  <file> --me you --opp giant [--seat 0|1] [--seed N] [--size N] [--gears a,b] [--deck 0,3,..] [--oppGears a,b] [--oppDeck ..] [--oppVaried] [--oppFlags k=v,..]
 *   node sim/duel.js show <file>                       # 現在の盤・手札・コスト・直前の相手AIの動き
 *   node sim/duel.js do   <file> "h 3" "p 5" ...        # 操作を順に実行（不正な操作はそこで止まり、以降は実行しない）
 *   node sim/duel.js log  <file>                       # 操作列とAIの動きの全履歴（日記・学習メモ用）
 *   node sim/duel.js ai   <file> [--mod ai.js]          # 自分の手番を既定AIに任せて1手番進める（比較用）
 *
 * 操作:
 *   p N            マス N に着手。ロック/トークン等の「次にマスを選ぶ」待ち状態では、その対象マスの指定になる
 *   h IDX          手札のカード（デッキ idx。show に出る）を使う
 *   s NAME         固有スキル・常設スキルを SKILLS の名前で使う（例: s stomp / s doubleLock）
 *   lock IDX       手札のカードを次手番用にロック/解除（最大3）
 *   shuffle        手札を引き直す（コスト1）
 *   charge         魔力を溜めて手番を終える（着手しない）
 */
const fs = require('fs');
const engine = require('./engine');
const gearMod = require('./shared/gear');
const deckMod = require('./shared/deck');
const ai = require('./aiSelect');
const threat = require('./duel-threat');

const { SKILLS } = engine;

/** 手札のデッキ idx → SKILLS のキー（sim で未実装の idx は無し） */
const IDX_SKILL = {
    0: 'addLife', 1: 'bibine', 2: 'buds', 3: 'token', 4: 'bothToken', 5: 'slash', 6: 'backSlash', 7: 'tsunami', 8: 'opium',
    9: 'budsToken', 10: 'doubleBuds', 11: 'doubleToken', 12: 'doubleLock', 13: 'tripleLock', 14: 'walpurgis', 15: 'injection',
    16: 'poisonToken', 17: 'serum', 18: 'intensify', 19: 'pandemic', 20: 'proliferate', 21: 'chargeToken', 22: 'chargeOne',
    23: 'doubleChargeToken', 24: 'chargeArea', 25: 'chargeRandom', 26: 'jammer', 27: 'hailMary', 28: 'silence', 29: 'poisonMist',
    30: 'freeze', 31: 'ignite', 32: 'cleanse', 33: 'harvestEve', 34: 'solstice', 35: 'sucker', 36: 'windborne', 37: 'flameToken',
    38: 'doubleFlameToken', 39: 'swidden', 40: 'sacrifice', 41: 'frostArea', 42: 'icicle', 43: 'randomFreeze', 44: 'freezeSpread',
    45: 'frostToken', 46: 'doubleFrostToken', 47: 'shatter', 48: 'frostfall', 53: 'markdown', 54: 'effectDiscount', 55: 'tokenDiscount',
    56: 'vitalMarkdown', 57: 'uniqueDiscount', 58: 'clearance', 60: 'counterMarkdown', 61: 'burnout', 62: 'leafToken',
    63: 'twinLeafToken', 64: 'doubleLeafToken', 65: 'leafAll', 66: 'bonfire', 67: 'mulch', 68: 'autumn', 69: 'leafFrost',
    70: 'springWind', 71: 'shikigamiAll', 72: 'shikigamiRandom', 73: 'shikigamiFlood', 74: 'kimon', 75: 'fireWheel',
    77: 'chargeSeason', 78: 'bristle', 79: 'release', 80: 'stash', 81: 'thunderFire', 82: 'darkPot', 83: 'chargeHeal',
    84: 'leafDrop', 85: 'kindling', 86: 'leafCloak', 87: 'tinder', 92: 'smallFry', 93: 'firstFrost', 94: 'gather',
};

/** キャラ固有の SKILLS キー */
const UNIQUE = {
    you: [], tactician: ['totalAssault'], magician: ['judgeDay'], giant: ['stomp'],
    yinYangMaster: ['toggleYY', 'shikigamiPlace', 'shikigamiBlast'], necromancer: ['necromancy'], poisoner: ['miasma'],
    electrician: ['chargeSpread'], cryomancer: ['glacier'], pyromancer: ['ignite', 'inferno'],
};
const ALWAYS = ['lock', 'doubleLock', 'tripleLock'];

const COST_ALIAS = { walpurgis: 'onClickWalpurgisNight', toggleYY: 'onClickToggleYingYang' };
/** 動的コストの固有スキル（盤面で変わる）は engine の専用関数で引く */
const DYNAMIC_COST = {
    judgeDay: 'judgeDayCost', totalAssault: 'totalAssaultCost', necromancy: 'necromancyCost', miasma: 'miasmaCost',
    glacier: 'glacierCost', inferno: 'infernoCost', burnout: 'burnoutCost', chargeOne: 'chargeOneCost', chargeSpread: 'chargeSpreadCost',
};
const costKeyOf = (name) => {
    if (COST_ALIAS[name]) return COST_ALIAS[name];
    const cap = name[0].toUpperCase() + name.slice(1);
    for (const k of [`onClick${cap}`, `onClickUse${cap}`]) if (k in engine.skillCosts) return k;
    return null;
};
/** そのスキルを今撃つコスト（不明なら null）。トークン系は token 割引の対象 */
function costOf(s, name) {
    if (name === 'charge') return 0;
    const dyn = DYNAMIC_COST[name];
    if (dyn && typeof engine[dyn] === 'function') {
        try { const v = engine[dyn](s); if (typeof v === 'number') return v; } catch (e) { /* 条件不成立で例外なら下の表引きへ */ }
    }
    const k = costKeyOf(name);
    if (!k) return null;
    const base = engine.costsOf(s)[k];
    if (typeof base !== 'number') return null;
    return engine.calculateCost(s, base, /oken/.test(name), /oison|iasma/.test(name), k);
}

const arr = (v) => (v ? String(v).split(',').map((x) => x.trim()).filter(Boolean) : null);

function parseArgs(argv) {
    const a = { _: [] };
    for (let i = 0; i < argv.length; i++) {
        if (argv[i].startsWith('--')) a[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
        else a._.push(argv[i]);
    }
    return a;
}

/** 設定からゲームを作る。席 cfg.seat が自分、もう一方が既定AI */
function build(cfg) {
    const chars = cfg.seat === 0 ? [cfg.me, cfg.opp] : [cfg.opp, cfg.me];
    const rng = engine.makeRng(cfg.seed);
    const myGears = cfg.gears || gearMod.recommendedGears(cfg.me);
    const myDeck = cfg.deck || deckMod.recommendedDeck(cfg.me);
    const oppDeck = cfg.oppDeck || (cfg.oppVaried ? deckMod.variedAIDeck(cfg.opp, engine.makeRng(cfg.seed * 31 + 7)) : deckMod.recommendedDeck(cfg.opp));
    const oppGears = cfg.oppGears || gearMod.recommendedGears(cfg.opp);
    const decks = cfg.seat === 0 ? [myDeck, oppDeck] : [oppDeck, myDeck];
    const gears = cfg.seat === 0 ? [myGears, oppGears] : [oppGears, myGears];
    const s = engine.newGame({ chars, rng, size: cfg.size, decks, gears });
    const flags = {};
    for (const kv of cfg.oppFlags || []) { const [k, v] = kv.split('='); flags[k] = v === undefined ? true : Number.isNaN(Number(v)) ? v : Number(v); }
    s.aiFlags = cfg.seat === 0 ? [{}, flags] : [flags, {}];
    return s;
}

const PENDING = ['useLock', 'useStomp', 'useJudgeDay', 'useInjection', 'usePandemic', 'useBuds', 'useChargeOne', 'useChargeSpread', 'useChargeArea',
    'useFrostArea', 'useIcicle', 'useFrostSpread', 'useShatter', 'useSwidden', 'useKimon', 'useShikigamiPlace', 'useShikigamiBlast', 'useShikigamiBless', 'useShikigamiCurse', 'useShikigamiPurge', 'useFreeze',
    'useSucker', 'useIgnite', 'useSacrifice', 'useJammer', 'useMiasma', 'useGlacier', 'useInferno'];
const pendingOf = (s) => PENDING.filter((k) => { const v = s[k]; return Array.isArray(v) ? v[0] : !!v; });

function wrapSkills(log) {
    const orig = {};
    for (const k of Object.keys(SKILLS)) {
        orig[k] = SKILLS[k];
        SKILLS[k] = (...a) => { log.push(`スキル ${k}`); return orig[k](...a); };
    }
    return () => { for (const k of Object.keys(orig)) SKILLS[k] = orig[k]; };
}

/** 本番(Game.tsx の mustPass)と同じ: サイレンス中は着手しかできない。置けるマスが無ければ自動でパス。
 *  サイレンスが無ければチャージできるので、空きマスが無くても詰まらない（引き分けにはならない）。置けるかは近似(空き / 自駒 / ライフ0の敵駒) */
function mustPass(s) {
    if (!s.silenced[s.turn]) return false;
    const mine = engine.symbolOfSeat(s.turn);
    return !s.board.some((sq) => {
        if (sq.effects.some((e) => e.effect === '🔑')) return false;
        if (sq.player === undefined) return engine.findEmptyIndexes([sq]).length > 0;
        return sq.player === mine || sq.bind <= 0;
    });
}

/** 相手AIの手番を、自分の手番になるまで（または決着まで）進める */
function runAI(s, cfg, aiLog, mod) {
    let g = 0;
    while (!s.winner && g++ < 50) {
        if (mustPass(s)) { aiLog.push(s.turn === cfg.seat ? 'あなたはパス（サイレンス中で置ける場所がない）' : 'パス（サイレンス中で置ける場所がない）'); s.currentTurn += 1; engine.settleWinner(s); engine.advanceTurn(s); engine.settleWinner(s); continue; }
        if (s.turn === cfg.seat) break;
        const unwrap = wrapSkills(aiLog);
        const r = (mod || ai).makeMove(s, 'faithful');
        unwrap();
        if (!r.turnEnded && r.move != null) { aiLog.push(`着手 ${r.move}`); engine.placeMove(s, r.move); }
        else if (!r.turnEnded) { aiLog.push('チャージ'); SKILLS.charge(s); }
        else aiLog.push('(手番を終えるスキル)');
    }
}

/** 操作1つを実行。失敗なら理由の文字列、成功なら null */
function apply(s, cfg, act) {
    const [cmd, arg] = act.trim().split(/\s+/);
    const me = cfg.seat;
    if (s.winner) return '既に決着しています';
    if (s.turn !== me) return '自分の手番ではありません';
    if (cmd === 'p' || cmd === 'p!') {
        const i = parseInt(arg, 10);
        if (!(i >= 0 && i < s.board.length)) return `マス番号が範囲外: ${arg}`;
        // 見落とし防止: 置いた後に相手の勝ち手が残るなら止める（p! N で強行）。対象マスの指定待ち中は対象外
        if (cmd === 'p' && !pendingOf(s).length) {
            const w = threat.placeWarning(s, engine.symbolOfSeat(me), engine.symbolOfSeat(1 - me), i);
            if (w) return `マス${i}に置くと相手の${w.fork ? 'フォーク(勝ち手が複数)' : '勝ち手'}が残ります: マス${w.cells.join(',')}。置き直すか、承知の上なら p! ${i}`;
        }
        return engine.placeMove(s, i) ? null : 'そのマスには置けません（ロック・氷結・ライフ不足・対象外など）';
    }
    if (cmd === 'h' || cmd === 's') {
        let name = arg;
        if (cmd === 'h') {
            const idx = parseInt(arg, 10);
            if (!s.skills.includes(idx)) return `手札にない: ${arg}（手札は ${s.skills.join(',')}）`;
            name = IDX_SKILL[idx];
            if (!name) return `idx ${idx} はsim未実装`;
        } else {
            const ok = [...(UNIQUE[s.chars[me]] || []), ...ALWAYS, 'charge'].includes(name);
            if (!ok) return `使えないスキル: ${name}（${[...(UNIQUE[s.chars[me]] || []), ...ALWAYS].join(', ')}）`;
        }
        if (!SKILLS[name]) return `未知のスキル: ${name}`;
        if (s.silenced[me] && name !== 'charge') return 'サイレンス中でスキルを使えません';
        const c = costOf(s, name);
        if (c != null && c > s.magic[me]) return `魔力不足（${name} は ${c}、手持ち ${s.magic[me]}）`;
        if (pendingOf(s).length) return `対象マスの指定待ち（${pendingOf(s).join(',')}）。p N で指定してください`;
        const before = JSON.stringify([s.magic, s.board.length]);
        SKILLS[name](s);
        if (JSON.stringify([s.magic, s.board.length]) === before && !pendingOf(s).length && name !== 'charge') return `${name} は効果なし（対象がない等）`;
        return null;
    }
    if (cmd === 'lock') {
        const idx = parseInt(arg, 10);
        if (!s.skills.includes(idx)) return `手札にない: ${arg}`;
        const cur = s.lockedSkills[me].slice();
        const at = cur.indexOf(idx);
        if (at >= 0) cur.splice(at, 1); else if (cur.length < 3) cur.push(idx); else return 'ロックは最大3枚';
        s.lockedSkills[me] = cur;
        return null;
    }
    if (cmd === 'shuffle') {
        if (s.magic[me] < engine.costsOf(s).onClickShuffle) return '魔力不足';
        engine.shuffleHand(s);
        return null;
    }
    if (cmd === 'charge') { SKILLS.charge(s); return null; }
    return `未知の操作: ${cmd}`;
}

/** 設定 + 操作列を再生。返り値: 状態・AI動きの記録(手番ごと)・失敗した操作 */
function replay(cfg, extra = [], mod = null) {
    const s = build(cfg);
    const turns = []; // { mine: [操作], reply: [その直後の相手AIの動き] }
    const opening = []; // 後手のとき、最初にAIが指した分
    runAI(s, cfg, opening, mod);
    let cur = { mine: [], reply: [] };
    let failed = null;
    const all = [...cfg.actions, ...extra];
    let done = 0;
    for (const act of all) {
        const err = apply(s, cfg, act);
        if (err) { failed = { act, err }; break; }
        cur.mine.push(act);
        done++;
        if (!s.winner && s.turn !== cfg.seat) {
            runAI(s, cfg, cur.reply, mod);
            turns.push(cur);
            cur = { mine: [], reply: [] };
        }
    }
    if (cur.mine.length) turns.push(cur); // 手番の途中（待ち状態など）
    let lastReply = opening;
    for (const t of turns) if (t.reply.length) lastReply = t.reply;
    return { s, turns, opening, failed, applied: all.slice(0, done), lastReply };
}

function show(cfg, res) {
    const { s, turns } = res;
    const me = cfg.seat;
    const sym = engine.symbolOfSeat(me);
    console.log(`# ${sym} ${cfg.me}（あなた）vs ${engine.symbolOfSeat(1 - me)} ${cfg.opp}（既定AI）  seed=${cfg.seed}  盤=${s.size}x${s.size}  turn=${s.currentTurn}`);
    console.log(`ギア: ${(s.gears[me] || []).join(',') || 'なし'}   デッキ: ${s.decks ? s.decks[me].join(',') : '-'}`);
    console.log(`相手ギア: ${(s.gears[1 - me] || []).join(',') || 'なし'}`);
    console.log('');
    console.log(engine.renderBoard(s));
    console.log(`ライフ値(次に置くコマ)=${s.life}  魔力 自分:${s.magic[me]} 相手:${s.magic[1 - me]}  直前の相手AI: ${res.lastReply.length ? res.lastReply.join(' / ') : 'なし'}`);
    {
        const mySym = sym, opSym = engine.symbolOfSeat(1 - me);
        const now = threat.winCells(s, s.board, opSym, false).map((o) => o.cell);
        const later = threat.winCells(s, s.board, opSym, true).map((o) => o.cell).filter((c) => !now.includes(c));
        const mine = threat.winCells(s, s.board, mySym, false).map((o) => o.cell);
        if (!s.winner) {
            if (mine.length) console.log(`✅ 自分の勝ち手: マス${mine.join(',')}`);
            if (now.length) console.log(`⚠ 相手の勝ち手(今): マス${now.join(',')}${now.length >= 2 ? '  ←複数＝1手では防げない' : ''}`);
            if (later.length) console.log(`⚠ 相手の勝ち手(あなたが1手指した後の減衰・毒で奪える駒を含む): マス${later.join(',')}`);
        }
    }
    if (s.winner) { console.log(`\n*** 決着: ${s.winner}${s.winner === sym ? '（あなたの勝ち）' : '（あなたの負け）'} ***`); return; }
    if (engine.findEmptyIndexes(s.board).length === 0) console.log('\n（着手できるマスなし: charge で手番を終えられる）');
    const pend = pendingOf(s);
    if (pend.length) console.log(`待ち状態: ${pend.join(',')} → p N で対象マスを指定`);
    const cat = deckMod.SKILL_CATALOG;
    console.log('\n手札（h IDX で使用 / lock IDX で次手番に固定）:');
    for (const idx of s.skills) {
        const name = IDX_SKILL[idx];
        const c = name ? costOf(s, name) : null;
        const locked = s.lockedSkills[me].includes(idx) ? ' 🔒' : '';
        console.log(`  h ${idx}\t${cat[idx].icon}${cat[idx].name}\t[${name || 'sim未実装'}]\tコスト${c == null ? '?' : c}${locked}`);
    }
    console.log('固有・常設（s NAME）:');
    for (const name of [...(UNIQUE[cfg.me] || []), ...ALWAYS, 'charge']) {
        const c = costOf(s, name);
        console.log(`  s ${name}\tコスト${c == null ? '?' : c}`);
    }
    console.log(`  shuffle\tコスト${engine.costsOf(s).onClickShuffle}   charge: 手番を終えて魔力${engine.costsOf(s).onClickCharge}`);
}

function fullLog(cfg, res) {
    console.log(`設定: me=${cfg.me} opp=${cfg.opp} seat=${cfg.seat} seed=${cfg.seed} size=${cfg.size || 'auto'} gears=${(cfg.gears || []).join(',') || 'rec'} deck=${(cfg.deck || []).join(',') || 'rec'}`);
    if (res.opening.length) console.log(`\n[開始] AI(先手): ${res.opening.join(' / ')}`);
    res.turns.forEach((t, i) => {
        console.log(`\n[手番${i + 1}] あなた: ${t.mine.join(' ; ') || '-'}`);
        if (t.reply.length) console.log(`        AI: ${t.reply.join(' / ')}`);
    });
    const w = res.s.winner;
    console.log(`\n結果: ${w ? (w === engine.symbolOfSeat(cfg.seat) ? '勝ち' : '負け') : '未決着'}  (turn ${res.s.currentTurn})`);
}

function main() {
    const a = parseArgs(process.argv.slice(2));
    const [sub, file] = a._;
    if (!sub || !file) { console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0].replace(/^[\s\S]*?\/\*\n/, '')); return; }
    if (sub === 'new') {
        const me = a.me || 'you';
        const opp = a.opp || 'you';
        for (const c of [me, opp]) if (!engine.CHARACTERS.includes(c)) throw new Error(`unknown char ${c}: ${engine.CHARACTERS.join(',')}`);
        const gears = arr(a.gears);
        if (gears) {
            for (const g of gears) if (!gearMod.GEAR_IDS.includes(g)) throw new Error(`unknown gear ${g}`);
            if (gears.length > gearMod.gearSlotsFor(me)) throw new Error(`gear slots: ${gearMod.gearSlotsFor(me)}`);
        }
        const deck = arr(a.deck) && arr(a.deck).map(Number);
        if (deck && !deckMod.isValidDeck(deck)) throw new Error('deck must be 12 distinct idx in 0..75');
        const cfg = {
            me, opp, seat: a.seat === '1' ? 1 : 0, seed: parseInt(a.seed || '1', 10), size: a.size ? parseInt(a.size, 10) : undefined,
            gears: gears || undefined, deck: deck ? [...deck].sort((x, y) => x - y) : undefined,
            oppGears: arr(a.oppGears) || undefined, oppDeck: arr(a.oppDeck) ? arr(a.oppDeck).map(Number) : undefined, oppVaried: a.oppVaried === 'true', oppFlags: arr(a.oppFlags) || undefined,
            actions: [],
        };
        fs.writeFileSync(file, JSON.stringify(cfg, null, 1));
        show(cfg, replay(cfg));
        return;
    }
    const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (sub === 'show') return show(cfg, replay(cfg));
    if (sub === 'log') return fullLog(cfg, replay(cfg));
    if (sub === 'do') {
        const acts = a._.slice(2).flatMap((x) => x.split(';')).map((x) => x.trim()).filter(Boolean);
        const res = replay(cfg, acts);
        if (res.failed) console.log(`✗ 実行できない操作: "${res.failed.act}" — ${res.failed.err}\n（ここまでの ${res.applied.length - cfg.actions.length} 個は適用済み）\n`);
        cfg.actions = res.applied;
        fs.writeFileSync(file, JSON.stringify(cfg, null, 1));
        return show(cfg, res);
    }
    if (sub === 'ai') {
        const mod = a.mod ? require(require('path').resolve(a.mod)) : ai;
        // 既定AIに自分の席を1手番ぶん任せる: 席を一時的に入れ替えてAIを走らせる
        const res = replay(cfg);
        const s = res.s;
        if (s.winner || s.turn !== cfg.seat) return show(cfg, res);
        s.aiFlags = [{}, {}];
        const r = mod.makeMove(s, 'faithful');
        console.log(`既定AIなら: ${r.turnEnded ? '(スキルで手番終了)' : r.move == null ? 'チャージ' : '着手 ' + r.move}（状態は保存しません。手札で使ったスキルはこの表示に含まれません）`);
        return;
    }
    throw new Error(`unknown subcommand ${sub}`);
}

if (require.main === module) main();

module.exports = { replay, build, apply, costOf, IDX_SKILL, UNIQUE };
