// 計測用: 本番の Game.tsx（本物のTS版AI）で AI 同士を自動進行させ、陰陽師の勝率を測る。通常のテスト実行では skip。
// 使い方: AI_MATCH=1 AI_MATCH_GAMES=6 AI_MATCH_OPP=magician npx react-scripts test --watchAll=false src/components/game/aiMatch.probe
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Game, PlayerConfig } from './Game';
import AIPlayer from './AIPlayer';
import { pickRecommendedGears } from './gear';
import { variedAIDeck } from './deck';

const run = process.env.AI_MATCH ? describe : describe.skip;

run('AI同士の実戦（本番TS版）', () => {
    it('陰陽師の勝率', async () => {
        jest.useFakeTimers();
        const games = Number(process.env.AI_MATCH_GAMES || 4);
        const opp = (process.env.AI_MATCH_OPP || 'magician') as never;
        const hero = process.env.AI_MATCH_CHAR || 'yinYangMaster';
        let wins = 0, done = 0;
        let flipTotal = 0, flipDiff = 0; const dumped: unknown[] = [];
        const origBest = AIPlayer.prototype.getBestMove;
        const flipSpy = (process.env.AI_MATCH_LSFLIP || process.env.AI_MATCH_DUMP) ? jest.spyOn(AIPlayer.prototype, 'getBestMove').mockImplementation(function (this: AIPlayer, ...args: Parameters<AIPlayer['getBestMove']>) {
            const r = origBest.apply(this, args);
            if (process.env.AI_MATCH_DUMP) dumped.push({ board: JSON.parse(JSON.stringify(args[0])), life: args[1], me: this.playerSymbol, ch: this.character, opps: this.opponents, chars: this.characters, ready: this.lastStandReady, placements: this.placements, move: r });
            if (this.lastStandReady) {
                this.lastStandReady = false;
                const r2 = origBest.apply(this, args);
                this.lastStandReady = true;
                flipTotal++; if (r2 !== r) flipDiff++;
            }
            return r;
        }) : null;
        for (let g = 0; g < games; g++) {
            const yinFirst = g % 2 === 0;
            // App.tsx と同じ条件: AI席は推奨ギア（主案/別案）と、推奨から3枚入れ替えたデッキ（核のカードは外さない）
            const seat = (character: string): PlayerConfig => ({ character: character as never, isAI: true, gears: character === hero && process.env.AI_MATCH_HGEARS ? (process.env.AI_MATCH_HGEARS === 'none' ? [] : process.env.AI_MATCH_HGEARS.split(',') as never) : character !== hero && process.env.AI_MATCH_OGEARS ? (process.env.AI_MATCH_OGEARS === 'none' ? [] : process.env.AI_MATCH_OGEARS.split(',') as never) : pickRecommendedGears(character as never), deck: character === hero && process.env.AI_MATCH_HDECK ? process.env.AI_MATCH_HDECK.split(',').map(Number) : character !== hero && process.env.AI_MATCH_ODECK ? process.env.AI_MATCH_ODECK.split(',').map(Number) : variedAIDeck(character as never) });
            const players: PlayerConfig[] = yinFirst
                ? [seat(hero), seat(opp as string)]
                : [seat(opp as string), seat(hero)];
            const trace: string[] = [];
            const orig = AIPlayer.prototype.makeMove;
            const spy = process.env.AI_MATCH_TRACE ? jest.spyOn(AIPlayer.prototype, 'makeMove').mockImplementation(function (this: AIPlayer, ...args: Parameters<AIPlayer['makeMove']>) {
                const r = orig.apply(this, args);
                if (this.character === (process.env.AI_MATCH_TRACE_CHAR || 'yinYangMaster')) {
                    const empties = args[0].filter((q) => !q.player).length;
                    trace.push(`T=${(document.body.textContent ?? '').match(/ターン\s*(\d+)/)?.[1] ?? '?'} yy=${this.yinYangMode} oppReach=${this.opponents.reduce((n, o) => n + this.countReaches(args[0], o), 0)} magic=${args[1]} hand=[${args[5]}] empties=${empties} win=${this.floodComboWins(args[0]) ? 1 : 0} -> ${r.reroll ? 'REROLL' : ''}${r.skills.join('+')}${r.chargeClicks ? ' clicks:' + r.chargeClicks.map((c) => c.skill.replace('onClick', '')).join(',') : ''}${r.move !== null ? ' move=' + r.move : ''}`);
                }
                return r;
            }) : null;
            const magicLog: { who: string; magic: number; ready: boolean }[] = [];
            const origMake = AIPlayer.prototype.makeMove;
            const magicSpy = process.env.AI_MATCH_MAGIC ? jest.spyOn(AIPlayer.prototype, 'makeMove').mockImplementation(function (this: AIPlayer, ...args: Parameters<AIPlayer['makeMove']>) {
                magicLog.push({ who: this.character === hero ? 'H' : 'O', magic: args[1], ready: this.lastStandReady });
                return origMake.apply(this, args);
            }) : null;
            const { container, unmount } = render(<Game players={players} />);
            fireEvent.click(screen.getByLabelText(/自動進行/));
            let text = '';
            for (let t = 0; t < 4000; t++) {
                act(() => { jest.advanceTimersByTime(250); });
                text = container.textContent ?? '';
                if (/勝ち|勝利|Win/.test(text) && /💙|⭕/.test(text) && container.querySelector('[class*="winner"]')) break;
            }
            const m = text.match(/(💙|⭕)[^。]{0,6}(の勝ち|勝利)/);
            const yinWon = !!m && ((m[1] === '💙') === yinFirst);
            if (process.env.AI_MATCH_DETAIL) {
                const cnt = (re: RegExp) => (text.match(re) ?? []).length;
                console.log(`detail ${yinWon ? 'WIN ' : 'LOSE'} flood=${cnt(/「百鬼夜行」を使用/g)} all=${cnt(/「式神一括」を使用/g)} place=${cnt(/に式神を設置/g)} blast=${cnt(/の式神が爆破/g)} shuffle=${cnt(/「シャッフル」を使用/g)} charge=${cnt(/「チャージ」を使用/g)} markdown=${cnt(/「特売」を使用/g)} turns=${cnt(/手番/g)} endTurn=${Math.max(0, ...(text.match(/ターン(\d+)/g) ?? []).map((x) => Number(x.slice(3))))} floodTurn=${(text.match(/ターン(\d+) [^:]*: 「百鬼夜行」/) ?? [])[1] ?? '-'} lsTurn=${(text.match(/ターン(\d+) [^:]*: .{0,3}の土壇場の防壁/) ?? [])[1] ?? '-'} lsWho=${(text.match(/(.)の土壇場の防壁: /) ?? [])[1] ?? '-'}`);
            }
            if (process.env.AI_MATCH_USAGE) {
                const sym = process.env.AI_MATCH_USAGE === 'opp' ? (yinFirst ? '⭕' : '💙') : (yinFirst ? '💙' : '⭕');
                const re = new RegExp('ターン\\d+ ' + sym + ': 「([^」]+)」を使用', 'g');
                console.log('USAGE ' + Array.from(text.matchAll(re)).map((x) => x[1]).join(','));
            }
            if (process.env.AI_MATCH_LOG && g < Number(process.env.AI_MATCH_LOG)) console.log('LOG game ' + g + ' yinFirst=' + yinFirst + '\n' + (text.match(/ターン\d+ \S+: .*?(?=ターン\d+ |操作ログ|$)/g) ?? []).reverse().join('\n'));
            console.log(`game ${g}: ${m ? m[0] : 'no winner'} (yinFirst=${yinFirst})`);
            if (m) { done++; if ((m[1] === '💙') === yinFirst) wins++; }
            if (process.env.AI_MATCH_TRACE && (!yinWon || process.env.AI_MATCH_TRACE === 'all')) console.log('TRACE ' + (yinWon ? 'WIN' : 'LOSE') + ' game ' + g + '\n' + trace.join('\n'));
            if (magicSpy) { console.log('MAGICLOG ' + JSON.stringify(magicLog)); magicSpy.mockRestore(); }
            spy?.mockRestore();
            unmount();
        }
        if (process.env.AI_MATCH_DUMP) require('fs').writeFileSync(process.env.AI_MATCH_DUMP, JSON.stringify(dumped));
        if (flipSpy) console.log(`LSFLIP calls with lastStandReady=${flipTotal}, move differs when not free=${flipDiff}`);
        console.log(`yinYang wins ${wins}/${done}`);
        jest.useRealTimers();
    }, 600000);
});
