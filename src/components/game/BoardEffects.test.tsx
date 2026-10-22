// tsconfig の jsx は classic ("react") なので .tsx では React の import が必須
import React from 'react';
import { render } from '@testing-library/react';
import { BoardEffects, SkillEffectType, BurstType } from './BoardEffects';

const NEW_EFFECTS: [SkillEffectType, string | null][] = [
    ['freeze', '氷結'],
    ['flame', '火炎'],
    ['glacier', '絶対零度'],
    ['glacierBurst', '氷結崩壊！'],
    ['inferno', '業火'],
    ['cleanse', '浄化'],
    ['harvestEve', '刈り入れ前夜'],
    ['solstice', '冬至の種子'],
    ['sprout', 'ひこばえ'],
    ['windborne', '風の落とし子'],
    ['autumn', '落ち葉'],
    ['shikigami', '式神'],
    ['shikigamiBlast', '式神爆破！'],
];

describe('追加した演出', () => {
    it.each(NEW_EFFECTS)('%s はバナー「%s」と演出要素を描画する', (type, label) => {
        const { container } = render(<BoardEffects effect={{ type, indexes: [0, 5, 10], nonce: 1 }} size={4} />);
        expect(container.textContent).toContain(label as string);
        // バナー以外の演出要素（オーラ・パーティクル・マスの絵文字など）が1つ以上ある
        expect(container.querySelectorAll('div,span').length).toBeGreaterThan(2);
    });

    it.each<[BurstType, string]>([
        ['iceBreak', '💠'],
        ['thaw', '💧'],
        ['burn', '🔥'],
    ])('小演出 %s は指定マスの数だけ絵文字を出す（メインの演出なしでも出る）', (type, emoji) => {
        const { container } = render(<BoardEffects effect={null} burst={{ type, cells: [1, 2, 3], nonce: 1 }} size={4} />);
        expect(container.textContent?.split(emoji).length).toBe(4);
    });

    it('メインの演出と小演出を同時に出せる', () => {
        const { container } = render(
            <BoardEffects effect={{ type: 'opium', nonce: 1 }} burst={{ type: 'iceBreak', cells: [4], nonce: 1 }} size={4} />
        );
        expect(container.textContent).toContain('オピウム');
        expect(container.textContent).toContain('💠');
    });

    it('どちらも無ければ何も描画しない', () => {
        const { container } = render(<BoardEffects effect={null} burst={null} size={4} />);
        expect(container.firstChild).toBeNull();
    });
});
