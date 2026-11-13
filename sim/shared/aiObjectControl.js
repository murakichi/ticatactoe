// 自動生成: src/components/game/aiObjectControl.ts (node scripts/gen-sim-shared.js)。手で編集しない。
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ignoreObjectsWanted = exports.hasBindingObject = exports.exposedPieces = exports.buildBanWanted = exports.arsonTarget = void 0;
// 新スキル（普請停止令・付け火・お構いなし）をAIが撃つ判断。盤面と席から決まる純粋関数だけ（AIPlayer の状態には触れない）。
const ObjectKind_1 = require("./ObjectKind");
const boardGeometry_1 = require("./boardGeometry");
const charge_1 = require("./charge");
const dragon_1 = require("./dragon");
const objects_1 = require("./objects");
const thermal_1 = require("./thermal");
/** 付け火で焼く優先度（高いほど先）。敵の手番開始の効果・縛り・勝ち筋になるものほど高い */
const ARSON_VALUE = {
    eightTrigrams: 10, bigTree: 9, poisonSwamp: 9, thundercloud: 9, workshop: 8, oneWord: 8, soloSign: 8, tongueKing: 7, mudField: 7, luckyCat: 7,
    fort: 5, market: 5, spring: 5, sanctuary: 5, blindMonkey: 4, deadTree: 3, amuletShrine: 4, barrierStone: 3, boulder: 2, shikigami: 2,
};
/** 付け火の狙い: 敵の働いているオブジェクトのうち、まだ燃えていない価値の高いもの（同点はライフが低い順）。無ければ null */
const arsonTarget = (board, me, chars) => {
    var _a;
    let best = null;
    for (const i of (0, objects_1.objectSkillTargets)('arson', board, me, chars)) {
        const sq = board[i];
        if (!sq.player || sq.player === me || (0, thermal_1.isDormant)(sq) || (0, thermal_1.flameStacks)(sq) > 0)
            continue;
        const score = ((_a = ARSON_VALUE[sq.object]) !== null && _a !== void 0 ? _a : 4) * 10 - sq.bind;
        if (!best || score > best.score)
            best = { i, score };
    }
    return best ? best.i : null;
};
exports.arsonTarget = arsonTarget;
/** 敵の建造物（式神を除く）の数 */
const enemyBuildings = (board, enemy) => board.filter((sq) => (0, ObjectKind_1.isBuilding)(sq) && sq.player === enemy && !(0, thermal_1.isDormant)(sq)).length;
/**
 * 普請停止令を撃つか: 龍神の巫女の相手が、覚醒の一歩手前（建造物が AWAKEN_BUILDINGS-1 個以上）のとき。
 * 次の手番に建造物（祈りを含む）を置けなくして、覚醒を1手番遅らせる
 */
const buildBanWanted = (board, enemies, characterOf) => enemies.some((e) => characterOf(e) === 'dragonMiko' && enemyBuildings(board, e) >= dragon_1.AWAKEN_BUILDINGS - 1);
exports.buildBanWanted = buildBanWanted;
/** 手番開始に自分のコマを狙う敵のオブジェクト（毒沼・雷雲・枯れた大木）の周囲にいる、自分のコマの数 */
const exposedPieces = (board, me, chars) => {
    const geo = (0, boardGeometry_1.geometryForCells)(board.length);
    const hit = new Set();
    board.forEach((sq, k) => {
        if (!sq.player || sq.player === me || (0, thermal_1.isDormant)(sq))
            return;
        if (sq.object !== 'poisonSwamp' && sq.object !== 'thundercloud' && sq.object !== 'deadTree')
            return;
        for (const j of geo.surroundRange(k))
            if (board[j].player === me && !(0, charge_1.isGuarded)(board[j], chars))
                hit.add(j);
    });
    return hit.size;
};
exports.exposedPieces = exposedPieces;
/** 敵が働いている、自分のトークン・コマ置きを縛るオブジェクト（泥田坊・お一人様限りの札・閻魔の舌） */
const hasBindingObject = (board, me) => board.some((sq) => !!sq.player && sq.player !== me && !(0, thermal_1.isDormant)(sq) && (sq.object === 'mudField' || sq.object === 'soloSign' || sq.object === 'tongueKing'));
exports.hasBindingObject = hasBindingObject;
/** お構いなしを撃つか: 自分のコマが敵の毒沼・雷雲・枯れた大木に2つ以上狙われているか、縛るオブジェクトが働いていて魔力に余裕があるとき */
const ignoreObjectsWanted = (board, me, chars, spare) => (0, exports.exposedPieces)(board, me, chars) >= 2 || ((0, exports.hasBindingObject)(board, me) && spare >= 4);
exports.ignoreObjectsWanted = ignoreObjectsWanted;
