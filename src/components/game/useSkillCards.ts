// Game.tsx から切り出したハンドラ群: スキルカードの定義（手札のシャッフル対象と、キャラ固有・基本の固定カード）
// 本体は Game.tsx にあったものをそのまま移した。Game の変数は scope(g) で、あとで定義されるもの(calculateCost など)は late() 経由で受け取る
import { GearTurnState } from './gearTurn';
import { SkillCosts } from './skillCosts';
import { CustomSkillSpec } from './customSkill';
import { CUSTOM_SKILL_IDX } from './deck';
import { canCastCustom, describeCustom } from './customSkill';
import { lockConvertCells, lockedSquareCount } from './keysmith';
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
import { BURNOUT_FREE_FLAMES, burnoutTargets, totalFlames, isFrozen, emptyBlocked, randomFreezeCandidates, frostfallTargets, budStacks, sowCandidates, infernoTargets, canFreeze, bonfireTargets, mulchCandidates, autumnTargets, leafFrostTargets, thawTargets, fireWheelTargets, mogaribueDamage, canMogaribue, MOGARIBUE_LIFE, GLACIER_DAMAGE_PER_STACK } from './thermal';
import { GearId, gearLockStack, gearTokenBindDelta } from './gear';
import { SkillCardDef } from './SkillPanel';
import { BoardGeometry } from './boardGeometry';

import { BasicSkillsResult } from './useBasicSkills';
import { BlastSkillsResult } from './useBlastSkills';
import { ShikigamiSkillsResult } from './useShikigamiSkills';
import { NecroSkillsResult } from './useNecroSkills';
import { GenericSkillsResult } from './useGenericSkills';
import { ElementSkillsResult } from './useElementSkills';
import { FrostLockSkillsResult } from './useFrostLockSkills';import { GameLate } from './gameLate';

export interface SkillCardsScope {
    onClickLockDiscount: () => void;
    onClickLockConvert: () => void;
    onClickCustom: () => void;
    customHasPoison: boolean;
    customCost: () => number;
    customBase: number;
    customSpec: CustomSkillSpec | undefined;
    /** スキルのハンドラ群（各 use*Skills の戻り値をまとめたもの） */
    handlers: BasicSkillsResult & BlastSkillsResult & ShikigamiSkillsResult & NecroSkillsResult & GenericSkillsResult & ElementSkillsResult & FrostLockSkillsResult;
    calculateCost: (cost: number, isToken?: boolean, isPoison?: boolean, player?: "💙" | "⭕" | "🟩" | "🔶" | "⭐" | "🟣" | "🟫" | "🩷", skillKey?: string | undefined) => number;
    seatCosts: SkillCosts;
    currentTurnPlayer: "💙" | "⭕" | "🟩" | "🔶" | "⭐" | "🟣" | "🟫" | "🩷";
    checkSkillDisable: (cost: number, isToken?: boolean, isPoison?: boolean, skillKey?: string | undefined) => boolean;
    geo: BoardGeometry;
    showPreview: (cells: number[]) => void;
    slashPreview: () => number[];
    clearPreview: () => void;
    backSlashPreview: () => number[];
    opiumPreview: () => number[];
    turnGears: GearId[];
    proliferateTokenLife: number;
    proliferateUpkeepStep: number;
    proliferateMaxStacks: number;
    proliferate: boolean[];
    turnSeat: number;
    magic: number[];
    currentBoard: SquareInfo[];
    otherSeats: (seat: number) => number[];
    silenced: boolean[];
    budGuard: boolean[];
    characters: CharacterId[];
    gearTurn: React.MutableRefObject<GearTurnState & { infernoReady: boolean[]; freeCast: boolean; processedTurn: number }>;
    chargeBuff: number[];
    currentCharacter: CharacterId;
    gearCost: (cost: number, seat?: number, isToken?: boolean, skillKey?: string | undefined, withLeaf?: boolean) => number;
    yinYangModeName: (seat: number) => "陽" | "陰";
    currentNecroCost: number;
    currentNecroRemain: number;
    lifeBan: boolean[];
    glacierPending: boolean[];
    currentYinYangMode: YingYangMode | undefined;
    skills: number[];
    currentLockedSkills: number[];
    toggleLock: (i: number) => void;
}
export const useSkillCards = (g: SkillCardsScope, late: () => GameLate) => {
    const { onClickAddLife, calculateCost, seatCosts, currentTurnPlayer, checkSkillDisable, onClickBibine, onClickBuds, onClickToken, calculateTokenBind, onClickBothToken, onClickSlash, geo, showPreview, slashPreview, clearPreview, onClickBackSlash, backSlashPreview, onClickTsunami, onClickOpium, opiumPreview, onClickBudsToken, onClickDoubleBuds, onClickDoubleToken, onClickUseDoubleLock, turnGears, onClickUseTripleLock, onClickWalpurgisNight, onClickInjection, onClickPoisonToken, onClickSerum, onClickIntensify, onClickPandemic, onClickProliferate, proliferateTokenLife, proliferateUpkeepStep, proliferateMaxStacks, proliferate, turnSeat, onClickChargeToken, onClickChargeOne, chargeOneCost, magic, onClickDoubleChargeToken, onClickChargeArea, onClickChargeRandom, onClickJammer, currentBoard, onClickHailMary, onClickSilence, otherSeats, silenced, onClickPoisonMist, onClickFreeze, onClickIgnite, onClickCleanse, ownAilmentCells, onClickHarvestEve, ownBudTotal, onClickSolstice, budGuard, onClickSucker, suckerSources, onClickWindborne, onClickFlameToken, onClickDoubleFlameToken, onClickSwidden, onClickSacrifice, sacrificeCandidates, onClickFrostArea, onClickIcicle, onClickRandomFreeze, onClickFreezeSpread, onClickFrostToken, onClickDoubleFrostToken, onClickShatter, onClickFrostfall, onClickBoost, onClickClone, cloneSources, onClickPlunder, characters, onClickDiscount, canUseDiscount, onClickRandomCast, onClickBurnout, burnoutCost, onClickLeafToken, onClickTwinLeafToken, onClickDoubleLeafToken, onClickLeafAll, leafAllCandidates, onClickBonfire, onClickMulch, onClickAutumn, onClickLeafFrost, notShielded, onClickSpringWind, onClickShikigamiAll, ownShikigami, onClickShikigamiRandom, onClickShikigamiFlood, onClickShikigamiBless, blessTargets, onClickShikigamiCurse, curseTargets, onClickShikigamiDiscount, onClickShikigamiPurge, purgeTargets, onClickKimon, kimonCandidates, onClickFireWheel, fireWheelGuard, onClickSpark, onClickNightVeil, onClickGraveDiscount, graveDiscountNow, onClickPoisonWard, gearTurn, onClickGraveOffering, onClickStrip, stripTargets, onClickChargeSeason, chargeBuff, onClickBristle, bristleTargets, onClickRelease, ownChargeStacks, onClickStash, stashTargets, onClickThunderFire, thunderFireTargets, onClickDarkPot, onClickChargeHeal, chargeHealCells, onClickSmallFry, onClickPerfectGame, onClickHelper, onClickBoltSilence, boltSilenceLegal, onClickSecondCatch, onClickLockRaid, onClickLockExtend, onClickLockBlessing, onClickVacantSeal, vacantSealCost, onClickObjectSkill, onClickObject, onClickFirstFrost, onClickGather, onClickBurnOff, onClickFreeToken, onClickLeafDrop, leafDropCandidates, onClickKindling, kindlingCandidates, onClickTinder, tinderCandidates, onClickLeafCloak, leafCloakCandidates, onClickCharge, charge, onClickShuffle, shuffleCost, onClickUseLock, currentCharacter, onClickCryoFreeze, onClickTotalAssault, totalAssaultCost, onClickStomp, gearCost, onClickJudgeDay, judgeDayCost, onClickToggleYingYang, yinYangModeName, onClickNecromancy, currentNecroCost, currentNecroRemain, necromancySummonCap, necromancyReviveLife, necromancyDuration, lifeBan, onClickMiasma, miasmaCost, miasmaPlan, onClickChargeSpread, chargeSpreadCost, onClickGlacier, glacierCost, glacierPending, onClickInferno, infernoCost, onClickMogaribue, mogaribueCost, onClickSeal, sealCost, onClickShikigamiPlace, currentYinYangMode, onClickShikigamiBlast, skills, currentLockedSkills, toggleLock, customSpec, customBase, customCost, customHasPoison, onClickCustom, onClickLockConvert, onClickLockDiscount } = { ...g, ...g.handlers };


    // シャッフル対象スキル(index 0-14)の定義。ロックトグル付きで .map() 描画する
    const shuffleSkillDefs: {
        idx: number;
        onClick: () => void;
        buttonText: string;
        disabled: boolean;
        onHoverStart?: () => void;
        onHoverEnd?: () => void;
    }[] = [
        { idx: 0, onClick: onClickAddLife, buttonText: `ライフ3-${calculateCost(seatCosts.onClickAddLife, false, false, currentTurnPlayer, 'onClickAddLife')}`, disabled: checkSkillDisable(seatCosts.onClickAddLife) },
        { idx: 1, onClick: onClickBibine, buttonText: `バイバイン-${calculateCost(seatCosts.onClickBibine, false, false, currentTurnPlayer, 'onClickBibine')}`, disabled: checkSkillDisable(seatCosts.onClickBibine) },
        { idx: 2, onClick: onClickBuds, buttonText: `バッズ-${calculateCost(seatCosts.onClickBuds, false, false, currentTurnPlayer, 'onClickBuds')}`, disabled: checkSkillDisable(seatCosts.onClickBuds) },
        { idx: 3, onClick: onClickToken, buttonText: `トークン-${calculateCost(seatCosts.onClickToken, true, false, currentTurnPlayer, 'onClickToken')}`, disabled: checkSkillDisable(seatCosts.onClickToken, true) },
        { idx: 4, onClick: onClickBothToken, buttonText: `両トークン-${calculateCost(seatCosts.onClickBothToken, true, false, currentTurnPlayer, 'onClickBothToken')}`, disabled: checkSkillDisable(seatCosts.onClickBothToken, true) },
        { idx: 5, onClick: onClickSlash, buttonText: `スラッシュ-${calculateCost(seatCosts.onClickSlash, false, false, currentTurnPlayer, 'onClickSlash')}`, disabled: checkSkillDisable(seatCosts.onClickSlash), onHoverStart: () => showPreview(slashPreview()), onHoverEnd: clearPreview },
        { idx: 6, onClick: onClickBackSlash, buttonText: `バックスラッシュ-${calculateCost(seatCosts.onClickBackSlash, false, false, currentTurnPlayer, 'onClickBackSlash')}`, disabled: checkSkillDisable(seatCosts.onClickBackSlash), onHoverStart: () => showPreview(backSlashPreview()), onHoverEnd: clearPreview },
        { idx: 7, onClick: onClickTsunami, buttonText: `チューチュートレイン-${calculateCost(seatCosts.onClickTsunami, false, false, currentTurnPlayer, 'onClickTsunami')}`, disabled: checkSkillDisable(seatCosts.onClickTsunami) },
        { idx: 8, onClick: onClickOpium, buttonText: `オピウム-${calculateCost(seatCosts.onClickOpium, false, false, currentTurnPlayer, 'onClickOpium')}`, disabled: checkSkillDisable(seatCosts.onClickOpium), onHoverStart: () => showPreview(opiumPreview()), onHoverEnd: clearPreview },
        { idx: 9, onClick: onClickBudsToken, buttonText: `バッズトークン-${calculateCost(seatCosts.onClickBudsToken, true, false, currentTurnPlayer, 'onClickBudsToken')}`, disabled: checkSkillDisable(seatCosts.onClickBudsToken, true) },
        { idx: 10, onClick: onClickDoubleBuds, buttonText: `ダブルバッズ-${calculateCost(seatCosts.onClickDoubleBuds, false, false, currentTurnPlayer, 'onClickDoubleBuds')}`, disabled: checkSkillDisable(seatCosts.onClickDoubleBuds) },
        { idx: 11, onClick: onClickDoubleToken, buttonText: `ダブルトークン-${calculateCost(seatCosts.onClickDoubleToken, true, false, currentTurnPlayer, 'onClickDoubleToken')}`, disabled: checkSkillDisable(seatCosts.onClickDoubleToken) },
        { idx: 12, onClick: onClickUseDoubleLock, buttonText: `ダブルロック-${calculateCost(seatCosts.onClickDoubleLock, false, false, currentTurnPlayer, 'onClickDoubleLock')}`, disabled: checkSkillDisable(seatCosts.onClickDoubleLock) },
        { idx: 13, onClick: onClickUseTripleLock, buttonText: `トリプルロック-${calculateCost(seatCosts.onClickTripleLock, false, false, currentTurnPlayer, 'onClickTripleLock')}`, disabled: checkSkillDisable(seatCosts.onClickTripleLock) },
        { idx: 14, onClick: onClickWalpurgisNight, buttonText: `ワルプルギスの夜-${calculateCost(seatCosts.onClickWalpurgisNight, false, false, currentTurnPlayer, 'onClickWalpurgisNight')}`, disabled: checkSkillDisable(seatCosts.onClickWalpurgisNight) },
        { idx: 15, onClick: onClickInjection, buttonText: `インジェクション-${calculateCost(seatCosts.onClickInjection, false, true, currentTurnPlayer, 'onClickInjection')}`, disabled: checkSkillDisable(seatCosts.onClickInjection, false, true) },
        { idx: 16, onClick: onClickPoisonToken, buttonText: `ポイズントークン-${calculateCost(seatCosts.onClickPoisonToken, true, true, currentTurnPlayer, 'onClickPoisonToken')}`, disabled: checkSkillDisable(seatCosts.onClickPoisonToken, true, true) },
        { idx: 17, onClick: onClickSerum, buttonText: `血清-${calculateCost(seatCosts.onClickSerum, false, true, currentTurnPlayer, 'onClickSerum')}`, disabled: checkSkillDisable(seatCosts.onClickSerum, false, true) },
        { idx: 18, onClick: onClickIntensify, buttonText: `猛毒化-${calculateCost(seatCosts.onClickIntensify, false, true, currentTurnPlayer, 'onClickIntensify')}`, disabled: checkSkillDisable(seatCosts.onClickIntensify, false, true) },
        { idx: 19, onClick: onClickPandemic, buttonText: `パンデミック-${calculateCost(seatCosts.onClickPandemic, false, true, currentTurnPlayer, 'onClickPandemic')}`, disabled: checkSkillDisable(seatCosts.onClickPandemic, false, true) },
        {
            idx: 20,
            onClick: onClickProliferate,
            buttonText: `増殖-${calculateCost(seatCosts.onClickProliferate, false, false, currentTurnPlayer, 'onClickProliferate')}`,
            disabled: checkSkillDisable(seatCosts.onClickProliferate) || proliferate[turnSeat],
        },
        { idx: 21, onClick: onClickChargeToken, buttonText: `帯電トークン-${calculateCost(seatCosts.onClickChargeToken, true, false, currentTurnPlayer, 'onClickChargeToken')}`, disabled: checkSkillDisable(seatCosts.onClickChargeToken, true) },
        { idx: 22, onClick: onClickChargeOne, buttonText: `帯電付与-${chargeOneCost()}`, disabled: magic[turnSeat] < chargeOneCost() },
        { idx: 23, onClick: onClickDoubleChargeToken, buttonText: `帯電ダブルトークン-${calculateCost(seatCosts.onClickDoubleChargeToken, true, false, currentTurnPlayer, 'onClickDoubleChargeToken')}`, disabled: checkSkillDisable(seatCosts.onClickDoubleChargeToken, true) },
        { idx: 24, onClick: onClickChargeArea, buttonText: `範囲帯電-${calculateCost(seatCosts.onClickChargeArea, false, false, currentTurnPlayer, 'onClickChargeArea')}`, disabled: checkSkillDisable(seatCosts.onClickChargeArea) },
        { idx: 25, onClick: onClickChargeRandom, buttonText: `ランダム帯電-${calculateCost(seatCosts.onClickChargeRandom, false, false, currentTurnPlayer, 'onClickChargeRandom')}`, disabled: checkSkillDisable(seatCosts.onClickChargeRandom) },
        { idx: 26, onClick: onClickJammer, buttonText: `ジャマー-${calculateCost(seatCosts.onClickJammer, false, false, currentTurnPlayer, 'onClickJammer')}`, disabled: checkSkillDisable(seatCosts.onClickJammer) || boardChargeCount(currentBoard) === 0 },
        { idx: 27, onClick: onClickHailMary, buttonText: `ヘイルメアリー-${calculateCost(seatCosts.onClickHailMary, false, false, currentTurnPlayer, 'onClickHailMary')}`, disabled: checkSkillDisable(seatCosts.onClickHailMary) },
        { idx: 28, onClick: onClickSilence, buttonText: `サイレンス-${calculateCost(seatCosts.onClickSilence, false, false, currentTurnPlayer, 'onClickSilence')}`, disabled: checkSkillDisable(seatCosts.onClickSilence) || otherSeats(turnSeat).every((seat) => silenced[seat]) },
        { idx: 29, onClick: onClickPoisonMist, buttonText: `毒霧-${calculateCost(seatCosts.onClickPoisonMist, false, true, currentTurnPlayer, 'onClickPoisonMist')}`, disabled: checkSkillDisable(seatCosts.onClickPoisonMist, false, true) || !currentBoard.some((sq) => sq.player) },
        { idx: 30, onClick: onClickFreeze, buttonText: `氷結-${calculateCost(seatCosts.onClickFreeze, false, false, currentTurnPlayer, 'onClickFreeze')}`, disabled: checkSkillDisable(seatCosts.onClickFreeze) || !currentBoard.some(canFreeze) },
        { idx: 31, onClick: onClickIgnite, buttonText: `火遁-${calculateCost(seatCosts.onClickIgnite, false, false, currentTurnPlayer, 'onClickIgnite')}`, disabled: checkSkillDisable(seatCosts.onClickIgnite) },
        { idx: 32, onClick: onClickCleanse, buttonText: `浄化-${calculateCost(seatCosts.onClickCleanse, false, false, currentTurnPlayer, 'onClickCleanse')}`, disabled: checkSkillDisable(seatCosts.onClickCleanse) || ownAilmentCells().length === 0 },
        { idx: 33, onClick: onClickHarvestEve, buttonText: `刈り入れ前夜-${calculateCost(seatCosts.onClickHarvestEve, false, false, currentTurnPlayer, 'onClickHarvestEve')}`, disabled: checkSkillDisable(seatCosts.onClickHarvestEve) || ownBudTotal() === 0 },
        { idx: 34, onClick: onClickSolstice, buttonText: `冬至の種子-${calculateCost(seatCosts.onClickSolstice, false, false, currentTurnPlayer, 'onClickSolstice')}`, disabled: checkSkillDisable(seatCosts.onClickSolstice) || budGuard[turnSeat] },
        { idx: 35, onClick: onClickSucker, buttonText: `ひこばえ-${calculateCost(seatCosts.onClickSucker, false, false, currentTurnPlayer, 'onClickSucker')}`, disabled: checkSkillDisable(seatCosts.onClickSucker) || suckerSources().length === 0 },
        { idx: 36, onClick: onClickWindborne, buttonText: `風の落とし子-${calculateCost(seatCosts.onClickWindborne, false, false, currentTurnPlayer, 'onClickWindborne')}`, disabled: checkSkillDisable(seatCosts.onClickWindborne) || sowCandidates(currentBoard, currentTurnPlayer).length === 0 },
        { idx: 37, onClick: onClickFlameToken, buttonText: `火炎トークン-${calculateCost(seatCosts.onClickFlameToken, true, false, currentTurnPlayer, 'onClickFlameToken')}`, disabled: checkSkillDisable(seatCosts.onClickFlameToken, true) },
        { idx: 38, onClick: onClickDoubleFlameToken, buttonText: `火炎ダブルトークン-${calculateCost(seatCosts.onClickDoubleFlameToken, true, false, currentTurnPlayer, 'onClickDoubleFlameToken')}`, disabled: checkSkillDisable(seatCosts.onClickDoubleFlameToken, true) },
        { idx: 39, onClick: onClickSwidden, buttonText: `焼畑-${calculateCost(seatCosts.onClickSwidden, false, false, currentTurnPlayer, 'onClickSwidden')}`, disabled: checkSkillDisable(seatCosts.onClickSwidden) || !currentBoard.some((sq) => budStacks(sq) > 0) },
        { idx: 40, onClick: onClickSacrifice, buttonText: `殉火-${calculateCost(seatCosts.onClickSacrifice, false, false, currentTurnPlayer, 'onClickSacrifice')}`, disabled: checkSkillDisable(seatCosts.onClickSacrifice) || sacrificeCandidates().length === 0 },
        { idx: 41, onClick: onClickFrostArea, buttonText: `範囲氷結-${calculateCost(seatCosts.onClickFrostArea, false, false, currentTurnPlayer, 'onClickFrostArea')}`, disabled: checkSkillDisable(seatCosts.onClickFrostArea) },
        { idx: 42, onClick: onClickIcicle, buttonText: `氷柱-${calculateCost(seatCosts.onClickIcicle, false, false, currentTurnPlayer, 'onClickIcicle')}`, disabled: checkSkillDisable(seatCosts.onClickIcicle) },
        { idx: 43, onClick: onClickRandomFreeze, buttonText: `ランダム氷結-${calculateCost(seatCosts.onClickRandomFreeze, false, false, currentTurnPlayer, 'onClickRandomFreeze')}`, disabled: checkSkillDisable(seatCosts.onClickRandomFreeze) || randomFreezeCandidates(currentBoard).length === 0 },
        { idx: 44, onClick: onClickFreezeSpread, buttonText: `氷結拡散-${calculateCost(seatCosts.onClickFreezeSpread, false, false, currentTurnPlayer, 'onClickFreezeSpread')}`, disabled: checkSkillDisable(seatCosts.onClickFreezeSpread) || !currentBoard.some((sq) => sq.player) },
        { idx: 45, onClick: onClickFrostToken, buttonText: `氷結トークン-${calculateCost(seatCosts.onClickFrostToken, true, false, currentTurnPlayer, 'onClickFrostToken')}`, disabled: checkSkillDisable(seatCosts.onClickFrostToken, true) },
        { idx: 46, onClick: onClickDoubleFrostToken, buttonText: `氷結ダブルトークン-${calculateCost(seatCosts.onClickDoubleFrostToken, true, false, currentTurnPlayer, 'onClickDoubleFrostToken')}`, disabled: checkSkillDisable(seatCosts.onClickDoubleFrostToken, true) },
        { idx: 47, onClick: onClickShatter, buttonText: `砕氷-${calculateCost(seatCosts.onClickShatter, false, false, currentTurnPlayer, 'onClickShatter')}`, disabled: checkSkillDisable(seatCosts.onClickShatter) || !currentBoard.some((sq) => sq.player && isFrozen(sq)) },
        { idx: 48, onClick: onClickFrostfall, buttonText: `霜降り-${calculateCost(seatCosts.onClickFrostfall, false, false, currentTurnPlayer, 'onClickFrostfall')}`, disabled: checkSkillDisable(seatCosts.onClickFrostfall) || frostfallTargets(currentBoard, currentTurnPlayer).length === 0 },
        { idx: 49, onClick: onClickBoost, buttonText: `慈雨-${calculateCost(seatCosts.onClickBoost, false, false, currentTurnPlayer, 'onClickBoost')}`, disabled: checkSkillDisable(seatCosts.onClickBoost) || !currentBoard.some((sq) => sq.player === currentTurnPlayer) },
        { idx: 51, onClick: onClickClone, buttonText: `写し身-${calculateCost(seatCosts.onClickClone, false, false, currentTurnPlayer, 'onClickClone')}`, disabled: checkSkillDisable(seatCosts.onClickClone) || cloneSources().length === 0 },
        { idx: 52, onClick: onClickPlunder, buttonText: `追い剥ぎ-${calculateCost(seatCosts.onClickPlunder, false, false, currentTurnPlayer, 'onClickPlunder')}`, disabled: checkSkillDisable(seatCosts.onClickPlunder) || plunderTargets(currentBoard, currentTurnPlayer, characters).length === 0 },
        { idx: 53, onClick: () => onClickDiscount('onClickMarkdown'), buttonText: `特売-${calculateCost(seatCosts.onClickMarkdown, false, false, currentTurnPlayer, 'onClickMarkdown')}`, disabled: !canUseDiscount('onClickMarkdown') },
        { idx: 54, onClick: () => onClickDiscount('onClickEffectDiscount'), buttonText: `付与割引-${calculateCost(seatCosts.onClickEffectDiscount, false, false, currentTurnPlayer, 'onClickEffectDiscount')}`, disabled: !canUseDiscount('onClickEffectDiscount') },
        { idx: 55, onClick: () => onClickDiscount('onClickTokenDiscount'), buttonText: `トークン割引-${calculateCost(seatCosts.onClickTokenDiscount, false, false, currentTurnPlayer, 'onClickTokenDiscount')}`, disabled: !canUseDiscount('onClickTokenDiscount') },
        { idx: 56, onClick: () => onClickDiscount('onClickVitalMarkdown'), buttonText: `活力特売-${calculateCost(seatCosts.onClickVitalMarkdown, false, false, currentTurnPlayer, 'onClickVitalMarkdown')}`, disabled: !canUseDiscount('onClickVitalMarkdown') },
        { idx: 57, onClick: () => onClickDiscount('onClickUniqueDiscount'), buttonText: `固有割引-${calculateCost(seatCosts.onClickUniqueDiscount, false, false, currentTurnPlayer, 'onClickUniqueDiscount')}`, disabled: !canUseDiscount('onClickUniqueDiscount') },
        { idx: 58, onClick: () => onClickDiscount('onClickClearance'), buttonText: `大特価-${calculateCost(seatCosts.onClickClearance, false, false, currentTurnPlayer, 'onClickClearance')}`, disabled: !canUseDiscount('onClickClearance') },
        { idx: 59, onClick: onClickRandomCast, buttonText: `福引き-${calculateCost(seatCosts.onClickRandomCast, false, false, currentTurnPlayer, 'onClickRandomCast')}`, disabled: checkSkillDisable(seatCosts.onClickRandomCast) },
        { idx: 60, onClick: () => onClickDiscount('onClickCounterMarkdown'), buttonText: `返し特売-${calculateCost(seatCosts.onClickCounterMarkdown, false, false, currentTurnPlayer, 'onClickCounterMarkdown')}`, disabled: !canUseDiscount('onClickCounterMarkdown') },
        { idx: 61, onClick: onClickBurnout, buttonText: `バーンアウト-${burnoutCost()}`, disabled: magic[turnSeat] < burnoutCost() || burnoutTargets(currentBoard, characters).length === 0 },
        { idx: 62, onClick: onClickLeafToken, buttonText: `木枯らしの使い-${calculateCost(seatCosts.onClickLeafToken, true, false, currentTurnPlayer, 'onClickLeafToken')}`, disabled: checkSkillDisable(seatCosts.onClickLeafToken, true) },
        { idx: 63, onClick: onClickTwinLeafToken, buttonText: `落葉松の双子-${calculateCost(seatCosts.onClickTwinLeafToken, true, false, currentTurnPlayer, 'onClickTwinLeafToken')}`, disabled: checkSkillDisable(seatCosts.onClickTwinLeafToken, true) },
        { idx: 64, onClick: onClickDoubleLeafToken, buttonText: `紅葉狩り-${calculateCost(seatCosts.onClickDoubleLeafToken, true, false, currentTurnPlayer, 'onClickDoubleLeafToken')}`, disabled: checkSkillDisable(seatCosts.onClickDoubleLeafToken, true, false, 'onClickDoubleLeafToken') },
        { idx: 65, onClick: onClickLeafAll, buttonText: `枯野の相席-${calculateCost(seatCosts.onClickLeafAll, false, false, currentTurnPlayer, 'onClickLeafAll')}`, disabled: checkSkillDisable(seatCosts.onClickLeafAll) || leafAllCandidates().length === 0 },
        { idx: 66, onClick: onClickBonfire, buttonText: `焚き火の唄-${calculateCost(seatCosts.onClickBonfire, false, false, currentTurnPlayer, 'onClickBonfire')}`, disabled: checkSkillDisable(seatCosts.onClickBonfire) || bonfireTargets(currentBoard, currentTurnPlayer).length === 0 },
        { idx: 67, onClick: onClickMulch, buttonText: `腐葉土の目覚め-${calculateCost(seatCosts.onClickMulch, false, false, currentTurnPlayer, 'onClickMulch')}`, disabled: checkSkillDisable(seatCosts.onClickMulch) || mulchCandidates(currentBoard, currentTurnPlayer).length === 0 },
        { idx: 68, onClick: onClickAutumn, buttonText: `一葉知秋-${calculateCost(seatCosts.onClickAutumn, false, false, currentTurnPlayer, 'onClickAutumn')}`, disabled: checkSkillDisable(seatCosts.onClickAutumn) || autumnTargets(currentBoard).length === 0 },
        { idx: 69, onClick: onClickLeafFrost, buttonText: `霜枯れ-${calculateCost(seatCosts.onClickLeafFrost, false, false, currentTurnPlayer, 'onClickLeafFrost')}`, disabled: checkSkillDisable(seatCosts.onClickLeafFrost) || notShielded(leafFrostTargets(currentBoard, currentTurnPlayer)).length === 0 },
        { idx: 70, onClick: onClickSpringWind, buttonText: `春一番-${calculateCost(seatCosts.onClickSpringWind, false, false, currentTurnPlayer, 'onClickSpringWind')}`, disabled: checkSkillDisable(seatCosts.onClickSpringWind) || thawTargets(currentBoard, currentTurnPlayer).length === 0 },
        { idx: 71, onClick: onClickShikigamiAll, buttonText: `式神一括-${calculateCost(seatCosts.onClickShikigamiAll * Math.max(1, ownShikigami().length), false, false, currentTurnPlayer, 'onClickShikigamiAll')}`, disabled: ownShikigami().length === 0 || checkSkillDisable(seatCosts.onClickShikigamiAll * ownShikigami().length) },
        { idx: 72, onClick: onClickShikigamiRandom, buttonText: `式神ランダム設置-${calculateCost(seatCosts.onClickShikigamiRandom, true, false, currentTurnPlayer, 'onClickShikigamiRandom')}`, disabled: checkSkillDisable(seatCosts.onClickShikigamiRandom, true) },
        { idx: 73, onClick: onClickShikigamiFlood, buttonText: `百鬼夜行-${calculateCost(seatCosts.onClickShikigamiFlood, false, false, currentTurnPlayer, 'onClickShikigamiFlood')}`, disabled: checkSkillDisable(seatCosts.onClickShikigamiFlood) || !currentBoard.some((sq) => !sq.player && !emptyBlocked(sq)) },
        { idx: 88, onClick: onClickShikigamiBless, buttonText: `式神の加護-${calculateCost(seatCosts.onClickShikigamiBless, false, false, currentTurnPlayer, 'onClickShikigamiBless')}`, disabled: checkSkillDisable(seatCosts.onClickShikigamiBless) || ownShikigami().length === 0 || blessTargets().length === 0 },
        { idx: 89, onClick: onClickShikigamiCurse, buttonText: `式神の呪詛-${calculateCost(seatCosts.onClickShikigamiCurse, false, false, currentTurnPlayer, 'onClickShikigamiCurse')}`, disabled: checkSkillDisable(seatCosts.onClickShikigamiCurse) || ownShikigami().length === 0 || curseTargets().length === 0 },
        { idx: 90, onClick: onClickShikigamiDiscount, buttonText: `式神割引-${calculateCost(seatCosts.onClickShikigamiDiscount, false, false, currentTurnPlayer, 'onClickShikigamiDiscount')}`, disabled: checkSkillDisable(seatCosts.onClickShikigamiDiscount) },
        { idx: 91, onClick: onClickShikigamiPurge, buttonText: `式神の供犠-${calculateCost(seatCosts.onClickShikigamiPurge, false, false, currentTurnPlayer, 'onClickShikigamiPurge')}`, disabled: checkSkillDisable(seatCosts.onClickShikigamiPurge, false, false, 'onClickShikigamiPurge') || ownShikigami().length === 0 || purgeTargets().length === 0 },
        { idx: 74, onClick: onClickKimon, buttonText: `鬼門封じ-${calculateCost(seatCosts.onClickKimon, false, false, currentTurnPlayer, 'onClickKimon')}`, disabled: checkSkillDisable(seatCosts.onClickKimon) || kimonCandidates().length === 0 },
        { idx: 75, onClick: onClickFireWheel, buttonText: `火の車-${calculateCost(seatCosts.onClickFireWheel, false, false, currentTurnPlayer, 'onClickFireWheel')}`, disabled: checkSkillDisable(seatCosts.onClickFireWheel, false, false, 'onClickFireWheel') || fireWheelTargets(currentBoard, currentTurnPlayer, fireWheelGuard).length === 0 },
        { idx: 97, onClick: onClickSpark, buttonText: `飛び火-${calculateCost(seatCosts.onClickSpark, false, false, currentTurnPlayer, 'onClickSpark')}`, disabled: checkSkillDisable(seatCosts.onClickSpark) || fireWheelTargets(currentBoard, currentTurnPlayer, fireWheelGuard).length === 0 },
        { idx: 98, onClick: onClickNightVeil, buttonText: `夜の帳-${calculateCost(seatCosts.onClickNightVeil, false, false, currentTurnPlayer, 'onClickNightVeil')}`, disabled: checkSkillDisable(seatCosts.onClickNightVeil) },
        { idx: 99, onClick: onClickGraveDiscount, buttonText: `弔い割引-${calculateCost(seatCosts.onClickGraveDiscount, false, false, currentTurnPlayer, 'onClickGraveDiscount')}`, disabled: checkSkillDisable(seatCosts.onClickGraveDiscount) || graveDiscountNow() === 0 },
        { idx: 100, onClick: onClickPoisonWard, buttonText: `毒返しの構え-${calculateCost(seatCosts.onClickPoisonWard, false, false, currentTurnPlayer, 'onClickPoisonWard')}`, disabled: checkSkillDisable(seatCosts.onClickPoisonWard) || gearTurn.current.ward[turnSeat] > 0 },
        { idx: 101, onClick: onClickGraveOffering, buttonText: `墓守の供物-${calculateCost(seatCosts.onClickGraveOffering, false, false, currentTurnPlayer, 'onClickGraveOffering')}`, disabled: checkSkillDisable(seatCosts.onClickGraveOffering) || graveOfferingTarget(currentBoard, currentTurnPlayer) < 0 },
        { idx: 76, onClick: onClickStrip, buttonText: `裸の王様-${calculateCost(seatCosts.onClickStrip, false, false, currentTurnPlayer, 'onClickStrip')}`, disabled: checkSkillDisable(seatCosts.onClickStrip) || stripTargets().length === 0 },
        { idx: 77, onClick: onClickChargeSeason, buttonText: `静電気の季節-${calculateCost(seatCosts.onClickChargeSeason, false, false, currentTurnPlayer, 'onClickChargeSeason')}`, disabled: checkSkillDisable(seatCosts.onClickChargeSeason, false, false, 'onClickChargeSeason') || chargeBuff[turnSeat] > 0 },
        { idx: 78, onClick: onClickBristle, buttonText: `総毛立つ-${calculateCost(seatCosts.onClickBristle, false, false, currentTurnPlayer, 'onClickBristle')}`, disabled: checkSkillDisable(seatCosts.onClickBristle, false, false, 'onClickBristle') || bristleTargets().length === 0 },
        { idx: 79, onClick: onClickRelease, buttonText: `落雷は忘れた頃に-${calculateCost(seatCosts.onClickRelease, false, false, currentTurnPlayer, 'onClickRelease')}`, disabled: checkSkillDisable(seatCosts.onClickRelease) || ownChargeStacks() === 0 },
        { idx: 80, onClick: onClickStash, buttonText: `雷神のへそくり-${calculateCost(seatCosts.onClickStash, false, false, currentTurnPlayer, 'onClickStash')}`, disabled: checkSkillDisable(seatCosts.onClickStash) || stashTargets().length === 0 },
        { idx: 81, onClick: onClickThunderFire, buttonText: `雷のない所に火は立たぬ-${calculateCost(seatCosts.onClickThunderFire, false, false, currentTurnPlayer, 'onClickThunderFire')}`, disabled: checkSkillDisable(seatCosts.onClickThunderFire) || thunderFireTargets().length === 0 },
        { idx: 82, onClick: onClickDarkPot, buttonText: `一寸先は闇鍋-${calculateCost(seatCosts.onClickDarkPot, false, false, currentTurnPlayer, 'onClickDarkPot')}`, disabled: checkSkillDisable(seatCosts.onClickDarkPot, false, false, 'onClickDarkPot') || gearTurn.current.darkPotUsed[turnSeat] || !currentBoard.some((sq) => sq.player && !isGuarded(sq, characters)) },
        { idx: 83, onClick: onClickChargeHeal, buttonText: `雷を食らわば皿まで-${calculateCost(seatCosts.onClickChargeHeal, false, false, currentTurnPlayer, 'onClickChargeHeal')}`, disabled: checkSkillDisable(seatCosts.onClickChargeHeal, false, false, 'onClickChargeHeal') || chargeHealCells().length === 0 },
        { idx: 92, onClick: onClickSmallFry, buttonText: `一寸の虫に魂なし-${calculateCost(seatCosts.onClickSmallFry, false, false, currentTurnPlayer, 'onClickSmallFry')}`, disabled: checkSkillDisable(seatCosts.onClickSmallFry, false, false, 'onClickSmallFry') },
        { idx: 102, onClick: onClickPerfectGame, buttonText: `パーフェクトゲーム-${calculateCost(seatCosts.onClickPerfectGame, false, false, currentTurnPlayer, 'onClickPerfectGame')}`, disabled: checkSkillDisable(seatCosts.onClickPerfectGame, false, false, 'onClickPerfectGame') || !currentBoard.some((sq) => sq.player) },
        { idx: 103, onClick: onClickHelper, buttonText: `超助っ人-${calculateCost(seatCosts.onClickHelper, true, false, currentTurnPlayer, 'onClickHelper')}`, disabled: checkSkillDisable(seatCosts.onClickHelper, true, false, 'onClickHelper') },
        { idx: 113, onClick: onClickBoltSilence, buttonText: `沈黙は雷なり-${calculateCost(seatCosts.onClickBoltSilence, false, false, currentTurnPlayer, 'onClickBoltSilence')}`, disabled: checkSkillDisable(seatCosts.onClickBoltSilence, false, false, 'onClickBoltSilence') || !boltSilenceLegal() },
        { idx: 104, onClick: onClickSecondCatch, buttonText: `柳の下に二匹目がいた-${calculateCost(seatCosts.onClickSecondCatch, false, false, currentTurnPlayer, 'onClickSecondCatch')}`, disabled: checkSkillDisable(seatCosts.onClickSecondCatch, false, false, 'onClickSecondCatch') },
        // オブジェクトを壊す・強くするスキル(idx 114-119)
        // 鍵師向けの汎用スキル（#439, idx 130〜133）
        { idx: 130, onClick: onClickLockRaid, buttonText: `錠前荒らし-${calculateCost(seatCosts.onClickLockRaid, false, false, currentTurnPlayer, 'onClickLockRaid')}`, disabled: checkSkillDisable(seatCosts.onClickLockRaid, false, false, 'onClickLockRaid') || lockRaidCells(currentBoard, currentTurnPlayer).length === 0 },
        { idx: 131, onClick: onClickLockExtend, buttonText: `ロックの増築-${calculateCost(seatCosts.onClickLockExtend, false, false, currentTurnPlayer, 'onClickLockExtend')}`, disabled: checkSkillDisable(seatCosts.onClickLockExtend, false, false, 'onClickLockExtend') || lockExtendCells(currentBoard, currentTurnPlayer).length === 0 },
        { idx: 132, onClick: onClickLockBlessing, buttonText: `施錠の加護-${calculateCost(seatCosts.onClickLockBlessing, false, false, currentTurnPlayer, 'onClickLockBlessing')}`, disabled: checkSkillDisable(seatCosts.onClickLockBlessing, false, false, 'onClickLockBlessing') },
        { idx: 133, onClick: onClickVacantSeal, buttonText: `空き家封じ-${vacantSealCost()}`, disabled: magic[turnSeat] < vacantSealCost() || vacantSealCells(currentBoard).length === 0 },
        { idx: 134, onClick: onClickLockConvert, buttonText: `錠の転換-${calculateCost(seatCosts.onClickLockConvert, false, false, currentTurnPlayer, 'onClickLockConvert')}`, disabled: checkSkillDisable(seatCosts.onClickLockConvert, false, false, 'onClickLockConvert') || lockConvertCells(currentBoard).length === 0 },
        { idx: 135, onClick: onClickLockDiscount, buttonText: `錠前割引-${calculateCost(seatCosts.onClickLockDiscount, false, false, currentTurnPlayer, 'onClickLockDiscount')}`, disabled: checkSkillDisable(seatCosts.onClickLockDiscount, false, false, 'onClickLockDiscount') || lockedSquareCount(currentBoard) === 0 },
        ...OBJECT_SKILL_KEYS.map((skill) => ({
            idx: OBJECT_SKILLS[skill].idx,
            onClick: () => onClickObjectSkill(skill),
            buttonText: `${OBJECT_SKILLS[skill].name}-${calculateCost(seatCosts[OBJECT_SKILLS[skill].costKey], false, false, currentTurnPlayer, OBJECT_SKILLS[skill].costKey)}`,
            disabled: checkSkillDisable(seatCosts[OBJECT_SKILLS[skill].costKey], false, false, OBJECT_SKILLS[skill].costKey) || !objectSkillUsable(skill, currentBoard, currentTurnPlayer, characters),
        })),
        // オブジェクト(idx 105-109): 空きマスを選んで設置する。OBJECT_KINDS の順が idx の順（deck.ts の SKILL_CATALOG と同じ）
        ...OBJECT_KINDS.map((kind) => ({
            idx: OBJECT_DEFS[kind].idx,
            onClick: () => onClickObject(kind),
            buttonText: `${OBJECT_DEFS[kind].name}-${calculateCost(seatCosts[OBJECT_DEFS[kind].costKey], false, false, currentTurnPlayer, OBJECT_DEFS[kind].costKey)}`,
            disabled: checkSkillDisable(seatCosts[OBJECT_DEFS[kind].costKey], false, false, OBJECT_DEFS[kind].costKey) || objectLandableCells(currentBoard).length === 0,
        })),
        { idx: 93, onClick: onClickFirstFrost, buttonText: `初霜-${calculateCost(seatCosts.onClickFirstFrost, true, false, currentTurnPlayer, 'onClickFirstFrost')}`, disabled: checkSkillDisable(seatCosts.onClickFirstFrost, true, false, 'onClickFirstFrost') || firstFrostTargets(currentBoard, currentTurnPlayer, characters).length === 0 },
        { idx: 94, onClick: onClickGather, buttonText: `吹き寄せ-${calculateCost(seatCosts.onClickGather, true, false, currentTurnPlayer, 'onClickGather')}`, disabled: checkSkillDisable(seatCosts.onClickGather, true, false, 'onClickGather') || findEmptyIndexes(currentBoard).length === 0 },
        { idx: 95, onClick: onClickBurnOff, buttonText: `山焼き-${calculateCost(seatCosts.onClickBurnOff, true, false, currentTurnPlayer, 'onClickBurnOff')}`, disabled: checkSkillDisable(seatCosts.onClickBurnOff, true, false, 'onClickBurnOff') },
        { idx: 96, onClick: onClickFreeToken, buttonText: `無礼講-${calculateCost(seatCosts.onClickFreeToken, false, false, currentTurnPlayer, 'onClickFreeToken')}`, disabled: checkSkillDisable(seatCosts.onClickFreeToken) || gearTurn.current.tokenFree[turnSeat] },
        { idx: 84, onClick: onClickLeafDrop, buttonText: `落ち葉の置き土産-${calculateCost(seatCosts.onClickLeafDrop, false, false, currentTurnPlayer, 'onClickLeafDrop')}`, disabled: checkSkillDisable(seatCosts.onClickLeafDrop, false, false) || leafDropCandidates().length === 0 },
        { idx: 85, onClick: onClickKindling, buttonText: `焚きつけ-${calculateCost(seatCosts.onClickKindling, false, false, currentTurnPlayer, 'onClickKindling')}`, disabled: checkSkillDisable(seatCosts.onClickKindling, false, false, 'onClickKindling') || kindlingCandidates().length === 0 },
        { idx: 87, onClick: onClickTinder, buttonText: `火口-${calculateCost(seatCosts.onClickTinder, false, false, currentTurnPlayer, 'onClickTinder')}`, disabled: checkSkillDisable(seatCosts.onClickTinder) || tinderCandidates().length === 0 },
        { idx: 86, onClick: onClickLeafCloak, buttonText: `落葉の衣-${calculateCost(seatCosts.onClickLeafCloak, false, false, currentTurnPlayer, 'onClickLeafCloak')}`, disabled: checkSkillDisable(seatCosts.onClickLeafCloak) || leafCloakCandidates().length === 0 },
    ];

    // スキルカードの定義。キャラ固有・基本のカード（固定の並び）に、手札のシャッフル対象（shuffleSkillDefs）が続く
    const fixedSkillCards: Omit<SkillCardDef, 'key'>[] = [
        {
            onClick: onClickCharge,
            buttonText: `チャージ+${charge}`,
            paragraph: `ターンを終了し、マジック+${charge}`,
        },
        {
            onClick: onClickShuffle,
            buttonText: `シャッフル-${shuffleCost}`,
            paragraph: '固定でないスキルを引き直す',
            disabled: magic[turnSeat] < shuffleCost,
        },
        {
            onClick: onClickUseLock,
            hidden: currentCharacter === 'cryomancer',
            buttonText: `ロック-${calculateCost(seatCosts.onClickUseLock, false, false, currentTurnPlayer, 'onClickUseLock')}`,
            paragraph: 'マスを選んでロック',
            disabled: checkSkillDisable(seatCosts.onClickUseLock),
        },
        {
            onClick: onClickCryoFreeze,
            buttonText: `氷結-${calculateCost(seatCosts.onClickCryoFreeze, false, false, currentTurnPlayer, 'onClickCryoFreeze')}`,
            paragraph: 'マスを選んで❄を付与',
            hidden: currentCharacter !== 'cryomancer',
            disabled: checkSkillDisable(seatCosts.onClickCryoFreeze),
        },
        {
            onClick: onClickTotalAssault,
            buttonText: `全軍突撃-${totalAssaultCost}`,
            paragraph: '3ターンの間、ターン終了時にランダムにトークンを設置',
            hidden: currentCharacter !== 'tactician',
            exclusive: true,
            disabled: magic[turnSeat] < totalAssaultCost,
        },
        {
            onClick: onClickStomp,
            buttonText: `ストンプ-${gearCost(seatCosts.onClickStomp, turnSeat, false, 'onClickStomp')}`,
            paragraph: 'マスを選び、周囲1マスのコマを破壊',
            hidden: currentCharacter !== 'giant',
            exclusive: true,
            disabled: checkSkillDisable(seatCosts.onClickStomp),
        },
        {
            onClick: onClickJudgeDay,
            buttonText: `審判の日-${judgeDayCost}`,
            paragraph: 'マスを選び、周囲のコマを消滅',
            hidden: currentCharacter !== 'magician',
            exclusive: true,
            disabled: magic[turnSeat] < judgeDayCost,
        },
        {
            onClick: onClickToggleYingYang,
            buttonText: `陰陽転化-${gearCost(seatCosts.onClickToggleYingYang, turnSeat, false, 'onClickToggleYingYang')}`,
            paragraph: `陰陽のモードを切り替え 現在のモード:${yinYangModeName(turnSeat)}`,
            hidden: currentCharacter !== 'yinYangMaster',
            exclusive: true,
            disabled: checkSkillDisable(seatCosts.onClickToggleYingYang),
        },
        {
            onClick: onClickNecromancy,
            buttonText: `蘇生-${gearCost(currentNecroCost, turnSeat, false, 'onClickNecromancy')}${currentNecroRemain > 0 ? `(発動中:残${currentNecroRemain})` : ''}`,
            paragraph: `墓地の死体の数だけ（最大${necromancySummonCap}）ライフ${necromancyReviveLife}のコマを召喚し、${necromancyDuration}ターンの間ライフ0の敵コマを吸収`,
            hidden: currentCharacter !== 'necromancer',
            exclusive: true,
            disabled: checkSkillDisable(currentNecroCost) || placeBlocked(lifeBan[turnSeat], 'onClickNecromancy', calculateTokenBind()),
        },
        {
            onClick: onClickMiasma,
            buttonText: `ミアズマ-${miasmaCost()}`,
            paragraph: '自陣の毒の周囲1マスの敵コマに毒を付与し、自陣の毒を全て消費',
            hidden: currentCharacter !== 'poisoner',
            exclusive: true,
            disabled: magic[turnSeat] < miasmaCost() || miasmaPlan(currentBoard, currentTurnPlayer).size === 0,
        },
        {
            onClick: onClickChargeSpread,
            buttonText: `帯電拡散-${chargeSpreadCost()}`,
            paragraph: 'コマを選び、繋がる全てのコマに⚡を1つずつ付与',
            hidden: currentCharacter !== 'electrician',
            exclusive: true,
            disabled: magic[turnSeat] < chargeSpreadCost(),
        },
        {
            onClick: onClickGlacier,
            buttonText: `絶対零度-${glacierCost()}`,
            paragraph: `全てのマスに❄を1つ付与し、次の手番に敵の❄1つにつき${GLACIER_DAMAGE_PER_STACK}ダメージ`,
            hidden: currentCharacter !== 'cryomancer',
            exclusive: true,
            disabled: magic[turnSeat] < glacierCost() || glacierPending[turnSeat],
        },
        {
            onClick: onClickInferno,
            buttonText: `業火-${infernoCost()}`,
            paragraph: '敵のコマ全てに🔥を2つずつ付与',
            hidden: currentCharacter !== 'pyromancer',
            exclusive: true,
            disabled: magic[turnSeat] < infernoCost() || infernoTargets(currentBoard, currentTurnPlayer, characters).length === 0,
        },
        {
            onClick: onClickMogaribue,
            buttonText: `虎落笛-${mogaribueCost()}`,
            paragraph: `自陣の🍂1枚につき敵のコマ全てに1ダメージ、自陣のコマ全てのライフ+${MOGARIBUE_LIFE}`,
            hidden: currentCharacter !== 'witch',
            exclusive: true,
            disabled: magic[turnSeat] < mogaribueCost() || !canMogaribue(currentBoard, currentTurnPlayer),
        },
        {
            onClick: onClickSeal,
            buttonText: `封鎖の断-${sealCost()}`,
            paragraph: `自陣のコマ全てを${SEAL_OWN_STACK}ターン・空きマス全てを${SEAL_EMPTY_STACK}ターンロックし、解除した敵のロック1つにつき敵のコマ全てに1ダメージ`,
            hidden: currentCharacter !== 'keysmith',
            exclusive: true,
            disabled: magic[turnSeat] < sealCost(),
        },
        {
            onClick: onClickIgnite,
            buttonText: `火遁-${calculateCost(seatCosts.onClickIgnite, false, false, currentTurnPlayer, 'onClickIgnite')}`,
            paragraph: 'マスを選んで🔥を1つ付与',
            hidden: currentCharacter !== 'pyromancer',
            exclusive: true,
            disabled: checkSkillDisable(seatCosts.onClickIgnite),
        },
        {
            onClick: onClickShikigamiPlace,
            buttonText: `式神設置-${gearCost(seatCosts.onClickShikigamiPlace, turnSeat, false, 'onClickShikigamiPlace')}`,
            paragraph: `空きマスにライフ${SHIKIGAMI_LIFE}の式神を設置`,
            hidden: currentCharacter !== 'yinYangMaster' || currentYinYangMode === 'yang',
            exclusive: true,
            disabled: checkSkillDisable(seatCosts.onClickShikigamiPlace) || findEmptyIndexes(currentBoard).length === 0 || placeBlocked(lifeBan[turnSeat], 'onClickShikigamiPlace', calculateTokenBind()),
        },
        {
            onClick: onClickShikigamiBlast,
            buttonText: `式神爆破-${gearCost(seatCosts.onClickShikigamiBlast, turnSeat, false, 'onClickShikigamiBlast')}`,
            paragraph: `式神を1つ選んで爆破し、周囲8マスの敵のコマに${SHIKIGAMI_BLAST_DAMAGE}ダメージ`,
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
            paragraph: skillOf(s.idx)?.desc ?? '',
            disabled: s.disabled || placeBlocked(lifeBan[turnSeat], skillOf(s.idx)?.costKey, calculateTokenBind()),
            hidden: !skills.includes(s.idx) || (s.idx === 30 && currentCharacter === 'cryomancer'),
            locked: currentLockedSkills.includes(s.idx),
            onToggleLock: () => toggleLock(s.idx),
            onHoverStart: s.onHoverStart,
            onHoverEnd: s.onHoverEnd,
        })),
        // オリジナルスキル（手札に引いたときだけ出る）
        ...(customSpec
            ? [
                  {
                      key: CUSTOM_SKILL_IDX,
                      onClick: onClickCustom,
                      buttonText: `${customSpec.name}-${customCost()}`,
                      paragraph: describeCustom(customSpec),
                      disabled: checkSkillDisable(customBase, false, customHasPoison, 'onClickCustom') || !canCastCustom(currentBoard, customSpec, currentTurnPlayer, characters, stripTargets().length > 0),
                      hidden: !skills.includes(CUSTOM_SKILL_IDX),
                      locked: currentLockedSkills.includes(CUSTOM_SKILL_IDX),
                      onToggleLock: () => toggleLock(CUSTOM_SKILL_IDX),
                  } as SkillCardDef,
              ]
            : []),
    ];

    return { shuffleSkillDefs, skillCards };
};
