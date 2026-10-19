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
    | 'overload'
    | 'silence'
    | 'freeze'
    | 'flame'
    | 'glacier'
    | 'glacierBurst'
    | 'inferno'
    | 'cleanse'
    | 'harvestEve'
    | 'solstice'
    | 'sprout'
    | 'windborne'
    | 'iceBreak'
    | 'thaw'
    | 'burn';

/** 盤面の特定マスに重ねて出す小さな演出（メインの演出とは別枠で同時に出せる） */
export type BurstType = 'iceBreak' | 'thaw' | 'burn';

export type BurstEffect = {
    type: BurstType;
    cells: number[];
    nonce: number;
};

export type SkillEffect = {
    type: SkillEffectType;
    index?: number;
    /** 演出を出すマスが複数あるとき（ひこばえ・業火など） */
    indexes?: number[];
    nonce: number;
};

type Props = {
    effect: SkillEffect | null;
    /** マスに重ねる小演出（氷結が砕ける・解凍・燃焼） */
    burst?: BurstEffect | null;
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
    silence: { label: 'サイレンス', bg: '#1d2236', fg: '#c7d0ff' },
    proliferate: { label: '増殖', bg: '#5fd06a', fg: '#082a0c' },
    overload: { label: '⚡過負荷！', bg: '#fff44f', fg: '#2a2500' },
    freeze: { label: '氷結', bg: '#bfe9ff', fg: '#06324d' },
    flame: { label: '火炎', bg: '#ff7a2f', fg: '#2a0d00' },
    glacier: { label: '絶対零度', bg: '#7dd3fc', fg: '#06243a' },
    glacierBurst: { label: '氷結崩壊！', bg: '#e0f7ff', fg: '#06324d' },
    inferno: { label: '業火', bg: '#ff5a1f', fg: '#fff' },
    cleanse: { label: '浄化', bg: '#fff6c9', fg: '#4a3b00' },
    harvestEve: { label: '刈り入れ前夜', bg: '#f6c445', fg: '#3a2a00' },
    solstice: { label: '冬至の種子', bg: '#1d2a5a', fg: '#cfe0ff' },
    sprout: { label: 'ひこばえ', bg: '#5fd06a', fg: '#082a0c' },
    windborne: { label: '風の落とし子', bg: '#b9f0c8', fg: '#0b3a1c' },
};

/** 盤面中央から少しずつずれて広がる輪のずれ(ms) */
const RING_DELAYS = [0, 130, 260];

const BURST_EMOJI: Record<BurstType, string> = { iceBreak: '💠', thaw: '💧', burn: '🔥' };

export const BoardEffects: React.FC<Props> = ({ effect, burst, size }) => {
    if (!effect && !burst) return null;

    // マスの中心に出る小さな絵文字（indexes の各マス）
    const cellPops = (indexes: number[] | undefined, emoji: string, cls: string = '') =>
        (indexes ?? []).slice(0, 49).map((idx, i) => {
            const pos = cellCenter(idx, size);
            return (
                <span key={`${idx}-${i}`} className={`${styles.cellPop} ${cls}`} style={{ left: pos.left, top: pos.top, animationDelay: `${(i % 8) * 45}ms` }}>
                    {emoji}
                </span>
            );
        });

    const sweepParticles = (emoji: string) =>
        [8, 22, 38, 54, 70, 84].map((y, i) => (
            <span key={i} className={`${styles.particle} ${styles.sweep}`} style={{ top: `${y}%`, animationDelay: `${i * 70}ms` }}>
                {emoji}
            </span>
        ));

    const burstOverlay = burst ? (
        <div className={styles.overlay} key={`burst-${burst.nonce}`}>
            {cellPops(burst.cells, BURST_EMOJI[burst.type], styles[`burst_${burst.type}`])}
        </div>
    ) : null;
    if (!effect) return burstOverlay;

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
            case 'freeze':
                // 氷結: 冷気の靄と降る雪片
                return (
                    <>
                        <div className={styles.haze} />
                        {fallParticles('❄')}
                    </>
                );
            case 'flame':
                // 火炎: 赤いオーラと立ち昇る炎
                return (
                    <>
                        <div className={`${styles.aura} ${styles.auraRed}`} />
                        {riseParticles('🔥')}
                    </>
                );
            case 'glacier':
                // 絶対零度: 盤面全体が凍りつく。青いオーラ、降りしきる雪、中央に冷気の紋章
                return (
                    <>
                        <div className={`${styles.aura} ${styles.auraIce}`} />
                        <div className={styles.haze} style={{ background: 'rgba(186, 230, 253, 0.55)' }} />
                        {fallParticles('❄')}
                        {fallParticles('🧊')}
                        <div className={styles.sigil}>🥶</div>
                    </>
                );
            case 'glacierBurst': {
                // 氷結崩壊: 凍った敵が砕け散る。白い閃光と中央からの衝撃波、ダメージを受けたマスに破片
                const pos = cellCenter(effect.index ?? Math.floor((size * size) / 2), size);
                return (
                    <>
                        <div className={styles.flash} style={{ background: 'rgba(224, 247, 255, 0.9)' }} />
                        {RING_DELAYS.map((d) => (
                            <div key={d} className={styles.shockwave} style={{ left: pos.left, top: pos.top, animationDelay: `${d}ms`, borderColor: '#7dd3fc' }} />
                        ))}
                        {cellPops(effect.indexes, '💥')}
                        {cellPops(effect.indexes, '❄', styles.burst_iceBreak)}
                        {fallParticles('✨')}
                    </>
                );
            }
            case 'inferno':
                // 業火: 画面が炎に包まれる。赤橙のオーラと立ち昇る炎、敵コマの上に火柱
                return (
                    <>
                        <div className={`${styles.aura} ${styles.auraFire}`} />
                        {riseParticles('🔥')}
                        {riseParticles('🔥')}
                        {cellPops(effect.indexes, '🔥', styles.burst_burn)}
                        <div className={styles.sigil}>🌋</div>
                    </>
                );
            case 'cleanse':
                // 浄化: 白金の光が盤面を洗い、きらめきが舞い上がる
                return (
                    <>
                        <div className={`${styles.aura} ${styles.auraGold}`} />
                        <div className={styles.flashQuick} />
                        {riseParticles('✨')}
                        {riseParticles('🕊️')}
                        <div className={styles.sigil}>✨</div>
                    </>
                );
            case 'harvestEve':
                // 刈り入れ前夜: 夜の金色の畑。麦と硬貨が舞い上がる
                return (
                    <>
                        <div className={`${styles.aura} ${styles.auraNight}`} />
                        {riseParticles('🌾')}
                        {riseParticles('🪙')}
                        <div className={styles.sigil}>🌙</div>
                    </>
                );
            case 'solstice':
                // 冬至の種子: 冬の夜に種が守られる。濃紺のオーラ、雪、中央の種
                return (
                    <>
                        <div className={`${styles.aura} ${styles.auraNight}`} />
                        {fallParticles('❄')}
                        {fallParticles('✨')}
                        <div className={styles.sigil}>🌰</div>
                    </>
                );
            case 'sprout':
                // ひこばえ: 受け取ったマスから新芽が吹き出す
                return (
                    <>
                        <div className={`${styles.aura} ${styles.auraGreen}`} />
                        {cellPops(effect.indexes, '🌱')}
                        {riseParticles('🌿')}
                    </>
                );
            case 'windborne':
                // 風の落とし子: 木の葉が風に乗って横切り、種が落ちたマスに芽が出る
                return (
                    <>
                        {sweepParticles('🍃')}
                        {cellPops(effect.indexes, '🌱')}
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
        <>
        {burstOverlay}
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
        </>
    );
};
