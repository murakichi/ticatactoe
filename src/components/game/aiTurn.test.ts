import * as fs from 'fs';
import * as path from 'path';
import AIPlayer from './AIPlayer';
import { AITurnInput, canPlaceAt, planAITurn, resolveMoveCell } from './aiTurn';
import { skillCosts } from './skillCosts';
import { SquareInfo } from '../../types/SquareInfo';
import { CharacterId } from '../../types/Character';

const emptyBoard = (n = 16): SquareInfo[] => Array.from({ length: n }, () => ({ player: undefined, bind: 0, effects: [] }));
const chars: CharacterId[] = ['you', 'you'];

const input = (board: SquareInfo[], over: Partial<AITurnInput> = {}): AITurnInput => ({
    board, characters: chars, seat: 0, magic: [3, 3], costs: skillCosts, hand: [0, 1, 2], life: 5, tokenUsed: false,
    necroRemain: 0, necroCosts: [11, 11], necroPay: 11, judgeDayCost: 99, totalAssaultCost: 99, proliferate: false,
    placements: 0, seatCount: 2, lastStandReady: false, tokenFree: false, wardActive: false, chargeBuffActive: false, oppGearCount: 0, oppLastStand: false,
    yinYangMode: 'ying', silenced: false, glacierPending: false, glacierCharge: 0, budGuard: false, infernoReady: false,
    skillKinds: new Set(), rerollsLeft: 0, discountActive: false, lifeBan: false, tokenBind: 5, ...over,
});

describe('canPlaceAt / resolveMoveCell', () => {
    const lock = { effect: '🔑' as const };
    it('ロック中のコマ・氷結中の空きマス・ライフの残った敵コマには着手できない', () => {
        const b = emptyBoard();
        b[0] = { player: '⭕', bind: 6, effects: [lock] };
        b[1] = { player: undefined, bind: 0, effects: [{ effect: '❄' }] };
        b[2] = { player: '⭕', bind: 3, effects: [] };
        b[3] = { player: '⭕', bind: 0, effects: [] };
        b[4] = { player: undefined, bind: 0, effects: [] };
        expect([0, 1, 2, 3, 4].map((i) => canPlaceAt(b, i, '💙', 'you', chars))).toEqual([false, false, false, true, true]);
        expect(canPlaceAt(b, 2, '💙', 'giant', chars)).toBe(true); // 巨人は奪える
    });

    it('スキルでロック付きトークンが着手マスに置かれたら、今の盤面で打ち直す（打てる手が無ければ null）', () => {
        const ai = new AIPlayer('💙', 'witch', ['⭕'], ['witch', 'you']);
        const b = emptyBoard();
        b[4] = { player: '💙', bind: 6, effects: [lock, { effect: '🍂' }] }; // 魔女の🍂トークンが着手予定のマスに落ちた
        const cell = resolveMoveCell(ai, b, ['witch', 'you'], 5, 4);
        expect(cell).not.toBe(4);
        expect(cell).not.toBeNull();
        expect(resolveMoveCell(ai, b, ['witch', 'you'], 5, 5)).toBe(5); // 打てるならそのまま
        const full = emptyBoard().map(() => ({ player: '⭕' as const, bind: 9, effects: [lock] }));
        expect(resolveMoveCell(ai, full, ['witch', 'you'], 5, 0)).toBeNull();
    });
});

describe('一寸の虫に魂なし（ライフ3以下のコマを置けない）', () => {
    it('置けないときは着手せず、置くスキルも撃たず、チャージでパスする', () => {
        const ai = new AIPlayer('💙', 'you', ['⭕'], chars);
        const p = planAITurn(ai, input(emptyBoard(), { lifeBan: true, life: 3, hand: [0, 1, 2] }), () => 'ストンプ');
        expect(p.kind).toBe('direct');
        if (p.kind === 'direct') {
            expect(p.clicks).toEqual([]);
            expect(p.skills.includes('onClickCharge') || p.chargeWhenEmpty).toBe(true);
            expect(p.skills.some((sk) => /Token$/.test(sk))).toBe(false);
        }
    });
    it('着手予定のマスの打ち直しでも、縛られていれば null（チャージでパス）。ライフが4以上なら打てる', () => {
        const ai = new AIPlayer('💙', 'you', ['⭕'], chars);
        expect(resolveMoveCell(ai, emptyBoard(), chars, 3, 5, true)).toBeNull();
        expect(resolveMoveCell(ai, emptyBoard(), chars, 4, 5, true)).toBe(5);
    });
});

describe('planAITurn', () => {
    it('サイレンス中は通常の着手だけ。縛り(ライフ3以下)で打てなければチャージでパス', () => {
        const b = emptyBoard();
        const ai = new AIPlayer('💙', 'you', ['⭕'], chars);
        const p = planAITurn(ai, input(b, { silenced: true }), () => 'ストンプ');
        expect(p.kind).toBe('silenced');
        if (p.kind === 'silenced') expect(p.move).not.toBeNull();
        // 置けるマスが無い盤面（全マス相手のロック中）でも、サイレンス中の計画は必ずチャージでパスする
        const lock = { effect: '🔑' as const };
        const locked = emptyBoard().map(() => ({ player: '⭕' as const, bind: 9, effects: [lock] }));
        expect(planAITurn(ai, input(locked, { silenced: true }), () => 'ストンプ')).toEqual({ kind: 'silenced', move: null, charge: true });
        const banned = planAITurn(ai, input(b, { silenced: true, lifeBan: true, life: 3 }), () => 'ストンプ');
        expect(banned).toEqual({ kind: 'silenced', move: null, charge: true });
    });

    it('置けるマスが無い盤面でも、計画は必ず手番を終える（着手・ターン終了スキル・チャージでパスのどれか）', () => {
        // 全マスが相手のロック中のコマ
        const lock = { effect: '🔑' as const };
        const b = emptyBoard().map(() => ({ player: '⭕' as const, bind: 9, effects: [lock] }));
        const ai = new AIPlayer('💙', 'you', ['⭕'], chars);
        const p = planAITurn(ai, input(b, { hand: [] }), () => 'ストンプ');
        expect(p.kind).toBe('direct');
        if (p.kind === 'direct') {
            expect(p.clicks).toEqual([]);
            expect(p.skills.includes('onClickCharge') || p.chargeWhenEmpty).toBe(true);
        }
    });

    it('普通の盤面では着手が計画され、チャージでパスしない', () => {
        const ai = new AIPlayer('💙', 'you', ['⭕'], chars);
        const p = planAITurn(ai, input(emptyBoard()), () => 'ストンプ');
        expect(p.kind).toBe('direct');
        if (p.kind === 'direct') {
            expect(p.clicks.length).toBeGreaterThan(0);
            expect(p.chargeWhenEmpty).toBe(false);
        }
    });
});

// #181: AIPlayer が返しうるスキル名が、本番(Game.executeSkillForAI)と sim(aiDriver → engine.SKILLS)の両方で実行できること
describe('AIPlayer が返すスキル名の実行側の対応', () => {
    const root = path.join(__dirname, '..', '..', '..');
    const aiSource = fs.readFileSync(path.join(__dirname, 'AIPlayer.ts'), 'utf8');
    // コスト表のキーとして出てくるだけで、スキルとして返さない名前
    const NOT_RETURNED = new Set(['onClickShuffle']);
    // スキルとしては返さず、コスト表のキーとして出てくるだけの名前（返すのは onClickUseDoubleLock など）
    const COST_KEY_ONLY = new Set(['onClickCryoFreeze', 'onClickHailMary', 'onClickRandomCast', 'onClickBoost', 'onClickDoubleLock', 'onClickTripleLock']);
    const names = Array.from(new Set(aiSource.match(/'onClick[A-Za-z]+'/g) ?? [])).map((n) => n.slice(1, -1)).filter((n) => !NOT_RETURNED.has(n));

    it('Game.tsx の executeSkillForAI に case がある', () => {
        const game = fs.readFileSync(path.join(__dirname, 'Game.tsx'), 'utf8');
        const start = game.indexOf('const executeSkillForAI');
        const body = game.slice(start, game.indexOf('useEffect(', start));
        // コスト表のキーでしか使わない名前（AIPlayer 内でスキルとして返さないもの）は除く
        const missing = names.filter((n) => !body.includes(`'${n}'`) && !COST_KEY_ONLY.has(n));
        expect(missing).toEqual([]);
    });

    it('sim の aiDriver が engine.SKILLS に対応づけられる', () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { keyOf } = require(path.join(root, 'sim', 'aiDriver'));
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { SKILLS } = require(path.join(root, 'sim', 'engine'));
        const missing = names.filter((n) => !SKILLS[keyOf(n)] && !['onClickHailMary'].includes(n));
        expect(missing).toEqual([]);
    });
});
