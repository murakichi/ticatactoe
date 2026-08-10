// tsconfig の jsx は classic ("react") なので .tsx では React の import が必須
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { App } from './App';

test('起動時はキャラクター選択画面が描画される', () => {
    render(<App />);
    expect(screen.getByText('戦術三目並べ')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /対戦スタート/ })).toBeInTheDocument();
    // 両プレイヤー分のキャラカードが並ぶ (7キャラ × 2枠)
    expect(screen.getAllByText('軍師')).toHaveLength(2);
    expect(screen.getAllByText('毒使い')).toHaveLength(2);
});

test('対戦スタートで盤面に切り替わる', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /対戦スタート/ }));
    expect(screen.queryByText('戦術三目並べ')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'リスタート' })).toBeInTheDocument();
    // 常設スキル (チャージ/シャッフル) が出ている
    expect(screen.getByText(/チャージ/)).toBeInTheDocument();
});
