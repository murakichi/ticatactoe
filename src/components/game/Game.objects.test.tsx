// tsconfig の jsx は classic ("react") なので .tsx では React の import が必須
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Game, PlayerConfig } from './Game';
import { OBJECT_DEFS } from './objects';

const cells = (container: HTMLElement) => Array.from(container.querySelectorAll('button.square'));
const objectNames = Object.values(OBJECT_DEFS).map((d) => d.name);
const OBJECT_BUTTON = new RegExp(`^(${objectNames.join('|')})-\\d+$`);
// 手札にオブジェクトのスキルが必ず出るよう、デッキはオブジェクト5枚+基本の7枚
const DECK = [105, 106, 107, 108, 109, 0, 1, 2, 3, 4, 5, 6];
const cfg = (): PlayerConfig[] => [
    { character: 'you', isAI: false, deck: DECK },
    { character: 'you', isAI: false, deck: DECK },
];

// Math.random を 0.95 に固定すると、手札は（昇順のデッキの）末尾から雷雲・砦・生命の泉の3枚になり、正規乱数のライフは毎回 5 になる
describe('オブジェクト（ブラウザ版）', () => {
    beforeEach(() => jest.spyOn(Math, 'random').mockReturnValue(0.95));
    afterEach(() => jest.restoreAllMocks());

    const objectButton = () => screen.queryAllByRole('button').find((b) => OBJECT_BUTTON.test(b.textContent?.replace(/\s+/g, '') ?? '') || OBJECT_BUTTON.test(b.getAttribute('aria-label') ?? ''));

    it('スキルで空きマスに設置すると、マスの中央に絵文字・ライフが出て、列には数えない。自陣のオブジェクトは通常のコマで乗っ取れる', () => {
        const { container } = render(<Game players={cfg()} />);
        // 魔力が足りるまで、💙はチャージ・⭕は着手で手番を回す
        let free = 15;
        for (let n = 0; n < 6 && (!objectButton() || (objectButton() as HTMLButtonElement).disabled); n++) {
            fireEvent.click(screen.getByRole('button', { name: /チャージ\+3/ }));
            fireEvent.click(cells(container)[free--]);
        }
        const btn = objectButton() as HTMLButtonElement;
        expect(btn).toBeTruthy();
        expect(btn.disabled).toBe(false);
        const name = objectNames.find((n) => (btn.textContent ?? '').includes(n)) as string;
        const kind = Object.entries(OBJECT_DEFS).find(([, d]) => d.name === name)![0] as keyof typeof OBJECT_DEFS;
        fireEvent.click(btn);
        fireEvent.click(cells(container)[0]);
        const sq = cells(container)[0];
        expect(sq.textContent).toContain(OBJECT_DEFS[kind].icon);
        expect(sq.querySelector('.life')?.textContent).toBe(String(OBJECT_DEFS[kind].life));
        expect(sq.className).toContain('object');
        // 設置はコマを置く手番ではないので、同じ手番のまま💙が自陣のオブジェクトの上にコマを置ける（乗っ取り）
        fireEvent.click(sq);
        expect(sq.className).not.toContain('object');
        expect(sq.textContent).not.toContain(OBJECT_DEFS[kind].icon);
        expect(sq.querySelector('.life')?.textContent).toBe('5');
    });
    it('生命の泉: 設置した席の次の手番から、置くコマのライフ期待値が+2される（敵の手番には効かない）', () => {
        const { container } = render(<Game players={cfg()} />);
        const spring = () => screen.getByRole('button', { name: /^生命の泉-/ }) as HTMLButtonElement;
        let free = 15;
        for (let n = 0; n < 6 && spring().disabled; n++) {
            fireEvent.click(screen.getByRole('button', { name: /チャージ\+3/ }));
            fireEvent.click(cells(container)[free--]); // ⭕の着手
        }
        expect(spring().disabled).toBe(false);
        fireEvent.click(spring());
        fireEvent.click(cells(container)[0]);
        fireEvent.click(cells(container)[1]); // 💙の着手（この手番のライフは設置前に決まっているので5）
        expect(cells(container)[1].querySelector('.life')?.textContent).toBe('5');
        fireEvent.click(cells(container)[free--]); // ⭕の着手（泉は💙のものなので+0）
        expect(cells(container)[free + 1].querySelector('.life')?.textContent).toBe('5');
        fireEvent.click(cells(container)[2]); // 💙の次の手番: 泉の+2
        expect(cells(container)[2].querySelector('.life')?.textContent).toBe('7');
    });
    it('補強工事: 使ってから自陣のオブジェクトを選ぶとライフ+3。対象でないマスは選び直せる', () => {
        const deck = [0, 1, 2, 3, 4, 5, 6, 7, 8, 105, 117, 119]; // 手札は末尾から 分譲・補強工事・大木
        const { container } = render(<Game players={[{ character: 'you', isAI: false, deck }, { character: 'you', isAI: false, deck }]} />);
        const btn = (re: RegExp) => screen.getByRole('button', { name: re }) as HTMLButtonElement;
        let free = 15;
        const charge = () => {
            fireEvent.click(screen.getByRole('button', { name: /チャージ\+3/ }));
            fireEvent.click(cells(container)[free--]); // ⭕の着手
        };
        for (let n = 0; n < 8 && btn(/^大木-/).disabled; n++) charge();
        fireEvent.click(btn(/^大木-/));
        fireEvent.click(cells(container)[0]);
        expect(cells(container)[0].querySelector('.life')?.textContent).toBe('5');
        for (let n = 0; n < 8 && btn(/^補強工事-/).disabled; n++) charge();
        fireEvent.click(btn(/^補強工事-/));
        fireEvent.click(cells(container)[7]); // 空きマスは対象でない: 選び直せる
        expect(cells(container)[0].querySelector('.life')?.textContent).toBe('5');
        fireEvent.click(cells(container)[0]);
        expect(cells(container)[0].querySelector('.life')?.textContent).toBe('8');
    });
});
