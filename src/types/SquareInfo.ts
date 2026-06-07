import { Effect } from './Effect';
import { Player } from './Player';

export type SquareInfo = {
    bind: number;
    player: Player | undefined;
    effects: Effect[];
};