// @ts-check
'use strict';
// sim/engine.test.js から読み込まれるテスト（共有の道具は ../testkit.js）
const { assert, e, test, FRZ, LEAF, BOLT, boltsOn } = require('../testkit');

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
    assert.strictEqual(price(a, 'onClickDoubleLeafToken'), 8);
    a.board[0] = { player: '💙', bind: 3, effects: [LEAF] };
    assert.strictEqual(price(a, 'onClickDoubleLeafToken'), 6); // 手番開始より🍂が増えた（一葉知秋など）
    a.leafBase[0] = 1;
    assert.strictEqual(price(a, 'onClickDoubleLeafToken'), 8); // 元からあった🍂では成立しない
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

test('パーフェクトゲーム: 盤面のコマを敵味方とも全て破壊（🔑ロック・⚡無敵は除き、氷結中は❄-1だけ）。コスト10', () => {
    const s = e.newGame({ chars: ['you', 'electrician'], rng: e.makeRng(12) });
    s.magic[0] = 30;
    assert.strictEqual(e.perfectGameLegal(s), false);
    s.board[0] = { player: '💙', bind: 5, effects: [] };
    s.board[1] = { player: '⭕', bind: 9, effects: [] };
    s.board[2] = { player: '⭕', bind: 3, effects: [{ effect: '🔑' }] };
    s.board[3] = { player: '⭕', bind: 3, effects: [{ effect: '⚡' }] };       // 雷霆の巫の無敵
    s.board[4] = { player: '💙', bind: 3, effects: [FRZ, FRZ] };             // 氷結は身代わり
    assert.strictEqual(e.perfectGameLegal(s), true);
    assert.strictEqual(e.skillCosts.onClickPerfectGame, 10);
    e.SKILLS.perfectGame(s);
    assert.strictEqual(s.board[0].player, undefined);
    assert.strictEqual(s.board[1].player, undefined);
    assert.strictEqual(s.board[2].player, '⭕');
    assert.strictEqual(s.board[3].player, '⭕');
    assert.strictEqual(s.board[4].effects.filter((x) => x.effect === '❄').length, 1);
    assert.strictEqual(s.magic[0], 20);
});

test('超助っ人: ランダムな1エフェクトを付けた自陣のトークンを1つ置く（トークン扱い・ターン1回）。コスト3', () => {
    const seen = new Set();
    for (let seed = 1; seed <= 60; seed++) {
        const s = e.newGame({ chars: ['you', 'you'], rng: e.makeRng(seed) });
        s.magic[0] = 30;
        e.SKILLS.helper(s);
        assert.strictEqual(s.magic[0], 30 - 3);
        assert.strictEqual(s.usedTokenThisTurn, true);
        const mine = s.board.filter((sq) => sq.player === '💙');
        assert.strictEqual(mine.length, 1);
        const effects = mine[0].effects.map((x) => x.effect);
        assert.strictEqual(effects.length, 1);
        assert.ok(['🔥', '❄', '⚡', '☠', '🌱', '🍂'].includes(effects[0]));
        seen.add(effects[0]);
    }
    assert.strictEqual(seen.size, 6); // 6種類すべてが出る
});

test('柳の下に二匹目がいた: コスト6。この手番に基礎コスト7以上のスキルを使っていれば0（手番が変わると戻る）', () => {
    const s = e.newGame({ chars: ['you', 'you'], rng: e.makeRng(3) });
    s.magic[0] = 40;
    const price = () => e.calculateCost(s, e.skillCosts.onClickSecondCatch, false, false, 'onClickSecondCatch');
    assert.strictEqual(e.skillCosts.onClickSecondCatch, 6);
    assert.strictEqual(price(), 6);
    e.spendMagic(s, 3, 'onClickStomp');          // 基礎3
    e.spendMagic(s, 6, 'onClickPoisonWard');     // 基礎6
    assert.strictEqual(price(), 6);
    e.spendMagic(s, 10, 'onClickPerfectGame');   // 基礎10
    assert.strictEqual(price(), 0);
    e.spendMagic(s, 11, 'onClickJudgeDay');
    assert.strictEqual(price(), 0);
    s.currentTurn += 1; e.advanceTurn(s);        // 相手の手番
    assert.strictEqual(s.bigCast[0], false);
});

test('超助っ人はライフ3以下のコマを置けない縛りで、トークンのライフが3以下なら使えない', () => {
    const s = e.newGame({ chars: ['you', 'you'], rng: e.makeRng(5) });
    s.magic[0] = 30; s.lifeBan[0] = true;
    e.SKILLS.helper(s);                          // トークンのライフは4なので置ける
    assert.strictEqual(s.board.filter((sq) => sq.player === '💙').length, 1);
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
    assert.strictEqual(s.board.filter((sq) => sq.object === 'shikigami').length, 0);
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
