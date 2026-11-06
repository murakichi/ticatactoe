// @ts-check
'use strict';
// sim/engine.test.js から読み込まれるテスト（共有の道具は ../testkit.js）
const { assert, e, test, game, stacks, FRZ, BUD, budsOn, flames, frosts, geo4, chargeOf, FLM } = require('../testkit');

// ---- AI の氷結・火炎対応 ----





test('氷結中の🌱は休眠: 魔力ボーナスに数えず、刈り入れ前夜も触らない。解凍すると再び働く', () => {
    const mk = (frozen) => {
        const g = game('magician', 'you');
        g.heartTurn = false; g.circleMagic = 0; // 席1(you)が着手 → 次は席0(魔法使い)の手番開始
        g.board[1] = { player: '💙', bind: 5, effects: frozen ? [BUD, BUD, FRZ] : [BUD, BUD] };
        return g;
    };
    const gain = (g) => { const before = g.heartMagic; e.placeMove(g, 15); return g.heartMagic - before; };
    // 魔法使い: 1 + 🌱×(1+2)。休眠中は🌱を数えず 1 + 2（ボーナス込み: 魔法使い+1）
    assert.strictEqual(gain(mk(false)) - gain(mk(true)), 6);
    const h = game();
    h.heartTurn = true; h.heartMagic = 10;
    h.board[1] = { player: '💙', bind: 3, effects: [BUD, BUD, FRZ] };
    h.board[2] = { player: '💙', bind: 3, effects: [BUD] };
    assert.strictEqual(e.ownBuds(h), 1);
    e.SKILLS.harvestEve(h);
    assert.strictEqual(h.heartMagic, 10 - 2 + 1);
    assert.strictEqual(budsOn(h.board[1]), 2); // 氷結中のマスの🌱は除去されない
    assert.strictEqual(budsOn(h.board[2]), 0);
    const f = game();
    f.heartTurn = true; f.heartMagic = 10;
    f.board[1] = { player: '💙', bind: 3, effects: [BUD, FRZ] };
    e.SKILLS.harvestEve(f); // 休眠中の🌱しか無い → 不可
    assert.strictEqual(f.heartMagic, 10);
});

test('氷結中の⚡は休眠: 雷霆の巫の無敵が効かず、帯電コストの軽減と過負荷に数えない', () => {
    const s = game('electrician', 'you');
    s.heartTurn = true; s.heartMagic = 20;
    s.board[5] = { player: '💙', bind: 3, effects: [{ effect: '⚡' }] };
    assert.strictEqual(e.isShielded(s, s.board[5]), true);
    s.board[5] = { player: '💙', bind: 3, effects: [{ effect: '⚡' }, FRZ] };
    assert.strictEqual(e.isShielded(s, s.board[5]), false); // 氷結中は無敵でない
    assert.strictEqual(e.boardChargeCount(s.board), 0);
    const base = e.chargeOneCost(s);
    s.board[6] = { player: '⭕', bind: 3, effects: [{ effect: '⚡' }] };
    assert.strictEqual(e.boardChargeCount(s.board), 1);
    assert.strictEqual(e.chargeOneCost(s), Math.max(1, base - 1));
    // 過負荷: 全マスが⚡でも、氷結中のマスは⚡なし扱いなので爆発しない
    const o = game('electrician', 'you');
    o.heartTurn = true; o.heartMagic = 20;
    for (let k = 0; k < 16; k++) o.board[k] = { player: undefined, bind: 2, effects: [{ effect: '⚡' }, ...(k === 3 ? [FRZ] : [])] };
    o.board[0] = { player: '⭕', bind: 3, effects: [] }; // 1 マスだけ⚡なし
    e.SKILLS.chargeOne(o);
    assert.strictEqual(e.placeMove(o, 0), true);
    assert.ok(o.board.some((sq) => sq.bind > 0), '氷結中のマスがあるので過負荷にならない');
    o.board[3] = { player: undefined, bind: 2, effects: [{ effect: '⚡' }] };
    o.heartMagic = 20;
    e.SKILLS.chargeOne(o);
    e.placeMove(o, 1); // 全マス⚡（氷結なし）→ 過負荷
    assert.ok(o.board.every((sq) => sq.bind === 0));
});

// ---- 火炎系の汎用スキル idx37〜40（火炎トークン / 火炎ダブルトークン / 焼畑 / 殉火） ----

test('火炎トークン: 空きマスに自陣のコマを置き🔥を1つ付け、縦横隣の氷結を全解除する。凍った空きマスには置かない。トークン扱いでコスト3', () => {
    const s = game();
    s.heartTurn = true; s.heartMagic = 20;
    for (let k = 0; k < 16; k++) s.board[k] = { player: '⭕', bind: 3, effects: [FRZ, FRZ] };
    s.board[5] = { player: undefined, bind: 0, effects: [] };           // 唯一の置ける空きマス
    s.board[0] = { player: undefined, bind: 0, effects: [FRZ] };        // 凍った空きマスは対象外
    const before = s.heartMagic;
    e.SKILLS.flameToken(s);
    assert.strictEqual(s.heartMagic, before - 3);
    assert.strictEqual(s.board[5].player, '💙');
    assert.strictEqual(flames(s.board[5]), 1);
    assert.strictEqual(frosts(s.board[5]), 0);
    for (const k of [1, 4, 6, 9]) assert.strictEqual(frosts(s.board[k]), 0, '縦横隣の氷結は全解除: ' + k);
    assert.strictEqual(frosts(s.board[2]), 2);                           // 離れたマスは凍ったまま
    assert.strictEqual(s.board[0].player, undefined);
    assert.strictEqual(s.usedTokenThisTurn, true);
    assert.strictEqual(s.heartTurn, true);
    // 空きマスが無ければ不発（魔力は払う）
    const t = game();
    t.heartTurn = true; t.heartMagic = 20;
    for (let k = 0; k < 16; k++) t.board[k] = { player: '⭕', bind: 3, effects: [] };
    e.SKILLS.flameToken(t);
    assert.strictEqual(t.heartMagic, 17);
    assert.ok(t.board.every((sq) => flames(sq) === 0));
});

test('火炎ダブルトークン: 空きマス2つに置いてそれぞれ🔥を1つ。コスト5、トークン扱い', () => {
    const s = game();
    s.heartTurn = true; s.heartMagic = 20;
    e.SKILLS.doubleFlameToken(s);
    assert.strictEqual(s.heartMagic, 15);
    const mine = s.board.filter((sq) => sq.player === '💙');
    assert.strictEqual(mine.length, 2);
    assert.ok(mine.every((sq) => flames(sq) === 1));
    assert.strictEqual(s.usedTokenThisTurn, true);
});

test('焼畑: 🌱を持つマス（敵味方どちらでも）を選ぶと🌱を全て除去し、同数の火炎を付ける。氷結中は最初のスタックで全解除。🌱が無ければ使えない', () => {
    const s = game();
    s.heartTurn = true; s.heartMagic = 20;
    s.board[5] = { player: '⭕', bind: 4, effects: [BUD, BUD, BUD] };
    s.board[11] = { player: '⭕', bind: 4, effects: [BUD, BUD, FRZ, FRZ] };
    s.board[9] = { player: '💙', bind: 4, effects: [BUD] };
    s.board[10] = { player: '⭕', bind: 4, effects: [] };
    const before = s.heartMagic;
    e.SKILLS.swidden(s);
    assert.strictEqual(s.heartMagic, before - 3);
    assert.strictEqual(e.placeMove(s, 10), false);  // 🌱の無いマスは選び直し
    assert.strictEqual(e.placeMove(s, 5), true);
    assert.strictEqual(budsOn(s.board[5]), 0);
    assert.strictEqual(flames(s.board[5]), 3);
    assert.strictEqual(s.heartTurn, true);
    e.SKILLS.swidden(s);
    assert.strictEqual(e.placeMove(s, 11), true);   // 氷結中: 1つ目で氷結が全解除、残り1つが🔥
    assert.strictEqual(frosts(s.board[11]), 0);
    assert.strictEqual(flames(s.board[11]), 1);
    e.SKILLS.swidden(s);
    assert.strictEqual(e.placeMove(s, 9), true);    // 自陣のマスも選べる
    assert.strictEqual(flames(s.board[9]), 1);
    const m = s.heartMagic;
    e.SKILLS.swidden(s);                             // もう🌱が無い → 不可（魔力も払わない）
    assert.strictEqual(s.heartMagic, m);
    assert.strictEqual(s.useSwidden, false);
    const th = require('../shared/thermal');
    const b = Array.from({ length: 16 }, () => ({ player: undefined, bind: 0, effects: [] }));
    assert.deepStrictEqual(th.swidden(b, 0, 4), { n: 0, thawed: [] });
});

test('殉火: 自コマのライフをゼロにして、ライフがそれ以下の敵コマ全て（ライフ0含む）に🔥を1つ。🔑・無敵は除く。対象0なら使えない。コスト5', () => {
    const s = game('you', 'electrician');
    s.heartTurn = true; s.heartMagic = 20;
    s.board[5] = { player: '💙', bind: 3, effects: [FLM] };                   // 犠牲にする自コマ（L=3）
    s.board[0] = { player: '⭕', bind: 3, effects: [] };                       // L以下 → 対象
    s.board[1] = { player: '⭕', bind: 0, effects: [] };                       // ライフ0も対象
    s.board[2] = { player: '⭕', bind: 4, effects: [] };                       // L超 → 対象外
    s.board[3] = { player: '⭕', bind: 2, effects: [{ effect: '🔑' }] };      // ロック → 対象外
    s.board[4] = { player: '⭕', bind: 1, effects: [{ effect: '⚡' }] };       // 巫の⚡無敵 → 対象外
    s.board[6] = { player: '⭕', bind: 2, effects: [FRZ] };                    // 氷結 → 解凍のみ
    s.board[7] = { player: '⭕', bind: 3, effects: [] };
    s.board[8] = { player: '⭕', bind: 3, effects: [FRZ] };                    // 7 に🔥が付くと隣の氷結が全解除
    const before = s.heartMagic;
    e.SKILLS.sacrifice(s);
    assert.strictEqual(s.heartMagic, before - 5);
    assert.strictEqual(e.placeMove(s, 0), false);                              // 自コマ以外は選べない
    assert.strictEqual(e.placeMove(s, 5), true);
    assert.strictEqual(s.board[5].bind, 0);
    assert.strictEqual(flames(s.board[5]), 0);                                 // 自コマの🔥は消える
    assert.strictEqual(flames(s.board[0]), 1);
    assert.strictEqual(s.board[1].player, undefined); assert.strictEqual(flames(s.board[1]), 0); // ライフ0の敵コマは🔥で破壊される
    assert.strictEqual(flames(s.board[2]), 0);
    assert.strictEqual(flames(s.board[3]), 0);
    assert.strictEqual(flames(s.board[4]), 0);
    assert.strictEqual(frosts(s.board[6]), 0); assert.strictEqual(flames(s.board[6]), 0); // 氷結中: 解凍のみで🔥は付かない
    assert.strictEqual(flames(s.board[7]), 1);
    assert.strictEqual(frosts(s.board[8]), 0);                                 // 隣に🔥が付いて解凍
    assert.strictEqual(s.heartTurn, true);
    // 条件を満たす自コマ／対象の敵が無ければ使えない
    const t = game();
    t.heartTurn = true; t.heartMagic = 20;
    t.board[5] = { player: '💙', bind: 3, effects: [] };
    t.board[0] = { player: '⭕', bind: 9, effects: [] };
    e.SKILLS.sacrifice(t);
    assert.strictEqual(t.heartMagic, 20);
    assert.strictEqual(t.useSacrifice, false);
    const th = require('../shared/thermal');
    const b = t.board.map((x) => ({ ...x, effects: x.effects.slice() }));
    const r = th.sacrificeFlame(b, 5, '💙', t.chars, 4);
    assert.deepStrictEqual(r, { threshold: 3, targets: [], thawed: [] });
    assert.strictEqual(th.canSacrifice(b[0], '💙'), false); // 敵のコマは犠牲にできない
});

test('火炎トークン/火炎ダブルトークン/焼畑/殉火のコスト（毒使い+1・軍師: トークン-1・他+2）', () => {
    const p = game('poisoner', 'you'); p.heartTurn = true; p.heartMagic = 30;
    e.SKILLS.flameToken(p);
    assert.strictEqual(p.heartMagic, 30 - 4);
    const t = game('tactician', 'you'); t.heartTurn = true; t.heartMagic = 30;
    e.SKILLS.flameToken(t);
    assert.strictEqual(t.heartMagic, 30 - 2);
    assert.strictEqual(e.skillCosts.onClickFlameToken, 3);
    assert.strictEqual(e.skillCosts.onClickDoubleFlameToken, 5);
    assert.strictEqual(e.skillCosts.onClickSwidden, 3);
    assert.strictEqual(e.skillCosts.onClickSacrifice, 5);
});


// ---- 氷結スキル群 idx41〜48 ----

test('範囲氷結: 中心と周囲8マスの canFreeze なマス（空きマス可）に❄+1。🔑・🔥のマスは飛ばす。作れた分だけ全席のカウンタ+1。コスト5', () => {
    const s = game();
    s.heartTurn = true; s.heartMagic = 20;
    s.board[5] = { player: '⭕', bind: 3, effects: [FRZ] };                 // 氷結済みにも重ねられる
    s.board[6] = { player: '⭕', bind: 3, effects: [{ effect: '🔑' }] };    // 🔑 → 付かない
    s.board[9] = { player: '⭕', bind: 3, effects: [FLM] };                 // 🔥 → 付かない
    const before = s.heartMagic;
    e.SKILLS.frostArea(s);
    assert.strictEqual(s.heartMagic, before - 5);
    assert.strictEqual(e.placeMove(s, 5), true);
    const fz = (i) => s.board[i].effects.filter((x) => x.effect === '❄').length;
    assert.strictEqual(fz(5), 2);
    assert.strictEqual(fz(6), 0); assert.strictEqual(fz(9), 0);
    for (const k of [0, 1, 2, 4, 8, 10]) assert.strictEqual(fz(k), 1, 'マス' + k);
    assert.strictEqual(fz(3) + fz(7) + fz(11) + fz(12) + fz(15), 0);       // 範囲外
    assert.deepStrictEqual(chargeOf(s), [7, 7]);                            // 5,0,1,2,4,8,10 の7マス
    assert.strictEqual(s.heartTurn, true);
});

test('氷柱: lineCells(row/col/diag/anti) の線の canFreeze なマス全部に❄+1。sim/geometry.js の lineCells は昇順', () => {
    assert.deepStrictEqual(geo4.lineCells(4, 5, 'row'), [4, 5, 6, 7]);
    assert.deepStrictEqual(geo4.lineCells(4, 5, 'col'), [1, 5, 9, 13]);
    assert.deepStrictEqual(geo4.lineCells(4, 5, 'diag'), [0, 5, 10, 15]);
    assert.deepStrictEqual(geo4.lineCells(4, 5, 'anti'), [2, 5, 8]);
    assert.deepStrictEqual(geo4.lineCells(4, 1, 'diag'), [1, 6, 11]);
    const s = game();
    s.heartTurn = true; s.heartMagic = 20;
    s.board[6] = { player: '⭕', bind: 3, effects: [{ effect: '🔑' }] };
    const before = s.heartMagic;
    e.SKILLS.icicle(s);
    assert.strictEqual(s.heartMagic, before - 6);
    e.exeIcicle(s, 5, 'row'); s.useIcicle = false;
    const fz = (i) => s.board[i].effects.filter((x) => x.effect === '❄').length;
    assert.deepStrictEqual([4, 5, 6, 7].map(fz), [1, 1, 0, 1]);              // 🔑のマスは飛ばす
    assert.deepStrictEqual(chargeOf(s), [3, 3]);
    e.exeIcicle(s, 5, 'diag');
    assert.deepStrictEqual([0, 5, 10, 15].map(fz), [1, 2, 1, 1]);
});

test('ランダム氷結: クリック不要。canFreeze なマスから重複なしにランダムな1〜4マスに❄+1（空きマス可）。コスト3', () => {
    const seen = new Set();
    for (let seed = 1; seed <= 40; seed++) {
        const s = e.newGame({ heartChar: 'you', circleChar: 'you', rng: e.makeRng(seed) });
        s.heartTurn = true; s.heartMagic = 20;
        s.board[0] = { player: '⭕', bind: 3, effects: [{ effect: '🔑' }] };
        e.SKILLS.randomFreeze(s);
        assert.strictEqual(s.heartMagic, 17);
        const n = s.board.reduce((a, sq) => a + sq.effects.filter((x) => x.effect === '❄').length, 0);
        const cells = s.board.filter((sq) => sq.effects.some((x) => x.effect === '❄')).length;
        assert.ok(n >= 1 && n <= 4 && n === cells, '重複なし 1〜4: ' + n);
        assert.strictEqual(s.board[0].effects.filter((x) => x.effect === '❄').length, 0);
        assert.deepStrictEqual(chargeOf(s), [n, n]);
        seen.add(n);
    }
    assert.ok(seen.size >= 3);
    const th = require('../shared/thermal');
    const b = Array.from({ length: 16 }, () => ({ player: undefined, bind: 0, effects: [] }));
    b[3] = { player: '⭕', bind: 1, effects: [FLM] };
    assert.ok(!th.randomFreezeCandidates(b).includes(3));
    assert.strictEqual(th.randomFreezeCandidates(b).length, 15);
});

test('氷結拡散: コマを選ぶと、コマだけを縦横に辿って届く全コマ（敵味方問わず）に❄+1。空きマスは起点にできない。コスト7', () => {
    const s = game();
    s.heartTurn = true; s.heartMagic = 20;
    for (const k of [0, 1, 5]) s.board[k] = { player: '⭕', bind: 3, effects: [] };
    s.board[2] = { player: '💙', bind: 3, effects: [] };
    s.board[15] = { player: '⭕', bind: 3, effects: [] };                 // 離れたコマ
    const before = s.heartMagic;
    e.SKILLS.freezeSpread(s);
    assert.strictEqual(s.heartMagic, before - 7);
    assert.strictEqual(e.placeMove(s, 10), false);                         // 空きマス → 再選択
    assert.strictEqual(e.placeMove(s, 0), true);
    const fz = (i) => s.board[i].effects.filter((x) => x.effect === '❄').length;
    assert.deepStrictEqual([0, 1, 2, 5].map(fz), [1, 1, 1, 1]);
    assert.strictEqual(fz(15), 0);
    assert.deepStrictEqual(chargeOf(s), [4, 4]);
});

test('氷結トークン/氷結ダブルトークン: 空きマスに❄付きの自陣コマを置く（トークン扱い）。コスト3/5、カウンタは1個ずつ', () => {
    const s = game();
    s.heartTurn = true; s.heartMagic = 20;
    const th = require('../shared/thermal');
    const b = [{ player: undefined, bind: 0, effects: [] }];
    assert.strictEqual(th.placeFrostToken(b, 0, '💙', 4), 1);
    assert.deepStrictEqual(b[0], { player: '💙', bind: 4, effects: [FRZ] });
    s.board[0] = { player: undefined, bind: 0, effects: [FRZ] };           // 凍った空きマスには置けない
    e.SKILLS.frostToken(s);
    assert.strictEqual(s.heartMagic, 17);
    const mine = s.board.filter((sq) => sq.player === '💙');
    assert.strictEqual(mine.length, 1);
    assert.strictEqual(mine[0].effects.length, 1);
    assert.strictEqual(mine[0].effects[0].effect, '❄');
    assert.strictEqual(s.usedTokenThisTurn, true);
    assert.deepStrictEqual(chargeOf(s), [1, 1]);
    const t = game();
    t.heartTurn = true; t.heartMagic = 20;
    e.SKILLS.doubleFrostToken(t);
    assert.strictEqual(t.heartMagic, 15);
    assert.strictEqual(t.board.filter((sq) => sq.player === '💙' && sq.effects.some((x) => x.effect === '❄')).length, 2);
    assert.deepStrictEqual(chargeOf(t), [2, 2]);
    const tac = game('tactician', 'you'); tac.heartTurn = true; tac.heartMagic = 20;
    e.SKILLS.frostToken(tac);
    assert.strictEqual(tac.heartMagic, 20 - 2);                              // 軍師はトークン-1
});

test('砕氷: 氷結中のコマ（敵味方どちらでも）の❄を全除去して❄1スタックにつき3ダメージ。0以下で破壊。氷結が作られないのでカウンタは増えない', () => {
    const th = require('../shared/thermal');
    const b = Array.from({ length: 16 }, () => ({ player: undefined, bind: 0, effects: [] }));
    b[0] = { player: '⭕', bind: 9, effects: [FRZ, FRZ, FLM] };
    assert.deepStrictEqual(th.shatter(b, 0), { stacks: 2, damage: 6, destroyed: false });
    assert.strictEqual(b[0].bind, 3);
    assert.strictEqual(b[0].effects.length, 0);                              // ❄全除去・ダメージが通って🔥も消える
    b[1] = { player: '⭕', bind: 6, effects: [FRZ, FRZ] };
    assert.deepStrictEqual(th.shatter(b, 1), { stacks: 2, damage: 6, destroyed: true });
    assert.deepStrictEqual(b[1], { player: undefined, bind: 0, effects: [] });
    assert.deepStrictEqual(th.shatter(b, 2), { stacks: 0, damage: 0, destroyed: false });  // 空きマス
    b[3] = { player: '⭕', bind: 4, effects: [] };
    assert.deepStrictEqual(th.shatter(b, 3), { stacks: 0, damage: 0, destroyed: false });  // 氷結していない
    const s = game();
    s.heartTurn = true; s.heartMagic = 20;
    s.board[5] = { player: '💙', bind: 5, effects: [FRZ] };                  // 自陣にも使える
    s.board[6] = { player: '⭕', bind: 4, effects: [] };
    e.SKILLS.shatter(s);
    assert.strictEqual(s.heartMagic, 16);
    assert.strictEqual(e.placeMove(s, 6), false);                            // 氷結していない → 再選択
    assert.strictEqual(e.placeMove(s, 5), true);
    assert.strictEqual(s.board[5].bind, 2);
    assert.deepStrictEqual(chargeOf(s), [0, 0]);
    const t = game();
    t.heartTurn = true; t.heartMagic = 20;
    e.SKILLS.shatter(t);                                                     // 氷結中のコマが無ければ使えない
    assert.strictEqual(t.heartMagic, 20);
});

test('霜降り: 自陣のライフ2以下（0含む）かつ canFreeze なコマすべてに❄+1。クリック不要。対象が0なら使えない。コスト3', () => {
    const th = require('../shared/thermal');
    const b = Array.from({ length: 16 }, () => ({ player: undefined, bind: 0, effects: [] }));
    b[0] = { player: '💙', bind: 2, effects: [] };
    b[1] = { player: '💙', bind: 0, effects: [] };
    b[2] = { player: '💙', bind: 3, effects: [] };
    b[3] = { player: '💙', bind: 1, effects: [FLM] };
    b[4] = { player: '💙', bind: 1, effects: [{ effect: '🔑' }] };
    b[5] = { player: '⭕', bind: 1, effects: [] };
    assert.deepStrictEqual(th.frostfallTargets(b, '💙'), [0, 1]);
    const s = game();
    s.heartTurn = true; s.heartMagic = 20;
    s.board = b.map((x) => ({ ...x, effects: x.effects.slice() }));
    e.SKILLS.frostfall(s);
    assert.strictEqual(s.heartMagic, 17);
    assert.deepStrictEqual([0, 1, 2, 5].map((i) => s.board[i].effects.length), [1, 1, 0, 0]);
    assert.deepStrictEqual(chargeOf(s), [2, 2]);
    assert.strictEqual(s.heartTurn, true);
    const t = game();
    t.heartTurn = true; t.heartMagic = 20;
    t.board[2] = { player: '💙', bind: 5, effects: [] };
    e.SKILLS.frostfall(t);
    assert.strictEqual(t.heartMagic, 20);
});

test('氷結スキル群のコスト表と絶対零度のカウンタへの寄与（作れなかったマスは数えない）', () => {
    assert.deepStrictEqual([e.skillCosts.onClickFrostArea, e.skillCosts.onClickIcicle, e.skillCosts.onClickRandomFreeze, e.skillCosts.onClickFreezeSpread, e.skillCosts.onClickFrostToken, e.skillCosts.onClickDoubleFrostToken, e.skillCosts.onClickShatter, e.skillCosts.onClickFrostfall], [5, 6, 3, 7, 3, 5, 4, 3]);
    const keys = Object.keys(e.skillCosts);
    assert.deepStrictEqual(keys.slice(keys.indexOf('onClickSacrifice')), ['onClickSacrifice', 'onClickFrostArea', 'onClickIcicle', 'onClickRandomFreeze', 'onClickFreezeSpread', 'onClickFrostToken', 'onClickDoubleFrostToken', 'onClickShatter', 'onClickFrostfall', 'onClickBoost', 'onClickClone', 'onClickPlunder', 'onClickMarkdown', 'onClickEffectDiscount', 'onClickTokenDiscount', 'onClickVitalMarkdown', 'onClickUniqueDiscount', 'onClickClearance', 'onClickRandomCast', 'onClickCounterMarkdown', 'onClickBurnout', 'onClickLeafToken', 'onClickTwinLeafToken', 'onClickDoubleLeafToken', 'onClickLeafAll', 'onClickBonfire', 'onClickMulch', 'onClickAutumn', 'onClickLeafFrost', 'onClickSpringWind', 'onClickKimon', 'onClickFireWheel', 'onClickStrip', 'onClickChargeSeason', 'onClickBristle', 'onClickRelease', 'onClickStash', 'onClickThunderFire', 'onClickDarkPot', 'onClickChargeHeal', 'onClickLeafDrop', 'onClickKindling', 'onClickLeafCloak', 'onClickTinder', 'onClickSmallFry', 'onClickFirstFrost', 'onClickGather', 'onClickBurnOff', 'onClickFreeToken', 'onClickSpark', 'onClickNightVeil', 'onClickGraveDiscount', 'onClickPoisonWard', 'onClickGraveOffering', 'onClickPerfectGame', 'onClickHelper', 'onClickSecondCatch', 'onClickBigTree', 'onClickDeadTree', 'onClickSpring', 'onClickFort', 'onClickThundercloud', 'onClickMarket', 'onClickSanctuary', 'onClickPoisonSwamp', 'onClickBoltSilence', 'onClickDemolish', 'onClickWeather', 'onClickLevelAll', 'onClickReinforce', 'onClickExpandAll', 'onClickDuplicate', 'onClickWorkshop', 'onClickBarrierStone', 'onClickAmuletShrine', 'onClickLuckyCat', 'onClickMudField', 'onClickTongueKing', 'onClickEightTrigrams', 'onClickSoloSign', 'onClickOneWord', 'onClickBlindMonkey', 'onClickLockRaid', 'onClickLockExtend', 'onClickLockBlessing', 'onClickVacantSeal']);
});




test('業火: 1手番に異なるスキルを3種類使うと無料権が付く（同じスキルの連打は1種類）。手番を跨いで持ち越し、撃つとリセット', () => {
    const s = game('pyromancer', 'you');
    s.heartTurn = true; s.heartMagic = 30;
    for (let i = 1; i < 6; i++) s.board[i] = { player: '⭕', bind: 5, effects: [] };
    const base = e.infernoCost(s);
    assert.strictEqual(base, 7);
    for (let i = 0; i < 5; i++) e.spendMagic(s, 1, 'onClickWindborne'); // 同じスキルは何度撃っても1種類
    e.spendMagic(s, 1, 'onClickSolstice');
    assert.strictEqual(e.infernoCost(s), base);
    e.spendMagic(s, 1, 'onClickInferno'); // 業火自身は数えない
    assert.strictEqual(e.infernoCost(s), base);
    e.spendMagic(s, 1, 'onClickCleanse');
    assert.strictEqual(e.infernoCost(s), 0);
    // 手番を跨いでも持ち越す
    e.SKILLS.charge(s);
    e.SKILLS.charge(s);
    assert.strictEqual(s.heartTurn, true);
    assert.strictEqual(e.infernoCost(s), 0);
    const before = s.heartMagic;
    e.SKILLS.inferno(s);
    assert.strictEqual(s.heartMagic, before); // 無料
    assert.strictEqual(e.infernoCost(s), base); // 撃ったのでリセット
    e.spendMagic(s, 0, 'onClickWindborne');
    e.spendMagic(s, 0, 'onClickSolstice');
    assert.strictEqual(e.infernoCost(s), base); // リセット後は再び3種類必要
    e.spendMagic(s, 0, 'onClickCleanse');
    assert.strictEqual(e.infernoCost(s), 0);
});

test('コスト軽減スキル: 次に打つスキル-3は軽減札でないスキルで消費され、下限は1。手番を跨がない', () => {
    const s = game('magician', 'you');
    s.heartTurn = true; s.heartMagic = 30; s.life = 3;
    const bud = () => e.calculateCost(s, e.skillCosts.onClickBuds, false, false, 'onClickBuds');
    const base = bud();
    e.SKILLS.markdown(s);
    assert.strictEqual(bud(), Math.max(1, base - 3));
    e.SKILLS.clearance(s); // 足し算（-3 + -7）
    assert.strictEqual(bud(), 1);
    e.spendMagic(s, 0, 'onClickBuds'); // 軽減札でないスキルで消える
    assert.strictEqual(bud(), base);
    e.SKILLS.markdown(s);
    e.SKILLS.charge(s); e.SKILLS.charge(s); // 手番を跨ぐと消える
    assert.strictEqual(bud(), base);
});

test('コスト軽減スキル: エフェクト付与/トークン/固有の永続軽減。固有割引は1ターン1度でライフ-1、活力特売はライフ+1', () => {
    const s = game('pyromancer', 'you');
    s.heartTurn = true; s.heartMagic = 40; s.life = 3;
    const freeze = () => e.calculateCost(s, e.skillCosts.onClickFreeze, false, false, 'onClickFreeze');
    const token = () => e.calculateCost(s, e.skillCosts.onClickToken, true, false, 'onClickToken');
    const slash = () => e.calculateCost(s, e.skillCosts.onClickSlash, false, false, 'onClickSlash');
    const [f0, t0, sl0, inf0] = [freeze(), token(), slash(), e.infernoCost(s)];
    e.SKILLS.effectDiscount(s); e.SKILLS.tokenDiscount(s);
    assert.strictEqual(freeze(), f0 - 1); assert.strictEqual(token(), t0 - 1); assert.strictEqual(slash(), sl0);
    e.spendMagic(s, 0, 'onClickFreeze');
    assert.strictEqual(freeze(), f0 - 1); // 永続（そのターン中は打つたびに効く）
    e.SKILLS.uniqueDiscount(s);
    assert.strictEqual(s.life, 2);
    assert.strictEqual(e.infernoCost(s), 0); // 付与割引・トークン割引・固有割引の3種類で業火の無料権が付く（inf0=7のはず）
    assert.strictEqual(inf0, 7);
    const m = s.heartMagic;
    e.SKILLS.uniqueDiscount(s); // 1ターンに一度だけ
    assert.strictEqual(s.heartMagic, m); assert.strictEqual(s.life, 2);
    e.SKILLS.vitalMarkdown(s);
    assert.strictEqual(s.life, 3);
    const low = game('magician', 'you');
    low.heartTurn = true; low.heartMagic = 10; low.life = 1;
    e.SKILLS.uniqueDiscount(low); // ライフ1では使えない
    assert.strictEqual(low.heartMagic, 10);
});




test('返し特売: 直前の相手の手番に相手がスキルを使っていれば0コスト。次のスキル-3・ライフ+1', () => {
    const s = game('magician', 'you');
    s.heartTurn = true; s.heartMagic = 10; s.life = 3;
    const cost = () => e.calculateCost(s, e.skillCosts.onClickCounterMarkdown, false, false, 'onClickCounterMarkdown');
    assert.strictEqual(cost(), 2); // 相手がスキルを使っていない
    e.SKILLS.charge(s); // 席0 → 席1（席1の手番の頭）
    e.spendMagic(s, 1, 'onClickBuds'); // 席1（相手）がスキルを使う
    e.SKILLS.charge(s); // 席1 → 席0
    assert.strictEqual(s.heartTurn, true);
    assert.strictEqual(cost(), 0);
    const m = s.heartMagic, life = s.life;
    e.SKILLS.counterMarkdown(s);
    assert.strictEqual(s.heartMagic, m);
    assert.strictEqual(s.life, life + 1);
    assert.strictEqual(e.calculateCost(s, 6, false, false, 'onClickStomp'), 3); // 次のスキル-3
    e.SKILLS.charge(s); e.SKILLS.charge(s); // 相手はスキルを使わなかったので次は有料
    assert.strictEqual(cost(), 2);
});


test('煉獄の鍛冶師のパッシブ: 🔥を付与するスキルは常に-1（下限1）。業火や他のスキルは変わらない。他キャラは変わらない', () => {
    const p = game('pyromancer', 'you');
    p.heartTurn = true;
    const c = (s, k, tok = false) => e.calculateCost(s, e.skillCosts[k], tok, false, k);
    const y = game('magician', 'you');
    y.heartTurn = true;
    for (const [k, tok] of [['onClickIgnite', false], ['onClickFlameToken', true], ['onClickDoubleFlameToken', true], ['onClickSacrifice', false], ['onClickSwidden', false]]) {
        assert.strictEqual(c(p, k, tok), Math.max(1, e.skillCosts[k] - 1), k);
        assert.strictEqual(c(y, k, tok), e.skillCosts[k], k);
    }
    assert.strictEqual(c(p, 'onClickFreeze'), e.skillCosts.onClickFreeze); // 氷結は対象外
    assert.strictEqual(e.infernoCost(p), 7); // 業火は固有スキルなので対象外
    e.SKILLS.markdown(p); // 軽減札とは足し算（下限1）
    assert.strictEqual(c(p, 'onClickIgnite'), Math.max(1, e.skillCosts.onClickIgnite - 1 - 3));
});



test('火遁: 空きマスにも🔥を置ける。空きマスの🔥は、そこに置かれたコマ（誰のコマでも）に引き継がれる', () => {
    const s = game();
    s.heartTurn = true; s.heartMagic = 20;
    e.SKILLS.ignite(s);
    assert.strictEqual(e.placeMove(s, 7), true); // 空きマスを選べる
    assert.strictEqual(s.useIgnite, false);
    assert.strictEqual(s.board[7].player, undefined);
    assert.strictEqual(s.board[7].effects.filter((x) => x.effect === '🔥').length, 1);
    // その空きマスにコマを置くと🔥が引き継がれる
    const owner = s.turn;
    assert.strictEqual(e.placeMove(s, 7), true);
    assert.strictEqual(s.board[7].player, e.SYMBOLS[owner]);
    assert.strictEqual(s.board[7].effects.filter((x) => x.effect === '🔥').length, 1);
});
