// Game.tsx から切り出したハンドラ群: AI の手番の進行（キュー・ステップ実行・ヘイルメアリー演出・止まったときの打開）
// 本体は Game.tsx にあったものをそのまま移した。Game の変数は scope(g) で、あとで定義されるもの(calculateCost など)は late() 経由で受け取る
import { GearTurnState } from './gearTurn';
import { SkillCosts } from './skillCosts';
import React from 'react';
import AIPlayer from './AIPlayer';
import { useState, useEffect, useRef } from 'react';
import { CharacterId } from '../../types/Character';
import { SquareInfo } from '../../types/SquareInfo';
import { randomPick } from '../../util';
import { MAX_REROLLS, rerollBudget } from './AIPlayer';
import { planAITurn, resolveMoveCell } from './aiTurn';
import { boardWinner, newPieceBlocked } from './objects';
import { GearId, hasGear } from './gear';
import { Discount } from './discount';
import { GameLate } from './gameLate';

export interface AIRunnerScope {
    dragon: { form: 'miko' | 'dragon'; n: number }[];
    reaperSweeps: number;
    currentAI: AIPlayer | null;
    currentBoard: SquareInfo[];
    characters: CharacterId[];
    turnSeat: number;
    currentTurnPlayer: "💙" | "⭕" | "🟩" | "🔶" | "⭐" | "🟣" | "🟫" | "🩷";
    seatCosts: SkillCosts;
    gearCost: (cost: number, seat?: number, isToken?: boolean, skillKey?: string, withLeaf?: boolean) => number;
    placements: number;
    seatCount: number;
    gearsBySeat: GearId[][];
    lastStandUsed: React.MutableRefObject<boolean[]>;
    gearTurn: React.MutableRefObject<GearTurnState & { infernoReady: boolean[]; freeCast: boolean; processedTurn: number }>;
    otherSeats: (seat: number) => number[];
    currentTurn: number;
    isAllAI: boolean;
    currentCharacter: CharacterId;
    restartCount: number;
    lastStandSaves: number;
}
export const useAIRunner = (g: AIRunnerScope, late: () => GameLate) => {
    const { dragon, currentAI, currentBoard, characters, turnSeat, currentTurnPlayer, seatCosts, gearCost, placements, seatCount, gearsBySeat, lastStandUsed, gearTurn, otherSeats, currentTurn, isAllAI, currentCharacter, restartCount, lastStandSaves, reaperSweeps } = g;

    // AIの実行キュー。number=そのマスをクリック / string=そのスキルを実行（帯電系は「スキル→クリック」を順に並べる）
    const [pendingAIMove, setPendingAIMove] = useState<(number | string)[] | null>(null);
    // AI同士の対戦時のステップ実行制御 (autoPlay=false なら「次の手番」ボタンで1ターンずつ進める)
    const [autoPlay, setAutoPlay] = useState<boolean>(false);
    const [stepRequest, setStepRequest] = useState<number>(0);
    // ヘイルメアリーのルーレット演出 (intro=「ヘイルメアリー！」/ spin=抽選中 / reveal=当選)。非 null の間は入力とAIキューを止める
    const [hailMarySpin, setHailMarySpin] = useState<{ label: string; phase: 'intro' | 'spin' | 'reveal' } | null>(null);

    // 魔法使いAIの引き直し（軽減札→シャッフル→再計画）の手番内の状態。手番開始時に初期化する
    const aiReroll = useRef({ left: MAX_REROLLS, started: false });

    useEffect(() => {
        if (pendingAIMove !== null && pendingAIMove.length > 0 && !hailMarySpin) {
            const timer = setTimeout(() => {
                const [next, ...rest] = pendingAIMove;
                // 再計画は新しいキューを積むので、先に今のキューを空にしてから呼ぶ（後から null で上書きしない）
                if (next === 'aiReplan') {
                    setPendingAIMove(rest.length > 0 ? rest : null);
                    late().executeSkillForAI(next);
                    return;
                }
                if (typeof next === 'string') late().executeSkillForAI(next);
                else if (rest.length === 0 && currentAI) {
                    // 着手マスはスキル実行前の盤面で決めてある。ランダム設置のトークンなどでそのマスが埋まり（⚡付き自陣コマは無敵で
                    // 触れない）クリックが無視されると、手番が進まず止まる。今の盤面で打ち直し、無ければチャージでパスする
                    const cell = resolveMoveCell(currentAI, currentBoard, characters, late().life, next, late().lifeBan[turnSeat], newPieceBlocked(currentBoard, currentTurnPlayer, late().placedThisTurn, late().objectIgnore[turnSeat]));
                    if (cell !== null) late().onCellClick(cell);
                    else late().onClickCharge();
                } else late().onCellClick(next);
                setPendingAIMove(rest.length > 0 ? rest : null);
                if (rest.length === 0) watchAIStall();
            }, 200);
            return () => clearTimeout(timer);
        }
    }, [pendingAIMove, hailMarySpin]);

    const runAIMove = () => {
        const ai = currentAI!;
        // 状態をAIに渡して手番の計画を作る部分は aiTurn.ts（sim と共有）。ここはその計画を React の状態とタイマー付きキューで実行する
        const plan = planAITurn(
            ai,
            {
                board: currentBoard,
                characters,
                seat: turnSeat,
                magic: late().magic,
                costs: seatCosts,
                hand: late().skills,
                life: late().life,
                tokenUsed: late().useToken,
                necroRemain: late().remainNecro[turnSeat],
                necroCosts: late().necroCost,
                necroPay: gearCost(late().necroCost[turnSeat]),
                judgeDayCost: late().judgeDayCost,
                totalAssaultCost: late().totalAssaultCost,
                proliferate: late().proliferate[turnSeat],
                placements,
                seatCount,
                lastStandReady: hasGear(gearsBySeat[turnSeat], 'lastStand') && !lastStandUsed.current[turnSeat],
                tokenFree: gearTurn.current.tokenFree[turnSeat],
                wardActive: gearTurn.current.ward[turnSeat] > 0,
                chargeBuffActive: late().chargeBuff[turnSeat] > 0,
                oppGearCount: otherSeats(turnSeat).reduce((n, seat) => n + gearsBySeat[seat].length, 0),
                oppLastStand: otherSeats(turnSeat).some((seat) => hasGear(gearsBySeat[seat], 'lastStand') && !lastStandUsed.current[seat]),
                yinYangMode: late().currentYinYangMode === 'yang' ? 'yang' : 'ying',
                dragonForm: dragon[turnSeat]?.form ?? 'miko',
                silenced: late().silenced[turnSeat],
                objectBanned: late().objectBan[turnSeat],
                glacierPending: late().glacierPending[turnSeat],
                glacierCharge: late().glacierCharge[turnSeat],
                budGuard: late().budGuard[turnSeat],
                infernoReady: gearTurn.current.infernoReady[turnSeat],
                skillKinds: gearTurn.current.kinds[turnSeat],
                rerollsLeft: aiReroll.current.left,
                discountActive: aiReroll.current.started,
                lifeBan: late().lifeBan[turnSeat],
                tokenBind: late().calculateTokenBind(),
            },
            () => randomPick(late().hailMaryChoices).name
        );

        if (plan.kind === 'silenced') {
            if (plan.move !== null) late().onCellClick(plan.move);
            else if (plan.charge) late().onClickCharge();
            return;
        }
        late().setLockedSkillsAt(turnSeat, plan.locks);

        if (plan.kind === 'reroll') {
            aiReroll.current = { left: aiReroll.current.left - 1, started: true };
            setPendingAIMove(plan.steps);
            return;
        }
        if (plan.kind === 'queue') {
            setPendingAIMove(plan.steps);
            return;
        }

        for (const sk of plan.skills) {
            late().executeSkillForAI(sk);
        }

        // 対象クリック(ロック・インジェクションなど)で終わり、着手もターン終了スキルも無いなら、クリックのあとにチャージでパスする
        const pendingClicks: (number | string)[] = plan.chargeWhenEmpty && !plan.moveLast ? [...plan.clicks, 'onClickCharge'] : plan.clicks;
        if (pendingClicks.length > 0) {
            if (plan.skills.length > 0 || typeof pendingClicks[0] === 'string') {
                setPendingAIMove(pendingClicks);
            } else {
                late().onCellClick(pendingClicks[0] as number);
                if (pendingClicks.length > 1) setPendingAIMove(pendingClicks.slice(1));
            }
        } else if (plan.chargeWhenEmpty) {
            // 置ける場所もスキルもなければチャージで手番を終える（何もしないと進行不能になる）
            late().onClickCharge();
        } else {
            watchAIStall();
        }
    };

    // AIのタイマーは500ms後に発火するので、その時点の最新の runAIMove を呼ぶ。描画時の runAIMove を握ったままだと、
    // 巨人が休んで同じ席が連続で動く手番（turnSeat が変わらず再描画で張り直されない）で、手番開始の魔力・手札・ライフの更新前の値でAIが計画してしまう
    const runAIMoveRef = useRef(runAIMove);
    runAIMoveRef.current = runAIMove;

    // AIの計画を最後まで実行したのに手番が進まないとき（氷結・ロックで対象や着手が無効になった等）は、チャージでパスして止まらないようにする。
    // 計画の実行直後は state がまだ古いので、少し待ってから最新の値で確かめる
    const stallRef = useRef<{ turn: number; over: boolean; queued: boolean; spinning: boolean; charge: () => void }>({ turn: currentTurn, over: true, queued: false, spinning: false, charge: () => {} });
    const watchAIStall = () => {
        const turn = stallRef.current.turn;
        setTimeout(() => {
            const cur = stallRef.current;
            if (cur.turn === turn && !cur.over && !cur.queued && !cur.spinning) cur.charge();
        }, 900);
    };

    useEffect(() => {
        if (!currentAI) return;

        const winner = boardWinner(currentBoard);
        if (winner) return;

        // 全員AIでステップ実行モードのときは自動進行せず、「次の手番」ボタンを待つ
        if (isAllAI && !autoPlay) return;

        const timer = setTimeout(() => {
            aiReroll.current = { left: rerollBudget(currentCharacter), started: false };
            runAIMoveRef.current();
        }, 500);

        return () => clearTimeout(timer);
        // currentTurn も依存に含める: 巨人のスキップで turnSeat が変わらず同じ席が連続手番になる場合でも再発火させる
    }, [turnSeat, currentTurn, restartCount, autoPlay, lastStandSaves, reaperSweeps]);

    // 「次の手番」ボタン押下でAI同士の対戦を1ターン進める
    useEffect(() => {
        if (stepRequest === 0) return;
        if (!currentAI) return;
        if (boardWinner(currentBoard)) return;
        aiReroll.current = { left: MAX_REROLLS, started: false };
        runAIMove();
    }, [stepRequest]);

    return { setHailMarySpin, runAIMove, hailMarySpin, stallRef, pendingAIMove, setPendingAIMove, setStepRequest, autoPlay, setAutoPlay };
};
