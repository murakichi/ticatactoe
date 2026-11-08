import { SquareInfo } from '../../types/SquareInfo';
import {
    CustomSkillSpec,
    applyCustom,
    applyDrawbacks,
    canCastCustom,
    costBeforeDrawbacks,
    customCellsAuto,
    customSkillCost,
    customTargets,
    describeCustom,
    isValidSpec,
    loadCustomSkill,
    normalizeSpec,
    saveCustomSkill,
    selectCount,
    hasCellOps,
    opUnit,
    CUSTOM_SKILL_KEY,
} from './customSkill';
import { CUSTOM_SKILL_IDX, DECK_SIZE, isValidDeck, recommendedDeck } from './deck';

const ME = '💙';
const FOE = '⭕';
const sq = (player: SquareInfo['player'], bind = 3, effects: SquareInfo['effects'] = []): SquareInfo => ({ player, bind, effects });
const boardOf = (cells: SquareInfo[]): SquareInfo[] => [...cells, ...Array.from({ length: 16 - cells.length }, () => sq(undefined, 0))];
const chars = ['you', 'you'] as const;
const env = { me: ME as typeof ME, chars, size: 4 };
const spec = (patch: Partial<CustomSkillSpec>): CustomSkillSpec =>
    normalizeSpec({ name: 'テスト', kind: 'enemy', pick: 'select', count: 1, ops: [{ op: 'damage', amount: 2, destroyOnZero: false }], drawbacks: [], endTurn: false, ...patch });

describe('オリジナルスキル: コスト', () => {
    it('基準単価どおり: ライフ+3を1コマ=3、破壊=5、毒1つ=2、火炎1つ=3', () => {
        expect(customSkillCost(spec({ kind: 'own', ops: [{ op: 'heal', amount: 3 }] }))).toBe(3);
        expect(customSkillCost(spec({ ops: [{ op: 'destroy' }] }))).toBe(5);
        expect(customSkillCost(spec({ ops: [{ op: 'effect', effect: 'poison', count: 1 }] }))).toBe(2);
        expect(customSkillCost(spec({ ops: [{ op: 'effect', effect: 'fire', count: 1 }] }))).toBe(3);
    });
    it('効果を重ねるほど重くなる', () => {
        const one = customSkillCost(spec({}));
        const two = customSkillCost(spec({ ops: [{ op: 'damage', amount: 2, destroyOnZero: false }, { op: 'effect', effect: 'poison', count: 1 }] }));
        const three = customSkillCost(spec({ ops: [{ op: 'damage', amount: 2, destroyOnZero: false }, { op: 'effect', effect: 'poison', count: 1 }, { op: 'effect', effect: 'fire', count: 1 }] }));
        expect(one).toBeLessThan(two);
        expect(two).toBeLessThan(three);
    });
    it('0で破壊・選ぶ数・全体で重くなる', () => {
        const base = customSkillCost(spec({}));
        expect(customSkillCost(spec({ ops: [{ op: 'damage', amount: 2, destroyOnZero: true }] }))).toBeGreaterThan(base);
        expect(customSkillCost(spec({ count: 2 }))).toBeGreaterThan(base);
        expect(customSkillCost(spec({ pick: 'all' }))).toBeGreaterThan(customSkillCost(spec({ count: 3 })));
    });
    it('ランダムは-1、手番終了は-2（下限1）', () => {
        expect(customSkillCost(spec({ pick: 'random', count: 2 }))).toBe(customSkillCost(spec({ count: 2 })) - 1);
        expect(customSkillCost(spec({ endTurn: true, ops: [{ op: 'destroy' }] }))).toBe(3);
        expect(customSkillCost(spec({ endTurn: true, kind: 'own', ops: [{ op: 'heal', amount: 1 }] }))).toBe(1);
    });
    it('代償でコストが下がるが、割引前の6割までで下限1', () => {
        const ops = [{ op: 'destroy' as const }];
        const free = customSkillCost(spec({ ops }));
        const a = customSkillCost(spec({ ops, drawbacks: [{ side: 'own', op: { op: 'damage', amount: 2, destroyOnZero: false } }] }));
        expect(a).toBeLessThan(free);
        const many = spec({ ops, pick: 'all', drawbacks: Array(3).fill({ side: 'own', op: { op: 'destroy' } }) });
        const before = costBeforeDrawbacks(many);
        expect(customSkillCost(many)).toBe(before - Math.floor(before * 0.6));
        expect(customSkillCost(many)).toBeGreaterThanOrEqual(1);
    });
});

describe('オリジナルスキル: 仕様の検証', () => {
    it('空きマス対象にコマ専用の効果は付けられない', () => {
        const s = spec({ kind: 'empty', ops: [{ op: 'damage', amount: 2, destroyOnZero: false }, { op: 'effect', effect: 'fire', count: 1 }] });
        expect(s.ops).toEqual([{ op: 'effect', effect: 'fire', count: 1 }]);
    });
    it('不正な値は整えられ、名前が空なら既定名が付く', () => {
        const s = normalizeSpec({ name: ' ', kind: 'x', pick: 'y', count: 9, ops: [{ op: 'heal', amount: 99 }], drawbacks: [{ side: 'enemy', op: { op: 'destroy' } }], endTurn: true } as never);
        expect(isValidSpec(s)).toBe(true);
        expect(s.name).not.toBe('');
        expect(s.drawbacks).toEqual([]);
    });
    it('名前の - や + は除かれる（ボタン文言の区切りのため）', () => {
        expect(spec({ name: 'a-b+c' }).name).toBe('abc');
    });
    it('保存と読み込み。壊れた値は無視', () => {
        const mem: Record<string, string> = {};
        const storage = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => void (mem[k] = v), removeItem: (k: string) => void delete mem[k] };
        const saved = saveCustomSkill(spec({ name: '雷' }), storage);
        expect(loadCustomSkill(storage)).toEqual(saved);
        mem[CUSTOM_SKILL_KEY] = '{oops';
        expect(loadCustomSkill(storage)).toBeUndefined();
    });
    it('デッキにオリジナルの idx を1枚入れても有効（重複は不可）', () => {
        const deck = [...recommendedDeck('you').slice(0, DECK_SIZE - 1), CUSTOM_SKILL_IDX];
        expect(isValidDeck(deck)).toBe(true);
        expect(isValidDeck([...deck.slice(0, DECK_SIZE - 2), CUSTOM_SKILL_IDX, CUSTOM_SKILL_IDX])).toBe(false);
    });
});

describe('オリジナルスキル: 対象と適用', () => {
    const board = () => boardOf([sq(ME, 3), sq(FOE, 3), sq(FOE, 0), sq(FOE, 4, [{ effect: '🔑', stack: 3 }]), sq(FOE, 5, [{ effect: '❄' }])]);

    it('敵のコマ対象: ダメージはライフ0とロック中を除く', () => {
        expect(customTargets(board(), spec({}), ME, chars)).toEqual([1, 4]);
    });
    it('自陣・空きマス・どのマスでも', () => {
        expect(customTargets(board(), spec({ kind: 'own', ops: [{ op: 'heal', amount: 1 }] }), ME, chars)).toEqual([0]);
        expect(customTargets(board(), spec({ kind: 'empty', ops: [{ op: 'effect', effect: 'fire', count: 1 }] }), ME, chars)).toEqual(Array.from({ length: 11 }, (_, i) => i + 5));
        expect(customTargets(board(), spec({ kind: 'any', ops: [{ op: 'effect', effect: 'fire', count: 1 }] }), ME, chars)).toHaveLength(16);
    });
    it('対象が無ければ使えない。選ぶ数は選べるマス数まで', () => {
        const b = boardOf([sq(ME, 3)]);
        expect(canCastCustom(b, spec({}), ME, chars)).toBe(false);
        expect(selectCount(board(), spec({ count: 3 }), ME, chars)).toBe(2);
    });
    it('ダメージ: 0になっても駒は残る / 0で破壊なら空きマスになる', () => {
        const keep = board();
        applyCustom(keep, [1], spec({ ops: [{ op: 'damage', amount: 5, destroyOnZero: false }] }), env);
        expect(keep[1]).toMatchObject({ player: FOE, bind: 0 });
        const kill = board();
        const r = applyCustom(kill, [1], spec({ ops: [{ op: 'damage', amount: 5, destroyOnZero: true }] }), env);
        expect(kill[1]).toEqual({ player: undefined, bind: 0, effects: [] });
        expect(r.destroyed).toEqual([1]);
        const alive = board();
        applyCustom(alive, [1], spec({ ops: [{ op: 'damage', amount: 1, destroyOnZero: true }] }), env);
        expect(alive[1]).toMatchObject({ player: FOE, bind: 2 });
    });
    it('破壊: 空きマスになる。氷結中は❄が身代わり', () => {
        const b = board();
        const r = applyCustom(b, [1, 4], spec({ ops: [{ op: 'destroy' }] }), env);
        expect(b[1].player).toBeUndefined();
        expect(r.destroyed).toEqual([1]);
        expect(r.blocked).toEqual([4]); // 氷結中のマス4は❄が身代わり
        const f = board();
        const r2 = applyCustom(f, [3], spec({ ops: [{ op: 'destroy' }] }), env);
        expect(r2.affected).toEqual([]); // マス3はロック中なので飛ばされる
        expect(f[3].player).toBe(FOE);
        const frozen = boardOf([sq(FOE, 3, [{ effect: '❄' }])]);
        const r3 = applyCustom(frozen, [0], spec({ ops: [{ op: 'destroy' }] }), env);
        expect(r3.blocked).toEqual([0]);
        expect(frozen[0].player).toBe(FOE);
        expect(frozen[0].effects).toEqual([]);
    });
    it('ライフ加算・毒・火炎・帯電・バッズ・氷結', () => {
        const b = board();
        applyCustom(b, [0], spec({ kind: 'own', ops: [{ op: 'heal', amount: 3 }] }), env);
        expect(b[0].bind).toBe(6);
        applyCustom(b, [0], spec({ kind: 'own', ops: [{ op: 'effect', effect: 'bud', count: 2 }] }), env);
        expect(b[0].effects.filter((e) => e.effect === '🌱')).toHaveLength(2);
        applyCustom(b, [1], spec({ ops: [{ op: 'effect', effect: 'poison', count: 2 }] }), env);
        expect(b[1].effects.filter((e) => e.effect === '☠')).toHaveLength(2);
        applyCustom(b, [1], spec({ ops: [{ op: 'effect', effect: 'frost', count: 1 }] }), env);
        expect(b[1].effects.some((e) => e.effect === '❄')).toBe(true);
    });
    it('複数の効果は順に適用される（ダメージ→毒）。破壊したマスに後の効果は乗らない', () => {
        const b = board();
        applyCustom(b, [1], spec({ ops: [{ op: 'destroy' }, { op: 'effect', effect: 'poison', count: 1 }] }), env);
        expect(b[1]).toEqual({ player: undefined, bind: 0, effects: [] });
        const c = board();
        applyCustom(c, [1], spec({ ops: [{ op: 'damage', amount: 1, destroyOnZero: false }, { op: 'effect', effect: 'poison', count: 1 }] }), env);
        expect(c[1].bind).toBe(2);
        expect(c[1].effects.some((e) => e.effect === '☠')).toBe(true);
    });
    it('即発動: 全て / ランダムn個', () => {
        const pick = (cs: number[], n: number) => cs.slice(0, n);
        expect(customCellsAuto(board(), spec({ pick: 'all' }), ME, chars, pick)).toEqual([1, 4]);
        expect(customCellsAuto(board(), spec({ pick: 'random', count: 1 }), ME, chars, pick)).toEqual([1]);
        expect(customCellsAuto(board(), spec({ pick: 'select' }), ME, chars, pick)).toEqual([]);
    });
    it('代償: 自陣のランダムなコマにダメージ / 敵のコマが回復。候補が無ければ不発', () => {
        const pick = (cs: number[], n: number) => cs.slice(0, n);
        const b = board();
        const s = spec({ drawbacks: [{ side: 'own', op: { op: 'damage', amount: 2, destroyOnZero: false } }, { side: 'enemy', op: { op: 'heal', amount: 2 } }] });
        const r = applyDrawbacks(b, s, ME, env, pick);
        expect(b[0].bind).toBe(1);
        expect(b[1].bind).toBe(5);
        expect(r.skipped).toBe(0);
        const lonely = boardOf([sq(FOE, 3)]);
        expect(applyDrawbacks(lonely, spec({ drawbacks: [{ side: 'own', op: { op: 'destroy' } }] }), ME, env, pick).skipped).toBe(1);
    });
    it('説明文に対象・効果・代償が出る', () => {
        const text = describeCustom(spec({ count: 2, ops: [{ op: 'damage', amount: 3, destroyOnZero: true }], drawbacks: [{ side: 'own', op: { op: 'damage', amount: 1, destroyOnZero: false } }], endTurn: true }));
        expect(text).toContain('敵のコマを2つ選び');
        expect(text).toContain('3ダメージ');
        expect(text).toContain('破壊');
        expect(text).toContain('代償');
        expect(text).toContain('手番を終えます');
    });
});

describe('オリジナルスキル: オブジェクト設置・スキル封じ・ギア封じ', () => {
    const emptyKind = (patch: Partial<CustomSkillSpec>) => spec({ kind: 'empty', ...patch });

    it('オブジェクト設置のコストは設置スキルの基礎コスト（大木8）。空きマスだけに置け、選ぶ数でR3', () => {
        const one = emptyKind({ ops: [{ op: 'object', object: 'bigTree' }] });
        expect(customSkillCost(one)).toBe(8);
        expect(customSkillCost(emptyKind({ count: 2, ops: [{ op: 'object', object: 'bigTree' }] }))).toBe(14);
        const b = boardOf([sq(ME, 3), sq(FOE, 3)]);
        expect(customTargets(b, one, ME, chars)).toEqual(Array.from({ length: 14 }, (_, i) => i + 2));
    });
    it('オブジェクトは敵・自陣対象には付けられず、「全て」にもできない', () => {
        expect(spec({ kind: 'enemy', ops: [{ op: 'object', object: 'bigTree' }] }).ops[0].op).not.toBe('object');
        expect(emptyKind({ pick: 'all', ops: [{ op: 'object', object: 'fort' }] }).pick).toBe('select');
    });
    it('設置: 持ち主は使用者でライフは設置スキルのとおり。空きマスに乗っていた🔥は引き継ぐ', () => {
        const b = boardOf([sq(ME, 3)]);
        b[5] = { player: undefined, bind: 0, effects: [{ effect: '🔥' }] };
        const r = applyCustom(b, [4, 5], emptyKind({ count: 2, ops: [{ op: 'object', object: 'fort' }] }), env);
        expect(b[4]).toMatchObject({ player: ME, object: 'fort', bind: 5 });
        expect(b[5].object).toBe('fort');
        expect(b[5].effects.some((e) => e.effect === '🔥')).toBe(true);
        expect(r.affected).toEqual([4, 5]);
        const c = boardOf([sq(ME, 3)]);
        c[5] = { player: undefined, bind: 0, effects: [{ effect: '🔥' }] };
        const r2 = applyCustom(c, [5], emptyKind({ ops: [{ op: 'object', object: 'bigTree' }] }), env);
        expect(c[5].object).toBeUndefined(); // 大木は火炎で即座に燃え尽きる
        expect(r2.destroyed).toEqual([5]);
    });
    it('サイレンスとギア封じはマスを使わず、対象が無くても使える（ギア封じはギアを持つ相手がいるときだけ）', () => {
        const silence = spec({ ops: [{ op: 'silence', mode: 'all', n: 0 }] });
        expect(hasCellOps(silence)).toBe(false);
        const b = boardOf([]);
        expect(canCastCustom(b, silence, ME, chars)).toBe(true);
        const gear = spec({ ops: [{ op: 'gearOff' }] });
        expect(canCastCustom(b, gear, ME, chars, true)).toBe(true);
        expect(canCastCustom(b, gear, ME, chars, false)).toBe(false);
        expect(customCellsAuto(b, silence, ME, chars, (cs) => cs)).toEqual([]);
        expect(silence.pick).toBe('all'); // 対象の設定は意味を持たないので固定される
    });
    it('封じのコスト: 全封じ5 > n以下/n以上（どちらも4以下）。nが範囲を狭めるほど安い。対象マスの係数は掛からない', () => {
        const cost = (op: Parameters<typeof opUnit>[0]) => customSkillCost(spec({ pick: 'random', count: 3, ops: [op] }));
        expect(cost({ op: 'silence', mode: 'all', n: 0 })).toBe(5);
        expect(cost({ op: 'silence', mode: 'max', n: 2 })).toBeLessThan(cost({ op: 'silence', mode: 'max', n: 6 }));
        expect(cost({ op: 'silence', mode: 'min', n: 7 })).toBeLessThan(cost({ op: 'silence', mode: 'min', n: 3 }));
        expect(cost({ op: 'silence', mode: 'max', n: 6 })).toBeLessThan(5);
        expect(cost({ op: 'silence', mode: 'min', n: 3 })).toBeLessThan(5);
        expect(cost({ op: 'gearOff' })).toBe(4);
    });
    it('不正なnは捨てられる。封じとダメージを重ねると対象の設定は残る', () => {
        expect(normalizeSpec({ ...spec({}), ops: [{ op: 'silence', mode: 'max', n: 99 }] } as CustomSkillSpec).ops[0].op).toBe('damage');
        const mixed = spec({ kind: 'enemy', pick: 'all', ops: [{ op: 'damage', amount: 1, destroyOnZero: false }, { op: 'silence', mode: 'all', n: 0 }] });
        expect(mixed.pick).toBe('all');
        expect(customSkillCost(mixed)).toBe(Math.round(1.3 * 3.5) + 5 + 1);
    });
    it('説明文に封じが出る', () => {
        const text = describeCustom(spec({ ops: [{ op: 'silence', mode: 'max', n: 3 }, { op: 'gearOff' }] }));
        expect(text).toContain('コスト3以下のスキルを使えない');
        expect(text).toContain('ギアを使えない');
        expect(text).not.toContain('選び');
    });
});

