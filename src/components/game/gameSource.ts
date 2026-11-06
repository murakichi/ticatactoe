import fs from 'fs';
import path from 'path';

/**
 * Game.tsx と、そこから切り出したフック(use*.ts。スキルのハンドラ群・マスのクリック・演出など)を連結した文字列。
 * 『このスキルは演出を出しているか』のような、ソースを読む検査で使う（ハンドラは Game.tsx の外のファイルにある）
 */
export const readGameSource = (): string => {
    const dir = __dirname;
    const files = ['Game.tsx', ...fs.readdirSync(dir).filter((f) => /^use\w+\.ts$/.test(f)).sort()];
    return files.map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
};
