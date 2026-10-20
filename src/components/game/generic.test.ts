import { boostAll, isPlaceable, canRelocate, relocate, cloneLife, cloneTargets, cloneInto, plunderTargets, plunder, PLUNDER_LIFE } from './generic';
import { SquareInfo } from '../../types/SquareInfo';
import { Effect } from '../../types/Effect';
import { Player } from '../../types/Player';
import { CharacterId } from '../../types/Character';

const emptyBoard = (size = 4): SquareInfo[] => Array.from({ length: size * size }, () => ({ player: undefined, bind: 0, effects: [] }));
const sq = (player: Player | undefined, bind: number, ...effects: Effect['effect'][]): SquareInfo => ({ player, bind, effects: effects.map((effect) => ({ effect })) });

describe('汎用スキル（慈雨・縮地・写し身・追い剥ぎ）', () => {
    it('慈雨: 自陣の全コマのライフ+1（ライフ0も）。敵・空きマスは触らない', () => {
        const b = emptyBoard();
        b[0] = sq('💙', 3);
        b[1] = sq('💙', 0);
        b[2] = sq('⭕', 3);
        expect(boostAll(b, '💙')).toEqual([0, 1]);
        expect([b[0].bind, b[1].bind, b[2].bind, b[3].bind]).toEqual([4, 1, 3, 0]);
    });

    it('置ける空きマス: コマ・🔑・氷結中の空きマスは不可', () => {
        expect(isPlaceable(sq(undefined, 0))).toBe(true);
        expect(isPlaceable(sq(undefined, 0, '🔑'))).toBe(false);
        expect(isPlaceable(sq(undefined, 0, '❄'))).toBe(false);
        expect(isPlaceable(sq('💙', 1))).toBe(false);
    });

    it('縮地: 自陣のコマがライフ・エフェクトごと空きマスへ移る。🔑・氷結中は動かせず、置けない先には動けない', () => {
        const b = emptyBoard();
        b[0] = sq('💙', 5, '🌱', '☠');
        b[1] = sq('💙', 3, '🔑');
        b[2] = sq('💙', 3, '❄');
        b[3] = sq('⭕', 3);
        b[4] = sq(undefined, 0, '❄');
        expect(canRelocate(b[0], '💙')).toBe(true);
        expect(canRelocate(b[1], '💙')).toBe(false);
        expect(canRelocate(b[2], '💙')).toBe(false);
        expect(canRelocate(b[3], '💙')).toBe(false);
        expect(relocate(b, 0, 4, '💙')).toBe(false); // 氷結中の空きマスには置けない
        expect(relocate(b, 0, 3, '💙')).toBe(false); // 敵のコマの上には動けない
        expect(relocate(b, 0, 5, '💙')).toBe(true);
        expect(b[5]).toEqual(sq('💙', 5, '🌱', '☠'));
        expect(b[0]).toEqual({ player: undefined, bind: 0, effects: [] });
    });

    it('写し身: ライフは半分（切り捨て・最低1）、置き先は縦横隣の置ける空きマス', () => {
        expect([cloneLife(7), cloneLife(4), cloneLife(1), cloneLife(0)]).toEqual([3, 2, 1, 1]);
        const b = emptyBoard();
        b[5] = sq('💙', 7, '🌱');
        b[4] = sq('⭕', 3);
        b[6] = sq(undefined, 0, '❄');
        b[1] = sq(undefined, 0, '🔑');
        expect(cloneTargets(b, 5, 4)).toEqual([9]); // 4(敵)・6(氷結)・1(ロック)は不可
        cloneInto(b, 5, 9, '💙');
        expect(b[9]).toEqual({ player: '💙', bind: 3, effects: [] });
        expect(b[5].bind).toBe(7); // 元のコマは変わらない
    });

    it('追い剥ぎ: ライフ0の敵コマだけが対象。🔑と雷霆の巫の⚡無敵は除く。奪うとライフ1・エフェクトなし', () => {
        const cs: CharacterId[] = ['you', 'you', 'electrician'];
        const b = emptyBoard();
        b[0] = sq('⭕', 0, '☠');
        b[1] = sq('⭕', 1);
        b[2] = sq('⭕', 0, '🔑');
        b[3] = sq('💙', 0);
        b[4] = sq('🟩', 0, '⚡'); // 雷霆の巫の無敵
        b[5] = sq('🟩', 0, '⚡', '❄'); // 氷結中は⚡が休眠して無敵でない
        expect(plunderTargets(b, '💙', cs)).toEqual([0, 5]);
        plunder(b, 0, '💙');
        expect(b[0]).toEqual({ player: '💙', bind: PLUNDER_LIFE, effects: [] });
    });
});
