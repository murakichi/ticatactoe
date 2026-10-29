// ☠毒スキル（ミアズマ・血清・猛毒化・パンデミック・毒霧）の純粋ロジック。Game.tsx・sim/engine.js・AIPlayer.ts が同じ関数を呼ぶ (#289)。
// board を直接書き換える関数は、変えたマスの添字を返す（呼び出し側が毒花・収穫・演出に使う）。
import { CharacterId } from '../../types/Character';
import { Effect } from '../../types/Effect';
import { Player, seatOf } from '../../types/Player';
import { SquareInfo } from '../../types/SquareInfo';
import { POISON_LIFE_MULT } from './skillCosts';
import { PlayerCharacters, isGuarded } from './charge';
import { geometryForCells } from './boardGeometry';
import { isDormant } from './thermal';

const POISON: Effect = { effect: '☠' };

/** ☠の個数（スタック数） */
export const poisonOf = (sq: SquareInfo): number => sq.effects.filter((e) => e.effect === '☠').length;

/** 効いている☠の個数。氷結中のマスの☠は休眠していて数えない */
export const activePoison = (sq: SquareInfo): number => (isDormant(sq) ? 0 : poisonOf(sq));

/** player のコマに乗っている、効いている☠の総数 */
export const poisonCountFor = (board: SquareInfo[], player: Player): number =>
    board.reduce((n, sq) => (sq.player === player ? n + activePoison(sq) : n), 0);

/** 盤面全体の、効いている☠のスタック数 */
export const boardPoisonCount = (board: SquareInfo[]): number => board.reduce((n, sq) => n + activePoison(sq), 0);

/** 毒使いのコマに毒が付いた瞬間、そのマスのライフが POISON_LIFE_MULT 倍（四捨五入）になる。毒を付与した直後のマスに掛ける */
export const poisonStrike = (sq: SquareInfo, chars: readonly (CharacterId | undefined)[]): SquareInfo => {
    if (!sq.player) return sq;
    return chars[seatOf(sq.player)] === 'poisoner' ? { ...sq, bind: Math.round(sq.bind * POISON_LIFE_MULT) } : sq;
};

/** cells の各マスに☠を n 個付ける（毒使いのコマはライフが増える）。board を直接書き換える */
export const addPoison = (board: SquareInfo[], cells: readonly number[], chars: readonly (CharacterId | undefined)[], n: number = 1): void => {
    for (const k of cells) board[k] = poisonStrike({ ...board[k], effects: [...board[k].effects, ...Array<Effect>(n).fill(POISON)] }, chars);
};

/** 自陣の☠を全て取り除く（血清・ミアズマ後）。取り除いたマスを返す。onlyActive なら氷結中のマスは残す */
export const clearOwnPoison = (board: SquareInfo[], player: Player, onlyActive: boolean = false): number[] => {
    const cleared: number[] = [];
    board.forEach((sq, k) => {
        if (sq.player !== player || poisonOf(sq) === 0 || (onlyActive && isDormant(sq))) return;
        board[k] = { ...sq, effects: sq.effects.filter((e) => e.effect !== '☠') };
        cleared.push(k);
    });
    return cleared;
};

/**
 * ミアズマが毒を付けるマス → 付ける毒の数。自陣の効いている☠のマスごとに、周囲1マスの敵マス(🔑ロック・⚡無敵は除く)へ1つずつ（重複あり）。
 * 氷結中の☠は数えない
 */
export const miasmaPlan = (board: SquareInfo[], player: Player, chars: PlayerCharacters): Map<number, number> => {
    const geo = geometryForCells(board.length);
    const plan = new Map<number, number>();
    board.forEach((sq, i) => {
        if (sq.player !== player || activePoison(sq) === 0) return;
        for (const j of geo.surroundRange(i)) {
            const target = board[j];
            if (target.player && target.player !== player && !isGuarded(target, chars)) plan.set(j, (plan.get(j) ?? 0) + 1);
        }
    });
    return plan;
};

/** ミアズマ: plan どおり敵マスに毒を付け、自陣の（氷結中でない）毒を全て消す。毒を付けたマスと、毒を消したマス（演出の起点）を返す。board を直接書き換える */
export const miasma = (board: SquareInfo[], player: Player, chars: PlayerCharacters): { targets: number[]; sources: number[] } => {
    const plan = miasmaPlan(board, player, chars);
    const sources = board.map((_, k) => k).filter((k) => board[k].player === player && activePoison(board[k]) > 0);
    plan.forEach((n, j) => addPoison(board, [j], chars, n));
    clearOwnPoison(board, player, true);
    return { targets: Array.from(plan.keys()), sources };
};

/** 猛毒化: 毒が乗っている全マスの毒を倍にする（氷結中も）。倍にしたマスと、増えた毒の数を返す。board を直接書き換える */
export const intensify = (board: SquareInfo[], chars: readonly (CharacterId | undefined)[]): { affected: number[]; added: number } => {
    const affected: number[] = [];
    let added = 0;
    board.forEach((sq, idx) => {
        const p = poisonOf(sq);
        if (p === 0) return;
        addPoison(board, [idx], chars, p);
        affected.push(idx);
        added += p;
    });
    return { affected, added };
};

/** パンデミック: 選んだマスと周囲1マス(3x3)のコマのうち、🔑ロック・⚡無敵でないもの（敵味方問わず） */
export const pandemicTargets = (board: SquareInfo[], center: number, chars: PlayerCharacters): number[] =>
    geometryForCells(board.length).stompRange(center).filter((j) => board[j].player && !isGuarded(board[j], chars));

/** 毒霧: 盤上の全コマ（敵味方問わず。🔑ロック・⚡無敵は除く） */
export const poisonMistTargets = (board: SquareInfo[], chars: PlayerCharacters): number[] =>
    board.map((_, k) => k).filter((k) => board[k].player && !isGuarded(board[k], chars));
