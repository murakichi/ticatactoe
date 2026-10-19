// tsconfig の jsx は classic ("react") なので .tsx では React の import が必須
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Game, PlayerConfig } from './Game';

const cells = (container: HTMLElement) => Array.from(container.querySelectorAll('button.square'));
const lifeAt = (container: HTMLElement, i: number) => Number(cells(container)[i].querySelector('.life')?.textContent);
const badgesAt = (container: HTMLElement, i: number) => cells(container)[i].querySelector('[class*="effects"]')?.textContent ?? '';
const cfg = (...characters: string[]): PlayerConfig[] => characters.map((character) => ({ character: character as never, isAI: false }));

// Math.random を 0.25 に固定すると正規乱数のライフが毎回 9 になる
describe('氷結師・炎使い（ブラウザ版）', () => {
    beforeEach(() => jest.spyOn(Math, 'random').mockReturnValue(0.25));
    afterEach(() => jest.restoreAllMocks());

    it('固有スキルのボタンとパネルのコストが出る', () => {
        render(<Game players={cfg('cryomancer', 'pyromancer')} />);
        expect(screen.getByRole('button', { name: /氷河期-7/ })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /フレアバースト/ })).toBeNull();
        expect(screen.getAllByText(/氷河期/).length).toBeGreaterThan(0);
        expect(screen.getAllByText(/フレアバースト/).length).toBeGreaterThan(0);
    });

    it('氷河期: 自陣のコマが凍り、ライフが減らず、氷結師だけは重ねて強化できる', () => {
        const { container } = render(<Game players={cfg('cryomancer', 'you')} />);
        // 魔力を7まで貯める: 💙チャージ(+3) → ⭕着手 → 💙(魔力6)着手 → ⭕着手 → 💙(魔力7)
        fireEvent.click(screen.getByRole('button', { name: /チャージ\+3/ }));
        fireEvent.click(cells(container)[15]);
        fireEvent.click(cells(container)[0]); // 💙のコマ
        fireEvent.click(cells(container)[14]);
        fireEvent.click(cells(container)[1]); // 💙のコマ2つ目…ではなく着手は手番ごと1回
        fireEvent.click(cells(container)[13]);
        const glacier = screen.getByRole('button', { name: /氷河期-7/ });
        expect(glacier).not.toBeDisabled();
        fireEvent.click(glacier);
        expect(badgesAt(container, 0)).toContain('❄');
        expect(badgesAt(container, 1)).toContain('❄');
        expect(badgesAt(container, 15)).not.toContain('❄');

        // 氷結中は減衰しない: ⭕が着手しても💙の凍結コマのライフは変わらない
        fireEvent.click(cells(container)[12]); // 💙(氷結師)が空きマスに着手 → ⭕の手番
        const before = lifeAt(container, 0);
        fireEvent.click(cells(container)[11]); // ⭕着手
        expect(lifeAt(container, 0)).toBe(before);

        // 氷結師は氷結中の自陣コマにも重ねて強化できる
        fireEvent.click(cells(container)[0]);
        expect(lifeAt(container, 0)).toBeGreaterThan(before);
    });
});
