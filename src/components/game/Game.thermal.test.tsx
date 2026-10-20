// tsconfig の jsx は classic ("react") なので .tsx では React の import が必須
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Game, PlayerConfig } from './Game';

const cells = (container: HTMLElement) => Array.from(container.querySelectorAll('button.square'));
const lifeAt = (container: HTMLElement, i: number) => Number(cells(container)[i].querySelector('.life')?.textContent);
const badgesAt = (container: HTMLElement, i: number) => cells(container)[i].querySelector('[class*="effects"]')?.textContent ?? '';
const cfg = (...characters: string[]): PlayerConfig[] => characters.map((character) => ({ character: character as never, isAI: false }));

// Math.random を 0.25 に固定すると正規乱数のライフが毎回 9 になる
describe('氷室の番人・煉獄の鍛冶師（ブラウザ版）', () => {
    beforeEach(() => jest.spyOn(Math, 'random').mockReturnValue(0.25));
    afterEach(() => jest.restoreAllMocks());

    it('固有スキルのボタンとパネルのコストが出る', () => {
        render(<Game players={cfg('cryomancer', 'pyromancer')} />);
        expect(screen.getByRole('button', { name: /絶対零度-10/ })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /業火/ })).toBeNull();
        expect(screen.getAllByText(/絶対零度/).length).toBeGreaterThan(0);
        expect(screen.getAllByText(/業火/).length).toBeGreaterThan(0);
    });

    it('氷室の番人は常在のロックの代わりに氷結(コスト2)を持ち、空きマスを凍らせると誰も置けなくなる', () => {
        const { container } = render(<Game players={cfg('cryomancer', 'you')} />);
        expect(screen.queryByRole('button', { name: /^ロック-/ })).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: '氷結-2' }));
        fireEvent.click(cells(container)[5]); // 空きマスを氷結
        expect(badgesAt(container, 5)).toContain('❄');
        // 同じ手番のまま💙が別のマスに着手 → ⭕の手番。⭕は凍った空きマスに置けない
        fireEvent.click(cells(container)[0]);
        fireEvent.click(cells(container)[5]);
        expect(cells(container)[5].querySelector('.life')).toBeNull();
        expect(container.querySelector('.turn .player')?.textContent).toBe('⭕'); // まだ⭕の手番
        fireEvent.click(cells(container)[6]);
        expect(lifeAt(container, 6)).toBe(9);
    });

    it('絶対零度: 全マスに❄が足され、次の自分の手番開始時に敵コマへ3ダメージ×スタックで氷結が解ける', () => {
        const { container } = render(<Game players={cfg('cryomancer', 'you')} />);
        // 魔力を貯める: 💙チャージ(+3)=5 → ⭕着手 → 💙(6)チャージ(+3)=9 → ⭕着手 → 💙(10)で絶対零度(コスト10)
        fireEvent.click(screen.getByRole('button', { name: /チャージ\+3/ }));
        fireEvent.click(cells(container)[15]); // ⭕のコマ(ライフ9)
        fireEvent.click(screen.getByRole('button', { name: /チャージ\+3/ }));
        fireEvent.click(cells(container)[14]); // ⭕のコマ
        const zero = screen.getByRole('button', { name: /絶対零度-/ });
        expect(zero).not.toBeDisabled();
        const bindBefore = lifeAt(container, 15);
        fireEvent.click(zero);
        expect(badgesAt(container, 0)).toContain('❄'); // 空きマスにも
        expect(screen.getByRole('button', { name: /絶対零度-/ })).toBeDisabled(); // 同じ手番に2回は撃てない
        expect(badgesAt(container, 15)).toContain('❄');
        // 全マスが凍っているので誰も着手できない。💙も⭕もチャージでパスし、💙の手番開始時に発動する
        fireEvent.click(cells(container)[3]);
        expect(cells(container)[3].querySelector('.life')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: /チャージ\+3/ }));
        expect(lifeAt(container, 15)).toBe(bindBefore); // 氷結中は減衰しない
        fireEvent.click(screen.getByRole('button', { name: /チャージ\+3/ }));
        expect(badgesAt(container, 15)).not.toContain('❄');
        expect(lifeAt(container, 15)).toBe(bindBefore - 3);
        expect(badgesAt(container, 0)).not.toContain('❄'); // 空きマスの氷結も解ける
    });
});
