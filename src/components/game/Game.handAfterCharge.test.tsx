import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Game, PlayerConfig } from './Game';
import AIPlayer from './AIPlayer';

// チャージのように盤面が変わらずにターンだけ進む場合も、次の席の手札は自分のデッキから引き直される。
// 引き直しが盤面(history)の変化でしか走らないと、チャージで手番を渡したとき次の席が前の席の手札を引き継ぐ。
describe('チャージで手番を渡したあとの手札', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    const yinDeck = [0, 2, 3, 5, 6, 8, 10, 12, 53, 71, 72, 73];
    const poiDeck = [0, 12, 15, 16, 17, 18, 19, 29, 31, 45, 46, 48];

    it('AI同士の対戦で、毒使いの手札が毒使いのデッキに収まる(陰陽師はチャージを多用する)', () => {
        for (const yinFirst of [true, false]) {
            const yin: PlayerConfig = { character: 'yinYangMaster', isAI: true, deck: yinDeck };
            const poi: PlayerConfig = { character: 'poisoner', isAI: true, deck: poiDeck };
            const bad: string[] = [];
            let poiCalls = 0;
            const orig = AIPlayer.prototype.makeMove;
            const spy = jest.spyOn(AIPlayer.prototype, 'makeMove').mockImplementation(function (this: AIPlayer, ...args: Parameters<AIPlayer['makeMove']>) {
                if (this.character === 'poisoner') {
                    poiCalls++;
                    const out = args[5].filter((i: number) => !poiDeck.includes(i));
                    if (out.length) bad.push(`hand=${args[5]} out=${out}`);
                }
                return orig.apply(this, args);
            });
            const { unmount } = render(<Game players={yinFirst ? [yin, poi] : [poi, yin]} />);
            fireEvent.click(screen.getByLabelText(/自動進行/));
            for (let t = 0; t < 300 && poiCalls < 12; t++) act(() => { jest.advanceTimersByTime(250); });
            spy.mockRestore();
            unmount();
            expect(poiCalls).toBeGreaterThan(3);
            expect(bad).toEqual([]);
        }
    }, 120000);
});
