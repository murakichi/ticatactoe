// tsconfig の jsx は classic ("react") なので .tsx では React の import が必須
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Game } from './Game';

// 基本操作(チャージ・シャッフル・ロック)は演出が無かったので、押したときに盤面へスキル名のバナーが出ることを守る
const renderGame = () =>
    render(
        <Game
            players={[
                { character: 'you', isAI: false },
                { character: 'you', isAI: false },
            ]}
        />
    );

const banner = (container: HTMLElement) => container.querySelector('[class*="banner"]')?.textContent;

test('チャージを押すと「チャージ+3」の演出が出る', () => {
    const { container } = renderGame();
    expect(banner(container)).toBeUndefined();
    fireEvent.click(screen.getByRole('button', { name: 'チャージ+3' }));
    expect(banner(container)).toBe('チャージ+3');
});

test('シャッフルを押すと「シャッフル」の演出が出る', () => {
    const { container } = renderGame();
    fireEvent.click(screen.getByRole('button', { name: 'シャッフル-1' }));
    expect(banner(container)).toBe('シャッフル');
});

test('ロックはマスに掛かった瞬間に演出が出る(構えただけでは出ない)', () => {
    const { container } = renderGame();
    fireEvent.click(screen.getByRole('button', { name: 'ロック-2' }));
    expect(banner(container)).toBeUndefined();
    fireEvent.click(container.querySelectorAll('button.square')[5]);
    expect(banner(container)).toBe('ロック');
});
