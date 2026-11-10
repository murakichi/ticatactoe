import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { Game } from './Game';
import { BoardEffects } from './BoardEffects';

const pops = (c: HTMLElement) => Array.from(c.querySelectorAll('[class*="damagePop"]')).map((e) => e.textContent ?? '');

describe('コマが受けたダメージの表示(赤字の -n)', () => {
    // Math.random を 0.25 に固定すると、正規乱数のライフが毎回 9 になる（ライフが0以下に出て減衰が表示されない不安定さを避ける。#506）
    beforeEach(() => jest.spyOn(Math, 'random').mockReturnValue(0.25));
    afterEach(() => jest.restoreAllMocks());

    it('BoardEffects: 受けたダメージを「-n」で出し、効果によるものは絵文字付きで出す', () => {
        const { container } = render(
            <BoardEffects
                effect={null}
                size={4}
                damage={{
                    nonce: 1,
                    items: [
                        { cell: 5, lines: [{ amount: 1 }, { icon: '🔥', amount: 2 }, { icon: '☠', amount: 1 }] },
                        { cell: 6, lines: [{ icon: '⚡', amount: 1 }] },
                    ],
                }}
            />
        );
        expect(pops(container)).toEqual(['-1', '🔥-2', '☠-1', '⚡-1']);
    });

    it('ダメージが無ければ何も出さない', () => {
        const { container } = render(<BoardEffects effect={null} size={4} damage={null} />);
        expect(container.querySelectorAll('[class*="damagePop"]')).toHaveLength(0);
    });

    it('赤字で小さく表示する(CSS)', () => {
        const css = require('fs').readFileSync(require('path').join(__dirname, 'BoardEffects.module.css'), 'utf8') as string;
        const block = /\.damagePop \{([^}]*)\}/.exec(css)?.[1] ?? '';
        expect(block).toMatch(/color:\s*#ff4d5e/);
        const px = Number(/font-size:\s*(\d+)px/.exec(block)?.[1]);
        expect(px).toBeGreaterThan(0);
        expect(px).toBeLessThanOrEqual(13);
    });

    it('ゲーム中: 着手のたびに、前に置いたコマの自然減衰(-1)が表示される', () => {
        const { container } = render(
            <Game
                players={[
                    { character: 'you', isAI: false },
                    { character: 'you', isAI: false },
                ]}
            />
        );
        const squares = () => Array.from(container.querySelectorAll<HTMLButtonElement>('button[class*="square"]'));
        expect(pops(container)).toEqual([]);
        fireEvent.click(squares()[0]);
        fireEvent.click(squares()[1]);
        // 2人戦は着手のたびに減衰する。最初のコマ(ライフが残っている限り)が -1 になる
        expect(pops(container).length).toBeGreaterThan(0);
        expect(pops(container).every((t) => /^[^\d-]*-\d+$/.test(t))).toBe(true);
    });

    it('リスタートで、表示中のダメージは消える', () => {
        const { container, getByRole } = render(
            <Game
                players={[
                    { character: 'you', isAI: false },
                    { character: 'you', isAI: false },
                ]}
            />
        );
        const squares = () => Array.from(container.querySelectorAll<HTMLButtonElement>('button[class*="square"]'));
        fireEvent.click(squares()[0]);
        fireEvent.click(squares()[1]);
        expect(pops(container).length).toBeGreaterThan(0);
        fireEvent.click(getByRole('button', { name: 'リスタート' }));
        expect(pops(container)).toEqual([]);
    });
});
