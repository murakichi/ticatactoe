// tsconfig の jsx は classic ("react") なので .tsx では React の import が必須
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Game, PlayerConfig } from './Game';
import { CUSTOM_SKILL_IDX } from './deck';
import { CustomSkillSpec, normalizeSpec } from './customSkill';

const cells = (container: HTMLElement) => Array.from(container.querySelectorAll('button.square'));
const lifeAt = (container: HTMLElement, i: number) => cells(container)[i].querySelector('.life')?.textContent;

// 手札の3枠がオリジナルスキルになるよう、デッキを（ほぼ）オリジナルだけにはできない（12枚必要）ので、ロックで固定される前提でなく
// 乱数を最後の要素に寄せる（randomAnyPick は大きい乱数ほど後ろを選ぶ）。deck は昇順に整えられ、オリジナル(200)は末尾
const DECK = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, CUSTOM_SKILL_IDX];
const make = (customSkill: CustomSkillSpec | undefined, isAI = false): PlayerConfig[] => [
    { character: 'you', isAI, deck: DECK, customSkill },
    { character: 'you', isAI: false },
];
const spec = (patch: Partial<CustomSkillSpec>) =>
    normalizeSpec({ name: '雷撃', kind: 'enemy', pick: 'select', count: 1, ops: [{ op: 'damage', amount: 2, destroyOnZero: false }], drawbacks: [], endTurn: false, ...patch });

describe('オリジナルスキル（ブラウザ版）', () => {
    beforeEach(() => jest.spyOn(Math, 'random').mockReturnValue(0.999));
    afterEach(() => jest.restoreAllMocks());

    // 先手(💙)が1つ置き、後手(⭕)が1つ置いて先手に戻す
    const setup = (customSkill: CustomSkillSpec) => {
        const r = render(<Game players={make(customSkill)} />);
        fireEvent.click(cells(r.container)[0]);
        fireEvent.click(cells(r.container)[1]);
        return r;
    };

    it('手札にオリジナルスキルが名前とコストつきで出る', () => {
        setup(spec({}));
        expect(screen.getByRole('button', { name: /^雷撃-\d+$/ })).toBeInTheDocument();
    });

    it('仕様が無い席ではデッキから外れて出ない', () => {
        const r = render(<Game players={make(undefined)} />);
        expect(screen.queryByRole('button', { name: /^雷撃-/ })).toBeNull();
        r.unmount();
    });

    it('AI席ではオリジナルスキルを持たない', () => {
        render(<Game players={make(spec({}), true)} />);
        expect(screen.queryByRole('button', { name: /^雷撃-/ })).toBeNull();
    });

    it('選択系: マスを選ぶとダメージが入る', () => {
        const r = setup(spec({ name: '雷撃' }));
        const before = Number(lifeAt(r.container, 1));
        fireEvent.click(screen.getByRole('button', { name: /^雷撃-\d+$/ }));
        fireEvent.click(cells(r.container)[1]);
        expect(Number(lifeAt(r.container, 1))).toBe(before - 2);
    });

    it('即発動系: ランダムな自陣のコマのライフ+3（選ばずに発動）', () => {
        const r = setup(spec({ name: '恵み', kind: 'own', pick: 'random', count: 1, ops: [{ op: 'heal', amount: 2 }] }));
        const before = Number(lifeAt(r.container, 0));
        fireEvent.click(screen.getByRole('button', { name: /^恵み-\d+$/ }));
        expect(Number(lifeAt(r.container, 0))).toBe(before + 2);
    });

    it('代償: 自陣のコマにダメージが入り、そのぶんコストが下がる', () => {
        const base = spec({ name: '恵み', kind: 'enemy', pick: 'all', ops: [{ op: 'damage', amount: 1, destroyOnZero: false }] });
        const withCost = { ...base, drawbacks: [{ side: 'own' as const, op: { op: 'damage' as const, amount: 2, destroyOnZero: false as const } }] };
        const a = setup(base);
        const costOf = () => Number((screen.getByRole('button', { name: /^恵み-\d+$/ }).getAttribute('aria-label') ?? screen.getByRole('button', { name: /^恵み-\d+$/ }).textContent ?? '').match(/恵み-(\d+)/)?.[1]);
        const full = costOf();
        a.unmount();
        const r = setup(withCost);
        expect(costOf()).toBeLessThan(full);
        const before = Number(lifeAt(r.container, 0));
        fireEvent.click(screen.getByRole('button', { name: /^恵み-\d+$/ }));
        expect(Number(lifeAt(r.container, 0))).toBe(before - 2);
    });
});
