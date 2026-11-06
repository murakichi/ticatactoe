import React from 'react';
import { Player } from '../../types/Player';

/** あとで定義される（スキルのハンドラが実行されるときには揃っている）Game の値。フックには late() で渡す */
export interface GameLate {
    calculateCost: (cost: number, isToken?: boolean, isPoison?: boolean, player?: Player, skillKey?: string) => number;
    addCorpses: (n: number) => void;
    setUseChargeSpread: (on: boolean) => void;
    shuffleSkillDefs: { idx: number; onClick: () => void; buttonText: string; paragraph: string; disabled: boolean; onHoverStart?: (() => void) | undefined; onHoverEnd?: (() => void) | undefined; }[];
    notShielded: (cells: number[]) => number[];
    judgeNextSeat: () => number;
    setUseLock: React.Dispatch<React.SetStateAction<number>>;
    setUseFreeze: (on: boolean) => void;
    setUseSucker: (on: boolean) => void;
    setUseIgnite: (on: boolean) => void;
    setUseSwidden: (on: boolean) => void;
    setUseSacrifice: (on: boolean) => void;
    setUseKimon: (on: boolean) => void;
    setUseStash: (on: boolean) => void;
    setUseBoltSilence: React.Dispatch<React.SetStateAction<number>>;
    setUseThunderFire: (on: boolean) => void;
    setUseFrostArea: (on: boolean) => void;
    setUseIcicle: (on: boolean) => void;
    setUseFreezeSpread: (on: boolean) => void;
    setUseShatter: (on: boolean) => void;
    setUseShikigamiPlace: (on: boolean) => void;
    setUseShikigamiBlast: (on: boolean) => void;
    setUseShikigamiBless: (on: boolean) => void;
    setUseShikigamiCurse: (on: boolean) => void;
    setUseShikigamiPurge: (on: boolean) => void;
    setObjectPlacing: React.Dispatch<React.SetStateAction<"bigTree" | "deadTree" | "spring" | "fort" | "thundercloud" | "market" | "sanctuary" | "poisonSwamp" | "workshop" | "barrierStone" | "amuletShrine" | "luckyCat" | "mudField" | "tongueKing" | "eightTrigrams" | "soloSign" | "oneWord" | "blindMonkey" | null>>;
    setObjectTool: React.Dispatch<React.SetStateAction<"reinforce" | "demolish" | "weather" | "levelAll" | "expandAll" | "duplicate" | null>>;
    setCaptureChoice: React.Dispatch<React.SetStateAction<number | null>>;
    activeBudsCount: (player: "💙" | "⭕" | "🟩" | "🔶" | "⭐" | "🟣" | "🟫" | "🩷") => number;
    poisonCount: (player: "💙" | "⭕" | "🟩" | "🔶" | "⭐" | "🟣" | "🟫" | "🩷") => number;
    remainNecro: number[];
    setRemainNecroAt: (seat: number, value: number | ((prev: number) => number)) => void;
}
