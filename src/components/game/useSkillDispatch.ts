// Game.tsx から切り出したハンドラ群: AI が選んだスキルキーから実行関数への対応表
// 本体は Game.tsx にあったものをそのまま移した。Game の変数は scope(g) で、あとで定義されるもの(calculateCost など)は late() 経由で受け取る
import React from 'react';
import AIPlayer from './AIPlayer';
import { CharacterId } from '../../types/Character';
import { SquareInfo } from '../../types/SquareInfo';
import { skillRestricted } from './objects';
import { placeBlocked } from './lifeBan';
import { DiscountKey, Discount } from './discount';
import { GameLate } from './gameLate';

export interface SkillDispatchScope {
    lifeBan: boolean[];
    turnSeat: number;
    calculateTokenBind: () => number;
    currentBoard: SquareInfo[];
    currentTurnPlayer: "💙" | "⭕" | "🟩" | "🔶" | "⭐" | "🟣" | "🟫" | "🩷";
    gearTurn: React.MutableRefObject<{ skills: number[]; echoReady: boolean[]; echoNext: boolean[]; kinds: Set<string>[]; infernoReady: boolean[]; discount: Discount[]; freeCast: boolean; oppSkilled: boolean[]; oppSkillPrev: boolean[]; shikiPlaced: boolean[]; plantPrev: boolean[]; plantBase: number[]; placedPrev: boolean[]; placeBase: number[]; fireBase: number[]; leafBase: number[]; darkPotUsed: boolean[]; tokenFree: boolean[]; pieceBase: number[]; turnSpent: number[]; oppBigSeen: boolean[]; oppBigPrev: boolean[]; marketUsed: number[]; bigCast: boolean[]; veil: boolean[]; veilNext: boolean[]; ward: number[]; wardFresh: boolean[]; lockSeen: boolean[]; lockPrev: boolean[]; blessing: number[]; blessingFresh: boolean[]; chargeBase: number[]; processedTurn: number; }>;
    placedThisTurn: number;
    exeHailMary: (forcedName?: string | undefined) => void;
    onClickToken: () => void;
    onClickDoubleToken: () => void;
    onClickBudsToken: () => void;
    onClickBothToken: () => void;
    onClickBuds: () => void;
    onClickDoubleBuds: () => void;
    onClickSlash: () => void;
    onClickBackSlash: () => void;
    onClickOpium: () => void;
    onClickCharge: () => void;
    onClickTsunami: () => void;
    onClickAddLife: () => void;
    onClickBibine: () => void;
    onClickWalpurgisNight: () => void;
    onClickTotalAssault: () => void;
    onClickNecromancy: () => void;
    currentCharacter: CharacterId;
    onClickCryoFreeze: () => void;
    onClickUseLock: () => void;
    onClickUseDoubleLock: () => void;
    onClickUseTripleLock: () => void;
    onClickStomp: () => void;
    onClickPlunder: () => void;
    onClickShatter: () => void;
    onClickJudgeDay: () => void;
    onClickProliferate: () => void;
    onClickSerum: () => void;
    onClickIntensify: () => void;
    onClickPandemic: () => void;
    onClickInjection: () => void;
    onClickMiasma: () => void;
    onClickChargeToken: () => void;
    onClickChargeOne: () => void;
    onClickChargeSpread: () => void;
    onClickSilence: () => void;
    onClickStrip: () => void;
    onClickChargeSeason: () => void;
    onClickBristle: () => void;
    onClickRelease: () => void;
    onClickStash: () => void;
    onClickBoltSilence: () => void;
    onClickThunderFire: () => void;
    onClickDarkPot: () => void;
    onClickChargeHeal: () => void;
    onClickSmallFry: () => void;
    onClickPerfectGame: () => void;
    onClickHelper: () => void;
    onClickSecondCatch: () => void;
    onClickFirstFrost: () => void;
    onClickGather: () => void;
    onClickBurnOff: () => void;
    onClickFreeToken: () => void;
    onClickLeafDrop: () => void;
    onClickKindling: () => void;
    onClickLeafCloak: () => void;
    onClickDoubleChargeToken: () => void;
    onClickChargeArea: () => void;
    onClickChargeRandom: () => void;
    onClickJammer: () => void;
    onClickPoisonMist: () => void;
    onClickGlacier: () => void;
    onClickCleanse: () => void;
    onClickHarvestEve: () => void;
    onClickSolstice: () => void;
    onClickSucker: () => void;
    onClickToggleYingYang: () => void;
    onClickShikigamiPlace: () => void;
    onClickShikigamiBlast: () => void;
    onClickShikigamiBless: () => void;
    onClickShikigamiCurse: () => void;
    onClickShikigamiPurge: () => void;
    onClickShikigamiDiscount: () => void;
    onClickShikigamiAll: () => void;
    onClickShikigamiRandom: () => void;
    onClickShikigamiFlood: () => void;
    onClickNightVeil: () => void;
    onClickGraveDiscount: () => void;
    onClickPoisonWard: () => void;
    onClickObjectSkill: (skill: "demolish" | "weather" | "levelAll" | "reinforce" | "expandAll" | "duplicate") => void;
    onClickObject: (kind: "bigTree" | "deadTree" | "spring" | "fort" | "thundercloud" | "market" | "sanctuary" | "poisonSwamp" | "workshop" | "barrierStone" | "amuletShrine" | "luckyCat" | "mudField" | "tongueKing" | "eightTrigrams" | "soloSign" | "oneWord" | "blindMonkey") => void;
    onClickLockRaid: () => void;
    onClickLockExtend: () => void;
    onClickLockBlessing: () => void;
    onClickVacantSeal: () => void;
    onClickGraveOffering: () => void;
    onClickWindborne: () => void;
    onClickFlameToken: () => void;
    onClickDoubleFlameToken: () => void;
    onClickSwidden: () => void;
    onClickSacrifice: () => void;
    onClickBoost: () => void;
    onClickRandomFreeze: () => void;
    onClickPoisonToken: () => void;
    onClickFrostToken: () => void;
    onClickDoubleFrostToken: () => void;
    onClickFrostfall: () => void;
    onClickIgnite: () => void;
    onClickTinder: () => void;
    onClickInferno: () => void;
    onClickMogaribue: () => void;
    onClickSeal: () => void;
    onClickRandomCast: () => void;
    onClickBurnout: () => void;
    onClickLeafToken: () => void;
    onClickTwinLeafToken: () => void;
    onClickDoubleLeafToken: () => void;
    onClickLeafAll: () => void;
    onClickBonfire: () => void;
    onClickMulch: () => void;
    onClickAutumn: () => void;
    onClickLeafFrost: () => void;
    onClickKimon: () => void;
    onClickFireWheel: () => void;
    onClickSpark: () => void;
    onClickShuffle: () => void;
    runAIMove: () => void;
    onClickDiscount: (key: "onClickMarkdown" | "onClickEffectDiscount" | "onClickTokenDiscount" | "onClickVitalMarkdown" | "onClickUniqueDiscount" | "onClickClearance" | "onClickCounterMarkdown") => void;
}
export const useSkillDispatch = (g: SkillDispatchScope, late: () => GameLate) => {
    const { lifeBan, turnSeat, calculateTokenBind, currentBoard, currentTurnPlayer, gearTurn, placedThisTurn, exeHailMary, onClickToken, onClickDoubleToken, onClickBudsToken, onClickBothToken, onClickBuds, onClickDoubleBuds, onClickSlash, onClickBackSlash, onClickOpium, onClickCharge, onClickTsunami, onClickAddLife, onClickBibine, onClickWalpurgisNight, onClickTotalAssault, onClickNecromancy, currentCharacter, onClickCryoFreeze, onClickUseLock, onClickUseDoubleLock, onClickUseTripleLock, onClickStomp, onClickPlunder, onClickShatter, onClickJudgeDay, onClickProliferate, onClickSerum, onClickIntensify, onClickPandemic, onClickInjection, onClickMiasma, onClickChargeToken, onClickChargeOne, onClickChargeSpread, onClickSilence, onClickStrip, onClickChargeSeason, onClickBristle, onClickRelease, onClickStash, onClickBoltSilence, onClickThunderFire, onClickDarkPot, onClickChargeHeal, onClickSmallFry, onClickPerfectGame, onClickHelper, onClickSecondCatch, onClickFirstFrost, onClickGather, onClickBurnOff, onClickFreeToken, onClickLeafDrop, onClickKindling, onClickLeafCloak, onClickDoubleChargeToken, onClickChargeArea, onClickChargeRandom, onClickJammer, onClickPoisonMist, onClickGlacier, onClickCleanse, onClickHarvestEve, onClickSolstice, onClickSucker, onClickToggleYingYang, onClickShikigamiPlace, onClickShikigamiBlast, onClickShikigamiBless, onClickShikigamiCurse, onClickShikigamiPurge, onClickShikigamiDiscount, onClickShikigamiAll, onClickShikigamiRandom, onClickShikigamiFlood, onClickNightVeil, onClickGraveDiscount, onClickPoisonWard, onClickObjectSkill, onClickObject, onClickLockRaid, onClickLockExtend, onClickLockBlessing, onClickVacantSeal, onClickGraveOffering, onClickWindborne, onClickFlameToken, onClickDoubleFlameToken, onClickSwidden, onClickSacrifice, onClickBoost, onClickRandomFreeze, onClickPoisonToken, onClickFrostToken, onClickDoubleFrostToken, onClickFrostfall, onClickIgnite, onClickTinder, onClickInferno, onClickMogaribue, onClickSeal, onClickRandomCast, onClickBurnout, onClickLeafToken, onClickTwinLeafToken, onClickDoubleLeafToken, onClickLeafAll, onClickBonfire, onClickMulch, onClickAutumn, onClickLeafFrost, onClickKimon, onClickFireWheel, onClickSpark, onClickShuffle, runAIMove, onClickDiscount } = g;

    const executeSkillForAI = (skill: string) => {
        if (placeBlocked(lifeBan[turnSeat], skill, calculateTokenBind())) return; // ライフ3以下のコマを置けない縛り
        if (skillRestricted({ board: currentBoard, actor: currentTurnPlayer, skillKey: skill, basic: ['onClickCharge', 'onClickShuffle', 'onClickUseLock'].includes(skill), skillsThisTurn: gearTurn.current.skills[turnSeat], placedThisTurn })) return; // 相手の一言居士・お一人様限りの札の縛り
        // ヘイルメアリーは 'onClickHailMary:当選スキル名' (AI が当選に合わせて対象を決めてある)
        if (skill.startsWith('onClickHailMary:')) {
            exeHailMary(skill.slice('onClickHailMary:'.length));
            return;
        }
        // スキルキー → 実行関数。AI の計画（AIPlayer）が返すキーと 1:1 で対応する
        const actions: Record<string, () => void> = {
            onClickToken: () => onClickToken(),
            onClickDoubleToken: () => onClickDoubleToken(),
            onClickBudsToken: () => onClickBudsToken(),
            onClickBothToken: () => onClickBothToken(),
            onClickBuds: () => onClickBuds(),
            onClickDoubleBuds: () => onClickDoubleBuds(),
            onClickSlash: () => onClickSlash(),
            onClickBackSlash: () => onClickBackSlash(),
            onClickOpium: () => onClickOpium(),
            onClickCharge: () => onClickCharge(),
            onClickTsunami: () => onClickTsunami(),
            onClickAddLife: () => onClickAddLife(),
            onClickBibine: () => onClickBibine(),
            onClickWalpurgisNight: () => onClickWalpurgisNight(),
            onClickTotalAssault: () => onClickTotalAssault(),
            onClickNecromancy: () => onClickNecromancy(),
            onClickUseLock: () => (currentCharacter === 'cryomancer' ? onClickCryoFreeze : onClickUseLock)(),
            onClickUseDoubleLock: () => onClickUseDoubleLock(),
            onClickUseTripleLock: () => onClickUseTripleLock(),
            onClickStomp: () => onClickStomp(),
            onClickPlunder: () => onClickPlunder(),
            onClickShatter: () => onClickShatter(),
            onClickJudgeDay: () => onClickJudgeDay(),
            onClickProliferate: () => onClickProliferate(),
            onClickSerum: () => onClickSerum(),
            onClickIntensify: () => onClickIntensify(),
            onClickPandemic: () => onClickPandemic(),
            onClickInjection: () => onClickInjection(),
            onClickMiasma: () => onClickMiasma(),
            onClickChargeToken: () => onClickChargeToken(),
            onClickChargeOne: () => onClickChargeOne(),
            onClickChargeSpread: () => onClickChargeSpread(),
            onClickSilence: () => onClickSilence(),
            onClickStrip: () => onClickStrip(),
            onClickChargeSeason: () => onClickChargeSeason(),
            onClickBristle: () => onClickBristle(),
            onClickRelease: () => onClickRelease(),
            onClickStash: () => onClickStash(),
            onClickBoltSilence: () => onClickBoltSilence(),
            onClickThunderFire: () => onClickThunderFire(),
            onClickDarkPot: () => onClickDarkPot(),
            onClickChargeHeal: () => onClickChargeHeal(),
            onClickSmallFry: () => onClickSmallFry(),
            onClickPerfectGame: () => onClickPerfectGame(),
            onClickHelper: () => onClickHelper(),
            onClickSecondCatch: () => onClickSecondCatch(),
            onClickFirstFrost: () => onClickFirstFrost(),
            onClickGather: () => onClickGather(),
            onClickBurnOff: () => onClickBurnOff(),
            onClickFreeToken: () => onClickFreeToken(),
            onClickLeafDrop: () => onClickLeafDrop(),
            onClickKindling: () => onClickKindling(),
            onClickLeafCloak: () => onClickLeafCloak(),
            onClickDoubleChargeToken: () => onClickDoubleChargeToken(),
            onClickChargeArea: () => onClickChargeArea(),
            onClickChargeRandom: () => onClickChargeRandom(),
            onClickJammer: () => onClickJammer(),
            onClickPoisonMist: () => onClickPoisonMist(),
            onClickGlacier: () => onClickGlacier(),
            onClickCleanse: () => onClickCleanse(),
            onClickHarvestEve: () => onClickHarvestEve(),
            onClickSolstice: () => onClickSolstice(),
            onClickSucker: () => onClickSucker(),
            onClickToggleYingYang: () => onClickToggleYingYang(),
            onClickShikigamiPlace: () => onClickShikigamiPlace(),
            onClickShikigamiBlast: () => onClickShikigamiBlast(),
            onClickShikigamiBless: () => onClickShikigamiBless(),
            onClickShikigamiCurse: () => onClickShikigamiCurse(),
            onClickShikigamiPurge: () => onClickShikigamiPurge(),
            onClickShikigamiDiscount: () => onClickShikigamiDiscount(),
            onClickShikigamiAll: () => onClickShikigamiAll(),
            onClickShikigamiRandom: () => onClickShikigamiRandom(),
            onClickShikigamiFlood: () => onClickShikigamiFlood(),
            onClickNightVeil: () => onClickNightVeil(),
            onClickGraveDiscount: () => onClickGraveDiscount(),
            onClickPoisonWard: () => onClickPoisonWard(),
            onClickDemolish: () => onClickObjectSkill('demolish'),
            onClickWeather: () => onClickObjectSkill('weather'),
            onClickLevelAll: () => onClickObjectSkill('levelAll'),
            onClickReinforce: () => onClickObjectSkill('reinforce'),
            onClickExpandAll: () => onClickObjectSkill('expandAll'),
            onClickDuplicate: () => onClickObjectSkill('duplicate'),
            onClickWorkshop: () => onClickObject('workshop'),
            onClickBarrierStone: () => onClickObject('barrierStone'),
            onClickAmuletShrine: () => onClickObject('amuletShrine'),
            onClickLuckyCat: () => onClickObject('luckyCat'),
            onClickMudField: () => onClickObject('mudField'),
            onClickTongueKing: () => onClickObject('tongueKing'),
            onClickEightTrigrams: () => onClickObject('eightTrigrams'),
            onClickSoloSign: () => onClickObject('soloSign'),
            onClickOneWord: () => onClickObject('oneWord'),
            onClickBlindMonkey: () => onClickObject('blindMonkey'),
            onClickLockRaid: () => onClickLockRaid(),
            onClickLockExtend: () => onClickLockExtend(),
            onClickLockBlessing: () => onClickLockBlessing(),
            onClickVacantSeal: () => onClickVacantSeal(),
            onClickMarket: () => onClickObject('market'),
            onClickSanctuary: () => onClickObject('sanctuary'),
            onClickPoisonSwamp: () => onClickObject('poisonSwamp'),
            onClickBigTree: () => onClickObject('bigTree'),
            onClickDeadTree: () => onClickObject('deadTree'),
            onClickSpring: () => onClickObject('spring'),
            onClickFort: () => onClickObject('fort'),
            onClickThundercloud: () => onClickObject('thundercloud'),
            onClickGraveOffering: () => onClickGraveOffering(),
            onClickWindborne: () => onClickWindborne(),
            onClickFlameToken: () => onClickFlameToken(),
            onClickDoubleFlameToken: () => onClickDoubleFlameToken(),
            onClickSwidden: () => onClickSwidden(),
            onClickSacrifice: () => onClickSacrifice(),
            onClickBoost: () => onClickBoost(),
            onClickRandomFreeze: () => onClickRandomFreeze(),
            onClickPoisonToken: () => onClickPoisonToken(),
            onClickFrostToken: () => onClickFrostToken(),
            onClickDoubleFrostToken: () => onClickDoubleFrostToken(),
            onClickFrostfall: () => onClickFrostfall(),
            onClickIgnite: () => onClickIgnite(),
            onClickTinder: () => onClickTinder(),
            onClickInferno: () => onClickInferno(),
            onClickMogaribue: () => onClickMogaribue(),
            onClickSeal: () => onClickSeal(),
            onClickRandomCast: () => onClickRandomCast(),
            onClickBurnout: () => onClickBurnout(),
            onClickLeafToken: () => onClickLeafToken(),
            onClickTwinLeafToken: () => onClickTwinLeafToken(),
            onClickDoubleLeafToken: () => onClickDoubleLeafToken(),
            onClickLeafAll: () => onClickLeafAll(),
            onClickBonfire: () => onClickBonfire(),
            onClickMulch: () => onClickMulch(),
            onClickAutumn: () => onClickAutumn(),
            onClickLeafFrost: () => onClickLeafFrost(),
            onClickKimon: () => onClickKimon(),
            onClickFireWheel: () => onClickFireWheel(),
            onClickSpark: () => onClickSpark(),
            onClickShuffle: () => onClickShuffle(),
            aiReplan: () => runAIMove(), // 引き直しのあと、新しい手札で計画し直す
            // 割引系は同じ onClickDiscount にキーを渡す
            ...Object.fromEntries((['onClickCounterMarkdown', 'onClickMarkdown', 'onClickEffectDiscount', 'onClickTokenDiscount', 'onClickVitalMarkdown', 'onClickUniqueDiscount', 'onClickClearance'] as DiscountKey[]).map(k => [k, () => onClickDiscount(k)])),
        };
        actions[skill]?.();
    };

    return { executeSkillForAI };
};
