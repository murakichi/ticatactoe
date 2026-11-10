import { SquareInfo } from '../../types/SquareInfo';
import { CharacterId } from '../../types/Character';
import { awakenPlan, applyAwaken, enclosedCells, roar, roarVictims, dragonLifeBonus, dragonMagicBonus, MIKO_LIFE_MEAN } from './dragon';
import { OBJECT_LIFE } from './objects';

const E = (): SquareInfo => ({ player: undefined, bind: 0, effects: [] });
const mk = (size: number): SquareInfo[] => Array.from({ length: size * size }, E);
const at = (size: number, r: number, c: number): number => r * size + c;
const build = (b: SquareInfo[], i: number, p: '💙' | '⭕' = '💙'): void => { b[i] = { player: p, bind: OBJECT_LIFE, effects: [], object: 'fort' }; };
const piece = (b: SquareInfo[], i: number, p: '💙' | '⭕', bind = 3): void => { b[i] = { player: p, bind, effects: [] }; };
const chars: CharacterId[] = ['dragonMiko', 'you'];

describe('龍神の巫女（#527）', () => {
    it('壁が無ければ囲まれた範囲は無い', () => {
        expect(enclosedCells(mk(5), '💙')).toEqual([]);
    });

    it('4つで盤の角を斜めに切ると角側の6マスが囲まれる', () => {
        const b = mk(5);
        [at(5, 0, 3), at(5, 1, 2), at(5, 2, 1), at(5, 3, 0)].forEach((i) => build(b, i));
        expect(enclosedCells(b, '💙').sort((a, c) => a - c)).toEqual([at(5, 0, 0), at(5, 0, 1), at(5, 0, 2), at(5, 1, 0), at(5, 1, 1), at(5, 2, 0)].sort((a, c) => a - c));
        const plan = awakenPlan(b, '💙');
        expect(plan?.n).toBe(10); // 囲まれた6 + 建造物4
    });

    it('菱形に囲むと中心の1マス', () => {
        const b = mk(5);
        [at(5, 1, 2), at(5, 3, 2), at(5, 2, 1), at(5, 2, 3)].forEach((i) => build(b, i));
        expect(enclosedCells(b, '💙')).toEqual([at(5, 2, 2)]);
    });

    it('敵の建造物は壁にならない', () => {
        const b = mk(5);
        [at(5, 1, 2), at(5, 3, 2), at(5, 2, 1), at(5, 2, 3)].forEach((i) => build(b, i, '⭕'));
        expect(enclosedCells(b, '💙')).toEqual([]);
    });

    it('建造物が3つ以下なら覚醒しない', () => {
        const b = mk(5);
        [0, 1, 2].forEach((i) => build(b, i));
        expect(awakenPlan(b, '💙')).toBeNull();
    });

    it('覚醒で囲んだ範囲の敵コマ（ロック付きでも）と自陣の建造物が消える', () => {
        const b = mk(5);
        [at(5, 0, 3), at(5, 1, 2), at(5, 2, 1), at(5, 3, 0)].forEach((i) => build(b, i));
        piece(b, at(5, 0, 0), '⭕');
        b[at(5, 1, 1)] = { player: '⭕', bind: 9, effects: [{ effect: '🔑', value: 5 }] };
        piece(b, at(5, 4, 4), '⭕');
        const n = applyAwaken(b, awakenPlan(b, '💙')!);
        expect(n).toBe(10);
        expect(b[at(5, 0, 0)].player).toBeUndefined();
        expect(b[at(5, 1, 1)].player).toBeUndefined();
        expect(b[at(5, 0, 3)].object).toBeUndefined();
        expect(b[at(5, 4, 4)].player).toBe('⭕');
    });

    it('龍のライフ・魔力の加算', () => {
        expect(dragonLifeBonus({ form: 'miko', n: 0 })).toBe(0);
        // 巫女3 → 龍は 5+N+4
        expect(MIKO_LIFE_MEAN + dragonLifeBonus({ form: 'dragon', n: 6 })).toBe(5 + 6 + 4);
        expect(dragonMagicBonus({ form: 'dragon', n: 6 })).toBe(6);
        expect(dragonMagicBonus({ form: 'miko', n: 6 })).toBe(0);
    });

    it('咆哮: 自陣のオブジェクトの周囲8マスの敵コマを破壊し、そのあと自陣のオブジェクト全てに⚡', () => {
        const b = mk(5);
        build(b, at(5, 2, 2));
        build(b, at(5, 0, 0));
        piece(b, at(5, 1, 1), '⭕');
        piece(b, at(5, 2, 3), '⭕');
        piece(b, at(5, 4, 4), '⭕'); // 範囲外
        piece(b, at(5, 3, 3), '💙'); // 自陣は壊さない
        expect(roarVictims(b, '💙')).toEqual([at(5, 1, 1), at(5, 2, 3)]);
        const r = roar(b, '💙', chars);
        expect(r.destroyed).toBe(2);
        expect(b[at(5, 1, 1)].player).toBeUndefined();
        expect(b[at(5, 4, 4)].player).toBe('⭕');
        expect(b[at(5, 3, 3)].player).toBe('💙');
        expect(r.charged.sort((a, c) => a - c)).toEqual([at(5, 0, 0), at(5, 2, 2)]);
        // ⚡の着地ダメージは例外なくオブジェクトにも入る（ライフ5 → 3）
        expect(b[at(5, 2, 2)].bind).toBe(OBJECT_LIFE - 2);
        expect(b[at(5, 2, 2)].effects.some((e) => e.effect === '⚡')).toBe(true);
    });

    it('氷結中の敵コマは壊れず❄が1つ減るだけ', () => {
        const b = mk(5);
        build(b, at(5, 2, 2));
        b[at(5, 2, 3)] = { player: '⭕', bind: 3, effects: [{ effect: '❄' }] };
        const r = roar(b, '💙', chars);
        expect(r.blocked).toEqual([at(5, 2, 3)]);
        expect(r.destroyed).toBe(0);
        expect(b[at(5, 2, 3)].player).toBe('⭕');
    });
});
