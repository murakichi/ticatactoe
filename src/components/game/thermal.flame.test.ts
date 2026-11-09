import {
    isFrozen,
    infernoCostOf,
    totalFlames,
    burnoutCostOf,
    burnoutTargets,
    burnout,
    flameStacks,
    thaw,
    burnDamageOf,
    applyDamage,
    zeroOut,
    ignite,
    infernoTargets,
    decayTick,
    budStacks,
    activeBuds,
    swidden,
    canSacrifice,
    sacrificeTargets,
    sacrificeFlame,
    placeFlameToken,
    isDormant,
    harvestBuds,
    frozenStacks,
    FLAME_BURN_DAMAGE,
    KIMON_LOCK_TURNS,
    fireStacksTotal,
    kimonTargets,
    kimon,
    fireWheelTargets,
    FIRE_WHEEL_COUNT,
    fireWheel,
} from './thermal';
import { fireCharges, isShielded } from './charge';
import { SquareInfo } from '../../types/SquareInfo';
import { CharacterId } from '../../types/Character';
import { emptyBoard, sq, chars } from './thermalTestUtils';

describe('🔥火炎', () => {
    it('ターン進行でスタックごとに2ダメージ。重複する。🔥は消えない', () => {
        const one = decayTick(sq('💙', 10, '🔥'), chars);
        expect(one.bind).toBe(10 - 1 - FLAME_BURN_DAMAGE);
        expect(flameStacks(one)).toBe(1);
        expect(decayTick(sq('💙', 10, '🔥', '🔥', '🔥'), chars).bind).toBe(10 - 1 - 3 * FLAME_BURN_DAMAGE);
    });

    it('ライフ0を下回らない', () => {
        expect(decayTick(sq('💙', 3, '🔥', '🔥'), chars).bind).toBe(0);
    });

    it('氷結中・ロック中のマスは継続ダメージを受けない', () => {
        expect(burnDamageOf(sq('💙', 5, '🔥', '❄'), chars)).toBe(0);
        expect(burnDamageOf(sq('💙', 5, '🔥', '🔑'), chars)).toBe(0);
        expect(burnDamageOf(sq('💙', 5, '🔥'), chars)).toBe(2);
    });

    it('煉獄の鍛冶師がいると、敵の🔥マスは継続ダメージが追加で+1（持ち主が鍛冶師なら+なし・1回につき+1）', () => {
        const cs: CharacterId[] = ['pyromancer', 'you'];
        expect(burnDamageOf(sq('⭕', 5, '🔥'), cs)).toBe(3); // 2 + 1
        expect(burnDamageOf(sq('⭕', 5, '🔥', '🔥'), cs)).toBe(5); // 4 + 1
        expect(burnDamageOf(sq('💙', 5, '🔥'), cs)).toBe(2); // 鍛冶師自身のマスには付かない
        expect(burnDamageOf(sq('⭕', 5, '🔥', '❄'), cs)).toBe(0); // 氷結中は受けない
        expect(burnDamageOf(sq('⭕', 5), cs)).toBe(0);
        expect(decayTick(sq('⭕', 10, '🔥'), cs).bind).toBe(10 - 1 - 3);
    });

    it('スキルダメージは1.5倍（切り上げ）', () => {
        expect(applyDamage(sq('⭕', 10, '🔥'), 2, 'skill').sq.bind).toBe(7);
        expect(applyDamage(sq('⭕', 10, '🔥'), 5, 'skill').sq.bind).toBe(2); // ceil(7.5)=8
        expect(applyDamage(sq('⭕', 10), 2, 'skill').sq.bind).toBe(8);
    });

    it('毒・電気のダメージには倍率がかからない', () => {
        expect(applyDamage(sq('⭕', 10, '🔥'), 2, 'electric').sq.bind).toBe(8);
        expect(applyDamage(sq('⭕', 10, '🔥'), 2, 'poison').sq.bind).toBe(8);
    });

    it('ダメージを受けると🔥は全部消える。ダメージが通らなければ残る', () => {
        expect(flameStacks(applyDamage(sq('⭕', 10, '🔥', '🔥'), 1, 'skill').sq)).toBe(0);
        expect(flameStacks(applyDamage(sq('⭕', 10, '🔥', '🔥'), 1, 'electric').sq)).toBe(2); // 電気のダメージでは消えない
        expect(flameStacks(applyDamage(sq('⭕', 0, '🔥'), 1, 'electric').sq)).toBe(1);
        expect(flameStacks(zeroOut(sq('⭕', 4, '🔥')))).toBe(0);
        const ticked = decayTick(sq('⭕', 5, '🔥', '☠'), chars); // 🔥中でも☠は働き、毒のダメージでは🔥は消えない（重複する）
        expect(flameStacks(ticked)).toBe(1);
        expect(ticked.effects.some((e) => e.effect === '☠')).toBe(true);
        expect(flameStacks(applyDamage(sq('⭕', 5, '🔥'), 1, 'pure').sq)).toBe(0);
    });

    it('自然減衰だけでは🔥は消えない', () => {
        expect(flameStacks(decayTick(sq('⭕', 5, '🔥'), chars))).toBe(1);
    });

    it('電気の発火では🔥は消えない', () => {
        const b = emptyBoard();
        b[5] = sq(undefined, 0, '⚡');
        b[6] = sq('⭕', 4, '🔥');
        fireCharges(b, 4, 4);
        expect(b[6].bind).toBe(3);
        expect(flameStacks(b[6])).toBe(1);
    });

    it('🔥が付くと、縦横隣の氷結が全スタック即座に解ける（斜めは解けない）', () => {
        const b = emptyBoard();
        b[5] = sq('⭕', 4);
        b[6] = sq('⭕', 4, '❄', '❄'); // 発火マス 5 の右隣
        b[9] = sq('⭕', 4, '❄'); // 下隣
        b[10] = sq('⭕', 4, '❄'); // 斜め
        b[0] = sq('⭕', 4, '❄'); // 斜め
        const r = ignite(b, [5], 4);
        expect(flameStacks(b[5])).toBe(1);
        expect(isFrozen(b[6])).toBe(false);
        expect(isFrozen(b[9])).toBe(false);
        expect(isFrozen(b[10])).toBe(true);
        expect(isFrozen(b[0])).toBe(true);
        expect(r.thawed.sort((a, c) => a - c)).toEqual([6, 9]);
    });

    it('後から🔥が付くと🌱は消える（冬至の種子のガード中は残る）。☠・⚡は消えず働く', () => {
        const b = emptyBoard();
        b[0] = sq('💙', 3, '🌱', '🌱', '☠', '⚡');
        ignite(b, [0], 4);
        expect(b[0].effects.map((e) => e.effect)).toEqual(['☠', '⚡', '🔥']);
        expect(isDormant(b[0])).toBe(false);
        expect(activeBuds(b[0])).toBe(0);
        const g0 = emptyBoard();
        g0[0] = sq('💙', 3, '🌱', '🌱');
        ignite(g0, [0], 4, 1, () => true);
        expect(activeBuds(g0[0], true)).toBe(2);
        const cs = ['you', 'electrician'] as CharacterId[];
        expect(isShielded(sq('⭕', 3, '⚡', '🔥'), cs)).toBe(true); // 🔥だけでは⚡は休眠しない
        expect(isShielded(sq('⭕', 3, '⚡', '❄'), cs)).toBe(false);
        expect(harvestBuds(b, '💙')).toBe(0);
    });

    it('氷結が肩代わりして🔥が付かなかったときも🌱は残る', () => {
        const b = emptyBoard();
        b[10] = sq('💙', 3, '🌱', '❄');
        ignite(b, [10], 4);
        expect(b[10].effects.map((e) => e.effect)).toEqual(['🌱']);
    });

    it('氷結中のマスに🔥を付けようとすると、🔥の代わりに❄が全スタック解除される（隣は解けない）', () => {
        const b = emptyBoard();
        b[5] = sq('⭕', 4, '❄', '❄', '❄');
        b[6] = sq('⭕', 4, '❄');
        const r = ignite(b, [5], 4);
        expect(frozenStacks(b[5])).toBe(0);
        expect(flameStacks(b[5])).toBe(0);
        expect(isFrozen(b[6])).toBe(true); // 🔥は付いていないので発火しない
        expect(r.thawed).toEqual([5]);
    });

    it('2スタック付与: 氷結が先に全解除され、余りが🔥になる。🔥が付くと隣の氷結も解ける', () => {
        const b = emptyBoard();
        b[5] = sq('⭕', 4, '❄', '❄'); // 2スタックでも1つ目で全解除
        b[6] = sq('⭕', 4, '❄', '❄');
        ignite(b, [5], 4, 2);
        expect(isFrozen(b[5])).toBe(false);
        expect(flameStacks(b[5])).toBe(1); // 1つ目は氷結を全解除、2つ目が🔥になる
        expect(isFrozen(b[6])).toBe(false); // 🔥が付いたので隣の氷結は全部解ける
        const c = emptyBoard();
        c[5] = sq('⭕', 4);
        ignite(c, [5], 4, 2);
        expect(flameStacks(c[5])).toBe(2);
    });

    it('thaw は氷結が無ければ同じ参照を返す', () => {
        const s = sq('💙', 3);
        expect(thaw(s)).toBe(s);
    });

    it('業火の対象は使用者以外のコマ全て（ライフ0も含む。🔑中も対象で先に解除する。雷霆の巫の⚡無敵は除く）', () => {
        const b = emptyBoard();
        b[0] = sq('⭕', 3);
        b[1] = sq('⭕', 0);
        b[2] = sq('⭕', 3, '🔑');
        b[3] = sq('💙', 3); // 自分
        b[4] = sq('🟩', 3, '⚡'); // 雷霆の巫の無敵
        b[5] = sq('⭕', 3, '⚡'); // 雷霆の巫ではない⭕の⚡は対象
        const cs: CharacterId[] = ['pyromancer', 'you', 'electrician'];
        expect(infernoTargets(b, '💙', cs)).toEqual([0, 1, 2, 5]);
    });
});

describe('火炎系の汎用スキル（火炎トークン・焼畑）', () => {
    it('焼畑: 🌱を全て同じ数の🔥に変える。🌱の無いマスは何もしない', () => {
        const b = emptyBoard();
        b[5] = sq('⭕', 4, '🌱', '🌱', '🌱', '☠');
        b[6] = sq('⭕', 4);
        const r = swidden(b, 5, 4);
        expect(r.n).toBe(3);
        expect(budStacks(b[5])).toBe(0);
        expect(flameStacks(b[5])).toBe(3);
        expect(b[5].effects.some((e) => e.effect === '☠')).toBe(true);
        expect(swidden(b, 6, 4)).toEqual({ n: 0, thawed: [] });
    });

    it('焼畑: 🔥が付いたマスの隣の氷結は全解除。氷結中のマス自身は最初のスタックで全解除され、残りが🔥', () => {
        const b = emptyBoard();
        b[5] = sq('⭕', 4, '🌱', '🌱', '❄', '❄');
        b[6] = sq('⭕', 4, '❄', '❄');
        const r = swidden(b, 5, 4);
        expect(r.n).toBe(2);
        expect(isFrozen(b[5])).toBe(false);
        expect(flameStacks(b[5])).toBe(1); // 1つ目で氷結が全解除、2つ目が🔥
        expect(isFrozen(b[6])).toBe(false);
    });

    it('火炎トークン: 🔥付きのコマを置き、縦横隣の氷結を全解除する', () => {
        const b = emptyBoard();
        b[5] = sq('⭕', 3, '❄', '❄');
        b[9] = sq('⭕', 3, '❄'); // 斜め
        const thawed = placeFlameToken(b, 6, '💙', 4, 4);
        expect(b[6].player).toBe('💙');
        expect(b[6].bind).toBe(3); // 🔥を付与した瞬間に1ダメージ（4→3）
        expect(flameStacks(b[6])).toBe(1);
        expect(thawed).toEqual([5]);
        expect(isFrozen(b[9])).toBe(true);
    });

    it('🔥を付与した瞬間に1ダメージ: スタックごとに1。🔑・氷結・ライフ0・空きマスには入らず、🔥は消えない', () => {
        const b = emptyBoard();
        b[0] = sq('⭕', 5);
        b[1] = sq('⭕', 5, '🔑');
        b[2] = sq('⭕', 0);
        ignite(b, [0, 1, 2, 4], 4, 2); // 2スタック
        expect(b[0].bind).toBe(3); // 5-2。🔥は2つ残る
        expect(flameStacks(b[0])).toBe(2);
        expect(b[1].bind).toBe(5); // 🔑ロック中は入らない
        expect(b[2].bind).toBe(0); // ライフ0はそのまま
        expect(b[4].player).toBeUndefined(); // 空きマスは🔥だけ
        expect(flameStacks(b[4])).toBe(2);
        // 氷結中のマスは、1回目の付与で❄が解けるだけ（🔥もダメージも入らない）。2回目で🔥1つとダメージ1
        const f = emptyBoard();
        f[15] = sq('⭕', 5, '❄');
        ignite(f, [15], 4, 1);
        expect(flameStacks(f[15])).toBe(0);
        expect(isFrozen(f[15])).toBe(false);
        expect(f[15].bind).toBe(5);
    });

});

describe('殉火（仮名）', () => {
    const cs: CharacterId[] = ['you', 'you', 'electrician'];
    it('犠牲にできるのは自陣のライフが残る🔑なしのコマだけ', () => {
        expect(canSacrifice(sq('💙', 3), '💙')).toBe(true);
        expect(canSacrifice(sq('💙', 0), '💙')).toBe(false);
        expect(canSacrifice(sq('💙', 3, '🔑'), '💙')).toBe(false);
        expect(canSacrifice(sq('⭕', 3), '💙')).toBe(false);
        expect(canSacrifice(sq(undefined, 0), '💙')).toBe(false);
    });

    it('自陣のコマのライフをゼロにして、そのライフ以下の敵コマ全て（ライフ0含む）に🔥を1つ。大きい敵・🔑・自陣・無敵は対象外', () => {
        const b = emptyBoard();
        b[0] = sq('💙', 4, '🔥'); // 犠牲（🔥は消える）
        b[1] = sq('⭕', 4); // 4以下 → 対象
        b[2] = sq('⭕', 2); // 対象
        b[3] = sq('⭕', 0); // ライフ0も対象
        b[4] = sq('⭕', 5); // 大きい → 対象外
        b[5] = sq('⭕', 3, '🔑'); // ロック → 対象外
        b[6] = sq('💙', 2); // 自陣 → 対象外
        b[7] = sq('🟩', 1, '⚡'); // 雷霆の巫の無敵 → 対象外
        const r = sacrificeFlame(b, 0, '💙', cs, 4);
        expect(r.threshold).toBe(4);
        expect(r.targets).toEqual([1, 2, 3]);
        expect(b[0].bind).toBe(0);
        expect(flameStacks(b[0])).toBe(0);
        [1, 2].forEach((k) => expect(flameStacks(b[k])).toBe(1));
        expect(b[1].bind).toBe(3); // 付与の瞬間に1ダメージ
        expect(b[2].bind).toBe(1);
        expect(b[3].player).toBeUndefined(); // ライフ0の敵コマは🔥で破壊される
        [4, 5, 6, 7].forEach((k) => expect(flameStacks(b[k])).toBe(0));
    });

    it('🔥でライフが0になったコマは破壊される: 継続ダメージ・付与時のダメージ・すでにライフ0。🔑・氷結中は除く', () => {
        const none = [] as CharacterId[];
        // 継続ダメージ(1スタック=2)でライフ2→0
        expect(decayTick(sq('⭕', 3, '🔥'), none).player).toBeUndefined(); // 自然減衰で2、継続ダメージで0
        // ライフに余裕があれば残る
        const alive = decayTick(sq('⭕', 6, '🔥'), none);
        expect(alive.player).toBe('⭕');
        // 🔑ロック中は🔥のダメージも破壊も受けない
        expect(decayTick(sq('⭕', 2, '🔥', '🔑'), none).player).toBe('⭕');
        // 付与時: ライフ1のコマは1ダメージで0になり破壊。破壊したマスには続けて🔥を付けない（業火の2スタック目）
        const b = emptyBoard();
        b[0] = sq('⭕', 1);
        ignite(b, [0], 4, 2);
        expect(b[0].player).toBeUndefined();
        expect(flameStacks(b[0])).toBe(0);
    });

    it('氷結中の敵は🔥の代わりに氷結が全解除される', () => {
        const b = emptyBoard();
        b[0] = sq('💙', 3);
        b[1] = sq('⭕', 2, '❄', '❄');
        const r = sacrificeFlame(b, 0, '💙', ['you', 'you'], 4);
        expect(r.targets).toEqual([1]);
        expect(isFrozen(b[1])).toBe(false);
        expect(flameStacks(b[1])).toBe(0);
        expect(r.thawed).toEqual([1]);
        expect(sacrificeTargets(b, 3, '💙', ['you', 'you'])).toEqual([1]);
    });
});

describe('業火の無料化', () => {
    it('無料権があれば0、なければキャラ補正後の基礎コスト', () => {
        expect(infernoCostOf(9, false, (c) => c)).toBe(9);
        expect(infernoCostOf(9, false, (c) => c + 1)).toBe(10);
        expect(infernoCostOf(9, true, (c) => c)).toBe(0);
    });
});

describe('煉獄の鍛冶師の火炎スキル割引', () => {
});

describe('バーンアウト', () => {
    it('バーンアウトは🔥の合計が4以上でタダ。🔥のマスを全て破壊し、雷霆の巫の⚡無敵コマは除く', () => {
        expect(burnoutCostOf(5, 3, (c) => c)).toBe(5);
        expect(burnoutCostOf(5, 4, (c) => c)).toBe(0);
        const b = emptyBoard();
        b[1] = sq('⭕', 5, '🔥', '🔥');
        b[2] = sq('💙', 5, '🔥');
        b[3] = sq('⭕', 5);
        b[4] = sq('🟩', 5, '🔥', '⚡');
        expect(totalFlames(b)).toBe(4);
        const cs = ['you', 'you', 'electrician'] as CharacterId[];
        expect(burnoutTargets(b, cs)).toEqual([1, 2]);
        expect(burnout(b, [1, 2])).toBe(2);
        expect(b[1].player).toBeUndefined();
        expect(b[3].player).toBe('⭕');
    });
});

describe('鬼門封じ / 火の車', () => {
    const board = (): SquareInfo[] => Array.from({ length: 16 }, () => sq(undefined, 0));
    const guard = (s: SquareInfo) => s.effects.some((e) => e.effect === '🔑');

    it('鬼門封じ: 対象は敵のコマのうち守られていないもの（氷結中は選べる）', () => {
        const b = board();
        b[0] = sq('⭕', 3);
        b[1] = sq('⭕', 3, '🔑'); // ロック中は選べない
        b[2] = sq('⭕', 3, '❄');
        b[3] = sq('💙', 3); // 自陣は選べない
        expect(kimonTargets(b, '💙', guard)).toEqual([0, 2]);
    });

    it('鬼門封じ: 氷結していなければ破壊して3ターンロック。氷結中は❄が1つ減るだけでコマは残りロックしない', () => {
        const b = board();
        b[0] = sq('⭕', 5, '☠', '🌱');
        expect(kimon(b, 0)).toEqual({ destroyed: true, thawed: false, locked: true });
        expect(b[0]).toEqual({ player: undefined, bind: 0, effects: [{ effect: '🔑', stack: KIMON_LOCK_TURNS }] }); // ライフは変えず、ロックのスタックで3ターン
        expect(KIMON_LOCK_TURNS).toBe(3);
        const f = board();
        f[2] = sq('⭕', 5, '❄', '❄');
        expect(kimon(f, 2)).toEqual({ destroyed: false, thawed: true, locked: false });
        expect(f[2].player).toBe('⭕');
        expect(f[2].effects.map((e) => e.effect)).toEqual(['❄']);
    });

    it('火の車: 対象は鬼門封じと同じ（敵のコマで守られていないもの）。🔥を1つずつ付け、氷結中なら解けるだけ', () => {
        const b = board();
        b[0] = sq('⭕', 3);
        b[10] = sq('⭕', 3, '❄'); // 隣り合わないマス（🔥は縦横隣の氷結も解くため）
        b[2] = sq('💙', 3);
        expect(fireWheelTargets(b, '💙', guard)).toEqual([0, 10]);
        expect(FIRE_WHEEL_COUNT).toBe(2);
        const thawed = fireWheel(b, [0, 10], 4);
        expect(b[0].effects.map((e) => e.effect)).toEqual(['🔥']);
        expect(b[10].effects.map((e) => e.effect)).toEqual([]); // 氷結中は🔥が付かず❄が解けるだけ
        expect(thawed).toContain(10);
    });

    it('fireStacksTotal: 敵味方・空きマスを問わず盤面全体の🔥を数える（火の車の無料条件に使う）', () => {
        const b = board();
        expect(fireStacksTotal(b)).toBe(0);
        b[0] = sq('⭕', 3, '🔥');
        b[1] = sq('💙', 3, '🔥', '🔥');
        b[2] = sq(undefined, 0, '🔥');
        expect(fireStacksTotal(b)).toBe(4);
    });
});
