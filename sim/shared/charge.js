// 自動生成: src/components/game/charge.ts (node scripts/gen-sim-shared.js)。手で編集しない。
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.healCharged = exports.CHARGE_HEAL = exports.applyOverload = exports.isFullyCharged = exports.applyJammer = exports.jammerTargets = exports.canJam = exports.randomChargeCandidates = exports.reducedChargeCost = exports.boardChargeCount = exports.withCharge = exports.landCharge = exports.addCharge = exports.CHARGE_LANDING_DAMAGE = exports.connectedPieces = exports.releaseCharges = exports.fireCharges = exports.FIRE_DAMAGE = exports.shieldedCells = exports.isGuarded = exports.isShielded = exports.chargeStacks = exports.orthoNeighbors = void 0;
const Player_1 = require("./Player");
const skillCosts_1 = require("./skillCosts");
const boardGeometry_1 = require("./boardGeometry");
Object.defineProperty(exports, "orthoNeighbors", { enumerable: true, get: function () { return boardGeometry_1.orthoNeighbors; } });
const thermal_1 = require("./thermal");
const charOf = (chars, player) => chars[(0, Player_1.seatOf)(player)];
/** ⚡の個数（スタック数） */
const chargeStacks = (sq) => sq.effects.filter((e) => e.effect === '⚡').length;
exports.chargeStacks = chargeStacks;
const hasLock = (sq) => sq.effects.some((e) => e.effect === '🔑');
/** 雷霆の巫の⚡付き自陣マスは「無敵」。弱点として本人も含め誰も触れない */
const isShielded = (sq, chars) => !!sq.player && charOf(chars, sq.player) === 'electrician' && (0, exports.chargeStacks)(sq) > 0 && !(0, thermal_1.isDormant)(sq); // 休眠マス（氷結中・火炎中）は⚡が休眠して無敵も働かない
exports.isShielded = isShielded;
/** 🔑ロックまたは⚡の無敵＝ダメージ系スキルの対象外にするマス */
const isGuarded = (sq, chars) => hasLock(sq) || (0, exports.isShielded)(sq, chars);
exports.isGuarded = isGuarded;
/** 無敵マスの添字集合 */
const shieldedCells = (board, chars) => board.map((sq, i) => ((0, exports.isShielded)(sq, chars) ? i : -1)).filter((i) => i !== -1);
exports.shieldedCells = shieldedCells;
/** 発火で隣のコマが受けるダメージ。sim は A/B 検証用に fireCharges の damage 引数で上書きする（CHG_FIRE_DMG） */
exports.FIRE_DAMAGE = 1;
/**
 * 着手マス i の隣にある⚡を発火させる（size は盤の一辺。board を直接書き換える）。
 * 発火した帯電マス k の縦横隣接のうち、ライフ>0・🔑なしのコマが1ダメージ（k 自身は対象外、
 * 着手したコマが k の隣ならそれも含む）。発火した k の⚡は全部消える。連鎖はしない。
 * ギア「伝導」: conductors[席] が真の席のコマが載った帯電マス k に☠/🔥が付いていれば、ダメージを受けた**敵**（k のコマの持ち主以外）のマスに同じ効果を1スタックずつ付与する（🔥は ignite の規則どおり）。
 */
const fireCharges = (board, i, size, chars = [], conductors = [], damage = exports.FIRE_DAMAGE) => {
    const fired = [];
    const damaged = [];
    const carried = [];
    for (const k of (0, boardGeometry_1.orthoNeighbors)(i, size)) {
        if ((0, exports.chargeStacks)(board[k]) === 0 || (0, thermal_1.isDormant)(board[k]))
            continue; // 休眠マスの⚡は発火源にならない（発火せず消えもしない）
        fired.push(k);
        for (const n of (0, boardGeometry_1.orthoNeighbors)(k, size)) {
            const sq = board[n];
            if (!sq.player || sq.bind <= 0)
                continue;
            if (hasLock(sq))
                continue; // ロックは貫通しない
            if ((0, thermal_1.isFrozen)(sq))
                continue; // 氷結中のマスは隣接⚡のダメージを受けない
            // 雷霆の巫は、自陣由来（自分のコマが載っている⚡マス）の発火ダメージを受けない
            if (sq.player === board[k].player && chars[(0, Player_1.seatOf)(sq.player)] === 'electrician')
                continue;
            board[n] = (0, thermal_1.applyDamage)(sq, damage, 'electric').sq; // 隣接⚡のダメージは氷結中のマスには通らない。🔥は消えない（帯電と火炎は重複する）
            damaged.push(n);
            // 帯電していたコマの毒・火炎を、ダメージを受けた敵のマスへ1スタック移す
            const owner = board[k].player;
            if (owner && sq.player !== owner && conductors[(0, Player_1.seatOf)(owner)]) {
                const before = board[n].effects.length;
                if (board[k].effects.some((e) => e.effect === '☠'))
                    board[n] = { ...board[n], effects: [...board[n].effects, { effect: '☠' }] };
                if (board[k].effects.some((e) => e.effect === '🔥'))
                    (0, thermal_1.ignite)(board, [n], size);
                if (board[n].effects.length !== before || !board[n].player)
                    carried.push(n);
            }
        }
        board[k] = { ...board[k], effects: board[k].effects.filter((e) => e.effect !== '⚡') };
    }
    return { fired, damaged, carried };
};
exports.fireCharges = fireCharges;
/**
 * 落雷は忘れた頃に: player の自陣のコマの⚡をすべて取り除き、取り除いた数だけ、敵の全コマにダメージを与える（ライフは0まで。破壊はしない）。
 * ライフ0のコマ・🔑ロック・⚡の無敵コマ・氷結中のコマ（隣接⚡のダメージと同じく通らない）は受けない。board を直接書き換える。sim/engine.js の releaseCharges と同じ
 */
const releaseCharges = (board, player, chars) => {
    const from = [];
    let removed = 0;
    board.forEach((sq, i) => {
        if (sq.player !== player || (0, exports.chargeStacks)(sq) === 0)
            return;
        removed += (0, exports.chargeStacks)(sq);
        from.push(i);
        board[i] = { ...sq, effects: sq.effects.filter((e) => e.effect !== '⚡') };
    });
    const damaged = [];
    if (removed === 0)
        return { removed, from, damaged };
    board.forEach((sq, i) => {
        if (!sq.player || sq.player === player || sq.bind <= 0 || (0, thermal_1.isFrozen)(sq) || (0, exports.isGuarded)(sq, chars))
            return;
        board[i] = (0, thermal_1.applyDamage)(sq, removed, 'electric').sq;
        damaged.push(i);
    });
    return { removed, from, damaged };
};
exports.releaseCharges = releaseCharges;
/** 固有スキル: start から、コマのあるマスだけを縦横に辿って届くすべてのマス（start 自身を含む）。空きマスなら [] */
const connectedPieces = (board, start, size) => {
    if (!board[start].player)
        return [];
    const seen = new Set([start]);
    const queue = [start];
    while (queue.length > 0) {
        const cur = queue.shift();
        for (const n of (0, boardGeometry_1.orthoNeighbors)(cur, size)) {
            if (!seen.has(n) && board[n].player) {
                seen.add(n);
                queue.push(n);
            }
        }
    }
    return Array.from(seen);
};
exports.connectedPieces = connectedPieces;
/** 雷霆の巫以外のコマは、⚡が乗った時点でこのダメージを受ける。sim/engine.js の CHARGE_LANDING_DAMAGE と同値 */
exports.CHARGE_LANDING_DAMAGE = 2;
/**
 * ⚡を1つ付与したマスを返す（元のマスは変更しない）。雷霆の巫以外のコマは付いた時点で2ダメージ
 * （ライフ0・🔑ロック中・氷結中のコマと空きマスは受けない。🔥は消えない）。トークンは ⚡ 付きで作ったマスに landCharge をかける
 */
const addCharge = (sq, chars) => (0, exports.landCharge)({ ...sq, effects: [...sq.effects, { effect: '⚡' }] }, chars);
exports.addCharge = addCharge;
/** すでに⚡が乗ったマスに、乗った時点のダメージ（addCharge の後半）だけをかける */
const landCharge = (sq, chars) => {
    if (!sq.player || sq.bind <= 0 || hasLock(sq) || chars[(0, Player_1.seatOf)(sq.player)] === 'electrician')
        return sq;
    return (0, thermal_1.applyDamage)(sq, exports.CHARGE_LANDING_DAMAGE, 'electric').sq;
};
exports.landCharge = landCharge;
/** 指定マスに⚡を1つずつ付与した新しい盤面を返す（元の盤面は変更しない） */
const withCharge = (board, cells, chars) => {
    const next = board.slice();
    for (const k of cells)
        next[k] = (0, exports.addCharge)(next[k], chars);
    return next;
};
exports.withCharge = withCharge;
/** 盤面全体の⚡の数（スタック込み）。sim/engine.js の boardChargeCount と同じ */
const boardChargeCount = (board) => board.reduce((n, sq) => ((0, thermal_1.isDormant)(sq) ? n : n + (0, exports.chargeStacks)(sq)), 0); // 休眠マスの⚡は数えない
exports.boardChargeCount = boardChargeCount;
/**
 * 帯電付与・帯電拡散の実コスト: 盤面の⚡の数だけ基礎コストを軽減してからキャラ補正（calc）をかけ、
 * 下限は CHARGE_MIN_COST (#43)。sim/engine.js の chargeOneCost / chargeSpreadCost と同じ
 */
const reducedChargeCost = (baseCost, board, calc) => Math.max(skillCosts_1.CHARGE_MIN_COST, calc(baseCost - (0, exports.boardChargeCount)(board)));
exports.reducedChargeCost = reducedChargeCost;
/** ランダム帯電の候補マス: 空きマス含む全マスから、無敵マスと🔑ロック中のマスを除く */
const randomChargeCandidates = (board, chars) => board.map((sq, i) => (!(0, exports.isShielded)(sq, chars) && !hasLock(sq) ? i : -1)).filter((i) => i !== -1);
exports.randomChargeCandidates = randomChargeCandidates;
/** ジャマーが選べるマスか: ⚡があり、無敵マスなら自分のものだけ（弱点を解く唯一の手段）。他人の無敵マスは不可 */
const canJam = (board, i, current, chars) => (0, exports.chargeStacks)(board[i]) > 0 && !(0, thermal_1.isDormant)(board[i]) && !((0, exports.isShielded)(board[i], chars) && board[i].player !== current);
exports.canJam = canJam;
/** ジャマーのダメージ対象: i の縦横隣接の敵コマ（ライフ>0・🔑なし。current 以外のコマ） */
const jammerTargets = (board, i, size, current) => (0, boardGeometry_1.orthoNeighbors)(i, size).filter((j) => {
    const sq = board[j];
    return !!sq.player && sq.player !== current && sq.bind > 0 && !hasLock(sq) && !(0, thermal_1.isFrozen)(sq);
});
exports.jammerTargets = jammerTargets;
/**
 * ジャマー: i の⚡のスタック数ぶん、縦横隣接の敵コマのライフを減らし（最小0）、i の⚡を全部消す。
 * 自分のコマ・🔑付きのコマは対象外。board を直接書き換える。sim/engine.js の exeJammer と同じ
 */
const applyJammer = (board, i, size, current) => {
    const stacks = (0, exports.chargeStacks)(board[i]);
    const damaged = (0, exports.jammerTargets)(board, i, size, current);
    const zeroed = [];
    for (const j of damaged) {
        // ジャマーの電気ダメージも氷結を貫通する
        board[j] = (0, thermal_1.applyDamage)(board[j], stacks, 'electric').sq;
        if (board[j].bind === 0)
            zeroed.push(j);
    }
    board[i] = { ...board[i], effects: board[i].effects.filter((e) => e.effect !== '⚡') };
    return { damaged, zeroed };
};
exports.applyJammer = applyJammer;
/** 全マス（空きマス含む）に⚡が1つ以上あるか。sim/engine.js checkDischarge の判定と同じ */
const isFullyCharged = (board) => board.length > 0 && board.every((sq) => (0, exports.chargeStacks)(sq) > 0 && !(0, thermal_1.isDormant)(sq));
exports.isFullyCharged = isFullyCharged;
/**
 * 過負荷: 全マスが⚡で埋まっていたら、全⚡と全🔑を取り除き、全マスのライフを0にした新しい盤面を返す。
 * 埋まっていなければ同じ盤面をそのまま返す（元の盤面は変更しない）。sim/engine.js の checkDischarge が同仕様になる想定（ロックも解除）
 */
const applyOverload = (board) => {
    if (!(0, exports.isFullyCharged)(board))
        return board;
    return board.map((sq) => ({
        ...sq,
        effects: sq.effects.filter((e) => e.effect !== '⚡' && e.effect !== '🔑'),
        bind: 0,
    }));
};
exports.applyOverload = applyOverload;
/**
 * 雷を食らわば皿まで: player の⚡が効いているコマ（休眠中を除く）のライフを、⚡のスタック1つにつき +CHARGE_HEAL する。
 * board を直接書き換え、回復したコマと合計回復量を返す。ライフ0のコマも回復する
 */
exports.CHARGE_HEAL = 2;
const healCharged = (board, player) => {
    const healed = [];
    let total = 0;
    board.forEach((sq, i) => {
        if (sq.player !== player || (0, thermal_1.isDormant)(sq))
            return;
        const stacks = (0, exports.chargeStacks)(sq);
        if (stacks === 0)
            return;
        board[i] = { ...sq, bind: sq.bind + stacks * exports.CHARGE_HEAL };
        healed.push(i);
        total += stacks * exports.CHARGE_HEAL;
    });
    return { healed, total };
};
exports.healCharged = healCharged;
