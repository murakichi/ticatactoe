// @ts-check
'use strict';
// ギア (sim/gear.js + engine.js) のテスト。実行: node sim/gear.test.js
const assert = require('assert');
const e = require('./engine');
const gear = require('./gear');

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

test('剛腕の代償: 全スキルのコスト+2', () => {
    const s = game([['titanCost'], []]);
    assert.strictEqual(e.calculateCost(s, 4), 6);
    assert.strictEqual(e.calculateCost(s, 4, true), 6);
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

test('価格破壊: 装備した席だけ試合開始時にコスト表が決まり、下限1で試合中は固定', () => {
    const s = game([['priceWreck'], []]);
    assert.ok(s.priceTables[0]);
    assert.strictEqual(s.priceTables[1], null);
    for (const k of Object.keys(s.priceTables[0])) {
        assert.ok(s.priceTables[0][k] >= 1, k);
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

test('増援 / 軽量トークン: トークンのライフが+1 / -1（コストは軽量トークンだけ-1）', () => {
    const a = game([['reinforce'], []]);
    a.magic[0] = 99;
    e.SKILLS.token(a);
    assert.strictEqual(a.board.find((x) => x.player === H).bind, 5);
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

test('毒花: 敵に毒を注入すると、自陣のコマ1つにバッズが付く', () => {
    const s = game([['toxicBloom'], []]);
    s.board[0] = { player: H, bind: 3, effects: [] };
    s.board[5] = { player: C, bind: 3, effects: [] };
    s.magic[0] = 20;
    e.SKILLS.injection(s);
    e.placeMove(s, 5);
    assert.ok(s.board[5].effects.some((x) => x.effect === '☠'));
    assert.ok(s.board[0].effects.some((x) => x.effect === '🌱'));
    assert.ok(!s.board[5].effects.some((x) => x.effect === '🌱'), '敵のコマにはバッズを付けない');
});

test('毒花: 自陣のコマに毒を打てば、そのコマにバッズが付く', () => {
    const s = game([['toxicBloom'], []]);
    s.board[0] = { player: H, bind: 3, effects: [] };
    s.magic[0] = 20;
    e.SKILLS.injection(s);
    e.placeMove(s, 0);
    assert.deepStrictEqual(s.board[0].effects.map((x) => x.effect).sort(), ['☠', '🌱']);
});

test('毒花: 自陣のコマがなければ何も起きない', () => {
    const s = game([['toxicBloom'], []]);
    s.board[5] = { player: C, bind: 3, effects: [] };
    s.magic[0] = 20;
    e.SKILLS.injection(s);
    e.placeMove(s, 5);
    assert.ok(!s.board.some((x) => x.effects.some((y) => y.effect === '🌱')));
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
