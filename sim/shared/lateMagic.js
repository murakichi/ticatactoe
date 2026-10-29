// 自動生成: src/components/game/lateMagic.ts (node scripts/gen-sim-shared.js)。手で編集しない。
"use strict";
// 長引く試合の打ち切り用: 一定ターンごとに「手番開始時に得られる魔力」が+1ずつ増える。
Object.defineProperty(exports, "__esModule", { value: true });
exports.lateMagicBonus = exports.LATE_MAGIC_INTERVAL = exports.LATE_MAGIC_MIN_PLAYERS = void 0;
/** この人数以上のとき有効（2人戦から全員対象。当初は3人以上だけだったが2人戦にも広げた） */
exports.LATE_MAGIC_MIN_PLAYERS = 2;
/** 何ターンごとに+1するか */
exports.LATE_MAGIC_INTERVAL = 50;
/**
 * 手番開始時の魔力ボーナス（全員共通）。
 * @param turn これから始まる手番のターン番号（Game の currentTurn。着手/ターン終了スキルのたびに+1される値）
 * @param seatCount 参加人数
 * @param interval 何ターンごとに+1するか（sim が A/B 検証で上書きする。0 なら無効。本番は既定のまま）
 */
const lateMagicBonus = (turn, seatCount, interval = exports.LATE_MAGIC_INTERVAL, minPlayers = exports.LATE_MAGIC_MIN_PLAYERS) => seatCount < minPlayers || !interval ? 0 : Math.floor(turn / interval);
exports.lateMagicBonus = lateMagicBonus;
