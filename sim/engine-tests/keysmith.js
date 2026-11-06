// @ts-check
'use strict';
// sim/engine.test.js から読み込まれるテスト（共有の道具は ../testkit.js）
const { assert, e, test, game } = require('../testkit');

// ---- 鍵師 (#439) ----
test('鍵師: 空きマスのロックを無視して置ける。他キャラは置けない', () => {
    const s = game('keysmith', 'you');
    s.board[5] = { player: undefined, bind: 0, effects: [{ effect: '🔑', stack: 2 }] };
    assert.strictEqual(e.placeMove(s, 5), true);
    assert.strictEqual(s.board[5].player, '💙');
    assert.ok(!s.board[5].effects.some((x) => x.effect === '🔑')); // 置いたコマにはロックが残らない
    const t = game('you', 'keysmith');
    t.board[5] = { player: undefined, bind: 0, effects: [{ effect: '🔑', stack: 2 }] };
    assert.strictEqual(e.placeMove(t, 5), false);
});

test('鍵師: ロック系スキルはコスト-1（ロック2→1）。他のキャラは変わらない', () => {
    const s = game('keysmith', 'you');
    assert.strictEqual(e.calculateCost(s, e.skillCosts.onClickUseLock, false, false, 'onClickUseLock'), e.skillCosts.onClickUseLock - 1);
    assert.strictEqual(e.calculateCost(s, e.skillCosts.onClickAddLife, false, false, 'onClickAddLife'), e.skillCosts.onClickAddLife);
    const t = game('you', 'keysmith');
    assert.strictEqual(e.calculateCost(t, e.skillCosts.onClickUseLock, false, false, 'onClickUseLock'), e.skillCosts.onClickUseLock);
});

test('鍵師: 封鎖の断は自陣7・空きマス2をロックしてターン終了。敵のロックを解除し、敵陣にダメージ。敵の次の着手は空きマスに置けない', () => {
    const s = game('keysmith', 'you');
    s.magic[0] = 30;
    s.board[0] = { player: '💙', bind: 3, effects: [] };
    s.board[1] = { player: '⭕', bind: 4, effects: [{ effect: '🔑', stack: 3 }] };
    assert.strictEqual(e.sealCost(s), 8); // 基礎10 - 解除できる敵のロック1つ = 9、鍵師のロック系 -1 で 8
    const turn = s.turn;
    e.SKILLS.seal(s);
    assert.strictEqual(s.magic[0], 30 - 8);
    assert.notStrictEqual(s.turn, turn, 'ターンが終わる');
    assert.strictEqual(s.board[0].effects.find((x) => x.effect === '🔑').stack, 7);
    assert.strictEqual(s.board[2].effects.find((x) => x.effect === '🔑').stack, 2);
    assert.ok(!s.board[1].effects.some((x) => x.effect === '🔑'));
    assert.strictEqual(s.board[1].bind, 3);
    assert.strictEqual(e.placeMove(s, 2), false); // 敵(⭕)は空きマスに置けない
});

test('審判の日の処理順: 空きマスのロックが外れ、敵のロック付きコマはロックごと破壊される', () => {
    const m = game('magician', 'you');
    m.heartTurn = true; m.heartMagic = 30;
    m.board[4] = { player: undefined, bind: 0, effects: [{ effect: '🔑', stack: 6 }] };
    m.board[6] = { player: '⭕', bind: 4, effects: [{ effect: '🔑', stack: 6 }] };
    e.SKILLS.judgeDay(m);
    e.placeMove(m, 5);
    assert.deepStrictEqual(m.board[4].effects, []);
    assert.strictEqual(m.board[6].player, undefined);
    assert.strictEqual(m.board[5].player, '💙');
});

// ---- 鍵師向けの汎用スキル（#439, idx 130〜133）----
test('空き家封じ: 空きマス全てを2スタックでロック。ターンは続く。相手のリーチ1つにつきコスト-3', () => {
    const s = game('you', 'you');
    s.magic[0] = 30;
    assert.strictEqual(e.vacantSealCost(s), 10);
    s.board[0] = { player: '⭕', bind: 3, effects: [] };
    s.board[1] = { player: '⭕', bind: 3, effects: [] };
    s.board[2] = { player: '⭕', bind: 3, effects: [] }; // ⭕のリーチ(行0)
    assert.strictEqual(e.vacantSealCost(s), 7);
    const turn = s.turn;
    e.SKILLS.vacantSeal(s);
    assert.strictEqual(s.turn, turn, 'ターンは終わらない');
    assert.strictEqual(s.magic[0], 30 - 7);
    assert.strictEqual(s.board[3].effects.find((x) => x.effect === '🔑').stack, 2);
    assert.ok(!s.board[0].effects.some((x) => x.effect === '🔑'));
    // 敵(⭕)は空きマスに置けない。ロックしたリーチの最後のマス(3)にも置けない
    s.turn = 1;
    assert.strictEqual(e.placeMove(s, 3), false);
});

test('空き家封じ: 鍵師なら、ロックした空きマスに自分は置ける（ロック系スキルのコスト-1）', () => {
    const s = game('keysmith', 'you');
    s.magic[0] = 30;
    assert.strictEqual(e.vacantSealCost(s), 9); // 基礎10 - 鍵師のロック系-1
    e.SKILLS.vacantSeal(s);
    assert.strictEqual(e.placeMove(s, 5), true);
    assert.strictEqual(s.board[5].player, '💙');
});

test('ロックの増築: 自陣のロックのスタックを全て+2。ロックの無いコマだけだと使えない', () => {
    const s = game('you', 'you');
    s.magic[0] = 30;
    s.board[0] = { player: '💙', bind: 3, effects: [{ effect: '🔑', stack: 3 }] };
    s.board[1] = { player: '💙', bind: 3, effects: [] };
    e.SKILLS.lockExtend(s);
    assert.strictEqual(s.board[0].effects.find((x) => x.effect === '🔑').stack, 5);
    assert.ok(!s.board[1].effects.some((x) => x.effect === '🔑'));
    assert.strictEqual(s.magic[0], 30 - e.skillCosts.onClickLockExtend);
    const t = game('you', 'you');
    t.magic[0] = 30;
    t.board[1] = { player: '💙', bind: 3, effects: [] };
    e.SKILLS.lockExtend(t);
    assert.strictEqual(t.magic[0], 30, '対象が無ければ不発（魔力を払わない）');
});

test('施錠の加護: 使った手番を含む自分の3手番の間、設置したコマにロックが2スタック付く。4手番目には付かない', () => {
    const s = game('you', 'you');
    s.magic[0] = 30; s.magic[1] = 30;
    e.SKILLS.lockBlessing(s);
    assert.strictEqual(s.magic[0], 30 - e.skillCosts.onClickLockBlessing);
    const lockOf = (i) => (s.board[i].effects.find((x) => x.effect === '🔑') || {}).stack;
    // 席0: 1手番目(使った手番)に置く
    assert.strictEqual(e.placeMove(s, 0), true);
    assert.strictEqual(lockOf(0), 2, '使った手番に置いたコマにもロックが付く');
    // 席1の手番 → 席0の2手番目
    assert.strictEqual(e.placeMove(s, 15), true);
    assert.strictEqual(e.placeMove(s, 5), true);
    assert.strictEqual(lockOf(5) > 0, true, '2手番目');
    assert.strictEqual(e.placeMove(s, 14), true);
    assert.strictEqual(e.placeMove(s, 10), true);
    assert.strictEqual(lockOf(10) > 0, true, '3手番目');
    assert.strictEqual(e.placeMove(s, 13), true);
    assert.strictEqual(e.placeMove(s, 6), true);
    assert.strictEqual(lockOf(6), undefined, '4手番目には付かない');
});

test('錠前荒らし: 敵陣のロックを1つ解除して🔥☠⚡を付与。直前の相手ターンにロックが使われていれば0コスト（1手番に1回まで）', () => {
    const s = game('you', 'you');
    s.magic[0] = 30; s.magic[1] = 30;
    s.board[5] = { player: '⭕', bind: 5, effects: [{ effect: '🔑', stack: 4 }] };
    // 相手(⭕)がロックを使っていない → 通常コスト
    assert.strictEqual(e.lockRaidCost(s), e.skillCosts.onClickLockRaid);
    // 席1がロックを使って手番が回る → 席0の錠前荒らしが0コスト
    s.turn = 1;
    e.SKILLS.lock(s);
    e.SKILLS.charge(s); // 手番を終える
    assert.strictEqual(s.turn, 0);
    assert.strictEqual(e.lockRaidCost(s), 0);
    const before = s.magic[0];
    e.SKILLS.lockRaid(s);
    assert.strictEqual(s.magic[0], before, '無料');
    assert.ok(!s.board[5].effects.some((x) => x.effect === '🔑'), '敵のロックが解除される');
    assert.ok(s.board[5].effects.some((x) => ['🔥', '☠', '⚡'].includes(x.effect)), 'エフェクトが付く');
    assert.strictEqual(e.lockRaidCost(s), e.skillCosts.onClickLockRaid, '無料は1手番に1回まで');
});
