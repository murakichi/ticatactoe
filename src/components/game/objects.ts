// オブジェクト（空きマスに設置して使う建造物）の純粋ロジック。Game.tsx と sim/engine.js が同じ関数を呼ぶ (#289)。
//
// ルール
//  - 設置: 空きマス（氷結・🔑ロックで塞がれていないマス）に置く。持ち主 = 置いた席（SquareInfo.player）、ライフ = 種類ごとの OBJECT_DEFS[kind].life
//  - 列（勝利判定）には数えない（util.ts の lineSymbols）。ライフは時間経過で減らない（thermal.ts の decayTick / decay.ts の crowdedDecay）
//  - 乗っ取り: 自陣のオブジェクトは自分の通常のコマでいつでも乗っ取れる（placement.ts）。敵のオブジェクトはライフが0でないと乗っ取れない（ライフを削り切る攻撃でも0になるだけ）。
//    乗り方は選べる: 既定は自陣の通常のコマに置き換え（オブジェクトは消える）／選ぶと自分のオブジェクトとして奪う（placement.ts の asObject）
//  - エフェクトやスキルの効果は通常のコマと同じように受ける。氷結中のオブジェクトは休眠して効果を発揮しない
//  - 大木・枯れた大木は🔥を付けられると即座に壊れる（thermal.ts の ignite。念のため手番開始時に sweepBurntTrees でも掃除する）
//  - 手番開始時、持ち主の席のオブジェクトが objectTurnStart で効果を発揮する
import { ObjectKind, OBJECT_KINDS, isObject, isTree } from '../../types/ObjectKind';
import { Player } from '../../types/Player';
import { SquareInfo } from '../../types/SquareInfo';
import { geometryForCells } from './boardGeometry';
import { PlayerCharacters, addCharge, isGuarded } from './charge';
import { shikigamiLandable } from './shikigami';
import { isDormant } from './thermal';

export { OBJECT_KINDS, isObject, isTree };
export type { ObjectKind };

/** オブジェクトのスキルの先頭 idx（deck.ts の SKILL_CATALOG）。OBJECT_KINDS の順に並ぶ */
export const OBJECT_SKILL_BASE_IDX = 105;

export type ObjectDef = {
    name: string;
    icon: string;
    /** 設置したときのライフ */
    life: number;
    /** スキル名(skillCosts のキー) */
    costKey: 'onClickBigTree' | 'onClickDeadTree' | 'onClickSpring' | 'onClickFort' | 'onClickThundercloud';
    /** 手番開始時の効果(説明文) */
    desc: string;
};

/** 効果の数値。説明文もここから描画する（説明文と実装のズレ防止） */
export const OBJECT_PARAMS = {
    /** 大木: 手番開始時のマジック */
    bigTreeMagic: 3,
    /** 生命の泉: その手番に置くコマのライフ期待値 */
    springLife: 2,
    /** 砦: 周囲八マスの自陣コマのライフ */
    fortLife: 1,
} as const;

export const OBJECT_DEFS: Record<ObjectKind, ObjectDef> = {
    bigTree: { name: '大木', icon: '🌳', life: 3, costKey: 'onClickBigTree', desc: `手番開始時、マジック+${OBJECT_PARAMS.bigTreeMagic}。🔥を付けられると即座に壊れる` },
    deadTree: { name: '枯れた大木', icon: '🪵', life: 3, costKey: 'onClickDeadTree', desc: '手番開始時、周囲八マスのコマのうちランダムな1つに🍂を付ける。🔥を付けられると即座に壊れる' },
    spring: { name: '生命の泉', icon: '⛲', life: 4, costKey: 'onClickSpring', desc: `手番開始時のライフ期待値+${OBJECT_PARAMS.springLife}` },
    fort: { name: '砦', icon: '🏰', life: 6, costKey: 'onClickFort', desc: `手番開始時、周囲八マスの自陣のコマのライフ+${OBJECT_PARAMS.fortLife}` },
    thundercloud: { name: '雷雲', icon: '🌩️', life: 3, costKey: 'onClickThundercloud', desc: '手番開始時、周囲八マスのコマのうちランダムな1つに⚡を付ける' },
};

/** オブジェクトの設置先として選べるマスか（式神と同じ: 空きで、氷結中でも🔑ロック中でもない） */
export const objectLandable = (sq: SquareInfo): boolean => shikigamiLandable(sq) && !isObject(sq);

/** 種類 kind のオブジェクト。player のものとして、種類ごとのライフで置く */
export const newObject = (player: Player, kind: ObjectKind): SquareInfo => ({ player, bind: OBJECT_DEFS[kind].life, effects: [], object: kind });

/** 設置先に選べるマス全て（昇順） */
export const objectLandableCells = (board: SquareInfo[]): number[] => board.map((sq, i) => (objectLandable(sq) ? i : -1)).filter((i) => i !== -1);

/** 手番開始時に効果を発揮する、player のオブジェクトのマス（氷結中の休眠したものを除く。昇順） */
export const activeObjectCells = (board: SquareInfo[], player: Player, kind?: ObjectKind): number[] =>
    board.map((sq, i) => (sq.player === player && sq.object && (kind === undefined || sq.object === kind) && !isDormant(sq) ? i : -1)).filter((i) => i !== -1);

/** player の働いている生命の泉1つにつき、その手番のライフ期待値に足す値の合計 */
export const objectLifeBonus = (board: SquareInfo[], player: Player): number => activeObjectCells(board, player, 'spring').length * OBJECT_PARAMS.springLife;

/** 🔥が付いて壊れるはずの大木・枯れた大木を空きマスにして、壊れたマスを返す（ignite が先に壊すので、残っているのは🔥が直接付いたケースだけ）。board を直接書き換える */
export const sweepBurntTrees = (board: SquareInfo[]): number[] => {
    const burnt: number[] = [];
    board.forEach((sq, k) => {
        if (isTree(sq) && sq.effects.some((e) => e.effect === '🔥') && !sq.effects.some((e) => e.effect === '❄')) {
            board[k] = { player: undefined, bind: 0, effects: [] };
            burnt.push(k);
        }
    });
    return burnt;
};

export type ObjectTurnResult = {
    /** 手番開始時に得るマジック（大木） */
    magic: number;
    /** 🍂を付けられたマス（枯れた大木） */
    leaves: number[];
    /** ⚡を付けられたマス（雷雲） */
    charged: number[];
    /** ライフが増えたマス（砦） */
    fortified: number[];
};

/** 枯れた大木・雷雲の標的にできるコマ: 周囲八マスのコマのうち、🔑ロック・⚡無敵でないもの */
const randomTargets = (board: SquareInfo[], k: number, chars: PlayerCharacters): number[] =>
    geometryForCells(board.length)
        .surroundRange(k)
        .filter((j) => !!board[j].player && !isGuarded(board[j], chars));

/**
 * player の手番開始時に、player の働いているオブジェクトが効果を発揮する（生命の泉は objectLifeBonus で別に足す）。
 * 席順に昇順のマスから順に処理する。board を直接書き換える（マスは新しく作って差し替える）。
 * @param rng [0,1) を返す乱数。sim が種付きの乱数を渡す
 */
export const objectTurnStart = (board: SquareInfo[], player: Player, chars: PlayerCharacters, rng: () => number = Math.random): ObjectTurnResult => {
    const res: ObjectTurnResult = { magic: 0, leaves: [], charged: [], fortified: [] };
    const geo = geometryForCells(board.length);
    for (const k of activeObjectCells(board, player)) {
        switch (board[k].object) {
            case 'bigTree':
                res.magic += OBJECT_PARAMS.bigTreeMagic;
                break;
            case 'deadTree': {
                const cands = randomTargets(board, k, chars);
                if (cands.length === 0) break;
                const j = cands[Math.floor(rng() * cands.length)];
                board[j] = { ...board[j], effects: [...board[j].effects, { effect: '🍂' }] };
                res.leaves.push(j);
                break;
            }
            case 'thundercloud': {
                const cands = randomTargets(board, k, chars);
                if (cands.length === 0) break;
                const j = cands[Math.floor(rng() * cands.length)];
                board[j] = addCharge(board[j], chars);
                res.charged.push(j);
                break;
            }
            case 'fort':
                for (const j of geo.surroundRange(k)) {
                    if (board[j].player !== player) continue;
                    board[j] = { ...board[j], bind: board[j].bind + OBJECT_PARAMS.fortLife };
                    res.fortified.push(j);
                }
                break;
            default:
                break;
        }
    }
    return res;
};
