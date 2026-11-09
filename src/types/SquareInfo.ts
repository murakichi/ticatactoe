import { Effect } from './Effect';
import { ObjectKind } from './ObjectKind';
import { Player } from './Player';

export type SquareInfo = {
    bind: number;
    player: Player | undefined;
    effects: Effect[];
    /** オブジェクトが設置されているマス（player = 持ち主、bind = オブジェクトのライフ）。列に数えず、減衰しない */
    object?: ObjectKind;
};
