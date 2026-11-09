// Game.tsx から切り出したハンドラ群: ログのコピー・保存、設定画面に戻る、再スタート
// 本体は Game.tsx にあったものをそのまま移した。Game の変数は scope(g) で、あとで定義されるもの(calculateCost など)は late() 経由で受け取る
import { DamageEffect } from './BoardEffects';
import { RampState } from './gear';
import { GearTurnState } from './gearTurn';
import { GearId } from './gear';
import { rampStart } from './gear';
import React from 'react';
import { useState } from 'react';
import { SquareInfo } from '../../types/SquareInfo';
import { emptyDiscount, Discount } from './discount';
import { SkillCosts } from './skillCosts';
import { GameProps, CHARACTER_NAMES } from './gameTypes';
import { SkillEffect, BurstEffect } from './BoardEffects';
import { BoardGeometry } from './boardGeometry';
import { PendingMode } from './pendingMode';
import { GameLate } from './gameLate';

export interface GameControlsScope {
    damageHints: React.MutableRefObject<Map<number, { icon?: string | undefined; amount: number; }[]>>;
    setBoardDamage: React.Dispatch<React.SetStateAction<DamageEffect | null>>;
    setSkillBanAll: React.Dispatch<React.SetStateAction<({ mode: "max" | "min"; n: number; } | null)[]>>;
    rampRef: React.MutableRefObject<{ states: RampState[]; turn: number; counted: boolean; bonus: number; first: number | null }>;
    gearsBySeat: GearId[][];
    geo: BoardGeometry;
    seatCount: number;
    props: GameProps;
    symbols: ("💙" | "⭕" | "🟩" | "🔶" | "⭐" | "🟣" | "🟫" | "🩷")[];
    winner: "💙" | "⭕" | "🟩" | "🔶" | "⭐" | "🟣" | "🟫" | "🩷" | undefined;
    gameLog: string[];
    currentTurn: number;
    makeBoard: () => SquareInfo[];
    setCurrentBoard: React.Dispatch<React.SetStateAction<SquareInfo[]>>;
    setHistory: React.Dispatch<React.SetStateAction<SquareInfo[][]>>;
    setCurrentTurn: React.Dispatch<React.SetStateAction<number>>;
    setPlacements: React.Dispatch<React.SetStateAction<number>>;
    setMagicAll: React.Dispatch<React.SetStateAction<number[]>>;
    setUseMagicCountAll: React.Dispatch<React.SetStateAction<number[]>>;
    setUseTokenCountAll: React.Dispatch<React.SetStateAction<number[]>>;
    setUseToken: React.Dispatch<React.SetStateAction<boolean>>;
    setUseAssaultAll: React.Dispatch<React.SetStateAction<number[]>>;
    setProliferateAll: React.Dispatch<React.SetStateAction<boolean[]>>;
    setSilencedAll: React.Dispatch<React.SetStateAction<boolean[]>>;
    setLifeBanAll: React.Dispatch<React.SetStateAction<boolean[]>>;
    setGearOffAll: React.Dispatch<React.SetStateAction<boolean[]>>;
    setChargeBuffAll: React.Dispatch<React.SetStateAction<number[]>>;
    setProliferateCountAll: React.Dispatch<React.SetStateAction<number[]>>;
    setPendingMode: React.Dispatch<React.SetStateAction<PendingMode | null>>;
    setUseBuds: React.Dispatch<React.SetStateAction<[boolean, number]>>;
    setUseLock: React.Dispatch<React.SetStateAction<number>>;
    setUseInjection: React.Dispatch<React.SetStateAction<number>>;
    setGlacierPendingAll: React.Dispatch<React.SetStateAction<boolean[]>>;
    setGlacierChargeAll: React.Dispatch<React.SetStateAction<number[]>>;
    setBudGuardAll: React.Dispatch<React.SetStateAction<boolean[]>>;
    setObjectPlacing: React.Dispatch<React.SetStateAction<"bigTree" | "deadTree" | "spring" | "fort" | "thundercloud" | "market" | "sanctuary" | "poisonSwamp" | "workshop" | "barrierStone" | "amuletShrine" | "luckyCat" | "mudField" | "tongueKing" | "eightTrigrams" | "soloSign" | "oneWord" | "blindMonkey" | "unlockStone" | null>>;
    setObjectTool: React.Dispatch<React.SetStateAction<"demolish" | "weather" | "levelAll" | "reinforce" | "expandAll" | "duplicate" | null>>;
    setCaptureChoice: React.Dispatch<React.SetStateAction<number | null>>;
    setIcicleCell: React.Dispatch<React.SetStateAction<number | null>>;
    setRemainNecroAll: React.Dispatch<React.SetStateAction<number[]>>;
    setNecroCostAll: React.Dispatch<React.SetStateAction<number[]>>;
    baseNecromancyCost: 10;
    setPendingAIMove: React.Dispatch<React.SetStateAction<(string | number)[] | null>>;
    setGameLog: React.Dispatch<React.SetStateAction<string[]>>;
    setHighlightedCells: React.Dispatch<React.SetStateAction<number[]>>;
    setTurnSeat: React.Dispatch<React.SetStateAction<number>>;
    setStepRequest: React.Dispatch<React.SetStateAction<number>>;
    setRestartCount: React.Dispatch<React.SetStateAction<number>>;
    setPreviewCells: React.Dispatch<React.SetStateAction<number[]>>;
    setBoardEffect: React.Dispatch<React.SetStateAction<SkillEffect | null>>;
    setBoardBurst: React.Dispatch<React.SetStateAction<BurstEffect | null>>;
    setLockedSkillsAll: React.Dispatch<React.SetStateAction<number[][]>>;
    gearTurn: React.MutableRefObject<GearTurnState & { infernoReady: boolean[]; freeCast: boolean; processedTurn: number }>;
    ruinState: React.MutableRefObject<{ active: boolean[]; pending: boolean[]; snap: ("💙" | "⭕" | "🟩" | "🔶" | "⭐" | "🟣" | "🟫" | "🩷" | undefined)[] | null; snapBuds: number[] | null; snapFlames: number[] | null; ashActive: number[]; ashPending: number[]; lastMove: number | null; }>;
    lastStandUsed: React.MutableRefObject<boolean[]>;
    setLastStandSaves: React.Dispatch<React.SetStateAction<number>>;
    setPriceTables: React.Dispatch<React.SetStateAction<(SkillCosts | null)[]>>;
    rollPriceTables: () => (SkillCosts | null)[];
}
export const useGameControls = (g: GameControlsScope, late: () => GameLate) => {
    const { geo, seatCount, props, symbols, winner, gameLog, currentTurn, makeBoard, setCurrentBoard, setHistory, setCurrentTurn, setPlacements, setMagicAll, setUseMagicCountAll, setUseTokenCountAll, setUseToken, setUseAssaultAll, setProliferateAll, setSilencedAll, setLifeBanAll, setGearOffAll, setChargeBuffAll, setProliferateCountAll, setPendingMode, setUseBuds, setUseLock, setUseInjection, setGlacierPendingAll, setGlacierChargeAll, setBudGuardAll, setObjectPlacing, setObjectTool, setCaptureChoice, setIcicleCell, setRemainNecroAll, setNecroCostAll, baseNecromancyCost, setPendingAIMove, setGameLog, setHighlightedCells, setTurnSeat, setStepRequest, setRestartCount, setPreviewCells, setBoardEffect, setBoardBurst, setLockedSkillsAll, gearTurn, ruinState, lastStandUsed, setLastStandSaves, setPriceTables, rollPriceTables, gearsBySeat, rampRef, setSkillBanAll, setBoardDamage, damageHints } = g;


    const buildLogText = (): string => {
        const header = [
            '# 対戦ログ',
            `盤面: ${geo.size}x${geo.size} / ${seatCount}人`,
            ...props.players.map((p, seat) => `${symbols[seat]} ${CHARACTER_NAMES[p.character]}（${p.isAI ? 'AI' : '人間'}）`),
            winner ? `勝者: ${winner}` : '対戦中',
            '',
            '## 操作ログ',
        ];
        return [...header, ...gameLog].join('\n');
    };

    const [copied, setCopied] = useState<boolean>(false);
    const onClickCopyLog = async () => {
        const text = buildLogText();
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            // クリップボードが使えない環境向けのフォールバック
            window.prompt('以下のログをコピーしてください', text);
        }
    };

    const onClickDownloadLog = () => {
        const blob = new Blob([buildLogText()], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'game-log.txt';
        a.click();
        URL.revokeObjectURL(url);
    };

    // 盤面からキャラクター選択に戻る。対戦の途中なら、中断してよいか確認する
    const onClickBackToSetup = () => {
        const inProgress = currentTurn > 1 && !winner;
        if (inProgress && !window.confirm('対戦を中断して、キャラクター選択に戻りますか？')) return;
        props.onBackToSetup?.();
    };

    const onClickRestart = () => {
        const board = makeBoard();
        const zeros = () => Array(seatCount).fill(0);
        setCurrentBoard(board);
        setHistory([board]);
        setCurrentTurn(1);
        setPlacements(0);
        setMagicAll(Array(seatCount).fill(2));
        setUseMagicCountAll(zeros());
        setUseTokenCountAll(zeros());
        setUseToken(false);
        setUseAssaultAll(zeros());
        setProliferateAll(Array(seatCount).fill(false));
        setSilencedAll(Array(seatCount).fill(false));
        setSkillBanAll(Array(seatCount).fill(null));
        setLifeBanAll(Array(seatCount).fill(false));
        setGearOffAll(Array(seatCount).fill(false));
        setChargeBuffAll(Array(seatCount).fill(0));
        setProliferateCountAll(zeros());
        setPendingMode(null); // 構えを全て外す
        setUseBuds([false, 0]);
        setUseLock(0);
        setUseInjection(0);
        setGlacierPendingAll(Array(seatCount).fill(false));
        setGlacierChargeAll(Array(seatCount).fill(0));
        setBudGuardAll(Array(seatCount).fill(false));
        setObjectPlacing(null);
        setObjectTool(null);
        setCaptureChoice(null);
        setIcicleCell(null);
        setRemainNecroAll(zeros());
        setNecroCostAll(Array(seatCount).fill(baseNecromancyCost));
        setPendingAIMove(null);
        setGameLog([]);
        setHighlightedCells([]);
        setTurnSeat(0);
        setStepRequest(0);
        setRestartCount((c) => c + 1);
        setPreviewCells([]);
        setBoardEffect(null);
        setBoardBurst(null);
        setBoardDamage(null);
        damageHints.current = new Map();
        setLockedSkillsAll(Array.from({ length: seatCount }, () => []));
        // ギア: 手番内のスキル使用状況をリセットし、価格破壊のコスト表を引き直す
        gearTurn.current = {
            skills: Array<number>(seatCount).fill(0),
            echoReady: Array<boolean>(seatCount).fill(false),
            echoNext: Array<boolean>(seatCount).fill(false),
            kinds: Array.from({ length: seatCount }, () => new Set<string>()),
            infernoReady: Array<boolean>(seatCount).fill(false),
            discount: Array.from({ length: seatCount }, emptyDiscount),
            freeCast: false,
            oppSkilled: Array<boolean>(seatCount).fill(false),
            oppSkillPrev: Array<boolean>(seatCount).fill(false),
            plantPrev: Array<boolean>(seatCount).fill(false),
            plantBase: Array<number>(seatCount).fill(0),
            placedPrev: Array<boolean>(seatCount).fill(false),
            placeBase: Array<number>(seatCount).fill(0),
            fireBase: Array<number>(seatCount).fill(0),
            shikiPlaced: Array<boolean>(seatCount).fill(false),
            leafBase: Array<number>(seatCount).fill(0),
            tokenFree: Array<boolean>(seatCount).fill(false),
            pieceBase: Array<number>(seatCount).fill(0),
            turnSpent: Array<number>(seatCount).fill(0),
            oppBigSeen: Array<boolean>(seatCount).fill(false),
            oppBigPrev: Array<boolean>(seatCount).fill(false),
            marketUsed: Array<number>(seatCount).fill(0),
            bigCast: Array<boolean>(seatCount).fill(false),
            veil: Array<boolean>(seatCount).fill(false),
            veilNext: Array<boolean>(seatCount).fill(false),
            ward: Array<number>(seatCount).fill(0),
            wardFresh: Array<boolean>(seatCount).fill(false),
            lockSeen: Array<boolean>(seatCount).fill(false),
            lockFreeUsed: Array<boolean>(seatCount).fill(false),
            lockPrev: Array<boolean>(seatCount).fill(false),
            blessing: Array<number>(seatCount).fill(0),
            blessingFresh: Array<boolean>(seatCount).fill(false),
            darkPotUsed: Array<boolean>(seatCount).fill(false),
            chargeBase: Array<number>(seatCount).fill(0),
            processedTurn: 1,
        };
        ruinState.current = {
            active: Array<boolean>(seatCount).fill(false),
            pending: Array<boolean>(seatCount).fill(false),
            snap: null,
            snapBuds: null,
            snapFlames: null,
            ashActive: Array<number>(seatCount).fill(0),
            ashPending: Array<number>(seatCount).fill(0),
            lastMove: null,
        };
        lastStandUsed.current = Array<boolean>(seatCount).fill(false);
        rampRef.current = { states: gearsBySeat.map(() => rampStart()), turn: 0, counted: false, bonus: 0, first: rampRef.current.first };
        setLastStandSaves(0);
        setPriceTables(rollPriceTables());
    };

    return { onClickRestart, onClickBackToSetup, onClickCopyLog, copied, onClickDownloadLog };
};
