import React, { useMemo, useState } from 'react';
import { Edge, Loops } from './simLive';
import styles from './MatchupGraph.module.css';

type Props = {
    /** 円周に並べる順（上から時計回り） */
    ids: string[];
    edges: Edge[];
    /** キャラID → 表示名（先頭の絵文字 + 名前） */
    names: Record<string, string>;
    findLoops: (ids: string[], edges: Edge[]) => Loops;
    minDecided: number;
};

type Mode = 'sig' | '55' | '60' | 'all';
const MODES: { id: Mode; label: string; keep: (e: Edge) => boolean }[] = [
    { id: 'sig', label: '有意な差のみ', keep: (e) => e.significant },
    { id: '60', label: '勝率60%以上', keep: (e) => e.rate >= 0.6 },
    { id: '55', label: '勝率55%以上', keep: (e) => e.rate >= 0.55 },
    { id: 'all', label: 'すべて（傾向を含む）', keep: () => true },
];

const SIZE = 640;
const C = SIZE / 2;
const R = 215;
const NODE = 24;
const pct = (x: number) => `${Math.round(x * 100)}%`;
const split = (name: string): { icon: string; text: string } => {
    const i = name.indexOf(' ');
    return i < 0 ? { icon: name.slice(0, 2), text: name.slice(2) } : { icon: name.slice(0, i), text: name.slice(i + 1) };
};

const HIDDEN_KEY = 'simGraphHidden';
// 非表示のキャラは次回も引き継ぐ（この端末だけの設定。使えない環境では覚えないだけ）
const loadHidden = (): string[] => {
    try {
        const v = JSON.parse(window.localStorage.getItem(HIDDEN_KEY) ?? '[]');
        return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
    } catch (e) {
        return [];
    }
};
const saveHidden = (ids: string[]) => {
    try {
        window.localStorage.setItem(HIDDEN_KEY, JSON.stringify(ids));
    } catch (e) {
        /* 保存できなくても動く */
    }
};

/** 有利・不利の関係を、勝つ側 → 負ける側 の矢印で描く。閉ループ（三すくみなど）に入る辺を橙で示す */
export const MatchupGraph = ({ ids: allIds, edges: allEdges, names, findLoops, minDecided }: Props) => {
    const [mode, setMode] = useState<Mode>('sig');
    const [node, setNode] = useState<string | null>(null);
    const [cycle, setCycle] = useState<number | null>(null);
    const [hidden, setHidden] = useState<string[]>(loadHidden);
    const label = (id: string) => names[id] ?? id;

    // 非表示にしたキャラは、辺も閉ループの判定からも外す（外すと崩れる循環もある）
    const ids = useMemo(() => allIds.filter((id) => !hidden.includes(id)), [allIds, hidden]);
    const edges = useMemo(() => allEdges.filter((e) => !hidden.includes(e.from) && !hidden.includes(e.to)), [allEdges, hidden]);
    const toggleHidden = (id: string) => {
        setNode(null);
        setCycle(null);
        setHidden((cur) => {
            const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
            saveHidden(next);
            return next;
        });
    };
    const showAll = () => {
        setNode(null);
        setCycle(null);
        setHidden([]);
        saveHidden([]);
    };

    const shown = useMemo(() => edges.filter((e) => (MODES.find((m) => m.id === mode) ?? MODES[0]).keep(e)), [edges, mode]);
    const loops = useMemo(() => findLoops(ids, shown), [findLoops, ids, shown]);
    const loopEdge = useMemo(() => new Set(loops.loopEdges), [loops]);
    const inLoop = useMemo(() => new Set(loops.groups.flat()), [loops]);

    const pos = useMemo(() => {
        const m: Record<string, { x: number; y: number; a: number }> = {};
        ids.forEach((id, i) => {
            const a = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(ids.length, 1);
            m[id] = { x: C + R * Math.cos(a), y: C + R * Math.sin(a), a };
        });
        return m;
    }, [ids]);

    const cycleEdges = useMemo(() => {
        if (cycle === null || !loops.cycles[cycle]) return null;
        const c = loops.cycles[cycle];
        return new Set(c.map((id, i) => `${id}>${c[(i + 1) % c.length]}`));
    }, [cycle, loops]);

    const selecting = node !== null || cycleEdges !== null;
    const related = (e: Edge) => (cycleEdges ? cycleEdges.has(`${e.from}>${e.to}`) : node !== null && (e.from === node || e.to === node));
    const kind = (e: Edge): 'out' | 'in' | 'cycle' | 'loop' | 'plain' | 'dim' => {
        if (selecting && !related(e)) return 'dim';
        if (cycleEdges) return 'cycle';
        if (node !== null) return e.from === node ? 'out' : 'in';
        return loopEdge.has(`${e.from}>${e.to}`) ? 'loop' : 'plain';
    };

    const path = (e: Edge): string => {
        const a = pos[e.from], b = pos[e.to];
        const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
        const ux = dx / len, uy = dy / len;
        // 円の端から端へ。中心へ少し引き寄せた曲線にして、重なる線を見分けやすくする
        const sx = a.x + ux * NODE, sy = a.y + uy * NODE, ex = b.x - ux * (NODE + 4), ey = b.y - uy * (NODE + 4);
        const mx = (sx + ex) / 2, my = (sy + ey) / 2;
        return `M ${sx} ${sy} Q ${mx + (C - mx) * 0.22} ${my + (C - my) * 0.22} ${ex} ${ey}`;
    };

    const wins = node ? shown.filter((e) => e.from === node).sort((x, y) => y.rate - x.rate) : [];
    const losses = node ? shown.filter((e) => e.to === node).sort((x, y) => y.rate - x.rate) : [];
    const toggleNode = (id: string) => {
        setCycle(null);
        setNode((cur) => (cur === id ? null : id));
    };
    const pickCycle = (i: number) => {
        setNode(null);
        setCycle((cur) => (cur === i ? null : i));
    };
    const cycleName = (n: number) => (n === 3 ? '三すくみ' : `${n}すくみ`);

    return (
        <section className={styles.wrap} aria-label='有利・不利の関係図'>
            <div className={styles.head}>
                <h3 className={styles.title}>有利・不利の関係図</h3>
                <label className={styles.mode}>
                    表示する辺
                    <select
                        value={mode}
                        onChange={(e) => {
                            setMode(e.target.value as Mode);
                            setCycle(null);
                        }}
                    >
                        {MODES.map((m) => (
                            <option key={m.id} value={m.id}>
                                {m.label}
                            </option>
                        ))}
                    </select>
                </label>
            </div>
            <p className={styles.note}>
                矢印は「勝つ側 → 負ける側」。太いほど勝率が高く、{minDecided}試合以上の組だけ描きます。
                <span className={styles.loopKey}>橙</span>
                は閉ループ（三すくみなど。互いに勝ち負けが循環する）に入る矢印です。キャラを押すと、そのキャラが勝てる相手（緑）と負ける相手（赤）だけを強調します。
            </p>

            <div className={styles.filter} role='group' aria-label='表示するキャラ'>
                <span className={styles.filterLabel}>表示するキャラ</span>
                {allIds.map((id) => (
                    <button key={id} className={`${styles.chipBtn} ${hidden.includes(id) ? styles.chipOff : ''}`} aria-pressed={!hidden.includes(id)} onClick={() => toggleHidden(id)} title={hidden.includes(id) ? '押すと表示' : '押すと非表示'}>
                        {label(id)}
                    </button>
                ))}
                {hidden.length > 0 && (
                    <button className={styles.showAll} onClick={showAll}>
                        すべて表示
                    </button>
                )}
            </div>

            <div className={styles.body}>
                <svg className={styles.svg} viewBox={`0 0 ${SIZE} ${SIZE}`} role='img' aria-label='有利・不利の有向グラフ'>
                    <defs>
                        {(['plain', 'loop', 'out', 'in', 'cycle', 'dim'] as const).map((k) => (
                            <marker key={k} id={`mg-arrow-${k}`} viewBox='0 0 10 10' refX='9' refY='5' markerWidth='6' markerHeight='6' orient='auto-start-reverse'>
                                <path d='M 0 0 L 10 5 L 0 10 z' className={styles[`arrow_${k}`]} />
                            </marker>
                        ))}
                    </defs>
                    {shown.map((e) => {
                        const k = kind(e);
                        return (
                            <path
                                key={`${e.from}>${e.to}`}
                                d={path(e)}
                                className={`${styles.edge} ${styles[`edge_${k}`]} ${e.significant ? '' : styles.soft}`}
                                strokeWidth={1 + (e.rate - 0.5) * 9}
                                markerEnd={`url(#mg-arrow-${k})`}
                                data-from={e.from}
                                data-to={e.to}
                                data-kind={k}
                            >
                                <title>{`${label(e.from)} → ${label(e.to)}  勝率${pct(e.rate)}（${e.decided}試合${e.significant ? '・有意' : '・傾向'}）`}</title>
                            </path>
                        );
                    })}
                    {ids.map((id) => {
                        const p = pos[id];
                        const { icon, text } = split(label(id));
                        const right = Math.cos(p.a) >= 0;
                        const sel = node === id;
                        const dim = selecting && !sel && !(cycleEdges && loops.cycles[cycle as number]?.includes(id)) && !(node !== null && shown.some((e) => (e.from === node && e.to === id) || (e.to === node && e.from === id)));
                        return (
                            <g
                                key={id}
                                className={`${styles.node} ${sel ? styles.sel : ''} ${inLoop.has(id) ? styles.inLoop : ''} ${dim ? styles.dimNode : ''}`}
                                role='button'
                                tabIndex={0}
                                aria-pressed={sel}
                                aria-label={label(id)}
                                onClick={() => toggleNode(id)}
                                onKeyDown={(ev) => {
                                    if (ev.key === 'Enter' || ev.key === ' ') {
                                        ev.preventDefault();
                                        toggleNode(id);
                                    }
                                }}
                            >
                                {/* 円とラベルの間の隙間も押せるように、ノード全体を透明の矩形で覆う（ラベルの幅は全角を13pxとして見積もる） */}
                                <rect
                                    className={styles.hit}
                                    x={right ? p.x - NODE : p.x - NODE - 8 - split(label(id)).text.length * 13}
                                    y={p.y - NODE}
                                    width={2 * NODE + 8 + split(label(id)).text.length * 13}
                                    height={2 * NODE}
                                />
                                <circle cx={p.x} cy={p.y} r={NODE} />
                                <text x={p.x} y={p.y + 7} textAnchor='middle' className={styles.icon}>
                                    {icon}
                                </text>
                                <text x={p.x + (right ? NODE + 8 : -NODE - 8)} y={p.y + 5} textAnchor={right ? 'start' : 'end'} className={styles.name}>
                                    {text}
                                </text>
                            </g>
                        );
                    })}
                </svg>

                <div className={styles.side}>
                    {node && (
                        <div className={styles.card}>
                            <strong>{label(node)}</strong>
                            <div className={styles.list}>
                                <span className={styles.out}>勝てる相手</span>
                                {wins.length ? wins.map((e) => <span key={e.to} className={styles.chip}>{label(e.to)} {pct(e.rate)}</span>) : <span className={styles.none}>なし</span>}
                            </div>
                            <div className={styles.list}>
                                <span className={styles.in}>負ける相手</span>
                                {losses.length ? losses.map((e) => <span key={e.from} className={styles.chip}>{label(e.from)} {pct(e.rate)}</span>) : <span className={styles.none}>なし</span>}
                            </div>
                        </div>
                    )}
                    <div className={styles.card}>
                        <strong>閉ループ（三すくみなど）</strong>
                        {loops.groups.length === 0 ? (
                            <p className={styles.none}>ありません。勝ち負けは一方向だけで、上位のキャラが下位に勝つ階層になっています。</p>
                        ) : (
                            <>
                                {loops.groups.map((g) => (
                                    <p key={g.join()} className={styles.group}>
                                        互いに循環する{g.length}キャラ: {g.map(label).join('、')}
                                    </p>
                                ))}
                                <ol className={styles.cycles}>
                                    {loops.cycles.map((c, i) => (
                                        <li key={c.join('>')}>
                                            <button className={`${styles.cycleBtn} ${cycle === i ? styles.cycleOn : ''}`} onClick={() => pickCycle(i)} aria-pressed={cycle === i}>
                                                <b>{cycleName(c.length)}</b> {[...c, c[0]].map((id) => split(label(id)).icon).join(' → ')}
                                            </button>
                                        </li>
                                    ))}
                                </ol>
                                {loops.truncated && <p className={styles.none}>循環が多いので一部だけ表示しています。</p>}
                            </>
                        )}
                    </div>
                </div>
            </div>
        </section>
    );
};
