import React, { useEffect, useRef, useState } from 'react';
import { MAX_PLAYERS } from '../types/Player';
import { range } from '../util';
import { MIN_BOARD_SIZE, MAX_BOARD_SIZE, boardSizeFor } from './game/boardGeometry';
import styles from './SimPanel.module.css';

import { Analysis, Conv, LiveApi, Matchups, RawStats, Summary, Verdict, loadLive } from './simLive';

type Snapshot = { summary: Summary; matchups: Matchups; analysis: (Analysis & { verdict: Verdict }) | null; drift: number | null; elapsed: number; jobs: number };
type Status = 'idle' | 'running' | 'stopped' | 'converged' | 'error';

type Props = {
    /** キャラID → 表示名（アイコン付き） */
    names: Record<string, string>;
    initialPlayers: number;
    initialBoardSize: 'auto' | number;
    onBack: () => void;
    /** 集計用の live.js の読み込み（テストで差し替える） */
    load?: () => Promise<LiveApi>;
};

const CONV: Conv = { window: 10, eps: 0.005, minGames: 2000 };
const SEAT_ICONS = ['💙', '⭕', '🟩', '🔶', '⭐', '🟣', '🟫', '🩷'];

const pct = (x: number | null | undefined, d = 1) => (x == null ? '—' : `${(x * 100).toFixed(d)}%`);
/** 均等(1/人数)より上なら強め、下なら弱めの色付け用 */
const tone = (rate: number | null, fair: number) => (rate == null ? '' : rate > fair * 1.1 ? styles.hi : rate < fair * 0.9 ? styles.lo : '');
const matchTone = (rate: number | null) => (rate == null ? '' : rate >= 0.55 ? styles.hi : rate <= 0.45 ? styles.lo : '');

export const SimPanel = ({ names, initialPlayers, initialBoardSize, onBack, load = loadLive }: Props) => {
    const [players, setPlayers] = useState<number>(initialPlayers);
    const [boardChoice, setBoardChoice] = useState<'auto' | number>(initialBoardSize);
    const [useSkills, setUseSkills] = useState<boolean>(true);
    const [useGears, setUseGears] = useState<boolean>(true);
    const [autoStop, setAutoStop] = useState<boolean>(true);
    // 実行中の対戦に使った設定（終了後にチェックを触っても表示は変えない）
    const [ran, setRan] = useState<{ skills: boolean; gears: boolean }>({ skills: true, gears: true });
    const [status, setStatus] = useState<Status>('idle');
    const [snap, setSnap] = useState<Snapshot | null>(null);
    const [error, setError] = useState<string>('');
    const workers = useRef<Worker[]>([]);
    const timer = useRef<number | undefined>(undefined);
    const finish = useRef<((s: Status) => void) | null>(null);
    const runId = useRef<number>(0);

    const terminate = () => {
        workers.current.forEach((w) => w.terminate());
        workers.current = [];
        if (timer.current !== undefined) window.clearInterval(timer.current);
        timer.current = undefined;
        finish.current = null;
    };
    // 画面を離れたら裏の対戦も止める
    useEffect(() => () => { runId.current++; terminate(); }, []);

    const fail = (message: string) => {
        terminate();
        setStatus('error');
        setError(message);
    };

    const start = async () => {
        terminate();
        const id = ++runId.current;
        setError('');
        setSnap(null);
        setRan({ skills: useSkills, gears: useGears });
        setStatus('running');
        let live: LiveApi;
        try {
            live = await load();
        } catch (e) {
            if (id === runId.current) fail('シミュレーションの読み込みに失敗しました');
            return;
        }
        if (id !== runId.current) return; // 読み込み中に止めた・画面を離れた
        // 計算は端末のコアぶんの Worker で分担する（画面が重くならないよう1つ空ける）
        const jobs = Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 1));
        const seed = Math.floor(Math.random() * 1e6);
        const t0 = Date.now();
        const latest: (RawStats | null)[] = Array(jobs).fill(null);
        let agg: unknown = null;
        // 1対1は全組を1周する長さ(110)の倍数ごとに勝率のスナップショットを積む
        const ckEvery = players === 2 ? 220 : 200;

        const publish = (): RawStats | null => {
            const first = latest.find((p) => p);
            if (!first) return null;
            if (!agg) agg = live.createAggregator(Object.keys(first.perChar), players, ckEvery);
            const st = live.aggregate(agg, latest);
            const an = live.analyze(st);
            setSnap({
                summary: live.summarize(st),
                matchups: live.matchups(st),
                analysis: an ? { ...an, verdict: live.verdict(an) } : null,
                drift: live.maxDrift(st, CONV.window),
                elapsed: (Date.now() - t0) / 1000,
                jobs,
            });
            return st;
        };

        try {
            for (let k = 0; k < jobs; k++) {
                const w = new Worker(`${process.env.PUBLIC_URL}/simWorker.js`);
                w.onmessage = (e: MessageEvent) => {
                    const m = e.data;
                    if (m.type === 'error') fail(m.message);
                    else latest[k] = m.stats;
                };
                w.onerror = () => fail('シミュレーションの読み込みに失敗しました');
                workers.current.push(w);
            }
        } catch (e) {
            fail('この環境では Web Worker を起動できませんでした');
            return;
        }
        finish.current = (s: Status) => {
            publish();
            terminate();
            setStatus(s);
        };
        // ゲーム番号 g は全Workerで共通。Worker k が g = k, k+jobs, ... を担当する（結果は g だけで決まり、並列数に依らない）
        workers.current.forEach((w, k) =>
            w.postMessage({
                cmd: 'start', players, size: boardChoice === 'auto' ? undefined : boardChoice, mode: 'faithful', seed,
                fixedChars: null, skills: useSkills, gears: useGears, offset: k, stride: jobs, maxGames: null,
            })
        );
        timer.current = window.setInterval(() => {
            const st = publish();
            if (st && autoStop && live.converged(st, CONV)) finish.current?.('converged');
        }, 500);
    };
    const stop = () => finish.current?.('stopped');

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
                AIどうしが対戦し続け、勝率を集計します（1対1は全キャラの組を順に、3人以上はキャラをランダムに引きます）。この端末のブラウザの中だけで、端末のコアを分担して動き、停止するか勝率が落ち着くまで続きます。
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
                <label className={styles.check} title='外すと魔法スキルを一切使わず、置くだけで戦います（キャラのパッシブは有効）'>
                    <input type='checkbox' checked={useSkills} disabled={running} onChange={(e) => setUseSkills(e.target.checked)} />
                    スキルを使う
                </label>
                <label className={styles.check} title='外すとギアなしで戦います'>
                    <input type='checkbox' checked={useGears} disabled={running} onChange={(e) => setUseGears(e.target.checked)} />
                    ギアを装備する
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
                            {players}人 {size}x{size}・スキル{ran.skills ? 'あり' : 'なし'}・ギア{ran.gears ? 'あり' : 'なし'}・{s.games.toLocaleString()}局・並列{snap!.jobs}・{(s.games / Math.max(snap!.elapsed, 0.001)).toFixed(1)}局/秒・引き分け {pct(s.drawRate)}・平均{s.avgTurns.toFixed(1)}手
                        </span>
                        <span>
                            勝率の変動幅（直近{CONV.window}回）: {pct(snap!.drift, 2)}
                            {autoStop && `（${pct(CONV.eps, 1)}以内かつ${CONV.minGames}局以上で自動停止）`}
                        </span>
                    </div>

                    {snap!.analysis && <Conclusion an={snap!.analysis} label={label} />}

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

/** 「何が強いか」の結論。平均勝率だけでなく、最悪対面・不利対面数・相手を見て選ぶ場合(均衡)で判断する */
const Conclusion = ({ an, label }: { an: Analysis & { verdict: Verdict }; label: (id: string) => string }) => {
    const ready = an.ready;
    return (
        <section className={styles.conclusion} aria-label='結論'>
            <h3 className={styles.sub}>結論: 何が強いか</h3>
            <p className={`${styles.headline} ${ready ? '' : styles.pending}`}>{an.verdict.headline}</p>
            <ul className={styles.points}>
                {an.verdict.points.map((p) => (
                    <li key={p}>{p}</li>
                ))}
            </ul>
            <div className={`${styles.scroll} ${ready ? '' : styles.dim}`}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th>キャラ</th>
                            <th title='相手が全キャラ均等に出る場合の勝率（各対面の勝率の平均）'>対全キャラ平均</th>
                            <th title='平均勝率の上位半分の相手(自分を除く)だけで平均した勝率。弱いキャラを大勝して平均が上がるのを避けるための指標'>対強豪平均</th>
                            <th title='勝率が最も低い対面。試合数が少ない対面は除く'>最悪対面</th>
                            <th title={`勝率の95%区間が50%を下回る対面の数（不利）/ 上回る対面の数（有利）。${an.minDecided}試合未満の対面は数えない`}>不利 / 有利</th>
                            <th title='相手も最適にキャラを選ぶと仮定したときの、このキャラが選ばれる確率（ナッシュ均衡）'>均衡で選ばれる確率</th>
                        </tr>
                    </thead>
                    <tbody>
                        {an.rows.map((r) => (
                            <tr key={r.id}>
                                <th scope='row'>{label(r.id)}</th>
                                <td>{pct(r.fieldAvg)}</td>
                                <td>{pct(r.strongAvg)}</td>
                                <td className={r.worst ? matchTone(r.worst.rate) : ''}>
                                    {r.worst ? (
                                        <>
                                            {pct(r.worst.rate)}
                                            <small>（対{label(r.worst.id)}）</small>
                                        </>
                                    ) : (
                                        '—'
                                    )}
                                </td>
                                <td>
                                    <span className={r.unfavorable === 0 && r.solidOpponents > 0 ? styles.hi : ''}>{r.unfavorable}</span> / {r.favorable}
                                </td>
                                <td className={r.eq >= 0.2 ? styles.hi : ''}>{pct(r.eq)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <details className={styles.explain}>
                <summary>この結論の計算方法</summary>
                <ol>
                    <li>
                        <strong>対面表</strong>: 同じ試合に出た2キャラについて「Aが勝った ÷ (Aが勝った + Bが勝った)」を出します。引き分けと、第三者が勝った試合は含めません。
                    </li>
                    <li>
                        <strong>対全キャラ平均</strong>: 対面表の行の平均です。相手が全キャラ均等に出るときの勝率で、環境順位(probe-top)の環境勝率と同じ意味です。
                    </li>
                    <li>
                        <strong>対強豪平均</strong>: 対全キャラ平均は、環境下位(例: 「あなた」)を大勝するだけで上がります。そこで、平均勝率の上位半分の相手(自分は除く)だけで平均した勝率を、
                        順位の判断に使います。下位への勝ちは評価に入りません(対全キャラ平均は参考として併記)。
                    </li>
                    <li>
                        <strong>最悪対面 / 不利・有利</strong>: 平均だけでは「1体のカウンターがいるだけで選ばれなくなる」ことを見落とします。そこで最も負ける対面と、
                        勝率の95%区間(Wilson)が50%を有意に下回る対面の数を並べます。{an.minDecided}試合未満の対面は誤差が大きいので数えません。
                    </li>
                    <li>
                        <strong>均衡で選ばれる確率</strong>: 相手を見てキャラを選べる場合の強さです。対面表を2人ゼロ和ゲームとみなしてナッシュ均衡を求めます
                        (乗法的重み更新。最良応答の利得が0に近いほど収束。今は {(an.exploit * 100).toFixed(2)}pt)。試合数が少ない対面は50%寄りに補正してノイズでの偏りを抑えています。
                        1キャラに集中すれば「そのキャラを出せば済む」、分散していれば「相性次第で選ぶ余地がある」状態です。
                    </li>
                    <li>
                        <strong>結論の出し方</strong>: {an.minDecided}試合に届いた対面が9割になるまで保留します(引き分けが多い組が1つあっても、いつまでも待たないため。届いていない対面は最悪対面と不利/有利の数に入れません)。届いたら、対強豪平均・最悪対面・均衡のすべてで1位かつ有意な不利対面なしなら「突出」、均衡の50%以上が1キャラなら「実質最強」、それ以外は「突出なし」または「平均と均衡で1位が違う」と判定します。
                    </li>
                    <li>
                        <strong>注意</strong>: 3人以上では第三者が勝つ試合が混ざり、均衡の前提(2人の直接対決)が崩れるので参考値です。「あなた」のように極端に弱いキャラが混ざると対全キャラ平均が見かけ上押し上げられるため、対強豪平均・最悪対面・均衡も併せて見てください。
                    </li>
                </ol>
            </details>
        </section>
    );
};
