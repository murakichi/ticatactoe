import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { VictoryEffect } from './VictoryEffect';
import { Game } from './Game';

describe('勝利の演出', () => {
    it('勝者の記号と「勝利！」を大きく出し、紙吹雪を降らせる', () => {
        const { container } = render(<VictoryEffect winner='💙' seat={0} />);
        expect(container.textContent).toContain('💙');
        expect(container.textContent).toContain('勝利！');
        expect(container.querySelectorAll('[class*="confetti"]').length).toBeGreaterThanOrEqual(80);
        expect(container.querySelectorAll('[class*="ring"]')).toHaveLength(3);
    });

    it('紙吹雪は毎回同じ並び(乱数を使わない)で、位置がばらけている', () => {
        const xs = (c: HTMLElement) => Array.from(c.querySelectorAll<HTMLElement>('[class*="confetti"]')).map((e) => e.style.left);
        const a = xs(render(<VictoryEffect winner='💙' seat={0} />).container);
        const b = xs(render(<VictoryEffect winner='⭕' seat={1} />).container);
        expect(a).toEqual(b);
        // 同じ位置に固まっていない(斜めの筋にならない)。20%刻みの5区画すべてに散る
        const bins = new Set(a.map((l) => Math.floor(parseFloat(l) / 20)));
        expect(bins.size).toBe(5);
    });

    it('勝負が付いたときだけゲーム画面に出て、リスタートで消える', () => {
        const { container } = render(
            <Game
                players={[
                    { character: 'you', isAI: false },
                    { character: 'you', isAI: false },
                ]}
            />
        );
        const squares = () => Array.from(container.querySelectorAll<HTMLButtonElement>('button[class*="square"]'));
        expect(container.querySelector('[class*="banner"]')).toBeNull();
        // 💙が1行目を4つ揃える(⭕は2行目)
        for (const i of [0, 4, 1, 5, 2, 6, 3]) fireEvent.click(squares()[i]);
        expect(screen.getByText('勝利！')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'リスタート' }));
        expect(screen.queryByText('勝利！')).toBeNull();
    });
});
