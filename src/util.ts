import { CharacterId, YingYangMode } from './types/Character';
import { Player } from './types/Player';
import { SquareInfo } from './types/SquareInfo';
import { geometryForCells } from './components/game/boardGeometry';

/**
 * ライフ値の平均。毎ターン σ=LIFE_STD の正規分布で抽選される。
 * ここが唯一の出典で、キャラ選択画面の説明文もこの値を参照する（説明文と実装のズレ防止 / issue #13）。
 */
export const LIFE_MEANS = {
    magician: 4,
    tactician: 5,
    giant: 10,
    yinYangMaster_yang: 7,
    yinYangMaster_ying: 4,
    electrician: 6,
    cryomancer: 4, // 魔力+1(Game.tsx)とセット。鍛冶師と互角（対鍛冶師 53%）にするため、魔法使い並みに紙
    pyromancer: 6,
    witch: 4, // 魔力+1(Game.tsx)とセット（ユーザー指示）
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

/** std はギア(賭博師の骰子)でばらつきを変えるときに渡す。省略時は LIFE_STD */
const calculateLife = (nextCharacterId: CharacterId, yingYangMode: YingYangMode | undefined, lifeBonus: number = 0, std: number = LIFE_STD, rng: () => number = Math.random): number => {
    return Math.floor(normRand(lifeMeanOf(nextCharacterId, yingYangMode) + lifeBonus, std, rng));
};

/** 式神(📜)は列の並びに数えない */
const isShikigami = (sq: { effects: readonly { effect: string }[] }): boolean => sq.effects.some((e) => e.effect === '📜');
/** 列判定用のシンボル配列（式神はコマ無し扱い） */
const lineSymbols = (board: SquareInfo[]): (Player | undefined)[] => board.map((x) => (isShikigami(x) ? undefined : x.player));

const calculateWinner = (squares: (Player | undefined)[]): Player | undefined => {
    for (const line of geometryForCells(squares.length).winLines) {
        const first = squares[line[0]];
        if (first && line.every((idx) => squares[idx] === first)) {
            return first;
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
 * @param rng [0,1) の乱数。sim が種付きの乱数を渡す。省略時は Math.random
 * @return number ランダムに生成された値
 */
const normRand = (m: number, s: number, rng: () => number = Math.random): number => {
    const c = Math.sqrt(-2 * Math.log(rng()));
    if (0.5 - rng() > 0) {
        return c * Math.sin(Math.PI * 2 * rng()) * s + m;
    } else {
        return c * Math.cos(Math.PI * 2 * rng()) * s + m;
    }
};

const range = (start: number, count: number): number[] => Array.from({ length: count }, (_, i) => start + i);

const findEmptyIndexes = (ary: (SquareInfo | undefined)[]) =>
    ary.map((x, i) => (x?.player === undefined && x?.effects.filter((effect) => effect.effect === '🔑' || effect.effect === '❄').length === 0 ? i : -1)).filter((x) => x !== -1);

export {isShikigami, lineSymbols, calculateLife, lifeMeanOf, calculateWinner, randomPick, randomAnyPick, normRand, range, findEmptyIndexes };
