// tsconfig の jsx は classic ("react") なので .tsx では React の import が必須
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { App } from './App';
import { LIFE_MEANS } from './util';

test('起動時はキャラクター選択画面が描画される', () => {
    render(<App />);
    expect(screen.getByText('戦術三目並べ')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /対戦スタート/ })).toBeInTheDocument();
    // 両プレイヤー分のキャラカードが並ぶ (8キャラ × 2枠)
    expect(screen.getAllByText('軍師')).toHaveLength(2);
    expect(screen.getAllByText('毒使い')).toHaveLength(2);
    expect(screen.getAllByText('雷霆の巫')).toHaveLength(2);
});

test('キャラ説明のライフ平均は実装の定数から描画される', () => {
    render(<App />);
    // 説明文をベタ書きすると実装とズレるため、LIFE_MEANS を埋め込んでいる (issue #13)
    const giant = screen.getAllByText(new RegExp(`ライフ平均${LIFE_MEANS.giant}`));
    expect(giant.length).toBe(2); // 💙 / ⭕ の2枚
    expect(screen.getAllByText(new RegExp(`陽=ライフ平均${LIFE_MEANS.yinYangMaster_yang}`)).length).toBe(2);
    expect(screen.getAllByText(new RegExp(`ライフ平均${LIFE_MEANS.electrician}。固有:帯電拡散`)).length).toBe(2);
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

test('AI席のキャラをランダムに決める: あなた以外になり、人間席は変わらない', () => {
    const { container } = render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '8人' }));
    const active = () =>
        Array.from(container.querySelectorAll('[class*="playerCard"]')).map(
            (card) => card.querySelector('[class*="charCardActive"] [class*="charName"]')?.textContent
        );
    // 既定: 席0=人間(あなた)、他はAI(あなた)
    expect(active().every((n) => n === 'あなた')).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: /AI席のキャラをランダム/ }));
    const after = active();
    expect(after[0]).toBe('あなた'); // 人間席はそのまま
    expect(after.slice(1).every((n) => n !== undefined && n !== 'あなた')).toBe(true);
});

test('AI席が1つも無ければランダムボタンは押せない', () => {
    render(<App />);
    // 2人戦で席1のAIを人間に切り替える
    fireEvent.click(screen.getAllByRole('button', { name: '人間' })[1]);
    expect(screen.getByRole('button', { name: /AI席のキャラをランダム/ })).toBeDisabled();
});

test('マス数は人数と無関係に選べる（おまかせ/4x4〜10x10）', () => {
    const { container } = render(<App />);
    // 既定はおまかせ: 2人=4x4
    expect(screen.getByText(/盤面 4x4/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '8x8' }));
    expect(screen.getByText(/盤面 8x8/)).toBeInTheDocument();
    // 人数を変えても選んだサイズのまま
    fireEvent.click(screen.getByRole('button', { name: '3人' }));
    expect(screen.getByText(/盤面 8x8/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /対戦スタート/ }));
    expect(container.querySelectorAll('button.square')).toHaveLength(64);
});

test('おまかせに戻すと人数に応じた盤面になる', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '10x10' }));
    expect(screen.getByText(/盤面 10x10/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'おまかせ' }));
    fireEvent.click(screen.getByRole('button', { name: '5人' }));
    expect(screen.getByText(/盤面 6x6/)).toBeInTheDocument();
});

describe('ギアの選択', () => {
    const cards = (container: HTMLElement) => Array.from(container.querySelectorAll<HTMLElement>('[class*="playerCard"]'));
    const chip = (card: HTMLElement, name: string) => within(card).getByRole('button', { name: new RegExp(name) });

    it('最初から全ギアを選べる（装備枠は2。枠が埋まると他は選べない）', () => {
        const { container } = render(<App />);
        const card = cards(container)[0];
        fireEvent.click(within(card).getByText('巨人'));
        expect(card).toHaveTextContent('ギア 0/2');
        fireEvent.click(chip(card, '頑健'));
        fireEvent.click(chip(card, '堅牢の鍵'));
        expect(card).toHaveTextContent('ギア 2/2');
        expect(chip(card, '頑健')).toHaveAttribute('aria-pressed', 'true');
        expect(chip(card, '余韻')).toBeDisabled();
        // 外すと空く
        fireEvent.click(chip(card, '頑健'));
        expect(card).toHaveTextContent('ギア 1/2');
        expect(chip(card, '余韻')).not.toBeDisabled();
        // 説明文が出る
        expect(card).toHaveTextContent('ロックの期間が9ターン');
    });

    it('「あなた」だけ3枠。他のキャラに変えると、はみ出したギアは外れる', () => {
        const { container } = render(<App />);
        const card = cards(container)[0];
        expect(card).toHaveTextContent('ギア 0/3');
        ['頑健', '堅牢の鍵', '余韻'].forEach((n) => fireEvent.click(chip(card, n)));
        expect(card).toHaveTextContent('ギア 3/3');
        fireEvent.click(within(card).getByText('巨人'));
        expect(card).toHaveTextContent('ギア 2/2');
    });

    it('席ごとのランダム付与: 枠数ぶん重複なしで付く', () => {
        const { container } = render(<App />);
        const card = cards(container)[1];
        fireEvent.click(within(card).getByRole('button', { name: /プレイヤー2のギアをランダムに/ }));
        const pressed = within(card).getAllByRole('button').filter((b) => b.getAttribute('aria-pressed') === 'true');
        expect(pressed).toHaveLength(3); // 「あなた」は3枠
    });

    it('全員ランダム: 人数分の席に付き、対戦画面のパネルに出る', () => {
        const { container } = render(<App />);
        fireEvent.click(screen.getByRole('button', { name: /全員のギアをランダム/ }));
        cards(container).forEach((card) => {
            const pressed = within(card).getAllByRole('button').filter((b) => b.getAttribute('aria-pressed') === 'true');
            expect(pressed).toHaveLength(3);
        });
        fireEvent.click(screen.getByRole('button', { name: /対戦スタート/ }));
        expect(container.querySelectorAll('[class*="gear"]').length).toBeGreaterThanOrEqual(6);
    });

    it('選んだギアが対戦に引き継がれる', () => {
        const { container } = render(<App />);
        fireEvent.click(chip(cards(container)[0], '剛腕の代償'));
        fireEvent.click(screen.getByRole('button', { name: /対戦スタート/ }));
        expect(screen.getByRole('button', { name: 'ロック-5' })).toBeInTheDocument();
    });
});
