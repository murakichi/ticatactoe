// Game.tsx から切り出したスキルのハンドラ群: 陰陽の切り替え・式神・オブジェクト
// 本体は Game.tsx の同じ位置にあったものをそのまま移した。Game の変数は scope(g) で、あとで定義されるもの(calculateCost など)は late() 経由で受け取る
import { GearTurnState } from './gearTurn';
import { SkillCosts } from './skillCosts';
import React from 'react';
import { useState } from 'react';
import { CharacterId, YingYangMode } from '../../types/Character';
import { SquareInfo } from '../../types/SquareInfo';
import { isShikigami } from '../../util';
import { TokenKind, PutContext, PlacedToken } from './tokenPlace';
import { shikigamiLandable, SHIKIGAMI_BLESS_LIFE, SHIKIGAMI_CURSE_STACKS, SHIKIGAMI_LIFE, blast as shikigamiBlast, bless as shikigamiBless, blessTargets as blessTargetsOf, curse as shikigamiCurse, curseTargets as curseTargetsOf, newShikigami, ownShikigamiCells, purge as shikigamiPurge, purgeTargets as purgeTargetsOf } from './shikigami';
import { OBJECT_SKILLS, ObjectSkill, objectSkillTargets, objectSkillUsable, runObjectSkill, OBJECT_DEFS, ObjectKind, newObject, objectLandable, sweepBurntTrees } from './objects';
import { SkillEffectType, BurstType } from './BoardEffects';
import { SHIKIGAMI_DISCOUNT_BASE, Discount } from './discount';
import { GearId, gearTokenBindDelta } from './gear';
import { PendingMode } from './pendingMode';
import { PlayEffectExtra } from './usePresentation';
import { GameLate } from './gameLate';

export interface ShikigamiSkillsScope {
    addLog: (message: string) => void;
    playEffect: (type: SkillEffectType, index?: number | undefined, indexes?: number[] | undefined, label?: string | undefined, extra?: PlayEffectExtra | undefined) => void;
    currentYinYangMode: YingYangMode | undefined;
    setYinYangModeAt: (seat: number, value: YingYangMode | ((prev: YingYangMode | undefined) => YingYangMode | undefined) | undefined) => void;
    turnSeat: number;
    spendMagic: (cost: number, bumpCount?: boolean, isSkill?: boolean, skillId?: string) => void;
    gearCost: (cost: number, seat?: number, isToken?: boolean, skillKey?: string, withLeaf?: boolean) => number;
    seatCosts: SkillCosts;
    pendingFlag: (m: PendingMode) => [boolean, (on: boolean) => void];
    currentBoard: SquareInfo[];
    currentTurnPlayer: "💙" | "⭕" | "🟩" | "🔶" | "⭐" | "🟣" | "🟫" | "🩷";
    characters: CharacterId[];
    flashCells: (indexes: number[]) => void;
    setCurrentBoard: React.Dispatch<React.SetStateAction<SquareInfo[]>>;
    posName: (i: number) => string;
    gearTurn: React.MutableRefObject<GearTurnState & { infernoReady: boolean[]; freeCast: boolean; processedTurn: number }>;
    playBurst: (type: BurstType, cells: number[]) => void;
    harvestMagic: (n: number) => void;
    toxicBloom: (board: SquareInfo[], cells: number[]) => void;
    putTokens: (board: SquareInfo[], kind: TokenKind, n: number, extra?: Partial<PutContext>, afterPut?: ((board: SquareInfo[], idx: number) => void) | undefined) => { report: () => void; placed: PlacedToken[]; granted: number; };
    turnGears: GearId[];
    setUseToken: React.Dispatch<React.SetStateAction<boolean>>;
}
export const useShikigamiSkills = (g: ShikigamiSkillsScope, late: () => GameLate) => {
    const { addLog, playEffect, currentYinYangMode, setYinYangModeAt, turnSeat, spendMagic, gearCost, seatCosts, pendingFlag, currentBoard, currentTurnPlayer, characters, flashCells, setCurrentBoard, posName, gearTurn, playBurst, harvestMagic, toxicBloom, putTokens, turnGears, setUseToken } = g;


    const onClickToggleYingYang = () => {
        addLog('「陰陽転化」を使用（陰陽モードを切替）');
        // 自分のモードを見て反転する (issue #12: 以前は💙のモードを見ていて⭕が永久に陽へ切り替えられなかった)
        playEffect('yinyang', undefined, undefined, undefined, { variant: currentYinYangMode === 'yang' ? '陰' : '陽' });
        setYinYangModeAt(turnSeat, (m) => (m === 'yang' ? 'ying' : 'yang'));
        spendMagic(gearCost(seatCosts.onClickToggleYingYang, turnSeat, false, 'onClickToggleYingYang'), false, true, 'onClickToggleYingYang');
    };

    // 式神(📜): 紙の分身。ライフ2で列には数えない。自分で補強すると🌱付きの自陣コマ、相手に乗っ取られると空きマスになる。
    // 陰: 任意の空きマスに置く(コスト2) / 陽: 自分の式神を1つ選んで爆破(コスト4)。sim/engine.js の SHIKIGAMI_* と同値
    const [useShikigamiPlace, setUseShikigamiPlace] = pendingFlag('shikigamiPlace');
    const [useShikigamiBlast, setUseShikigamiBlast] = pendingFlag('shikigamiBlast');
    const [useShikigamiBless, setUseShikigamiBless] = pendingFlag('shikigamiBless');
    const [useShikigamiCurse, setUseShikigamiCurse] = pendingFlag('shikigamiCurse');
    const [useShikigamiPurge, setUseShikigamiPurge] = pendingFlag('shikigamiPurge');
    const ownShikigami = (): number[] => ownShikigamiCells(currentBoard, currentTurnPlayer);
    // オブジェクト(idx 105-109): 空きマスを選んで設置する。列に数えず、ライフは減らない。効果は手番開始時（下の [currentTurn] の effect）。仕様は objects.ts
    const [objectPlacing, setObjectPlacing] = useState<ObjectKind | null>(null);
    // オブジェクトのスキル（解体・風化・補強工事・分譲）で、対象のマスを選んでいる最中のスキル
    const [objectTool, setObjectTool] = useState<ObjectSkill | null>(null);
    const objectSkillTargetsNow = (skill: ObjectSkill): number[] => objectSkillTargets(skill, currentBoard, currentTurnPlayer, characters);
    // 解体・風化・補強工事・分譲は使ってから対象を選ぶ。地ならし・増築は即座に発動する
    const onClickObjectSkill = (skill: ObjectSkill) => {
        const def = OBJECT_SKILLS[skill];
        if (!objectSkillUsable(skill, currentBoard, currentTurnPlayer, characters)) return;
        const pay = () => spendMagic(late().calculateCost(seatCosts[def.costKey], false, false, currentTurnPlayer, def.costKey), true, true, def.costKey);
        if (def.target) {
            addLog(`「${def.name}」を使用（対象のオブジェクトを選択）`);
            setObjectTool(skill);
            pay();
            return;
        }
        const board = currentBoard.slice();
        const r = runObjectSkill(skill, board, currentTurnPlayer, characters, -1) as NonNullable<ReturnType<typeof runObjectSkill>>;
        addLog(`「${def.name}」を使用（${skill === 'levelAll' ? `${r.destroyed.length}個のオブジェクトを破壊${r.blocked.length > 0 ? `・氷結${r.blocked.length}個が身代わり` : ''}` : `自陣${r.affected.length}個のオブジェクトのライフ+2`}）`);
        flashCells([...r.destroyed, ...r.blocked, ...r.affected]);
        playEffect(skill === 'levelAll' ? 'tsunami' : 'heal', undefined, [...r.destroyed, ...r.blocked, ...r.affected], def.name);
        setCurrentBoard(board);
        pay();
    };
    const exeObjectTool = (i: number) => {
        if (!objectTool) return;
        const def = OBJECT_SKILLS[objectTool];
        const board = currentBoard.slice();
        const r = runObjectSkill(objectTool, board, currentTurnPlayer, characters, i);
        if (!r) return; // 対象でないマスは選び直せる
        addLog(`${posName(i)}に「${def.name}」${r.destroyed.length > 0 ? '（破壊）' : r.blocked.length > 0 ? '（氷結が身代わり）' : ''}`);
        flashCells([i, ...r.destroyed, ...r.blocked, ...r.affected]);
        playEffect(objectTool === 'reinforce' ? 'heal' : objectTool === 'duplicate' ? 'token' : 'tsunami', i, [i, ...r.affected], def.name);
        setObjectTool(null);
        setCurrentBoard(board);
    };
    // 敵のオブジェクト（ライフ0）を乗っ取る着手の選択ダイアログが開いているマス
    const [captureChoice, setCaptureChoice] = useState<number | null>(null);
    const onClickObject = (kind: ObjectKind) => {
        const def = OBJECT_DEFS[kind];
        addLog(`「${def.name}」を使用（空きマスを選択）`);
        setObjectPlacing(kind);
        spendMagic(late().calculateCost(seatCosts[def.costKey], false, false, currentTurnPlayer, def.costKey), true, true, def.costKey);
    };
    const exeObjectPlace = (i: number) => {
        if (!objectPlacing || !objectLandable(currentBoard[i])) return; // 埋まっている・氷結中・ロック中のマスは選び直せる
        const board = currentBoard.slice();
        board[i] = { ...newObject(currentTurnPlayer, objectPlacing), effects: currentBoard[i].effects.filter((e) => e.effect === '🔥') }; // 空きマスに乗っていた🔥は引き継ぐ（大木は即座に燃え尽きる）
        sweepBurntTrees(board);
        addLog(`${posName(i)}に${OBJECT_DEFS[objectPlacing].name}を設置`);
        flashCells([i]);
        playEffect('token', i, [i], OBJECT_DEFS[objectPlacing].name);
        setObjectPlacing(null);
        setObjectTool(null);
        setCaptureChoice(null);
        setCurrentBoard(board);
    };
    const onClickShikigamiPlace = () => {
        addLog('「式神設置」を使用（空きマスを選択）');
        setUseShikigamiPlace(true);
        spendMagic(gearCost(seatCosts.onClickShikigamiPlace, turnSeat, false, 'onClickShikigamiPlace'), false, true, 'onClickShikigamiPlace');
    };
    const exeShikigamiPlace = (i: number) => {
        if (!shikigamiLandable(currentBoard[i])) return; // 埋まっている・氷結中・ロック中のマスは選び直せる
        const board = currentBoard.slice();
        board[i] = newShikigami(currentTurnPlayer);
        gearTurn.current.shikiPlaced[turnSeat] = true;
        addLog(`${posName(i)}に式神を設置`);
        flashCells([i]);
        playEffect('shikigami', i);
        setUseShikigamiPlace(false);
        setCurrentBoard(board);
    };
    const onClickShikigamiBlast = () => {
        addLog('「式神爆破」を使用（自分の式神を選択）');
        setUseShikigamiBlast(true);
        spendMagic(gearCost(seatCosts.onClickShikigamiBlast, turnSeat, false, 'onClickShikigamiBlast'), false, true, 'onClickShikigamiBlast');
    };
    const exeShikigamiBlast = (i: number) => {
        if (!ownShikigami().includes(i)) return; // 自分の式神でないマスは選び直せる
        const board = currentBoard.slice();
        const { affected, broken, destroyed } = shikigamiBlast(board, i, currentTurnPlayer, characters);
        late().addCorpses(destroyed);
        addLog(`${posName(i)}の式神が爆破（周囲${affected.length}マスに影響${destroyed > 0 ? `・${destroyed}コマ破壊` : ''}）`);
        flashCells(affected);
        playEffect('shikigamiBlast', i);
        playBurst('iceBreak', broken);
        setUseShikigamiBlast(false);
        setCurrentBoard(board);
    };
    // 汎用(idx 88 式神の加護・コスト5): 自分の式神を1体選んで消費し、自陣のコマ全て（式神を除く）のライフを+3する。自陣のコマが無いと使えない。sim/engine.js の exeShikigamiBless と同値
    const blessTargets = (): number[] => blessTargetsOf(currentBoard, currentTurnPlayer);
    const onClickShikigamiBless = () => {
        if (ownShikigami().length === 0 || blessTargets().length === 0) return;
        addLog('「式神の加護」を使用（消費する自分の式神を選択）');
        setUseShikigamiBless(true);
        spendMagic(late().calculateCost(seatCosts.onClickShikigamiBless, false, false, currentTurnPlayer, 'onClickShikigamiBless'), true, true, 'onClickShikigamiBless');
    };
    const exeShikigamiBless = (i: number) => {
        if (!ownShikigami().includes(i)) return; // 自分の式神でないマスは選び直せる
        const board = currentBoard.slice();
        const targets = shikigamiBless(board, i, currentTurnPlayer);
        addLog(`${posName(i)}の式神を消費（自陣${targets.length}コマのライフ+${SHIKIGAMI_BLESS_LIFE}）`);
        flashCells([i, ...targets]);
        playEffect('scrollBless', i, [i, ...targets]);
        setUseShikigamiBless(false);
        setCurrentBoard(board);
    };
    // 汎用(idx 89 式神の呪詛・コスト5): 自分の式神を1体選んで消費し、エフェクトが乗っている敵のコマ全て（🔑ロック・無敵を除く）に☠を2つ付与する。対象が無いと使えない。sim/engine.js の exeShikigamiCurse と同値
    const curseTargets = (): number[] => curseTargetsOf(currentBoard, currentTurnPlayer, characters);
    const onClickShikigamiCurse = () => {
        if (ownShikigami().length === 0 || curseTargets().length === 0) return;
        addLog('「式神の呪詛」を使用（消費する自分の式神を選択）');
        setUseShikigamiCurse(true);
        spendMagic(late().calculateCost(seatCosts.onClickShikigamiCurse, false, false, currentTurnPlayer, 'onClickShikigamiCurse'), true, true, 'onClickShikigamiCurse');
    };
    const exeShikigamiCurse = (i: number) => {
        if (!ownShikigami().includes(i)) return; // 自分の式神でないマスは選び直せる
        const board = currentBoard.slice();
        const targets = shikigamiCurse(board, i, currentTurnPlayer, characters);
        harvestMagic(targets.length * SHIKIGAMI_CURSE_STACKS);
        toxicBloom(board, targets);
        addLog(`${posName(i)}の式神を消費（敵${targets.length}コマに☠×${SHIKIGAMI_CURSE_STACKS}）`);
        flashCells([i, ...targets]);
        playEffect('scrollCurse', i, [i, ...targets]);
        setUseShikigamiCurse(false);
        setCurrentBoard(board);
    };
    // 汎用(idx 91 式神の供犠・コスト5、自陣の式神3体以上で0): 自陣の式神をランダムに1体壊し、続けて選んだ敵のコマ1体（式神を除く・🔑ロック/無敵を除く）のライフを0にする。sim/engine.js の exeShikigamiPurge と同値
    const purgeTargets = (): number[] => purgeTargetsOf(currentBoard, currentTurnPlayer, characters);
    const onClickShikigamiPurge = () => {
        const mine = ownShikigami();
        if (mine.length === 0 || purgeTargets().length === 0) return;
        addLog('「式神の供犠」を使用（式神を1体壊し、敵のコマを選択）');
        setUseShikigamiPurge(true);
        spendMagic(late().calculateCost(seatCosts.onClickShikigamiPurge, false, false, currentTurnPlayer, 'onClickShikigamiPurge'), true, true, 'onClickShikigamiPurge');
        const victim = mine[Math.floor(Math.random() * mine.length)]; // 先に1体壊す（コストは壊す前の式神の数で決まる）
        const board = currentBoard.slice();
        board[victim] = { player: undefined, bind: 0, effects: [] };
        flashCells([victim]);
        playEffect('scrollPurge', victim);
        setCurrentBoard(board);
    };
    const exeShikigamiPurge = (i: number) => {
        if (!purgeTargets().includes(i)) return; // 対象でない敵コマは選び直せる
        const board = currentBoard.slice();
        shikigamiPurge(board, i);
        addLog(`${posName(i)}のライフを0に`);
        flashCells([i]);
        playEffect('scrollPurge', i);
        setUseShikigamiPurge(false);
        setCurrentBoard(board);
    };
    // 汎用(idx 90 式神割引・コスト2): 次に打つスキルのコストを 2＋盤面にある式神の数 だけ軽減する（軽減札なので「次に打つスキル」を消費せず、足す）
    const onClickShikigamiDiscount = () => {
        const n = SHIKIGAMI_DISCOUNT_BASE + currentBoard.filter((sq) => isShikigami(sq)).length;
        addLog(`「式神割引」を使用（次のスキル-${n}）`);
        spendMagic(late().calculateCost(seatCosts.onClickShikigamiDiscount, false, false, currentTurnPlayer, 'onClickShikigamiDiscount'), true, true, 'onClickShikigamiDiscount');
        const d = gearTurn.current.discount[turnSeat];
        gearTurn.current.discount[turnSeat] = { ...d, next: d.next + n };
        playEffect('scrollDiscount');
    };
    // 汎用(idx 71): 自分の式神を全て通常の自陣コマにする
    const onClickShikigamiAll = () => {
        const mine = ownShikigami();
        const board = currentBoard.slice();
        for (const i of mine) board[i] = { ...board[i], effects: board[i].effects.filter((e) => e.effect !== '📜') };
        if (mine.length === 0) return;
        addLog(`「式神一括」を使用（${mine.length}体が自陣のコマに）`);
        flashCells(mine);
        playEffect('shikigami');
        setCurrentBoard(board);
        // コストは式神1体あたり
        spendMagic(late().calculateCost(seatCosts.onClickShikigamiAll * mine.length, false, false, currentTurnPlayer, 'onClickShikigamiAll'), true, true, 'onClickShikigamiAll');
    };
    // 汎用(idx 73 百鬼夜行): 着手できる全ての空きマスにライフ0の式神を置く
    const onClickShikigamiFlood = () => {
        const board = currentBoard.slice();
        const placed: number[] = [];
        board.forEach((sq, i) => {
            if (shikigamiLandable(sq)) { board[i] = newShikigami(currentTurnPlayer, 0); placed.push(i); }
        });
        addLog(`「百鬼夜行」を使用（${placed.length}マスに式神）`);
        flashCells(placed);
        playEffect('shikigami');
        setCurrentBoard(board);
        spendMagic(late().calculateCost(seatCosts.onClickShikigamiFlood, false, false, currentTurnPlayer, 'onClickShikigamiFlood'), true, true, 'onClickShikigamiFlood');
        if (placed.length > 0) gearTurn.current.shikiPlaced[turnSeat] = true;
    };
    // 汎用(idx 72・トークン扱い): ランダムな空きマスに式神。トークン系ギア(補強・軽量)のライフ補正を受ける
    const onClickShikigamiRandom = () => {
        const board = currentBoard.slice();
        const t = putTokens(board, 'shikigami', 1, { shikigamiBind: Math.max(1, SHIKIGAMI_LIFE + gearTokenBindDelta(turnGears)) });
        if (t.placed.length > 0) {
            const index = t.placed[0].idx;
            addLog(`「式神ランダム設置」を使用（${posName(index)}に設置）`);
            flashCells([index]);
            playEffect('shikigami', index);
            t.report();
            setCurrentBoard(board);
        }
        spendMagic(late().calculateCost(seatCosts.onClickShikigamiRandom, true, false, currentTurnPlayer, 'onClickShikigamiRandom'), true, true, 'onClickShikigamiRandom');
        if (t.placed.length > 0) gearTurn.current.shikiPlaced[turnSeat] = true;
        setUseToken(true);
    };

    return { onClickToggleYingYang, onClickShikigamiPlace, onClickShikigamiBlast, onClickShikigamiBless, onClickShikigamiCurse, onClickShikigamiPurge, onClickShikigamiDiscount, onClickShikigamiAll, onClickShikigamiRandom, onClickShikigamiFlood, onClickObjectSkill, onClickObject, setUseShikigamiPlace, setUseShikigamiBlast, setUseShikigamiBless, setUseShikigamiCurse, setUseShikigamiPurge, setObjectPlacing, setObjectTool, setCaptureChoice, useShikigamiPlace, exeShikigamiPlace, objectPlacing, exeObjectPlace, objectTool, exeObjectTool, useShikigamiBlast, exeShikigamiBlast, useShikigamiBless, exeShikigamiBless, useShikigamiCurse, exeShikigamiCurse, useShikigamiPurge, exeShikigamiPurge, objectSkillTargetsNow, ownShikigami, blessTargets, curseTargets, purgeTargets, captureChoice };
};

export type ShikigamiSkillsResult = ReturnType<typeof useShikigamiSkills>;
