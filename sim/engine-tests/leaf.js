// @ts-check
'use strict';
// sim/engine.test.js から読み込まれるテスト（共有の道具は ../testkit.js）
const { assert, e, test, game, FRZ, BUD, flames, LEAF, leavesOn, FLM } = require('../testkit');

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

test('🍂落ち葉トークン3種: 自陣のコマに🍂を付けて置く（コスト5/7/8・トークンはターン1回）', () => {
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
    assert.strictEqual(s.heartMagic, 30 - 8);
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
    const th = require('../shared/thermal');
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
    assert.strictEqual(s.board[0].bind, 0);
    assert.strictEqual(s.board[0].effects.filter((x) => x.effect === '🔑').length, 1);
    assert.strictEqual(s.board[0].effects.find((x) => x.effect === '🔑').stack, 3); // 3ターンのロック
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
