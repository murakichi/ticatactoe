// tsconfig の jsx は classic ("react") なので .tsx では React の import が必須
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { App } from './App';

const start = () => fireEvent.click(screen.getByRole('button', { name: /対戦スタート/ }));

describe('盤面からキャラ選択に戻る', () => {
    afterEach(() => jest.restoreAllMocks());

    it('盤面に「キャラ選択に戻る」があり、押すとキャラ選択画面に戻る(対戦前は確認なし)', () => {
        const confirm = jest.spyOn(window, 'confirm');
        render(<App />);
        start();
        expect(screen.queryByText('戦術四目並べ')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'キャラ選択に戻る' }));
        expect(confirm).not.toHaveBeenCalled();
        expect(screen.getByText('戦術四目並べ')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /対戦スタート/ })).toBeInTheDocument();
    });

    it('対戦の途中なら確認し、キャンセルすれば盤面に残る', () => {
        const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
        const { container } = render(<App />);
        start();
        fireEvent.click(container.querySelectorAll('button.square')[0]); // 1手進める
        fireEvent.click(screen.getByRole('button', { name: 'キャラ選択に戻る' }));
        expect(confirm).toHaveBeenCalledTimes(1);
        expect(screen.queryByText('戦術四目並べ')).not.toBeInTheDocument();
    });

    it('対戦の途中でも、確認で OK すれば戻れる', () => {
        jest.spyOn(window, 'confirm').mockReturnValue(true);
        const { container } = render(<App />);
        start();
        fireEvent.click(container.querySelectorAll('button.square')[0]);
        fireEvent.click(screen.getByRole('button', { name: 'キャラ選択に戻る' }));
        expect(screen.getByText('戦術四目並べ')).toBeInTheDocument();
    });

    it('戻っても、選んだキャラクターの設定は残っている。もう一度始めると新しい対戦になる', () => {
        jest.spyOn(window, 'confirm').mockReturnValue(true);
        const { container } = render(<App />);
        // 💙のキャラ「巨人」を選ぶ(最初に並ぶ巨人のカード)
        fireEvent.click(screen.getAllByText('巨人')[0]);
        start();
        expect(screen.getAllByText('巨人').length).toBeGreaterThan(0);
        fireEvent.click(container.querySelectorAll('button.square')[0]);
        fireEvent.click(screen.getByRole('button', { name: 'キャラ選択に戻る' }));
        // 戻った画面で、巨人が選択状態のまま(カードの選択状態は aria-pressed か class で持つ)
        const selected = Array.from(container.querySelectorAll('[class*="charCardActive"]')).map((el) => el.textContent ?? '');
        expect(selected.some((t) => t.includes('巨人'))).toBe(true);
        // もう一度始めると、盤面は初手から(最初の手で置いたコマは残らない)
        start();
        expect(container.querySelectorAll('button.square .life').length).toBe(0);
    });
});
