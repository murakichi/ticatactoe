import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { SimPanel } from './SimPanel';
import { LiveApi } from './simLive';

// Web Worker のモック。postMessage で受け取った設定を記録するだけ
class FakeWorker {
    static all: FakeWorker[] = [];
    onmessage: ((e: MessageEvent) => void) | null = null;
    onerror: (() => void) | null = null;
    posted: any[] = [];
    terminated = false;
    constructor() { FakeWorker.all.push(this); }
    postMessage(m: any) { this.posted.push(m); }
    terminate() { this.terminated = true; }
    emit(data: any) { this.onmessage?.({ data } as MessageEvent); }
}

const names = { you: '🧑 あなた', giant: '👹 巨人' };
const summary = {
    games: 10, drawRate: 0, avgTurns: 20, fair: 0.5, seatWinRate: [0.6, 0.4],
    rows: [
        { id: 'giant', appearances: 6, wins: 4, winRate: 4 / 6, ci: 0.3, avgTurnsWon: 14 },
        { id: 'you', appearances: 6, wins: 2, winRate: 1 / 3, ci: 0.3, avgTurnsWon: 20 },
    ],
};
const analysis = {
    rows: [
        { id: 'giant', fieldAvg: 0.7, strongAvg: 0.6, worst: { id: 'you', rate: 0.6, decided: 30 }, unfavorable: 0, favorable: 1, solidOpponents: 1, opponents: 1, eq: 0.97 },
        { id: 'you', fieldAvg: 0.3, strongAvg: 0.4, worst: { id: 'giant', rate: 0.2, decided: 30 }, unfavorable: 1, favorable: 0, solidOpponents: 1, opponents: 1, eq: 0.03 },
    ],
    exploit: 0.004, minPairDecided: 30, solidPairs: 1, totalPairs: 1, ready: true, minDecided: 20, players: 2,
};
const matchups = {
    giant: { you: { meets: 6, wins: 4, losses: 2, winRate: 2 / 3 } },
    you: { giant: { meets: 6, wins: 2, losses: 4, winRate: 1 / 3 } },
};
// 集計は sim/live.js の仕事。ここでは固定の結果を返す偽物にする（live.js 本体は sim/live.test.js で検証）
let convergedNow = false;
const aggregateCalls: any[] = [];
const fakeLive: LiveApi = {
    createAggregator: (ids: string[], players: number, ck: number) => ({ ids, players, ck }),
    aggregate: (agg: unknown, parts: any[]) => { aggregateCalls.push({ agg, parts }); return { perChar: { giant: {}, you: {} } }; },
    summarize: () => summary,
    matchups: () => matchups,
    analyze: () => analysis,
    verdict: () => ({ headline: 'giantが突出しています', points: ['対強豪平均の1位: giant'] }),
    maxDrift: () => 0.01,
    converged: () => convergedNow,
};
const load = () => Promise.resolve(fakeLive);
const rawStats = { perChar: { giant: {}, you: {} } };

const renderPanel = () => render(<SimPanel names={names} initialPlayers={2} initialBoardSize='auto' onBack={() => {}} load={load} />);
const clickStart = async () => {
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /シミュレート開始|最初からやり直す/ })); });
};

describe('SimPanel', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        (global as any).Worker = FakeWorker;
        FakeWorker.all = [];
        convergedNow = false;
        aggregateCalls.length = 0;
    });
    afterEach(() => { jest.useRealTimers(); });

    test('開始で複数のWorkerにゲーム番号を分担させ、集計と結論・対面表を表示し、停止できる', async () => {
        renderPanel();
        await clickStart();
        const ws = FakeWorker.all;
        expect(ws.length).toBeGreaterThanOrEqual(1);
        ws.forEach((w, k) => expect(w.posted[0]).toMatchObject({ cmd: 'start', players: 2, mode: 'faithful', skills: true, gears: true, offset: k, stride: ws.length }));
        act(() => ws.forEach((w) => w.emit({ type: 'raw', stats: rawStats })));
        act(() => { jest.advanceTimersByTime(500); });
        expect(aggregateCalls[0].parts).toHaveLength(ws.length);
        expect(screen.getByText('giantが突出しています')).toBeTruthy(); // 結論
        expect(screen.getAllByText('👹 巨人', { selector: 'th[scope=row]' })).toHaveLength(3); // 結論表・キャラ別表・対面表
        expect(screen.getAllByText('67%').length).toBeGreaterThan(0); // 対面表: 巨人→あなた
        fireEvent.click(screen.getByRole('button', { name: /停止/ }));
        expect(screen.getByText('停止しました')).toBeTruthy();
        expect(ws.every((w) => w.terminated)).toBe(true);
    });

    test('勝率が収束したら自動で止まり、画面を離れるとWorkerを止める', async () => {
        const { unmount } = renderPanel();
        await clickStart();
        act(() => FakeWorker.all.forEach((w) => w.emit({ type: 'raw', stats: rawStats })));
        convergedNow = true;
        act(() => { jest.advanceTimersByTime(500); });
        expect(screen.getByText('勝率が落ち着いたので停止しました')).toBeTruthy();
        expect(FakeWorker.all.every((w) => w.terminated)).toBe(true);
        await clickStart();
        const second = FakeWorker.all.slice(-1)[0];
        unmount();
        expect(second.terminated).toBe(true);
    });

    test('スキル・ギアのチェックを外すとWorkerへ伝わる', async () => {
        renderPanel();
        fireEvent.click(screen.getByLabelText('スキルを使う'));
        fireEvent.click(screen.getByLabelText('ギアを装備する'));
        await clickStart();
        expect(FakeWorker.all[0].posted[0]).toMatchObject({ skills: false, gears: false });
    });

    test('live.js の読み込みに失敗したらエラーを表示する', async () => {
        render(<SimPanel names={names} initialPlayers={2} initialBoardSize='auto' onBack={() => {}} load={() => Promise.reject(new Error('x'))} />);
        await clickStart();
        expect(screen.getByText('シミュレーションの読み込みに失敗しました')).toBeTruthy();
        expect(FakeWorker.all).toHaveLength(0);
    });
});
