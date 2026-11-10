// 自動生成: src/components/game/winRule.ts (node scripts/gen-sim-shared.js)。手で編集しない。
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.meetsWinNeed = exports.hasTwoDistinctLines = exports.winNeedOf = exports.setWinNeeds = exports.WIN_NEED_BY_CHARACTER = void 0;
const Player_1 = require("./Player");
exports.WIN_NEED_BY_CHARACTER = { dragonMiko: 2 };
let needs = {};
/** この対局の本数表を登録する（席順＝chars の順）。全員1本なら表を空にして従来どおりに動く */
const setWinNeeds = (chars) => {
    const next = {};
    chars.forEach((c, seat) => {
        const n = exports.WIN_NEED_BY_CHARACTER[c];
        if (n && n > 1)
            next[Player_1.PLAYER_SYMBOLS[seat]] = n;
    });
    needs = next;
};
exports.setWinNeeds = setWinNeeds;
const winNeedOf = (player) => { var _a; return (_a = needs[player]) !== null && _a !== void 0 ? _a : 1; };
exports.winNeedOf = winNeedOf;
/** 4マス窓 lines のうち、共有マスが1つ以下の2本が選べるか */
const hasTwoDistinctLines = (lines) => {
    for (let a = 0; a < lines.length; a++) {
        for (let b = a + 1; b < lines.length; b++) {
            let shared = 0;
            for (const x of lines[a])
                if (lines[b].includes(x))
                    shared++;
            if (shared <= 1)
                return true;
        }
    }
    return false;
};
exports.hasTwoDistinctLines = hasTwoDistinctLines;
/** player が必要本数を満たしているか。ownLines は player が全マスを持つ窓 */
const meetsWinNeed = (player, ownLines) => {
    const need = (0, exports.winNeedOf)(player);
    if (need <= 1)
        return ownLines.length >= 1;
    return (0, exports.hasTwoDistinctLines)(ownLines);
};
exports.meetsWinNeed = meetsWinNeed;
