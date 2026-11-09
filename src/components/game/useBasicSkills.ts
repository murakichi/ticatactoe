// Game.tsx から切り出したスキルのハンドラ群: 基本スキル（チャージ・ライフ・シャッフル・毒の道具・ロック・トークン系）
// 本体は Game.tsx の同じ位置にあったものをそのまま移した。Game の変数は scope(g) で、あとで定義されるもの(calculateCost など)は late() 経由で受け取る
import { GearTurnState } from './gearTurn';
import React from 'react';
import { useState } from 'react';
import { CharacterId } from '../../types/Character';
import { Player, seatOf } from '../../types/Player';
import { SquareInfo } from '../../types/SquareInfo';
import { randomAnyPick, randomPick } from '../../util';
import { applyLockAt, afterTokenPlaced as afterTokenPlacedOf, TokenAfterOptions, TokenAfterResult } from './tokenAfter';
import { TokenKind, PutContext, pickEmptyCells, placeTokens, placeBothTokens } from './tokenPlace';
import { poisonCountFor, miasmaPlan as miasmaPlanOf, poisonStrike as poisonStrikeOf } from './poison';
import { mudAdjustedBind, marketCount } from './objects';
import { tokenBindOf } from './cost';
import { SkillEffectType, BurstType } from './BoardEffects';
import { isGuarded } from './charge';
import { activeBuds, applyDamage, absorbDestroy, zeroOut } from './thermal';
import { MIASMA_MIN_COST, SkillCosts } from './skillCosts';
import { GearId, hasGear, TokenEffect } from './gear';
import { Discount } from './discount';
import { BoardGeometry } from './boardGeometry';
import { PendingMode } from './pendingMode';
import { PlayEffectExtra } from './usePresentation';
import { GameLate } from './gameLate';

export interface BasicSkillsScope {
    playEffect: (type: SkillEffectType, index?: number | undefined, indexes?: number[] | undefined, label?: string | undefined, extra?: PlayEffectExtra | undefined) => void;
    addLog: (message: string) => void;
    setMagicAt: (seat: number, value: number | ((prev: number) => number)) => void;
    turnSeat: number;
    setCurrentTurn: React.Dispatch<React.SetStateAction<number>>;
    currentTurn: number;
    setLife: React.Dispatch<React.SetStateAction<number>>;
    life: number;
    spendMagic: (cost: number, bumpCount?: boolean, isSkill?: boolean, skillId?: string) => void;
    seatCosts: SkillCosts;
    currentTurnPlayer: "💙" | "⭕" | "🟩" | "🔶" | "⭐" | "🟣" | "🟫" | "🩷";
    gearTurn: React.MutableRefObject<GearTurnState & { infernoReady: boolean[]; freeCast: boolean; processedTurn: number }>;
    currentBoard: SquareInfo[];
    setSkills: React.Dispatch<React.SetStateAction<number[]>>;
    reshuffledSkills: (deck: number[], locks: number[]) => number[];
    deckBySeat: number[][];
    currentLockedSkills: number[];
    characters: CharacterId[];
    turnGears: GearId[];
    gearsBySeat: GearId[][];
    posName: (i: number) => string;
    gearTrigger: (gearId: GearId, text?: string | undefined) => void;
    playBurst: (type: BurstType, cells: number[]) => void;
    chargeBuff: number[];
    geo: BoardGeometry;
    harvestMagic: (n: number) => void;
    pendingFlag: (m: PendingMode) => [boolean, (on: boolean) => void];
    costTableFor: (seat: number) => SkillCosts;
    budGuard: boolean[];
    flashCells: (indexes: number[]) => void;
    setCurrentBoard: React.Dispatch<React.SetStateAction<SquareInfo[]>>;
    seatCount: number;
    symbols: ("💙" | "⭕" | "🟩" | "🔶" | "⭐" | "🟣" | "🟫" | "🩷")[];
    setUseToken: React.Dispatch<React.SetStateAction<boolean>>;
    currentCharacter: CharacterId;
}
export const useBasicSkills = (g: BasicSkillsScope, late: () => GameLate) => {
    const { playEffect, addLog, setMagicAt, turnSeat, setCurrentTurn, currentTurn, setLife, life, spendMagic, seatCosts, currentTurnPlayer, gearTurn, currentBoard, setSkills, reshuffledSkills, deckBySeat, currentLockedSkills, characters, turnGears, gearsBySeat, posName, gearTrigger, playBurst, chargeBuff, geo, harvestMagic, pendingFlag, costTableFor, budGuard, flashCells, setCurrentBoard, seatCount, symbols, setUseToken, currentCharacter } = g;


    const charge = 3;
    const onClickCharge = () => {
        playEffect('chargeUp', undefined, undefined, `チャージ+${charge}`);
        addLog(`「チャージ」を使用（ターン終了・マジック+${charge}）`);
        setMagicAt(turnSeat, (m) => m + charge);
        setCurrentTurn(currentTurn + 1);
    };

    const onClickAddLife = () => {
        addLog('「ライフ3」を使用（ライフ+3）');
        playEffect('heal');
        setLife(life + 3);
        spendMagic(late().calculateCost(seatCosts.onClickAddLife, false, false, currentTurnPlayer, 'onClickAddLife'), true, true, 'onClickAddLife');
    };

    // 市場: 手番ごとに、働いている市場の数だけシャッフルが無料
    const marketFree = gearTurn.current.marketUsed[turnSeat] < marketCount(currentBoard, currentTurnPlayer);
    const shuffleCost = marketFree ? 0 : seatCosts.onClickShuffle;
    const onClickShuffle = () => {
        addLog('「シャッフル」を使用');
        playEffect('shuffle');
        // 手札はデッキ（12枚）から引く
        setSkills(reshuffledSkills(deckBySeat[turnSeat], currentLockedSkills));
        if (marketFree) {
            gearTurn.current.marketUsed[turnSeat]++;
            addLog('市場でシャッフルが無料になった');
        }
        spendMagic(shuffleCost, true, false);
    };

    const onClickBibine = () => {
        addLog('「バイバイン」を使用（ライフ2倍）');
        playEffect('double');
        setLife(life * 2);
        spendMagic(late().calculateCost(seatCosts.onClickBibine, false, false, currentTurnPlayer, 'onClickBibine'), true, true, 'onClickBibine');
    };

    // --- 毒（毒使い）関連 ---
    // どちらかが毒使いなら、毒セルが死んだ時の「周囲へ毒拡散」パッシブが有効になる
    const poisonerInPlay = characters.includes('poisoner');
    // 指定プレイヤーの自陣にある毒スタック数（休眠マスの☠は数えない）
    const poisonCount = (player: Player): number => poisonCountFor(currentBoard, player);
    // 毒使いの駒に毒が付いた瞬間、そのマスのライフが POISON_LIFE_MULT 倍になる（毒を付与した直後のマスに適用する）
    const poisonStrike = (sq: SquareInfo): SquareInfo => poisonStrikeOf(sq, characters);
    // --- ギアのエフェクト系ヘルパー（sim/engine.js の同名関数と同じ規則） ---
    // ロックを付ける。期間(ライフ)は堅牢の鍵で延びる。空きマスなら空蔵の持ち主を記録しておく
    const applyLock = (board: SquareInfo[], idx: number) => {
        const budsBefore = board[idx].effects.filter((e) => e.effect === '🌱').length;
        applyLockAt(board, idx, turnGears, turnSeat);
        if (board[idx].effects.filter((e) => e.effect === '🌱').length > budsBefore) {
            addLog(`芽吹きの錠: ${posName(idx)}にバッズ`);
            gearTrigger('lockBloom', 'バッズ付与');
        }
    };
    // 毒花: 毒が付いたコマ(cells)のうち、持ち主が毒花を装備しているものに、1つずつバッズも付く。
    // 誰が付けた毒でも発動する（自分で付けた毒でも、相手から付けられた毒でも。毒を付ける側の装備は関係ない）
    const toxicBloom = (board: SquareInfo[], cells: number[]) => {
        for (const k of cells) {
            const owner = board[k].player;
            if (!owner || !hasGear(gearsBySeat[seatOf(owner)], 'toxicBloom')) continue;
            board[k] = { ...board[k], effects: [...board[k].effects, { effect: '🌱' }] };
            addLog(`毒花: ${posName(k)}にバッズ`);
            gearTrigger('toxicBloom', 'バッズ付与');
            playBurst('gearBloom', [k]);
        }
    };
    // トークン系スキルでコマを置いた後の処理: 道連れの鍵(確率でロック) と 伝播(周囲のコマに同じエフェクト)。
    // effect はトークンが持つエフェクト。収穫に渡す「付与したエフェクト数」を返す
    const afterOptions = (): TokenAfterOptions => ({ player: currentTurnPlayer, turnSeat, gears: turnGears, chars: characters, chargeBuff: chargeBuff[turnSeat], rng: Math.random });
    // 置いたあとのギア処理（道連れの鍵・伝播）の結果をログ・演出にする
    const reportAfter = (idx: number, effect: TokenEffect | undefined, r: TokenAfterResult | null) => {
        if (!r) return;
        if (r.seeded) {
            gearTrigger('budSeed', 'バッズ付きで設置');
            playBurst('gearSeed', [idx]);
        }
        if (r.locked) {
            addLog(`道連れの鍵: ${posName(idx)}にロックが付いた`);
            gearTrigger('bindingLock', 'ロック付与');
            playBurst('gearKey', [idx]);
        }
        if (effect && r.spreadTo !== null) {
            addLog(`伝播: ${posName(r.spreadTo)}に${effect}が広がった`);
            gearTrigger('propagate', `${effect}が広がった`);
            playBurst('gearSpread', [r.spreadTo]);
        }
    };
    const afterTokenPlaced = (board: SquareInfo[], idx: number, effect?: TokenEffect): number => {
        const r = afterTokenPlacedOf(board, idx, effect, afterOptions());
        reportAfter(idx, effect, r);
        return r.granted;
    };
    // トークン系スキルの置き方（共有: tokenPlace.ts）。空きマスから n 個選び、kind のコマを置いて afterTokenPlaced を通す。
    // 収穫とギアのログは、スキルの使用ログのあとに report() で出す（1個のときは randomPick、2個以上は randomAnyPick で選ぶ）
    const putTokens = (board: SquareInfo[], kind: TokenKind, n: number, extra?: Partial<PutContext>, afterPut?: (board: SquareInfo[], idx: number) => void) => {
        const pick = n === 1 ? (cells: number[]) => [randomPick(cells)] : (cells: number[], k: number) => randomAnyPick(cells, k);
        return putTokensAt(board, kind, pickEmptyCells(board, n, pick), extra, afterPut);
    };
    const putTokensAt = (board: SquareInfo[], kind: TokenKind, cells: number[], extra?: Partial<PutContext>, afterPut?: (board: SquareInfo[], idx: number) => void) => {
        const ctx: PutContext = { player: currentTurnPlayer, bind: calculateTokenBind(), chars: characters, size: geo.size, ...extra };
        const r = placeTokens(board, kind, cells, ctx, afterOptions(), afterPut);
        return { ...r, report: () => { r.placed.forEach((t) => reportAfter(t.idx, t.effect, t.after)); harvestMagic(r.granted); } };
    };
    // 周囲1マスのコマ(敵味方問わず)1つにランダムで毒を1付与する（毒拡散パッシブ）
    const spreadPoisonAround = (board: SquareInfo[], idx: number) => {
        const targets = geo.surroundRange(idx).filter((j) => board[j].player);
        if (targets.length === 0) return;
        const t = randomPick(targets);
        board[t] = poisonStrike({ ...board[t], effects: [...board[t].effects, { effect: '☠' }] });
        toxicBloom(board, [t]);
    };
    const [useInjection, setUseInjection] = useState<number>(0);
    const [usePandemic, setUsePandemic] = pendingFlag('pandemic');
    // ミアズマの実コスト: 基礎 - 自陣の毒の数、毒使い割引(-1)、下限は MIASMA_MIN_COST
    const miasmaCost = (player: Player = currentTurnPlayer): number =>
        Math.max(MIASMA_MIN_COST, late().calculateCost(costTableFor(seatOf(player)).onClickMiasma - poisonCount(player), false, true, player, 'onClickMiasma'));
    // ミアズマが毒を付与するマス → 付与する毒の数。自陣の毒が乗っているマスごとに、周囲1マスの敵マス(ロック/無敵は除く)へ1つずつ（重複あり）
    const miasmaPlan = (board: SquareInfo[], player: Player): Map<number, number> => miasmaPlanOf(board, player, characters);

    const [useBuds, setUseBuds] = useState<[boolean, number]>([false, 0]);
    // 氷結中のマスの🌱は消えないが休眠していて、魔力ボーナスに数えない（冬至の種子のガード中を除く）
    const activeBudsCount = (player: Player): number =>
        currentBoard.filter((x) => x.player === player).reduce((n, sq) => n + activeBuds(sq, budGuard[seatOf(player)]), 0);

    const onClickBuds = () => {
        addLog('「バッズ」を使用（次の一手でバッズを植える）');
        playEffect('bloom', undefined, undefined, 'バッズ');
        harvestMagic(1);
        setUseBuds([true, useBuds[1] + 1]);
        spendMagic(late().calculateCost(seatCosts.onClickBuds, false, false, currentTurnPlayer, 'onClickBuds'), true, true, 'onClickBuds');
    };

    const onClickDoubleBuds = () => {
        addLog('「ダブルバッズ」を使用（次の一手でバッズを2つ植える）');
        playEffect('bloom', undefined, undefined, 'ダブルバッズ');
        harvestMagic(2);
        setUseBuds([true, useBuds[1] + 2]);
        spendMagic(late().calculateCost(seatCosts.onClickDoubleBuds, false, false, currentTurnPlayer, 'onClickDoubleBuds'), true, true, 'onClickDoubleBuds');
    };

    const [useLock, setUseLock] = useState<number>(0);
    const onClickUseLock = () => {
        addLog('「ロック」を使用（マスを選択）');
        setUseLock(useLock + 1);
        spendMagic(late().calculateCost(seatCosts.onClickUseLock, false, false, currentTurnPlayer, 'onClickUseLock'), true, true, 'onClickUseLock');
    };

    const onClickUseDoubleLock = () => {
        addLog('「ダブルロック」を使用（マスを2つ選択）');
        setUseLock(useLock + 2);
        spendMagic(late().calculateCost(seatCosts.onClickDoubleLock, false, false, currentTurnPlayer, 'onClickDoubleLock'), true, true, 'onClickDoubleLock');
    };

    const onClickUseTripleLock = () => {
        addLog('「トリプルロック」を使用（マスを3つ選択）');
        setUseLock(useLock + 3);
        spendMagic(late().calculateCost(seatCosts.onClickTripleLock, false, false, currentTurnPlayer, 'onClickTripleLock'), true, true, 'onClickTripleLock');
    };

    // 「ライフを0にする」スキルを1マスに当てる。氷結中ならライフはそのまま氷結だけ解除（false）、そうでなければ0にして🔥も消す（true）
    const zeroBySkill = (board: SquareInfo[], idx: number, broken: number[]): boolean => {
        const guard = absorbDestroy(board[idx]);
        if (guard.blocked) {
            board[idx] = guard.sq;
            broken.push(idx);
            return false;
        }
        board[idx] = zeroOut(board[idx]);
        return true;
    };

    const onClickOpium = () => {
        addLog('「オピウム」を使用（相手の全コマのライフ-2・ターン終了）');
        const board = currentBoard.slice();
        const affected: number[] = [];
        const iceBroken: number[] = [];
        board.forEach((square, idx) => {
            if (square.player !== currentTurnPlayer && square.player && square.bind > 0 && !isGuarded(square, characters)) {
                // スキルダメージ: 氷結なら解除だけ、🔥なら1.5倍。-2して1以下になったマスはライフ0
                const hit = applyDamage(square, 2, 'skill');
                board[idx] = hit.blocked || hit.sq.bind > 1 ? hit.sq : { ...hit.sq, bind: 0 };
                if (hit.blocked) iceBroken.push(idx);
                else affected.push(idx);
            }
        });
        if (iceBroken.length > 0) addLog(`氷結が身代わりになった（${iceBroken.map(posName).join('・')}）`);
        flashCells(affected);
        playEffect('opium');
        playBurst('iceBreak', iceBroken);
        setCurrentBoard(board);
        spendMagic(late().calculateCost(seatCosts.onClickOpium, false, false, currentTurnPlayer, 'onClickOpium'), true, true, 'onClickOpium');
        setCurrentTurn(currentTurn + 1);
    };

    const onClickSlash = () => {
        addLog(`「スラッシュ」を使用（右上→左下の${geo.size}マスのライフを0に）`);
        const board = currentBoard.slice();
        const affected: number[] = [];
        const broken: number[] = [];
        for (const idx of geo.antiDiagonal) {
            if (!isGuarded(board[idx], characters)) {
                if (zeroBySkill(board, idx, broken)) affected.push(idx);
            }
        }
        flashCells(affected);
        playEffect('slash');
        playBurst('iceBreak', broken);
        setCurrentBoard(board);
        spendMagic(late().calculateCost(seatCosts.onClickSlash, false, false, currentTurnPlayer, 'onClickSlash'), true, true, 'onClickSlash');
    };

    const onClickBackSlash = () => {
        addLog(`「バックスラッシュ」を使用（左上→右下の${geo.size}マスのライフを0に）`);
        const board = currentBoard.slice();
        const affected: number[] = [];
        const broken: number[] = [];
        for (const idx of geo.mainDiagonal) {
            if (!isGuarded(board[idx], characters)) {
                if (zeroBySkill(board, idx, broken)) affected.push(idx);
            }
        }
        flashCells(affected);
        playEffect('backslash');
        playBurst('iceBreak', broken);
        setCurrentBoard(board);
        spendMagic(late().calculateCost(seatCosts.onClickBackSlash, false, false, currentTurnPlayer, 'onClickBackSlash'), true, true, 'onClickBackSlash');
    };

    const onClickBothToken = () => {
        const board = currentBoard.slice();
        // 参加者全員に1つずつ（席順に空きマスからランダムに）。空きが足りなければ先着の席だけ
        const picks = pickEmptyCells(board, seatCount, (cells, n) => randomAnyPick(cells, n));
        addLog(`「両トークン」を使用（${picks.map((idx, seat) => `${symbols[seat]}: ${posName(idx)}`).join(' / ')}に設置）`);
        const both = placeBothTokens(board, picks, symbols, turnSeat, calculateTokenBind(), 4, afterOptions());
        both.placed.forEach((t) => reportAfter(t.idx, t.effect, t.after));
        harvestMagic(both.granted);
        playEffect('token', undefined, picks, '両トークン');
        spendMagic(late().calculateCost(seatCosts.onClickBothToken, true, false, currentTurnPlayer, 'onClickBothToken'), true, true, 'onClickBothToken');
        setCurrentBoard(board);
        setUseToken(true);
    };

    const onClickToken = () => {
        const board = currentBoard.slice();
        const t = putTokens(board, 'plain', 1);
        if (t.placed.length === 0) return;
        const index = t.placed[0].idx;
        addLog(`「トークン」を使用（${posName(index)}に設置）`);
        playEffect('token', index, [index], 'トークン');
        t.report();
        setCurrentBoard(board);
        spendMagic(late().calculateCost(seatCosts.onClickToken, true, false, currentTurnPlayer, 'onClickToken'), true, true, 'onClickToken');
        setUseToken(true);
    };

    const onClickDoubleToken = () => {
        const board = currentBoard.slice();
        const t = putTokens(board, 'plain', 2);
        const cells = t.placed.map((x) => x.idx);
        if (cells.length === 0) return;
        addLog(`「ダブルトークン」を使用（${cells.map(posName).join('・')}に設置）`);
        playEffect('token', undefined, cells, 'ダブルトークン');
        t.report();
        setCurrentBoard(board);
        spendMagic(late().calculateCost(seatCosts.onClickDoubleToken, true, false, currentTurnPlayer, 'onClickDoubleToken'), true, true, 'onClickDoubleToken');
        setUseToken(true);
    };

    // 泥田坊: 相手の泥田坊が働いていると、トークンで置くコマのライフは0
    const calculateTokenBind = (): number => mudAdjustedBind(currentBoard, currentTurnPlayer, tokenBindOf(currentCharacter, turnGears));

    const onClickBudsToken = () => {
        const board = currentBoard.slice();
        const t = putTokens(board, 'buds', 1);
        if (t.placed.length === 0) return;
        const index = t.placed[0].idx;
        addLog(`「バッズトークン」を使用（${posName(index)}に設置）`);
        playEffect('token', index, [index], 'バッズトークン');
        t.report();
        setCurrentBoard(board);
        spendMagic(late().calculateCost(seatCosts.onClickBudsToken, true, false, currentTurnPlayer, 'onClickBudsToken'), true, true, 'onClickBudsToken');
        setUseToken(true);
    };

    return { calculateTokenBind, onClickToken, onClickDoubleToken, onClickBudsToken, onClickBothToken, onClickBuds, onClickDoubleBuds, onClickSlash, onClickBackSlash, onClickOpium, onClickCharge, onClickAddLife, onClickBibine, onClickUseLock, onClickUseDoubleLock, onClickUseTripleLock, onClickShuffle, setUseLock, activeBudsCount, poisonCount, useLock, applyLock, useInjection, poisonStrike, toxicBloom, setUseInjection, usePandemic, poisonerInPlay, useBuds, setUseBuds, spreadPoisonAround, putTokens, miasmaCost, setUsePandemic, afterTokenPlaced, putTokensAt, reportAfter, charge, shuffleCost, miasmaPlan };
};

export type BasicSkillsResult = ReturnType<typeof useBasicSkills>;
