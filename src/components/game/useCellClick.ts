// Game.tsx から切り出したハンドラ群: マスのクリック（スキルの対象選択・通常の着手）
// 本体は Game.tsx にあったものをそのまま移した。Game の変数は scope(g) で、あとで定義されるもの(calculateCost など)は late() 経由で受け取る
import React from 'react';
import AIPlayer from './AIPlayer';
import { CharacterId } from '../../types/Character';
import { Effect } from '../../types/Effect';
import { seatOf } from '../../types/Player';
import { SquareInfo } from '../../types/SquareInfo';
import { findEmptyIndexes, randomPick } from '../../util';
import { blessPlacedPiece, blessingActive, lockBlocksPlacement } from './keysmith';
import { boardWinner, newPieceBlocked } from './objects';
import { SkillEffectType, BurstType } from './BoardEffects';
import { decayBoard, shouldDecay, isCrowded, canHitBound, isTakeProtected } from './decay';
import { absorbDefeated, resolvePlacement } from './placement';
import { giantAura } from './giantAura';
import { isShielded, fireCharges, connectedPieces, withCharge, addCharge, canJam } from './charge';
import { moveBlocked } from './lifeBan';
import { emptyBlocked, lockable, overwriteBlocked } from './thermal';
import { GearId, GEAR_PARAMS, hasGear } from './gear';
import { playSfx } from '../../sound';
import { Discount } from './discount';
import { BoardGeometry } from './boardGeometry';
import { PlayEffectExtra } from './usePresentation';
import { GameLate } from './gameLate';

export interface CellClickScope {
    hailMarySpin: { label: string; phase: 'intro' | 'spin' | 'reveal'; } | null;
    setPreviewCells: React.Dispatch<React.SetStateAction<number[]>>;
    useThunderFire: boolean;
    thunderFireTargets: () => number[];
    exeThunderFire: (i: number) => void;
    useBoltSilence: number;
    boltSilenceTargets: () => number[];
    exeBoltSilence: (i: number) => void;
    useStash: boolean;
    stashTargets: () => number[];
    exeStash: (i: number) => void;
    useJammer: boolean;
    currentBoard: SquareInfo[];
    currentTurnPlayer: "💙" | "⭕" | "🟩" | "🔶" | "⭐" | "🟣" | "🟫" | "🩷";
    characters: CharacterId[];
    exeJammer: (i: number) => void;
    currentCharacter: CharacterId;
    remainNecro: number[];
    turnSeat: number;
    useChargeOne: boolean;
    addLog: (message: string) => void;
    posName: (i: number) => string;
    playEffect: (type: SkillEffectType, index?: number | undefined, indexes?: number[] | undefined, label?: string | undefined, extra?: PlayEffectExtra | undefined) => void;
    harvestMagic: (n: number) => void;
    setUseChargeOne: (on: boolean) => void;
    setCurrentBoard: React.Dispatch<React.SetStateAction<SquareInfo[]>>;
    withOverload: (board: SquareInfo[]) => SquareInfo[];
    useChargeArea: boolean;
    geo: BoardGeometry;
    flashCells: (indexes: number[]) => void;
    setUseChargeArea: (on: boolean) => void;
    useChargeSpread: boolean;
    setUseChargeSpread: (on: boolean) => void;
    useFreeze: boolean;
    exeFreeze: (i: number) => void;
    useSucker: boolean;
    exeSucker: (i: number) => void;
    useShikigamiPlace: boolean;
    exeShikigamiPlace: (i: number) => void;
    objectPlacing: "bigTree" | "deadTree" | "spring" | "fort" | "thundercloud" | "market" | "sanctuary" | "poisonSwamp" | "workshop" | "barrierStone" | "amuletShrine" | "luckyCat" | "mudField" | "tongueKing" | "eightTrigrams" | "soloSign" | "oneWord" | "blindMonkey" | null;
    exeObjectPlace: (i: number) => void;
    objectTool: "demolish" | "weather" | "levelAll" | "reinforce" | "expandAll" | "duplicate" | null;
    exeObjectTool: (i: number) => void;
    useShikigamiBlast: boolean;
    exeShikigamiBlast: (i: number) => void;
    useShikigamiBless: boolean;
    exeShikigamiBless: (i: number) => void;
    useShikigamiCurse: boolean;
    exeShikigamiCurse: (i: number) => void;
    useShikigamiPurge: boolean;
    exeShikigamiPurge: (i: number) => void;
    useSwidden: boolean;
    exeSwidden: (i: number) => void;
    useSacrifice: boolean;
    exeSacrifice: (i: number) => void;
    useKimon: boolean;
    exeKimon: (i: number) => void;
    useFrostArea: boolean;
    exeFrostArea: (i: number) => void;
    useClone: boolean;
    exeClone: (i: number) => void;
    usePlunder: boolean;
    exePlunder: (i: number) => void;
    useIcicle: boolean;
    setIcicleCell: React.Dispatch<React.SetStateAction<number | null>>;
    useFreezeSpread: boolean;
    exeFreezeSpread: (i: number) => void;
    useShatter: boolean;
    exeShatter: (i: number) => void;
    useTinder: boolean;
    tinderCandidates: () => number[];
    exeTinder: (i: number) => void;
    useIgnite: boolean;
    exeIgnite: (i: number) => void;
    useLock: number;
    applyLock: (board: SquareInfo[], idx: number) => void;
    setUseLock: React.Dispatch<React.SetStateAction<number>>;
    useInjection: number;
    poisonStrike: (sq: SquareInfo) => SquareInfo;
    toxicBloom: (board: SquareInfo[], cells: number[]) => void;
    setUseInjection: React.Dispatch<React.SetStateAction<number>>;
    usePandemic: boolean;
    exePandemic: (i: number) => void;
    useStomp: boolean;
    exeStomp: (i: number, currentBoard: SquareInfo[]) => void;
    useJudgeDay: boolean;
    exeJudgeDay: (i: number) => void;
    lifeBan: boolean[];
    life: number;
    seatCount: number;
    currentAI: AIPlayer | null;
    setCaptureChoice: React.Dispatch<React.SetStateAction<number | null>>;
    placedThisTurn: number;
    history: SquareInfo[][];
    currentTurn: number;
    setGiantShake: React.Dispatch<React.SetStateAction<number>>;
    ruinState: React.MutableRefObject<{ active: boolean[]; pending: boolean[]; snap: ("💙" | "⭕" | "🟩" | "🔶" | "⭐" | "🟣" | "🟫" | "🩷" | undefined)[] | null; snapBuds: number[] | null; snapFlames: number[] | null; ashActive: number[]; ashPending: number[]; lastMove: number | null; }>;
    placements: number;
    setPlacements: React.Dispatch<React.SetStateAction<number>>;
    symbols: ("💙" | "⭕" | "🟩" | "🔶" | "⭐" | "🟣" | "🟫" | "🩷")[];
    gearTrigger: (gearId: GearId, text?: string | undefined) => void;
    playBurst: (type: BurstType, cells: number[]) => void;
    setMagicAt: (seat: number, value: number | ((prev: number) => number)) => void;
    poisonerInPlay: boolean;
    addCorpses: (n: number) => void;
    useBuds: [boolean, number];
    setUseBuds: React.Dispatch<React.SetStateAction<[boolean, number]>>;
    gearTurn: React.MutableRefObject<{ skills: number[]; echoReady: boolean[]; echoNext: boolean[]; kinds: Set<string>[]; infernoReady: boolean[]; discount: Discount[]; freeCast: boolean; oppSkilled: boolean[]; oppSkillPrev: boolean[]; shikiPlaced: boolean[]; plantPrev: boolean[]; plantBase: number[]; placedPrev: boolean[]; placeBase: number[]; fireBase: number[]; leafBase: number[]; darkPotUsed: boolean[]; tokenFree: boolean[]; pieceBase: number[]; turnSpent: number[]; oppBigSeen: boolean[]; oppBigPrev: boolean[]; marketUsed: number[]; bigCast: boolean[]; veil: boolean[]; veilNext: boolean[]; ward: number[]; wardFresh: boolean[]; lockSeen: boolean[]; lockPrev: boolean[]; blessing: number[]; blessingFresh: boolean[]; chargeBase: number[]; processedTurn: number; }>;
    gearsBySeat: GearId[][];
    turnGears: GearId[];
    useAssault: number[];
    chargeBuff: number[];
    setUseAssaultAt: (seat: number, value: number | ((prev: number) => number)) => void;
    proliferate: boolean[];
    proliferateCount: number[];
    applyProliferate: (board: SquareInfo[], step: number) => string | null;
    setProliferateCountAt: (seat: number, value: number | ((prev: number) => number)) => void;
    proliferateMaxStacks: number;
    setProliferateAt: (seat: number, value: boolean | ((prev: boolean) => boolean)) => void;
    spreadPoisonAround: (board: SquareInfo[], idx: number) => void;
    setHistory: React.Dispatch<React.SetStateAction<SquareInfo[][]>>;
    setCurrentTurn: React.Dispatch<React.SetStateAction<number>>;
}
export const useCellClick = (g: CellClickScope, late: () => GameLate) => {
    const { hailMarySpin, setPreviewCells, useThunderFire, thunderFireTargets, exeThunderFire, useBoltSilence, boltSilenceTargets, exeBoltSilence, useStash, stashTargets, exeStash, useJammer, currentBoard, currentTurnPlayer, characters, exeJammer, currentCharacter, remainNecro, turnSeat, useChargeOne, addLog, posName, playEffect, harvestMagic, setUseChargeOne, setCurrentBoard, withOverload, useChargeArea, geo, flashCells, setUseChargeArea, useChargeSpread, setUseChargeSpread, useFreeze, exeFreeze, useSucker, exeSucker, useShikigamiPlace, exeShikigamiPlace, objectPlacing, exeObjectPlace, objectTool, exeObjectTool, useShikigamiBlast, exeShikigamiBlast, useShikigamiBless, exeShikigamiBless, useShikigamiCurse, exeShikigamiCurse, useShikigamiPurge, exeShikigamiPurge, useSwidden, exeSwidden, useSacrifice, exeSacrifice, useKimon, exeKimon, useFrostArea, exeFrostArea, useClone, exeClone, usePlunder, exePlunder, useIcicle, setIcicleCell, useFreezeSpread, exeFreezeSpread, useShatter, exeShatter, useTinder, tinderCandidates, exeTinder, useIgnite, exeIgnite, useLock, applyLock, setUseLock, useInjection, poisonStrike, toxicBloom, setUseInjection, usePandemic, exePandemic, useStomp, exeStomp, useJudgeDay, exeJudgeDay, lifeBan, life, seatCount, currentAI, setCaptureChoice, placedThisTurn, history, currentTurn, setGiantShake, ruinState, placements, setPlacements, symbols, gearTrigger, playBurst, setMagicAt, poisonerInPlay, addCorpses, useBuds, setUseBuds, gearTurn, gearsBySeat, turnGears, useAssault, chargeBuff, setUseAssaultAt, proliferate, proliferateCount, applyProliferate, setProliferateCountAt, proliferateMaxStacks, setProliferateAt, spreadPoisonAround, setHistory, setCurrentTurn } = g;

    // asObject: 敵のオブジェクト（ライフ0）を乗っ取るとき、自分のオブジェクトとして奪うか（false は自陣のコマで置き換え）。人間の手番で未指定なら選択ダイアログを出す
    const onCellClick = (i: number, asObject?: boolean) => {
        if (hailMarySpin) return;
        setPreviewCells([]);
        // 雷のない所に火は立たぬ: ⚡のあるコマを選ぶ。無敵マスでも自分のものは選べる（無敵の早期リターンより前に判定する）
        if (useThunderFire) {
            if (!thunderFireTargets().includes(i)) return; // ⚡のないマス・守られた他人のコマは選び直せる
            exeThunderFire(i);
            return;
        }
        // 雷神のへそくり: ⚡のある自陣のコマを選ぶ。無敵マスでも自分のものは選べる（雷霆の巫の⚡マスはすべて無敵なので、無敵の早期リターンより前に判定する）
        if (useBoltSilence > 0) {
            if (!boltSilenceTargets().includes(i)) return; // ⚡のない・自陣でないマスは選び直せる
            exeBoltSilence(i);
            return;
        }

        if (useStash) {
            if (!stashTargets().includes(i)) return; // ⚡のない・自陣でないマスは選び直せる
            exeStash(i);
            return;
        }
        // ジャマー: ⚡のあるマスを選ぶ。無敵マスでも**自分の**ものは選べる（弱点を解く唯一の手段）。
        // ⚡のないマス・他人の無敵マスは無視（選び直せる）。無敵の早期リターンより前に判定する
        if (useJammer) {
            if (!canJam(currentBoard, i, currentTurnPlayer, characters)) return;
            exeJammer(i);
            return;
        }
        // 雷霆の巫の⚡付き自陣マスは、本人も相手も触れない (無敵＋弱点)。対象選択スキルも含めて受け付けない
        if (isShielded(currentBoard[i], characters)) return;
        const prevPlayer = currentBoard[i].player;
        const necroActive = currentCharacter === 'necromancer' && remainNecro[turnSeat] > 0;
        const nextBoard = currentBoard.slice();
        if (useChargeOne) {
            nextBoard[i] = addCharge(nextBoard[i], characters);
            addLog(`${posName(i)}に⚡を付与`);
            playEffect('zap', i, undefined, '帯電付与');
            harvestMagic(1);
            setUseChargeOne(false);
            setCurrentBoard(withOverload(nextBoard));
            return;
        }

        if (useChargeArea) {
            const cells = geo.stompRange(i);
            addLog(`${posName(i)}を中心に範囲帯電（${cells.length}マスに⚡）`);
            flashCells(cells);
            playEffect('zap', i, undefined, '範囲帯電');
            setUseChargeArea(false);
            setCurrentBoard(withOverload(withCharge(currentBoard, cells, characters)));
            return;
        }

        if (useChargeSpread) {
            const cells = connectedPieces(currentBoard, i, geo.size);
            if (cells.length === 0) return; // 空きマスは起点にできない。選び直せる
            harvestMagic(cells.length);
            addLog(`${posName(i)}から帯電拡散（${cells.length}マスに⚡）`);
            flashCells(cells);
            playEffect('chainZap', i, cells);
            setUseChargeSpread(false);
            setCurrentBoard(withOverload(withCharge(currentBoard, cells, characters)));
            return;
        }

        if (useFreeze) {
            exeFreeze(i);
            return;
        }

        if (useSucker) {
            exeSucker(i);
            return;
        }

        if (useShikigamiPlace) {
            exeShikigamiPlace(i);
            return;
        }

        if (objectPlacing) {
            exeObjectPlace(i);
            return;
        }

        if (objectTool) {
            exeObjectTool(i);
            return;
        }

        if (useShikigamiBlast) {
            exeShikigamiBlast(i);
            return;
        }

        if (useShikigamiBless) {
            exeShikigamiBless(i);
            return;
        }

        if (useShikigamiCurse) {
            exeShikigamiCurse(i);
            return;
        }

        if (useShikigamiPurge) {
            exeShikigamiPurge(i);
            return;
        }

        if (useSwidden) {
            exeSwidden(i);
            return;
        }

        if (useSacrifice) {
            exeSacrifice(i);
            return;
        }

        if (useKimon) {
            exeKimon(i);
            return;
        }

        if (useFrostArea) {
            exeFrostArea(i);
            return;
        }

        if (useClone) {
            exeClone(i);
            return;
        }

        if (usePlunder) {
            exePlunder(i);
            return;
        }

        if (useIcicle) {
            // 氷柱: 通る線の基点を選び直せる（方向は盤の下のボタンで選ぶ）
            setIcicleCell(i);
            return;
        }

        if (useFreezeSpread) {
            exeFreezeSpread(i);
            return;
        }

        if (useShatter) {
            exeShatter(i);
            return;
        }

        if (useTinder) {
            if (!tinderCandidates().includes(i)) return; // 🌱も🍂も無いコマは選び直せる
            exeTinder(i);
            return;
        }

        if (useIgnite) {
            exeIgnite(i);
            return;
        }

        if (useLock > 0) {
            if (!lockable(nextBoard[i])) return; // 氷結中のマスにはロックできない。選び直せる
            applyLock(nextBoard, i);
            harvestMagic(1);
            addLog(`${posName(i)}をロック`);
            playEffect('lock', i);
            setUseLock(useLock - 1);
            setCurrentBoard(nextBoard);
            return;
        }

        if (useInjection > 0) {
            nextBoard[i] = poisonStrike({ ...nextBoard[i], effects: [...nextBoard[i].effects, { effect: '☠' }] });
            toxicBloom(nextBoard, [i]);
            harvestMagic(1);
            addLog(`${posName(i)}に毒を注入`);
            setUseInjection(useInjection - 1);
            playEffect('poison', i, undefined, 'インジェクション');
            setCurrentBoard(nextBoard);
            return;
        }

        if (usePandemic) {
            exePandemic(i);
            return;
        }

        if (useStomp) {
            exeStomp(i, nextBoard);
            return;
        }

        if (useJudgeDay) {
            exeJudgeDay(i);
            return;
        }

        if (boardWinner(currentBoard)) {
            return;
        } else if (moveBlocked(lifeBan[turnSeat], life)) {
            return; // ライフ3以下のコマは置けない（ライフを上げるか、チャージで手番を終える）
        } else if (currentBoard[i].player && currentBoard[i].player !== currentTurnPlayer) {
            if ((currentBoard[i].bind > 0 || isTakeProtected(currentBoard[i], characters)) && !canHitBound(currentCharacter, currentBoard, seatCount)) {
                return;
            }
        }

        if (lockBlocksPlacement(nextBoard[i], currentCharacter)) {
            return;
        }

        // ❄氷結中の空きマスには、🔑ロック中と同様に誰も着手できない
        if (emptyBlocked(currentBoard[i])) {
            return;
        }

        // ❄氷結中の自陣コマには重ねて強化できない
        if (currentBoard[i].player === currentTurnPlayer && overwriteBlocked(currentBoard[i])) {
            return;
        }

        if (asObject === undefined && !currentAI && currentBoard[i].object && currentBoard[i].player && currentBoard[i].player !== currentTurnPlayer && currentBoard[i].bind <= 0) {
            setCaptureChoice(i);
            return;
        }
        // お一人様限りの札: この手番に新しいコマを置いたあとは、空きマスに置けない
        if (!currentBoard[i].player && newPieceBlocked(currentBoard, currentTurnPlayer, placedThisTurn)) {
            addLog('お一人様限りの札: この手番はもう新しいコマを置けない');
            return;
        }
        setCaptureChoice(null);

        const nextHistory = [...history.slice(0, currentTurn + 1), nextBoard];
        playSfx('place');
        // 巨人は普通に置いただけでも、盤面が軽く揺れる(重さの表現)。毎回再生し直すため、A/B の2種を交互に使う
        if (currentCharacter === 'giant') setGiantShake((n) => n + 1);

        // 毒で bind が 0 になったマス（拡散パッシブの起点）
        const spreadOrigins: number[] = [];
        let poisonVanished = 0;
        // 3人以上は手番が1周するごとに1回だけ減衰させる (issue #30)
        ruinState.current.lastMove = i;
        const decayNow = shouldDecay(placements, seatCount);
        setPlacements(placements + 1);
        // 自然減衰・🔥と毒の継続ダメージ・ロックの期限切れ・毒で0になったコマの消滅は decay.ts で sim と共有
        const decayed = decayNow ? decayBoard(nextBoard, i, characters, symbols, isCrowded(nextBoard, seatCount)) : null; // 満杯の盤面は自然減衰がもう1回
        const burnCells = decayed?.burnCells ?? [];
        if (decayed) {
            spreadOrigins.push(...decayed.spreadOrigins);
            poisonVanished = decayed.spreadOrigins.length;
            for (const s of decayed.emptyLockSpawns) {
                const owner = nextBoard[s].player;
                addLog(`空蔵: ${posName(s)}が${owner}のコマになった`);
                gearTrigger('emptyLock', `${posName(s)}にコマ`);
                playBurst('gearEmpty', [s]);
            }
        }
        // 🔥の継続ダメージを受けたマスに炎の小演出
        playBurst('burn', burnCells);
        // 毒使い側は、毒で空いたマス1つにつき魔力+1
        if (poisonVanished > 0) {
            characters.forEach((c, seat) => {
                if (c === 'poisoner') setMagicAt(seat, (m) => m + poisonVanished);
            });
            addLog(`毒でマスが${poisonVanished}個消えた${poisonerInPlay ? '（毒使いの魔力+' + poisonVanished + '）' : ''}`);
        }

        // 着手の結果（強化・奪取・破壊・攻撃・新規）は placement.ts で sim と共有
        const placed = resolvePlacement(nextBoard[i], currentTurnPlayer, life, !!asObject);
        const capturedFrom = placed.capturedFrom; // 通常の攻撃で奪取した相手（復讐の刃）
        if (placed.poisonSpread) spreadOrigins.push(i); // 毒持ちの敵コマを奪取/破壊した場合は拡散の起点にする
        if (placed.corpse) addCorpses(1); // 敵味方問わずコマが奪われる/消えるたびに墓地+1
        const newPlayer = placed.square.player;
        const newEffects = placed.square.effects;
        if (newPlayer === currentTurnPlayer && useBuds[0]) {
            newEffects.push(...Array<Effect>(useBuds[1]).fill({ effect: '🌱' }));
            setUseBuds([false, 0]);
        }

        nextBoard[i] = { player: newPlayer, bind: placed.square.bind, effects: newEffects, ...(placed.square.object ? { object: placed.square.object } : {}) };
        // 施錠の加護: 効いている間、設置した（着手で自陣になった）コマにロックが付く
        if (blessingActive(gearTurn.current.blessing[turnSeat]) && newPlayer === currentTurnPlayer && !nextBoard[i].object) nextBoard[i] = blessPlacedPiece(nextBoard[i]);

        // 復讐の刃: 奪われた側は魔力を得る（1手の獲得は上限あり）。奪った側が装備していれば魔力を失う
        const vengeanceGained: Record<number, number> = {};
        const vengeanceGain = (seat: number) => {
            if (!hasGear(gearsBySeat[seat], 'vengeance')) return;
            const add = Math.min(GEAR_PARAMS.vengeanceGain, GEAR_PARAMS.vengeanceCap - (vengeanceGained[seat] ?? 0));
            if (add <= 0) return;
            vengeanceGained[seat] = (vengeanceGained[seat] ?? 0) + add;
            setMagicAt(seat, (m) => m + add);
            addLog(`復讐の刃: ${symbols[seat]}の魔力+${add}`);
            gearTrigger('vengeance', `魔力+${add}`);
        };
        if (capturedFrom) {
            vengeanceGain(seatOf(capturedFrom));
            if (hasGear(turnGears, 'vengeance')) {
                setMagicAt(turnSeat, (m) => Math.max(0, m - GEAR_PARAMS.vengeancePenalty));
                gearTrigger('vengeance', `魔力-${GEAR_PARAMS.vengeancePenalty}`);
            }
        }

        if (!prevPlayer) {
            addLog(`${posName(i)}にコマを配置`);
        } else if (prevPlayer === currentTurnPlayer) {
            addLog(`${posName(i)}のコマを強化`);
        } else if (newPlayer === currentTurnPlayer) {
            addLog(`${posName(i)}の相手のコマを奪取`);
        } else if (!newPlayer) {
            addLog(`${posName(i)}の相手のコマを破壊`);
        } else {
            addLog(`${posName(i)}の相手のコマを攻撃`);
        }

        if (useAssault[turnSeat] > 0) {
            const emptyIndex = randomPick(findEmptyIndexes(nextBoard));
            nextBoard[emptyIndex] = { player: currentTurnPlayer, bind: 0, effects: [] };
            if (chargeBuff[turnSeat] > 0) nextBoard[emptyIndex] = addCharge(nextBoard[emptyIndex], characters);
            addLog(`全軍突撃で${posName(emptyIndex)}にトークンを設置`);
            setUseAssaultAt(turnSeat, useAssault[turnSeat] - 1);
        }

        // 増殖発動中: 着手のたびにコマ→アイテムを交互に1つずつ追加し続ける
        if (proliferate[turnSeat]) {
            const nextCount = proliferateCount[turnSeat] + 1;
            const added = applyProliferate(nextBoard, nextCount);
            if (added) {
                addLog(`増殖(${nextCount}回目): ${added}`);
                playEffect('proliferate');
                setProliferateCountAt(turnSeat, nextCount);
                // 上限に達したら自然収束（維持コストの暴走とループの無限化を防ぐ）
                if (nextCount >= proliferateMaxStacks) {
                    addLog('増殖が限界に達して収束した');
                    setProliferateAt(turnSeat, false);
                    setProliferateCountAt(turnSeat, 0);
                }
            }
        }

        // ⚡発火: 着手マスの隣にある帯電マスが、その縦横隣接のコマへ1ダメージ（蘇生の吸収より前）
        const fire = fireCharges(nextBoard, i, geo.size, characters, gearsBySeat.map((g) => hasGear(g, 'conduction')));
        if (fire.fired.length > 0) {
            addLog(`⚡発火（${fire.fired.map(posName).join('・')}）${fire.damaged.length > 0 ? `で${fire.damaged.length}コマにダメージ` : ''}`);
            flashCells(fire.damaged);
            playEffect('zap', fire.fired[0], undefined, '⚡発火');
            if (fire.carried.length > 0) gearTrigger('conduction', `毒・火炎が${fire.carried.length}マスに移った`);
        }

        // 静電気の季節: 新しく置いた（奪った）自分のコマに⚡を付ける。発火のあとに付けるので、自分では発火しない（補強は設置ではないので対象外）
        let buffCharged = false;
        if (chargeBuff[turnSeat] > 0 && prevPlayer !== currentTurnPlayer && nextBoard[i].player === currentTurnPlayer) {
            nextBoard[i] = addCharge(nextBoard[i], characters);
            buffCharged = true;
        }

        // 巨人のオーラ: 周囲8マスの敵コマを破壊し、周囲8マス全部をロックする
        if (currentCharacter === 'giant' && nextBoard[i].player === currentTurnPlayer) {
            const aura = giantAura(nextBoard, geo.surroundRange(i), currentTurnPlayer, characters);
            if (aura.destroyed.length > 0) addCorpses(aura.destroyed.length);
            if (aura.destroyed.length > 0 || aura.locked.length > 0) {
                addLog(`巨人のオーラ: ${aura.destroyed.length}コマを破壊、${aura.locked.length}マスをロック`);
                flashCells(aura.destroyed);
            }
        }

        // 蘇生発動中: ライフが0になった敵コマを自動で自陣に吸収する
        if (necroActive) {
            const absorbedCells = absorbDefeated(nextBoard, currentTurnPlayer);
            absorbedCells.forEach((c) => vengeanceGain(seatOf(c.from)));
            const absorbed = absorbedCells.length;
            if (absorbed > 0) {
                addLog(`蘇生発動中: ライフ0の敵コマ${absorbed}個を自陣に吸収`);
                addCorpses(absorbed);
            }
        }

        // 毒拡散パッシブ: 毒で死んだ/毒持ちが奪取破壊されたマスの周囲へ毒を拡散
        if (poisonerInPlay && spreadOrigins.length > 0) {
            for (const o of spreadOrigins) spreadPoisonAround(nextBoard, o);
            addLog('毒が周囲に拡散');
        }

        setCurrentBoard(buffCharged ? withOverload(nextBoard) : nextBoard);

        setHistory(nextHistory);
        setCurrentTurn(currentTurn + 1);
    };

    return { onCellClick };
};
