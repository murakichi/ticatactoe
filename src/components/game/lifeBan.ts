// 一寸の虫に魂なし: ライフ3以下の敵コマの破壊と、「ライフ3以下のコマを置けない」縛りの純粋ロジック。
// sim/lifeBan.js と同じ仕様（lifeBan.test.ts が一致を確認する）。
import { CharacterId } from '../../types/Character';
import { Player } from '../../types/Player';
import { SquareInfo } from '../../types/SquareInfo';
import { isGuarded } from './charge';
import { absorbDestroy } from './thermal';

/** このライフ以下のコマが破壊され、縛られた席はこのライフ以下のコマを置けない */
export const LIFE_BAN_MAX = 3;

/** コマを新しく置くスキル（コストキー）。縛られた席は、置くコマのライフが LIFE_BAN_MAX 以下なら使えない。
 *  ネクロマンサーの蘇生（ライフ2のコマを召喚）も対象。全軍突撃・写し身など、ほかの手段で置かれるコマは対象外 */
export const LIFE_BAN_PLACING_KEYS: ReadonlySet<string> = new Set([
    'onClickToken', 'onClickDoubleToken', 'onClickBothToken', 'onClickBudsToken', 'onClickPoisonToken',
    'onClickChargeToken', 'onClickDoubleChargeToken', 'onClickFlameToken', 'onClickDoubleFlameToken',
    'onClickFrostToken', 'onClickDoubleFrostToken', 'onClickFirstFrost', 'onClickGather', 'onClickBurnOff',
    'onClickLeafToken', 'onClickTwinLeafToken', 'onClickDoubleLeafToken', 'onClickBothLeafToken',
    'onClickShikigamiPlace', 'onClickShikigamiRandom', 'onClickShikigamiFlood',
    'onClickNecromancy',
]);

/** そのスキルが置くコマのライフ。式神は固定（設置・ランダム=2、百鬼夜行=0）、蘇生は召喚するコマのライフ2、それ以外はトークンのライフ */
export const placedLifeOf = (key: string, tokenBind: number): number => {
    if (key === 'onClickShikigamiFlood') return 0;
    if (key === 'onClickShikigamiPlace' || key === 'onClickShikigamiRandom' || key === 'onClickNecromancy') return 2;
    return tokenBind;
};

/** banned の席が、このスキルを使えないか */
export const placeBlocked = (banned: boolean, key: string | undefined, tokenBind: number): boolean =>
    banned && !!key && LIFE_BAN_PLACING_KEYS.has(key) && placedLifeOf(key, tokenBind) <= LIFE_BAN_MAX;

/** banned の席が、今のライフで通常の着手をできないか */
export const moveBlocked = (banned: boolean, life: number): boolean => banned && life <= LIFE_BAN_MAX;

/** player から見た、破壊できる敵コマ: ライフ LIFE_BAN_MAX 以下で、🔑ロック・無敵に守られていない */
export const smallFryTargets = (board: SquareInfo[], player: Player, chars: readonly CharacterId[]): number[] =>
    board.map((sq, i) => (sq.player && sq.player !== player && sq.bind <= LIFE_BAN_MAX && !isGuarded(sq, chars) ? i : -1)).filter((i) => i !== -1);

/**
 * ライフ3以下の敵コマを全て破壊する（board を直接書き換える）。氷結中のコマは壊れず❄が1つ減るだけ（absorbDestroy）。
 * 壊したマスと、氷結が身代わりになったマスを返す
 */
export const smallFry = (board: SquareInfo[], player: Player, chars: readonly CharacterId[]): { destroyed: number[]; blocked: number[] } => {
    const destroyed: number[] = [];
    const blocked: number[] = [];
    for (const k of smallFryTargets(board, player, chars)) {
        const guard = absorbDestroy(board[k]);
        if (guard.blocked) {
            board[k] = guard.sq;
            blocked.push(k);
            continue;
        }
        board[k] = { player: undefined, bind: 0, effects: [] };
        destroyed.push(k);
    }
    return { destroyed, blocked };
};
