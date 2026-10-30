import { advanceGearState, GearTurnState, RuinState } from './gearTurn';
import { decayBoard } from './decay';
import { absorbDefeated, resolvePlacement } from './placement';
import { proliferateStep } from './proliferate';
import { emptyDiscount } from './discount';
import { SquareInfo } from '../../types/SquareInfo';
import { Player } from '../../types/Player';
import { CharacterId } from '../../types/Character';

const board = (): SquareInfo[] => Array.from({ length: 16 }, () => ({ player: undefined, bind: 0, effects: [] }));
const symbols: Player[] = ['💙', '⭕'];
const chars: CharacterId[] = ['you', 'you'];

describe('着手の結果 resolvePlacement / absorbDefeated', () => {
    it('空きマスは🔥を引き継ぎ、自分のコマは強化、敵のコマはライフの差で奪取/破壊/攻撃', () => {
        expect(resolvePlacement({ player: undefined, bind: 0, effects: [{ effect: '🔥' }, { effect: '🔑' }] }, '💙', 4).square).toEqual({ player: '💙', bind: 4, effects: [{ effect: '🔥' }] });
        const own = resolvePlacement({ player: '💙', bind: 3, effects: [] }, '💙', 4);
        expect([own.square.bind, own.reinforced]).toEqual([8, true]);
        const take = resolvePlacement({ player: '⭕', bind: 2, effects: [] }, '💙', 4);
        expect([take.square.player, take.square.bind, take.capturedFrom, take.corpse]).toEqual(['💙', 1, '⭕', true]);
        const kill = resolvePlacement({ player: '⭕', bind: 3, effects: [{ effect: '☠' }] }, '💙', 4); // 3-4+1=0
        expect([kill.square.player, kill.poisonSpread]).toEqual([undefined, true]);
        const hit = resolvePlacement({ player: '⭕', bind: 9, effects: [] }, '💙', 4);
        expect([hit.square.player, hit.square.bind, hit.corpse]).toEqual(['⭕', 6, false]);
    });
    it('式神は補強すると🌱付きの自陣コマ、乗っ取られると空きマス', () => {
        expect(resolvePlacement({ player: '💙', bind: 2, effects: [{ effect: '📜' }] }, '💙', 3).square.effects).toEqual([{ effect: '🌱' }]);
        const r = resolvePlacement({ player: '⭕', bind: 1, effects: [{ effect: '📜' }] }, '💙', 4);
        expect([r.square.player, r.capturedFrom]).toEqual([undefined, undefined]);
    });
    it('蘇生中の吸収: ライフ0の敵コマ（ロック中を除く）が自陣のライフ2のコマになる', () => {
        const b = board();
        b[0] = { player: '⭕', bind: 0, effects: [] };
        b[1] = { player: '⭕', bind: 0, effects: [{ effect: '🔑' }] };
        b[2] = { player: '⭕', bind: 3, effects: [] };
        expect(absorbDefeated(b, '💙')).toEqual([{ cell: 0, from: '⭕' }]);
        expect(b[0]).toEqual({ player: '💙', bind: 2, effects: [] });
        expect(b[1].player).toBe('⭕');
    });
});

describe('減衰 decayBoard', () => {
    it('ライフ-1、氷結中は減らない、ロックは期限で外れ、空蔵のロックは持ち主のコマになる、毒で0のコマは消える（着手マスを除く）', () => {
        const b = board();
        b[0] = { player: '⭕', bind: 3, effects: [] };
        b[1] = { player: '⭕', bind: 3, effects: [{ effect: '❄' }] };
        b[2] = { player: undefined, bind: 1, effects: [{ effect: '🔑', value: 1 }] };
        b[3] = { player: '⭕', bind: 0, effects: [{ effect: '☠' }] };
        b[4] = { player: '⭕', bind: 0, effects: [{ effect: '☠' }] };
        const r = decayBoard(b, 4, chars, symbols);
        expect(b[0].bind).toBe(2);
        expect(b[1].bind).toBe(3);
        expect(r.emptyLockSpawns).toEqual([2]);
        expect(b[2].player).toBe('💙');
        expect(r.spreadOrigins).toEqual([3]);
        expect(b[3].player).toBeUndefined();
        expect(b[4].player).toBe('⭕');
    });
});

describe('増殖 proliferateStep', () => {
    it('奇数回は空きマスにコマ、偶数回は自陣に🌱（毒使いは敵に☠）', () => {
        const b = board();
        b[0] = { player: '💙', bind: 3, effects: [] };
        const rng = () => 0;
        expect(proliferateStep(b, 1, '💙', 'you', chars, rng)).toEqual({ cell: 1, added: 'piece' });
        expect(b[1]).toEqual({ player: '💙', bind: 2, effects: [] });
        expect(proliferateStep(b, 2, '💙', 'you', chars, rng)).toEqual({ cell: 0, added: '🌱' });
        const e = board();
        e[5] = { player: '⭕', bind: 4, effects: [] };
        expect(proliferateStep(e, 2, '💙', 'poisoner', ['poisoner', 'you'], rng)).toEqual({ cell: 5, added: '☠' });
        expect(proliferateStep(board(), 2, '💙', 'you', chars, rng)).toBeNull();
    });
});

describe('ギアの手番状態 advanceGearState', () => {
    const mk = (): [GearTurnState, RuinState] => {
        const n = 2;
        return [
            { skills: [3, 2], echoReady: [false, false], echoNext: [false, true], kinds: [new Set(['a']), new Set(['b'])], discount: [emptyDiscount(), emptyDiscount()], oppSkilled: [false, true], plantPrev: [false, false], plantBase: [0, 0], placedPrev: [false, false], placeBase: [0, 0], oppSkillPrev: [false, false], shikiPlaced: [true, true], fireBase: [0, 0], leafBase: [0, 0], darkPotUsed: [true, true], tokenFree: [true, true], bigCast: [false, false], chargeBase: [0, 0] , veil: [false, false], veilNext: [false, false], ward: [0, 0], wardFresh: [false, false] },
            { active: [false, false], pending: [false, true], snap: null, snapBuds: null, snapFlames: null, ashActive: Array(n).fill(0), ashPending: Array(n).fill(0), lastMove: null },
        ];
    };
    it('火口: 終わる手番の間に盤面の🌱🍂が増えていれば次の席は plantPrev。増えていなければ立たない', () => {
        const [g, r] = mk();
        g.plantBase = [0, 0];
        const b = board();
        b[3] = { player: '⭕', bind: 3, effects: [{ effect: '🍂' }] };
        advanceGearState(g, r, { board: b, symbols, gears: [[], []], endSeat: 0, nextSeat: 1 });
        expect(g.plantPrev[1]).toBe(true);
        expect(g.plantBase[1]).toBe(1);
        advanceGearState(g, r, { board: b, symbols, gears: [[], []], endSeat: 1, nextSeat: 0 }); // 増えていない
        expect(g.plantPrev[0]).toBe(false);
    });
    it('飛び火: 終わる手番の間に自陣のコマが2つ以上増えていれば次の席は placedPrev。1つなら立たない', () => {
        const [g, r] = mk();
        g.placeBase = [0, 0];
        const b = board();
        b[0] = { player: '💙', bind: 3, effects: [] };
        b[1] = { player: '💙', bind: 3, effects: [] };
        advanceGearState(g, r, { board: b, symbols, gears: [[], []], endSeat: 0, nextSeat: 1 });
        expect(g.placedPrev[1]).toBe(true);
        expect(g.placeBase[1]).toBe(0);
        const c = board();
        c[2] = { player: '⭕', bind: 3, effects: [] };
        advanceGearState(g, r, { board: c, symbols, gears: [[], []], endSeat: 1, nextSeat: 0 }); // 1つだけ
        expect(g.placedPrev[0]).toBe(false);
    });
    it('次の席のスキル数・導線・無礼講がリセットされ、余韻と廃墟の底力が次の席に引き継がれる', () => {
        const [g, r] = mk();
        const c = advanceGearState(g, r, { board: board(), symbols, gears: [['afterglow'], ['ruinSurge']], endSeat: 0, nextSeat: 1 });
        expect(g.skills[1]).toBe(0);
        expect(g.kinds[1].size).toBe(0);
        expect(g.shikiPlaced[1]).toBe(false);
        expect(g.darkPotUsed[1]).toBe(false);
        expect(g.tokenFree).toEqual([false, false]);
        expect(g.oppSkillPrev[1]).toBe(true);
        expect(g.echoReady[1]).toBe(true);
        expect(c.echoNext).toBe(true);
        expect(r.active[1]).toBe(true);
        expect(c.ruinNext).toBe(true);
        expect(r.snap).not.toBeNull();
    });
    it('焦土: 敵の🌱が🔥で消えたぶん魔力。廃墟の底力: 自陣が破壊されたら次の手番から割引', () => {
        const [g, r] = mk();
        const b = board();
        b[0] = { player: '⭕', bind: 3, effects: [{ effect: '🌱' }] };
        b[1] = { player: '💙', bind: 3, effects: [] };
        r.snap = b.map((sq) => sq.player);
        r.snapBuds = [1, 0, ...Array(14).fill(0)];
        r.snapFlames = Array(16).fill(0);
        const after = b.map((sq) => ({ ...sq }));
        after[0] = { player: '⭕', bind: 3, effects: [{ effect: '🔥' }] }; // 🌱が🔥で消えた
        after[1] = { player: undefined, bind: 0, effects: [] }; // 自陣が壊れた
        const c = advanceGearState(g, r, { board: after, symbols, gears: [['scorchedEarth', 'ruinSurge'], []], endSeat: 1, nextSeat: 0 });
        expect(c.scorch[0]).toBeGreaterThan(0);
        expect(c.ruinTriggered).toEqual([0]);
        expect(r.active[0]).toBe(true);
    });
});

describe('トークン後のギア効果 tokenAfter', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { applyLockAt, propagate } = require('./tokenAfter');
    it('ロック: 氷結中は掛からない。空きマスには空蔵の持ち主を記録し、堅牢の鍵でライフが延びる', () => {
        const b = board();
        expect(applyLockAt(b, 0, ['emptyLock'], 1)).toBe(true);
        expect(b[0].effects).toEqual([{ effect: '🔑', value: 2 }]);
        expect(b[0].bind).toBe(6);
        b[1] = { player: undefined, bind: 0, effects: [{ effect: '❄' }] };
        expect(applyLockAt(b, 1, [], 0)).toBe(false);
        const c = board();
        applyLockAt(c, 0, ['ironLock'], 0);
        expect(c[0].bind).toBe(9);
    });
    it('伝播: 周囲のコマのうち種類に合うものへ同じエフェクト（バッズは自陣、毒は敵）', () => {
        const b = board();
        b[5] = { player: '💙', bind: 3, effects: [{ effect: '🌱' }] };
        b[6] = { player: '⭕', bind: 3, effects: [] };
        b[9] = { player: '💙', bind: 3, effects: [] };
        expect(propagate(b, 5, '🌱', '💙', chars, () => 0)).toBe(9);
        expect(b[9].effects).toEqual([{ effect: '🌱' }]);
        expect(propagate(b, 5, '☠', '💙', chars, () => 0)).toBe(6);
        expect(propagate(board(), 5, '☠', '💙', chars, () => 0)).toBeNull();
    });
});
