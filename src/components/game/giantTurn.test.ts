import { seatForTurn } from './giantTurn';

// 1手目は席0。以降は「直前に動いた席」を渡して次の席を求める
const seq = (chars: string[], count: number, actEvery = 2) => {
    const out = [0];
    for (let ct = 2; ct <= count; ct++) out.push(seatForTurn(ct, chars, out[out.length - 1], actEvery));
    return out;
};

describe('seatForTurn（巨人は2ターンに1回）', () => {
    it('2人戦: 巨人の席は相手が2回動くあいだに1回だけ動く', () => {
        expect(seq(['you', 'giant'], 6)).toEqual([0, 1, 0, 0, 1, 0]);
        expect(seq(['giant', 'you'], 6)).toEqual([0, 1, 1, 0, 1, 1]);
    });
    it('3人戦: 巨人を除いた周が挟まる', () => {
        expect(seq(['you', 'giant', 'you'], 10)).toEqual([0, 1, 2, 0, 2, 0, 1, 2, 0, 2]);
    });
    it('巨人は2周のうち1周だけ動く（動く回数）', () => {
        const s = seq(['you', 'giant', 'magician', 'tactician'], 70);
        const giantMoves = s.filter((x) => x === 1).length;
        const otherMoves = s.filter((x) => x === 0).length;
        expect(otherMoves).toBe(giantMoves * 2);
    });
    it('2人の同キャラ（巨人ミラー含む）は休みなし', () => {
        expect(seq(['giant', 'giant'], 4)).toEqual([0, 1, 0, 1]);
    });
    it('巨人がいない・actEvery が1なら席順どおり', () => {
        expect(seq(['you', 'magician', 'tactician'], 4)).toEqual([0, 1, 2, 0]);
        expect(seq(['you', 'giant'], 4, 1)).toEqual([0, 1, 0, 1]);
    });
    it('直前の席が並びとずれているときは席順どおり次の席', () => {
        expect(seatForTurn(14, ['you', 'giant', 'you'], 0)).toBe(1);
    });
});
