// 自動生成: src/types/Player.ts (node scripts/gen-sim-shared.js)。手で編集しない。
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.seatOf = exports.MAX_PLAYERS = exports.PLAYER_SYMBOLS = void 0;
/**
 * 席(seat)ごとのシンボル。席番号 = 配列の添字。
 * 2人のときは従来どおり 💙(先手) と ⭕(後手)。色だけでなく形も変えて見分けやすくしている。
 */
exports.PLAYER_SYMBOLS = ['💙', '⭕', '🟩', '🔶', '⭐', '🟣', '🟫', '🩷'];
exports.MAX_PLAYERS = exports.PLAYER_SYMBOLS.length;
/** シンボルから席番号を返す */
const seatOf = (player) => exports.PLAYER_SYMBOLS.indexOf(player);
exports.seatOf = seatOf;
