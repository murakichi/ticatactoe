import {
    isFrozen,
    flameStacks,
    thaw,
    overwriteBlocked,
    applyDamage,
    absorbDestroy,
    ignite,
    canFreeze,
    freeze,
    decayTick,
    budStacks,
    activeBuds,
    randomFreezeCandidates,
    placeFrostToken,
    frostfallTargets,
    shatter,
    harvestBuds,
    cleanse,
    ailmentStacks,
    AILMENTS,
    frozenStacks,
    lockable,
    emptyBlocked,
    reducedGlacierCost,
    freezeAll,
    detonate,
    GLACIER_BASE_COST,
} from './thermal';
import { lineCells } from './boardGeometry';
import { fireCharges, applyJammer, chargeStacks, canJam, isShielded, boardChargeCount, isFullyCharged } from './charge';
import { findEmptyIndexes } from '../../util';
import { CharacterId } from '../../types/Character';
import { emptyBoard, sq, chars } from './thermalTestUtils';

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

});
