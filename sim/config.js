// @ts-check
"use strict";
module.exports = {
    "lifeMeans": {
        "you": 5,
        "magician": 4,
        "tactician": 5,
        "giant": 10,
        "yinYangMaster_yang": 7,
        "yinYangMaster_ying": 4,
        "poisoner": 5,
        "electrician": 6,
        "cryomancer": 4,
        "pyromancer": 6,
        "witch": 4,
        "default": 5
    },
    "lifeStd": 3,
    // 巨人が何ラウンドに1回行動するか。src/components/game/giantTurn.ts の GIANT_ACT_EVERY と同じ値に。1にすると休みなし（A/B検証用）
    "giantActEvery": 2,
    // 汎用スキルプールの大きさ。21 -> 23 (#39) -> 27 (#40) -> 29 (ヘイルメアリー・サイレンス) -> 30 (毒霧) -> 32 (氷結・火炎付与)
    "poolSize": 49,
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
        "doubleTokenCost": 5,
        "areaCost": 5,
        "randomCost": 3,
        "jammerCost": 4,
        // 帯電付与・帯電拡散は盤面の⚡の数だけ軽減、この下限まで (#43)
        "minCost": 1,
        // 全マスが⚡で埋まると、全⚡と🔑を取り除いて全マスのライフを0にする（過負荷）。false で無効
        "discharge": true
    },
    // ❄氷結・🔥火炎のコスト。src/components/game/skillCosts.ts の onClickFreeze / Ignite / Glacier / Inferno と一致させること
    "thermal": {
        "freezeCost": 3,
        "igniteCost": 3,
        "glacierCost": 10,
        "cryoFreezeCost": 2,
        "cleanseCost": 5,
        "harvestEveCost": 2,
        "solsticeCost": 4,
        "suckerCost": 4,
        "windborneCost": 4,
        "flameTokenCost": 3,
        "flameDoubleTokenCost": 5,
        "swiddenCost": 3,
        "sacrificeCost": 5,
        "frostAreaCost": 5,
        "icicleCost": 6,
        "randomFreezeCost": 3,
        "freezeSpreadCost": 7,
        "frostTokenCost": 3,
        "doubleFrostTokenCost": 5,
        "shatterCost": 4,
        "frostfallCost": 3,
        "infernoCost": 7
    },
    // 増殖（ループ召喚）の調整ノブ。既定値は Game.tsx の定数と一致させること
    "proliferate": {
        "cost": 6,
        "tokenLife": 2,
        "upkeepStep": 1,
        "maxStacks": 8
    }
};
