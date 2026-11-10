import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Game, PlayerConfig } from './Game';

// 龍神の巫女（#527）: 本物の Game.tsx で、固有スキルのカードが出ること、AI同士で覚醒まで進んで止まらないことを確かめる
describe('龍神の巫女', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    const deck = [28, 52, 92, 105, 107, 108, 110, 111, 123, 124, 136, 12];

    it('固有スキル「八百万の祈り」のカードが出る（龍の咆哮は龍になるまで出ない）', () => {
        const miko: PlayerConfig = { character: 'dragonMiko', isAI: false, deck };
        const you: PlayerConfig = { character: 'you', isAI: true };
        render(<Game players={[miko, you]} boardSize={5} />);
        expect(screen.getAllByText(/八百万の祈り/).length).toBeGreaterThan(0);
        expect(screen.queryByText(/龍の咆哮/)).toBeNull();
    });

    it('AI同士の対戦で、巫女が八百万の祈りで建造物を置き、手番が止まらず決着まで進む', () => {
        const miko: PlayerConfig = { character: 'dragonMiko', isAI: true, deck };
        const you: PlayerConfig = { character: 'you', isAI: true };
        const { container } = render(<Game players={[miko, you]} boardSize={5} />);
        fireEvent.click(screen.getByLabelText(/自動進行/));
        for (let t = 0; t < 1200; t++) act(() => { jest.advanceTimersByTime(250); });
        const text = container.textContent || '';
        expect(text).toMatch(/「八百万の祈り」を使用/);
        expect(text).toMatch(/に[^ターン]*を設置/);
        expect(text).toMatch(/勝利/);
    }, 240000);
});
