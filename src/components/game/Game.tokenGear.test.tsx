// tsconfig の jsx は classic ("react") なので .tsx では React の import が必須
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Game, PlayerConfig } from './Game';
import { GearId } from './gear';

const cells = (container: HTMLElement) => Array.from(container.querySelectorAll('button.square'));
// 手札は昇順デッキの末尾から取られるので（Math.random=0.95）、末尾に 37(火炎トークン) を置いて必ず手札に出す
const DECK = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 37];
const random = () => Math.random as unknown as jest.SpyInstance;
const cfg = (gears: GearId[]): PlayerConfig[] => [
    { character: 'you', isAI: false, deck: DECK, gears },
    { character: 'you', isAI: false, deck: DECK },
];

// 火炎・氷結・ダブル帯電のトークンは、以前は本番(Game.tsx)だけ置いたあとのギア処理(afterTokenPlaced)を通していなかった。
// sim と同じく『トークン系スキルで置いたコマ』全般に道連れの鍵・収穫が効く
describe('火炎トークンにも道連れの鍵・収穫が効く（ブラウザ版）', () => {
    beforeEach(() => jest.spyOn(Math, 'random').mockReturnValue(0.95));
    afterEach(() => jest.restoreAllMocks());

    it('道連れの鍵(置く瞬間の乱数を0にして必ず当たる): 火炎トークンで置いたコマにロックが付く', () => {
        const { container } = render(<Game players={cfg(['bindingLock'])} />);
        let btn = screen.queryAllByRole('button').find((b) => /火炎トークン⚡\d/.test((b.textContent ?? '').replace(/\s+/g, '')));
        // 魔力が足りるまで、💙はチャージ・⭕は着手で手番を回す
        let free = 15;
        for (let n = 0; n < 6 && (!btn || (btn as HTMLButtonElement).disabled); n++) {
            fireEvent.click(screen.getByRole('button', { name: /チャージ\+\d/ }));
            fireEvent.click(cells(container)[free--]);
            btn = screen.queryAllByRole('button').find((b) => /火炎トークン⚡\d/.test((b.textContent ?? '').replace(/\s+/g, '')));
        }
        expect(btn).toBeTruthy();
        expect((btn as HTMLButtonElement).disabled).toBe(false);
        const before = cells(container).map((c) => c.textContent);
        random().mockReturnValue(0); // 手札を決めたあと、置くマスの抽選と道連れの鍵の判定を『必ず当たる』にする
        fireEvent.click(btn as HTMLButtonElement);
        const placed = cells(container).findIndex((c, i) => c.textContent !== before[i] && (c.textContent ?? '').includes('🔥'));
        expect(placed).toBeGreaterThanOrEqual(0);
        expect(cells(container)[placed].textContent).toContain('🔑');
    });
});
