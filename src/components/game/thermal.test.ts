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

    it('氷結は重ならず、コマの無いマス・ロック中には付かない', () => {
        const b = emptyBoard();
        b[0] = sq('💙', 3);
        b[1] = sq('💙', 3, '🔑');
        expect(freeze(b, [0, 0, 1, 2])).toEqual([0]);
        expect(b[0].effects.filter((e) => e.effect === '❄')).toHaveLength(1);
        expect(canFreeze(b[0])).toBe(false);
    });

    it('自陣への上書き（強化）は氷結師以外できない', () => {
        expect(overwriteBlocked(sq('💙', 3, '❄'), 'you')).toBe(true);
        expect(overwriteBlocked(sq('💙', 3, '❄'), 'cryomancer')).toBe(false);
        expect(overwriteBlocked(sq('💙', 3), 'you')).toBe(false);
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

    it('炎使いの自陣の🔥は継続ダメージを与えない（相手の🔥コマは受ける）', () => {
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
