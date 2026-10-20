import {
    isFrozen,
    infernoCostOf,
    FLAME_SKILL_KEYS,
    dropOneFlame,
    totalFlames,
    burnoutCostOf,
    burnoutTargets,
    burnout,
    flameStacks,
    thaw,
    overwriteBlocked,
    burnDamageOf,
    applyDamage,
    absorbDestroy,
    zeroOut,
    ignite,
    canFreeze,
    freeze,
    infernoTargets,
    decayTick,
    budStacks,
    activeBuds,
    swidden,
    randomFreezeCandidates,
    placeFrostToken,
    frostfallTargets,
    shatter,
    canSacrifice,
    sacrificeTargets,
    sacrificeFlame,
    placeFlameToken,
    isDormant,
    canBud,
    harvestBuds,
    budReceivers,
    graft,
    GRAFT_MAX,
    sowCandidates,
    sow,
    cleanse,
    ailmentStacks,
    AILMENTS,
    frozenStacks,
    thawOne,
    lockable,
    emptyBlocked,
    reducedGlacierCost,
    freezeAll,
    detonate,
    GLACIER_BASE_COST,
    FLAME_BURN_DAMAGE,
} from './thermal';
import { lineCells } from './boardGeometry';
import { fireCharges, applyJammer, chargeStacks, canJam, isShielded, boardChargeCount, isFullyCharged } from './charge';
import { findEmptyIndexes } from '../../util';
import { SquareInfo } from '../../types/SquareInfo';
import { Effect } from '../../types/Effect';
import { Player } from '../../types/Player';
import { CharacterId } from '../../types/Character';

const emptyBoard = (size = 4): SquareInfo[] => Array.from({ length: size * size }, () => ({ player: undefined, bind: 0, effects: [] }));
const sq = (player: Player | undefined, bind: number, ...effects: Effect['effect'][]): SquareInfo => ({
    player,
    bind,
    effects: effects.map((effect) => ({ effect })),
});
const chars: CharacterId[] = ['you', 'you'];

describe('❄氷結', () => {
    it('ターン進行（自然減衰）でライフが減らない', () => {
        expect(decayTick(sq('💙', 4, '❄'), chars).bind).toBe(4);
        expect(decayTick(sq('💙', 4), chars).bind).toBe(3);
    });

    it('氷結中のマスの☠は消えないが休眠していて、継続ダメージを与えない（氷結が解ければ再び働く）', () => {
        const frozen = decayTick(sq('💙', 4, '❄', '☠', '☠'), chars);
        expect(frozen.bind).toBe(4);
        expect(frozen.effects.filter((e) => e.effect === '☠')).toHaveLength(2);
        expect(decayTick(sq('💙', 4, '☠', '☠'), chars).bind).toBe(1); // 氷結していなければ -1 と毒2
    });

    it('隣接⚡のダメージ（発火・ジャマー）は受けず、氷結も残る', () => {
        const b = emptyBoard();
        b[5] = sq(undefined, 0, '⚡');
        b[6] = sq('⭕', 4, '❄');
        b[9] = sq('⭕', 4);
        fireCharges(b, 4, 4);
        expect([b[6].bind, b[9].bind]).toEqual([4, 3]);
        expect(isFrozen(b[6])).toBe(true);

        const j = emptyBoard();
        j[5] = sq(undefined, 0, '⚡', '⚡');
        j[6] = sq('⭕', 4, '❄');
        j[9] = sq('⭕', 4);
        applyJammer(j, 5, 4, '💙');
        expect([j[6].bind, j[9].bind]).toEqual([4, 2]);
        expect(isFrozen(j[6])).toBe(true);
    });

    it('氷結しても⚡は消えないが休眠する（発火せず、ジャマーの起点にもならない。解凍で復活）', () => {
        const b = emptyBoard();
        b[5] = sq('⭕', 3, '⚡', '❄');
        b[6] = sq('💙', 4);
        freeze(b, [5]); // 氷結済みなので何も起きない
        expect(chargeStacks(b[5])).toBe(1);
        expect(fireCharges(b, 4, 4).fired).toEqual([]);
        expect(b[6].bind).toBe(4);
        expect(canJam(b, 5, '💙', [])).toBe(false);
        b[5] = thaw(b[5]);
        expect(fireCharges(b, 4, 4).fired).toEqual([5]);
        expect(b[6].bind).toBe(3);
    });

    it('スキルダメージは受けず、代わりに氷結が解除される', () => {
        const r = applyDamage(sq('⭕', 4, '❄'), 2, 'skill');
        expect(r.blocked).toBe(true);
        expect(r.sq.bind).toBe(4);
        expect(isFrozen(r.sq)).toBe(false);
        // 破壊系も同じ（ライフはそのまま・氷結だけ解除）
        const g = absorbDestroy(sq('⭕', 4, '❄'));
        expect(g.blocked).toBe(true);
        expect(isFrozen(g.sq)).toBe(false);
        expect(absorbDestroy(sq('⭕', 4)).blocked).toBe(false);
    });

    it('氷結は重ねられるが、ロック中には付かない', () => {
        const b = emptyBoard();
        b[0] = sq('💙', 3);
        b[1] = sq('💙', 3, '🔑');
        expect(freeze(b, [0, 0, 1, 2])).toEqual([0, 0, 2]); // 氷結済みでも重ねられ、空きマスにも付く。ロック中は付かない
        expect(frozenStacks(b[0])).toBe(2);
        expect(canFreeze(b[0])).toBe(true);
    });

    it('自陣への上書き（強化）は氷結中は誰もできない', () => {
        expect(overwriteBlocked(sq('💙', 3, '❄'))).toBe(true);
        expect(overwriteBlocked(sq('💙', 3))).toBe(false);
    });

    it('氷結はスタックし、スキルダメージは1スタックずつ肩代わりする', () => {
        const b = emptyBoard();
        b[0] = sq('💙', 3);
        freeze(b, [0]);
        freeze(b, [0]);
        expect(frozenStacks(b[0])).toBe(2);
        const hit1 = applyDamage(b[0], 5, 'skill');
        expect(hit1.blocked).toBe(true);
        expect(frozenStacks(hit1.sq)).toBe(1);
        expect(hit1.sq.bind).toBe(3);
        const hit2 = absorbDestroy(hit1.sq);
        expect(hit2.blocked).toBe(true);
        expect(isFrozen(hit2.sq)).toBe(false);
        expect(applyDamage(hit2.sq, 2, 'skill').sq.bind).toBe(1); // 氷結が無くなればダメージが通る
    });

    it('発火すると氷結は全スタックが解除される', () => {
        const b = emptyBoard();
        b[5] = sq('⭕', 4, '❄', '❄', '❄');
        ignite(b, [6], 4);
        expect(isFrozen(b[5])).toBe(false);
    });

    it('氷結が付いても🌱は消えず休眠する。氷結中はロックできない', () => {
        const b = emptyBoard();
        b[0] = sq('💙', 3, '🌱', '🌱');
        freeze(b, [0]);
        expect(b[0].effects.map((e) => e.effect)).toEqual(['🌱', '🌱', '❄']);
        expect(budStacks(b[0])).toBe(2);
        expect(activeBuds(b[0])).toBe(0); // 休眠
        expect(activeBuds(thaw(b[0]))).toBe(2); // 解凍すれば再び働く
        expect(lockable(b[0])).toBe(false);
        expect(lockable(sq('💙', 3, '🌱'))).toBe(true);
        // ロック中のコマには氷結が付かない
        const l = emptyBoard();
        l[0] = sq('💙', 3, '🔑');
        expect(freeze(l, [0])).toEqual([]);
    });

    it('空きマスにも氷結を置け、氷結中の空きマスには着手できない（🔑中は付かない）', () => {
        const b = emptyBoard();
        b[0] = sq(undefined, 0, '🔑');
        expect(freeze(b, [0, 1])).toEqual([1]);
        expect(emptyBlocked(b[1])).toBe(true);
        expect(emptyBlocked(b[2])).toBe(false);
        expect(emptyBlocked(sq('💙', 3, '❄'))).toBe(false); // コマのあるマスは対象外（上書き禁止は別ルール）
        // 空きマスへのスキルダメージ（範囲スキル）は❄を1つ減らす
        expect(absorbDestroy(b[1]).blocked).toBe(true);
        expect(findEmptyIndexes(b)).not.toContain(1);
    });

    it('絶対零度のコスト: 氷結が作られた回数だけ軽減（撃つとリセットされる回数）、キャラ補正は軽減後、下限1', () => {
        expect(reducedGlacierCost(GLACIER_BASE_COST, 0, (c) => c)).toBe(10);
        expect(reducedGlacierCost(GLACIER_BASE_COST, 3, (c) => c)).toBe(7);
        expect(reducedGlacierCost(GLACIER_BASE_COST, 3, (c) => c + 1)).toBe(8);
        expect(reducedGlacierCost(GLACIER_BASE_COST, 30, (c) => c)).toBe(1);
    });

    it('氷結は🔑・🔥のあるマスには置けない（空きマスや氷結済みは可）', () => {
        const b = emptyBoard();
        b[0] = sq('💙', 3, '🔥');
        b[1] = sq('💙', 3, '🔑');
        b[2] = sq('💙', 3, '❄');
        expect(canFreeze(b[0])).toBe(false);
        expect(canFreeze(b[1])).toBe(false);
        expect(canFreeze(b[2])).toBe(true);
        expect(canFreeze(b[3])).toBe(true);
        expect(freeze(b, [0, 1, 2, 3])).toEqual([2, 3]);
        const all = emptyBoard();
        all[0] = sq('💙', 3, '🔥');
        expect(freezeAll(all)).toHaveLength(15); // 🔥のマスは飛ばす
    });

    it('絶対零度の使用時: 🔑のない全マス（空きマス含む）に❄+1', () => {
        const b = emptyBoard();
        b[0] = sq('💙', 3, '🌱');
        b[1] = sq('⭕', 3, '❄');
        b[2] = sq('⭕', 3, '🔑');
        const done = freezeAll(b);
        expect(done).toHaveLength(15);
        expect(done).not.toContain(2);
        expect(frozenStacks(b[0])).toBe(1);
        expect(budStacks(b[0])).toBe(1); // 🌱は消えず休眠する
        expect(frozenStacks(b[1])).toBe(2);
        expect(frozenStacks(b[5])).toBe(1); // 空きマス
        expect(frozenStacks(b[2])).toBe(0);
    });

    it('絶対零度の発動: 他者のコマの❄×3ダメージで氷結を解除、ライフ0は破壊。空きマスの❄も解除、自陣の❄は残る', () => {
        const b = emptyBoard();
        b[0] = sq('⭕', 10, '❄', '❄'); // 6ダメージ → 4
        b[1] = sq('⭕', 3, '❄'); // 3ダメージ → 0 で破壊
        b[2] = sq('⭕', 0, '❄'); // 0 → 破壊
        b[3] = sq('⭕', 5); // 氷結なし → 無傷
        b[4] = sq('💙', 5, '❄', '❄'); // 自陣 → そのまま
        b[5] = sq(undefined, 0, '❄', '❄'); // 空きマス → ダメージなしで解除
        b[6] = sq('⭕', 9, '❄', '🔥'); // 3ダメージ、🔥は消える
        const r = detonate(b, '💙');
        expect(r.damaged.sort((a, c) => a - c)).toEqual([0, 1, 2, 6]);
        expect(r.destroyed.sort((a, c) => a - c)).toEqual([1, 2]);
        expect(b[0].bind).toBe(4);
        expect(isFrozen(b[0])).toBe(false);
        expect(b[1]).toEqual({ player: undefined, bind: 0, effects: [] });
        expect(b[3].bind).toBe(5);
        expect(frozenStacks(b[4])).toBe(2);
        expect(frozenStacks(b[5])).toBe(0);
        expect(b[6].bind).toBe(6);
        expect(flameStacks(b[6])).toBe(0);
    });


});

describe('🔥火炎', () => {
    it('ターン進行でスタックごとに2ダメージ。重複する。継続ダメージのあと🔥は1スタック減る', () => {
        const one = decayTick(sq('💙', 10, '🔥'), chars);
        expect(one.bind).toBe(10 - 1 - FLAME_BURN_DAMAGE);
        expect(flameStacks(one)).toBe(0);
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
        expect(flameStacks(applyDamage(sq('⭕', 10, '🔥', '🔥'), 1, 'electric').sq)).toBe(0);
        expect(flameStacks(applyDamage(sq('⭕', 0, '🔥'), 1, 'electric').sq)).toBe(1);
        expect(flameStacks(zeroOut(sq('⭕', 4, '🔥')))).toBe(0);
        expect(flameStacks(decayTick(sq('⭕', 5, '🔥', '☠'), chars))).toBe(0); // 🔥中でも☠は働き、ダメージで🔥は消える
    });

    it('自然減衰では🔥が全部は消えず、1スタックずつ減る', () => {
        expect(flameStacks(decayTick(sq('⭕', 5, '🔥', '🔥'), chars))).toBe(1);
    });

    it('電気の発火で🔥が消える', () => {
        const b = emptyBoard();
        b[5] = sq(undefined, 0, '⚡');
        b[6] = sq('⭕', 4, '🔥');
        fireCharges(b, 4, 4);
        expect(b[6].bind).toBe(3);
        expect(flameStacks(b[6])).toBe(0);
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

    it('業火の対象は使用者以外のコマ全て（ライフ0も含む。🔑中と雷霆の巫の⚡無敵は除く）', () => {
        const b = emptyBoard();
        b[0] = sq('⭕', 3);
        b[1] = sq('⭕', 0);
        b[2] = sq('⭕', 3, '🔑');
        b[3] = sq('💙', 3); // 自分
        b[4] = sq('🟩', 3, '⚡'); // 雷霆の巫の無敵
        b[5] = sq('⭕', 3, '⚡'); // 雷霆の巫ではない⭕の⚡は対象
        const cs: CharacterId[] = ['pyromancer', 'you', 'electrician'];
        expect(infernoTargets(b, '💙', cs)).toEqual([0, 1, 5]);
    });
});

// sim/thermal.js（ヘッドレス版）との一致確認。様々なマスに同じ操作をして結果が同じことを見る
describe('sim/thermal.js との一致', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const sim = require('../../../sim/thermal.js');
    const kinds = ['skill', 'electric', 'poison'] as const;
    const combos: Effect['effect'][][] = [[], ['❄'], ['❄', '❄'], ['🌱', '❄'], ['🔥'], ['🔥', '🔥'], ['❄', '🔥'], ['🔑'], ['☠', '🔥'], ['⚡', '❄']];
    const squares = [0, 1, 3, 8].flatMap((bind) => combos.map((e) => sq('💙', bind, ...e)));
    squares.push(sq(undefined, 0, '❄'), sq(undefined, 0));

    it('applyDamage / absorbDestroy / zeroOut が一致', () => {
        for (const s of squares) {
            for (const kind of kinds) for (const amount of [1, 2, 5]) expect(sim.applyDamage(s, amount, kind)).toEqual(applyDamage(s, amount, kind));
            expect(sim.absorbDestroy(s)).toEqual(absorbDestroy(s));
            expect(sim.zeroOut(s)).toEqual(zeroOut(s));
            expect(sim.canFreeze(s)).toBe(canFreeze(s));
            expect(sim.overwriteBlocked(s)).toBe(overwriteBlocked(s));
            expect(sim.frozenStacks(s)).toBe(frozenStacks(s));
            expect(sim.thawOne(s)).toEqual(thawOne(s));
            expect(sim.lockable(s)).toBe(lockable(s));
            expect(sim.emptyBlocked(s)).toBe(emptyBlocked(s));
        }
    });

    it('burnDamageOf が一致（煉獄の鍛冶師の+1含む）', () => {
        const cs: CharacterId[] = ['pyromancer', 'you'];
        for (const s of [...squares, ...squares.map((x) => ({ ...x, player: '⭕' as Player }))]) {
            expect(sim.burnDamageOf(s, cs, ['💙', '⭕'])).toBe(burnDamageOf(s, cs));
        }
    });

    it('ignite / freeze / freezeAll / detonate / infernoTargets が一致', () => {
        const mk = () => {
            const b = emptyBoard();
            b[5] = sq('💙', 4, '❄');
            b[6] = sq('⭕', 4, '❄');
            b[9] = sq('⭕', 3, '🔥');
            b[10] = sq('💙', 2, '🌱');
            b[1] = sq('⭕', 5, '🔑');
            b[4] = sq('⭕', 0);
            return b;
        };
        const a = mk();
        const b = mk();
        expect(sim.ignite(a, [5, 10], 4)).toEqual(ignite(b, [5, 10], 4));
        const a2 = mk();
        const b2 = mk();
        expect(sim.ignite(a2, [5, 6, 10, 9], 4, 2)).toEqual(ignite(b2, [5, 6, 10, 9], 4, 2));
        expect(a2).toEqual(b2);
        expect(a).toEqual(b);
        const c = mk();
        const d = mk();
        expect(sim.freeze(c, [0, 4, 9, 10, 1])).toEqual(freeze(d, [0, 4, 9, 10, 1]));
        expect(c).toEqual(d);
        const e = mk();
        const f = mk();
        expect(sim.freezeAll(e)).toEqual(freezeAll(f));
        expect(e).toEqual(f);
        expect(sim.detonate(e, '💙')).toEqual(detonate(f, '💙'));
        expect(e).toEqual(f);
        expect(sim.infernoTargets(mk(), '💙')).toEqual(infernoTargets(mk(), '💙', ['you', 'you']));
    });
});

describe('浄化（汎用スキル）', () => {
    it('自陣のコマの毒・火炎・氷結・帯電を全スタック除去し、バッズとロックは残す', () => {
        const b = emptyBoard();
        b[0] = sq('💙', 4, '☠', '☠', '🔥', '❄', '❄', '⚡', '🌱');
        b[1] = sq('💙', 4, '🔑', '☠');
        b[2] = sq('💙', 4, '🌱');
        const done = cleanse(b, '💙');
        expect(done).toEqual([0, 1]);
        expect(b[0].effects.map((e) => e.effect)).toEqual(['🌱']);
        expect(b[1].effects.map((e) => e.effect)).toEqual(['🔑']);
        expect(b[2].effects.map((e) => e.effect)).toEqual(['🌱']);
    });

    it('敵のコマ・空きマスは対象外', () => {
        const b = emptyBoard();
        b[0] = sq('⭕', 4, '☠', '🔥');
        b[1] = sq(undefined, 0, '❄', '⚡');
        expect(cleanse(b, '💙')).toEqual([]);
        expect(ailmentStacks(b[0])).toBe(2);
        expect(ailmentStacks(b[1])).toBe(2);
    });

    it('状態異常の定義は毒・火炎・氷結・帯電（バッズとロックは含まない）', () => {
        expect(AILMENTS).toEqual(['☠', '🔥', '❄', '⚡']);
    });

    it('sim/thermal.js と一致', () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const sim = require('../../../sim/thermal.js');
        const mk = () => {
            const b = emptyBoard();
            b[0] = sq('💙', 4, '☠', '🔥', '❄', '⚡', '🌱');
            b[1] = sq('⭕', 4, '☠');
            b[2] = sq('💙', 4, '🔑', '☠');
            return b;
        };
        const a = mk();
        const c = mk();
        expect(sim.cleanse(a, '💙')).toEqual(cleanse(c, '💙'));
        expect(a).toEqual(c);
        expect(sim.AILMENTS).toEqual(AILMENTS);
    });
});

describe('バッズ系の汎用スキル（刈り入れ前夜・冬至の種子・ひこばえ・風の落とし子）', () => {
    it('刈り入れ前夜: 自陣の🌱を全部除去して数を返す。他人のコマは触らない', () => {
        const b = emptyBoard();
        b[0] = sq('💙', 3, '🌱', '🌱', '☠');
        b[1] = sq('💙', 3, '🌱');
        b[2] = sq('⭕', 3, '🌱');
        expect(harvestBuds(b, '💙')).toBe(3);
        expect(b[0].effects.map((e) => e.effect)).toEqual(['☠']);
        expect(budStacks(b[1])).toBe(0);
        expect(budStacks(b[2])).toBe(1);
        expect(harvestBuds(b, '💙')).toBe(0);
    });

    it('冬至の種子: guarded なら、氷結・火炎中のマスの🌱も働く（魔力・刈り入れ前夜）', () => {
        const dormantSq = sq('💙', 3, '🌱', '❄');
        expect(activeBuds(dormantSq)).toBe(0);
        expect(activeBuds(dormantSq, true)).toBe(1);
        expect(activeBuds(sq('💙', 3, '🌱', '🔥'), true)).toBe(1);
        expect(activeBuds(sq('💙', 3, '🌱'))).toBe(1);
    });

    it('ひこばえ: 縦横隣の自陣コマ全てに🌱を1つ。氷結・火炎中のコマ・敵・空きマス・斜めには付かない', () => {
        const b = emptyBoard();
        b[5] = sq('💙', 3, '🌱');
        b[1] = sq('💙', 3);
        b[4] = sq('💙', 3, '🌱');
        b[6] = sq('💙', 3, '❄');
        b[9] = sq('💙', 3, '🔥');
        b[0] = sq('💙', 3); // 斜め
        b[10] = sq('⭕', 3);
        expect(canBud(b[6])).toBe(false);
        expect(budReceivers(b, 5, '💙', 4).sort((a, c) => a - c)).toEqual([1, 4]);
        expect(graft(b, 5, '💙', 4).sort((a, c) => a - c)).toEqual([1, 4]);
        expect(budStacks(b[1])).toBe(1);
        expect(budStacks(b[4])).toBe(2);
        expect(budStacks(b[0])).toBe(0);
        expect(budStacks(b[10])).toBe(0);
    });

    it('ひこばえ: picked を渡すと受け手のうちそのマスだけに付く（GRAFT_MAX=2）', () => {
        const b = emptyBoard();
        b[5] = sq('💙', 3, '🌱');
        [1, 4, 6, 9].forEach((k) => (b[k] = sq('💙', 3)));
        expect(GRAFT_MAX).toBe(2);
        expect(graft(b, 5, '💙', 4, [4, 9]).sort((a, c) => a - c)).toEqual([4, 9]);
        expect(budStacks(b[4])).toBe(1);
        expect(budStacks(b[9])).toBe(1);
        expect(budStacks(b[1])).toBe(0);
        expect(graft(b, 5, '💙', 4, [0, 15])).toEqual([]); // 受け手でないマスは無視
    });

    it('風の落とし子: 候補は自陣の🌱を持てるコマ。同じコマへの重複付与も可', () => {
        const b = emptyBoard();
        b[0] = sq('💙', 3);
        b[1] = sq('💙', 3, '❄');
        b[2] = sq('💙', 3, '🔥');
        b[3] = sq('⭕', 3);
        b[4] = sq('💙', 3, '🌱');
        expect(sowCandidates(b, '💙')).toEqual([0, 4]);
        sow(b, [0, 0, 4]);
        expect(budStacks(b[0])).toBe(2);
        expect(budStacks(b[4])).toBe(2);
    });

    it('sim/thermal.js と一致', () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const sim = require('../../../sim/thermal.js');
        const mk = () => {
            const b = emptyBoard();
            b[5] = sq('💙', 3, '🌱', '🌱');
            b[1] = sq('💙', 3);
            b[4] = sq('💙', 3, '🌱');
            b[6] = sq('💙', 3, '❄', '🌱');
            b[9] = sq('💙', 3, '🔥', '🌱');
            b[10] = sq('⭕', 3, '🌱');
            return b;
        };
        const guarded = (x: SquareInfo) => x.player === '💙';
        for (const s of mk()) {
            expect(sim.canBud(s)).toBe(canBud(s));
            expect(sim.budStacks(s)).toBe(budStacks(s));
        }
        expect(sim.sowCandidates(mk(), '💙')).toEqual(sowCandidates(mk(), '💙'));
        expect(sim.budReceivers(mk(), 5, '💙', 4)).toEqual(budReceivers(mk(), 5, '💙', 4));
        const a = mk();
        const c = mk();
        expect(sim.graft(a, 5, '💙', 4)).toEqual(graft(c, 5, '💙', 4));
        expect(a).toEqual(c);
        expect(sim.GRAFT_MAX).toBe(GRAFT_MAX);
        const a2 = mk();
        const c2 = mk();
        expect(sim.graft(a2, 5, '💙', 4, [1])).toEqual(graft(c2, 5, '💙', 4, [1]));
        expect(a2).toEqual(c2);
        expect(sim.harvestBuds(a, '💙')).toBe(harvestBuds(c, '💙'));
        expect(a).toEqual(c);
        const d = mk();
        const e = mk();
        sim.sow(d, [0, 0, 5]);
        sow(e, [0, 0, 5]);
        expect(d).toEqual(e);
        for (const [fs, ft] of [[sim.freeze, freeze], [sim.ignite, ignite]] as const) {
            expect(fs).toBeDefined();
            expect(ft).toBeDefined();
        }
        const f = mk();
        const g = mk();
        sim.freeze(f, [5, 10]);
        freeze(g, [5, 10]);
        expect(f).toEqual(g);
        const h = mk();
        const i = mk();
        sim.ignite(h, [5, 10], 4, 1);
        ignite(i, [5, 10], 4, 1);
        expect(h).toEqual(i);
        const j = mk();
        const k = mk();
        sim.freezeAll(j);
        freezeAll(k);
        expect(j).toEqual(k);
    });
});

describe('氷結中のマスの他エフェクトは消えないが休眠する', () => {
    it('刈り入れ前夜は氷結中のマスの🌱に触れない', () => {
        const b = emptyBoard();
        b[0] = sq('💙', 3, '🌱', '❄');
        b[1] = sq('💙', 3, '🌱', '🌱');
        expect(harvestBuds(b, '💙')).toBe(2);
        expect(budStacks(b[0])).toBe(1);
    });

    it('⚡: 氷結中は雷霆の巫の無敵が働かず、軽減・過負荷にも数えない', () => {
        const cs = ['you', 'electrician'] as CharacterId[];
        expect(isShielded(sq('⭕', 3, '⚡'), cs)).toBe(true);
        expect(isShielded(sq('⭕', 3, '⚡', '❄'), cs)).toBe(false);
        const b = emptyBoard();
        b[0] = sq('⭕', 3, '⚡', '⚡');
        b[1] = sq('⭕', 3, '⚡', '❄');
        expect(boardChargeCount(b)).toBe(2);
        const full = emptyBoard().map(() => sq(undefined, 0, '⚡'));
        expect(isFullyCharged(full)).toBe(true);
        full[3] = sq(undefined, 0, '⚡', '❄');
        expect(isFullyCharged(full)).toBe(false);
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
        expect(b[6].bind).toBe(4);
        expect(flameStacks(b[6])).toBe(1);
        expect(thawed).toEqual([5]);
        expect(isFrozen(b[9])).toBe(true);
    });

    it('sim/thermal.js と一致', () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const sim = require('../../../sim/thermal.js');
        const mk = () => {
            const b = emptyBoard();
            b[5] = sq('⭕', 4, '🌱', '🌱', '❄', '❄');
            b[6] = sq('⭕', 4, '❄', '❄');
            b[9] = sq('💙', 4, '🌱');
            return b;
        };
        const a = mk();
        const c = mk();
        expect(sim.swidden(a, 5, 4)).toEqual(swidden(c, 5, 4));
        expect(a).toEqual(c);
        const d = mk();
        const e = mk();
        expect(sim.placeFlameToken(d, 10, '💙', 4, 4)).toEqual(placeFlameToken(e, 10, '💙', 4, 4));
        expect(d).toEqual(e);
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
        [1, 2, 3].forEach((k) => expect(flameStacks(b[k])).toBe(1));
        [4, 5, 6, 7].forEach((k) => expect(flameStacks(b[k])).toBe(0));
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

describe('氷結系の汎用スキル（範囲氷結・氷柱・ランダム氷結・氷結拡散・氷結トークン・砕氷・霜降り）', () => {
    it('lineCells: 行・列・斜め2方向（盤の端から端まで、昇順）', () => {
        expect(lineCells(4, 5, 'row')).toEqual([4, 5, 6, 7]);
        expect(lineCells(4, 5, 'col')).toEqual([1, 5, 9, 13]);
        expect(lineCells(4, 5, 'diag')).toEqual([0, 5, 10, 15]);
        expect(lineCells(4, 6, 'anti')).toEqual([3, 6, 9, 12]);
        expect(lineCells(4, 1, 'diag')).toEqual([1, 6, 11]);
    });

    it('範囲氷結・氷柱・氷結拡散: freeze が付けられるマスだけに付き、数は freeze の戻り値の長さ', () => {
        const b = emptyBoard();
        b[5] = sq('⭕', 3, '🔥');
        b[6] = sq('💙', 3, '🔑');
        b[4] = sq('💙', 3);
        const made = freeze(b, lineCells(4, 4, 'row')); // 4,5,6,7 のうち 🔥(5)と🔑(6)は除く
        expect(made).toEqual([4, 7]);
        expect(frozenStacks(b[4])).toBe(1);
        expect(isFrozen(b[7])).toBe(true); // 空きマスにも付く
    });

    it('ランダム氷結の候補は freeze できるマス（🔑・🔥は除く）', () => {
        const b = emptyBoard();
        b[0] = sq('💙', 3, '🔑');
        b[1] = sq('💙', 3, '🔥');
        b[2] = sq('💙', 3, '❄'); // 氷結済みにも重ねられる
        const c = randomFreezeCandidates(b);
        expect(c).not.toContain(0);
        expect(c).not.toContain(1);
        expect(c).toContain(2);
        expect(c).toHaveLength(14);
    });

    it('氷結トークン: ❄付きの自陣コマを置く（作られた❄は1）', () => {
        const b = emptyBoard();
        expect(placeFrostToken(b, 5, '💙', 4)).toBe(1);
        expect(b[5].player).toBe('💙');
        expect(b[5].bind).toBe(4);
        expect(frozenStacks(b[5])).toBe(1);
    });

    it('砕氷: ❄全部を砕き、1スタック3ダメージ。ライフ0以下なら破壊。氷結していない/空きマスは何もしない', () => {
        const b = emptyBoard();
        b[0] = sq('⭕', 10, '❄', '❄', '🔥'); // 6ダメージ → 4、🔥は消える
        b[1] = sq('⭕', 3, '❄'); // 3ダメージ → 破壊
        b[2] = sq('⭕', 5);
        b[3] = sq(undefined, 0, '❄');
        expect(shatter(b, 0)).toEqual({ stacks: 2, damage: 6, destroyed: false });
        expect(b[0].bind).toBe(4);
        expect(isFrozen(b[0])).toBe(false);
        expect(flameStacks(b[0])).toBe(0);
        expect(shatter(b, 1)).toEqual({ stacks: 1, damage: 3, destroyed: true });
        expect(b[1]).toEqual({ player: undefined, bind: 0, effects: [] });
        expect(shatter(b, 2)).toEqual({ stacks: 0, damage: 0, destroyed: false });
        expect(shatter(b, 3)).toEqual({ stacks: 0, damage: 0, destroyed: false });
        expect(b[3].effects).toHaveLength(1);
    });

    it('霜降り: 自陣のライフ2以下（0含む）で氷結を付けられるコマ。3以上・敵・🔑・🔥は対象外', () => {
        const b = emptyBoard();
        b[0] = sq('💙', 2);
        b[1] = sq('💙', 0);
        b[2] = sq('💙', 3);
        b[3] = sq('⭕', 1);
        b[4] = sq('💙', 1, '🔑');
        b[5] = sq('💙', 1, '🔥');
        b[6] = sq('💙', 1, '❄'); // 氷結済みにも重ねられる
        expect(frostfallTargets(b, '💙')).toEqual([0, 1, 6]);
    });

    it('sim/thermal.js と一致', () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const sim = require('../../../sim/thermal.js');
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const simGeo = require('../../../sim/geometry.js');
        for (const size of [4, 5, 7]) for (const dir of ['row', 'col', 'diag', 'anti'] as const) for (const cell of [0, size + 1, size * size - 1]) expect(simGeo.lineCells(size, cell, dir)).toEqual(lineCells(size, cell, dir));
        const mk = () => {
            const b = emptyBoard();
            b[0] = sq('⭕', 10, '❄', '❄', '🔥');
            b[1] = sq('⭕', 3, '❄');
            b[2] = sq('💙', 2);
            b[3] = sq('💙', 1, '🔑');
            b[4] = sq('💙', 0, '❄');
            return b;
        };
        expect(sim.randomFreezeCandidates(mk())).toEqual(randomFreezeCandidates(mk()));
        expect(sim.frostfallTargets(mk(), '💙')).toEqual(frostfallTargets(mk(), '💙'));
        for (const cell of [0, 1, 2, 4]) {
            const a = mk();
            const c = mk();
            expect(sim.shatter(a, cell)).toEqual(shatter(c, cell));
            expect(a).toEqual(c);
        }
        const d = mk();
        const e = mk();
        expect(sim.placeFrostToken(d, 9, '💙', 4)).toBe(placeFrostToken(e, 9, '💙', 4));
        expect(d).toEqual(e);
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
    it('対象のスキルキーが sim と一致する', () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const simThermal = require('../../../sim/thermal');
        expect(Array.from(simThermal.FLAME_SKILL_KEYS).sort()).toEqual(Array.from(FLAME_SKILL_KEYS).sort());
    });
});

describe('火炎の減衰とバーンアウト', () => {
    it('ターン進行（decayTick）で🔥が1スタック減り、継続ダメージは減る前のスタックで受ける', () => {
        const r = decayTick(sq('⭕', 9, '🔥', '🔥'), chars);
        expect(flameStacks(r)).toBe(1);
        expect(r.bind).toBe(9 - 1 - 4);
        expect(flameStacks(decayTick(r, chars))).toBe(0);
        expect(flameStacks(dropOneFlame(sq('⭕', 3)))).toBe(0);
    });
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
        // sim と同じ対象・結果
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const simT = require('../../../sim/thermal');
        const c = emptyBoard();
        c[1] = sq('⭕', 5, '🔥');
        c[4] = sq('🟩', 5, '🔥', '⚡');
        expect(simT.burnoutTargets(c, cs, ['💙', '⭕', '🟩'])).toEqual(burnoutTargets(c, cs));
    });
});
