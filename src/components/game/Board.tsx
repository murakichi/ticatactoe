import React from 'react';
import { SquareInfo } from '../../types/SquareInfo';
import { Square } from './Square';
import { cellPixelsFor } from './boardGeometry';
import styles from './Board.module.css';

type BoardProps = {
    size: number;
    squares: SquareInfo[];
    onPlay: (i: number) => void;
    destroyCells?: number[];
    previewCells?: number[];
    /** 雷霆の巫の⚡付き自陣マス（誰も触れない無敵マス） */
    shieldedCells?: number[];
    /** 勝負が付いたときの、勝ちを決めた列のマス。光らせて、それ以外は沈める */
    winCells?: number[];
    /** 手番の席の色(空きマスにカーソルを重ねたときの縁の色) */
    turnColor?: string;
    onCellHover?: (i: number) => void;
    onCellLeave?: () => void;
};

export const Board: React.FC<BoardProps> = (props: BoardProps) => {
    const highlightFor = (i: number): 'preview' | 'destroy' | undefined => {
        if (props.destroyCells?.includes(i)) return 'destroy';
        if (props.previewCells?.includes(i)) return 'preview';
        return undefined;
    };

    // 3人以上のときは色に加えてコマの記号も表示して見分けやすくする
    const showMark = props.squares.some((sq) => sq.player !== undefined) && props.size > 4;

    return (
        <div
            className={styles.board}
            style={{ ['--turn' as string]: props.turnColor, gridTemplateColumns: `repeat(${props.size}, 1fr)`, ['--sq' as string]: `min(${cellPixelsFor(props.size)}px, calc((100vw - 56px - ${(props.size - 1) * 8}px) / ${props.size}), calc((var(--board-h, 9999px) - ${24 + (props.size - 1) * 8}px) / ${props.size}))` }}
        >
            {props.squares.map((info, i) => (
                <Square
                    key={i}
                    info={info}
                    showMark={showMark}
                    onSquareClick={() => props.onPlay(i)}
                    highlight={highlightFor(i)}
                    shielded={props.shieldedCells?.includes(i)}
                    win={props.winCells?.includes(i)}
                    dimmed={(props.winCells?.length ?? 0) > 0 && !props.winCells?.includes(i)}
                    onHover={props.onCellHover ? () => props.onCellHover!(i) : undefined}
                    onHoverEnd={props.onCellLeave}
                />
            ))}
        </div>
    );
};
