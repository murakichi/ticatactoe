import { BIG_CAST_BASE, SECOND_CATCH_MAX_BASE, HELPER_EFFECTS, pickHelperEffect, placeHelperToken, perfectGame } from './bigSkills';
import { SquareInfo } from '../../types/SquareInfo';
import { CharacterId } from '../../types/Character';
import { noteSkillUsed, GearTurnState } from './gearTurn';
import { emptyDiscount } from './discount';

const sq = (player: SquareInfo['player'], bind: number, effects: SquareInfo['effects'] = []): SquareInfo => ({ player, bind, effects });
const empty = (n: number): SquareInfo[] => Array.from({ length: n }, () => sq(undefined, 0));
const chars: CharacterId[] = ['you', 'electrician'];

describe('パーフェクトゲーム', () => {
    it('敵味方とも全てのコマを破壊する。🔑ロック・⚡無敵は壊れず、氷結中は❄が1つ減るだけ', () => {
        const board = [
            sq('💙', 3), sq('⭕', 9), sq(undefined, 0),
            sq('⭕', 5, [{ effect: '🔑' }]),
            sq('⭕', 5, [{ effect: '⚡' }]), // 席1は雷霆の巫 → 無敵
            sq('💙', 4, [{ effect: '❄' }, { effect: '❄' }]),
        ];
        const r = perfectGame(board, chars);
        expect(r.destroyed).toEqual([0, 1]);
        expect(r.blocked).toEqual([5]);
        expect(board[0].player).toBeUndefined();
        expect(board[1].player).toBeUndefined();
        expect(board[3].player).toBe('⭕');
        expect(board[4].player).toBe('⭕');
        expect(board[5].effects.filter((e) => e.effect === '❄')).toHaveLength(1);
    });
    it('空の盤面では何も壊さない', () => {
        expect(perfectGame(empty(4), chars)).toEqual({ destroyed: [], blocked: [] });
    });
});

describe('超助っ人', () => {
    it('エフェクトは6種から1つ。乱数1回で選ぶ', () => {
        expect(HELPER_EFFECTS).toEqual(['🔥', '❄', '⚡', '☠', '🌱', '🍂']);
        expect(pickHelperEffect(() => 0)).toBe('🔥');
        expect(pickHelperEffect(() => 0.99)).toBe('🍂');
        expect(HELPER_EFFECTS.map((_, i) => pickHelperEffect(() => (i + 0.5) / 6))).toEqual([...HELPER_EFFECTS]);
    });
    it('🌱❄🍂はその1つが付いたコマが置かれる', () => {
        for (const e of ['🌱', '❄', '🍂'] as const) {
            const board = empty(4);
            placeHelperToken(board, 1, '💙', 4, e, ['you', 'you'], 2);
            expect(board[1]).toEqual({ player: '💙', bind: 4, effects: [{ effect: e }] });
        }
    });
    it('☠は毒使いのとき、ライフが1.5倍になる', () => {
        const board = empty(4);
        placeHelperToken(board, 0, '💙', 4, '☠', ['poisoner', 'you'], 2);
        expect(board[0].bind).toBe(6);
        const other = empty(4);
        placeHelperToken(other, 0, '💙', 4, '☠', ['you', 'you'], 2);
        expect(other[0].bind).toBe(4);
    });
    it('⚡は雷霆の巫以外だと乗った時点で2ダメージ', () => {
        const a = empty(4);
        placeHelperToken(a, 0, '💙', 4, '⚡', ['you', 'you'], 2);
        expect(a[0].bind).toBe(2);
        const b = empty(4);
        placeHelperToken(b, 0, '💙', 4, '⚡', ['electrician', 'you'], 2);
        expect(b[0].bind).toBe(4);
    });
    it('🔥は付いた瞬間の1ダメージと、縦横隣の氷結の解除', () => {
        const board = empty(4);
        board[1] = sq('⭕', 3, [{ effect: '❄' }]);
        const r = placeHelperToken(board, 0, '💙', 4, '🔥', ['you', 'you'], 2);
        expect(board[0].effects).toEqual([{ effect: '🔥' }]);
        expect(board[0].bind).toBe(3);
        expect(r.thawed).toEqual([1]);
        expect(board[1].effects).toEqual([]);
    });
});

describe('柳の下に二匹目がいた', () => {
    it('定数: 無料条件はベースコスト7以上、発動するのは5以下', () => {
        expect(BIG_CAST_BASE).toBe(7);
        expect(SECOND_CATCH_MAX_BASE).toBe(5);
    });
    it('基礎コスト7以上のスキルを使うと bigCast が立つ。6以下では立たない', () => {
        const f = () => Array(2).fill(false);
        const g = {
            skills: [0, 0], echoReady: f(), echoNext: f(), kinds: [new Set<string>(), new Set<string>()], discount: [emptyDiscount(), emptyDiscount()],
            oppSkilled: f(), oppSkillPrev: f(), shikiPlaced: f(), fireBase: [0, 0], plantPrev: f(), plantBase: [0, 0], placedPrev: f(), placeBase: [0, 0],
            leafBase: [0, 0], darkPotUsed: f(), tokenFree: f(), bigCast: f(), chargeBase: [0, 0], veil: f(), veilNext: f(), ward: [0, 0], wardFresh: f(),
            infernoReady: f(),
        } as GearTurnState & { infernoReady: boolean[] };
        noteSkillUsed(g, 0, 'onClickStomp'); // 基礎3
        noteSkillUsed(g, 0, 'onClickPoisonWard'); // 基礎6
        expect(g.bigCast[0]).toBe(false);
        noteSkillUsed(g, 0, 'onClickPerfectGame'); // 基礎10
        expect(g.bigCast[0]).toBe(true);
        expect(g.bigCast[1]).toBe(false);
    });
});
