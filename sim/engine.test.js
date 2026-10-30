// @ts-check
'use strict';
// sim/engine.js のゲームルールの軽量テスト。実行: node sim/engine.test.js
const assert = require('assert');
const e = require('./engine');

let pass = 0, fail = 0;
function test(name, fn) {
    try { fn(); pass++; console.log('  ✓ ' + name); }
    catch (err) { fail++; console.log('  ✗ ' + name + ' — ' + err.message); }
}
const game = (h = 'you', c = 'you') => e.newGame({ heartChar: h, circleChar: c, rng: e.makeRng(42) });

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

const P = { effect: '☠' };
const stacks = (sq) => sq.effects.filter((x) => x.effect === '☠').length;

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

// ---- 多人数 (issue #32 / #30) ----
console.log('multi-player:');
const gameN = (...chars) => e.newGame({ chars, rng: e.makeRng(42) });

test('人数に応じた盤面サイズ: 2=4x4 / 3,4=5x5 / 5,6=6x6 / 7,8=7x7', () => {
    for (const [n, size] of [[2, 4], [3, 5], [4, 5], [5, 6], [6, 6], [7, 7], [8, 7]]) {
        const s = gameN(...Array(n).fill('you'));
        assert.strictEqual(s.size, size);
        assert.strictEqual(s.board.length, size * size);
    }
});

test('盤面サイズは人数と無関係に指定できる（4〜10、範囲外は丸める）', () => {
    for (const [n, size, expected] of [[2, 6, 6], [8, 4, 4], [3, 10, 10], [2, 2, 4], [2, 30, 10]]) {
        const s = e.newGame({ chars: Array(n).fill('you'), size, rng: e.makeRng(1) });
        assert.strictEqual(s.size, expected);
        assert.strictEqual(s.board.length, expected * expected);
    }
    const auto = e.newGame({ chars: ['you', 'you', 'you'], rng: e.makeRng(1) });
    assert.strictEqual(auto.size, 5);
});

test('巨人のオーラ: 周囲8マスの敵コマが壊れ、周囲8マス全部（壊れたマス・自陣のコマ含む）がロックされる', () => {
    const s = gameN('giant', 'you');
    s.life = 5;
    const geo = require('./shared/boardGeometry').geometryOf(s.size);
    const center = 5; // 4x4 の (1,1)
    const around = geo.surroundRange(center);
    const enemy = around[0], mine = around[1];
    s.board[enemy] = { player: '⭕', bind: 3, effects: [] };
    s.board[mine] = { player: '💙', bind: 3, effects: [] };
    e.placeMove(s, center);
    assert.strictEqual(s.board[enemy].player, undefined); // 敵コマ: 破壊
    assert.ok(s.board[enemy].effects.some((x) => x.effect === '🔑')); // 壊れたマスもロック
    assert.strictEqual(s.board[mine].player, '💙'); // 自陣: 壊れないがロックされる（ライフは減衰の-1のみ）
    assert.strictEqual(s.board[mine].bind, 2);
    for (const j of around) {
        assert.ok(s.board[j].effects.some((x) => x.effect === '🔑'), `マス${j}がロックされる`);
        if (j !== mine) assert.strictEqual(s.board[j].bind, 1);
    }
    // 相手の手番: ロック中のマスには置けない
    assert.strictEqual(e.placeMove(s, enemy), false);
});

test('巨人以外はオーラを持たない', () => {
    const s = gameN('you', 'giant');
    s.life = 5;
    e.placeMove(s, 5);
    const geo = require('./shared/boardGeometry').geometryOf(s.size);
    assert.ok(geo.surroundRange(5).every((j) => !s.board[j].effects.some((x) => x.effect === '🔑')));
});

test('手番は席順に回る（3人）', () => {
    const s = gameN('you', 'you', 'you');
    s.life = 5;
    const seen = [];
    for (let k = 0; k < 4; k++) { seen.push(s.turn); e.placeMove(s, k); }
    assert.deepStrictEqual(seen, [0, 1, 2, 0]);
});

test('巨人の休み: 巨人は2ラウンドに1回しか動かない（3人）。2人の同キャラは休みなし', () => {
    const s = gameN('you', 'giant', 'you');
    const seq = [];
    let prev = 0; seq.push(0);
    for (let ct = 2; ct <= 10; ct++) { s.currentTurn = ct; s.turn = prev; prev = e.judgeNextSeat(s); seq.push(prev); }
    assert.deepStrictEqual(seq, [0, 1, 2, 0, 2, 0, 1, 2, 0, 2]);
    const mirror = gameN('giant', 'giant');
    const m = [];
    let mp = 0; m.push(0);
    for (let ct = 2; ct <= 4; ct++) { mirror.currentTurn = ct; mirror.turn = mp; mp = e.judgeNextSeat(mirror); m.push(mp); }
    assert.deepStrictEqual(m, [0, 1, 0, 1]);
});

test('減衰(#30): 3人以上は着手3回につき1回だけ全コマ-1。2人は従来どおり着手ごと', () => {
    const s = gameN('you', 'you', 'you');
    s.life = 9; e.placeMove(s, 0); // 着手1回目: 減衰あり（空の盤）
    const afterFirst = s.board[0].bind; // 配置直後は life そのまま
    assert.strictEqual(afterFirst, 9);
    s.life = 5; e.placeMove(s, 1); // 2回目: 減衰なし
    s.life = 5; e.placeMove(s, 2); // 3回目: 減衰なし
    assert.strictEqual(s.board[0].bind, 9);
    s.life = 5; e.placeMove(s, 3); // 4回目: 減衰あり
    assert.strictEqual(s.board[0].bind, 8);
    const two = game();
    two.life = 9; e.placeMove(two, 0);
    two.life = 5; e.placeMove(two, 1);
    assert.strictEqual(two.board[0].bind, 8); // 2人は2手目でもう減る
});

test('shouldDecay の規則', () => {
    assert.strictEqual(e.shouldDecay(1, 2), true);
    assert.strictEqual(e.shouldDecay(1, 3), false);
    assert.strictEqual(e.shouldDecay(3, 3), true);
    assert.strictEqual(e.shouldDecay(6, 8), false);
    assert.strictEqual(e.shouldDecay(8, 8), true);
});

test('チューチュートレイン: 相手全員のマジックを0にする（次の手番の席だけ手番開始の+1が入る）', () => {
    const s = gameN('you', 'you', 'you', 'you');
    s.magic = [20, 5, 6, 7];
    e.SKILLS.tsunami(s);
    assert.strictEqual(s.turn, 1);
    assert.deepStrictEqual(s.magic.slice(1), [1, 0, 0]);
});

test('両トークン: 参加者全員のコマが1つずつ置かれる', () => {
    const s = gameN('you', 'you', 'you', 'you', 'you');
    s.magic[0] = 20;
    e.SKILLS.bothToken(s);
    const placed = s.board.map((sq) => sq.player).filter(Boolean).sort();
    assert.deepStrictEqual(placed, e.SYMBOLS.slice(0, 5).slice().sort());
});

test('式神(陰): 任意の空きマスに置ける。ライフ2・📜付きの自陣、コスト2（置くスキル自身も-1で実費1）。埋まったマスは選び直せる', () => {
    const s = gameN('yinYangMaster', 'you', 'you');
    s.board[1] = { player: '⭕', bind: 5, effects: [] };
    s.magic[0] = 10;
    e.SKILLS.shikigamiPlace(s);
    assert.strictEqual(s.magic[0], 9);
    assert.strictEqual(e.placeMove(s, 1), false); // 埋まっている
    assert.strictEqual(s.useShikigamiPlace, true);
    assert.strictEqual(e.placeMove(s, 6), true);
    assert.deepStrictEqual(s.board[6], { player: '💙', bind: 2, effects: [{ effect: '📜' }] });
    assert.strictEqual(s.turn, 0); // 手番は続く
    assert.strictEqual(s.useShikigamiPlace, false);
});

test('式神: 列の並びに数えない（4つ並んでも勝ちにならない）', () => {
    const s = game('yinYangMaster', 'you');
    for (const i of [0, 1, 2]) s.board[i] = { player: '💙', bind: 3, effects: [] };
    s.board[3] = e.newShikigami('💙');
    e.settleWinner(s);
    assert.strictEqual(s.winner, undefined);
    s.board[3] = { player: '💙', bind: 3, effects: [] };
    e.settleWinner(s);
    assert.strictEqual(s.winner, '💙');
});

test('式神: 自分で補強すると式神ではなく🌱付きの自陣コマになる', () => {
    const s = game('yinYangMaster', 'you');
    s.board[5] = e.newShikigami('💙');
    s.life = 3;
    e.placeMove(s, 5);
    assert.strictEqual(s.board[5].player, '💙');
    assert.strictEqual(s.board[5].bind, 1 + 3 + 1); // 着手前の減衰で式神のライフは2→1
    assert.deepStrictEqual(s.board[5].effects.map((x) => x.effect), ['🌱']);
});

test('式神: 相手が乗っ取る（ライフ0）と空きマスになり、コマは置かれない', () => {
    const s = game('yinYangMaster', 'you');
    s.board[5] = { player: '💙', bind: 0, effects: [{ effect: '📜' }] };
    s.turn = 1; s.life = 3;
    assert.strictEqual(e.placeMove(s, 5), true);
    assert.deepStrictEqual(s.board[5], { player: undefined, bind: 0, effects: [] });
});

test('式神(陽): 爆破で自分の式神が消え、周囲8マスの敵に4ダメージ・0で破壊、空きマスは式神になる。自陣は無傷', () => {
    const s = gameN('yinYangMaster', 'you');
    s.size = 4;
    s.board[5] = e.newShikigami('💙');
    s.board[0] = { player: '⭕', bind: 3, effects: [] }; // 破壊
    s.board[1] = { player: '⭕', bind: 6, effects: [] }; // 残る(2)
    s.board[2] = { player: '💙', bind: 3, effects: [] }; // 自陣は無傷
    s.board[15] = { player: '⭕', bind: 3, effects: [] }; // 範囲外
    s.magic[0] = 10;
    e.SKILLS.shikigamiBlast(s);
    assert.strictEqual(s.magic[0], 6);
    assert.strictEqual(e.placeMove(s, 2), false); // 式神でないマスは選び直せる
    assert.strictEqual(e.placeMove(s, 5), true);
    assert.deepStrictEqual(s.board[5], { player: undefined, bind: 0, effects: [] });
    assert.strictEqual(s.board[0].player, undefined);
    assert.strictEqual(s.board[1].bind, 2);
    assert.strictEqual(s.board[2].bind, 3);
    assert.strictEqual(s.board[15].bind, 3);
    for (const j of [4, 6, 8, 9, 10]) assert.deepStrictEqual(s.board[j], e.newShikigami('💙'));
});

test('式神の加護(idx 88): 自分の式神を1体消費して、自陣のコマ全て（式神を除く）のライフ+3。自陣のコマか式神が無いと使えない', () => {
    const s = gameN('you', 'you');
    s.board[0] = e.newShikigami('💙');
    s.board[1] = e.newShikigami('💙');
    s.board[2] = { player: '💙', bind: 2, effects: [] };
    s.board[3] = { player: '⭕', bind: 2, effects: [] };
    s.magic[0] = 10;
    e.SKILLS.shikigamiBless(s);
    assert.strictEqual(s.magic[0], 5);
    assert.strictEqual(e.placeMove(s, 2), false); // 式神でないマスは選び直せる
    assert.strictEqual(e.placeMove(s, 0), true);
    assert.deepStrictEqual(s.board[0], { player: undefined, bind: 0, effects: [] }); // 消費された
    assert.strictEqual(e.isShikigami(s.board[1]), true); // 他の式神は残る（ライフも変わらない）
    assert.strictEqual(s.board[1].bind, 2);
    assert.strictEqual(s.board[2].bind, 5);
    assert.strictEqual(s.board[3].bind, 2); // 敵は変わらない
    const t = gameN('you', 'you'); // 式神だけで自陣のコマが無い → 使えない
    t.board[0] = e.newShikigami('💙');
    t.magic[0] = 10;
    e.SKILLS.shikigamiBless(t);
    assert.strictEqual(t.magic[0], 10);
});

test('式神の呪詛(idx 89): 自分の式神を1体消費して、エフェクトが乗っている敵のコマ全て（🔑ロック除く）に☠を2つ。対象が無いと使えない', () => {
    const s = gameN('you', 'you');
    s.board[0] = e.newShikigami('💙');
    s.board[1] = { player: '⭕', bind: 5, effects: [{ effect: '🌱' }] };
    s.board[2] = { player: '⭕', bind: 5, effects: [] }; // エフェクト無し
    s.board[3] = { player: '⭕', bind: 5, effects: [{ effect: '🔑' }] }; // ロック中
    s.magic[0] = 10;
    e.SKILLS.shikigamiCurse(s);
    assert.strictEqual(s.magic[0], 5);
    assert.strictEqual(e.placeMove(s, 1), false); // 自分の式神でないマスは選び直せる
    assert.strictEqual(e.placeMove(s, 0), true);
    assert.deepStrictEqual(s.board[0], { player: undefined, bind: 0, effects: [] });
    assert.strictEqual(s.board[1].effects.filter((x) => x.effect === '☠').length, 2);
    assert.strictEqual(s.board[2].effects.length, 0);
    assert.strictEqual(s.board[3].effects.filter((x) => x.effect === '☠').length, 0);
    const t = gameN('you', 'you'); // 対象（エフェクト持ちの敵）が無い
    t.board[0] = e.newShikigami('💙');
    t.board[1] = { player: '⭕', bind: 5, effects: [] };
    t.magic[0] = 10;
    e.SKILLS.shikigamiCurse(t);
    assert.strictEqual(t.magic[0], 10);
});

test('式神割引(idx 90): 次に打つスキルのコストを 2＋盤面の式神の数 だけ軽減する。軽減札なので「次に打つスキル」を消費しない', () => {
    const s = gameN('you', 'you');
    s.board[0] = e.newShikigami('💙');
    s.board[1] = e.newShikigami('⭕'); // 敵の式神も数える
    s.magic[0] = 20;
    e.SKILLS.shikigamiDiscount(s);
    assert.strictEqual(s.magic[0], 18);
    assert.strictEqual(s.discount[0].next, 4); // 2 + 式神2体
    e.SKILLS.shikigamiDiscount(s); // 軽減札どうしは足し算（このターンの軽減は消費されない）
    assert.strictEqual(s.discount[0].next, 8);
});

test('式神の供犠(idx 91): 自陣の式神をランダムに1体壊し、選んだ敵コマのライフを0にする。式神3体以上なら0コスト。式神・🔑ロックは選べない', () => {
    const s = gameN('you', 'you');
    s.board[0] = e.newShikigami('💙');
    s.board[1] = e.newShikigami('💙');
    s.board[2] = e.newShikigami('💙');
    s.board[5] = { player: '⭕', bind: 6, effects: [] };
    s.board[6] = { player: '⭕', bind: 6, effects: [{ effect: '🔑' }] };
    s.board[7] = e.newShikigami('⭕');
    s.magic[0] = 3;
    e.SKILLS.shikigamiPurge(s);
    assert.strictEqual(s.magic[0], 3); // 式神3体なので0コスト
    assert.strictEqual([0, 1, 2].filter((i) => e.isShikigami(s.board[i])).length, 2); // ランダムに1体壊れた
    assert.strictEqual(e.placeMove(s, 6), false); // ロック中は選び直せる
    assert.strictEqual(e.placeMove(s, 7), false); // 式神は選べない
    assert.strictEqual(e.placeMove(s, 5), true);
    assert.strictEqual(s.board[5].bind, 0);
    assert.strictEqual(s.board[5].player, '⭕');
    const u = gameN('you', 'you'); // 式神2体 → コスト5
    u.board[0] = e.newShikigami('💙');
    u.board[1] = e.newShikigami('💙');
    u.board[5] = { player: '⭕', bind: 6, effects: [] };
    u.magic[0] = 8;
    e.SKILLS.shikigamiPurge(u);
    assert.strictEqual(u.magic[0], 3);
});

test('式神一括(1体あたりコスト3): 自分の式神を全て通常の自陣コマにする。相手の式神はそのまま。式神がいなければ何もしない', () => {
    const s = game('yinYangMaster', 'you');
    s.board[0] = e.newShikigami('💙');
    s.board[1] = e.newShikigami('💙');
    s.board[2] = e.newShikigami('⭕');
    s.magic[0] = 20;
    e.SKILLS.shikigamiAll(s);
    assert.strictEqual(s.magic[0], 20 - 3 * 2); // 自分の式神2体 × 3
    assert.deepStrictEqual(s.board[0], { player: '💙', bind: 2, effects: [] });
    assert.strictEqual(e.isShikigami(s.board[2]), true);
    e.SKILLS.shikigamiAll(s); // 式神がもういない
    assert.strictEqual(s.magic[0], 14);
});

test('陰陽師のパッシブ: 式神を置く手番は全スキルのコスト-1（下限1）。置くスキル自身も-1。手番が変わると戻る', () => {
    const s = game('yinYangMaster', 'you');
    s.magic[0] = 30;
    e.SKILLS.shikigamiPlace(s); // 設置(2): 置くスキル自身も-1 で 1
    assert.strictEqual(s.magic[0], 29);
    e.placeMove(s, 5);
    assert.strictEqual(s.shikiPlaced[0], true);
    const m = s.magic[0];
    e.SKILLS.shikigamiPlace(s); // 2-1=1（下限1）
    assert.strictEqual(m - s.magic[0], 1);
    e.placeMove(s, 6);
    const m2 = s.magic[0];
    e.SKILLS.toggleYY(s); // 陰陽転化(1)は下限1のまま
    assert.strictEqual(m2 - s.magic[0], 1);
    e.SKILLS.shikigamiBlast(s); // 爆破 4-1 = 3
    assert.strictEqual(m2 - 1 - s.magic[0], 3);
    e.advanceTurn(s);
    e.advanceTurn(s);
    assert.strictEqual(s.shikiPlaced[0], false);
});

test('式神一括は式神の数に比例して高くなる（盤面を埋める百鬼夜行→一括は重い）', () => {
    const s = game('yinYangMaster', 'you');
    for (let i = 0; i < 16; i++) s.board[i] = { player: undefined, bind: 0, effects: [] };
    s.magic[0] = 80;
    e.SKILLS.shikigamiFlood(s); // 16マス全て式神
    const before = s.magic[0];
    e.SKILLS.shikigamiAll(s);
    assert.strictEqual(before - s.magic[0], 3 * 16 - 1); // 式神を置いた手番は全スキル-1
});

test('百鬼夜行(コスト7): 着手できる全ての空きマスにライフ0の式神を置く。氷結中の空きマスと既存のコマは変えない', () => {
    const s = game('yinYangMaster', 'you');
    s.board[0] = { player: '⭕', bind: 3, effects: [] };
    s.board[1] = { player: '💙', bind: 3, effects: [] };
    const frz = { effect: '❄' };
    s.board[2] = { player: undefined, bind: 0, effects: [frz] };
    s.magic[0] = 20;
    e.SKILLS.shikigamiFlood(s);
    assert.strictEqual(s.magic[0], 14); // 7-1（置くスキル自身も-1）
    assert.deepStrictEqual(s.board[0], { player: '⭕', bind: 3, effects: [] });
    assert.deepStrictEqual(s.board[2], { player: undefined, bind: 0, effects: [frz] });
    const placed = s.board.filter((sq) => e.isShikigami(sq));
    assert.strictEqual(placed.length, 13);
    assert.ok(placed.every((sq) => sq.player === '💙' && sq.bind === 0));
});

test('百鬼夜行・式神設置・爆破: 🔑ロック中の空きマスには式神を置かない（ロックを貫通しない）', () => {
    const lock = { effect: '🔑' };
    const s = game('yinYangMaster', 'you');
    s.board[2] = { player: undefined, bind: 6, effects: [lock] };
    s.magic[0] = 40;
    e.SKILLS.shikigamiFlood(s);
    assert.deepStrictEqual(s.board[2], { player: undefined, bind: 6, effects: [lock] }); // ロック中の空きマスは変わらない
    assert.ok(e.isShikigami(s.board[3]));
    const t = game('yinYangMaster', 'you');
    t.board[2] = { player: undefined, bind: 6, effects: [lock] };
    t.magic[0] = 40;
    e.SKILLS.shikigamiPlace(t);
    assert.strictEqual(e.placeMove(t, 2), false); // 選び直せる
    assert.strictEqual(e.placeMove(t, 3), true);
    const u = game('yinYangMaster', 'you');
    u.board[5] = e.newShikigami('💙');
    u.board[6] = { player: undefined, bind: 6, effects: [lock] };
    u.magic[0] = 40;
    e.SKILLS.shikigamiBlast(u);
    e.placeMove(u, 5);
    assert.deepStrictEqual(u.board[6], { player: undefined, bind: 6, effects: [lock] }); // 爆破の跡もロックを貫通しない
});

test('式神ランダム設置: 🔑ロック中・氷結中の空きマスは抽選に入らない', () => {
    for (let seed = 1; seed <= 20; seed++) {
        const s = e.newGame({ heartChar: 'yinYangMaster', circleChar: 'you', rng: e.makeRng(seed) });
        for (let i = 0; i < 16; i++) s.board[i] = { player: '⭕', bind: 3, effects: [] };
        const lock = { player: undefined, bind: 6, effects: [{ effect: '🔑' }] };
        const frozen = { player: undefined, bind: 0, effects: [{ effect: '❄' }] };
        s.board[4] = lock;
        s.board[9] = frozen;
        s.board[7] = { player: undefined, bind: 0, effects: [] }; // 置けるのはここだけ
        s.magic[0] = 20;
        e.SKILLS.shikigamiRandom(s);
        assert.deepStrictEqual(s.board[4], lock);
        assert.deepStrictEqual(s.board[9], frozen);
        assert.ok(e.isShikigami(s.board[7]));
    }
});

test('百鬼夜行→式神一括: 空きマスが全て自コマになり、敵の入っていない列が完成して勝つ', () => {
    const s = game('yinYangMaster', 'you');
    for (let i = 0; i < 16; i++) s.board[i] = { player: undefined, bind: 0, effects: [] };
    s.board[0] = { player: '⭕', bind: 3, effects: [] };
    s.magic[0] = 20;
    e.SKILLS.shikigamiFlood(s);
    e.settleWinner(s);
    assert.strictEqual(s.winner, undefined); // 式神は列に数えない
    e.SKILLS.shikigamiAll(s);
    e.settleWinner(s);
    assert.strictEqual(s.winner, '💙');
});

test('式神ランダム設置(コスト2・トークン扱い): ランダムな空きマスに式神を置き、手番にトークンを使ったことになる', () => {
    const s = game('you', 'you');
    s.magic[0] = 10;
    e.SKILLS.shikigamiRandom(s);
    const shiki = s.board.filter((sq) => e.isShikigami(sq));
    assert.strictEqual(shiki.length, 1);
    assert.strictEqual(shiki[0].player, '💙');
    assert.strictEqual(s.usedTokenThisTurn, true);
    assert.ok(s.magic[0] < 10);
});

test('スラッシュ/審判の日は盤サイズに合わせる（5x5: 対角は5マス、中央の審判は行+列+両対角）', () => {
    const s = gameN('you', 'you', 'you');
    for (let i = 0; i < 25; i++) s.board[i] = { player: '⭕', bind: 3, effects: [] };
    s.magic[0] = 20;
    e.SKILLS.slash(s);
    assert.deepStrictEqual([4, 8, 12, 16, 20].map((i) => s.board[i].bind), [0, 0, 0, 0, 0]);
    assert.strictEqual(s.board[0].bind, 3);
});

test('勝利は5x5でも4連続（盤の途中でもよい）', () => {
    const syms = Array(25).fill(undefined);
    [6, 7, 8, 9].forEach((i) => (syms[i] = '🟩'));
    assert.strictEqual(e.calculateWinner(syms), '🟩');
});

test('終盤の魔力ボーナス: 50ターンごとに手番開始時の魔力が+1ずつ増える（2人戦も同じ）', () => {
    const adv = (n, turn) => {
        const s = e.newGame({ chars: Array(n).fill('you'), rng: e.makeRng(1) });
        s.turn = 0; s.magic = Array(n).fill(0); s.currentTurn = turn;
        e.advanceTurn(s); // 次の席(1)の手番開始
        return s.magic[1];
    };
    assert.strictEqual(adv(3, 49), 1);
    assert.strictEqual(adv(3, 50), 2);
    assert.strictEqual(adv(4, 100), 3);
    assert.strictEqual(adv(2, 49), 1);
    assert.strictEqual(adv(2, 100), 3);
});


test('本番のAI(aiDriver): 2〜4人戦が最後まで進み、手番が止まらない（行き詰まりチャージが出ない）', () => {
    const aiDriver = require('./aiDriver');
    const { runGame } = require('./run');
    const cases = [['witch', 'giant'], ['poisoner', 'magician'], ['magician', 'cryomancer'], ['cryomancer', 'poisoner'], ['you', 'tactician', 'electrician'], ['cryomancer', 'pyromancer', 'yinYangMaster', 'necromancer']];
    cases.forEach((chars, k) => {
        const r = runGame(chars, e.makeRng(100 + k), 'prod', undefined, null, { deck: true, gears: true });
        assert.ok(r.turns > 3, chars.join('/') + ' が進んだ');
        assert.ok(!(r.stats.aiStall > 0), `${chars.join('/')}: 行き詰まり ${r.stats.aiStall}`);
    });
    assert.strictEqual(typeof aiDriver.playTurn, 'function');
});

// ---- 帯電 ⚡ (雷霆の巫, #39) ----
const zap = () => ({ player: undefined, bind: 0, effects: [{ effect: '⚡' }] });

test('⚡発火: 帯電マスの隣に置くと、帯電マスの縦横隣接のコマが1ダメージ受け、⚡は消える', () => {
    const s = game('you', 'you');
    s.heartTurn = true; s.life = 5;
    s.board[5] = zap();                                              // 帯電マス (r1,c1)
    s.board[6] = { player: '⭕', bind: 4, effects: [] };              // 帯電マスの右隣
    s.board[9] = { player: '⭕', bind: 4, effects: [] };              // 帯電マスの下隣
    s.board[10] = { player: '⭕', bind: 4, effects: [] };             // 斜めは対象外
    e.placeMove(s, 4);                                               // 帯電マスの左隣に着手
    // 着手後の減衰(-1)に加え、発火でさらに-1
    assert.strictEqual(s.board[6].bind, 4 - 1 - 1);
    assert.strictEqual(s.board[9].bind, 4 - 1 - 1);
    assert.strictEqual(s.board[10].bind, 4 - 1);
    assert.strictEqual(e.chargeStacks(s.board[5]), 0);
});

test('⚡発火: 着手したコマ自身も帯電マスの隣なら1ダメージを受ける', () => {
    const s = game('you', 'you');
    s.heartTurn = true; s.life = 5;
    s.board[5] = zap();
    e.placeMove(s, 4);
    assert.strictEqual(s.board[4].bind, 5 - 1);
});

test('⚡発火: 🔑ロック中のマスはダメージを貫通しない', () => {
    const s = game('you', 'you');
    s.heartTurn = true; s.life = 5;
    s.board[5] = zap();
    s.board[6] = { player: '⭕', bind: 4, effects: [{ effect: '🔑' }] };
    e.placeMove(s, 4);
    assert.strictEqual(s.board[6].bind, 4 - 1); // 減衰のみ。発火分は入らない
    assert.strictEqual(e.chargeStacks(s.board[5]), 0);
});

test('⚡発火: 連鎖しない(ダメージで別の⚡は発火しない)', () => {
    const s = game('you', 'you');
    s.heartTurn = true; s.life = 5;
    s.board[5] = zap();
    s.board[6] = { player: '⭕', bind: 4, effects: [{ effect: '⚡' }] }; // 帯電したコマ
    e.placeMove(s, 4);
    assert.strictEqual(e.chargeStacks(s.board[6]), 1); // 発火したのは5番だけ。6番の⚡は残る
});

test('⚡付与スキルは付与した時点ではダメージを出さない', () => {
    const s = game('electrician', 'you');
    s.heartTurn = true; s.heartMagic = 20; s.life = 5;
    s.board[6] = { player: '⭕', bind: 4, effects: [] };
    e.SKILLS.chargeOne(s);
    e.placeMove(s, 5);                                                // 帯電付与(クリック)
    assert.strictEqual(e.chargeStacks(s.board[5]), 1);
    assert.strictEqual(s.board[6].bind, 4);
    assert.strictEqual(s.heartTurn, true);                           // 手番は進まない
});

test('雷霆の巫パッシブ: ⚡付き自陣マスはライフ0でも奪えない', () => {
    const s = game('you', 'electrician');
    s.heartTurn = true; s.life = 9;
    s.board[3] = { player: '⭕', bind: 0, effects: [{ effect: '⚡' }] };
    assert.strictEqual(e.placeMove(s, 3), false);
    assert.strictEqual(s.board[3].player, '⭕');
});

test('雷霆の巫パッシブ: 雷霆の巫以外の⚡付きコマは通常どおり奪える', () => {
    const s = game('electrician', 'you');
    s.heartTurn = true; s.life = 9;
    s.board[3] = { player: '⭕', bind: 0, effects: [{ effect: '⚡' }] };
    assert.strictEqual(e.placeMove(s, 3), true);
    assert.strictEqual(s.board[3].player, '💙');
});

test('雷霆の巫の弱点: ⚡付き自陣マスは自分でも触れない(強化もできない)', () => {
    const s = game('electrician', 'you');
    s.heartTurn = true; s.life = 5;
    s.board[3] = { player: '💙', bind: 2, effects: [{ effect: '⚡' }] };
    assert.strictEqual(e.placeMove(s, 3), false);
    assert.strictEqual(s.board[3].bind, 2);
});

test('雷霆の巫の⚡付きマスはスラッシュ等のダメージ系スキルの対象外', () => {
    const s = game('you', 'electrician');
    s.heartTurn = true; s.heartMagic = 20;
    s.board[3] = { player: '⭕', bind: 4, effects: [{ effect: '⚡' }] };
    s.board[6] = { player: '⭕', bind: 4, effects: [] };
    e.SKILLS.slash(s);
    assert.strictEqual(s.board[3].bind, 4);
    assert.strictEqual(s.board[6].bind, 0);
});

test('固有スキル(帯電拡散): コマのあるマスだけを縦横に辿ってすべてに⚡、空きマスは経由しない', () => {
    const s = game('electrician', 'you');
    s.heartTurn = true; s.heartMagic = 20;
    s.board[0] = { player: '💙', bind: 3, effects: [] };
    s.board[1] = { player: '⭕', bind: 3, effects: [] };   // 敵のコマも辿る
    s.board[5] = { player: '💙', bind: 3, effects: [] };
    s.board[10] = { player: '💙', bind: 3, effects: [] };  // 5と斜め→辿れない
    e.SKILLS.chargeSpread(s);
    e.placeMove(s, 0);
    assert.deepStrictEqual([0, 1, 5].map((i) => e.chargeStacks(s.board[i])), [1, 1, 1]);
    assert.strictEqual(e.chargeStacks(s.board[10]), 0);
    // 付与の時点ではダメージなし
    assert.strictEqual(s.board[5].bind, 3);
});

test('帯電: 同じ盤で複数の帯電マスが同時に発火する(着手マスが2つの帯電マスの隣)', () => {
    const s = game('you', 'you');
    s.heartTurn = true; s.life = 5;
    s.board[4] = zap();
    s.board[6] = zap();
    s.board[5] = { player: '⭕', bind: 0, effects: [] }; // 奪取先: 4と6の間 (ライフ0の敵)
    s.board[0] = { player: '⭕', bind: 4, effects: [] }; // 4の上
    s.board[2] = { player: '⭕', bind: 4, effects: [] }; // 6の上
    e.placeMove(s, 5);
    assert.strictEqual(s.board[0].bind, 4 - 1 - 1);
    assert.strictEqual(s.board[2].bind, 4 - 1 - 1);
});

// ---- 帯電系スキル2 (#40) と帯電コスト軽減 (#43) ----
test('帯電ダブルトークン: ⚡付きのコマを2つ設置し、ダメージは出さない', () => {
    const s = game('electrician', 'you');
    s.heartTurn = true; s.heartMagic = 20;
    e.SKILLS.doubleChargeToken(s);
    const charged = s.board.filter((sq) => sq.player === '💙' && e.chargeStacks(sq) === 1);
    assert.strictEqual(charged.length, 2);
    assert.strictEqual(s.usedTokenThisTurn, true);
});

test('範囲帯電: 選んだマスを中心に3x3へ⚡。雷霆の巫以外のコマは乗った時点で2ダメージ', () => {
    const s = game('electrician', 'you');
    s.heartTurn = true; s.heartMagic = 20;
    s.board[6] = { player: '⭕', bind: 4, effects: [] };
    e.SKILLS.chargeArea(s);
    assert.strictEqual(s.heartTurn, true);
    e.placeMove(s, 5);
    const cells = [0, 1, 2, 4, 5, 6, 8, 9, 10];
    assert.ok(cells.every((i) => e.chargeStacks(s.board[i]) === 1));
    assert.strictEqual(e.chargeStacks(s.board[3]), 0);
    assert.strictEqual(s.board[6].bind, 2); // あなた(雷霆の巫以外)のコマ: 4 → 2
});

test('ランダム帯電: 1〜4マスに⚡。ロック中・無敵マスは対象外', () => {
    for (let seed = 1; seed <= 20; seed++) {
        const s = e.newGame({ heartChar: 'electrician', circleChar: 'you', rng: e.makeRng(seed) });
        s.heartTurn = true; s.heartMagic = 20;
        s.board[0] = { player: '💙', bind: 3, effects: [{ effect: '⚡' }] }; // 無敵
        s.board[1] = { player: '⭕', bind: 3, effects: [{ effect: '🔑' }] };
        e.SKILLS.chargeRandom(s);
        const added = s.board.reduce((n, sq, i) => n + e.chargeStacks(sq) - (i === 0 ? 1 : 0), 0);
        assert.ok(added >= 1 && added <= 4, `seed ${seed}: ${added}`);
        assert.strictEqual(e.chargeStacks(s.board[0]), 1);
        assert.strictEqual(e.chargeStacks(s.board[1]), 0);
    }
});

test('ジャマー: 隣接する敵コマに⚡のスタック数だけダメージ、⚡は消える。ロックと自コマは無傷', () => {
    const s = game('electrician', 'you');
    s.heartTurn = true; s.heartMagic = 20;
    s.board[5] = { player: undefined, bind: 0, effects: [{ effect: '⚡' }, { effect: '⚡' }] }; // スタック2
    s.board[4] = { player: '⭕', bind: 3, effects: [] };
    s.board[6] = { player: '⭕', bind: 1, effects: [] };
    s.board[1] = { player: '⭕', bind: 4, effects: [{ effect: '🔑' }] };
    s.board[9] = { player: '💙', bind: 4, effects: [] };
    e.SKILLS.jammer(s);
    assert.strictEqual(e.placeMove(s, 5), true);
    assert.strictEqual(s.board[4].bind, 1);
    assert.strictEqual(s.board[6].bind, 0);
    assert.strictEqual(s.board[1].bind, 4);
    assert.strictEqual(s.board[9].bind, 4);
    assert.strictEqual(e.chargeStacks(s.board[5]), 0);
    assert.strictEqual(s.heartTurn, true); // 手番は進まない
});

test('ジャマー: ⚡の無いマスは選べない。自分の無敵マスは選べて、これが弱点を解く手段になる', () => {
    const s = game('electrician', 'you');
    s.heartTurn = true; s.heartMagic = 20;
    s.board[3] = { player: '💙', bind: 2, effects: [{ effect: '⚡' }] };
    e.SKILLS.jammer(s);
    assert.strictEqual(e.placeMove(s, 7), false); // ⚡なし
    assert.strictEqual(s.useJammer, true);
    assert.strictEqual(e.placeMove(s, 3), true);  // 自分の無敵マス
    assert.strictEqual(e.chargeStacks(s.board[3]), 0);
    assert.strictEqual(e.placeMove(s, 3), true);  // 無敵が解けたので触れる(強化)
});

test('ジャマー: 他人の無敵マスは選べない', () => {
    const s = game('you', 'electrician');
    s.heartTurn = true; s.heartMagic = 20;
    s.board[3] = { player: '⭕', bind: 2, effects: [{ effect: '⚡' }] };
    e.SKILLS.jammer(s);
    assert.strictEqual(e.placeMove(s, 3), false);
    assert.strictEqual(e.chargeStacks(s.board[3]), 1);
});

test('帯電付与・帯電拡散のコストは盤面の⚡の数だけ軽減され、下限は1 (#43)', () => {
    const s = game('electrician', 'you');
    s.heartTurn = true;
    assert.strictEqual(e.chargeSpreadCost(s), 7);
    assert.strictEqual(e.chargeOneCost(s), 2);
    s.board[0].effects.push({ effect: '⚡' }, { effect: '⚡' }); // スタック2
    s.board[1].effects.push({ effect: '⚡' });                   // 合計3
    assert.strictEqual(e.chargeSpreadCost(s), 4);
    assert.strictEqual(e.chargeOneCost(s), 1);                   // 2-3 -> 下限1
    for (let i = 2; i < 12; i++) s.board[i].effects.push({ effect: '⚡' });
    assert.strictEqual(e.chargeSpreadCost(s), 1);                // 下限1
});


test('過負荷（全マス⚡）: 全⚡と🔑を取り除き、全マスのライフを0にする', () => {
    // 既定で有効（CHG_DISCHARGE=0 で無効）。環境変数は読み込み時に決まるため、別プロセスで検証する
    const { execFileSync } = require('child_process');
    const code = `
        const e = require('./sim/engine');
        const s = e.newGame({ heartChar: 'electrician', circleChar: 'you', rng: e.makeRng(7) });
        s.heartTurn = true; s.heartMagic = 20;
        for (let i = 0; i < 15; i++) s.board[i] = { player: i % 2 ? '⭕' : '💙', bind: 5, effects: [{ effect: '⚡' }] };
        s.board[3].effects.push({ effect: '🔑' }); s.board[3].bind = 6;
        s.board[15] = { player: '⭕', bind: 4, effects: [] };
        e.SKILLS.chargeOne(s); e.placeMove(s, 15);
        console.log(JSON.stringify({
            stacks: s.board.reduce((n, sq) => n + e.chargeStacks(sq), 0),
            binds: s.board.map((sq) => sq.bind),
            locks: s.board.reduce((n, sq) => n + sq.effects.filter((x) => x.effect === '🔑').length, 0),
            discharge: s.stats.discharge,
        }));`;
    const out = JSON.parse(execFileSync('node', ['-e', code], { cwd: require('path').join(__dirname, '..'), env: { ...process.env } }).toString());
    assert.strictEqual(out.stacks, 0);
    assert.strictEqual(out.discharge, 1);
    assert.ok(out.binds.every((b) => b === 0));                // ロックのマスも含めて全部0
    assert.strictEqual(out.locks, 0);                          // ロックも解除
});

test('雷霆の巫は自陣由来（自分のコマが載った⚡マス）の発火ダメージを受けない。敵の⚡や他人の駒には通常どおり効く', () => {
    const s = game('electrician', 'you');
    s.heartTurn = true; s.life = 5;
    // 5番=雷霆の巫(💙)の⚡コマ。隣の4番に着手して発火。隣接の6番=自コマ(💙)は無傷、9番=敵(⭕)は1ダメージ
    s.board[5] = { player: '💙', bind: 3, effects: [{ effect: '⚡' }] };
    s.board[6] = { player: '💙', bind: 4, effects: [] };
    s.board[9] = { player: '⭕', bind: 4, effects: [] };
    e.placeMove(s, 4);
    assert.strictEqual(s.board[6].bind, 4 - 1);  // 減衰のみ（発火ダメージなし）
    assert.strictEqual(s.board[9].bind, 4 - 1 - 1);
});

test('敵（雷霆の巫以外）の⚡コマの発火は、雷霆の巫のコマにも効く', () => {
    const s = game('electrician', 'you');
    s.heartTurn = true; s.life = 5;
    s.board[5] = { player: '⭕', bind: 3, effects: [{ effect: '⚡' }] }; // 敵の⚡コマ
    s.board[6] = { player: '💙', bind: 4, effects: [] };
    e.placeMove(s, 4);
    assert.strictEqual(s.board[6].bind, 4 - 1 - 1);
});

// ---- ❄氷結 / 🔥火炎 (sim/thermal.js, src/components/game/thermal.ts) ----
const FRZ = { effect: '❄' }, FLM = { effect: '🔥' };

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
    const th = require('./shared/thermal');
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

test('氷結: スラッシュ・ストンプ・審判の日・式神の爆破も氷結が身代わりになる', () => {
    const anti = e.newGame({ heartChar: 'you', circleChar: 'you', rng: e.makeRng(1) });
    const idx = require('./shared/boardGeometry').geometryOf(anti.size).antiDiagonal[1];
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
    e.placeMove(m, 5); // 中心が氷結の敵コマ → 身代わりで残り、中心は奪えない
    assert.strictEqual(m.board[5].player, '⭕');
    assert.strictEqual(m.board[5].effects.length, 0);

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
    const th = require('./shared/thermal');
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
    assert.strictEqual(require('./shared/util').LIFE_MEANS.cryomancer, 4);
});

test('氷結は🔥のあるマスには付かない（空きマス・氷結済みへの重ね掛けは可）。freezeAll も🔥マスを飛ばす', () => {
    const th = require('./shared/thermal');
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

// ---- 🌱バッズ系の汎用スキル (idx33〜36) ----
const BUD = { effect: '🌱' };
const budsOn = (sq) => sq.effects.filter((x) => x.effect === '🌱').length;

test('刈り入れ前夜: 自陣の🌱を全除去し、除去した数だけ魔力+（コスト2）。🌱が無ければ不可。手番は続く', () => {
    const s = game();
    s.heartTurn = true; s.heartMagic = 10;
    s.board[1] = { player: '💙', bind: 3, effects: [BUD, BUD] };
    s.board[2] = { player: '💙', bind: 3, effects: [BUD, { effect: '🔑' }] };
    s.board[3] = { player: '⭕', bind: 3, effects: [BUD] };
    e.SKILLS.harvestEve(s);
    assert.strictEqual(s.heartMagic, 10 - 2 + 3);
    assert.strictEqual(budsOn(s.board[1]) + budsOn(s.board[2]), 0);
    assert.ok(s.board[2].effects.some((x) => x.effect === '🔑'));
    assert.strictEqual(budsOn(s.board[3]), 1); // 敵の🌱は不変
    assert.strictEqual(s.heartTurn, true);
    const m = s.heartMagic;
    e.SKILLS.harvestEve(s); // もう🌱が無い → 不発
    assert.strictEqual(s.heartMagic, m);
});

test('冬至の種子: 自陣の🌱が休眠せず働く（魔力ボーナス・刈り入れ前夜）。自分の次の手番開始時に解除。ガード中の再使用は不可', () => {
    const s = game();
    s.heartTurn = true; s.heartMagic = 20; s.life = 3;
    s.board[1] = { player: '💙', bind: 5, effects: [BUD, BUD, FRZ] };   // 氷結中
    s.board[3] = { player: '⭕', bind: 5, effects: [BUD, FRZ] };        // 敵の休眠は対象外
    assert.strictEqual(e.ownBuds(s), 0);                                // ガード前は全部休眠
    const before = s.heartMagic;
    e.SKILLS.solstice(s);
    assert.strictEqual(s.heartMagic, before - 4);
    assert.strictEqual(s.budGuard[0], true);
    assert.strictEqual(e.ownBuds(s), 2);                                // ガード中は数える
    const m = s.heartMagic;
    e.SKILLS.solstice(s);
    assert.strictEqual(s.heartMagic, m); // 再使用不可
    // 刈り入れ前夜がガード中は休眠マスの🌱も刈れる（敵の🌱は触らない）
    e.SKILLS.harvestEve(s);
    assert.strictEqual(s.heartMagic, m - 2 + 2);
    assert.strictEqual(budsOn(s.board[1]), 0);
    assert.strictEqual(budsOn(s.board[3]), 1);
    // 解除タイミング: 自分の次の手番開始時（相手の手番ではまだ有効）
    e.SKILLS.charge(s);
    assert.strictEqual(s.heartTurn, false);
    assert.strictEqual(s.budGuard[0], true);
    e.SKILLS.charge(s);
    assert.strictEqual(s.heartTurn, true);
    assert.strictEqual(s.budGuard[0], false);
});

test('冬至の種子: 魔力ボーナスも数える（休眠マスの🌱 → ガードで有効）', () => {
    const gainWith = (guard) => {
        const g = game('magician', 'you');
        g.heartTurn = true; g.heartMagic = 0; g.life = 3;
        g.board[1] = { player: '💙', bind: 5, effects: [BUD, BUD, FRZ] };
        g.budGuard[0] = guard;
        e.SKILLS.charge(g); // 席0が終了 → 席1 → 席0 の頭で加算
        e.SKILLS.charge(g);
        return g.heartMagic;
    };
    // 魔法使い: 🌱1個につき +1 +2
    assert.strictEqual(gainWith(true) - gainWith(false), 6);
});

test('後から火炎が付くと🌱は消える（冬至の種子のガード中は残る）。業火は敵の🌱を消し、絶対零度（氷結）は消さない', () => {
    const th = require('./shared/thermal');
    const mk = () => Array.from({ length: 16 }, () => ({ player: undefined, bind: 0, effects: [] }));
    const b = mk();
    b[1] = { player: '⭕', bind: 3, effects: [BUD, BUD, { effect: '☠' }, { effect: '⚡' }] };
    th.ignite(b, [1], 4);
    assert.strictEqual(budsOn(b[1]), 0);
    assert.ok(b[1].effects.some((x) => x.effect === '☠') && b[1].effects.some((x) => x.effect === '⚡'));
    assert.ok(!th.isDormant(b[1]));
    const c = mk();
    c[1] = { player: '⭕', bind: 3, effects: [BUD, BUD] };
    th.ignite(c, [1], 4, 1, () => true);
    assert.strictEqual(budsOn(c[1]), 2);
    const t = game('pyromancer', 'you');
    t.heartTurn = true; t.heartMagic = 30;
    t.board[1] = { player: '⭕', bind: 5, effects: [BUD] };
    e.SKILLS.inferno(t);
    assert.strictEqual(budsOn(t.board[1]), 0);
    const g = game('cryomancer', 'you');
    g.heartTurn = true; g.heartMagic = 30;
    g.board[1] = { player: '💙', bind: 5, effects: [BUD] };
    e.SKILLS.glacier(g);
    assert.strictEqual(budsOn(g.board[1]), 1);
});

test('🔥中のマス: 毒・⚡は休眠せず働く。🔥は毒・電気のダメージでは消えない', () => {
    const s = game();
    s.heartTurn = true; s.life = 3;
    s.board[5] = { player: '⭕', bind: 6, effects: [FLM, { effect: '☠' }] };
    e.placeMove(s, 0);
    // 🔥中でも毒は働く。毒のダメージでは🔥は消えず、毒も残る
    assert.ok(s.board[5].bind < 6);
    assert.ok(s.board[5].effects.some((x) => x.effect === '🔥'));
    assert.ok(s.board[5].effects.some((x) => x.effect === '☠'));
    // 電気のダメージを受けても🔥は消えない
    const t = game();
    t.heartTurn = true; t.life = 3;
    t.board[5] = { player: '⭕', bind: 8, effects: [{ effect: '⚡' }] };
    t.board[6] = { player: '⭕', bind: 8, effects: [FLM] };
    e.placeMove(t, 4);
    assert.ok(t.board[6].effects.some((x) => x.effect === '🔥'));
    // 🔥中のマスの⚡も働く: 巫の無敵が効き、盤面の⚡数にも数える
    const u = game('electrician', 'you');
    u.heartTurn = true; u.life = 3;
    u.board[5] = { player: '💙', bind: 3, effects: [{ effect: '⚡' }, FLM] };
    assert.strictEqual(e.isShielded(u, u.board[5]), true);
    assert.strictEqual(e.boardChargeCount(u.board), 1);
    // 毒の数にも数える
    const p = game('poisoner', 'you');
    p.heartTurn = true;
    p.board[1] = { player: '💙', bind: 4, effects: [FLM, { effect: '☠' }] };
    assert.strictEqual(e.boardPoisonCount(p.board), 1);
});

test('ひこばえ: 🌱を持つ自陣コマを選ぶと縦横隣の自陣コマ(canBud)に🌱を1つずつ（受け手が3つ以上なら重複なくランダムに2つ）。選べるコマが無ければ不可。コスト4', () => {
    const s = game();
    s.heartTurn = true; s.heartMagic = 20;
    s.board[5] = { player: '💙', bind: 3, effects: [BUD] };   // 選ぶコマ
    s.board[4] = { player: '💙', bind: 3, effects: [] };       // 受け取る
    s.board[6] = { player: '💙', bind: 3, effects: [FRZ] };    // 氷結 → 不可
    s.board[9] = { player: '💙', bind: 3, effects: [FLM] };    // 火炎 → 不可
    s.board[1] = { player: '⭕', bind: 3, effects: [] };        // 敵 → 不可
    s.board[10] = { player: '💙', bind: 3, effects: [] };      // 斜め → 不可
    const before = s.heartMagic;
    e.SKILLS.sucker(s);
    assert.strictEqual(s.heartMagic, before - 4);
    assert.strictEqual(s.useSucker, true);
    assert.strictEqual(e.placeMove(s, 4), false);  // 🌱を持たないコマは選び直し
    assert.strictEqual(e.placeMove(s, 1), false);  // 敵
    assert.strictEqual(e.placeMove(s, 5), true);
    assert.strictEqual(budsOn(s.board[4]), 1);     // 受け手1つ → 全部
    assert.strictEqual(budsOn(s.board[5]), 1);
    for (const k of [6, 9, 1, 10]) assert.strictEqual(budsOn(s.board[k]), 0);
    assert.strictEqual(s.heartTurn, true);
    const t = game();
    t.heartTurn = true; t.heartMagic = 20;
    t.board[5] = { player: '💙', bind: 3, effects: [BUD] }; // 隣に受け取れるコマ無し
    e.SKILLS.sucker(t);
    assert.strictEqual(t.useSucker, false);
    assert.strictEqual(t.heartMagic, 20);
    // 受け手が4つ: 付くのは2つだけ（重複なし）。シードを変えても常に2つ、選ばれる顔ぶれは変わり得る
    const seen = new Set();
    for (let seed = 1; seed <= 20; seed++) {
        const u = e.newGame({ heartChar: 'you', circleChar: 'you', rng: e.makeRng(seed) });
        u.heartTurn = true; u.heartMagic = 20;
        u.board[5] = { player: '💙', bind: 3, effects: [BUD] };
        for (const k of [1, 4, 6, 9]) u.board[k] = { player: '💙', bind: 3, effects: [] };
        e.SKILLS.sucker(u);
        e.placeMove(u, 5);
        const got = [1, 4, 6, 9].filter((k) => budsOn(u.board[k]) === 1);
        assert.strictEqual(got.length, 2);
        assert.strictEqual([1, 4, 6, 9].reduce((n, k) => n + budsOn(u.board[k]), 0), 2);
        seen.add(got.join(','));
    }
    assert.ok(seen.size > 1);
    // 受け手がちょうど2つなら両方
    const w = game();
    w.heartTurn = true; w.heartMagic = 20;
    w.board[5] = { player: '💙', bind: 3, effects: [BUD] };
    for (const k of [4, 6]) w.board[k] = { player: '💙', bind: 3, effects: [] };
    e.SKILLS.sucker(w);
    e.placeMove(w, 5);
    assert.strictEqual(budsOn(w.board[4]) + budsOn(w.board[6]), 2);
    // graft の picked は receivers との共通部分に限る
    const th = require('./shared/thermal');
    const b = w.board.map((x) => ({ ...x, effects: [] }));
    b[5] = { player: '💙', bind: 3, effects: [BUD] };
    assert.deepStrictEqual(th.graft(b, 5, '💙', w.size, [4, 10]), [4]);
    assert.strictEqual(th.GRAFT_MAX, 2);
});

test('風の落とし子: canBud の自陣コマに重複なしでランダムに2つ🌱を足す（コスト4）。候補が無ければ不可', () => {
    const s = game();
    s.heartTurn = true; s.heartMagic = 20;
    s.board[1] = { player: '💙', bind: 3, effects: [] };
    s.board[2] = { player: '💙', bind: 3, effects: [FRZ] };
    s.board[3] = { player: '⭕', bind: 3, effects: [] };
    const before = s.heartMagic;
    e.SKILLS.windborne(s);
    assert.strictEqual(s.heartMagic, before - 4);
    assert.strictEqual(budsOn(s.board[1]), 1); // 候補が1つだけなので1つだけ（1マスに1つまで）
    assert.strictEqual(budsOn(s.board[2]) + budsOn(s.board[3]), 0);
    assert.strictEqual(s.heartTurn, true);
    const t = game();
    t.heartTurn = true; t.heartMagic = 20;
    e.SKILLS.windborne(t);
    assert.strictEqual(t.heartMagic, 20);
    // 候補が複数あれば、異なる2マスに1つずつ
    for (let seed = 1; seed <= 20; seed++) {
        const u = e.newGame({ heartChar: 'you', circleChar: 'you', rng: e.makeRng(seed) });
        u.heartTurn = true; u.heartMagic = 20;
        [1, 2, 3, 4].forEach((i) => { u.board[i] = { player: '💙', bind: 3, effects: [] }; });
        e.SKILLS.windborne(u);
        const counts = [1, 2, 3, 4].map((i) => budsOn(u.board[i]));
        assert.deepStrictEqual(counts.slice().sort(), [0, 0, 1, 1]);
    }
});

test('新スキル4種のコスト: 毒使い+1・軍師+2の通常補正', () => {
    const p = game('poisoner', 'you'); p.heartTurn = true; p.heartMagic = 20;
    p.board[1] = { player: '💙', bind: 3, effects: [BUD] };
    e.SKILLS.harvestEve(p);
    assert.strictEqual(p.heartMagic, 20 - 3 + 1);
    const t = game('tactician', 'you'); t.heartTurn = true; t.heartMagic = 20;
    e.SKILLS.solstice(t);
    assert.strictEqual(t.heartMagic, 20 - 6);
    assert.strictEqual(e.skillCosts.onClickHarvestEve, 2);
    assert.strictEqual(e.skillCosts.onClickSolstice, 4);
    assert.strictEqual(e.skillCosts.onClickSucker, 4);
    assert.strictEqual(e.skillCosts.onClickWindborne, 4);
});

test('火炎: ターン進行で1スタックにつき2ダメージ（スタック2なら4）。継続ダメージでは消えない', () => {
    const s = game();
    s.heartTurn = true; s.life = 3;
    s.board[5] = { player: '⭕', bind: 9, effects: [FLM, FLM] };
    e.placeMove(s, 0);
    assert.strictEqual(s.board[5].bind, 9 - 1 - 4);
    assert.strictEqual(s.board[5].effects.filter((x) => x.effect === '🔥').length, 2);
});

test('バーンアウト: 🔥が乗っているマスを全て破壊（敵味方問わず）。盤面に🔥が4つ以上あればタダ、なければ5コスト', () => {
    const s = game('magician', 'you');
    s.heartTurn = true; s.heartMagic = 20; s.life = 3;
    s.board[1] = { player: '⭕', bind: 5, effects: [FLM] };
    s.board[2] = { player: '💙', bind: 5, effects: [FLM] };
    s.board[3] = { player: '⭕', bind: 5, effects: [] };
    assert.strictEqual(e.burnoutCost(s), 5);
    s.board[4] = { player: '⭕', bind: 5, effects: [FLM, FLM] }; // 合計4スタック（マスの数ではなくスタック）
    assert.strictEqual(e.burnoutCost(s), 0);
    const before = s.heartMagic;
    e.SKILLS.burnout(s);
    assert.strictEqual(s.heartMagic, before);
    for (const k of [1, 2, 4]) assert.deepStrictEqual(s.board[k], { player: undefined, bind: 0, effects: [] });
    assert.strictEqual(s.board[3].player, '⭕');
    s.board[1] = { player: '⭕', bind: 5, effects: [FLM] };
    const m = s.heartMagic;
    e.SKILLS.burnout(s); // 🔥1つなので5コスト
    assert.strictEqual(s.heartMagic, m - 5);
    e.SKILLS.burnout(s); // 対象なし: 何も起きない
    assert.strictEqual(s.heartMagic, m - 5);
});

test('火炎: スキルダメージは1.5倍（切り上げ）で、通れば🔥は消える', () => {
    const s = game();
    s.heartTurn = true; s.heartMagic = 20;
    s.board[5] = { player: '⭕', bind: 6, effects: [FLM] };
    s.board[6] = { player: '⭕', bind: 6, effects: [] };
    e.SKILLS.opium(s);
    assert.strictEqual(s.board[5].bind, 3); // -2 ×1.5 = -3
    assert.ok(!s.board[5].effects.some((x) => x.effect === '🔥'));
    assert.strictEqual(s.board[6].bind, 4);
});

test('火炎: 煉獄の鍛冶師が敵席に居ると、持ち主以外の火炎ダメージが1回につき+1（本人の席は+0）', () => {
    const s = game('pyromancer', 'you');
    s.heartTurn = true; s.life = 3;
    s.board[5] = { player: '💙', bind: 9, effects: [FLM] };            // 煉獄の鍛冶師自身のコマ: 通常の2のみ
    s.board[6] = { player: '⭕', bind: 9, effects: [FLM] };            // 敵のコマ: 2+1
    s.board[7] = { player: '⭕', bind: 9, effects: [FLM, FLM] };       // スタック2: 4+1（1回につき+1）
    e.placeMove(s, 0);
    assert.strictEqual(s.board[5].bind, 9 - 1 - 2);
    assert.strictEqual(s.board[6].bind, 9 - 1 - 3);
    assert.strictEqual(s.board[7].bind, 9 - 1 - 5);
    const t = game('pyromancer', 'pyromancer');
    t.heartTurn = true; t.life = 3;
    t.board[5] = { player: '⭕', bind: 9, effects: [FLM] };
    t.board[6] = { player: '💙', bind: 9, effects: [FLM] };
    e.placeMove(t, 0);
    assert.strictEqual(t.board[5].bind, 9 - 1 - 3); // 複数いても+1
    assert.strictEqual(t.board[6].bind, 9 - 1 - 3);
    const th = require('./shared/thermal');
    const frozen = { player: '⭕', bind: 5, effects: [FLM, FRZ] };
    assert.strictEqual(th.burnDamageOf(frozen, ['pyromancer', 'you'], e.SYMBOLS), 0);
    assert.strictEqual(th.burnDamageOf({ player: '⭕', bind: 0, effects: [FLM] }, ['pyromancer', 'you'], e.SYMBOLS), 0);
    assert.strictEqual(th.burnDamageOf({ player: '⭕', bind: 5, effects: [FLM] }, ['you', 'you'], e.SYMBOLS), 2);
});

test('火遁: 氷結中のマスは❄が全スタック解除されるだけで🔥は付かず、隣の氷結も解けない', () => {
    const s = game();
    s.heartTurn = true; s.heartMagic = 20;
    s.board[5] = { player: '⭕', bind: 4, effects: [FRZ, FRZ] };
    s.board[6] = { player: '⭕', bind: 4, effects: [FRZ] };
    e.SKILLS.ignite(s);
    assert.strictEqual(e.placeMove(s, 5), true);
    assert.strictEqual(s.board[5].effects.filter((x) => x.effect === '❄').length, 0);
    assert.ok(!s.board[5].effects.some((x) => x.effect === '🔥'));
    assert.ok(s.board[6].effects.some((x) => x.effect === '❄'));
    assert.strictEqual(s.heartTurn, true);
});

test('発火: 🔥が実際に付くと縦横隣の氷結が全スタック解除される（斜めは解けない）', () => {
    const s = game();
    s.heartTurn = true; s.heartMagic = 20;
    s.board[5] = { player: '⭕', bind: 4, effects: [] };            // 付与先（非氷結）
    s.board[6] = { player: '⭕', bind: 4, effects: [FRZ, FRZ] };   // 隣: 全解除
    s.board[10] = { player: '⭕', bind: 4, effects: [FRZ] };        // 斜め
    e.SKILLS.ignite(s);
    assert.strictEqual(e.placeMove(s, 5), true);
    assert.ok(s.board[5].effects.some((x) => x.effect === '🔥'));
    assert.ok(!s.board[6].effects.some((x) => x.effect === '❄'));
    assert.ok(s.board[10].effects.some((x) => x.effect === '❄'));
    assert.strictEqual(s.heartTurn, true); // 手番は進まない
});

test('氷結（idx30）: 空きマスにも置け、氷結済みでも❄が積み増せ、🌱は消えない（休眠）。🔑中は選べない', () => {
    const s = game();
    s.heartTurn = true; s.heartMagic = 20;
    s.board[5] = { player: '⭕', bind: 4, effects: [FRZ] };
    s.board[6] = { player: '⭕', bind: 4, effects: [{ effect: '🌱' }, { effect: '🌱' }] };
    s.board[7] = { player: '⭕', bind: 4, effects: [{ effect: '🔑' }] };
    e.SKILLS.freeze(s);
    assert.strictEqual(e.placeMove(s, 7), false);       // 🔑中
    assert.strictEqual(e.placeMove(s, 5), true);         // 氷結済みに重ねる
    assert.strictEqual(s.board[5].effects.filter((x) => x.effect === '❄').length, 2);
    e.SKILLS.freeze(s);
    assert.strictEqual(e.placeMove(s, 6), true);
    assert.strictEqual(budsOn(s.board[6]), 2); // 氷結しても🌱は残る
    e.SKILLS.freeze(s);
    assert.strictEqual(e.placeMove(s, 0), true);         // 空きマスにも置ける
    assert.strictEqual(s.board[0].effects.filter((x) => x.effect === '❄').length, 1);
});

test('氷結中の空きマスには誰も着手できない。ランダム設置先にも選ばれない。範囲スキルで❄が1つ減るだけ', () => {
    const s = game();
    s.heartTurn = true; s.life = 3;
    s.board[0] = { player: undefined, bind: 0, effects: [FRZ] };
    assert.strictEqual(e.placeMove(s, 0), false);
    assert.ok(!e.findEmptyIndexes(s.board).includes(0));
    assert.strictEqual(s.board[0].player, undefined);
    // 全マスが氷結空きなら、トークンの設置先が無い
    const t = game();
    t.heartTurn = true; t.heartMagic = 20;
    for (let k = 0; k < t.board.length; k++) t.board[k] = { player: undefined, bind: 0, effects: [FRZ, FRZ] };
    e.SKILLS.token(t);
    assert.ok(t.board.every((sq) => !sq.player));
    // ストンプ: 空き氷結は❄が1つ減るだけ。中心が氷結空きなら自コマは置かれない
    const g = game('giant', 'you');
    g.heartTurn = true; g.heartMagic = 20;
    g.board[5] = { player: undefined, bind: 0, effects: [FRZ, FRZ] };
    g.board[6] = { player: undefined, bind: 0, effects: [FRZ] };
    e.SKILLS.stomp(g);
    e.placeMove(g, 5);
    assert.strictEqual(g.board[5].effects.filter((x) => x.effect === '❄').length, 1);
    assert.strictEqual(g.board[5].player, undefined);
    assert.strictEqual(g.board[6].effects.length, 0);
});

test('氷室の番人: 常在のロックは「氷結」に置き換わる（コスト2・1マスを氷結・空きマス可）。ダブルロックは通常のロック', () => {
    const s = game('cryomancer', 'you');
    s.heartTurn = true; s.heartMagic = 20;
    const before = s.heartMagic;
    e.SKILLS.lock(s);
    assert.strictEqual(s.heartMagic, before - 2);
    assert.strictEqual(s.useLock, 0);
    assert.strictEqual(s.useFreeze, true);
    assert.strictEqual(e.placeMove(s, 3), true);
    assert.strictEqual(s.board[3].effects.filter((x) => x.effect === '❄').length, 1);
    e.SKILLS.doubleLock(s);
    assert.strictEqual(s.useLock, 2);
    const t = game('you', 'you');
    t.heartTurn = true; t.heartMagic = 20;
    e.SKILLS.lock(t);
    assert.strictEqual(t.useLock, 1);
});

test('絶対零度のコスト: 氷結が作られるたび全席-1（誰が使っても）、撃ったらその席だけリセット、下限1', () => {
    const s = game('cryomancer', 'cryomancer');
    s.heartTurn = true; s.heartMagic = 60;
    assert.deepStrictEqual(s.glacierCharge, [0, 0]);
    assert.strictEqual(e.glacierCost(s), 10);
    // 自分の氷結（氷室の番人のロック置換）で作る
    e.SKILLS.lock(s); e.placeMove(s, 0);
    assert.deepStrictEqual(s.glacierCharge, [1, 1]);
    assert.strictEqual(e.glacierCost(s), 9);
    // 汎用の氷結(idx30)でも数える。ここでは席1が撃つ想定で手番を渡す
    s.heartTurn = false; s.circleMagic = 60;
    e.SKILLS.freeze(s); e.placeMove(s, 1);
    assert.deepStrictEqual(s.glacierCharge, [2, 2]);
    // 席0が戻って、他席の氷結でも安くなっている
    s.heartTurn = true;
    assert.strictEqual(e.glacierCost(s), 8);
    // 氷結の対象選択が通らなかった（🔥のマス）ときは数えない。氷結済みへの重ね掛けは数える
    s.board[5] = { player: '⭕', bind: 3, effects: [FLM] };
    e.SKILLS.freeze(s); assert.strictEqual(e.placeMove(s, 5), false);
    assert.deepStrictEqual(s.glacierCharge, [2, 2]);
    assert.strictEqual(e.placeMove(s, 0), true);
    assert.deepStrictEqual(s.glacierCharge, [3, 3]);
    // 撃つと席0だけ0に戻る。自身の freezeAll の❄は数えない
    const cost = e.glacierCost(s);
    assert.strictEqual(cost, 7);
    const before = s.heartMagic;
    s.board[5] = { player: undefined, bind: 0, effects: [] };
    e.SKILLS.glacier(s);
    assert.strictEqual(s.heartMagic, before - cost);
    assert.deepStrictEqual(s.glacierCharge, [0, 3]);
    // 席1はまだ軽減が残っている
    // 下限1
    s.glacierCharge[0] = 50;
    assert.strictEqual(e.glacierCost(s), 1);
    // 業火・発火による氷結の増減は数えない
    const t = game('pyromancer', 'you');
    t.heartTurn = true; t.heartMagic = 30;
    t.board[1] = { player: '⭕', bind: 3, effects: [FRZ] };
    t.board[2] = { player: '⭕', bind: 3, effects: [] };
    e.SKILLS.inferno(t);
    assert.deepStrictEqual(t.glacierCharge, [0, 0]);
});

test('絶対零度: 使用時に🔑のない全マス（空きマス含む）に❄+1。手番は続き、発動待ちの再使用は不可', () => {
    const s = game('cryomancer', 'you');
    s.heartTurn = true; s.heartMagic = 30;
    s.board[1] = { player: '💙', bind: 3, effects: [{ effect: '🌱' }] };
    s.board[2] = { player: '⭕', bind: 3, effects: [{ effect: '🔑' }] };
    s.board[3] = { player: '⭕', bind: 3, effects: [FRZ] };
    const cost = e.glacierCost(s);
    const before = s.heartMagic;
    e.SKILLS.glacier(s);
    assert.strictEqual(s.heartMagic, before - cost);
    assert.strictEqual(s.heartTurn, true);
    assert.strictEqual(s.glacierPending[0], true);
    assert.strictEqual(s.board[0].effects.filter((x) => x.effect === '❄').length, 1);
    assert.strictEqual(s.board[3].effects.filter((x) => x.effect === '❄').length, 2);
    assert.strictEqual(s.board[2].effects.filter((x) => x.effect === '❄').length, 0); // 🔑は除く
    assert.strictEqual(budsOn(s.board[1]), 1); // 氷結してもバッズは消えない（休眠）
    const m = s.heartMagic;
    e.SKILLS.glacier(s); // 発動待ち中は不発
    assert.strictEqual(s.heartMagic, m);
    assert.strictEqual(s.board[0].effects.filter((x) => x.effect === '❄').length, 1);
});

test('絶対零度: 次の自分の手番開始時に、敵の❄マスへ❄スタック×3ダメージ→❄全除去。0以下は破壊。空きマスの❄は全除去、自陣の❄は残す', () => {
    const s = game('cryomancer', 'you');
    s.heartTurn = true; s.heartMagic = 30; s.life = 3;
    s.board[4] = { player: '⭕', bind: 12, effects: [FRZ, FRZ, { effect: '🔥' }] }; // 🔥のマスには使用で❄が増えない → ❄2 → 6ダメージ → 6、🔥消える
    s.board[5] = { player: '⭕', bind: 5, effects: [FRZ, FRZ] };                       // ❄3 → 9ダメージ → 破壊
    s.board[6] = { player: '⭕', bind: 8, effects: [] };                               // ❄なし → 全マス+1で❄1 → 3ダメージ
    s.board[7] = { player: '💙', bind: 5, effects: [FRZ] };                            // 自陣
    s.board[8] = { player: undefined, bind: 0, effects: [FRZ] };                       // 空き
    e.SKILLS.glacier(s);
    // 手番を進める: 自分(席0)→相手(席1)→自分
    e.SKILLS.charge(s); // 全マス氷結なので空きマスには置けない。チャージで手番を終える
    assert.strictEqual(s.heartTurn, false);
    assert.strictEqual(s.glacierPending[0], true); // まだ発動しない
    e.SKILLS.charge(s);
    assert.strictEqual(s.heartTurn, true);
    assert.strictEqual(s.glacierPending[0], false);
    // チャージは減衰しない
    assert.strictEqual(s.board[4].bind, 12 - 6);
    assert.ok(s.board[4].effects.length === 0);
    assert.strictEqual(s.board[5].player, undefined);
    assert.strictEqual(s.board[5].effects.length, 0);
    assert.strictEqual(s.board[6].bind, 8 - 3);
    assert.strictEqual(s.board[6].effects.length, 0);
    assert.ok(s.board[7].effects.some((x) => x.effect === '❄')); // 自陣は触らない
    assert.strictEqual(s.board[8].effects.length, 0); // 空きマスの❄はダメージなしで全除去
    assert.strictEqual(s.board[0].effects.length, 0);
});

test('業火: 自分以外の全コマ（ライフ0含む）に🔥+2。🔑・自コマ・空きマスは対象外。クリック不要・手番は続きコスト7', () => {
    const s = game('pyromancer', 'you');
    s.heartTurn = true; s.heartMagic = 20;
    s.board[5] = { player: '⭕', bind: 3, effects: [] };
    s.board[6] = { player: '⭕', bind: 0, effects: [] };
    s.board[4] = { player: '💙', bind: 3, effects: [] };
    s.board[9] = { player: '⭕', bind: 3, effects: [{ effect: '🔑' }] };
    s.board[8] = { player: '⭕', bind: 3, effects: [FRZ, FRZ, FRZ] };  // 1つ目で氷結が全解除 → 2つ目が🔥
    s.board[11] = { player: '⭕', bind: 3, effects: [FRZ] };           // 氷結1つ減って、余り1スタックが🔥
    const before = s.heartMagic;
    const cost = e.infernoCost(s);
    assert.strictEqual(cost, 7);
    e.SKILLS.inferno(s);
    assert.strictEqual(s.heartMagic, before - cost);
    assert.strictEqual(s.heartTurn, true);
    const fl = (i) => s.board[i].effects.filter((x) => x.effect === '🔥').length;
    const fr = (i) => s.board[i].effects.filter((x) => x.effect === '❄').length;
    assert.strictEqual(fl(5), 2); assert.strictEqual(s.board[5].bind, 1); // ライフ3: 付与のたびに1ダメージで 3→1
    assert.strictEqual(s.board[6].player, undefined); assert.strictEqual(fl(6), 0); // ライフ0のコマは🔥で破壊され空きマスになる
    assert.strictEqual(fl(4), 0); assert.strictEqual(fl(9), 0); assert.strictEqual(fl(0), 0);
    assert.strictEqual(fr(8), 0); assert.strictEqual(fl(8), 1); // 1つ目で氷結が全解除、2つ目が🔥
    assert.strictEqual(fr(11), 0); assert.strictEqual(fl(11), 1);
    // 対象が無ければ不発（魔力を払わない）
    const t = game('pyromancer', 'you');
    t.heartTurn = true; t.heartMagic = 20;
    e.SKILLS.inferno(t);
    assert.strictEqual(t.heartMagic, 20);
});

test('業火: 雷霆の巫の⚡無敵コマは対象外', () => {
    const s = game('pyromancer', 'electrician');
    s.heartTurn = true; s.heartMagic = 20;
    s.board[5] = { player: '⭕', bind: 3, effects: [{ effect: '⚡' }] };
    s.board[6] = { player: '⭕', bind: 3, effects: [] };
    e.SKILLS.inferno(s);
    assert.strictEqual(s.board[5].effects.filter((x) => x.effect === '🔥').length, 0);
    assert.strictEqual(s.board[6].effects.filter((x) => x.effect === '🔥').length, 2);
});

test('氷室の番人・煉獄の鍛冶師・新スキル(idx30/31)が登録されている。ライフ平均は氷室の番人5・煉獄の鍛冶師6', () => {
    assert.ok(e.CHARACTERS.includes('cryomancer') && e.CHARACTERS.includes('pyromancer'));
    assert.strictEqual(e.POOL_SIZE, 49);
    assert.strictEqual(e.skillCosts.onClickGlacier, 10);
    assert.strictEqual(e.skillCosts.onClickInferno, 7);
    assert.strictEqual(e.skillCosts.onClickFreeze, 3);
    assert.strictEqual(e.skillCosts.onClickIgnite, 3);
    const mean = (c, bonus = 0) => Array.from({ length: 400 }, (_, k) => e.calculateLife(c, undefined, e.makeRng(k + 1), bonus)).reduce((a, b) => a + b, 0) / 400;
    assert.ok(Math.abs(mean('cryomancer') - 4) < 1);
    assert.ok(Math.abs(mean('pyromancer') - 6) < 1);
});


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
const flames = (sq) => sq.effects.filter((x) => x.effect === '🔥').length;
const frosts = (sq) => sq.effects.filter((x) => x.effect === '❄').length;

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
    const th = require('./shared/thermal');
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
    const th = require('./shared/thermal');
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
const geo4 = require('./shared/boardGeometry');
const chargeOf = (st) => st.glacierCharge.slice();

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
    const th = require('./shared/thermal');
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
    const th = require('./shared/thermal');
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
    const th = require('./shared/thermal');
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
    const th = require('./shared/thermal');
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
    assert.deepStrictEqual(keys.slice(keys.indexOf('onClickSacrifice')), ['onClickSacrifice', 'onClickFrostArea', 'onClickIcicle', 'onClickRandomFreeze', 'onClickFreezeSpread', 'onClickFrostToken', 'onClickDoubleFrostToken', 'onClickShatter', 'onClickFrostfall', 'onClickBoost', 'onClickRelocate', 'onClickClone', 'onClickPlunder', 'onClickMarkdown', 'onClickEffectDiscount', 'onClickTokenDiscount', 'onClickVitalMarkdown', 'onClickUniqueDiscount', 'onClickClearance', 'onClickRandomCast', 'onClickCounterMarkdown', 'onClickBurnout', 'onClickLeafToken', 'onClickTwinLeafToken', 'onClickDoubleLeafToken', 'onClickLeafAll', 'onClickBonfire', 'onClickMulch', 'onClickAutumn', 'onClickLeafFrost', 'onClickSpringWind', 'onClickKimon', 'onClickFireWheel', 'onClickStrip', 'onClickChargeSeason', 'onClickBristle', 'onClickRelease', 'onClickStash', 'onClickThunderFire', 'onClickDarkPot', 'onClickChargeHeal', 'onClickLeafDrop', 'onClickKindling', 'onClickLeafCloak', 'onClickTinder', 'onClickSmallFry', 'onClickFirstFrost', 'onClickGather', 'onClickBurnOff', 'onClickFreeToken', 'onClickSpark', 'onClickNightVeil', 'onClickGraveDiscount', 'onClickPoisonWard']);
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

const LEAF = { effect: '🍂' };
const leavesOn = (sq) => sq.effects.filter((x) => x.effect === '🍂').length;

test('🍂落ち葉: 他の席の🍂の枚数ぶんスキルコストが上がる（自陣の🍂は数えない・氷結中は休眠・上限なし）', () => {
    const s = game();
    s.heartTurn = true; s.heartMagic = 30;
    const base = e.calculateCost(s, 3, false, false, 'onClickAddLife');
    s.board[0] = { player: '💙', bind: 3, effects: [LEAF, LEAF] }; // 自陣
    assert.strictEqual(e.calculateCost(s, 3, false, false, 'onClickAddLife'), base);
    s.board[1] = { player: '⭕', bind: 3, effects: [LEAF, LEAF, LEAF] };
    assert.strictEqual(e.calculateCost(s, 3, false, false, 'onClickAddLife'), base + 3);
    s.board[2] = { player: '⭕', bind: 3, effects: [LEAF, FRZ] }; // 氷結中は休眠
    assert.strictEqual(e.calculateCost(s, 3, false, false, 'onClickAddLife'), base + 3);
    for (let i = 3; i < 8; i++) s.board[i] = { player: '⭕', bind: 3, effects: [LEAF, LEAF] };
    assert.strictEqual(e.calculateCost(s, 3, false, false, 'onClickAddLife'), base + 3 + 10);
});

test('🍂落ち葉トークン3種: 自陣のコマに🍂を付けて置く（コスト5/8/9・トークンはターン1回）', () => {
    const run = (key, pre) => {
        const s = game(); s.heartTurn = true; s.heartMagic = 30;
        e.SKILLS[key](s);
        assert.strictEqual(s.usedTokenThisTurn, true);
        return s;
    };
    let s = run('leafToken');
    assert.strictEqual(s.heartMagic, 30 - 5);
    assert.deepStrictEqual(s.board.map(leavesOn).filter((n) => n > 0), [1]);
    s = run('twinLeafToken');
    assert.strictEqual(s.heartMagic, 30 - 8);
    assert.deepStrictEqual(s.board.map(leavesOn).filter((n) => n > 0), [2]);
    s = run('doubleLeafToken');
    assert.strictEqual(s.heartMagic, 30 - 9);
    assert.deepStrictEqual(s.board.map(leavesOn).filter((n) => n > 0), [1, 1]);
    assert.strictEqual(s.board.filter((q) => q.player === '💙').length, 2);
});

test('焚き火の唄 / 腐葉土の目覚め / 一葉知秋: 効果とコスト', () => {
    const s = game(); s.heartTurn = true; s.heartMagic = 30;
    s.board[0] = { player: '⭕', bind: 3, effects: [LEAF, LEAF] };
    s.board[1] = { player: '⭕', bind: 3, effects: [LEAF, { effect: '🔑' }] };
    const bonfireCost = e.calculateCost(s, e.skillCosts.onClickBonfire, false, false, 'onClickBonfire');
    assert.strictEqual(bonfireCost, 3 + 3); // 基礎3 + 敵陣の🍂3枚（払うコストは除去する前の盤面で決まる）
    e.SKILLS.bonfire(s);
    assert.strictEqual(s.heartMagic, 30 - bonfireCost);
    assert.strictEqual(leavesOn(s.board[0]), 0);
    assert.strictEqual(leavesOn(s.board[1]), 1); // ロック中は対象外
    s.board[5] = { player: '💙', bind: 3, effects: [LEAF] };
    const before = s.heartMagic;
    const mulchCost = e.calculateCost(s, e.skillCosts.onClickMulch, false, false, 'onClickMulch');
    e.SKILLS.mulch(s);
    assert.strictEqual(s.heartMagic, before - mulchCost);
    assert.strictEqual(leavesOn(s.board[5]), 0);
    assert.strictEqual(s.board[5].effects.filter((x) => x.effect === '🌱').length, 1);
    const b2 = s.heartMagic;
    s.board[6] = { player: '⭕', bind: 3, effects: [BUD, BUD] };
    const autumnCost = e.calculateCost(s, e.skillCosts.onClickAutumn, false, false, 'onClickAutumn');
    e.SKILLS.autumn(s);
    assert.strictEqual(s.heartMagic, b2 - autumnCost);
    assert.strictEqual(leavesOn(s.board[6]), 2);
    assert.strictEqual(leavesOn(s.board[5]), 1); // 自陣の🌱も🍂になる
});

test('🍂落ち葉: 🔥が付くと燃えて消える（sim/thermal ignite）', () => {
    const th = require('./shared/thermal');
    const b = Array.from({ length: 16 }, () => ({ player: undefined, bind: 0, effects: [] }));
    b[5] = { player: '💙', bind: 3, effects: [BUD, LEAF, { effect: '☠' }] };
    th.ignite(b, [5], 4);
    assert.deepStrictEqual(b[5].effects.map((x) => x.effect), ['☠', '🔥']);
    const g = Array.from({ length: 16 }, () => ({ player: undefined, bind: 0, effects: [] }));
    g[5] = { player: '💙', bind: 3, effects: [BUD, LEAF] };
    th.ignite(g, [5], 4, 1, () => true);
    assert.deepStrictEqual(g[5].effects.map((x) => x.effect), ['🌱', '🔥']);
});

test('霜枯れ: 自陣の🍂マスに❄を付ける（コスト3）。氷結中の🍂は休眠してコスト上乗せが止まる。対象が無ければ使えない', () => {
    const s = game(); s.heartTurn = true; s.heartMagic = 30;
    assert.strictEqual(e.leafFrostLegal(s), false);
    s.board[0] = { player: '💙', bind: 3, effects: [LEAF] };
    s.board[1] = { player: '💙', bind: 3, effects: [LEAF, { effect: '🔑' }] };
    s.board[2] = { player: '⭕', bind: 3, effects: [LEAF] };
    assert.strictEqual(e.leafFrostLegal(s), true);
    const seatCost = (seat) => e.gearCost(s, 3, false, seat, 'onClickAddLife');
    const taxedFor1 = seatCost(1); // 💙の🍂2枚ぶん
    const cost = e.calculateCost(s, e.skillCosts.onClickLeafFrost, false, false, 'onClickLeafFrost');
    e.SKILLS.leafFrost(s);
    assert.strictEqual(s.heartMagic, 30 - cost);
    assert.strictEqual(s.board[0].effects.filter((x) => x.effect === '❄').length, 1);
    assert.strictEqual(s.board[1].effects.filter((x) => x.effect === '❄').length, 0); // ロック中は対象外
    assert.strictEqual(s.board[2].effects.filter((x) => x.effect === '❄').length, 0); // 敵のコマは対象外
    assert.strictEqual(seatCost(1), taxedFor1 - 1); // b[0] の🍂が休眠した
    assert.strictEqual(e.skillCosts.onClickLeafFrost, 3);
});

test('春一番: 自陣の❄を全て解除し、解除した数だけこのターンに打つ全スキルを軽減（自分は軽減されない・最低1・ターンを跨がない）', () => {
    const s = game(); s.heartTurn = true; s.heartMagic = 30;
    assert.strictEqual(e.springWindLegal(s), false);
    s.board[0] = { player: '💙', bind: 3, effects: [FRZ, FRZ] };
    s.board[1] = { player: '💙', bind: 3, effects: [FRZ] };
    s.board[2] = { player: '⭕', bind: 3, effects: [FRZ] };
    assert.strictEqual(e.springWindLegal(s), true);
    const springCost = e.calculateCost(s, e.skillCosts.onClickSpringWind, false, false, 'onClickSpringWind');
    assert.strictEqual(springCost, 2);
    const before = e.calculateCost(s, 6, false, false, 'onClickSlash');
    e.SKILLS.springWind(s);
    assert.strictEqual(s.heartMagic, 30 - 2);
    assert.strictEqual(s.board[0].effects.length + s.board[1].effects.length, 0); // 自陣の❄は全部解除
    assert.strictEqual(s.board[2].effects.length, 1); // 敵の❄はそのまま
    assert.strictEqual(s.discount[0].turn, 3);
    assert.strictEqual(e.calculateCost(s, 6, false, false, 'onClickSlash'), before - 3); // このターンに打つスキルが-3
    assert.strictEqual(e.calculateCost(s, 2, false, false, 'onClickAddLife'), 1); // 最低1
    assert.strictEqual(e.calculateCost(s, e.skillCosts.onClickSpringWind, false, false, 'onClickSpringWind'), 2); // 自分自身は軽減されない
    e.SKILLS.springWind(s); // 解除する❄が無ければ何も起きない
    assert.strictEqual(s.heartMagic, 30 - 2);
    assert.strictEqual(s.discount[0].turn, 3);
    // 軽減はこの手番だけ（次の手番の開始で空に戻る）
    s.heartTurn = false; e.advanceTurn(s);
    assert.strictEqual(s.discount[0].turn, 0);
});

test('鬼門封じ: 敵コマを破壊して3ターンロック（氷結中は❄-1だけ）。守られた敵・自陣は選べない。コスト6', () => {
    const s = game(); s.heartTurn = true; s.heartMagic = 30;
    assert.strictEqual(e.kimonCandidates(s).length, 0);
    s.board[0] = { player: '⭕', bind: 3, effects: [] };
    s.board[1] = { player: '⭕', bind: 3, effects: [{ effect: '🔑' }] };
    s.board[2] = { player: '⭕', bind: 3, effects: [FRZ, FRZ] };
    s.board[3] = { player: '💙', bind: 3, effects: [] };
    assert.deepStrictEqual(e.kimonCandidates(s), [0, 2]);
    const cost = e.calculateCost(s, e.skillCosts.onClickKimon, false, false, 'onClickKimon');
    assert.strictEqual(cost, 6);
    e.SKILLS.kimon(s);
    assert.strictEqual(s.heartMagic, 30 - 6);
    assert.strictEqual(e.placeMove(s, 3), false); // 自陣は選べない（待ちが続く）
    assert.strictEqual(e.placeMove(s, 2), true); // 氷結中: ❄が1つ減るだけ
    assert.strictEqual(s.board[2].player, '⭕');
    assert.strictEqual(s.board[2].effects.filter((x) => x.effect === '❄').length, 1);
    assert.strictEqual(s.useKimon, false);
    s.heartTurn = true; s.turn = 0; s.heartMagic = 30;
    e.SKILLS.kimon(s);
    assert.strictEqual(e.placeMove(s, 0), true);
    assert.strictEqual(s.board[0].player, undefined);
    assert.strictEqual(s.board[0].bind, 3);
    assert.strictEqual(s.board[0].effects.filter((x) => x.effect === '🔑').length, 1);
});

test('火の車: ランダムな敵2マスに🔥、手札をシャッフル。このターン敵か自陣に🔥を付与していれば0コスト、撃つとリセット', () => {
    const s = game(); s.heartTurn = true; s.heartMagic = 30;
    s.board[0] = { player: '⭕', bind: 3, effects: [] };
    s.board[1] = { player: '⭕', bind: 3, effects: [] };
    s.board[2] = { player: '⭕', bind: 3, effects: [] };
    s.board[3] = { player: '💙', bind: 3, effects: [] };
    assert.strictEqual(e.fireWheelLegal(s), true);
    const flames = () => s.board.reduce((n, q) => n + q.effects.filter((x) => x.effect === '🔥').length, 0);
    const price = () => e.calculateCost(s, e.skillCosts.onClickFireWheel, false, false, 'onClickFireWheel');
    assert.strictEqual(price(), 5);
    s.skills = [-1, -1, -1];
    e.SKILLS.fireWheel(s);
    assert.strictEqual(s.heartMagic, 30 - 5);
    assert.strictEqual(flames(), 2); // 敵2マスだけ
    assert.strictEqual(s.board[3].effects.length, 0); // 自陣には付かない
    assert.ok(s.skills.every((i) => i >= 0)); // 手札が引き直された
    assert.strictEqual(price(), 5); // 自分が付けた🔥はカウントされず、リセットされている
    // 自陣に🔥が付くと（他のスキルなどで）0コストになる
    s.board[3] = { player: '💙', bind: 3, effects: [FLM] };
    assert.strictEqual(price(), 0);
    const before = s.heartMagic;
    e.SKILLS.fireWheel(s);
    assert.strictEqual(s.heartMagic, before); // 無料
    assert.strictEqual(price(), 5); // 撃つとリセット
    // 次の手番の頭で基準が取り直される
    e.advanceTurn(s);
    assert.strictEqual(s.fireBase[s.turn], flames());
});

test('氷室の番人: 毎ターンの魔力は魔法使いと同じ基本分+1（合計+2。バッズ経済は魔法使いのみ）', () => {
    // 手番が回ってきた席の魔力増分（チャージで手番を渡す）を、氷室の番人とあなたで比べる
    const gain = (char) => {
        const g = game('you', char);
        const before = g.magic[1];
        e.SKILLS.charge(g); // 席0の手番を終えて席1へ
        return g.magic[1] - before;
    };
    assert.strictEqual(gain('cryomancer') - gain('you'), 1, `氷室の番人 +${gain('cryomancer')} / あなた +${gain('you')}`);
});


test('裸の王様: 相手のギアを、その席の次の手番の終わりまで無効にする（コスト4・ギアのある相手だけが対象）', () => {
    const s = e.newGame({ chars: ['you', 'you'], gears: [[], ['luckyPurse', 'quadMastery']], rng: e.makeRng(7) });
    s.magic[0] = 30;
    assert.strictEqual(e.stripLegal(s), true);
    assert.strictEqual(e.calculateCost(s, e.skillCosts.onClickStrip, false, false, 'onClickStrip'), 4);
    e.SKILLS.strip(s);
    assert.strictEqual(s.magic[0], 30 - 4);
    assert.deepStrictEqual(s.gears[1], []);
    assert.deepStrictEqual(s.gearHeld[1], ['luckyPurse', 'quadMastery']);
    assert.strictEqual(s.gearOff[1], true);
    assert.strictEqual(e.stripLegal(s), false); // もう無効なので撃てない
    // 相手の手番が終わるまで無効のまま。相手の手番が終わると装備が戻る
    s.currentTurn = 2; // 最初の手番(currentTurn<=1)は常に席0に戻る仕様なので、2手目以降として進める
    e.advanceTurn(s); // 席0の手番が終わる → 席1の手番へ
    assert.strictEqual(s.turn, 1);
    assert.deepStrictEqual(s.gears[1], []);
    e.advanceTurn(s); // 席1の手番が終わる
    assert.deepStrictEqual(s.gears[1], ['luckyPurse', 'quadMastery']);
    assert.strictEqual(s.gearOff[1], false);
    assert.strictEqual(s.gearHeld[1], null);
});

test('裸の王様: 価格破壊も無効になる（無効の間は基礎のコスト表）。ギアが無い相手には撃てない', () => {
    const s = e.newGame({ chars: ['you', 'you'], gears: [[], ['priceWreck']], rng: e.makeRng(3) });
    const wreck = e.costsOf(s, 1);
    assert.notStrictEqual(wreck, e.skillCosts);
    s.magic[0] = 30;
    e.SKILLS.strip(s);
    assert.strictEqual(e.costsOf(s, 1), e.skillCosts);
    const none = e.newGame({ chars: ['you', 'you'], gears: [[], []], rng: e.makeRng(3) });
    assert.strictEqual(e.stripLegal(none), false);
});

const BOLT = { effect: '⚡' };
const boltsOn = (sq) => sq.effects.filter((x) => x.effect === '⚡').length;

test('総毛立つ: 自陣の全コマ（🔑ロック中を除く）に⚡を1つずつ。雷霆の巫以外は乗った時点でダメージ。コスト6（このターンに⚡を付与するスキルを使っていれば-2）', () => {
    const s = e.newGame({ chars: ['electrician', 'you'], rng: e.makeRng(5) });
    s.magic[0] = 30;
    assert.strictEqual(e.bristleLegal(s), false);
    s.board[0] = { player: '💙', bind: 3, effects: [] };
    s.board[1] = { player: '💙', bind: 3, effects: [{ effect: '🔑' }] };
    s.board[2] = { player: '⭕', bind: 3, effects: [] };
    assert.strictEqual(e.bristleLegal(s), true);
    const cost = e.calculateCost(s, e.skillCosts.onClickBristle, false, false, 'onClickBristle');
    assert.strictEqual(cost, 6);
    e.SKILLS.bristle(s);
    assert.strictEqual(s.magic[0], 30 - cost);
    assert.strictEqual(boltsOn(s.board[0]), 1);
    assert.strictEqual(s.board[0].bind, 3); // 雷霆の巫は乗った時点のダメージを受けない
    assert.strictEqual(boltsOn(s.board[1]), 0); // ロック中は対象外
    assert.strictEqual(boltsOn(s.board[2]), 0); // 敵のコマには付かない
    const t = e.newGame({ chars: ['you', 'you'], rng: e.makeRng(5) });
    t.magic[0] = 30;
    t.board[0] = { player: '💙', bind: 4, effects: [] };
    e.SKILLS.bristle(t);
    assert.ok(t.board[0].bind < 4); // 雷霆の巫以外は乗った時点でダメージ
});

test('静電気の季節: 今の手番を含む3ターン、着手・トークン・全軍突撃のトークンに⚡が付く（補強は対象外）。掛け直しは不可。コスト7（自陣に⚡が無ければ-2）', () => {
    const s = e.newGame({ chars: ['electrician', 'you'], rng: e.makeRng(9) });
    s.magic[0] = 40; s.life = 3;
    assert.strictEqual(e.chargeSeasonLegal(s), true);
    assert.strictEqual(e.calculateCost(s, e.skillCosts.onClickChargeSeason, false, false, 'onClickChargeSeason'), 5); // 自陣に⚡が無いので-2
    e.SKILLS.chargeSeason(s);
    assert.strictEqual(s.magic[0], 40 - 5);
    assert.strictEqual(s.chargeBuff[0], 3);
    assert.strictEqual(e.chargeSeasonLegal(s), false);
    // 着手したコマに⚡（空きマスに置く）
    assert.strictEqual(e.placeMove(s, 5), true);
    assert.strictEqual(boltsOn(s.board[5]), 1);
    assert.strictEqual(s.chargeBuff[0], 2); // 手番が終わるたびに1減る
    // 相手の手番を挟んで、次の自分の手番: 今度はトークンにも付く
    s.currentTurn = 3;
    e.placeMove(s, 10); // 相手(席1)の着手
    assert.strictEqual(s.turn, 0);
    assert.strictEqual(boltsOn(s.board[10]), 0); // 相手のコマには付かない
    e.SKILLS.token(s);
    const tokenCell = s.board.findIndex((sq, i) => sq.player === '💙' && i !== 5);
    assert.strictEqual(boltsOn(s.board[tokenCell]), 1);
    // 自分のコマを補強しても⚡は増えない
    const before = boltsOn(s.board[5]);
    s.usedTokenThisTurn = false;
    e.placeMove(s, 5);
    assert.strictEqual(boltsOn(s.board[5]), before);
});

test('導線(コンボ)の軽減: 紅葉狩り=自陣の🍂が手番開始より増えていれば-2 / 総毛立つ=⚡付与スキルを使っていれば-2 / 静電気の季節=自陣に⚡が無ければ-2', () => {
    const price = (s, key) => e.calculateCost(s, e.skillCosts[key], key === 'onClickDoubleLeafToken', false, key);
    // 紅葉狩り
    const a = e.newGame({ chars: ['you', 'you'], rng: e.makeRng(3) });
    a.magic[0] = 30; a.leafBase[0] = 0;
    assert.strictEqual(price(a, 'onClickDoubleLeafToken'), 9);
    a.board[0] = { player: '💙', bind: 3, effects: [LEAF] };
    assert.strictEqual(price(a, 'onClickDoubleLeafToken'), 7); // 手番開始より🍂が増えた（一葉知秋など）
    a.leafBase[0] = 1;
    assert.strictEqual(price(a, 'onClickDoubleLeafToken'), 9); // 元からあった🍂では成立しない
    // 総毛立つ
    const b = e.newGame({ chars: ['electrician', 'you'], rng: e.makeRng(3) });
    b.magic[0] = 30;
    assert.strictEqual(price(b, 'onClickBristle'), 6);
    b.skillKinds[0].add('onClickChargeSpread');
    assert.strictEqual(price(b, 'onClickBristle'), 4);
    b.skillKinds[0] = new Set(['onClickChargeSeason']);
    assert.strictEqual(price(b, 'onClickBristle'), 6); // 静電気の季節は⚡を付与するスキルに数えない
    // 静電気の季節
    const c = e.newGame({ chars: ['electrician', 'you'], rng: e.makeRng(3) });
    c.magic[0] = 30;
    assert.strictEqual(price(c, 'onClickChargeSeason'), 5);
    c.board[0] = { player: '💙', bind: 3, effects: [{ effect: '⚡' }] };
    assert.strictEqual(price(c, 'onClickChargeSeason'), 7);
    c.board[0] = { player: '⭕', bind: 3, effects: [{ effect: '⚡' }] };
    assert.strictEqual(price(c, 'onClickChargeSeason'), 5); // 敵の⚡は数えない
});

test('一寸先は闇鍋: 敵味方の全コマに🔥❄⚡☠🌱🍂をランダムに（各最大1・🔥は❄🌱🍂と同居しない）。🔑ロック・空きマスは対象外。コスト9（盤面のエフェクトの数だけ軽減・最低1）', () => {
    const count = (sq, k) => sq.effects.filter((x) => x.effect === k).length;
    const seen = { '🔥': 0, '❄': 0, '⚡': 0, '☠': 0, '🌱': 0, '🍂': 0 };
    let pieces = 0;
    for (let seed = 1; seed <= 60; seed++) {
        const s = e.newGame({ chars: ['you', 'you'], rng: e.makeRng(seed) });
        s.magic[0] = 30;
        for (let i = 0; i < 16; i++) {
            if (i === 0) s.board[i] = { player: '💙', bind: 5, effects: [{ effect: '🔑' }] };
            else if (i < 7) s.board[i] = { player: '💙', bind: 5, effects: [] };
            else if (i < 13) s.board[i] = { player: '⭕', bind: 5, effects: [] };
        }
        s.board[1].effects.push({ effect: '🌱' });
        assert.strictEqual(e.calculateCost(s, e.skillCosts.onClickDarkPot, false, false, 'onClickDarkPot'), 9 - 2); // 🔑と🌱の2つぶん軽減
        e.SKILLS.darkPot(s);
        assert.strictEqual(s.magic[0], 30 - 7);
        assert.deepStrictEqual(s.board[0].effects, [{ effect: '🔑' }]); // ロック中は対象外
        for (let i = 13; i < 16; i++) assert.strictEqual(s.board[i].player, undefined);
        for (const sq of s.board) {
            if (!sq.player) { assert.strictEqual(sq.effects.length, 0); continue; }
            for (const k of Object.keys(seen)) assert.ok(count(sq, k) <= 1, `${k}が重なった`);
            if (count(sq, '🔥') === 1) assert.strictEqual(count(sq, '❄') + count(sq, '🌱') + count(sq, '🍂'), 0);
            if (sq.effects.some((x) => x.effect === '🔑')) continue;
            pieces++;
            for (const k of Object.keys(seen)) seen[k] += count(sq, k);
        }
    }
    // どの種類もおおむね半々で乗る（🔥・❄・🌱・🍂は同居の衝突で減る、⚡・☠は素直に半々）
    assert.ok(seen['⚡'] / pieces > 0.35 && seen['⚡'] / pieces < 0.65, `⚡ ${seen['⚡'] / pieces}`);
    assert.ok(seen['☠'] / pieces > 0.35 && seen['☠'] / pieces < 0.65, `☠ ${seen['☠'] / pieces}`);
    for (const k of Object.keys(seen)) assert.ok(seen[k] > 0, `${k}が一度も乗らない`);
});

test('雷を食らわば皿まで: ⚡が効いている自陣のコマのライフを⚡1スタックにつき+2。⚡のコマが無ければ使えない。コスト6', () => {
    const s = e.newGame({ chars: ['you', 'you'], rng: e.makeRng(4) });
    s.magic[0] = 30;
    assert.strictEqual(e.chargeHealLegal(s), false);
    e.SKILLS.chargeHeal(s);
    assert.strictEqual(s.magic[0], 30); // 不発
    const B = { effect: '⚡' };
    s.board[0] = { player: '💙', bind: 3, effects: [B] };
    s.board[1] = { player: '💙', bind: 1, effects: [B, B, B] };
    s.board[2] = { player: '💙', bind: 4, effects: [B, FRZ] };   // 氷結中は⚡が休眠 → 対象外
    s.board[3] = { player: '⭕', bind: 4, effects: [B] };          // 敵は対象外
    s.board[4] = { player: '💙', bind: 5, effects: [] };           // ⚡なしは対象外
    s.chargeBase[0] = 5; // 手番開始時から自陣の⚡が5つ(休眠も数える)なので軽減なし
    assert.strictEqual(e.chargeHealLegal(s), true);
    e.SKILLS.chargeHeal(s);
    assert.strictEqual(s.board[0].bind, 5);
    assert.strictEqual(s.board[1].bind, 7);
    assert.strictEqual(s.board[2].bind, 4);
    assert.strictEqual(s.board[3].bind, 4);
    assert.strictEqual(s.board[4].bind, 5);
    assert.strictEqual(s.magic[0], 30 - 6);
});

test('雷を食らわば皿まで: この手番に付与した⚡の数だけ軽減（最低1）。撃つとリセット', () => {
    const s = e.newGame({ chars: ['electrician', 'you'], rng: e.makeRng(4) });
    s.magic[0] = 40;
    const price = () => e.calculateCost(s, e.skillCosts.onClickChargeHeal, false, false, 'onClickChargeHeal');
    const B = { effect: '⚡' };
    s.board[0] = { player: '💙', bind: 3, effects: [B] };
    s.chargeBase[0] = 1; // 手番開始時から1つ
    assert.strictEqual(price(), 6);
    s.board[1] = { player: '💙', bind: 3, effects: [B, B] };
    s.board[2] = { player: '💙', bind: 3, effects: [B] };
    assert.strictEqual(price(), 3); // この手番に3つ付与
    s.board[3] = { player: '💙', bind: 3, effects: [B, B, B, B] };
    assert.strictEqual(price(), 1); // 軽減しきっても最低1
    e.SKILLS.chargeHeal(s);
    assert.strictEqual(s.magic[0], 40 - 1);
    assert.strictEqual(price(), 6); // 撃ったらリセット
    s.board[5] = { player: '⭕', bind: 3, effects: [B, B] }; // 敵の⚡は数えない
    assert.strictEqual(price(), 6);
});

test('一寸の虫に魂なし: 敵のライフ3以下のコマを全て破壊（🔑ロック・無敵は除き、氷結中は❄-1だけ）。自陣と、ライフ4以上の敵は残る', () => {
    const s = e.newGame({ chars: ['electrician', 'you', 'you'], rng: e.makeRng(6) });
    s.magic[0] = 30;
    s.board[0] = { player: '⭕', bind: 3, effects: [] };            // 壊れる
    s.board[1] = { player: '⭕', bind: 0, effects: [] };            // ライフ0も壊れる
    s.board[2] = { player: '🟩', bind: 2, effects: [] };           // 別の敵(3人戦)も壊れる
    s.board[3] = { player: '⭕', bind: 4, effects: [] };            // ライフ4は残る
    s.board[4] = { player: '⭕', bind: 3, effects: [{ effect: '🔑' }] }; // ロック中は残る
    s.board[5] = { player: '⭕', bind: 3, effects: [FRZ, FRZ] };    // 氷結は身代わり(❄-1)
    s.board[6] = { player: '💙', bind: 1, effects: [] };            // 自陣は残る
    s.board[7] = { player: '🟩', bind: 3, effects: [] };
    const before = e.calculateCost(s, e.skillCosts.onClickSmallFry, false, false, 'onClickSmallFry');
    assert.strictEqual(before, Math.max(1, 10 - 8)); // 盤面のコマ8個ぶん軽減
    e.SKILLS.smallFry(s);
    for (const i of [0, 1, 2, 7]) assert.strictEqual(s.board[i].player, undefined);
    assert.strictEqual(s.board[3].bind, 4);
    assert.strictEqual(s.board[4].player, '⭕');
    assert.strictEqual(s.board[5].player, '⭕');
    assert.strictEqual(s.board[5].effects.filter((x) => x.effect === '❄').length, 1);
    assert.strictEqual(s.board[6].player, '💙');
    assert.strictEqual(s.magic[0], 30 - before);
    assert.deepStrictEqual(s.lifeBan, [false, true, true]);
});

test('一寸の虫に魂なし: 雷霆の巫の⚡で無敵のコマは壊れない', () => {
    const s = e.newGame({ chars: ['you', 'electrician'], rng: e.makeRng(6) });
    s.magic[0] = 30;
    s.board[0] = { player: '⭕', bind: 2, effects: [{ effect: '⚡' }] };
    e.SKILLS.smallFry(s);
    assert.strictEqual(s.board[0].player, '⭕');
});

test('一寸の虫に魂なし: コストは盤面のコマの数だけ軽減（最低1）', () => {
    const s = e.newGame({ chars: ['you', 'you'], rng: e.makeRng(6) });
    const price = () => e.calculateCost(s, e.skillCosts.onClickSmallFry, false, false, 'onClickSmallFry');
    assert.strictEqual(e.skillCosts.onClickSmallFry, 10);
    assert.strictEqual(price(), 10);
    for (let i = 0; i < 4; i++) s.board[i] = { player: i % 2 ? '⭕' : '💙', bind: 5, effects: [] };
    assert.strictEqual(price(), 6);
    for (let i = 4; i < 16; i++) s.board[i] = { player: '⭕', bind: 5, effects: [] };
    assert.strictEqual(price(), 1);
});

test('一寸の虫に魂なし: 縛られた席はライフ3以下のコマを置けない（着手・置くスキル）。その席の手番が終わると解除', () => {
    const s = e.newGame({ chars: ['you', 'you'], rng: e.makeRng(8) });
    s.magic[0] = 30; s.magic[1] = 30;
    e.SKILLS.smallFry(s);                    // 席1が縛られる
    assert.deepStrictEqual(s.lifeBan, [false, true]);
    s.board[5] = { player: '💙', bind: 4, effects: [] };
    s.currentTurn += 1; e.advanceTurn(s);    // 席1の手番へ
    assert.strictEqual(s.turn, 1);
    s.life = 3;
    assert.strictEqual(e.placeMove(s, 0), false); // ライフ3の着手はできない
    assert.strictEqual(s.board[0].player, undefined);
    const magicBefore = s.magic[1];
    e.SKILLS.shikigamiRandom(s);             // 式神はライフ2 → 置けない（魔力も減らない）
    assert.strictEqual(s.magic[1], magicBefore);
    assert.strictEqual(s.board.filter((sq) => sq.effects.some((x) => x.effect === '📜')).length, 0);
    s.life = 4;
    assert.strictEqual(e.placeMove(s, 0), true); // ライフ4なら置ける
    assert.strictEqual(s.lifeBan[1], false);     // 手番が終わったので解除
});

test('一寸の虫に魂なし: 縛られたネクロマンサーは蘇生（ライフ2のコマの召喚）を使えない（魔力も墓地も減らない）。縛られていなければ使える', () => {
    const mk = () => {
        const s = e.newGame({ chars: ['you', 'necromancer'], rng: e.makeRng(8) });
        s.turn = 1; s.magic[1] = 40; s.necroCost[1] = 2; // 墓地が貯まっていて安い
        return s;
    };
    const banned = mk(); banned.lifeBan[1] = true;
    const magicBefore = banned.magic[1];
    e.SKILLS.necromancy(banned);
    assert.strictEqual(banned.magic[1], magicBefore);
    assert.strictEqual(banned.board.filter((sq) => sq.player).length, 0);
    assert.strictEqual(banned.remainNecro[1], 0);
    const free = mk();
    e.SKILLS.necromancy(free);
    assert.ok(free.magic[1] < 40);
    assert.ok(free.board.filter((sq) => sq.player).length > 0);
});


test('一寸先は闇鍋: 1手番に1度だけ（2回目は何も起きず魔力も減らない）。次の手番では使える', () => {
    const s = e.newGame({ chars: ['you', 'you'], rng: e.makeRng(2) });
    s.magic[0] = 40; s.magic[1] = 40;
    s.board[0] = { player: '💙', bind: 4, effects: [] };
    s.board[1] = { player: '⭕', bind: 4, effects: [] };
    e.SKILLS.darkPot(s);
    const left = s.magic[0];
    assert.ok(left < 40);
    const snapshot = JSON.stringify(s.board);
    e.SKILLS.darkPot(s);
    assert.strictEqual(s.magic[0], left);
    assert.strictEqual(JSON.stringify(s.board), snapshot);
    e.advanceTurn(s); // 相手の手番
    e.advanceTurn(s); // 自分の手番に戻る
    assert.strictEqual(s.turn, 0);
    s.magic[0] = 40;
    e.SKILLS.darkPot(s);
    assert.ok(s.magic[0] < 40);
});

test('一寸先は闇鍋: コストは盤面のエフェクトの数だけ下がり、最低1', () => {
    const s = e.newGame({ chars: ['you', 'you'], rng: e.makeRng(1) });
    s.magic[0] = 30;
    const price = () => e.calculateCost(s, e.skillCosts.onClickDarkPot, false, false, 'onClickDarkPot');
    assert.strictEqual(e.skillCosts.onClickDarkPot, 9);
    assert.strictEqual(price(), 9);
    for (let i = 0; i < 4; i++) s.board[i] = { player: i % 2 ? '⭕' : '💙', bind: 3, effects: [{ effect: '☠' }] };
    assert.strictEqual(price(), 5);
    s.board[4] = { player: undefined, bind: 0, effects: [{ effect: '🔑' }, { effect: '❄' }] }; // 空きマスのエフェクトも数える
    assert.strictEqual(price(), 3);
    for (let i = 5; i < 16; i++) s.board[i] = { player: '💙', bind: 3, effects: [{ effect: '🌱' }, { effect: '🌱' }] };
    assert.strictEqual(price(), 1);
});

test('一寸先は闇鍋: 雷霆の巫の⚡で無敵のコマは対象外。毒使いの毒はライフ1.5倍', () => {
    const s = e.newGame({ chars: ['electrician', 'poisoner'], rng: e.makeRng(7) });
    s.magic[0] = 30;
    s.board[0] = { player: '💙', bind: 5, effects: [{ effect: '⚡' }] }; // 雷霆の巫の無敵
    s.board[1] = { player: '⭕', bind: 4, effects: [] };
    e.SKILLS.darkPot(s);
    assert.deepStrictEqual(s.board[0].effects, [{ effect: '⚡' }]);
    assert.strictEqual(s.board[0].bind, 5);
    const sq = s.board[1];
    if (sq.effects.some((x) => x.effect === '☠') && !sq.effects.some((x) => x.effect === '🔥') && !sq.effects.some((x) => x.effect === '⚡')) assert.strictEqual(sq.bind, 6);
});

test('静電気の季節は3手番で切れる', () => {
    const s = e.newGame({ chars: ['electrician', 'you'], rng: e.makeRng(11) });
    s.magic[0] = 40;
    e.SKILLS.chargeSeason(s);
    s.currentTurn = 5;
    for (let n = 0; n < 3; n++) { s.turn = 0; e.advanceTurn(s); }
    assert.strictEqual(s.chargeBuff[0], 0);
    assert.strictEqual(e.chargeSeasonLegal(s), true); // 切れたら掛け直せる
});

test('落雷は忘れた頃に: 自陣の⚡を全て取り除き、取り除いた数だけ敵の全コマにダメージ（ライフは0まで）。⚡が無ければ使えない。コスト5', () => {
    const s = e.newGame({ chars: ['electrician', 'you'], rng: e.makeRng(13) });
    s.magic[0] = 30;
    assert.strictEqual(e.releaseLegal(s), false);
    s.board[0] = { player: '💙', bind: 4, effects: [BOLT, BOLT] };
    s.board[1] = { player: '💙', bind: 4, effects: [BOLT] };
    s.board[5] = { player: '⭕', bind: 5, effects: [] };
    s.board[6] = { player: '⭕', bind: 2, effects: [] };
    s.board[7] = { player: '⭕', bind: 5, effects: [{ effect: '🔑' }] }; // ロックは受けない
    s.board[8] = { player: '⭕', bind: 5, effects: [FRZ] }; // 氷結中は受けない
    assert.strictEqual(e.releaseLegal(s), true);
    const cost = e.calculateCost(s, e.skillCosts.onClickRelease, false, false, 'onClickRelease');
    assert.strictEqual(cost, 5);
    e.SKILLS.release(s);
    assert.strictEqual(s.magic[0], 30 - cost);
    assert.strictEqual(boltsOn(s.board[0]) + boltsOn(s.board[1]), 0);
    assert.strictEqual(s.board[5].bind, 2);
    assert.strictEqual(s.board[6].bind, 0); // 0で止まる
    assert.strictEqual(s.board[6].player, '⭕'); // 破壊はしない
    assert.strictEqual(s.board[7].bind, 5);
    assert.strictEqual(s.board[8].bind, 5);
    assert.strictEqual(e.releaseLegal(s), false); // もう⚡が無い
});

test('雷神のへそくり: ⚡のある自陣のコマ(無敵の⚡マスも)を選んで⚡を全て除去し、スタック1つにつき次のスキルを-1。コスト1。軽減札なので「次のスキル」を消費しない', () => {
    const s = e.newGame({ chars: ['electrician', 'you'], rng: e.makeRng(17) });
    s.magic[0] = 30;
    assert.strictEqual(e.stashLegal(s), false);
    s.board[0] = { player: '💙', bind: 4, effects: [BOLT, BOLT, BOLT] }; // 雷霆の巫の⚡マスは無敵だが、自分のものは選べる
    s.board[1] = { player: '💙', bind: 4, effects: [] };
    s.board[2] = { player: '⭕', bind: 4, effects: [BOLT] };
    assert.strictEqual(e.stashLegal(s), true);
    assert.strictEqual(e.calculateCost(s, e.skillCosts.onClickStash, false, false, 'onClickStash'), 1);
    const slash = () => e.calculateCost(s, 6, false, false, 'onClickSlash');
    const before = slash();
    e.SKILLS.stash(s);
    assert.strictEqual(s.magic[0], 29);
    assert.strictEqual(s.useStash, true);
    assert.strictEqual(e.placeMove(s, 1), false); // ⚡のない自陣は選び直せる
    assert.strictEqual(e.placeMove(s, 2), false); // 敵のコマは選べない
    assert.strictEqual(e.placeMove(s, 0), true);
    assert.strictEqual(s.useStash, false);
    assert.strictEqual(boltsOn(s.board[0]), 0);
    assert.strictEqual(boltsOn(s.board[2]), 1); // 敵の⚡はそのまま
    assert.strictEqual(s.discount[0].next, 3);
    assert.strictEqual(slash(), before - 3);
    // 次に打つスキルでだけ消費される
    e.SKILLS.addLife(s);
    assert.strictEqual(s.discount[0].next, 0);
    assert.strictEqual(slash(), before);
});

test('雷のない所に火は立たぬ: ⚡のあるコマを破壊し、周囲8マスの敵コマ2〜全部に🔥。コスト7。ロック・他人の無敵マスは選べず、氷結中は❄-1だけで燃え移らない', () => {
    const s = e.newGame({ chars: ['electrician', 'you'], rng: e.makeRng(21) });
    s.magic[0] = 30;
    assert.strictEqual(e.thunderFireLegal(s), false);
    s.board[5] = { player: '💙', bind: 4, effects: [BOLT] }; // 自分の無敵マスも選べる
    for (const k of [0, 1, 2, 4, 6]) s.board[k] = { player: '⭕', bind: 4, effects: [] }; // 周囲8マスの敵5コマ
    s.board[14] = { player: '⭕', bind: 4, effects: [BOLT] }; // 他人の（雷霆の巫ではない）⚡コマは選べる。5 の周囲8マスの外
    s.board[15] = { player: '💙', bind: 4, effects: [BOLT, { effect: '🔑' }] }; // ロック中は選べない
    assert.deepStrictEqual(e.thunderFireTargets(s), [5, 14]);
    assert.strictEqual(e.calculateCost(s, e.skillCosts.onClickThunderFire, false, false, 'onClickThunderFire'), 7);
    e.SKILLS.thunderFire(s);
    assert.strictEqual(s.magic[0], 30 - 7);
    assert.strictEqual(e.placeMove(s, 0), false); // ⚡のないマスは選び直せる
    assert.strictEqual(e.placeMove(s, 15), false); // ロック中は選べない
    assert.strictEqual(e.placeMove(s, 5), true);
    assert.strictEqual(s.useThunderFire, false);
    assert.strictEqual(s.board[5].player, undefined); // 破壊された
    const burning = [0, 1, 2, 4, 6].filter((k) => s.board[k].effects.some((x) => x.effect === '🔥'));
    assert.ok(burning.length >= 2 && burning.length <= 5);
    for (const k of burning) assert.strictEqual(s.board[k].effects.filter((x) => x.effect === '🔥').length, 1);
    assert.ok(!s.board[14].effects.some((x) => x.effect === '🔥')); // 周囲8マスの外は燃えない
    // 氷結中のコマは❄が1つ減るだけで、燃え移らない
    const t = e.newGame({ chars: ['you', 'you'], rng: e.makeRng(22) });
    t.magic[0] = 30;
    t.board[5] = { player: '💙', bind: 4, effects: [BOLT, FRZ, FRZ] };
    t.board[6] = { player: '⭕', bind: 4, effects: [] };
    e.SKILLS.thunderFire(t);
    assert.strictEqual(e.placeMove(t, 5), true);
    assert.strictEqual(t.board[5].player, '💙');
    assert.strictEqual(t.board[5].effects.filter((x) => x.effect === '❄').length, 1);
    assert.strictEqual(t.board[6].effects.length, 0);
});


// ---- 凩の魔女 ----
test('凩の魔女: パッシブ。盤面の🍂（敵味方）1枚につきスキルコスト-1（下限1）', () => {
    const s = game('witch', 'you');
    s.heartTurn = true;
    const base = e.calculateCost(s, 7, false, false, 'onClickMogaribue');
    assert.strictEqual(base, 7);
    s.board[0] = { player: '💙', bind: 4, effects: [{ effect: '🍂' }, { effect: '🍂' }] };
    s.board[1] = { player: '⭕', bind: 4, effects: [{ effect: '🍂' }] };
    // 敵の🍂は魔女のコストを+1するが、パッシブの-3で相殺されて -3 +1 = 5
    assert.strictEqual(e.calculateCost(s, 7, false, false, 'onClickMogaribue'), 5);
    // 増加分（敵の🍂+1）を先に足してから減少分（パッシブ-3）を引く: 2+1-3=0 → 下限1。以前は下限1のあとに+1して2になっていた
    assert.strictEqual(e.calculateCost(s, 2, false, false, 'x'), 1);
});

test('凩の魔女: 虎落笛。自陣の🍂の枚数ぶん敵全てにダメージ、自陣はライフ+2、手番は続く', () => {
    const s = game('witch', 'you');
    s.heartTurn = true; s.heartMagic = 20;
    s.board[0] = { player: '💙', bind: 3, effects: [{ effect: '🍂' }, { effect: '🍂' }] };
    s.board[1] = { player: '💙', bind: 0, effects: [] };
    s.board[4] = { player: '⭕', bind: 5, effects: [] };
    s.board[5] = { player: '⭕', bind: 4, effects: [{ effect: '🔑' }] };
    const before = s.heartMagic;
    e.SKILLS.mogaribue(s);
    assert.strictEqual(s.heartTurn, true);
    assert.strictEqual(s.board[4].bind, 3);
    assert.strictEqual(s.board[5].bind, 4); // 🔑は対象外
    assert.strictEqual(s.board[0].bind, 5);
    assert.strictEqual(s.board[1].bind, 2);
    assert.ok(s.heartMagic < before);
});

test('凩の魔女: 自陣のコマが無いと虎落笛は不発（魔力も減らない）', () => {
    const s = game('witch', 'you');
    s.heartTurn = true; s.heartMagic = 20;
    s.board[4] = { player: '⭕', bind: 5, effects: [] };
    e.SKILLS.mogaribue(s);
    assert.strictEqual(s.heartMagic, 20);
    assert.strictEqual(s.board[4].bind, 5);
});

// ---- 落ち葉の置き土産・焚きつけ ----
test('落ち葉の置き土産: ランダムな敵のコマ1つに🍂を1つ。🔑・⚡無敵・自陣は対象外。手番は続く', () => {
    const s = game('you', 'you');
    s.heartTurn = true; s.heartMagic = 20;
    s.board[0] = { player: '💙', bind: 3, effects: [] };
    s.board[4] = { player: '⭕', bind: 5, effects: [{ effect: '🔑' }] };
    s.board[5] = { player: '⭕', bind: 5, effects: [] };
    const before = s.heartMagic;
    e.SKILLS.leafDrop(s);
    const leaves = (i) => s.board[i].effects.filter((x) => x.effect === '🍂').length;
    assert.strictEqual(leaves(5), 1);
    assert.strictEqual(leaves(4), 0);
    assert.strictEqual(leaves(0), 0);
    assert.strictEqual(s.heartTurn, true);
    assert.strictEqual(before - s.heartMagic, e.skillCosts.onClickLeafDrop);
    assert.strictEqual(e.leafDropLegal(s), true);
    // 対象が無ければ不発（魔力も減らない）
    const t = game('you', 'you');
    t.heartTurn = true; t.heartMagic = 20;
    t.board[0] = { player: '💙', bind: 3, effects: [] };
    e.SKILLS.leafDrop(t);
    assert.strictEqual(t.heartMagic, 20);
    assert.strictEqual(e.leafDropLegal(t), false);
});

test('焚きつけ: 敵の🍂を全て🔥に変換（1枚につき🔥1つ）。🔑・自陣の🍂は対象外', () => {
    const s = game('you', 'you');
    s.heartTurn = true; s.heartMagic = 20;
    const LF = { effect: '🍂' };
    s.board[0] = { player: '💙', bind: 3, effects: [LF] }; // 自陣の🍂は残る
    s.board[4] = { player: '⭕', bind: 8, effects: [LF, LF] };
    s.board[5] = { player: '⭕', bind: 8, effects: [LF, { effect: '🔑' }] };
    s.board[6] = { player: '⭕', bind: 8, effects: [] };
    const before = s.heartMagic;
    e.SKILLS.kindling(s);
    const count = (i, k) => s.board[i].effects.filter((x) => x.effect === k).length;
    assert.strictEqual(count(4, '🍂'), 0);
    assert.strictEqual(count(4, '🔥'), 2);
    assert.strictEqual(count(5, '🍂'), 1); // 🔑は対象外
    assert.strictEqual(count(5, '🔥'), 0);
    assert.strictEqual(count(0, '🍂'), 1);
    assert.strictEqual(count(6, '🔥'), 0);
    assert.strictEqual(before - s.heartMagic, e.skillCosts.onClickKindling + 3); // 払うコストは変換前の盤面で決まる: 敵の🍂3枚ぶん高い
    assert.strictEqual(s.heartTurn, true);
    assert.strictEqual(e.kindlingLegal(s), false);
});

test('枯野の相席: 盤面の全てのコマ（敵味方）に🍂を1つずつ。🔑ロック中は除く。手番は続く。コストは付与前の盤面で決まる', () => {
    const s = game('you', 'you');
    s.heartTurn = true; s.heartMagic = 30;
    s.board[0] = { player: '💙', bind: 3, effects: [] };
    s.board[1] = { player: '💙', bind: 3, effects: [{ effect: '🔑' }] };
    s.board[4] = { player: '⭕', bind: 5, effects: [{ effect: '🍂' }] };
    s.board[5] = { player: '⭕', bind: 5, effects: [] };
    const before = s.heartMagic;
    e.SKILLS.leafAll(s);
    const leaves = (i) => s.board[i].effects.filter((x) => x.effect === '🍂').length;
    assert.strictEqual(leaves(0), 1);
    assert.strictEqual(leaves(1), 0); // 🔑は対象外
    assert.strictEqual(leaves(4), 2);
    assert.strictEqual(leaves(5), 1);
    assert.strictEqual(s.heartTurn, true);
    assert.strictEqual(s.usedTokenThisTurn, false); // トークンではない
    assert.strictEqual(before - s.heartMagic, e.skillCosts.onClickLeafAll + 1); // 敵の🍂1枚ぶん高い（付与前の盤面）
    // 盤面にコマが無ければ不発
    const t = game('you', 'you');
    t.heartTurn = true; t.heartMagic = 30;
    e.SKILLS.leafAll(t);
    assert.strictEqual(t.heartMagic, 30);
    assert.strictEqual(e.leafAllLegal(t), false);
});

test('落葉の衣: ランダムな自陣のコマ1つ（🔑含む）に🍂を1つ。敵には付かない。手番は続く', () => {
    const s = game('you', 'you');
    s.heartTurn = true; s.heartMagic = 30;
    s.board[0] = { player: '💙', bind: 3, effects: [] };
    s.board[1] = { player: '💙', bind: 3, effects: [{ effect: '🔑' }] };
    s.board[4] = { player: '⭕', bind: 5, effects: [] };
    const before = s.heartMagic;
    e.SKILLS.leafCloak(s);
    const leaves = (i) => s.board[i].effects.filter((x) => x.effect === '🍂').length;
    assert.strictEqual(leaves(0) + leaves(1), 1);
    assert.strictEqual(leaves(4), 0);
    assert.strictEqual(s.heartTurn, true);
    assert.strictEqual(before - s.heartMagic, e.skillCosts.onClickLeafCloak);
    // 乱数で両方に当たりうる（同じマスに偏らない）
    const hit = new Set();
    for (let seed = 1; seed <= 30; seed++) {
        const g = e.newGame({ heartChar: 'you', circleChar: 'you', rng: e.makeRng(seed) });
        g.heartTurn = true; g.heartMagic = 30;
        g.board[0] = { player: '💙', bind: 3, effects: [] };
        g.board[1] = { player: '💙', bind: 3, effects: [] };
        e.SKILLS.leafCloak(g);
        hit.add(leaves2(g));
    }
    assert.strictEqual(hit.size, 2);
    const t = game('you', 'you');
    t.heartTurn = true; t.heartMagic = 30;
    t.board[4] = { player: '⭕', bind: 5, effects: [] };
    e.SKILLS.leafCloak(t);
    assert.strictEqual(t.heartMagic, 30);
    assert.strictEqual(e.leafCloakLegal(t), false);
    function leaves2(g) { return g.board.findIndex((q) => q.effects.some((x) => x.effect === '🍂')); }
});

test('凩の魔女: 毎ターンの魔力は+2（基本+1＋キャラ補正+1）。ライフ平均は4', () => {
    const w = game('witch', 'you');
    const y = game('you', 'you');
    const m0 = w.heartMagic;
    e.placeMove(w, 0); e.placeMove(w, 1); // 💙(魔女)が置き、⭕が置く → 魔女の次の手番の頭
    e.placeMove(y, 0); e.placeMove(y, 1);
    assert.strictEqual(w.heartMagic - m0, 2);
    assert.strictEqual(y.heartMagic - m0, 1);
    assert.strictEqual(require('./shared/util').LIFE_MEANS.witch, 4);
});

test('コストの計算順: 敵の🍂による増加分を先に足し、魔女のパッシブ・ギア・割引の減少分をそのあとに引く', () => {
    // 魔女: 盤面に敵の🍂だけが3枚。7+3-3=7（以前は 7-3=4 のあとに+3 で7、下限1が絡むと差が出る）
    const w = game('witch', 'you');
    w.heartTurn = true;
    w.board[4] = { player: '⭕', bind: 3, effects: [{ effect: '🍂' }, { effect: '🍂' }, { effect: '🍂' }] };
    assert.strictEqual(e.calculateCost(w, 7, false, false, 'x'), 7);
    assert.strictEqual(e.calculateCost(w, 2, false, false, 'x'), 2); // 2+3-3=2（以前は max(1,2-3)=1 のあとに+3 で4）
    assert.strictEqual(e.calculateCost(w, 1, false, false, 'x'), 1);
    // 魔女以外: 敵の🍂の増加分は従来どおりそのまま乗る
    const y = game('you', 'you');
    y.heartTurn = true;
    y.board[4] = { player: '⭕', bind: 3, effects: [{ effect: '🍂' }, { effect: '🍂' }] };
    assert.strictEqual(e.calculateCost(y, 3, false, false, 'x'), 5);
    // 軍師: 非トークンは+2。増加分(+2, 🍂+2)を足してから。トークンは-1が増加分のあと
    const t = game('tactician', 'you');
    t.heartTurn = true;
    t.board[4] = { player: '⭕', bind: 3, effects: [{ effect: '🍂' }, { effect: '🍂' }] };
    assert.strictEqual(e.calculateCost(t, 3, false, false, 'x'), 3 + 2 + 2);
    assert.strictEqual(e.calculateCost(t, 3, true, false, 'x'), 3 + 2 - 1);
});

test('火口(idx 87): 🌱か🍂のある敵コマ1つに🔥を1つ付ける。対象が無ければ使えない。鍛冶師は🔥付与で-1、選べるのは🌱🍂のあるコマだけ', () => {
    const s = game('pyromancer', 'magician');
    s.heartTurn = true; s.heartMagic = 10; s.life = 5;
    s.board[5] = { player: '⭕', bind: 5, effects: [{ effect: '🌱' }] };
    s.board[6] = { player: '⭕', bind: 5, effects: [] };
    s.board[9] = { player: '⭕', bind: 5, effects: [{ effect: '🌱' }, { effect: '🔑' }] }; // ロック中は選べない（敵の🍂は自分のコストを上げるので🌱で確かめる）
    s.board[12] = { player: '⭕', bind: 5, effects: [{ effect: '❄' }] }; // ❄のコマも対象
    assert.deepStrictEqual(e.tinderCandidates(s), [5, 12]);
    const before = s.magic[s.turn];
    e.SKILLS.tinder(s);
    assert.strictEqual(before - s.magic[s.turn], 1, '基本2-1');
    assert.strictEqual(e.placeMove(s, 6), false, '🌱🍂が無いコマは選び直せる');
    assert.strictEqual(e.placeMove(s, 5), true);
    assert.ok(s.board[5].effects.some((x) => x.effect === '🔥'));
    assert.ok(!s.board[5].effects.some((x) => x.effect === '🌱'), '🔥は🌱を焼く');
    assert.strictEqual(s.board[5].bind, 4, '付与の瞬間に1ダメージ');
    const t = game('pyromancer', 'magician');
    t.board[6] = { player: '⭕', bind: 5, effects: [] };
    assert.strictEqual(e.tinderLegal(t), false);
    const m0 = t.magic[t.turn];
    e.SKILLS.tinder(t);
    assert.strictEqual(t.magic[t.turn], m0, '対象が無ければ何もしない');
});


// ---- 初霜・吹き寄せ・山焼き・無礼講(idx 93〜96) ----
const fx = (...kinds) => kinds.map((k) => ({ effect: k }));
const cnt = (sq, k) => sq.effects.filter((x) => x.effect === k).length;
test('初霜: 敵の🍂があるコマを全て凍結し、自陣にバッズトークンを置く。🔑・氷結を付けられない(🔥)コマは対象外。トークン扱い。コストは凍結前の盤面で決まる', () => {
    const s = game('you', 'you');
    s.heartTurn = true; s.heartMagic = 30;
    s.board[0] = { player: '💙', bind: 3, effects: [] };
    s.board[4] = { player: '⭕', bind: 5, effects: fx('🍂') };
    s.board[5] = { player: '⭕', bind: 5, effects: fx('🍂', '🔑') };
    s.board[6] = { player: '⭕', bind: 5, effects: [] };
    s.board[7] = { player: '⭕', bind: 5, effects: fx('🍂', '🔥') };
    assert.strictEqual(e.firstFrostLegal(s), true);
    const before = s.heartMagic;
    e.SKILLS.firstFrost(s);
    assert.strictEqual(cnt(s.board[4], '❄'), 1);
    assert.strictEqual(cnt(s.board[5], '❄') + cnt(s.board[6], '❄') + cnt(s.board[7], '❄'), 0);
    const buds = s.board.filter((sq, i) => sq.player === '💙' && i !== 0 && cnt(sq, '🌱') === 1);
    assert.strictEqual(buds.length, 1, '自陣にバッズトークンが1つ増える');
    // 盤面の🍂は(4:1, 5:1, 7:1)=3枚 → 3枚以上なのでコスト0
    assert.strictEqual(before - s.heartMagic, 0);
    assert.strictEqual(s.usedTokenThisTurn, true);
    assert.strictEqual(e.firstFrostLegal(s), false, 'トークンはターンに1回');
});

test('初霜: 盤面の🍂が2枚ならコストは 6+敵の🍂2枚ぶん=8（3枚以上で0）。対象が無ければ使えない', () => {
    const s = game('you', 'you');
    s.heartTurn = true; s.heartMagic = 30;
    s.board[4] = { player: '⭕', bind: 5, effects: fx('🍂') };
    s.board[5] = { player: '⭕', bind: 5, effects: fx('🍂') };
    const before = s.heartMagic;
    e.SKILLS.firstFrost(s);
    assert.strictEqual(before - s.heartMagic, 8);
    const t = game('you', 'you');
    t.heartTurn = true; t.heartMagic = 30;
    t.board[4] = { player: '⭕', bind: 5, effects: [] };
    assert.strictEqual(e.firstFrostLegal(t), false);
    e.SKILLS.firstFrost(t);
    assert.strictEqual(t.heartMagic, 30);
});

test('吹き寄せ: 空きマスにトークンを置き、盤面のエフェクトを全部集める。🔑と📜は残り、氷結のマスは動かさない。🔥は集め終えてから処理（🌱🍂が燃える）', () => {
    const s = game('you', 'you');
    s.heartTurn = true; s.heartMagic = 30;
    s.board[0] = { player: '💙', bind: 3, effects: fx('🌱') };
    s.board[1] = { player: '⭕', bind: 5, effects: fx('🍂', '☠') };
    s.board[2] = { player: '⭕', bind: 5, effects: fx('❄', '🌱') };
    s.board[3] = { player: '💙', bind: 5, effects: fx('🔑', '⚡') };
    s.board[5] = { player: '⭕', bind: 5, effects: fx('🔥', '🌱') };
    const emptyBefore = new Set(s.board.map((sq, i) => (!sq.player ? i : -1)).filter((i) => i !== -1));
    e.SKILLS.gather(s);
    const tok = s.board.findIndex((sq, i) => emptyBefore.has(i) && sq.player === '💙');
    assert.ok(tok >= 0, '空きマスに自陣のトークンが置かれる');
    // 集まったのは 🌱(0) 🍂☠(1) ⚡(3) 🌱(5) と 🔥(5)。🔥の処理で 🌱🌱🍂 は燃える
    assert.deepStrictEqual(s.board[tok].effects.map((x) => x.effect).sort(), ['☠', '⚡', '🔥'].sort());
    assert.deepStrictEqual(s.board[0].effects, []);
    assert.deepStrictEqual(s.board[1].effects, []);
    assert.deepStrictEqual(s.board[2].effects.map((x) => x.effect), ['❄', '🌱'], '氷結のマスは動かさない');
    assert.deepStrictEqual(s.board[3].effects.map((x) => x.effect), ['🔑'], '🔑はその場に残り、他のエフェクトは動く');
    assert.deepStrictEqual(s.board[5].effects, []);
    assert.strictEqual(s.usedTokenThisTurn, true);
});

test('吹き寄せ: コストは 8+敵の🍂 に対し、エフェクト1つにつき2軽減（氷結のマスは❄だけ・🔑自体は数えない）。最低1。軽減は🍂の増加分のあと', () => {
    const s = game('you', 'you');
    s.heartTurn = true; s.heartMagic = 30;
    s.board[1] = { player: '⭕', bind: 5, effects: fx('🍂', '☠') };
    const base = e.calculateCost(s, e.skillCosts.onClickGather, true, false, 'onClickGather');
    assert.strictEqual(base, 8 + 1 - 2 * 2); // 敵の🍂1枚で+1 → 9、エフェクト2つで-4
    s.board[2] = { player: '⭕', bind: 5, effects: fx('❄', '🌱', '☠') };
    s.board[3] = { player: '💙', bind: 5, effects: fx('🔑', '🌱') };
    // 数えるのは 1:🍂☠(2) 2:❄だけ(1) 3:🌱だけ(1)=4個 → 8+1-8 = 1
    assert.strictEqual(e.calculateCost(s, e.skillCosts.onClickGather, true, false, 'onClickGather'), 1);
    s.board[4] = { player: '⭕', bind: 5, effects: fx('🌱', '🌱', '🌱') };
    assert.strictEqual(e.calculateCost(s, e.skillCosts.onClickGather, true, false, 'onClickGather'), 1, '最低1');
});

test('山焼き: 敵のエフェクトがあるマス（氷結・⚡無敵を除く。🔑ロックのマスの他のエフェクトは対象）に🔥を1つ付け、自陣にロック付きトークンを置く', () => {
    const s = game('you', 'you');
    s.heartTurn = true; s.heartMagic = 30;
    s.board[0] = { player: '💙', bind: 3, effects: fx('🌱') };
    s.board[4] = { player: '⭕', bind: 5, effects: fx('🍂') };
    s.board[5] = { player: '⭕', bind: 5, effects: fx('🌱', '🔑') };
    s.board[15] = { player: '⭕', bind: 5, effects: fx('❄', '🌱') }; // 炎の隣でない氷結のマス（隣り合うと🔥の熱で氷結が溶ける）
    s.board[7] = { player: '⭕', bind: 5, effects: [] };
    const emptyBefore = new Set(s.board.map((sq, i) => (!sq.player ? i : -1)).filter((i) => i !== -1));
    assert.deepStrictEqual(e.burnOffTargets(s), [4, 5]);
    e.SKILLS.burnOff(s);
    assert.deepStrictEqual(s.board[4].effects.map((x) => x.effect), ['🔥'], '🍂は燃えて🔥が付く');
    assert.ok(cnt(s.board[5], '🔥') === 1 && cnt(s.board[5], '🔑') === 1 && cnt(s.board[5], '🌱') === 0, 'ロックのマスも燃える（ロックは残る）');
    assert.deepStrictEqual(s.board[15].effects.map((x) => x.effect), ['❄', '🌱'], '氷結のマスは対象外');
    assert.deepStrictEqual(s.board[7].effects, []);
    const tok = s.board.findIndex((sq, i) => emptyBefore.has(i) && sq.player === '💙');
    assert.ok(tok >= 0 && cnt(s.board[tok], '🔑') === 1, 'ロック付きトークンが置かれる');
    assert.strictEqual(s.usedTokenThisTurn, true);
});

test('山焼き: コストは 9+敵の🍂 に対し、エフェクト1つにつき3軽減（氷結のマスは❄だけ・🔑自体は数えない）。最低1', () => {
    const s = game('you', 'you');
    s.heartTurn = true; s.heartMagic = 30;
    s.board[4] = { player: '⭕', bind: 5, effects: fx('🍂') };
    assert.strictEqual(e.calculateCost(s, e.skillCosts.onClickBurnOff, true, false, 'onClickBurnOff'), 9 + 1 - 3);
    s.board[5] = { player: '⭕', bind: 5, effects: fx('🌱', '🔑') };
    s.board[6] = { player: '⭕', bind: 5, effects: fx('❄', '🌱') };
    assert.strictEqual(e.calculateCost(s, e.skillCosts.onClickBurnOff, true, false, 'onClickBurnOff'), 9 + 1 - 3 * 3); // 数えるのは 🍂, 🌱, ❄ の3個
    s.board[7] = { player: '⭕', bind: 5, effects: fx('🌱', '🌱') };
    assert.strictEqual(e.calculateCost(s, e.skillCosts.onClickBurnOff, true, false, 'onClickBurnOff'), 1, '最低1');
});

test('無礼講: このターン、トークン系スキルのコストが0になる。トークン以外は変わらない。手番が終わると切れる。二重には撃てない', () => {
    const s = game('you', 'you');
    s.heartTurn = true; s.heartMagic = 30;
    assert.strictEqual(e.calculateCost(s, e.skillCosts.onClickBudsToken, true, false, 'onClickBudsToken'), e.skillCosts.onClickBudsToken);
    const before = s.heartMagic;
    e.SKILLS.freeToken(s);
    assert.strictEqual(before - s.heartMagic, e.skillCosts.onClickFreeToken);
    assert.strictEqual(e.calculateCost(s, e.skillCosts.onClickBudsToken, true, false, 'onClickBudsToken'), 0);
    assert.strictEqual(e.calculateCost(s, e.skillCosts.onClickSmallFry, false, false, 'onClickSmallFry') > 0, true, 'トークン以外は変わらない');
    assert.strictEqual(e.freeTokenLegal(s), false);
    const m = s.heartMagic;
    e.SKILLS.freeToken(s);
    assert.strictEqual(s.heartMagic, m, '二重には撃てない');
});








// ---- 本番のAI(aiDriver)での進行 ----
test('多人数・氷結・火炎: 本番AIだけの3〜8人戦、氷室/鍛冶師の組が最後まで進み、手番が止まらない', () => {
    const { runGame } = require('./run');
    const cases = [Array(3).fill('you'), Array(5).fill('you'), Array(8).fill('you'), ['cryomancer', 'pyromancer'], ['pyromancer', 'you'], ['you', 'cryomancer']];
    cases.forEach((chars, k) => {
        const r = runGame(chars, e.makeRng(7 + k), 'prod', undefined, null, {});
        assert.ok(r.turns > 3, chars.join('/') + ' が進んだ');
        assert.ok(!(r.stats.aiStall > 0), `${chars.join('/')}: 行き詰まり ${r.stats.aiStall}`);
    });
});

test('本番AI: 打てるマスが無い（無敵の⚡だらけ）ときはチャージでパスし、手番が止まらない', () => {
    const aiDriver = require('./aiDriver');
    const s = game('electrician', 'electrician');
    s.heartTurn = true; s.heartMagic = 3; s.life = 5;
    for (let i = 0; i < 16; i++) s.board[i] = { player: i % 2 ? '⭕' : '💙', bind: 2, effects: [{ effect: '⚡' }] };
    s.skills = [0, 1, 2];
    const before = s.currentTurn;
    aiDriver.playTurn(s);
    assert.ok(s.currentTurn > before);
    assert.strictEqual(s.heartTurn, false);
});

test('本番AI: ⚡で無敵の自コマを対策ロックの対象にしない（4人戦で手番が進まなくなる不具合）', () => {
    const aiDriver = require('./aiDriver');
    const gear = require('./shared/gear');
    const chars = ['electrician', 'tactician', 'magician', 'poisoner'];
    for (const g of [8, 2, 11]) {
        const s = e.newGame({ chars, gears: chars.map(gear.recommendedGears), rng: e.makeRng(1000 + g), size: 7 });
        let guard = 0;
        while (!s.winner && guard++ < 1200) {
            const before = s.currentTurn;
            aiDriver.takeTurn(s);
            assert.ok(s.winner || s.currentTurn !== before, `seed ${g}: 手番が進まない (turn ${before})`);
        }
    }
});

test('本番AI: 一寸の虫に魂なしで縛られてライフ3以下なら着手せず（手番はスキルかチャージで終わる）', () => {
    const aiDriver = require('./aiDriver');
    const s = e.newGame({ chars: ['you', 'you'], rng: e.makeRng(9) });
    s.turn = 1; s.life = 3; s.lifeBan[1] = true; s.magic[1] = 30;
    s.skills = [2, 3, 5];
    const placed = s.placements;
    aiDriver.takeTurn(s);
    assert.strictEqual(s.placements, placed, '通常の着手はしない（トークンはライフ4なので撃てる）');
    assert.strictEqual(s.turn, 0, '手番は終わる');
});

test('本番AI: 陰陽師はコンボ札(百鬼夜行71)がデッキに無ければ、引き直して探さない', () => {
    const aiDriver = require('./aiDriver');
    const deckMod = require('./shared/deck');
    const digs = (deck) => {
        let n = 0;
        const orig = e.shuffleHand;
        e.shuffleHand = (s) => { if (s.chars[s.turn] === 'yinYangMaster') n++; return orig(s); };
        try {
            for (let g = 0; g < 16; g++) {
                const s = e.newGame({ chars: ['yinYangMaster', 'magician'], rng: e.makeRng(900 + g), decks: [deck, deckMod.recommendedDeck('magician')] });
                for (let t = 0; t < 120 && !s.winner; t++) aiDriver.playTurn(s);
            }
        } finally { e.shuffleHand = orig; }
        return n;
    };
    assert.ok(digs(deckMod.recommendedDeck('yinYangMaster')) > 0, '推奨デッキでは探す');
    assert.strictEqual(digs([0, 2, 3, 5, 6, 8, 10, 12, 72, 73, 53, 1]), 0, '百鬼夜行が無ければ探さない');
});

test('runGame: 誰も着手しないままパスが続く膠着は、上限まで回さず打ち切って引き分けにする', () => {
    const { runGame } = require('./run');
    const aiDriver = require('./aiDriver');
    const orig = aiDriver.playTurn;
    let calls = 0;
    aiDriver.playTurn = (s) => { calls++; e.SKILLS.charge(s); };
    try {
        const r = runGame(['you', 'you'], e.makeRng(1), 'prod');
        assert.strictEqual(r.winnerSeat, -1);
        assert.ok(calls <= 20, `パス20回で打ち切る（${calls}回）`);
    } finally { aiDriver.playTurn = orig; }
});

test('火口: 直前の手番に🌱🍂が植えられていれば無料。無料は1手番に1回まで。植えられていなければ通常コスト', () => {
    const s = game('magician', 'pyromancer'); // 先手=魔法使い(💙)、後手=鍛冶師(⭕)
    // 魔法使いの手番中に🌱が植わった(盤上の🌱が増えた)まま着手して手番が鍛冶師へ移る
    s.board[4] = { player: '💙', bind: 5, effects: [{ effect: '🌱' }] };
    s.board[8] = { player: '💙', bind: 5, effects: [{ effect: '🌱' }] };
    e.placeMove(s, 0);
    assert.strictEqual(s.turn, 1);
    assert.strictEqual(s.plantPrev[1], true, '直前の手番に🌱が増えた');
    s.magic[1] = 10;
    const m0 = s.magic[1];
    e.SKILLS.tinder(s);
    assert.strictEqual(m0 - s.magic[1], 0, '無料');
    assert.strictEqual(s.plantPrev[1], false, '無料は1手番に1回まで');
    assert.ok(e.placeMove(s, 4));
    const m1 = s.magic[1];
    e.SKILLS.tinder(s);
    assert.strictEqual(m1 - s.magic[1], 1, '2回目は通常コスト(鍛冶師は-1で1)');
    // 植えられていない手番では通常コスト
    const t = game('magician', 'pyromancer');
    t.board[4] = { player: '💙', bind: 5, effects: [] };
    e.placeMove(t, 0);
    t.board[8] = { player: '💙', bind: 5, effects: [{ effect: '🌱' }] };
    assert.strictEqual(t.plantPrev[1], false);
    t.magic[1] = 10;
    const m2 = t.magic[1];
    e.SKILLS.tinder(t);
    assert.strictEqual(m2 - t.magic[1], 1);
});

test('飛び火: ランダムな敵2マスに🔥。直前の手番に相手がコマを2つ以上設置していれば無料（各ターン1回まで）。1つだけなら通常コスト', () => {
    const s = game('magician', 'pyromancer'); // 先手=魔法使い(💙)、後手=鍛冶師(⭕)
    for (const i of [4, 8, 12]) s.board[i] = { player: '💙', bind: 5, effects: [] };
    // 魔法使いの手番の開始時点で自陣は0コマ。着手と合わせて4コマに増えた状態で手番が鍛冶師へ移る
    s.placeBase[0] = 0;
    e.placeMove(s, 0);
    assert.strictEqual(s.turn, 1);
    assert.strictEqual(s.placedPrev[1], true, '相手が2つ以上設置した');
    s.magic[1] = 10;
    const m0 = s.magic[1];
    e.SKILLS.spark(s);
    assert.strictEqual(m0 - s.magic[1], 0, '無料');
    const hit = [0, 4, 8, 12].filter((i) => !s.board[i].player || s.board[i].effects.some((x) => x.effect === '🔥')).length;
    assert.strictEqual(hit, 2, '敵2マスに🔥（ライフ1のコマは付与の瞬間に壊れて空きマスになる）');
    assert.strictEqual(s.placedPrev[1], false, '無料は1手番に1回まで');
    const m1 = s.magic[1];
    e.SKILLS.spark(s);
    assert.strictEqual(m1 - s.magic[1], 3, '2回目は通常コスト(基礎4、鍛冶師は🔥付与で-1=3)');
    // コマが1つしか増えていない手番では通常コスト
    const t = game('magician', 'pyromancer');
    t.board[4] = { player: '💙', bind: 5, effects: [] };
    t.board[8] = { player: '💙', bind: 5, effects: [] };
    t.placeBase[0] = 2; // 手番開始時点で自陣2コマ → 着手で3コマ（+1）
    e.placeMove(t, 0);
    assert.strictEqual(t.placedPrev[1], false);
    t.magic[1] = 10;
    const m2 = t.magic[1];
    e.SKILLS.spark(t);
    assert.strictEqual(m2 - t.magic[1], 3);
});

// ---- 夜の帳・弔い割引・毒返しの構え(idx 98〜100) ----
test('夜の帳: 次の相手の手番の間だけ、相手のスキルのコストが+3になる。自分は変わらない', () => {
    const s = game('you', 'you');
    s.heartTurn = true; s.heartMagic = 30;
    const mineBefore = e.calculateCost(s, e.skillCosts.onClickSmallFry, false, false, 'onClickSmallFry');
    e.SKILLS.nightVeil(s);
    assert.strictEqual(s.veilNext[1], true, '相手の席に予約される');
    assert.strictEqual(e.calculateCost(s, e.skillCosts.onClickSmallFry, false, false, 'onClickSmallFry'), mineBefore, '自分のコストは変わらない');
    assert.strictEqual(s.veilNext[0], false);
});
test('弔い割引: 死体の数（上限3）だけ次のスキルを軽減する。死体が無ければ撃てない', () => {
    const s = game('necromancer', 'you');
    s.heartTurn = true; s.heartMagic = 30;
    assert.strictEqual(e.graveDiscountLegal(s), false, '死体が無いと撃てない');
    s.necroCost[0] = 6; // 死体4体
    assert.strictEqual(e.graveDiscountLegal(s), true);
    const before = s.discount[0].next;
    const m = s.heartMagic;
    e.SKILLS.graveDiscount(s);
    assert.strictEqual(s.discount[0].next - before, 3, '上限3');
    assert.strictEqual(m - s.heartMagic, e.skillCosts.onClickGraveDiscount);
});
test('弔い割引: ネクロマンサー以外でも、墓地（necroCost）が減っていれば使える。自動では貯まらない', () => {
    const s = game('you', 'you');
    s.heartTurn = true; s.heartMagic = 30;
    assert.strictEqual(e.graveDiscountLegal(s), false);
    s.necroCost[0] = 9;
    assert.strictEqual(e.graveDiscountLegal(s), true);
});
test('毒返しの構え: 使うと3手番の間効き、二重には撃てない', () => {
    const s = game('you', 'you');
    s.heartTurn = true; s.heartMagic = 30;
    assert.strictEqual(e.poisonWardLegal(s), true);
    e.SKILLS.poisonWard(s);
    assert.strictEqual(s.ward[0], 3);
    assert.strictEqual(s.wardFresh[0], true);
    assert.strictEqual(e.poisonWardLegal(s), false);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
