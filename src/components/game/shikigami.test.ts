import { SHIKIGAMI_BLAST_DAMAGE, blast, bless, curse, curseTargets, newShikigami, ownShikigamiCells, purge, purgeTargets } from './shikigami';
import { SquareInfo } from '../../types/SquareInfo';
import { CharacterId } from '../../types/Character';

const board = (): SquareInfo[] => Array.from({ length: 16 }, () => ({ player: undefined, bind: 0, effects: [] }));
const chars: CharacterId[] = ['yinYangMaster', 'you'];

describe('式神', () => {
    it('爆破: 式神は消え、周囲の空きマスは式神になり、敵コマは4ダメージ（0以下で破壊）。氷結は解除だけ・ロックは対象外', () => {
        const b = board();
        b[5] = newShikigami('💙');
        b[0] = { player: '⭕', bind: 4, effects: [] }; // ちょうど壊れる
        b[1] = { player: '⭕', bind: 9, effects: [] }; // 生き残る
        b[2] = { player: '⭕', bind: 3, effects: [{ effect: '❄' }] }; // 氷結: 解除だけ
        b[4] = { player: '⭕', bind: 3, effects: [{ effect: '🔑' }] }; // ロック: 対象外
        const r = blast(b, 5, '💙', chars);
        expect(r.destroyed).toBe(1);
        expect(b[5].player).toBeUndefined();
        expect(b[0].player).toBeUndefined();
        expect(b[1].bind).toBe(9 - SHIKIGAMI_BLAST_DAMAGE);
        expect(b[2].effects).toEqual([]);
        expect(r.broken).toEqual([2]);
        expect(b[4].bind).toBe(3);
        expect(b[6]).toEqual(newShikigami('💙')); // 空きマスは式神になる
        expect(ownShikigamiCells(b, '💙')).toContain(6);
    });

    it('加護: 式神1体を消費して自陣のコマ（式神を除く）のライフ+3', () => {
        const b = board();
        b[0] = newShikigami('💙');
        b[1] = newShikigami('💙');
        b[2] = { player: '💙', bind: 2, effects: [] };
        expect(bless(b, 0, '💙')).toEqual([2]);
        expect(b[2].bind).toBe(5);
        expect(b[1].bind).toBe(2); // 残りの式神は変わらない
        expect(b[0].player).toBeUndefined();
    });

    it('呪詛: エフェクトの乗った敵コマに☠を2つ（毒使いのコマは1つずつ1.5倍）。供犠: ライフを0に', () => {
        const b = board();
        b[0] = newShikigami('💙');
        b[1] = { player: '⭕', bind: 4, effects: [{ effect: '🌱' }] };
        b[2] = { player: '⭕', bind: 4, effects: [] }; // エフェクト無し: 対象外
        expect(curseTargets(b, '💙', chars)).toEqual([1]);
        expect(curse(b, 0, '💙', chars)).toEqual([1]);
        expect(b[1].effects.filter((e) => e.effect === '☠')).toHaveLength(2);
        expect(b[1].bind).toBe(4);
        const p = board();
        p[0] = newShikigami('💙');
        p[1] = { player: '⭕', bind: 4, effects: [{ effect: '🌱' }] };
        curse(p, 0, '💙', ['you', 'poisoner']);
        expect(p[1].bind).toBe(9); // 4 → 6 → 9
        expect(purgeTargets(b, '💙', chars)).toEqual([1, 2]);
        purge(b, 1);
        expect(b[1].bind).toBe(0);
        expect(b[1].effects.length).toBeGreaterThan(0);
    });
});
