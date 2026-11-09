// tsconfig の jsx は classic ("react") なので .tsx では React の import が必須
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { App } from '../App';
import { CustomSkillCreator } from './CustomSkillCreator';
import { CustomSkillSpec } from './game/customSkill';

describe('オリジナルスキル作成画面', () => {
    beforeEach(() => window.localStorage.clear());

    it('選択肢を選ぶとコストと説明が出て、保存できる', () => {
        const onSave = jest.fn((_: CustomSkillSpec) => true);
        render(<CustomSkillCreator initial={undefined} onSave={onSave} onDelete={() => undefined} />);
        expect(screen.getByText(/敵のコマを1つ選び/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /即発動: 全て/ }));
        expect(screen.getByText(/全ての敵のコマに/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: '＋ 効果を足す' }));
        expect(screen.getByLabelText('効果2の種類')).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText('オリジナルスキルの名前'), { target: { value: '大雷' } });
        fireEvent.click(screen.getByRole('button', { name: '保存' }));
        expect(onSave).toHaveBeenCalledTimes(1);
        const saved = onSave.mock.calls[0][0];
        expect(saved).toMatchObject({ name: '大雷', pick: 'all', kind: 'enemy' });
        expect(saved.ops).toHaveLength(2);
    });

    it('代償を足すとコストの内訳に割引が出る', () => {
        render(<CustomSkillCreator initial={undefined} onSave={() => true} onDelete={() => undefined} />);
        fireEvent.click(screen.getByRole('button', { name: '＋ 自陣のコマを破壊' }));
        expect(screen.getByText(/代償の割引/)).toBeInTheDocument();
        expect(screen.getByText(/代償: 自陣のランダムなコマ1つに破壊/)).toBeInTheDocument();
    });

    it('オブジェクト設置・スキル封じ・ギア封じを選べる。マスを使わない効果だけなら対象の設定が隠れる', () => {
        render(<CustomSkillCreator initial={undefined} onSave={() => true} onDelete={() => undefined} />);
        // 敵のコマ対象では、オブジェクトの設置は選べない
        const select = screen.getByLabelText('効果1の種類') as HTMLSelectElement;
        expect(Array.from(select.options).some((o) => o.value === 'object')).toBe(false);
        fireEvent.click(screen.getByRole('button', { name: '空きマス' }));
        fireEvent.change(select, { target: { value: 'object' } });
        expect(screen.getByLabelText('効果1のオブジェクト')).toBeInTheDocument();
        expect(screen.getByText(/を設置する/, { selector: 'div' })).toBeInTheDocument();
        fireEvent.change(select, { target: { value: 'silence' } });
        fireEvent.change(screen.getByLabelText('効果1の封じる範囲'), { target: { value: 'max' } });
        expect(screen.getByText(/コスト3以下のスキルを使えない/)).toBeInTheDocument();
        expect(screen.getByText(/マスを使わないので/)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /選択系/ })).toBeNull();
        fireEvent.change(select, { target: { value: 'gearOff' } });
        expect(screen.getByText(/ギアを使えない/)).toBeInTheDocument();
    });

    it('空きマス対象に切り替えるとコマ専用の効果が外れる', () => {
        render(<CustomSkillCreator initial={undefined} onSave={() => true} onDelete={() => undefined} />);
        fireEvent.click(screen.getByRole('button', { name: '空きマス' }));
        expect(screen.getByText(/空きマスを1つ選び/)).toBeInTheDocument();
        expect(screen.queryByText(/ダメージを与える/)).toBeNull();
    });
});

describe('セットアップ画面のオリジナルスキル', () => {
    beforeEach(() => window.localStorage.clear());

    it('作って保存すると、デッキ編集に「オリジナル」として出る', () => {
        render(<App />);
        const input = screen.getByLabelText('オリジナルスキルの名前');
        fireEvent.change(input, { target: { value: '落雷' } });
        const save = (input.parentElement as HTMLElement).querySelector('button') as HTMLElement; // 名前欄の隣の「保存」
        fireEvent.click(save);
        expect(screen.getAllByRole('button', { name: /落雷/ }).length).toBeGreaterThan(0);
        expect(window.localStorage.getItem('ticatactoe.customSkill')).toContain('落雷');
    });
});
