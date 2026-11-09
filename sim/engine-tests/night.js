// @ts-check
'use strict';
// sim/engine.test.js から読み込まれるテスト（共有の道具は ../testkit.js）
const { assert, e, test, game, BOLT, boltsOn } = require('../testkit');

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

test('墓守の供物: 自陣のライフが最も低いコマを消して、自分の墓地+1・魔力+1（実質コスト1）。自陣にコマが無ければ撃てない', () => {
    const s = game('you', 'you');
    s.heartTurn = true; s.heartMagic = 30;
    assert.strictEqual(e.graveOfferingLegal(s), false, '自陣にコマが無いと撃てない');
    s.board[3] = { player: '💙', bind: 4, effects: [] };
    s.board[5] = { player: '💙', bind: 1, effects: [] };
    assert.strictEqual(e.graveOfferingLegal(s), true);
    const m = s.heartMagic;
    const grave = s.necroCost[0];
    e.SKILLS.graveOffering(s);
    assert.strictEqual(s.board[5].player, undefined, 'ライフが最も低いコマが消える');
    assert.strictEqual(s.board[3].player, '💙');
    assert.strictEqual(m - s.heartMagic, e.skillCosts.onClickGraveOffering - 1, '魔力+1が戻る');
    assert.strictEqual(grave - s.necroCost[0], 1, '自分の墓地+1（ネクロ以外でも）');
});
test('墓守の供物: ネクロマンサーの墓地は二重に数えない（コマが消える自動の+1に含まれる）', () => {
    const s = game('necromancer', 'you');
    s.heartTurn = true; s.heartMagic = 30;
    s.board[3] = { player: '💙', bind: 2, effects: [] };
    const grave = s.necroCost[0];
    e.SKILLS.graveOffering(s);
    assert.strictEqual(grave - s.necroCost[0], 1);
});
test('沈黙は雷なり: 自陣の⚡を2つ(同じコマからでも可)選んで払い、払い切ったとき相手全員が次の手番スキルを使えない。⚡が合計2つ無いと撃てない（コスト4）', () => {
    const s = e.newGame({ chars: ['electrician', 'you'], rng: e.makeRng(17) });
    s.magic[0] = 30;
    assert.strictEqual(e.boltSilenceLegal(s), false);
    e.SKILLS.boltSilence(s); // ⚡が無いので何も起きない（魔力も払わない）
    assert.strictEqual(s.magic[0], 30);
    assert.strictEqual(s.useBoltSilence, 0);
    s.board[0] = { player: '💙', bind: 4, effects: [BOLT, BOLT] }; // 2スタック
    s.board[1] = { player: '💙', bind: 4, effects: [BOLT] };
    s.board[2] = { player: '⭕', bind: 4, effects: [BOLT, BOLT, BOLT] }; // 敵の⚡は数えない・選べない
    assert.strictEqual(e.boltSilenceLegal(s), true);
    assert.strictEqual(e.skillCosts.onClickBoltSilence, 4);
    e.SKILLS.boltSilence(s);
    assert.strictEqual(s.magic[0], 26);
    assert.strictEqual(s.useBoltSilence, 2);
    assert.strictEqual(e.placeMove(s, 3), false); // ⚡のない自陣(空き)は選び直せる
    assert.strictEqual(e.placeMove(s, 2), false); // 敵のコマは選べない
    assert.strictEqual(e.placeMove(s, 0), true); // 1個目
    assert.strictEqual(s.useBoltSilence, 1);
    assert.strictEqual(s.silenced[1], false); // まだ払い切っていない
    assert.strictEqual(e.placeMove(s, 1), true); // 2個目（別のコマから）
    assert.strictEqual(s.useBoltSilence, 0);
    assert.strictEqual(boltsOn(s.board[0]), 1);
    assert.strictEqual(boltsOn(s.board[1]), 0);
    assert.strictEqual(boltsOn(s.board[2]), 3); // 敵の⚡はそのまま
    assert.strictEqual(s.silenced[1], true);
    assert.strictEqual(s.silenced[0], false); // 自分は封じられない
});

test('沈黙は雷なり: ⚡が合計1つでは撃てない。1つのコマに2スタックあれば同じコマを2回選べる', () => {
    const s = e.newGame({ chars: ['electrician', 'you'], rng: e.makeRng(17) });
    s.magic[0] = 30;
    s.board[0] = { player: '💙', bind: 4, effects: [BOLT] };
    assert.strictEqual(e.boltSilenceLegal(s), false);
    s.board[0] = { player: '💙', bind: 4, effects: [BOLT, BOLT] };
    assert.strictEqual(e.boltSilenceLegal(s), true);
    e.SKILLS.boltSilence(s);
    assert.strictEqual(e.placeMove(s, 0), true);
    assert.strictEqual(e.placeMove(s, 0), true);
    assert.strictEqual(boltsOn(s.board[0]), 0);
    assert.strictEqual(s.silenced[1], true);
});


test('オブジェクト: スキルで空きマスを選んで設置（コスト基準どおり）。埋まったマスは選び直せる。列には数えない', () => {
    const s = e.newGame({ chars: ['you', 'you'], rng: e.makeRng(21) });
    s.magic[0] = 30;
    assert.deepStrictEqual([e.skillCosts.onClickBigTree, e.skillCosts.onClickDeadTree, e.skillCosts.onClickSpring, e.skillCosts.onClickFort, e.skillCosts.onClickThundercloud], [8, 5, 5, 6, 5]);
    assert.strictEqual(e.objectLegal(s), true);
    e.SKILLS.fort(s);
    assert.strictEqual(s.magic[0], 30 - 6);
    s.board[3] = { player: '⭕', bind: 1, effects: [] };
    assert.strictEqual(e.placeMove(s, 3), false, '埋まったマスは選び直せる');
    assert.strictEqual(s.objectPlacing, 'fort');
    assert.strictEqual(e.placeMove(s, 5), true);
    assert.strictEqual(s.objectPlacing, null);
    assert.strictEqual(s.board[5].object, 'fort');
    assert.strictEqual(s.board[5].player, '💙');
    for (const k of [0, 1, 2]) s.board[k] = { player: '💙', bind: 1, effects: [] };
    s.board[3] = { player: '💙', bind: 1, effects: [], object: 'fort' };
    assert.strictEqual(e.calculateWinner(e.symbolsOf(s.board)), undefined, 'オブジェクトは列に数えない');
});

test('オブジェクト: 手番開始時の効果（大木のマジック・砦のライフ・泉のライフ期待値）は持ち主の手番にだけ働く', () => {
    const s = e.newGame({ chars: ['you', 'you'], rng: e.makeRng(22) });
    s.board[5] = { player: '💙', bind: 4, effects: [], object: 'bigTree' };
    s.board[6] = { player: '💙', bind: 6, effects: [], object: 'fort' };
    s.board[7] = { player: '💙', bind: 2, effects: [] };
    const magicBefore = s.magic[1];
    s.currentTurn += 1; e.advanceTurn(s); // 💙 → ⭕ の手番。⭕ にはオブジェクトが無い
    assert.strictEqual(s.board[7].bind, 2, '敵の手番開始では砦は働かない');
    assert.strictEqual(s.magic[1] - magicBefore, 1 + 0, '標準の+1だけ');
    const m0 = s.magic[0];
    s.currentTurn += 1; e.advanceTurn(s); // ⭕ → 💙 の手番
    assert.strictEqual(s.magic[0] - m0, 1 + 3, '標準の+1と大木の+3');
    assert.strictEqual(s.board[7].bind, 3, '砦: 周囲の自陣コマのライフ+1');
    assert.strictEqual(s.board[5].bind, 5, '隣の大木も自陣のコマなので砦で+1（減衰では減らない）');
    assert.strictEqual(s.board[6].bind, 6, '砦自身のライフは増減しない');
});

test('オブジェクト: 自陣のオブジェクトは通常のコマで乗っ取れる。敵のものはライフ0になるまで乗っ取れない', () => {
    const s = e.newGame({ chars: ['you', 'you'], rng: e.makeRng(23) });
    s.life = 4;
    s.board[1] = { player: '💙', bind: 6, effects: [], object: 'fort' };
    assert.strictEqual(e.placeMove(s, 1), true);
    assert.strictEqual(s.board[1].object, undefined);
    assert.strictEqual(s.board[1].player, '💙');
    assert.strictEqual(s.board[1].bind, 4);
    const t = e.newGame({ chars: ['you', 'you'], rng: e.makeRng(24) });
    t.life = 4;
    t.board[2] = { player: '⭕', bind: 3, effects: [], object: 'spring' };
    assert.strictEqual(e.placeMove(t, 2), false, 'ライフが残る敵のオブジェクトには着手できない');
    t.giantHit = true;
    t.board[2].bind = 1;
    t.life = 9;
    const g = e.newGame({ chars: ['giant', 'you'], rng: e.makeRng(27) });
    g.life = 9;
    g.board[2] = { player: '⭕', bind: 3, effects: [], object: 'spring' };
    assert.strictEqual(e.placeMove(g, 2), true);
    assert.strictEqual(g.board[2].player, '⭕', '巨人でもライフが残る敵のオブジェクトは乗っ取れない');
    assert.strictEqual(g.board[2].object, 'spring');
    assert.strictEqual(g.board[2].bind, 0);
    t.board[2].bind = 0;
    t.life = 4;
    assert.strictEqual(e.placeMove(t, 2), true);
    assert.strictEqual(t.board[2].player, '💙');
    assert.strictEqual(t.board[2].object, undefined);
});

test('オブジェクト: ライフは減衰しない。大木は🔥で即壊れ、砦は壊れない', () => {
    const s = e.newGame({ chars: ['you', 'you'], rng: e.makeRng(25) });
    s.life = 4;
    s.board[0] = { player: '⭕', bind: 3, effects: [], object: 'spring' };
    s.board[1] = { player: '⭕', bind: 3, effects: [] };
    s.board[10] = { player: '💙', bind: 1, effects: [] };
    e.placeMove(s, 15); // 2人戦は着手のたびに減衰
    assert.strictEqual(s.board[0].bind, 3);
    assert.ok(s.board[1].bind < 3);
    const t = e.newGame({ chars: ['you', 'you'], rng: e.makeRng(26) });
    t.board[4] = { player: '💙', bind: 3, effects: [], object: 'bigTree' };
    t.board[5] = { player: '💙', bind: 6, effects: [], object: 'fort' };
    e.SKILLS; // 参照だけ（ignite は shared/thermal）
    const thermal = require('../shared/thermal');
    thermal.ignite(t.board, [4, 5], 4);
    assert.strictEqual(t.board[4].player, undefined);
    assert.strictEqual(t.board[5].object, 'fort');
});

test('オブジェクト: 生命の泉は手番開始時のライフ期待値を+2する（泉のある席のライフが平均で高い）', () => {
    let withSpring = 0, without = 0, n = 0;
    for (let seed = 1; seed <= 120; seed++) {
        const a = e.newGame({ chars: ['you', 'you'], rng: e.makeRng(seed) });
        const b = e.newGame({ chars: ['you', 'you'], rng: e.makeRng(seed) });
        b.board[0] = { player: '💙', bind: 4, effects: [], object: 'spring' };
        for (const g of [a, b]) { g.currentTurn += 1; e.advanceTurn(g); g.currentTurn += 1; e.advanceTurn(g); }
        withSpring += b.life; without += a.life; n++;
    }
    const diff = (withSpring - without) / n;
    assert.ok(diff > 1.2 && diff < 2.8, 'ライフ期待値の差はおよそ+2: ' + diff);
});

test('オブジェクト: ライフ0の敵のオブジェクトは、自分のオブジェクトとして乗っ取るか、自陣のコマとして置き換えるかを選べる', () => {
    for (const asObject of [false, true]) {
        const s = e.newGame({ chars: ['you', 'you'], rng: e.makeRng(31) });
        s.life = 4;
        s.board[2] = { player: '⭕', bind: 0, effects: [], object: 'spring' };
        s.captureAsObject = asObject;
        assert.strictEqual(e.placeMove(s, 2), true);
        assert.strictEqual(s.board[2].player, '💙');
        assert.strictEqual(s.board[2].object, asObject ? 'spring' : undefined);
        assert.strictEqual(s.captureAsObject, false, '着手のたびにリセット');
    }
});

test('オブジェクト: エフェクトだけでなくダメージ系スキルも通常のコマと同じように受ける（スラッシュでライフ0・ストンプ/審判の日/パーフェクトゲームで破壊・火炎で1ダメージ）', () => {
    const obj = (bind = 5) => ({ player: '⭕', bind, effects: [], object: 'fort' });
    const s = e.newGame({ chars: ['you', 'you'], rng: e.makeRng(41) });
    s.magic[0] = 99;
    s.board[3] = obj();
    e.SKILLS.slash(s); // 右上→左下の斜め: ライフを0にする
    assert.strictEqual(s.board[3].bind, 0);
    assert.strictEqual(s.board[3].object, 'fort', 'ライフ0になるだけで、乗っ取るまでオブジェクトのまま');
    const t = e.newGame({ chars: ['you', 'you'], rng: e.makeRng(42) });
    t.board[5] = obj();
    require('../shared/blast').stomp(t.board, 5, '💙', 3);
    assert.strictEqual(t.board[5].object, undefined, 'ストンプで敵のオブジェクトは破壊される');
    const u = e.newGame({ chars: ['you', 'you'], rng: e.makeRng(43) });
    u.magic[0] = 99;
    u.board[5] = obj();
    e.SKILLS.perfectGame(u);
    assert.strictEqual(u.board[5].player, undefined);
    const f = e.newGame({ chars: ['you', 'you'], rng: e.makeRng(44) });
    f.board[5] = obj();
    require('../shared/thermal').ignite(f.board, [5], 4);
    assert.strictEqual(f.board[5].bind, 4, '火炎の付与で1ダメージ');
});

test('市場: 手番ごとに市場の数だけシャッフルが無料（超えたら有料・手番が変わると戻る・敵の市場は働かない）', () => {
    const s = e.newGame({ chars: ['you', 'you'], rng: e.makeRng(51) });
    s.magic[0] = 10;
    s.board[2] = { player: '⭕', bind: 5, effects: [], object: 'market' };
    e.shuffleHand(s);
    assert.strictEqual(s.magic[0], 9, '敵の市場は働かない');
    s.board[1] = { player: '💙', bind: 5, effects: [], object: 'market' };
    e.shuffleHand(s);
    assert.strictEqual(s.magic[0], 9, '1回目は無料');
    e.shuffleHand(s);
    assert.strictEqual(s.magic[0], 8, '市場1つ: 2回目は有料');
    s.board[3] = { player: '💙', bind: 5, effects: [], object: 'market' };
    e.shuffleHand(s);
    assert.strictEqual(s.magic[0], 8, '市場2つ: 2回目も無料');
    e.shuffleHand(s);
    assert.strictEqual(s.magic[0], 7, '3回目は有料');
    s.currentTurn += 1; e.advanceTurn(s); s.currentTurn += 1; e.advanceTurn(s);
    s.magic[0] = 10;
    e.shuffleHand(s); e.shuffleHand(s);
    assert.strictEqual(s.magic[0], 10, '次の自分の手番では再び市場の数だけ無料');
});

test('聖域: 周囲の自陣のコマは着手ごとの減衰を受けない。毒沼は手番開始時に周囲の敵コマへ☠', () => {
    const s = e.newGame({ chars: ['you', 'you'], rng: e.makeRng(52) });
    s.life = 4;
    s.board[5] = { player: '⭕', bind: 5, effects: [], object: 'sanctuary' };
    s.board[4] = { player: '⭕', bind: 5, effects: [] }; // 守られる
    s.board[15] = { player: '⭕', bind: 5, effects: [] }; // 守られない
    e.placeMove(s, 0);
    assert.strictEqual(s.board[4].bind, 5);
    assert.ok(s.board[15].bind < 5);
    const t = e.newGame({ chars: ['you', 'you'], rng: e.makeRng(53) });
    t.board[5] = { player: '⭕', bind: 5, effects: [], object: 'poisonSwamp' };
    t.board[6] = { player: '💙', bind: 5, effects: [] };
    t.currentTurn += 1; e.advanceTurn(t); // ⭕の手番開始: 毒沼が💙のコマに☠
    assert.ok(t.board[6].effects.some((x) => x.effect === '☠'));
});

test('オブジェクトのスキル: 解体・風化・地ならし・補強工事・増築・分譲（コストは基準どおり）', () => {
    assert.deepStrictEqual(['onClickDemolish', 'onClickWeather', 'onClickLevelAll', 'onClickReinforce', 'onClickExpandAll', 'onClickDuplicate'].map((k) => e.skillCosts[k]), [4, 3, 8, 3, 4, 6]);
    const s = e.newGame({ chars: ['you', 'you'], rng: e.makeRng(61) });
    s.magic[0] = 99;
    assert.strictEqual(e.objectSkillLegal(s, 'demolish'), false, '対象が無いと使えない');
    s.board[1] = { player: '⭕', bind: 5, effects: [], object: 'fort' };
    s.board[2] = { player: '⭕', bind: 5, effects: [], object: 'market' };
    s.board[6] = { player: '💙', bind: 5, effects: [], object: 'fort' };
    e.SKILLS.demolish(s);
    assert.strictEqual(s.magic[0], 95);
    assert.strictEqual(s.objectTool, 'demolish');
    assert.strictEqual(e.placeMove(s, 6), false, '自陣のオブジェクトは選び直せる');
    assert.strictEqual(e.placeMove(s, 1), true);
    assert.strictEqual(s.board[1].player, undefined);
    assert.strictEqual(s.objectTool, null);
    e.SKILLS.weather(s);
    assert.strictEqual(e.placeMove(s, 2), true);
    assert.strictEqual(s.board[2].bind, 0);
    assert.strictEqual(s.board[2].object, 'market');
    e.SKILLS.expandAll(s);
    assert.strictEqual(s.board[6].bind, 7, '即発動');
    assert.strictEqual(s.objectTool, null);
    e.SKILLS.duplicate(s);
    assert.strictEqual(e.placeMove(s, 6), true);
    assert.strictEqual(s.board.filter((sq) => sq.object === 'fort' && sq.player === '💙').length, 2);
    e.SKILLS.levelAll(s);
    assert.strictEqual(s.board[2].object, undefined, '地ならし: 風化したあとの敵のオブジェクトも壊す');
});

test('大工房: 設置は直前に相手がベースコスト7以上のスキルか合計7以上のマジックを使っていれば0。働いている間、ベースコスト7以上のスキルが3安い', () => {
    const s = e.newGame({ chars: ['you', 'you'], rng: e.makeRng(71) });
    s.magic[0] = 99; s.magic[1] = 99;
    const price = (seat) => e.calculateCost(s, e.skillCosts.onClickWorkshop, false, false, 'onClickWorkshop');
    assert.strictEqual(price(), 6);
    // 💙: ベース3のスキルを2回(合計6)ではまだ足りない
    e.spendMagic(s, 3, 'onClickStomp'); e.spendMagic(s, 3, 'onClickStomp');
    s.currentTurn += 1; e.advanceTurn(s); // ⭕の手番
    assert.strictEqual(price(), 6, '合計6では無料にならない');
    // ⭕: 合計7のマジックを払う
    e.spendMagic(s, 3, 'onClickStomp'); e.spendMagic(s, 4, 'onClickBibine');
    s.currentTurn += 1; e.advanceTurn(s); // 💙の手番
    assert.strictEqual(price(), 0, '直前に相手が合計7を払った');
    s.currentTurn += 1; e.advanceTurn(s); // ⭕（何も払わず）
    s.currentTurn += 1; e.advanceTurn(s); // 💙
    assert.strictEqual(price(), 6, '次の手番では戻る');
    // ベースコスト7以上のスキルを1回でも使えば無料
    e.spendMagic(s, 1, 'onClickPerfectGame');
    s.currentTurn += 1; e.advanceTurn(s); // ⭕の手番
    assert.strictEqual(price(), 0, '直前に相手がベースコスト7以上のスキルを使った');
    e.spendMagic(s, 1, 'onClickStomp');
    s.currentTurn += 1; e.advanceTurn(s);
    s.board[0] = { player: '💙', bind: 5, effects: [], object: 'workshop' };
    assert.strictEqual(e.calculateCost(s, e.skillCosts.onClickPerfectGame, false, false, 'onClickPerfectGame'), 7, '大工房: 10 → 7');
    assert.strictEqual(e.calculateCost(s, e.skillCosts.onClickSlash, false, false, 'onClickSlash'), 6, 'ベース6は変わらない');
    // 設置スキル
    e.SKILLS.workshop(s);
    assert.strictEqual(e.placeMove(s, 5), true);
    assert.strictEqual(s.board[5].object, 'workshop');
});

test('結界石・護符の社: 式神は自然減衰しない／式神の数だけ手番開始時にマジック（最大+3）。コスト4/6', () => {
    assert.deepStrictEqual([e.skillCosts.onClickBarrierStone, e.skillCosts.onClickAmuletShrine], [4, 6]);
    const s = e.newGame({ chars: ['yinYangMaster', 'you'], rng: e.makeRng(81) });
    s.life = 4;
    s.board[5] = { player: '💙', bind: 5, effects: [], object: 'barrierStone' };
    s.board[4] = e.newShikigami('💙');
    s.board[15] = e.newShikigami('💙');
    e.placeMove(s, 0);
    assert.strictEqual(s.board[4].bind, e.SHIKIGAMI_LIFE, '式神は自然減衰を受けない');
    assert.strictEqual(s.board[15].bind, e.SHIKIGAMI_LIFE, '結界石の外の式神も減らない（オブジェクトの規則）');
    const t = e.newGame({ chars: ['you', 'you'], rng: e.makeRng(82) });
    t.board[5] = { player: '⭕', bind: 5, effects: [], object: 'amuletShrine' };
    for (const k of [0, 1, 2, 4, 6]) t.board[k] = e.newShikigami('⭕');
    const m0 = t.magic[1];
    t.currentTurn += 1; e.advanceTurn(t); // ⭕の手番開始
    assert.strictEqual(t.magic[1] - m0, 1 + 3, '標準+1と護符の社の上限+3');
});

test('縛りのオブジェクト（sim）: 泥田坊でトークンのライフ0／お一人様限りの札でトークンのあとは置けない／一言居士で2つ目のスキルが使えない', () => {
    assert.deepStrictEqual(['onClickLuckyCat', 'onClickMudField', 'onClickTongueKing', 'onClickEightTrigrams', 'onClickSoloSign', 'onClickOneWord', 'onClickBlindMonkey'].map((k) => e.skillCosts[k]), [5, 5, 5, 8, 5, 6, 5]);
    const s = e.newGame({ chars: ['you', 'you'], rng: e.makeRng(91) });
    s.life = 4; s.magic[0] = 99;
    s.board[15] = { player: '⭕', bind: 5, effects: [], object: 'mudField' };
    assert.strictEqual(e.calculateTokenBind(s), 0, '泥田坊');
    s.board[14] = { player: '⭕', bind: 5, effects: [], object: 'soloSign' };
    s.board[13] = { player: '⭕', bind: 5, effects: [], object: 'oneWord' };
    s.gearSkills[0] = 0;
    assert.strictEqual(e.skillRestrictedByObjects(s, 'onClickToken'), false);
    e.SKILLS.token(s);
    assert.strictEqual(e.placedThisTurn(s), 1);
    assert.strictEqual(e.skillRestrictedByObjects(s, 'onClickToken'), true, '一言居士: 2つ目のスキルは使えない（gearSkills=1）');
    assert.strictEqual(e.placeMove(s, 0), false, 'お一人様限りの札: トークンのあとは空きマスに置けない');
    s.board[1] = { player: '💙', bind: 2, effects: [] };
    assert.strictEqual(e.placeMove(s, 1), true, '自陣のコマの強化は置くことに数えない');
});

test('八卦の陣（sim）: 周囲八マスを自陣のコマで囲うと勝利。見ざる地蔵はその手番で付いたエフェクトを消す', () => {
    const s = e.newGame({ chars: ['you', 'you'], rng: e.makeRng(92), size: 5 });
    s.life = 4;
    s.board[12] = { player: '💙', bind: 5, effects: [], object: 'eightTrigrams' };
    for (const k of [6, 7, 8, 11, 13, 16, 17]) s.board[k] = { player: '💙', bind: 5, effects: [] };
    e.placeMove(s, 18);
    e.settleWinner(s);
    assert.strictEqual(s.winner, '💙');
    const t = e.newGame({ chars: ['you', 'you'], rng: e.makeRng(93) });
    t.board[5] = { player: '💙', bind: 5, effects: [], object: 'blindMonkey' };
    t.board[6] = { player: '⭕', bind: 3, effects: [] };
    t.effectSnap = require('../shared/objects').effectSnapshot(t.board);
    t.board[6] = { player: '⭕', bind: 3, effects: [{ effect: '🌱' }] };
    t.currentTurn += 1; e.advanceTurn(t);
    assert.deepStrictEqual(t.board[6].effects, [], '見ざる地蔵');
});

test('招き猫（sim）: 自分のスキルコスト-1', () => {
    const s = e.newGame({ chars: ['you', 'you'], rng: e.makeRng(94) });
    const before = e.calculateCost(s, e.skillCosts.onClickBibine, false, false, 'onClickBibine');
    s.board[0] = { player: '💙', bind: 5, effects: [], object: 'luckyCat' };
    assert.strictEqual(e.calculateCost(s, e.skillCosts.onClickBibine, false, false, 'onClickBibine'), before - 1);
});

test('審判の日で置いたマスは🔑ロック付き（ライフは2のまま、スタックは通常6・堅牢の鍵で9）', () => {
    const m = game('magician', 'you');
    m.heartTurn = true; m.heartMagic = 30;
    m.board[6] = { player: '⭕', bind: 3, effects: [] };
    e.SKILLS.judgeDay(m);
    e.placeMove(m, 5);
    assert.strictEqual(m.board[5].player, '💙');
    assert.deepStrictEqual(m.board[5].effects.map((x) => x.effect), ['🌱', '🔑']);
    assert.strictEqual(m.board[5].bind, 2); // ロックはライフを変えない(#438)
    assert.strictEqual(m.board[5].effects.find((x) => x.effect === '🔑').stack, 6);
    assert.strictEqual(m.board[6].player, undefined);

    const g = game('magician', 'you');
    g.heartTurn = true; g.heartMagic = 30;
    g.gears[0] = ['ironLock', 'luckyPurse'];
    e.SKILLS.judgeDay(g);
    e.placeMove(g, 5);
    assert.strictEqual(g.board[5].effects.find((x) => x.effect === '🔑').stack, 9);
});
