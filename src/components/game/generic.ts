// 汎用スキル（底上げ・縮地・写し身・追い剥ぎ）の純粋ロジック。sim/generic.js と同じ仕様（generic.test.ts が一致を確認する）。
import { CharacterId } from '../../types/Character';
import { seatOf } from '../../types/Player';
import { SquareInfo } from '../../types/SquareInfo';
import { orthoNeighbors } from './boardGeometry';
import { isFrozen, emptyBlocked } from './thermal';

const hasLock = (sq: SquareInfo): boolean => sq.effects.some((e) => e.effect === '🔑');

/** 追い剥ぎで奪ったコマのライフ */
export const PLUNDER_LIFE = 1;

/** 底上げ: player の全コマのライフを +amount する（ライフ0のコマも）。底上げしたマスを返す。board を直接書き換える */
export const boostAll = (board: SquareInfo[], player: SquareInfo['player'], amount: number = 1): number[] => {
    const done: number[] = [];
    board.forEach((sq, i) => {
        if (sq.player !== player) return;
        board[i] = { ...sq, bind: sq.bind + amount };
        done.push(i);
    });
    return done;
};

/** 着手（設置）できる空きマスか: コマが無く、🔑ロック中でなく、氷結中でない */
export const isPlaceable = (sq: SquareInfo): boolean => !sq.player && !hasLock(sq) && !emptyBlocked(sq);

/** 縮地で動かせる自陣のコマか: 🔑ロック中でも氷結中でもない */
export const canRelocate = (sq: SquareInfo, me: SquareInfo['player']): boolean => !!sq.player && sq.player === me && !hasLock(sq) && !isFrozen(sq);

/** 縮地: from の自陣のコマ（ライフ・エフェクトごと）を空きマス to へ動かす。動かせたら true。board を直接書き換える */
export const relocate = (board: SquareInfo[], from: number, to: number, me: SquareInfo['player']): boolean => {
    if (from === to || !canRelocate(board[from], me) || !isPlaceable(board[to])) return false;
    board[to] = board[from];
    board[from] = { player: undefined, bind: 0, effects: [] };
    return true;
};

/** 写し身で増えたコマのライフ: 元のライフの半分（切り捨て、最低1） */
export const cloneLife = (bind: number): number => Math.max(1, Math.floor(bind / 2));

/** 写し身の置き先: from の縦横隣の置ける空きマス（昇順） */
export const cloneTargets = (board: SquareInfo[], from: number, size: number): number[] =>
    orthoNeighbors(from, size)
        .filter((k) => isPlaceable(board[k]))
        .sort((a, b) => a - b);

/** 写し身: from の自陣のコマの写し（ライフは半分、エフェクトなし）を空きマス to に置く。board を直接書き換える */
export const cloneInto = (board: SquareInfo[], from: number, to: number, me: SquareInfo['player']): void => {
    board[to] = { player: me, bind: cloneLife(board[from].bind), effects: [] };
};

/** 追い剥ぎの対象: 使用者以外のライフ0のコマで、🔑ロック中でなく、雷霆の巫の⚡無敵でないもの（昇順） */
export const plunderTargets = (board: SquareInfo[], me: SquareInfo['player'], chars: readonly CharacterId[]): number[] =>
    board
        .map((sq, i) => {
            if (!sq.player || sq.player === me || sq.bind !== 0 || hasLock(sq)) return -1;
            if (chars[seatOf(sq.player)] === 'electrician' && sq.effects.some((e) => e.effect === '⚡') && !isFrozen(sq)) return -1;
            return i;
        })
        .filter((i) => i !== -1);

/** 追い剥ぎ: cell のライフ0の敵コマを自陣のコマ（ライフ1）にする（エフェクトは消える）。board を直接書き換える */
export const plunder = (board: SquareInfo[], cell: number, me: SquareInfo['player']): void => {
    board[cell] = { player: me, bind: PLUNDER_LIFE, effects: [] };
};
