// @ts-check
'use strict';
// sim/engine.test.js から読み込まれるテスト（共有の道具は ../testkit.js）
const { assert, e, test, game } = require('../testkit');

// ---- 本番のAI(aiDriver)での進行 ----
test('多人数・氷結・火炎: 本番AIだけの3〜8人戦、氷室/鍛冶師の組が最後まで進み、手番が止まらない', () => {
    const { runGame } = require('../run');
    const cases = [Array(3).fill('you'), Array(5).fill('you'), Array(8).fill('you'), ['cryomancer', 'pyromancer'], ['pyromancer', 'you'], ['you', 'cryomancer']];
    cases.forEach((chars, k) => {
        const r = runGame(chars, e.makeRng(7 + k), 'prod', undefined, null, {});
        assert.ok(r.turns > 3, chars.join('/') + ' が進んだ');
        assert.ok(!(r.stats.aiStall > 0), `${chars.join('/')}: 行き詰まり ${r.stats.aiStall}`);
    });
});

test('本番AI: 打てるマスが無い（無敵の⚡だらけ）ときはチャージでパスし、手番が止まらない', () => {
    const aiDriver = require('../aiDriver');
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
    const aiDriver = require('../aiDriver');
    const gear = require('../shared/gear');
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
    const aiDriver = require('../aiDriver');
    const s = e.newGame({ chars: ['you', 'you'], rng: e.makeRng(9) });
    s.turn = 1; s.life = 3; s.lifeBan[1] = true; s.magic[1] = 30;
    s.skills = [2, 3, 5];
    const placed = s.placements;
    aiDriver.takeTurn(s);
    assert.strictEqual(s.placements, placed, '通常の着手はしない（トークンはライフ4なので撃てる）');
    assert.strictEqual(s.turn, 0, '手番は終わる');
});

test('本番AI: 陰陽師はコンボ札(百鬼夜行71)がデッキに無ければ、引き直して探さない', () => {
    const aiDriver = require('../aiDriver');
    const deckMod = require('../shared/deck');
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
    assert.ok(digs([0, 2, 3, 5, 6, 8, 10, 92, 71, 72, 73, 53]) > 0, 'コンボ札(71/73/53)が揃うデッキでは探す'); // 推奨デッキはコンボ待ちをやめた（百鬼夜行→バーンアウト）ので、旧デッキで確かめる
    assert.strictEqual(digs([0, 2, 3, 5, 6, 8, 10, 12, 72, 73, 53, 1]), 0, '百鬼夜行が無ければ探さない');
});

test('runGame: 誰も着手しないままパスが続く膠着は、上限まで回さず打ち切って引き分けにする', () => {
    const { runGame } = require('../run');
    const aiDriver = require('../aiDriver');
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
