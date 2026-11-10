import { pickEmptyCells, putToken, placeTokens, placeBothTokens, PutContext } from './tokenPlace';
import { TokenAfterOptions } from './tokenAfter';
import { SquareInfo } from '../../types/SquareInfo';
import { Gears } from './gear';

const emptyBoard = (): SquareInfo[] => Array.from({ length: 16 }, () => ({ player: undefined, bind: 0, effects: [] }));
const ctx: PutContext = { player: '💙', bind: 4, chars: ['you', 'you'], size: 4 };
const after = (gears: Gears = undefined, rng: () => number = () => 0.99): TokenAfterOptions => ({ player: '💙', turnSeat: 0, gears, chars: ['you', 'you'], chargeBuff: 0, rng });
const has = (sq: SquareInfo, e: string): boolean => sq.effects.some((x) => x.effect === e);

describe('pickEmptyCells', () => {
    it('空きが足りなければあるだけ選び、空きが無ければ pick を呼ばず []', () => {
        const b = emptyBoard();
        for (let i = 0; i < 15; i++) b[i] = { player: '⭕', bind: 3, effects: [] };
        const pick = jest.fn((cells: number[], n: number) => cells.slice(0, n));
        expect(pickEmptyCells(b, 2, pick)).toEqual([15]);
        expect(pick).toHaveBeenCalledWith([15], 1);
        b[15] = { player: '⭕', bind: 3, effects: [] };
        pick.mockClear();
        expect(pickEmptyCells(b, 2, pick)).toEqual([]);
        expect(pick).not.toHaveBeenCalled();
    });
});

describe('putToken（種類ごとのコマの組み立て）', () => {
    it('通常は何も付かず、🌱☠⚡は対応するエフェクトを返す（⚡は雷霆の巫以外なら乗った時点のダメージを受けない自陣でも⚡が付く）', () => {
        const b = emptyBoard();
        expect(putToken('plain', b, 0, ctx).effect).toBeUndefined();
        expect(b[0]).toEqual({ player: '💙', bind: 4, effects: [] });
        expect(putToken('buds', b, 1, ctx).effect).toBe('🌱');
        expect(has(b[1], '🌱')).toBe(true);
        expect(putToken('poison', b, 2, ctx).effect).toBe('☠');
        expect(has(b[2], '☠')).toBe(true);
        expect(putToken('charge', b, 3, ctx).effect).toBe('⚡');
        expect(has(b[3], '⚡')).toBe(true);
    });

    it('🔥は氷結を解いて thawed を返し、❄は作った❄の数を返し、🍂は枚数ぶん付き、式神は📜付き', () => {
        const b = emptyBoard();
        b[5] = { player: '⭕', bind: 3, effects: [{ effect: '❄' }] };
        const flame = putToken('flame', b, 4, ctx);
        expect(flame.thawed).toEqual([5]);
        expect(flame.effect).toBeUndefined();
        expect(putToken('frost', b, 8, ctx).frost).toBe(1);
        putToken('leaf', b, 9, { ...ctx, leaves: 2 });
        expect(b[9].effects.filter((e) => e.effect === '🍂')).toHaveLength(2);
        putToken('shikigami', b, 10, { ...ctx, shikigamiBind: 7 });
        expect(b[10].bind).toBe(7);
        expect(b[10].object).toBe('shikigami');
    });

    it('超助っ人は付けたエフェクトのうち 🌱☠⚡ だけをトークンのエフェクトとして返す', () => {
        const b = emptyBoard();
        expect(putToken('helper', b, 0, { ...ctx, helperEffect: '🌱' }).effect).toBe('🌱');
        expect(putToken('helper', b, 1, { ...ctx, helperEffect: '🔥' }).effect).toBeUndefined();
        expect(putToken('helper', b, 2, { ...ctx, helperEffect: '🍂' }).effect).toBeUndefined();
    });
});

describe('placeTokens / placeBothTokens', () => {
    it('置くたびに afterTokenPlaced を通し、収穫に渡す数を合計する（全トークン種で同じ流れ）', () => {
        const b = emptyBoard();
        const r = placeTokens(b, 'buds', [0, 1], ctx, after(['bindingLock'], () => 0));
        expect(r.placed.map((p) => p.idx)).toEqual([0, 1]);
        expect(r.placed.every((p) => p.after?.locked)).toBe(true);
        expect(r.granted).toBe(4); // 🌱1 + 道連れの鍵1 を2個ぶん
        expect(has(b[0], '🔑')).toBe(true);
    });

    it('火炎・氷結のトークンも道連れの鍵を受ける（以前は Game.tsx だけ通していなかった）', () => {
        const b = emptyBoard();
        placeTokens(b, 'flame', [0], ctx, after(['bindingLock'], () => 0));
        const frost = placeTokens(b, 'frost', [1], ctx, after(['bindingLock'], () => 0));
        expect(has(b[0], '🔑')).toBe(true);
        // 氷結中のマスにはロックが掛からないので🔑は付かないが、道連れの鍵は働いた扱い（収穫にも数える）
        expect(frost.placed[0].after?.locked).toBe(true);
        expect(has(b[1], '🔑')).toBe(false);
    });

    it('afterPut は afterTokenPlaced の前に呼ばれる', () => {
        const order: string[] = [];
        const b = emptyBoard();
        placeTokens(b, 'plain', [3], ctx, after(), (bd, idx) => order.push(`put${idx}:${bd[idx].player}`));
        expect(order).toEqual(['put3:💙']);
    });

    it('両トークン: 自分の席だけトークン扱いで、他の席は固定ライフ・afterTokenPlaced なし', () => {
        const b = emptyBoard();
        const r = placeBothTokens(b, [2, 6], ['💙', '⭕'], 0, 5, 4, after(['bindingLock'], () => 0));
        expect(b[2]).toMatchObject({ player: '💙', bind: 5 });
        expect(b[6]).toMatchObject({ player: '⭕', bind: 4 });
        expect(r.placed[0].after?.locked).toBe(true);
        expect(r.placed[1].after).toBeNull();
        expect(has(b[6], '🔑')).toBe(false);
        expect(r.granted).toBe(1);
    });
});
