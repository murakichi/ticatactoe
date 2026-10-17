import { metaOf, parseSkillText } from './skillMeta';

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
