// @ts-check
'use strict';
// sim/engine.test.js から読み込まれるテスト（共有の道具は ../testkit.js）
const { assert, e, test, game, FRZ, FLM } = require('../testkit');

// ---- ❄氷結 / 🔥火炎 (sim/thermal.js, src/components/game/thermal.ts) ----

test('氷結: ターン進行（自然減衰）でライフが減らない', () => {
    const s = game();
    s.heartTurn = true; s.life = 3;
    s.board[5] = { player: '⭕', bind: 4, effects: [FRZ] };
    s.board[6] = { player: '⭕', bind: 4, effects: [] };
    e.placeMove(s, 0);
    assert.strictEqual(s.board[5].bind, 4);
    assert.strictEqual(s.board[6].bind, 3);
});

test('氷結中の毒は休眠: 継続ダメージを与えず、消えずに残る。解凍すると再び働く', () => {
    const s = game();
    s.heartTurn = true; s.life = 3;
    s.board[5] = { player: '⭕', bind: 5, effects: [FRZ, { effect: '☠' }, { effect: '☠' }] };
    s.board[6] = { player: '⭕', bind: 5, effects: [{ effect: '☠' }] };
    e.placeMove(s, 0);
    assert.strictEqual(s.board[5].bind, 5); // 自然減衰も毒もなし
    assert.strictEqual(s.board[5].effects.filter((x) => x.effect === '☠').length, 2);
    assert.strictEqual(s.board[6].bind, 5 - 1 - 1);
    // 毒の数に依存する処理も数えない（毒使いのライフ加算・ミアズマの軽減と対象）
    const th = require('../shared/thermal');
    assert.strictEqual(th.applyDamage({ player: '⭕', bind: 5, effects: [FRZ] }, 2, 'poison').dealt, 2); // ダメージ種別の関数自体は従来どおり貫通
    const p = game('poisoner', 'you');
    p.heartTurn = true;
    p.board[1] = { player: '💙', bind: 4, effects: [FRZ, { effect: '☠' }, { effect: '☠' }] };
    p.board[2] = { player: '💙', bind: 4, effects: [{ effect: '☠' }] };
    assert.strictEqual(e.miasmaCost(p), Math.max(1, e.calculateCost(p, 6 - 1, false, true)));
    p.board[5] = { player: '⭕', bind: 4, effects: [] }; // 1 の隣(斜め含む)
    assert.strictEqual(e.miasmaPlan(p).size >= 0, true);
    assert.strictEqual(e.boardPoisonCount(p.board), 1);
    const mp = e.miasmaPlan(p, '💙');
    p.board[1] = { player: '💙', bind: 4, effects: [FRZ, { effect: '☠' }] };
    p.board[2] = { player: '💙', bind: 4, effects: [FRZ, { effect: '☠' }] };
    assert.strictEqual(e.miasmaPlan(p, '💙').size, 0); // 毒マスがすべて氷結中なら撒く先が無い
    assert.ok(mp.size >= 0);
});

test('氷結: 隣接⚡（発火）のダメージを受けない（氷結は残る）。⚡マス自体は発火して消える', () => {
    const s = game();
    s.heartTurn = true; s.life = 3;
    s.board[5] = { player: '⭕', bind: 4, effects: [{ effect: '⚡' }] };
    s.board[6] = { player: '⭕', bind: 4, effects: [FRZ] };
    s.board[9] = { player: '⭕', bind: 4, effects: [] };
    e.placeMove(s, 4); // ⚡マス5の隣に着手 → 5の縦横隣(6,9)に1ダメージのはずが、氷結の6は無傷
    assert.strictEqual(s.board[6].bind, 4);
    assert.ok(s.board[6].effects.some((x) => x.effect === '❄'));
    assert.strictEqual(s.board[9].bind, 4 - 1 - 1);
    assert.strictEqual(e.chargeStacks(s.board[5]), 0);
});

test('氷結: 氷結中のマスの⚡は休眠（発火せず⚡も残る）。ジャマーの起点にもできず、対象にもならない', () => {
    const s = game('electrician', 'you');
    s.heartTurn = true; s.life = 3; s.heartMagic = 20;
    s.board[5] = { player: '⭕', bind: 4, effects: [{ effect: '⚡' }, FRZ] };
    s.board[9] = { player: '⭕', bind: 4, effects: [] };
    e.placeMove(s, 4); // 休眠中の⚡の隣に着手しても発火しない
    assert.strictEqual(e.chargeStacks(s.board[5]), 1);
    assert.strictEqual(s.board[9].bind, 4 - 1);
    const t = game('electrician', 'you');
    t.heartTurn = true; t.heartMagic = 20;
    t.board[5] = { player: undefined, bind: 0, effects: [{ effect: '⚡' }] };
    t.board[4] = { player: '⭕', bind: 3, effects: [FRZ] };
    t.board[6] = { player: '⭕', bind: 3, effects: [] };
    e.SKILLS.jammer(t);
    e.placeMove(t, 5);
    assert.strictEqual(t.board[4].bind, 3); // 氷結は電気を受けない
    assert.strictEqual(t.board[6].bind, 2);
    const u = game('electrician', 'you');
    u.heartTurn = true; u.heartMagic = 20;
    u.board[5] = { player: '💙', bind: 3, effects: [{ effect: '⚡' }, FRZ] };
    e.SKILLS.jammer(u);
    assert.strictEqual(e.placeMove(u, 5), false); // 氷結中の⚡は起点にできない
});

test('氷結: オピウムは氷結が身代わりになる（ライフはそのまま・氷結は解除）', () => {
    const s = game();
    s.heartTurn = true; s.heartMagic = 20;
    s.board[5] = { player: '⭕', bind: 4, effects: [FRZ] };
    s.board[6] = { player: '⭕', bind: 4, effects: [] };
    e.SKILLS.opium(s);
    assert.strictEqual(s.board[5].bind, 4);
    assert.ok(!s.board[5].effects.some((x) => x.effect === '❄'));
    assert.strictEqual(s.board[6].bind, 2);
});

test('氷結: スラッシュ・ストンプ・式神の爆破は氷結が身代わりになる（審判の日は氷結ごと破壊する）', () => {
    const anti = e.newGame({ heartChar: 'you', circleChar: 'you', rng: e.makeRng(1) });
    const idx = require('../shared/boardGeometry').geometryOf(anti.size).antiDiagonal[1];
    anti.heartTurn = true; anti.heartMagic = 20;
    anti.board[idx] = { player: '⭕', bind: 4, effects: [FRZ] };
    e.SKILLS.slash(anti);
    assert.strictEqual(anti.board[idx].bind, 4);
    assert.strictEqual(anti.board[idx].effects.length, 0);

    const g = game('giant', 'you');
    g.heartTurn = true; g.heartMagic = 20; g.life = 5;
    g.board[5] = { player: '⭕', bind: 4, effects: [FRZ] };
    g.board[6] = { player: '⭕', bind: 4, effects: [] };
    e.SKILLS.stomp(g);
    e.placeMove(g, 6);
    assert.strictEqual(g.board[5].player, '⭕'); // 生き残る
    assert.strictEqual(g.board[5].effects.length, 0);
    assert.strictEqual(g.board[6].player, '💙');   // 氷結なしの隣は壊れて中心は自分のコマに

    const m = game('magician', 'you');
    m.heartTurn = true; m.heartMagic = 30;
    m.board[5] = { player: '⭕', bind: 4, effects: [FRZ] };
    e.SKILLS.judgeDay(m);
    e.placeMove(m, 5); // 中心が氷結の敵コマ → 審判の日は氷結ごと破壊し(全エフェクト-99→99ダメージ)、中心は自分のコマ
    assert.strictEqual(m.board[5].player, '💙');

    const y = game('yinYangMaster', 'you');
    y.heartTurn = true; y.heartMagic = 30; y.yy[0] = 'yang';
    y.board[0] = e.newShikigami('💙');
    y.board[1] = { player: '⭕', bind: 2, effects: [FRZ] };
    y.board[4] = { player: '⭕', bind: 2, effects: [] };
    e.SKILLS.shikigamiBlast(y);
    e.placeMove(y, 0);
    assert.strictEqual(y.board[1].player, '⭕');
    assert.strictEqual(y.board[1].bind, 2);
    assert.strictEqual(y.board[4].player, undefined); // 氷結なしは破壊
});

test('氷結: 自陣の氷結コマには重ねて強化できない。氷室の番人でも同じ。敵が奪う/破壊すれば氷結は消える', () => {
    const s = game();
    s.heartTurn = true; s.life = 3;
    s.board[5] = { player: '💙', bind: 4, effects: [FRZ] };
    assert.strictEqual(e.placeMove(s, 5), false);
    assert.strictEqual(s.board[5].bind, 4);

    const c = game('cryomancer', 'you');
    c.heartTurn = true; c.life = 3;
    c.board[5] = { player: '💙', bind: 4, effects: [FRZ] };
    assert.strictEqual(e.placeMove(c, 5), false); // 氷室の番人の例外は廃止
    assert.strictEqual(c.board[5].bind, 4);

    const t = game('giant', 'you');
    t.heartTurn = true; t.life = 8;
    t.board[5] = { player: '⭕', bind: 2, effects: [FRZ] };
    e.placeMove(t, 5); // 巨人が殴って奪取
    assert.strictEqual(t.board[5].player, '💙');
    assert.strictEqual(t.board[5].effects.length, 0);
});

test('氷結はスタックする: スキルダメージ・破壊は❄を1つ外すだけ。発火は全部解く', () => {
    const s = game();
    s.heartTurn = true; s.heartMagic = 20;
    s.board[5] = { player: '⭕', bind: 4, effects: [FRZ, FRZ] };
    e.SKILLS.opium(s);
    assert.strictEqual(s.board[5].bind, 4);
    assert.strictEqual(s.board[5].effects.filter((x) => x.effect === '❄').length, 1);
    const t = game();
    t.heartTurn = true; t.heartMagic = 20;
    t.board[5] = { player: '⭕', bind: 4, effects: [FRZ, FRZ, FRZ] };
    t.board[6] = { player: '⭕', bind: 4, effects: [] };
    e.SKILLS.ignite(t);
    e.placeMove(t, 6); // 非氷結の隣に🔥が付く → 隣の氷結は全スタック解除
    assert.ok(!t.board[5].effects.some((x) => x.effect === '❄'));
    const u = game();
    u.board[5] = { player: '⭕', bind: 4, effects: [FRZ, FRZ] };
    const th = require('../shared/thermal');
    assert.strictEqual(th.frozenStacks(u.board[5]), 2);
    assert.strictEqual(th.frozenStacks(th.thawOne(u.board[5])), 1);
    assert.strictEqual(th.frozenStacks(th.thaw(u.board[5])), 0);
});

test('氷結中のマスにはロックが掛からない（ロック系スキルの対象にもできない）', () => {
    const s = game();
    s.heartTurn = true; s.heartMagic = 20;
    s.board[5] = { player: '💙', bind: 4, effects: [FRZ] };
    e.SKILLS.lock(s);
    assert.strictEqual(e.placeMove(s, 5), false);
    assert.ok(!s.board[5].effects.some((x) => x.effect === '🔑'));
    assert.strictEqual(s.useLock, 1);
});

test('氷室の番人: ライフ平均は4で、自陣の❄によるライフ加算は無い', () => {
    const mean = (board) => {
        let sum = 0;
        for (let k = 0; k < 200; k++) {
            const g = game('you', 'cryomancer');
            g.rng = e.makeRng(100 + k);
            g.board = board.map((x) => ({ ...x, effects: x.effects.slice() }));
            g.heartTurn = true; g.life = 3;
            e.placeMove(g, 15); // 次は⭕(氷室の番人)の手番 → ライフ抽選
            sum += g.life;
        }
        return sum / 200;
    };
    const plain = Array.from({ length: 16 }, () => ({ player: undefined, bind: 0, effects: [] }));
    const icy = plain.map((x, k) => (k < 6 ? { player: '⭕', bind: 3, effects: [FRZ, FRZ, FRZ, FRZ] } : x));
    assert.ok(Math.abs(mean(plain) - 4) < 1, 'plain ' + mean(plain));
    assert.ok(Math.abs(mean(icy) - 4) < 1, 'icy ' + mean(icy)); // ❄24個でも加算なし
    assert.strictEqual(require('../shared/util').LIFE_MEANS.cryomancer, 4);
});

test('氷結は🔥のあるマスには付かない（空きマス・氷結済みへの重ね掛けは可）。freezeAll も🔥マスを飛ばす', () => {
    const th = require('../shared/thermal');
    const b = Array.from({ length: 16 }, () => ({ player: undefined, bind: 0, effects: [] }));
    b[1] = { player: '⭕', bind: 3, effects: [FLM] };
    b[2] = { player: '⭕', bind: 3, effects: [FRZ] };
    b[3] = { player: '⭕', bind: 3, effects: [{ effect: '🔑' }] };
    assert.strictEqual(th.canFreeze(b[1]), false);
    assert.strictEqual(th.canFreeze(b[2]), true);
    assert.strictEqual(th.canFreeze(b[0]), true);
    assert.strictEqual(th.canFreeze(b[3]), false);
    const done = th.freezeAll(b);
    assert.ok(!done.includes(1) && !done.includes(3));
    assert.strictEqual(b[1].effects.length, 1);
    // 氷結スキルの対象選択でも🔥のマスは選べない
    const s = game();
    s.heartTurn = true; s.heartMagic = 20;
    s.board[5] = { player: '⭕', bind: 3, effects: [FLM] };
    e.SKILLS.freeze(s);
    assert.strictEqual(e.placeMove(s, 5), false);
    assert.strictEqual(s.useFreeze, true);
});

test('氷室の番人でも、ライフが残る敵の氷結マスをクリックしても解除できない（旧パッシブ廃止）。ライフ0なら通常どおり奪う', () => {
    const s = game('cryomancer', 'you');
    s.heartTurn = true; s.life = 9;
    s.board[5] = { player: '⭕', bind: 4, effects: [FRZ, FRZ] };
    assert.strictEqual(e.placeMove(s, 5), false);
    assert.strictEqual(s.board[5].effects.length, 2);
    const t = game('cryomancer', 'you');
    t.heartTurn = true; t.life = 3;
    t.board[5] = { player: '⭕', bind: 0, effects: [FRZ] };
    e.placeMove(t, 5);
    assert.strictEqual(t.board[5].player, '💙');
});

test('浄化: 自陣のコマの☠🔥❄⚡を全スタック除去。🌱・🔑は残し、敵と空きマスは不変。手番は続きコスト5', () => {
    const s = game();
    s.heartTurn = true; s.heartMagic = 20;
    s.board[1] = { player: '💙', bind: 4, effects: [{ effect: '☠' }, { effect: '☠' }, FLM, FRZ, FRZ, { effect: '⚡' }, { effect: '🌱' }, { effect: '🔑' }] };
    s.board[2] = { player: '💙', bind: 3, effects: [{ effect: '🌱' }] };
    s.board[3] = { player: '⭕', bind: 3, effects: [{ effect: '☠' }, FLM, FRZ, { effect: '⚡' }] };
    s.board[4] = { player: undefined, bind: 0, effects: [FRZ, { effect: '⚡' }] };
    const before = s.heartMagic;
    e.SKILLS.cleanse(s);
    assert.deepStrictEqual(s.board[1].effects.map((x) => x.effect).sort(), ['🌱', '🔑'].sort());
    assert.deepStrictEqual(s.board[2].effects.map((x) => x.effect), ['🌱']);
    assert.strictEqual(s.board[3].effects.length, 4);
    assert.strictEqual(s.board[4].effects.length, 2);
    assert.strictEqual(s.heartMagic, before - 5);
    assert.strictEqual(s.heartTurn, true);
    assert.strictEqual(e.hasAilment(s.board, '💙'), false);
    const m = s.heartMagic;
    e.SKILLS.cleanse(s); // 状態異常が無ければ不発（魔力を払わない）
    assert.strictEqual(s.heartMagic, m);
});

test('浄化のコスト: 毒使い+1・軍師+2の通常補正', () => {
    const p = game('poisoner', 'you'); p.heartTurn = true; p.heartMagic = 20;
    p.board[1] = { player: '💙', bind: 4, effects: [FRZ] };
    e.SKILLS.cleanse(p);
    assert.strictEqual(p.heartMagic, 20 - 6);
    const t = game('tactician', 'you'); t.heartTurn = true; t.heartMagic = 20;
    t.board[1] = { player: '💙', bind: 4, effects: [FRZ] };
    e.SKILLS.cleanse(t);
    assert.strictEqual(t.heartMagic, 20 - 7);
});
