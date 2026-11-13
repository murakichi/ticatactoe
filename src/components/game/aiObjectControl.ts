// 新スキル（普請停止令・付け火・お構いなし）をAIが撃つ判断。盤面と席から決まる純粋関数だけ（AIPlayer の状態には触れない）。
import { isBuilding } from '../../types/ObjectKind';
import { Player } from '../../types/Player';
import { SquareInfo } from '../../types/SquareInfo';
import { geometryForCells } from './boardGeometry';
import { PlayerCharacters, isGuarded } from './charge';
import { AWAKEN_BUILDINGS } from './dragon';
import { objectSkillTargets } from './objects';
import { flameStacks, isDormant } from './thermal';

/** 付け火で焼く優先度（高いほど先）。敵の手番開始の効果・縛り・勝ち筋になるものほど高い */
const ARSON_VALUE: Partial<Record<string, number>> = {
    eightTrigrams: 10, bigTree: 9, poisonSwamp: 9, thundercloud: 9, workshop: 8, oneWord: 8, soloSign: 8, tongueKing: 7, mudField: 7, luckyCat: 7,
    fort: 5, market: 5, spring: 5, sanctuary: 5, blindMonkey: 4, deadTree: 3, amuletShrine: 4, barrierStone: 3, boulder: 2, shikigami: 2,
};

/** 付け火の狙い: 敵の働いているオブジェクトのうち、まだ燃えていない価値の高いもの（同点はライフが低い順）。無ければ null */
export const arsonTarget = (board: SquareInfo[], me: Player, chars: PlayerCharacters): number | null => {
    let best: { i: number; score: number } | null = null;
    for (const i of objectSkillTargets('arson', board, me, chars)) {
        const sq = board[i];
        if (!sq.player || sq.player === me || isDormant(sq) || flameStacks(sq) > 0) continue;
        const score = (ARSON_VALUE[sq.object as string] ?? 4) * 10 - sq.bind;
        if (!best || score > best.score) best = { i, score };
    }
    return best ? best.i : null;
};

/** 敵の建造物（式神を除く）の数 */
const enemyBuildings = (board: SquareInfo[], enemy: Player): number => board.filter((sq) => isBuilding(sq) && sq.player === enemy && !isDormant(sq)).length;

/**
 * 普請停止令を撃つか: 龍神の巫女の相手が、覚醒の一歩手前（建造物が AWAKEN_BUILDINGS-1 個以上）のとき。
 * 次の手番に建造物（祈りを含む）を置けなくして、覚醒を1手番遅らせる
 */
export const buildBanWanted = (board: SquareInfo[], enemies: readonly Player[], characterOf: (p: Player) => string | undefined): boolean =>
    enemies.some((e) => characterOf(e) === 'dragonMiko' && enemyBuildings(board, e) >= AWAKEN_BUILDINGS - 1);

/** 手番開始に自分のコマを狙う敵のオブジェクト（毒沼・雷雲・枯れた大木）の周囲にいる、自分のコマの数 */
export const exposedPieces = (board: SquareInfo[], me: Player, chars: PlayerCharacters): number => {
    const geo = geometryForCells(board.length);
    const hit = new Set<number>();
    board.forEach((sq, k) => {
        if (!sq.player || sq.player === me || isDormant(sq)) return;
        if (sq.object !== 'poisonSwamp' && sq.object !== 'thundercloud' && sq.object !== 'deadTree') return;
        for (const j of geo.surroundRange(k)) if (board[j].player === me && !isGuarded(board[j], chars)) hit.add(j);
    });
    return hit.size;
};

/** 敵が働いている、自分のトークン・コマ置きを縛るオブジェクト（泥田坊・お一人様限りの札・閻魔の舌） */
export const hasBindingObject = (board: SquareInfo[], me: Player): boolean =>
    board.some((sq) => !!sq.player && sq.player !== me && !isDormant(sq) && (sq.object === 'mudField' || sq.object === 'soloSign' || sq.object === 'tongueKing'));

/** お構いなしを撃つか: 自分のコマが敵の毒沼・雷雲・枯れた大木に2つ以上狙われているか、縛るオブジェクトが働いていて魔力に余裕があるとき */
export const ignoreObjectsWanted = (board: SquareInfo[], me: Player, chars: PlayerCharacters, spare: number): boolean =>
    exposedPieces(board, me, chars) >= 2 || (hasBindingObject(board, me) && spare >= 4);
