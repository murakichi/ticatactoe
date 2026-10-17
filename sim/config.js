// @ts-check
"use strict";
module.exports = {
    "lifeMeans": {
        "you": 5,
        "magician": 4,
        "tactician": 5,
        "giant": 8,
        "yinYangMaster_yang": 7,
        "yinYangMaster_ying": 4,
        "poisoner": 5,
        "electrician": 6,
        "default": 5
    },
    "lifeStd": 3,
    "giantSkipModulo": 5,
    // 汎用スキルプールの大きさ。21 -> 23 (#39) -> 27 (#40) -> 29 (ヘイルメアリー・サイレンス) -> 30 (毒霧)
    "poolSize": 30,
    // ライフ減衰を「手番1周ごとに1回」にする最小人数 (issue #30)。src/components/game/decay.ts の DECAY_PER_ROUND_MIN_PLAYERS と同じ値に。
    // 99 にすると全人数で従来どおり着手ごと（A/B検証用）
    "decayPerRoundMinPlayers": 3,
    // 長引く多人数戦の打ち切り: この人数以上で、interval ターンごとに手番開始時の魔力が全員+1ずつ増える。
    // src/components/game/lateMagic.ts の LATE_MAGIC_MIN_PLAYERS / LATE_MAGIC_INTERVAL と同じ値に
    "lateGameMagicMinPlayers": 2,
    "lateGameMagicInterval": 50,
    // 帯電（雷霆の巫, #39）のコスト。Game.tsx / skillCosts.ts の値と一致させること
    "charge": {
        "tokenCost": 3,
        "oneCost": 2,
        "spreadCost": 7,
        "doubleTokenCost": 6,
        "areaCost": 5,
        "randomCost": 3,
        "jammerCost": 4,
        // 帯電付与・帯電拡散は盤面の⚡の数だけ軽減、この下限まで (#43)
        "minCost": 1,
        // 全マスが⚡で埋まると、全⚡と🔑を取り除いて全マスのライフを0にする（過負荷）。false で無効
        "discharge": true
    },
    // 増殖（ループ召喚）の調整ノブ。既定値は Game.tsx の定数と一致させること
    "proliferate": {
        "cost": 6,
        "tokenLife": 2,
        "upkeepStep": 1,
        "maxStacks": 8
    }
};
