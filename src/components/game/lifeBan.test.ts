import { LIFE_BAN_MAX, LIFE_BAN_PLACING_KEYS, placedLifeOf, placeBlocked, moveBlocked, smallFryTargets, smallFry } from './lifeBan';
import { SquareInfo } from '../../types/SquareInfo';
import { CharacterId } from '../../types/Character';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const sim = require('../../../sim/lifeBan');

const sq = (player: SquareInfo['player'], bind: number, effects: SquareInfo['effects'] = []): SquareInfo => ({ player, bind, effects });
const chars: CharacterId[] = ['you', 'electrician'];

describe('一寸の虫に魂なし', () => {
    it('敵のライフ3以下のコマが対象。🔑ロック・無敵・自陣・ライフ4以上は対象外', () => {
        const board = [
            sq('⭕', 3), sq('⭕', 0), sq('⭕', 4), sq('💙', 1),
            sq('⭕', 2, [{ effect: '🔑' }]),
            sq('⭕', 2, [{ effect: '⚡' }]), // 席1は雷霆の巫 → ⚡で無敵
            sq(undefined, 0),
        ];
        expect(smallFryTargets(board, '💙', chars)).toEqual([0, 1]);
    });
    it('壊したマスは空きマスになり、氷結中のコマは❄が1つ減るだけで残る', () => {
        const board = [sq('⭕', 3), sq('⭕', 2, [{ effect: '❄' }, { effect: '❄' }]), sq('💙', 2)];
        const r = smallFry(board, '💙', chars);
        expect(r.destroyed).toEqual([0]);
        expect(r.blocked).toEqual([1]);
        expect(board[0]).toEqual({ player: undefined, bind: 0, effects: [] });
        expect(board[1].effects.filter((e) => e.effect === '❄')).toHaveLength(1);
        expect(board[2].player).toBe('💙');
    });
    it('縛り: 置くスキルは置くコマのライフが3以下のときだけ使えない。着手はライフ3以下で使えない', () => {
        expect(placeBlocked(true, 'onClickToken', 4)).toBe(false);
        expect(placeBlocked(true, 'onClickToken', 3)).toBe(true);
        expect(placeBlocked(false, 'onClickToken', 1)).toBe(false);
        expect(placeBlocked(true, 'onClickShikigamiRandom', 6)).toBe(true); // 式神はライフ2
        expect(placeBlocked(true, 'onClickShikigamiFlood', 6)).toBe(true); // 百鬼夜行はライフ0
        expect(placeBlocked(true, 'onClickStomp', 1)).toBe(false);
        expect(placeBlocked(true, undefined, 1)).toBe(false);
        expect(placedLifeOf('onClickShikigamiPlace', 6)).toBe(2);
        expect(moveBlocked(true, LIFE_BAN_MAX)).toBe(true);
        expect(moveBlocked(true, LIFE_BAN_MAX + 1)).toBe(false);
        expect(moveBlocked(false, 1)).toBe(false);
    });
    it('sim/lifeBan.js と一致する', () => {
        expect(sim.LIFE_BAN_MAX).toBe(LIFE_BAN_MAX);
        expect(Array.from(sim.LIFE_BAN_PLACING_KEYS).sort()).toEqual(Array.from(LIFE_BAN_PLACING_KEYS).sort());
        for (const key of [...Array.from(LIFE_BAN_PLACING_KEYS), 'onClickStomp']) {
            for (const bind of [0, 2, 3, 4, 6]) {
                expect(sim.placedLifeOf(key, bind)).toBe(placedLifeOf(key, bind));
                for (const banned of [true, false]) expect(sim.placeBlocked(banned, key, bind)).toBe(placeBlocked(banned, key, bind));
            }
        }
        for (const life of [1, 3, 4]) for (const banned of [true, false]) expect(sim.moveBlocked(banned, life)).toBe(moveBlocked(banned, life));
    });
});
