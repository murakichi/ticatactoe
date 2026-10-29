// 初霜・吹き寄せ・山焼き・無礼講の純粋ロジック。sim/engine.js の同名スキルと同じ仕様（tokenSkills.test.ts と sim/engine.test.js が同じ盤面で同じ結果になることを確認する）。
import { Effect } from '../../types/Effect';
import { Player } from '../../types/Player';
import { SquareInfo } from '../../types/SquareInfo';
import { PlayerCharacters, isGuarded, isShielded } from './charge';
import { canFreeze, flameStacks, freeze, ignite, leafStacks } from './thermal';

/** 初霜: 盤面の🍂（効力のあるもの）がこの枚数以上ならコスト0 */
export const FIRST_FROST_FREE_LEAVES = 3;

const hasEffect = (sq: SquareInfo, effect: Effect['effect']): boolean => sq.effects.some((e) => e.effect === effect);

/** 初霜の対象: 使用者以外のコマのうち、🍂があり、🔑ロック・⚡無敵でなく、氷結を付けられるもの（昇順） */
export const firstFrostTargets = (board: SquareInfo[], player: Player, chars: PlayerCharacters): number[] =>
    board.map((sq, i) => (sq.player && sq.player !== player && leafStacks(sq) > 0 && !isGuarded(sq, chars) && canFreeze(sq) ? i : -1)).filter((i) => i !== -1);

/** 初霜: 対象を全て凍結する（バッズトークンの設置は呼び出し側）。凍結したマスを返す。board を直接書き換える */
export const firstFrost = (board: SquareInfo[], player: Player, chars: PlayerCharacters): number[] =>
    freeze(board, firstFrostTargets(board, player, chars));

/** 山焼きの対象: 使用者以外のコマのうち、🔑・📜以外のエフェクトがあり、氷結中でも⚡無敵でもないもの（🔑ロックのマスの他のエフェクトは対象）（昇順） */
export const burnOffTargets = (board: SquareInfo[], player: Player, chars: PlayerCharacters): number[] =>
    board
        .map((sq, i) => (sq.player && sq.player !== player && sq.effects.some((e) => e.effect !== '📜' && e.effect !== '🔑') && !hasEffect(sq, '❄') && !isShielded(sq, chars) ? i : -1))
        .filter((i) => i !== -1);

/** 山焼き: 対象全てに🔥を1つ付ける（ロック付きトークンの設置は呼び出し側）。実際に🔥が増えたマス数・解けた氷結・破壊されたマスを返す。board を直接書き換える */
export const burnOff = (
    board: SquareInfo[],
    player: Player,
    chars: PlayerCharacters,
    size: number,
    keepBuds?: (sq: SquareInfo) => boolean
): { cells: number[]; flames: number; destroyed: number[]; thawed: number[] } => {
    const cells = burnOffTargets(board, player, chars);
    const owners = board.map((sq) => sq.player);
    const before = cells.reduce((n, k) => n + flameStacks(board[k]), 0);
    const { thawed } = ignite(board, cells, size, 1, keepBuds);
    const flames = cells.reduce((n, k) => n + flameStacks(board[k]), 0) - before;
    const destroyed = cells.filter((k) => owners[k] && !board[k].player);
    return { cells, flames, destroyed, thawed };
};

/** 吹き寄せ: 空きマス token にトークン（tokenSq: 持ち主とライフ）を置き、盤面のエフェクト（token のマスに元からあったものを含む）を全部そのマスに集める。
 *  氷結(❄)のあるマスと⚡無敵のマスは動かさない。🔑ロックと式神の印📜はその場に残る。🔥は集め終えてから token のマスで処理する。
 *  移したエフェクトの数（🔥を含む）を返す。board を直接書き換える */
export const gather = (
    board: SquareInfo[],
    token: number,
    tokenSq: { player: Player; bind: number },
    chars: PlayerCharacters,
    size: number,
    keepBuds?: (sq: SquareInfo) => boolean
): number => {
    const moved: Effect[] = [];
    let flames = 0;
    board.forEach((sq, k) => {
        if (isShielded(sq, chars) || hasEffect(sq, '❄')) return;
        const keep: Effect[] = [];
        for (const e of sq.effects) {
            if (e.effect === '📜' || e.effect === '🔑') keep.push(e);
            else if (e.effect === '🔥') flames++;
            else moved.push(e);
        }
        if (keep.length !== sq.effects.length) board[k] = { ...sq, effects: keep };
    });
    board[token] = { player: tokenSq.player, bind: tokenSq.bind, effects: moved };
    if (flames > 0) ignite(board, [token], size, flames, keepBuds);
    return moved.length + flames;
};
