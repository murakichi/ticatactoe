// tsconfig の jsx は classic ("react") なので .tsx では React の import が必須
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Game } from './Game';

// 両者を人間・陰陽師にして、片側だけ陽へ切り替えたときの挙動を見る (issue #12 の回帰テスト)
const renderYinYangGame = () =>
    render(
        <Game
            heartSelectedCharacter='yinYangMaster'
            circleSelectedCharacter='yinYangMaster'
            heartIsAI={false}
            circleIsAI={false}
        />
    );

const cells = (container: HTMLElement) => Array.from(container.querySelectorAll('button.square'));

test('⭕側の陰陽師でも陰陽転化でモードが切り替わり、陽のコスト+1を払う', () => {
    const { container } = renderYinYangGame();

    // 💙が着手 → ⭕の手番
    fireEvent.click(cells(container)[0]);
    expect(screen.getByText(/現在のモード:陰/)).toBeInTheDocument();
    // 陰なのでコスト修正なし (ロックは基礎2)
    expect(screen.getByRole('button', { name: 'ロック-2' })).toBeInTheDocument();

    // ⭕が陰陽転化 → 陽になる (修正前は💙のモードを見ていたため永久に陰のままだった)
    fireEvent.click(screen.getByRole('button', { name: /陰陽転化/ }));
    expect(screen.getByText(/現在のモード:陽/)).toBeInTheDocument();
    // 陽なので全スキル+1 (修正前は⭕がこの割増を免れていた)
    expect(screen.getByRole('button', { name: 'ロック-3' })).toBeInTheDocument();
    // 陽のモード限定スキルに切り替わる
    expect(screen.getByRole('button', { name: /豊穣の舞/ })).toBeInTheDocument();
});

test('相手が陽でも自分が陰ならコストは増えない', () => {
    const { container } = renderYinYangGame();

    fireEvent.click(cells(container)[0]); // 💙着手 → ⭕の手番
    fireEvent.click(screen.getByRole('button', { name: /陰陽転化/ })); // ⭕を陽に
    // 前提の確認: ここが成立していないと以降の検証が空振りする
    // (バグ1が復活すると⭕が陽にならず、このテストが無条件に通ってしまうため)
    expect(screen.getByText(/現在のモード:陽/)).toBeInTheDocument();
    fireEvent.click(cells(container)[5]); // ⭕着手 → 💙の手番

    // 💙は陰のまま。修正前は「⭕が陽」を理由に💙まで+1されていた
    expect(screen.getByText(/現在のモード:陰/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ロック-2' })).toBeInTheDocument();
});

test('プレイヤーパネルにキャラ固有スキルの現在コストが両者分表示される', () => {
    const { container } = render(
        <Game heartSelectedCharacter='giant' circleSelectedCharacter='magician' heartIsAI={false} circleIsAI={false} />
    );
    const panels = () => Array.from(container.querySelectorAll('[class*="panel"]'));
    const [heartPanel, circlePanel] = panels().filter((el) => /panel(?!Current)/.test(el.className) || el.className.includes('panelCurrent'));
    expect(heartPanel).toHaveTextContent('ストンプ⚡ 6');
    expect(circlePanel).toHaveTextContent('審判の日⚡ 11');

    // 💙が着手(使用回数は変わらない)しても非手番側の表示は維持される
    fireEvent.click(cells(container)[0]);
    expect(circlePanel).toHaveTextContent('審判の日⚡ 11');
});
