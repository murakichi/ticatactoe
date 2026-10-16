// tsconfig の jsx は classic ("react") なので .tsx では React の import が必須
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Game } from './Game';

// 両者を人間・陰陽師にして、片側だけ陽へ切り替えたときの挙動を見る (issue #12 の回帰テスト)
const renderYinYangGame = () =>
    render(
        <Game
            players={[
                { character: 'yinYangMaster', isAI: false },
                { character: 'yinYangMaster', isAI: false },
            ]}
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
        <Game
            players={[
                { character: 'giant', isAI: false },
                { character: 'magician', isAI: false },
            ]}
        />
    );
    const panels = () => Array.from(container.querySelectorAll('[class*="panel"]'));
    const [heartPanel, circlePanel] = panels().filter((el) => /panel(?!Current)/.test(el.className) || el.className.includes('panelCurrent'));
    expect(heartPanel).toHaveTextContent('ストンプ⚡ 6');
    expect(circlePanel).toHaveTextContent('審判の日⚡ 11');

    // 💙が着手(使用回数は変わらない)しても非手番側の表示は維持される
    fireEvent.click(cells(container)[0]);
    expect(circlePanel).toHaveTextContent('審判の日⚡ 11');
});

const cfg = (...characters: string[]) => characters.map((character) => ({ character: character as never, isAI: false }));
const turnPlayer = (container: HTMLElement) => container.querySelector('.turn .player')?.textContent;

describe('多人数', () => {
    it.each([
        [2, 16],
        [3, 25],
        [4, 25],
        [5, 36],
        [6, 36],
        [7, 49],
        [8, 49],
    ])('%i人の盤面は %i マス', (n, cellCount) => {
        const { container } = render(<Game players={cfg(...Array(n).fill('you'))} />);
        expect(cells(container)).toHaveLength(cellCount);
        // パネルは人数分（2人のときは従来どおり左右、3人以上は一覧）
        expect(container.querySelectorAll('[class="panel"], [class="panel panelCurrent"]')).toHaveLength(n);
    });

    it('3人: 手番が 💙→⭕→🟩→💙 と席順に回る', () => {
        const { container } = render(<Game players={cfg('you', 'you', 'you')} />);
        expect(turnPlayer(container)).toBe('💙');
        fireEvent.click(cells(container)[0]);
        expect(turnPlayer(container)).toBe('⭕');
        fireEvent.click(cells(container)[1]);
        expect(turnPlayer(container)).toBe('🟩');
        fireEvent.click(cells(container)[2]);
        expect(turnPlayer(container)).toBe('💙');
    });

    it('4連続で勝利: 5x5では盤の途中の4連続でも勝ちになり、以後は着手できない', () => {
        const { container } = render(<Game players={cfg('you', 'you', 'you')} />);
        // 💙が 6,7,8,9（2行目の2〜5列）を、他の2人は離れたマスを打つ
        const order = [6, 20, 21, 7, 22, 23, 8, 24, 0, 9];
        order.forEach((i) => fireEvent.click(cells(container)[i]));
        expect(container.querySelector('.winner')?.textContent).toContain('💙');
    });

    it('2人戦で巨人は5ターンに1回休む（従来どおり。休みの間は相手が連続手番）', () => {
        const { container } = render(<Game players={cfg('you', 'giant')} />);
        fireEvent.click(cells(container)[0]); // 💙 → 巨人
        expect(turnPlayer(container)).toBe('⭕');
        fireEvent.click(cells(container)[1]); // ⭕(巨人) → 💙
        expect(turnPlayer(container)).toBe('💙');
        fireEvent.click(cells(container)[2]); // 💙 → 本来は巨人だが休みで💙のまま
        expect(turnPlayer(container)).toBe('💙');
    });

    it('3人戦で巨人の席だけが飛ばされる', () => {
        // 席: 0=あなた, 1=巨人, 2=あなた。巨人が次に来るのは着手後のターン数が2,5,8,11,14のとき。14で 14%5=4 になり巨人が休む
        const { container } = render(<Game players={cfg('you', 'giant', 'you')} />);
        const seq: string[] = [];
        for (let k = 0; k < 13; k++) {
            seq.push(turnPlayer(container) ?? '');
            fireEvent.click(cells(container)[k]);
        }
        // 13手目(💙)の次は巨人(⭕)が飛ばされて🟩の手番
        expect(seq[12]).toBe('💙');
        expect(turnPlayer(container)).toBe('🟩');
    });
});

describe('ライフ減衰のタイミング (issue #30)', () => {
    // Math.random を 0.25 に固定すると正規乱数のライフが毎回 9 になる（sin 側の枝）
    beforeEach(() => jest.spyOn(Math, 'random').mockReturnValue(0.25));
    afterEach(() => jest.restoreAllMocks());
    const lifeAt = (container: HTMLElement, i: number) => cells(container)[i].querySelector('.life')?.textContent;

    it('3人戦: 手番が1周するまで(3着手)は減らず、4着手目で全コマが-1される', () => {
        const { container } = render(<Game players={cfg('you', 'you', 'you')} />);
        fireEvent.click(cells(container)[0]);
        expect(lifeAt(container, 0)).toBe('9');
        fireEvent.click(cells(container)[1]);
        fireEvent.click(cells(container)[2]);
        expect(lifeAt(container, 0)).toBe('9'); // 1周するまで減衰しない
        fireEvent.click(cells(container)[3]);
        expect(lifeAt(container, 0)).toBe('8'); // 2周目の最初の着手で-1
    });

    it('2人戦は従来どおり着手のたびに-1される', () => {
        const { container } = render(<Game players={cfg('you', 'you')} />);
        fireEvent.click(cells(container)[0]);
        expect(lifeAt(container, 0)).toBe('9');
        fireEvent.click(cells(container)[1]);
        expect(lifeAt(container, 0)).toBe('8');
    });
});

test('雷霆の巫: 固有スキル(帯電拡散)がパネルとスキルボタンに出る (5x5・3人戦でも)', () => {
    const { container } = render(<Game players={cfg('you', 'tactician', 'electrician')} />);
    // 席2(雷霆の巫)の手番まで進める
    fireEvent.click(cells(container)[0]);
    fireEvent.click(cells(container)[1]);
    expect(cells(container)).toHaveLength(25);
    expect(container.textContent).toContain('帯電拡散⚡ 7');
    expect(screen.getByRole('button', { name: '帯電拡散-7' })).toBeInTheDocument();
});

test('スキルカードにコストバッジ・種類タグ・使えない理由が出る', () => {
    render(
        <Game
            players={[
                { character: 'giant', isAI: false },
                { character: 'you', isAI: false },
            ]}
        />
    );
    // 初期マジック2: ストンプ(コスト6)は使えず、不足分が出る。固有タグも付く
    const stomp = screen.getByRole('button', { name: 'ストンプ-6' });
    expect(stomp).toBeDisabled();
    expect(stomp).toHaveTextContent('あと⚡4');
    expect(stomp).toHaveTextContent('固有');
    // ロック(コスト2)は使える。コストバッジが出て、不足表示はない
    const lock = screen.getByRole('button', { name: 'ロック-2' });
    expect(lock).toBeEnabled();
    expect(lock).toHaveTextContent('⚡2');
    expect(lock).not.toHaveTextContent('あと');
    // チャージは獲得なので + 表示
    expect(screen.getByRole('button', { name: 'チャージ+3' })).toHaveTextContent('+3');
});
