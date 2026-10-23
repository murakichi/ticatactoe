import React from 'react';
import { render } from '@testing-library/react';
import { Board } from './Board';
import { SquareInfo } from '../../types/SquareInfo';

const empty = (): SquareInfo => ({ player: undefined, bind: 0, effects: [] });
const mine = (): SquareInfo => ({ player: '💙', bind: 5, effects: [] });

describe('Board: 勝ち列の強調', () => {
    const squares = Array.from({ length: 16 }, (_, i) => (i % 5 === 0 ? mine() : empty()));

    it('勝ちを決めたマスだけ win、ほかは dimmed になる', () => {
        const { container } = render(<Board size={4} squares={squares} onPlay={() => {}} winCells={[0, 5, 10, 15]} />);
        const cells = Array.from(container.querySelectorAll('button'));
        const win = cells.filter((c) => /win/.test(c.className)).map((c) => cells.indexOf(c));
        expect(win).toEqual([0, 5, 10, 15]);
        expect(cells.filter((c) => /dimmed/.test(c.className))).toHaveLength(12);
    });

    it('勝負が付いていなければ、どのマスも沈めない', () => {
        const { container } = render(<Board size={4} squares={squares} onPlay={() => {}} />);
        expect(container.querySelectorAll('button[class*="dimmed"], button[class*="win"]')).toHaveLength(0);
    });

    it('手番の色を CSS 変数で受け取る(空きマスのホバー縁)', () => {
        const { container } = render(<Board size={4} squares={squares} onPlay={() => {}} turnColor='var(--color-seat-1)' />);
        expect((container.firstChild as HTMLElement).style.getPropertyValue('--turn')).toBe('var(--color-seat-1)');
    });
});
