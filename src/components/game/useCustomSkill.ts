// Game.tsx から切り出したハンドラ群: オリジナルスキル（作成画面で選んだ仕様を実行する）
// 本体は Game.tsx にあったものをそのまま移した。Game の変数は scope(g) で、あとで定義されるもの(calculateCost など)は late() 経由で受け取る
import { CustomSkillSpec, applyCustom, applyDrawbacks, canCastCustom, customCellsAuto, customEffectType, customSkillCost, customTargets, globalOps, hasCellOps, selectCount } from './customSkill';
import { randomAnyPick } from '../../util';
import React from 'react';
import { CharacterId } from '../../types/Character';
import { SquareInfo } from '../../types/SquareInfo';
import { SkillEffectType, BurstType } from './BoardEffects';
import { BoardGeometry } from './boardGeometry';
import { PlayEffectExtra } from './usePresentation';
import { GameLate } from './gameLate';

export interface CustomSkillScope {
    stripTargets: () => number[];
    setSkillBanAt: (seat: number, value: { mode: "max" | "min"; n: number; } | ((prev: { mode: "max" | "min"; n: number; } | null) => { mode: "max" | "min"; n: number; } | null) | null) => void;
    customSpec: CustomSkillSpec | undefined;
    currentTurnPlayer: "💙" | "⭕" | "🟩" | "🔶" | "⭐" | "🟣" | "🟫" | "🩷";
    characters: CharacterId[];
    geo: BoardGeometry;
    keepBuds: (sq: SquareInfo) => boolean;
    currentBoard: SquareInfo[];
    addLog: (message: string) => void;
    posName: (i: number) => string;
    flashCells: (indexes: number[]) => void;
    playEffect: (type: SkillEffectType, index?: number | undefined, indexes?: number[] | undefined, label?: string | undefined, extra?: PlayEffectExtra | undefined) => void;
    playBurst: (type: BurstType, cells: number[]) => void;
    otherSeats: (seat: number) => number[];
    turnSeat: number;
    setSilencedAt: (seat: number, value: boolean | ((prev: boolean) => boolean)) => void;
    setGearOffAt: (seat: number, value: boolean | ((prev: boolean) => boolean)) => void;
    symbols: ("💙" | "⭕" | "🟩" | "🔶" | "⭐" | "🟣" | "🟫" | "🩷")[];
    harvestMagic: (n: number) => void;
    setCurrentBoard: React.Dispatch<React.SetStateAction<SquareInfo[]>>;
    withOverload: (board: SquareInfo[]) => SquareInfo[];
    setUseCustom: (on: boolean) => void;
    setCustomPicks: React.Dispatch<React.SetStateAction<number[]>>;
    setCurrentTurn: React.Dispatch<React.SetStateAction<number>>;
    currentTurn: number;
    spendMagic: (cost: number, bumpCount?: boolean, isSkill?: boolean, skillId?: string | undefined) => void;
    customPicks: number[];
}
export const useCustomSkill = (g: CustomSkillScope, late: () => GameLate) => {
    const { customSpec, currentTurnPlayer, characters, geo, keepBuds, currentBoard, addLog, posName, flashCells, playEffect, playBurst, otherSeats, turnSeat, setSilencedAt, setGearOffAt, symbols, harvestMagic, setCurrentBoard, withOverload, setUseCustom, setCustomPicks, setCurrentTurn, currentTurn, spendMagic, customPicks, setSkillBanAt, stripTargets } = g;

    // --- オリジナルスキル（idx CUSTOM_SKILL_IDX）: 作成画面で選んだ「対象・選び方・効果・代償」を実行する（customSkill.ts） ---
    // コストは仕様から自動算出（customSkillCost）して、キャラ・ギアの補正を通す
    const customBase = customSpec ? customSkillCost(customSpec) : 0;
    const customHasPoison = !!customSpec?.ops.some((o) => o.op === 'effect' && o.effect === 'poison');
    const customCost = (): number => late().calculateCost(customBase, false, customHasPoison, currentTurnPlayer, 'onClickCustom');
    const customEnv = () => ({ me: currentTurnPlayer, chars: characters, size: geo.size, keepBuds });
    const pickRandom = (cells: number[], n: number): number[] => randomAnyPick([...cells], n);
    // 効果と代償を盤面に反映して、演出・ログ・手番終了までを行う
    const runCustom = (spec: CustomSkillSpec, cells: number[], label: string) => {
        const board = currentBoard.slice();
        const res = applyCustom(board, cells, spec, customEnv());
        const cost = applyDrawbacks(board, spec, currentTurnPlayer, customEnv(), pickRandom);
        const blocked = [...res.blocked, ...cost.blocked];
        const thawed = [...res.thawed, ...cost.thawed];
        const destroyed = [...res.destroyed, ...cost.destroyed];
        if (blocked.length > 0) addLog(`氷結が身代わりになった（${blocked.map(posName).join('・')}）`);
        if (thawed.length > 0) addLog(`氷結が溶けた（${thawed.map(posName).join('・')}）`);
        if (destroyed.length > 0) addLog(`破壊された（${destroyed.map(posName).join('・')}）`);
        if (cost.affected.length > 0) addLog(`代償: ${cost.affected.map(posName).join('・')}に効果`);
        addLog(`「${spec.name}」を使用（${label}・${res.affected.length}マスに効果）`);
        flashCells([...res.affected, ...cost.affected]);
        playEffect(customEffectType(spec), undefined, res.affected, spec.name);
        playBurst('thaw', thawed);
        playBurst('iceBreak', blocked);
        // サイレンス・ギア封じ: 相手全員の席に掛ける（ギアのない相手には掛けない）
        globalOps(spec).forEach((op) => {
            if (op.op === 'silence' && op.mode === 'all') {
                otherSeats(turnSeat).forEach((seat) => setSilencedAt(seat, true));
                addLog('相手は次の手番スキルを使えない');
            } else if (op.op === 'silence') {
                otherSeats(turnSeat).forEach((seat) => setSkillBanAt(seat, { mode: op.mode as 'max' | 'min', n: op.n }));
                addLog(`相手は次の手番、コスト${op.n}${op.mode === 'max' ? '以下' : '以上'}のスキルを使えない`);
            } else if (op.op === 'gearOff') {
                const seats = stripTargets();
                seats.forEach((seat) => setGearOffAt(seat, true));
                if (seats.length > 0) addLog(`${seats.map((seat) => symbols[seat]).join('・')}のギアが次の手番の終わりまで無効`);
            }
        });
        if (spec.ops.some((o) => o.op === 'effect')) harvestMagic(res.affected.length);
        setCurrentBoard(spec.ops.some((o) => o.op === 'effect' && o.effect === 'charge') ? withOverload(board) : board);
        setUseCustom(false);
        setCustomPicks([]);
        if (spec.endTurn) setCurrentTurn(currentTurn + 1);
    };
    const onClickCustom = () => {
        if (!customSpec || !canCastCustom(currentBoard, customSpec, currentTurnPlayer, characters, stripTargets().length > 0)) return;
        if (!hasCellOps(customSpec)) {
            // サイレンス・ギア封じだけ: マスを選ばずに発動
            spendMagic(customCost(), true, true, 'onClickCustom');
            runCustom(customSpec, [], '相手全員');
            return;
        }
        if (customSpec.pick === 'select') {
            addLog(`「${customSpec.name}」を使用（マスを${selectCount(currentBoard, customSpec, currentTurnPlayer, characters)}つ選択）`);
            setCustomPicks([]);
            setUseCustom(true);
            spendMagic(customCost(), true, true, 'onClickCustom');
            return;
        }
        const cells = customCellsAuto(currentBoard, customSpec, currentTurnPlayer, characters, pickRandom);
        if (cells.length === 0) return;
        spendMagic(customCost(), true, true, 'onClickCustom');
        runCustom(customSpec, cells, customSpec.pick === 'all' ? '全体' : 'ランダム');
    };
    // 対象のマスを選んだ: 対象でないマス・選んだマスは無視（選び直せる）。必要な数がそろったら実行する
    const exeCustom = (i: number) => {
        if (!customSpec || customPicks.includes(i) || !customTargets(currentBoard, customSpec, currentTurnPlayer, characters).includes(i)) return;
        const picks = [...customPicks, i];
        if (picks.length < selectCount(currentBoard, customSpec, currentTurnPlayer, characters)) {
            setCustomPicks(picks);
            return;
        }
        runCustom(customSpec, picks, picks.map(posName).join('・'));
    };

    return { customBase, customHasPoison, customCost, onClickCustom, exeCustom };
};
