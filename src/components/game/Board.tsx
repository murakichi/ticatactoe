import React from 'react';
import { SquareInfo } from '../../types/SquareInfo';
import { Square } from './Square';
import styles from './Board.module.css';

type BoardProps = {
    squares: SquareInfo[];
    onPlay: (i: number) => void;
    destroyCells?: number[];
    previewCells?: number[];
    /** 電気使いの⚡付き自陣マス（誰も触れない無敵マス） */
    shieldedCells?: number[];
    onCellHover?: (i: number) => void;
    onCellLeave?: () => void;
};

export const Board: React.FC<BoardProps> = (props: BoardProps) => {
    const highlightFor = (i: number): 'preview' | 'destroy' | undefined => {
        if (props.destroyCells?.includes(i)) return 'destroy';
        if (props.previewCells?.includes(i)) return 'preview';
        return undefined;
    };

    return (
        <div className={styles.board}>
            {props.squares.map((info, i) => (
                <Square
                    key={i}
                    info={info}
                    onSquareClick={() => props.onPlay(i)}
                    highlight={highlightFor(i)}
                    shielded={props.shieldedCells?.includes(i)}
                    onHover={props.onCellHover ? () => props.onCellHover!(i) : undefined}
                    onHoverEnd={props.onCellLeave}
                />
            ))}
        </div>
    );
};
