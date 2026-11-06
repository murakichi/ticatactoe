// Game.tsx から切り出したハンドラ群: スキルカードの定義（手札のシャッフル対象と、キャラ固有・基本の固定カード）
// 本体は Game.tsx にあったものをそのまま移した。Game の変数は scope(g) で、あとで定義されるもの(calculateCost など)は late() 経由で受け取る
import React from 'react';
import { CharacterId, YingYangMode } from '../../types/Character';
import { SquareInfo } from '../../types/SquareInfo';
import { isShikigami, findEmptyIndexes } from '../../util';
import { BLESSING_STACK, BLESSING_TURNS, LOCK_EXTEND_STACK, SEAL_EMPTY_STACK, SEAL_MIN_COST, SEAL_OWN_STACK, VACANT_SEAL_REACH_CUT, VACANT_SEAL_STACK, lockExtendCells, lockRaidCells, vacantSealCells } from './keysmith';
import { SHIKIGAMI_BLAST_DAMAGE, SHIKIGAMI_BLESS_LIFE, SHIKIGAMI_CURSE_STACKS, SHIKIGAMI_LIFE } from './shikigami';
import { OBJECT_SKILLS, OBJECT_SKILL_KEYS, objectSkillUsable, OBJECT_DEFS, OBJECT_KINDS, objectLandableCells } from './objects';
import { SHIKIGAMI_PURGE_FREE } from './cost';
import { skillOf } from './deck';
import { plunderTargets } from './generic';
import { BOLT_SILENCE_BOLTS, isGuarded, boardChargeCount } from './charge';
import { firstFrostTargets } from './tokenSkills';
import { placeBlocked } from './lifeBan';
import { SECOND_CATCH_MAX_BASE } from './bigSkills';
import { graveOfferingTarget, POISON_WARD_TURNS } from './graveSkills';
import { SHIKIGAMI_DISCOUNT_BASE, Discount } from './discount';
import { BURNOUT_FREE_FLAMES, burnoutTargets, totalFlames, isFrozen, emptyBlocked, randomFreezeCandidates, frostfallTargets, budStacks, sowCandidates, infernoTargets, canFreeze, bonfireTargets, mulchCandidates, autumnTargets, leafFrostTargets, thawTargets, fireWheelTargets, mogaribueDamage, canMogaribue, MOGARIBUE_LIFE } from './thermal';
import { GearId, gearLockStack, gearTokenBindDelta } from './gear';
import { SkillCardDef } from './SkillPanel';
import { BoardGeometry } from './boardGeometry';
import { GameLate } from './gameLate';

export interface SkillCardsScope {
    onClickAddLife: () => void;
    calculateCost: (cost: number, isToken?: boolean, isPoison?: boolean, player?: "💙" | "⭕" | "🟩" | "🔶" | "⭐" | "🟣" | "🟫" | "🩷", skillKey?: string | undefined) => number;
    seatCosts: { onClickToken: number; onClickTotalAssault: number; onClickToggleYingYang: number; onClickShikigamiPlace: number; onClickShikigamiBlast: number; onClickShikigamiAll: number; onClickShikigamiRandom: number; onClickShikigamiFlood: number; onClickShikigamiBless: number; onClickShikigamiPurge: number; onClickShikigamiCurse: number; onClickShikigamiDiscount: number; onClickStomp: number; onClickJudgeDay: number; onClickCharge: number; onClickAddLife: number; onClickDepressionCherry: number; onClickShuffle: number; onClickBibine: number; onClickUseLock: number; onClickDoubleLock: number; onClickTripleLock: number; onClickBuds: number; onClickDoubleBuds: number; onClickBudsToken: number; onClickBothToken: number; onClickDoubleToken: number; onClickSlash: number; onClickBackSlash: number; onClickTsunami: number; onClickOpium: number; onClickWalpurgisNight: number; onClickMiasma: number; onClickInjection: number; onClickPoisonToken: number; onClickSerum: number; onClickIntensify: number; onClickPandemic: number; onClickProliferate: number; onClickChargeToken: number; onClickChargeOne: number; onClickChargeSpread: number; onClickDoubleChargeToken: number; onClickChargeArea: number; onClickChargeRandom: number; onClickJammer: number; onClickHailMary: number; onClickSilence: number; onClickPoisonMist: number; onClickFreeze: number; onClickIgnite: number; onClickGlacier: number; onClickCryoFreeze: number; onClickCleanse: number; onClickInferno: number; onClickMogaribue: number; onClickSeal: number; onClickHarvestEve: number; onClickSolstice: number; onClickSucker: number; onClickWindborne: number; onClickFlameToken: number; onClickDoubleFlameToken: number; onClickSwidden: number; onClickSacrifice: number; onClickFrostArea: number; onClickIcicle: number; onClickRandomFreeze: number; onClickFreezeSpread: number; onClickFrostToken: number; onClickDoubleFrostToken: number; onClickShatter: number; onClickFrostfall: number; onClickBoost: number; onClickClone: number; onClickPlunder: number; onClickMarkdown: number; onClickEffectDiscount: number; onClickTokenDiscount: number; onClickVitalMarkdown: number; onClickUniqueDiscount: number; onClickClearance: number; onClickRandomCast: number; onClickCounterMarkdown: number; onClickBurnout: number; onClickLeafToken: number; onClickTwinLeafToken: number; onClickDoubleLeafToken: number; onClickLeafAll: number; onClickBonfire: number; onClickMulch: number; onClickAutumn: number; onClickLeafFrost: number; onClickSpringWind: number; onClickKimon: number; onClickFireWheel: number; onClickStrip: number; onClickChargeSeason: number; onClickBristle: number; onClickRelease: number; onClickStash: number; onClickThunderFire: number; onClickDarkPot: number; onClickChargeHeal: number; onClickLeafDrop: number; onClickKindling: number; onClickLeafCloak: number; onClickTinder: number; onClickSmallFry: number; onClickFirstFrost: number; onClickGather: number; onClickBurnOff: number; onClickFreeToken: number; onClickSpark: number; onClickNightVeil: number; onClickGraveDiscount: number; onClickPoisonWard: number; onClickGraveOffering: number; onClickPerfectGame: number; onClickHelper: number; onClickSecondCatch: number; onClickBigTree: number; onClickDeadTree: number; onClickSpring: number; onClickFort: number; onClickThundercloud: number; onClickMarket: number; onClickSanctuary: number; onClickPoisonSwamp: number; onClickBoltSilence: number; onClickDemolish: number; onClickWeather: number; onClickLevelAll: number; onClickReinforce: number; onClickExpandAll: number; onClickDuplicate: number; onClickWorkshop: number; onClickBarrierStone: number; onClickAmuletShrine: number; onClickLuckyCat: number; onClickMudField: number; onClickTongueKing: number; onClickEightTrigrams: number; onClickSoloSign: number; onClickOneWord: number; onClickBlindMonkey: number; onClickLockRaid: number; onClickLockExtend: number; onClickLockBlessing: number; onClickVacantSeal: number; };
    currentTurnPlayer: "💙" | "⭕" | "🟩" | "🔶" | "⭐" | "🟣" | "🟫" | "🩷";
    checkSkillDisable: (cost: number, isToken?: boolean, isPoison?: boolean, skillKey?: string | undefined) => boolean;
    onClickBibine: () => void;
    onClickBuds: () => void;
    onClickToken: () => void;
    calculateTokenBind: () => number;
    onClickBothToken: () => void;
    onClickSlash: () => void;
    geo: BoardGeometry;
    showPreview: (cells: number[]) => void;
    slashPreview: () => number[];
    clearPreview: () => void;
    onClickBackSlash: () => void;
    backSlashPreview: () => number[];
    onClickTsunami: () => void;
    onClickOpium: () => void;
    opiumPreview: () => number[];
    onClickBudsToken: () => void;
    onClickDoubleBuds: () => void;
    onClickDoubleToken: () => void;
    onClickUseDoubleLock: () => void;
    turnGears: GearId[];
    onClickUseTripleLock: () => void;
    onClickWalpurgisNight: () => void;
    onClickInjection: () => void;
    onClickPoisonToken: () => void;
    onClickSerum: () => void;
    onClickIntensify: () => void;
    onClickPandemic: () => void;
    onClickProliferate: () => void;
    proliferateTokenLife: number;
    proliferateUpkeepStep: number;
    proliferateMaxStacks: number;
    proliferate: boolean[];
    turnSeat: number;
    onClickChargeToken: () => void;
    onClickChargeOne: () => void;
    chargeOneCost: (player?: "💙" | "⭕" | "🟩" | "🔶" | "⭐" | "🟣" | "🟫" | "🩷") => number;
    magic: number[];
    onClickDoubleChargeToken: () => void;
    onClickChargeArea: () => void;
    onClickChargeRandom: () => void;
    onClickJammer: () => void;
    currentBoard: SquareInfo[];
    onClickHailMary: () => void;
    onClickSilence: () => void;
    otherSeats: (seat: number) => number[];
    silenced: boolean[];
    onClickPoisonMist: () => void;
    onClickFreeze: () => void;
    onClickIgnite: () => void;
    onClickCleanse: () => void;
    ownAilmentCells: () => number[];
    onClickHarvestEve: () => void;
    ownBudTotal: () => number;
    onClickSolstice: () => void;
    budGuard: boolean[];
    onClickSucker: () => void;
    suckerSources: () => number[];
    onClickWindborne: () => void;
    onClickFlameToken: () => void;
    onClickDoubleFlameToken: () => void;
    onClickSwidden: () => void;
    onClickSacrifice: () => void;
    sacrificeCandidates: () => number[];
    onClickFrostArea: () => void;
    onClickIcicle: () => void;
    onClickRandomFreeze: () => void;
    onClickFreezeSpread: () => void;
    onClickFrostToken: () => void;
    onClickDoubleFrostToken: () => void;
    onClickShatter: () => void;
    onClickFrostfall: () => void;
    onClickBoost: () => void;
    onClickClone: () => void;
    cloneSources: () => number[];
    onClickPlunder: () => void;
    characters: CharacterId[];
    onClickDiscount: (key: "onClickMarkdown" | "onClickEffectDiscount" | "onClickTokenDiscount" | "onClickVitalMarkdown" | "onClickUniqueDiscount" | "onClickClearance" | "onClickCounterMarkdown") => void;
    canUseDiscount: (key: "onClickMarkdown" | "onClickEffectDiscount" | "onClickTokenDiscount" | "onClickVitalMarkdown" | "onClickUniqueDiscount" | "onClickClearance" | "onClickCounterMarkdown") => boolean;
    onClickRandomCast: () => void;
    onClickBurnout: () => void;
    burnoutCost: () => number;
    onClickLeafToken: () => void;
    onClickTwinLeafToken: () => void;
    onClickDoubleLeafToken: () => void;
    onClickLeafAll: () => void;
    leafAllCandidates: () => number[];
    onClickBonfire: () => void;
    onClickMulch: () => void;
    onClickAutumn: () => void;
    onClickLeafFrost: () => void;
    notShielded: (cells: number[]) => number[];
    onClickSpringWind: () => void;
    onClickShikigamiAll: () => void;
    ownShikigami: () => number[];
    onClickShikigamiRandom: () => void;
    onClickShikigamiFlood: () => void;
    onClickShikigamiBless: () => void;
    blessTargets: () => number[];
    onClickShikigamiCurse: () => void;
    curseTargets: () => number[];
    onClickShikigamiDiscount: () => void;
    onClickShikigamiPurge: () => void;
    purgeTargets: () => number[];
    onClickKimon: () => void;
    kimonCandidates: () => number[];
    onClickFireWheel: () => void;
    fireWheelGuard: (sq: SquareInfo) => boolean;
    onClickSpark: () => void;
    onClickNightVeil: () => void;
    onClickGraveDiscount: () => void;
    graveDiscountNow: () => number;
    onClickPoisonWard: () => void;
    gearTurn: React.MutableRefObject<{ skills: number[]; echoReady: boolean[]; echoNext: boolean[]; kinds: Set<string>[]; infernoReady: boolean[]; discount: Discount[]; freeCast: boolean; oppSkilled: boolean[]; oppSkillPrev: boolean[]; shikiPlaced: boolean[]; plantPrev: boolean[]; plantBase: number[]; placedPrev: boolean[]; placeBase: number[]; fireBase: number[]; leafBase: number[]; darkPotUsed: boolean[]; tokenFree: boolean[]; pieceBase: number[]; turnSpent: number[]; oppBigSeen: boolean[]; oppBigPrev: boolean[]; marketUsed: number[]; bigCast: boolean[]; veil: boolean[]; veilNext: boolean[]; ward: number[]; wardFresh: boolean[]; lockSeen: boolean[]; lockPrev: boolean[]; blessing: number[]; blessingFresh: boolean[]; chargeBase: number[]; processedTurn: number; }>;
    onClickGraveOffering: () => void;
    onClickStrip: () => void;
    stripTargets: () => number[];
    onClickChargeSeason: () => void;
    chargeBuff: number[];
    onClickBristle: () => void;
    bristleTargets: () => number[];
    onClickRelease: () => void;
    ownChargeStacks: () => number;
    onClickStash: () => void;
    stashTargets: () => number[];
    onClickThunderFire: () => void;
    thunderFireTargets: () => number[];
    onClickDarkPot: () => void;
    onClickChargeHeal: () => void;
    chargeHealCells: () => number[];
    onClickSmallFry: () => void;
    onClickPerfectGame: () => void;
    onClickHelper: () => void;
    onClickBoltSilence: () => void;
    boltSilenceLegal: () => boolean;
    onClickSecondCatch: () => void;
    onClickLockRaid: () => void;
    onClickLockExtend: () => void;
    onClickLockBlessing: () => void;
    onClickVacantSeal: () => void;
    vacantSealCost: (player?: "💙" | "⭕" | "🟩" | "🔶" | "⭐" | "🟣" | "🟫" | "🩷") => number;
    onClickObjectSkill: (skill: "demolish" | "weather" | "levelAll" | "reinforce" | "expandAll" | "duplicate") => void;
    onClickObject: (kind: "bigTree" | "deadTree" | "spring" | "fort" | "thundercloud" | "market" | "sanctuary" | "poisonSwamp" | "workshop" | "barrierStone" | "amuletShrine" | "luckyCat" | "mudField" | "tongueKing" | "eightTrigrams" | "soloSign" | "oneWord" | "blindMonkey") => void;
    onClickFirstFrost: () => void;
    onClickGather: () => void;
    onClickBurnOff: () => void;
    onClickFreeToken: () => void;
    onClickLeafDrop: () => void;
    leafDropCandidates: () => number[];
    onClickKindling: () => void;
    kindlingCandidates: () => number[];
    onClickTinder: () => void;
    tinderCandidates: () => number[];
    onClickLeafCloak: () => void;
    leafCloakCandidates: () => number[];
    onClickCharge: () => void;
    charge: number;
    onClickShuffle: () => void;
    shuffleCost: number;
    onClickUseLock: () => void;
    currentCharacter: CharacterId;
    onClickCryoFreeze: () => void;
    onClickTotalAssault: () => void;
    totalAssaultCost: number;
    onClickStomp: () => void;
    gearCost: (cost: number, seat?: number, isToken?: boolean, skillKey?: string | undefined, withLeaf?: boolean) => number;
    onClickJudgeDay: () => void;
    judgeDayCost: number;
    onClickToggleYingYang: () => void;
    yinYangModeName: (seat: number) => "陽" | "陰";
    onClickNecromancy: () => void;
    currentNecroCost: number;
    currentNecroRemain: number;
    necromancySummonCap: 5;
    necromancyReviveLife: 2;
    necromancyDuration: 4;
    lifeBan: boolean[];
    onClickMiasma: () => void;
    miasmaCost: (player?: "💙" | "⭕" | "🟩" | "🔶" | "⭐" | "🟣" | "🟫" | "🩷") => number;
    miasmaPlan: (board: SquareInfo[], player: "💙" | "⭕" | "🟩" | "🔶" | "⭐" | "🟣" | "🟫" | "🩷") => Map<number, number>;
    onClickChargeSpread: () => void;
    chargeSpreadCost: (player?: "💙" | "⭕" | "🟩" | "🔶" | "⭐" | "🟣" | "🟫" | "🩷") => number;
    onClickGlacier: () => void;
    glacierCost: (player?: "💙" | "⭕" | "🟩" | "🔶" | "⭐" | "🟣" | "🟫" | "🩷") => number;
    glacierPending: boolean[];
    onClickInferno: () => void;
    infernoCost: (player?: "💙" | "⭕" | "🟩" | "🔶" | "⭐" | "🟣" | "🟫" | "🩷") => number;
    onClickMogaribue: () => void;
    mogaribueCost: (player?: "💙" | "⭕" | "🟩" | "🔶" | "⭐" | "🟣" | "🟫" | "🩷") => number;
    onClickSeal: () => void;
    sealCost: (player?: "💙" | "⭕" | "🟩" | "🔶" | "⭐" | "🟣" | "🟫" | "🩷") => number;
    onClickShikigamiPlace: () => void;
    currentYinYangMode: YingYangMode | undefined;
    onClickShikigamiBlast: () => void;
    skills: number[];
    currentLockedSkills: number[];
    toggleLock: (i: number) => void;
}
export const useSkillCards = (g: SkillCardsScope, late: () => GameLate) => {
    const { onClickAddLife, calculateCost, seatCosts, currentTurnPlayer, checkSkillDisable, onClickBibine, onClickBuds, onClickToken, calculateTokenBind, onClickBothToken, onClickSlash, geo, showPreview, slashPreview, clearPreview, onClickBackSlash, backSlashPreview, onClickTsunami, onClickOpium, opiumPreview, onClickBudsToken, onClickDoubleBuds, onClickDoubleToken, onClickUseDoubleLock, turnGears, onClickUseTripleLock, onClickWalpurgisNight, onClickInjection, onClickPoisonToken, onClickSerum, onClickIntensify, onClickPandemic, onClickProliferate, proliferateTokenLife, proliferateUpkeepStep, proliferateMaxStacks, proliferate, turnSeat, onClickChargeToken, onClickChargeOne, chargeOneCost, magic, onClickDoubleChargeToken, onClickChargeArea, onClickChargeRandom, onClickJammer, currentBoard, onClickHailMary, onClickSilence, otherSeats, silenced, onClickPoisonMist, onClickFreeze, onClickIgnite, onClickCleanse, ownAilmentCells, onClickHarvestEve, ownBudTotal, onClickSolstice, budGuard, onClickSucker, suckerSources, onClickWindborne, onClickFlameToken, onClickDoubleFlameToken, onClickSwidden, onClickSacrifice, sacrificeCandidates, onClickFrostArea, onClickIcicle, onClickRandomFreeze, onClickFreezeSpread, onClickFrostToken, onClickDoubleFrostToken, onClickShatter, onClickFrostfall, onClickBoost, onClickClone, cloneSources, onClickPlunder, characters, onClickDiscount, canUseDiscount, onClickRandomCast, onClickBurnout, burnoutCost, onClickLeafToken, onClickTwinLeafToken, onClickDoubleLeafToken, onClickLeafAll, leafAllCandidates, onClickBonfire, onClickMulch, onClickAutumn, onClickLeafFrost, notShielded, onClickSpringWind, onClickShikigamiAll, ownShikigami, onClickShikigamiRandom, onClickShikigamiFlood, onClickShikigamiBless, blessTargets, onClickShikigamiCurse, curseTargets, onClickShikigamiDiscount, onClickShikigamiPurge, purgeTargets, onClickKimon, kimonCandidates, onClickFireWheel, fireWheelGuard, onClickSpark, onClickNightVeil, onClickGraveDiscount, graveDiscountNow, onClickPoisonWard, gearTurn, onClickGraveOffering, onClickStrip, stripTargets, onClickChargeSeason, chargeBuff, onClickBristle, bristleTargets, onClickRelease, ownChargeStacks, onClickStash, stashTargets, onClickThunderFire, thunderFireTargets, onClickDarkPot, onClickChargeHeal, chargeHealCells, onClickSmallFry, onClickPerfectGame, onClickHelper, onClickBoltSilence, boltSilenceLegal, onClickSecondCatch, onClickLockRaid, onClickLockExtend, onClickLockBlessing, onClickVacantSeal, vacantSealCost, onClickObjectSkill, onClickObject, onClickFirstFrost, onClickGather, onClickBurnOff, onClickFreeToken, onClickLeafDrop, leafDropCandidates, onClickKindling, kindlingCandidates, onClickTinder, tinderCandidates, onClickLeafCloak, leafCloakCandidates, onClickCharge, charge, onClickShuffle, shuffleCost, onClickUseLock, currentCharacter, onClickCryoFreeze, onClickTotalAssault, totalAssaultCost, onClickStomp, gearCost, onClickJudgeDay, judgeDayCost, onClickToggleYingYang, yinYangModeName, onClickNecromancy, currentNecroCost, currentNecroRemain, necromancySummonCap, necromancyReviveLife, necromancyDuration, lifeBan, onClickMiasma, miasmaCost, miasmaPlan, onClickChargeSpread, chargeSpreadCost, onClickGlacier, glacierCost, glacierPending, onClickInferno, infernoCost, onClickMogaribue, mogaribueCost, onClickSeal, sealCost, onClickShikigamiPlace, currentYinYangMode, onClickShikigamiBlast, skills, currentLockedSkills, toggleLock } = g;


    // シャッフル対象スキル(index 0-14)の定義。ロックトグル付きで .map() 描画する
    const shuffleSkillDefs: {
        idx: number;
        onClick: () => void;
        buttonText: string;
        paragraph: string;
        disabled: boolean;
        onHoverStart?: () => void;
        onHoverEnd?: () => void;
    }[] = [
        { idx: 0, onClick: onClickAddLife, buttonText: `ライフ3-${calculateCost(seatCosts.onClickAddLife, false, false, currentTurnPlayer, 'onClickAddLife')}`, paragraph: 'ライフを3追加します', disabled: checkSkillDisable(seatCosts.onClickAddLife) },
        { idx: 1, onClick: onClickBibine, buttonText: `バイバイン-${calculateCost(seatCosts.onClickBibine, false, false, currentTurnPlayer, 'onClickBibine')}`, paragraph: 'ライフが倍になります', disabled: checkSkillDisable(seatCosts.onClickBibine) },
        { idx: 2, onClick: onClickBuds, buttonText: `バッズ-${calculateCost(seatCosts.onClickBuds, false, false, currentTurnPlayer, 'onClickBuds')}`, paragraph: '次の一手でバッズを植えます', disabled: checkSkillDisable(seatCosts.onClickBuds) },
        { idx: 3, onClick: onClickToken, buttonText: `トークン-${calculateCost(seatCosts.onClickToken, true, false, currentTurnPlayer, 'onClickToken')}`, paragraph: `空きマスにランダムにライフが${calculateTokenBind()}の${currentTurnPlayer}を置きます。\nトークンはターンに一度しか使用できません`, disabled: checkSkillDisable(seatCosts.onClickToken, true) },
        { idx: 4, onClick: onClickBothToken, buttonText: `両トークン-${calculateCost(seatCosts.onClickBothToken, true, false, currentTurnPlayer, 'onClickBothToken')}`, paragraph: `空きマスにランダムにライフが4の全プレイヤーのコマを1つずつ置きます(自分はライフ${calculateTokenBind()})。\nトークンはターンに一度しか使用できません`, disabled: checkSkillDisable(seatCosts.onClickBothToken, true) },
        { idx: 5, onClick: onClickSlash, buttonText: `スラッシュ-${calculateCost(seatCosts.onClickSlash, false, false, currentTurnPlayer, 'onClickSlash')}`, paragraph: `右上から左下にかけての${geo.size}マスのライフを0にします`, disabled: checkSkillDisable(seatCosts.onClickSlash), onHoverStart: () => showPreview(slashPreview()), onHoverEnd: clearPreview },
        { idx: 6, onClick: onClickBackSlash, buttonText: `バックスラッシュ-${calculateCost(seatCosts.onClickBackSlash, false, false, currentTurnPlayer, 'onClickBackSlash')}`, paragraph: `左上から右下にかけての${geo.size}マスのライフを0にします`, disabled: checkSkillDisable(seatCosts.onClickBackSlash), onHoverStart: () => showPreview(backSlashPreview()), onHoverEnd: clearPreview },
        { idx: 7, onClick: onClickTsunami, buttonText: `チューチュートレイン-${calculateCost(seatCosts.onClickTsunami, false, false, currentTurnPlayer, 'onClickTsunami')}`, paragraph: `相手全員のマジックを0にします`, disabled: checkSkillDisable(seatCosts.onClickTsunami) },
        { idx: 8, onClick: onClickOpium, buttonText: `オピウム-${calculateCost(seatCosts.onClickOpium, false, false, currentTurnPlayer, 'onClickOpium')}`, paragraph: `相手の駒全てのライフを-2し、ターンを終了します`, disabled: checkSkillDisable(seatCosts.onClickOpium), onHoverStart: () => showPreview(opiumPreview()), onHoverEnd: clearPreview },
        { idx: 9, onClick: onClickBudsToken, buttonText: `バッズトークン-${calculateCost(seatCosts.onClickBudsToken, true, false, currentTurnPlayer, 'onClickBudsToken')}`, paragraph: `バッズ付き・ライフ3のコマをランダムに設置します\nトークンはターンに一度しか使用できません`, disabled: checkSkillDisable(seatCosts.onClickBudsToken, true) },
        { idx: 10, onClick: onClickDoubleBuds, buttonText: `ダブルバッズ-${calculateCost(seatCosts.onClickDoubleBuds, false, false, currentTurnPlayer, 'onClickDoubleBuds')}`, paragraph: '次の一手でバッズを2つ植えます', disabled: checkSkillDisable(seatCosts.onClickDoubleBuds) },
        { idx: 11, onClick: onClickDoubleToken, buttonText: `ダブルトークン-${calculateCost(seatCosts.onClickDoubleToken, true, false, currentTurnPlayer, 'onClickDoubleToken')}`, paragraph: `空きマスにランダムにライフが${calculateTokenBind()}の${currentTurnPlayer}を2つ置きます\nトークンはターンに一度しか使用できません`, disabled: checkSkillDisable(seatCosts.onClickDoubleToken) },
        { idx: 12, onClick: onClickUseDoubleLock, buttonText: `ダブルロック-${calculateCost(seatCosts.onClickDoubleLock, false, false, currentTurnPlayer, 'onClickDoubleLock')}`, paragraph: `マスを2つ選択し、${gearLockStack(turnGears)}ターン以上ロックします`, disabled: checkSkillDisable(seatCosts.onClickDoubleLock) },
        { idx: 13, onClick: onClickUseTripleLock, buttonText: `トリプルロック-${calculateCost(seatCosts.onClickTripleLock, false, false, currentTurnPlayer, 'onClickTripleLock')}`, paragraph: `マスを3つ選択し、${gearLockStack(turnGears)}ターン以上ロックします`, disabled: checkSkillDisable(seatCosts.onClickTripleLock) },
        { idx: 14, onClick: onClickWalpurgisNight, buttonText: `ワルプルギスの夜-${calculateCost(seatCosts.onClickWalpurgisNight, false, false, currentTurnPlayer, 'onClickWalpurgisNight')}`, paragraph: `全コマにバッズを植えます`, disabled: checkSkillDisable(seatCosts.onClickWalpurgisNight) },
        { idx: 15, onClick: onClickInjection, buttonText: `インジェクション-${calculateCost(seatCosts.onClickInjection, false, true, currentTurnPlayer, 'onClickInjection')}`, paragraph: `マスを選択し、毒を1付与します（毒は毎ターンbind-1・重複可）`, disabled: checkSkillDisable(seatCosts.onClickInjection, false, true) },
        { idx: 16, onClick: onClickPoisonToken, buttonText: `ポイズントークン-${calculateCost(seatCosts.onClickPoisonToken, true, true, currentTurnPlayer, 'onClickPoisonToken')}`, paragraph: `毒付き・ライフ${calculateTokenBind()}の自陣コマをランダムに設置します\nトークンはターンに一度しか使用できません`, disabled: checkSkillDisable(seatCosts.onClickPoisonToken, true, true) },
        { idx: 17, onClick: onClickSerum, buttonText: `血清-${calculateCost(seatCosts.onClickSerum, false, true, currentTurnPlayer, 'onClickSerum')}`, paragraph: `自陣のコマの毒をすべて除去します`, disabled: checkSkillDisable(seatCosts.onClickSerum, false, true) },
        { idx: 18, onClick: onClickIntensify, buttonText: `猛毒化-${calculateCost(seatCosts.onClickIntensify, false, true, currentTurnPlayer, 'onClickIntensify')}`, paragraph: `毒が付与されている全マスの毒の数を倍にします`, disabled: checkSkillDisable(seatCosts.onClickIntensify, false, true) },
        { idx: 19, onClick: onClickPandemic, buttonText: `パンデミック-${calculateCost(seatCosts.onClickPandemic, false, true, currentTurnPlayer, 'onClickPandemic')}`, paragraph: `マスを選択し、そのマスと周囲1マス(3x3)のコマに毒を1付与します`, disabled: checkSkillDisable(seatCosts.onClickPandemic, false, true) },
        {
            idx: 20,
            onClick: onClickProliferate,
            buttonText: `増殖-${calculateCost(seatCosts.onClickProliferate, false, false, currentTurnPlayer, 'onClickProliferate')}`,
            paragraph: `発動後は着手のたびに「ライフ${proliferateTokenLife}のコマ」→「アイテム(🌱/毒使いは敵に☠)」を交互に追加し続けます\n維持コストは手番開始時に払い、追加のたび+${proliferateUpkeepStep}増加。払えなくなるか${proliferateMaxStacks}回で終了`,
            disabled: checkSkillDisable(seatCosts.onClickProliferate) || proliferate[turnSeat],
        },
        { idx: 21, onClick: onClickChargeToken, buttonText: `帯電トークン-${calculateCost(seatCosts.onClickChargeToken, true, false, currentTurnPlayer, 'onClickChargeToken')}`, paragraph: `⚡付き・ライフ${calculateTokenBind()}の自陣コマをランダムに設置します\n⚡の隣に誰かが置くと、⚡マスの縦横隣のコマに1ダメージ\n雷霆の巫以外は⚡が乗った時点で2ダメージ\nトークンはターンに一度しか使用できません`, disabled: checkSkillDisable(seatCosts.onClickChargeToken, true) },
        { idx: 22, onClick: onClickChargeOne, buttonText: `帯電付与-${chargeOneCost()}`, paragraph: `マスを選択し、⚡を1つ付与します（空きマスも可）\n雷霆の巫以外のコマは、⚡が乗った時点で2ダメージを受けます（空きマス・ライフ0・🔑・氷結中は除く）\nコストは盤面の⚡の数だけ軽減されます`, disabled: magic[turnSeat] < chargeOneCost() },
        { idx: 23, onClick: onClickDoubleChargeToken, buttonText: `帯電ダブルトークン-${calculateCost(seatCosts.onClickDoubleChargeToken, true, false, currentTurnPlayer, 'onClickDoubleChargeToken')}`, paragraph: `⚡付き・ライフ${calculateTokenBind()}の自陣コマをランダムに2つ設置します\n⚡の隣に誰かが置くと、⚡マスの縦横隣のコマに1ダメージ\n雷霆の巫以外は⚡が乗った時点で2ダメージ\nトークンはターンに一度しか使用できません`, disabled: checkSkillDisable(seatCosts.onClickDoubleChargeToken, true) },
        { idx: 24, onClick: onClickChargeArea, buttonText: `範囲帯電-${calculateCost(seatCosts.onClickChargeArea, false, false, currentTurnPlayer, 'onClickChargeArea')}`, paragraph: `マスを選択し、そのマスと周囲1マス(3x3)に⚡を1つずつ付与します（空きマスも可）\n雷霆の巫以外のコマは、⚡が乗った時点で2ダメージを受けます`, disabled: checkSkillDisable(seatCosts.onClickChargeArea) },
        { idx: 25, onClick: onClickChargeRandom, buttonText: `ランダム帯電-${calculateCost(seatCosts.onClickChargeRandom, false, false, currentTurnPlayer, 'onClickChargeRandom')}`, paragraph: `ランダムな1〜4マスに⚡を1つずつ付与します（空きマスも可）\n無敵のマスと🔑ロック中のマスは対象外です\n雷霆の巫以外は⚡が乗った時点で2ダメージ`, disabled: checkSkillDisable(seatCosts.onClickChargeRandom) },
        { idx: 26, onClick: onClickJammer, buttonText: `ジャマー-${calculateCost(seatCosts.onClickJammer, false, false, currentTurnPlayer, 'onClickJammer')}`, paragraph: `⚡のあるマスを選択し、縦横に隣接する相手のコマのライフを⚡の数だけ減らして、そのマスの⚡を取り除きます\n自分のコマと🔑ロック中のコマは影響を受けません\n自分の無敵マスも選べます（弱点を解除できます）`, disabled: checkSkillDisable(seatCosts.onClickJammer) || boardChargeCount(currentBoard) === 0 },
        { idx: 27, onClick: onClickHailMary, buttonText: `ヘイルメアリー-${calculateCost(seatCosts.onClickHailMary, false, false, currentTurnPlayer, 'onClickHailMary')}`, paragraph: `陰陽転化を除く固有スキルをランダムに1つ、追加コストなしで発動します`, disabled: checkSkillDisable(seatCosts.onClickHailMary) },
        { idx: 28, onClick: onClickSilence, buttonText: `サイレンス-${calculateCost(seatCosts.onClickSilence, false, false, currentTurnPlayer, 'onClickSilence')}`, paragraph: `相手全員が次の手番、スキルを使えなくなります（駒を置くことはできます）`, disabled: checkSkillDisable(seatCosts.onClickSilence) || otherSeats(turnSeat).every((seat) => silenced[seat]) },
        { idx: 29, onClick: onClickPoisonMist, buttonText: `毒霧-${calculateCost(seatCosts.onClickPoisonMist, false, true, currentTurnPlayer, 'onClickPoisonMist')}`, paragraph: `盤上の全コマ（敵味方問わず）に毒を1付与します 🔑ロック中・無敵のコマは対象外です`, disabled: checkSkillDisable(seatCosts.onClickPoisonMist, false, true) || !currentBoard.some((sq) => sq.player) },
        { idx: 30, onClick: onClickFreeze, buttonText: `氷結-${calculateCost(seatCosts.onClickFreeze, false, false, currentTurnPlayer, 'onClickFreeze')}`, paragraph: `コマを選択し、❄氷結を付与します（敵味方どちらでも）\n氷結中はターン進行でライフが減らず、隣接⚡のダメージも受けず（そのマスの⚡は休眠）、スキルのダメージは氷結が解除される代わりに無効になります（毒は通ります）\n自陣の氷結コマには重ねて強化できません`, disabled: checkSkillDisable(seatCosts.onClickFreeze) || !currentBoard.some(canFreeze) },
        { idx: 31, onClick: onClickIgnite, buttonText: `火遁-${calculateCost(seatCosts.onClickIgnite, false, false, currentTurnPlayer, 'onClickIgnite')}`, paragraph: `マスを選択し、🔥火炎を1つ付与します（重複可。空きマスにも置け、置かれたコマに引き継がれます）\n付与した瞬間に1ダメージ。毎ターン1スタックにつき2ダメージ。ダメージを受けると消え、スキルのダメージは1.5倍に\n付与したマスと縦横隣の氷結は即座に解けます`, disabled: checkSkillDisable(seatCosts.onClickIgnite) },
        { idx: 32, onClick: onClickCleanse, buttonText: `浄化-${calculateCost(seatCosts.onClickCleanse, false, false, currentTurnPlayer, 'onClickCleanse')}`, paragraph: `自陣のコマの状態異常（☠毒・🔥火炎・❄氷結・⚡帯電）をすべて回復します\n🌱バッズと🔑ロックはそのままです`, disabled: checkSkillDisable(seatCosts.onClickCleanse) || ownAilmentCells().length === 0 },
        { idx: 33, onClick: onClickHarvestEve, buttonText: `刈り入れ前夜-${calculateCost(seatCosts.onClickHarvestEve, false, false, currentTurnPlayer, 'onClickHarvestEve')}`, paragraph: `自陣の🌱をすべて刈り取り、刈った数だけ魔力を得ます\n氷結や火炎で失う前に現金化できます`, disabled: checkSkillDisable(seatCosts.onClickHarvestEve) || ownBudTotal() === 0 },
        { idx: 34, onClick: onClickSolstice, buttonText: `冬至の種子-${calculateCost(seatCosts.onClickSolstice, false, false, currentTurnPlayer, 'onClickSolstice')}`, paragraph: `次の自分の手番が来るまで、自陣のコマの🌱が🔥で消えず、氷結中のマスでも休眠せず働きます（魔力・刈り入れ前夜）`, disabled: checkSkillDisable(seatCosts.onClickSolstice) || budGuard[turnSeat] },
        { idx: 35, onClick: onClickSucker, buttonText: `ひこばえ-${calculateCost(seatCosts.onClickSucker, false, false, currentTurnPlayer, 'onClickSucker')}`, paragraph: `🌱を持つ自陣のコマを選ぶと、縦横に隣り合う自陣のコマに🌱が1つずつ付きます（隣が3つ以上ならランダムに2つ）\n氷結・火炎中のコマには付きません`, disabled: checkSkillDisable(seatCosts.onClickSucker) || suckerSources().length === 0 },
        { idx: 36, onClick: onClickWindborne, buttonText: `風の落とし子-${calculateCost(seatCosts.onClickWindborne, false, false, currentTurnPlayer, 'onClickWindborne')}`, paragraph: `自陣のコマにランダムで🌱を2つ配ります（1マスに1つまで）\n氷結・火炎中のコマには付きません`, disabled: checkSkillDisable(seatCosts.onClickWindborne) || sowCandidates(currentBoard, currentTurnPlayer).length === 0 },
        { idx: 37, onClick: onClickFlameToken, buttonText: `火炎トークン-${calculateCost(seatCosts.onClickFlameToken, true, false, currentTurnPlayer, 'onClickFlameToken')}`, paragraph: `🔥付き・ライフ${calculateTokenBind()}の自陣コマをランダムに設置します\n置いたマスの縦横隣の氷結は即座に解けます\nトークンはターンに一度しか使用できません`, disabled: checkSkillDisable(seatCosts.onClickFlameToken, true) },
        { idx: 38, onClick: onClickDoubleFlameToken, buttonText: `火炎ダブルトークン-${calculateCost(seatCosts.onClickDoubleFlameToken, true, false, currentTurnPlayer, 'onClickDoubleFlameToken')}`, paragraph: `🔥付き・ライフ${calculateTokenBind()}の自陣コマをランダムに2つ設置します\n置いたマスの縦横隣の氷結は即座に解けます\nトークンはターンに一度しか使用できません`, disabled: checkSkillDisable(seatCosts.onClickDoubleFlameToken, true) },
        { idx: 39, onClick: onClickSwidden, buttonText: `焼畑-${calculateCost(seatCosts.onClickSwidden, false, false, currentTurnPlayer, 'onClickSwidden')}`, paragraph: `🌱のあるマス（敵味方どちらでも）を選ぶと、そのマスの🌱を全て同じ数の🔥に変えます\n氷結中のマスは先に氷結が解除されます`, disabled: checkSkillDisable(seatCosts.onClickSwidden) || !currentBoard.some((sq) => budStacks(sq) > 0) },
        { idx: 40, onClick: onClickSacrifice, buttonText: `殉火-${calculateCost(seatCosts.onClickSacrifice, false, false, currentTurnPlayer, 'onClickSacrifice')}`, paragraph: `自陣のコマを1つ選ぶと、そのコマのライフをゼロにして、そのライフ以下の敵のコマ全てに🔥を付与します\n氷結中の敵は🔥の代わりに氷結が解除されます`, disabled: checkSkillDisable(seatCosts.onClickSacrifice) || sacrificeCandidates().length === 0 },
        { idx: 41, onClick: onClickFrostArea, buttonText: `範囲氷結-${calculateCost(seatCosts.onClickFrostArea, false, false, currentTurnPlayer, 'onClickFrostArea')}`, paragraph: `マスを選択し、そのマスと周囲8マス(3x3)に❄を1つずつ付与します（空きマスも可）\n氷結中の空きマスには誰も着手できません`, disabled: checkSkillDisable(seatCosts.onClickFrostArea) },
        { idx: 42, onClick: onClickIcicle, buttonText: `氷柱-${calculateCost(seatCosts.onClickIcicle, false, false, currentTurnPlayer, 'onClickIcicle')}`, paragraph: `マスを選んで方向（横・縦・斜め）を選ぶと、盤の端から端までの線上のマスに❄を1つずつ付与します（空きマスも可）`, disabled: checkSkillDisable(seatCosts.onClickIcicle) },
        { idx: 43, onClick: onClickRandomFreeze, buttonText: `ランダム氷結-${calculateCost(seatCosts.onClickRandomFreeze, false, false, currentTurnPlayer, 'onClickRandomFreeze')}`, paragraph: `ランダムな1〜4マス（空きマスも可）に❄を1つずつ付与します`, disabled: checkSkillDisable(seatCosts.onClickRandomFreeze) || randomFreezeCandidates(currentBoard).length === 0 },
        { idx: 44, onClick: onClickFreezeSpread, buttonText: `氷結拡散-${calculateCost(seatCosts.onClickFreezeSpread, false, false, currentTurnPlayer, 'onClickFreezeSpread')}`, paragraph: `コマを選択し、そこからコマのあるマスだけを縦横に辿って届くすべてのコマ(敵味方問わず)に❄を1つ付与します`, disabled: checkSkillDisable(seatCosts.onClickFreezeSpread) || !currentBoard.some((sq) => sq.player) },
        { idx: 45, onClick: onClickFrostToken, buttonText: `氷結トークン-${calculateCost(seatCosts.onClickFrostToken, true, false, currentTurnPlayer, 'onClickFrostToken')}`, paragraph: `❄付き・ライフ${calculateTokenBind()}の自陣コマをランダムに設置します\nトークンはターンに一度しか使用できません`, disabled: checkSkillDisable(seatCosts.onClickFrostToken, true) },
        { idx: 46, onClick: onClickDoubleFrostToken, buttonText: `氷結ダブルトークン-${calculateCost(seatCosts.onClickDoubleFrostToken, true, false, currentTurnPlayer, 'onClickDoubleFrostToken')}`, paragraph: `❄付き・ライフ${calculateTokenBind()}の自陣コマをランダムに2つ設置します\nトークンはターンに一度しか使用できません`, disabled: checkSkillDisable(seatCosts.onClickDoubleFrostToken, true) },
        { idx: 47, onClick: onClickShatter, buttonText: `砕氷-${calculateCost(seatCosts.onClickShatter, false, false, currentTurnPlayer, 'onClickShatter')}`, paragraph: `氷結中のコマを選択し、❄を全て砕いて❄1つにつき3ダメージを与えます（ライフが0になったら破壊）\n自陣のコマにも使えます`, disabled: checkSkillDisable(seatCosts.onClickShatter) || !currentBoard.some((sq) => sq.player && isFrozen(sq)) },
        { idx: 48, onClick: onClickFrostfall, buttonText: `霜降り-${calculateCost(seatCosts.onClickFrostfall, false, false, currentTurnPlayer, 'onClickFrostfall')}`, paragraph: `自陣のライフ2以下のコマすべてに❄を1つ付与します`, disabled: checkSkillDisable(seatCosts.onClickFrostfall) || frostfallTargets(currentBoard, currentTurnPlayer).length === 0 },
        { idx: 49, onClick: onClickBoost, buttonText: `慈雨-${calculateCost(seatCosts.onClickBoost, false, false, currentTurnPlayer, 'onClickBoost')}`, paragraph: `自陣の全コマのライフを+1します（ライフ0のコマも）`, disabled: checkSkillDisable(seatCosts.onClickBoost) || !currentBoard.some((sq) => sq.player === currentTurnPlayer) },
        { idx: 51, onClick: onClickClone, buttonText: `写し身-${calculateCost(seatCosts.onClickClone, false, false, currentTurnPlayer, 'onClickClone')}`, paragraph: `自陣のコマを選ぶと、縦横隣のランダムな空きマスに、ライフが半分（切り捨て・最低1）の写しが現れます`, disabled: checkSkillDisable(seatCosts.onClickClone) || cloneSources().length === 0 },
        { idx: 52, onClick: onClickPlunder, buttonText: `追い剥ぎ-${calculateCost(seatCosts.onClickPlunder, false, false, currentTurnPlayer, 'onClickPlunder')}`, paragraph: `ライフ0の敵のコマを1つ選んで、自陣のコマ（ライフ1）にします\n🔑ロック中のコマ・無敵のコマは奪えません。手番は続きます`, disabled: checkSkillDisable(seatCosts.onClickPlunder) || plunderTargets(currentBoard, currentTurnPlayer, characters).length === 0 },
        { idx: 53, onClick: () => onClickDiscount('onClickMarkdown'), buttonText: `特売-${calculateCost(seatCosts.onClickMarkdown, false, false, currentTurnPlayer, 'onClickMarkdown')}`, paragraph: `次に打つスキルのコストを3軽減します（軽減後は最低1。この手番の間だけ有効）`, disabled: !canUseDiscount('onClickMarkdown') },
        { idx: 54, onClick: () => onClickDiscount('onClickEffectDiscount'), buttonText: `付与割引-${calculateCost(seatCosts.onClickEffectDiscount, false, false, currentTurnPlayer, 'onClickEffectDiscount')}`, paragraph: `このターン、エフェクト（🌱⚡☠❄🔥）を付与するスキルのコストを、打つたびに1軽減します`, disabled: !canUseDiscount('onClickEffectDiscount') },
        { idx: 55, onClick: () => onClickDiscount('onClickTokenDiscount'), buttonText: `トークン割引-${calculateCost(seatCosts.onClickTokenDiscount, false, false, currentTurnPlayer, 'onClickTokenDiscount')}`, paragraph: `このターン、トークンを付与するスキルのコストを、打つたびに1軽減します`, disabled: !canUseDiscount('onClickTokenDiscount') },
        { idx: 56, onClick: () => onClickDiscount('onClickVitalMarkdown'), buttonText: `活力特売-${calculateCost(seatCosts.onClickVitalMarkdown, false, false, currentTurnPlayer, 'onClickVitalMarkdown')}`, paragraph: `次に打つスキルのコストを4軽減し、次の一手のライフを+1します`, disabled: !canUseDiscount('onClickVitalMarkdown') },
        { idx: 57, onClick: () => onClickDiscount('onClickUniqueDiscount'), buttonText: `固有割引-${calculateCost(seatCosts.onClickUniqueDiscount, false, false, currentTurnPlayer, 'onClickUniqueDiscount')}`, paragraph: `このターン、固有スキルのコストを6軽減します\n1ターンに一度のみ・ライフ-1（ライフ2以上で使用可）`, disabled: !canUseDiscount('onClickUniqueDiscount') },
        { idx: 58, onClick: () => onClickDiscount('onClickClearance'), buttonText: `大特価-${calculateCost(seatCosts.onClickClearance, false, false, currentTurnPlayer, 'onClickClearance')}`, paragraph: `次に打つスキルのコストを7軽減します（軽減後は最低1。この手番の間だけ有効）`, disabled: !canUseDiscount('onClickClearance') },
        { idx: 59, onClick: onClickRandomCast, buttonText: `福引き-${calculateCost(seatCosts.onClickRandomCast, false, false, currentTurnPlayer, 'onClickRandomCast')}`, paragraph: `自分のデッキ（12枚）から、基礎コスト3以下のスキルをランダムに1つ、コストを払わずに発動します\n手札に出ていないスキルも対象です（今撃てるものだけ）`, disabled: checkSkillDisable(seatCosts.onClickRandomCast) },
        { idx: 60, onClick: () => onClickDiscount('onClickCounterMarkdown'), buttonText: `返し特売-${calculateCost(seatCosts.onClickCounterMarkdown, false, false, currentTurnPlayer, 'onClickCounterMarkdown')}`, paragraph: `次に打つスキルのコストを3軽減し、次の一手のライフを+1します\n直前の相手の手番に相手がスキルを使っていれば、コスト0で使えます`, disabled: !canUseDiscount('onClickCounterMarkdown') },
        { idx: 61, onClick: onClickBurnout, buttonText: `バーンアウト-${burnoutCost()}`, paragraph: `🔥が乗っているマスを全て破壊します（敵味方問わず。雷霆の巫の⚡無敵コマを除く）\n盤面に🔥が${BURNOUT_FREE_FLAMES}つ以上あればコスト0で使えます（現在${totalFlames(currentBoard)}つ）`, disabled: magic[turnSeat] < burnoutCost() || burnoutTargets(currentBoard, characters).length === 0 },
        { idx: 62, onClick: onClickLeafToken, buttonText: `木枯らしの使い-${calculateCost(seatCosts.onClickLeafToken, true, false, currentTurnPlayer, 'onClickLeafToken')}`, paragraph: `🍂付き・ライフ${calculateTokenBind()}の自陣コマをランダムに設置します\n自陣の🍂は、相手全員のスキルコストを🍂の数だけ増やします（氷結中は休眠・🔥で消える）\nトークンはターンに一度しか使用できません`, disabled: checkSkillDisable(seatCosts.onClickLeafToken, true) },
        { idx: 63, onClick: onClickTwinLeafToken, buttonText: `落葉松の双子-${calculateCost(seatCosts.onClickTwinLeafToken, true, false, currentTurnPlayer, 'onClickTwinLeafToken')}`, paragraph: `🍂が2枚付いた・ライフ${calculateTokenBind()}の自陣コマをランダムに設置します\n自陣の🍂は、相手全員のスキルコストを🍂の数だけ増やします（氷結中は休眠・🔥で消える）\nトークンはターンに一度しか使用できません`, disabled: checkSkillDisable(seatCosts.onClickTwinLeafToken, true) },
        { idx: 64, onClick: onClickDoubleLeafToken, buttonText: `紅葉狩り-${calculateCost(seatCosts.onClickDoubleLeafToken, true, false, currentTurnPlayer, 'onClickDoubleLeafToken')}`, paragraph: `🍂付き・ライフ${calculateTokenBind()}の自陣コマをランダムに2つ設置します\n自陣の🍂は、相手全員のスキルコストを🍂の数だけ増やします（氷結中は休眠・🔥で消える）\nこのターン自陣の🍂が増えていれば、コスト-2\nトークンはターンに一度しか使用できません`, disabled: checkSkillDisable(seatCosts.onClickDoubleLeafToken, true, false, 'onClickDoubleLeafToken') },
        { idx: 65, onClick: onClickLeafAll, buttonText: `枯野の相席-${calculateCost(seatCosts.onClickLeafAll, false, false, currentTurnPlayer, 'onClickLeafAll')}`, paragraph: `盤面の全てのコマ（敵味方問わず。🔑ロックと⚡無敵のコマは除く）に🍂を1つずつ付与します\n自陣の🍂は相手のコストを増やし、敵の🍂は自分のコストを増やします`, disabled: checkSkillDisable(seatCosts.onClickLeafAll) || leafAllCandidates().length === 0 },
        { idx: 66, onClick: onClickBonfire, buttonText: `焚き火の唄-${calculateCost(seatCosts.onClickBonfire, false, false, currentTurnPlayer, 'onClickBonfire')}`, paragraph: `敵陣の🍂をすべて取り除きます（🔑ロックと❄氷結のマスは対象外）`, disabled: checkSkillDisable(seatCosts.onClickBonfire) || bonfireTargets(currentBoard, currentTurnPlayer).length === 0 },
        { idx: 67, onClick: onClickMulch, buttonText: `腐葉土の目覚め-${calculateCost(seatCosts.onClickMulch, false, false, currentTurnPlayer, 'onClickMulch')}`, paragraph: `自陣のランダムな🍂を1枚、🌱に変えます`, disabled: checkSkillDisable(seatCosts.onClickMulch) || mulchCandidates(currentBoard, currentTurnPlayer).length === 0 },
        { idx: 68, onClick: onClickAutumn, buttonText: `一葉知秋-${calculateCost(seatCosts.onClickAutumn, false, false, currentTurnPlayer, 'onClickAutumn')}`, paragraph: `盤面のすべての🌱を🍂に変えます（敵味方問わず。🔥が付いたマスは変わりません）`, disabled: checkSkillDisable(seatCosts.onClickAutumn) || autumnTargets(currentBoard).length === 0 },
        { idx: 69, onClick: onClickLeafFrost, buttonText: `霜枯れ-${calculateCost(seatCosts.onClickLeafFrost, false, false, currentTurnPlayer, 'onClickLeafFrost')}`, paragraph: `自陣の🍂を持つコマすべてに❄を付けます（🔥や上書きから守れますが、氷結中は🍂が休眠してコスト上乗せが止まります）`, disabled: checkSkillDisable(seatCosts.onClickLeafFrost) || notShielded(leafFrostTargets(currentBoard, currentTurnPlayer)).length === 0 },
        { idx: 70, onClick: onClickSpringWind, buttonText: `春一番-${calculateCost(seatCosts.onClickSpringWind, false, false, currentTurnPlayer, 'onClickSpringWind')}`, paragraph: `自陣の❄をすべて解除し、解除した❄の数だけ、このターンに打つスキルのコストを軽減します（軽減後は最低1。この手番の間だけ有効）`, disabled: checkSkillDisable(seatCosts.onClickSpringWind) || thawTargets(currentBoard, currentTurnPlayer).length === 0 },
        { idx: 71, onClick: onClickShikigamiAll, buttonText: `式神一括-${calculateCost(seatCosts.onClickShikigamiAll * Math.max(1, ownShikigami().length), false, false, currentTurnPlayer, 'onClickShikigamiAll')}`, paragraph: `自分の式神を全て通常の自陣のコマにします（列に数えられるようになります）\nコストは式神1体につき${seatCosts.onClickShikigamiAll}です`, disabled: ownShikigami().length === 0 || checkSkillDisable(seatCosts.onClickShikigamiAll * ownShikigami().length) },
        { idx: 72, onClick: onClickShikigamiRandom, buttonText: `式神ランダム設置-${calculateCost(seatCosts.onClickShikigamiRandom, true, false, currentTurnPlayer, 'onClickShikigamiRandom')}`, paragraph: `ランダムな空きマスにライフ${Math.max(1, SHIKIGAMI_LIFE + gearTokenBindDelta(turnGears))}の式神を置きます 式神は列の並びに数えません\nトークンはターンに一度しか使用できません`, disabled: checkSkillDisable(seatCosts.onClickShikigamiRandom, true) },
        { idx: 73, onClick: onClickShikigamiFlood, buttonText: `百鬼夜行-${calculateCost(seatCosts.onClickShikigamiFlood, false, false, currentTurnPlayer, 'onClickShikigamiFlood')}`, paragraph: '着手できる全ての空きマスに、ライフ0の式神を置きます', disabled: checkSkillDisable(seatCosts.onClickShikigamiFlood) || !currentBoard.some((sq) => !sq.player && !emptyBlocked(sq)) },
        { idx: 88, onClick: onClickShikigamiBless, buttonText: `式神の加護-${calculateCost(seatCosts.onClickShikigamiBless, false, false, currentTurnPlayer, 'onClickShikigamiBless')}`, paragraph: `自分の式神を1体選んで消費し、自陣のコマ全て（式神を除く）のライフ+${SHIKIGAMI_BLESS_LIFE}`, disabled: checkSkillDisable(seatCosts.onClickShikigamiBless) || ownShikigami().length === 0 || blessTargets().length === 0 },
        { idx: 89, onClick: onClickShikigamiCurse, buttonText: `式神の呪詛-${calculateCost(seatCosts.onClickShikigamiCurse, false, false, currentTurnPlayer, 'onClickShikigamiCurse')}`, paragraph: `自分の式神を1体選んで消費し、エフェクトが乗っている敵のコマ全てに☠を${SHIKIGAMI_CURSE_STACKS}つ（🔑ロック・⚡無敵は除く）`, disabled: checkSkillDisable(seatCosts.onClickShikigamiCurse) || ownShikigami().length === 0 || curseTargets().length === 0 },
        { idx: 90, onClick: onClickShikigamiDiscount, buttonText: `式神割引-${calculateCost(seatCosts.onClickShikigamiDiscount, false, false, currentTurnPlayer, 'onClickShikigamiDiscount')}`, paragraph: `次に打つスキルのコストを、${SHIKIGAMI_DISCOUNT_BASE}＋盤面にある式神の数だけ軽減します（現在-${SHIKIGAMI_DISCOUNT_BASE + currentBoard.filter((sq) => isShikigami(sq)).length}）`, disabled: checkSkillDisable(seatCosts.onClickShikigamiDiscount) },
        { idx: 91, onClick: onClickShikigamiPurge, buttonText: `式神の供犠-${calculateCost(seatCosts.onClickShikigamiPurge, false, false, currentTurnPlayer, 'onClickShikigamiPurge')}`, paragraph: `自陣の式神をランダムに1体壊し、敵のコマを1つ選んでライフを0にします（式神・🔑ロック・⚡無敵は除く）\n自陣の式神が${SHIKIGAMI_PURGE_FREE}体以上ならコスト0`, disabled: checkSkillDisable(seatCosts.onClickShikigamiPurge, false, false, 'onClickShikigamiPurge') || ownShikigami().length === 0 || purgeTargets().length === 0 },
        { idx: 74, onClick: onClickKimon, buttonText: `鬼門封じ-${calculateCost(seatCosts.onClickKimon, false, false, currentTurnPlayer, 'onClickKimon')}`, paragraph: `敵のコマを1つ選んで破壊します（氷結中のコマは❄が1つ減るだけ）。破壊して空きマスになったら、そのマスを3ターンロックします`, disabled: checkSkillDisable(seatCosts.onClickKimon) || kimonCandidates().length === 0 },
        { idx: 75, onClick: onClickFireWheel, buttonText: `火の車-${calculateCost(seatCosts.onClickFireWheel, false, false, currentTurnPlayer, 'onClickFireWheel')}`, paragraph: `ランダムな敵のコマ2つに🔥を1つずつ付け、その後自分の手札をシャッフルします。このターン敵か自陣に🔥を付与していれば、コスト0で使えます（使うとリセット）`, disabled: checkSkillDisable(seatCosts.onClickFireWheel, false, false, 'onClickFireWheel') || fireWheelTargets(currentBoard, currentTurnPlayer, fireWheelGuard).length === 0 },
        { idx: 97, onClick: onClickSpark, buttonText: `飛び火-${calculateCost(seatCosts.onClickSpark, false, false, currentTurnPlayer, 'onClickSpark')}`, paragraph: `ランダムな敵のコマ2つに🔥火炎を1つずつ付与します\n付与した瞬間に1ダメージ。🔑ロックと⚡無敵のコマは対象外です\n直前の手番に相手がコマを2つ以上設置していれば、各ターン1回まで無料です\n鍛冶師は🔥付与のスキルが-1`, disabled: checkSkillDisable(seatCosts.onClickSpark) || fireWheelTargets(currentBoard, currentTurnPlayer, fireWheelGuard).length === 0 },
        { idx: 98, onClick: onClickNightVeil, buttonText: `夜の帳-${calculateCost(seatCosts.onClickNightVeil, false, false, currentTurnPlayer, 'onClickNightVeil')}`, paragraph: `次の相手全員の手番の間、相手のスキルのコストを+3します（自分は影響を受けません）`, disabled: checkSkillDisable(seatCosts.onClickNightVeil) },
        { idx: 99, onClick: onClickGraveDiscount, buttonText: `弔い割引-${calculateCost(seatCosts.onClickGraveDiscount, false, false, currentTurnPlayer, 'onClickGraveDiscount')}`, paragraph: `墓地の死体の数（上限3）だけ、次に打つスキルのコストを軽減します（軽減後は最低1。この手番の間だけ有効。現在-${graveDiscountNow()}）\n死体は、ネクロマンサーなら自陣・敵陣を問わずコマが消えるたびに貯まります`, disabled: checkSkillDisable(seatCosts.onClickGraveDiscount) || graveDiscountNow() === 0 },
        { idx: 100, onClick: onClickPoisonWard, buttonText: `毒返しの構え-${calculateCost(seatCosts.onClickPoisonWard, false, false, currentTurnPlayer, 'onClickPoisonWard')}`, paragraph: `${POISON_WARD_TURNS}手番の間、相手の手番ごとに1度まで、自陣のコマが破壊または乗っ取られたら、ライフ4・☠付きの自陣コマをランダムな空きマスに置きます`, disabled: checkSkillDisable(seatCosts.onClickPoisonWard) || gearTurn.current.ward[turnSeat] > 0 },
        { idx: 101, onClick: onClickGraveOffering, buttonText: `墓守の供物-${calculateCost(seatCosts.onClickGraveOffering, false, false, currentTurnPlayer, 'onClickGraveOffering')}`, paragraph: `自陣のライフが最も低いコマを1つ消して、自分の墓地に死体を+1し、魔力を+1得ます\n墓地は全員が持ちますが、コマが消えるたびに自動で貯まるのはネクロマンサーだけです`, disabled: checkSkillDisable(seatCosts.onClickGraveOffering) || graveOfferingTarget(currentBoard, currentTurnPlayer) < 0 },
        { idx: 76, onClick: onClickStrip, buttonText: `裸の王様-${calculateCost(seatCosts.onClickStrip, false, false, currentTurnPlayer, 'onClickStrip')}`, paragraph: `相手全員のギアを、その相手の次の手番の終わりまで無効にします（ギアを装備している相手だけが対象）`, disabled: checkSkillDisable(seatCosts.onClickStrip) || stripTargets().length === 0 },
        { idx: 77, onClick: onClickChargeSeason, buttonText: `静電気の季節-${calculateCost(seatCosts.onClickChargeSeason, false, false, currentTurnPlayer, 'onClickChargeSeason')}`, paragraph: `今の手番を含む3ターンの間、自分が設置する駒（着手・トークン）に⚡を付けます（雷霆の巫以外は乗った時点でダメージ）\n自陣に⚡が1つもなければ、コスト-2`, disabled: checkSkillDisable(seatCosts.onClickChargeSeason, false, false, 'onClickChargeSeason') || chargeBuff[turnSeat] > 0 },
        { idx: 78, onClick: onClickBristle, buttonText: `総毛立つ-${calculateCost(seatCosts.onClickBristle, false, false, currentTurnPlayer, 'onClickBristle')}`, paragraph: `自陣のすべてのコマ（🔑ロック中を除く）に⚡を1つずつ付けます（雷霆の巫以外は乗った時点でダメージ）\nこのターンに⚡を付与するスキルを使っていれば、コスト-2`, disabled: checkSkillDisable(seatCosts.onClickBristle, false, false, 'onClickBristle') || bristleTargets().length === 0 },
        { idx: 79, onClick: onClickRelease, buttonText: `落雷は忘れた頃に-${calculateCost(seatCosts.onClickRelease, false, false, currentTurnPlayer, 'onClickRelease')}`, paragraph: `自陣の⚡をすべて取り除き、取り除いた数だけ敵の全コマにダメージを与えます（ロック・無敵・氷結中・ライフ0のコマには効きません）`, disabled: checkSkillDisable(seatCosts.onClickRelease) || ownChargeStacks() === 0 },
        { idx: 80, onClick: onClickStash, buttonText: `雷神のへそくり-${calculateCost(seatCosts.onClickStash, false, false, currentTurnPlayer, 'onClickStash')}`, paragraph: `⚡のある自陣のコマを1つ選んで⚡を全て取り除き、取り除いたスタック1つにつき、次に打つスキルのコストを-1します（軽減後は最低1。この手番の間だけ有効）`, disabled: checkSkillDisable(seatCosts.onClickStash) || stashTargets().length === 0 },
        { idx: 81, onClick: onClickThunderFire, buttonText: `雷のない所に火は立たぬ-${calculateCost(seatCosts.onClickThunderFire, false, false, currentTurnPlayer, 'onClickThunderFire')}`, paragraph: `⚡のあるコマ（自分の無敵マスも可。🔑ロック中と他人の無敵マスは不可）を1つ選んで破壊し、周囲8マスの敵コマのうち2つ〜全部をランダムに選んで🔥を1つずつ付けます（氷結中のコマは❄が1つ減るだけで、火は燃え移りません）`, disabled: checkSkillDisable(seatCosts.onClickThunderFire) || thunderFireTargets().length === 0 },
        { idx: 82, onClick: onClickDarkPot, buttonText: `一寸先は闇鍋-${calculateCost(seatCosts.onClickDarkPot, false, false, currentTurnPlayer, 'onClickDarkPot')}`, paragraph: `敵味方を問わず全コマ（🔑ロック・無敵は除く）に🔥❄⚡☠🌱🍂をランダムに付けます\n盤面のエフェクトの数だけコストが下がります（最低1）。1ターンに1度だけ使えます\n各エフェクトはコマごとに最大1で、複数の種類が同居します（🔥は❄🌱🍂と同居できず、出会うと半々で🔥が勝つか消えます）`, disabled: checkSkillDisable(seatCosts.onClickDarkPot, false, false, 'onClickDarkPot') || gearTurn.current.darkPotUsed[turnSeat] || !currentBoard.some((sq) => sq.player && !isGuarded(sq, characters)) },
        { idx: 83, onClick: onClickChargeHeal, buttonText: `雷を食らわば皿まで-${calculateCost(seatCosts.onClickChargeHeal, false, false, currentTurnPlayer, 'onClickChargeHeal')}`, paragraph: `⚡が効いている自陣のコマのライフを、⚡のスタック1つにつき+2します\nこのターンに付与した⚡の数だけコストが下がります（最低1。使うとリセット）`, disabled: checkSkillDisable(seatCosts.onClickChargeHeal, false, false, 'onClickChargeHeal') || chargeHealCells().length === 0 },
        { idx: 92, onClick: onClickSmallFry, buttonText: `一寸の虫に魂なし-${calculateCost(seatCosts.onClickSmallFry, false, false, currentTurnPlayer, 'onClickSmallFry')}`, paragraph: `敵のライフ3以下のコマを全て破壊します（氷結中は❄が1つ減るだけ・🔑ロックと無敵は除く）\n相手全員は次の手番の終わりまで、ライフ3以下のコマを置けません（トークン・式神などのスキルも含む）\n盤面のコマの数だけコストが下がります（最低1）`, disabled: checkSkillDisable(seatCosts.onClickSmallFry, false, false, 'onClickSmallFry') },
        { idx: 102, onClick: onClickPerfectGame, buttonText: `パーフェクトゲーム-${calculateCost(seatCosts.onClickPerfectGame, false, false, currentTurnPlayer, 'onClickPerfectGame')}`, paragraph: `盤面のコマを敵味方とも全て破壊します\n🔑ロック・⚡無敵のコマは壊れず、氷結中のコマは❄が1つ減るだけです`, disabled: checkSkillDisable(seatCosts.onClickPerfectGame, false, false, 'onClickPerfectGame') || !currentBoard.some((sq) => sq.player) },
        { idx: 103, onClick: onClickHelper, buttonText: `超助っ人-${calculateCost(seatCosts.onClickHelper, true, false, currentTurnPlayer, 'onClickHelper')}`, paragraph: `🔥❄⚡☠🌱🍂のうちランダムな1つを付けた、ライフ${calculateTokenBind()}の自陣コマをランダムに設置します\nトークンはターンに一度しか使用できません`, disabled: checkSkillDisable(seatCosts.onClickHelper, true, false, 'onClickHelper') },
        { idx: 113, onClick: onClickBoltSilence, buttonText: `沈黙は雷なり-${calculateCost(seatCosts.onClickBoltSilence, false, false, currentTurnPlayer, 'onClickBoltSilence')}`, paragraph: `⚡のある自陣のコマを選んで⚡を${BOLT_SILENCE_BOLTS}個取り除き（同じコマから2個でも可）、相手全員が次の手番、スキルを使えなくなります（自陣の⚡が合計${BOLT_SILENCE_BOLTS}個ないと使えません）`, disabled: checkSkillDisable(seatCosts.onClickBoltSilence, false, false, 'onClickBoltSilence') || !boltSilenceLegal() },
        { idx: 104, onClick: onClickSecondCatch, buttonText: `柳の下に二匹目がいた-${calculateCost(seatCosts.onClickSecondCatch, false, false, currentTurnPlayer, 'onClickSecondCatch')}`, paragraph: `自分のデッキから、基礎コスト${SECOND_CATCH_MAX_BASE}以下で今撃てるスキルをランダムに1つ、コストを払わず発動します\nこのターンに基礎コスト7以上のスキルを使っていれば、0コストで使えます`, disabled: checkSkillDisable(seatCosts.onClickSecondCatch, false, false, 'onClickSecondCatch') },
        // オブジェクトを壊す・強くするスキル(idx 114-119)
        // 鍵師向けの汎用スキル（#439, idx 130〜133）
        { idx: 130, onClick: onClickLockRaid, buttonText: `錠前荒らし-${calculateCost(seatCosts.onClickLockRaid, false, false, currentTurnPlayer, 'onClickLockRaid')}`, paragraph: `敵陣のロックを1つランダムに解除し、そのコマに🔥・☠・⚡のどれかをランダムに付与します（帯電中の雷霆の巫のコマには付きません）\n直前の相手ターンにロックが使われていたら0コストで使えます`, disabled: checkSkillDisable(seatCosts.onClickLockRaid, false, false, 'onClickLockRaid') || lockRaidCells(currentBoard, currentTurnPlayer).length === 0 },
        { idx: 131, onClick: onClickLockExtend, buttonText: `ロックの増築-${calculateCost(seatCosts.onClickLockExtend, false, false, currentTurnPlayer, 'onClickLockExtend')}`, paragraph: `自陣のコマに乗っているロックのスタックを全て+${LOCK_EXTEND_STACK}します\n（ロックの乗っていないコマには効きません）`, disabled: checkSkillDisable(seatCosts.onClickLockExtend, false, false, 'onClickLockExtend') || lockExtendCells(currentBoard, currentTurnPlayer).length === 0 },
        { idx: 132, onClick: onClickLockBlessing, buttonText: `施錠の加護-${calculateCost(seatCosts.onClickLockBlessing, false, false, currentTurnPlayer, 'onClickLockBlessing')}`, paragraph: `使った手番を含む自分の${BLESSING_TURNS}手番の間、設置したコマにロックが${BLESSING_STACK}スタック付きます\n（ロック中のコマは奪われません）`, disabled: checkSkillDisable(seatCosts.onClickLockBlessing, false, false, 'onClickLockBlessing') },
        { idx: 133, onClick: onClickVacantSeal, buttonText: `空き家封じ-${vacantSealCost()}`, paragraph: `空きマス全てを${VACANT_SEAL_STACK}スタックでロックします（ターンは続く）\n相手のリーチ1つにつきコスト-${VACANT_SEAL_REACH_CUT}（下限1）。鍵師は空きマスのロックを無視して置けます`, disabled: magic[turnSeat] < vacantSealCost() || vacantSealCells(currentBoard).length === 0 },
        ...OBJECT_SKILL_KEYS.map((skill) => ({
            idx: OBJECT_SKILLS[skill].idx,
            onClick: () => onClickObjectSkill(skill),
            buttonText: `${OBJECT_SKILLS[skill].name}-${calculateCost(seatCosts[OBJECT_SKILLS[skill].costKey], false, false, currentTurnPlayer, OBJECT_SKILLS[skill].costKey)}`,
            paragraph: `${OBJECT_SKILLS[skill].desc}${OBJECT_SKILLS[skill].target ? '\nマスを選んで使います' : ''}`,
            disabled: checkSkillDisable(seatCosts[OBJECT_SKILLS[skill].costKey], false, false, OBJECT_SKILLS[skill].costKey) || !objectSkillUsable(skill, currentBoard, currentTurnPlayer, characters),
        })),
        // オブジェクト(idx 105-109): 空きマスを選んで設置する。OBJECT_KINDS の順が idx の順（deck.ts の SKILL_CATALOG と同じ）
        ...OBJECT_KINDS.map((kind) => ({
            idx: OBJECT_DEFS[kind].idx,
            onClick: () => onClickObject(kind),
            buttonText: `${OBJECT_DEFS[kind].name}-${calculateCost(seatCosts[OBJECT_DEFS[kind].costKey], false, false, currentTurnPlayer, OBJECT_DEFS[kind].costKey)}`,
            paragraph: `空きマスを選んで${OBJECT_DEFS[kind].name}（ライフ${OBJECT_DEFS[kind].life}）を設置します\n${OBJECT_DEFS[kind].desc}\nオブジェクトは列に数えず、ライフは時間で減りません。自陣のオブジェクトはいつでも通常のコマで乗っ取れます`,
            disabled: checkSkillDisable(seatCosts[OBJECT_DEFS[kind].costKey], false, false, OBJECT_DEFS[kind].costKey) || objectLandableCells(currentBoard).length === 0,
        })),
        { idx: 93, onClick: onClickFirstFrost, buttonText: `初霜-${calculateCost(seatCosts.onClickFirstFrost, true, false, currentTurnPlayer, 'onClickFirstFrost')}`, paragraph: `敵の🍂があるコマを全て凍結し（🔑ロック・⚡無敵は除く）、自陣にバッズトークンを1つ置きます\nトークンはターンに一度だけ。盤面の🍂が3枚以上ならコスト0`, disabled: checkSkillDisable(seatCosts.onClickFirstFrost, true, false, 'onClickFirstFrost') || firstFrostTargets(currentBoard, currentTurnPlayer, characters).length === 0 },
        { idx: 94, onClick: onClickGather, buttonText: `吹き寄せ-${calculateCost(seatCosts.onClickGather, true, false, currentTurnPlayer, 'onClickGather')}`, paragraph: `自陣にトークンを1つ置き、盤面のエフェクトを全てそのマスに集めます（氷結のあるマスと⚡無敵のマスは動かさず、🔑と📜はその場に残ります。🔥は集め終えてから処理）\nエフェクト1つにつきコスト-2（氷結のマスは❄の数だけ・🔑自体は数えない。最低1）`, disabled: checkSkillDisable(seatCosts.onClickGather, true, false, 'onClickGather') || findEmptyIndexes(currentBoard).length === 0 },
        { idx: 95, onClick: onClickBurnOff, buttonText: `山焼き-${calculateCost(seatCosts.onClickBurnOff, true, false, currentTurnPlayer, 'onClickBurnOff')}`, paragraph: `敵のエフェクトがあるマス（氷結・⚡無敵のマスは除く）全てに🔥を1つ付け、自陣にロック付きトークンを1つ置きます\nエフェクト1つにつきコスト-3（氷結のマスは❄の数だけ・🔑自体は数えない。最低1）`, disabled: checkSkillDisable(seatCosts.onClickBurnOff, true, false, 'onClickBurnOff') },
        { idx: 96, onClick: onClickFreeToken, buttonText: `無礼講-${calculateCost(seatCosts.onClickFreeToken, false, false, currentTurnPlayer, 'onClickFreeToken')}`, paragraph: `このターン、トークン系スキルのコストを0にします（手番が終わると切れます）`, disabled: checkSkillDisable(seatCosts.onClickFreeToken) || gearTurn.current.tokenFree[turnSeat] },
        { idx: 84, onClick: onClickLeafDrop, buttonText: `落ち葉の置き土産-${calculateCost(seatCosts.onClickLeafDrop, false, false, currentTurnPlayer, 'onClickLeafDrop')}`, paragraph: `ランダムな敵のコマ1つに🍂を1つ付与します（🔑ロックと⚡無敵のコマは対象外）\n敵の🍂は、その持ち主以外のスキルコストを増やします`, disabled: checkSkillDisable(seatCosts.onClickLeafDrop, false, false) || leafDropCandidates().length === 0 },
        { idx: 85, onClick: onClickKindling, buttonText: `焚きつけ-${calculateCost(seatCosts.onClickKindling, false, false, currentTurnPlayer, 'onClickKindling')}`, paragraph: `敵の🍂と🌱を全て🔥に変換します（1つにつき🔥1つ。🔑ロックと⚡無敵のコマは対象外）\n氷結中のコマは🔥の代わりに❄が解除されます\n盤面の🍂1枚につき3・🌱1つにつき2だけコストが下がります（最低1）`, disabled: checkSkillDisable(seatCosts.onClickKindling, false, false, 'onClickKindling') || kindlingCandidates().length === 0 },
        { idx: 87, onClick: onClickTinder, buttonText: `火口-${calculateCost(seatCosts.onClickTinder, false, false, currentTurnPlayer, 'onClickTinder')}`, paragraph: `🌱バッズ・🍂・❄氷結のいずれかを持つ敵のコマを1つ選び、🔥火炎を1つ付与します（氷結中は氷結が解けます）\n付与した瞬間に1ダメージ。🔥は🌱・🍂を焼いて消します（🔑ロックと⚡無敵のコマは選べません）\n直前の手番に🌱か🍂が植えられていれば、各ターン1回まで無料です\n鍛冶師は🔥付与のスキルが-1`, disabled: checkSkillDisable(seatCosts.onClickTinder) || tinderCandidates().length === 0 },
        { idx: 86, onClick: onClickLeafCloak, buttonText: `落葉の衣-${calculateCost(seatCosts.onClickLeafCloak, false, false, currentTurnPlayer, 'onClickLeafCloak')}`, paragraph: `ランダムな自陣のコマ1つ（🔑ロック中も含む）に🍂を1つ付与します\n自陣の🍂は、相手全員のスキルコストを🍂の数だけ増やします`, disabled: checkSkillDisable(seatCosts.onClickLeafCloak) || leafCloakCandidates().length === 0 },
    ];

    // スキルカードの定義。キャラ固有・基本のカード（固定の並び）に、手札のシャッフル対象（shuffleSkillDefs）が続く
    const fixedSkillCards: Omit<SkillCardDef, 'key'>[] = [
        {
            onClick: onClickCharge,
            buttonText: `チャージ+${charge}`,
            paragraph: `ターンを終了し、マジックを+${charge}します`,
        },
        {
            onClick: onClickShuffle,
            buttonText: `シャッフル-${shuffleCost}`,
            paragraph: '固定でないスキルをシャッフルします',
            disabled: magic[turnSeat] < shuffleCost,
        },
        {
            onClick: onClickUseLock,
            hidden: currentCharacter === 'cryomancer',
            buttonText: `ロック-${calculateCost(seatCosts.onClickUseLock, false, false, currentTurnPlayer, 'onClickUseLock')}`,
            paragraph: `選択したマスを${gearLockStack(turnGears)}ターン以上ロックします`,
            disabled: checkSkillDisable(seatCosts.onClickUseLock),
        },
        {
            onClick: onClickCryoFreeze,
            buttonText: `氷結-${calculateCost(seatCosts.onClickCryoFreeze, false, false, currentTurnPlayer, 'onClickCryoFreeze')}`,
            paragraph: 'マスを1つ選び、❄氷結を付与します（空きマスも可）\n氷結中の空きマスには誰も着手できません。氷結したコマはターン進行でライフが減らず、スキルのダメージを❄1つで肩代わりしますが、自分も重ねて強化できません',
            hidden: currentCharacter !== 'cryomancer',
            disabled: checkSkillDisable(seatCosts.onClickCryoFreeze),
        },
        {
            onClick: onClickTotalAssault,
            buttonText: `全軍突撃-${totalAssaultCost}`,
            paragraph: '3ターンの間、ターン終了時にランダムにトークンを設置します コストは使用したトークンの回数×2軽減されます(使用後はカウントがリセットされます)',
            hidden: currentCharacter !== 'tactician',
            exclusive: true,
            disabled: magic[turnSeat] < totalAssaultCost,
        },
        {
            onClick: onClickStomp,
            buttonText: `ストンプ-${gearCost(seatCosts.onClickStomp, turnSeat, false, 'onClickStomp')}`,
            paragraph: 'クリックしたセルと周囲1マスを破壊します',
            hidden: currentCharacter !== 'giant',
            exclusive: true,
            disabled: checkSkillDisable(seatCosts.onClickStomp),
        },
        {
            onClick: onClickJudgeDay,
            buttonText: `審判の日-${judgeDayCost}`,
            paragraph: 'セルをクリックし、審判を下します コストは使用したスキルの回数軽減されます(使用後はカウントがリセットされます)',
            hidden: currentCharacter !== 'magician',
            exclusive: true,
            disabled: magic[turnSeat] < judgeDayCost,
        },
        {
            onClick: onClickToggleYingYang,
            buttonText: `陰陽転化-${gearCost(seatCosts.onClickToggleYingYang, turnSeat, false, 'onClickToggleYingYang')}`,
            paragraph: `陰陽のモードを切り替えます 現在のモード:${yinYangModeName(turnSeat)}`,
            hidden: currentCharacter !== 'yinYangMaster',
            exclusive: true,
            disabled: checkSkillDisable(seatCosts.onClickToggleYingYang),
        },
        {
            onClick: onClickNecromancy,
            buttonText: `蘇生-${gearCost(currentNecroCost, turnSeat, false, 'onClickNecromancy')}${currentNecroRemain > 0 ? `(発動中:残${currentNecroRemain})` : ''}`,
            paragraph: `発動時に墓地の死体数だけ(最大${necromancySummonCap})ライフ${necromancyReviveLife}のコマを召喚し、${necromancyDuration}ターンの間ライフ0の敵コマを自動吸収します 墓地は盤上でコマが奪われる/消えるたびに貯まり、コスト軽減と召喚数になります(使用後リセット)`,
            hidden: currentCharacter !== 'necromancer',
            exclusive: true,
            disabled: checkSkillDisable(currentNecroCost) || placeBlocked(lifeBan[turnSeat], 'onClickNecromancy', calculateTokenBind()),
        },
        {
            onClick: onClickMiasma,
            buttonText: `ミアズマ-${miasmaCost()}`,
            paragraph: '自陣の毒が乗っているマスの周囲1マスの敵コマに毒を付与します（毒マスが重なると積み上がります） 自陣の毒はすべて消えます コストは自陣の毒の数だけ軽減されます',
            hidden: currentCharacter !== 'poisoner',
            exclusive: true,
            disabled: magic[turnSeat] < miasmaCost() || miasmaPlan(currentBoard, currentTurnPlayer).size === 0,
        },
        {
            onClick: onClickChargeSpread,
            buttonText: `帯電拡散-${chargeSpreadCost()}`,
            paragraph: 'コマを選択し、そこからコマのあるマスだけを縦横に辿って届くすべてのコマ(敵味方問わず)に⚡を1つ付与します（雷霆の巫以外のコマは乗った時点で2ダメージ） コストは盤面の⚡の数だけ軽減されます',
            hidden: currentCharacter !== 'electrician',
            exclusive: true,
            disabled: magic[turnSeat] < chargeSpreadCost(),
        },
        {
            onClick: onClickGlacier,
            buttonText: `絶対零度-${glacierCost()}`,
            paragraph: `全てのマス（空きマス含む。🔑ロック中を除く）に❄を1つ足します\n次の自分の手番開始時に、他のプレイヤーの氷結マスへ❄1つにつき3ダメージを与えて氷結を解除し、ライフが0になったマスを破壊します\nコストは盤面の氷結マスの数だけ軽減されます（下限1）${glacierPending[turnSeat] ? '\n発動待ちです' : ''}`,
            hidden: currentCharacter !== 'cryomancer',
            exclusive: true,
            disabled: magic[turnSeat] < glacierCost() || glacierPending[turnSeat],
        },
        {
            onClick: onClickInferno,
            buttonText: `業火-${infernoCost()}`,
            paragraph: '敵のコマ全て(🔑ロック中・⚡無敵を除く)に🔥火炎を2つずつ付与します\n氷結中のマスは🔥の代わりに❄が全て解除されます。🔥が付いたマスの縦横隣の氷結は即座に解けます\n1手番に異なるスキルを3種類以上使うと、次の業火がコスト0になります（手番を跨いで持ち越し。同じスキルの連打は1種類と数えます。撃つとリセット）',
            hidden: currentCharacter !== 'pyromancer',
            exclusive: true,
            disabled: magic[turnSeat] < infernoCost() || infernoTargets(currentBoard, currentTurnPlayer, characters).length === 0,
        },
        {
            onClick: onClickMogaribue,
            buttonText: `虎落笛-${mogaribueCost()}`,
            paragraph: `自陣の🍂の枚数(${mogaribueDamage(currentBoard, currentTurnPlayer)})ぶん、敵のコマ全てにダメージを与えます(🔑ロック中・⚡無敵を除く。氷結中は❄が1つ減るだけ、🔥中は1.5倍)\n同時に自陣のコマ全てのライフが+${MOGARIBUE_LIFE}されます`,
            hidden: currentCharacter !== 'witch',
            exclusive: true,
            disabled: magic[turnSeat] < mogaribueCost() || !canMogaribue(currentBoard, currentTurnPlayer),
        },
        {
            onClick: onClickSeal,
            buttonText: `封鎖の断-${sealCost()}`,
            paragraph: `自陣のコマ全てを${SEAL_OWN_STACK}ターン、空きマス全てを${SEAL_EMPTY_STACK}ターンロックします（鍵師は空きマスのロックを無視して置けます）\n敵のコマのロックを全て解除し、解除した数（最低1）だけ敵のコマ全てにダメージを与えます（⚡無敵を除く。氷結中は❄が減るだけ）\n敵のロックの数だけコストが下がります（下限${SEAL_MIN_COST}）。使うとターン終了`,
            hidden: currentCharacter !== 'keysmith',
            exclusive: true,
            disabled: magic[turnSeat] < sealCost(),
        },
        {
            onClick: onClickIgnite,
            buttonText: `火遁-${calculateCost(seatCosts.onClickIgnite, false, false, currentTurnPlayer, 'onClickIgnite')}`,
            paragraph: 'マスを選択し、🔥火炎を1つ付与します（重複可）。空きマスにも置けます\n空きマスの🔥は、そこに置かれたコマ（誰のコマでも）に引き継がれます\n付与したマスと縦横隣の氷結は即座に解けます',
            hidden: currentCharacter !== 'pyromancer',
            exclusive: true,
            disabled: checkSkillDisable(seatCosts.onClickIgnite),
        },
        {
            onClick: onClickShikigamiPlace,
            buttonText: `式神設置-${gearCost(seatCosts.onClickShikigamiPlace, turnSeat, false, 'onClickShikigamiPlace')}`,
            paragraph: '任意の空きマスに式神（ライフ2の紙の分身）を置きます 式神は列の並びに数えません\n自分で補強すると🌱付きの自陣のコマになり、相手に乗っ取られると空きマスになります',
            hidden: currentCharacter !== 'yinYangMaster' || currentYinYangMode === 'yang',
            exclusive: true,
            disabled: checkSkillDisable(seatCosts.onClickShikigamiPlace) || findEmptyIndexes(currentBoard).length === 0 || placeBlocked(lifeBan[turnSeat], 'onClickShikigamiPlace', calculateTokenBind()),
        },
        {
            onClick: onClickShikigamiBlast,
            buttonText: `式神爆破-${gearCost(seatCosts.onClickShikigamiBlast, turnSeat, false, 'onClickShikigamiBlast')}`,
            paragraph: `自分の式神を1つ選んで爆破します 式神は消え、周囲8マスの敵のコマに${SHIKIGAMI_BLAST_DAMAGE}ダメージ（0になったコマは破壊）\n周囲の空きマスは自分の式神になります`,
            hidden: currentCharacter !== 'yinYangMaster' || currentYinYangMode !== 'yang',
            exclusive: true,
            disabled: checkSkillDisable(seatCosts.onClickShikigamiBlast) || ownShikigami().length === 0,
        },
    ];
    const skillCards: SkillCardDef[] = [
        ...fixedSkillCards.map((c, i) => ({ key: `fixed-${i}`, ...c })),
        ...shuffleSkillDefs.map((s): SkillCardDef => ({
            key: s.idx,
            onClick: s.onClick,
            buttonText: s.buttonText,
            paragraph: s.paragraph,
            disabled: s.disabled || placeBlocked(lifeBan[turnSeat], skillOf(s.idx)?.costKey, calculateTokenBind()),
            hidden: !skills.includes(s.idx) || (s.idx === 30 && currentCharacter === 'cryomancer'),
            locked: currentLockedSkills.includes(s.idx),
            onToggleLock: () => toggleLock(s.idx),
            onHoverStart: s.onHoverStart,
            onHoverEnd: s.onHoverEnd,
        })),
    ];

    return { shuffleSkillDefs, skillCards };
};
