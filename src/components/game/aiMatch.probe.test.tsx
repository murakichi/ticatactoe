// 計測用: 本番の Game.tsx（本物のTS版AI）で AI 同士を自動進行させ、陰陽師の勝率を測る。通常のテスト実行では skip。
// 使い方: AI_MATCH=1 AI_MATCH_GAMES=6 AI_MATCH_OPP=magician npx react-scripts test --watchAll=false src/components/game/aiMatch.probe
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Game, PlayerConfig } from './Game';

const run = process.env.AI_MATCH ? describe : describe.skip;

run('AI同士の実戦（本番TS版）', () => {
    it('陰陽師の勝率', async () => {
        jest.useFakeTimers();
        const games = Number(process.env.AI_MATCH_GAMES || 4);
        const opp = (process.env.AI_MATCH_OPP || 'magician') as never;
        let wins = 0, done = 0;
        for (let g = 0; g < games; g++) {
            const yinFirst = g % 2 === 0;
            const players: PlayerConfig[] = yinFirst
                ? [{ character: 'yinYangMaster', isAI: true }, { character: opp, isAI: true }]
                : [{ character: opp, isAI: true }, { character: 'yinYangMaster', isAI: true }];
            const { container, unmount } = render(<Game players={players} />);
            fireEvent.click(screen.getByLabelText(/自動進行/));
            let text = '';
            for (let t = 0; t < 4000; t++) {
                act(() => { jest.advanceTimersByTime(250); });
                text = container.textContent ?? '';
                if (/勝ち|勝利|Win/.test(text) && /💙|⭕/.test(text) && container.querySelector('[class*="winner"]')) break;
            }
            const m = text.match(/(💙|⭕)[^。]{0,6}(の勝ち|勝利)/);
            console.log(`game ${g}: ${m ? m[0] : 'no winner'} (yinFirst=${yinFirst})`);
            if (m) { done++; if ((m[1] === '💙') === yinFirst) wins++; }
            unmount();
        }
        console.log(`yinYang wins ${wins}/${done}`);
        jest.useRealTimers();
    }, 600000);
});
