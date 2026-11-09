import AIPlayer from './AIPlayer';
import { SquareInfo } from '../../types/SquareInfo';
import { emptyBoard, put } from './aiTestUtils';

describe('毒使いのミアズマと毒花 (旧sim AI と同じ動き)', () => {
    const costs = { onClickInjection: 2, onClickMiasma: 6, onClickToken: 4 } as never;
    const poisonedPiece = (bind: number, poison = 1): SquareInfo => ({
        player: '💙',
        bind,
        effects: Array.from({ length: poison }, () => ({ effect: '☠' as const })),
    });

    it('自陣の毒マスの周囲に敵が2マス以上いれば、ミアズマを撃つ', () => {
        const b = emptyBoard();
        b[5] = poisonedPiece(6);
        put(b, 6, '⭕', 3);
        put(b, 9, '⭕', 3);
        const ai = new AIPlayer('💙', 'poisoner', ['⭕']);
        const r = ai.makeMove(b, 10, costs, 2, 5, [], false);
        expect(r.skills).toContain('onClickMiasma');
    });

    it('周囲の敵マスが氷結中(毒が休眠して効かない)なら、数えずミアズマを撃たない', () => {
        const frozen = (b: SquareInfo[], i: number) => b[i].effects.push({ effect: '❄' as const });
        const b = emptyBoard();
        b[5] = poisonedPiece(6);
        put(b, 6, '⭕', 3);
        put(b, 9, '⭕', 3);
        frozen(b, 6);
        frozen(b, 9);
        const ai = new AIPlayer('💙', 'poisoner', ['⭕']);
        expect(ai.makeMove(b, 10, costs, 2, 5, [], false).skills).not.toContain('onClickMiasma');
        // 片方だけ氷結なら、効く敵マスは1つだけ(リーチ列でもない)ので撃たない。両方溶ければ撃つ
        const half = emptyBoard();
        half[5] = poisonedPiece(6);
        put(half, 6, '⭕', 3);
        put(half, 9, '⭕', 3);
        frozen(half, 6);
        expect(new AIPlayer('💙', 'poisoner', ['⭕']).makeMove(half, 10, costs, 2, 5, [], false).skills).not.toContain('onClickMiasma');
    });

    it('敵が周囲に1マスだけ(リーチ列でもない)ならミアズマは撃たない', () => {
        const b = emptyBoard();
        b[5] = poisonedPiece(6);
        put(b, 6, '⭕', 3);
        const ai = new AIPlayer('💙', 'poisoner', ['⭕']);
        expect(ai.makeMove(b, 10, costs, 2, 5, [], false).skills).not.toContain('onClickMiasma');
    });

    it('毒花を装備した毒使いは、インジェクションが手札にあれば敵に隣接する自コマへ毒を盛る', () => {
        const b = emptyBoard();
        put(b, 5, '💙', 6);
        put(b, 6, '⭕', 3);
        const ai = new AIPlayer('💙', 'poisoner', ['⭕'], [], undefined, true);
        const r = ai.makeMove(b, 10, costs, 2, 5, [15], false);
        expect(r.skills).toEqual(['onClickInjection']);
        expect(r.stompTarget).toBe(5);
    });

    it('毒花が無ければ、同じ盤面でも自コマへ毒は盛らない', () => {
        const b = emptyBoard();
        put(b, 5, '💙', 6);
        put(b, 6, '⭕', 3);
        const ai = new AIPlayer('💙', 'poisoner', ['⭕']);
        const r = ai.makeMove(b, 10, costs, 2, 5, [15], false);
        expect(r.stompTarget).not.toBe(5);
    });

    it('毒花: 自陣の毒が多すぎる/ライフが低い自コマには盛らない', () => {
        const ai = new AIPlayer('💙', 'poisoner', ['⭕'], [], undefined, true);
        const many = emptyBoard();
        many[5] = poisonedPiece(9, 3);
        put(many, 6, '⭕', 3);
        expect(ai.makeMove(many, 10, costs, 2, 5, [15], false).stompTarget).not.toBe(5);
        const weak = emptyBoard();
        put(weak, 5, '💙', 3);
        put(weak, 6, '⭕', 3);
        expect(ai.makeMove(weak, 10, costs, 2, 5, [15], false).stompTarget).not.toBe(5);
    });
});

describe('毒使いはトークン系スキルを手札でロックして残す (旧sim AI と同じ)', () => {
    it('ポイズントークン(16)・トークン(3)を優先してロックする。両トークン(4)は対象外', () => {
        const ai = new AIPlayer('💙', 'poisoner', ['⭕']);
        const locks = ai.chooseLocks(emptyBoard(), 2, 5, [4, 16, 3, 7]);
        expect(locks).toEqual(expect.arrayContaining([16, 3]));
        expect(locks).not.toContain(4);
        expect(locks.length).toBeLessThanOrEqual(2);
    });

    it('他のキャラ(あなた)はこのロックを優先しない', () => {
        const ai = new AIPlayer('💙', 'you', ['⭕']);
        expect(ai.chooseLocks(emptyBoard(), 2, 5, [16])).not.toContain(16);
    });
});

describe('毒使い: 魔力が有り余るときの連打', () => {
    const { skillCosts } = require('./skillCosts');
    const poisoner = () => new AIPlayer('💙', 'poisoner', ['⭕'], ['poisoner', 'you']);
    const ring = (): SquareInfo[] => {
        const b = emptyBoard();
        b[5] = { player: '💙', bind: 6, effects: [] };
        [0, 1, 4, 6].forEach((i) => { b[i] = { player: '⭕', bind: 4, effects: [] }; });
        return b;
    };

    it('毒霧→ミアズマを連打する（魔力に余裕があるときだけ）', () => {
        expect(poisoner().makeMove(ring(), 40, skillCosts, 2, 5, [29], false).skills).toEqual(['onClickPoisonMist', 'onClickMiasma']);
        expect(poisoner().makeMove(ring(), 9, skillCosts, 2, 5, [29], false).skills).not.toContain('onClickMiasma');
    });

    it('パンデミック→猛毒化: 敵が集まる3×3に毒を撒き、その毒を倍にする', () => {
        const b = ring();
        b[5] = { player: undefined, bind: 0, effects: [] };
        const r = poisoner().makeMove(b, 23, skillCosts, 2, 5, [19], false);
        expect(r.chargeClicks?.[0]).toEqual({ skill: 'onClickPandemic', target: expect.any(Number) });
        expect(poisoner().makeMove(b, 12, skillCosts, 2, 5, [19], false).chargeClicks ?? []).toEqual([]);
    });
});

describe('猛毒化は毒が十分大きくなったら撃たない（毒の倍々増加で試合が終わらなくなる #204）', () => {
    const { skillCosts } = require('./skillCosts');
    const poison = (n: number) => Array.from({ length: n }, () => ({ effect: '☠' as const }));
    const board = (foePoison: number) => {
        const b = emptyBoard();
        b[5] = { player: '💙', bind: 6, effects: [] };
        [0, 1, 4, 6].forEach((i) => { b[i] = { player: '⭕', bind: 4, effects: poison(foePoison) }; });
        return b;
    };
    const ai = () => new AIPlayer('💙', 'poisoner', ['⭕'], ['poisoner', 'you']);

    it('敵の毒が少ないうちは猛毒化を撃つが、1マスの毒が32以上なら撃たない', () => {
        const few = ai().makeMove(board(4), 40, skillCosts, 2, 5, [18, 19], false);
        expect((few.chargeClicks ?? []).map((c) => c.skill)).toContain('onClickIntensify');
        const many = ai().makeMove(board(32), 40, skillCosts, 2, 5, [18, 19], false);
        expect((many.chargeClicks ?? []).map((c) => c.skill)).not.toContain('onClickIntensify');
    });
});
