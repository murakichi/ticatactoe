import { PlayerCharacters, chargeStacks, orthoNeighbors, fireCharges, connectedPieces, isShielded, isGuarded, shieldedCells, withCharge, addCharge, landCharge, boardChargeCount, reducedChargeCost, randomChargeCandidates, canJam, jammerTargets, applyJammer, isFullyCharged, applyOverload, releaseCharges, healCharged } from './charge';
import { skillCosts, CHARGE_MIN_COST } from './skillCosts';
import { geometryOf } from './boardGeometry';
import { SquareInfo } from '../../types/SquareInfo';
import { Player } from '../../types/Player';
import AIPlayer from './AIPlayer';

const emptyBoard = (size = 4): SquareInfo[] => Array.from({ length: size * size }, () => ({ player: undefined, bind: 0, effects: [] }));
const put = (b: SquareInfo[], i: number, player: Player, bind = 4, zap = false): void => {
    b[i] = { player, bind, effects: zap ? [{ effect: '⚡' }] : [] };
};
// 席ごとのキャラ（添字 = 席番号）。💙=席0, ⭕=席1, 🟩=席2
const chars: PlayerCharacters = ['you', 'electrician'];
/** 付与ダメージを受けない（全席が雷霆の巫）: 既存テストは⚡の数だけを見る */
const noLanding: PlayerCharacters = ['electrician', 'electrician'];
const chars3: PlayerCharacters = ['you', 'tactician', 'electrician'];

describe('帯電 ⚡ helpers', () => {
    it('orthoNeighbors は縦横のみ', () => {
        expect(orthoNeighbors(0, 4).sort((a, b) => a - b)).toEqual([1, 4]);
        expect(orthoNeighbors(5, 4).sort((a, b) => a - b)).toEqual([1, 4, 6, 9]);
    });

    it('fireCharges: 帯電マスの縦横隣のコマが1ダメージ、⚡は消え、斜め・ロックは対象外', () => {
        const b = emptyBoard();
        b[5] = { player: undefined, bind: 0, effects: [{ effect: '⚡' }] };
        put(b, 4, '💙', 5); // 着手したコマ (帯電マスの左隣)
        put(b, 6, '⭕', 4);
        put(b, 9, '⭕', 4);
        put(b, 10, '⭕', 4); // 斜め
        b[1] = { player: '⭕', bind: 4, effects: [{ effect: '🔑' }] };
        const r = fireCharges(b, 4, 4);
        expect(r.fired).toEqual([5]);
        expect([b[4].bind, b[6].bind, b[9].bind, b[10].bind, b[1].bind]).toEqual([4, 3, 3, 4, 4]);
        expect(chargeStacks(b[5])).toBe(0);
    });

    it('fireCharges: 伝導(ギア)を持つ側の帯電コマの毒・火炎を、ダメージを受けた敵のマスに1スタック移す(自分のコマには移さない)', () => {
        // 5=⭕の帯電コマ(☠+🔥+⚡)。4に💙が着手 → 5の隣の💙(4と6)がダメージ、⭕の1は自分のコマなので移らない
        const b = emptyBoard();
        b[5] = { player: '⭕', bind: 4, effects: [{ effect: '☠' }, { effect: '🔥' }, { effect: '⚡' }] };
        put(b, 4, '💙', 6);
        put(b, 6, '💙', 6);
        put(b, 1, '⭕', 6);
        const r = fireCharges(b, 4, 4, noLanding, [false, true]);
        expect(r.carried.sort()).toEqual([4, 6]);
        for (const k of [4, 6]) {
            expect(b[k].effects.filter((e) => e.effect === '☠')).toHaveLength(1);
            expect(b[k].effects.filter((e) => e.effect === '🔥')).toHaveLength(1);
        }
        expect(b[1].effects).toEqual([]);
    });

    it('fireCharges: 毒だけ・火炎だけなら、その1種類だけ移す。コマのない帯電マスからは移らない', () => {
        const b = emptyBoard();
        b[5] = { player: '⭕', bind: 4, effects: [{ effect: '☠' }, { effect: '⚡' }] };
        put(b, 4, '💙', 6);
        fireCharges(b, 4, 4, noLanding, [false, true]);
        expect(b[4].effects.map((e) => e.effect)).toEqual(['☠']);
        const c = emptyBoard();
        c[5] = { player: undefined, bind: 0, effects: [{ effect: '🔥' }, { effect: '⚡' }] };
        put(c, 4, '💙', 6);
        fireCharges(c, 4, 4, noLanding, [false, true]);
        expect(c[4].effects).toEqual([]);
        // 伝導(ギア)を持たない側の帯電コマからは移らない
        const d = emptyBoard();
        d[5] = { player: '⭕', bind: 4, effects: [{ effect: '☠' }, { effect: '⚡' }] };
        put(d, 4, '💙', 6);
        expect(fireCharges(d, 4, 4, noLanding).carried).toEqual([]);
        expect(d[4].effects).toEqual([]);
    });

    it('fireCharges: 連鎖しない / 帯電マスの隣でなければ何も起きない', () => {
        const b = emptyBoard();
        b[5] = { player: undefined, bind: 0, effects: [{ effect: '⚡' }] };
        put(b, 6, '⭕', 4, true);
        fireCharges(b, 4, 4);
        expect(chargeStacks(b[6])).toBe(1);
        expect(fireCharges(b, 15, 4).fired).toEqual([]);
    });

    it('isShielded: 雷霆の巫の⚡付き自陣だけ。isGuarded は🔑も含む', () => {
        const b = emptyBoard();
        put(b, 0, '⭕', 0, true);
        put(b, 1, '💙', 0, true);
        b[2] = { player: '💙', bind: 3, effects: [{ effect: '🔑' }] };
        expect(isShielded(b[0], chars)).toBe(true);
        expect(isShielded(b[1], chars)).toBe(false);
        expect(isGuarded(b[2], chars)).toBe(true);
    });

    it('connectedPieces: コマのあるマスだけを縦横に辿る', () => {
        const b = emptyBoard();
        [0, 1, 5, 10].forEach((i) => put(b, i, i === 1 ? '⭕' : '💙'));
        expect(connectedPieces(b, 0, 4).sort((a, c) => a - c)).toEqual([0, 1, 5]);
        expect(connectedPieces(b, 2, 4)).toEqual([]);
    });

    it('withCharge は元の盤面を変えない', () => {
        const b = emptyBoard();
        const n = withCharge(b, [3], noLanding);
        expect(chargeStacks(b[3])).toBe(0);
        expect(chargeStacks(n[3])).toBe(1);
    });
});

describe('帯電 ⚡ 5x5 / 3人', () => {
    it('orthoNeighbors は盤サイズに従う (5x5 の端と、4x4 なら隣接しないマス)', () => {
        expect(orthoNeighbors(4, 5).sort((a, b) => a - b)).toEqual([3, 9]); // 右端: 次の行の先頭とは隣接しない
        expect(orthoNeighbors(5, 5).sort((a, b) => a - b)).toEqual([0, 6, 10]); // 左端
        expect(orthoNeighbors(12, 5).sort((a, b) => a - b)).toEqual([7, 11, 13, 17]);
    });

    it('fireCharges: 5x5 でも着手マスの隣の帯電が縦横隣を削る', () => {
        const b = emptyBoard(5);
        b[12] = { player: undefined, bind: 0, effects: [{ effect: '⚡' }] };
        put(b, 11, '💙', 4); // 着手したコマ (帯電マスの左隣)
        put(b, 7, '⭕', 4);
        put(b, 17, '🟩', 4);
        put(b, 13, '⭕', 4);
        put(b, 6, '⭕', 4); // 斜め
        put(b, 5, '⭕', 4); // 4x4 の添字で隣と誤認しやすい位置
        const r = fireCharges(b, 11, 5);
        expect(r.fired).toEqual([12]);
        expect([b[11].bind, b[7].bind, b[17].bind, b[13].bind, b[6].bind, b[5].bind]).toEqual([3, 3, 3, 3, 4, 4]);
        expect(chargeStacks(b[12])).toBe(0);
    });

    it('fireCharges: 5x5 の右端の着手は次の行の先頭の帯電に反応しない', () => {
        const b = emptyBoard(5);
        b[5] = { player: undefined, bind: 0, effects: [{ effect: '⚡' }] };
        put(b, 0, '⭕', 4);
        expect(fireCharges(b, 4, 5).fired).toEqual([]);
        expect(chargeStacks(b[5])).toBe(1);
    });

    it('3人戦: 席ごとのキャラで無敵を判定する (雷霆の巫は席2の🟩)', () => {
        const b = emptyBoard(5);
        put(b, 0, '🟩', 0, true);
        put(b, 1, '⭕', 0, true);
        put(b, 2, '🟩', 3);
        expect(isShielded(b[0], chars3)).toBe(true);
        expect(isShielded(b[1], chars3)).toBe(false); // ⭕は軍師
        expect(isShielded(b[2], chars3)).toBe(false); // ⚡なし
        expect(shieldedCells(b, chars3)).toEqual([0]);
        expect(isGuarded(b[0], chars3)).toBe(true);
    });

    it('3人戦のAI: 無敵マスは (自分が雷霆の巫でなくても) 席のキャラ表から除外される', () => {
        const ai = new AIPlayer('💙', 'you', ['⭕', '🟩'], chars3);
        const b = emptyBoard(5);
        put(b, 3, '🟩', 0, true); // ライフ0でも奪えない
        ai.makeMove(b, 0, { onClickChargeSpread: 7, onClickChargeOne: 2 } as never, 0, 5, [], false);
        expect(ai.getValidMoves(b, 5)).not.toContain(3);
        expect(ai.getMovesFor(b, '⭕', 5)).not.toContain(3);
    });
});

describe('帯電 AI', () => {
    it('無敵マスは候補手から除外される', () => {
        const ai = new AIPlayer('💙', 'you', ['⭕'], ['you', 'electrician']);
        const b = emptyBoard();
        put(b, 3, '⭕', 0, true); // ライフ0でも奪えない
        ai.makeMove(b, 0, { onClickChargeSpread: 7, onClickChargeOne: 2 } as never, 0, 5, [], false);
        expect(ai.getValidMoves(b, 5)).not.toContain(3);
    });

    it('雷霆の巫は敵が密集していて魔力があれば帯電拡散を起点クリック付きで選ぶ', () => {
        const ai = new AIPlayer('⭕', 'electrician', ['💙'], ['you', 'electrician']);
        const b = emptyBoard();
        [0, 1, 2].forEach((i) => put(b, i, '⭕', 3));
        [4, 5].forEach((i) => put(b, i, '💙', 3));
        const costs = { onClickChargeSpread: 7, onClickChargeOne: 2, onClickChargeToken: 3 } as never;
        const r = ai.makeMove(b, 7, costs, 0, 5, [], false);
        expect(r.chargeClicks?.[0].skill).toBe('onClickChargeSpread');
    });
});

describe('帯電 ⚡ スキル2 (#40/#43)', () => {
    it('boardChargeCount はスタック込みの総数', () => {
        const b = emptyBoard();
        expect(boardChargeCount(b)).toBe(0);
        b[0] = { player: undefined, bind: 0, effects: [{ effect: '⚡' }, { effect: '⚡' }] };
        put(b, 1, '⭕', 3, true);
        expect(boardChargeCount(b)).toBe(3);
    });

    it('reducedChargeCost: ⚡の数だけ軽減し、下限は CHARGE_MIN_COST。キャラ補正は軽減後にかかる', () => {
        const b = emptyBoard();
        const id = (c: number) => c;
        expect(reducedChargeCost(skillCosts.onClickChargeSpread, b, id)).toBe(7);
        const withN = (n: number) => withCharge(b, Array.from({ length: n }, (_, k) => k), noLanding);
        expect(reducedChargeCost(skillCosts.onClickChargeSpread, withN(3), id)).toBe(4);
        expect(reducedChargeCost(skillCosts.onClickChargeOne, withN(1), id)).toBe(1);
        expect(reducedChargeCost(skillCosts.onClickChargeOne, withN(9), id)).toBe(CHARGE_MIN_COST);
        expect(reducedChargeCost(skillCosts.onClickChargeOne, withN(9), (c) => c + 2)).toBe(CHARGE_MIN_COST); // 軽減 → 補正の順
        expect(reducedChargeCost(skillCosts.onClickChargeOne, withN(1), (c) => c + 2)).toBe(3);
    });

    it('範囲帯電: 5x5 の中心なら 3x3 の9マス（空きマス含む）、角なら4マスに⚡が付く', () => {
        const geo = geometryOf(5);
        const b = emptyBoard(5);
        const mid = withCharge(b, geo.stompRange(12), noLanding);
        expect(mid.filter((sq) => chargeStacks(sq) === 1).length).toBe(9);
        expect([6, 7, 8, 11, 12, 13, 16, 17, 18].every((k) => chargeStacks(mid[k]) === 1)).toBe(true);
        const corner = withCharge(b, geo.stompRange(0), noLanding);
        expect(corner.filter((sq) => chargeStacks(sq) > 0).length).toBe(4);
    });

    it('ランダム帯電の候補: 空きマスは可、無敵マスと🔑ロックは除く', () => {
        const b = emptyBoard();
        put(b, 0, '⭕', 3, true); // 無敵
        b[1] = { player: '💙', bind: 6, effects: [{ effect: '🔑' }] };
        put(b, 2, '💙', 3, true); // 💙は無敵ではない（⚡があっても候補）
        const c = randomChargeCandidates(b, chars);
        expect(c).not.toContain(0);
        expect(c).not.toContain(1);
        expect(c).toContain(2);
        expect(c).toContain(3); // 空きマス
        expect(c.length).toBe(14);
    });

    it('canJam: ⚡のないマスは不可、他人の無敵マスは不可、自分の無敵マスは可', () => {
        const b = emptyBoard();
        put(b, 0, '⭕', 3, true); // ⭕=雷霆の巫の無敵マス
        put(b, 1, '💙', 3, true);
        put(b, 2, '💙', 3);
        expect(canJam(b, 2, '💙', chars)).toBe(false); // ⚡なし
        expect(canJam(b, 0, '💙', chars)).toBe(false); // 他人の無敵マス
        expect(canJam(b, 0, '⭕', chars)).toBe(true); // 自分の無敵マス
        expect(canJam(b, 1, '💙', chars)).toBe(true);
    });

    it('applyJammer: 隣接の敵コマだけが⚡のスタック数ぶん減り（最小0）、自コマ・🔑・斜め・空きは対象外、⚡は全部消える', () => {
        const b = emptyBoard();
        b[5] = { player: '⭕', bind: 5, effects: [{ effect: '⚡' }, { effect: '⚡' }] }; // 2スタック
        put(b, 1, '💙', 4); // 上: 敵
        put(b, 4, '💙', 1); // 左: 敵（ライフ1 → 0 で下限）
        put(b, 6, '⭕', 4); // 右: 自コマ
        b[9] = { player: '💙', bind: 4, effects: [{ effect: '🔑' }] }; // 下: ロック
        put(b, 10, '💙', 4); // 斜め
        put(b, 0, '💙', 0); // 斜め（ライフ0）
        const r = applyJammer(b, 5, 4, '⭕');
        expect(r.damaged.sort((a, c) => a - c)).toEqual([1, 4]);
        expect(r.zeroed).toEqual([4]);
        expect([b[1].bind, b[4].bind, b[6].bind, b[9].bind, b[10].bind]).toEqual([2, 0, 4, 4, 4]);
        expect(b[5].bind).toBe(5); // 中心のコマ自身は無傷
        expect(chargeStacks(b[5])).toBe(0);
    });

    it('applyJammer: ライフ0の敵コマは対象外、空き⚡マスでも撃てる。5x5の端で次の行に回り込まない', () => {
        const b = emptyBoard(5);
        b[4] = { player: undefined, bind: 0, effects: [{ effect: '⚡' }] };
        put(b, 3, '💙', 0);
        put(b, 5, '💙', 3); // 4x4 の隣接と誤認しやすい位置（右端の次の行の先頭）
        put(b, 9, '💙', 3);
        expect(jammerTargets(b, 4, 5, '⭕')).toEqual([9]);
        const r = applyJammer(b, 4, 5, '⭕');
        expect(r.damaged).toEqual([9]);
        expect([b[3].bind, b[5].bind, b[9].bind]).toEqual([0, 3, 2]);
        expect(chargeStacks(b[4])).toBe(0);
    });
});

describe('帯電 AI スキル2', () => {
    const costsAll = skillCosts as never;

    it('bestChargeAreaTarget: 敵が2以上多い3x3があれば中心を選び、少なければ null', () => {
        const ai = new AIPlayer('⭕', 'electrician', ['💙'], ['you', 'electrician']);
        const b = emptyBoard(5);
        [6, 7, 8].forEach((i) => put(b, i, '💙', 3));
        expect(ai.bestChargeAreaTarget(b)).not.toBeNull();
        const b2 = emptyBoard(5);
        put(b2, 6, '💙', 3);
        expect(ai.bestChargeAreaTarget(b2)).toBeNull();
    });

    it('bestJammerTarget: 隣接の敵2体をライフ0にできる⚡マスを選ぶ。1体だけ(与ダメージ1)なら撃たない', () => {
        const ai = new AIPlayer('⭕', 'electrician', ['💙'], ['you', 'electrician']);
        const b = emptyBoard();
        b[5] = { player: undefined, bind: 0, effects: [{ effect: '⚡' }] };
        put(b, 4, '💙', 1);
        put(b, 6, '💙', 1);
        expect(ai.bestJammerTarget(b)).toBe(5);
        put(b, 6, '💙', 3);
        expect(ai.bestJammerTarget(b)).toBe(5); // 2体に1ずつ(与ダメージ合計2)なら撃つ
        const b1 = emptyBoard();
        b1[5] = { player: undefined, bind: 0, effects: [{ effect: '⚡' }] };
        put(b1, 4, '💙', 3);
        expect(ai.bestJammerTarget(b1)).toBeNull();
    });

    it('bestJammerTarget: 敵のリーチ列の要をライフ0にできるなら1体でも撃つ。ロック中は狙えない', () => {
        const ai = new AIPlayer('⭕', 'electrician', ['💙'], ['you', 'electrician']);
        const b = emptyBoard();
        [0, 1, 2].forEach((i) => put(b, i, '💙', 4));
        put(b, 1, '💙', 1);
        b[5] = { player: undefined, bind: 0, effects: [{ effect: '⚡' }] }; // 1の下
        expect(ai.bestJammerTarget(b)).toBe(5);
        b[1] = { player: '💙', bind: 1, effects: [{ effect: '🔑' }] };
        expect(ai.bestJammerTarget(b)).toBeNull();
    });

    it('bestJammerTarget: 他人の無敵マスは選ばない（自分の無敵マスは選べる）', () => {
        const ai = new AIPlayer('💙', 'you', ['⭕'], ['you', 'electrician']);
        const b = emptyBoard();
        put(b, 5, '⭕', 3, true);
        put(b, 4, '⭕', 1);
        put(b, 6, '⭕', 1);
        ai.updateShield(b);
        expect(ai.bestJammerTarget(b)).toBeNull();
        const me = new AIPlayer('⭕', 'electrician', ['💙'], ['you', 'electrician']);
        const b2 = emptyBoard();
        put(b2, 5, '⭕', 3, true);
        put(b2, 4, '💙', 1);
        put(b2, 6, '💙', 1);
        me.updateShield(b2);
        expect(me.bestJammerTarget(b2)).toBe(5);
    });

    it('makeMove: 雷霆の巫は敵が密集していれば範囲帯電、⚡があればジャマーを chargeClicks に積む', () => {
        const ai = new AIPlayer('⭕', 'electrician', ['💙'], ['you', 'electrician']);
        const b = emptyBoard(5);
        [6, 8, 12].forEach((i) => put(b, i, '💙', 3));
        const r = ai.makeMove(b, 5, costsAll, 0, 5, [24], false);
        expect(r.chargeClicks?.map((c) => c.skill)).toContain('onClickChargeArea');

        const b2 = emptyBoard();
        b2[5] = { player: undefined, bind: 0, effects: [{ effect: '⚡' }] };
        put(b2, 4, '💙', 1);
        put(b2, 6, '💙', 1);
        const r2 = ai.makeMove(b2, 4, costsAll, 0, 5, [26], false);
        expect(r2.chargeClicks).toEqual([{ skill: 'onClickJammer', target: 5 }]);
    });

    it('chooseSkills: 帯電ダブルトークンを帯電トークンより優先し、ランダム帯電は他に撃つものがなく魔力に余裕があるときだけ', () => {
        const ai = new AIPlayer('⭕', 'electrician', ['💙'], ['you', 'electrician']);
        const b = emptyBoard();
        expect(ai.chooseSkills(b, 8, costsAll, 0, 5, [21, 23], false)).toEqual(['onClickDoubleChargeToken']);
        expect(ai.chooseSkills(b, 4, costsAll, 0, 5, [21, 23], false)).toEqual(['onClickChargeToken']);
        expect(ai.chooseSkills(b, 4, costsAll, 0, 5, [25], true)).toEqual(['onClickChargeRandom']);
        expect(ai.chooseSkills(b, 3, costsAll, 0, 5, [25], true)).toEqual([]); // コスト3ちょうどでは余裕が無いので撃たない
    });

    it('chooseLocks: 雷霆の巫は帯電ダブルトークン(23)もロックする', () => {
        const ai = new AIPlayer('⭕', 'electrician', ['💙'], ['you', 'electrician']);
        expect(ai.chooseLocks(emptyBoard(), 0, 5, [23])).toEqual([23]);
    });
});

describe('過負荷 ⚡ (overload)', () => {
    const full = (n = 25): SquareInfo[] =>
        Array.from({ length: n }, () => ({ bind: 3, player: undefined, effects: [{ effect: '⚡' as const }] }));

    test('空きマス含む全マス⚡なら全⚡・全🔑が消え、全マスのライフが0（ロックも解除）', () => {
        const board = full();
        board[0] = { bind: 5, player: '💙' as Player, effects: [{ effect: '⚡' }, { effect: '⚡' }, { effect: '🔑' }] };
        board[1] = { bind: 4, player: '⭕' as Player, effects: [{ effect: '⚡' }] };
        expect(isFullyCharged(board)).toBe(true);
        const next = applyOverload(board);
        expect(next).toHaveLength(25);
        for (const sq of next) {
            expect(sq.effects.some((e) => e.effect === '⚡')).toBe(false);
            expect(sq.effects.some((e) => e.effect === '🔑')).toBe(false);
            expect(sq.bind).toBe(0);
        }
        expect(next[0].player).toBe('💙');
        expect(next[1].player).toBe('⭕');
    });

    test('元の盤面は変更しない', () => {
        const board = full();
        applyOverload(board);
        expect(board[0].effects).toHaveLength(1);
        expect(board[0].bind).toBe(3);
    });

    test('1マスでも⚡がなければ何もしない', () => {
        const board = full();
        board[7] = { bind: 3, player: undefined, effects: [] };
        expect(isFullyCharged(board)).toBe(false);
        expect(applyOverload(board)).toBe(board);
    });

    test('他の効果(☠)は残る', () => {
        const board = full();
        board[2] = { bind: 2, player: '💙' as Player, effects: [{ effect: '⚡' }, { effect: '☠' }] };
        expect(applyOverload(board)[2].effects).toEqual([{ effect: '☠' }]);
    });
});

describe('雷霆の巫は自陣由来の発火ダメージを受けない', () => {
    it('⚡が載った自コマの発火では、隣の自コマは無傷で敵コマは1ダメージ。敵の⚡コマの発火は雷霆の巫のコマにも効く', () => {
        const chars = ['electrician', 'you'] as const; // 💙=雷霆の巫, ⭕=あなた
        const b = emptyBoard();
        put(b, 5, '💙', 3, true);   // 雷霆の巫の⚡コマ
        put(b, 6, '💙', 4);         // 隣の自コマ
        put(b, 9, '⭕', 4);         // 隣の敵コマ
        fireCharges(b, 4, 4, chars);
        expect(b[6].bind).toBe(4);
        expect(b[9].bind).toBe(3);

        const b2 = emptyBoard();
        put(b2, 5, '⭕', 3, true);  // 敵の⚡コマ
        put(b2, 6, '💙', 4);
        fireCharges(b2, 4, 4, chars);
        expect(b2[6].bind).toBe(3);
    });
});

describe('⚡が乗った時点のダメージ（雷霆の巫以外）', () => {
    const piece = (player: '💙' | '⭕', bind: number, ...effects: string[]) => ({ player, bind, effects: effects.map((effect) => ({ effect })) as any });
    it('雷霆の巫以外のコマは2ダメージ、雷霆の巫・空きマス・ライフ0・🔑・氷結中は受けない', () => {
        const cs: PlayerCharacters = ['you', 'electrician']; // 💙=あなた, ⭕=雷霆の巫
        expect(addCharge(piece('💙', 5), cs).bind).toBe(3);
        expect(addCharge(piece('⭕', 5), cs).bind).toBe(5);
        expect(addCharge(piece('💙', 1), cs).bind).toBe(0);
        expect(addCharge(piece('💙', 0), cs).bind).toBe(0);
        expect(addCharge(piece('💙', 5, '🔑'), cs).bind).toBe(5);
        expect(addCharge(piece('💙', 5, '❄'), cs).bind).toBe(5);
        expect(addCharge({ player: undefined, bind: 0, effects: [] }, cs).effects).toEqual([{ effect: '⚡' }]);
        expect(chargeStacks(addCharge(piece('💙', 5), cs))).toBe(1);
    });
    it('🔥は消えない。トークン用の landCharge も同じダメージ', () => {
        const hit = addCharge(piece('💙', 5, '🔥'), ['you', 'electrician']);
        expect(hit.effects.filter((e) => e.effect === '🔥')).toHaveLength(1);
        expect(landCharge(piece('💙', 4, '⚡'), ['you', 'electrician']).bind).toBe(2);
        expect(landCharge(piece('⭕', 4, '⚡'), ['you', 'electrician']).bind).toBe(4);
    });
});

describe('落雷は忘れた頃に (releaseCharges)', () => {
    it('自陣の⚡を全て取り除き、取り除いた数（スタック込み）だけ敵の全コマにダメージ。破壊はせずライフは0まで', () => {
        const b = emptyBoard();
        b[0] = { player: '💙', bind: 4, effects: [{ effect: '⚡' }, { effect: '⚡' }] };
        b[1] = { player: '💙', bind: 4, effects: [{ effect: '⚡' }] };
        put(b, 2, '💙', 4); // ⚡なしの自陣コマ
        put(b, 5, '⭕', 5);
        put(b, 6, '⭕', 2);
        put(b, 7, '🟩', 9);
        const r = releaseCharges(b, '💙', ['you', 'you', 'you']);
        expect(r.removed).toBe(3);
        expect(r.from).toEqual([0, 1]);
        expect(r.damaged).toEqual([5, 6, 7]);
        expect(b[0].effects).toEqual([]);
        expect(b[1].effects).toEqual([]);
        expect([b[5].bind, b[6].bind, b[7].bind]).toEqual([2, 0, 6]); // 2のコマは0で止まる（破壊はしない）
        expect(b[2].bind).toBe(4); // 自陣は無傷
        expect(b[6].player).toBe('⭕');
    });

    it('ライフ0・🔑ロック・氷結中・⚡で無敵のコマは受けない。自陣に⚡が無ければ何も起きない', () => {
        const b = emptyBoard();
        put(b, 0, '💙', 4, true);
        b[4] = { player: '⭕', bind: 0, effects: [] }; // ライフ0
        b[5] = { player: '⭕', bind: 5, effects: [{ effect: '🔑' }] }; // ロック
        b[6] = { player: '⭕', bind: 5, effects: [{ effect: '❄' }] }; // 氷結中
        b[7] = { player: '⭕', bind: 5, effects: [{ effect: '⚡' }] }; // 雷霆の巫の⚡マスは無敵
        b[8] = { player: '⭕', bind: 5, effects: [] };
        const r = releaseCharges(b, '💙', ['you', 'electrician']);
        expect(r.removed).toBe(1);
        expect(r.damaged).toEqual([8]);
        expect(b[8].bind).toBe(4);
        expect([b[5].bind, b[6].bind, b[7].bind]).toEqual([5, 5, 5]);
        const none = emptyBoard();
        put(none, 5, '⭕', 5);
        expect(releaseCharges(none, '💙', ['you', 'you'])).toEqual({ removed: 0, from: [], damaged: [] });
        expect(none[5].bind).toBe(5);
    });
});

describe('雷を食らわば皿まで(healCharged)', () => {
    const bolt = { effect: '⚡' as const };
    it('⚡が効いている自陣のコマのライフを、⚡のスタック1つにつき+2する。敵・⚡なし・氷結中(休眠)は対象外', () => {
        const board = emptyBoard();
        board[0] = { bind: 3, player: '💙', effects: [bolt] };
        board[1] = { bind: 1, player: '💙', effects: [bolt, bolt, bolt] };
        board[2] = { bind: 4, player: '💙', effects: [bolt, { effect: '❄' }] };
        board[3] = { bind: 4, player: '⭕', effects: [bolt] };
        board[4] = { bind: 5, player: '💙', effects: [] };
        board[5] = { bind: 0, player: '💙', effects: [bolt] };
        const r = healCharged(board, '💙');
        expect(r.healed).toEqual([0, 1, 5]);
        expect(r.total).toBe(2 + 6 + 2);
        expect([0, 1, 2, 3, 4, 5].map((i) => board[i].bind)).toEqual([5, 7, 4, 4, 5, 2]);
    });
    it('対象が無ければ何も変えない', () => {
        const board = emptyBoard();
        expect(healCharged(board, '💙')).toEqual({ healed: [], total: 0 });
    });
});
