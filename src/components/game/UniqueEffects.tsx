import React from 'react';
import { cellPixelsFor } from './boardGeometry';
import type { SkillEffect } from './BoardEffects';
import base from './BoardEffects.module.css';
import styles from './UniqueEffects.module.css';

// キャラ固有スキルの演出。汎用スキルの「オーラ+パーティクル」とは違い、スキルごとに
// 予兆 → 本体 → 余波 の3段階で見せる(例: ストンプは影が広がる → 足が落ちる → 地割れと衝撃波)。
// 位置は盤面に対する%で持つので、スマホで盤面が縮んでもずれない。
// 色は単色(フラット)。時間は 1.6〜2.0 秒で、バナー(1.2秒)より少し長く余韻を残す。

export const UNIQUE_EFFECT_TYPES = [
    'assault',
    'stomp',
    'judge',
    'yinyang',
    'necromancy',
    'shikigami',
    'shikigamiBlast',
    'miasma',
    'chainZap',
    'glacier',
    'inferno',
] as const;

export const isUniqueEffect = (type: string): boolean => (UNIQUE_EFFECT_TYPES as readonly string[]).includes(type);

type Pt = { x: number; y: number };

const boardPx = (size: number) => 24 + size * cellPixelsFor(size) + (size - 1) * 8;

/** マス index の中心(盤面に対する%) */
const center = (i: number, size: number): Pt => {
    const cell = cellPixelsFor(size);
    const w = boardPx(size);
    const col = i % size;
    const row = Math.floor(i / size);
    return { x: ((12 + cell / 2 + col * (cell + 8)) / w) * 100, y: ((12 + cell / 2 + row * (cell + 8)) / w) * 100 };
};

const MID: Pt = { x: 50, y: 50 };
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const angle = (a: Pt, b: Pt) => (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
const pos = (p: Pt, extra: React.CSSProperties = {}): React.CSSProperties => ({ left: `${p.x}%`, top: `${p.y}%`, ...extra });
const vars = (v: Record<string, string | number>): React.CSSProperties => v as React.CSSProperties;

/** 2点を結ぶ線が a から b へ伸びる */
const beam = (key: string, a: Pt, b: Pt, delay: number, color: string, th = 6, dur = 450) => (
    <div
        key={key}
        className={styles.beam}
        style={pos(a, { width: `${dist(a, b)}%`, background: color, animationDelay: `${delay}ms`, animationDuration: `${dur}ms`, ...vars({ '--ang': `${angle(a, b)}deg`, '--th': `${th}px` }) })}
    />
);

/** 中心 c を通り、両方向に伸びる線(長さ len%、角度 deg) */
const beamThrough = (key: string, c: Pt, deg: number, len: number, delay: number, color: string, th = 8) => (
    <div
        key={key}
        className={styles.beamC}
        style={pos(c, { width: `${len}%`, background: color, animationDelay: `${delay}ms`, ...vars({ '--ang': `${deg}deg`, '--th': `${th}px` }) })}
    />
);

const pop = (key: string, p: Pt, emoji: string, delay: number, cls = '') => (
    <span key={key} className={`${styles.pop} ${cls}`} style={pos(p, { animationDelay: `${delay}ms` })}>
        {emoji}
    </span>
);

const ring = (key: string, p: Pt, delay: number, color: string, max = 4.6) => (
    <div key={key} className={styles.ring} style={pos(p, { borderColor: color, animationDelay: `${delay}ms`, ...vars({ '--max': max }) })} />
);

/** from から to へ飛ぶ絵文字(位置は left/top のアニメーション) */
const fly = (key: string, from: Pt, to: Pt, emoji: string, delay: number, dur = 700, cls = '') => (
    <span
        key={key}
        className={`${styles.fly} ${cls}`}
        style={{ animationDelay: `${delay}ms`, animationDuration: `${dur}ms`, ...vars({ '--x0': `${from.x}%`, '--y0': `${from.y}%`, '--x1': `${to.x}%`, '--y1': `${to.y}%` }) }}
    >
        {emoji}
    </span>
);

const PARTICLE_X = [6, 16, 26, 36, 46, 56, 66, 76, 86, 94];
const rise = (emoji: string, keyPrefix: string) =>
    PARTICLE_X.map((x, i) => (
        <span key={`${keyPrefix}-${i}`} className={`${base.particle} ${base.rise}`} style={{ left: `${x}%`, top: `${74 + (i % 3) * 6}%`, animationDelay: `${i * 55}ms` }}>
            {emoji}
        </span>
    ));
const fall = (emoji: string, keyPrefix: string) =>
    PARTICLE_X.map((x, i) => (
        <span key={`${keyPrefix}-${i}`} className={`${base.particle} ${base.fall}`} style={{ left: `${x}%`, top: `${2 + (i % 3) * 5}%`, animationDelay: `${i * 55}ms` }}>
            {emoji}
        </span>
    ));

/** 3x3(自身を含む周囲1マス) */
const around = (i: number, size: number): number[] => {
    const r = Math.floor(i / size);
    const c = i % size;
    const out: number[] = [];
    for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
            const rr = r + dr;
            const cc = c + dc;
            if (rr >= 0 && rr < size && cc >= 0 && cc < size) out.push(rr * size + cc);
        }
    }
    return out;
};

// 全軍突撃の着弾位置(4x4 での位置を相対座標のまま他サイズへ写す)
const ASSAULT_IMPACTS_4X4 = [3, 6, 9, 1, 12, 14, 7];
const assaultImpacts = (size: number): number[] =>
    ASSAULT_IMPACTS_4X4.map((idx) => {
        const row = Math.round(Math.floor(idx / 4) * ((size - 1) / 3));
        const col = Math.round((idx % 4) * ((size - 1) / 3));
        return row * size + col;
    });

const DIRS_8: [number, number][] = [
    [1, 0],
    [0.7, 0.7],
    [0, 1],
    [-0.7, 0.7],
    [-1, 0],
    [-0.7, -0.7],
    [0, -1],
    [0.7, -0.7],
];
const radial = (c: Pt, d: [number, number], r: number): Pt => ({ x: c.x + d[0] * r, y: c.y + d[1] * r });

export const renderUniqueEffect = (effect: SkillEffect, size: number): React.ReactNode => {
    const cells = effect.indexes ?? (effect.index !== undefined ? [effect.index] : []);
    const centerCell = Math.floor((size * size) / 2);
    const target: Pt = effect.index !== undefined ? center(effect.index, size) : MID;

    switch (effect.type) {
        case 'assault': {
            // 軍師「全軍突撃」: 旗を掲げた騎馬隊が3列で盤面を駆け抜け、各所に着弾して火花が散る
            const rows = [20, 50, 80];
            return (
                <>
                    <div className={`${base.aura} ${base.auraRed}`} />
                    {rows.map((y, r) => (
                        <React.Fragment key={`row-${r}`}>
                            {[0, 1, 2].map((k) => (
                                <span key={`dust-${k}`} className={styles.dustTrail} style={{ top: `${y + 3}%`, animationDelay: `${r * 130 + k * 80}ms` }}>
                                    💨
                                </span>
                            ))}
                            <span className={styles.rider} style={{ top: `${y}%`, animationDelay: `${r * 130}ms` }}>
                                🐎
                            </span>
                            <span className={styles.flagRider} style={{ top: `${y - 9}%`, animationDelay: `${r * 130 + 40}ms` }}>
                                🚩
                            </span>
                        </React.Fragment>
                    ))}
                    {assaultImpacts(size).map((idx, i) => {
                        const p = center(idx, size);
                        return (
                            <React.Fragment key={`imp-${idx}`}>
                                {ring(`ring-${idx}`, p, 650 + i * 70, '#ffc24a', 3)}
                                {pop(`pop-${idx}`, p, '⚔️', 680 + i * 70)}
                            </React.Fragment>
                        );
                    })}
                    {rise('🔥', 'fire')}
                </>
            );
        }
        case 'stomp': {
            // 巨人「ストンプ」: 影が広がる → 巨大な足が落ちる → 地割れ・衝撃波・土煙・瓦礫、周囲1マスが砕ける
            const c = target;
            const range = effect.index !== undefined ? around(effect.index, size) : [];
            return (
                <>
                    <div className={styles.stompShadow} style={pos(c)} />
                    <span className={styles.foot} style={pos(c)}>
                        🦶
                    </span>
                    {[0, 1, 2].map((i) => ring(`ring-${i}`, c, 400 + i * 130, '#ffc24a', 5))}
                    {DIRS_8.map((d, i) => beam(`crack-${i}`, c, radial(c, d, 26), 400, '#ffd966', 5, 350))}
                    {DIRS_8.map((d, i) => fly(`dust-${i}`, c, radial(c, d, 24), '💨', 420, 600))}
                    {DIRS_8.filter((_, i) => i % 2 === 0).map((d, i) => fly(`rock-${i}`, c, radial(c, d, 16), '🪨', 420, 700, styles.arc))}
                    {range.map((idx, i) => pop(`crush-${idx}`, center(idx, size), '💥', 440 + (i % 5) * 30))}
                    <div className={styles.flashAt} style={{ animationDelay: '400ms' }} />
                </>
            );
        }
        case 'judge': {
            // 魔法使い「審判の日」: 盤面が暗転 → 行・列・両対角に光線が走る → 範囲のマスに雷が落ち、天秤が現れて閃光
            const idx = effect.index ?? centerCell;
            const c = center(idx, size);
            const r0 = Math.floor(idx / size);
            const c0 = idx % size;
            const range: number[] = [];
            for (let k = 0; k < size * size; k++) {
                const r = Math.floor(k / size);
                const cc = k % size;
                if (r === r0 || cc === c0 || Math.abs(r - r0) === Math.abs(cc - c0)) range.push(k);
            }
            return (
                <>
                    <div className={styles.veil} />
                    {beamThrough('b-row', c, 0, 140, 250, '#fff44f')}
                    {beamThrough('b-col', c, 90, 140, 250, '#fff44f')}
                    {beamThrough('b-d1', c, 45, 190, 330, '#ffffff')}
                    {beamThrough('b-d2', c, -45, 190, 330, '#ffffff')}
                    {range.map((k) => pop(`bolt-${k}`, center(k, size), '⚡', 520 + dist(c, center(k, size)) * 9))}
                    {[0, 1].map((i) => ring(`ring-${i}`, c, 450 + i * 150, '#fff44f', 5))}
                    <span className={styles.scale} style={pos(c)}>
                        ⚖️
                    </span>
                    <div className={styles.flashAt} style={{ animationDelay: '850ms', background: '#ffffff' }} />
                </>
            );
        }
        case 'yinyang': {
            // 陰陽師「陰陽転化」: 盤面が墨で暗転 → 白に反転、太極図が回りながら現れ、陰/陽の文字が刻まれる
            const toYang = effect.variant === '陽';
            return (
                <>
                    <div className={styles.inkDark} />
                    <div className={styles.inkLight} />
                    <div className={`${styles.taiji} ${toYang ? styles.taijiYang : ''}`} />
                    <span className={styles.kanji}>{effect.variant ?? '陰'}</span>
                    {['#ffffff', '#8a93b8', '#ffffff'].map((col, i) => ring(`ring-${i}`, MID, 200 + i * 160, col, 5.5))}
                </>
            );
        }
        case 'necromancy': {
            // ネクロマンサー「蘇生」: 暗転して魔法陣が回りながら描かれる → 墓石がせり上がり、魂が立ち昇って召喚される
            const summoned = cells.slice(0, 20);
            const runes = Array.from({ length: 8 }, (_, i) => {
                const rad = (i / 8) * Math.PI * 2;
                return { x: 50 + Math.cos(rad) * 33, y: 50 + Math.sin(rad) * 33 };
            });
            return (
                <>
                    <div className={styles.veil} style={{ background: '#1a0a33' }} />
                    <div className={styles.runeRing} />
                    <div className={`${styles.runeRing} ${styles.runeRingInner}`} />
                    {runes.map((p, i) => pop(`rune-${i}`, p, i % 2 ? '🕯️' : '💀', 200 + i * 70, styles.rune))}
                    {summoned.map((idx, i) => {
                        const p = center(idx, size);
                        return (
                            <React.Fragment key={`s-${idx}`}>
                                {pop(`tomb-${idx}`, p, '🪦', 600 + i * 90, styles.tomb)}
                                {pop(`ghost-${idx}`, p, '👻', 900 + i * 90, styles.ghost)}
                            </React.Fragment>
                        );
                    })}
                    {rise('👻', 'soul')}
                    <div className={styles.flashAt} style={{ animationDelay: '650ms', background: '#c98bff' }} />
                </>
            );
        }
        case 'shikigami': {
            // 式神設置: 紙の人形がひらひらと舞い降り、置かれたマスに判を押したように輪が走る
            const placed = cells.slice(0, 30);
            if (placed.length === 0) return <>{fall('📜', 'paper')}</>;
            return (
                <>
                    {placed.map((idx, i) => {
                        const p = center(idx, size);
                        const start: Pt = { x: p.x + (i % 2 ? 12 : -12), y: -8 };
                        return (
                            <React.Fragment key={`p-${idx}`}>
                                {fly(`fly-${idx}`, start, p, '📜', i * 60, 650, styles.spin)}
                                {ring(`ring-${idx}`, p, 650 + i * 60, '#c9a66b', 2.6)}
                                {pop(`stamp-${idx}`, p, '📜', 660 + i * 60)}
                            </React.Fragment>
                        );
                    })}
                    {placed.length > 4 && fall('📜', 'rain')}
                </>
            );
        }
        case 'shikigamiBlast': {
            // 式神爆破: 導火線の火花 → 紙の人形が爆ぜ、紙片が四方に飛び散り、周囲1マスに火が移る
            const c = target;
            const near = effect.index !== undefined ? around(effect.index, size).filter((k) => k !== effect.index) : [];
            return (
                <>
                    <div className={`${base.aura} ${base.auraRed}`} />
                    {pop('fuse', c, '✨', 0, styles.fuse)}
                    {[0, 1, 2].map((i) => ring(`ring-${i}`, c, 300 + i * 120, '#ff7a2f', 4.5))}
                    {pop('blast', c, '💥', 300, styles.bigPop)}
                    {DIRS_8.map((d, i) => fly(`scrap-${i}`, c, radial(c, d, 24), '📜', 320, 700, styles.spin))}
                    {near.map((k, i) => pop(`fire-${k}`, center(k, size), '🔥', 450 + (i % 4) * 50))}
                    {rise('🔥', 'ember')}
                    <div className={styles.flashAt} style={{ animationDelay: '300ms', background: '#ffd9a8' }} />
                </>
            );
        }
        case 'miasma': {
            // 毒使い「ミアズマ」: 自陣の毒マスから瘴気がたなびいて敵のマスへ流れ、着いたマスで毒がはじける
            const sources = (effect.sources ?? []).map((i) => center(i, size));
            const targets = cells.slice(0, 24);
            const nearestSource = (p: Pt): Pt => (sources.length === 0 ? MID : sources.reduce((best, s) => (dist(s, p) < dist(best, p) ? s : best), sources[0]));
            return (
                <>
                    <div className={base.haze} style={{ background: 'rgba(120, 60, 200, 0.45)' }} />
                    {sources.slice(0, 12).map((s, i) => pop(`src-${i}`, s, '☁️', i * 40, styles.cloudOut))}
                    {targets.map((idx, i) => {
                        const p = center(idx, size);
                        const from = nearestSource(p);
                        return (
                            <React.Fragment key={`t-${idx}`}>
                                {fly(`mist-${idx}`, from, p, '💨', 150 + i * 45, 750, styles.drift)}
                                {pop(`skull-${idx}`, p, '☠', 850 + i * 45)}
                            </React.Fragment>
                        );
                    })}
                    {rise('🫧', 'bubble')}
                </>
            );
        }
        case 'chainZap': {
            // 雷霆の巫「帯電拡散」: 起点から連なるコマへ稲妻が次々と走り、各マスで⚡が弾ける
            const nodes = cells.slice(0, 40);
            if (nodes.length === 0) return <div className={styles.flashAt} />;
            const pts = nodes.map((k) => center(k, size));
            return (
                <>
                    <div className={styles.flashAt} style={{ background: '#fff44f' }} />
                    <div className={`${base.aura} ${base.auraGold}`} />
                    {pop('origin', pts[0], '⚡', 0, styles.bigPop)}
                    {pts.slice(1).map((p, k) => {
                        // 既に光ったマスのうち、最も近いマスから伸ばす
                        let parent = pts[0];
                        for (let j = 0; j <= k; j++) if (dist(pts[j], p) < dist(parent, p)) parent = pts[j];
                        const d = 120 + k * 65;
                        // 稲妻らしく、途中で垂直方向にずらした折れ線にする
                        const midp: Pt = { x: (parent.x + p.x) / 2, y: (parent.y + p.y) / 2 };
                        const rad = ((angle(parent, p) + 90) * Math.PI) / 180;
                        const off = (k % 2 ? 1 : -1) * 2.2;
                        const bend: Pt = { x: midp.x + Math.cos(rad) * off, y: midp.y + Math.sin(rad) * off };
                        return (
                            <React.Fragment key={`arc-${k}`}>
                                {beam(`a1-${k}`, parent, bend, d, '#fde047', 7, 220)}
                                {beam(`a2-${k}`, bend, p, d + 60, '#fde047', 7, 220)}
                                {beam(`c1-${k}`, parent, bend, d, '#ffffff', 3, 220)}
                                {beam(`c2-${k}`, bend, p, d + 60, '#ffffff', 3, 220)}
                                {pop(`n-${k}`, p, '⚡', d + 160)}
                            </React.Fragment>
                        );
                    })}
                </>
            );
        }
        case 'glacier': {
            // 氷室の番人「絶対零度」: 霜の縁が内側へ閉じ込む → 中心から外へ❄が波になって全マスに広がり、大きな雪の結晶が回る
            const all = Array.from({ length: size * size }, (_, k) => k).slice(0, 100);
            const mid = center(centerCell, size);
            return (
                <>
                    <div className={styles.frostFrame} />
                    <div className={base.haze} style={{ background: 'rgba(186, 230, 253, 0.5)' }} />
                    {all.map((k) => pop(`flake-${k}`, center(k, size), '❄', 250 + dist(mid, center(k, size)) * 14))}
                    <span className={styles.snowflake} style={pos(MID)}>
                        ❄️
                    </span>
                    {ring('ring-0', MID, 200, '#7dd3fc', 6)}
                    {ring('ring-1', MID, 420, '#e0f7ff', 6)}
                    {fall('❄', 'snow')}
                    {fall('🧊', 'ice')}
                </>
            );
        }
        case 'inferno': {
            // 煉獄の鍛冶師「業火」: 画面が熱で揺らぎ橙に染まる → 敵のコマごとに火柱が立ち、火の粉が舞い上がる
            const targets = cells.slice(0, 40);
            return (
                <>
                    <div className={styles.heat} />
                    <div className={styles.fireFrame} />
                    {targets.map((idx, i) => (
                        <span key={`pillar-${idx}`} className={styles.pillar} style={pos(center(idx, size), { animationDelay: `${150 + (i % 10) * 70}ms` })}>
                            🔥
                        </span>
                    ))}
                    {targets.length === 0 && pop('core', MID, '🔥', 100, styles.bigPop)}
                    {rise('🔥', 'ember')}
                    {rise('✨', 'spark')}
                    {ring('ring-0', MID, 100, '#ff7a2f', 6)}
                </>
            );
        }
        default:
            return null;
    }
};
