// @ts-check
'use strict';
// sim/engine.test.js から読み込まれるテスト（共有の道具は ../testkit.js）
const { assert, e, test, game, stacks, zap } = require('../testkit');

// ---- 帯電 ⚡ (雷霆の巫, #39) ----

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

test('雷霆の巫パッシブ: ⚡の無い自陣マスも、ライフ0で奪われない（巨人と満杯の盤面は奪える。他のキャラは従来どおり奪える）', () => {
    const s = game('you', 'electrician');
    s.heartTurn = true; s.life = 9;
    s.board[3] = { player: '⭕', bind: 0, effects: [] };
    assert.strictEqual(e.placeMove(s, 3), false);
    assert.strictEqual(s.board[3].player, '⭕');
    const g = game('giant', 'electrician');
    g.heartTurn = true; g.life = 9;
    g.board[3] = { player: '⭕', bind: 0, effects: [] };
    assert.strictEqual(e.placeMove(g, 3), true); // 巨人は奪える
    const o = game('you', 'poisoner');
    o.heartTurn = true; o.life = 9;
    o.board[3] = { player: '⭕', bind: 0, effects: [] };
    assert.strictEqual(e.placeMove(o, 3), true); // 雷霆の巫以外は従来どおり
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
    const out = JSON.parse(execFileSync('node', ['-e', code], { cwd: require('path').join(__dirname, '..', '..'), env: { ...process.env } }).toString());
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
