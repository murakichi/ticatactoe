import { SquareInfo } from '../../types/SquareInfo';
import { Player } from '../../types/Player';
import { GRAVE_DISCOUNT_CAP, NIGHT_VEIL_SURCHARGE, POISON_WARD_LIFE, corpseCount, graveDiscountAmount, placeWardPiece, wardPiece, wardTriggered } from './graveSkills';
import { calculateCostOf, CostEnv } from './cost';
import { emptyDiscount, afterSkill, discountAmount, applyDiscount, isReducerSkill, GRAVE_DISCOUNT_KEY } from './discount';
import { advanceGearState, GearTurnState, RuinState } from './gearTurn';
import { skillCosts } from './skillCosts';

const board = (): SquareInfo[] => Array.from({ length: 16 }, () => ({ player: undefined, bind: 0, effects: [] }));
const symbols: Player[] = ['💙', '⭕'];

const costEnv = (over: Partial<CostEnv> = {}): CostEnv => ({
    board: board(), seat: 0, player: '💙', turnSeat: 0, characters: ['you', 'you'], yinYangMode: 'ying', gears: [],
    ctx: { skillsThisTurn: 0, echoReady: false }, leafBase: 0, kinds: new Set(), chargeBase: 0, shikiPlaced: false,
    tokenFree: false, bigCast: false, veil: false, oppSkillPrev: false, plantPrev: false, placedPrev: false, fireBase: 0, discount: emptyDiscount(), ...over,
});

const mkState = (): [GearTurnState, RuinState] => {
    const n = 2;
    const z = (v: number) => Array(n).fill(v);
    const f = () => Array(n).fill(false);
    return [
        {
            skills: z(0), echoReady: f(), echoNext: f(), kinds: [new Set(), new Set()], discount: [emptyDiscount(), emptyDiscount()], oppSkilled: f(), oppSkillPrev: f(),
            shikiPlaced: f(), fireBase: z(0), plantPrev: f(), plantBase: z(0), placedPrev: f(), placeBase: z(0), leafBase: z(0), darkPotUsed: f(), tokenFree: f(), bigCast: f(), chargeBase: z(0),
            veil: f(), veilNext: f(), ward: z(0), wardFresh: f(),
        },
        { active: f(), pending: f(), snap: null, snapBuds: null, snapFlames: null, ashActive: z(0), ashPending: z(0), lastMove: null },
    ];
};

describe('夜の帳（次の相手の手番のスキルコスト+3）', () => {
    it('効いている席の手番だけ、スキルのコストが+3される。自分（効いていない席）は変わらない', () => {
        expect(calculateCostOf(costEnv({ veil: true }), 4, false, false, 'onClickSlash')).toBe(4 + NIGHT_VEIL_SURCHARGE);
        expect(calculateCostOf(costEnv({ veil: false }), 4, false, false, 'onClickSlash')).toBe(4);
        // 手番でない席には掛からない（パネルで非手番側のコストを出すとき）
        expect(calculateCostOf(costEnv({ veil: true, seat: 1, player: '⭕', turnSeat: 0 }), 4, false, false, 'onClickSlash')).toBe(4);
    });
    it('手番が変わるとき、使われていれば次の席に効き、その席の手番が終わると切れる', () => {
        const [g, r] = mkState();
        g.veilNext[1] = true; // 席0が夜の帳を使った
        advanceGearState(g, r, { board: board(), symbols, gears: [[], []], endSeat: 0, nextSeat: 1 });
        expect(g.veil).toEqual([false, true]);
        expect(g.veilNext[1]).toBe(false);
        advanceGearState(g, r, { board: board(), symbols, gears: [[], []], endSeat: 1, nextSeat: 0 });
        expect(g.veil).toEqual([false, false]);
    });
    it('コストは skillCosts と catalog で3', () => {
        expect(skillCosts.onClickNightVeil).toBe(3);
    });
});

describe('弔い割引（死体の数だけ次のスキルを軽減）', () => {
    it('死体の数（基礎コスト-墓地コスト）。上限は GRAVE_DISCOUNT_CAP', () => {
        expect(corpseCount(10, 10)).toBe(0);
        expect(corpseCount(10, 7)).toBe(3);
        expect(corpseCount(10, 20)).toBe(0);
        expect(graveDiscountAmount(0)).toBe(0);
        expect(graveDiscountAmount(2)).toBe(2);
        expect(graveDiscountAmount(9)).toBe(GRAVE_DISCOUNT_CAP);
    });
    it('軽減札として扱う（自分自身は軽減されず、「次に打つスキル」の軽減を消費しない）', () => {
        expect(isReducerSkill(GRAVE_DISCOUNT_KEY)).toBe(true);
        const d = { ...emptyDiscount(), next: 3 };
        expect(afterSkill(d, GRAVE_DISCOUNT_KEY)).toEqual(d);
        expect(discountAmount(d, GRAVE_DISCOUNT_KEY, false)).toBe(0);
        expect(applyDiscount(8, discountAmount(d, 'onClickSlash', false))).toBe(5);
    });
});

describe('毒返しの構え（自陣が壊される/乗っ取られたら毒付きのコマを置く）', () => {
    it('手番開始時に自分のコマだったマスが、無くなる・他席に奪われると発動する。増える・変わらないだけなら発動しない', () => {
        const before: (Player | undefined)[] = ['💙', '💙', undefined, '⭕'];
        expect(wardTriggered(before, ['💙', undefined, undefined, '⭕'], '💙')).toBe(true); // 破壊
        expect(wardTriggered(before, ['💙', '⭕', undefined, '⭕'], '💙')).toBe(true); // 乗っ取り
        expect(wardTriggered(before, ['💙', '💙', '💙', '⭕'], '💙')).toBe(false);
        expect(wardTriggered(before, before, '💙')).toBe(false);
    });
    it('置くコマはライフ4・☠1つ。空きマス（氷結中を除く）から選ぶ。空きが無ければ置かない', () => {
        const piece = wardPiece('💙');
        expect(piece.bind).toBe(POISON_WARD_LIFE);
        expect(piece.effects).toEqual([{ effect: '☠' }]);
        const b = board();
        for (let i = 0; i < 15; i++) b[i] = { player: '⭕', bind: 2, effects: [] };
        expect(placeWardPiece(b, '💙', (cells) => cells[0])).toBe(15);
        expect(b[15].player).toBe('💙');
        expect(placeWardPiece(b, '💙', (cells) => cells[0])).toBe(-1);
        const frozen = board();
        frozen[0] = { player: undefined, bind: 0, effects: [{ effect: '❄' }] };
        for (let i = 1; i < 16; i++) frozen[i] = { player: '⭕', bind: 2, effects: [] };
        expect(placeWardPiece(frozen, '💙', (cells) => cells[0])).toBe(-1); // 氷結中の空きマスには置けない
    });
    it('相手の手番が終わるたびに1度発動の対象になり、3手番で切れる（使った手番の終わりでは減らない）', () => {
        const [g, r] = mkState();
        g.ward[0] = 3; g.wardFresh[0] = true; // 席0が使った手番
        const mine = board();
        mine[0] = { player: '💙', bind: 3, effects: [] };
        r.snap = mine.map((sq) => sq.player);
        // 席0の手番の終わり: 減らない・発動もしない
        let c = advanceGearState(g, r, { board: mine, symbols, gears: [[], []], endSeat: 0, nextSeat: 1 });
        expect(g.ward[0]).toBe(3);
        expect(g.wardFresh[0]).toBe(false);
        expect(c.wardPlace).toEqual([]);
        // 相手（席1）の手番で席0のコマが壊された → 席0に置く
        const broken = board();
        c = advanceGearState(g, r, { board: broken, symbols, gears: [[], []], endSeat: 1, nextSeat: 0 });
        expect(c.wardPlace).toEqual([0]);
        // 席0の手番の終わりごとに1減り、0で切れる
        c = advanceGearState(g, r, { board: board(), symbols, gears: [[], []], endSeat: 0, nextSeat: 1 });
        expect(g.ward[0]).toBe(2);
        advanceGearState(g, r, { board: board(), symbols, gears: [[], []], endSeat: 1, nextSeat: 0 });
        advanceGearState(g, r, { board: board(), symbols, gears: [[], []], endSeat: 0, nextSeat: 1 });
        expect(g.ward[0]).toBe(1);
        advanceGearState(g, r, { board: board(), symbols, gears: [[], []], endSeat: 1, nextSeat: 0 });
        advanceGearState(g, r, { board: board(), symbols, gears: [[], []], endSeat: 0, nextSeat: 1 });
        expect(g.ward[0]).toBe(0);
        // 切れたあとは発動しない
        const m2 = board();
        m2[0] = { player: '💙', bind: 3, effects: [] };
        r.snap = m2.map((sq) => sq.player);
        c = advanceGearState(g, r, { board: board(), symbols, gears: [[], []], endSeat: 1, nextSeat: 0 });
        expect(c.wardPlace).toEqual([]);
    });
});
