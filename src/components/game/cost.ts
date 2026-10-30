// スキルの実コスト（キャラ補正 → ギア補正 → 導線 → 軽減スキル）の計算。Game.tsx と sim/engine.js が同じ関数を呼ぶ (#289)。
// 増加分（キャラの加算・敵の🍂）を先に足し、減少分（キャラの割引・魔女のパッシブ・ギア・導線・軽減スキル）をそのあとに掛ける。下限1は減少のたびに掛かる。
//   characterCostOf … 増加分 → キャラの減少分
//   gearCostOf      … ギアの補正・導線・陰陽師のパッシブ・無料条件・軽減スキル
//   calculateCostOf … 上の2つを続けて掛けたもの（スキルの表示・支払いに使う）
import { CharacterId, YingYangMode } from '../../types/Character';
import { Player } from '../../types/Player';
import { SquareInfo } from '../../types/SquareInfo';
import { comboCut, comboFloor } from './comboCost';
import { Discount, applyDiscount, discountAmount } from './discount';
import { CostContext, Gears, adjustCostByGear, gearTokenBindDelta } from './gear';
import { FIRST_FROST_FREE_LEAVES } from './tokenSkills';
import { FLAME_SKILL_KEYS, boardLeaves, fireStacksTotal, leafSurcharge, witchCostOf } from './thermal';

/** 式神を置くスキル（陰陽師のパッシブ: 置いた手番の全スキル-1。置くスキル自身も安い） */
export const SHIKIGAMI_PLACING_KEYS: ReadonlySet<string> = new Set(['onClickShikigamiPlace', 'onClickShikigamiRandom', 'onClickShikigamiFlood']);

/** 式神の供犠: 自陣の式神がこの数以上なら0コスト */
export const SHIKIGAMI_PURGE_FREE = 3;

/** コストを払う席の状況。turnSeat 以外の席（パネルで非手番側のコストを出すとき）には手番内の状態（導線・軽減・無料条件）を掛けない */
export type CostEnv = {
    board: SquareInfo[];
    seat: number;
    /** seat のシンボル */
    player: Player;
    turnSeat: number;
    /** 席ごとのキャラ */
    characters: readonly CharacterId[];
    /** seat の陰陽モード（陽は全スキル+1） */
    yinYangMode?: YingYangMode;
    gears: Gears;
    /** ギア補正の入力（手番内のスキル使用数など）。手番の席と他の席で中身が違うので呼び出し側が作る */
    ctx: CostContext;
    /** 手番開始時点の自陣の🍂の総数 / 手番内に使ったスキルの種類 / 手番開始時点の自陣の⚡の総数（導線の入力） */
    leafBase: number;
    kinds: ReadonlySet<string>;
    chargeBase: number;
    /** この手番に式神を置いたか */
    shikiPlaced: boolean;
    /** 無礼講が効いているか */
    tokenFree: boolean;
    /** 自分の前の手番以降の相手のスキル使用（返し特売の0コスト条件）と、手番開始時点の盤面全体の🔥の総数（火の車の無料条件） */
    oppSkillPrev: boolean;
    /** 直前の手番に盤面の🌱🍂が増えたか（火口の無料条件。撃つと消える） */
    plantPrev: boolean;
    fireBase: number;
    discount: Discount;
};

/** 自陣の式神の数 */
const ownShikigami = (board: SquareInfo[], player: Player): number => board.filter((sq) => sq.player === player && sq.effects.some((e) => e.effect === '📜')).length;

export const characterCostOf = (env: CostEnv, baseCost: number, isToken: boolean, isPoison: boolean, skillKey?: string): number => {
    const characterId = env.characters[env.seat];
    // 敵の🍂による増加分を先に足す（キャラの減少分・割引はそのあと）
    const cost = baseCost + leafSurcharge(env.board, env.player);
    // 煉獄の鍛冶師: 🔥を付与するスキルは常に-1（下限1）
    if (characterId === 'pyromancer') return skillKey && FLAME_SKILL_KEYS.has(skillKey) && cost > 1 ? cost - 1 : cost;
    // 凩の魔女: 盤面にある🍂（敵味方問わず・効力のあるもの）の枚数ぶん、スキルコスト-1（下限1）
    if (characterId === 'witch') return witchCostOf(cost, env.board);
    // 毒使い: 毒系スキルは-1、それ以外は+1
    if (characterId === 'poisoner') return isPoison ? cost - 1 : cost + 1;
    if (characterId === 'tactician') return isToken ? cost - 1 : cost + 2;
    // 陰陽師: 陽は「そのコストを払う席自身のモード」で判定する (issue #12)
    if (characterId === 'yinYangMaster' && env.yinYangMode === 'yang') return cost + 1;
    return cost;
};

/** @param withLeaf 敵の🍂の増加分を、ギアの補正・割引より先に足す。characterCostOf が足し済みのときは false */
export const gearCostOf = (env: CostEnv, cost: number, isToken: boolean, skillKey: string | undefined, withLeaf: boolean = true): number => {
    const mine = env.seat === env.turnSeat;
    if (skillKey === 'onClickShikigamiPurge' && mine && ownShikigami(env.board, env.player) >= SHIKIGAMI_PURGE_FREE) return 0; // 供犠: 自陣の式神が3体以上なら0
    if (isToken && mine && env.tokenFree) return 0; // 無礼講: この手番、トークン系スキルのコストは0
    if (skillKey === 'onClickFirstFrost' && mine && boardLeaves(env.board) >= FIRST_FROST_FREE_LEAVES) return 0; // 初霜: 盤面の🍂が3枚以上なら0
    const leafAdd = withLeaf ? leafSurcharge(env.board, env.player) : 0; // 🍂落ち葉: 他の席のコマに乗っている🍂の枚数ぶん、スキルコストが上がる（上限なし）
    const cut = mine ? comboCut(skillKey, env.board, env.player, env.leafBase, env.kinds, env.chargeBase) : 0; // 導線（コンボ）による軽減
    let adjusted = Math.max(comboFloor(skillKey), adjustCostByGear(cost + leafAdd, env.gears, env.ctx, isToken, skillKey) - cut); // カウント型の導線は下限1
    // 陰陽師のパッシブ: 式神を置く手番は、全スキル（陰陽転化・式神設置/爆破を含む）のコスト-1（下限1）。置くスキル自身も-1
    if (mine && env.characters[env.seat] === 'yinYangMaster' && (env.shikiPlaced || (!!skillKey && SHIKIGAMI_PLACING_KEYS.has(skillKey))) && adjusted > 1) adjusted -= 1;
    if (skillKey === 'onClickTinder' && mine && env.plantPrev) return 0; // 火口: 直前の手番に🌱か🍂が植えられていれば0（1手番に1回まで）
    if (skillKey === 'onClickCounterMarkdown' && env.oppSkillPrev) return 0; // 返し特売: 直前に相手がスキルを使っていれば0
    if (skillKey === 'onClickFireWheel' && mine && fireStacksTotal(env.board) > env.fireBase) return 0; // 火の車: このターン敵か自陣に🔥を付与していれば0
    // コスト軽減スキル（手番内だけ有効なので、手番でない席には掛けない）
    return mine ? applyDiscount(adjusted, discountAmount(env.discount, skillKey, isToken)) : adjusted;
};

export const calculateCostOf = (env: CostEnv, cost: number, isToken: boolean = false, isPoison: boolean = false, skillKey?: string): number =>
    gearCostOf(env, characterCostOf(env, cost, isToken, isPoison, skillKey), isToken, skillKey, false);

/** トークンのライフ。軍師は6、他は4。増援 / 軽量トークンで補正（ライフは1以上） */
export const tokenBindOf = (character: CharacterId, gears: Gears): number => {
    const base = character === 'tactician' ? 6 : 4;
    const delta = gearTokenBindDelta(gears);
    return delta === 0 ? base : Math.max(1, base + delta);
};

/** 審判の日の基礎コスト: 手番内にスキルを使った数ぶん安い（下限0。使うとカウントはリセット） */
export const judgeDayBase = (baseCost: number, usedSkills: number): number => Math.max(0, baseCost - usedSkills);

/** 全軍突撃の基礎コスト: 手番内に使ったトークン系スキル1つにつき-2 */
export const totalAssaultBase = (baseCost: number, tokensUsed: number): number => baseCost - tokensUsed * 2;
