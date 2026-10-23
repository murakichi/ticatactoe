import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Game } from './Game';

describe('リスタートとカードの固定(🔒)', () => {
    const players = [
        { character: 'you' as const, isAI: false },
        { character: 'you' as const, isAI: false },
    ];

    it('固定したカードは、リスタートで全部解除される', () => {
        render(<Game players={players} />);
        const unlocked = () => screen.queryAllByTitle('ロック（シャッフルで固定）');
        const locked = () => screen.queryAllByTitle('ロック解除');
        expect(locked()).toHaveLength(0);

        fireEvent.click(unlocked()[0]);
        fireEvent.click(unlocked()[0]);
        expect(locked()).toHaveLength(2);

        fireEvent.click(screen.getByRole('button', { name: 'リスタート' }));
        expect(locked()).toHaveLength(0);
    });

    it('相手の席で固定していた分も、リスタートで解除される', () => {
        render(<Game players={players} />);
        const unlocked = () => screen.queryAllByTitle('ロック（シャッフルで固定）');
        const locked = () => screen.queryAllByTitle('ロック解除');
        // 1手目(💙)でカードを固定して、チャージで手番を渡し、⭕でも固定する
        fireEvent.click(unlocked()[0]);
        fireEvent.click(screen.getByRole('button', { name: /^チャージ/ }));
        fireEvent.click(unlocked()[0]);
        expect(locked().length).toBeGreaterThan(0);

        fireEvent.click(screen.getByRole('button', { name: 'リスタート' }));
        expect(locked()).toHaveLength(0);
        // 先手(💙)に戻り、固定は💙の席でも残っていない
        expect(screen.getAllByTitle('ロック（シャッフルで固定）').length).toBeGreaterThan(0);
        // 手番を⭕に渡しても、⭕の席に固定は残っていない(画面に出るのは手番の席の分だけなので、渡して確かめる)
        fireEvent.click(screen.getByRole('button', { name: /^チャージ/ }));
        expect(locked()).toHaveLength(0);
    });
});
