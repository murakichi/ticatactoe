// 長引く多人数戦の打ち切り用: 3人以上のとき、一定ターンごとに「手番開始時に得られる魔力」が+1ずつ増える。
// sim/config.js の lateGameMagicInterval / lateGameMagicMinPlayers と同じ値に揃えること。

/** この人数以上のときだけ有効（2人戦は従来どおり増えない） */
export const LATE_MAGIC_MIN_PLAYERS = 3;

/** 何ターンごとに+1するか */
export const LATE_MAGIC_INTERVAL = 50;

/**
 * 手番開始時の魔力ボーナス（全員共通）。
 * @param turn これから始まる手番のターン番号（Game の currentTurn。着手/ターン終了スキルのたびに+1される値）
 * @param seatCount 参加人数
 */
export const lateMagicBonus = (turn: number, seatCount: number): number =>
    seatCount < LATE_MAGIC_MIN_PLAYERS ? 0 : Math.floor(turn / LATE_MAGIC_INTERVAL);
