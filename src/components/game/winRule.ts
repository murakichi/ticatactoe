// 勝利に必要な4連の本数（席ごと。既定1、龍神の巫女は2。#526）
// 2本は別々の4マス窓で、共有できるマスは1つまで。
// 判定の入口は util.ts の calculateWinner だけ。呼び出し側（Game・sim・AI）は席の本数を意識しなくてよいように、
// 対局の開始時に setWinNeeds でこの対局の本数表を登録しておく（対局は同時に1つだけ・同期処理なので、モジュール内の表で足りる）。
import { CharacterId } from '../../types/Character';
import { PLAYER_SYMBOLS, Player } from '../../types/Player';

export const WIN_NEED_BY_CHARACTER: Partial<Record<CharacterId, number>> = { dragonMiko: 2 };

let needs: Partial<Record<Player, number>> = {};

/** この対局の本数表を登録する（席順＝chars の順）。全員1本なら表を空にして従来どおりに動く */
export const setWinNeeds = (chars: readonly CharacterId[]): void => {
    const next: Partial<Record<Player, number>> = {};
    chars.forEach((c, seat) => {
        const n = WIN_NEED_BY_CHARACTER[c];
        if (n && n > 1) next[PLAYER_SYMBOLS[seat]] = n;
    });
    needs = next;
};

export const winNeedOf = (player: Player): number => needs[player] ?? 1;

/** 4マス窓 lines のうち、共有マスが1つ以下の2本が選べるか */
export const hasTwoDistinctLines = (lines: number[][]): boolean => {
    for (let a = 0; a < lines.length; a++) {
        for (let b = a + 1; b < lines.length; b++) {
            let shared = 0;
            for (const x of lines[a]) if (lines[b].includes(x)) shared++;
            if (shared <= 1) return true;
        }
    }
    return false;
};

/** player が必要本数を満たしているか。ownLines は player が全マスを持つ窓 */
export const meetsWinNeed = (player: Player, ownLines: number[][]): boolean => {
    const need = winNeedOf(player);
    if (need <= 1) return ownLines.length >= 1;
    return hasTwoDistinctLines(ownLines);
};
