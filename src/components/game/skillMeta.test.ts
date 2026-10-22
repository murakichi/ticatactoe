import * as fs from 'fs';
import * as path from 'path';
import { CATEGORY_LABEL, hasSkillMeta, metaOf, parseSkillText } from './skillMeta';
import { CATEGORY_ORDER, SKILL_CATALOG } from './deck';

test('ボタン文言をスキル名・符号・数値・補足に分解する', () => {
    expect(parseSkillText('ロック-2')).toEqual({ name: 'ロック', sign: '-', amount: 2, suffix: '' });
    expect(parseSkillText('チャージ+3')).toEqual({ name: 'チャージ', sign: '+', amount: 3, suffix: '' });
    expect(parseSkillText('ライフ3-3')).toEqual({ name: 'ライフ3', sign: '-', amount: 3, suffix: '' });
    expect(parseSkillText('蘇生-4(発動中:残2)')).toEqual({ name: '蘇生', sign: '-', amount: 4, suffix: '(発動中:残2)' });
    expect(parseSkillText('コストなし')).toBeNull();
});

test('未登録のスキル名でも既定のメタを返す', () => {
    expect(metaOf('存在しないスキル').category).toBe('basic');
    expect(metaOf('スラッシュ').category).toBe('attack');
});

test('毒霧は毒カテゴリ', () => {
    expect(metaOf('毒霧').category).toBe('poison');
});

describe('スキルカードのデザインは SKILL_CATALOG と揃っている', () => {
    it.each(SKILL_CATALOG.map((e) => [e.name, e] as const))('%s は、カタログのアイコン・種類でカードが出る', (_name, e) => {
        expect(metaOf(e.name)).toEqual({ icon: e.icon, category: e.category });
    });

    it('カタログの全スキルが既定の「✨・基本」表示になっていない', () => {
        const fallback = SKILL_CATALOG.filter((e) => !hasSkillMeta(e.name));
        expect(fallback).toEqual([]);
    });

    it('カタログの全種類に、種類名とカードの色(CSSクラス)がある', () => {
        const css = fs.readFileSync(path.join(__dirname, 'SkillButton.module.css'), 'utf8');
        for (const c of CATEGORY_ORDER) {
            expect(CATEGORY_LABEL[c.id]).toBe(c.label);
            expect(css).toMatch(new RegExp(`^\\.${c.id} \\{`, 'm'));
        }
    });

    it('画面に出る基本操作・固有スキルの名前も、既定の表示になっていない', () => {
        // Game.tsx の SkillButton の buttonText から、`名前-コスト` の名前部分を取り出す
        const source = fs.readFileSync(path.join(__dirname, 'Game.tsx'), 'utf8');
        const names = new Set<string>();
        Array.from(source.matchAll(/buttonText=\{?`([^`$]*)/g)).forEach((m) => {
            const name = m[1].split(/[-+]/)[0];
            if (name) names.add(name);
        });
        expect(names.size).toBeGreaterThan(10);
        expect(Array.from(names).filter((n) => !hasSkillMeta(n))).toEqual([]);
    });

    it('同じ名前でも、カードはデッキ編集画面と同じ種類になる(例: 氷結=氷結、焚き火の唄=バッズ、帯電系=帯電)', () => {
        expect(metaOf('氷結').category).toBe('ice');
        expect(metaOf('焚き火の唄').category).toBe('buds');
        expect(metaOf('範囲帯電').category).toBe('charge');
        expect(metaOf('式神一括').category).toBe('shikigami');
        expect(metaOf('バーンアウト').category).toBe('fire');
    });
});
