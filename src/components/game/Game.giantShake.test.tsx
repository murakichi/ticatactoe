import React from 'react';
import * as fs from 'fs';
import * as path from 'path';
import { render, fireEvent } from '@testing-library/react';
import { Game } from './Game';
import { CharacterId } from '../../types/Character';

// 巨人は、普通にマスへ置いただけでも盤面が軽く揺れる(連続で置いても毎回再生し直す)
describe('巨人の着手の揺れ', () => {
    const setup = (c0: CharacterId, c1: CharacterId = 'you') =>
        render(
            <Game
                players={[
                    { character: c0, isAI: false },
                    { character: c1, isAI: false },
                ]}
            />
        );
    const area = (c: HTMLElement) => c.querySelector('[class*="boardArea"]') as HTMLElement;
    const squares = (c: HTMLElement) => Array.from(c.querySelectorAll<HTMLButtonElement>('button[class*="square"]'));
    const shaking = (c: HTMLElement) => /shakeLight/.test(area(c).className);

    it('巨人が置くと、盤面が軽く揺れる', () => {
        const { container } = setup('giant');
        expect(shaking(container)).toBe(false);
        fireEvent.click(squares(container)[0]);
        expect(shaking(container)).toBe(true);
    });

    it('巨人以外が置いても揺れない', () => {
        const { container } = setup('you', 'giant');
        fireEvent.click(squares(container)[0]);
        expect(shaking(container)).toBe(false);
    });

    it('巨人が置くたびに別名のアニメーションへ切り替わる(連続でも揺れが再生し直される)', () => {
        // 先手・後手とも巨人
        const { container } = setup('giant', 'giant');
        const placed = () => squares(container).filter((b) => b.querySelector('[class*="life"]') && !/empty/.test(b.className)).length;
        const names: string[] = [];
        let next = 0;
        // 着手が受理された(盤上のコマが増えた)ときだけ、そのときの揺れの種類を記録する
        while (names.length < 3 && next < 16) {
            const before = placed();
            fireEvent.click(squares(container)[next++]);
            if (placed() > before) names.push(area(container).className.match(/shakeLight[AB]/)?.[0] ?? '');
        }
        expect(names).toHaveLength(3);
        expect(names[0]).not.toBe('');
        expect(names[1]).not.toBe(names[0]);
        expect(names[2]).toBe(names[0]);
    });

    it('揺れの大きさは、ストンプなどの大きな揺れより小さい(CSS)', () => {
        const css = fs.readFileSync(path.join(__dirname, 'Game.module.css'), 'utf8');
        const maxShift = (name: string): number => {
            const body = new RegExp('@keyframes ' + name + ' \\{([\\s\\S]*?)\\n\\}').exec(css)?.[1] ?? '';
            return Math.max(...Array.from(body.matchAll(/translate\((-?\d+)px/g)).map((m) => Math.abs(Number(m[1]))));
        };
        expect(maxShift('boardShakeLightA')).toBeGreaterThan(0);
        expect(maxShift('boardShakeLightA')).toBeLessThan(maxShift('boardShake') / 2);
    });
});
