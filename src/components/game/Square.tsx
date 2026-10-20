import React from 'react';
import { SquareInfo } from '../../types/SquareInfo';
import { seatOf } from '../../types/Player';
import styles from './Square.module.css';

type SquareProps = {
    info: SquareInfo;
    /** コマの記号(💙など)を隅に表示する（色だけに頼らず見分けるため） */
    showMark?: boolean;
    onSquareClick: () => void;
    highlight?: 'preview' | 'destroy';
    shielded?: boolean;
    onHover?: () => void;
    onHoverEnd?: () => void;
};

const SEAT_CLASSES = [
    styles.heart,
    styles.circle,
    styles.seat2,
    styles.seat3,
    styles.seat4,
    styles.seat5,
    styles.seat6,
    styles.seat7,
];

const playerClass = (info: SquareInfo): string => (info.player ? SEAT_CLASSES[seatOf(info.player)] : styles.empty);

export const Square: React.FC<SquareProps> = (props: SquareProps) => {
    const { info } = props;

    const classes = [styles.square, playerClass(info)];
    if (props.highlight === 'destroy') classes.push(styles.destroy);
    else if (props.highlight === 'preview') classes.push(styles.preview);

    const frozen = info.effects.some((e) => e.effect === '❄');
    const burning = info.effects.some((e) => e.effect === '🔥');
    const dormant = frozen; // 氷結中のマスの他のエフェクト（🌱⚡☠）は消えないが休眠（火炎中は休眠しない）
    if (props.shielded) classes.push(styles.shielded);
    else if (!dormant && info.effects.some((e) => e.effect === '⚡')) classes.push(styles.charged);
    if (frozen) classes.push(styles.frozen);
    if (burning) classes.push(styles.burning);

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
            {props.showMark && info.player && <span className={styles.mark}>{info.player}</span>}
            {showLife && <span className={styles.life}>{info.bind}</span>}
            {Object.keys(counts).length > 0 && (
                <span className={styles.effects}>
                    {Object.entries(counts).map(([symbol, n]) => (
                        // 休眠マスの他のエフェクト（🌱⚡☠）は薄く出す
                        <span key={symbol} className={`${styles.badge}${dormant && symbol !== '❄' ? ` ${styles.dormant}` : ''}`}>
                            {symbol}
                            {n > 1 ? n : ''}
                        </span>
                    ))}
                </span>
            )}
        </button>
    );
};
