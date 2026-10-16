/**
 * 席(seat)ごとのシンボル。席番号 = 配列の添字。
 * 2人のときは従来どおり 💙(先手) と ⭕(後手)。色だけでなく形も変えて見分けやすくしている。
 */
export const PLAYER_SYMBOLS = ['💙', '⭕', '🟩', '🔶', '⭐', '🟣', '🟫', '🩷'] as const;

export type Player = typeof PLAYER_SYMBOLS[number];

export const MAX_PLAYERS = PLAYER_SYMBOLS.length;

/** シンボルから席番号を返す */
export const seatOf = (player: Player): number => PLAYER_SYMBOLS.indexOf(player);
