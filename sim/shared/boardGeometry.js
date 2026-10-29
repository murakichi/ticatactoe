// 自動生成: src/components/game/boardGeometry.ts (node scripts/gen-sim-shared.js)。手で編集しない。
"use strict";
// 盤面ジオメトリ（size x size, index = row*size + col）。
// Game.tsx / AIPlayer.ts で共有（sim/ 側は別ランタイムのため engine.js/ai.js に同値を複製。sim は4x4・2人のみ）。
// 勝利条件は盤面サイズによらず「縦・横・斜めに4つ連続」。
Object.defineProperty(exports, "__esModule", { value: true });
exports.lineCells = exports.orthoNeighbors = exports.boardSqCss = exports.cellCenterUnits = exports.boardLayoutOf = exports.cellPixelsFor = exports.geometryForCells = exports.geometryOf = exports.boardSizeFor = exports.clampBoardSize = exports.MAX_BOARD_SIZE = exports.MIN_BOARD_SIZE = exports.WIN_LENGTH = void 0;
exports.WIN_LENGTH = 4;
/** 選べる盤面サイズ(一辺のマス数)の範囲。勝利が4連続なので4未満は勝負にならない */
exports.MIN_BOARD_SIZE = 4;
exports.MAX_BOARD_SIZE = 10;
/** 盤面サイズを選べる範囲に収める（整数でなければ四捨五入） */
const clampBoardSize = (size) => Math.min(exports.MAX_BOARD_SIZE, Math.max(exports.MIN_BOARD_SIZE, Math.round(size)));
exports.clampBoardSize = clampBoardSize;
/** 人数ごとの既定(おまかせ)の盤面サイズ。2人=4x4(従来)、3〜4人=5x5、5〜6人=6x6、7〜8人=7x7 */
const boardSizeFor = (playerCount) => {
    if (playerCount <= 2)
        return 4;
    if (playerCount <= 4)
        return 5;
    if (playerCount <= 6)
        return 6;
    return 7;
};
exports.boardSizeFor = boardSizeFor;
const build = (size) => {
    const at = (r, c) => r * size + c;
    const inside = (r, c) => r >= 0 && r < size && c >= 0 && c < size;
    // 並び順は旧4x4テーブルと同じ（行→列→左上右下の斜め→右上左下の斜め。同じ向きの中は左上から）。
    // AIはラインを順に走査して最初に見つけた脅威を優先するため、順序を変えると2人戦の手が変わる
    const winLines = [];
    const lineAt = (r, c, dr, dc) => {
        const line = [];
        for (let k = 0; k < exports.WIN_LENGTH; k++) {
            const rr = r + dr * k;
            const cc = c + dc * k;
            if (!inside(rr, cc))
                return null;
            line.push(at(rr, cc));
        }
        return line;
    };
    const push = (line) => {
        if (line)
            winLines.push(line);
    };
    for (let r = 0; r < size; r++)
        for (let c = 0; c < size; c++)
            push(lineAt(r, c, 0, 1)); // 行
    for (let c = 0; c < size; c++)
        for (let r = 0; r < size; r++)
            push(lineAt(r, c, 1, 0)); // 列
    for (let r = 0; r < size; r++)
        for (let c = 0; c < size; c++)
            push(lineAt(r, c, 1, 1)); // 左上→右下
    for (let r = 0; r < size; r++)
        for (let c = 0; c < size; c++)
            push(lineAt(r, c, 1, -1)); // 右上→左下
    const cells = size * size;
    const stomp = [];
    const judge = [];
    for (let i = 0; i < cells; i++) {
        const r = Math.floor(i / size);
        const c = i % size;
        const near = [];
        for (let rr = r - 1; rr <= r + 1; rr++) {
            for (let cc = c - 1; cc <= c + 1; cc++) {
                if (inside(rr, cc))
                    near.push(at(rr, cc));
            }
        }
        stomp.push(near);
        const set = new Set();
        for (let k = 0; k < size; k++) {
            set.add(at(r, k));
            set.add(at(k, c));
            const d1r = r + (k - c); // 左上→右下の対角
            if (inside(d1r, k))
                set.add(at(d1r, k));
            const d2r = r - (k - c); // 右上→左下の対角
            if (inside(d2r, k))
                set.add(at(d2r, k));
        }
        judge.push(Array.from(set).sort((a, b) => a - b));
    }
    return {
        size,
        cells,
        winLines,
        antiDiagonal: Array.from({ length: size }, (_, k) => at(k, size - 1 - k)),
        mainDiagonal: Array.from({ length: size }, (_, k) => at(k, k)),
        stompRange: (i) => { var _a; return (_a = stomp[i]) !== null && _a !== void 0 ? _a : []; },
        judgeRange: (i) => { var _a; return (_a = judge[i]) !== null && _a !== void 0 ? _a : []; },
        surroundRange: (i) => { var _a; return ((_a = stomp[i]) !== null && _a !== void 0 ? _a : []).filter((x) => x !== i); },
        posName: (i) => `${Math.floor(i / size) + 1}行${(i % size) + 1}列`,
    };
};
const cache = new Map();
/** サイズごとにメモ化したジオメトリを返す */
const geometryOf = (size) => {
    let g = cache.get(size);
    if (!g) {
        g = build(size);
        cache.set(size, g);
    }
    return g;
};
exports.geometryOf = geometryOf;
/** マス数(size*size)からジオメトリを返す */
const geometryForCells = (cells) => (0, exports.geometryOf)(Math.round(Math.sqrt(cells)));
exports.geometryForCells = geometryForCells;
/** 盤が大きいほどマスを小さくして、7x7でも画面に収める（px） */
const cellPixelsFor = (size) => size <= 4 ? 64 : size === 5 ? 60 : size === 6 ? 56 : size === 7 ? 52 : size === 8 ? 48 : size === 9 ? 44 : 40;
exports.cellPixelsFor = cellPixelsFor;
/**
 * 盤面の寸法は、マス1つの大きさ(--sq)を1とした比率で持つ。実際のマスの大きさが画面幅や高さで縮んでも、
 * 隙間・余白・演出の位置が同じ比率で縮むので、演出がずれない。大きい盤(8x8〜)は隙間と余白を詰めて、マスを少しでも大きくする。
 */
const boardLayoutOf = (size) => {
    const gap = size >= 8 ? 0.0625 : 0.125;
    const pad = size >= 8 ? 0.125 : 0.1875;
    return { gap, pad, units: size + (size - 1) * gap + 2 * pad };
};
exports.boardLayoutOf = boardLayoutOf;
/** マス index の中心(盤面の左上から、マス1つ分=1とした距離) */
const cellCenterUnits = (index, size) => {
    const { gap, pad } = (0, exports.boardLayoutOf)(size);
    return { x: pad + (index % size) * (1 + gap) + 0.5, y: pad + Math.floor(index / size) * (1 + gap) + 0.5 };
};
exports.cellCenterUnits = cellCenterUnits;
/** マス1つの大きさ(CSS)。上限は cellPixelsFor、画面の幅と(モバイルは)盤面に使える高さに収める */
const boardSqCss = (size) => `min(${(0, exports.cellPixelsFor)(size)}px, calc((100vw - 20px) / ${(0, exports.boardLayoutOf)(size).units}), calc(var(--board-h, 9999px) / ${(0, exports.boardLayoutOf)(size).units}))`;
exports.boardSqCss = boardSqCss;
/** 縦横に隣接するマス（size x size, index = row*size + col） */
const orthoNeighbors = (i, size) => {
    const r = Math.floor(i / size);
    const c = i % size;
    const out = [];
    if (r > 0)
        out.push(i - size);
    if (r < size - 1)
        out.push(i + size);
    if (c > 0)
        out.push(i - 1);
    if (c < size - 1)
        out.push(i + 1);
    return out;
};
exports.orthoNeighbors = orthoNeighbors;
/**
 * cell を通る、盤の端から端までの線上のマス（昇順）。氷柱用。
 * row=同じ行 / col=同じ列 / diag=左上→右下(row-col 一定) / anti=右上→左下(row+col 一定)
 */
const lineCells = (size, cell, dir) => {
    const r = Math.floor(cell / size);
    const c = cell % size;
    const out = [];
    for (let rr = 0; rr < size; rr++) {
        for (let cc = 0; cc < size; cc++) {
            if (dir === 'row' ? rr === r : dir === 'col' ? cc === c : dir === 'diag' ? rr - cc === r - c : rr + cc === r + c)
                out.push(rr * size + cc);
        }
    }
    return out;
};
exports.lineCells = lineCells;
