// tsconfig の jsx は classic ("react") なので .tsx では React の import が必須
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { App } from './App';
import { LIFE_MEANS } from './util';

test('起動時はキャラクター選択画面が描画される', () => {
    render(<App />);
    expect(screen.getByText('戦術三目並べ')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /対戦スタート/ })).toBeInTheDocument();
    // 両プレイヤー分のキャラカードが並ぶ (7キャラ × 2枠)
    expect(screen.getAllByText('軍師')).toHaveLength(2);
    expect(screen.getAllByText('毒使い')).toHaveLength(2);
});

test('キャラ説明のライフ平均は実装の定数から描画される', () => {
    render(<App />);
    // 説明文をベタ書きすると実装とズレるため、LIFE_MEANS を埋め込んでいる (issue #13)
    const giant = screen.getAllByText(new RegExp(`ライフ平均${LIFE_MEANS.giant}`));
    expect(giant.length).toBe(2); // 💙 / ⭕ の2枚
    expect(screen.getAllByText(new RegExp(`陽=ライフ平均${LIFE_MEANS.yinYangMaster_yang}`)).length).toBe(2);
});

test('対戦スタートで盤面に切り替わる', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /対戦スタート/ }));
    expect(screen.queryByText('戦術三目並べ')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'リスタート' })).toBeInTheDocument();
    // 常設スキル (チャージ/シャッフル) が出ている
    expect(screen.getByText(/チャージ/)).toBeInTheDocument();
});

test('人数を選ぶと席の数と盤面サイズの表示が変わり、その人数で開始できる', () => {
    const { container } = render(<App />);
    // 既定は2人(4x4)
    expect(screen.getByText(/盤面 4x4/)).toBeInTheDocument();
    expect(screen.getAllByText(/^プレイヤー\d$/)).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: '3人' }));
    expect(screen.getByText(/盤面 5x5/)).toBeInTheDocument();
    expect(screen.getAllByText(/^プレイヤー\d$/)).toHaveLength(3);

    fireEvent.click(screen.getByRole('button', { name: '8人' }));
    expect(screen.getByText(/盤面 7x7/)).toBeInTheDocument();
    expect(screen.getAllByText(/^プレイヤー\d$/)).toHaveLength(8);

    fireEvent.click(screen.getByRole('button', { name: /対戦スタート/ }));
    expect(container.querySelectorAll('button.square')).toHaveLength(49);
});
