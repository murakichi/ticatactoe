// 自動生成: src/components/game/poison.ts (node scripts/gen-sim-shared.js)。手で編集しない。
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.poisonMistTargets = exports.pandemicTargets = exports.intensify = exports.miasma = exports.miasmaPlan = exports.clearOwnPoison = exports.addPoison = exports.poisonStrike = exports.boardPoisonCount = exports.poisonCountFor = exports.activePoison = exports.poisonOf = void 0;
const Player_1 = require("./Player");
const skillCosts_1 = require("./skillCosts");
const charge_1 = require("./charge");
const boardGeometry_1 = require("./boardGeometry");
const thermal_1 = require("./thermal");
const POISON = { effect: '☠' };
/** ☠の個数（スタック数） */
const poisonOf = (sq) => sq.effects.filter((e) => e.effect === '☠').length;
exports.poisonOf = poisonOf;
/** 効いている☠の個数。氷結中のマスの☠は休眠していて数えない */
const activePoison = (sq) => ((0, thermal_1.isDormant)(sq) ? 0 : (0, exports.poisonOf)(sq));
exports.activePoison = activePoison;
/** player のコマに乗っている、効いている☠の総数 */
const poisonCountFor = (board, player) => board.reduce((n, sq) => (sq.player === player ? n + (0, exports.activePoison)(sq) : n), 0);
exports.poisonCountFor = poisonCountFor;
/** 盤面全体の、効いている☠のスタック数 */
const boardPoisonCount = (board) => board.reduce((n, sq) => n + (0, exports.activePoison)(sq), 0);
exports.boardPoisonCount = boardPoisonCount;
/** 毒使いのコマに毒が付いた瞬間、そのマスのライフが POISON_LIFE_MULT 倍（四捨五入）になる。毒を付与した直後のマスに掛ける */
const poisonStrike = (sq, chars) => {
    if (!sq.player)
        return sq;
    return chars[(0, Player_1.seatOf)(sq.player)] === 'poisoner' ? { ...sq, bind: Math.round(sq.bind * skillCosts_1.POISON_LIFE_MULT) } : sq;
};
exports.poisonStrike = poisonStrike;
/** cells の各マスに☠を n 個付ける（毒使いのコマはライフが増える）。board を直接書き換える */
const addPoison = (board, cells, chars, n = 1) => {
    for (const k of cells)
        board[k] = (0, exports.poisonStrike)({ ...board[k], effects: [...board[k].effects, ...Array(n).fill(POISON)] }, chars);
};
exports.addPoison = addPoison;
/** 自陣の☠を全て取り除く（血清・ミアズマ後）。取り除いたマスを返す。onlyActive なら氷結中のマスは残す */
const clearOwnPoison = (board, player, onlyActive = false) => {
    const cleared = [];
    board.forEach((sq, k) => {
        if (sq.player !== player || (0, exports.poisonOf)(sq) === 0 || (onlyActive && (0, thermal_1.isDormant)(sq)))
            return;
        board[k] = { ...sq, effects: sq.effects.filter((e) => e.effect !== '☠') };
        cleared.push(k);
    });
    return cleared;
};
exports.clearOwnPoison = clearOwnPoison;
/**
 * ミアズマが毒を付けるマス → 付ける毒の数。自陣の効いている☠のマスごとに、周囲1マスの敵マス(🔑ロック・⚡無敵は除く)へ1つずつ（重複あり）。
 * 氷結中の☠は数えない
 */
const miasmaPlan = (board, player, chars) => {
    const geo = (0, boardGeometry_1.geometryForCells)(board.length);
    const plan = new Map();
    board.forEach((sq, i) => {
        var _a;
        if (sq.player !== player || (0, exports.activePoison)(sq) === 0)
            return;
        for (const j of geo.surroundRange(i)) {
            const target = board[j];
            if (target.player && target.player !== player && !(0, charge_1.isGuarded)(target, chars))
                plan.set(j, ((_a = plan.get(j)) !== null && _a !== void 0 ? _a : 0) + 1);
        }
    });
    return plan;
};
exports.miasmaPlan = miasmaPlan;
/** ミアズマ: plan どおり敵マスに毒を付け、自陣の（氷結中でない）毒を全て消す。毒を付けたマスと、毒を消したマス（演出の起点）を返す。board を直接書き換える */
const miasma = (board, player, chars) => {
    const plan = (0, exports.miasmaPlan)(board, player, chars);
    const sources = board.map((_, k) => k).filter((k) => board[k].player === player && (0, exports.activePoison)(board[k]) > 0);
    plan.forEach((n, j) => (0, exports.addPoison)(board, [j], chars, n));
    (0, exports.clearOwnPoison)(board, player, true);
    return { targets: Array.from(plan.keys()), sources };
};
exports.miasma = miasma;
/** 猛毒化: 毒が乗っている全マスの毒を倍にする（氷結中も）。倍にしたマスと、増えた毒の数を返す。board を直接書き換える */
const intensify = (board, chars) => {
    const affected = [];
    let added = 0;
    board.forEach((sq, idx) => {
        const p = (0, exports.poisonOf)(sq);
        if (p === 0)
            return;
        (0, exports.addPoison)(board, [idx], chars, p);
        affected.push(idx);
        added += p;
    });
    return { affected, added };
};
exports.intensify = intensify;
/** パンデミック: 選んだマスと周囲1マス(3x3)のコマのうち、🔑ロック・⚡無敵でないもの（敵味方問わず） */
const pandemicTargets = (board, center, chars) => (0, boardGeometry_1.geometryForCells)(board.length).stompRange(center).filter((j) => board[j].player && !(0, charge_1.isGuarded)(board[j], chars));
exports.pandemicTargets = pandemicTargets;
/** 毒霧: 盤上の全コマ（敵味方問わず。🔑ロック・⚡無敵は除く） */
const poisonMistTargets = (board, chars) => board.map((_, k) => k).filter((k) => board[k].player && !(0, charge_1.isGuarded)(board[k], chars));
exports.poisonMistTargets = poisonMistTargets;
