import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { SimPanel } from './SimPanel';

// Web Worker のモック。postMessage('start') を受けたら集計を1回返す
class FakeWorker {
    static last: FakeWorker | null = null;
    onmessage: ((e: MessageEvent) => void) | null = null;
    onerror: (() => void) | null = null;
    posted: any[] = [];
    terminated = false;
    constructor() { FakeWorker.last = this; }
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
const matchups = {
    giant: { you: { meets: 6, wins: 4, losses: 2, winRate: 2 / 3 } },
    you: { giant: { meets: 6, wins: 2, losses: 4, winRate: 1 / 3 } },
};

describe('SimPanel', () => {
    beforeEach(() => { (global as any).Worker = FakeWorker; FakeWorker.last = null; });

    test('開始でWorkerに設定を送り、集計と対面表を表示し、停止できる', () => {
        render(<SimPanel names={names} initialPlayers={2} initialBoardSize='auto' onBack={() => {}} />);
        fireEvent.click(screen.getByRole('button', { name: /シミュレート開始/ }));
        const w = FakeWorker.last!;
        expect(w.posted[0]).toMatchObject({ cmd: 'start', players: 2, mode: 'faithful', skills: true, gears: true });
        act(() => w.emit({ type: 'progress', summary, matchups, drift: 0.01, elapsed: 2 }));
        expect(screen.getAllByText('👹 巨人', { selector: 'th[scope=row]' })).toHaveLength(2); // キャラ別表と対面表
        expect(screen.getAllByText('67%').length).toBeGreaterThan(0); // 対面表: 巨人→あなた
        fireEvent.click(screen.getByRole('button', { name: /停止/ }));
        expect(w.posted[1]).toEqual({ cmd: 'stop' });
        act(() => w.emit({ type: 'done', reason: 'stopped', summary, matchups, drift: 0.01, elapsed: 3 }));
        expect(screen.getByText('停止しました')).toBeTruthy();
        expect(w.terminated).toBe(true);
    });

    test('収束で止まったことを表示し、画面を離れるとWorkerを止める', () => {
        const { unmount } = render(<SimPanel names={names} initialPlayers={2} initialBoardSize='auto' onBack={() => {}} />);
        fireEvent.click(screen.getByRole('button', { name: /シミュレート開始/ }));
        const w = FakeWorker.last!;
        act(() => w.emit({ type: 'done', reason: 'converged', summary, matchups, drift: 0.001, elapsed: 3 }));
        expect(screen.getByText('勝率が落ち着いたので停止しました')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: /最初からやり直す/ }));
        const w2 = FakeWorker.last!;
        expect(w2).not.toBe(w);
        unmount();
        expect(w2.terminated).toBe(true);
    });

    test('スキル・ギアのチェックを外すとWorkerへ伝わる', () => {
        render(<SimPanel names={names} initialPlayers={2} initialBoardSize='auto' onBack={() => {}} />);
        fireEvent.click(screen.getByLabelText('スキルを使う'));
        fireEvent.click(screen.getByLabelText('ギアを装備する'));
        fireEvent.click(screen.getByRole('button', { name: /シミュレート開始/ }));
        expect(FakeWorker.last!.posted[0]).toMatchObject({ skills: false, gears: false });
    });
});
