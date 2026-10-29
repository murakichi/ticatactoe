// @ts-check
"use strict";
module.exports = {
    // 汎用スキルプールの大きさ。21 -> 23 (#39) -> 27 (#40) -> 29 (ヘイルメアリー・サイレンス) -> 30 (毒霧) -> 32 (氷結・火炎付与)
    "poolSize": 49,
    // 帯電（雷霆の巫, #39）の A/B 検証用ノブ。コストは skillCosts.ts（本番）をそのまま使うのでここには置かない
    "charge": {
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
