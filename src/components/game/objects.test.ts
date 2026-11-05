import { CharacterId } from '../../types/Character';
import { SquareInfo } from '../../types/SquareInfo';
import { calculateWinner, lineSymbols } from '../../util';
import { decayBoard } from './decay';
import { OBJECT_DEFS, OBJECT_PARAMS, activeObjectCells, newObject, objectLandable, objectLandableCells, objectLifeBonus, objectTurnStart, sweepBurntTrees } from './objects';
import { resolvePlacement } from './placement';
import { ignite } from './thermal';

const board = (): SquareInfo[] => Array.from({ length: 16 }, () => ({ player: undefined, bind: 0, effects: [] }));
const chars: CharacterId[] = ['you', 'you'];
const rngFirst = () => 0; // 常に先頭の候補を選ぶ

describe('オブジェクト: 設置とライフ', () => {
    it('空きマスにだけ置ける（コマ・オブジェクト・氷結・ロック中のマスは不可）', () => {
        const b = board();
        b[0] = { player: '💙', bind: 1, effects: [] };
        b[1] = newObject('💙', 'fort');
        b[2] = { player: undefined, bind: 0, effects: [{ effect: '❄' }] };
        b[3] = { player: undefined, bind: 2, effects: [{ effect: '🔑' }] };
        expect(objectLandable(b[0])).toBe(false);
        expect(objectLandable(b[1])).toBe(false);
        expect(objectLandable(b[2])).toBe(false);
        expect(objectLandable(b[3])).toBe(false);
        expect(objectLandableCells(b)).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    });

    it('種類ごとのライフで、持ち主のものとして置かれる', () => {
        expect(newObject('⭕', 'fort')).toEqual({ player: '⭕', bind: OBJECT_DEFS.fort.life, effects: [], object: 'fort' });
    });

    it('列に数えない: 4つ並んでも勝利にならない（通常のコマが3つ+オブジェクト）', () => {
        const b = board();
        for (const k of [0, 1, 2]) b[k] = { player: '💙', bind: 1, effects: [] };
        b[3] = newObject('💙', 'bigTree');
        expect(calculateWinner(lineSymbols(b))).toBeUndefined();
        b[3] = { player: '💙', bind: 1, effects: [] };
        expect(calculateWinner(lineSymbols(b))).toBe('💙');
    });

    it('時間経過でライフが減らない（通常のコマは減る）', () => {
        const b = board();
        b[0] = newObject('💙', 'fort');
        b[1] = { player: '💙', bind: 5, effects: [] };
        decayBoard(b, -1, chars, ['💙', '⭕'], true);
        expect(b[0].bind).toBe(OBJECT_DEFS.fort.life);
        expect(b[1].bind).toBeLessThan(5);
    });
});

describe('オブジェクト: 乗っ取り', () => {
    it('自陣のオブジェクトはいつでも通常のコマで乗っ取れる（オブジェクトは消えてライフ life のコマになる）', () => {
        const r = resolvePlacement(newObject('💙', 'fort'), '💙', 3);
        expect(r.square).toEqual({ player: '💙', bind: 3, effects: [] });
        expect(r.square.object).toBeUndefined();
        expect(r.reinforced).toBe(false);
        expect(r.corpse).toBe(false);
    });

    it('敵のオブジェクトはライフが0なら乗っ取れる。オブジェクトも効果も引き継がない', () => {
        const dead = { ...newObject('⭕', 'bigTree'), bind: 0 };
        const r = resolvePlacement(dead, '💙', 2);
        expect(r.square).toEqual({ player: '💙', bind: 2, effects: [] });
        expect(r.capturedFrom).toBe('⭕');
    });

    it('ライフが残る攻撃（巨人など）ではオブジェクトのまま残り、ライフだけ減る', () => {
        const r = resolvePlacement(newObject('⭕', 'fort'), '💙', 3);
        expect(r.square.object).toBe('fort');
        expect(r.square.player).toBe('⭕');
        expect(r.square.bind).toBeLessThan(OBJECT_DEFS.fort.life);
    });
});

describe('オブジェクト: 火炎', () => {
    it('大木・枯れた大木は🔥を付けられると即座に壊れる。砦などは壊れない', () => {
        const b = board();
        b[0] = newObject('💙', 'bigTree');
        b[1] = newObject('💙', 'deadTree');
        b[2] = newObject('💙', 'fort');
        ignite(b, [0, 1, 2], 4);
        expect(b[0]).toEqual({ player: undefined, bind: 0, effects: [] });
        expect(b[1]).toEqual({ player: undefined, bind: 0, effects: [] });
        expect(b[2].object).toBe('fort');
        expect(b[2].bind).toBe(OBJECT_DEFS.fort.life - 1); // 通常のコマと同じ1ダメージ
    });

    it('氷結中の大木は、🔥の代わりに氷結が解けるだけ', () => {
        const b = board();
        b[0] = { ...newObject('💙', 'bigTree'), effects: [{ effect: '❄' }] };
        ignite(b, [0], 4);
        expect(b[0].object).toBe('bigTree');
        expect(b[0].effects).toEqual([]);
    });

    it('sweepBurntTrees: 🔥の乗った大木だけを空きマスにする（氷結中は残す）', () => {
        const b = board();
        b[0] = { ...newObject('💙', 'bigTree'), effects: [{ effect: '🔥' }] };
        b[1] = { ...newObject('💙', 'deadTree'), effects: [{ effect: '🔥' }, { effect: '❄' }] };
        b[2] = { ...newObject('💙', 'fort'), effects: [{ effect: '🔥' }] };
        expect(sweepBurntTrees(b)).toEqual([0]);
        expect(b[0].player).toBeUndefined();
        expect(b[1].object).toBe('deadTree');
        expect(b[2].object).toBe('fort');
    });
});

describe('オブジェクト: 手番開始時の効果', () => {
    it('大木: 持ち主のものだけ、1本につきマジック+3。敵の大木・氷結中の大木は働かない', () => {
        const b = board();
        b[0] = newObject('💙', 'bigTree');
        b[1] = newObject('💙', 'bigTree');
        b[2] = newObject('⭕', 'bigTree');
        b[3] = { ...newObject('💙', 'bigTree'), effects: [{ effect: '❄' }] };
        expect(objectTurnStart(b, '💙', chars, rngFirst).magic).toBe(OBJECT_PARAMS.bigTreeMagic * 2);
        expect(objectTurnStart(b, '⭕', chars, rngFirst).magic).toBe(OBJECT_PARAMS.bigTreeMagic);
    });

    it('枯れた大木: 周囲八マスのコマのうちランダムな1つに🍂（空きマスと🔑ロックのコマには付けない）', () => {
        const b = board();
        b[5] = newObject('💙', 'deadTree');
        b[0] = { player: '⭕', bind: 3, effects: [{ effect: '🔑' }] };
        b[1] = { player: '⭕', bind: 3, effects: [] };
        b[10] = { player: '💙', bind: 3, effects: [] };
        b[15] = { player: '⭕', bind: 3, effects: [] }; // 周囲外
        const r = objectTurnStart(b, '💙', chars, rngFirst);
        expect(r.leaves).toEqual([1]); // 候補は 1 と 10。rng=0 で先頭
        expect(b[1].effects).toEqual([{ effect: '🍂' }]);
        expect(b[0].effects).toEqual([{ effect: '🔑' }]);
        expect(b[15].effects).toEqual([]);
    });

    it('枯れた大木: 周囲にコマが無ければ何も起きない', () => {
        const b = board();
        b[5] = newObject('💙', 'deadTree');
        expect(objectTurnStart(b, '💙', chars, rngFirst).leaves).toEqual([]);
    });

    it('雷雲: 周囲八マスのコマのランダムな1つに⚡（着地の1ダメージを受ける）', () => {
        const b = board();
        b[5] = newObject('💙', 'thundercloud');
        b[6] = { player: '⭕', bind: 3, effects: [] };
        const r = objectTurnStart(b, '💙', chars, rngFirst);
        expect(r.charged).toEqual([6]);
        expect(b[6].effects).toEqual([{ effect: '⚡' }]);
        expect(b[6].bind).toBeLessThan(3);
    });

    it('砦: 周囲八マスの自陣のコマのライフ+1（敵のコマ・周囲外は変わらない）', () => {
        const b = board();
        b[5] = newObject('💙', 'fort');
        b[0] = { player: '💙', bind: 2, effects: [] };
        b[1] = { player: '⭕', bind: 2, effects: [] };
        b[15] = { player: '💙', bind: 2, effects: [] };
        const r = objectTurnStart(b, '💙', chars, rngFirst);
        expect(r.fortified).toEqual([0]);
        expect(b[0].bind).toBe(3);
        expect(b[1].bind).toBe(2);
        expect(b[15].bind).toBe(2);
        expect(b[5].bind).toBe(OBJECT_DEFS.fort.life); // 砦自身は増えない
    });

    it('生命の泉: 持ち主の働いている泉1つにつきライフ期待値+2（objectTurnStart では盤面は変わらない）', () => {
        const b = board();
        b[0] = newObject('💙', 'spring');
        b[1] = newObject('💙', 'spring');
        b[2] = newObject('⭕', 'spring');
        expect(objectLifeBonus(b, '💙')).toBe(OBJECT_PARAMS.springLife * 2);
        expect(objectLifeBonus(b, '⭕')).toBe(OBJECT_PARAMS.springLife);
        expect(activeObjectCells(b, '💙', 'spring')).toEqual([0, 1]);
        const before = JSON.stringify(b);
        objectTurnStart(b, '💙', chars, rngFirst);
        expect(JSON.stringify(b)).toBe(before);
    });
});
