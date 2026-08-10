import { CharacterId, YingYangMode } from './types/Character';
import { Player } from './types/Player';
import { SquareInfo } from './types/SquareInfo';

/**
 * ライフ値の平均。毎ターン σ=LIFE_STD の正規分布で抽選される。
 * ここが唯一の出典で、キャラ選択画面の説明文もこの値を参照する（説明文と実装のズレ防止 / issue #13）。
 * バランス調整時は sim/config.js の lifeMeans も同じ値に揃えること。
 */
export const LIFE_MEANS = {
    magician: 4,
    tactician: 5,
    giant: 8,
    yinYangMaster_yang: 7,
    yinYangMaster_ying: 4,
    default: 5,
} as const;

export const LIFE_STD = 3;

/** キャラ(と陰陽モード)に対応するライフ平均を返す */
const lifeMeanOf = (characterId: CharacterId, yingYangMode?: YingYangMode): number => {
    if (characterId === 'yinYangMaster') {
        return yingYangMode === 'yang' ? LIFE_MEANS.yinYangMaster_yang : LIFE_MEANS.yinYangMaster_ying;
    }
    return (LIFE_MEANS as Record<string, number>)[characterId] ?? LIFE_MEANS.default;
};

const calculateLife = (nextCharacterId: CharacterId, yingYangMode: YingYangMode | undefined, lifeBonus: number = 0): number => {
    return Math.floor(normRand(lifeMeanOf(nextCharacterId, yingYangMode) + lifeBonus, LIFE_STD));
};

const calculateWinner = (squares: (Player | undefined)[]) => {
    const lines = [
        [0, 1, 2, 3],
        [4, 5, 6, 7],
        [8, 9, 10, 11],
        [12, 13, 14, 15],

        [0, 4, 8, 12],
        [1, 5, 9, 13],
        [2, 6, 10, 14],
        [3, 7, 11, 15],

        [0, 5, 10, 15],
        [3, 6, 9, 12],
    ];

    for (let i = 0; i < lines.length; i++) {
        const [a, b, c, d] = lines[i];
        if (squares && squares[a] && squares[a] === squares[b] && squares[a] === squares[c] && squares[a] === squares[d]) {
            return squares[a];
        }
    }
    return undefined;
};

const randomPick = <T>(ary: T[]) => ary[Math.floor(Math.random() * ary.length)];

const randomAnyPick = <T>(ary: T[], n: number) => {
    const result: T[] = [];
    for (let i = 0; i < n; i++) {
        const index = Math.floor(Math.random() * ary.length);
        result.push(ary[index]);
        ary.splice(index, 1);
    }
    return result;
};

/**
 * 正規分布乱数関数 参考:http://d.hatena.ne.jp/iroiro123/20111210/1323515616
 * @param number m 平均μ
 * @param number s 分散σ^2
 * @return number ランダムに生成された値
 */
const normRand = (m: number, s: number): number => {
    const c = Math.sqrt(-2 * Math.log(Math.random()));
    if (0.5 - Math.random() > 0) {
        return c * Math.sin(Math.PI * 2 * Math.random()) * s + m;
    } else {
        return c * Math.cos(Math.PI * 2 * Math.random()) * s + m;
    }
};

const range = (start: number, count: number): number[] => Array.from({ length: count }, (_, i) => start + i);

const findEmptyIndexes = (ary: (SquareInfo | undefined)[]) =>
    ary.map((x, i) => (x?.player === undefined && x?.effects.filter((effect) => effect.effect === '🔑').length === 0 ? i : -1)).filter((x) => x !== -1);

export {calculateLife, lifeMeanOf, calculateWinner, randomPick, randomAnyPick, normRand, range, findEmptyIndexes };
