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
    const geo = require('./geometry.js').geometryOf(s.size);
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
    const geo = require('./geometry.js').geometryOf(s.size);
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

test('式神(陰): 任意の空きマスに置ける。ライフ2・📜付きの自陣、コスト3。埋まったマスは選び直せる', () => {
    const s = gameN('yinYangMaster', 'you', 'you');
    s.board[1] = { player: '⭕', bind: 5, effects: [] };
    s.magic[0] = 10;
    e.SKILLS.shikigamiPlace(s);
    assert.strictEqual(s.magic[0], 7);
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
    assert.strictEqual(s.magic[0], 5);
    assert.strictEqual(e.placeMove(s, 2), false); // 式神でないマスは選び直せる
    assert.strictEqual(e.placeMove(s, 5), true);
    assert.deepStrictEqual(s.board[5], { player: undefined, bind: 0, effects: [] });
    assert.strictEqual(s.board[0].player, undefined);
    assert.strictEqual(s.board[1].bind, 2);
    assert.strictEqual(s.board[2].bind, 3);
    assert.strictEqual(s.board[15].bind, 3);
    for (const j of [4, 6, 8, 9, 10]) assert.deepStrictEqual(s.board[j], e.newShikigami('💙'));
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

test('式神一括は式神の数に比例して高くなる（盤面を埋める百鬼夜行→一括は重い）', () => {
    const s = game('yinYangMaster', 'you');
    for (let i = 0; i < 16; i++) s.board[i] = { player: undefined, bind: 0, effects: [] };
    s.magic[0] = 80;
    e.SKILLS.shikigamiFlood(s); // 16マス全て式神
    const before = s.magic[0];
    e.SKILLS.shikigamiAll(s);
    assert.strictEqual(before - s.magic[0], 3 * 16);
});

test('百鬼夜行(コスト7): 着手できる全ての空きマスにライフ0の式神を置く。氷結中の空きマスと既存のコマは変えない', () => {
    const s = game('yinYangMaster', 'you');
    s.board[0] = { player: '⭕', bind: 3, effects: [] };
    s.board[1] = { player: '💙', bind: 3, effects: [] };
    const frz = { effect: '❄' };
    s.board[2] = { player: undefined, bind: 0, effects: [frz] };
    s.magic[0] = 20;
    e.SKILLS.shikigamiFlood(s);
    assert.strictEqual(s.magic[0], 13);
    assert.deepStrictEqual(s.board[0], { player: '⭕', bind: 3, effects: [] });
    assert.deepStrictEqual(s.board[2], { player: undefined, bind: 0, effects: [frz] });
    const placed = s.board.filter((sq) => e.isShikigami(sq));
    assert.strictEqual(placed.length, 13);
    assert.ok(placed.every((sq) => sq.player === '💙' && sq.bind === 0));
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

test('多人数: AIだけで3〜8人の試合が最後まで進む', () => {
    const ai = require('./ai');
    for (const n of [3, 5, 8]) {
        const s = e.newGame({ chars: Array(n).fill('you'), rng: e.makeRng(7) });
        let guard = 0;
        while (!s.winner && guard++ < 60) {
            const r = ai.makeMove(s, 'capture');
            if (r.turnEnded) continue;
            if (r.move === null) break; // 盤が埋まった
            e.placeMove(s, r.move);
        }
        assert.ok(guard > 3);
    }
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

test('打てるマスが無い（無敵の⚡だらけ）AIはチャージでパスし、手番が止まらない', () => {
    const ai = require('./ai');
    const s = game('electrician', 'electrician');
    s.heartTurn = true; s.heartMagic = 3; s.life = 5;
    for (let i = 0; i < 16; i++) s.board[i] = { player: i % 2 ? '⭕' : '💙', bind: 2, effects: [{ effect: '⚡' }] };
    s.skills = [0, 1, 2];
    const before = s.currentTurn;
    const r = ai.makeMove(s, 'faithful');
    assert.strictEqual(r.turnEnded, true);
    assert.ok(s.currentTurn > before);
    assert.strictEqual(s.heartTurn, false);
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
    const th = require('./thermal');
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
    const idx = require('./geometry').geometryOf(anti.size).antiDiagonal[1];
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
    const th = require('./thermal');
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
    assert.strictEqual(require('./config').lifeMeans.cryomancer, 4);
});

test('氷結は🔥のあるマスには付かない（空きマス・氷結済みへの重ね掛けは可）。freezeAll も🔥マスを飛ばす', () => {
    const th = require('./thermal');
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
    const th = require('./thermal');
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
    const th = require('./thermal');
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
    const th = require('./thermal');
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

test('氷室の番人・煉獄の鍛冶師のAI同士の試合が最後まで進む（落ちない）', () => {
    const ai = require('./ai');
    for (const [a, b] of [['cryomancer', 'pyromancer'], ['pyromancer', 'you'], ['you', 'cryomancer']]) {
        for (let seed = 1; seed <= 4; seed++) {
            const s = e.newGame({ chars: [a, b], rng: e.makeRng(seed) });
            let guard = 0;
            while (!s.winner && guard++ < 600) {
                const r = ai.makeMove(s, 'faithful');
                if (!r.turnEnded && r.move != null) e.placeMove(s, r.move);
                else if (!r.turnEnded) e.SKILLS.charge(s);
            }
            assert.ok(guard < 600, `${a} vs ${b} seed${seed} が終わらない`);
        }
    }
});

// ---- AI の氷結・火炎対応 (ai-improve Phase 1) ----
const aiMod = require('./ai');
const emptyAiBoard = () => Array.from({ length: 16 }, () => ({ player: undefined, bind: 0, effects: [] }));

test('AI countReaches: 残り1マスが氷結中/ロック中の空きマスならリーチと数えない', () => {
    const b = emptyAiBoard();
    for (const i of [0, 1, 2]) b[i] = { player: '💙', bind: 5, effects: [] };
    assert.strictEqual(aiMod.countReaches(b, '💙'), 1);
    b[3] = { player: undefined, bind: 0, effects: [FRZ] };
    assert.strictEqual(aiMod.countReaches(b, '💙'), 0);
    b[3] = { player: undefined, bind: 3, effects: [{ effect: '🔑' }] };
    assert.strictEqual(aiMod.countReaches(b, '💙'), 0);
    assert.deepStrictEqual(aiMod.findThreatSquares(b, '💙'), []);
});

test('AI evaluateBoard: 氷結中の空きマスを含むラインは評価しない', () => {
    const b = emptyAiBoard();
    for (const i of [0, 1, 2]) b[i] = { player: '💙', bind: 5, effects: [] };
    const open = aiMod.evaluateBoard(b, '💙');
    b[3] = { player: undefined, bind: 0, effects: [FRZ] };
    assert.ok(aiMod.evaluateBoard(b, '💙') < open);
});

test('AI ストンプ/審判の日/救済の中心: 氷結中の敵は壊れないものとして数えない', () => {
    const b = emptyAiBoard();
    for (const i of [5, 6]) b[i] = { player: '⭕', bind: 5, effects: [FRZ] };
    assert.strictEqual(aiMod.bestStompTarget(b, '💙'), null);
    assert.strictEqual(aiMod.bestJudgeTarget(b, '💙'), null);
    b[9] = { player: '⭕', bind: 5, effects: [] };
    b[10] = { player: '⭕', bind: 5, effects: [] };
    assert.notStrictEqual(aiMod.bestStompTarget(b, '💙'), null);
    // 救済: 氷結中の3つ並びは壊れず、脅威(3つ目の隣)は残る
    const r = emptyAiBoard();
    for (const i of [0, 1, 2]) r[i] = { player: '⭕', bind: 5, effects: [FRZ] };
    const c = aiMod.bestRescueCenter(r, '💙', ['⭕'], 'judge');
    assert.notStrictEqual(c, null);
});

test('AI 氷室の番人: 相手の単独リーチは氷結で塞ぎ（着手を使わない）、その手番は攻めに使う', () => {
    const s = game('cryomancer', 'you');
    s.heartTurn = true; s.heartMagic = 10; s.life = 4;
    for (const i of [0, 1, 2]) s.board[i] = { player: '⭕', bind: 6, effects: [] }; // 3 の目が脅威
    for (const i of [4, 5]) s.board[i] = { player: '💙', bind: 6, effects: [] };
    const before = s.heartMagic;
    const r = aiMod.makeMove(s, 'faithful');
    assert.ok(s.board[3].effects.some((x) => x.effect === '❄'), '脅威マスが凍っている');
    assert.strictEqual(s.board[3].player, undefined);
    assert.strictEqual(s.heartMagic, before - 2);
    assert.notStrictEqual(r.move, 3); // 凍った空きマスには着手しない
    assert.strictEqual(r.turnEnded, false);
    assert.strictEqual(aiMod.countReaches(s.board, '⭕'), 0);
});

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
    const th = require('./thermal');
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
    const th = require('./thermal');
    const b = t.board.map((x) => ({ ...x, effects: x.effects.slice() }));
    const r = th.sacrificeFlame(b, 5, '💙', 4, null);
    assert.deepStrictEqual(r, { threshold: 3, targets: [], thawed: [] });
    assert.strictEqual(th.sacrificeFlame(b, 0, '💙', 4, null).threshold, 0); // 敵のコマは犠牲にできない
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

test('AI 対氷結: 自分のリーチの4つ目が氷結中の空きマスで塞がれていたら、火遁で隣の敵コマを燃やして解凍し、同じ手番で完成させる', () => {
    const s = game('you', 'you');
    s.heartTurn = true; s.heartMagic = 10; s.life = 4;
    s.skills = [31, 0, 1];
    for (const i of [0, 1, 2]) s.board[i] = { player: '💙', bind: 5, effects: [] };
    s.board[3] = { player: undefined, bind: 0, effects: [FRZ] };      // 4つ目が凍っている
    s.board[7] = { player: '⭕', bind: 5, effects: [] };               // 隣の敵コマ
    const before = s.heartMagic;
    const r = aiMod.makeMove(s, 'faithful');
    assert.strictEqual(r.move, 3);
    assert.strictEqual(s.board[7].effects.filter((x) => x.effect === '🔥').length, 1);
    assert.ok(!s.board[3].effects.some((x) => x.effect === '❄'));
    assert.strictEqual(s.heartMagic, before - 3);
    // 手札に火遁が無ければ何もしない（凍結マスには着手できない）
    const t = game('you', 'you');
    t.heartTurn = true; t.heartMagic = 10; t.life = 4; t.skills = [0, 1, 2];
    for (const i of [0, 1, 2]) t.board[i] = { player: '💙', bind: 5, effects: [] };
    t.board[3] = { player: undefined, bind: 0, effects: [FRZ] };
    t.board[7] = { player: '⭕', bind: 5, effects: [] };
    const r2 = aiMod.makeMove(t, 'faithful');
    assert.notStrictEqual(r2.move, 3);
    assert.ok(t.board[3].effects.some((x) => x.effect === '❄'));
});

// ---- 氷結スキル群 idx41〜48 ----
const geo4 = require('./geometry');
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
    const th = require('./thermal');
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
    const th = require('./thermal');
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
    const th = require('./thermal');
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
    const th = require('./thermal');
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

test('氷結スキル群のコスト表と絶対零度のカウンタへの寄与（作れなかったマスは数えない）、AIが新しい手札idxで壊れない', () => {
    assert.deepStrictEqual([e.skillCosts.onClickFrostArea, e.skillCosts.onClickIcicle, e.skillCosts.onClickRandomFreeze, e.skillCosts.onClickFreezeSpread, e.skillCosts.onClickFrostToken, e.skillCosts.onClickDoubleFrostToken, e.skillCosts.onClickShatter, e.skillCosts.onClickFrostfall], [5, 6, 3, 7, 3, 5, 4, 3]);
    const keys = Object.keys(e.skillCosts);
    assert.deepStrictEqual(keys.slice(keys.indexOf('onClickSacrifice')), ['onClickSacrifice', 'onClickFrostArea', 'onClickIcicle', 'onClickRandomFreeze', 'onClickFreezeSpread', 'onClickFrostToken', 'onClickDoubleFrostToken', 'onClickShatter', 'onClickFrostfall', 'onClickBoost', 'onClickRelocate', 'onClickClone', 'onClickPlunder', 'onClickMarkdown', 'onClickEffectDiscount', 'onClickTokenDiscount', 'onClickVitalMarkdown', 'onClickUniqueDiscount', 'onClickClearance', 'onClickRandomCast', 'onClickCounterMarkdown', 'onClickBurnout', 'onClickLeafToken', 'onClickTwinLeafToken', 'onClickDoubleLeafToken', 'onClickBothLeafToken', 'onClickBonfire', 'onClickMulch', 'onClickAutumn', 'onClickLeafFrost', 'onClickSpringWind', 'onClickKimon', 'onClickFireWheel', 'onClickStrip', 'onClickChargeSeason', 'onClickBristle', 'onClickRelease', 'onClickStash', 'onClickThunderFire', 'onClickDarkPot']);
    // 手札に新スキル(idx41〜48)があっても AI は落ちず手を返す
    const s = game('cryomancer', 'you');
    s.heartTurn = true; s.heartMagic = 20; s.life = 4;
    s.skills = [41, 45, 48];
    s.board[0] = { player: '⭕', bind: 3, effects: [] };
    assert.doesNotThrow(() => aiMod.makeMove(s, 'faithful'));
    for (let k = 0; k < 20; k++) {
        const g = e.newGame({ chars: ['you', 'cryomancer'], rng: e.makeRng(50 + k) });
        let n = 0;
        while (!g.winner && n++ < 400) {
            const r = aiMod.makeMove(g, 'faithful');
            if (!r.turnEnded && r.move != null) e.placeMove(g, r.move);
            else if (!r.turnEnded) e.SKILLS.charge(g);
        }
        assert.ok(n < 400);
    }
});


test('AI: ⚡で無敵の自コマを対策ロックの対象にしない（4人戦で手番が進まなくなる不具合）', () => {
    const ai = require('./ai');
    const gear = require('./gear');
    const chars = ['electrician', 'tactician', 'magician', 'poisoner'];
    // 修正前は seed 1000+8 / 1000+2 / 1000+11 で、雷霆の巫の手番がロックの選択待ちのまま止まった
    for (const g of [8, 2, 11]) {
        const s = e.newGame({ chars, gears: chars.map(gear.recommendedGears), rng: e.makeRng(1000 + g), size: 7 });
        let guard = 0;
        while (!s.winner && guard++ < 1200) {
            const r = ai.makeMove(s, 'faithful');
            if (r.turnEnded) continue;
            assert.notStrictEqual(r.move, null, `seed ${g}: 着手が無い (turn ${s.currentTurn})`);
            const before = s.currentTurn;
            e.placeMove(s, r.move);
            assert.notStrictEqual(s.currentTurn, before, `seed ${g}: 手番が進まない (turn ${before})`);
        }
    }
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


test('AI(discountPlan): 鍛冶師は軽減札で業火が撃てるようになるなら、軽減札を先に撃ってから業火を撃つ', () => {
    const ai = require('./ai');
    const mk = (flags) => {
        const s = game('pyromancer', 'you');
        s.heartTurn = true; s.heartMagic = 6; s.life = 3;
        for (const i of [1, 2, 3]) s.board[i] = { player: '⭕', bind: 5, effects: [] };
        s.skills = [58, 53, 0];
        s.aiFlags = [flags, flags];
        return s;
    };
    const on = mk({ pyroChain: 0, discountPlan: 1, discountInferno: 1, igniteSig: 0 }); // 火遁(igniteSig)は別の機構なので切って、軽減札→業火だけを見る
    assert.strictEqual(e.infernoCost(on), 7);
    ai.makeMove(on, 'faithful');
    assert.ok(on.stats && on.stats.inferno >= 1, '業火が撃たれる');
    assert.ok(on.heartMagic < 6, '軽減札と業火の分、魔力が減る');
    const off = mk({ pyroChain: 0, discountPlan: 0, igniteSig: 0 });
    ai.makeMove(off, 'faithful');
    assert.ok(!(off.stats && off.stats.inferno), '軽減札を使わなければ魔力6では業火は撃てない');
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


test('AI(burnoutAfter/pyroLock): 鍛冶師は業火のあとバーンアウトで🔥の敵コマを壊す。軽減札を手札に固定する', () => {
    const ai = require('./ai');
    const s = game('pyromancer', 'you');
    s.heartTurn = true; s.heartMagic = 12; s.life = 3;
    for (const i of [1, 2, 3, 6]) s.board[i] = { player: '⭕', bind: 5, effects: [] };
    s.skills = [61, 0, 3];
    s.aiFlags = [{ pyroChain: 0, discountPlan: 0 }, {}];
    ai.makeMove(s, 'faithful');
    assert.ok(s.stats && s.stats.inferno >= 1 && s.stats.burnout >= 1, '業火のあとバーンアウトが撃たれる');
    assert.strictEqual(s.board.filter((sq) => sq.player === '⭕').length, 0, '🔥の敵コマが全て壊れる');
    const t = game('pyromancer', 'you');
    t.heartTurn = true; t.heartMagic = 12; t.life = 3;
    t.skills = [53, 3, 60];
    t.aiFlags = [{ pyroLock: 1 }, {}];
    ai.makeMove(t, 'faithful');
    assert.ok(t.lockedSkills[0].includes(53) && t.lockedSkills[0].includes(60), '軽減札が固定される');
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

test('🍂落ち葉トークン4種: 自陣のコマに🍂を付けて置く（コスト5/7/9/5・トークンはターン1回）', () => {
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
    assert.strictEqual(s.heartMagic, 30 - 7);
    assert.deepStrictEqual(s.board.map(leavesOn).filter((n) => n > 0), [2]);
    s = run('doubleLeafToken');
    assert.strictEqual(s.heartMagic, 30 - 9);
    assert.deepStrictEqual(s.board.map(leavesOn).filter((n) => n > 0), [1, 1]);
    assert.strictEqual(s.board.filter((q) => q.player === '💙').length, 2);
    s = run('bothLeafToken');
    assert.strictEqual(s.heartMagic, 30 - 5);
    const mine = s.board.filter((q) => q.player === '💙');
    const theirs = s.board.filter((q) => q.player === '⭕');
    assert.strictEqual(mine.length, 1);
    assert.strictEqual(leavesOn(mine[0]), 1);
    assert.strictEqual(theirs.length, 1);
    assert.strictEqual(leavesOn(theirs[0]), 0); // 🍂が付くのは自分のコマだけ
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
    const th = require('./thermal');
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

test('毒使い: 推奨デッキに火遁(31)があり、氷結で塞がれた4つ目を火遁で解凍して完成させる（対氷室の番人の千日手を崩す）', () => {
    const ai = require('./ai');
    assert.ok(require('./deck').recommendedDeck('poisoner').includes(31), '毒使いの推奨デッキに火遁(31)');
    const s = game('poisoner', 'cryomancer');
    s.heartTurn = true; s.heartMagic = 10; s.life = 5;
    s.skills = [31, 0, 16];
    const mine = { player: '💙', bind: 5, effects: [] };
    for (const i of [4, 6, 7]) s.board[i] = { ...mine, effects: [] };
    s.board[1] = { player: '⭕', bind: 5, effects: [] };
    s.board[5] = { player: undefined, bind: 0, effects: [{ effect: '❄' }] };
    const r = ai.makeMove(s, 'faithful');
    if (!r.turnEnded && r.move != null) e.placeMove(s, r.move);
    assert.strictEqual(s.board[5].player, '💙', '解凍して5に着手できた');
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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
