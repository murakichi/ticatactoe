// 自動生成: src/components/game/dragon.ts (node scripts/gen-sim-shared.js)。手で編集しない。
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyBulwark = exports.pickPrayerKind = exports.prayerUsable = exports.prayerKinds = exports.roarUsable = exports.roar = exports.roarVictims = exports.dragonMagicBonus = exports.dragonLifeBonus = exports.applyAwaken = exports.awakenPlan = exports.enclosedCells = exports.ownBuildingCells = exports.isDragonMiko = exports.newDragonState = exports.DRAGON_N_CAP = exports.DRAGON_LIFE_PLUS = exports.DRAGON_LIFE_BASE = exports.MIKO_LIFE_MEAN = exports.AWAKEN_BUILDINGS = void 0;
const ObjectKind_1 = require("./ObjectKind");
const boardGeometry_1 = require("./boardGeometry");
const charge_1 = require("./charge");
const thermal_1 = require("./thermal");
const objects_1 = require("./objects");
/** 覚醒に必要な自陣の建造物の数 */
exports.AWAKEN_BUILDINGS = 4;
/** 巫女のライフ平均（通常5から-2）。util.ts の LIFE_MEANS.dragonMiko と同値 */
exports.MIKO_LIFE_MEAN = 3;
/** 龍のライフ平均 = 通常のベース + N + この値 */
exports.DRAGON_LIFE_BASE = 5;
exports.DRAGON_LIFE_PLUS = 4;
/** 覚醒の N の上限（暫定: 上限なし。測定してから決める。#527 の数値の懸念） */
exports.DRAGON_N_CAP = Infinity;
const newDragonState = () => ({ form: 'miko', n: 0 });
exports.newDragonState = newDragonState;
const isDragonMiko = (c) => c === 'dragonMiko';
exports.isDragonMiko = isDragonMiko;
const empty = () => ({ player: undefined, bind: 0, effects: [] });
/** 自陣の建造物のマス（昇順） */
const ownBuildingCells = (board, player) => board.map((sq, i) => ((0, ObjectKind_1.isBuilding)(sq) && sq.player === player ? i : -1)).filter((i) => i !== -1);
exports.ownBuildingCells = ownBuildingCells;
/**
 * 自陣の建造物が囲んだマス（建造物自身は含まない）。
 * 壁 = 自陣の建造物（盤の端も壁）。壁以外のマスを縦横の連結で分け、最も大きい連結成分を『外』、それ以外をすべて『囲まれた範囲』とする。
 * 盤の端が壁なので、4つの建造物で盤の角を斜めに切ると、角側の三角形（最大6マス）が囲まれる。
 * 最大の成分が同数なら、最も小さい番号のマスを含む成分を『外』にする（結果を決まりにするため）。
 */
const enclosedCells = (board, player) => {
    const size = Math.round(Math.sqrt(board.length));
    const wall = (i) => (0, ObjectKind_1.isBuilding)(board[i]) && board[i].player === player;
    const comp = new Array(board.length).fill(-1);
    const groups = [];
    for (let start = 0; start < board.length; start++) {
        if (wall(start) || comp[start] !== -1)
            continue;
        const id = groups.length;
        const cells = [];
        const stack = [start];
        comp[start] = id;
        while (stack.length) {
            const i = stack.pop();
            cells.push(i);
            const r = Math.floor(i / size);
            const c = i % size;
            const next = [r > 0 ? i - size : -1, r < size - 1 ? i + size : -1, c > 0 ? i - 1 : -1, c < size - 1 ? i + 1 : -1];
            for (const j of next) {
                if (j >= 0 && !wall(j) && comp[j] === -1) {
                    comp[j] = id;
                    stack.push(j);
                }
            }
        }
        groups.push(cells);
    }
    if (groups.length <= 1)
        return [];
    // 外 = 最大の成分（同数なら先に見つかった＝最小番号のマスを含む成分）
    let outside = 0;
    groups.forEach((g, k) => {
        if (g.length > groups[outside].length)
            outside = k;
    });
    const out = [];
    groups.forEach((g, k) => {
        if (k !== outside)
            out.push(...g);
    });
    return out.sort((a, b) => a - b);
};
exports.enclosedCells = enclosedCells;
/** 覚醒できるか（自陣の建造物が4つ以上）。できるなら消すマスの計画を返す */
const awakenPlan = (board, player) => {
    const buildings = (0, exports.ownBuildingCells)(board, player);
    if (buildings.length < exports.AWAKEN_BUILDINGS)
        return null;
    const enclosed = (0, exports.enclosedCells)(board, player);
    return { enclosed, buildings, n: Math.min(exports.DRAGON_N_CAP, enclosed.length + buildings.length) };
};
exports.awakenPlan = awakenPlan;
/** 覚醒の消滅を適用する（board を直接書き換える。『消滅』なのでロック・氷結・エフェクトを無視して空きマスにする）。消したマスの数 N を返す */
const applyAwaken = (board, plan) => {
    for (const i of plan.enclosed)
        board[i] = empty();
    for (const i of plan.buildings)
        board[i] = empty();
    return plan.n;
};
exports.applyAwaken = applyAwaken;
/** 龍のライフ平均の加算分（巫女のライフ平均 MIKO_LIFE_MEAN に対して、龍は DRAGON_LIFE_BASE+N+DRAGON_LIFE_PLUS） */
const dragonLifeBonus = (state) => state.form === 'dragon' ? exports.DRAGON_LIFE_BASE + state.n + exports.DRAGON_LIFE_PLUS - exports.MIKO_LIFE_MEAN : 0;
exports.dragonLifeBonus = dragonLifeBonus;
/** 龍の手番開始時の魔力加算 */
const dragonMagicBonus = (state) => (state.form === 'dragon' ? state.n : 0);
exports.dragonMagicBonus = dragonMagicBonus;
/** 咆哮の対象: 自陣のオブジェクト全ての周囲8マスにある敵のコマ（オブジェクトを含む）。昇順 */
const roarVictims = (board, player) => {
    const geo = (0, boardGeometry_1.geometryForCells)(board.length);
    const set = new Set();
    for (let i = 0; i < board.length; i++) {
        if (!board[i].object || board[i].player !== player)
            continue;
        for (const j of geo.surroundRange(i))
            if (board[j].player && board[j].player !== player)
                set.add(j);
    }
    return Array.from(set).sort((a, b) => a - b);
};
exports.roarVictims = roarVictims;
/**
 * 龍の咆哮。自陣のオブジェクト全ての周囲8マスの敵コマを破壊し（氷結は身代わり）、そのあと自陣のオブジェクト全てに⚡を設置する。
 * ⚡の着地ダメージは通常どおり入る（オブジェクトも例外にしない）。board を直接書き換える。
 */
const roar = (board, player, chars) => {
    const range = (0, exports.roarVictims)(board, player);
    let destroyed = 0;
    const blocked = [];
    for (const i of range) {
        const guard = (0, thermal_1.absorbDestroy)(board[i]);
        if (guard.blocked) {
            board[i] = guard.sq;
            blocked.push(i);
            continue;
        }
        destroyed++;
        board[i] = empty();
    }
    const charged = [];
    for (let i = 0; i < board.length; i++) {
        if (!board[i].object || board[i].player !== player || (0, charge_1.chargeStacks)(board[i]) > 0)
            continue;
        board[i] = (0, charge_1.addCharge)(board[i], chars);
        charged.push(i);
    }
    return { destroyed, blocked, charged, range };
};
exports.roar = roar;
/** 咆哮を撃てるか（自陣のオブジェクトがある） */
const roarUsable = (board, player) => board.some((sq) => sq.object !== undefined && sq.player === player);
exports.roarUsable = roarUsable;
/** 八百万の祈りが引ける建造物の種類: デッキの中のオブジェクト設置スキル（deck が無ければ全種類） */
const prayerKinds = (deck) => objects_1.OBJECT_KINDS.filter((k) => !deck || deck.includes(objects_1.OBJECT_DEFS[k].idx));
exports.prayerKinds = prayerKinds;
/** 祈りを使えるか（引ける種類があり、置ける空きマスがある） */
const prayerUsable = (board, deck) => (0, exports.prayerKinds)(deck).length > 0 && (0, objects_1.objectLandableCells)(board).length > 0;
exports.prayerUsable = prayerUsable;
/** 祈りで引く種類を抽選する。rng は [0,1) */
const pickPrayerKind = (deck, rng) => {
    const kinds = (0, exports.prayerKinds)(deck);
    return kinds.length ? kinds[Math.floor(rng() * kinds.length)] : undefined;
};
exports.pickPrayerKind = pickPrayerKind;
/**
 * 龍の防壁。相手 winner が列を揃えたとき、揃った列のマスと龍の持ち主 holder の自陣のコマをすべて消滅させる
 * （土壇場の防壁と同じ処理。ロック・氷結を貫通）。board を直接書き換える。ほかの席への永続ボーナスは付けない。
 */
const applyBulwark = (board, winner, holder) => {
    for (const line of (0, boardGeometry_1.geometryForCells)(board.length).winLines) {
        if (line.every((idx) => !board[idx].object && board[idx].player === winner))
            for (const idx of line)
                board[idx] = empty();
    }
    for (let idx = 0; idx < board.length; idx++)
        if (board[idx].player === holder)
            board[idx] = empty();
};
exports.applyBulwark = applyBulwark;
