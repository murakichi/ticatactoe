// 計測用: sim/ai.js と AIPlayer.ts の chooseLocks に同じ状態を与えて出力を比べる（通常のテスト実行では skip）。
// 使い方: LOCK_CMP_IN=states.json LOCK_CMP_OUT=ts_out.json LOCK_CMP_CHAR=witch npx react-scripts test --watchAll=false src/components/game/lockCompare.probe
import fs from 'fs';
import AIPlayer from './AIPlayer';
import type { CharacterId } from '../../types/Character';

const run = process.env.LOCK_CMP_IN ? describe : describe.skip;

run('chooseLocks: sim と本番の出力比較', () => {
    it('出力を書き出す', () => {
        const states = JSON.parse(fs.readFileSync(process.env.LOCK_CMP_IN as string, 'utf8'));
        const ch = (process.env.LOCK_CMP_CHAR || 'witch') as CharacterId;
        const out = states.map((st: { board: never[]; hand: number[]; oppMagic: number; life: number }) => {
            const ai = new AIPlayer('💙', ch, ['⭕'], [ch, 'giant']);
            return ai.chooseLocks(st.board, st.oppMagic, st.life, st.hand.slice());
        });
        fs.writeFileSync(process.env.LOCK_CMP_OUT as string, JSON.stringify(out));
        expect(out.length).toBe(states.length);
    });
});
