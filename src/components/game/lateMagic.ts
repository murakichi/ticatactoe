// 長引く試合の打ち切り用: 一定ターンごとに「手番開始時に得られる魔力」が+1ずつ増える。

/** この人数以上のとき有効（2人戦から全員対象。当初は3人以上だけだったが2人戦にも広げた） */
export const LATE_MAGIC_MIN_PLAYERS = 2;

/** 何ターンごとに+1するか */
export const LATE_MAGIC_INTERVAL = 50;

/**
 * 手番開始時の魔力ボーナス（全員共通）。
 * @param turn これから始まる手番のターン番号（Game の currentTurn。着手/ターン終了スキルのたびに+1される値）
 * @param seatCount 参加人数
 * @param interval 何ターンごとに+1するか（sim が A/B 検証で上書きする。0 なら無効。本番は既定のまま）
 */
export const lateMagicBonus = (turn: number, seatCount: number, interval: number = LATE_MAGIC_INTERVAL, minPlayers: number = LATE_MAGIC_MIN_PLAYERS): number =>
    seatCount < minPlayers || !interval ? 0 : Math.floor(turn / interval);
