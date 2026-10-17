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

const P = { effect: '☠' };
const stacks = (sq) => sq.effects.filter((x) => x.effect === '☠').length;

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

test('毒霧: 毒使いは毒系の割引(-1)を受けて6、他キャラは7', () => {
    const a = game('poisoner', 'you');
    a.heartTurn = true;
    a.heartMagic = 20;
    e.SKILLS.poisonMist(a);
    assert.strictEqual(20 - a.heartMagic, 6);
    const b = game('you', 'you');
    b.heartTurn = true; b.heartMagic = 20;
    e.SKILLS.poisonMist(b);
    assert.strictEqual(20 - b.heartMagic, 7);
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

test('手番は席順に回る（3人）', () => {
    const s = gameN('you', 'you', 'you');
    s.life = 5;
    const seen = [];
    for (let k = 0; k < 4; k++) { seen.push(s.turn); e.placeMove(s, k); }
    assert.deepStrictEqual(seen, [0, 1, 2, 0]);
});

test('巨人の休み: 次の巨人の席だけが飛ばされる（3人）。2人の同キャラは休みなし', () => {
    const s = gameN('you', 'giant', 'you');
    s.turn = 0; s.currentTurn = 14; // 14 % 5 === 4
    assert.strictEqual(e.judgeNextSeat(s), 2);
    s.currentTurn = 13;
    assert.strictEqual(e.judgeNextSeat(s), 1);
    const mirror = gameN('giant', 'giant');
    mirror.turn = 0; mirror.currentTurn = 14;
    assert.strictEqual(e.judgeNextSeat(mirror), 1);
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

test('凶荒の舞: 自分以外の全員のコマのライフを-2する', () => {
    const s = gameN('yinYangMaster', 'you', 'you');
    s.board[0] = { player: '⭕', bind: 5, effects: [] };
    s.board[1] = { player: '🟩', bind: 5, effects: [] };
    s.board[2] = { player: '💙', bind: 5, effects: [] };
    s.magic[0] = 20;
    e.SKILLS.yyDance(s);
    assert.deepStrictEqual([s.board[0].bind, s.board[1].bind, s.board[2].bind], [3, 3, 5]);
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

test('範囲帯電: 選んだマスを中心に3x3へ⚡、ダメージは出ない', () => {
    const s = game('electrician', 'you');
    s.heartTurn = true; s.heartMagic = 20;
    s.board[6] = { player: '⭕', bind: 4, effects: [] };
    e.SKILLS.chargeArea(s);
    assert.strictEqual(s.heartTurn, true);
    e.placeMove(s, 5);
    const cells = [0, 1, 2, 4, 5, 6, 8, 9, 10];
    assert.ok(cells.every((i) => e.chargeStacks(s.board[i]) === 1));
    assert.strictEqual(e.chargeStacks(s.board[3]), 0);
    assert.strictEqual(s.board[6].bind, 4);
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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
