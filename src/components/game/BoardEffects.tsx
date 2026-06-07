import React from 'react';
import styles from './BoardEffects.module.css';

export type SkillEffectType =
    | 'slash'
    | 'backslash'
    | 'stomp'
    | 'judge'
    | 'opium'
    | 'tsunami'
    | 'auraGreen'
    | 'auraRed';

export type SkillEffect = {
    type: SkillEffectType;
    index?: number;
    nonce: number;
};

type Props = {
    effect: SkillEffect | null;
};

// 盤面のセル中心座標 (padding 12 + cell 64 + gap 8 → step 72, 中心 44)
const cellCenter = (index: number) => {
    const col = index % 4;
    const row = Math.floor(index / 4);
    return { left: 44 + col * 72, top: 44 + row * 72 };
};

export const BoardEffects: React.FC<Props> = ({ effect }) => {
    if (!effect) return null;

    const render = () => {
        switch (effect.type) {
            case 'slash':
                return <div className={`${styles.slashLine} ${styles.slash}`} />;
            case 'backslash':
                return <div className={`${styles.slashLine} ${styles.backslash}`} />;
            case 'stomp': {
                const pos = cellCenter(effect.index ?? 5);
                return <div className={styles.shockwave} style={{ left: pos.left, top: pos.top }} />;
            }
            case 'judge':
                return (
                    <>
                        <div className={styles.flash} />
                        <div className={styles.bolt}>⚡</div>
                    </>
                );
            case 'opium':
                return <div className={styles.haze} />;
            case 'tsunami':
                return <div className={styles.wave} />;
            case 'auraGreen':
                return <div className={`${styles.aura} ${styles.auraGreen}`} />;
            case 'auraRed':
                return <div className={`${styles.aura} ${styles.auraRed}`} />;
            default:
                return null;
        }
    };

    // nonce を key にして毎回アニメーションを再生
    return (
        <div className={styles.overlay} key={effect.nonce}>
            {render()}
        </div>
    );
};
