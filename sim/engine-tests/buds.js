// @ts-check
'use strict';
// sim/engine.test.js から読み込まれるテスト（共有の道具は ../testkit.js）
const { assert, e, test, game, FRZ, BUD, budsOn, FLM } = require('../testkit');

// ---- 🌱バッズ系の汎用スキル (idx33〜36) ----

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
    const th = require('../shared/thermal');
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
    const th = require('../shared/thermal');
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
    const th = require('../shared/thermal');
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

test('業火: 自分以外の全コマ（ライフ0含む）に🔥+2。🔑のコマはロックを解除してから🔥。自コマ・空きマスは対象外。クリック不要・手番は続きコスト7', () => {
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
    assert.strictEqual(fl(4), 0); assert.strictEqual(fl(0), 0);
    assert.strictEqual(fl(9), 2); assert.ok(!s.board[9].effects.some((x) => x.effect === '🔑')); // ロックは先に解除される
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
