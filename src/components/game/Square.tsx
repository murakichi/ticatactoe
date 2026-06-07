import React from 'react';
import { SquareInfo } from '../../types/SquareInfo';
import styles from './Square.module.css';

type SquareProps = {
    info: SquareInfo;
    onSquareClick: () => void;
    highlight?: 'preview' | 'destroy';
    onHover?: () => void;
    onHoverEnd?: () => void;
};

const playerClass = (info: SquareInfo): string =>
    info.player === '💙' ? styles.heart : info.player === '⭕' ? styles.circle : styles.empty;

export const Square: React.FC<SquareProps> = (props: SquareProps) => {
    const { info } = props;

    const classes = [styles.square, playerClass(info)];
    if (props.highlight === 'destroy') classes.push(styles.destroy);
    else if (props.highlight === 'preview') classes.push(styles.preview);

    // 効果を記号ごとに集計してバッジ表示 (🌱×3 など)
    const counts: Record<string, number> = {};
    for (const e of info.effects) counts[e.effect] = (counts[e.effect] ?? 0) + 1;

    const showLife = info.player !== undefined || info.bind > 0;

    return (
        <button
            className={classes.join(' ')}
            onClick={props.onSquareClick}
            onMouseEnter={props.onHover}
            onMouseLeave={props.onHoverEnd}
        >
            {showLife && <span className={styles.life}>{info.bind}</span>}
            {Object.keys(counts).length > 0 && (
                <span className={styles.effects}>
                    {Object.entries(counts).map(([symbol, n]) => (
                        <span key={symbol} className={styles.badge}>
                            {symbol}
                            {n > 1 ? n : ''}
                        </span>
                    ))}
                </span>
            )}
        </button>
    );
};
