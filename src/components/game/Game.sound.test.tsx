// tsconfig の jsx は classic ("react") なので .tsx では React の import が必須
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Game } from './Game';
import { playSfx } from '../../sound';

// 効果音は実際には鳴らさず、呼び出しだけを見る
jest.mock('../../sound', () => ({
    ...jest.requireActual('../../sound'),
    playSfx: jest.fn(),
}));

const mockedPlay = playSfx as jest.Mock;

beforeEach(() => mockedPlay.mockClear());

test('ロックを掛けた瞬間に「ロック」の効果音が鳴る(スキルを構えただけでは鳴らない)', () => {
    const { container } = render(
        <Game
            players={[
                { character: 'you', isAI: false },
                { character: 'you', isAI: false },
            ]}
        />
    );
    // 初期マジック2でロック(コスト2)を構える
    fireEvent.click(screen.getByRole('button', { name: 'ロック-2' }));
    expect(mockedPlay).not.toHaveBeenCalledWith('lock');

    // マスを選ぶと掛かる
    fireEvent.click(container.querySelectorAll('button.square')[5]);
    expect(mockedPlay).toHaveBeenCalledWith('lock');
    expect(mockedPlay).toHaveBeenCalledTimes(1);
});
