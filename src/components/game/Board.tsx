import React from 'react';
import { Square } from './Square';

type BoardProps = {
    squaresInfo: string[];
    onPlay: (i: number) => void;
    destroyCells?: number[];
    previewCells?: number[];
    onCellHover?: (i: number) => void;
    onCellLeave?: () => void;
};

export const Board: React.FC<BoardProps> = (props: BoardProps) => {
    const highlightFor = (i: number): 'preview' | 'destroy' | undefined => {
        if (props.destroyCells?.includes(i)) return 'destroy';
        if (props.previewCells?.includes(i)) return 'preview';
        return undefined;
    };

    const renderSquare = (i: number) => (
        <Square
            key={i}
            onSquareClick={() => props.onPlay(i)}
            highlight={highlightFor(i)}
            onHover={props.onCellHover ? () => props.onCellHover!(i) : undefined}
            onHoverEnd={props.onCellLeave}
        >
            {props.squaresInfo[i]}
        </Square>
    );

    const renderBoard = () => {
        const board: JSX.Element[] = [];
        for (let row = 0; row < 4; row++) {
            const squares: JSX.Element[] = [];
            for (let col = 0; col < 4; col++) {
                squares.push(renderSquare(row * 4 + col));
            }
            board.push(
                <div key={row} className='board-row'>
                    {squares}
                </div>
            );
        }
        return board;
    };

    return <>{renderBoard()}</>;
};
