// @ts-check
'use strict';
// sim/engine.test.js から読み込まれるテスト（共有の道具は ../testkit.js）
const { assert, e, test, game, gameN } = require('../testkit');

// ---- 多人数 (issue #32 / #30) ----
console.log('multi-player:');

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
    const geo = require('../shared/boardGeometry').geometryOf(s.size);
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
        // ロックはライフを変えずスタックで数える (#438)。空きマスと壊れたマスは1、自陣のコマはライフ分
        if (j !== mine) assert.strictEqual(s.board[j].bind, 0);
        assert.strictEqual(s.board[j].effects.find((x) => x.effect === '🔑').stack, j === mine ? 2 : 1);
    }
    // 相手の手番: ロック中のマスには置けない
    assert.strictEqual(e.placeMove(s, enemy), false);
});

test('巨人以外はオーラを持たない', () => {
    const s = gameN('you', 'giant');
    s.life = 5;
    e.placeMove(s, 5);
    const geo = require('../shared/boardGeometry').geometryOf(s.size);
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
    assert.deepStrictEqual(s.board[6], { player: '💙', bind: 2, effects: [], object: 'shikigami' });
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
    s.board[5] = { player: '💙', bind: 0, effects: [], object: 'shikigami' };
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
    const aiDriver = require('../aiDriver');
    const { runGame } = require('../run');
    const cases = [['witch', 'giant'], ['poisoner', 'magician'], ['magician', 'cryomancer'], ['cryomancer', 'poisoner'], ['you', 'tactician', 'electrician'], ['cryomancer', 'pyromancer', 'yinYangMaster', 'necromancer']];
    cases.forEach((chars, k) => {
        const r = runGame(chars, e.makeRng(100 + k), 'prod', undefined, null, { deck: true, gears: true }); // 縛り(一寸の虫)で式神設置を外したのに爆破が残って行き詰まる不具合の回帰(seed 104/107/111/115/134/137)
        assert.ok(r.turns > 3, chars.join('/') + ' が進んだ');
        assert.ok(!(r.stats.aiStall > 0), `${chars.join('/')}: 行き詰まり ${r.stats.aiStall}`);
    });
    assert.strictEqual(typeof aiDriver.playTurn, 'function');
});
