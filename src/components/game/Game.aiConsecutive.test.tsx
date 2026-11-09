import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Game, PlayerConfig } from './Game';
import AIPlayer from './AIPlayer';

// 巨人が休む回は同じ席が連続で動く。AIのタイマーが描画時の古い状態を握ると、2手番目のAIが
// 手番開始の魔力・手札の更新前の値で計画してしまう（sim では毎手番更新される。sim と本番AIのずれの原因だった）
// 乱数を seed 固定にする。固定しないと、連続する2手番で『魔力も手札も偶然同じ』になる試合（seed 18 など。約1/40）で落ちる
// （使った魔力と次の手番の獲得が同額で、手札が全部ロックされているとき）。seed 7 はそうならず、連続で動く場面も起きる
const seededRandom = (seed: number) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

describe('同じ席が連続で動く手番のAI', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        jest.spyOn(Math, 'random').mockImplementation(seededRandom(7));
    });
    afterEach(() => {
        jest.restoreAllMocks();
        jest.useRealTimers();
    });

    it('2手番目のAIに渡る魔力と手札は、1手番目の値のままではない', () => {
        const players: PlayerConfig[] = [
            { character: 'witch', isAI: true },
            { character: 'giant', isAI: true },
        ];
        const calls: { turn: number; magic: number; hand: string }[] = [];
        const orig = AIPlayer.prototype.makeMove;
        const spy = jest.spyOn(AIPlayer.prototype, 'makeMove').mockImplementation(function (this: AIPlayer, ...args: Parameters<AIPlayer['makeMove']>) {
            if (this.character === 'witch') {
                const turn = Number((document.body.textContent ?? '').match(/ターン\s*(\d+)/)?.[1] ?? 0);
                calls.push({ turn, magic: args[1], hand: args[5].join(',') });
            }
            return orig.apply(this, args);
        });
        const { container } = render(<Game players={players} />);
        fireEvent.click(screen.getByLabelText(/自動進行/));
        for (let t = 0; t < 400 && calls.length < 12; t++) act(() => { jest.advanceTimersByTime(250); });
        spy.mockRestore();
        void container;

        // 魔女の呼び出しを手番ごとにまとめ、「連続する2手番（ターン番号が1だけ違う）」で魔力も手札も全く同じ組が無いこと
        const firstOfTurn = new Map<number, { magic: number; hand: string }>();
        for (const c of calls) if (!firstOfTurn.has(c.turn)) firstOfTurn.set(c.turn, c);
        const consecutive = Array.from(firstOfTurn.keys()).filter((t) => firstOfTurn.has(t + 1));
        expect(consecutive.length).toBeGreaterThan(0); // 魔女が連続で動く場面が実際に起きている
        for (const t of consecutive) {
            const a = firstOfTurn.get(t)!;
            const b = firstOfTurn.get(t + 1)!;
            expect(`${b.magic}|${b.hand}`).not.toBe(`${a.magic}|${a.hand}`);
        }
    }, 120000);
});
