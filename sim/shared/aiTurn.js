// 自動生成: src/components/game/aiTurn.ts (node scripts/gen-sim-shared.js)。手で編集しない。
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveMoveCell = exports.canPlaceAt = exports.planAITurn = exports.maxOppMagic = void 0;
const AIPlayer_1 = require("./AIPlayer");
const lifeBan_1 = require("./lifeBan");
const thermal_1 = require("./thermal");
const charge_1 = require("./charge");
/** ステップ列が手番を終えない（最後が着手でもターン終了スキルでもない）なら、チャージでパスするステップを足す */
const endsTurn = (steps) => {
    const last = steps[steps.length - 1];
    const ends = typeof last === 'number' || (typeof last === 'string' && AIPlayer_1.TURN_ENDING_SKILLS.includes(last));
    return ends ? steps : [...steps, 'onClickCharge'];
};
/** 全員の魔力のうち、自分以外で最大の値（敵が複数いても最も魔力の多い相手を基準にする） */
const maxOppMagic = (magic, seat) => Math.max(...magic.filter((_, i) => i !== seat));
exports.maxOppMagic = maxOppMagic;
/**
 * AIに手番開始時の状態を渡し、この手番の計画を作る。
 * @param pickHailMary 詰みのヘイルメアリーで当選させるスキル名を選ぶ（本番は Game の抽選、sim は rng）
 */
const planAITurn = (ai, input, pickHailMary) => {
    var _a;
    const { board, seat, life } = input;
    const oppMagic = (0, exports.maxOppMagic)(input.magic, seat);
    ai.placements = input.placements;
    ai.seatCount = input.seatCount;
    ai.lastStandReady = input.lastStandReady;
    ai.tokenFree = input.tokenFree;
    // 裸の王様の判断材料: 相手の有効なギアの数と、使える土壇場の防壁を持つ相手がいるか
    ai.chargeBuffActive = input.chargeBuffActive;
    ai.oppGearCount = input.oppGearCount;
    ai.oppLastStand = input.oppLastStand;
    ai.yinYangMode = input.yinYangMode;
    // サイレンス中はスキルを使えない: 通常の着手だけ行う
    if (input.silenced) {
        ai.updateShield(board);
        const move = ai.getBestMove(board, life);
        const blocked = (0, lifeBan_1.moveBlocked)(input.lifeBan, life);
        const cell = move !== null && !blocked ? move : null;
        // 置けるマスが無い（全マスが氷結・ロックなど）ときも、チャージでパスしないと手番が進まず止まる
        return { kind: 'silenced', move: cell, charge: cell === null };
    }
    ai.glacierPending = input.glacierPending;
    ai.glacierCharge = input.glacierCharge;
    ai.budGuard = input.budGuard;
    ai.infernoReady = input.infernoReady;
    ai.skillKinds = input.skillKinds;
    ai.rerollsLeft = input.rerollsLeft;
    ai.discountActive = input.discountActive;
    const result = ai.makeMove(board, input.magic[seat], input.costs, oppMagic, life, input.hand, input.tokenUsed, input.necroRemain, input.necroCosts[seat], input.judgeDayCost, input.totalAssaultCost, input.proliferate, input.magic, input.necroPay, input.necroCosts);
    // 氷結中のマスにはロックできない。ロック対象に混じっていたら、待ち状態で止まらないようロック自体をやめる
    // （氷室の番人はロックの代わりに氷結を撃つので、氷結が付けられるかで見る）
    const canMark = (t) => (input.characters[seat] === 'cryomancer' ? (0, thermal_1.canFreeze)(board[t]) : (0, thermal_1.lockable)(board[t]));
    if ((_a = result.lockTargets) === null || _a === void 0 ? void 0 : _a.some((t) => !canMark(t))) {
        result.skills = result.skills.filter((sk) => !sk.startsWith('onClickUse') || !sk.endsWith('Lock'));
        result.lockTargets = undefined;
    }
    // 一寸の虫に魂なし: ライフ3以下のコマは置けないので、通常の着手と置くスキルをやめる（残りが無ければチャージ）
    if (input.lifeBan) {
        result.skills = result.skills.filter((sk) => !(0, lifeBan_1.placeBlocked)(true, sk, input.tokenBind));
        if ((0, lifeBan_1.moveBlocked)(true, life))
            result.move = null;
        // 帯電拡散→帯電付与などの『スキル→対象クリック』も、置くスキルは撃てない。対象クリックも一緒に外す
        if (result.chargeClicks) {
            const kept = [];
            for (const c of result.chargeClicks) {
                if ((0, lifeBan_1.placeBlocked)(true, c.skill, input.tokenBind))
                    continue;
                kept.push(c);
            }
            result.chargeClicks = kept;
        }
    }
    // AIが盤面・キャラに応じてスキルをロック（次のシャッフルで固定する）
    const locks = ai.chooseLocks(board, oppMagic, life, input.hand);
    // 魔法使い: 撃てるスキルが無いので、軽減札を撃ってから1コストで手札を引き直し、新しい手札で計画し直す
    if (result.reroll) {
        const steps = [];
        if (result.reroll.discount)
            steps.push(result.reroll.discount);
        steps.push('onClickShuffle', 'aiReplan');
        return { kind: 'reroll', steps, locks: ai.locksForReroll(locks, input.hand.length) };
    }
    // 詰みからのヘイルメアリー: 当選スキルをここで決め、AI がそのスキルに合った対象を選ぶ
    if (result.hailMary) {
        const picked = pickHailMary();
        const plan = ai.planHailMary(board, picked, life);
        const steps = [`onClickHailMary:${picked}`];
        if (plan.target !== null)
            steps.push(plan.target);
        if (plan.move !== null && !(0, lifeBan_1.moveBlocked)(input.lifeBan, life))
            steps.push(plan.move);
        return { kind: 'queue', steps: endsTurn(steps), locks };
    }
    // 雷霆の巫: 帯電拡散→帯電付与は「スキル→対象クリック」を順に行う。トークン等の後続スキルも盤面への反映順を保つため同じ列に積む
    if (result.chargeClicks && result.chargeClicks.length > 0) {
        const steps = [];
        for (const c of result.chargeClicks) {
            steps.push(c.skill);
            if (c.target !== undefined)
                steps.push(c.target);
        }
        steps.push(...result.skills);
        if (result.lockTargets)
            steps.push(...result.lockTargets);
        if (result.stompTarget !== undefined)
            steps.push(result.stompTarget);
        if (result.move !== null)
            steps.push(result.move);
        return { kind: 'queue', steps: endsTurn(steps), locks };
    }
    const clicks = [];
    if (result.lockTargets)
        clicks.push(...result.lockTargets);
    if (result.stompTarget !== undefined)
        clicks.push(result.stompTarget);
    if (result.move !== null)
        clicks.push(result.move);
    // 着手もターンを終えるスキルも無いまま終わると、手番が進まずAIが止まる（置けるマスが無い・全マスが氷結/ロックなど）。そのときはチャージでパスする
    const ends = result.move !== null || result.skills.some((sk) => AIPlayer_1.TURN_ENDING_SKILLS.includes(sk));
    return { kind: 'direct', skills: result.skills, clicks, locks, chargeWhenEmpty: !ends };
};
exports.planAITurn = planAITurn;
/** player が今の盤面で cell に通常の着手をできるか（Game.onCellClick / sim の placeMove が弾く条件。人数・ライフ縛りは含めない） */
const canPlaceAt = (board, cell, player, character, characters) => {
    const sq = board[cell];
    if ((0, charge_1.isShielded)(sq, characters))
        return false; // ⚡付き雷霆の巫の自陣マスは誰も触れない
    if (sq.player && sq.player !== player && sq.bind > 0 && character !== 'giant')
        return false; // ライフの残った敵コマは巨人しか奪えない
    if (sq.effects.some((e) => e.effect === '🔑') && sq.bind > 0)
        return false; // ロック中
    if ((0, thermal_1.emptyBlocked)(sq))
        return false; // 氷結中の空きマス
    if (sq.player === player && (0, thermal_1.overwriteBlocked)(sq))
        return false; // 氷結中の自コマには重ねられない
    return true;
};
exports.canPlaceAt = canPlaceAt;
/**
 * キューの最後の着手マスは、スキル実行前の盤面で決めてある。ランダム設置のトークンでそのマスが埋まる・ロックされる、
 * ⚡付き自陣コマが無敵で触れない、などで着手できなくなると、クリックが無視されて手番が進まず止まる。
 * 打てるならそのまま cell を、打てなければ今の盤面で打ち直した手を返す。打てる手が無ければ null（呼び出し側はチャージでパスする）。
 */
const resolveMoveCell = (ai, board, characters, life, cell, lifeBan = false) => {
    if ((0, lifeBan_1.moveBlocked)(lifeBan, life))
        return null; // ライフ3以下のコマを置けない縛り: 打てる手は無いのでチャージでパスする
    if ((0, exports.canPlaceAt)(board, cell, ai.playerSymbol, ai.character, characters))
        return cell;
    ai.updateShield(board);
    return ai.getBestMove(board, life);
};
exports.resolveMoveCell = resolveMoveCell;
