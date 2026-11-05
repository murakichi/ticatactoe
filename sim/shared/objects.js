// 自動生成: src/components/game/objects.ts (node scripts/gen-sim-shared.js)。手で編集しない。
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.objectTurnStart = exports.sweepBurntTrees = exports.objectLifeBonus = exports.activeObjectCells = exports.objectLandableCells = exports.newObject = exports.objectLandable = exports.OBJECT_DEFS = exports.OBJECT_PARAMS = exports.OBJECT_SKILL_BASE_IDX = exports.isTree = exports.isObject = exports.OBJECT_KINDS = void 0;
// オブジェクト（空きマスに設置して使う建造物）の純粋ロジック。Game.tsx と sim/engine.js が同じ関数を呼ぶ (#289)。
//
// ルール
//  - 設置: 空きマス（氷結・🔑ロックで塞がれていないマス）に置く。持ち主 = 置いた席（SquareInfo.player）、ライフ = 種類ごとの OBJECT_DEFS[kind].life
//  - 列（勝利判定）には数えない（util.ts の lineSymbols）。ライフは時間経過で減らない（thermal.ts の decayTick / decay.ts の crowdedDecay）
//  - 乗っ取り: 自陣のオブジェクトは自分の通常のコマでいつでも乗っ取れる（placement.ts）。敵のオブジェクトはライフが0でないと乗っ取れない（ライフを削り切る攻撃でも0になるだけ）。
//    乗っ取るとオブジェクトは消えてコマになる（オブジェクトも効果も引き継がない）
//  - エフェクトやスキルの効果は通常のコマと同じように受ける。氷結中のオブジェクトは休眠して効果を発揮しない
//  - 大木・枯れた大木は🔥を付けられると即座に壊れる（thermal.ts の ignite。念のため手番開始時に sweepBurntTrees でも掃除する）
//  - 手番開始時、持ち主の席のオブジェクトが objectTurnStart で効果を発揮する
const ObjectKind_1 = require("./ObjectKind");
Object.defineProperty(exports, "OBJECT_KINDS", { enumerable: true, get: function () { return ObjectKind_1.OBJECT_KINDS; } });
Object.defineProperty(exports, "isObject", { enumerable: true, get: function () { return ObjectKind_1.isObject; } });
Object.defineProperty(exports, "isTree", { enumerable: true, get: function () { return ObjectKind_1.isTree; } });
const boardGeometry_1 = require("./boardGeometry");
const charge_1 = require("./charge");
const shikigami_1 = require("./shikigami");
const thermal_1 = require("./thermal");
/** オブジェクトのスキルの先頭 idx（deck.ts の SKILL_CATALOG）。OBJECT_KINDS の順に並ぶ */
exports.OBJECT_SKILL_BASE_IDX = 105;
/** 効果の数値。説明文もここから描画する（説明文と実装のズレ防止） */
exports.OBJECT_PARAMS = {
    /** 大木: 手番開始時のマジック */
    bigTreeMagic: 3,
    /** 生命の泉: その手番に置くコマのライフ期待値 */
    springLife: 2,
    /** 砦: 周囲八マスの自陣コマのライフ */
    fortLife: 1,
};
exports.OBJECT_DEFS = {
    bigTree: { name: '大木', icon: '🌳', life: 3, costKey: 'onClickBigTree', desc: `手番開始時、マジック+${exports.OBJECT_PARAMS.bigTreeMagic}。🔥を付けられると即座に壊れる` },
    deadTree: { name: '枯れた大木', icon: '🪵', life: 3, costKey: 'onClickDeadTree', desc: '手番開始時、周囲八マスのコマのうちランダムな1つに🍂を付ける。🔥を付けられると即座に壊れる' },
    spring: { name: '生命の泉', icon: '⛲', life: 4, costKey: 'onClickSpring', desc: `手番開始時のライフ期待値+${exports.OBJECT_PARAMS.springLife}` },
    fort: { name: '砦', icon: '🏰', life: 6, costKey: 'onClickFort', desc: `手番開始時、周囲八マスの自陣のコマのライフ+${exports.OBJECT_PARAMS.fortLife}` },
    thundercloud: { name: '雷雲', icon: '🌩️', life: 3, costKey: 'onClickThundercloud', desc: '手番開始時、周囲八マスのコマのうちランダムな1つに⚡を付ける' },
};
/** オブジェクトの設置先として選べるマスか（式神と同じ: 空きで、氷結中でも🔑ロック中でもない） */
const objectLandable = (sq) => (0, shikigami_1.shikigamiLandable)(sq) && !(0, ObjectKind_1.isObject)(sq);
exports.objectLandable = objectLandable;
/** 種類 kind のオブジェクト。player のものとして、種類ごとのライフで置く */
const newObject = (player, kind) => ({ player, bind: exports.OBJECT_DEFS[kind].life, effects: [], object: kind });
exports.newObject = newObject;
/** 設置先に選べるマス全て（昇順） */
const objectLandableCells = (board) => board.map((sq, i) => ((0, exports.objectLandable)(sq) ? i : -1)).filter((i) => i !== -1);
exports.objectLandableCells = objectLandableCells;
/** 手番開始時に効果を発揮する、player のオブジェクトのマス（氷結中の休眠したものを除く。昇順） */
const activeObjectCells = (board, player, kind) => board.map((sq, i) => (sq.player === player && sq.object && (kind === undefined || sq.object === kind) && !(0, thermal_1.isDormant)(sq) ? i : -1)).filter((i) => i !== -1);
exports.activeObjectCells = activeObjectCells;
/** player の働いている生命の泉1つにつき、その手番のライフ期待値に足す値の合計 */
const objectLifeBonus = (board, player) => (0, exports.activeObjectCells)(board, player, 'spring').length * exports.OBJECT_PARAMS.springLife;
exports.objectLifeBonus = objectLifeBonus;
/** 🔥が付いて壊れるはずの大木・枯れた大木を空きマスにして、壊れたマスを返す（ignite が先に壊すので、残っているのは🔥が直接付いたケースだけ）。board を直接書き換える */
const sweepBurntTrees = (board) => {
    const burnt = [];
    board.forEach((sq, k) => {
        if ((0, ObjectKind_1.isTree)(sq) && sq.effects.some((e) => e.effect === '🔥') && !sq.effects.some((e) => e.effect === '❄')) {
            board[k] = { player: undefined, bind: 0, effects: [] };
            burnt.push(k);
        }
    });
    return burnt;
};
exports.sweepBurntTrees = sweepBurntTrees;
/** 枯れた大木・雷雲の標的にできるコマ: 周囲八マスのコマのうち、🔑ロック・⚡無敵でないもの */
const randomTargets = (board, k, chars) => (0, boardGeometry_1.geometryForCells)(board.length)
    .surroundRange(k)
    .filter((j) => !!board[j].player && !(0, charge_1.isGuarded)(board[j], chars));
/**
 * player の手番開始時に、player の働いているオブジェクトが効果を発揮する（生命の泉は objectLifeBonus で別に足す）。
 * 席順に昇順のマスから順に処理する。board を直接書き換える（マスは新しく作って差し替える）。
 * @param rng [0,1) を返す乱数。sim が種付きの乱数を渡す
 */
const objectTurnStart = (board, player, chars, rng = Math.random) => {
    const res = { magic: 0, leaves: [], charged: [], fortified: [] };
    const geo = (0, boardGeometry_1.geometryForCells)(board.length);
    for (const k of (0, exports.activeObjectCells)(board, player)) {
        switch (board[k].object) {
            case 'bigTree':
                res.magic += exports.OBJECT_PARAMS.bigTreeMagic;
                break;
            case 'deadTree': {
                const cands = randomTargets(board, k, chars);
                if (cands.length === 0)
                    break;
                const j = cands[Math.floor(rng() * cands.length)];
                board[j] = { ...board[j], effects: [...board[j].effects, { effect: '🍂' }] };
                res.leaves.push(j);
                break;
            }
            case 'thundercloud': {
                const cands = randomTargets(board, k, chars);
                if (cands.length === 0)
                    break;
                const j = cands[Math.floor(rng() * cands.length)];
                board[j] = (0, charge_1.addCharge)(board[j], chars);
                res.charged.push(j);
                break;
            }
            case 'fort':
                for (const j of geo.surroundRange(k)) {
                    if (board[j].player !== player)
                        continue;
                    board[j] = { ...board[j], bind: board[j].bind + exports.OBJECT_PARAMS.fortLife };
                    res.fortified.push(j);
                }
                break;
            default:
                break;
        }
    }
    return res;
};
exports.objectTurnStart = objectTurnStart;
