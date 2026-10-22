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

const { SYMBOLS, settleWinner, isShikigami, isGuarded, SHIKIGAMI_BLAST_DAMAGE, calculateWinner, findEmptyIndexes, costsOf, gearCost, necromancyPay, SKILLS,
        curPlayer, curChar, curMagic, calculateCost, placeMove, judgeDayCost, totalAssaultCost,
        miasmaCost, miasmaPlan, poisonCountFor, otherSeats, POOL_SIZE, suckerTargets, bestSuckerTarget, ownBuds, infernoTargets, hasAilment, glacierCost, infernoCost, INFERNO_FREE_SKILLS, FIRE_DAMAGE, chargeOneCost, chargeSpreadCost, chargeStacks, orthoNeighbors, isShielded, connectedPieces } = require('./engine');
const { geometryForCells } = require('./geometry');
const thermal = require('./thermal');
const E = require('./engine');
const discountMod = require('./discount');
const { lineCells } = require('./geometry');
const { hasGear } = require('./gear');

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
const SURPLUS_MAGIC = 12; // AIPlayer.ts と同じ
const AI_DEFAULTS = {
    frzBlock: 1, // 氷室の番人が単独の脅威を氷結で塞ぐ（A/B採用）
    freezeBuds: 1, // 氷室の番人が、魔法使いの🌱付きでロックされていないコマを凍らせて魔力エンジンを止める（対魔法使い 25→68%、環境勝率 seed2/200 で +4.4pt）
    freezeBudsReserve: 0,
    antiPoison: 1, // 氷室の番人が、毒で倒れそうな（毒≥ライフ-2）自陣コマを先に凍らせる。氷結中の毒は継続ダメージなし（対毒使い 49→60%、環境勝率 +1.5pt）
    antiPoisonMargin: 2,
    cryoCards: 1, // 氷室の番人が霜降り・氷結トークン・氷結ダブルトークンを使う（tune-top: 環境勝率 seed2/200 で +9.1pt）
    pyroLock: 0, // 鍛冶師が軽減札を手札に固定する。A/Bで勝ち数が下がった(あなた-8/巨人-8)ので無効（1で有効）
    burnoutAfter: 1, // 鍛冶師が業火のあと（🔥のマスで敵が自陣より2つ以上多く壊れるなら）バーンアウトを撃つ（A/B）
    discountInferno: 1, // 固有スキル(業火)が撃てる状況なら、軽減札で無料でなくても安く撃てる/撃てるようになるとき軽減札を先に撃つ（A/B）
    discountPlan: 1, // 軽減札(特売・活力特売・大特価)を、撃てるスキルが増えるときに先に撃つ。2なら手札に無いとき1コストで引き直して探す（A/B）
    pyroChain: 1, // 煉獄の鍛冶師が軽いスキルを連打して業火を無料で撃つ（ユーザー指定。0で無効にして A/B 比較できる）
    cryoPoison: 1, // 毒使いが霜降り・氷結トークン系を使う(自陣の毒マスを凍らせて毒ダメージから守る)。デッキに45/46/48を入れる前提(tune-top poisoner: 環境勝率 seed5/150 +7.7pt, seed6/200 +4.5pt)
    magLockN: 3, // 魔法使いが1手番にロックするバッズ駒の最大数（A/B: 環境勝率 +2.9/+3.0/+3.5pt。本番は AIPlayer.ts の MAGICIAN_MAX_LOCKS）
    lsAggro: 1,  // 土壇場の防壁が未発動なら相手の1回目の勝ちは止めに行かず攻める(防壁が受ける)。軍師 seed2/4×200 で +2.7pt(合算400試合, CI±2.2)（A/B採用）
    igniteSig: 1, // 鍛冶師が固有スキルの火遁を毎手番撃つ。1=敵コマ(ライフが残る)を燃やす / 2=敵の列を作りかけの空きマスにも🔥を仕込む（tune-top 鍛冶師: 環境勝率 seed22/150 +6.8pt, seed24/200 +8.6pt。2は1と同じ結果）
    igniteReserve: 0, // 火遁を撃つとき残しておく魔力
    igniteBud: 6, // 火遁で魔法使いの🌱のある敵コマを優先して燃やす重み(🌱は🔥で燃えて消える。魔法使いの🌱は魔力+3なので3倍)。tune-top 鍛冶師: 対魔法使い 23→31%(seed28/29/30 で +7〜8pt)
    igniteSkip: 1, // 火遁を撃たない相手。1=ネクロマンサー(コマが壊れるたび墓地が増え蘇生の資源になる) / 2=ネクロマンサーと毒使い
    auraSim: 1, // 巨人の着手評価にオーラ（周囲の敵コマ破壊+周囲ロック）を反映する（A/B: 環境勝率 53.1→60.2% seed2/200）。0で無効
    stompMin: 1, // 巨人ストンプを撃つ最低の敵駒数。2→1でコスト2のストンプを積極的に撃つ（A/B: 環境勝率 12.4→17.3% seed1/100、stompDefと併せて 14.6→26.2% seed2/200）
    stompDef: 1, // 相手のリーチがあっても、ストンプで脅威が減るなら先に撃つ（A/B: 12.4→19.8% seed1/100）。0で無効
    unblock: 2,  // 自分のリーチを塞ぐ氷結空きマスを、火遁(idx31)で隣のコマ（敵優先・無ければ自陣）を燃やして解凍し同じ手番で完成させる（A/B採用）
};
AI_DEFAULTS.yyBudLock = 0; AI_DEFAULTS.loopDig = 0; AI_DEFAULTS.loopMin = 5; AI_DEFAULTS.comboDiscount = 1; AI_DEFAULTS.shuffleDig = 0; AI_DEFAULTS.bloomLoop = 0; AI_DEFAULTS.floodLock = 1; AI_DEFAULTS.floodHold = 2; AI_DEFAULTS.shReserve = 9; AI_DEFAULTS.shComboReal = 1; AI_DEFAULTS.shMax = 3; AI_DEFAULTS.shBlastMin = 3;
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
function bestStompTarget(board, me, minEnemies = 2) {
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
    return bestEnemies >= minEnemies ? bestIdx : null;
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

// 鬼門封じ: 敵のラインの要のコマ（氷結中・🔑ロック・無敵は除く）。AIPlayer.ts findKimonTarget と同一
function bestKimonTarget(board, me, minValue) {
    const geo = geometryForCells(board.length);
    let bestIdx = null, bestVal = 0;
    for (let i = 0; i < board.length; i++) {
        const sq = board[i];
        if (!isEnemy(sq.player, me) || shield.has(i) || thermal.isFrozen(sq) || sq.effects.some(e => e.effect === '🔑')) continue;
        let val = 0;
        for (const line of geo.winLines) {
            if (!line.includes(i)) continue;
            let oc = 0, foreign = 0;
            for (const idx of line) { if (board[idx].player === sq.player) oc++; else if (board[idx].player) foreign++; }
            if (foreign === 0) val += LINE_SCORES[Math.min(oc, 4)];
        }
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
const BLOOM_AI = process.env.BLOOM_AI !== '0'; // 毒使い×毒花の専用行動（A/B用に無効化できる）
const BLOOM_MAX_OWN_POISON = Number(process.env.BLOOM_MAX_OWN_POISON) || 3; // 自陣の毒スタックの上限
const BLOOM_MIN_BIND = Number(process.env.BLOOM_MIN_BIND) || 4;            // 毒を盛る自コマのライフの下限（毒の数を足した値）
// ギア向けの戦略を使うか: そのギアを装備している席、または検証用に forceAi で指定された席。GEAR_AI=0 で全て無効化(A/B用)
const gearAi = (s, id) => process.env.GEAR_AI !== '0' && (hasGear(s.gears[s.turn], id) || s.forceAi[s.turn].includes(id));
const TK_AI = process.env.TK_AI !== '0'; // トークン系スキルを残すロック（A/B用に無効化できる）
const TK_CHARS = (process.env.TK_CHARS || 'poisoner').split(','); // 対象のキャラ
const EL_AI = process.env.EL_AI !== '0'; // 空蔵の専用行動（A/B用に無効化できる）
const EL_MAX = Number(process.env.EL_MAX) || 2;             // 同時にかけておく空きマスロックの上限
const EL_MIN_VALUE = Number(process.env.EL_MIN_VALUE) || 10; // ロックする空きマスの価値の下限（自分の2つ並びを3つにする程度）
const EL_DENY = process.env.EL_DENY != null ? Number(process.env.EL_DENY) : 2; // 敵の列を止める価値の重み
const MIASMA_MIN_SCORE = 2; // 敵2マス、または敵1マス+リーチ列(=3)

// 火遁(固有)の対象: ライフが残り🔥・❄の無い敵コマのうち、敵の列を作りかけているもの(列の敵コマが2つ以上)とライフが高いものを優先。
// mode>=2 のときは、敵が2つ以上並べて自分のコマが無い列の空きマスにも🔥を仕込む（そこに置いた敵コマに🔥が引き継がれる）
function bestIgniteTarget(s, me, mode) {
    const geo = geometryForCells(s.board.length);
    const enemyAt = (i) => s.board[i].player && s.board[i].player !== me;
    let best = null, bestVal = 0;
    for (let i = 0; i < s.board.length; i++) {
        const sq = s.board[i];
        if (shield.has(i) || thermal.isFrozen(sq) || sq.effects.some((e) => e.effect === '🔥')) continue;
        if (sq.player === me) continue;
        let build = 0;
        for (const line of geo.winLines) {
            if (!line.includes(i)) continue;
            const foes = line.filter((j) => enemyAt(j)).length;
            const mine = line.filter((j) => s.board[j].player === me).length;
            if (mine === 0 && foes >= 2) build += foes;
        }
        let val;
        if (sq.player) {
            if (sq.bind <= 0) continue;
            val = sq.bind + build * 2;
            const buds = sq.effects.filter((e) => e.effect === '🌱').length;
            if (buds && F.igniteBud && s.chars[E.seatOf(sq.player)] === 'magician') val += F.igniteBud * buds * 3;
        }
        else { if (mode < 2 || sq.effects.some((e) => e.effect === '🔑') || build === 0) continue; val = build * 2; }
        if (val > bestVal) { bestVal = val; best = i; }
    }
    return best;
}

// 空蔵: 自分がかけた空きマスロック（まだ自陣のコマになっていないもの）の数
function myEmptyLocks(s) {
    return s.board.filter((sq) => !sq.player && sq.effects.some((e) => e.effect === '🔑' && e.value === s.turn + 1)).length;
}
// 空蔵: 空きマスのうち、自分のコマが置けた場合の列の伸びと、敵に置かれたら困る列の伸び(EL_DENY倍)の合計が最大のマス
function bestEmptyLockTarget(board, me, opps) {
    const geo = geometryForCells(board.length);
    let bestIdx = null, bestVal = EL_MIN_VALUE - 1e-9;
    for (let i = 0; i < board.length; i++) {
        const sq = board[i];
        if (sq.player || sq.effects.some((e) => e.effect === '🔑') || shield.has(i)) continue;
        let val = 0;
        for (const line of geo.winLines) {
            if (!line.includes(i)) continue;
            let mine = 0, foreign = 0;
            const oc = new Map();
            for (const idx of line) {
                const p = board[idx].player;
                if (p === me) mine++;
                else if (p) { foreign++; oc.set(p, (oc.get(p) || 0) + 1); }
            }
            if (foreign === 0) val += LINE_SCORES[Math.min(mine + 1, 4)] - LINE_SCORES[Math.min(mine, 4)];
            else if (mine === 0 && oc.size === 1) {
                const c = [...oc.values()][0];
                val += EL_DENY * (LINE_SCORES[Math.min(c + 1, 4)] - LINE_SCORES[Math.min(c, 4)]);
            }
        }
        if (val > bestVal) { bestVal = val; bestIdx = i; }
    }
    return bestIdx;
}

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
    // 魔力が有り余っていて撃てるスキルが手札に無い（防壁発動後の+4など）: 魔法使い以外も引き直して探す (AIPlayer.makeMove と同じ)
    if (curChar(s) !== 'magician' && base.length === 0 && curMagic(s) >= SURPLUS_MAGIC) {
        for (let i = 0; i < 2; i++) {
            if (curMagic(s) < SURPLUS_MAGIC) return;
            E.shuffleHand(s);
            if (chooseSkills(s, s.skills).length > 0) return;
        }
        return;
    }
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
    for (const m of moves) if (calculateWinner(lineSyms(simulatePlace(s.board, m, me, s.life))) === me) return false;
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

// 式神(📜)は列の並びに数えない: 列判定ではコマ無し扱い、リーチ/脅威の判定ではその列自体を無効にする
const lineSyms = (board) => board.map((x) => (isShikigami(x) ? undefined : x.player));
const hasShikigami = (board, line) => line.some((idx) => isShikigami(board[idx]));
function symbolsWith(board, i, symbol) {
    const syms = lineSyms(board);
    syms[i] = symbol;
    return syms;
}

function evaluateBoard(board, me) {
    let score = 0;
    for (const line of geometryForCells(board.length).winLines) {
        // 氷結中の空きマスを含むライン（着手不能な4つ目）は完成させられないので評価しない。式神を含むラインも同様
        if (line.some((idx) => thermal.emptyBlocked(board[idx])) || hasShikigami(board, line)) continue;
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
        if (hasShikigami(board, line)) continue;
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
        if (hasShikigami(board, line)) continue;
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
    if (isShikigami(sq) && sq.player !== player && sq.bind <= 0) {
        nb[index] = { player: undefined, bind: 0, effects: [] }; // 式神は乗っ取られると空きマスになる
    } else if (!sq.player) {
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
        if (isShikigami(sq)) nb[index].effects = nb[index].effects.filter((e) => e.effect !== '📜').concat([{ effect: '🌱' }]); // 補強で🌱付きの通常コマ
    }
    return nb;
}

// 巨人のオーラを着手後の盤面に反映する（engine.js giantAura と同じ規則）。着手マスの周囲の敵コマを壊し、周囲を全部ロックする
function applyAuraSim(sim, index, me) {
    const geo = geometryForCells(sim.length);
    const range = geo.surroundRange(index);
    for (const j of range) {
        const sq = sim[j];
        if (!sq.player || sq.player === me || sq.effects.some((e) => e.effect === '🔑') || shield.has(j)) continue;
        const guard = thermal.absorbDestroy(sq);
        sim[j] = guard.blocked ? guard.sq : { player: undefined, bind: 0, effects: [] };
    }
    for (const j of range) {
        const sq = sim[j];
        if (thermal.isFrozen(sq) || sq.effects.some((e) => e.effect === '🔑')) continue;
        sim[j] = { ...sq, bind: sq.player ? sq.bind : Math.max(sq.bind, 1), effects: [...sq.effects, { effect: '🔑' }] };
    }
    return sim;
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
    const winner = calculateWinner(lineSyms(board));
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

/** 土壇場の防壁を持ち、まだ発動していない手番（F.rush）。発動するまでは自駒が全部消えても構わないので守りを捨てて攻める */
function rushActive(s) {
    return !!F.rush && hasGear(s.gears[s.turn], 'lastStand') && !s.lastStandUsed[s.turn];
}
/** 攻めだけの評価: 敵コマが混ざらないラインの自コマ数（敵の脅威は見ない） */
function ownOffense(board, me) {
    let sc = 0;
    for (const line of geometryForCells(board.length).winLines) {
        if (line.some((idx) => thermal.emptyBlocked(board[idx]))) continue;
        let my = 0, enemy = 0, bind = 0;
        for (const idx of line) { const sq = board[idx]; if (sq.player === me) { my++; bind += sq.bind; } else if (sq.player) enemy++; }
        if (enemy === 0) sc += LINE_SCORES[my] + bind * 0.3;
    }
    return sc;
}
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
        if (calculateWinner(lineSyms(simulatePlace(board, i, me, life))) === me) return i;
    }
    // 土壇場の防壁が未発動なら、相手の1回目の勝ちは防壁が受けてくれる(相手の列と自陣が消えるだけ)ので止めに行かず、攻めを続ける(AI_DEFAULTS.lsAggro)
    const lsFree = F.lsAggro && hasGear(s.gears[s.turn], 'lastStand') && !s.lastStandUsed[s.turn];
    if (rushActive(s) && F.rush !== 2) { // rush=2: 着手は通常のまま、スキルによる守りだけ捨てる
        let bi = allMoves[0], bs = -Infinity;
        for (const i of allMoves) {
            const sim = simulatePlace(board, i, me, life);
            let sc = ownOffense(sim, me);
            const reaches = countReaches(sim, me);
            if (reaches >= 2) sc += 200; else if (reaches === 1) sc += 40;
            if (sc > bs) { bs = sc; bi = i; }
        }
        return bi;
    }
    // block opponent win (including captures)
    for (const o of lsFree ? [] : opps) {
        const oppMoves = getMovesFor(board, o, life);
        for (const i of oppMoves) {
            if (calculateWinner(lineSyms(simulatePlace(board, i, o, life))) === o) {
                if (seen[i]) return i;
            }
        }
    }

    // 防壁の発動後(F.spam): 自駒は全部消えて相手の魔力+4・ライフ+2。守りに回っても追いつけないので、相手の即勝ちだけ止めて自分のライン作りに専念する
    if (F.spam && hasGear(s.gears[s.turn], 'lastStand') && s.lastStandUsed[s.turn]) {
        let bi = allMoves[0], bs = -Infinity;
        for (const i of allMoves) {
            const sim = simulatePlace(board, i, me, life);
            let sc = ownOffense(sim, me);
            const reaches = countReaches(sim, me);
            if (reaches >= 2) sc += 200; else if (reaches === 1) sc += 40;
            if (sc > bs) { bs = sc; bi = i; }
        }
        return bi;
    }
    // minimax + fork bonus
    let bestScore = -Infinity;
    let bestMove = allMoves[0];
    for (const i of allMoves) {
        const sim = simulatePlace(board, i, me, life);
        if (F.auraSim && character === 'giant' && sim[i].player === me) applyAuraSim(sim, i, me);
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
        // F.silGlacier=3: サイレンス+絶対零度のコンボ分(両方のコスト)を貯めるまで、他のスキルに魔力を使わない
        if (F.silGlacier === 3 && character === 'cryomancer' && !s.glacierPending[s.turn] && availableSkills.includes(28) && name !== 'silence'
            && board.filter((q) => q.player && q.player !== me && q.bind > 0).length >= (F.glacierMin || 3)
            && remaining - c < glacierCost(s) + calculateCost(s, costsOf(s).onClickSilence, false, false, 'onClickSilence')) return false;
        // 防壁を持つ席は発動前に魔力を温存し(F.hoard)、発動後に一気に使う（相手の魔力+4が積み上がる前に盤面を作り直す）
        if (F.hoard && hasGear(s.gears[s.turn], 'lastStand') && !s.lastStandUsed[s.turn] && remaining - c < F.hoard) return false;
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

    // --- 🍂落ち葉（AIPlayer.ts と同一）---
    // 敵陣の🍂が2枚以上でコストが重いなら焚き火の唄で払う。自陣の🍂が3枚以上たまったら1枚を腐葉土で🌱に。
    // 一葉知秋は、自陣の🌱が多く敵に🌱が無く、相手がスキルに頼っている（魔力が多い）ときだけ（盤面の🌱が全部🍂になる）
    {
        const leafCost = (key) => cost(costsOf(s)[key], false, key);
        if (availableSkills.includes(66) && thermal.leafSurcharge(board, me) >= 2 && thermal.bonfireTargets(board, me).length > 0 && remaining >= leafCost('onClickBonfire')) {
            spend(leafCost('onClickBonfire'), 'bonfire');
        }
        if (availableSkills.includes(67) && thermal.mulchCandidates(board, me).length >= 3 && remaining >= leafCost('onClickMulch')) {
            spend(leafCost('onClickMulch'), 'mulch');
        }
        if (availableSkills.includes(68) && oppMagic >= 6 && myBuds >= 4 && remaining >= leafCost('onClickAutumn')) {
            const enemyBuds = board.reduce((n, sq) => (sq.player && sq.player !== me ? n + thermal.budStacks(sq) : n), 0);
            if (enemyBuds === 0) spend(leafCost('onClickAutumn'), 'autumn');
        }
    }

    // --- トークン系 ---
    const freeCells = findEmptyIndexes(board).length;
    const frostUse = F.useNew || (F.cryoCards && character === 'cryomancer') || (F.cryoPoison && character === 'poisoner');
    // 暫定(F.useNew)/氷室(F.cryoCards): 霜降り(idx48)。ライフ2以下の自陣コマが2つ以上あれば凍らせて減衰から守る
    if (frostUse && availableSkills.includes(48) && thermal.frostfallTargets(board, me).length >= 2 && remaining >= cost(costsOf(s).onClickFrostfall, false, 'onClickFrostfall')) spend(cost(costsOf(s).onClickFrostfall, false, 'onClickFrostfall'), 'frostfall');
    // 霜枯れ: 煉獄の鍛冶師が敵にいるとき、自陣の🍂マスを凍らせて🔥から守る（氷結中は🍂が休眠するので、2マス以上あるときだけ。AIPlayer.ts と同一）
    if (availableSkills.includes(69) && otherSeats(s).some((seat) => s.chars[seat] === 'pyromancer')
        && thermal.leafFrostTargets(board, me).filter((i) => !shield.has(i)).length >= 2 && remaining >= cost(costsOf(s).onClickLeafFrost, false, 'onClickLeafFrost')) {
        spend(cost(costsOf(s).onClickLeafFrost, false, 'onClickLeafFrost'), 'leafFrost');
    }
    // 🍂落ち葉トークン: 自陣の🍂は相手全員のスキルコストを上げる。固有のトークン札を持つキャラ以外は、普通のトークンより先に撃つ
    const leafToken = !tokenUsed && !(character === 'poisoner' || character === 'cryomancer' || character === 'electrician') ? pickLeafToken() : null;
    function pickLeafToken() {
        for (const o of [{ idx: 64, key: 'doubleLeafToken', cost: 'onClickDoubleLeafToken', minFree: 4 }, { idx: 63, key: 'twinLeafToken', cost: 'onClickTwinLeafToken', minFree: 3 }, { idx: 62, key: 'leafToken', cost: 'onClickLeafToken', minFree: 3 }]) {
            if (!availableSkills.includes(o.idx) || freeCells < o.minFree) continue;
            const c = cost(costsOf(s)[o.cost], true, o.cost);
            if (remaining >= c) return { key: o.key, cost: c };
        }
        return null;
    }
    if (leafToken && spend(leafToken.cost, leafToken.key)) {
        // 🍂付きのトークンを撃った（トークンはターンに1回）
    } else if (!tokenUsed) {
        const poisonTokenCost = calculateCost(s, costsOf(s).onClickPoisonToken, true, true, 'onClickPoisonToken');
        const chargeTokenCost = calculateCost(s, costsOf(s).onClickChargeToken, true, false, 'onClickChargeToken');
        if (character === 'poisoner' && availableSkills.includes(16) && remaining >= poisonTokenCost) {
            spend(poisonTokenCost, 'poisonToken');
        } else if (character === 'yinYangMaster' && availableSkills.includes(72) && ownShikigami(s, me).length < F.shMax
            && remaining >= cost(costsOf(s).onClickShikigamiRandom, true, 'onClickShikigamiRandom') + F.shReserve) {
            spend(cost(costsOf(s).onClickShikigamiRandom, true, 'onClickShikigamiRandom'), 'shikigamiRandom');
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

    // 火の車: ランダムな敵マス2つに🔥、その後手札をシャッフルする。手札が変わるので、計画の最後に撃つ（このターン🔥を付与済みなら0コスト。AIPlayer.ts と同一）
    if (availableSkills.includes(75) && thermal.fireWheelTargets(board, me, (sq, i) => shield.has(i) || sq.effects.some((e) => e.effect === '🔑')).length >= 2
        && remaining >= cost(costsOf(s).onClickFireWheel, false, 'onClickFireWheel')) {
        spend(cost(costsOf(s).onClickFireWheel, false, 'onClickFireWheel'), 'fireWheel');
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
    // 陰陽師: 百鬼夜行+式神一括のコンボ札を手札に固定して、揃うまで持ち続ける
    if (character0 === 'yinYangMaster' && F.bloomLoop && curMagic(s) < 14 && (availableSkills.includes(33) || availableSkills.includes(36))) return [36, 33].filter((i) => availableSkills.includes(i)); // 固定の優先順は 風の落とし子 > 刈り入れ前夜
    if (character0 === 'yinYangMaster' && F.floodLock) return availableSkills.filter((i) => i === 71 || i === 73 || (F.comboDiscount && i === 53));
    // トークン系スキル(ポイズントークン等)を手札でロックして、毎手番トークンを撃てるようにする(毒使いのみ)。ギアとは無関係の通常のAI改善。
    // A/B(ギアなし、全キャラ総当たり56組×100試合): 毒使い 0.341→0.402。魔法使いは +0.3pt、巨人 +0.5pt、陰陽師 -2.7pt で対象外。
    // 他キャラは -0.6〜-1.8pt(毒使いが強くなった分)。勝率の幅は 0.276→0.218 に縮んだ。TK_AI=0 で無効化(A/B用)
    const tokenLockAi = TK_AI && TK_CHARS.includes(character0);
    // A/B検証: 固有スキル依存のキャラ(巨人/魔法使い/陰陽師)はロックが不利だったため無効化（魔法使いはトークンを残すため例外）
    if (!tokenLockAi && (character0 === 'giant' || character0 === 'magician' || character0 === 'yinYangMaster')) return [];
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
    const gearTokenIdx = [3, 9, 11, 16, 21, 23]; // 両トークン(4)は相手にもコマを渡すので除く
    const preferred = (idx) => (character === 'tactician' && tokenIdx.includes(idx)) || (character === 'magician' && budsIdx.includes(idx)) || (F.pyroLock && character === 'pyromancer' && PYRO_LOCK.includes(idx))
        || (tokenLockAi && gearTokenIdx.includes(idx));
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
    for (const idx of availableSkills) { if (idx < 0 || idx >= Math.max(POOL_SIZE, 76)) continue; if (preferred(idx) || valued(idx)) locks.push(idx); }
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
    bestRescueCenter.lastThreats = bestThreats;
    return bestIdx;
}


// ---- 陰陽師の式神 ----
// 爆破の価値: 周囲8マスの敵陣(4ダメージで壊れるコマは3、それ以外は1)と、式神になる空きマス(0.5)
function blastValue(s, i, me) {
    const geo = geometryForCells(s.board.length);
    let v = 0;
    for (const j of geo.surroundRange(i)) {
        const sq = s.board[j];
        if (!sq.player) { if (!thermal.emptyBlocked(sq)) v += 0.5; continue; }
        if (sq.player === me || isGuarded(s, sq)) continue;
        if (thermal.isFrozen(sq)) { v += 0.2; continue; }
        v += sq.bind <= SHIKIGAMI_BLAST_DAMAGE ? 3 : 1;
    }
    return v;
}
const ownShikigami = (s, me) => s.board.map((sq, i) => (sq.player === me && isShikigami(sq) ? i : -1)).filter((i) => i >= 0);
// 式神を置く先: 爆破したときの価値が最も高い空きマス
function bestShikigamiCell(s, me) {
    let best = null, bestV = -1;
    s.board.forEach((sq, i) => {
        if (sq.player || thermal.emptyBlocked(sq) || shield.has(i)) return;
        const v = blastValue(s, i, me);
        if (v > bestV) { bestV = v; best = i; }
    });
    return best;
}
// 百鬼夜行→式神一括の実コストの計画。特売(53)が手札にあれば、各スキルの前に特売を重ね撃ちして安くする（特売は1魔力で次のスキルを-3、何回でも撃てる）
function comboPlan(s) {
    const cost = (k) => calculateCost(s, costsOf(s)[k], false, false, k);
    const md = s.skills.includes(53) && F.comboDiscount ? cost('onClickMarkdown') : Infinity;
    const best = (base) => {
        let bm = 0, bt = base;
        for (let m = 1; m <= 4 && md !== Infinity; m++) {
            const t = m * md + Math.max(1, base - 3 * m);
            if (t < bt) { bt = t; bm = m; }
        }
        return { m: bm, total: bt };
    };
    const f = best(cost('onClickShikigamiFlood'));
    const a = best(cost('onClickShikigamiAll'));
    return { floodCasts: f.m, allCasts: a.m, total: f.total + a.total };
}
// 百鬼夜行→式神一括で（手札と魔力に関わらず）自分が勝つ盤面か
function floodComboWins(s, me) {
    const nb = s.board.map((sq) => (!sq.player && !thermal.emptyBlocked(sq) ? { player: me, bind: 0, effects: [] }
        : (sq.player === me && isShikigami(sq) ? { ...sq, effects: sq.effects.filter((e) => e.effect !== '📜') } : sq)));
    return calculateWinner(lineSyms(nb)) === me;
}
// 陰陽師の1手番の式神運用。陽で爆破できるなら転化して爆破、陰なら式神を置いて貯める。何か撃ったら true
function shikigamiTurn(s, me) {
    let acted = false;
    const costOf = (key) => calculateCost(s, costsOf(s)[key], false, false, key);
    // 百鬼夜行(73)+式神一括(71): 全ての空きマスをライフ0の自コマにして、列が完成するなら一手番で勝つ
    if (s.skills.includes(73) && s.skills.includes(71)) {
        const plan = comboPlan(s);
        if (curMagic(s) >= plan.total) {
            if (floodComboWins(s, me)) {
                for (let k = 0; k < plan.floodCasts; k++) SKILLS.markdown(s);
                SKILLS.shikigamiFlood(s);
                for (let k = 0; k < plan.allCasts; k++) SKILLS.markdown(s);
                SKILLS.shikigamiAll(s);
                settleWinner(s);
                return true;
            }
        }
    }
    // 式神一括(idx 71)コンボ: 同じ列に自コマ+式神(+空き)で4つ揃えられ、置く分+一括の魔力があるなら、
    // 空きマスに式神を置いて一括で通常のコマに戻し、その手番に列を完成させる(式神は列に数えないので相手は警戒しない)
    if (s.skills.includes(71) && !s.useShikigamiPlace) {
        const placeCost = costOf('onClickShikigamiPlace');
        const allCost = costOf('onClickShikigamiAll');
        const toggleCost = costOf('onClickToggleYingYang');
        const mode = s.yy[s.turn];
        let bestLine = null;
        for (const line of geometryForCells(s.board.length).winLines) {
            let real = 0, shiki = 0; const empties = []; let bad = false;
            for (const idx of line) {
                const sq = s.board[idx];
                if (sq.player === me) { if (isShikigami(sq)) shiki++; else real++; }
                else if (sq.player) bad = true;
                else if (thermal.emptyBlocked(sq) || (sq.effects.some((e) => e.effect === '🔑') && sq.bind > 0) || shield.has(idx)) bad = true;
                else empties.push(idx);
            }
            if (bad || real < F.shComboReal || shiki + empties.length === 0) continue;
            const total = empties.length * placeCost + allCost + (empties.length > 0 && mode === 'yang' ? toggleCost : 0);
            if (curMagic(s) < total) continue;
            if (!bestLine || empties.length < bestLine.empties.length) bestLine = { empties, total };
        }
        if (bestLine) {
            if (bestLine.empties.length > 0 && s.yy[s.turn] === 'yang') SKILLS.toggleYY(s);
            for (const cell of bestLine.empties) { SKILLS.shikigamiPlace(s); placeMove(s, cell); }
            SKILLS.shikigamiAll(s);
            settleWinner(s);
            return true;
        }
    }
    for (let guard = 0; guard < 3; guard++) {
        const mine = ownShikigami(s, me);
        const mode = s.yy[s.turn];
        const best = mine.map((i) => ({ i, v: blastValue(s, i, me) })).sort((a, b) => b.v - a.v)[0];
        const worth = best && best.v >= F.shBlastMin;
        const blastCost = costOf('onClickShikigamiBlast') + (mode === 'ying' ? 1 : 0); // 陰からは転化(1)+陽のコスト+1が掛かる
        const toggleCost = costOf('onClickToggleYingYang');
        if (worth && curMagic(s) >= blastCost + toggleCost * (mode === 'ying' ? 1 : 0)) {
            if (mode === 'ying') SKILLS.toggleYY(s);
            SKILLS.shikigamiBlast(s);
            placeMove(s, best.i);
            acted = true;
            continue;
        }
        if (mode === 'yang' && !worth && mine.length === 0) {
            if (curMagic(s) >= toggleCost) { SKILLS.toggleYY(s); acted = true; } // 爆破する式神が無いので陰に戻って貯める
            break;
        }
        if (worth) break; // 爆破できる式神があるなら、魔力を貯めて爆破に備える
        if (mode === 'ying' && mine.length < F.shMax && curMagic(s) >= costOf('onClickShikigamiPlace') + F.shReserve) {
            const cell = bestShikigamiCell(s, me);
            if (cell === null) break;
            SKILLS.shikigamiPlace(s);
            placeMove(s, cell);
            acted = true;
            continue;
        }
        break;
    }
    return acted;
}

/** New faithful mode: enhanced AI with skills + minimax (mirrors current AIPlayer.ts) */
// 対象選択に失敗したスキルの待ち状態（氷結・ロック・ひこばえ・火炎付与）が次の着手を塞がないよう、手を返す前に必ず解く
function clearPending(s) {
    s.useShikigamiPlace = false; s.useShikigamiBlast = false; s.useFreeze = false; s.useLock = 0; s.useSucker = false; s.useIgnite = false; s.useSwidden = false; s.useSacrifice = false; s.useKimon = false; s.useFrostArea = false; s.useIcicle = false; s.useFrostSpread = false; s.useShatter = false;
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
    const rush = rushActive(s); // 土壇場の防壁(F.rush): 発動までは守らず攻める。相手のリーチを無視する
    const threats = rush ? [] : Array.from(new Set(opps.flatMap((o) => findThreatSquares(s.board, o))));
    // 巨人(F.stompDef): 相手にリーチがあるとき、ストンプ（コスト低・着手も兼ねる）で脅威を減らせるなら先に撃つ
    if (F.stompDef && threats.length >= 1 && curChar(s) === 'giant' && curMagic(s) >= calculateCost(s, costsOf(s).onClickStomp, false, false, 'onClickStomp')) {
        const t = bestRescueCenter(s.board, me, opps, 'stomp');
        if (t !== null && bestRescueCenter.lastThreats < threats.length) {
            SKILLS.stomp(s);
            placeMove(s, t);
            const mv = getEnhancedBestMove(s);
            return { move: mv, turnEnded: false };
        }
    }
    // 対雷霆の巫(F.freezeCharge): 氷結中の⚡は休眠する（無敵・発火が働かない）。敵の⚡付きでロックされていないコマを、脅威が無く魔力に余裕があるとき凍らせる
    if (F.freezeCharge && curChar(s) === 'cryomancer' && !s.silenced[s.turn] && threats.length === 0) {
        for (let k = 0; k < (F.freezeChargeMax || 2); k++) {
            const fz = calculateCost(s, costsOf(s).onClickCryoFreeze, false, false, 'onClickCryoFreeze');
            if (curMagic(s) < fz + (F.freezeChargeReserve || 0)) break;
            const cell = s.board.findIndex((sq, i) => isEnemy(sq.player, me) && s.chars[SYMBOLS.indexOf(sq.player)] === 'electrician' && sq.effects.some((e) => e.effect === '⚡') && !thermal.isFrozen(sq) && thermal.canFreeze(sq));
            if (cell === -1) break;
            SKILLS.lock(s);
            if (!placeMove(s, cell)) { s.useFreeze = false; s.useLock = 0; break; }
        }
    }
    // 対毒使い(F.antiPoison): 氷結中のマスの毒は継続ダメージを与えない。毒で倒れる（毒≥ライフ）自陣のコマを、魔力に余裕があるとき先に凍らせる
    if (F.antiPoison && curChar(s) === 'cryomancer' && !s.silenced[s.turn] && threats.length === 0) {
        for (let k = 0; k < (F.antiPoisonMax || 2); k++) {
            const fz = calculateCost(s, costsOf(s).onClickCryoFreeze, false, false, 'onClickCryoFreeze');
            if (curMagic(s) < fz + (F.antiPoisonReserve || 0)) break;
            const cell = s.board.findIndex((sq, i) => {
                if (sq.player !== me || shield.has(i) || thermal.isFrozen(sq) || !thermal.canFreeze(sq)) return false;
                const p = sq.effects.filter((e) => e.effect === '☠').length;
                return p > 0 && p >= sq.bind - (F.antiPoisonMargin || 0);
            });
            if (cell === -1) break;
            SKILLS.lock(s);
            if (!placeMove(s, cell)) { s.useFreeze = false; s.useLock = 0; break; }
        }
    }
    // 対魔法使い(F.antiJudge): 相手の審判の日が撃てる魔力なら、その最善の中心の範囲にある自陣コマを先に氷結する。
    // 氷結中のコマは❄1つが身代わりになって壊れない。魔法使いAIは範囲内の氷結中コマを数えず、net<2 になれば撃たない（bestJudgeTarget）
    if (F.antiJudge && curChar(s) === 'cryomancer' && !s.silenced[s.turn]) {
        const geo = geometryForCells(s.board.length);
        for (const seat of otherSeats(s)) {
            if (s.chars[seat] !== 'magician') continue;
            const jBase = Math.max(0, costsOf(s).onClickJudgeDay - s.useMagicCount[seat]);
            if (s.magic[seat] + 1 < jBase) continue;
            for (let k = 0; k < (F.antiJudgeMax || 3); k++) {
                const target = bestJudgeTarget(s.board, SYMBOLS[seat]);
                if (target === null) break;
                const fz = calculateCost(s, costsOf(s).onClickCryoFreeze, false, false, 'onClickCryoFreeze');
                if (curMagic(s) < fz + (F.antiJudgeReserve || 0)) break;
                const cell = geo.judgeRange(target).find((i) => s.board[i].player === me && !shield.has(i) && !thermal.isFrozen(s.board[i]) && thermal.canFreeze(s.board[i]));
                if (cell === undefined) break;
                SKILLS.lock(s);
                if (!placeMove(s, cell)) { s.useFreeze = false; s.useLock = 0; break; }
            }
        }
    }
    // 対バッズ(F.freezeBuds): 氷結中の🌱は休眠して魔力を生まない。敵の🌱付きでロックされていないコマを、脅威が無く魔力に余裕があるとき凍らせる
    if (F.freezeBuds && curChar(s) === 'cryomancer' && !s.silenced[s.turn] && threats.length === 0) {
        for (let k = 0; k < (F.freezeBudsMax || 2); k++) {
            const fz = calculateCost(s, costsOf(s).onClickCryoFreeze, false, false, 'onClickCryoFreeze');
            if (curMagic(s) < fz + (F.freezeBudsReserve === undefined ? 3 : F.freezeBudsReserve)) break;
            const cell = s.board.findIndex((sq, i) => isEnemy(sq.player, me) && s.chars[SYMBOLS.indexOf(sq.player)] === (F.freezeBudsVs || 'magician') && !shield.has(i) && thermal.budStacks(sq) > 0 && !thermal.isFrozen(sq) && thermal.canFreeze(sq));
            if (cell === -1) break;
            SKILLS.lock(s);
            if (!placeMove(s, cell)) { s.useFreeze = false; s.useLock = 0; break; }
        }
    }
    // 彩りの庭(F.garden): 氷室の番人が🌱のある自陣コマを氷結して「2種類以上のエフェクトのマス」を作り、ターン開始の魔力を稼ぐ。
    // 氷結中のコマには🌱を足せないので、🌱が先・氷結が後。敵の脅威が無く魔力に余裕(F.gardenReserve)があるときだけ
    if (F.garden && curChar(s) === 'cryomancer' && gearAi(s, 'colorGarden') && threats.length === 0 && !s.silenced[s.turn]) {
        for (let k = 0; k < (F.gardenMax || 2); k++) {
            const fz = calculateCost(s, costsOf(s).onClickCryoFreeze, false, false, 'onClickCryoFreeze');
            if (curMagic(s) < fz + (F.gardenReserve === undefined ? 3 : F.gardenReserve)) break;
            const cell = s.board.findIndex((sq, i) => sq.player === me && !shield.has(i) && thermal.budStacks(sq) > 0 && !thermal.isFrozen(sq) && thermal.canFreeze(sq));
            if (cell === -1) break;
            SKILLS.lock(s);
            if (!placeMove(s, cell)) { s.useFreeze = false; s.useLock = 0; break; }
        }
    }
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
    if (!rush && curChar(s) !== 'tactician' && curChar(s) !== 'poisoner'
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

    // 煉獄の鍛冶師 固有の火遁: 敵コマを燃やす。異なるスキル3種類で業火が無料になるので、その1種類にもなる
    const igniteSkipChars = F.igniteSkip >= 2 ? ['necromancer', 'poisoner'] : F.igniteSkip === 1 ? ['necromancer'] : [];
    if (F.igniteSig && curChar(s) === 'pyromancer' && !s.silenced[s.turn] && !s.skillKinds[s.turn].has('onClickIgnite')
        && !otherSeats(s).some((seat) => igniteSkipChars.includes(s.chars[seat]))
        && curMagic(s) >= calculateCost(s, costsOf(s).onClickIgnite, false, false, 'onClickIgnite') + F.igniteReserve
        // 業火が今撃てるなら、火遁で魔力を使って業火を撃てなくしない
        && !(s.board.filter((sq) => sq.player && sq.player !== me && sq.bind > 0).length >= 3 && infernoTargets(s).length > 0 && curMagic(s) >= infernoCost(s)
            && curMagic(s) - calculateCost(s, costsOf(s).onClickIgnite, false, false, 'onClickIgnite') < infernoCost(s))) {
        const t = bestIgniteTarget(s, me, F.igniteSig);
        if (t !== null) { SKILLS.ignite(s); placeMove(s, t); updateShield(s); }
    }

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
    // F.silGlacier: サイレンス(idx28)を先に撃って、凍結中の相手がスキルで解凍・反撃できないようにしてから撃つ。
    // =2: 手札にサイレンスがあれば、両方の魔力が貯まるまで絶対零度を待つ
    if (curChar(s) === 'cryomancer' && !s.glacierPending[s.turn] && !s.silenced[s.turn]
        && s.board.filter((sq) => sq.player && sq.player !== me && sq.bind > 0).length >= (F.glacierMin || 3)) {
        const gc = glacierCost(s);
        const sc = calculateCost(s, costsOf(s).onClickSilence, false, false, 'onClickSilence');
        const hasSil = F.silGlacier && availableSkills.includes(28) && otherSeats(s).some((seat) => !s.silenced[seat]);
        if (hasSil && curMagic(s) >= gc + sc) { SKILLS.silence(s); SKILLS.glacier(s); }
        else if (curMagic(s) >= gc && !(hasSil && F.silGlacier === 2)) SKILLS.glacier(s);
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

    // 鬼門封じ: 敵のラインの要のコマを破壊して、その空きマスを3ターンロックする。自分に勝ち手があるときは温存（AIPlayer.ts と同一）
    if (availableSkills.includes(74) && magic >= calculateCost(s, costsOf(s).onClickKimon, false, false, 'onClickKimon') && countReaches(s.board, me) === 0) {
        const target = bestKimonTarget(s.board, me, 50);
        if (target !== null) {
            SKILLS.kimon(s);
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

    // 空蔵: 空きマスにかけたロックが切れると自陣のコマ(ライフ1)になる。自分の列の要になる空きマスを先にロックしておく。
    // ロック中は敵も置けないので、敵の列を止める効果もある。ロックは6ターンで切れ、そのとき自分のコマになる。
    // EL_AI=0 で無効化(A/B用)
    if (EL_AI && (hasGear(s.gears[s.turn], 'emptyLock') || s.forceAi[s.turn].includes('emptyLock')) && countReaches(s.board, me) === 0
        && magic >= calculateCost(s, costsOf(s).onClickUseLock)
        && myEmptyLocks(s) < EL_MAX) {
        const target = bestEmptyLockTarget(s.board, me, opps);
        if (target !== null) {
            SKILLS.lock(s);
            placeMove(s, target);
            return { move: getEnhancedBestMove(s), turnEnded: false };
        }
    }

    // 毒使い×毒花: 毒を自陣のコマに盛るとバッズ(魔力の元)が付き、ミアズマでその毒を敵に送れる。
    // インジェクションが手札にあるとき、敵に隣接する自コマ(毒で消えない程度のライフ)に積極的に毒を盛る。
    // 自陣の毒マスが多すぎると自コマが毒で消えるので上限を設ける。BLOOM_AI=0 で無効化(A/B用)
    if (ch0 === 'poisoner' && BLOOM_AI && hasGear(s.gears[s.turn], 'toxicBloom') && availableSkills.includes(15)
        && magic >= calculateCost(s, costsOf(s).onClickInjection, false, true) && countReaches(s.board, me) === 0
        && poisonCountFor(s.board, me) < BLOOM_MAX_OWN_POISON) {
        const geo = geometryForCells(s.board.length);
        let best = null, bestScore = -1;
        s.board.forEach((sq, i) => {
            if (sq.player !== me || shield.has(i) || sq.effects.some((e) => e.effect === '🔑')) return;
            const own = sq.effects.filter((e) => e.effect === '☠').length;
            if (sq.bind < BLOOM_MIN_BIND + own) return; // 毒で次々に削れるので、ライフに余裕があるコマだけ
            const n = geo.surroundRange(i).filter((j) => isEnemy(s.board[j].player, me) && !s.board[j].effects.some((e) => e.effect === '🔑')).length;
            const score = n * 10 + sq.bind - own * 5; // 敵に近いコマ優先。同じコマに毒を重ねない
            if (score > bestScore) { bestScore = score; best = i; }
        });
        if (best !== null) {
            SKILLS.injection(s);
            placeMove(s, best);
            const move = getEnhancedBestMove(s);
            return { move, turnEnded: false };
        }
    }

    // 陰陽師(F.shuffleDig): 魔力が「コンボ分+引き直し分」あり、百鬼夜行→式神一括で勝てる盤面なら、1コストで手札を引き直してコンボ札を探す
    if (F.shuffleDig && curChar(s) === 'yinYangMaster' && !s.silenced[s.turn] && !(s.skills.includes(71) && s.skills.includes(73))) {
        const cost = (k) => calculateCost(s, costsOf(s)[k], false, false, k);
        const need = comboPlan(s).total;
        if (floodComboWins(s, me)) {
            for (let k = 0; k < F.shuffleDig && curMagic(s) >= need + costsOf(s).onClickShuffle && !(s.skills.includes(71) && s.skills.includes(73)); k++) {
                E.shuffleHand(s);
                s.digShuffles = (s.digShuffles || 0) + 1;
            }
            availableSkills = s.skills.slice();
        }
    }
    // 陰陽師(検証用 F.bloomLoop): 風の落とし子→刈り入れ前夜の周回で魔力を稼ぐ(issue #160。連鎖割引・病炎の契りで1周のコストが獲得を下回るとき)
    if (F.bloomLoop && curChar(s) === 'yinYangMaster' && !s.silenced[s.turn]) {
        const cost = (k) => calculateCost(s, costsOf(s)[k], false, false, k);
        // 魔力が F.loopMin 以上なら、2枚（風の落とし子・刈り入れ前夜）が揃うまで1コストで手札を引き直して探す
        if (F.loopDig) {
            for (let k = 0; k < F.loopDig && curMagic(s) >= F.loopMin && !(s.skills.includes(33) && s.skills.includes(36)); k++) E.shuffleHand(s);
            availableSkills = s.skills.slice();
        }
        for (let k = 0; k < F.bloomLoop && s.skills.includes(33) && s.skills.includes(36); k++) {
            if (curMagic(s) < cost('onClickWindborne') + cost('onClickHarvestEve') || thermal.sowCandidates(s.board, me).length === 0) break;
            const before = curMagic(s);
            SKILLS.windborne(s);
            SKILLS.harvestEve(s);
            if (curMagic(s) <= before) break; // 増えないなら止める
            s.loopCycles = (s.loopCycles || 0) + 1;
            if (curMagic(s) >= 16) break;
        }
    }
    // 陰陽師: コンボ札を持っていて魔力が足りないうちは、他のスキルに魔力を使わず貯める(F.floodHold: 1=両札が手札 2=どちらかが手札)
    const holdFlood = curChar(s) === 'yinYangMaster' && F.floodHold
        && (F.floodHold >= 2 ? (s.skills.includes(71) || s.skills.includes(73)) : (s.skills.includes(71) && s.skills.includes(73)))
        && curMagic(s) < comboPlan(s).total;
    // 陰陽師: 式神の設置・転化・爆破
    if (curChar(s) === 'yinYangMaster' && !s.silenced[s.turn] && (holdFlood ? false : shikigamiTurn(s, me))) {
        if (s.winner) return { move: null, turnEnded: true };
        updateShield(s);
        const move = getEnhancedBestMove(s);
        return { move, turnEnded: false };
    }

    // 巨人ストンプ / 魔法使い審判の日: 範囲破壊スキル (相手リーチが無いときに狙う)
    const oppReaches = opps.reduce((n, o) => n + countReaches(s.board, o), 0);
    if (oppReaches === 0) {
        const ch = curChar(s);
        if (ch === 'giant' && magic >= calculateCost(s, costsOf(s).onClickStomp, false, false, 'onClickStomp')) {
            const target = bestStompTarget(s.board, me, F.stompMin);
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
        if (ch === 'magician' || (ch === 'yinYangMaster' && F.yyBudLock)) {
            // 1手番に複数のバッズ駒をロックしてよい（魔力が許す限り最大 magLockN 個）。本番は AIPlayer.ts の MAGICIAN_MAX_LOCKS
            let locked = 0;
            while (locked < (ch === 'magician' ? F.magLockN : F.yyBudLock)) {
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

    const skills = holdFlood && oppReaches === 0 ? [] : chooseSkills(s, availableSkills);
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
