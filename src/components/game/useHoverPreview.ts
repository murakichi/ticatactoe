// Game.tsx から切り出したハンドラ群: ホバー時の範囲プレビューと、発動待ちスキルの名前・案内
// 本体は Game.tsx にあったものをそのまま移した。Game の変数は scope(g) で、あとで定義されるもの(calculateCost など)は late() 経由で受け取る
import React from 'react';
import { CharacterId } from '../../types/Character';
import { SquareInfo } from '../../types/SquareInfo';
import { shikigamiLandable } from './shikigami';
import { OBJECT_SKILLS, ObjectSkill, OBJECT_DEFS, objectLandable } from './objects';
import { cloneTargets, plunderTargets } from './generic';
import { isGuarded, connectedPieces, canJam, jammerTargets } from './charge';
import { isFrozen, sacrificeTargets, budStacks, budReceivers, canFreeze } from './thermal';
import { BoardGeometry } from './boardGeometry';
import { GameLate } from './gameLate';

export interface HoverPreviewScope {
    currentBoard: SquareInfo[];
    characters: CharacterId[];
    currentTurnPlayer: "💙" | "⭕" | "🟩" | "🔶" | "⭐" | "🟣" | "🟫" | "🩷";
    geo: BoardGeometry;
    setPreviewCells: React.Dispatch<React.SetStateAction<number[]>>;
    useStomp: boolean;
    useJudgeDay: boolean;
    usePandemic: boolean;
    useInjection: number;
    useChargeOne: boolean;
    useChargeSpread: boolean;
    useChargeArea: boolean;
    useClone: boolean;
    cloneSources: () => number[];
    usePlunder: boolean;
    useFrostArea: boolean;
    useIcicle: boolean;
    useFreezeSpread: boolean;
    useShatter: boolean;
    useKimon: boolean;
    kimonCandidates: () => number[];
    useSacrifice: boolean;
    sacrificeCandidates: () => number[];
    useSwidden: boolean;
    useShikigamiPlace: boolean;
    objectPlacing: "bigTree" | "deadTree" | "spring" | "fort" | "thundercloud" | "market" | "sanctuary" | "poisonSwamp" | "workshop" | "barrierStone" | "amuletShrine" | "luckyCat" | "mudField" | "tongueKing" | "eightTrigrams" | "soloSign" | "oneWord" | "blindMonkey" | "unlockStone" | null;
    objectTool: "demolish" | "weather" | "levelAll" | "reinforce" | "expandAll" | "duplicate" | null;
    objectSkillTargetsNow: (skill: "demolish" | "weather" | "levelAll" | "reinforce" | "expandAll" | "duplicate") => number[];
    useShikigamiBlast: boolean;
    ownShikigami: () => number[];
    useShikigamiBless: boolean;
    blessTargets: () => number[];
    useShikigamiCurse: boolean;
    curseTargets: () => number[];
    useShikigamiPurge: boolean;
    purgeTargets: () => number[];
    useSucker: boolean;
    suckerSources: () => number[];
    useFreeze: boolean;
    useIgnite: boolean;
    useTinder: boolean;
    tinderCandidates: () => number[];
    useThunderFire: boolean;
    thunderFireTargets: () => number[];
    useStash: boolean;
    stashTargets: () => number[];
    useBoltSilence: number;
    boltSilenceTargets: () => number[];
    useJammer: boolean;
    hailMaryPick: string | null;
}
export const useHoverPreview = (g: HoverPreviewScope, late: () => GameLate) => {
    const { currentBoard, characters, currentTurnPlayer, geo, setPreviewCells, useStomp, useJudgeDay, usePandemic, useInjection, useChargeOne, useChargeSpread, useChargeArea, useClone, cloneSources, usePlunder, useFrostArea, useIcicle, useFreezeSpread, useShatter, useKimon, kimonCandidates, useSacrifice, sacrificeCandidates, useSwidden, useShikigamiPlace, objectPlacing, objectTool, objectSkillTargetsNow, useShikigamiBlast, ownShikigami, useShikigamiBless, blessTargets, useShikigamiCurse, curseTargets, useShikigamiPurge, purgeTargets, useSucker, suckerSources, useFreeze, useIgnite, useTinder, tinderCandidates, useThunderFire, thunderFireTargets, useStash, stashTargets, useBoltSilence, boltSilenceTargets, useJammer, hailMaryPick } = g;


    const notLocked = (idx: number) => !isGuarded(currentBoard[idx], characters);
    const isOpponentCell = (idx: number) => !!currentBoard[idx].player && currentBoard[idx].player !== currentTurnPlayer;

    // ボタンホバー時に破壊範囲をプレビューするマス
    const slashPreview = (): number[] => geo.antiDiagonal.filter((idx) => notLocked(idx));
    const backSlashPreview = (): number[] => geo.mainDiagonal.filter((idx) => notLocked(idx));
    const opiumPreview = (): number[] =>
        currentBoard.map((_, idx) => idx).filter((idx) => isOpponentCell(idx) && currentBoard[idx].bind > 0 && notLocked(idx));

    const showPreview = (cells: number[]) => setPreviewCells(cells);
    const clearPreview = () => setPreviewCells([]);

    // マス選択待ちのスキルごとの、ホバー時のプレビュー範囲。先に並べた方が優先（同時に構えるのは1つだけ）
    const hoverPreviews: [unknown, (i: number) => number[]][] = [
        [useStomp, (i) => geo.stompRange(i)],
        [useJudgeDay, (i) => geo.judgeRange(i)],
        [usePandemic, (i) => geo.stompRange(i)],
        [useInjection > 0, (i) => [i]],
        [useChargeOne, (i) => [i]],
        [useChargeSpread, (i) => connectedPieces(currentBoard, i, geo.size)],
        [useChargeArea, (i) => geo.stompRange(i)],
        [useClone, (i) => cloneSources().includes(i) ? [i, ...cloneTargets(currentBoard, i, geo.size)] : []],
        [usePlunder, (i) => plunderTargets(currentBoard, currentTurnPlayer, characters).includes(i) ? [i] : []],
        [useFrostArea, (i) => geo.stompRange(i)],
        [useIcicle, (i) => [i]],
        [useFreezeSpread, (i) => connectedPieces(currentBoard, i, geo.size)],
        [useShatter, (i) => currentBoard[i].player && isFrozen(currentBoard[i]) ? [i] : []],
        [useKimon, (i) => kimonCandidates().includes(i) ? [i] : []],
        [useSacrifice, (i) => sacrificeCandidates().includes(i) ? [i, ...sacrificeTargets(currentBoard, currentBoard[i].bind, currentTurnPlayer, characters)] : []],
        [useSwidden, (i) => budStacks(currentBoard[i]) > 0 ? [i] : []],
        [useShikigamiPlace, (i) => shikigamiLandable(currentBoard[i]) ? [i, ...geo.surroundRange(i)] : []],
        [objectPlacing, (i) => objectLandable(currentBoard[i]) ? [i, ...geo.surroundRange(i)] : []],
        [objectTool, (i) => objectSkillTargetsNow(objectTool as ObjectSkill).includes(i) ? [i] : []],
        [useShikigamiBlast, (i) => ownShikigami().includes(i) ? [i, ...geo.surroundRange(i)] : []],
        [useShikigamiBless, (i) => ownShikigami().includes(i) ? [i, ...blessTargets()] : []],
        [useShikigamiCurse, (i) => ownShikigami().includes(i) ? [i, ...curseTargets()] : []],
        [useShikigamiPurge, (i) => purgeTargets().includes(i) ? [i] : []],
        [useSucker, (i) => suckerSources().includes(i) ? [i, ...budReceivers(currentBoard, i, currentTurnPlayer, geo.size)] : []],
        [useFreeze, (i) => canFreeze(currentBoard[i]) ? [i] : []],
        [useIgnite, (i) => [i]],
        [useTinder, (i) => tinderCandidates().includes(i) ? [i] : []],
        [useThunderFire, (i) => thunderFireTargets().includes(i) ? [i, ...geo.surroundRange(i)] : []],
        [useStash, (i) => stashTargets().includes(i) ? [i] : []],
        [useBoltSilence, (i) => boltSilenceTargets().includes(i) ? [i] : []],
        [useJammer, (i) => canJam(currentBoard, i, currentTurnPlayer, characters) ? jammerTargets(currentBoard, i, geo.size, currentTurnPlayer) : []],
    ];
    // マスのホバー時: マス選択型のスキルが構えている間だけ範囲を表示
    const onCellHover = (i: number) => {
        const active = hoverPreviews.find(([on]) => on);
        if (active) setPreviewCells(active[1](i));
    };
    const onCellLeave = () => {
        if (hoverPreviews.some(([on]) => on)) setPreviewCells([]);
    };

    // マス選択待ちのスキル名。選択後の演出より先に「何が発動したか」を盤面上に出す
    // 先に並べた方が優先。条件が偽なら false/null になり、find で飛ばされる
    const pendingSkillName: string | null = [
        useStomp && 'ストンプ',
        useThunderFire && '雷のない所に火は立たぬ',
        useBoltSilence && '沈黙は雷なり',
        useStash && '雷神のへそくり',
        useJudgeDay && '審判の日',
        useChargeSpread && '帯電拡散',
        usePandemic && 'パンデミック',
        useInjection > 0 && 'インジェクション',
        useChargeOne && '帯電付与',
        useClone && '写し身',
        usePlunder && '追い剥ぎ',
        useFrostArea && '範囲氷結',
        useIcicle && '氷柱',
        useFreezeSpread && '氷結拡散',
        useShatter && '砕氷',
        useSacrifice && '殉火',
        useKimon && '鬼門封じ',
        useSwidden && '焼畑',
        objectPlacing && OBJECT_DEFS[objectPlacing].name,
        objectTool && OBJECT_SKILLS[objectTool].name,
        useShikigamiPlace && '式神設置',
        useShikigamiBlast && '式神爆破',
        useShikigamiBless && '式神の加護',
        useShikigamiCurse && '式神の呪詛',
        useShikigamiPurge && '式神の供犠',
        useSucker && 'ひこばえ',
        useFreeze && '氷結',
        useIgnite && '火遁',
        useTinder && '火口',
    ].find((name) => name) || null;
    const skillAnnounce = pendingSkillName
        ? `${hailMaryPick ? `ヘイルメアリー → ` : ''}${pendingSkillName}：マスを選択`
        : hailMaryPick
        ? `ヘイルメアリー → ${hailMaryPick}`
        : null;

    return { showPreview, slashPreview, clearPreview, backSlashPreview, opiumPreview, skillAnnounce, onCellHover, onCellLeave };
};
