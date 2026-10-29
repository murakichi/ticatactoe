// @ts-check
'use strict';
// ギア (sim/gear.js + engine.js) のテスト。実行: node sim/gear.test.js
const assert = require('assert');
const e = require('./engine');
const gear = require('./shared/gear');

let pass = 0, fail = 0;
function test(name, fn) {
    try { fn(); pass++; console.log('  ✓ ' + name); }
    catch (err) { fail++; console.log('  ✗ ' + name + ' — ' + err.message); }
}
/** 席ごとのギアを指定して開始する。乱数は固定 */
const game = (gears, chars = ['you', 'you'], seed = 42) => e.newGame({ chars, gears, rng: e.makeRng(seed) });
const H = '💙', C = '⭕';

console.log('sim/gear:');

test('ギア無しの試合では、ギア用の乱数を消費しない（従来と同じ盤面・ライフ）', () => {
    const a = e.newGame({ chars: ['you', 'giant'], rng: e.makeRng(7) });
    const b = e.newGame({ chars: ['you', 'giant'], gears: [[], []], rng: e.makeRng(7) });
    assert.strictEqual(a.life, b.life);
    assert.deepStrictEqual(a.skills, b.skills);
});

test('頑健: ライフ平均+1 / 剛腕の代償: +3 / 賭博師の骰子: σ=5', () => {
    assert.strictEqual(gear.gearLifeBonus(['sturdy']), 1);
    assert.strictEqual(gear.gearLifeBonus(['titanCost']), 3);
    assert.strictEqual(gear.gearLifeBonus(['sturdy', 'titanCost']), 4);
    assert.strictEqual(gear.gearLifeStd(['gambler'], 3), 5);
    assert.strictEqual(gear.gearLifeStd([], 3), 3);
});

test('頑健: 実際に引くライフの平均が+1される', () => {
    const mean = (gears) => {
        const rng = e.makeRng(1);
        let sum = 0;
        for (let i = 0; i < 4000; i++) sum += e.calculateLife('you', undefined, rng, gear.gearLifeBonus(gears), gear.gearLifeStd(gears, 3));
        return sum / 4000;
    };
    assert.ok(mean(['sturdy']) - mean([]) > 0.8);
});

test('剛腕の代償: 全スキルのコスト+3', () => {
    const s = game([['titanCost'], []]);
    assert.strictEqual(e.calculateCost(s, 4), 7);
    assert.strictEqual(e.calculateCost(s, 4, true), 7);
});

test('堅牢の鍵: ロックのライフが9になる（通常は6）', () => {
    const s = game([['ironLock'], []]);
    s.useLock = 1;
    e.placeMove(s, 5);
    assert.strictEqual(s.board[5].bind, 9);
    const t = game([[], []]);
    t.useLock = 1;
    e.placeMove(t, 5);
    assert.strictEqual(t.board[5].bind, 6);
});

test('空蔵: 空きマスのロックが切れると自陣のコマ(ライフ1)になる', () => {
    const s = game([['emptyLock'], []]);
    s.useLock = 1;
    e.placeMove(s, 5);
    assert.strictEqual(s.board[5].player, undefined);
    assert.strictEqual(s.board[5].effects[0].value, 1);
    const others = [0, 1, 2, 3, 4, 6, 7, 8];
    for (let k = 0; k < 6; k++) assert.ok(e.placeMove(s, others[k]));
    assert.strictEqual(s.board[5].player, H);
    assert.strictEqual(s.board[5].bind, 1);
    assert.strictEqual(s.board[5].effects.length, 0);
});

test('空蔵なしなら、ロックが切れても空きマスのまま', () => {
    const s = game([[], []]);
    s.useLock = 1;
    e.placeMove(s, 5);
    const others = [0, 1, 2, 3, 4, 6, 7, 8];
    for (let k = 0; k < 6; k++) e.placeMove(s, others[k]);
    assert.strictEqual(s.board[5].player, undefined);
});

test('四連の極意: スキルを4回使うと次のスキルが無料（5回目だけ）', () => {
    const s = game([['quadMastery'], []]);
    s.magic[0] = 99;
    const base = e.calculateCost(s, 4);
    for (let k = 0; k < 4; k++) e.SKILLS.addLife(s);
    assert.strictEqual(e.calculateCost(s, 4), 0);
    const before = s.magic[0];
    e.SKILLS.addLife(s);
    assert.strictEqual(s.magic[0], before);
    assert.strictEqual(e.calculateCost(s, 4), base);
});

test('余韻: スキルを使った次のターン、1つ目のスキルだけコスト-1', () => {
    const s = game([['afterglow'], []]);
    s.magic[0] = 99;
    assert.strictEqual(e.calculateCost(s, 4), 4);
    e.SKILLS.addLife(s);
    e.placeMove(s, 0); // 💙の手番終了
    e.placeMove(s, 1); // ⭕の手番終了 → 💙の手番
    assert.strictEqual(e.curPlayer(s), H);
    assert.strictEqual(e.calculateCost(s, 4), 3);
    e.SKILLS.addLife(s);
    assert.strictEqual(e.calculateCost(s, 4), 4, '2つ目以降は割引なし');
});

test('余韻: スキルを使わなかったターンの次には付かない', () => {
    const s = game([['afterglow'], []]);
    e.placeMove(s, 0);
    e.placeMove(s, 1);
    assert.strictEqual(e.calculateCost(s, 4), 4);
});

test('連鎖割引: スキルを使うたびそのターンのコスト-1（下限1）', () => {
    const s = game([['chainDiscount'], []]);
    s.magic[0] = 99;
    assert.strictEqual(e.calculateCost(s, 4), 4);
    e.SKILLS.addLife(s);
    assert.strictEqual(e.calculateCost(s, 4), 3);
    e.SKILLS.addLife(s);
    e.SKILLS.addLife(s);
    assert.strictEqual(e.calculateCost(s, 4), 1);
    e.SKILLS.addLife(s);
    assert.strictEqual(e.calculateCost(s, 4), 1, '下限1');
    assert.strictEqual(e.calculateCost(s, 0), 0, 'もともと0のコストは0のまま');
});

test('連鎖割引: 次の手番ではリセットされる', () => {
    const s = game([['chainDiscount'], []]);
    s.magic[0] = 99;
    e.SKILLS.addLife(s);
    e.placeMove(s, 0);
    e.placeMove(s, 1);
    assert.strictEqual(e.calculateCost(s, 4), 4);
});

test('幸運の財布: 乱数が当たりなら消費コスト0', () => {
    const s = game([['luckyPurse'], []]);
    s.magic[0] = 10;
    s.rng = () => 0; // < 0.2
    e.SKILLS.addLife(s);
    assert.strictEqual(s.magic[0], 10);
    s.rng = () => 0.99;
    e.SKILLS.addLife(s);
    assert.strictEqual(s.magic[0], 10 - e.calculateCost(s, 3));
});

test('価格破壊: 装備した席だけ試合開始時にコスト表が決まり、下限2で試合中は固定', () => {
    const s = game([['priceWreck'], []]);
    assert.ok(s.priceTables[0]);
    assert.strictEqual(s.priceTables[1], null);
    for (const k of Object.keys(s.priceTables[0])) {
        assert.ok(s.priceTables[0][k] >= Math.min(2, e.skillCosts[k]), k);
        if (k === 'onClickShuffle') assert.strictEqual(s.priceTables[0][k], e.skillCosts[k]);
    }
    const diffs = Object.keys(e.skillCosts).filter((k) => s.priceTables[0][k] !== e.skillCosts[k]);
    assert.ok(diffs.length > 5, '多くのスキルのコストが変わる');
    const snapshot = JSON.stringify(s.priceTables[0]);
    e.placeMove(s, 0);
    e.placeMove(s, 1);
    assert.strictEqual(JSON.stringify(s.priceTables[0]), snapshot);
});

test('道連れの鍵: トークンを置くと確率でロックが付く（乱数が当たりのとき）', () => {
    const s = game([['bindingLock'], []]);
    s.magic[0] = 99;
    // 位置の抽選は最初の乱数、ロック判定は次の乱数。0 を返し続ければ必ず当たる
    s.rng = () => 0;
    e.SKILLS.token(s);
    const sq = s.board.find((x) => x.player === H);
    assert.ok(sq.effects.some((x) => x.effect === '🔑'));
    assert.strictEqual(sq.bind, 6);
});

test('道連れの鍵: 外れたらロックは付かない', () => {
    const s = game([['bindingLock'], []]);
    s.magic[0] = 99;
    let first = true;
    s.rng = () => { if (first) { first = false; return 0; } return 0.99; };
    e.SKILLS.token(s);
    const sq = s.board.find((x) => x.player === H);
    assert.ok(!sq.effects.some((x) => x.effect === '🔑'));
});

test('増援 / 軽量トークン: トークンのライフが+2 / -1（コストは軽量トークンだけ-1）', () => {
    const a = game([['reinforce'], []]);
    a.magic[0] = 99;
    e.SKILLS.token(a);
    assert.strictEqual(a.board.find((x) => x.player === H).bind, 6);
    const b = game([['lightToken'], []]);
    b.magic[0] = 99;
    assert.strictEqual(e.calculateCost(b, 4, true), 3);
    assert.strictEqual(e.calculateCost(b, 4, false), 4);
    e.SKILLS.token(b);
    assert.strictEqual(b.board.find((x) => x.player === H).bind, 3);
});

test('収穫: バッズトークンを置くと魔力+1（付与したエフェクト数）', () => {
    const s = game([['harvest'], []]);
    s.magic[0] = 20;
    e.SKILLS.budsToken(s);
    assert.strictEqual(s.magic[0], 20 - e.calculateCost(s, 6, true) + 1);
});

test('収穫: 1回の獲得は最大5（ワルプルギスの夜）', () => {
    const s = game([['harvest'], []]);
    for (let k = 0; k < 8; k++) s.board[k] = { player: H, bind: 3, effects: [] };
    s.magic[0] = 30;
    e.SKILLS.walpurgis(s);
    assert.strictEqual(s.magic[0], 30 - e.calculateCost(s, 9) + 5);
});

test('収穫: ロックを1つかけるごとに魔力+1', () => {
    const s = game([['harvest'], []]);
    s.magic[0] = 20;
    e.SKILLS.lock(s);
    const afterSkill = s.magic[0];
    e.placeMove(s, 5);
    assert.strictEqual(s.magic[0], afterSkill + 1);
});

test('毒花: 敵のコマに毒を注入しても、毒花を持たない側のコマ・自分のコマにはバッズが付かない', () => {
    const s = game([['toxicBloom'], []]);
    s.board[0] = { player: H, bind: 3, effects: [] };
    s.board[5] = { player: C, bind: 3, effects: [] };
    s.magic[0] = 20;
    e.SKILLS.injection(s);
    e.placeMove(s, 5);
    assert.ok(s.board[5].effects.some((x) => x.effect === '☠'));
    assert.ok(!s.board.some((sq) => sq.effects.some((x) => x.effect === '🌱')));
});

test('毒花: 自陣のコマに毒を打てば、そのコマにバッズが付く', () => {
    const s = game([['toxicBloom'], []]);
    s.board[0] = { player: H, bind: 3, effects: [] };
    s.magic[0] = 20;
    e.SKILLS.injection(s);
    e.placeMove(s, 0);
    assert.deepStrictEqual(s.board[0].effects.map((x) => x.effect).sort(), ['☠', '🌱']);
});

test('毒花: 相手から毒を付けられた自陣のコマにも発動する（毒を付ける側の装備は関係ない）', () => {
    const s = game([[], ['toxicBloom']]);
    s.board[0] = { player: H, bind: 3, effects: [] };
    s.board[5] = { player: C, bind: 3, effects: [] };
    s.magic[0] = 20;
    e.SKILLS.injection(s); // 💙（毒花なし）が⭕のコマに毒
    e.placeMove(s, 5);
    assert.deepStrictEqual(s.board[5].effects.map((x) => x.effect).sort(), ['☠', '🌱'], '⭕のコマにバッズ');
    assert.ok(!s.board[0].effects.some((x) => x.effect === '🌱'), '毒を付けた側には付かない');
});

test('毒花: 毒霧（全コマに毒）では、毒花を持つ側のコマ全部にバッズが付く', () => {
    const s = game([['toxicBloom'], []]);
    s.board[0] = { player: H, bind: 3, effects: [] };
    s.board[1] = { player: H, bind: 3, effects: [] };
    s.board[5] = { player: C, bind: 3, effects: [] };
    s.magic[0] = 30;
    e.SKILLS.poisonMist(s);
    assert.strictEqual(s.board[0].effects.filter((x) => x.effect === '🌱').length, 1);
    assert.strictEqual(s.board[1].effects.filter((x) => x.effect === '🌱').length, 1);
    assert.strictEqual(s.board[5].effects.filter((x) => x.effect === '🌱').length, 0);
});

test('伝播: バッズトークンを置くと、周囲の自陣のコマにバッズが広がる', () => {
    const s = game([['propagate'], []], ['you', 'you']);
    // 空きマスを1つ(5)だけ残し、周囲に自陣と敵陣のコマを置く
    for (let k = 0; k < 16; k++) s.board[k] = { player: C, bind: 3, effects: [] };
    s.board[5] = { player: undefined, bind: 0, effects: [] };
    s.board[0] = { player: H, bind: 3, effects: [] };
    s.magic[0] = 30;
    e.SKILLS.budsToken(s);
    assert.strictEqual(s.board[5].player, H);
    assert.ok(s.board[0].effects.some((x) => x.effect === '🌱'), '自陣の隣に広がる');
    assert.ok(!s.board.some((sq, k) => k !== 5 && k !== 0 && sq.effects.some((x) => x.effect === '🌱')), '敵のコマには広がらない');
});

test('伝播: ポイズントークンの毒は周囲の敵のコマに広がる', () => {
    const s = game([['propagate'], []]);
    for (let k = 0; k < 16; k++) s.board[k] = { player: H, bind: 3, effects: [] };
    s.board[5] = { player: undefined, bind: 0, effects: [] };
    s.board[0] = { player: C, bind: 3, effects: [] };
    s.magic[0] = 30;
    e.SKILLS.poisonToken(s);
    assert.ok(s.board[0].effects.some((x) => x.effect === '☠'));
});

test('復讐の刃: 自分のコマを奪われると魔力+2', () => {
    const s = game([['vengeance'], []]);
    s.board[3] = { player: H, bind: 0, effects: [] };
    s.life = 5;
    e.placeMove(s, 1); // 💙が別の所に着手 → ⭕の手番
    s.life = 5;
    const before = s.magic[0];
    e.placeMove(s, 3); // ⭕がライフ0の💙のコマを奪う
    assert.strictEqual(s.board[3].player, C);
    assert.strictEqual(s.magic[0] - before, 2 + 1, '奪われた+2 と、次の手番開始時の+1');
});

test('復讐の刃: 自分が奪取すると魔力-1（0未満にはならない）', () => {
    const s = game([[], ['vengeance']]);
    s.board[3] = { player: H, bind: 0, effects: [] };
    e.placeMove(s, 1); // 💙
    s.life = 5;
    s.magic[1] = 3;
    e.placeMove(s, 3); // ⭕が奪取
    assert.strictEqual(s.board[3].player, C);
    assert.strictEqual(s.magic[1], 2);
    const t = game([[], ['vengeance']]);
    t.board[3] = { player: H, bind: 0, effects: [] };
    e.placeMove(t, 1);
    t.life = 5;
    t.magic[1] = 0;
    e.placeMove(t, 3);
    assert.strictEqual(t.magic[1], 0);
});

test('復讐の刃: 破壊（ちょうど0）や強化では発動しない', () => {
    const s = game([['vengeance'], []]);
    s.board[3] = { player: H, bind: 20, effects: [] };
    e.placeMove(s, 1);
    s.life = 5; // ライフが残っていて奪えない（巨人以外）→ 強化にもならない…ので💙自身の強化で確かめる
    e.placeMove(s, 2); // ⭕は別のマスへ
    s.life = 5;
    const before = s.magic[0];
    e.placeMove(s, 3); // 💙が自分のコマを強化
    assert.strictEqual(s.board[3].player, H);
    assert.strictEqual(s.magic[0] - before, 0, '強化では魔力は動かない');
});

test('彩りの庭: エフェクトが2種類以上あるマス1つにつき、手番開始時の魔力+1', () => {
    const turnGain = (gears) => {
        const s = game(gears);
        s.board[0] = { player: H, bind: 30, effects: [{ effect: '☠' }, { effect: '🌱' }] };
        s.board[1] = { player: H, bind: 30, effects: [{ effect: '🌱' }, { effect: '☠' }] };
        s.board[2] = { player: H, bind: 30, effects: [{ effect: '🌱' }] };
        e.placeMove(s, 5);
        const before = s.magic[0];
        e.placeMove(s, 10);
        return s.magic[0] - before;
    };
    assert.strictEqual(turnGain([['colorGarden'], []]) - turnGain([[], []]), 2);
});

test('病炎の契り: 自陣に毒・火炎があるとき、1種類につき固有以外のスキルのコスト-1（固有は対象外・下限1）', () => {
    const s = game([['ailmentPact'], []]);
    assert.strictEqual(e.gearCost(s, 4, false, 0, 'onClickShuffle'), 4);
    s.board[0] = { player: H, bind: 5, effects: [{ effect: '☠' }] };
    assert.strictEqual(e.gearCost(s, 4, false, 0, 'onClickShuffle'), 3, '毒1種');
    s.board[1] = { player: H, bind: 5, effects: [{ effect: '🔥' }] };
    assert.strictEqual(e.gearCost(s, 4, false, 0, 'onClickShuffle'), 2, '毒+火炎');
    assert.strictEqual(e.gearCost(s, 1, false, 0, 'onClickShuffle'), 1, '下限1');
    assert.strictEqual(e.gearCost(s, 4, false, 0, 'onClickStomp'), 4, '固有スキルは対象外');
    s.board[2] = { player: C, bind: 5, effects: [{ effect: '☠' }, { effect: '🔥' }] };
    assert.strictEqual(e.gearCost(s, 4, false, 1, 'onClickShuffle'), 4, '相手の装備ではない / 他人のエフェクトは数えない');
});

test('廃墟の底力: スキル・エフェクトで自陣が壊れると、次の自分の手番の終わりまでコスト-1', () => {
    const s = game([[], ['ruinSurge']]);
    s.board[7] = { player: C, bind: 5, effects: [] };
    e.placeMove(s, 0); // 💙 → ⭕の手番（盤面を記録）
    e.placeMove(s, 1); // ⭕ → 💙の手番
    s.board[7] = { player: undefined, bind: 0, effects: [] }; // 💙のスキルで⭕のコマが壊れた
    e.placeMove(s, 2); // 💙の手番終了 → ⭕の手番
    assert.strictEqual(e.gearCost(s, 4, false, 1, 'onClickShuffle'), 3, '手番中は-1');
    e.placeMove(s, 3); // ⭕の手番終了
    assert.strictEqual(e.gearCost(s, 4, false, 1, 'onClickShuffle'), 4, '終わると元に戻る');
});

test('廃墟の底力: 通常の着手で自陣を奪われても発動しない（スキル・エフェクトによる破壊だけ）', () => {
    const s = game([[], ['ruinSurge']]);
    s.board[7] = { player: C, bind: 0, effects: [] };
    e.placeMove(s, 0);
    e.placeMove(s, 1);
    s.life = 5;
    e.placeMove(s, 7); // 💙が通常の着手で⭕のコマ(ライフ0)を奪う
    assert.strictEqual(s.board[7].player, H);
    assert.strictEqual(e.gearCost(s, 4, false, 1, 'onClickShuffle'), 4);
});

test('土壇場の防壁: 初めて相手が列を揃えると、かわりにその列と自陣のコマが消滅（ロックも貫通）。以降は相手の魔力+2・ライフ+1', () => {
    const s = game([[], ['lastStand']]);
    s.board[12] = { player: C, bind: 5, effects: [] };
    s.board[0] = { player: H, bind: 5, effects: [] };
    s.board[1] = { player: H, bind: 9, effects: [{ effect: '🔑' }] };
    s.board[2] = { player: H, bind: 5, effects: [] };
    assert.ok(e.placeMove(s, 3));
    assert.strictEqual(s.winner, undefined);
    for (const i of [0, 1, 2, 3]) assert.strictEqual(s.board[i].player, undefined, `マス${i}は消滅`);
    assert.deepStrictEqual(s.board[1].effects, []);
    assert.strictEqual(s.lastStandUsed[1], true);
    assert.strictEqual(s.board.filter((sq) => sq.player === C).length, 0, '持ち主の自陣も消滅');
});

test('土壇場の防壁: 発動は1度だけ。2度目の完成は通常どおり勝ち / 持ち主自身の勝利は止めない', () => {
    const s = game([[], ['lastStand']]);
    const line = (p) => [8, 9, 10].forEach((i) => { s.board[i] = { player: p, bind: 5, effects: [] }; });
    line(H);
    e.placeMove(s, 11);
    assert.strictEqual(s.winner, undefined);
    e.placeMove(s, 0); // ⭕
    line(H);
    e.placeMove(s, 11);
    assert.strictEqual(s.winner, H, '2度目は勝ち');
    const t = game([[], ['lastStand']]);
    e.placeMove(t, 0);
    [4, 5, 6].forEach((i) => { t.board[i] = { player: C, bind: 5, effects: [] }; });
    e.placeMove(t, 7);
    assert.strictEqual(t.winner, C, '持ち主が揃えたら勝ち');
});

test('土壇場の防壁: 発動後は、相手の手番開始時の魔力+2', () => {
    const run = (gears) => {
        const s = game(gears);
        [0, 1, 2].forEach((i) => { s.board[i] = { player: H, bind: 5, effects: [] }; });
        e.placeMove(s, 3); // 💙が揃える
        const m = s.magic[0];
        e.placeMove(s, 8); // ⭕の手番終了 → 💙の手番開始
        return s.magic[0] - m;
    };
    assert.strictEqual(run([[], ['lastStand']]), 1 + 4);
});

test('焦土: 敵の🌱が🔥で消えると魔力+2(1手番に最大6)', () => {
    const run = (gears) => {
        const s = game(gears);
        s.board[7] = { player: C, bind: 30, effects: [{ effect: '🌱' }] };
        e.placeMove(s, 0); // 💙の手番終了 → ⭕の手番(記録)
        s.board[7] = { player: C, bind: 30, effects: [{ effect: '🔥' }, { effect: '🔥' }] }; // ⭕のコマの🌱が燃えた(⭕自身の手番中)
        const before = s.magic[0];
        e.placeMove(s, 1); // ⭕の手番終了 → 💙
        return s.magic[0] - before;
    };
    assert.strictEqual(run([['scorchedEarth'], []]) - run([[], []]), 2);
});

test('焦土: 敵の🍂(枯れ葉)が🔥で消えても同じく魔力+2', () => {
    const run = (gears) => {
        const s = game(gears);
        s.board[7] = { player: C, bind: 30, effects: [{ effect: '🍂' }] };
        e.placeMove(s, 0);
        s.board[7] = { player: C, bind: 30, effects: [{ effect: '🔥' }] }; // 🍂が燃えた
        const before = s.magic[0];
        e.placeMove(s, 1);
        return s.magic[0] - before;
    };
    assert.strictEqual(run([['scorchedEarth'], []]) - run([[], []]), 2);
});

test('焦土: 自分の🌱が燃えても、🔥のない🌱の消失(収穫など)でも発動しない', () => {
    const squares = [{ player: C, effects: [{ effect: '🔥' }] }, { player: H, effects: [{ effect: '🔥' }] }, { player: C, effects: [] }];
    assert.strictEqual(gear.burnedBudCount([C, H, C], [2, 2, 2], squares, H), 2, '⭕の🌱2つだけ');
    assert.strictEqual(gear.scorchGain(2), 4);
    assert.strictEqual(gear.scorchGain(10), 6, '上限6');
});

test('灰の供物: 敵のマスに🔥を付与すると、付与したマス1つにつき次の自分の手番の終わりまでコスト-1(重複・下限1)', () => {
    const s = game([['ashOffering'], []]);
    s.board[5] = { player: C, bind: 30, effects: [] };
    s.board[6] = { player: C, bind: 30, effects: [] };
    s.board[7] = { player: C, bind: 30, effects: [] };
    e.placeMove(s, 0); // 💙の手番終了 → ⭕
    e.placeMove(s, 1); // ⭕の手番終了 → 💙の手番(記録)
    assert.strictEqual(e.gearCost(s, 4, false, 0, 'onClickShuffle'), 4);
    s.board[5].effects.push({ effect: '🔥' }); // 💙のスキルで敵の2マスに🔥
    s.board[6].effects.push({ effect: '🔥' });
    s.board[8] = { player: H, bind: 30, effects: [{ effect: '🔥' }] }; // 自分のマスの🔥は数えない
    e.placeMove(s, 2); // 💙の手番終了 → ⭕の手番
    assert.strictEqual(e.gearCost(s, 4, false, 0, 'onClickShuffle'), 4, '相手の手番中は⭕の側のコストを見る(💙の次の手番まで保留)');
    e.placeMove(s, 3); // ⭕の手番終了 → 💙の手番
    assert.strictEqual(e.gearCost(s, 4, false, 0, 'onClickShuffle'), 2, '2マスぶん重複して-2');
    assert.strictEqual(e.gearCost(s, 1, false, 0, 'onClickShuffle'), 1, '下限1');
    e.placeMove(s, 9); // 💙の手番終了
    e.placeMove(s, 10);
    assert.strictEqual(e.gearCost(s, 4, false, 0, 'onClickShuffle'), 4, '次の手番の終わりで切れる');
});

test('凍てつく根: 氷結で休眠した🌱1つにつき手番開始時の魔力+1(敵味方問わず、上限なし)', () => {
    const run = (gears) => {
        const s = game(gears);
        s.board[5] = { player: H, bind: 30, effects: [{ effect: '🌱' }, { effect: '❄' }] };
        s.board[6] = { player: C, bind: 30, effects: [{ effect: '🌱' }, { effect: '🌱' }, { effect: '❄' }] };
        s.board[7] = { player: C, bind: 30, effects: [{ effect: '🌱' }, { effect: '❄' }] };
        e.placeMove(s, 0);
        const before = s.magic[0];
        e.placeMove(s, 1);
        return s.magic[0] - before;
    };
    assert.strictEqual(run([['frostRoot'], []]) - run([[], []]), 4, '休眠した🌱4つぶん');
});

test('伝導: 帯電していたコマの毒・火炎が、発火でダメージを受けた敵のマスに1スタック移る(持ち主のコマには移らない・装備なしなら移らない)', () => {
    const run = (gears) => {
        const s = game(gears);
        s.life = 8;
        s.board[5] = { player: C, bind: 9, effects: [{ effect: '☠' }, { effect: '🔥' }, { effect: '⚡' }] };
        s.board[6] = { player: C, bind: 9, effects: [] };
        s.board[9] = { player: H, bind: 9, effects: [] };
        e.placeMove(s, 4); // 💙が帯電マスの左隣に着手 → 発火
        return s;
    };
    const s = run([[], ['conduction']]);
    for (const k of [4, 9]) {
        assert.strictEqual(s.board[k].effects.filter((x) => x.effect === '☠').length, 1, `マス${k}の毒`);
        assert.strictEqual(s.board[k].effects.filter((x) => x.effect === '🔥').length, 1, `マス${k}の火炎`);
    }
    assert.ok(!s.board[6].effects.some((x) => x.effect === '☠' || x.effect === '🔥'), '持ち主のコマには移らない');
    const t = run([[], []]);
    assert.ok(![4, 9].some((k) => t.board[k].effects.some((x) => x.effect === '☠' || x.effect === '🔥')), '装備なしなら移らない');
    const u = run([['conduction'], []]);
    assert.ok(![4, 9].some((k) => u.board[k].effects.some((x) => x.effect === '☠')), '帯電コマの持ち主が装備していなければ移らない');
});

test('術中の加護: スキルを使った手番は、装備した席のコマが🔥・☠・⚡のダメージを受けない(使わなければ受ける)', () => {
    const run = (gears, useSkill) => {
        const s = game(gears);
        s.board[5] = { player: C, bind: 9, effects: [{ effect: '🔥' }, { effect: '☠' }] };
        s.board[9] = { player: C, bind: 9, effects: [] };
        s.board[10] = { player: C, bind: 9, effects: [{ effect: '⚡' }] };
        if (useSkill) e.spendMagic(s, 0, 'onClickAddLife'); // 💙がスキルを使う
        e.placeMove(s, 0); // 💙が着手(減衰が1回走る)
        return s;
    };
    const warded = run([[], ['spellWard']], true);
    assert.strictEqual(warded.board[5].bind, 9 - 1, '自然減衰の-1だけ(火炎・毒は通らない)');
    const open = run([[], ['spellWard']], false);
    assert.ok(open.board[5].bind < 9 - 1, 'スキルを使わなければ火炎・毒が通る');
    const noGear = run([[], []], true);
    assert.ok(noGear.board[5].bind < 9 - 1, 'ギアなしなら通る');
});

test('術中の加護: 帯電の発火も、🔥を付けた瞬間のダメージも通らない', () => {
    const fire = (gears) => {
        const s = game(gears);
        s.board[5] = { player: C, bind: 9, effects: [{ effect: '⚡' }] };
        s.board[6] = { player: C, bind: 9, effects: [] };
        e.spendMagic(s, 0, 'onClickAddLife');
        e.placeMove(s, 4); // 💙が⚡マスの左隣へ → 発火。6(⭕)が1ダメージ
        return s.board[6].bind;
    };
    assert.strictEqual(fire([[], ['spellWard']]), 9 - 1, '減衰の-1だけ');
    assert.strictEqual(fire([[], []]), 9 - 1 - 1, 'ギアなしは発火の-1も受ける');
    const t = thermalIgnite(['spellWard']);
    assert.strictEqual(t, 9, '加護なら火炎付与の即時ダメージなし');
    assert.strictEqual(thermalIgnite([]), 8, 'なしなら即時1ダメージ');
    function thermalIgnite(g) {
        const s = game([[], g]);
        s.board[6] = { player: C, bind: 9, effects: [] };
        e.spendMagic(s, 0, 'onClickAddLife');
        const thermal = require('./shared/thermal');
        thermal.ignite(s.board, [6], s.size);
        return s.board[6].bind;
    }
});

test('ランダム付与: 重複なしで指定枠数、すべて既知のギア', () => {
    const rng = e.makeRng(3);
    for (let k = 0; k < 50; k++) {
        const g = gear.randomGears(3, rng);
        assert.strictEqual(new Set(g).size, 3);
        assert.ok(g.every((id) => gear.GEAR_IDS.includes(id)));
    }
});

test('装備枠: 「あなた」だけ3枠、他は2枠', () => {
    assert.strictEqual(gear.gearSlotsFor('you'), 3);
    assert.strictEqual(gear.gearSlotsFor('giant'), 2);
});

test('全ギアを持たせたAI同士の試合が最後まで進む（落ちない・魔力が負にならない）', () => {
    const ai = require('./ai');
    for (let seed = 1; seed <= 8; seed++) {
        const g = [gear.randomGears(3, e.makeRng(seed)), gear.randomGears(3, e.makeRng(seed + 100))];
        const s = e.newGame({ chars: ['you', 'magician'], gears: g, rng: e.makeRng(seed) });
        let guard = 0;
        while (!s.winner && guard++ < 600) {
            const r = ai.makeMove(s, 'faithful');
            if (r.turnEnded) continue;
            if (r.move === null) break;
            const before = s.currentTurn;
            e.placeMove(s, r.move);
            if (s.currentTurn === before) break;
            assert.ok(s.magic.every((m) => m >= 0), `seed ${seed}: 魔力が負 ${s.magic}`);
        }
        assert.ok(guard < 600, `seed ${seed}: 終わらない`);
    }
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
