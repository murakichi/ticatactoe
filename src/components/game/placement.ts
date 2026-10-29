// 通常の着手（コマを置く・強化する・相手のコマを攻撃する）の結果と、蘇生中の吸収。Game.tsx（onCellClick）と sim/engine.js（placeMove）が同じ関数を呼ぶ (#289)。
import { Player } from '../../types/Player';
import { SquareInfo } from '../../types/SquareInfo';
import { isShikigami } from '../../util';
import { NECROMANCY } from './turn';
import { activePoison } from './poison';

export type PlacementResult = {
    /** 着手後のマス */
    square: SquareInfo;
    /** 通常の攻撃で奪取した相手（復讐の刃の対象） */
    capturedFrom?: Player;
    /** 毒持ちの敵コマを奪取/破壊した（毒拡散の起点にする） */
    poisonSpread: boolean;
    /** 敵味方問わず、コマが奪われる/消えた（墓地+1） */
    corpse: boolean;
    /** 着手前のマスの持ち主が自分か（静電気の季節は補強を設置に数えない） */
    reinforced: boolean;
};

/**
 * cell（減衰を済ませた後のマス）に player が life で着手した結果。
 * - 自分のコマ: 強化（ライフ+life+1。式神は🌱付きの自陣コマになる）
 * - 敵のコマ: ライフの差で奪取/破壊/攻撃。式神は乗っ取られると空きマスになる
 * - 空きマス: ライフ life のコマ。置かれた🔥は引き継ぐ
 */
export const resolvePlacement = (cell: SquareInfo, player: Player, life: number): PlacementResult => {
    if (cell.player === player) {
        // 式神を自分で補強すると、式神ではなく🌱付きの自陣コマになる
        const effects = isShikigami(cell) ? [...cell.effects.filter((e) => e.effect !== '📜'), { effect: '🌱' as const }] : [...cell.effects];
        return { square: { player, bind: cell.bind + life + 1, effects }, poisonSpread: false, corpse: false, reinforced: true };
    }
    if (cell.player) {
        const calc = cell.bind - life + (cell.bind > 0 ? 1 : 0);
        let owner: Player | undefined = cell.player;
        let bind = calc;
        let capturedFrom: Player | undefined;
        if (calc < 0) {
            owner = player;
            bind = -calc;
            capturedFrom = cell.player;
        } else if (calc === 0) {
            owner = undefined;
            bind = 0;
        }
        // 式神は乗っ取られると空きマスになる（コマは置かれない）
        if (isShikigami(cell) && calc < 0) {
            owner = undefined;
            bind = 0;
            capturedFrom = undefined;
        }
        return { square: { player: owner, bind, effects: [] }, capturedFrom, poisonSpread: calc <= 0 && activePoison(cell) > 0, corpse: calc <= 0, reinforced: false };
    }
    return { square: { player, bind: life, effects: cell.effects.filter((e) => e.effect === '🔥') }, poisonSpread: false, corpse: false, reinforced: false };
};

/** 蘇生発動中: ライフ0の敵コマ（🔑ロック中を除く）を自陣に吸収する。吸収したマスと元の持ち主を返す。board を直接書き換える */
export const absorbDefeated = (board: SquareInfo[], player: Player): { cell: number; from: Player }[] => {
    const absorbed: { cell: number; from: Player }[] = [];
    board.forEach((sq, k) => {
        if (sq.player && sq.player !== player && sq.bind === 0 && !sq.effects.some((e) => e.effect === '🔑')) {
            absorbed.push({ cell: k, from: sq.player });
            board[k] = { player, bind: NECROMANCY.reviveLife, effects: [] };
        }
    });
    return absorbed;
};
