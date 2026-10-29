// 計測用(通常は skip): sim の AI の判断(sim/probe-parity.js が書き出した JSON)を本番 AIPlayer.ts に流して、スキルと着手が一致するかを見る。
// sim と本番の勝率がずれたとき、AI の判断のずれか(ここで不一致)エンジン側のずれか(ここは一致)を切り分けるのに使う(issue #180)。
// 使い方: node sim/probe-parity.js tactician 30 /tmp/t.json && DIFF_FILES=/tmp/t.json CI=true npx react-scripts test --watchAll=false src/components/game/aiParity.probe
import * as fs from 'fs';
import AIPlayer from './AIPlayer';
import { seatOf } from '../../types/Player';
import { skillCosts } from './skillCosts';

const files = (process.env.DIFF_FILES ?? '').split(',').filter(Boolean);
(files.length ? describe : describe.skip)('sim と本番のAI判断の一致', () => {
    it.each(files)('%s', (file) => {
        const rows = JSON.parse(fs.readFileSync(file, 'utf-8'));
        const norm = (n: string) => n.replace(/^onClick/, '').replace(/^./, (c) => c.toLowerCase());
        let skillSame = 0, moveSame = 0;
        const diffs: string[] = [];
        for (const r of rows) {
            const chars: string[] = [];
            chars[seatOf(r.me)] = r.oppChar; chars[seatOf(r.oppSym)] = 'yinYangMaster';
            const ai = new AIPlayer(r.me, r.oppChar, [r.oppSym], chars as never);
            ai.placements = r.placements; ai.seatCount = 2;
            const oppMagic = Math.max(...r.seatMagic.filter((_: number, i: number) => i !== seatOf(r.me)));
            const res = ai.makeMove(r.board, r.magic, { ...skillCosts, ...r.costs }, oppMagic, r.life, r.hand, r.tokenUsed, 0, 0, r.judge, r.assault, false, r.seatMagic, 0, []);
            const ts = [...res.skills, ...((res.chargeClicks ?? []).map((c: { skill: string }) => c.skill))].map(norm).sort().join(',');
            const sim = (r.skills as string[]).slice().sort().join(',');
            const simMove = r.turnEnded ? null : r.move;
            const sk = ts === sim, mv = res.move === simMove;
            if (sk) skillSame++;
            if (mv) moveSame++;
            if (!sk || !mv) diffs.push(`T${r.turn} hand[${r.hand}] m${r.magic} sim={${sim}}->${simMove} ts={${ts}}->${res.move}`);
        }
        console.log(`PARITY ${file.split('/').pop()}: スキル一致 ${skillSame}/${rows.length}、着手一致 ${moveSame}/${rows.length}`);
        if (diffs.length) console.log('PARITY-DIFFS ' + diffs.slice(0, 12).join(' | '));
    });
});
