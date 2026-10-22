// tsconfig の jsx は classic ("react") なので .tsx では React の import が必須
import React from 'react';
import * as fs from 'fs';
import * as path from 'path';
import { render, screen, fireEvent } from '@testing-library/react';
import { SkillButton } from './SkillButton';
import { Game } from './Game';

const LONG = 'マスを選択し、そのマスと周囲1マスに⚡を1つずつ付与します（空きマスも可）。付与しただけではダメージは出ません。コストは盤面の⚡の数だけ軽減されます';

describe('説明のアコーディオン', () => {
    it('既定は閉じていて、開閉ボタンで全文の表示を切り替える', () => {
        render(<SkillButton onClick={() => {}} buttonText='範囲帯電-5' paragraph={LONG} />);
        const toggle = screen.getByRole('button', { name: /説明を開く/ });
        expect(toggle).toHaveAttribute('aria-expanded', 'false');
        const desc = screen.getByText(LONG);
        expect(desc.className).not.toContain('descOpen');

        fireEvent.click(toggle);
        expect(screen.getByRole('button', { name: /説明を閉じる/ })).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getByText(LONG).className).toContain('descOpen');

        fireEvent.click(screen.getByRole('button', { name: /説明を閉じる/ }));
        expect(screen.getByText(LONG).className).not.toContain('descOpen');
    });

    it('開閉ボタンを押しても、スキル自体は発動しない', () => {
        const onClick = jest.fn();
        render(<SkillButton onClick={onClick} buttonText='ロック-2' paragraph='選択したマスをロックします' />);
        fireEvent.click(screen.getByRole('button', { name: /説明を開く/ }));
        expect(onClick).not.toHaveBeenCalled();
    });

    it('expandAll が変わると、カードの開閉もそろう(カード単独で開いた分も上書きされる)', () => {
        const { rerender } = render(<SkillButton onClick={() => {}} buttonText='ロック-2' paragraph='説明' expandAll={false} />);
        expect(screen.getByRole('button', { name: /説明を開く/ })).toHaveAttribute('aria-expanded', 'false');
        rerender(<SkillButton onClick={() => {}} buttonText='ロック-2' paragraph='説明' expandAll />);
        expect(screen.getByRole('button', { name: /説明を閉じる/ })).toHaveAttribute('aria-expanded', 'true');
        rerender(<SkillButton onClick={() => {}} buttonText='ロック-2' paragraph='説明' expandAll={false} />);
        expect(screen.getByRole('button', { name: /説明を開く/ })).toHaveAttribute('aria-expanded', 'false');
    });
});

describe('ゲーム画面のスキル欄', () => {
    const renderGame = () =>
        render(
            <Game
                players={[
                    { character: 'you', isAI: false },
                    { character: 'you', isAI: false },
                ]}
            />
        );
    const toggles = () => screen.getAllByRole('button', { name: /説明を(開く|閉じる)/ });

    it('「説明をすべて開く/閉じる」で、全カードの説明がそろって開閉する', () => {
        renderGame();
        expect(toggles().length).toBeGreaterThan(3);
        expect(toggles().every((t) => t.getAttribute('aria-expanded') === 'false')).toBe(true);

        fireEvent.click(screen.getByRole('button', { name: '説明をすべて開く' }));
        expect(toggles().every((t) => t.getAttribute('aria-expanded') === 'true')).toBe(true);

        // 1枚だけ閉じても、「すべて閉じる」で全部閉じる
        fireEvent.click(toggles()[0]);
        fireEvent.click(screen.getByRole('button', { name: '説明をすべて閉じる' }));
        expect(toggles().every((t) => t.getAttribute('aria-expanded') === 'false')).toBe(true);
    });

    it('カードは横一列(折り返さず)で、あふれた分は横スクロールする', () => {
        const css = fs.readFileSync(path.join(__dirname, 'Game.module.css'), 'utf8');
        const block = /\.skillGrid \{([^}]*)\}/.exec(css)?.[1] ?? '';
        expect(block).toMatch(/flex-wrap:\s*nowrap/);
        expect(block).toMatch(/overflow-x:\s*auto/);
        // 横一列の中で、カードは縮まない
        const wrap = fs.readFileSync(path.join(__dirname, 'SkillButton.module.css'), 'utf8');
        expect(/\.wrap \{([^}]*)\}/.exec(wrap)?.[1]).toMatch(/flex:\s*0 0 auto/);
    });
});
