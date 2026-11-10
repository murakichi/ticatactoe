// 席ごとの勝利に必要な並びの長さ（既定4、龍神の巫女は5。#526 を置き換え。ユーザー指示 2026-11-10）
// 5連は、同じ向きに1マスずれて隣り合う4マス窓が2つとも自分のもの（共有3マス）になった状態。
// 判定の入口は util.ts の calculateWinner だけ。呼び出し側（Game・sim・AI）は席の長さを意識しなくてよいように、
// 対局の開始時に setWinLengths でこの対局の長さ表を登録しておく（対局は同時に1つだけ・同期処理なので、モジュール内の表で足りる）。
import { CharacterId } from '../../types/Character';
import { PLAYER_SYMBOLS, Player } from '../../types/Player';
import { WIN_LENGTH, boardSizeFor, clampBoardSize } from './boardGeometry';

export const WIN_LENGTH_BY_CHARACTER: Partial<Record<CharacterId, number>> = { dragonMiko: 5 };

let lengths: Partial<Record<Player, number>> = {};

/** この対局の長さ表を登録する（席順＝chars の順）。全員4なら表を空にして従来どおりに動く */
export const setWinLengths = (chars: readonly CharacterId[]): void => {
    const next: Partial<Record<Player, number>> = {};
    chars.forEach((c, seat) => {
        const n = WIN_LENGTH_BY_CHARACTER[c];
        if (n && n > WIN_LENGTH) next[PLAYER_SYMBOLS[seat]] = n;
    });
    lengths = next;
};

export const winLengthOf = (player: Player): number => lengths[player] ?? WIN_LENGTH;

/** 4マス窓 a と b が、同じ向きに1マスずれて隣り合っているか（共有が3マス） */
const adjacentWindows = (a: number[], b: number[]): boolean => {
    let shared = 0;
    for (const x of a) if (b.includes(x)) shared++;
    return shared === WIN_LENGTH - 1;
};

/** player が勝ちの並びを満たしているか。ownLines は player が全マスを持つ4マス窓 */
export const meetsWinRule = (player: Player, ownLines: number[][]): boolean => {
    if (winLengthOf(player) <= WIN_LENGTH) return ownLines.length >= 1;
    for (let a = 0; a < ownLines.length; a++) for (let b = a + 1; b < ownLines.length; b++) if (adjacentWindows(ownLines[a], ownLines[b])) return true;
    return false;
};

/** 勝ちの並びが作れる最小の盤面の一辺（5連が要るキャラがいれば5） */
export const minBoardSizeFor = (chars: readonly CharacterId[]): number =>
    Math.max(WIN_LENGTH, ...chars.map((c) => WIN_LENGTH_BY_CHARACTER[c] ?? WIN_LENGTH));

/** 「おまかせ」の盤面の一辺: 人数の既定と、勝ちの並びに必要な最小サイズの大きいほう（巫女がいれば5x5以上） */
export const defaultBoardSizeFor = (chars: readonly CharacterId[]): number =>
    clampBoardSize(Math.max(boardSizeFor(chars.length), minBoardSizeFor(chars)));
