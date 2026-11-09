import {
    leafCloakTargets,
    leafAllTargets,
    leafDropTargets,
    leafDrop,
    kindlingTargets,
    tinderTargets,
    kindling,
    boardLeaves,
    witchCostOf,
    mogaribue,
    mogaribueDamage,
    mogaribueTargets,
    canMogaribue,
    MOGARIBUE_LIFE,
    setEffectWard,
    isFrozen,
    flameStacks,
    burnDamageOf,
    applyDamage,
    ignite,
    freeze,
    decayTick,
    budStacks,
    leafStacks,
    activeLeaves,
    leafSurcharge,
    placeLeafToken,
    bonfireTargets,
    bonfire,
    mulchCandidates,
    mulch,
    autumnTargets,
    autumn,
    leafFrostTargets,
    thawTargets,
    thawAll,
} from './thermal';
import { SquareInfo } from '../../types/SquareInfo';
import { Effect } from '../../types/Effect';
import { Player } from '../../types/Player';
import { CharacterId } from '../../types/Character';
import { emptyBoard, sq } from './thermalTestUtils';

describe('🍂落ち葉（🌱バッズの対）', () => {
    const board = (): SquareInfo[] => Array.from({ length: 16 }, () => sq(undefined, 0));

    it('他の席のコマに乗った効力のある🍂の枚数ぶん、そのプレイヤーのスキルコストが上がる（自陣の🍂は数えない・氷結中は休眠）', () => {
        const b = board();
        b[0] = sq('💙', 3, '🍂', '🍂');
        b[1] = sq('⭕', 3, '🍂');
        b[2] = sq('⭕', 3, '🍂', '❄'); // 氷結中は休眠して数えない
        expect(leafStacks(b[0])).toBe(2);
        expect(activeLeaves(b[2])).toBe(0);
        expect(leafSurcharge(b, '⭕')).toBe(2); // 💙の🍂2枚
        expect(leafSurcharge(b, '💙')).toBe(1); // ⭕の🍂1枚（氷結中の1枚は数えない）
        expect(leafSurcharge(b, '🟩')).toBe(3); // 第三者には全員ぶん
    });

    it('🔥が付くと🌱と同じく🍂は燃えて消える（冬至の種子のガードは🌱だけ守る）', () => {
        const b = board();
        b[5] = sq('💙', 3, '🌱', '🍂', '☠');
        ignite(b, [5], 4);
        expect(b[5].effects.map((e) => e.effect)).toEqual(['☠', '🔥']);
        const g = board();
        g[5] = sq('💙', 3, '🌱', '🍂');
        ignite(g, [5], 4, 1, () => true);
        expect(g[5].effects.map((e) => e.effect)).toEqual(['🌱', '🔥']);
    });

    it('placeLeafToken は🍂を指定枚数持つコマを置く', () => {
        const b = board();
        placeLeafToken(b, 3, '💙', 4, 2);
        expect(b[3]).toEqual({ player: '💙', bind: 4, effects: [{ effect: '🍂' }, { effect: '🍂' }] });
    });

    it('焚き火の唄: 敵陣の🍂だけを全て除去する。🔑ロックと❄氷結のマス・自陣は対象外', () => {
        const b = board();
        b[0] = sq('⭕', 3, '🍂', '🍂');
        b[1] = sq('⭕', 3, '🍂', '🔑');
        b[2] = sq('⭕', 3, '🍂', '❄');
        b[3] = sq('💙', 3, '🍂');
        b[4] = sq('⭕', 3, '☠');
        expect(bonfireTargets(b, '💙')).toEqual([0]);
        const r = bonfire(b, '💙');
        expect(r).toEqual({ n: 2, cells: [0] });
        expect(leafStacks(b[0])).toBe(0);
        expect(leafStacks(b[1])).toBe(1);
        expect(leafStacks(b[2])).toBe(1);
        expect(leafStacks(b[3])).toBe(1);
        expect(bonfireTargets(b, '💙')).toEqual([]);
    });

    it('腐葉土の目覚め: 自陣の🍂を1枚ずつ数えた候補から1枚だけを🌱に変える', () => {
        const b = board();
        b[0] = sq('💙', 3, '🍂', '☠', '🍂');
        b[1] = sq('💙', 3, '🍂');
        b[2] = sq('⭕', 3, '🍂');
        expect(mulchCandidates(b, '💙')).toEqual([0, 0, 1]);
        expect(mulch(b, 0)).toBe(true);
        expect(b[0].effects.map((e) => e.effect)).toEqual(['🌱', '☠', '🍂']);
        expect(mulch(b, 3)).toBe(false);
    });

    it('一葉知秋: 盤面の🌱を敵味方問わず🍂に変える。🔥が付いたマスは変えない', () => {
        const b = board();
        b[0] = sq('💙', 3, '🌱', '🌱');
        b[1] = sq('⭕', 3, '🌱', '⚡');
        b[2] = sq('⭕', 3, '🌱', '🔥'); // 冬至の種子で🌱が残った火炎中のマス
        b[3] = sq('⭕', 3, '☠');
        expect(autumnTargets(b)).toEqual([0, 1]);
        expect(autumn(b)).toEqual({ n: 3, cells: [0, 1] });
        expect(b[0].effects.map((e) => e.effect)).toEqual(['🍂', '🍂']);
        expect(b[1].effects.map((e) => e.effect)).toEqual(['🍂', '⚡']);
        expect(budStacks(b[2])).toBe(1);
        expect(autumn(b).n).toBe(0);
    });

    it('霜枯れ: 自陣の🍂を持ち氷結を付けられるマスだけが対象。付けると🍂は休眠してコスト上乗せが止まる', () => {
        const b = board();
        b[0] = sq('💙', 3, '🍂');
        b[1] = sq('💙', 3, '🍂', '🔑'); // ロック中は凍らせられない
        b[2] = sq('💙', 3, '🍂', '❄'); // 氷結中でも重ねられる
        b[3] = sq('💙', 3, '🌱'); // 🍂が無い
        b[4] = sq('⭕', 3, '🍂');
        expect(leafFrostTargets(b, '💙')).toEqual([0, 2]);
        expect(leafSurcharge(b, '⭕')).toBe(2); // 💙の🍂: b[0] と b[1]（b[2] は氷結中で休眠）
        freeze(b, leafFrostTargets(b, '💙'));
        expect(leafSurcharge(b, '⭕')).toBe(1); // b[1] はロック中で凍らせられず、🍂が働き続ける
    });

    it('春一番: 自陣のコマの❄を全スタック解除して、解除した❄の数を返す（敵のコマ・空きマスの❄は触らない）', () => {
        const b = board();
        b[0] = sq('💙', 3, '❄', '❄', '🍂');
        b[1] = sq('💙', 3, '❄', '🔑'); // ロック中でも解ける
        b[2] = sq('💙', 3, '🌱');
        b[3] = sq('⭕', 3, '❄');
        b[4] = sq(undefined, 0, '❄');
        expect(thawTargets(b, '💙')).toEqual([0, 1]);
        expect(thawAll(b, '💙')).toEqual({ stacks: 3, cells: [0, 1] });
        expect(b[0].effects.map((e) => e.effect)).toEqual(['🍂']);
        expect(b[1].effects.map((e) => e.effect)).toEqual(['🔑']);
        expect(b[3].effects.map((e) => e.effect)).toEqual(['❄']);
        expect(b[4].effects.map((e) => e.effect)).toEqual(['❄']);
        expect(thawAll(b, '💙').stacks).toBe(0);
    });
});

describe('凩の魔女（パッシブ・虎落笛）', () => {
    const lv = (player: Player | undefined, bind: number, n: number, ...rest: Effect['effect'][]) => sq(player, bind, ...Array<Effect['effect']>(n).fill('🍂'), ...rest);
    const cs: CharacterId[] = ['witch', 'you'];

    it('パッシブ: 盤面の🍂（敵味方）1枚につきコスト-1。下限1、もともと1以下は変えない、氷結中の🍂は数えない', () => {
        const b = emptyBoard();
        b[0] = lv('💙', 4, 2);
        b[1] = lv('⭕', 4, 1);
        b[2] = lv('⭕', 4, 5, '❄'); // 休眠
        expect(boardLeaves(b)).toBe(3);
        expect(witchCostOf(7, b)).toBe(4);
        expect(witchCostOf(3, b)).toBe(1);
        expect(witchCostOf(1, b)).toBe(1);
        expect(witchCostOf(0, b)).toBe(0);
        expect(witchCostOf(7, emptyBoard())).toBe(7);
    });

    it('虎落笛: 自陣の🍂の枚数ぶん敵全てにダメージ、自陣は全てライフ+2', () => {
        const b = emptyBoard();
        b[0] = lv('💙', 3, 2); // 自陣🍂×2
        b[1] = sq('💙', 0);
        b[4] = sq('⭕', 5);
        b[5] = sq('⭕', 1);
        b[6] = lv('⭕', 4, 3); // 敵の🍂は威力に数えない
        expect(mogaribueDamage(b, '💙')).toBe(2);
        const r = mogaribue(b, '💙', cs);
        expect(r.damage).toBe(2);
        expect(r.hit).toEqual([4, 5, 6]);
        expect(r.boosted).toEqual([0, 1]);
        expect(b[4].bind).toBe(3);
        expect(b[5].bind).toBe(0); // 下限0
        expect(b[6].bind).toBe(2);
        expect(b[0].bind).toBe(3 + MOGARIBUE_LIFE);
        expect(b[1].bind).toBe(MOGARIBUE_LIFE); // ライフ0の自コマにも入る
    });

    it('虎落笛: 🔑・ライフ0・雷霆の巫の⚡無敵の敵は対象外。氷結は肩代わり、🔥は1.5倍', () => {
        const b = emptyBoard();
        b[0] = lv('💙', 3, 2);
        b[1] = sq('⭕', 5, '🔑');
        b[2] = sq('⭕', 0);
        b[3] = sq('⭕', 5, '❄');
        b[4] = sq('⭕', 8, '🔥');
        b[5] = sq('🟩', 5, '⚡');
        const c3: CharacterId[] = ['witch', 'you', 'electrician'];
        expect(mogaribueTargets(b, '💙', c3)).toEqual([3, 4]);
        mogaribue(b, '💙', c3);
        expect(b[1].bind).toBe(5);
        expect(b[3].bind).toBe(5); // 氷結が肩代わり（❄が1つ減るだけ）
        expect(isFrozen(b[3])).toBe(false);
        expect(b[4].bind).toBe(5); // 2 × 1.5 = 3 ダメージ
        expect(b[5].bind).toBe(5);
    });

    it('虎落笛: 🍂が無くても自陣のライフ+2は入る。自陣のコマが無ければ撃てない', () => {
        const b = emptyBoard();
        b[4] = sq('⭕', 5);
        expect(canMogaribue(b, '💙')).toBe(false);
        b[0] = sq('💙', 2);
        expect(canMogaribue(b, '💙')).toBe(true);
        const r = mogaribue(b, '💙', cs);
        expect(r.damage).toBe(0);
        expect(r.hit).toEqual([]);
        expect(b[4].bind).toBe(5);
        expect(b[0].bind).toBe(2 + MOGARIBUE_LIFE);
    });

});

describe('落ち葉の置き土産・焚きつけ', () => {
    const lv = (player: Player | undefined, bind: number, n: number, ...rest: Effect['effect'][]) => sq(player, bind, ...Array<Effect['effect']>(n).fill('🍂'), ...rest);
    const guard = (s: SquareInfo) => s.effects.some((e) => e.effect === '🔑');

    it('落ち葉の置き土産: 対象は使用者以外のコマ（guarded を除く）。🍂が1つ付く', () => {
        const b = emptyBoard();
        b[0] = sq('💙', 3);
        b[1] = sq('⭕', 3);
        b[2] = sq('⭕', 3, '🔑');
        expect(leafDropTargets(b, '💙', guard)).toEqual([1]);
        leafDrop(b, 1);
        expect(b[1].effects).toEqual([{ effect: '🍂' }]);
        expect(b[0].effects).toEqual([]);
    });

    it('火口: 🌱か🍂か❄を持つ敵コマだけが対象（自陣・🔑・何も無いコマは対象外）。🔥は🌱🍂を焼く', () => {
        const b = emptyBoard();
        b[0] = lv('💙', 3, 1);
        b[1] = lv('⭕', 8, 1);
        b[2] = lv('⭕', 8, 1, '🔑');
        b[3] = sq('⭕', 8);
        b[4] = { player: '⭕', bind: 8, effects: [{ effect: '🌱' }] };
        b[5] = { player: '⭕', bind: 8, effects: [{ effect: '❄' }] }; // ❄のコマも対象（🔥で氷結が解ける）
        expect(tinderTargets(b, '💙', guard)).toEqual([1, 4, 5]);
        const post = b.map((q) => ({ ...q, effects: [...q.effects] }));
        ignite(post, [4], 4, 1);
        expect(post[4].effects.some((e) => e.effect === '🌱')).toBe(false);
        expect(post[4].effects.some((e) => e.effect === '🔥')).toBe(true);
    });

    it('焚きつけ: 敵の🍂を全て取り除き、1枚につき🔥を1つ付ける（自陣・🔑は対象外）', () => {
        const b = emptyBoard();
        b[0] = lv('💙', 3, 1);
        b[1] = lv('⭕', 8, 3);
        b[2] = lv('⭕', 8, 1, '🔑');
        b[3] = sq('⭕', 8);
        expect(kindlingTargets(b, '💙', guard)).toEqual([1]);
        const r = kindling(b, [1], 4);
        expect(r.leaves).toBe(3);
        expect(b[1].effects.filter((e) => e.effect === '🍂')).toHaveLength(0);
        expect(flameStacks(b[1])).toBe(3);
        expect(b[0].effects).toHaveLength(1);
        expect(b[2].effects).toHaveLength(2);
    });

    it('焚きつけ: 敵の🌱も🔥に変わる（1つにつき🔥1つ）。冬至の種子のガード中のコマの🌱は対象外', () => {
        const b = emptyBoard();
        b[1] = { player: '⭕', bind: 8, effects: [{ effect: '🌱' }, { effect: '🌱' }, { effect: '🍂' }] };
        b[2] = { player: '⭕', bind: 8, effects: [{ effect: '🌱' }] }; // ガード中: 🌱だけなので対象外
        b[3] = { player: '⭕', bind: 8, effects: [{ effect: '🌱' }, { effect: '🍂' }] }; // ガード中: 🍂だけ燃える
        b[4] = { player: '💙', bind: 8, effects: [{ effect: '🌱' }] }; // 自陣は対象外
        const keep = (sq: SquareInfo) => sq === b[2] || sq === b[3];
        expect(kindlingTargets(b, '💙', guard, keep)).toEqual([1, 3]);
        const r = kindling(b, [1, 3], 4, keep);
        expect(r.leaves).toBe(2);
        expect(r.buds).toBe(2);
        expect(flameStacks(b[1])).toBe(3);
        expect(b[1].effects.filter((e) => e.effect === '🌱' || e.effect === '🍂')).toHaveLength(0);
        expect(flameStacks(b[3])).toBe(1);
        expect(b[3].effects.filter((e) => e.effect === '🌱')).toHaveLength(1);
        expect(b[4].effects).toHaveLength(1);
    });

    it('焚きつけ: 氷結中のコマは最初の1スタックが氷結の解除に使われ、🍂は全て消える', () => {
        const mk = (): SquareInfo[] => {
            const b = emptyBoard();
            b[1] = lv('⭕', 8, 2, '❄');
            b[5] = lv('⭕', 8, 1);
            b[6] = sq('⭕', 8, '❄');
            return b;
        };
        const a = mk();
        kindling(a, [1, 5], 4);
        expect(a[1].effects.filter((e) => e.effect === '🍂')).toHaveLength(0);
        expect(isFrozen(a[1])).toBe(false);
        expect(flameStacks(a[1])).toBe(1); // 2スタックのうち1つが❄の解除、残り1つが🔥
    });
});

describe('枯野の相席', () => {
    it('対象は盤面の全てのコマ（敵味方）のうち guarded でないもの。空きマスは対象外', () => {
        const b = emptyBoard();
        b[0] = sq('💙', 3);
        b[1] = sq('⭕', 3, '🔑');
        b[2] = sq('⭕', 3);
        const guard = (s: SquareInfo) => s.effects.some((e) => e.effect === '🔑');
        expect(leafAllTargets(b, guard)).toEqual([0, 2]);
    });
});

describe('落葉の衣', () => {
    it('対象は使用者のコマ全て（🔑ロック中も含む）。敵と空きマスは対象外', () => {
        const b = emptyBoard();
        b[0] = sq('💙', 3);
        b[1] = sq('💙', 3, '🔑');
        b[2] = sq('⭕', 3);
        expect(leafCloakTargets(b, '💙')).toEqual([0, 1]);
    });
});

describe('術中の加護（効果ダメージ無効の述語）', () => {
    afterEach(() => setEffectWard(() => false));

    it('述語が真のマスは、火炎・毒・帯電のダメージと火炎付与の即時ダメージを受けない', () => {
        setEffectWard((x) => x.player === '💙');
        const burning = sq('💙', 9, '🔥', '☠');
        expect(burnDamageOf(burning, [])).toBe(0);
        expect(decayTick(burning, []).bind).toBe(8); // 自然減衰の-1だけ
        expect(applyDamage(burning, 3, 'poison').dealt).toBe(0);
        expect(applyDamage(burning, 3, 'electric').dealt).toBe(0);
        expect(applyDamage(burning, 3, 'skill').dealt).toBeGreaterThan(0); // スキルのダメージは通る
        const board = [sq('💙', 9)];
        ignite(board, [0], 1);
        expect(board[0].bind).toBe(9);
        // 述語が偽の相手のマスには通常どおり
        expect(burnDamageOf(sq('⭕', 9, '🔥'), [])).toBeGreaterThan(0);
        const board2 = [sq('⭕', 9)];
        ignite(board2, [0], 1);
        expect(board2[0].bind).toBe(8);
    });
});
