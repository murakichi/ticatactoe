// Game.tsx から切り出したハンドラ群: 手番まわりの派生値（次の席・スキルの無効判定・コスト・勝敗・着手できるか・蘇生の状態）
// 本体は Game.tsx にあったものをそのまま移した。Game の変数は scope(g) で、あとで定義されるもの(calculateCost など)は late() 経由で受け取る
import React from 'react';
import AIPlayer from './AIPlayer';
import { useEffect } from 'react';
import { CharacterId } from '../../types/Character';
import { Player, seatOf } from '../../types/Player';
import { SquareInfo } from '../../types/SquareInfo';
import { calculateWinner, lineSymbols } from '../../util';
import { lockBlocksPlacement } from './keysmith';
import { encircleWinner } from './objects';
import { calculateCostOf, CostEnv } from './cost';
import { canHitBound, isTakeProtected } from './decay';
import { seatForTurn } from './giantTurn';
import { isShielded } from './charge';
import { emptyBlocked, overwriteBlocked } from './thermal';
import { playSfx } from '../../sound';
import { BoardGeometry } from './boardGeometry';
import { GameLate } from './gameLate';

export interface TurnDerivedScope {
    currentTurn: number;
    characters: CharacterId[];
    turnSeat: number;
    currentTurnPlayer: "💙" | "⭕" | "🟩" | "🔶" | "⭐" | "🟣" | "🟫" | "🩷";
    magic: number[];
    useToken: boolean;
    costEnvFor: (seat: number) => CostEnv;
    currentBoard: SquareInfo[];
    lastStandHolderFor: (w: "💙" | "⭕" | "🟩" | "🔶" | "⭐" | "🟣" | "🟫" | "🩷") => number;
    currentAI: AIPlayer | null;
    stallRef: React.MutableRefObject<{ turn: number; over: boolean; queued: boolean; spinning: boolean; charge: () => void; }>;
    pendingAIMove: (string | number)[] | null;
    hailMarySpin: { label: string; phase: "intro" | "spin" | "reveal"; } | null;
    onClickCharge: () => void;
    geo: BoardGeometry;
    necroCost: number[];
    remainNecro: number[];
    setWinsAt: (seat: number, value: number | ((prev: number) => number)) => void;
    currentCharacter: CharacterId;
    seatCount: number;
    silenced: boolean[];
    addLog: (message: string) => void;
    setCurrentTurn: React.Dispatch<React.SetStateAction<number>>;
}
export const useTurnDerived = (g: TurnDerivedScope, late: () => GameLate) => {
    const { currentTurn, characters, turnSeat, currentTurnPlayer, magic, useToken, costEnvFor, currentBoard, lastStandHolderFor, currentAI, stallRef, pendingAIMove, hailMarySpin, onClickCharge, geo, necroCost, remainNecro, setWinsAt, currentCharacter, seatCount, silenced, addLog, setCurrentTurn } = g;


    // 次の手番の席。巨人は2ターンに1回しか動かない（並びは giantTurn.ts。currentTurn だけで決まる）
    const judgeNextSeat = (): number => seatForTurn(currentTurn, characters, turnSeat);

    const checkSkillDisable = (cost: number, isToken: boolean = false, isPoison: boolean = false, skillKey?: string): boolean => {
        const calculatedCost: number = calculateCost(cost, isToken, isPoison, currentTurnPlayer, skillKey);
        return magic[turnSeat] < calculatedCost || (isToken && useToken);
    };

    // player 省略時は手番プレイヤー。パネルで非手番側のコストを出すために指定できる。
    // 増加分（キャラの加算・敵の🍂）を先に足し、減少分（キャラの割引・魔女のパッシブ・ギア・割引スキル）をそのあとに掛ける。
    // characterCost が増加分→キャラの減少分、gearCost がギアの補正と割引スキル。下限1は減少のたびに掛かる
    const calculateCost = (cost: number, isToken: boolean = false, isPoison: boolean = false, player: Player = currentTurnPlayer, skillKey?: string) =>
        calculateCostOf(costEnvFor(seatOf(player)), cost, isToken, isPoison, skillKey);

    // 土壇場の防壁が発動する勝利は、列が消えるまで勝ちとして扱わない
    // 八卦の陣の勝利は4つ並びではないので、土壇場の防壁（列を消す）の対象にならない
    const lineWinner = calculateWinner(lineSymbols(currentBoard));
    const encircle = encircleWinner(currentBoard);
    const rawWinner = lineWinner ?? encircle?.player;
    const winner = rawWinner && (!lineWinner || lastStandHolderFor(rawWinner) < 0) ? rawWinner : undefined;
    // AIの手番の間は、人間の操作(マス・スキル・ロック切替)を受け付けない。AIは onCellClick/executeSkillForAI を直接呼ぶので影響しない
    const aiTurn = currentAI !== null && !winner;
    stallRef.current = { turn: currentTurn, over: !!winner || currentAI === null, queued: pendingAIMove !== null, spinning: hailMarySpin !== null, charge: onClickCharge };
    // 勝ちを決めた列(複数同時に揃ったら全部)。盤面で光らせる
    const winCells = winner
        ? lineWinner
            ? Array.from(new Set(geo.winLines.filter((line) => line.every((idx) => lineSymbols(currentBoard)[idx] === winner)).flat()))
            : encircle?.cells ?? []
        : [];
    const currentNecroCost = necroCost[turnSeat];
    const currentNecroRemain = remainNecro[turnSeat];

    // 勝者が確定したら勝利数を1回だけ加算する
    useEffect(() => {
        if (winner) {
            setWinsAt(seatOf(winner), (w) => w + 1);
            playSfx('win');
        }
    }, [winner]);

    // サイレンス中に置けるマスが無い（絶対零度の氷結で全マスが塞がれた等）と進行不能になるので、自動でパスする
    const canPlaceAt = (i: number): boolean => {
        const sq = currentBoard[i];
        if (isShielded(sq, characters)) return false;
        if (sq.player && sq.player !== currentTurnPlayer && (sq.bind > 0 || isTakeProtected(sq, characters)) && !canHitBound(currentCharacter, currentBoard, seatCount)) return false;
        if (lockBlocksPlacement(sq, currentCharacter)) return false;
        if (emptyBlocked(sq)) return false;
        if (sq.player === currentTurnPlayer && overwriteBlocked(sq)) return false;
        return true;
    };
    const mustPass = !winner && !rawWinner && silenced[turnSeat] && !currentBoard.some((_, i) => canPlaceAt(i));
    useEffect(() => {
        if (!mustPass || hailMarySpin) return;
        const timer = setTimeout(() => {
            addLog('サイレンス中で置ける場所がないため自動でパス');
            setCurrentTurn(currentTurn + 1);
        }, 600);
        return () => clearTimeout(timer);
    }, [mustPass, currentTurn, hailMarySpin]);

    return { calculateCost, judgeNextSeat, winner, checkSkillDisable, currentNecroCost, currentNecroRemain, aiTurn, winCells };
};
