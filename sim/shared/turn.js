// 自動生成: src/components/game/turn.ts (node scripts/gen-sim-shared.js)。手で編集しない。
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NECROMANCY = exports.proliferateUpkeep = exports.PROLIFERATE = exports.turnStartMagic = exports.MAGIC_BONUS_CHARACTERS = void 0;
const gear_1 = require("./gear");
const lateMagic_1 = require("./lateMagic");
/** 手番開始時の魔力が標準の+1に加えて+1されるキャラ。
 *  巨人はタンク特性(高ライフ)を持つ代わりに毎ターンの魔力ボーナスは無し(life8復元時のストンプ過多をオフェンス側で抑制。検証: giantGap -0.174→+0.002)。
 *  氷室の番人は、魔力が律速（tune-top 上限実験: 毎ターン+1で環境勝率 42.7→61.7%）だったので魔法使いと同じ+1（issue #94）。
 *  凩の魔女も+1（魔力が律速。ユーザー指示。ライフ平均-1とセット） */
exports.MAGIC_BONUS_CHARACTERS = ['magician', 'cryomancer', 'witch'];
/** 手番開始時の魔力（増殖の維持コストを払う前）。標準は+1に、長期戦ボーナス・自陣の🌱・キャラ補正・ギアを足す */
const turnStartMagic = (i) => {
    let next = i.magic + 1 + (0, lateMagic_1.lateMagicBonus)(i.turn, i.seatCount) + i.buds;
    if (exports.MAGIC_BONUS_CHARACTERS.includes(i.character))
        next++;
    if (i.character === 'yinYangMaster' && i.yinYangMode === 'ying')
        next++;
    // 魔法使い: 自陣のバッズ1つにつき魔力回復+3 (標準の+1に追加で+2)。バッズ蓄積→スキル連打のコンセプト
    if (i.character === 'magician')
        next += i.buds * 2;
    next += i.garden;
    if (i.standBonus)
        next += gear_1.GEAR_PARAMS.lastStandMagic;
    return next + i.scorch + i.root;
};
exports.turnStartMagic = turnStartMagic;
/** 増殖(ループ召喚)の調整値。sim は A/B 検証用に config.proliferate で上書きできる */
exports.PROLIFERATE = { cost: 6, tokenLife: 2, upkeepStep: 1, maxStacks: 8 };
/** 増殖の維持コスト: 手番開始時に払う。ループ回数 × upkeepStep */
const proliferateUpkeep = (count, upkeepStep = exports.PROLIFERATE.upkeepStep) => count * upkeepStep;
exports.proliferateUpkeep = proliferateUpkeep;
/** ネクロマンサーの蘇生: 基礎コスト（墓地の死体数ぶん安くなり、そのまま召喚数になる）・吸収が続くターン数・召喚するコマのライフ・1度の召喚数の上限 */
exports.NECROMANCY = { baseCost: 10, duration: 4, reviveLife: 2, summonCap: 5 };
