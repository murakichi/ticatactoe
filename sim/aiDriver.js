'use strict';
/*
 * 本番のAI(AIPlayer.ts)を、ヘッドレス sim のエンジンで動かす。
 *
 * AI本体(AIPlayer)と「どの状態を渡し、返った計画をどの順で実行するか」(aiTurn の planAITurn / resolveMoveCell)は
 * 本番(src/components/game/)のTSから生成した sim/shared/ のものをそのまま使う。ここに書くのは
 * 「エンジンの状態を AITurnInput に詰める」と「計画のステップを engine のスキル・着手で同期実行する」だけ。
 * Game.tsx の runAIMove + 待ち行列(setPendingAIMove)に当たる部分で、タイマーが無いぶん1手番を一気に進める (#289)。
 */
const E = require('./engine');
const AIPlayerMod = require('./shared/AIPlayer');
const aiTurn = require('./shared/aiTurn');
const { hasGear } = require('./shared/gear');
const lifeBanMod = require('./shared/lifeBan');

const AIPlayer = AIPlayerMod.default;
const { SYMBOLS } = E;

// AIPlayer が返すスキル名(onClickXxx) -> engine.SKILLS のキー。名前が規則どおりでないものだけ表にする
const SKILL_KEY = {
    onClickUseLock: 'lock', // 氷室の番人は engine 側で氷結に置き換わる
    onClickCryoFreeze: 'lock',
    onClickUseDoubleLock: 'doubleLock',
    onClickUseTripleLock: 'tripleLock',
    onClickWalpurgisNight: 'walpurgis',
    onClickToggleYingYang: 'toggleYY',
};
const keyOf = (name) => SKILL_KEY[name] || name.replace(/^onClick/, '').replace(/^./, (c) => c.toLowerCase());

/** 席 seat のAI。Game.tsx が毎描画で作り直しているのと同じく、手番ごとに作る（AI自身は手番をまたぐ状態を持たない） */
function aiFor(s, seat) {
    const symbols = SYMBOLS.slice(0, s.chars.length);
    return new AIPlayer(
        symbols[seat],
        s.chars[seat],
        symbols.filter((_, i) => i !== seat),
        s.chars,
        (cost, isToken, skillKey) => E.gearCost(s, cost, isToken, seat, skillKey, false),
        hasGear(s.gears[seat], 'toxicBloom'),
        hasGear(s.gears[seat], 'emptyLock'),
        s.decks ? s.decks[seat] : undefined
    );
}

function inputOf(s, reroll) {
    const seat = s.turn;
    const others = E.otherSeats(s, seat);
    return {
        board: s.board,
        characters: s.chars,
        seat,
        magic: s.magic,
        costs: E.costsOf(s, seat),
        hand: s.skills,
        life: s.life,
        tokenUsed: s.usedTokenThisTurn,
        necroRemain: s.remainNecro[seat],
        necroCosts: s.necroCost,
        necroPay: E.gearCost(s, s.necroCost[seat]),
        judgeDayCost: E.judgeDayCost(s),
        totalAssaultCost: E.totalAssaultCost(s),
        proliferate: s.proliferate[seat],
        placements: s.placements,
        seatCount: s.chars.length,
        lastStandReady: hasGear(s.gears[seat], 'lastStand') && !s.lastStandUsed[seat],
        tokenFree: s.tokenFree[seat],
        chargeBuffActive: s.chargeBuff[seat] > 0,
        oppGearCount: others.reduce((n, o) => n + s.gears[o].length, 0),
        oppLastStand: others.some((o) => hasGear(s.gears[o], 'lastStand') && !s.lastStandUsed[o]),
        yinYangMode: s.yy[seat] === 'yang' ? 'yang' : 'ying',
        silenced: s.silenced[seat],
        glacierPending: s.glacierPending[seat],
        glacierCharge: s.glacierCharge[seat],
        budGuard: s.budGuard[seat],
        infernoReady: s.infernoReady[seat],
        skillKinds: s.skillKinds[seat],
        rerollsLeft: reroll.left,
        discountActive: reroll.started,
        lifeBan: s.lifeBan[seat],
        tokenBind: E.calculateTokenBind(s),
    };
}

/** 計画のスキルを1つ実行する。縛り(ライフ3以下を置けない)に掛かるスキルは Game.executeSkillForAI と同じく何もしない */
function runSkill(s, name) {
    if (name.startsWith('onClickHailMary:')) return E.onClickHailMary(s, name.slice('onClickHailMary:'.length));
    if (name === 'onClickShuffle') return E.shuffleHand(s);
    if (lifeBanMod.placeBlocked(s.lifeBan[s.turn], name, E.calculateTokenBind(s))) return; // 一寸の虫に魂なし: 置くスキルは撃てない(Game.executeSkillForAI と同じ)
    const key = keyOf(name);
    const fn = E.SKILLS[key];
    if (!fn) throw new Error(`aiDriver: AIPlayer returned a skill that engine cannot run: ${name} (${key})`);
    fn(s);
}

/**
 * 席 s.turn の1手番を、AIの計画どおり最後まで進める（手番が変わる／勝負がつく／行き詰まるまで）。
 * reroll は魔法使いの引き直しの残り回数（手番の頭で作る。再計画では引き継ぐ）。
 */
function takeTurn(s, reroll = { left: AIPlayerMod.rerollBudget(s.chars[s.turn]), started: false }) {
    const turn = s.currentTurn;
    const seat = s.turn;
    const ai = aiFor(s, seat);
    const plan = aiTurn.planAITurn(ai, inputOf(s, reroll), () => E.HAIL_MARY_NAMES[Math.floor(s.rng() * E.HAIL_MARY_NAMES.length)]);
    const over = () => s.winner || s.currentTurn !== turn;
    // 行き詰まったら（手番が進まないとき）チャージでパスする。本番では止まってしまう状態で、数を s.stats.aiStall に残す
    const click = (cell) => {
        if (cell === null || cell === undefined) return;
        E.placeMove(s, cell);
    };

    if (plan.kind === 'silenced') {
        if (plan.move !== null) click(plan.move);
        else if (plan.charge) E.SKILLS.charge(s);
        return;
    }
    s.lockedSkills[seat] = plan.locks;

    if (plan.kind === 'reroll') {
        reroll.left -= 1;
        reroll.started = true;
        for (const step of plan.steps) {
            if (step === 'aiReplan') return takeTurn(s, reroll);
            runSkill(s, step);
        }
        return;
    }
    if (plan.kind === 'queue') {
        for (let i = 0; i < plan.steps.length && !over(); i++) {
            const step = plan.steps[i];
            if (step === 'aiReplan') return takeTurn(s, reroll);
            if (typeof step === 'string') { runSkill(s, step); continue; }
            if (i === plan.steps.length - 1) {
                // 着手マスはスキル実行前の盤面で決めてある。埋まっていたら今の盤面で打ち直し、無ければチャージでパスする
                const cell = aiTurn.resolveMoveCell(aiFor(s, seat), s.board, s.chars, s.life, step, s.lifeBan[seat]);
                if (cell !== null) click(cell); else E.SKILLS.charge(s);
            } else click(step);
        }
        return;
    }
    // direct: スキルを順に実行してから、クリックを順に行う。Game はスキルがあれば全クリックを、無ければ2つ目以降を待ち行列に積み、
    // 待ち行列の最後のクリック(着手)は埋まっていたら打ち直す(resolveMoveCell)
    for (const sk of plan.skills) {
        if (over()) return;
        runSkill(s, sk);
    }
    const queued = plan.skills.length > 0 ? 0 : 1;
    for (let i = 0; i < plan.clicks.length; i++) {
        if (over()) return;
        const last = i === plan.clicks.length - 1;
        if (i >= queued && last) {
            const cell = aiTurn.resolveMoveCell(aiFor(s, seat), s.board, s.chars, s.life, plan.clicks[i], s.lifeBan[seat]);
            if (cell !== null) click(cell); else E.SKILLS.charge(s);
        } else click(plan.clicks[i]);
    }
    if (plan.chargeWhenEmpty && !over()) E.SKILLS.charge(s);
}

/** 1手番を進める。進まなかったときは行き詰まりとして数え、チャージでパスして先へ進める */
function playTurn(s) {
    const turn = s.currentTurn;
    takeTurn(s);
    if (!s.winner && s.currentTurn === turn) {
        E.bumpStat(s, 'aiStall');
        E.SKILLS.charge(s);
    }
}

/** スキルを使わず、AIの着手だけで1手番を進める（--no-skill。パッシブとギアは有効）。打てる手が無ければチャージでパス */
function playPlaceOnly(s) {
    const seat = s.turn;
    const ai = aiFor(s, seat);
    ai.updateShield(s.board);
    const move = ai.getBestMove(s.board, s.life);
    const turn = s.currentTurn;
    if (move !== null) E.placeMove(s, move);
    if (!s.winner && s.currentTurn === turn) { E.bumpStat(s, 'aiStall'); E.SKILLS.charge(s); }
}

/**
 * 旧 ai.js の makeMove(s, mode) と同じ呼び口。1手番を最後まで進めて { turnEnded: true } を返す
 * （probe-*.js や duel.js が `const r = ai.makeMove(s); if (!r.turnEnded && ...)` と書いていても、そのまま本番のAIで動く）
 */
function makeMove(s) {
    playTurn(s);
    return { move: null, turnEnded: true };
}

module.exports = { takeTurn, playTurn, playPlaceOnly, makeMove, keyOf };
