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
    | 'proliferate'
    | 'zap'
    | 'overload';

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

// ストンプの飛び散る瓦礫の移動量(px)
const DEBRIS: [number, number][] = [
    [-90, -70],
    [90, -80],
    [-120, 10],
    [120, 20],
    [-60, 90],
    [70, 100],
];

// 上昇/落下パーティクルの横位置(%)
const PARTICLE_X = [6, 16, 26, 36, 46, 56, 66, 76, 86, 94];

// スキル名バナー(盤面中央にドンと出る帯)。フラットな単色帯 + 文字で派手さを出す
const BANNERS: Partial<Record<SkillEffectType, { label: string; bg: string; fg: string }>> = {
    slash: { label: 'スラッシュ！', bg: '#ffffff', fg: '#10131c' },
    backslash: { label: 'バックスラッシュ！', bg: '#ffffff', fg: '#10131c' },
    stomp: { label: 'ストンプ！', bg: '#ffc24a', fg: '#2a1d00' },
    judge: { label: '審判の日', bg: '#fff44f', fg: '#2a2500' },
    opium: { label: 'オピウム', bg: '#c98bff', fg: '#1d0b33' },
    tsunami: { label: 'チューチュートレイン！', bg: '#46a6ff', fg: '#06182e' },
    assault: { label: '全軍突撃！', bg: '#ff4d79', fg: '#fff' },
    necromancy: { label: '蘇生', bg: '#8a4fd6', fg: '#fff' },
    yinyang: { label: '陰陽転化', bg: '#ffffff', fg: '#10131c' },
    harvest: { label: '豊穣の舞', bg: '#5fd06a', fg: '#082a0c' },
    famine: { label: '凶荒の舞', bg: '#ff4d79', fg: '#fff' },
    auraGreen: { label: 'ワルプルギスの夜', bg: '#5fd06a', fg: '#082a0c' },
    poison: { label: '毒', bg: '#c98bff', fg: '#1d0b33' },
    proliferate: { label: '増殖', bg: '#5fd06a', fg: '#082a0c' },
    overload: { label: '⚡過負荷！', bg: '#fff44f', fg: '#2a2500' },
};

export const BoardEffects: React.FC<Props> = ({ effect, size }) => {
    if (!effect) return null;

    const riseParticles = (emoji: string) =>
        PARTICLE_X.map((x, i) => (
            <span
                key={i}
                className={`${styles.particle} ${styles.rise}`}
                style={{ left: `${x}%`, top: `${74 + (i % 3) * 6}%`, animationDelay: `${i * 55}ms` }}
            >
                {emoji}
            </span>
        ));

    const fallParticles = (emoji: string) =>
        PARTICLE_X.map((x, i) => (
            <span
                key={i}
                className={`${styles.particle} ${styles.fall}`}
                style={{ left: `${x}%`, top: `${2 + (i % 3) * 5}%`, animationDelay: `${i * 55}ms` }}
            >
                {emoji}
            </span>
        ));

    const render = () => {
        switch (effect.type) {
            case 'slash':
            case 'backslash': {
                // 3連撃: 太さと位置をずらした斬撃を時間差で重ねる
                const dir = effect.type === 'slash' ? styles.slash : styles.backslash;
                return (
                    <>
                        <div className={styles.flashQuick} />
                        {[0, 1, 2].map((i) => (
                            <div
                                key={i}
                                className={`${styles.slashLine} ${dir}`}
                                style={{ animationDelay: `${i * 110}ms`, marginTop: -5 + (i - 1) * 26 }}
                            />
                        ))}
                    </>
                );
            }
            case 'stomp': {
                const pos = cellCenter(effect.index ?? size + 1, size);
                return (
                    <>
                        {[0, 1, 2].map((i) => (
                            <div key={i} className={styles.shockwave} style={{ left: pos.left, top: pos.top, animationDelay: `${i * 140}ms` }} />
                        ))}
                        {DEBRIS.map((d, i) => (
                            <span
                                key={i}
                                className={styles.debris}
                                style={{ left: pos.left, top: pos.top, ['--dx' as string]: `${d[0]}px`, ['--dy' as string]: `${d[1]}px` }}
                            >
                                🪨
                            </span>
                        ))}
                    </>
                );
            }
            case 'judge':
                return (
                    <>
                        <div className={styles.flash} />
                        <div className={`${styles.flash} ${styles.flashLate}`} />
                        <div className={styles.bolt}>⚡</div>
                        <div className={`${styles.bolt} ${styles.boltL}`}>⚡</div>
                        <div className={`${styles.bolt} ${styles.boltR}`}>⚡</div>
                    </>
                );
            case 'opium':
                return (
                    <>
                        <div className={styles.haze} />
                        {riseParticles('💨')}
                    </>
                );
            case 'tsunami':
                return (
                    <>
                        {[0, 1, 2].map((i) => (
                            <div key={i} className={styles.wave} style={{ animationDelay: `${i * 160}ms` }} />
                        ))}
                        {riseParticles('💦')}
                    </>
                );
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
                        {riseParticles('🔥')}
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
                return (
                    <>
                        <div className={`${styles.yinyangRing}`} />
                        <div className={styles.yinyang}>☯️</div>
                    </>
                );
            case 'harvest':
                // 豊穣の舞: 緑のオーラ + 立ち昇る実り
                return (
                    <>
                        <div className={`${styles.aura} ${styles.auraGreen}`} />
                        {riseParticles('🌾')}
                        {riseParticles('✨')}
                    </>
                );
            case 'famine':
                // 凶荒の舞: 赤黒いオーラ + 枯れ落ちる
                return (
                    <>
                        <div className={`${styles.aura} ${styles.auraRed}`} />
                        {fallParticles('🥀')}
                        {fallParticles('🍂')}
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
            case 'zap': {
                // 雷霆の巫「帯電」: 対象マスに電光が走る。マス指定なしなら盤面全体に短い閃光
                if (effect.index === undefined) {
                    return (
                        <>
                            <div className={styles.flash} />
                            <div className={styles.bolt}>⚡</div>
                        </>
                    );
                }
                const pos = cellCenter(effect.index, size);
                return (
                    <>
                        <div className={styles.zapRing} style={{ left: pos.left, top: pos.top }} />
                        <div className={styles.zapBolt} style={{ left: pos.left, top: pos.top }}>
                            ⚡
                        </div>
                    </>
                );
            }
            case 'overload':
                // 過負荷: 全マスの⚡が爆発。白黄の閃光 + 中央から広がる輪
                return (
                    <>
                        <div className={styles.overloadFlash} />
                        <div className={styles.overloadRing} />
                    </>
                );
            case 'auraGreen':
                // ワルプルギスの夜: 全マスに芽吹くオーラ
                return (
                    <>
                        <div className={`${styles.aura} ${styles.auraGreen}`} />
                        {riseParticles('🌱')}
                        {riseParticles('🌸')}
                    </>
                );
            case 'auraRed':
                return <div className={`${styles.aura} ${styles.auraRed}`} />;
            default:
                return null;
        }
    };

    // nonce を key にして毎回アニメーションを再生
    const banner = BANNERS[effect.type];
    return (
        <div className={styles.overlay} key={effect.nonce}>
            {render()}
            {banner && (
                <div
                    className={styles.banner}
                    style={{ background: banner.bg, color: banner.fg, fontSize: banner.label.length > 8 ? 21 : banner.label.length > 6 ? 26 : 30 }}
                >
                    {banner.label}
                </div>
            )}
        </div>
    );
};
