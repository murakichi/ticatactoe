// tsconfig の jsx は classic ("react") なので .tsx では React の import が必須
import React from 'react';
import * as fs from 'fs';
import * as path from 'path';
import { render, screen, fireEvent } from '@testing-library/react';
import { Game, PlayerConfig } from './Game';
import { BoardEffects, BurstType } from './BoardEffects';
import { GearToasts } from './GearToasts';
import { GEARS, GearId } from './gear';

// 「ギアが発動したら演出が出る」ことを守る登録表。
// 発動の瞬間があるギアは、Game.tsx の gearTrigger('<id>', …) で盤面にチップ(と効果音)を出す。
// 常に効いているだけのパッシブは 'passive'。新しいギアを足したら、どちらかを登録しないとテストが落ちる(演出の付け忘れ防止)。
const GEAR_TRIGGERS: Record<GearId, 'trigger' | 'passive'> = {
    emptyLock: 'trigger', // ロック切れで空きマスにコマが生まれる
    ironLock: 'passive',
    bindingLock: 'trigger', // トークンにロックが付く
    quadMastery: 'trigger', // 4回目のスキルで次が無料
    afterglow: 'trigger', // 次の手番の1つ目が安い
    luckyPurse: 'trigger', // コスト0
    sturdy: 'passive',
    titanCost: 'passive',
    reinforce: 'passive',
    harvest: 'trigger', // 魔力獲得
    toxicBloom: 'trigger', // バッズ付与
    priceWreck: 'passive', // 試合開始時に価格が決まる
    chainDiscount: 'passive', // コスト表示に反映される
    propagate: 'trigger', // エフェクトが広がる
    lightToken: 'passive',
    gambler: 'passive',
    vengeance: 'trigger', // 魔力の増減
    colorGarden: 'trigger', // ターン開始の魔力
    ailmentPact: 'passive', // コスト表示に反映される
    ruinSurge: 'trigger', // 廃墟で割引開始
    scorchedEarth: 'trigger', // 敵の🌱が燃えて魔力
    ashOffering: 'trigger', // 敵に🔥を付与して割引開始
    frostRoot: 'trigger', // 休眠した🌱で魔力
    conduction: 'trigger', // 毒・火炎が移る
    lastStand: 'trigger', // 防壁の発動
};

const gameSource = fs.readFileSync(path.join(__dirname, 'Game.tsx'), 'utf8');

describe('ギアの発動の演出', () => {
    it('全ギアが登録表にある(新ギアの演出の付け忘れ防止)', () => {
        const missing = GEARS.filter((g) => !(g.id in GEAR_TRIGGERS)).map((g) => `${g.name}(${g.id})`);
        expect(missing).toEqual([]);
        const known = new Set<string>(GEARS.map((g) => g.id));
        expect(Object.keys(GEAR_TRIGGERS).filter((k) => !known.has(k))).toEqual([]);
    });

    it.each(Object.entries(GEAR_TRIGGERS).filter(([, kind]) => kind === 'trigger'))('%s は発動時に gearTrigger を呼ぶ', (id) => {
        expect(gameSource).toContain(`gearTrigger('${id}'`);
    });

    it('土壇場の防壁は専用の盤面演出(bulwark)も出す', () => {
        expect(gameSource).toContain("playEffect('bulwark'");
    });
});

describe('GearToasts', () => {
    it('発動したギアのアイコン・名前・内容をチップで出す', () => {
        const { container } = render(
            <GearToasts toasts={[{ id: 1, icon: '👛', name: '幸運の財布', text: 'コスト0' }, { id: 2, icon: '🌾', name: '収穫' }]} />
        );
        expect(container.textContent).toContain('👛');
        expect(container.textContent).toContain('幸運の財布');
        expect(container.textContent).toContain('コスト0');
        expect(container.textContent).toContain('収穫');
    });

    it('何も無ければ何も描画しない', () => {
        const { container } = render(<GearToasts toasts={[]} />);
        expect(container.firstChild).toBeNull();
    });
});

describe('ギア発動のマス演出', () => {
    it.each<[BurstType, string]>([
        ['gearKey', '🗝️'],
        ['gearBloom', '🌺'],
        ['gearSpread', '🌊'],
        ['gearEmpty', '🕳️'],
    ])('%s は指定マスの数だけ「%s」を出す', (type, emoji) => {
        const { container } = render(<BoardEffects effect={null} burst={{ type, cells: [1, 2], nonce: 1 }} size={4} />);
        expect(container.textContent?.split(emoji).length).toBe(3);
    });

    it('土壇場の防壁(bulwark)はバナーと演出要素を出す', () => {
        const { container } = render(<BoardEffects effect={{ type: 'bulwark', nonce: 1 }} size={4} />);
        expect(container.querySelector('[class*="banner"]')?.textContent).toBe('土壇場の防壁');
        expect(container.querySelectorAll('div,span').length).toBeGreaterThan(4);
    });
});

describe('ゲーム中のギア発動（統合）', () => {
    const cells = (container: HTMLElement) => Array.from(container.querySelectorAll('button.square'));
    const players = (g0: GearId[]): PlayerConfig[] => [
        { character: 'you', isAI: false, gears: g0 },
        { character: 'you', isAI: false, gears: [] },
    ];
    const toastText = (container: HTMLElement) => container.querySelector('[class*="GearToasts_stack"], [class*="stack"]')?.textContent ?? '';
    afterEach(() => jest.restoreAllMocks());

    it('幸運の財布が当たると「👛幸運の財布 コスト0」のチップが出る', () => {
        jest.spyOn(Math, 'random').mockReturnValue(0.1); // < 20%
        const { container } = render(<Game players={players(['luckyPurse'])} />);
        expect(toastText(container)).toBe('');
        fireEvent.click(screen.getByRole('button', { name: 'ロック-2' }));
        expect(toastText(container)).toContain('幸運の財布');
        expect(toastText(container)).toContain('コスト0');
    });

    it('幸運の財布が外れたらチップは出ない', () => {
        jest.spyOn(Math, 'random').mockReturnValue(0.9);
        const { container } = render(<Game players={players(['luckyPurse'])} />);
        fireEvent.click(screen.getByRole('button', { name: 'ロック-2' }));
        expect(toastText(container)).toBe('');
    });

    it('ギアを持たない席のスキルではチップは出ない', () => {
        jest.spyOn(Math, 'random').mockReturnValue(0.1);
        const { container } = render(<Game players={players([])} />);
        fireEvent.click(screen.getByRole('button', { name: 'ロック-2' }));
        fireEvent.click(cells(container)[5]);
        expect(toastText(container)).toBe('');
    });
});
