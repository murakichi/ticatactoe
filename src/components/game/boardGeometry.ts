// 盤面ジオメトリ（size x size, index = row*size + col）。
// Game.tsx / AIPlayer.ts で共有（sim/ 側は別ランタイムのため engine.js/ai.js に同値を複製。sim は4x4・2人のみ）。
// 勝利条件は盤面サイズによらず「縦・横・斜めに4つ連続」。

export const WIN_LENGTH = 4;

/** 選べる盤面サイズ(一辺のマス数)の範囲。勝利が4連続なので4未満は勝負にならない */
export const MIN_BOARD_SIZE = 4;
export const MAX_BOARD_SIZE = 10;

/** 盤面サイズを選べる範囲に収める（整数でなければ四捨五入） */
export const clampBoardSize = (size: number): number =>
    Math.min(MAX_BOARD_SIZE, Math.max(MIN_BOARD_SIZE, Math.round(size)));

/** 人数ごとの既定(おまかせ)の盤面サイズ。2人=4x4(従来)、3〜4人=5x5、5〜6人=6x6、7〜8人=7x7 */
export const boardSizeFor = (playerCount: number): number => {
    if (playerCount <= 2) return 4;
    if (playerCount <= 4) return 5;
    if (playerCount <= 6) return 6;
    return 7;
};

export type BoardGeometry = {
    size: number;
    cells: number;
    /** 4目並びの全ライン（行・列・対角。長い辺では連続4マスの窓すべて） */
    winLines: number[][];
    /** スラッシュ(右上→左下)の対角線 */
    antiDiagonal: number[];
    /** バックスラッシュ(左上→右下)の対角線 */
    mainDiagonal: number[];
    /** クリックしたマスの周囲1マス(自身を含む3x3) */
    stompRange: (i: number) => number[];
    /** 審判の日の対象範囲（クリックしたマスの行・列・両対角） */
    judgeRange: (i: number) => number[];
    /** 周囲1マス（クリックしたマスを除く8近傍） */
    surroundRange: (i: number) => number[];
    /** 「3行2列」のような表示名 */
    posName: (i: number) => string;
};

const build = (size: number): BoardGeometry => {
    const at = (r: number, c: number) => r * size + c;
    const inside = (r: number, c: number) => r >= 0 && r < size && c >= 0 && c < size;

    // 並び順は旧4x4テーブルと同じ（行→列→左上右下の斜め→右上左下の斜め。同じ向きの中は左上から）。
    // AIはラインを順に走査して最初に見つけた脅威を優先するため、順序を変えると2人戦の手が変わる
    const winLines: number[][] = [];
    const lineAt = (r: number, c: number, dr: number, dc: number): number[] | null => {
        const line: number[] = [];
        for (let k = 0; k < WIN_LENGTH; k++) {
            const rr = r + dr * k;
            const cc = c + dc * k;
            if (!inside(rr, cc)) return null;
            line.push(at(rr, cc));
        }
        return line;
    };
    const push = (line: number[] | null) => {
        if (line) winLines.push(line);
    };
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) push(lineAt(r, c, 0, 1)); // 行
    for (let c = 0; c < size; c++) for (let r = 0; r < size; r++) push(lineAt(r, c, 1, 0)); // 列
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) push(lineAt(r, c, 1, 1)); // 左上→右下
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) push(lineAt(r, c, 1, -1)); // 右上→左下

    const cells = size * size;
    const stomp: number[][] = [];
    const judge: number[][] = [];
    for (let i = 0; i < cells; i++) {
        const r = Math.floor(i / size);
        const c = i % size;
        const near: number[] = [];
        for (let rr = r - 1; rr <= r + 1; rr++) {
            for (let cc = c - 1; cc <= c + 1; cc++) {
                if (inside(rr, cc)) near.push(at(rr, cc));
            }
        }
        stomp.push(near);

        const set = new Set<number>();
        for (let k = 0; k < size; k++) {
            set.add(at(r, k));
            set.add(at(k, c));
            const d1r = r + (k - c); // 左上→右下の対角
            if (inside(d1r, k)) set.add(at(d1r, k));
            const d2r = r - (k - c); // 右上→左下の対角
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
        stompRange: (i) => stomp[i] ?? [],
        judgeRange: (i) => judge[i] ?? [],
        surroundRange: (i) => (stomp[i] ?? []).filter((x) => x !== i),
        posName: (i) => `${Math.floor(i / size) + 1}行${(i % size) + 1}列`,
    };
};

const cache = new Map<number, BoardGeometry>();

/** サイズごとにメモ化したジオメトリを返す */
export const geometryOf = (size: number): BoardGeometry => {
    let g = cache.get(size);
    if (!g) {
        g = build(size);
        cache.set(size, g);
    }
    return g;
};

/** マス数(size*size)からジオメトリを返す */
export const geometryForCells = (cells: number): BoardGeometry => geometryOf(Math.round(Math.sqrt(cells)));

/** 盤が大きいほどマスを小さくして、7x7でも画面に収める（px） */
export const cellPixelsFor = (size: number): number =>
    size <= 4 ? 64 : size === 5 ? 60 : size === 6 ? 56 : size === 7 ? 52 : size === 8 ? 48 : size === 9 ? 44 : 40;

/**
 * 盤面の寸法は、マス1つの大きさ(--sq)を1とした比率で持つ。実際のマスの大きさが画面幅や高さで縮んでも、
 * 隙間・余白・演出の位置が同じ比率で縮むので、演出がずれない。大きい盤(8x8〜)は隙間と余白を詰めて、マスを少しでも大きくする。
 */
export const boardLayoutOf = (size: number): { gap: number; pad: number; units: number } => {
    const gap = size >= 8 ? 0.0625 : 0.125;
    const pad = size >= 8 ? 0.125 : 0.1875;
    return { gap, pad, units: size + (size - 1) * gap + 2 * pad };
};

/** マス index の中心(盤面の左上から、マス1つ分=1とした距離) */
export const cellCenterUnits = (index: number, size: number): { x: number; y: number } => {
    const { gap, pad } = boardLayoutOf(size);
    return { x: pad + (index % size) * (1 + gap) + 0.5, y: pad + Math.floor(index / size) * (1 + gap) + 0.5 };
};

/** マス1つの大きさ(CSS)。上限は cellPixelsFor、画面の幅と(モバイルは)盤面に使える高さに収める */
export const boardSqCss = (size: number): string =>
    `min(${cellPixelsFor(size)}px, calc((100vw - 20px) / ${boardLayoutOf(size).units}), calc(var(--board-h, 9999px) / ${boardLayoutOf(size).units}))`;

/** 縦横に隣接するマス（size x size, index = row*size + col） */
export const orthoNeighbors = (i: number, size: number): number[] => {
    const r = Math.floor(i / size);
    const c = i % size;
    const out: number[] = [];
    if (r > 0) out.push(i - size);
    if (r < size - 1) out.push(i + size);
    if (c > 0) out.push(i - 1);
    if (c < size - 1) out.push(i + 1);
    return out;
};

export type LineDir = 'row' | 'col' | 'diag' | 'anti';

/**
 * cell を通る、盤の端から端までの線上のマス（昇順）。氷柱用。
 * row=同じ行 / col=同じ列 / diag=左上→右下(row-col 一定) / anti=右上→左下(row+col 一定)
 */
export const lineCells = (size: number, cell: number, dir: LineDir): number[] => {
    const r = Math.floor(cell / size);
    const c = cell % size;
    const out: number[] = [];
    for (let rr = 0; rr < size; rr++) {
        for (let cc = 0; cc < size; cc++) {
            if (dir === 'row' ? rr === r : dir === 'col' ? cc === c : dir === 'diag' ? rr - cc === r - c : rr + cc === r + c) out.push(rr * size + cc);
        }
    }
    return out;
};
