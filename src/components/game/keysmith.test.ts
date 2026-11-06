import { SquareInfo } from '../../types/SquareInfo';
import { CharacterId } from '../../types/Character';
import { addLock, isLocked, lockStack } from './lock';
import {
    BLESSING_STACK, LOCK_EXTEND_STACK, SEAL_EMPTY_STACK, SEAL_OWN_STACK, VACANT_SEAL_STACK, blessPlacedPiece, lockBlocksPlacement, lockExtend, lockRaid, lockRaidCells,
    opponentReaches, reachCount, seal, sealBaseCost, sealReleaseCells, vacantSeal, vacantSealBaseCost, vacantSealCells,
} from './keysmith';
import { canPlaceAt } from './aiTurn';

const sq = (over: Partial<SquareInfo> = {}): SquareInfo => ({ player: undefined, bind: 0, effects: [], ...over });
const chars: CharacterId[] = ['keysmith', 'you'];

describe('鍵師 (#439)', () => {
    it('パッシブ: 鍵師は空きマスのロックを無視して置ける。コマのロックは無視できない。他キャラは止まる', () => {
        const emptyLocked = addLock(sq(), 2);
        const pieceLocked = addLock(sq({ player: '⭕', bind: 3 }), 2);
        expect(lockBlocksPlacement(emptyLocked, 'keysmith')).toBe(false);
        expect(lockBlocksPlacement(pieceLocked, 'keysmith')).toBe(true);
        expect(lockBlocksPlacement(emptyLocked, 'you')).toBe(true);
        expect(canPlaceAt([emptyLocked], 0, '💙', 'keysmith', chars)).toBe(true);
        expect(canPlaceAt([emptyLocked], 0, '⭕', 'you', chars)).toBe(false);
    });
    it('封鎖の断: 自陣に7・空きマスに2のロック。敵のロックは解除してその数だけダメージ', () => {
        const b = [
            sq({ player: '💙', bind: 3 }), // 自陣
            sq(), // 空き
            addLock(sq({ player: '⭕', bind: 5 }), 4), // 敵+ロック
            addLock(sq({ player: '⭕', bind: 5 }), 1), // 敵+ロック
            sq({ player: '⭕', bind: 4 }), // 敵
            sq({ player: '⭕', bind: 0 }), // ライフ0の敵はダメージ対象外
        ];
        expect(sealReleaseCells(b, '💙')).toEqual([2, 3]);
        const r = seal(b, '💙', chars);
        expect(r.released).toEqual([2, 3]);
        expect(r.damage).toBe(2);
        expect(r.hit).toEqual([2, 3, 4]);
        expect(lockStack(b[0])).toBe(SEAL_OWN_STACK);
        expect(lockStack(b[1])).toBe(SEAL_EMPTY_STACK);
        expect(isLocked(b[2])).toBe(false);
        expect(b[2].bind).toBe(3);
        expect(b[3].bind).toBe(3);
        expect(b[4].bind).toBe(2);
        expect(b[5].bind).toBe(0);
    });
    it('封鎖の断: 解除するロックが無くても最低1ダメージ。氷結中のマスにはロックを掛けない', () => {
        const b = [sq({ player: '⭕', bind: 3 }), sq({ effects: [{ effect: '❄' }] }), sq()];
        const r = seal(b, '💙', chars);
        expect(r.released).toEqual([]);
        expect(r.damage).toBe(1);
        expect(b[0].bind).toBe(2);
        expect(isLocked(b[1])).toBe(false);
        expect(r.empty).toEqual([2]);
    });
    it('封鎖の断: 敵陣のロックの数だけ基礎コストが下がる（下限5）', () => {
        expect(sealBaseCost(10, 0)).toBe(10);
        expect(sealBaseCost(10, 3)).toBe(7);
        expect(sealBaseCost(10, 9)).toBe(5);
    });

    describe('汎用スキル（idx 130〜133）', () => {
        const kc: CharacterId[] = ['keysmith', 'you'];
        const row = (cells: Partial<SquareInfo>[]): SquareInfo[] => [...cells.map((c) => sq(c)), ...Array.from({ length: 16 - cells.length }, () => sq())];

        it('空き家封じ: 空きマス全てに2スタック。氷結中・コマのあるマスには掛けない。基礎コストは相手のリーチ1つにつき-3（下限1）', () => {
            const b = row([{ player: '💙', bind: 3 }, { effects: [{ effect: '❄' }] }]);
            const cells = vacantSeal(b);
            expect(cells).toHaveLength(16 - 2);
            expect(lockStack(b[2])).toBe(VACANT_SEAL_STACK);
            expect(isLocked(b[0])).toBe(false);
            expect(isLocked(b[1])).toBe(false);
            expect(vacantSealCells(b)).toHaveLength(14);
            expect(vacantSealBaseCost(10, 0)).toBe(10);
            expect(vacantSealBaseCost(10, 1)).toBe(7);
            expect(vacantSealBaseCost(10, 3)).toBe(1);
            expect(vacantSealBaseCost(10, 9)).toBe(1);
        });
        it('リーチ数: 3つ並び＋置ける空きマスの列を数える。残りがロック中の空きマスなら（その席が置けないときだけ）数えない', () => {
            const b = row([{ player: '⭕', bind: 3 }, { player: '⭕', bind: 3 }, { player: '⭕', bind: 3 }]);
            expect(reachCount(b, '⭕', kc)).toBe(1); // 行0の残り(3)が空き
            expect(opponentReaches(b, '💙', kc)).toBe(1);
            expect(opponentReaches(b, '⭕', kc)).toBe(0);
            b[3] = addLock(b[3], 2); // 残りをロック → 鍵師でない⭕は置けない
            expect(reachCount(b, '⭕', kc)).toBe(0);
            // 鍵師のリーチは、ロック中の空きマスでも置けるので数える
            const k = row([{ player: '💙', bind: 3 }, { player: '💙', bind: 3 }, { player: '💙', bind: 3 }]);
            k[3] = addLock(k[3], 2);
            expect(reachCount(k, '💙', kc)).toBe(1);
        });
        it('ロックの増築: ロックの乗った自陣のコマのスタックだけ+2。ロックの無いコマ・敵のコマは変わらない', () => {
            const b = row([addLock(sq({ player: '💙', bind: 3 }), 3), { player: '💙', bind: 3 }, addLock(sq({ player: '⭕', bind: 3 }), 3)]);
            expect(lockExtend(b, '💙')).toEqual([0]);
            expect(lockStack(b[0])).toBe(3 + LOCK_EXTEND_STACK);
            expect(isLocked(b[1])).toBe(false);
            expect(lockStack(b[2])).toBe(3);
        });
        it('施錠の加護: 設置したコマにロックが2スタック付く（ライフは変えない）', () => {
            const p = blessPlacedPiece(sq({ player: '💙', bind: 4 }));
            expect(p.bind).toBe(4);
            expect(lockStack(p)).toBe(BLESSING_STACK);
        });
        it('錠前荒らし: ロックの乗った敵のコマを1つ解除し🔥・☠・⚡のどれか1つを付ける。対象が無ければ null', () => {
            const empty = row([{ player: '⭕', bind: 3 }]);
            expect(lockRaid(empty, '💙', kc, () => 0)).toBeNull();
            for (const [r, effect] of [[0, '🔥'], [0.4, '☠'], [0.9, '⚡']] as const) {
                const b = row([addLock(sq({ player: '⭕', bind: 5 }), 4), addLock(sq({ player: '💙', bind: 5 }), 4)]);
                const calls = [0, r];
                const res = lockRaid(b, '💙', kc, () => calls.shift() ?? 0);
                expect(res).toEqual({ cell: 0, effect });
                expect(isLocked(b[0])).toBe(false);
                expect(isLocked(b[1])).toBe(true); // 自陣のロックは外れない
                expect(b[0].effects.some((e) => e.effect === effect)).toBe(true);
            }
            expect(lockRaidCells(row([addLock(sq({ player: '⭕', bind: 5 }), 4), addLock(sq({ player: '⭕', bind: 5 }), 1)]), '💙')).toEqual([0, 1]);
        });
    });
});
