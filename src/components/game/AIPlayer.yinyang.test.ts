import AIPlayer from './AIPlayer';
import { SquareInfo } from '../../types/SquareInfo';
import { Player } from '../../types/Player';
import { emptyBoard, put } from './aiTestUtils';

describe('陰陽師の式神運用 (旧sim AI shikigamiTurn と同一)', () => {
    const costs = { onClickShikigamiPlace: 3, onClickShikigamiBlast: 5, onClickShikigamiAll: 2, onClickShikigamiRandom: 2, onClickToggleYingYang: 1 } as any; // 式神一括は式神1体あたり2
    // 終盤の盤面: 行0(0〜3)だけが空き、残りは敵のコマ。百鬼夜行で空き4マスが式神になり、行0が敵のいない列になる
    const nearFull = (): SquareInfo[] => {
        const b = emptyBoard();
        // 行1〜3: ⭕⭕💙💙 / 💙💙⭕⭕ / ⭕⭕💙💙（どの列にもリーチが出ない並び）
        const pattern: Player[] = ['⭕', '⭕', '💙', '💙', '💙', '💙', '⭕', '⭕', '⭕', '⭕', '💙', '💙'];
        pattern.forEach((p, k) => put(b, 4 + k, p, 3));
        return b;
    };
    const shiki = (b: SquareInfo[], i: number, player: Player = '💙') => { b[i] = { player, bind: 2, effects: [{ effect: '📜' }] }; };
    const mk = () => new AIPlayer('💙', 'yinYangMaster', ['⭕']);

    it('氷結中の空きマスが行0の列を塞いでいるとき、隣の敵コマを火遁で燃やして氷結を溶かせば組めるなら、その敵コマを返す（組める盤面や溶かしても組めない盤面は null）', () => {
        const b = nearFull();
        put(b, 0, '💙', 3);
        b[1] = { player: undefined, bind: 0, effects: [{ effect: '❄' }] }; // 行0の1が氷結中の空きマス
        const ai = mk();
        expect(ai.floodComboWins(b)).toBe(false); // 氷結中のマスは式神にできないので列が完成しない
        expect(ai.comboThawTarget(b)).toBe(5); // 1の真下の5(敵を優先)を燃やすと1の氷結が溶けて組める
        const open = nearFull();
        put(open, 0, '💙', 3);
        expect(ai.comboThawTarget(open)).toBeNull(); // すでに組める
        const sealed = nearFull();
        put(sealed, 0, '💙', 3);
        sealed[1] = { player: undefined, bind: 0, effects: [{ effect: '❄' }] };
        sealed[5] = { player: '⭕', bind: 3, effects: [{ effect: '🔑' }] }; // 隣のコマがロック中で燃やせない
        sealed[0] = { player: '💙', bind: 3, effects: [{ effect: '🔑' }] };
        expect(ai.comboThawTarget(sealed)).toBeNull();
    });

    it('陰で魔力に余裕があれば、敵コマの近くに式神を置く', () => {
        const b = emptyBoard();
        put(b, 0, '⭕', 3);
        put(b, 1, '⭕', 3);
        const plan = mk().planShikigami(b, 14, costs, [0]);
        expect(plan?.clicks[0].skill).toBe('onClickShikigamiPlace');
        expect([4, 5, 6, 2].includes(plan!.clicks[0].target!)).toBe(true);
    });

    it('式神を置いたあとに魔力が残らない（貯めたい）ときは置かない', () => {
        const b = emptyBoard();
        put(b, 0, '⭕', 3);
        expect(mk().planShikigami(b, 8, costs, [0])).toBeNull();
    });

    it('爆破の価値がある式神があれば、陰からは転化して爆破する', () => {
        const b = emptyBoard();
        shiki(b, 5);
        put(b, 0, '⭕', 3);
        put(b, 1, '⭕', 3);
        const plan = mk().planShikigami(b, 12, costs, [0]);
        expect(plan?.clicks.map((c) => c.skill)).toEqual(['onClickToggleYingYang', 'onClickShikigamiBlast']);
        expect(plan?.clicks[1].target).toBe(5);
        // 爆破後: 式神は消え、敵の0・1は壊れ、周囲の空きマスは式神になる
        expect(plan!.board[5].player).toBeUndefined();
        expect(plan!.board[0].player).toBeUndefined();
        expect(plan!.board[4].effects.some((e) => e.effect === '📜')).toBe(true);
    });

    it('式神一括: 自コマ1+式神置き3で列を完成できる魔力があればコンボを組む', () => {
        const b = emptyBoard();
        put(b, 0, '💙', 3);
        const plan = mk().planShikigami(b, 15, costs, [71, 0]);
        expect(plan?.win).toBe(true);
        expect(plan?.clicks.map((c) => c.skill)).toEqual(['onClickShikigamiPlace', 'onClickShikigamiPlace', 'onClickShikigamiPlace', 'onClickShikigamiAll']);
        expect(mk().planShikigami(b, 11, costs, [71, 0])?.win ?? false).toBe(false); // 式神を置くパッシブ（2体目以降の設置と一括が各-1）で総額が3安く、最低魔力は12
    });

    it('百鬼夜行+式神一括: 空きマスを全て自コマにして列が完成するなら一手番でコンボを撃つ', () => {
        const flood = { ...costs, onClickShikigamiFlood: 7 };
        const b = nearFull(); // 式神になる空き4マス → 式神一括は 2×4 = 8
        const plan = mk().planShikigami(b, 15, flood, [73, 71]);
        expect(plan?.win).toBe(true);
        expect(plan?.clicks.map((c) => c.skill)).toEqual(['onClickShikigamiFlood', 'onClickShikigamiAll']);
        expect(mk().planShikigami(b, 13, flood, [73, 71])?.win ?? false).toBe(false); // 魔力が足りない
        // 序盤（空きが多い）は式神一括が式神の数に比例して重く、盤面を埋めるコンボは撃てない
        const early = emptyBoard();
        put(early, 0, '⭕', 3);
        expect(mk().planShikigami(early, 20, flood, [73, 71])?.win ?? false).toBe(false);
    });

    it('特売(53)が手札にあれば重ね撃ちしてコンボのコストを圧縮する（特売×2→百鬼夜行→特売×2→式神一括。終盤の盤面で 7+8=15 → 7）', () => {
        const withMd = { ...costs, onClickShikigamiFlood: 7, onClickMarkdown: 1 };
        const b = nearFull();
        const plan = mk().planShikigami(b, 7, withMd, [73, 71, 53]);
        expect(plan?.win).toBe(true);
        expect(plan?.clicks.map((c) => c.skill)).toEqual([
            'onClickMarkdown', 'onClickMarkdown', 'onClickShikigamiFlood', 'onClickMarkdown', 'onClickMarkdown', 'onClickShikigamiAll',
        ]);
        // 5魔力では足りない。特売が無ければ（式神を置くパッシブで-1して）7+7=14 必要
        expect(mk().planShikigami(b, 5, withMd, [73, 71, 53])?.win ?? false).toBe(false);
        expect(mk().planShikigami(b, 13, withMd, [73, 71])?.win ?? false).toBe(false);
    });

    it('シャッフル探索: 勝てる盤面でコンボ札が揃わず、魔力が足りるなら引き直す。揃っているか魔力が足りなければ引き直さない', () => {
        const dig = { ...costs, onClickShikigamiFlood: 7, onClickMarkdown: 1, onClickShuffle: 1 };
        const b = nearFull(); // 特売が引ける前提のコンボは 7 、探索に +1
        const ai = mk();
        ai.rerollsLeft = 8;
        expect(ai.makeMove(b, 8, dig, 3, 2, [2, 0, 3], false).reroll).toBeDefined(); // 札が無く、7+1 以上ある
        expect(ai.makeMove(b, 6, dig, 3, 2, [2, 0, 3], false).reroll).toBeUndefined(); // 魔力が足りない
        expect(ai.makeMove(b, 8, dig, 3, 2, [71, 73, 53], false).reroll).toBeUndefined(); // 揃っている
        ai.rerollsLeft = 0;
        expect(ai.makeMove(b, 8, dig, 3, 2, [2, 0, 3], false).reroll).toBeUndefined(); // 引き直しの回数切れ
    });

    it('デッキを把握している: コンボ札がデッキに無ければ、引き直しても揃わないので探さない。特売が無ければ「引ける前提」の計画にしない', () => {
        const dig = { ...costs, onClickShikigamiFlood: 7, onClickMarkdown: 1, onClickShuffle: 1 };
        const b = nearFull();
        const rest = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
        const mkDeck = (deck: number[]) => { const ai = new AIPlayer('💙', 'yinYangMaster', ['⭕'], [], undefined, false, false, deck); ai.rerollsLeft = 8; return ai; };
        expect(mkDeck([71, 73, ...rest]).makeMove(b, 20, dig, 3, 2, [2, 0, 3], false).reroll).toBeDefined(); // 札はデッキにある
        expect(mkDeck([73, 53, ...rest]).makeMove(b, 20, dig, 3, 2, [2, 0, 3], false).reroll).toBeUndefined(); // 百鬼夜行が無い
        expect(mkDeck([71, 53, ...rest]).makeMove(b, 20, dig, 3, 2, [2, 0, 3], false).reroll).toBeUndefined(); // 式神一括が無い
        const noMd = mkDeck([71, 73, ...rest]);
        expect(noMd.inDeck(53, [0])).toBe(false);
        expect(noMd.inDeck(53, [53])).toBe(true); // 手札にあればデッキにある
        // 特売が無いデッキの計画は、特売を引ける前提(assumeMd)でも特売なしのコストになる
        expect(noMd.comboPlan(b, dig, [0], true).total).toBeGreaterThan(mk().comboPlan(b, dig, [0], true).total);
    });

    it('チャージ待ち: 勝てる盤面で相手のリーチが無く、探索に足りない魔力なら、駒を置かずチャージする', () => {
        const dig = { ...costs, onClickShikigamiFlood: 7, onClickMarkdown: 1, onClickShuffle: 1 };
        const b = nearFull();
        const r = mk().makeMove(b, 4, dig, 3, 2, [2, 0, 3], false);
        expect(r.skills).toEqual(['onClickCharge']);
        expect(r.move).toBeNull();
        // 魔力が足りれば（探索に回る）チャージしない
        expect(mk().makeMove(b, 8, dig, 3, 2, [2, 0, 3], false).skills).not.toContain('onClickCharge');
        // 相手のリーチがあるときは防御を優先する
        const threat = emptyBoard();
        [4, 5, 6].forEach((i) => put(threat, i, '⭕'));
        expect(mk().makeMove(threat, 4, dig, 3, 2, [2, 0, 3], false).skills).not.toContain('onClickCharge');
    });

    it('引き直しのたびに固定し直すと、見つけたコンボ札は次のシャッフルで失われず、やがて3枚揃う（Game.tsx の reshuffledSkills と同じ規則）', () => {
        // Game.tsx reshuffledSkills: 固定(最大3)を残し、残り枠をデッキから埋める
        let seed = 12345;
        const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
        const deck = [0, 2, 3, 5, 6, 8, 10, 12, 71, 72, 73, 53];
        const reshuffle = (locks: number[]): number[] => {
            const keep = locks.slice(0, 3);
            const pool = deck.filter((i) => !keep.includes(i)).sort(() => rnd() - 0.5);
            return [...keep, ...pool.slice(0, 3 - keep.length)];
        };
        const ai = mk();
        let hand = reshuffle([]);
        let prevFound: number[] = [];
        for (let step = 0; step < 60 && !(hand.includes(71) && hand.includes(73) && hand.includes(53)); step++) {
            const locks = ai.chooseLocks(emptyBoard(), 0, 5, hand); // 引き直しのたび（再計画のたび）に走る
            hand = reshuffle(locks);
            prevFound.forEach((c) => expect(hand).toContain(c)); // 見つけた札は残る
            prevFound = locks;
        }
        expect([71, 73, 53].every((c) => hand.includes(c))).toBe(true);
    });

    it('コンボ札(71/73)と特売(53)を手札に固定する', () => {
        expect(mk().chooseLocks(emptyBoard(), 0, 5, [53, 71, 3, 73])).toEqual([53, 71, 73]);
    });

    it('コンボ札(71/73)だけを手札に固定する', () => {
        const ai = mk();
        expect(ai.chooseLocks(emptyBoard(), 0, 5, [0, 71, 3, 73])).toEqual([71, 73]);
        expect(ai.chooseLocks(emptyBoard(), 0, 5, [0, 2, 3])).toEqual([]);
    });

    it('コンボ札を持っていて魔力が足りないうちは、他のスキルに魔力を使わず貯める。相手のリーチがあるときは防御する', () => {
        const hold = { ...costs, onClickShikigamiFlood: 7, onClickBuds: 2, onClickAddLife: 3 };
        const b = emptyBoard();
        put(b, 0, '⭕', 3);
        const r = mk().makeMove(b, 8, hold, 3, 2, [71, 2, 0], false);
        expect(r.skills).toEqual([]);
        expect(r.chargeClicks).toBeUndefined();
        // 札が無いときは従来どおり撃つ
        const free = mk().makeMove(b, 8, hold, 3, 2, [2, 0, 3], false);
        expect(free.skills.length + (free.chargeClicks?.length ?? 0)).toBeGreaterThan(0);
    });

    it('式神は列に数えない: 式神を含む列はリーチ扱いにならず、式神は脅威にも数えない', () => {
        const ai = mk();
        const b = emptyBoard();
        [0, 1, 2].forEach((i) => put(b, i, '⭕'));
        shiki(b, 3, '⭕');
        expect(ai.countReaches(b, '⭕')).toBe(0);
        expect(ai.findThreatSquares(b, '⭕')).not.toContain(3);
    });
});

describe('ネクロマンサー: 割引札のロックと対陰陽師の列カバー', () => {
    // seat0=💙 ネクロ / seat1=⭕ 陰陽師
    const mk = (oppChar: 'yinYangMaster' | 'giant') => new AIPlayer('💙', 'necromancer', ['⭕'], ['necromancer', oppChar]);

    it('割引札(特売53・固有割引57・大特価58)を手札に固定する(降霊のコストを圧縮するため)', () => {
        const locks = mk('giant').chooseLocks(emptyBoard(), 0, 5, [3, 57, 53, 58]);
        expect(locks).toHaveLength(2); // 最大2つ
        locks.forEach((i) => expect([53, 57, 58]).toContain(i));
    });

    it('割引札以外はこれまでどおり(盤面で価値が低ければ固定しない)', () => {
        expect(mk('giant').chooseLocks(emptyBoard(), 0, 5, [27, 28])).toEqual([]);
    });

    it('相手に陰陽師がいるかを見分ける', () => {
        expect((mk('yinYangMaster') as any).facingYinYang()).toBe(true);
        expect((mk('giant') as any).facingYinYang()).toBe(false);
    });

    it('自コマが入っている勝ち筋の列の数を数える(百鬼夜行→式神一括は自コマが入った列には効かない)', () => {
        const ai = mk('yinYangMaster') as any;
        expect(ai.coveredLines(emptyBoard())).toBe(0);
        const b = emptyBoard();
        put(b, 5, '💙'); // 4x4: 行1・列1・主対角の3本
        expect(ai.coveredLines(b)).toBe(3);
        put(b, 6, '💙'); // 行1は既に数え済み。列2と反対角が増える
        expect(ai.coveredLines(b)).toBe(5);
    });
});
