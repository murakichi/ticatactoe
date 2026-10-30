// 自動生成: src/components/game/lifeBan.ts (node scripts/gen-sim-shared.js)。手で編集しない。
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.smallFry = exports.smallFryTargets = exports.moveBlocked = exports.placeBlocked = exports.placedLifeOf = exports.LIFE_BAN_PLACING_KEYS = exports.LIFE_BAN_MAX = void 0;
const charge_1 = require("./charge");
const thermal_1 = require("./thermal");
/** このライフ以下のコマが破壊され、縛られた席はこのライフ以下のコマを置けない */
exports.LIFE_BAN_MAX = 3;
/** コマを新しく置くスキル（コストキー）。縛られた席は、置くコマのライフが LIFE_BAN_MAX 以下なら使えない。
 *  ネクロマンサーの蘇生（ライフ2のコマを召喚）も対象。全軍突撃・写し身など、ほかの手段で置かれるコマは対象外 */
exports.LIFE_BAN_PLACING_KEYS = new Set([
    'onClickToken', 'onClickDoubleToken', 'onClickBothToken', 'onClickBudsToken', 'onClickPoisonToken',
    'onClickChargeToken', 'onClickDoubleChargeToken', 'onClickFlameToken', 'onClickDoubleFlameToken',
    'onClickFrostToken', 'onClickDoubleFrostToken', 'onClickFirstFrost', 'onClickGather', 'onClickBurnOff',
    'onClickLeafToken', 'onClickTwinLeafToken', 'onClickDoubleLeafToken', 'onClickBothLeafToken',
    'onClickShikigamiPlace', 'onClickShikigamiRandom', 'onClickShikigamiFlood',
    'onClickNecromancy',
]);
/** そのスキルが置くコマのライフ。式神は固定（設置・ランダム=2、百鬼夜行=0）、蘇生は召喚するコマのライフ2、それ以外はトークンのライフ */
const placedLifeOf = (key, tokenBind) => {
    if (key === 'onClickShikigamiFlood')
        return 0;
    if (key === 'onClickShikigamiPlace' || key === 'onClickShikigamiRandom' || key === 'onClickNecromancy')
        return 2;
    return tokenBind;
};
exports.placedLifeOf = placedLifeOf;
/** banned の席が、このスキルを使えないか */
const placeBlocked = (banned, key, tokenBind) => banned && !!key && exports.LIFE_BAN_PLACING_KEYS.has(key) && (0, exports.placedLifeOf)(key, tokenBind) <= exports.LIFE_BAN_MAX;
exports.placeBlocked = placeBlocked;
/** banned の席が、今のライフで通常の着手をできないか */
const moveBlocked = (banned, life) => banned && life <= exports.LIFE_BAN_MAX;
exports.moveBlocked = moveBlocked;
/** player から見た、破壊できる敵コマ: ライフ LIFE_BAN_MAX 以下で、🔑ロック・無敵に守られていない */
const smallFryTargets = (board, player, chars) => board.map((sq, i) => (sq.player && sq.player !== player && sq.bind <= exports.LIFE_BAN_MAX && !(0, charge_1.isGuarded)(sq, chars) ? i : -1)).filter((i) => i !== -1);
exports.smallFryTargets = smallFryTargets;
/**
 * ライフ3以下の敵コマを全て破壊する（board を直接書き換える）。氷結中のコマは壊れず❄が1つ減るだけ（absorbDestroy）。
 * 壊したマスと、氷結が身代わりになったマスを返す
 */
const smallFry = (board, player, chars) => {
    const destroyed = [];
    const blocked = [];
    for (const k of (0, exports.smallFryTargets)(board, player, chars)) {
        const guard = (0, thermal_1.absorbDestroy)(board[k]);
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
exports.smallFry = smallFry;
