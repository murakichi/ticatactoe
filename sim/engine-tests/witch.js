// @ts-check
'use strict';
// sim/engine.test.js から読み込まれるテスト（共有の道具は ../testkit.js）
const { assert, e, test, game, fx, cnt } = require('../testkit');

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

test('焚きつけ: 敵の🍂と🌱を全て🔥に変換（1つにつき🔥1つ）。🔑・自陣は対象外。コスト7（盤面の🍂1枚につき3・🌱1つにつき2軽減、最低1）', () => {
    const s = game('you', 'you');
    s.heartTurn = true; s.heartMagic = 20;
    const LF = { effect: '🍂' };
    s.board[0] = { player: '💙', bind: 3, effects: [LF] }; // 自陣の🍂は残る
    s.board[4] = { player: '⭕', bind: 8, effects: [LF, LF] };
    s.board[5] = { player: '⭕', bind: 8, effects: [LF, { effect: '🔑' }] };
    s.board[6] = { player: '⭕', bind: 8, effects: [] };
    s.board[7] = { player: '⭕', bind: 8, effects: [{ effect: '🌱' }, { effect: '🌱' }] };
    s.board[8] = { player: '💙', bind: 8, effects: [{ effect: '🌱' }] }; // 自陣の🌱は残る（軽減には数える）
    const before = s.heartMagic;
    e.SKILLS.kindling(s);
    const count = (i, k) => s.board[i].effects.filter((x) => x.effect === k).length;
    assert.strictEqual(count(4, '🍂'), 0);
    assert.strictEqual(count(4, '🔥'), 2);
    assert.strictEqual(count(5, '🍂'), 1); // 🔑は対象外
    assert.strictEqual(count(5, '🔥'), 0);
    assert.strictEqual(count(0, '🍂'), 1);
    assert.strictEqual(count(6, '🔥'), 0);
    assert.strictEqual(count(7, '🌱'), 0);
    assert.strictEqual(count(7, '🔥'), 2); // 🌱も1つにつき🔥1つ
    assert.strictEqual(count(8, '🌱'), 1);
    // 払うコストは変換前の盤面で決まる: 基礎7 + 敵の🍂3枚ぶん高い − (🍂4枚×3 + 🌱3つ×2) の軽減、最低1
    assert.strictEqual(e.skillCosts.onClickKindling, 7);
    assert.strictEqual(before - s.heartMagic, 1);
    assert.strictEqual(s.heartTurn, true);
    assert.strictEqual(e.kindlingLegal(s), false);
});

test('焚きつけ: コストは盤面の🍂1枚につき3・🌱1つにつき2だけ下がる（敵味方とも・最低1）', () => {
    const s = game('you', 'you');
    s.heartTurn = true; s.heartMagic = 30;
    const price = () => e.calculateCost(s, e.skillCosts.onClickKindling, false, false, 'onClickKindling');
    assert.strictEqual(price(), 7);
    s.board[0] = { player: '💙', bind: 3, effects: [{ effect: '🌱' }] };          // 自陣の🌱1つ → −2
    assert.strictEqual(price(), 5);
    s.board[4] = { player: '⭕', bind: 8, effects: [{ effect: '🍂' }] };          // 敵の🍂1枚 → 敵の🍂で+1、−3
    assert.strictEqual(price(), 5 + 1 - 3);
    s.board[5] = { player: undefined, bind: 0, effects: [{ effect: '🌱' }] };     // 空きマスの🌱も数える → −2
    assert.strictEqual(price(), 3 - 2);
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
    assert.strictEqual(require('../shared/util').LIFE_MEANS.witch, 4);
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
