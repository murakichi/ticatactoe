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

    it('狭い画面でも折り返さない(縦に積むと、横に続くことも手札の数も分からなくなる)', () => {
        const css = fs.readFileSync(path.join(__dirname, 'Game.module.css'), 'utf8');
        // 画面幅で .skillGrid を wrap に戻す指定が無いこと
        const wrapped = Array.from(css.matchAll(/\.skillGrid\s*\{([^}]*)\}/g)).filter((m) => /flex-wrap:\s*wrap\b/.test(m[1]));
        expect(wrapped).toHaveLength(0);
    });

    it('「詳細」で、モバイルの1画面表示と全部入りの表示が切り替わる', () => {
        const { container } = renderGame();
        const root = container.firstChild as HTMLElement;
        expect(root.className).not.toMatch(/detail/);
        fireEvent.click(screen.getByRole('button', { name: '詳細 ▾' }));
        expect(root.className).toMatch(/detail/);
        fireEvent.click(screen.getByRole('button', { name: '詳細を閉じる ▴' }));
        expect(root.className).not.toMatch(/detail/);
    });

    describe('横に続くことを示す「‹ ›」', () => {
        const metrics = (scrollWidth: number, clientWidth: number) => {
            Object.defineProperty(HTMLElement.prototype, 'scrollWidth', { configurable: true, get: () => scrollWidth });
            Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => clientWidth });
        };
        afterEach(() => {
            // jsdom の既定(0)に戻す
            delete (HTMLElement.prototype as unknown as Record<string, unknown>).scrollWidth;
            delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientWidth;
        });

        it('はみ出していて、先頭にいるときは右だけ出る。押すと右へスクロールする', () => {
            metrics(1000, 300);
            renderGame();
            expect(screen.queryByRole('button', { name: '左のスキルを見る' })).toBeNull();
            const right = screen.getByRole('button', { name: '右のスキルを見る' });
            const grid = right.parentElement!.querySelector('[class*="skillGrid"]') as HTMLElement;
            const scrollBy = jest.fn();
            grid.scrollBy = scrollBy;
            fireEvent.click(right);
            expect(scrollBy).toHaveBeenCalledWith(expect.objectContaining({ left: expect.any(Number) }));
            expect(scrollBy.mock.calls[0][0].left).toBeGreaterThan(0);
        });

        it('途中までスクロールしたら左も出る', () => {
            metrics(1000, 300);
            renderGame();
            const grid = screen.getByRole('button', { name: '右のスキルを見る' }).parentElement!.querySelector('[class*="skillGrid"]') as HTMLElement;
            grid.scrollLeft = 200;
            fireEvent.scroll(grid);
            expect(screen.getByRole('button', { name: '左のスキルを見る' })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: '右のスキルを見る' })).toBeInTheDocument();
        });

        it('全部収まっているときは出ない', () => {
            metrics(300, 300);
            renderGame();
            expect(screen.queryByRole('button', { name: /のスキルを見る/ })).toBeNull();
        });
    });
});

describe('モバイルの1画面表示: ターンごとに盤面の大きさが変わらない(行の高さを固定する)', () => {
    const css = fs.readFileSync(path.join(__dirname, 'Game.module.css'), 'utf8');
    const compact = css.slice(css.lastIndexOf('/* ===== モバイル: 1画面に収めて'));

    it('スキル欄の高さを固定している(手札の説明の長さで高さが変わると、盤面が毎ターン伸び縮みする)', () => {
        expect(compact).toMatch(/--skill-strip-h:\s*\d+px/);
        expect(compact).toMatch(/\.skillGrid \{[^}]*height:\s*var\(--skill-strip-h\)/);
    });

    it('手番の席にだけ出る「手番」バッジは出さない(折り返してパネルの高さが変わるため)', () => {
        expect(compact).toMatch(/\.game:not\(\.detail\) \.turnBadge[^{]*\{[^}]*display:\s*none/);
    });

    it('盤面の大きさは、盤面の領域の高さ(cqh)から決める', () => {
        expect(compact).toMatch(/--board-h:\s*calc\(100cqh/);
        expect(compact).toMatch(/container-type:\s*size/);
    });
});
