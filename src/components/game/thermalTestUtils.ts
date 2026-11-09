import { SquareInfo } from '../../types/SquareInfo';
import { Effect } from '../../types/Effect';
import { Player } from '../../types/Player';
import { CharacterId } from '../../types/Character';

/** thermal 系テストで共通に使う盤面ヘルパー */
export const emptyBoard = (size = 4): SquareInfo[] => Array.from({ length: size * size }, () => ({ player: undefined, bind: 0, effects: [] }));
export const sq = (player: Player | undefined, bind: number, ...effects: Effect['effect'][]): SquareInfo => ({
    player,
    bind,
    effects: effects.map((effect) => ({ effect })),
});
export const chars: CharacterId[] = ['you', 'you'];
