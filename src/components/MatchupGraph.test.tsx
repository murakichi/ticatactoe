import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MatchupGraph } from './MatchupGraph';
import { Edge, LiveApi } from './simLive';

// 閉ループ検出は sim/live.js の本物を使う（画面に出るのと同じコード）
// eslint-disable-next-line @typescript-eslint/no-var-requires
const live: LiveApi = require('../../sim/live');

const names = { a: '🅰️ エー', b: '🅱️ ビー', c: '🆎 シー', d: '🔤 ディー' };
const E = (from: string, to: string, rate: number, significant = true): Edge => ({ from, to, rate, decided: 50, lo: significant ? 0.55 : 0.45, significant });
// a→b→c→a の三すくみ。d は a に勝つ（循環に入らない）。c→d は傾向だけ
const edges = [E('a', 'b', 0.8), E('b', 'c', 0.7), E('c', 'a', 0.65), E('d', 'a', 0.75), E('c', 'd', 0.58, false)];

const renderGraph = () => render(<MatchupGraph ids={['a', 'b', 'c', 'd']} edges={edges} names={names} findLoops={live.findLoops} minDecided={20} />);
const paths = (container: HTMLElement) => Array.from(container.querySelectorAll('path[data-from]')) as SVGPathElement[];
const nodeOf = (container: HTMLElement, id: string) => container.querySelector(`g[role=button][aria-label="${names[id as keyof typeof names]}"]`) as Element;
const kindOf = (container: HTMLElement, from: string, to: string) => container.querySelector(`path[data-from="${from}"][data-to="${to}"]`)?.getAttribute('data-kind');

describe('MatchupGraph', () => {
    beforeEach(() => window.localStorage.clear());

    test('既定は有意な辺だけを描き、閉ループに入る辺を区別する', () => {
        const { container } = renderGraph();
        expect(paths(container)).toHaveLength(4); // 傾向の c→d は出ない
        expect(kindOf(container, 'a', 'b')).toBe('loop');
        expect(kindOf(container, 'b', 'c')).toBe('loop');
        expect(kindOf(container, 'c', 'a')).toBe('loop');
        expect(kindOf(container, 'd', 'a')).toBe('plain'); // d は循環の外
        expect(screen.getByText(/互いに循環する3キャラ/)).toBeTruthy();
        expect(screen.getByText('三すくみ')).toBeTruthy();
    });

    test('「すべて」にすると傾向の辺も出る', () => {
        const { container } = renderGraph();
        fireEvent.change(screen.getByLabelText('表示する辺'), { target: { value: 'all' } });
        expect(paths(container)).toHaveLength(5);
        expect(container.querySelector('path[data-from="c"][data-to="d"]')?.getAttribute('class')).toContain('soft');
    });

    test('表示する辺の条件に応じて閉ループも作り直す（弱い辺を除くと三すくみが崩れる）', () => {
        // c→a は有意だが勝率58%。60%以上だけにすると c→a が消えて、a→b→c→a は閉じなくなる
        const weakLast = [E('a', 'b', 0.8), E('b', 'c', 0.7), E('c', 'a', 0.58)];
        const { container } = render(<MatchupGraph ids={['a', 'b', 'c']} edges={weakLast} names={names} findLoops={live.findLoops} minDecided={20} />);
        expect(kindOf(container, 'c', 'a')).toBe('loop');
        expect(screen.getByText('三すくみ')).toBeTruthy();
        fireEvent.change(screen.getByLabelText('表示する辺'), { target: { value: '60' } });
        expect(container.querySelector('path[data-from="c"][data-to="a"]')).toBeNull();
        expect(kindOf(container, 'a', 'b')).toBe('plain');
        expect(screen.queryByText('三すくみ')).toBeNull();
        expect(screen.getByText(/ありません。勝ち負けは一方向だけ/)).toBeTruthy();
    });

    test('キャラを押すと、勝てる相手(出る辺)と負ける相手(入る辺)を強調し、その他は薄くする', () => {
        const { container } = renderGraph();
        fireEvent.click(nodeOf(container, 'a'));
        expect(kindOf(container, 'a', 'b')).toBe('out');
        expect(kindOf(container, 'd', 'a')).toBe('in');
        expect(kindOf(container, 'c', 'a')).toBe('in');
        expect(kindOf(container, 'b', 'c')).toBe('dim');
        expect(screen.getByText('勝てる相手')).toBeTruthy();
        expect(screen.getByText('負ける相手')).toBeTruthy();
        // もう一度押すと解除
        fireEvent.click(nodeOf(container, 'a'));
        expect(kindOf(container, 'a', 'b')).toBe('loop');
    });

    test('循環の一覧から選ぶと、その循環の辺だけを強調する', () => {
        const { container } = renderGraph();
        fireEvent.click(screen.getByRole('button', { name: /三すくみ/ }));
        expect(kindOf(container, 'a', 'b')).toBe('cycle');
        expect(kindOf(container, 'c', 'a')).toBe('cycle');
        expect(kindOf(container, 'd', 'a')).toBe('dim');
    });

    test('一方向だけの階層なら閉ループなしと表示する', () => {
        render(<MatchupGraph ids={['a', 'b', 'c']} edges={[E('a', 'b', 0.8), E('b', 'c', 0.7), E('a', 'c', 0.9)]} names={names} findLoops={live.findLoops} minDecided={20} />);
        expect(screen.getByText(/ありません。勝ち負けは一方向だけ/)).toBeTruthy();
    });

    test('キャラを非表示にすると、そのキャラの辺と閉ループも外れる。「すべて表示」で戻る', () => {
        const { container } = renderGraph();
        expect(screen.getByText('三すくみ')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: '🅱️ ビー', pressed: true })); // チップ（ノードの aria-label と区別するため pressed で絞る）
        expect(screen.queryByRole('button', { name: '🅱️ ビー', pressed: false })).toBeTruthy();
        expect(container.querySelector('g[role=button][aria-label="🅱️ ビー"]')).toBeNull(); // ノードが消える
        expect(paths(container).map((p) => `${p.dataset.from}>${p.dataset.to}`).sort()).toEqual(['c>a', 'd>a']);
        expect(screen.queryByText('三すくみ')).toBeNull(); // b を外すと a→b→c→a は閉じない
        expect(kindOf(container, 'c', 'a')).toBe('plain');
        fireEvent.click(screen.getByRole('button', { name: 'すべて表示' }));
        expect(paths(container)).toHaveLength(4);
        expect(screen.getByText('三すくみ')).toBeTruthy();
    });

    test('非表示にしたキャラは次回の表示にも引き継ぐ', () => {
        const first = renderGraph();
        fireEvent.click(screen.getByRole('button', { name: '🆎 シー', pressed: true }));
        first.unmount();
        const { container } = renderGraph();
        expect(container.querySelector('g[role=button][aria-label="🆎 シー"]')).toBeNull();
        expect(screen.getByRole('button', { name: '🆎 シー', pressed: false })).toBeTruthy();
    });

    test('選択中のキャラを非表示にすると、選択は解除される', () => {
        const { container } = renderGraph();
        fireEvent.click(nodeOf(container, 'a'));
        expect(screen.getByText('勝てる相手')).toBeTruthy();
        fireEvent.click(screen.getAllByRole('button', { name: '🅰️ エー' }).find((b) => b.getAttribute('title') === '押すと非表示') as HTMLElement);
        expect(screen.queryByText('勝てる相手')).toBeNull();
    });
});
