// sim/shared/ は本番の純粋ロジック(TS)から scripts/gen-sim-shared.js が生成した CommonJS。
// 古いまま(TS を直したのに再生成していない)だと sim が古いルールで動くので、ここで落とす (#289)。
import * as fs from 'fs';
import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { generate } = require('../../../scripts/gen-sim-shared');
const OUT = path.join(__dirname, '..', '..', '..', 'sim', 'shared');

describe('sim/shared (本番TSからの生成物)', () => {
    it('最新である。古ければ node scripts/gen-sim-shared.js を実行してコミットする', () => {
        const files: Map<string, string> = generate();
        const stale = Array.from(files).filter(([name, text]) => !fs.existsSync(path.join(OUT, name)) || fs.readFileSync(path.join(OUT, name), 'utf8') !== text).map(([name]) => name);
        const extra = fs.readdirSync(OUT).filter((name) => !files.has(name));
        expect([...stale, ...extra]).toEqual([]);
    });
});
