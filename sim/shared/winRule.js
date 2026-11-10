// 自動生成: src/components/game/winRule.ts (node scripts/gen-sim-shared.js)。手で編集しない。
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultBoardSizeFor = exports.minBoardSizeFor = exports.meetsWinRule = exports.winLengthOf = exports.setWinLengths = exports.WIN_LENGTH_BY_CHARACTER = void 0;
const Player_1 = require("./Player");
const boardGeometry_1 = require("./boardGeometry");
exports.WIN_LENGTH_BY_CHARACTER = { dragonMiko: 5 };
let lengths = {};
/** この対局の長さ表を登録する（席順＝chars の順）。全員4なら表を空にして従来どおりに動く */
const setWinLengths = (chars) => {
    const next = {};
    chars.forEach((c, seat) => {
        const n = exports.WIN_LENGTH_BY_CHARACTER[c];
        if (n && n > boardGeometry_1.WIN_LENGTH)
            next[Player_1.PLAYER_SYMBOLS[seat]] = n;
    });
    lengths = next;
};
exports.setWinLengths = setWinLengths;
const winLengthOf = (player) => { var _a; return (_a = lengths[player]) !== null && _a !== void 0 ? _a : boardGeometry_1.WIN_LENGTH; };
exports.winLengthOf = winLengthOf;
/** 4マス窓 a と b が、同じ向きに1マスずれて隣り合っているか（共有が3マス） */
const adjacentWindows = (a, b) => {
    let shared = 0;
    for (const x of a)
        if (b.includes(x))
            shared++;
    return shared === boardGeometry_1.WIN_LENGTH - 1;
};
/** player が勝ちの並びを満たしているか。ownLines は player が全マスを持つ4マス窓 */
const meetsWinRule = (player, ownLines) => {
    if ((0, exports.winLengthOf)(player) <= boardGeometry_1.WIN_LENGTH)
        return ownLines.length >= 1;
    for (let a = 0; a < ownLines.length; a++)
        for (let b = a + 1; b < ownLines.length; b++)
            if (adjacentWindows(ownLines[a], ownLines[b]))
                return true;
    return false;
};
exports.meetsWinRule = meetsWinRule;
/** 勝ちの並びが作れる最小の盤面の一辺（5連が要るキャラがいれば5） */
const minBoardSizeFor = (chars) => Math.max(boardGeometry_1.WIN_LENGTH, ...chars.map((c) => { var _a; return (_a = exports.WIN_LENGTH_BY_CHARACTER[c]) !== null && _a !== void 0 ? _a : boardGeometry_1.WIN_LENGTH; }));
exports.minBoardSizeFor = minBoardSizeFor;
/** 「おまかせ」の盤面の一辺: 人数の既定と、勝ちの並びに必要な最小サイズの大きいほう（巫女がいれば5x5以上） */
const defaultBoardSizeFor = (chars) => (0, boardGeometry_1.clampBoardSize)(Math.max((0, boardGeometry_1.boardSizeFor)(chars.length), (0, exports.minBoardSizeFor)(chars)));
exports.defaultBoardSizeFor = defaultBoardSizeFor;
