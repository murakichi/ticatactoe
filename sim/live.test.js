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

describe('analyze / verdict', () => {
    // table[a][b] = [aの勝ち, bの勝ち]。書いてある組だけ2人戦として record する
    const build = (chars, table) => {
        const st = live.createStats(chars, 2);
        for (const a of Object.keys(table)) for (const b of Object.keys(table[a])) {
            const [wa, wb] = table[a][b];
            for (let i = 0; i < wa; i++) live.record(st, [a, b], { winnerSeat: 0, turns: 1 });
            for (let i = 0; i < wb; i++) live.record(st, [a, b], { winnerSeat: 1, turns: 1 });
        }
        return st;
    };

    test('じゃんけん(3すくみ)は均衡が1/3ずつで、突出キャラなし', () => {
        const st = build(['r', 'p', 's'], { p: { r: [80, 20], s: [20, 80] }, r: { s: [80, 20] } });
        // p>r, s>p, r>s
        const an = live.analyze(st);
        an.rows.forEach((r) => expect(r.eq).toBeCloseTo(1 / 3, 1));
        an.rows.forEach((r) => expect(r.fieldAvg).toBeCloseTo(0.5, 5));
        expect(an.exploit).toBeLessThan(0.02);
        expect(live.verdict(an).headline).toContain('突出したキャラはいません');
    });

    test('全員に勝ち越すキャラは均衡がほぼ全部そこに集まり、不利対面が無い', () => {
        const st = build(['w', 'a', 'b'], { w: { a: [70, 30], b: [65, 35] }, a: { b: [80, 20] } });
        const an = live.analyze(st);
        const w = an.rows.find((r) => r.id === 'w');
        expect(w.eq).toBeGreaterThan(0.9);
        expect(w.unfavorable).toBe(0);
        expect(w.favorable).toBe(2);
        expect(w.worst.rate).toBeCloseTo(0.65);
        expect(an.rows[0].id).toBe('w');
        expect(live.verdict(an, (x) => x.toUpperCase()).headline).toContain('Wが突出');
    });

    test('平均勝率1位でもカウンターがいれば、均衡では別キャラが有力になりうる', () => {
        // x は a,b を大勝するが c に負ける。c は x にだけ強い
        const st = build(['x', 'a', 'b', 'c'], {
            x: { a: [95, 5], b: [95, 5], c: [10, 90] }, a: { b: [50, 50], c: [60, 40] }, b: { c: [60, 40] },
        });
        const an = live.analyze(st);
        const x = an.rows.find((r) => r.id === 'x');
        expect(x.unfavorable).toBe(1);
        expect(x.worst.id).toBe('c');
        expect(x.eq).toBeLessThan(0.5);
    });

    test('対面の試合数が少ないと結論を保留する', () => {
        const st = build(['a', 'b'], { a: { b: [3, 1] } });
        expect(live.verdict(live.analyze(st)).headline).toContain('標本が少なく');
        expect(live.analyze(st).ready).toBe(false);
    });

    test('キャラが1つだけなら分析なし', () => {
        const st = live.createStats(['a', 'b'], 2);
        live.record(st, ['a', 'a'], { winnerSeat: 0, turns: 1 });
        expect(live.analyze(st)).toBeNull();
    });

    test('弱いキャラを大勝するだけの平均勝率は、対強豪平均では評価されない', () => {
        // pad は a,b,c に大勝される最弱キャラ。a は pad を大勝して平均が高いが、強豪(b,c)にはやや負け越す。
        // c は pad に普通に勝つが、強豪に安定して強い
        const st = build(['a', 'b', 'c', 'pad'], {
            a: { b: [40, 60], c: [40, 60], pad: [100, 0] },
            b: { c: [50, 50], pad: [60, 40] },
            c: { pad: [60, 40] },
        });
        const an = live.analyze(st);
        const a = an.rows.find((r) => r.id === 'a'), c = an.rows.find((r) => r.id === 'c');
        expect(a.fieldAvg).toBeGreaterThan(c.fieldAvg);       // 素朴な平均では a が上
        expect(c.strongAvg).toBeGreaterThan(a.strongAvg);     // 強豪相手では c が上
        expect(a.strongAvg).toBeCloseTo(0.4, 5);              // pad は強豪に入らない
        expect(an.rows[0].id).not.toBe('pad');
    });
});

describe('statsFromPairs / strong set', () => {
    test('ペア集計から analyze でき、強豪は平均の上位半分', () => {
        const st = live.statsFromPairs(['a', 'b', 'c', 'pad'], [
            { a: 'a', b: 'b', w: 40, l: 60 }, { a: 'a', b: 'c', w: 40, l: 60 }, { a: 'a', b: 'pad', w: 100, l: 0 },
            { a: 'b', b: 'c', w: 50, l: 50 }, { a: 'b', b: 'pad', w: 60, l: 40 }, { a: 'c', b: 'pad', w: 60, l: 40 },
        ]);
        const an = live.analyze(st);
        expect(an.strong).toHaveLength(2);
        expect(an.strong).not.toContain('pad');
        const a = an.rows.find((r) => r.id === 'a');
        expect(a.fieldAvg).toBeCloseTo(0.6, 5);
    });
});

describe('roundRobinPairs / mergeStats / aggregate', () => {
    test('1対1は異なる2キャラの全順列を1周する（先手・後手が同数）', () => {
        const ids = ['a', 'b', 'c'];
        const pairs = live.roundRobinPairs(ids);
        expect(pairs).toHaveLength(6);
        expect(new Set(pairs.map((p) => p.join('>'))).size).toBe(6);
        pairs.forEach(([x, y]) => expect(x).not.toBe(y));
        for (const id of ids) expect(pairs.filter((p) => p[0] === id)).toHaveLength(pairs.filter((p) => p[1] === id).length);
    });

    test('ワーカーの累計を足すと、1本で回した場合と同じになる', () => {
        const { createJob } = require('./compute');
        const E = require('./engine');
        const mk = (offset, stride) => { const j = createJob({ players: 2, mode: 'faithful', seed: 1, maxGames: 6, offset, stride }); j.run(1e6); return j.stats; };
        const merged = live.mergeStats(E.CHARACTERS, 2, [mk(0, 3), mk(1, 3), mk(2, 3)]);
        const single = mk(0, 1);
        expect(merged.games).toBe(6);
        const norm = (v) => JSON.stringify(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1)));
        expect(norm(merged.perChar)).toBe(norm(single.perChar));
        expect(norm(merged.vs)).toBe(norm(single.vs));
        expect(merged.seatWins).toEqual(single.seatWins);
        expect(merged.turns).toBe(single.turns);
    }, 60000);

    test('aggregate は ckEvery 局ごとにスナップショットを積む', () => {
        const agg = live.createAggregator(['a', 'b'], 2, 10);
        const part = (n) => { const st = live.createStats(['a', 'b'], 2); for (let i = 0; i < n; i++) live.record(st, ['a', 'b'], { winnerSeat: i % 2, turns: 1 }); return st; };
        expect(live.aggregate(agg, [part(4), part(4)]).history).toHaveLength(0);
        expect(live.aggregate(agg, [part(6), part(6)]).history).toHaveLength(1);
        expect(live.aggregate(agg, [part(7), part(7)]).history).toHaveLength(1); // 14局: まだ次の20局に届かない
        expect(live.aggregate(agg, [part(11), part(11)]).history).toHaveLength(2);
    });

    test('引き分けばかりの組が1つあっても、9割の対面が揃えば結論を出す', () => {
        const ids = ['a', 'b', 'c', 'd', 'e'];
        // 10組のうち1組(d-e)だけ少数（打ち切りが多い想定）。他は50試合
        const pairs = [];
        for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) pairs.push({ a: ids[i], b: ids[j], w: ids[i] === 'd' && ids[j] === 'e' ? 2 : 30, l: ids[i] === 'd' && ids[j] === 'e' ? 1 : 20 });
        const an = live.analyze(live.statsFromPairs(ids, pairs));
        expect(an.solidPairs).toBe(9);
        expect(an.totalPairs).toBe(10);
        expect(an.ready).toBe(true);
        // 少数の組は最悪対面に入らない
        expect(an.rows.find((r) => r.id === 'e').worst.id).not.toBe('d');
    });
});

describe('有利・不利の有向グラフ', () => {
    const pairsOf = (list) => list.map(([a, b, w, l]) => ({ a, b, w, l }));

    test('勝つ側→負ける側の辺を作り、有意かどうかを区別する。試合数が少ない組・ちょうど50%の組は辺なし', () => {
        const st = live.statsFromPairs(['a', 'b', 'c', 'd'], pairsOf([
            ['a', 'b', 80, 20],  // a→b 有意
            ['a', 'c', 28, 22],  // a→c 傾向（有意でない: 56%, n=50）
            ['b', 'c', 20, 80],  // c→b 有意
            ['a', 'd', 3, 1],    // 少数: 辺なし
            ['b', 'd', 25, 25],  // ちょうど50%: 辺なし
            ['c', 'd', 30, 30],
        ]));
        const an = live.analyze(st);
        const key = (e) => `${e.from}>${e.to}${e.significant ? '*' : ''}`;
        expect(an.edges.map(key).sort()).toEqual(['a>b*', 'a>c', 'c>b*']);
        const ab = an.edges.find((e) => e.from === 'a' && e.to === 'b');
        expect(ab.rate).toBeCloseTo(0.8);
        expect(ab.lo).toBeGreaterThan(0.5);
        expect(an.loops.cycles).toEqual([]);
        expect(an.loops.groups).toEqual([]);
    });

    test('三すくみ(じゃんけん)を循環として1回だけ検出する。辺の向きは勝つ側→負ける側', () => {
        const st = live.statsFromPairs(['r', 'p', 's'], pairsOf([
            ['p', 'r', 80, 20], // p→r
            ['s', 'p', 80, 20], // s→p
            ['r', 's', 80, 20], // r→s
        ]));
        const an = live.analyze(st);
        expect(an.edges.map((e) => e.from + '>' + e.to).sort()).toEqual(['p>r', 'r>s', 's>p']);
        expect(an.loops.cycles).toHaveLength(1);
        expect(new Set(an.loops.cycles[0])).toEqual(new Set(['r', 'p', 's']));
        expect(an.loops.groups).toEqual([['r', 'p', 's']]);
        expect(an.loops.loopEdges.sort()).toEqual(['p>r', 'r>s', 's>p']);
    });

    test('全員に勝ち越すキャラは出る辺だけを持つ（入る辺なし）', () => {
        const st = live.statsFromPairs(['w', 'a', 'b'], pairsOf([['w', 'a', 70, 30], ['w', 'b', 65, 35], ['a', 'b', 55, 45]]));
        const an = live.analyze(st);
        expect(an.edges.filter((e) => e.to === 'w')).toHaveLength(0);
        expect(an.edges.filter((e) => e.from === 'w')).toHaveLength(2);
    });

    test('4つ以上の閉ループ・複数の循環・循環に入らない辺を区別する', () => {
        const E = (list) => list.map(([from, to]) => ({ from, to, rate: 0.7, decided: 50, lo: 0.6, significant: true }));
        const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
        // a→b→c→d→a の4ループ、c→a の近道で三すくみ a→b→c→a もできる。d→e は循環に入らない（e は行き止まり）。f は孤立
        const edges = E([['a', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'a'], ['c', 'a'], ['d', 'e']]);
        const lp = live.findLoops(ids, edges);
        expect(lp.groups).toEqual([['a', 'b', 'c', 'd']]);
        expect(lp.cycles.map((c) => c.join('')).sort()).toEqual(['abc', 'abcd']);
        expect(lp.loopEdges.sort()).toEqual(['a>b', 'b>c', 'c>a', 'c>d', 'd>a']);
        expect(lp.loopEdges).not.toContain('d>e');
        expect(lp.truncated).toBe(false);
    });

    test('一方向だけの階層（全員が上位に負ける）は閉ループではない', () => {
        const E = (list) => list.map(([from, to]) => ({ from, to, rate: 0.7, decided: 50, lo: 0.6, significant: true }));
        const lp = live.findLoops(['a', 'b', 'c'], E([['a', 'b'], ['b', 'c'], ['a', 'c']]));
        expect(lp.groups).toEqual([]);
        expect(lp.cycles).toEqual([]);
        expect(lp.loopEdges).toEqual([]);
    });

    test('循環が多すぎるときは maxCount で打ち切って truncated を立てる', () => {
        const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
        const all = [];
        for (const x of ids) for (const y of ids) if (x < y) all.push({ from: x, to: y }); // 順方向
        for (const x of ids) for (const y of ids) if (x > y) all.push({ from: x, to: y }); // 逆方向（全部双方向＝循環だらけ）
        const lp = live.findLoops(ids, all.map((e) => ({ ...e, rate: 0.7, decided: 50, lo: 0.6, significant: true })), { maxCount: 10 });
        expect(lp.cycles).toHaveLength(10);
        expect(lp.truncated).toBe(true);
    });
});
