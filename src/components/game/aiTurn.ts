// AIの1手番の計画。Game.tsx の runAIMove から React に依存しない部分を取り出したもの。
// 本番(Game.tsx)と、ヘッドレス sim(sim/aiDriver.js が生成物を使う)の両方がこれを呼ぶので、
// 「AIにどの状態を渡し、返ってきた結果をどの順で実行するか」は1か所にしかない (#289)。
//
// 使い方: 状態を AITurnInput に詰めて planAITurn を呼ぶ → 返った計画を、それぞれの実行系(Game の
// タイマー付きキュー / sim の同期実行)で実行する。計画は純粋なデータで、盤面もAIの内部状態以外は書き換えない。
import { CharacterId } from '../../types/Character';
import { Player } from '../../types/Player';
import { SquareInfo } from '../../types/SquareInfo';
import AIPlayer, { TURN_ENDING_SKILLS } from './AIPlayer';
import { SkillCosts } from './skillCosts';
import { placeBlocked, moveBlocked } from './lifeBan';
import { canFreeze, lockable, emptyBlocked, overwriteBlocked } from './thermal';
import { isShielded } from './charge';

/** 計画のステップ: 文字列=スキル(onClickXxx。引き直しは 'aiReplan')、数値=マスのクリック */
export type AIStep = string | number;

export type AITurnInput = {
    board: SquareInfo[];
    /** 席ごとのキャラ（添字 = 席番号） */
    characters: readonly CharacterId[];
    seat: number;
    magic: number[];
    /** この席のコスト表（価格破壊で席ごとに違う） */
    costs: SkillCosts;
    /** 手札（スキル番号） */
    hand: number[];
    life: number;
    /** この手番にトークン系スキルを使ったか */
    tokenUsed: boolean;
    necroRemain: number;
    /** 蘇生の現在のコスト（席ごと）と、この席が実際に払う額（ギア補正後） */
    necroCosts: number[];
    necroPay: number;
    judgeDayCost: number;
    totalAssaultCost: number;
    proliferate: boolean;
    placements: number;
    seatCount: number;
    // --- ギア・手番内の状態（AIPlayer に毎手番セットする） ---
    lastStandReady: boolean;
    tokenFree: boolean;
    chargeBuffActive: boolean;
    oppGearCount: number;
    oppLastStand: boolean;
    yinYangMode: 'ying' | 'yang';
    silenced: boolean;
    glacierPending: boolean;
    glacierCharge: number;
    budGuard: boolean;
    infernoReady: boolean;
    skillKinds: Set<string>;
    /** 魔法使いの引き直し: 残り回数と、軽減札を撃って引き直しの途中か */
    rerollsLeft: number;
    discountActive: boolean;
    /** 一寸の虫に魂なし: この席は「ライフ3以下のコマを置けない」縛りか。tokenBind はトークンのライフ */
    lifeBan: boolean;
    tokenBind: number;
};

export type AITurnPlan =
    /** サイレンス中: 通常の着手だけ。move=着手マス。着手できなければ charge=チャージでパス */
    | { kind: 'silenced'; move: number | null; charge: boolean }
    /** 引き直し（軽減札→シャッフル→再計画）。steps を順に実行する。locks は計画前にAIが決めたロック */
    | { kind: 'reroll'; steps: string[]; locks: number[] }
    /** 詰み: ヘイルメアリー。当選名を pick で決めたあとのステップ */
    | { kind: 'queue'; steps: AIStep[]; locks: number[] }
    /** 通常: skills を順に実行してから clicks（ロック対象→ストンプ等の対象→着手）をクリックする。何も無ければチャージでパス */
    | { kind: 'direct'; skills: string[]; clicks: number[]; locks: number[]; chargeWhenEmpty: boolean; /** clicks の最後が着手マス（埋まっていたら打ち直す対象）か。対象クリックで終わるなら false */ moveLast: boolean };

/** ステップ列が手番を終えない（最後が着手でもターン終了スキルでもない）なら、チャージでパスするステップを足す */
const endsTurn = (steps: AIStep[], hasMove: boolean): AIStep[] => {
    const last = steps[steps.length - 1];
    // 最後の数値が着手マスのときだけ手番が終わる。ロック・インジェクションなどの対象クリックで終わる列は、チャージでパスする
    const ends = (hasMove && typeof last === 'number') || (typeof last === 'string' && TURN_ENDING_SKILLS.includes(last));
    return ends ? steps : [...steps, 'onClickCharge'];
};

/** 全員の魔力のうち、自分以外で最大の値（敵が複数いても最も魔力の多い相手を基準にする） */
export const maxOppMagic = (magic: number[], seat: number): number => Math.max(...magic.filter((_, i) => i !== seat));

/**
 * AIに手番開始時の状態を渡し、この手番の計画を作る。
 * @param pickHailMary 詰みのヘイルメアリーで当選させるスキル名を選ぶ（本番は Game の抽選、sim は rng）
 */
export const planAITurn = (ai: AIPlayer, input: AITurnInput, pickHailMary: () => string): AITurnPlan => {
    const { board, seat, life } = input;
    const oppMagic = maxOppMagic(input.magic, seat);
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
        const blocked = moveBlocked(input.lifeBan, life);
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
    const canMark = (t: number) => (input.characters[seat] === 'cryomancer' ? canFreeze(board[t]) : lockable(board[t]));
    if (result.lockTargets?.some((t) => !canMark(t))) {
        result.skills = result.skills.filter((sk) => !sk.startsWith('onClickUse') || !sk.endsWith('Lock'));
        result.lockTargets = undefined;
    }

    // 一寸の虫に魂なし: ライフ3以下のコマは置けないので、通常の着手と置くスキルをやめる（残りが無ければチャージ）
    if (input.lifeBan) {
        result.skills = result.skills.filter((sk) => !placeBlocked(true, sk, input.tokenBind));
        if (moveBlocked(true, life)) result.move = null;
        // 帯電拡散→帯電付与などの『スキル→対象クリック』も、置くスキルは撃てない。対象クリックも一緒に外す
        if (result.chargeClicks) {
            const kept: typeof result.chargeClicks = [];
            for (const c of result.chargeClicks) {
                if (placeBlocked(true, c.skill, input.tokenBind)) continue;
                kept.push(c);
            }
            result.chargeClicks = kept;
        }
    }

    // AIが盤面・キャラに応じてスキルをロック（次のシャッフルで固定する）
    const locks = ai.chooseLocks(board, oppMagic, life, input.hand);

    // 魔法使い: 撃てるスキルが無いので、軽減札を撃ってから1コストで手札を引き直し、新しい手札で計画し直す
    if (result.reroll) {
        const steps: string[] = [];
        if (result.reroll.discount) steps.push(result.reroll.discount);
        steps.push('onClickShuffle', 'aiReplan');
        return { kind: 'reroll', steps, locks: ai.locksForReroll(locks, input.hand.length) };
    }

    // 詰みからのヘイルメアリー: 当選スキルをここで決め、AI がそのスキルに合った対象を選ぶ
    if (result.hailMary) {
        const picked = pickHailMary();
        const plan = ai.planHailMary(board, picked, life);
        const steps: AIStep[] = [`onClickHailMary:${picked}`];
        if (plan.target !== null) steps.push(plan.target);
        if (plan.move !== null && !moveBlocked(input.lifeBan, life)) steps.push(plan.move);
        return { kind: 'queue', steps: endsTurn(steps, plan.move !== null && !moveBlocked(input.lifeBan, life)), locks };
    }

    // 雷霆の巫: 帯電拡散→帯電付与は「スキル→対象クリック」を順に行う。トークン等の後続スキルも盤面への反映順を保つため同じ列に積む
    if (result.chargeClicks && result.chargeClicks.length > 0) {
        const steps: AIStep[] = [];
        for (const c of result.chargeClicks) {
            steps.push(c.skill);
            if (c.target !== undefined) steps.push(c.target);
        }
        steps.push(...result.skills);
        if (result.lockTargets) steps.push(...result.lockTargets);
        if (result.stompTarget !== undefined) steps.push(result.stompTarget);
        if (result.move !== null) steps.push(result.move);
        return { kind: 'queue', steps: endsTurn(steps, result.move !== null), locks };
    }

    const clicks: number[] = [];
    if (result.lockTargets) clicks.push(...result.lockTargets);
    if (result.stompTarget !== undefined) clicks.push(result.stompTarget);
    if (result.move !== null) clicks.push(result.move);
    // 着手もターンを終えるスキルも無いまま終わると、手番が進まずAIが止まる（置けるマスが無い・全マスが氷結/ロックなど）。そのときはチャージでパスする
    const ends = result.move !== null || result.skills.some((sk) => TURN_ENDING_SKILLS.includes(sk));
    return { kind: 'direct', skills: result.skills, clicks, locks, chargeWhenEmpty: !ends, moveLast: result.move !== null };
};

/** player が今の盤面で cell に通常の着手をできるか（Game.onCellClick / sim の placeMove が弾く条件。人数・ライフ縛りは含めない） */
export const canPlaceAt = (board: SquareInfo[], cell: number, player: Player, character: CharacterId, characters: readonly CharacterId[]): boolean => {
    const sq = board[cell];
    if (isShielded(sq, characters)) return false; // ⚡付き雷霆の巫の自陣マスは誰も触れない
    if (sq.player && sq.player !== player && sq.bind > 0 && character !== 'giant') return false; // ライフの残った敵コマは巨人しか奪えない
    if (sq.effects.some((e) => e.effect === '🔑') && sq.bind > 0) return false; // ロック中
    if (emptyBlocked(sq)) return false; // 氷結中の空きマス
    if (sq.player === player && overwriteBlocked(sq)) return false; // 氷結中の自コマには重ねられない
    return true;
};

/**
 * キューの最後の着手マスは、スキル実行前の盤面で決めてある。ランダム設置のトークンでそのマスが埋まる・ロックされる、
 * ⚡付き自陣コマが無敵で触れない、などで着手できなくなると、クリックが無視されて手番が進まず止まる。
 * 打てるならそのまま cell を、打てなければ今の盤面で打ち直した手を返す。打てる手が無ければ null（呼び出し側はチャージでパスする）。
 */
export const resolveMoveCell = (ai: AIPlayer, board: SquareInfo[], characters: readonly CharacterId[], life: number, cell: number, lifeBan: boolean = false): number | null => {
    if (moveBlocked(lifeBan, life)) return null; // ライフ3以下のコマを置けない縛り: 打てる手は無いのでチャージでパスする
    if (canPlaceAt(board, cell, ai.playerSymbol, ai.character, characters)) return cell;
    ai.updateShield(board);
    return ai.getBestMove(board, life);
};
