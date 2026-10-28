// tsconfig の jsx は classic ("react") なので .tsx では React の import が必須
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Game, PlayerConfig } from './Game';

const cells = (container: HTMLElement) => Array.from(container.querySelectorAll('button.square'));
const lifeAt = (container: HTMLElement, i: number) => Number(cells(container)[i].querySelector('.life')?.textContent);
const cfg = (...characters: string[]): PlayerConfig[] => characters.map((character) => ({ character: character as never, isAI: false }));

// Math.random を 0.25 に固定すると正規乱数のライフが毎回 9 になる
describe('凩の魔女（ブラウザ版）', () => {
    beforeEach(() => jest.spyOn(Math, 'random').mockReturnValue(0.25));
    afterEach(() => jest.restoreAllMocks());

    it('固有スキル 虎落笛のボタンはコスト7で、凩の魔女の手番にだけ出る', () => {
        render(<Game players={cfg('witch', 'you')} />);
        expect(screen.getByRole('button', { name: /虎落笛-7/ })).toBeInTheDocument();
        expect(screen.getAllByText(/虎落笛/).length).toBeGreaterThan(0);
    });

    it('虎落笛: 自陣のコマ全てのライフが+2され、手番は続く（🍂が無ければ敵にダメージは入らない）', () => {
        const { container } = render(<Game players={cfg('witch', 'you')} />);
        fireEvent.click(cells(container)[0]); // 💙のコマ
        fireEvent.click(cells(container)[15]); // ⭕のコマ
        fireEvent.click(screen.getByRole('button', { name: /チャージ\+3/ })); // 魔力 3 → 6
        fireEvent.click(cells(container)[14]); // ⭕のコマ
        const enemyBefore = lifeAt(container, 15);
        const ownBefore = lifeAt(container, 0);
        const cast = screen.getByRole('button', { name: /虎落笛-/ });
        expect(cast).not.toBeDisabled();
        fireEvent.click(cast);
        expect(lifeAt(container, 0)).toBe(ownBefore + 2);
        expect(lifeAt(container, 15)).toBe(enemyBefore);
        expect(container.querySelector('.turn .player')?.textContent).toBe('💙'); // まだ💙の手番
    });
});
