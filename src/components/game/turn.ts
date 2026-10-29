// 手番の頭で決まる魔力と、増殖(ループ召喚)の定数・維持コスト。Game.tsx と sim/engine.js が同じ関数を呼ぶ (#289)。
import { CharacterId, YingYangMode } from '../../types/Character';
import { GEAR_PARAMS } from './gear';
import { lateMagicBonus } from './lateMagic';

/** 手番開始時の魔力が標準の+1に加えて+1されるキャラ。
 *  巨人はタンク特性(高ライフ)を持つ代わりに毎ターンの魔力ボーナスは無し(life8復元時のストンプ過多をオフェンス側で抑制。検証: giantGap -0.174→+0.002)。
 *  氷室の番人は、魔力が律速（tune-top 上限実験: 毎ターン+1で環境勝率 42.7→61.7%）だったので魔法使いと同じ+1（issue #94）。
 *  凩の魔女も+1（魔力が律速。ユーザー指示。ライフ平均-1とセット） */
export const MAGIC_BONUS_CHARACTERS: readonly CharacterId[] = ['magician', 'cryomancer', 'witch'];

export type TurnStartMagicInput = {
    /** 次に動く席の今の魔力 */
    magic: number;
    /** これから始まる手番のターン番号（Game の currentTurn）と参加人数。長引く試合の魔力ボーナス用 */
    turn: number;
    seatCount: number;
    character: CharacterId;
    yinYangMode?: YingYangMode;
    /** 自陣で効いている🌱の数（休眠・ガード中を除く） */
    buds: number;
    /** 彩りの庭で得る魔力（エフェクトが2種類以上あるマスの数 × 倍率。ギア未装備なら 0） */
    garden: number;
    /** 土壇場の防壁が発動していて、この席が受ける魔力ボーナスがあるか */
    standBonus: boolean;
    /** 焦土で得る魔力 */
    scorch: number;
    /** 凍てつく根で得る魔力 */
    root: number;
};

/** 手番開始時の魔力（増殖の維持コストを払う前）。標準は+1に、長期戦ボーナス・自陣の🌱・キャラ補正・ギアを足す */
export const turnStartMagic = (i: TurnStartMagicInput): number => {
    let next = i.magic + 1 + lateMagicBonus(i.turn, i.seatCount) + i.buds;
    if (MAGIC_BONUS_CHARACTERS.includes(i.character)) next++;
    if (i.character === 'yinYangMaster' && i.yinYangMode === 'ying') next++;
    // 魔法使い: 自陣のバッズ1つにつき魔力回復+3 (標準の+1に追加で+2)。バッズ蓄積→スキル連打のコンセプト
    if (i.character === 'magician') next += i.buds * 2;
    next += i.garden;
    if (i.standBonus) next += GEAR_PARAMS.lastStandMagic;
    return next + i.scorch + i.root;
};

/** 増殖(ループ召喚)の調整値。sim は A/B 検証用に config.proliferate で上書きできる */
export const PROLIFERATE = { cost: 6, tokenLife: 2, upkeepStep: 1, maxStacks: 8 };

/** 増殖の維持コスト: 手番開始時に払う。ループ回数 × upkeepStep */
export const proliferateUpkeep = (count: number, upkeepStep: number = PROLIFERATE.upkeepStep): number => count * upkeepStep;

/** ネクロマンサーの蘇生: 基礎コスト（墓地の死体数ぶん安くなり、そのまま召喚数になる）・吸収が続くターン数・召喚するコマのライフ・1度の召喚数の上限 */
export const NECROMANCY = { baseCost: 10, duration: 4, reviveLife: 2, summonCap: 5 } as const;
