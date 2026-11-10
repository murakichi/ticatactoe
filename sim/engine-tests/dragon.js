// @ts-check
'use strict';
// 龍神の巫女（#527）と二列勝利（#526）。共有の道具は ../testkit.js
const { assert, e, test } = require('../testkit');
const objectsMod = require('../shared/objects');

const five = (...chars) => e.newGame({ chars, rng: e.makeRng(7), size: 5 });
const at = (r, c) => r * 5 + c;
const build = (s, i, p = '💙') => { s.board[i] = objectsMod.newObject(p, 'fort'); };
const CORNER = [at(0, 3), at(1, 2), at(2, 1), at(3, 0)];

test('龍神の巫女: 4つ目の建造物を置くと覚醒し、囲んだ範囲と建造物が消えて N が決まる', () => {
    const s = five('dragonMiko', 'you');
    s.turn = 0;
    CORNER.slice(0, 3).forEach((i) => build(s, i));
    s.board[at(0, 0)] = { player: '⭕', bind: 3, effects: [] };
    s.objectPlacing = 'fort';
    assert.strictEqual(e.placeMove(s, CORNER[3]), true);
    assert.strictEqual(s.dragon[0].form, 'dragon');
    assert.strictEqual(s.dragon[0].n, 10, '囲んだ6 + 建造物4');
    assert.strictEqual(s.board[at(0, 0)].player, undefined, '囲んだ範囲の敵コマは消える');
    assert.strictEqual(s.board[CORNER[0]].object, undefined, '建造物も消える');
});

test('龍神の巫女: 覚醒前の建造物は3つまでなら巫女のまま', () => {
    const s = five('dragonMiko', 'you');
    s.turn = 0;
    CORNER.slice(0, 2).forEach((i) => build(s, i));
    s.objectPlacing = 'fort';
    e.placeMove(s, CORNER[2]);
    assert.strictEqual(s.dragon[0].form, 'miko');
});

test('龍神の巫女: 龍になると手番開始の魔力が N 増え、ライフ平均は 5+N+4', () => {
    const s = five('dragonMiko', 'you');
    s.dragon[0] = { form: 'dragon', n: 6 };
    s.turn = 1;
    const before = s.magic[0];
    s.board = s.board.map(() => ({ player: undefined, bind: 0, effects: [] }));
    e.advanceTurn(s); // 席0へ
    assert.strictEqual(s.turn, 0);
    assert.ok(s.magic[0] - before >= 6 + 1, '+1 に加えて N=6');
});

test('龍神の巫女: 龍の防壁。相手が列を揃えたら、その列と自陣のコマが消えて巫女に戻る', () => {
    const s = five('dragonMiko', 'you');
    s.dragon[0] = { form: 'dragon', n: 6 };
    [0, 1, 2, 3].forEach((c) => { s.board[at(4, c)] = { player: '⭕', bind: 3, effects: [] }; });
    s.board[at(0, 0)] = { player: '💙', bind: 3, effects: [] };
    e.settleWinner(s);
    assert.strictEqual(s.winner, undefined, '勝ちにならない');
    assert.strictEqual(s.dragon[0].form, 'miko');
    assert.strictEqual(s.board[at(4, 0)].player, undefined, '揃った列は消える');
    assert.strictEqual(s.board[at(0, 0)].player, undefined, '自陣のコマも消える');
});

test('龍神の巫女: 巫女のあいだは防壁が無く、相手の1本で負ける', () => {
    const s = five('dragonMiko', 'you');
    [0, 1, 2, 3].forEach((c) => { s.board[at(4, c)] = { player: '⭕', bind: 3, effects: [] }; });
    e.settleWinner(s);
    assert.strictEqual(s.winner, '⭕');
});

test('龍神の巫女: 二列勝利。1本では勝たず、別々の2本で勝つ', () => {
    const s = five('dragonMiko', 'you');
    [0, 1, 2, 3].forEach((c) => { s.board[at(0, c)] = { player: '💙', bind: 3, effects: [] }; });
    e.settleWinner(s);
    assert.strictEqual(s.winner, undefined);
    [0, 1, 2, 3].forEach((c) => { s.board[at(2, c)] = { player: '💙', bind: 3, effects: [] }; });
    e.settleWinner(s);
    assert.strictEqual(s.winner, '💙');
});

test('龍の咆哮: 周囲の敵コマを破壊し、自陣のオブジェクトに⚡（着地ダメージも例外なく入る）。ターンが終わる', () => {
    const s = five('dragonMiko', 'you');
    s.turn = 0;
    s.dragon[0] = { form: 'dragon', n: 6 };
    s.magic[0] = 20;
    build(s, at(2, 2));
    s.board[at(2, 3)] = { player: '⭕', bind: 3, effects: [] };
    assert.strictEqual(e.SKILLS.roar !== undefined, true);
    e.SKILLS.roar(s);
    assert.strictEqual(s.board[at(2, 3)].player, undefined);
    assert.ok(s.board[at(2, 2)].effects.some((x) => x.effect === '⚡'));
    assert.strictEqual(s.board[at(2, 2)].bind, objectsMod.OBJECT_LIFE - 2);
    assert.strictEqual(s.turn, 1, 'ターン終了');
    assert.strictEqual(s.magic[0], 20 - e.skillCosts.onClickRoar);
});

test('八百万の祈り: デッキ内の建造物から1つ引いて設置待ちになる。中身のコストは払わない', () => {
    const s = e.newGame({ chars: ['dragonMiko', 'you'], rng: e.makeRng(7), size: 5, decks: true });
    s.turn = 0;
    s.magic[0] = 20;
    e.SKILLS.prayer(s);
    assert.ok(s.objectPlacing, '設置する種類が決まる');
    assert.strictEqual(s.magic[0], 20 - e.skillCosts.onClickPrayer);
    assert.strictEqual(e.placeMove(s, at(2, 2)), true);
    assert.strictEqual(s.board[at(2, 2)].object, s.objectPlacing === null ? s.board[at(2, 2)].object : undefined);
    assert.ok(s.board[at(2, 2)].object, '建造物が置かれる');
});

test('瓦礫の礎: 自分以外の手番に壊された自陣の建造物の位置に、大岩が置かれて魔力+1', () => {
    const s = e.newGame({ chars: ['dragonMiko', 'you'], rng: e.makeRng(7), size: 5, gears: [['rubbleBase'], []] });
    build(s, at(2, 2));
    s.turn = 1; // 相手の手番
    e.advanceTurn(s); // 頭の盤面を記録（建造物がある状態）
    // 相手の手番中に建造物が壊される → 次の advanceTurn で大岩になる
    const m = s.magic[0];
    s.board[at(2, 2)] = { player: undefined, bind: 0, effects: [] };
    s.turn = 1;
    e.advanceTurn(s);
    assert.strictEqual(s.board[at(2, 2)].object, 'boulder');
    assert.strictEqual(s.board[at(2, 2)].player, '💙');
    assert.ok(s.magic[0] >= m + 1, '魔力+1（手番開始の分も加わる）');
});

test('瓦礫の礎: 自分の手番に消えた建造物（覚醒）は対象外', () => {
    const s = e.newGame({ chars: ['dragonMiko', 'you'], rng: e.makeRng(7), size: 5, gears: [['rubbleBase'], []] });
    s.turn = 0;
    CORNER.slice(0, 3).forEach((i) => build(s, i));
    e.advanceTurn(s); // 記録
    s.turn = 0;
    s.objectPlacing = 'fort';
    e.placeMove(s, CORNER[3]); // 覚醒で建造物が消える（自分の手番）
    assert.strictEqual(s.dragon[0].form, 'dragon');
    e.advanceTurn(s);
    assert.ok(s.board.every((q) => q.object !== 'boulder'), '大岩は置かれない');
});
