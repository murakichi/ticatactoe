import React from 'react';
import { cellPixelsFor } from './boardGeometry';
import styles from './BoardEffects.module.css';

export type SkillEffectType =
    | 'slash'
    | 'backslash'
    | 'stomp'
    | 'judge'
    | 'opium'
    | 'tsunami'
    | 'assault'
    | 'necromancy'
    | 'yinyang'
    | 'harvest'
    | 'famine'
    | 'auraGreen'
    | 'auraRed'
    | 'poison'
    | 'proliferate';

export type SkillEffect = {
    type: SkillEffectType;
    index?: number;
    nonce: number;
};

type Props = {
    effect: SkillEffect | null;
    /** 盤面の一辺のマス数 */
    size: number;
};

// 盤面のセル中心座標 (padding 12 + cell + gap 8。4x4 なら cell 64 → step 72, 中心 44)
const cellCenter = (index: number, size: number) => {
    const cell = cellPixelsFor(size);
    const col = index % size;
    const row = Math.floor(index / size);
    return { left: 12 + cell / 2 + col * (cell + 8), top: 12 + cell / 2 + row * (cell + 8) };
};

// 全軍突撃: 盤面各所に着弾する衝撃 (軍師の総攻撃)。4x4 での位置を相対座標のまま他サイズへ写す
const ASSAULT_IMPACTS_4X4 = [3, 6, 9, 1, 12, 14, 7];
const assaultImpacts = (size: number): number[] =>
    ASSAULT_IMPACTS_4X4.map((idx) => {
        const row = Math.round(Math.floor(idx / 4) * ((size - 1) / 3));
        const col = Math.round((idx % 4) * ((size - 1) / 3));
        return row * size + col;
    });

// 上昇/落下パーティクルの横位置(%)
const PARTICLE_X = [10, 26, 42, 58, 74, 90];

export const BoardEffects: React.FC<Props> = ({ effect, size }) => {
    if (!effect) return null;

    const riseParticles = (emoji: string) =>
        PARTICLE_X.map((x, i) => (
            <span
                key={i}
                className={`${styles.particle} ${styles.rise}`}
                style={{ left: `${x}%`, top: '78%', animationDelay: `${i * 70}ms` }}
            >
                {emoji}
            </span>
        ));

    const fallParticles = (emoji: string) =>
        PARTICLE_X.map((x, i) => (
            <span
                key={i}
                className={`${styles.particle} ${styles.fall}`}
                style={{ left: `${x}%`, top: '4%', animationDelay: `${i * 70}ms` }}
            >
                {emoji}
            </span>
        ));

    const render = () => {
        switch (effect.type) {
            case 'slash':
                return <div className={`${styles.slashLine} ${styles.slash}`} />;
            case 'backslash':
                return <div className={`${styles.slashLine} ${styles.backslash}`} />;
            case 'stomp': {
                const pos = cellCenter(effect.index ?? size + 1, size);
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
            case 'assault':
                // 軍師「全軍突撃」: 各所に着弾する衝撃 + 旗
                return (
                    <>
                        {assaultImpacts(size).map((idx, i) => {
                            const pos = cellCenter(idx, size);
                            return (
                                <div
                                    key={i}
                                    className={styles.impact}
                                    style={{ left: pos.left, top: pos.top, animationDelay: `${i * 60}ms` }}
                                />
                            );
                        })}
                        <div className={styles.bannerCharge}>🚩</div>
                    </>
                );
            case 'necromancy':
                // ネクロマンサー「蘇生」: 闇のオーラから魂が立ち昇る
                return (
                    <>
                        <div className={styles.necroGlow} />
                        {riseParticles('👻')}
                        <div className={styles.necroSigil}>💀</div>
                    </>
                );
            case 'yinyang':
                // 陰陽師「陰陽転化」: 回転する太極図
                return <div className={styles.yinyang}>☯️</div>;
            case 'harvest':
                // 豊穣の舞: 緑のオーラ + 立ち昇る実り
                return (
                    <>
                        <div className={`${styles.aura} ${styles.auraGreen}`} />
                        {riseParticles('🌾')}
                    </>
                );
            case 'famine':
                // 凶荒の舞: 赤黒いオーラ + 枯れ落ちる
                return (
                    <>
                        <div className={`${styles.aura} ${styles.auraRed}`} />
                        {fallParticles('🥀')}
                    </>
                );
            case 'poison':
                // 毒系スキル: 紫の瘴気 + 立ち昇る毒
                return (
                    <>
                        <div className={styles.haze} />
                        {riseParticles('☠')}
                    </>
                );
            case 'proliferate':
                // 増殖: 緑のオーラから増え続ける芽が湧き上がり、中央に無限記号
                return (
                    <>
                        <div className={`${styles.aura} ${styles.auraGreen}`} />
                        {riseParticles('🌿')}
                        <div className={styles.proliferateSigil}>♾️</div>
                    </>
                );
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
