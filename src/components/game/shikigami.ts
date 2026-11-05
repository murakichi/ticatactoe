// 式神(📜)の純粋ロジック。Game.tsx・sim/engine.js・AIPlayer.ts(読み筋の盤面) が同じ関数を呼ぶ (#289)。
// 式神: 紙の分身。ライフ2で列には数えない。自分で補強すると🌱付きの自陣コマ、相手に乗っ取られると空きマスになる。
import { Player } from '../../types/Player';
import { SquareInfo } from '../../types/SquareInfo';
import { geometryForCells } from './boardGeometry';
import { PlayerCharacters, isGuarded } from './charge';
import { addPoison } from './poison';
import { applyDamage, emptyBlocked } from './thermal';
import { isShikigami } from '../../util';

/** 式神を置いたときのライフ */
export const SHIKIGAMI_LIFE = 2;
/** 爆破が周囲の敵コマに与えるダメージ（0になったら破壊） */
export const SHIKIGAMI_BLAST_DAMAGE = 4;
/** 式神の加護: 自陣のコマ全てに足すライフ */
export const SHIKIGAMI_BLESS_LIFE = 3;
/** 式神の呪詛: エフェクトの乗った敵コマ1つに付ける☠の数 */
export const SHIKIGAMI_CURSE_STACKS = 2;

/** 式神（百鬼夜行・式神設置・爆破で空きマスに生まれる式神）を置けるマスか: 空きで、氷結中でも🔑ロック中でもない（ロック中の空きマスには通常の着手もできない） */
export const shikigamiLandable = (sq: SquareInfo): boolean =>
    !sq.player && !emptyBlocked(sq) && !(sq.effects.some((e) => e.effect === '🔑') && sq.bind > 0);

export const newShikigami = (player: Player, bind: number = SHIKIGAMI_LIFE): SquareInfo => ({ player, bind, effects: [{ effect: '📜' }] });

const empty = (): SquareInfo => ({ player: undefined, bind: 0, effects: [] });

/** player の式神のあるマス */
export const ownShikigamiCells = (board: SquareInfo[], player: Player): number[] =>
    board.map((sq, i) => (sq.player === player && isShikigami(sq) ? i : -1)).filter((i) => i !== -1);

/** 加護の対象: 自陣のコマ（式神を除く） */
export const blessTargets = (board: SquareInfo[], player: Player): number[] =>
    board.map((sq, i) => (sq.player === player && !isShikigami(sq) ? i : -1)).filter((i) => i !== -1);

/** 呪詛の対象: エフェクトが乗っている敵のコマ（式神・🔑ロック・⚡無敵を除く） */
export const curseTargets = (board: SquareInfo[], player: Player, chars: PlayerCharacters): number[] =>
    board.map((sq, i) => (sq.player && sq.player !== player && !isShikigami(sq) && sq.effects.length > 0 && !isGuarded(sq, chars) ? i : -1)).filter((i) => i !== -1);

/** 供犠の対象: ライフの残った敵のコマ（式神・🔑ロック・⚡無敵を除く） */
export const purgeTargets = (board: SquareInfo[], player: Player, chars: PlayerCharacters): number[] =>
    board.map((sq, i) => (sq.player && sq.player !== player && !isShikigami(sq) && sq.bind > 0 && !isGuarded(sq, chars) ? i : -1)).filter((i) => i !== -1);

export type ShikigamiBlastResult = {
    /** 影響を受けたマス（新しい式神が生えた空きマス・ダメージを受けた敵コマ） */
    affected: number[];
    /** 氷結が身代わりになったマス */
    broken: number[];
    /** 破壊した敵コマの数 */
    destroyed: number;
};

/** 自分の式神 i を爆破: 式神は消え、周囲8マスの敵陣に4ダメージ（氷結なら解除だけ・🔥なら1.5倍。0になったら破壊）、空きマスは式神になる。board を直接書き換える */
export const blast = (board: SquareInfo[], i: number, player: Player, chars: PlayerCharacters): ShikigamiBlastResult => {
    board[i] = empty();
    const affected: number[] = [];
    const broken: number[] = [];
    let destroyed = 0;
    for (const j of geometryForCells(board.length).surroundRange(i)) {
        const sq = board[j];
        if (!sq.player) {
            if (shikigamiLandable(sq)) { board[j] = newShikigami(player); affected.push(j); }
            continue;
        }
        if (sq.player === player || isGuarded(sq, chars)) continue;
        const hit = applyDamage(sq, SHIKIGAMI_BLAST_DAMAGE, 'skill');
        if (hit.blocked) { board[j] = hit.sq; broken.push(j); continue; }
        affected.push(j);
        if (hit.sq.bind < 1) { board[j] = empty(); destroyed++; }
        else board[j] = hit.sq;
    }
    return { affected, broken, destroyed };
};

/** 加護: 式神 i を消費して、自陣のコマ全て（式神を除く）のライフを+3する。ライフを足したマスを返す。board を直接書き換える */
export const bless = (board: SquareInfo[], i: number, player: Player): number[] => {
    board[i] = empty();
    const targets = blessTargets(board, player);
    for (const k of targets) board[k] = { ...board[k], bind: board[k].bind + SHIKIGAMI_BLESS_LIFE };
    return targets;
};

/** 呪詛: 式神 i を消費して、エフェクトの乗った敵のコマ全てに☠を2つ付ける（1つずつ付けるので、毒使いのコマはライフが2回1.5倍になる）。対象のマスを返す。board を直接書き換える */
export const curse = (board: SquareInfo[], i: number, player: Player, chars: PlayerCharacters): number[] => {
    const targets = curseTargets(board, player, chars);
    board[i] = empty(); // 消費する式神は自陣なので、対象は消費の前後で変わらない
    for (let n = 0; n < SHIKIGAMI_CURSE_STACKS; n++) addPoison(board, targets, chars);
    return targets;
};

/** 供犠: 敵のコマ i のライフを0にする（効果は残る）。board を直接書き換える */
export const purge = (board: SquareInfo[], i: number): void => {
    board[i] = { ...board[i], bind: 0 };
};
