import { SquareInfo } from '../../types/SquareInfo';
import { Player } from '../../types/Player';

/** AIPlayer のテストで共通に使う 4x4 の盤面ヘルパー */
export const emptyBoard = (): SquareInfo[] => Array.from({ length: 16 }, () => ({ player: undefined, bind: 0, effects: [] }));
export const put = (b: SquareInfo[], i: number, player: Player, bind = 5): void => {
    b[i] = { player, bind, effects: [] };
};
