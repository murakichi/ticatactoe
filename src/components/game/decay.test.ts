import { shouldDecay, DECAY_PER_ROUND_MIN_PLAYERS, decayBoard } from './decay';
import { SquareInfo } from '../../types/SquareInfo';
import { Player } from '../../types/Player';

describe('shouldDecay (issue #30)', () => {
    it('2人戦は従来どおり着手のたびに減衰する', () => {
        for (let p = 0; p < 10; p++) expect(shouldDecay(p, 2)).toBe(true);
    });

    it('3人以上は着手 N 回につき1回（最初の着手でその周の分を処理）', () => {
        for (const n of [3, 5, 8]) {
            const decays = Array.from({ length: 2 * n }, (_, p) => shouldDecay(p, n));
            expect(decays.filter(Boolean)).toHaveLength(2);
            expect(decays[0]).toBe(true);
            expect(decays[n]).toBe(true);
        }
    });

    it('境界は3人', () => {
        expect(DECAY_PER_ROUND_MIN_PLAYERS).toBe(3);
        expect(shouldDecay(1, DECAY_PER_ROUND_MIN_PLAYERS - 1)).toBe(true);
        expect(shouldDecay(1, DECAY_PER_ROUND_MIN_PLAYERS)).toBe(false);
    });
});

describe('満杯の盤面の追加減衰', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { isCrowded, crowdedDecay, canHitBound } = require('./decay');
    const sq = (player?: string, bind = 0, effects: { effect: string }[] = []) => ({ player, bind, effects });

    it('置ける空きマスが1つ以下で3人以上のときだけ満杯とみなす', () => {
        const cells = (n: number, empty: number) => Array.from({ length: n }, (_, i) => (i < empty ? sq() : sq('💙', 3)));
        expect(isCrowded(cells(36, 6), 3)).toBe(true); // 6x6 で空き6
        expect(isCrowded(cells(36, 7), 3)).toBe(false);
        expect(isCrowded(cells(36, 0), 2)).toBe(false);
        // 氷結で塞がれた空きマスは数えない
        const frozen = Array.from({ length: 36 }, (_, i) => (i < 20 ? sq(undefined, 0, [{ effect: '❄' }]) : sq('💙', 3)));
        expect(isCrowded(frozen, 3)).toBe(true);
    });

    it('追加減衰はライフの残ったコマを1減らす。氷結中・ライフ0は変えない', () => {
        expect(crowdedDecay(sq('💙', 3)).bind).toBe(2);
        expect(crowdedDecay(sq('💙', 0)).bind).toBe(0);
        expect(crowdedDecay(sq('💙', 3, [{ effect: '❄' }])).bind).toBe(3);
        expect(crowdedDecay(sq()).bind).toBe(0);
    });

    it('満杯の盤面では誰でもライフの残った敵コマを殴れる。そうでなければ巨人だけ', () => {
        const cells = (empty: number) => Array.from({ length: 36 }, (_, i) => (i < empty ? sq() : sq('💙', 3)));
        expect(canHitBound('magician', cells(6), 3)).toBe(true);
        expect(canHitBound('magician', cells(7), 3)).toBe(false);
        expect(canHitBound('giant', cells(7), 3)).toBe(true);
        expect(canHitBound('magician', cells(0), 2)).toBe(false); // 2人戦は対象外
    });
});

describe('decayBoard: コマが受けたダメージの内訳(表示用)', () => {
    const blue = '💙' as Player;
    const red = '⭕' as Player;
    const chars = ['you', 'you'] as const;
    const symbols = [blue, red];
    const board = (cells: Record<number, SquareInfo>, n = 16): SquareInfo[] =>
        Array.from({ length: n }, (_, i) => cells[i] ?? { player: undefined, bind: 0, effects: [] });
    const sq = (player: Player, bind: number, effects: SquareInfo['effects'] = []): SquareInfo => ({ player, bind, effects });

    it('自然減衰だけなら、natural=1(ライフは1減る)', () => {
        const b = board({ 5: sq(blue, 4) });
        const r = decayBoard(b, -1, chars, symbols);
        expect(r.damage).toEqual([{ cell: 5, natural: 1, burn: 0, poison: 0 }]);
        expect(b[5].bind).toBe(3);
    });

    it('🔥は burn に、☠は poison に分かれて出る(減った分の合計はライフの減少と一致)', () => {
        const b = board({ 5: sq(blue, 9, [{ effect: '🔥' }, { effect: '☠' }]) });
        const r = decayBoard(b, -1, chars, symbols);
        const d = r.damage[0];
        expect(d.cell).toBe(5);
        expect(d.natural).toBe(1);
        expect(d.burn).toBeGreaterThan(0);
        expect(d.burn).toBeGreaterThanOrEqual(1);
        expect(9 - b[5].bind).toBe(d.natural + d.burn + d.poison);
    });

    it('ライフが残り少ないと、実際に減った分だけを数える(0未満にはならない)', () => {
        const b = board({ 5: sq(blue, 1, [{ effect: '🔥' }, { effect: '🔥' }]) });
        const r = decayBoard(b, -1, chars, symbols);
        const d = r.damage[0];
        expect(d.natural + d.burn + d.poison).toBe(1);
    });

    it('空きマスやライフ0のコマは、ダメージに数えない', () => {
        const b = board({ 5: sq(blue, 0), 6: { player: undefined, bind: 3, effects: [{ effect: '🔑' }] } });
        const r = decayBoard(b, -1, chars, symbols);
        expect(r.damage).toEqual([]);
    });

    it('満杯の盤面は、自然減衰がもう1回かかる分も natural に含める', () => {
        const b = board({ 5: sq(blue, 4) });
        const r = decayBoard(b, -1, chars, symbols, true);
        expect(r.damage[0].natural).toBe(2);
        expect(b[5].bind).toBe(2);
    });
});
