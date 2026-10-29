// 自動生成: src/util.ts (node scripts/gen-sim-shared.js)。手で編集しない。
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findEmptyIndexes = exports.range = exports.normRand = exports.randomAnyPick = exports.randomPick = exports.calculateWinner = exports.lifeMeanOf = exports.calculateLife = exports.lineSymbols = exports.isShikigami = exports.LIFE_STD = exports.LIFE_MEANS = void 0;
const boardGeometry_1 = require("./boardGeometry");
/**
 * ライフ値の平均。毎ターン σ=LIFE_STD の正規分布で抽選される。
 * ここが唯一の出典で、キャラ選択画面の説明文もこの値を参照する（説明文と実装のズレ防止 / issue #13）。
 */
exports.LIFE_MEANS = {
    magician: 4,
    tactician: 5,
    giant: 10,
    yinYangMaster_yang: 7,
    yinYangMaster_ying: 4,
    electrician: 6,
    cryomancer: 4,
    pyromancer: 6,
    witch: 4,
    default: 5,
};
exports.LIFE_STD = 3;
/** キャラ(と陰陽モード)に対応するライフ平均を返す */
const lifeMeanOf = (characterId, yingYangMode) => {
    var _a;
    if (characterId === 'yinYangMaster') {
        return yingYangMode === 'yang' ? exports.LIFE_MEANS.yinYangMaster_yang : exports.LIFE_MEANS.yinYangMaster_ying;
    }
    return (_a = exports.LIFE_MEANS[characterId]) !== null && _a !== void 0 ? _a : exports.LIFE_MEANS.default;
};
exports.lifeMeanOf = lifeMeanOf;
/** std はギア(賭博師の骰子)でばらつきを変えるときに渡す。省略時は LIFE_STD */
const calculateLife = (nextCharacterId, yingYangMode, lifeBonus = 0, std = exports.LIFE_STD, rng = Math.random) => {
    return Math.floor(normRand(lifeMeanOf(nextCharacterId, yingYangMode) + lifeBonus, std, rng));
};
exports.calculateLife = calculateLife;
/** 式神(📜)は列の並びに数えない */
const isShikigami = (sq) => sq.effects.some((e) => e.effect === '📜');
exports.isShikigami = isShikigami;
/** 列判定用のシンボル配列（式神はコマ無し扱い） */
const lineSymbols = (board) => board.map((x) => (isShikigami(x) ? undefined : x.player));
exports.lineSymbols = lineSymbols;
const calculateWinner = (squares) => {
    for (const line of (0, boardGeometry_1.geometryForCells)(squares.length).winLines) {
        const first = squares[line[0]];
        if (first && line.every((idx) => squares[idx] === first)) {
            return first;
        }
    }
    return undefined;
};
exports.calculateWinner = calculateWinner;
const randomPick = (ary) => ary[Math.floor(Math.random() * ary.length)];
exports.randomPick = randomPick;
const randomAnyPick = (ary, n) => {
    const result = [];
    for (let i = 0; i < n; i++) {
        const index = Math.floor(Math.random() * ary.length);
        result.push(ary[index]);
        ary.splice(index, 1);
    }
    return result;
};
exports.randomAnyPick = randomAnyPick;
/**
 * 正規分布乱数関数 参考:http://d.hatena.ne.jp/iroiro123/20111210/1323515616
 * @param number m 平均μ
 * @param number s 分散σ^2
 * @param rng [0,1) の乱数。sim が種付きの乱数を渡す。省略時は Math.random
 * @return number ランダムに生成された値
 */
const normRand = (m, s, rng = Math.random) => {
    const c = Math.sqrt(-2 * Math.log(rng()));
    if (0.5 - rng() > 0) {
        return c * Math.sin(Math.PI * 2 * rng()) * s + m;
    }
    else {
        return c * Math.cos(Math.PI * 2 * rng()) * s + m;
    }
};
exports.normRand = normRand;
const range = (start, count) => Array.from({ length: count }, (_, i) => start + i);
exports.range = range;
const findEmptyIndexes = (ary) => ary.map((x, i) => ((x === null || x === void 0 ? void 0 : x.player) === undefined && (x === null || x === void 0 ? void 0 : x.effects.filter((effect) => effect.effect === '🔑' || effect.effect === '❄').length) === 0 ? i : -1)).filter((x) => x !== -1);
exports.findEmptyIndexes = findEmptyIndexes;
