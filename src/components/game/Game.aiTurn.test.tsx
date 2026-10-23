import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Game } from './Game';

// AIの手番のあいだ、人間がマスやスキルを触っても何も起きないこと
describe('AIの手番中の人間の操作', () => {
    const squares = (c: HTMLElement) => Array.from(c.querySelectorAll<HTMLButtonElement>('button[class*="square"]'));
    const lifeCount = (c: HTMLElement) => c.querySelectorAll('[class*="life"]').length;

    it('先手がAIのとき、AIが動く前にマスを押しても置けない', () => {
        const { container } = render(
            <Game
                players={[
                    { character: 'you', isAI: true },
                    { character: 'you', isAI: false },
                ]}
            />
        );
        // AIは描画の直後に最初の1手を置く場合があるので、押す前後で盤面が変わらないことを見る
        const before = lifeCount(container);
        const target = squares(container).findIndex((b) => !b.querySelector('[class*="life"]'));
        fireEvent.click(squares(container)[target]);
        expect(lifeCount(container)).toBe(before);
    });

    it('AIの手番中は、スキルカードも押せない(チャージで手番を飛ばせない)', () => {
        render(
            <Game
                players={[
                    { character: 'you', isAI: true },
                    { character: 'you', isAI: false },
                ]}
            />
        );
        expect(screen.getByRole('button', { name: /^チャージ/ })).toBeDisabled();
        expect(screen.getByRole('button', { name: /^シャッフル/ })).toBeDisabled();
    });

    it('人間の手番では、これまで通りマスにもスキルにも触れる', () => {
        const { container } = render(
            <Game
                players={[
                    { character: 'you', isAI: false },
                    { character: 'you', isAI: true },
                ]}
            />
        );
        expect(screen.getByRole('button', { name: /^チャージ/ })).toBeEnabled();
        fireEvent.click(squares(container)[5]);
        expect(lifeCount(container)).toBeGreaterThan(0);
    });
});
