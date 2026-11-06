import { Player } from '../../types/Player';

/** あとで定義される（スキルのハンドラが実行されるときには揃っている）Game の値。フックには late() で渡す */
export interface GameLate {
    calculateCost: (cost: number, isToken?: boolean, isPoison?: boolean, player?: Player, skillKey?: string) => number;
    addCorpses: (n: number) => void;
    setUseChargeSpread: (on: boolean) => void;
    shuffleSkillDefs: { idx: number; onClick: () => void; buttonText: string; paragraph: string; disabled: boolean; onHoverStart?: (() => void) | undefined; onHoverEnd?: (() => void) | undefined; }[];
    notShielded: (cells: number[]) => number[];
}
