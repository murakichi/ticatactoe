// 自動生成: src/components/game/cost.ts (node scripts/gen-sim-shared.js)。手で編集しない。
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.totalAssaultBase = exports.judgeDayBase = exports.tokenBindOf = exports.calculateCostOf = exports.gearCostOf = exports.characterCostOf = exports.SHIKIGAMI_PURGE_FREE = exports.SHIKIGAMI_PLACING_KEYS = void 0;
// スキルの実コスト（キャラ補正 → ギア補正 → 導線 → 軽減スキル）の計算。Game.tsx と sim/engine.js が同じ関数を呼ぶ (#289)。
// 増加分（キャラの加算・敵の🍂）を先に足し、減少分（キャラの割引・魔女のパッシブ・ギア・導線・軽減スキル）をそのあとに掛ける。下限1は減少のたびに掛かる。
//   characterCostOf … 増加分 → キャラの減少分
//   gearCostOf      … ギアの補正・導線・陰陽師のパッシブ・無料条件・軽減スキル
//   calculateCostOf … 上の2つを続けて掛けたもの（スキルの表示・支払いに使う）
const graveSkills_1 = require("./graveSkills");
const comboCost_1 = require("./comboCost");
const discount_1 = require("./discount");
const gear_1 = require("./gear");
const tokenSkills_1 = require("./tokenSkills");
const thermal_1 = require("./thermal");
/** 式神を置くスキル（陰陽師のパッシブ: 置いた手番の全スキル-1。置くスキル自身も安い） */
exports.SHIKIGAMI_PLACING_KEYS = new Set(['onClickShikigamiPlace', 'onClickShikigamiRandom', 'onClickShikigamiFlood']);
/** 式神の供犠: 自陣の式神がこの数以上なら0コスト */
exports.SHIKIGAMI_PURGE_FREE = 3;
/** 夜の帳: 手番の席のスキルコストに足す量（コストが0のスキルは変えない） */
const veilSurcharge = (env) => (env.veil && env.seat === env.turnSeat ? graveSkills_1.NIGHT_VEIL_SURCHARGE : 0);
/** 自陣の式神の数 */
const ownShikigami = (board, player) => board.filter((sq) => sq.player === player && sq.effects.some((e) => e.effect === '📜')).length;
const characterCostOf = (env, baseCost, isToken, isPoison, skillKey) => {
    const characterId = env.characters[env.seat];
    // 敵の🍂と夜の帳による増加分を先に足す（キャラの減少分・割引はそのあと）
    const cost = baseCost + (0, thermal_1.leafSurcharge)(env.board, env.player) + veilSurcharge(env);
    // 煉獄の鍛冶師: 🔥を付与するスキルは常に-1（下限1）
    if (characterId === 'pyromancer')
        return skillKey && thermal_1.FLAME_SKILL_KEYS.has(skillKey) && cost > 1 ? cost - 1 : cost;
    // 凩の魔女: 盤面にある🍂（敵味方問わず・効力のあるもの）の枚数ぶん、スキルコスト-1（下限1）
    if (characterId === 'witch')
        return (0, thermal_1.witchCostOf)(cost, env.board);
    // 毒使い: 毒系スキルは-1、それ以外は+1
    if (characterId === 'poisoner')
        return isPoison ? cost - 1 : cost + 1;
    if (characterId === 'tactician')
        return isToken ? cost - 1 : cost + 2;
    // 陰陽師: 陽は「そのコストを払う席自身のモード」で判定する (issue #12)
    if (characterId === 'yinYangMaster' && env.yinYangMode === 'yang')
        return cost + 1;
    return cost;
};
exports.characterCostOf = characterCostOf;
/** @param withLeaf 敵の🍂の増加分を、ギアの補正・割引より先に足す。characterCostOf が足し済みのときは false */
const gearCostOf = (env, cost, isToken, skillKey, withLeaf = true) => {
    const mine = env.seat === env.turnSeat;
    if (skillKey === 'onClickShikigamiPurge' && mine && ownShikigami(env.board, env.player) >= exports.SHIKIGAMI_PURGE_FREE)
        return 0; // 供犠: 自陣の式神が3体以上なら0
    if (isToken && mine && env.tokenFree)
        return 0; // 無礼講: この手番、トークン系スキルのコストは0
    if (skillKey === 'onClickFirstFrost' && mine && (0, thermal_1.boardLeaves)(env.board) >= tokenSkills_1.FIRST_FROST_FREE_LEAVES)
        return 0; // 初霜: 盤面の🍂が3枚以上なら0
    const leafAdd = withLeaf ? (0, thermal_1.leafSurcharge)(env.board, env.player) + veilSurcharge(env) : 0; // 夜の帳も🍂と同じ増加分。characterCostOf が足し済みのときは withLeaf=false
    // 🍂落ち葉: 他の席のコマに乗っている🍂の枚数ぶん、スキルコストが上がる（上限なし）
    const cut = mine ? (0, comboCost_1.comboCut)(skillKey, env.board, env.player, env.leafBase, env.kinds, env.chargeBase) : 0; // 導線（コンボ）による軽減
    let adjusted = Math.max((0, comboCost_1.comboFloor)(skillKey), (0, gear_1.adjustCostByGear)(cost + leafAdd, env.gears, env.ctx, isToken, skillKey) - cut); // カウント型の導線は下限1
    // 陰陽師のパッシブ: 式神を置く手番は、全スキル（陰陽転化・式神設置/爆破を含む）のコスト-1（下限1）。置くスキル自身も-1
    if (mine && env.characters[env.seat] === 'yinYangMaster' && (env.shikiPlaced || (!!skillKey && exports.SHIKIGAMI_PLACING_KEYS.has(skillKey))) && adjusted > 1)
        adjusted -= 1;
    if (skillKey === 'onClickSpark' && mine && env.placedPrev)
        return 0; // 飛び火: 直前の手番に相手がコマを2つ以上設置していれば0（1手番に1回まで）
    if (skillKey === 'onClickTinder' && mine && env.plantPrev)
        return 0; // 火口: 直前の手番に🌱か🍂が植えられていれば0（1手番に1回まで）
    if (skillKey === 'onClickCounterMarkdown' && env.oppSkillPrev)
        return 0; // 返し特売: 直前に相手がスキルを使っていれば0
    if (skillKey === 'onClickFireWheel' && mine && (0, thermal_1.fireStacksTotal)(env.board) > env.fireBase)
        return 0; // 火の車: このターン敵か自陣に🔥を付与していれば0
    // コスト軽減スキル（手番内だけ有効なので、手番でない席には掛けない）
    return mine ? (0, discount_1.applyDiscount)(adjusted, (0, discount_1.discountAmount)(env.discount, skillKey, isToken)) : adjusted;
};
exports.gearCostOf = gearCostOf;
const calculateCostOf = (env, cost, isToken = false, isPoison = false, skillKey) => (0, exports.gearCostOf)(env, (0, exports.characterCostOf)(env, cost, isToken, isPoison, skillKey), isToken, skillKey, false);
exports.calculateCostOf = calculateCostOf;
/** トークンのライフ。軍師は6、他は4。増援 / 軽量トークンで補正（ライフは1以上） */
const tokenBindOf = (character, gears) => {
    const base = character === 'tactician' ? 6 : 4;
    const delta = (0, gear_1.gearTokenBindDelta)(gears);
    return delta === 0 ? base : Math.max(1, base + delta);
};
exports.tokenBindOf = tokenBindOf;
/** 審判の日の基礎コスト: 手番内にスキルを使った数ぶん安い（下限0。使うとカウントはリセット） */
const judgeDayBase = (baseCost, usedSkills) => Math.max(0, baseCost - usedSkills);
exports.judgeDayBase = judgeDayBase;
/** 全軍突撃の基礎コスト: 手番内に使ったトークン系スキル1つにつき-2 */
const totalAssaultBase = (baseCost, tokensUsed) => baseCost - tokensUsed * 2;
exports.totalAssaultBase = totalAssaultBase;
