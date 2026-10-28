const live = require('./live');

describe('live stats', () => {
    test('勝率・席別・引き分けを集計する', () => {
        const st = live.createStats(['you', 'giant'], 2);
        live.record(st, ['you', 'giant'], { winnerSeat: 0, turns: 10 });
        live.record(st, ['giant', 'you'], { winnerSeat: 0, turns: 20 });
        live.record(st, ['you', 'giant'], { winnerSeat: -1, turns: 30 });
        const s = live.summarize(st);
        expect(s.games).toBe(3);
        expect(s.drawRate).toBeCloseTo(1 / 3);
        expect(s.seatWinRate).toEqual([1, 0]);
        const you = s.rows.find((r) => r.id === 'you');
        expect(you.appearances).toBe(3);
        expect(you.winRate).toBeCloseTo(1 / 3);
        expect(you.avgTurnsWon).toBe(10);
    });

    test('勝率が動かなくなったら収束とみなす', () => {
        const st = live.createStats(['you', 'giant'], 2);
        const opt = { window: 3, eps: 0.01, minGames: 4 };
        for (let i = 0; i < 4; i++) { live.record(st, ['you', 'giant'], { winnerSeat: i % 2, turns: 5 }); live.checkpoint(st); }
        // you の勝率: 1, .5, .67, .5 → まだ動いている
        expect(live.converged(st, opt)).toBe(false);
        for (let i = 0; i < 2000; i++) { live.record(st, ['you', 'giant'], { winnerSeat: i % 2, turns: 5 }); if (i % 100 === 0) live.checkpoint(st); }
        for (let i = 0; i < 3; i++) live.checkpoint(st);
        expect(live.converged(st, opt)).toBe(true);
    });
});

describe('matchups', () => {
    test('対面別勝率（2人戦）', () => {
        const st = live.createStats(['you', 'giant'], 2);
        live.record(st, ['you', 'giant'], { winnerSeat: 0, turns: 1 });
        live.record(st, ['giant', 'you'], { winnerSeat: 0, turns: 1 });
        live.record(st, ['giant', 'you'], { winnerSeat: 1, turns: 1 });
        live.record(st, ['you', 'giant'], { winnerSeat: -1, turns: 1 });
        const m = live.matchups(st);
        expect(m.you.giant).toEqual({ meets: 4, wins: 2, losses: 1, winRate: 2 / 3 });
        expect(m.giant.you.winRate).toBeCloseTo(1 / 3);
    });
    test('3人戦: 第三者の勝ちはどちらにも数えず、重複は二重計上しない', () => {
        const st = live.createStats(['you', 'giant', 'magician'], 3);
        live.record(st, ['you', 'you', 'giant'], { winnerSeat: 2, turns: 1 });
        const m = live.matchups(st);
        expect(m.you.giant.meets).toBe(1);
        expect(m.you.giant.losses).toBe(1);
        expect(m.you.you).toBeUndefined();
    });
});
