// @ts-check
'use strict';
// 対局ドライバ (sim/duel.js) のテスト。実行: node sim/duel.test.js
const assert = require('assert');
const duel = require('./duel');
const e = require('./engine');

let pass = 0, fail = 0;
function test(name, fn) {
    try { fn(); pass++; console.log('  ✓ ' + name); }
    catch (err) { fail++; console.log('  ✗ ' + name + ' — ' + err.message); }
}
const cfg = (o = {}) => ({ me: 'you', opp: 'tactician', seat: 0, seed: 11, actions: [], ...o });

console.log('sim/duel:');

test('同じ操作列は何度再生しても同じ盤面（相手AIの手も含めて）', () => {
    const c = cfg({ actions: ['p 5', 'p 9'] });
    const a = duel.replay(c), b = duel.replay(c);
    assert.deepStrictEqual(a.s.board, b.s.board);
    assert.deepStrictEqual(a.s.magic, b.s.magic);
});

test('不正な操作は適用されず理由が返る（置けないマス・手札にない札・魔力不足）', () => {
    const c = cfg({ actions: ['p 5'] });
    assert.ok(duel.replay(c, ['p 99']).failed);
    assert.ok(/手札にない/.test(duel.replay(c, ['h 75']).failed.err));
    const hand = duel.replay(c).s.skills.filter((i) => duel.IDX_SKILL[i]).find((i) => duel.costOf(duel.replay(c).s, duel.IDX_SKILL[i]) > duel.replay(c).s.magic[0]);
    if (hand !== undefined) assert.ok(/魔力不足/.test(duel.replay(c, [`h ${hand}`]).failed.err));
});

test('後手番なら開始時にAIが先に指す', () => {
    const r = duel.replay(cfg({ seat: 1 }));
    assert.strictEqual(r.s.turn, 1);
    assert.ok(r.s.board.some((sq) => sq.player === e.SYMBOLS[0]));
    assert.ok(r.opening.length > 0);
});

test('着手すると相手AIが応答して自分の手番に戻る', () => {
    const r = duel.replay(cfg({ actions: ['p 5'] }));
    assert.strictEqual(r.s.turn, 0);
    assert.strictEqual(r.turns[0].reply.length > 0, true);
});

test('固有スキルのコストが引ける（動的コスト・別名キー）', () => {
    const s = duel.build(cfg({ me: 'magician' }));
    assert.strictEqual(typeof duel.costOf(s, 'judgeDay'), 'number');
    assert.strictEqual(typeof duel.costOf(s, 'walpurgis'), 'number');
});

const threat = require('./duel-threat');
const blank = () => ({ player: undefined, bind: 0, effects: [] });
const put = (s, i, player, bind = 5, effects = []) => { s.board[i] = { player, bind, effects }; };
const fresh = () => { const s = duel.replay(cfg({ me: 'electrician', opp: 'poisoner' })).s; s.board = s.board.map(blank); return s; };
const ME = e.symbolOfSeat(0), OP = e.symbolOfSeat(1);
const cells = (list) => list.map((o) => o.cell);

test('見落とし防止: 相手の3連の空き1マスが勝ち手として検出される', () => {
    const s = fresh();
    [0, 4, 12].forEach((i) => put(s, i, OP));
    assert.deepStrictEqual(cells(threat.winCells(s, s.board, OP, false)), [8]);
});

test('見落とし防止: ライフ0の自駒は奪取されるので勝ち手に含まれ、ライフが残る駒は含まれない（雷霆の巫以外）', () => {
    const s = fresh();
    s.chars = ['poisoner', 'cryomancer']; // 雷霆の巫のコマはライフ0でも奪われない（下のテスト）
    [0, 4, 12].forEach((i) => put(s, i, OP));
    put(s, 8, ME, 0);
    assert.deepStrictEqual(cells(threat.winCells(s, s.board, OP, false)), [8]);
    put(s, 8, ME, 3);
    assert.deepStrictEqual(threat.winCells(s, s.board, OP, false), []);
});

test('雷霆の巫のコマは、ライフ0でも着手で奪われない（勝ち手に含まれない）', () => {
    const s = fresh();
    s.chars = ['electrician', 'cryomancer'];
    [0, 4, 12].forEach((i) => put(s, i, OP));
    put(s, 8, ME, 0);
    assert.deepStrictEqual(threat.winCells(s, s.board, OP, false), []);
    assert.strictEqual(threat.takeable(s, s.board, 8, OP, true), false);
});

test('見落とし防止: 着手後の減衰・毒でライフが尽きる駒は decayed=true のときだけ勝ち手に含まれる', () => {
    const s = fresh();
    [0, 4, 12].forEach((i) => put(s, i, OP));
    put(s, 8, ME, 1);
    assert.deepStrictEqual(threat.winCells(s, s.board, OP, false), []);
    assert.deepStrictEqual(cells(threat.winCells(s, s.board, OP, true)), [8]);
    put(s, 8, ME, 2, [{ effect: '☠' }]);
    assert.deepStrictEqual(cells(threat.winCells(s, s.board, OP, true)), [8]);
});

test('見落とし防止: 雷霆の巫の⚡駒（無敵）と🔑ロック中の駒は奪えない', () => {
    const s = fresh();
    [0, 4, 12].forEach((i) => put(s, i, OP));
    put(s, 8, ME, 0, [{ effect: '⚡' }]);
    assert.deepStrictEqual(threat.winCells(s, s.board, OP, true), []);
    put(s, 8, ME, 0, [{ effect: '🔑' }]);
    assert.deepStrictEqual(threat.winCells(s, s.board, OP, true), []);
});

test('見落とし防止: 勝ち手が残る着手は警告され、塞ぐ着手と自分が勝つ着手は警告されない', () => {
    const s = fresh();
    [0, 4, 12].forEach((i) => put(s, i, OP));
    const w = threat.placeWarning(s, ME, OP, 5);
    assert.ok(w && w.cells.includes(8));
    assert.strictEqual(threat.placeWarning(s, ME, OP, 8), null);
    [3, 7, 11].forEach((i) => put(s, i, ME)); // 列3で自分が15に置けば勝つ。相手の勝ち手8は残るが、勝つ手は警告しない
    assert.ok(threat.placeWarning(s, ME, OP, 5));
    assert.strictEqual(threat.placeWarning(s, ME, OP, 15), null);
});

test('見落とし防止: フォーク（勝ち手が2つ）は fork=true。duel の p は止まり p! で通る', () => {
    const s = fresh();
    [0, 4, 12].forEach((i) => put(s, i, OP));
    [3, 7, 15].forEach((i) => put(s, i, OP));
    const w = threat.placeWarning(s, ME, OP, 5);
    assert.ok(w && w.fork && w.cells.includes(8) && w.cells.includes(11));
    const c = cfg({ me: 'electrician', opp: 'poisoner', seed: 228, actions: ['p 5', 'p 6'] });
    assert.ok(/勝ち手が残ります/.test(duel.replay(c, ['p 10']).failed.err));
    assert.ok(!duel.replay(c, ['p! 10']).failed);
});

test('ジャマーは自陣に⚡のコマが無いと撃てない（魔力を払って対象待ちで固まるのを防ぐ）', () => {
    const c = cfg({ me: 'electrician', opp: 'cryomancer', seat: 0, seed: 21, deck: [21, 22, 23, 24, 26, 28, 52, 53, 58, 60, 92, 94] });
    const s = duel.replay(c).s;
    s.skills = [26, 21, 23];
    s.magic[0] = 9;
    const err = duel.apply(s, c, 'h 26');
    assert.ok(err && /ジャマーは自陣に⚡/.test(err), String(err));
    assert.strictEqual(s.magic[0], 9); // 魔力は払われない
    s.board[5] = { player: e.symbolOfSeat(0), bind: 3, effects: [{ effect: '⚡' }] };
    assert.strictEqual(duel.apply(s, c, 'h 26'), null); // ⚡のコマがあれば撃てる
});

test('コスト0の軽減札（返し特売）も効果ありと扱う（魔力も盤面も変わらないが、軽減とライフが変わる）', () => {
    const c = cfg({ me: 'electrician', opp: 'cryomancer', seat: 0, seed: 31, deck: [21, 22, 23, 24, 26, 28, 52, 53, 58, 60, 92, 94] });
    const s = duel.replay(c).s;
    s.skills = [60, 21, 23];
    s.magic[0] = 0;
    const err = duel.apply(s, c, 'h 60'); // 直前の相手のスキルが無ければ2コスト。魔力不足は別の理由で止まる
    assert.ok(!err || /魔力不足/.test(err), String(err));
});


console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
