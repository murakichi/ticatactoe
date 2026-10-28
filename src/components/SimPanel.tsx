import React, { useEffect, useRef, useState } from 'react';
import { MAX_PLAYERS } from '../types/Player';
import { range } from '../util';
import { MIN_BOARD_SIZE, MAX_BOARD_SIZE, boardSizeFor } from './game/boardGeometry';
import styles from './SimPanel.module.css';

/** public/simWorker.js が返す集計(sim/live.js の summarize / matchups) */
type CharRow = { id: string; appearances: number; wins: number; winRate: number; ci: number | null; avgTurnsWon: number | null };
type Summary = { games: number; drawRate: number; avgTurns: number; fair: number; seatWinRate: (number | null)[]; rows: CharRow[] };
type Matchups = Record<string, Record<string, { meets: number; wins: number; losses: number; winRate: number | null }>>;
type Snapshot = { summary: Summary; matchups: Matchups; drift: number | null; elapsed: number };
type Status = 'idle' | 'running' | 'stopped' | 'converged' | 'max' | 'error';

type Props = {
    /** キャラID → 表示名（アイコン付き） */
    names: Record<string, string>;
    initialPlayers: number;
    initialBoardSize: 'auto' | number;
    onBack: () => void;
};

const CONV = { window: 10, eps: 0.005, minGames: 2000 };
const CHECKPOINT = 200;
const SEAT_ICONS = ['💙', '⭕', '🟩', '🔶', '⭐', '🟣', '🟫', '🩷'];

const pct = (x: number | null | undefined, d = 1) => (x == null ? '—' : `${(x * 100).toFixed(d)}%`);
/** 均等(1/人数)より上なら強め、下なら弱めの色付け用 */
const tone = (rate: number | null, fair: number) => (rate == null ? '' : rate > fair * 1.1 ? styles.hi : rate < fair * 0.9 ? styles.lo : '');
const matchTone = (rate: number | null) => (rate == null ? '' : rate >= 0.55 ? styles.hi : rate <= 0.45 ? styles.lo : '');

export const SimPanel = ({ names, initialPlayers, initialBoardSize, onBack }: Props) => {
    const [players, setPlayers] = useState<number>(initialPlayers);
    const [boardChoice, setBoardChoice] = useState<'auto' | number>(initialBoardSize);
    const [autoStop, setAutoStop] = useState<boolean>(true);
    const [status, setStatus] = useState<Status>('idle');
    const [snap, setSnap] = useState<Snapshot | null>(null);
    const [error, setError] = useState<string>('');
    const worker = useRef<Worker | null>(null);

    const terminate = () => {
        worker.current?.terminate();
        worker.current = null;
    };
    // 画面を離れたら裏の対戦も止める
    useEffect(() => terminate, []);

    const start = () => {
        terminate();
        setError('');
        setSnap(null);
        let w: Worker;
        try {
            w = new Worker(`${process.env.PUBLIC_URL}/simWorker.js`);
        } catch (e) {
            setStatus('error');
            setError('この環境では Web Worker を起動できませんでした');
            return;
        }
        worker.current = w;
        w.onmessage = (e: MessageEvent) => {
            const m = e.data;
            if (m.type === 'error') {
                setStatus('error');
                setError(m.message);
                terminate();
                return;
            }
            setSnap({ summary: m.summary, matchups: m.matchups, drift: m.drift, elapsed: m.elapsed });
            if (m.type === 'done') {
                setStatus(m.reason === 'converged' ? 'converged' : m.reason === 'max' ? 'max' : 'stopped');
                terminate();
            }
        };
        w.onerror = () => {
            setStatus('error');
            setError('シミュレーションの読み込みに失敗しました');
            terminate();
        };
        w.postMessage({
            cmd: 'start',
            players,
            size: boardChoice === 'auto' ? undefined : boardChoice,
            mode: 'faithful',
            seed: Math.floor(Math.random() * 1e6),
            fixedChars: null,
            conv: autoStop ? CONV : null,
            checkpoint: CHECKPOINT,
            maxGames: Infinity,
        });
        setStatus('running');
    };
    const stop = () => worker.current?.postMessage({ cmd: 'stop' });

    const running = status === 'running';
    const size = boardChoice === 'auto' ? boardSizeFor(players) : boardChoice;
    const s = snap?.summary;
    const ids = s ? s.rows.map((r) => r.id) : [];
    const label = (id: string) => names[id] ?? id;

    return (
        <div className={styles.panel}>
            <div className={styles.head}>
                <button className={styles.back} onClick={onBack}>
                    ← 設定に戻る
                </button>
                <h2 className={styles.title}>📊 対戦シミュレーション</h2>
            </div>
            <p className={styles.lead}>
                AIどうしがキャラをランダムに引いて対戦し続け、勝率を集計します。この端末のブラウザの中だけで動き、停止するか勝率が落ち着くまで続きます。
            </p>

            <div className={styles.controls}>
                <label className={styles.field}>
                    人数
                    <select value={players} disabled={running} onChange={(e) => setPlayers(Number(e.target.value))}>
                        {range(2, MAX_PLAYERS - 1).map((n) => (
                            <option key={n} value={n}>
                                {n}人
                            </option>
                        ))}
                    </select>
                </label>
                <label className={styles.field}>
                    マス数
                    <select
                        value={boardChoice}
                        disabled={running}
                        onChange={(e) => setBoardChoice(e.target.value === 'auto' ? 'auto' : Number(e.target.value))}
                    >
                        <option value='auto'>おまかせ（{boardSizeFor(players)}x{boardSizeFor(players)}）</option>
                        {range(MIN_BOARD_SIZE, MAX_BOARD_SIZE - MIN_BOARD_SIZE + 1).map((n) => (
                            <option key={n} value={n}>
                                {n}x{n}
                            </option>
                        ))}
                    </select>
                </label>
                <label className={styles.check}>
                    <input type='checkbox' checked={autoStop} disabled={running} onChange={(e) => setAutoStop(e.target.checked)} />
                    勝率が落ち着いたら自動で止める
                </label>
                {running ? (
                    <button className={styles.stop} onClick={stop}>
                        ■ 停止
                    </button>
                ) : (
                    <button className={styles.go} onClick={start}>
                        ▶ {snap ? '最初からやり直す' : 'シミュレート開始'}
                    </button>
                )}
            </div>

            {error && <div className={styles.error}>{error}</div>}

            {s && (
                <>
                    <div className={styles.status} aria-live='polite'>
                        <strong>
                            {running && '実行中'}
                            {status === 'stopped' && '停止しました'}
                            {status === 'converged' && '勝率が落ち着いたので停止しました'}
                        </strong>
                        <span>
                            {players}人 {size}x{size}・{s.games.toLocaleString()}局・{(s.games / Math.max(snap!.elapsed, 0.001)).toFixed(1)}局/秒・引き分け {pct(s.drawRate)}・平均{s.avgTurns.toFixed(1)}手
                        </span>
                        <span>
                            勝率の変動幅（直近{CONV.window}回）: {pct(snap!.drift, 2)}
                            {autoStop && `（${pct(CONV.eps, 1)}以内かつ${CONV.minGames}局以上で自動停止）`}
                        </span>
                    </div>

                    <h3 className={styles.sub}>キャラ別勝率（出場1回あたり・均等なら {pct(s.fair)}）</h3>
                    <div className={styles.scroll}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>キャラ</th>
                                    <th>出場</th>
                                    <th>勝</th>
                                    <th>勝率</th>
                                    <th>±95%</th>
                                    <th>勝利時平均手数</th>
                                </tr>
                            </thead>
                            <tbody>
                                {s.rows.map((r) => (
                                    <tr key={r.id}>
                                        <th scope='row'>{label(r.id)}</th>
                                        <td>{r.appearances.toLocaleString()}</td>
                                        <td>{r.wins.toLocaleString()}</td>
                                        <td className={tone(r.winRate, s.fair)}>{pct(r.winRate)}</td>
                                        <td>{r.ci == null ? '—' : (r.ci * 100).toFixed(1)}</td>
                                        <td>{r.avgTurnsWon == null ? '—' : r.avgTurnsWon.toFixed(1)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <h3 className={styles.sub}>席別勝率（引き分け除く・席1が先手）</h3>
                    <div className={styles.seats}>
                        {s.seatWinRate.map((p, i) => (
                            <span key={i} className={`${styles.seat} ${tone(p, s.fair)}`}>
                                {SEAT_ICONS[i]} {pct(p)}
                            </span>
                        ))}
                    </div>

                    <h3 className={styles.sub}>対面別勝率（行のキャラが列のキャラに勝つ割合）</h3>
                    <p className={styles.note}>
                        同じ試合に出た組について「行が勝った ÷ (行が勝った + 列が勝った)」。{players >= 3 && '3人以上では第三者が勝った試合は数えません。'}括弧内は同卓した試合数。
                    </p>
                    <div className={styles.scroll}>
                        <table className={`${styles.table} ${styles.matrix}`}>
                            <thead>
                                <tr>
                                    <th />
                                    {ids.map((id) => (
                                        <th key={id} title={label(id)}>
                                            {label(id)}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {ids.map((x) => (
                                    <tr key={x}>
                                        <th scope='row'>{label(x)}</th>
                                        {ids.map((y) => {
                                            const c = snap!.matchups[x]?.[y];
                                            return x === y ? (
                                                <td key={y} className={styles.self}>
                                                    —
                                                </td>
                                            ) : (
                                                <td key={y} className={matchTone(c?.winRate ?? null)}>
                                                    {c && c.winRate != null ? (
                                                        <>
                                                            {pct(c.winRate, 0)}
                                                            <small>({c.meets})</small>
                                                        </>
                                                    ) : (
                                                        '—'
                                                    )}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </div>
    );
};
