// @ts-check
'use strict';
// sim/engine.test.js から読み込まれるテスト（共有の道具は ../testkit.js）
const { assert, e, test, game, P, stacks } = require('../testkit');

console.log('sim/engine game rules:');

test('newGame: 16 empty squares, heart moves first', () => {
    const s = game();
    assert.strictEqual(s.board.length, 16);
    assert.ok(s.board.every((x) => x.player === undefined));
    assert.strictEqual(s.heartTurn, true);
});

test('placeMove on empty: current player placed at life bind', () => {
    const s = game();
    s.life = 5;
    e.placeMove(s, 5);
    assert.strictEqual(s.board[5].player, '💙'); // 💙
    assert.strictEqual(s.board[5].bind, 5);
});

test('placeMove: capturing a bind-0 enemy flips ownership', () => {
    const s = game();
    s.heartTurn = true; s.life = 5;
    s.board[6] = { player: '⭕', bind: 0, effects: [] }; // ⭕
    e.placeMove(s, 6);
    assert.strictEqual(s.board[6].player, '💙');
});

test('毒でライフが尽きたマスは消え、毒使い側の魔力が+1される', () => {
    const s = game('poisoner', 'you');
    s.heartTurn = true; s.life = 3;
    s.board[10] = { player: '⭕', bind: 2, effects: [{ effect: '☠' }, { effect: '☠' }] };
    const before = s.heartMagic;
    e.placeMove(s, 0);
    assert.strictEqual(s.board[10].player, undefined);
    // 空きマス化の+1（ターン送りの通常回復は別枠なので、少なくとも+1増えている）
    assert.ok(s.heartMagic >= before + 1);
});

test('ライフ0のコマに後から毒を撒いても、次の手番で消える', () => {
    const s = game('poisoner', 'you');
    s.heartTurn = true; s.life = 3;
    s.board[10] = { player: '⭕', bind: 0, effects: [{ effect: '☠' }] };
    const before = s.heartMagic;
    e.placeMove(s, 0);
    assert.strictEqual(s.board[10].player, undefined);
    assert.ok(s.heartMagic >= before + 1);
});


test('ミアズマ: 自陣の毒マスの周囲の敵マスに毒を1つ付与し、自陣の毒はすべて消える', () => {
    const s = game('poisoner', 'you');
    s.heartTurn = true; s.life = 3;
    s.board[5] = { player: '💙', bind: 4, effects: [P, P] };   // 自陣の毒マス（毒2スタック）
    s.board[6] = { player: '⭕', bind: 4, effects: [] };        // 隣の敵
    s.board[15] = { player: '⭕', bind: 4, effects: [] };       // 離れた敵（対象外）
    e.SKILLS.miasma(s);
    assert.strictEqual(stacks(s.board[6]), 1, '毒マス1つにつき1つ（スタック数ではない）');
    assert.strictEqual(stacks(s.board[15]), 0);
    assert.strictEqual(stacks(s.board[5]), 0, '自陣の毒は消える');
});

test('ミアズマ: 毒マスが複数隣り合うと同じ敵マスに毒が重複して積み上がる', () => {
    const s = game('poisoner', 'you');
    s.heartTurn = true;
    s.board[5] = { player: '💙', bind: 4, effects: [P] };
    s.board[7] = { player: '💙', bind: 4, effects: [P] };
    s.board[6] = { player: '⭕', bind: 4, effects: [] };        // 5 と 7 の両方に隣接
    e.SKILLS.miasma(s);
    assert.strictEqual(stacks(s.board[6]), 2);
});

test('ミアズマ: 自陣に毒が無ければ何も起きない（敵の毒は対象にならない）', () => {
    const s = game('poisoner', 'you');
    s.heartTurn = true;
    s.board[5] = { player: '💙', bind: 4, effects: [] };
    s.board[6] = { player: '⭕', bind: 4, effects: [P] };
    e.SKILLS.miasma(s);
    assert.strictEqual(stacks(s.board[6]), 1);
    assert.strictEqual(e.miasmaPlan(s).size, 0);
});

test('ミアズマのコスト: 自陣の毒の数だけ軽減（敵陣の毒は数えない）、下限1', () => {
    const s = game('poisoner', 'you');
    s.heartTurn = true;
    s.board[5] = { player: '⭕', bind: 4, effects: [P, P, P] };  // 敵陣の毒は数えない
    assert.strictEqual(e.miasmaCost(s), 5);                      // 6 - 1(毒使い割引)
    s.board[6] = { player: '💙', bind: 4, effects: [P, P, P] };
    assert.strictEqual(e.miasmaCost(s), 2);                      // 6 - 3 - 1
    s.board[7] = { player: '💙', bind: 4, effects: [P, P, P, P, P, P] };
    assert.strictEqual(e.miasmaCost(s), 1);                      // 下限
});

test('毒使いの駒に毒が付くとライフが1.5倍になる（ミアズマ）', () => {
    // 毒使い同士: ⭕ がミアズマを撃ち、💙 の毒使いの駒が毒を受ける
    const s = game('poisoner', 'poisoner');
    s.heartTurn = false; s.life = 3;
    s.board[5] = { player: '⭕', bind: 4, effects: [P] };
    s.board[6] = { player: '💙', bind: 4, effects: [] };
    e.SKILLS.miasma(s);
    assert.strictEqual(stacks(s.board[6]), 1);
    assert.strictEqual(s.board[6].bind, 6); // 4 × 1.5
});

test('毒使いでない駒に毒が付いてもライフは変わらない', () => {
    const s = game('poisoner', 'you');
    s.heartTurn = true; s.life = 3;
    s.board[5] = { player: '💙', bind: 4, effects: [P] };
    s.board[6] = { player: '⭕', bind: 4, effects: [] };
    e.SKILLS.miasma(s);
    assert.strictEqual(stacks(s.board[6]), 1);
    assert.strictEqual(s.board[6].bind, 4);
});

test('毒霧: 盤上の全コマ（敵味方問わず）に毒を1付与し、空きマスには付かない', () => {
    const s = game('you', 'you');
    s.board[0] = { player: '💙', bind: 5, effects: [] };
    s.board[5] = { player: '⭕', bind: 5, effects: [P] };   // 既に毒1 → 2になる
    s.board[10] = { player: '⭕', bind: 5, effects: [] };
    e.SKILLS.poisonMist(s);
    assert.strictEqual(stacks(s.board[0]), 1);
    assert.strictEqual(stacks(s.board[5]), 2);
    assert.strictEqual(stacks(s.board[10]), 1);
    assert.strictEqual(stacks(s.board[1]), 0, '空きマスには付かない');
});

test('毒霧: 🔑ロック中のコマは対象外。毒使いの駒はライフ1.5倍、他は変わらない', () => {
    const s = game('poisoner', 'you');
    s.board[0] = { player: '💙', bind: 4, effects: [] };                   // 毒使い → 6
    s.board[1] = { player: '⭕', bind: 4, effects: [] };                   // 他 → 4のまま
    s.board[2] = { player: '⭕', bind: 4, effects: [{ effect: '🔑' }] };   // ロック → 対象外
    e.SKILLS.poisonMist(s);
    assert.strictEqual(s.board[0].bind, 6);
    assert.strictEqual(s.board[1].bind, 4);
    assert.strictEqual(stacks(s.board[1]), 1);
    assert.strictEqual(stacks(s.board[2]), 0);
});

test('毒霧: 毒使いは毒系の割引(-1)を受けて5、他キャラは6', () => {
    const a = game('poisoner', 'you');
    a.heartTurn = true;
    a.heartMagic = 20;
    e.SKILLS.poisonMist(a);
    assert.strictEqual(20 - a.heartMagic, 5);
    const b = game('you', 'you');
    b.heartTurn = true; b.heartMagic = 20;
    e.SKILLS.poisonMist(b);
    assert.strictEqual(20 - b.heartMagic, 6);
});

test('毒トークンは毒使いが置くとライフが1.5倍になる', () => {
    const s = game('poisoner', 'you');
    s.heartTurn = true;
    const before = s.board.filter((x) => x.player).length;
    e.SKILLS.poisonToken(s);
    const placed = s.board.find((x) => x.player === '💙');
    assert.ok(placed && placed.effects.some((x) => x.effect === '☠'));
    assert.strictEqual(before, 0);
    assert.strictEqual(placed.bind, 6); // 基本4 × 1.5
});

test('毒でなく通常の減衰で0になったマスは消えない', () => {
    const s = game('poisoner', 'you');
    s.heartTurn = true; s.life = 3;
    s.board[10] = { player: '⭕', bind: 1, effects: [] };
    e.placeMove(s, 0);
    assert.strictEqual(s.board[10].player, '⭕');
});

test('token skill places one piece for the current player', () => {
    const s = game('tactician', 'you');
    s.heartTurn = true;
    const before = s.board.filter((x) => x.player === '💙').length;
    e.SKILLS.token(s);
    const after = s.board.filter((x) => x.player === '💙').length;
    assert.strictEqual(after, before + 1);
});

test('necromancer 蘇生: bind-0 enemies absorbed on necro turn', () => {
    const s = e.newGame({ heartChar: 'necromancer', circleChar: 'you', rng: e.makeRng(42) });
    s.heartTurn = true; s.remainHeartNecro = 4; s.life = 5;
    s.board[2] = { player: '⭕', bind: 0, effects: [] };
    s.board[7] = { player: '⭕', bind: 0, effects: [] };
    e.placeMove(s, 0);
    assert.strictEqual(s.board[2].player, '💙');
    assert.strictEqual(s.board[7].player, '💙');
});

test('magician: +3 magic per friendly bud (2 buds → 8 from 0)', () => {
    const s = e.newGame({ heartChar: 'magician', circleChar: 'you', rng: e.makeRng(42) });
    s.board[0] = { player: '💙', bind: 5, effects: [{ effect: '🌱' }, { effect: '🌱' }] }; // 2 buds
    s.heartMagic = 0; s.heartTurn = false; s.currentTurn = 2;
    e.advanceTurn(s); // next is heart → magic accrues
    // 0 +1(turn) +2(buds std) +1(magician flat) +4(magician bud +2 each) = 8
    assert.strictEqual(s.heartMagic, 8);
});

test('tactician token discount is -1 (post-nerf)', () => {
    const s = game('tactician', 'you');
    s.heartTurn = true;
    assert.strictEqual(e.calculateCost(s, 4, true), 3); // 4 - 1
    assert.strictEqual(e.calculateCost(s, 4, false), 6); // 4 + 2 (non-token penalty)
});

test('増殖: 発動後の着手でコマ(奇数回)→アイテム(偶数回)を交互に追加', () => {
    const s = game();
    s.heartTurn = true; s.heartMagic = 20; s.life = 5;
    e.SKILLS.proliferate(s);
    assert.strictEqual(s.heartProliferate, true);

    const before = s.board.filter((x) => x.player === '💙').length;
    e.placeMove(s, 0); // 着手1 → ループ1回目(奇数)=コマ追加
    assert.strictEqual(s.heartProliferateCount, 1);
    assert.strictEqual(s.board.filter((x) => x.player === '💙').length, before + 2); // 着手分 + 増殖分

    s.heartTurn = true; // 相手の手番を飛ばして先手の2手目へ
    const buds = () => s.board.flatMap((x) => x.effects).filter((eff) => eff.effect === '🌱').length;
    const budsBefore = buds();
    e.placeMove(s, 1); // ループ2回目(偶数)=アイテム追加
    assert.strictEqual(s.heartProliferateCount, 2);
    assert.strictEqual(buds(), budsBefore + 1);
});

test('増殖: 維持コストを払えないと手番開始時に途切れる', () => {
    const s = game();
    s.heartTurn = false; s.currentTurn = 2;
    s.heartProliferate = true; s.heartProliferateCount = 5; // 次の維持コスト5
    s.heartMagic = 0; // +1(ターン) だけでは 5 を払えない
    e.advanceTurn(s);
    assert.strictEqual(s.heartProliferate, false);
    assert.strictEqual(s.heartMagic, 1); // 途切れるだけでマジックは減らない
});

test('増殖: 維持コストを払える間はループが続く', () => {
    const s = game();
    s.heartTurn = false; s.currentTurn = 2;
    s.heartProliferate = true; s.heartProliferateCount = 2;
    s.heartMagic = 5;
    e.advanceTurn(s);
    assert.strictEqual(s.heartProliferate, true);
    assert.strictEqual(s.heartMagic, 4); // 5 +1(ターン) -2(維持)
});

test('増殖(毒使い): アイテム追加は敵コマへの毒になる', () => {
    const s = e.newGame({ heartChar: 'poisoner', circleChar: 'you', rng: e.makeRng(42) });
    s.heartTurn = true; s.heartMagic = 20; s.life = 5;
    s.heartProliferate = true; s.heartProliferateCount = 1; // 次は偶数回=アイテム
    s.board[3] = { player: '⭕', bind: 9, effects: [] };
    s.board[7] = { player: '⭕', bind: 9, effects: [] };
    e.placeMove(s, 0);
    const enemyPoison = [3, 7].reduce((n, i) => n + s.board[i].effects.filter((eff) => eff.effect === '☠').length, 0);
    assert.strictEqual(enemyPoison, 1);
});

test('calculateWinner detects 4-in-a-row', () => {
    const syms = Array(16).fill(undefined);
    [0, 1, 2, 3].forEach((i) => (syms[i] = '💙'));
    assert.strictEqual(e.calculateWinner(syms), '💙');
    assert.strictEqual(e.calculateWinner(Array(16).fill(undefined)), undefined);
});
