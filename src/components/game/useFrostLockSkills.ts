// Game.tsx から切り出したスキルのハンドラ群: 氷結系の範囲スキル・火炎系の固有スキル・鍵師のロック系スキル
// 本体は Game.tsx の同じ位置にあったものをそのまま移した。Game の変数は scope(g) で、あとで定義されるもの(calculateCost など)は late() 経由で受け取る
import { GearTurnState } from './gearTurn';
import { lockConvert, lockConvertCells, lockedSquareCount } from './keysmith';
import React from 'react';
import { useState } from 'react';
import { CharacterId } from '../../types/Character';
import { Player, seatOf } from '../../types/Player';
import { SquareInfo } from '../../types/SquareInfo';
import { randomAnyPick, randomPick } from '../../util';
import { TokenKind, PutContext, PlacedToken } from './tokenPlace';
import { BLESSING_STACK, BLESSING_TURNS, LOCK_EXTEND_STACK, VACANT_SEAL_STACK, lockExtend, lockRaid, opponentReaches, seal, sealBaseCost, sealReleaseCells, vacantSeal, vacantSealBaseCost } from './keysmith';
import { SkillEffectType, BurstType } from './BoardEffects';
import { lineCells, LineDir, BoardGeometry } from './boardGeometry';
import { isShielded, isGuarded, connectedPieces } from './charge';
import { isFrozen, cleanse, sacrificeCandidates as sacrificeCandidatesOf, ailmentStacks, ignite, randomFreezeCandidates, frostfallTargets, shatter, sacrificeFlame, infernoTargets, INFERNO_STACKS, freeze, infernoCostOf, canFreeze, leafFrostTargets, thawAll, fireStacksTotal, kimonTargets, kimon, fireWheelTargets, FIRE_WHEEL_COUNT, fireWheel, mogaribue, canMogaribue, MOGARIBUE_LIFE, leafDropTargets, leafDrop, leafCloakTargets, kindlingTargets, kindling } from './thermal';
import { SkillCosts } from './skillCosts';
import { Discount } from './discount';
import { PendingMode } from './pendingMode';
import { PlayEffectExtra } from './usePresentation';
import { GameLate } from './gameLate';

export interface FrostLockSkillsScope {
    setUseLockConvert: (on: boolean) => void;
    setLife: React.Dispatch<React.SetStateAction<number>>;
    life: number;
    pendingFlag: (m: PendingMode) => [boolean, (on: boolean) => void];
    currentBoard: SquareInfo[];
    characters: CharacterId[];
    bumpGlacierCharge: (n: number) => void;
    addLog: (message: string) => void;
    flashCells: (indexes: number[]) => void;
    playEffect: (type: SkillEffectType, index?: number | undefined, indexes?: number[] | undefined, label?: string | undefined, extra?: PlayEffectExtra | undefined) => void;
    setCurrentBoard: React.Dispatch<React.SetStateAction<SquareInfo[]>>;
    spendMagic: (cost: number, bumpCount?: boolean, isSkill?: boolean, skillId?: string) => void;
    seatCosts: SkillCosts;
    currentTurnPlayer: "💙" | "⭕" | "🟩" | "🔶" | "⭐" | "🟣" | "🟫" | "🩷";
    geo: BoardGeometry;
    posName: (i: number) => string;
    putTokens: (board: SquareInfo[], kind: TokenKind, n: number, extra?: Partial<PutContext>, afterPut?: ((board: SquareInfo[], idx: number) => void) | undefined) => { report: () => void; placed: PlacedToken[]; granted: number; };
    setUseToken: React.Dispatch<React.SetStateAction<boolean>>;
    addCorpses: (n: number) => void;
    playBurst: (type: BurstType, cells: number[]) => void;
    gearTurn: React.MutableRefObject<GearTurnState & { infernoReady: boolean[]; freeCast: boolean; processedTurn: number }>;
    turnSeat: number;
    keepBuds: (sq: SquareInfo) => boolean;
    setSkills: React.Dispatch<React.SetStateAction<number[]>>;
    reshuffledSkills: (deck: number[], locks: number[]) => number[];
    deckBySeat: number[][];
    currentLockedSkills: number[];
    setUseFreeze: (on: boolean) => void;
    costTableFor: (seat: number) => SkillCosts;
    setCurrentTurn: React.Dispatch<React.SetStateAction<number>>;
    currentTurn: number;
    setUseTinder: (on: boolean) => void;
    setUseIgnite: (on: boolean) => void;
}
export const useFrostLockSkills = (g: FrostLockSkillsScope, late: () => GameLate) => {
    const { pendingFlag, currentBoard, characters, bumpGlacierCharge, addLog, flashCells, playEffect, setCurrentBoard, spendMagic, seatCosts, currentTurnPlayer, geo, posName, putTokens, setUseToken, addCorpses, playBurst, gearTurn, turnSeat, keepBuds, setSkills, reshuffledSkills, deckBySeat, currentLockedSkills, setUseFreeze, costTableFor, setCurrentTurn, currentTurn, setUseTinder, setUseIgnite, life, setLife, setUseLockConvert } = g;


    // --- 氷結系の汎用スキル（idx 41-48）。作った❄は1個ずつ絶対零度のコスト軽減に数える ---
    const [useFrostArea, setUseFrostArea] = pendingFlag('frostArea');
    const [useIcicle, setUseIcicle] = pendingFlag('icicle');
    const [icicleCell, setIcicleCell] = useState<number | null>(null);
    const [useFreezeSpread, setUseFreezeSpread] = pendingFlag('freezeSpread');
    const [useShatter, setUseShatter] = pendingFlag('shatter');
    // cells のうち氷結を付けられるマスに❄を付け、数えて演出する。作れた数を返す
    // 雷霆の巫の⚡無敵のコマは、状態異常（氷結）の対象にならない（毒霧・パンデミックなどと同じ）
    const notShielded = (cells: number[]): number[] => cells.filter((k) => !isShielded(currentBoard[k], characters));
    const freezeCells = (cells: number[], label: string, focus?: number, banner?: string): number => {
        const board = currentBoard.slice();
        const made = freeze(board, notShielded(cells));
        bumpGlacierCharge(made.length);
        addLog(`${label}（${made.length}マスが氷結）`);
        flashCells(made);
        playEffect('freeze', focus, made, banner);
        setCurrentBoard(board);
        return made.length;
    };
    // 範囲氷結: 選んだマスと周囲8マス（3x3、空きマス含む）に❄
    const onClickFrostArea = () => {
        addLog('「範囲氷結」を使用（中心のマスを選択）');
        setUseFrostArea(true);
        spendMagic(late().calculateCost(seatCosts.onClickFrostArea, false, false, currentTurnPlayer, 'onClickFrostArea'), true, true, 'onClickFrostArea');
    };
    const exeFrostArea = (i: number) => {
        if (geo.stompRange(i).every((k) => !canFreeze(currentBoard[k]))) return; // 凍らせるマスが無い所は選び直せる
        freezeCells(geo.stompRange(i), `${posName(i)}を中心に範囲氷結`, i, '範囲氷結');
        setUseFrostArea(false);
    };
    // 氷柱: マスを選んで方向（横・縦・斜め）を選ぶと、盤の端から端までの線上に❄
    const onClickIcicle = () => {
        addLog('「氷柱」を使用（マスを選んで方向を選択）');
        setUseIcicle(true);
        setIcicleCell(null);
        spendMagic(late().calculateCost(seatCosts.onClickIcicle, false, false, currentTurnPlayer, 'onClickIcicle'), true, true, 'onClickIcicle');
    };
    const exeIcicle = (dir: LineDir) => {
        if (icicleCell === null) return;
        const cells = lineCells(geo.size, icicleCell, dir);
        if (cells.every((k) => !canFreeze(currentBoard[k]))) return;
        freezeCells(cells, `${posName(icicleCell)}を通る氷柱`, icicleCell, '氷柱');
        setUseIcicle(false);
        setIcicleCell(null);
    };
    // ランダム氷結: ランダムな1〜4マス（空きマス含む）に❄
    const onClickRandomFreeze = () => {
        const cands = notShielded(randomFreezeCandidates(currentBoard));
        if (cands.length === 0) return;
        const n = Math.min(cands.length, 1 + Math.floor(Math.random() * 4));
        freezeCells(randomAnyPick([...cands], n), '「ランダム氷結」を使用', undefined, 'ランダム氷結');
        spendMagic(late().calculateCost(seatCosts.onClickRandomFreeze, false, false, currentTurnPlayer, 'onClickRandomFreeze'), true, true, 'onClickRandomFreeze');
    };
    // 氷結拡散: コマを選ぶと、コマのあるマスだけを縦横に辿って届く全てのコマ（敵味方問わず）に❄
    const onClickFreezeSpread = () => {
        addLog('「氷結拡散」を使用（コマを選択）');
        setUseFreezeSpread(true);
        spendMagic(late().calculateCost(seatCosts.onClickFreezeSpread, false, false, currentTurnPlayer, 'onClickFreezeSpread'), true, true, 'onClickFreezeSpread');
    };
    const exeFreezeSpread = (i: number) => {
        const cells = connectedPieces(currentBoard, i, geo.size);
        if (cells.length === 0 || cells.every((k) => !canFreeze(currentBoard[k]))) return; // 空きマスは起点にできない
        freezeCells(cells, `${posName(i)}から氷結拡散`, i, '氷結拡散');
        setUseFreezeSpread(false);
    };
    // 氷結トークン: ❄付きの自陣コマをランダムな空きマスに置く
    const onClickFrostToken = () => {
        const board = currentBoard.slice();
        const t = putTokens(board, 'frost', 1);
        if (t.placed.length > 0) {
            const index = t.placed[0].idx;
            bumpGlacierCharge(t.placed[0].frost);
            addLog(`「氷結トークン」を使用（${posName(index)}に設置）`);
            playEffect('freeze', index, [index], '氷結トークン');
            t.report();
            setCurrentBoard(board);
        }
        spendMagic(late().calculateCost(seatCosts.onClickFrostToken, true, false, currentTurnPlayer, 'onClickFrostToken'), true, true, 'onClickFrostToken');
        setUseToken(true);
    };
    const onClickDoubleFrostToken = () => {
        const board = currentBoard.slice();
        const t = putTokens(board, 'frost', 2);
        const picks = t.placed.map((x) => x.idx);
        bumpGlacierCharge(t.placed.reduce((n, x) => n + x.frost, 0));
        addLog(`「氷結ダブルトークン」を使用（${picks.map(posName).join('・')}に設置）`);
        if (picks.length > 0) playEffect('freeze', picks[0], picks, '氷結ダブルトークン');
        t.report();
        setCurrentBoard(board);
        spendMagic(late().calculateCost(seatCosts.onClickDoubleFrostToken, true, false, currentTurnPlayer, 'onClickDoubleFrostToken'), true, true, 'onClickDoubleFrostToken');
        setUseToken(true);
    };
    // 砕氷: 氷結中のコマを選ぶと、❄を全部砕いて❄1つにつき3ダメージ（ライフ0なら破壊）。氷結は作られないのでコスト軽減には数えない
    const onClickShatter = () => {
        addLog('「砕氷」を使用（氷結中のコマを選択）');
        setUseShatter(true);
        spendMagic(late().calculateCost(seatCosts.onClickShatter, false, false, currentTurnPlayer, 'onClickShatter'), true, true, 'onClickShatter');
    };
    const exeShatter = (i: number) => {
        const sq = currentBoard[i];
        if (!sq.player || !isFrozen(sq)) return; // 氷結中のコマ以外は選び直せる
        const board = currentBoard.slice();
        const r = shatter(board, i);
        addLog(`${posName(i)}の氷を砕いた（❄${r.stacks}個で${r.damage}ダメージ${r.destroyed ? '・破壊' : ''}）`);
        if (r.destroyed) addCorpses(1);
        flashCells([i]);
        playEffect('glacierBurst', i, [i], '砕氷');
        setUseShatter(false);
        setCurrentBoard(board);
    };
    // 霜降り: 自陣のライフ2以下のコマすべてに❄
    const onClickFrostfall = () => {
        const targets = notShielded(frostfallTargets(currentBoard, currentTurnPlayer));
        if (targets.length === 0) return;
        freezeCells(targets, '「霜降り」を使用', undefined, '霜降り');
        spendMagic(late().calculateCost(seatCosts.onClickFrostfall, false, false, currentTurnPlayer, 'onClickFrostfall'), true, true, 'onClickFrostfall');
    };

    // 春一番: 自陣の❄を全て解除し、解除した❄の数だけ、このターンに打つ全スキルを軽減する（軽減札。自分自身は軽減されない）
    const onClickSpringWind = () => {
        const board = currentBoard.slice();
        const { stacks, cells } = thawAll(board, currentTurnPlayer);
        if (stacks === 0) return;
        addLog(`「春一番」を使用（自陣の❄${stacks}個を解除・このターンのスキル-${stacks}）`);
        flashCells(cells);
        playEffect('discount', undefined, cells, '春一番');
        playBurst('thaw', cells);
        setCurrentBoard(board);
        spendMagic(late().calculateCost(seatCosts.onClickSpringWind, false, false, currentTurnPlayer, 'onClickSpringWind'), true, true, 'onClickSpringWind');
        const d = gearTurn.current.discount[turnSeat];
        gearTurn.current.discount[turnSeat] = { ...d, turn: d.turn + stacks };
    };

    // 霜枯れ: 自陣の🍂を持つコマすべてに❄（氷結中は🍂が休眠してコスト上乗せが止まる代わりに、🔥や上書きから守れる）
    const onClickLeafFrost = () => {
        const targets = notShielded(leafFrostTargets(currentBoard, currentTurnPlayer));
        if (targets.length === 0) return;
        freezeCells(targets, '「霜枯れ」を使用', undefined, '霜枯れ');
        spendMagic(late().calculateCost(seatCosts.onClickLeafFrost, false, false, currentTurnPlayer, 'onClickLeafFrost'), true, true, 'onClickLeafFrost');
    };

    // 殉火（仮名）: 自陣のコマを1つ選んでライフをゼロにし、そのライフ以下の敵のコマ全てに🔥を付ける。手番は続く
    const [useSacrifice, setUseSacrifice] = pendingFlag('sacrifice');
    const sacrificeCandidates = (): number[] => sacrificeCandidatesOf(currentBoard, currentTurnPlayer, characters);
    const onClickSacrifice = () => {
        addLog('「殉火」を使用（犠牲にする自陣のコマを選択）');
        setUseSacrifice(true);
        spendMagic(late().calculateCost(seatCosts.onClickSacrifice, false, false, currentTurnPlayer, 'onClickSacrifice'), true, true, 'onClickSacrifice');
    };
    const exeSacrifice = (i: number) => {
        if (!sacrificeCandidates().includes(i)) return; // 自陣のライフが残るコマ以外・対象の敵がいないコマは選び直せる
        const board = currentBoard.slice();
        const r = sacrificeFlame(board, i, currentTurnPlayer, characters, geo.size, keepBuds);
        addLog(`${posName(i)}（ライフ${r.threshold}）を犠牲に、ライフ${r.threshold}以下の敵${r.targets.length}コマに🔥`);
        if (r.thawed.length > 0) addLog(`氷結が溶けた（${r.thawed.map(posName).join('・')}）`);
        flashCells([i, ...r.targets]);
        playEffect('flame', i, r.targets, '殉火');
        playBurst('thaw', r.thawed);
        setUseSacrifice(false);
        setCurrentBoard(board);
    };

    // 鬼門封じ: 敵のコマを1つ選んで破壊する（氷結中は❄-1だけ）。破壊して空きマスになったら3ターンロックする。🔑ロック・⚡無敵のコマは選べない
    const [useKimon, setUseKimon] = pendingFlag('kimon');
    // 落ち葉の置き土産: ランダムな敵のコマ1つに🍂を1つ付ける（🔑ロック・⚡無敵は除く）。クリック不要・手番は続く
    const leafDropCandidates = (): number[] => leafDropTargets(currentBoard, currentTurnPlayer, (sq) => isGuarded(sq, characters));
    const onClickLeafDrop = () => {
        const cands = leafDropCandidates();
        if (cands.length === 0) return;
        const pick = randomPick(cands);
        const board = currentBoard.slice();
        leafDrop(board, pick);
        addLog(`「落ち葉の置き土産」を使用（${posName(pick)}に🍂）`);
        flashCells([pick]);
        playEffect('leafDrop', undefined, [pick]);
        setCurrentBoard(board);
        spendMagic(late().calculateCost(seatCosts.onClickLeafDrop, false, false, currentTurnPlayer, 'onClickLeafDrop'), true, true, 'onClickLeafDrop');
    };
    // 落葉の衣: ランダムな自陣のコマ1つ（🔑ロック中も含む）に🍂を1つ付ける。クリック不要・手番は続く
    const leafCloakCandidates = (): number[] => leafCloakTargets(currentBoard, currentTurnPlayer);
    const onClickLeafCloak = () => {
        const cands = leafCloakCandidates();
        if (cands.length === 0) return;
        const pick = randomPick(cands);
        const board = currentBoard.slice();
        leafDrop(board, pick);
        addLog(`「落葉の衣」を使用（${posName(pick)}に🍂）`);
        flashCells([pick]);
        playEffect('leafCloak', undefined, [pick]);
        setCurrentBoard(board);
        spendMagic(late().calculateCost(seatCosts.onClickLeafCloak, false, false, currentTurnPlayer, 'onClickLeafCloak'), true, true, 'onClickLeafCloak');
    };
    // 焚きつけ: 敵の🍂と🌱を全て🔥に変換する（1つにつき🔥1つ。🔑ロック・⚡無敵は除く）。盤面の🍂1枚につき3・🌱1つにつき2コスト軽減。クリック不要・手番は続く
    const kindlingCandidates = (): number[] => kindlingTargets(currentBoard, currentTurnPlayer, (sq) => isGuarded(sq, characters), keepBuds);
    const onClickKindling = () => {
        const cands = kindlingCandidates();
        if (cands.length === 0) return;
        const board = currentBoard.slice();
        const { leaves, buds, thawed } = kindling(board, cands, geo.size, keepBuds);
        addLog(`「焚きつけ」を使用（敵の🍂${leaves}枚・🌱${buds}個を🔥に変換）`);
        if (thawed.length > 0) addLog(`氷結が溶けた（${thawed.map(posName).join('・')}）`);
        flashCells(cands);
        playEffect('kindling', undefined, cands);
        playBurst('thaw', thawed);
        setCurrentBoard(board);
        spendMagic(late().calculateCost(seatCosts.onClickKindling, false, false, currentTurnPlayer, 'onClickKindling'), true, true, 'onClickKindling');
    };
    const kimonCandidates = (): number[] => kimonTargets(currentBoard, currentTurnPlayer, (sq) => isGuarded(sq, characters));
    // 錠前割引（汎用 idx 135）: 盤面のロックのマスの数だけ、このターンに打つ全スキルを軽減する（使った時点の数で固定。春一番と同じ turn 軽減）
    const onClickLockDiscount = () => {
        const n = lockedSquareCount(currentBoard);
        if (n === 0) return;
        addLog(`「錠前割引」を使用（ロックのマス${n}個・このターンのスキル-${n}）`);
        playEffect('lockDiscount');
        spendMagic(late().calculateCost(seatCosts.onClickLockDiscount, false, false, currentTurnPlayer, 'onClickLockDiscount'), true, true, 'onClickLockDiscount');
        const d = gearTurn.current.discount[turnSeat];
        gearTurn.current.discount[turnSeat] = { ...d, turn: d.turn + n };
    };
    const onClickLockConvert = () => {
        if (lockConvertCells(currentBoard).length === 0) return;
        addLog('「錠の転換」を使用（ロックのかかっているマスを選択）');
        setUseLockConvert(true);
        spendMagic(late().calculateCost(seatCosts.onClickLockConvert, false, false, currentTurnPlayer, 'onClickLockConvert'), true, true, 'onClickLockConvert');
    };
    const exeLockConvert = (i: number) => {
        if (!lockConvertCells(currentBoard).includes(i)) return; // ロックの無いマスは選び直せる
        const board = currentBoard.slice();
        const gained = lockConvert(board, i);
        addLog(`${posName(i)}のロックを解除し、ライフ+${gained}`);
        flashCells([i]);
        playEffect('lockConvert', i, [i]);
        setUseLockConvert(false);
        setCurrentBoard(board);
        setLife(life + gained);
    };
    const onClickKimon = () => {
        addLog('「鬼門封じ」を使用（敵のコマを選択）');
        setUseKimon(true);
        spendMagic(late().calculateCost(seatCosts.onClickKimon, false, false, currentTurnPlayer, 'onClickKimon'), true, true, 'onClickKimon');
    };
    const exeKimon = (i: number) => {
        if (!kimonCandidates().includes(i)) return; // 敵のコマ以外・守られているコマは選び直せる
        const board = currentBoard.slice();
        const r = kimon(board, i);
        if (r.destroyed) {
            addCorpses(1);
            addLog(`${posName(i)}の敵コマを破壊し、3ターンロック`);
        } else {
            addLog(`${posName(i)}の氷結を1つ砕いた`);
        }
        flashCells([i]);
        playEffect('lock', i, [i], '鬼門封じ');
        playBurst('iceBreak', r.thawed ? [i] : []);
        setUseKimon(false);
        setCurrentBoard(board);
    };
    // 火の車: ランダムな敵のコマ2つに🔥を1つずつ付け、その後自分の手札をシャッフルする（無料）。このターン敵か自陣に🔥を付与していれば0コスト（撃つとリセット）。クリック不要・手番は続く
    const fireWheelGuard = (sq: SquareInfo) => isGuarded(sq, characters);
    const onClickFireWheel = () => {
        const cands = fireWheelTargets(currentBoard, currentTurnPlayer, fireWheelGuard);
        if (cands.length === 0) return;
        const picks = randomAnyPick(cands, Math.min(FIRE_WHEEL_COUNT, cands.length));
        const board = currentBoard.slice();
        const thawed = fireWheel(board, picks, geo.size, keepBuds);
        addLog(`「火の車」を使用（${picks.map(posName).join('・')}に🔥・手札をシャッフル）`);
        if (thawed.length > 0) addLog(`氷結が溶けた（${thawed.map(posName).join('・')}）`);
        flashCells(picks);
        playEffect('flame', undefined, picks, '火の車');
        playBurst('thaw', thawed);
        setCurrentBoard(board);
        spendMagic(late().calculateCost(seatCosts.onClickFireWheel, false, false, currentTurnPlayer, 'onClickFireWheel'), true, true, 'onClickFireWheel');
        gearTurn.current.fireBase[turnSeat] = fireStacksTotal(board); // 条件のリセット（この札自身が付けた🔥は数えない）
        setSkills(reshuffledSkills(deckBySeat[turnSeat], currentLockedSkills)); // 手札のシャッフル（無料。スキル扱いではない）
    };

    // 飛び火: ランダムな敵マス2つに🔥を1つずつ付ける（火の車からシャッフルを除いたもの）。直前の手番に相手がコマを2つ以上設置していれば0（1手番に1回まで）
    const onClickSpark = () => {
        const cands = fireWheelTargets(currentBoard, currentTurnPlayer, fireWheelGuard);
        if (cands.length === 0) return;
        const picks = randomAnyPick(cands, Math.min(FIRE_WHEEL_COUNT, cands.length));
        const board = currentBoard.slice();
        const thawed = fireWheel(board, picks, geo.size, keepBuds);
        addLog(`「飛び火」を使用（${picks.map(posName).join('・')}に🔥）`);
        if (thawed.length > 0) addLog(`氷結が溶けた（${thawed.map(posName).join('・')}）`);
        flashCells(picks);
        playEffect('sparkJump', undefined, picks);
        playBurst('thaw', thawed);
        setCurrentBoard(board);
        spendMagic(late().calculateCost(seatCosts.onClickSpark, false, false, currentTurnPlayer, 'onClickSpark'), true, true, 'onClickSpark');
        gearTurn.current.placedPrev[turnSeat] = false; // 無料で撃てるのは1手番に1回まで
    };

    // 浄化: 自陣のコマの状態異常（毒・火炎・氷結・帯電）を全部回復する。クリック不要・手番は続く
    const ownAilmentCells = (): number[] =>
        currentBoard.map((sq, i) => (sq.player === currentTurnPlayer && ailmentStacks(sq) > 0 ? i : -1)).filter((i) => i !== -1);
    const onClickCleanse = () => {
        const board = currentBoard.slice();
        const done = cleanse(board, currentTurnPlayer);
        addLog(`「浄化」を使用（${done.length}コマの状態異常を回復）`);
        flashCells(done);
        playEffect('cleanse');
        setCurrentBoard(board);
        spendMagic(late().calculateCost(seatCosts.onClickCleanse, false, false, currentTurnPlayer, 'onClickCleanse'), true, true, 'onClickCleanse');
    };
    // 氷室の番人は常在のロックの代わりにこの「氷結」を持つ: マスを1つ選んで❄を付ける（空きマス可）
    const onClickCryoFreeze = () => {
        addLog('「氷結」を使用（マスを選択）');
        setUseFreeze(true);
        spendMagic(late().calculateCost(seatCosts.onClickCryoFreeze, false, false, currentTurnPlayer, 'onClickCryoFreeze'), true, true, 'onClickCryoFreeze');
    };
    // 固有スキル 業火（煉獄の鍛冶師）: 敵のコマ全て（🔑ロック中・⚡無敵を除く）に🔥を2スタックずつ付ける。クリック不要・手番は続く。
    // 氷結中のマスは🔥の代わりに❄が減る
    const infernoCost = (player: Player = currentTurnPlayer): number =>
        infernoCostOf(costTableFor(seatOf(player)).onClickInferno, gearTurn.current.infernoReady[seatOf(player)], (c) => late().calculateCost(c, false, false, player, 'onClickInferno'));
    const onClickInferno = () => {
        const targets = infernoTargets(currentBoard, currentTurnPlayer, characters);
        if (targets.length === 0) return;
        const board = currentBoard.slice();
        addLog(`「業火」を使用（${targets.length}コマに🔥+${INFERNO_STACKS}）`);
        const { thawed } = ignite(board, targets, geo.size, INFERNO_STACKS, keepBuds);
        if (thawed.length > 0) addLog(`氷結が溶けた（${thawed.map(posName).join('・')}）`);
        flashCells(targets);
        playEffect('inferno', undefined, targets);
        playBurst('thaw', thawed);
        setCurrentBoard(board);
        spendMagic(infernoCost(), false, true, 'onClickInferno');
        gearTurn.current.infernoReady[turnSeat] = false; // 撃ったら無料権とカウントをリセット
        gearTurn.current.kinds[turnSeat] = new Set();
    };
    // 固有スキル 虎落笛（凩の魔女）: 自陣の🍂の枚数ぶん敵のコマ全てにスキルダメージ（🔑ロック中・⚡無敵を除く。氷結中は❄が減るだけ）、
    // 同時に自陣のコマ全てのライフ+2。クリック不要・手番は続く
    const mogaribueCost = (player: Player = currentTurnPlayer): number =>
        late().calculateCost(costTableFor(seatOf(player)).onClickMogaribue, false, false, player, 'onClickMogaribue');
    const onClickMogaribue = () => {
        if (!canMogaribue(currentBoard, currentTurnPlayer)) return;
        const board = currentBoard.slice();
        const { damage, hit, boosted } = mogaribue(board, currentTurnPlayer, characters);
        addLog(`「虎落笛」を使用（敵${hit.length}コマに${damage}ダメージ・自陣${boosted.length}コマのライフ+${MOGARIBUE_LIFE}）`);
        flashCells(hit);
        playEffect('autumn', undefined, hit.length > 0 ? hit : boosted, '虎落笛');
        setCurrentBoard(board);
        spendMagic(mogaribueCost(), false, true, 'onClickMogaribue');
    };
    // 固有スキル 封鎖の断（鍵師）: 自陣のコマ全てに7・空きマス全てに2のロック。敵のコマのロックを全て解除し、解除した数（最低1）だけ敵全てにダメージ。ターン終了
    const sealCost = (player: Player = currentTurnPlayer): number =>
        late().calculateCost(sealBaseCost(costTableFor(seatOf(player)).onClickSeal, sealReleaseCells(currentBoard, player).length), false, false, player, 'onClickSeal');
    const onClickSeal = () => {
        const cost = sealCost();
        const board = currentBoard.slice();
        const r = seal(board, currentTurnPlayer, characters);
        addLog(`「封鎖の断」を使用（自陣${r.own.length}・空き${r.empty.length}マスをロック、敵のロック${r.released.length}個を解除して敵${r.hit.length}コマに${r.damage}ダメージ・ターン終了）`);
        flashCells(r.hit);
        playEffect('sealBreak', undefined, [...r.own, ...r.empty]);
        setCurrentBoard(board);
        spendMagic(cost, true, true, 'onClickSeal');
        setCurrentTurn(currentTurn + 1);
    };
    // 錠前荒らし（汎用 idx 130）: 敵陣のロックを1つランダムに解除し、そのコマに🔥☠⚡のどれかをランダムに付与する。直前の相手ターンにロックが使われていたら0コスト
    const onClickLockRaid = () => {
        const board = currentBoard.slice();
        const cost = late().calculateCost(seatCosts.onClickLockRaid, false, false, currentTurnPlayer, 'onClickLockRaid');
        const r = lockRaid(board, currentTurnPlayer, characters, Math.random);
        if (!r) return;
        gearTurn.current.lockPrev[turnSeat] = false; // 無料で撃てるのは1手番に1回まで
        addLog(`「錠前荒らし」を使用（${posName(r.cell)}のロックを解除して${r.effect}を付与）`);
        flashCells([r.cell]);
        playEffect('lockRaid', r.cell, [r.cell]);
        setCurrentBoard(board);
        spendMagic(cost, true, true, 'onClickLockRaid');
    };
    // ロックの増築（汎用 idx 131）: 自陣のコマのロックのスタックを全て +2
    const onClickLockExtend = () => {
        const board = currentBoard.slice();
        const cost = late().calculateCost(seatCosts.onClickLockExtend, false, false, currentTurnPlayer, 'onClickLockExtend');
        const cells = lockExtend(board, currentTurnPlayer);
        if (cells.length === 0) return;
        addLog(`「ロックの増築」を使用（自陣${cells.length}コマのロック+${LOCK_EXTEND_STACK}）`);
        flashCells(cells);
        playEffect('lockExtend', undefined, cells);
        setCurrentBoard(board);
        spendMagic(cost, true, true, 'onClickLockExtend');
    };
    // 施錠の加護（汎用 idx 132）: 使った手番を含む自分の3手番の間、設置したコマにロックが2スタック付く
    const onClickLockBlessing = () => {
        gearTurn.current.blessing[turnSeat] = BLESSING_TURNS - 1; // 使った手番は減らさない（blessingFresh）ので、使った手番 + 残り2手番の計3手番
        gearTurn.current.blessingFresh[turnSeat] = true;
        addLog(`「施錠の加護」を使用（${BLESSING_TURNS}手番の間、設置したコマに🔑${BLESSING_STACK}）`);
        playEffect('lockBlessing');
        spendMagic(late().calculateCost(seatCosts.onClickLockBlessing, false, false, currentTurnPlayer, 'onClickLockBlessing'), true, true, 'onClickLockBlessing');
    };
    // 空き家封じ（汎用 idx 133）: 空きマス全てを2スタックでロック（ターンは続く）。相手のリーチ1つにつきコスト-3
    const vacantSealCost = (player: Player = currentTurnPlayer): number =>
        late().calculateCost(vacantSealBaseCost(costTableFor(seatOf(player)).onClickVacantSeal, opponentReaches(currentBoard, player, characters)), false, false, player, 'onClickVacantSeal');
    const onClickVacantSeal = () => {
        const cost = vacantSealCost();
        const board = currentBoard.slice();
        const cells = vacantSeal(board);
        if (cells.length === 0) return;
        addLog(`「空き家封じ」を使用（空きマス${cells.length}マスを${VACANT_SEAL_STACK}ターンロック）`);
        flashCells(cells);
        playEffect('vacantSeal', undefined, cells);
        setCurrentBoard(board);
        spendMagic(cost, true, true, 'onClickVacantSeal');
    };
    const exeFreeze = (i: number) => {
        if (!canFreeze(currentBoard[i])) return; // 🔑ロック・🔥のあるマスは選び直せる
        const board = currentBoard.slice();
        const made = freeze(board, [i]);
        bumpGlacierCharge(made.length);
        addLog(`${posName(i)}を氷結`);
        playEffect('freeze', i);
        setUseFreeze(false);
        setCurrentBoard(board);
    };
    // 🔥を付けたあとの共通処理: 解けた氷結をログに出す
    const igniteCells = (board: SquareInfo[], cells: number[]) => {
        const { thawed } = ignite(board, cells, geo.size, 1, keepBuds);
        if (thawed.length > 0) addLog(`氷結が溶けた（${thawed.map(posName).join('・')}）`);
        flashCells(cells);
        playEffect('flame', cells[0], undefined, '火遁');
        playBurst('thaw', thawed);
        setCurrentBoard(board);
    };
    const exeTinder = (i: number) => {
        const board = currentBoard.slice();
        addLog(`${posName(i)}に🔥を付与（火口）`);
        setUseTinder(false);
        const { thawed } = ignite(board, [i], geo.size, 1, keepBuds);
        if (thawed.length > 0) addLog(`氷結が溶けた（${thawed.map(posName).join('・')}）`);
        flashCells([i]);
        playEffect('tinder', i);
        playBurst('thaw', thawed);
        setCurrentBoard(board);
    };
    const exeIgnite = (i: number) => {
        const board = currentBoard.slice();
        addLog(`${posName(i)}に🔥を付与`);
        setUseIgnite(false);
        igniteCells(board, [i]);
    };

    return { onClickCryoFreeze, onClickShatter, onClickLeafDrop, onClickKindling, onClickLeafCloak, onClickCleanse, onClickLockRaid, onClickLockExtend, onClickLockBlessing, onClickVacantSeal, onClickSacrifice, onClickRandomFreeze, onClickFrostToken, onClickDoubleFrostToken, onClickFrostfall, onClickInferno, onClickMogaribue, onClickSeal, onClickLeafFrost, onClickKimon, onClickFireWheel, onClickSpark, setUseSacrifice, setUseKimon, setUseFrostArea, setUseIcicle, setUseFreezeSpread, setUseShatter, exeFreeze, useSacrifice, exeSacrifice, useKimon, exeKimon, useFrostArea, exeFrostArea, useIcicle, setIcicleCell, useFreezeSpread, exeFreezeSpread, useShatter, exeShatter, exeTinder, exeIgnite, notShielded, infernoCost, mogaribueCost, sealCost, kimonCandidates, sacrificeCandidates, ownAilmentCells, onClickFrostArea, onClickIcicle, onClickFreezeSpread, onClickSpringWind, fireWheelGuard, vacantSealCost, leafDropCandidates, kindlingCandidates, leafCloakCandidates, icicleCell, exeIcicle, exeLockConvert, onClickLockConvert, onClickLockDiscount };
};

export type FrostLockSkillsResult = ReturnType<typeof useFrostLockSkills>;
