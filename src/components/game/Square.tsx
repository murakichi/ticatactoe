import React from 'react';

type SquareProps = {
    children: string;
    onSquareClick: () => void;
    highlight?: 'preview' | 'destroy';
    onHover?: () => void;
    onHoverEnd?: () => void;
};

export const Square: React.FC<SquareProps> = (props: SquareProps) => {
    const highlightClass = props.highlight === 'destroy' ? ' square-destroy' : props.highlight === 'preview' ? ' square-preview' : '';
    return (
        <button
            className={`square${highlightClass}`}
            onClick={props.onSquareClick}
            onMouseEnter={props.onHover}
            onMouseLeave={props.onHoverEnd}
        >
            {props.children}
        </button>
    );
};