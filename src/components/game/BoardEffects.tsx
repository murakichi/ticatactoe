import React from 'react';
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
};

// 盤面のセル中心座標 (padding 12 + cell 64 + gap 8 → step 72, 中心 44)
const cellCenter = (index: number) => {
    const col = index % 4;
    const row = Math.floor(index / 4);
    return { left: 44 + col * 72, top: 44 + row * 72 };
};

// 全軍突撃: 盤面各所に着弾する衝撃 (軍師の総攻撃)
const ASSAULT_IMPACTS = [3, 6, 9, 1, 12, 14, 7];

// 上昇/落下パーティクルの横位置(%)
const PARTICLE_X = [10, 26, 42, 58, 74, 90];

export const BoardEffects: React.FC<Props> = ({ effect }) => {
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
            case 'assault':
                // 軍師「全軍突撃」: 各所に着弾する衝撃 + 旗
                return (
                    <>
                        {ASSAULT_IMPACTS.map((idx, i) => {
                            const pos = cellCenter(idx);
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
