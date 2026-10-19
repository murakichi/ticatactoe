import {
    isFrozen,
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
    glacierTargets,
    flareTargets,
    decayTick,
    frozenStacks,
    thawOne,
    lockable,
    canThawByClick,
    frozenLifeBonus,
    FLAME_BURN_DAMAGE,
} from './thermal';
import { fireCharges, applyJammer, chargeStacks, canJam } from './charge';
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

    it('毒のダメージは受ける', () => {
        expect(decayTick(sq('💙', 4, '❄', '☠', '☠'), chars).bind).toBe(2);
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

    it('氷結は重ねられるが、コマの無いマス・ロック中には付かない', () => {
        const b = emptyBoard();
        b[0] = sq('💙', 3);
        b[1] = sq('💙', 3, '🔑');
        expect(freeze(b, [0, 0, 1, 2])).toEqual([0, 0]); // 氷結済みでも重ねられる。ロック中・空きマスは付かない
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

    it('氷結が付くとバッズは消える。氷結中はロックできない', () => {
        const b = emptyBoard();
        b[0] = sq('💙', 3, '🌱', '🌱');
        freeze(b, [0]);
        expect(b[0].effects.map((e) => e.effect)).toEqual(['❄']);
        expect(lockable(b[0])).toBe(false);
        expect(lockable(sq('💙', 3, '🌱'))).toBe(true);
        // ロック中のコマには氷結が付かない
        const l = emptyBoard();
        l[0] = sq('💙', 3, '🔑');
        expect(freeze(l, [0])).toEqual([]);
    });

    it('氷室の番人の解除クリック: ライフが残る敵の氷結マスだけ', () => {
        expect(canThawByClick(sq('⭕', 3, '❄'), '💙')).toBe(true);
        expect(canThawByClick(sq('⭕', 0, '❄'), '💙')).toBe(false);
        expect(canThawByClick(sq('💙', 3, '❄'), '💙')).toBe(false);
        expect(canThawByClick(sq('⭕', 3), '💙')).toBe(false);
    });

    it('氷室の番人のライフ加算は自陣の氷結スタック総数×0.5', () => {
        const b = emptyBoard();
        b[0] = sq('💙', 3, '❄', '❄');
        b[1] = sq('💙', 3, '❄');
        b[2] = sq('⭕', 3, '❄', '❄', '❄');
        expect(frozenLifeBonus(b, '💙')).toBe(1.5);
        expect(frozenLifeBonus(b, '⭕')).toBe(1.5);
    });

    it('氷河期の対象は自陣のライフが残る未氷結のコマ', () => {
        const b = emptyBoard();
        b[0] = sq('💙', 3);
        b[1] = sq('💙', 0);
        b[2] = sq('💙', 2, '❄');
        b[3] = sq('⭕', 5);
        expect(glacierTargets(b, '💙')).toEqual([0]);
    });
});

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

    it('煉獄の鍛冶師の自陣の🔥は継続ダメージを与えない（相手の🔥コマは受ける）', () => {
        const cs: CharacterId[] = ['pyromancer', 'you'];
        expect(burnDamageOf(sq('💙', 5, '🔥'), cs)).toBe(0);
        expect(burnDamageOf(sq('⭕', 5, '🔥'), cs)).toBe(2);
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
        expect(flameStacks(decayTick(sq('⭕', 5, '🔥', '☠'), chars))).toBe(0); // 毒のダメージで消える
    });

    it('自然減衰だけでは🔥は消えない', () => {
        expect(flameStacks(decayTick(sq('⭕', 5, '🔥'), chars))).toBe(1);
    });

    it('電気の発火で🔥が消える', () => {
        const b = emptyBoard();
        b[5] = sq(undefined, 0, '⚡');
        b[6] = sq('⭕', 4, '🔥');
        fireCharges(b, 4, 4);
        expect(b[6].bind).toBe(3);
        expect(flameStacks(b[6])).toBe(0);
    });

    it('発火すると、そのマスと縦横隣の氷結が即座に解ける（斜めは解けない）', () => {
        const b = emptyBoard();
        b[5] = sq('⭕', 4, '❄');
        b[6] = sq('⭕', 4, '❄'); // 発火マス 5 の右隣
        b[9] = sq('⭕', 4, '❄'); // 下隣
        b[10] = sq('⭕', 4, '❄'); // 斜め
        b[0] = sq('⭕', 4, '❄'); // 斜め
        const r = ignite(b, [5], 4);
        expect(flameStacks(b[5])).toBe(1);
        expect(isFrozen(b[5])).toBe(false);
        expect(isFrozen(b[6])).toBe(false);
        expect(isFrozen(b[9])).toBe(false);
        expect(isFrozen(b[10])).toBe(true);
        expect(isFrozen(b[0])).toBe(true);
        expect(r.thawed.sort((a, c) => a - c)).toEqual([5, 6, 9]);
    });

    it('thaw は氷結が無ければ同じ参照を返す', () => {
        const s = sq('💙', 3);
        expect(thaw(s)).toBe(s);
    });

    it('フレアバーストの対象は中心と縦横隣の敵コマ（ライフ>0・ロックなし）', () => {
        const b = emptyBoard();
        b[5] = sq('⭕', 3);
        b[4] = sq('⭕', 3);
        b[6] = sq('💙', 3); // 自分
        b[9] = sq('⭕', 0); // ライフ0
        b[1] = sq('⭕', 3, '🔑'); // ロック
        b[10] = sq('⭕', 3); // 斜め
        expect(flareTargets(b, 5, 4, '💙').sort((a, c) => a - c)).toEqual([4, 5]);
    });
});

// sim/thermal.js（ヘッドレス版）との一致確認。様々なマスに同じ操作をして結果が同じことを見る
describe('sim/thermal.js との一致', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const sim = require('../../../sim/thermal.js');
    const kinds = ['skill', 'electric', 'poison'] as const;
    const combos: Effect['effect'][][] = [[], ['❄'], ['❄', '❄'], ['🌱', '❄'], ['🔥'], ['🔥', '🔥'], ['❄', '🔥'], ['🔑'], ['☠', '🔥'], ['⚡', '❄']];
    const squares = [0, 1, 3, 8].flatMap((bind) => combos.map((e) => sq('💙', bind, ...e)));

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
            expect(sim.canThawByClick(s, '⭕')).toBe(canThawByClick(s, '⭕'));
        }
    });

    it('burnDamageOf が一致（煉獄の鍛冶師の自陣含む）', () => {
        const cs: CharacterId[] = ['pyromancer', 'you'];
        for (const s of [...squares, ...squares.map((x) => ({ ...x, player: '⭕' as Player }))]) {
            expect(sim.burnDamageOf(s, cs, ['💙', '⭕'])).toBe(burnDamageOf(s, cs));
        }
    });

    it('ignite / freeze / glacierTargets / flareTargets が一致', () => {
        const mk = () => {
            const b = emptyBoard();
            b[5] = sq('💙', 4, '❄');
            b[6] = sq('⭕', 4, '❄');
            b[9] = sq('⭕', 3, '🔥');
            b[10] = sq('💙', 2);
            b[1] = sq('⭕', 5, '🔑');
            b[4] = sq('⭕', 0);
            return b;
        };
        const a = mk();
        const b = mk();
        expect(sim.ignite(a, [5, 10], 4)).toEqual(ignite(b, [5, 10], 4));
        expect(a).toEqual(b);
        const c = mk();
        const d = mk();
        expect(sim.freeze(c, [0, 4, 9, 10, 1])).toEqual(freeze(d, [0, 4, 9, 10, 1]));
        expect(c).toEqual(d);
        expect(sim.glacierTargets(mk(), '💙')).toEqual(glacierTargets(mk(), '💙'));
        for (let i = 0; i < 16; i++) expect(sim.flareTargets(mk(), i, 4, '💙')).toEqual(flareTargets(mk(), i, 4, '💙'));
    });
});
