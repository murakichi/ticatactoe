// 盤面ジオメトリ（size x size, index = row*size + col）。
// Game.tsx / AIPlayer.ts で共有（sim/ 側は別ランタイムのため engine.js/ai.js に同値を複製。sim は4x4・2人のみ）。
// 勝利条件は盤面サイズによらず「縦・横・斜めに4つ連続」。

export const WIN_LENGTH = 4;

/** 人数ごとの盤面サイズ。2人=4x4(従来)、3〜4人=5x5、5〜6人=6x6、7〜8人=7x7 */
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
export const cellPixelsFor = (size: number): number => (size <= 4 ? 64 : size === 5 ? 60 : size === 6 ? 56 : 52);
