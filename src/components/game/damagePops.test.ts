import { buildDamagePops, DamageHints } from './damagePops';
import { SquareInfo } from '../../types/SquareInfo';
import { Player } from '../../types/Player';

const blue = '💙' as Player;
const red = '⭕' as Player;
const empty = (): SquareInfo => ({ player: undefined, bind: 0, effects: [] });
const sq = (player: Player, bind: number): SquareInfo => ({ player, bind, effects: [] });
const board = (cells: Record<number, SquareInfo>, n = 16): SquareInfo[] => Array.from({ length: n }, (_, i) => cells[i] ?? empty());

describe('buildDamagePops: 受けたダメージの表示を作る', () => {
    it('ライフが減った分を、絵文字なしの -n で出す(攻撃・スキルなど)', () => {
        const items = buildDamagePops(board({ 3: sq(red, 8) }), board({ 3: sq(red, 5) }), new Map());
        expect(items).toEqual([{ cell: 3, lines: [{ amount: 3 }] }]);
    });

    it('効果による分(🔥☠⚡)は、積んだ内訳をそのまま絵文字付きで出す', () => {
        const hints: DamageHints = new Map([[3, [{ amount: 1 }, { icon: '🔥', amount: 2 }, { icon: '☠', amount: 1 }]]]);
        const items = buildDamagePops(board({ 3: sq(red, 9) }), board({ 3: sq(red, 5) }), hints);
        expect(items).toEqual([{ cell: 3, lines: [{ amount: 1 }, { icon: '🔥', amount: 2 }, { icon: '☠', amount: 1 }] }]);
    });

    it('内訳より多く減っていれば、その差を絵文字なしで足す(同じ手で攻撃も受けた)', () => {
        const hints: DamageHints = new Map([[3, [{ icon: '🔥', amount: 2 }]]]);
        const items = buildDamagePops(board({ 3: sq(red, 9) }), board({ 3: sq(red, 4) }), hints);
        expect(items[0].lines).toEqual([{ icon: '🔥', amount: 2 }, { amount: 3 }]);
    });

    it('内訳と同じだけしか減っていなければ、二重に数えない', () => {
        const hints: DamageHints = new Map([[3, [{ amount: 1 }]]]);
        const items = buildDamagePops(board({ 3: sq(red, 5) }), board({ 3: sq(red, 4) }), hints);
        expect(items[0].lines).toEqual([{ amount: 1 }]);
    });

    it('ライフが増えた(強化)・変わらないマスは出さない', () => {
        const items = buildDamagePops(board({ 3: sq(red, 2), 4: sq(blue, 5) }), board({ 3: sq(red, 6), 4: sq(blue, 5) }), new Map());
        expect(items).toEqual([]);
    });

    it('コマを奪われたマスは、ライフの差を数えない(持ち主が変わるため)', () => {
        const items = buildDamagePops(board({ 3: sq(red, 5) }), board({ 3: sq(blue, 1) }), new Map());
        expect(items).toEqual([]);
    });

    it('🔥でコマが壊れたマスは、壊れても受けたダメージの内訳は出す', () => {
        const hints: DamageHints = new Map([[3, [{ amount: 1 }, { icon: '🔥', amount: 2 }]]]);
        const items = buildDamagePops(board({ 3: sq(red, 3) }), board({}), hints);
        expect(items).toEqual([{ cell: 3, lines: [{ amount: 1 }, { icon: '🔥', amount: 2 }] }]);
    });

    it('量が0の内訳は出さない', () => {
        const hints: DamageHints = new Map([[3, [{ amount: 0 }, { icon: '☠', amount: 0 }]]]);
        expect(buildDamagePops(board({ 3: sq(red, 3) }), board({ 3: sq(red, 3) }), hints)).toEqual([]);
    });

    it('盤面の大きさが違う(新しい対戦に替わった)ときは何も出さない', () => {
        expect(buildDamagePops(board({ 3: sq(red, 5) }, 16), board({ 3: sq(red, 1) }, 25), new Map())).toEqual([]);
    });
});
