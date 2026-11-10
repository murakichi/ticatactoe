import AIPlayer from './AIPlayer';
import { SquareInfo } from '../../types/SquareInfo';
import { Player } from '../../types/Player';
import { calculateWinner } from '../../util';
import { geometryForCells } from './boardGeometry';
import { emptyBoard, put } from './aiTestUtils';

describe('calculateWinner', () => {
    it('detects a row win', () => {
        const b = emptyBoard();
        [0, 1, 2, 3].forEach((i) => put(b, i, '💙'));
        expect(calculateWinner(b.map((s) => s.player))).toBe('💙');
    });
    it('detects a diagonal win', () => {
        const b = emptyBoard();
        [0, 5, 10, 15].forEach((i) => put(b, i, '⭕'));
        expect(calculateWinner(b.map((s) => s.player))).toBe('⭕');
    });
    it('no winner on empty board', () => {
        expect(calculateWinner(emptyBoard().map((s) => s.player))).toBeUndefined();
    });
});

describe('AIPlayer pure logic', () => {
    const ai = new AIPlayer('💙', 'you', ['⭕']);

    it('countReaches counts a 3-in-a-row with empty 4th', () => {
        const b = emptyBoard();
        [0, 1, 2].forEach((i) => put(b, i, '💙'));
        expect(ai.countReaches(b, '💙')).toBe(1);
    });

    it('findThreatSquares returns the completing cell', () => {
        const b = emptyBoard();
        [0, 1, 2].forEach((i) => put(b, i, '⭕'));
        expect(ai.findThreatSquares(b, '⭕')).toContain(3);
    });

    it('simulatePlace: empty cell gets my piece at life', () => {
        const nb = ai.simulatePlace(emptyBoard(), 5, '💙', 5);
        expect(nb[5].player).toBe('💙');
        expect(nb[5].bind).toBe(5);
    });

    it('simulatePlace: captures a bind-0 enemy', () => {
        const b = emptyBoard();
        b[5] = { player: '⭕', bind: 0, effects: [] };
        expect(ai.simulatePlace(b, 5, '💙', 5)[5].player).toBe('💙');
    });

    it('getBestMove takes an immediate win', () => {
        const b = emptyBoard();
        [0, 1, 2].forEach((i) => put(b, i, '💙'));
        expect(ai.getBestMove(b, 5)).toBe(3);
    });

    it('getBestMove blocks an opponent win', () => {
        const b = emptyBoard();
        [4, 5, 6].forEach((i) => put(b, i, '⭕'));
        expect(ai.getBestMove(b, 5)).toBe(7);
    });
});

describe('AIPlayer signature-skill targeting (uses shared boardGeometry)', () => {
    it('giant findStompTarget fires with >=1 enemy in range (stomp costs 2)', () => {
        const giant = new AIPlayer('💙', 'giant', ['⭕']);
        const two = emptyBoard();
        put(two, 0, '⭕');
        put(two, 1, '⭕');
        expect(giant.findStompTarget(two)).not.toBeNull();

        const one = emptyBoard();
        put(one, 0, '⭕');
        expect(giant.findStompTarget(one)).not.toBeNull();

        expect(giant.findStompTarget(emptyBoard())).toBeNull();
    });

    it('giant applyAuraSim: 周囲の敵コマを壊し、周囲8マスをロックする', () => {
        const giant = new AIPlayer('💙', 'giant', ['⭕']);
        const b = emptyBoard();
        put(b, 0, '⭕', 3);
        put(b, 2, '💙', 3);
        const sim = giant.applyAuraSim(b.map((sq) => ({ ...sq, effects: [...sq.effects] })), 1);
        expect(sim[0].player).toBeUndefined();
        expect(sim[0].effects.some((e) => e.effect === '🔑')).toBe(true);
        expect(sim[2].player).toBe('💙');
        expect(sim[2].effects.some((e) => e.effect === '🔑')).toBe(true);
    });

    it('giant stomps to cut an opponent reach before locking (stompDef)', () => {
        const giant = new AIPlayer('💙', 'giant', ['⭕']);
        const b = emptyBoard();
        [0, 1, 2].forEach((i) => put(b, i, '⭕', 3)); // ⭕が3つ並び、4つ目の3が脅威
        const stompCosts = { onClickStomp: 3, onClickUseLock: 2 } as never;
        const r = giant.makeMove(b, 6, stompCosts, 2, 5, [], false);
        expect(r.skills).toEqual(['onClickStomp']);
        expect(r.stompTarget).not.toBeNull();
    });

    it('magician findJudgeTarget fires when net enemy destruction >=2', () => {
        const mag = new AIPlayer('💙', 'magician', ['⭕']);
        const b = emptyBoard();
        [0, 1, 2].forEach((i) => put(b, i, '⭕'));
        expect(mag.findJudgeTarget(b)).not.toBeNull();
    });
});

describe('AIPlayer 多人数', () => {
    const emptyN = (size: number): SquareInfo[] => Array.from({ length: size * size }, () => ({ player: undefined, bind: 0, effects: [] }));
    const putN = (b: SquareInfo[], i: number, player: Player, bind = 5): void => {
        b[i] = { player, bind, effects: [] };
    };

    it('3人戦(5x5): 2人の敵のうち片方のリーチも塞ぐ', () => {
        const ai = new AIPlayer('💙', 'you', ['⭕', '🟩']);
        const b = emptyN(5);
        [5, 6, 7].forEach((i) => putN(b, i, '🟩'));
        putN(b, 20, '⭕');
        // 5x5 の行は [5,6,7,8] か [4,5,6,7] で4連続 → 8 か 4 を塞ぐ必要がある（どちらかを塞げば即死は避けられる）
        expect([4, 8]).toContain(ai.getBestMove(b, 5));
    });

    it('3人戦: 自分の4連続完成を最優先する', () => {
        const ai = new AIPlayer('🟩', 'you', ['💙', '⭕']);
        const b = emptyN(5);
        [10, 11, 12].forEach((i) => putN(b, i, '🟩'));
        [0, 1, 2].forEach((i) => putN(b, i, '💙'));
        expect([9, 13]).toContain(ai.getBestMove(b, 5));
    });

    it('findThreatSquares / countReaches は他の敵コマが混ざったラインを数えない', () => {
        const ai = new AIPlayer('💙', 'you', ['⭕', '🟩']);
        const b = emptyN(5);
        [0, 1, 2].forEach((i) => putN(b, i, '⭕'));
        putN(b, 3, '🟩');
        expect(ai.countReaches(b, '⭕')).toBe(0);
        expect(ai.findThreatSquares(b, '⭕')).not.toContain(3);
    });

    it('巨人のストンプ対象は複数の敵コマを数える', () => {
        const giant = new AIPlayer('💙', 'giant', ['⭕', '🟩']);
        const b = emptyN(6);
        putN(b, 0, '⭕');
        putN(b, 1, '🟩');
        expect(giant.findStompTarget(b)).not.toBeNull();
    });

    it('8人戦(7x7)でもmakeMoveが妥当な手を返し、実用的な時間で終わる', () => {
        const symbols: Player[] = ['💙', '⭕', '🟩', '🔶', '⭐', '🟣', '🟫', '🩷'];
        const b = emptyN(7);
        symbols.forEach((p, k) => {
            putN(b, k * 6, p, 3);
            putN(b, k * 6 + 1, p, 3);
        });
        const ai = new AIPlayer('💙', 'you', symbols.slice(1));
        const costs = { onClickToken: 4 } as never;
        const t0 = Date.now();
        const result = ai.makeMove(b, 2, costs, 2, 5, [0, 3], false);
        expect(Date.now() - t0).toBeLessThan(5000);
        expect(result.move).not.toBeNull();
        expect(b[result.move as number].player === undefined || b[result.move as number].bind <= 0).toBe(true);
    });

    it('10x10 でも2人戦のAIが実用的な時間で手を返す', () => {
        const b = emptyN(10);
        for (let k = 0; k < 12; k++) putN(b, k * 7, k % 2 ? '⭕' : '💙', 3);
        const ai = new AIPlayer('💙', 'you', ['⭕']);
        const t0 = Date.now();
        const move = ai.getBestMove(b, 5);
        expect(Date.now() - t0).toBeLessThan(5000);
        expect(move).not.toBeNull();
    });
});

describe('ヘイルメアリー (詰みでの使用)', () => {
    const costs = { onClickHailMary: 6, onClickUseLock: 2, onClickDoubleLock: 3, onClickTripleLock: 4 } as any;
    // ⭕が3つの脅威マス(3, 12, 15)を同時に持つ: 単ロックでは塞げない
    const lostBoard = () => {
        const b = emptyBoard();
        [0, 1, 2, 4, 8, 5, 10].forEach((i) => put(b, i, '⭕'));
        return b;
    };

    it('ロックで防げない詰みなら、魔力が足りてスロットにあれば使う', () => {
        const ai = new AIPlayer('💙', 'you', ['⭕']);
        const r = ai.makeMove(lostBoard(), 10, costs, 0, 5, [27, 0, 1], false);
        expect(r.hailMary).toBe(true);
    });
    it('魔力不足・スロットなし・自分に即勝ちがあるときは使わない', () => {
        const ai = new AIPlayer('💙', 'you', ['⭕']);
        expect(ai.makeMove(lostBoard(), 5, costs, 0, 5, [27, 0, 1], false).hailMary).toBeUndefined();
        expect(ai.makeMove(lostBoard(), 10, costs, 0, 5, [0, 1, 2], false).hailMary).toBeUndefined();
        const b = lostBoard();
        [13, 14, 15].forEach((i) => put(b, i, '💙')); // 12 に置けば 💙 の勝ち
        expect(ai.makeMove(b, 10, costs, 0, 5, [27, 0, 1], false).hailMary).toBeUndefined();
    });
    it('planHailMary: ストンプは敵の脅威を減らす中心を返し、審判の日は着手を返さない', () => {
        const ai = new AIPlayer('💙', 'you', ['⭕']);
        const stomp = ai.planHailMary(lostBoard(), 'ストンプ', 5);
        expect(stomp.target).not.toBeNull();
        expect(ai.planHailMary(lostBoard(), '審判の日', 5).move).toBeNull();
        expect(ai.planHailMary(lostBoard(), '蘇生', 5).target).toBeNull();
    });
});

describe('サイレンス (先回りの封印)', () => {
    const costs = { onClickSilence: 5 } as any;
    const quiet = () => {
        const b = emptyBoard();
        put(b, 0, '💙');
        put(b, 15, '⭕');
        return b;
    };
    it('相手が次の手番に固有スキルを撃てそうなら使う', () => {
        const ai = new AIPlayer('💙', 'you', ['⭕'], ['you', 'giant']);
        const r = ai.makeMove(quiet(), 8, costs, 5, 5, [28, 0, 1], false, 0, 0, 99, 99, false, [8, 5]);
        expect(r.skills).toContain('onClickSilence');
    });
    it('相手の魔力が足りない・固有スキルがない・スロットにない・魔力不足なら使わない', () => {
        const ai = new AIPlayer('💙', 'you', ['⭕'], ['you', 'giant']);
        expect(ai.makeMove(quiet(), 8, costs, 3, 5, [28, 0, 1], false, 0, 0, 99, 99, false, [8, 3]).skills).not.toContain('onClickSilence');
        expect(ai.makeMove(quiet(), 8, costs, 9, 5, [0, 1, 2], false, 0, 0, 99, 99, false, [8, 9]).skills).not.toContain('onClickSilence');
        expect(ai.makeMove(quiet(), 4, costs, 9, 5, [28, 0, 1], false, 0, 0, 99, 99, false, [4, 9]).skills).not.toContain('onClickSilence');
        const plain = new AIPlayer('💙', 'you', ['⭕'], ['you', 'fighter']);
        expect(plain.makeMove(quiet(), 8, costs, 9, 5, [28, 0, 1], false, 0, 0, 99, 99, false, [8, 9]).skills).not.toContain('onClickSilence');
    });
});

describe('軽減札を先に撃って通常スキルを撃てるようにする', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { skillCosts } = require('./skillCosts');
    const run = (magic: number, hand: number[]) => {
        const ai = new AIPlayer('💙', 'you', ['⭕'], ['you', 'you']);
        const b: SquareInfo[] = Array.from({ length: 16 }, () => ({ player: undefined, bind: 0, effects: [] }));
        // 劣勢（敵3コマ・自陣なし）で、敵が斜めに2つ並んでいる → スラッシュ（5）を撃つ
        [0, 3, 6].forEach((i) => (b[i] = { player: '⭕', bind: 5, effects: [] }));
        return ai.makeMove(b, magic, skillCosts, 2, 5, hand, false);
    };
    it('魔力4ではスラッシュ（5）を撃てないが、特売（1）を先に撃てばスラッシュが2で撃てる', () => {
        expect(run(4, [5, 12, 0]).skills).not.toContain('onClickSlash');
        const r = run(4, [53, 5, 12]);
        expect(r.chargeClicks?.map((c) => c.skill)).toEqual(['onClickMarkdown']);
        expect(r.skills).toContain('onClickSlash');
    });
    it('撃てるスキルが増えなくても、特売のコストより軽減が大きく魔力が余るなら先に撃つ', () => {
        expect(run(5, [53, 5, 12]).chargeClicks?.map((c) => c.skill)).toEqual(['onClickMarkdown']);
    });
    it('軽減札が手札にない・撃てるスキルが無いなら軽減札は撃たない', () => {
        expect(run(5, [5, 12, 0]).chargeClicks).toBeUndefined();
        expect(run(0, [53, 5, 12]).chargeClicks).toBeUndefined();
    });
});

describe('AIPlayer: 着手後の減衰で奪われる自コマ', () => {
    it('ライフ1の自コマが減衰で0になり相手の4つ目になるなら、その自コマを補強する', () => {
        const ai = new AIPlayer('💙', 'you', ['⭕']);
        const b = emptyBoard();
        put(b, 0, '💙', 1);
        [1, 2, 3].forEach((i) => put(b, i, '⭕', 5));
        expect(ai.getBestMove(b, 3)).toBe(0);
    });

    it('3人以上で減衰しない着手なら、ライフ1のコマを見込みで守らなくてよい', () => {
        const ai = new AIPlayer('💙', 'you', ['⭕', '🟩'], ['you', 'you', 'you']);
        ai.seatCount = 3;
        ai.placements = 1; // 1 % 3 !== 0: この着手では減衰しない
        const b = emptyBoard();
        put(b, 0, '💙', 1);
        [1, 2, 3].forEach((i) => put(b, i, '⭕', 5));
        expect(ai.simulatePlace(b, 5, '💙', 3, 0)[0].bind).toBe(1);
        ai.placements = 0;
        expect(ai.simulatePlace(b, 5, '💙', 3, 0)[0].bind).toBe(0);
    });
});

describe('AIPlayer: 補強は必要なときだけ', () => {
    it('奪われても負けないライフ1の自コマは補強の候補にしない', () => {
        const ai = new AIPlayer('💙', 'you', ['⭕']);
        const b = emptyBoard();
        put(b, 0, '💙', 1);
        [5, 6].forEach((i) => put(b, i, '⭕', 5));
        expect(ai.reinforceMoves(b, 3)).toEqual([]);
    });
    it('奪われると相手が4つ揃うライフ1の自コマは補強の候補にする', () => {
        const ai = new AIPlayer('💙', 'you', ['⭕']);
        const b = emptyBoard();
        put(b, 0, '💙', 1);
        [1, 2, 3].forEach((i) => put(b, i, '⭕', 5));
        expect(ai.reinforceMoves(b, 3)).toEqual([0]);
    });
});

describe('AIPlayer 土壇場の防壁 (lastStandReady)', () => {
    // ⭕が3と7の二箇所で勝ち筋を持つ(片方しか塞げない)。💙は8,9で並べている
    const setup = () => {
        const b = emptyBoard();
        [0, 1, 2, 4, 5, 6].forEach((i) => put(b, i, '⭕'));
        [8, 9].forEach((i) => put(b, i, '💙'));
        return b;
    };

    it('防壁なしなら相手の即勝ちマス(3か7)を塞ぐ', () => {
        const ai = new AIPlayer('💙', 'tactician', ['⭕']);
        expect([3, 7]).toContain(ai.getBestMove(setup(), 3));
    });

    it('防壁が未発動なら塞ぎ手を強制せず、自分の列(10)を伸ばす', () => {
        const ai = new AIPlayer('💙', 'tactician', ['⭕']);
        ai.lastStandReady = true;
        expect([3, 7]).not.toContain(ai.getBestMove(setup(), 3));
    });
});

describe('AIPlayer 対策ロックと絶対零度（膠着の修正 #300）', () => {
    const ai = new AIPlayer('💙', 'cryomancer', ['⭕']);
    it('対策ロックは氷結中の自コマを対象にしない（氷室はロック=氷結で、同じコマを毎手番凍らせ続けていた）', () => {
        const b = emptyBoard();
        b[5] = { player: '💙', bind: 2, effects: [{ effect: '❄' }] };
        b[6] = { player: '💙', bind: 3, effects: [] };
        expect(ai.findAntiNecroLockTarget(b)).toBe(6);
        b[6] = { player: '💙', bind: 3, effects: [{ effect: '❄' }] };
        expect(ai.findAntiNecroLockTarget(b)).toBeNull();
    });
    it('対策ロックは、残りスタックが2以下のロック済みコマを延長の対象にする（3以上は対象にしない）', () => {
        const mk = (stack: number) => {
            const b = emptyBoard();
            b[5] = { player: '💙', bind: 2, effects: [{ effect: '🔑', stack }] };
            return b;
        };
        const mage = new AIPlayer('💙', 'magician', ['⭕']);
        expect(mage.findAntiNecroLockTarget(mk(2))).toBe(5);
        expect(mage.findAntiNecroLockTarget(mk(3))).toBeNull();
        expect(ai.findAntiNecroLockTarget(mk(1))).toBe(5);
        expect(ai.findAntiNecroLockTarget(mk(4))).toBeNull();
    });
    it('絶対零度は🔑ロック中の敵コマを数えない', () => {
        const b = emptyBoard();
        [0, 1, 2].forEach((i) => { b[i] = { player: '⭕', bind: 4, effects: [{ effect: '🔑' }] }; });
        expect(ai.shouldGlacier(b)).toBe(false);
        [3, 4, 5].forEach((i) => put(b, i, '⭕', 4));
        expect(ai.shouldGlacier(b)).toBe(true);
    });
});

describe('AIPlayer 軍師の氷結トークン（凍ったコマは☠🔥のダメージを受けない）', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { skillCosts } = require('./skillCosts');
    const tac = () => new AIPlayer('💙', 'tactician', ['⭕'], ['tactician', 'poisoner']);

    it('軍師も氷結トークン(45)・氷結ダブルトークン(46)を撃つ', () => {
        expect(tac().makeMove(emptyBoard(), 22, skillCosts, 2, 5, [45], false).skills).toContain('onClickFrostToken');
        expect(tac().makeMove(emptyBoard(), 22, skillCosts, 2, 5, [46], false).skills).toContain('onClickDoubleFrostToken');
    });
    it('氷結トークンを手札に固定する（毎手番撃てるように）', () => {
        expect(tac().chooseLocks(emptyBoard(), 0, 5, [45, 46, 3, 28])).toEqual(expect.arrayContaining([45]));
    });
    it('氷結札を使うのは軍師・氷室・毒使いだけ（巨人は撃たない）', () => {
        const giant = new AIPlayer('💙', 'giant', ['⭕'], ['giant', 'poisoner']);
        expect(giant.makeMove(emptyBoard(), 22, skillCosts, 2, 5, [45], false).skills).not.toContain('onClickFrostToken');
    });
});

describe('魔力が有り余るとき（多人数戦・防壁で長引いた試合）', () => {
    const { skillCosts } = require('./skillCosts');
    const you = () => new AIPlayer('💙', 'you', ['⭕', '🟩'], ['you', 'poisoner', 'witch']);

    it('魔力に余裕があればライフ+3とバイバインで置くコマを厚くする。余裕が無ければ撃たない', () => {
        const rich = you().makeMove(emptyBoard(), 20, skillCosts, 2, 5, [0, 1], false).skills;
        expect(rich).toEqual(['onClickAddLife', 'onClickBibine']);
        expect(you().makeMove(emptyBoard(), 8, skillCosts, 2, 5, [0, 1], false).skills).toEqual([]);
    });

    it('魔力が大きく余り、使う額が少ない手札なら、引き直し回数を使い切っても引き直す', () => {
        const ai = you();
        ai.rerollsLeft = 0;
        expect(ai.makeMove(emptyBoard(), 40, skillCosts, 2, 5, [3], false).reroll).toBeDefined();
        const spent = you();
        spent.rerollsLeft = 0;
        expect(spent.makeMove(emptyBoard(), 20, skillCosts, 2, 5, [3], false).reroll).toBeUndefined();
        const deep = you();
        deep.rerollsLeft = -8;
        expect(deep.makeMove(emptyBoard(), 40, skillCosts, 2, 5, [], false).reroll).toBeUndefined();
    });

    it('魔力が有り余るときは、劣勢でなくても斜めの敵コマを一掃するスラッシュを撃つ', () => {
        const geo = geometryForCells(16);
        const b = emptyBoard();
        geo.antiDiagonal.slice(0, 2).forEach((i) => { b[i] = { player: '⭕', bind: 4, effects: [] }; });
        expect(you().makeMove(b, 22, skillCosts, 2, 5, [5], false).skills).toContain('onClickSlash');
        expect(you().makeMove(b, 8, skillCosts, 2, 5, [5], false).skills).not.toContain('onClickSlash');
    });

    it('魔力が有り余るとき、敵コマが多ければオピウムを撃つ', () => {
        const b = emptyBoard();
        [0, 2, 5, 7, 10].forEach((i) => { b[i] = { player: i % 2 ? '🟩' : '⭕', bind: 4, effects: [] }; });
        expect(you().makeMove(b, 30, skillCosts, 2, 5, [8], false).skills).toContain('onClickOpium');
        expect(you().makeMove(b, 10, skillCosts, 2, 5, [8], false).skills).not.toContain('onClickOpium');
    });
});

describe('巨人のストンプ連打（1手番で4つ並べる）', () => {
    const { skillCosts } = require('./skillCosts');
    const giant = () => new AIPlayer('💙', 'giant', ['⭕'], ['giant', 'you']);

    it('魔力が足りれば、ストンプを連打して1列を自陣にして勝つ。足りなければ連打しない', () => {
        const b = emptyBoard();
        const r = giant().makeMove(b, 12, skillCosts, 2, 5, [], false);
        const clicks = r.chargeClicks ?? [];
        expect(clicks.length).toBe(4);
        expect(clicks.every((c) => c.skill === 'onClickStomp' && c.target !== undefined)).toBe(true);
        const none = giant().makeMove(b, 6, skillCosts, 2, 5, [], false);
        expect(none.chargeClicks ?? []).toEqual([]);
    });

    it('今すぐ着手で勝てるならストンプは撃たない。2つ並びなら残り2マスをストンプ2回で揃える', () => {
        const b = emptyBoard();
        [0, 1, 2].forEach((i) => { b[i] = { player: '💙', bind: 6, effects: [] }; });
        const direct = giant().makeMove(b, 3, skillCosts, 2, 5, [], false);
        expect(direct.chargeClicks ?? []).toEqual([]);
        expect(direct.move).toBe(3);
        const two = emptyBoard();
        [0, 1].forEach((i) => { two[i] = { player: '💙', bind: 6, effects: [] }; });
        const r = giant().makeMove(two, 6, skillCosts, 2, 5, [], false);
        expect(r.chargeClicks).toEqual([{ skill: 'onClickStomp', target: 2 }, { skill: 'onClickStomp', target: 3 }]);
    });
});

describe('追い剥ぎ・砕氷の連打（魔力が有り余るとき）', () => {
    const { skillCosts } = require('./skillCosts');

    it('電気技師: 列の足りないマスがライフ0の敵コマと最後の空き1マスだけなら、追い剥ぎを連打して着手で揃える', () => {
        const ai = new AIPlayer('💙', 'electrician', ['⭕'], ['electrician', 'you']);
        const b = emptyBoard();
        b[0] = { player: '💙', bind: 5, effects: [] };
        b[1] = { player: '⭕', bind: 0, effects: [] };
        b[2] = { player: '⭕', bind: 0, effects: [] };
        const r = ai.makeMove(b, 12, skillCosts, 2, 5, [52], false);
        expect(r.chargeClicks).toEqual([{ skill: 'onClickPlunder', target: 1 }, { skill: 'onClickPlunder', target: 2 }]);
        expect(r.move).toBe(3);
        expect(ai.makeMove(b, 12, skillCosts, 2, 5, [], false).chargeClicks ?? []).toEqual([]);
    });

    it('氷室の番人: 氷結を重ねてから砕氷で敵コマを壊す', () => {
        const ai = new AIPlayer('💙', 'cryomancer', ['⭕'], ['cryomancer', 'you']);
        const b = emptyBoard();
        [0, 1].forEach((i) => { b[i] = { player: '⭕', bind: 3, effects: [] }; });
        const r = ai.makeMove(b, 22, skillCosts, 2, 5, [47], false);
        const names = (r.chargeClicks ?? []).map((c) => c.skill);
        expect(names).toContain('onClickShatter');
        expect(names.indexOf('onClickUseLock')).toBeLessThan(names.indexOf('onClickShatter'));
    });
});

describe('「あなた」の相手別の手札固定', () => {
    const locksVs = (foe: 'witch' | 'giant' | 'electrician', avail: number[]) =>
        new AIPlayer('💙', 'you', ['⭕'], ['you', foe]).chooseLocks(emptyBoard(), 0, 5, avail);
    it('相手が魔女・雷霆の巫なら一寸の虫(92)を固定する（固定しない相手には出ない）', () => {
        expect(locksVs('witch', [92, 2, 8])).toContain(92);
        expect(locksVs('electrician', [92, 2, 8])).toContain(92);
        expect(locksVs('giant', [92, 2, 8])).not.toContain(92);
    });
    it('相手が複数キャラのときは固定しない', () => {
        const ai = new AIPlayer('💙', 'you', ['⭕', '🟩'], ['you', 'witch', 'giant']);
        expect(ai.chooseLocks(emptyBoard(), 0, 5, [92, 2, 8])).not.toContain(92);
    });
});

describe('毒使い×氷室の番人: 閻魔の舌(125)', () => {
    const { skillCosts } = require('./skillCosts');
    const quiet = () => {
        const b = emptyBoard();
        b[5] = { player: '💙', bind: 6, effects: [] };
        b[10] = { player: '⭕', bind: 4, effects: [] };
        return b;
    };
    const poisoner = (foe: 'cryomancer' | 'you') => new AIPlayer('💙', 'poisoner', ['⭕'], ['poisoner', foe]);

    it('相手が氷室の番人なら、閻魔の舌を置く。氷室でなければ置かない', () => {
        const vs = poisoner('cryomancer').makeMove(quiet(), 20, skillCosts, 2, 5, [125], false);
        expect((vs.chargeClicks ?? []).map((c) => c.skill)).toContain('onClickTongueKing');
        const other = poisoner('you').makeMove(quiet(), 20, skillCosts, 2, 5, [125], false);
        expect((other.chargeClicks ?? []).map((c) => c.skill)).not.toContain('onClickTongueKing');
    });

    it('自陣に舌が立っていれば、もう置かない。手札に固定するのは舌が無いときだけ', () => {
        const b = quiet();
        b[0] = { player: '💙', bind: 5, object: 'tongueKing', effects: [] };
        const r = poisoner('cryomancer').makeMove(b, 20, skillCosts, 2, 5, [125], false);
        expect((r.chargeClicks ?? []).map((c) => c.skill)).not.toContain('onClickTongueKing');
        expect(poisoner('cryomancer').chooseLocks(quiet(), 0, 5, [125])).toEqual([125]);
        expect(poisoner('cryomancer').chooseLocks(b, 0, 5, [125])).not.toEqual([125]);
        expect(poisoner('you').chooseLocks(quiet(), 0, 5, [125])).not.toEqual([125]);
    });
});

describe('魔女・陰陽師は巨人相手の最初の手番で置かずにチャージする', () => {
    const costs = { onClickCharge: 0 } as any;
    const mk = (ch: any, opp: any) => new AIPlayer('💙', ch, ['⭕'], ['witch' === ch ? 'witch' : ch, opp] as any);
    it('魔女 vs 巨人: 自コマが無く魔力が少ないときはチャージ', () => {
        const ai = mk('witch', 'giant');
        const r = ai.makeMove(emptyBoard(), 2, costs, 2, 7, [0, 1, 2], false);
        expect(r.move).toBeNull();
        expect(r.skills).toContain('onClickCharge');
    });
    it('陰陽師 vs 巨人でも同じ。電気技師 vs 巨人では置く', () => {
        const yy = mk('yinYangMaster', 'giant').makeMove(emptyBoard(), 2, costs, 2, 7, [0, 1, 2], false);
        expect(yy.move).toBeNull();
        expect(yy.skills).toContain('onClickCharge');
        expect(mk('electrician', 'giant').makeMove(emptyBoard(), 2, costs, 2, 7, [0, 1, 2], false).move).not.toBeNull();
    });
    it('魔力が貯まったあと・自コマがあるとき・巨人以外が相手のときは通常どおり着手', () => {
        const ai = mk('witch', 'giant');
        expect(ai.makeMove(emptyBoard(), 5, costs, 2, 7, [0, 1, 2], false).move).not.toBeNull();
        const b = emptyBoard();
        put(b, 5, '💙');
        expect(ai.makeMove(b, 2, costs, 2, 7, [0, 1, 2], false).move).not.toBeNull();
        expect(mk('witch', 'electrician').makeMove(emptyBoard(), 2, costs, 2, 7, [0, 1, 2], false).move).not.toBeNull();
    });
});
