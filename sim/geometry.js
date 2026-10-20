// @ts-check
'use strict';
/*
 * 盤面ジオメトリ（size x size, index = row*size + col）。
 * src/components/game/boardGeometry.ts と同じ生成式の複製（sim は依存ゼロの素のNodeのため import できない）。
 * 両者が一致することは src/components/game/boardGeometry.test.ts が 4〜7 の全サイズで検証している。
 * 勝利条件は盤面サイズによらず「縦・横・斜めに4つ連続」。
 */

const WIN_LENGTH = 4;

/** 人数ごとの盤面サイズ。2人=4x4、3〜4人=5x5、5〜6人=6x6、7〜8人=7x7 */
function boardSizeFor(playerCount) {
    if (playerCount <= 2) return 4;
    if (playerCount <= 4) return 5;
    if (playerCount <= 6) return 6;
    return 7;
}

function build(size) {
    const at = (r, c) => r * size + c;
    const inside = (r, c) => r >= 0 && r < size && c >= 0 && c < size;

    // 並び順は旧4x4テーブルと同じ（行→列→左上右下の斜め→右上左下の斜め）。boardGeometry.ts と同順にすること
    const winLines = [];
    const lineAt = (r, c, dr, dc) => {
        const line = [];
        for (let k = 0; k < WIN_LENGTH; k++) {
            const rr = r + dr * k, cc = c + dc * k;
            if (!inside(rr, cc)) return null;
            line.push(at(rr, cc));
        }
        return line;
    };
    const push = (line) => { if (line) winLines.push(line); };
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) push(lineAt(r, c, 0, 1));
    for (let c = 0; c < size; c++) for (let r = 0; r < size; r++) push(lineAt(r, c, 1, 0));
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) push(lineAt(r, c, 1, 1));
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) push(lineAt(r, c, 1, -1));

    const cells = size * size;
    const stomp = [];
    const judge = [];
    for (let i = 0; i < cells; i++) {
        const r = Math.floor(i / size), c = i % size;
        const near = [];
        for (let rr = r - 1; rr <= r + 1; rr++) for (let cc = c - 1; cc <= c + 1; cc++) if (inside(rr, cc)) near.push(at(rr, cc));
        stomp.push(near);

        const set = new Set();
        for (let k = 0; k < size; k++) {
            set.add(at(r, k));
            set.add(at(k, c));
            const d1r = r + (k - c);
            if (inside(d1r, k)) set.add(at(d1r, k));
            const d2r = r - (k - c);
            if (inside(d2r, k)) set.add(at(d2r, k));
        }
        judge.push(Array.from(set).sort((a, b) => a - b));
    }

    return {
        size,
        cells,
        winLines,
        antiDiagonal: Array.from({ length: size }, (_, k) => at(k, size - 1 - k)),
        mainDiagonal: Array.from({ length: size }, (_, k) => at(k, k)),
        stompRange: (i) => stomp[i] || [],
        judgeRange: (i) => judge[i] || [],
        surroundRange: (i) => (stomp[i] || []).filter((x) => x !== i),
    };
}

/** cell を通る線（盤の端から端まで）のマス（昇順）。dir: 'row'=同じ行 / 'col'=同じ列 / 'diag'=左上→右下(row-col一定) / 'anti'=右上→左下(row+col一定) */
function lineCells(size, cell, dir) {
    const r = Math.floor(cell / size), c = cell % size;
    const out = [];
    for (let rr = 0; rr < size; rr++) {
        for (let cc = 0; cc < size; cc++) {
            const hit = dir === 'row' ? rr === r : dir === 'col' ? cc === c : dir === 'diag' ? rr - cc === r - c : rr + cc === r + c;
            if (hit) out.push(rr * size + cc);
        }
    }
    return out;
}

const cache = new Map();
function geometryOf(size) {
    let g = cache.get(size);
    if (!g) { g = build(size); cache.set(size, g); }
    return g;
}
const geometryForCells = (cells) => geometryOf(Math.round(Math.sqrt(cells)));

module.exports = { WIN_LENGTH, boardSizeFor, geometryOf, geometryForCells, lineCells };
