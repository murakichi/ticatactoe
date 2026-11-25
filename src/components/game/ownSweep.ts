// 自陣のコマ全体に掛ける3つのスキル（枯れ木に花を咲かせましょう・弱り目に落ち葉・良薬は口に毒）の純粋ロジック。
// Game.tsx（useGenericSkills）と sim/engine.js（sim/shared に生成）が同じ関数を呼ぶ (#289)。
import { CharacterId } from '../../types/Character';
import { Player } from '../../types/Player';
import { SquareInfo } from '../../types/SquareInfo';
import { poisonStrike } from './poison';
import { isFrozen, zeroOut } from './thermal';

/** 良薬は口に毒: 自陣のコマ全てに足すライフ */
export const MEDICINE_LIFE = 10;

const hasLock = (sq: SquareInfo): boolean => sq.effects.some((e) => e.effect === '🔑');

/** 対象: player のコマ（オブジェクトは除く）のうち、🔑ロック中でも❄氷結中でもないもの（昇順） */
export const ownSweepTargets = (board: SquareInfo[], player: Player): number[] =>
    board.map((sq, i) => (sq.player === player && sq.object === undefined && !hasLock(sq) && !isFrozen(sq) ? i : -1)).filter((i) => i !== -1);

/**
 * 枯れ木に花を咲かせましょう（🌱）/ 弱り目に落ち葉（🍂）: 対象のコマのライフを全て0にして、effect を1つ付ける。
 * ライフが残っていたコマの🔥は消える（zeroOut）。board を直接書き換える
 */
export const witherAndSow = (board: SquareInfo[], cells: readonly number[], effect: '🌱' | '🍂'): void => {
    for (const k of cells) {
        const z = zeroOut(board[k]);
        board[k] = { ...z, effects: [...z.effects, { effect }] };
    }
};

/** 良薬は口に毒: 対象のコマのライフを +MEDICINE_LIFE して、☠を1つ付ける（毒使いのコマは毒が付くとライフ1.5倍）。board を直接書き換える */
export const medicineAndPoison = (board: SquareInfo[], cells: readonly number[], chars: readonly CharacterId[]): void => {
    for (const k of cells) {
        const sq = board[k];
        board[k] = poisonStrike({ ...sq, bind: sq.bind + MEDICINE_LIFE, effects: [...sq.effects, { effect: '☠' }] }, chars);
    }
};
