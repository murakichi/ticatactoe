// tsconfig の jsx は classic ("react") なので .tsx では React の import が必須
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Game, PlayerConfig } from './Game';
import { GearId } from './gear';

const cells = (container: HTMLElement) => Array.from(container.querySelectorAll('button.square'));
const lifeAt = (container: HTMLElement, i: number) => cells(container)[i].querySelector('.life')?.textContent;
const magicChips = (container: HTMLElement) =>
    Array.from(container.querySelectorAll('[class*="chipMagic"]')).map((el) => Number((el.textContent ?? '').replace(/\D/g, '')));
const players = (g0: GearId[], g1: GearId[] = []): PlayerConfig[] => [
    { character: 'you', isAI: false, gears: g0 },
    { character: 'you', isAI: false, gears: g1 },
];

// Math.random を 0.25 に固定すると正規乱数のライフが毎回 9 になる（平均5・σ3）
describe('ギア（ブラウザ版）', () => {
    beforeEach(() => jest.spyOn(Math, 'random').mockReturnValue(0.25));
    afterEach(() => jest.restoreAllMocks());

    it('装備中のギアがパネルに出る', () => {
        render(<Game players={players(['sturdy', 'ironLock'])} />);
        expect(screen.getByText(/頑健/)).toBeInTheDocument();
        expect(screen.getByText(/堅牢の鍵/)).toBeInTheDocument();
    });

    it('頑健: ライフ平均+1（9 → 10）/ 賭博師の骰子: σ=5（9 → 13）', () => {
        const a = render(<Game players={players(['sturdy'])} />);
        fireEvent.click(cells(a.container)[0]);
        expect(lifeAt(a.container, 0)).toBe('10');
        a.unmount();
        const b = render(<Game players={players(['gambler'])} />);
        fireEvent.click(cells(b.container)[0]);
        expect(lifeAt(b.container, 0)).toBe('13');
    });

    it('剛腕の代償: ライフ+3 かつ全スキルのコスト+2（ロック 2 → 4）', () => {
        const { container } = render(<Game players={players(['titanCost'])} />);
        expect(screen.getByRole('button', { name: 'ロック-4' })).toBeInTheDocument();
        fireEvent.click(cells(container)[0]);
        expect(lifeAt(container, 0)).toBe('12');
    });

    it('剛腕の代償は装備した席の手番にだけ効く', () => {
        const { container } = render(<Game players={players(['titanCost'])} />);
        fireEvent.click(cells(container)[0]); // → ⭕の手番
        expect(screen.getByRole('button', { name: 'ロック-2' })).toBeInTheDocument();
    });

    it('連鎖割引: スキルを使うと同じ手番の次のコストが下がる（ロック 2 → 1）', () => {
        render(<Game players={players(['chainDiscount'])} />);
        expect(screen.getByRole('button', { name: 'ロック-2' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'ロック-2' }));
        expect(screen.getByRole('button', { name: 'ロック-1' })).toBeInTheDocument();
    });

    it('堅牢の鍵: ロックのライフが9になる（通常は6）', () => {
        const a = render(<Game players={players(['ironLock'])} />);
        fireEvent.click(screen.getByRole('button', { name: 'ロック-2' }));
        fireEvent.click(cells(a.container)[5]);
        expect(lifeAt(a.container, 5)).toBe('9');
        a.unmount();
        const b = render(<Game players={players([])} />);
        fireEvent.click(screen.getByRole('button', { name: 'ロック-2' }));
        fireEvent.click(cells(b.container)[5]);
        expect(lifeAt(b.container, 5)).toBe('6');
    });

    it('空蔵: 空きマスのロックが切れると自陣のコマ(ライフ1)になる', () => {
        const { container } = render(<Game players={players(['emptyLock'])} />);
        fireEvent.click(screen.getByRole('button', { name: 'ロック-2' }));
        fireEvent.click(cells(container)[5]); // 空きマスをロック（手番はそのまま）
        [0, 1, 2, 3, 4, 6].forEach((i) => fireEvent.click(cells(container)[i])); // 6着手でロック(6)が切れる
        expect(cells(container)[5].className).toMatch(/heart/);
        expect(lifeAt(container, 5)).toBe('1');
    });

    it('空蔵なしなら、ロックが切れても空きマスのまま', () => {
        const { container } = render(<Game players={players([])} />);
        fireEvent.click(screen.getByRole('button', { name: 'ロック-2' }));
        fireEvent.click(cells(container)[5]);
        [0, 1, 2, 3, 4, 6].forEach((i) => fireEvent.click(cells(container)[i]));
        expect(cells(container)[5].className).toMatch(/empty/);
    });

    it('幸運の財布: 乱数が当たればコスト0（魔力が減らない）', () => {
        jest.spyOn(Math, 'random').mockReturnValue(0.1); // < 20%
        const { container } = render(<Game players={players(['luckyPurse'])} />);
        expect(magicChips(container)[0]).toBe(2);
        fireEvent.click(screen.getByRole('button', { name: 'ロック-2' }));
        expect(magicChips(container)[0]).toBe(2);
    });

    it('幸運の財布: 外れれば通常どおり払う', () => {
        jest.spyOn(Math, 'random').mockReturnValue(0.9);
        const { container } = render(<Game players={players(['luckyPurse'])} />);
        fireEvent.click(screen.getByRole('button', { name: 'ロック-2' }));
        expect(magicChips(container)[0]).toBe(0);
    });

    it('価格破壊: 全スキルの基礎コストがずれる（乱数0.25 → 全て-2、下限1）', () => {
        // 加算値は floor(0.25*9)-4 = -2。ロックは 2-2=0 → 下限1
        render(<Game players={players(['priceWreck'])} />);
        expect(screen.getByRole('button', { name: 'ロック-1' })).toBeInTheDocument();
    });

    it('価格破壊: 乱数が最大なら全て+4（ロック 2 → 6）。リスタートで引き直し', () => {
        jest.spyOn(Math, 'random').mockReturnValue(0.99);
        render(<Game players={players(['priceWreck'])} />);
        expect(screen.getByRole('button', { name: 'ロック-6' })).toBeInTheDocument();
        jest.spyOn(Math, 'random').mockReturnValue(0.25);
        fireEvent.click(screen.getByRole('button', { name: 'リスタート' }));
        expect(screen.getByRole('button', { name: 'ロック-1' })).toBeInTheDocument();
    });

    it('余韻: スキルを使った次の自分の手番、1つ目のスキルだけコスト-1', () => {
        const { container } = render(<Game players={players(['afterglow'])} />);
        fireEvent.click(screen.getByRole('button', { name: 'ロック-2' })); // 余韻の予約
        fireEvent.click(cells(container)[5]);
        fireEvent.click(cells(container)[0]); // 💙の手番終了
        fireEvent.click(cells(container)[1]); // ⭕の手番終了 → 💙
        expect(screen.getByRole('button', { name: 'ロック-1' })).toBeInTheDocument();
    });

    it('余韻: スキルを使わなかった次の手番には付かない', () => {
        const { container } = render(<Game players={players(['afterglow'])} />);
        fireEvent.click(cells(container)[0]);
        fireEvent.click(cells(container)[1]);
        expect(screen.getByRole('button', { name: 'ロック-2' })).toBeInTheDocument();
    });

    // 乱数固定でライフは「あなた」9・巨人12。巨人はライフが残っている敵コマも殴れるので、💙のコマを奪える
    const vengeanceGame = (g0: GearId[], g1: GearId[]) =>
        render(
            <Game
                players={[
                    { character: 'you', isAI: false, gears: g0 },
                    { character: 'giant', isAI: false, gears: g1 },
                ]}
            />
        );

    it('復讐の刃: 自分のコマを奪われると魔力+2', () => {
        const { container } = vengeanceGame(['vengeance'], []);
        fireEvent.click(cells(container)[0]); // 💙が置く
        fireEvent.click(cells(container)[0]); // ⭕(巨人)が奪取 → 💙の手番開始
        expect(cells(container)[0].className).toMatch(/circle/);
        expect(magicChips(container)[0]).toBe(2 + 1 + 2); // 初期2 + 手番開始1 + 復讐2
    });

    it('復讐の刃: 装備していない側が奪われても魔力は増えない', () => {
        const { container } = vengeanceGame([], []);
        fireEvent.click(cells(container)[0]);
        fireEvent.click(cells(container)[0]);
        expect(magicChips(container)[0]).toBe(2 + 1);
    });

    it('復讐の刃: 自分が奪取すると魔力-1', () => {
        const { container } = vengeanceGame([], ['vengeance']);
        fireEvent.click(cells(container)[0]);
        expect(magicChips(container)[1]).toBe(3); // 巨人の手番開始: 初期2+1
        fireEvent.click(cells(container)[0]); // 奪取
        expect(magicChips(container)[1]).toBe(2);
    });
});
