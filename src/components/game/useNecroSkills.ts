// Game.tsx から切り出したスキルのハンドラ群: 蘇生・ヘイルメアリー・毒使いのスキル
// 本体は Game.tsx の同じ位置にあったものをそのまま移した。Game の変数は scope(g) で、あとで定義されるもの(calculateCost など)は late() 経由で受け取る
import React from 'react';
import { useState } from 'react';
import { CharacterId } from '../../types/Character';
import { Effect } from '../../types/Effect';
import { Player } from '../../types/Player';
import { SquareInfo } from '../../types/SquareInfo';
import { randomAnyPick, findEmptyIndexes, randomPick } from '../../util';
import { TokenKind, PutContext, PlacedToken } from './tokenPlace';
import { NECROMANCY } from './turn';
import { addPoison, clearOwnPoison, intensify as intensifyOf, miasma as miasmaOf, pandemicTargets, poisonMistTargets } from './poison';
import { SkillEffectType } from './BoardEffects';
import { isGuarded, addCharge } from './charge';
import { placeBlocked } from './lifeBan';
import { darkPotRolls } from './darkPot';
import { ignite, freeze, canFreeze } from './thermal';
import { useSeatArray } from './useSeatArray';
import { Discount } from './discount';
import { BoardGeometry } from './boardGeometry';
import { PlayEffectExtra } from './usePresentation';
import { GameLate } from './gameLate';

export interface NecroSkillsScope {
    seatCount: number;
    characters: CharacterId[];
    lifeBan: boolean[];
    turnSeat: number;
    calculateTokenBind: () => number;
    spendMagic: (cost: number, bumpCount?: boolean, isSkill?: boolean, skillId?: string) => void;
    gearCost: (cost: number, seat?: number, isToken?: boolean, skillKey?: string, withLeaf?: boolean) => number;
    currentBoard: SquareInfo[];
    currentTurnPlayer: "💙" | "⭕" | "🟩" | "🔶" | "⭐" | "🟣" | "🟫" | "🩷";
    setCurrentBoard: React.Dispatch<React.SetStateAction<SquareInfo[]>>;
    playEffect: (type: SkillEffectType, index?: number | undefined, indexes?: number[] | undefined, label?: string | undefined, extra?: PlayEffectExtra | undefined) => void;
    addLog: (message: string) => void;
    setUseAssaultAt: (seat: number, value: number | ((prev: number) => number)) => void;
    setUseTokenCountAt: (seat: number, value: number | ((prev: number) => number)) => void;
    setUseStomp: (on: boolean) => void;
    setUseJudgeDay: (on: boolean) => void;
    setUseShikigamiPlace: (on: boolean) => void;
    currentCharacter: CharacterId;
    seatCosts: { onClickToken: number; onClickTotalAssault: number; onClickToggleYingYang: number; onClickShikigamiPlace: number; onClickShikigamiBlast: number; onClickShikigamiAll: number; onClickShikigamiRandom: number; onClickShikigamiFlood: number; onClickShikigamiBless: number; onClickShikigamiPurge: number; onClickShikigamiCurse: number; onClickShikigamiDiscount: number; onClickStomp: number; onClickJudgeDay: number; onClickCharge: number; onClickAddLife: number; onClickDepressionCherry: number; onClickShuffle: number; onClickBibine: number; onClickUseLock: number; onClickDoubleLock: number; onClickTripleLock: number; onClickBuds: number; onClickDoubleBuds: number; onClickBudsToken: number; onClickBothToken: number; onClickDoubleToken: number; onClickSlash: number; onClickBackSlash: number; onClickTsunami: number; onClickOpium: number; onClickWalpurgisNight: number; onClickMiasma: number; onClickInjection: number; onClickPoisonToken: number; onClickSerum: number; onClickIntensify: number; onClickPandemic: number; onClickProliferate: number; onClickChargeToken: number; onClickChargeOne: number; onClickChargeSpread: number; onClickDoubleChargeToken: number; onClickChargeArea: number; onClickChargeRandom: number; onClickJammer: number; onClickHailMary: number; onClickSilence: number; onClickPoisonMist: number; onClickFreeze: number; onClickIgnite: number; onClickGlacier: number; onClickCryoFreeze: number; onClickCleanse: number; onClickInferno: number; onClickMogaribue: number; onClickSeal: number; onClickHarvestEve: number; onClickSolstice: number; onClickSucker: number; onClickWindborne: number; onClickFlameToken: number; onClickDoubleFlameToken: number; onClickSwidden: number; onClickSacrifice: number; onClickFrostArea: number; onClickIcicle: number; onClickRandomFreeze: number; onClickFreezeSpread: number; onClickFrostToken: number; onClickDoubleFrostToken: number; onClickShatter: number; onClickFrostfall: number; onClickBoost: number; onClickClone: number; onClickPlunder: number; onClickMarkdown: number; onClickEffectDiscount: number; onClickTokenDiscount: number; onClickVitalMarkdown: number; onClickUniqueDiscount: number; onClickClearance: number; onClickRandomCast: number; onClickCounterMarkdown: number; onClickBurnout: number; onClickLeafToken: number; onClickTwinLeafToken: number; onClickDoubleLeafToken: number; onClickLeafAll: number; onClickBonfire: number; onClickMulch: number; onClickAutumn: number; onClickLeafFrost: number; onClickSpringWind: number; onClickKimon: number; onClickFireWheel: number; onClickStrip: number; onClickChargeSeason: number; onClickBristle: number; onClickRelease: number; onClickStash: number; onClickThunderFire: number; onClickDarkPot: number; onClickChargeHeal: number; onClickLeafDrop: number; onClickKindling: number; onClickLeafCloak: number; onClickTinder: number; onClickSmallFry: number; onClickFirstFrost: number; onClickGather: number; onClickBurnOff: number; onClickFreeToken: number; onClickSpark: number; onClickNightVeil: number; onClickGraveDiscount: number; onClickPoisonWard: number; onClickGraveOffering: number; onClickPerfectGame: number; onClickHelper: number; onClickSecondCatch: number; onClickBigTree: number; onClickDeadTree: number; onClickSpring: number; onClickFort: number; onClickThundercloud: number; onClickMarket: number; onClickSanctuary: number; onClickPoisonSwamp: number; onClickBoltSilence: number; onClickDemolish: number; onClickWeather: number; onClickLevelAll: number; onClickReinforce: number; onClickExpandAll: number; onClickDuplicate: number; onClickWorkshop: number; onClickBarrierStone: number; onClickAmuletShrine: number; onClickLuckyCat: number; onClickMudField: number; onClickTongueKing: number; onClickEightTrigrams: number; onClickSoloSign: number; onClickOneWord: number; onClickBlindMonkey: number; onClickLockRaid: number; onClickLockExtend: number; onClickLockBlessing: number; onClickVacantSeal: number; };
    setHailMarySpin: React.Dispatch<React.SetStateAction<{ label: string; phase: 'intro' | 'spin' | 'reveal'; } | null>>;
    harvestMagic: (n: number) => void;
    toxicBloom: (board: SquareInfo[], cells: number[]) => void;
    flashCells: (indexes: number[]) => void;
    miasmaCost: (player?: Player) => number;
    setUseInjection: React.Dispatch<React.SetStateAction<number>>;
    useInjection: number;
    putTokens: (board: SquareInfo[], kind: TokenKind, n: number, extra?: Partial<PutContext>, afterPut?: ((board: SquareInfo[], idx: number) => void) | undefined) => { report: () => void; placed: PlacedToken[]; granted: number; };
    posName: (i: number) => string;
    setUseToken: React.Dispatch<React.SetStateAction<boolean>>;
    setUsePandemic: (on: boolean) => void;
    gearTurn: React.MutableRefObject<{ skills: number[]; echoReady: boolean[]; echoNext: boolean[]; kinds: Set<string>[]; infernoReady: boolean[]; discount: Discount[]; freeCast: boolean; oppSkilled: boolean[]; oppSkillPrev: boolean[]; shikiPlaced: boolean[]; plantPrev: boolean[]; plantBase: number[]; placedPrev: boolean[]; placeBase: number[]; fireBase: number[]; leafBase: number[]; darkPotUsed: boolean[]; tokenFree: boolean[]; pieceBase: number[]; turnSpent: number[]; oppBigSeen: boolean[]; oppBigPrev: boolean[]; marketUsed: number[]; bigCast: boolean[]; veil: boolean[]; veilNext: boolean[]; ward: number[]; wardFresh: boolean[]; lockSeen: boolean[]; lockPrev: boolean[]; blessing: number[]; blessingFresh: boolean[]; chargeBase: number[]; processedTurn: number; }>;
    geo: BoardGeometry;
    keepBuds: (sq: SquareInfo) => boolean;
    poisonStrike: (sq: SquareInfo) => SquareInfo;
    withOverload: (board: SquareInfo[]) => SquareInfo[];
}
export const useNecroSkills = (g: NecroSkillsScope, late: () => GameLate) => {
    const { seatCount, characters, lifeBan, turnSeat, calculateTokenBind, spendMagic, gearCost, currentBoard, currentTurnPlayer, setCurrentBoard, playEffect, addLog, setUseAssaultAt, setUseTokenCountAt, setUseStomp, setUseJudgeDay, setUseShikigamiPlace, currentCharacter, seatCosts, setHailMarySpin, harvestMagic, toxicBloom, flashCells, miasmaCost, setUseInjection, useInjection, putTokens, posName, setUseToken, setUsePandemic, gearTurn, geo, keepBuds, poisonStrike, withOverload } = g;


    const baseNecromancyCost = NECROMANCY.baseCost;
    const necromancyDuration = NECROMANCY.duration;
    const necromancyReviveLife = NECROMANCY.reviveLife;
    const necromancySummonCap = NECROMANCY.summonCap;
    const [necroCost, setNecroCostAt, setNecroCostAll] = useSeatArray<number>(() => Array(seatCount).fill(baseNecromancyCost));
    const [remainNecro, setRemainNecroAt, setRemainNecroAll] = useSeatArray<number>(() => Array(seatCount).fill(0));

    // 盤上で駒が消える/奪われるたびに「墓地」を貯める＝ネクロの蘇生コストを軽減（敵味方問わず）
    // 軽減量 (baseNecromancyCost - currentCost) がそのまま蘇生時の召喚数になる
    const addCorpses = (n: number) => {
        if (n <= 0) return;
        characters.forEach((c, seat) => {
            if (c === 'necromancer') setNecroCostAt(seat, (cost) => Math.max(0, cost - n));
        });
    };

    const onClickNecromancy = () => {
        if (placeBlocked(lifeBan[turnSeat], 'onClickNecromancy', calculateTokenBind())) return; // 一寸の虫に魂なし: ライフ2のコマを召喚できない
        const curCost = necroCost[turnSeat];
        summonCorpses(baseNecromancyCost - curCost);
        spendMagic(gearCost(curCost, turnSeat, false, 'onClickNecromancy'), true, true, 'onClickNecromancy');
        setRemainNecroAt(turnSeat, necromancyDuration);
        setNecroCostAt(turnSeat, baseNecromancyCost);
    };

    // 墓地の死体数ぶん（上限・空きマス数でクランプ）ライフ2のコマを召喚する。コスト支払いは呼び出し側
    const summonCorpses = (corpses: number) => {
        const board = currentBoard.slice();
        const empties = findEmptyIndexes(board);
        const summonCount = Math.min(corpses, necromancySummonCap, empties.length);
        const summonTargets = randomAnyPick(empties, summonCount);
        for (const idx of summonTargets) {
            board[idx] = { player: currentTurnPlayer, bind: necromancyReviveLife, effects: [] };
        }
        setCurrentBoard(board);
        playEffect('necromancy', undefined, summonTargets);
        addLog(`「蘇生」を使用（墓地から${summonCount}体召喚 / ${necromancyDuration}ターン吸収）`);
    };

    // ヘイルメアリー: 陰陽転化を除く固有スキルをランダムに1つ、追加コストなしで発動する
    const hailMaryChoices: { name: string; run: () => void }[] = [
        {
            name: '全軍突撃',
            run: () => {
                playEffect('assault');
                setUseAssaultAt(turnSeat, 3);
                setUseTokenCountAt(turnSeat, 0);
            },
        },
        { name: 'ストンプ', run: () => setUseStomp(true) },
        { name: '審判の日', run: () => setUseJudgeDay(true) },
        { name: '式神設置', run: () => setUseShikigamiPlace(true) },
        {
            name: '蘇生',
            run: () => {
                // 墓地は蘇生コストの軽減量として持つ（ネクロマンサー全員分のうち最大）。自分がネクロなら吸収と墓地リセットも行う
                summonCorpses(Math.max(...necroCost.map((c) => baseNecromancyCost - c)));
                if (currentCharacter === 'necromancer') {
                    setRemainNecroAt(turnSeat, necromancyDuration);
                    setNecroCostAt(turnSeat, baseNecromancyCost);
                }
            },
        },
        { name: 'ミアズマ', run: () => exeMiasma() },
        { name: '帯電拡散', run: () => late().setUseChargeSpread(true) },
    ];
    // ヘイルメアリーで引いたスキル名。マス選択型は演出より先に画面へ出すため、一定時間表示する
    const [hailMaryPick, setHailMaryPick] = useState<string | null>(null);
    const HAIL_MARY_INTRO_MS = 800;
    const HAIL_MARY_REVEAL_MS = 900;
    // forcedName: AI が事前に対象を決めた当選スキル。省略時はここでランダムに選ぶ
    const exeHailMary = (forcedName?: string) => {
        const picked = hailMaryChoices.find((c) => c.name === forcedName) ?? randomPick(hailMaryChoices);
        addLog(`「ヘイルメアリー」を使用 → 「${picked.name}」が発動`);
        spendMagic(late().calculateCost(seatCosts.onClickHailMary, false, false, currentTurnPlayer, 'onClickHailMary'), true, true, 'onClickHailMary');
        setHailMarySpin({ label: 'ヘイルメアリー！', phase: 'intro' });
        // 抽選中は表示を回し、終盤ほど間隔を空けて当選スキルで止める
        let at = HAIL_MARY_INTRO_MS;
        const ticks = 16;
        const start = Math.floor(Math.random() * hailMaryChoices.length);
        for (let k = 0; k < ticks; k++) {
            const name = hailMaryChoices[(start + k) % hailMaryChoices.length].name;
            setTimeout(() => setHailMarySpin({ label: name, phase: 'spin' }), at);
            at += 60 + k * k * 1.2;
        }
        setTimeout(() => setHailMarySpin({ label: picked.name, phase: 'reveal' }), at);
        setTimeout(() => {
            setHailMarySpin(null);
            setHailMaryPick(picked.name);
            setTimeout(() => setHailMaryPick(null), 2500);
            picked.run();
        }, at + HAIL_MARY_REVEAL_MS);
    };
    const onClickHailMary = () => exeHailMary();

    // --- 毒使い 固有スキル「ミアズマ」 ---
    // 対象選択なし。自陣の毒が乗っているマスの周囲1マスの敵マスに毒を付与（重複あり）し、自陣の毒はすべて消える
    const exeMiasma = () => {
        const board = currentBoard.slice();
        const { targets, sources } = miasmaOf(board, currentTurnPlayer, characters);
        harvestMagic(targets.length);
        toxicBloom(board, targets);
        addLog(`ミアズマ（敵${targets.length}マスに毒、自陣の毒はすべて消えた）`);
        flashCells(targets);
        playEffect('miasma', undefined, targets, undefined, { sources });
        setCurrentBoard(board);
    };
    const onClickMiasma = () => {
        spendMagic(miasmaCost(), false, true, 'onClickMiasma');
        exeMiasma();
    };

    // --- 通常枠 毒スキル ---
    const onClickInjection = () => {
        addLog('「インジェクション」を使用（マスを選択）');
        setUseInjection(useInjection + 1);
        spendMagic(late().calculateCost(seatCosts.onClickInjection, false, true, currentTurnPlayer, 'onClickInjection'), true, true, 'onClickInjection');
    };

    const onClickPoisonToken = () => {
        const board = currentBoard.slice();
        const t = putTokens(board, 'poison', 1);
        if (t.placed.length === 0) return;
        const index = t.placed[0].idx;
        addLog(`「ポイズントークン」を使用（${posName(index)}に設置）`);
        playEffect('token', index, [index], 'ポイズントークン');
        t.report();
        toxicBloom(board, [index]);
        setCurrentBoard(board);
        spendMagic(late().calculateCost(seatCosts.onClickPoisonToken, true, true, currentTurnPlayer, 'onClickPoisonToken'), true, true, 'onClickPoisonToken');
        setUseToken(true);
    };

    const onClickSerum = () => {
        addLog('「血清」を使用（自陣の毒をすべて除去）');
        playEffect('cleanse', undefined, undefined, '血清');
        const board = currentBoard.slice();
        clearOwnPoison(board, currentTurnPlayer);
        setCurrentBoard(board);
        spendMagic(late().calculateCost(seatCosts.onClickSerum, false, true, currentTurnPlayer, 'onClickSerum'), true, true, 'onClickSerum');
    };

    const onClickIntensify = () => {
        addLog('「猛毒化」を使用（毒の数を倍化）');
        const board = currentBoard.slice();
        const { affected, added } = intensifyOf(board, characters);
        harvestMagic(added);
        toxicBloom(board, affected);
        flashCells(affected);
        playEffect('poison', undefined, undefined, '猛毒化');
        setCurrentBoard(board);
        spendMagic(late().calculateCost(seatCosts.onClickIntensify, false, true, currentTurnPlayer, 'onClickIntensify'), true, true, 'onClickIntensify');
    };

    const onClickPandemic = () => {
        addLog('「パンデミック」を使用（マスを選択）');
        setUsePandemic(true);
        spendMagic(late().calculateCost(seatCosts.onClickPandemic, false, true, currentTurnPlayer, 'onClickPandemic'), true, true, 'onClickPandemic');
    };
    const exePandemic = (i: number) => {
        const board = currentBoard.slice();
        // 選択マスと周囲1マス(3x3)のコマに毒を1付与（敵味方問わず）
        const targets = pandemicTargets(board, i, characters);
        addPoison(board, targets, characters);
        harvestMagic(targets.length);
        toxicBloom(board, targets);
        addLog(`${posName(i)}を中心にパンデミック（${targets.length}マスに毒）`);
        flashCells(targets);
        playEffect('poison', i, undefined, 'パンデミック');
        setCurrentBoard(board);
        setUsePandemic(false);
    };

    // 毒霧: 盤上の全コマ（敵味方問わず。🔑ロック・無敵は除く）に毒を1付与する。対象選択なし
    const onClickPoisonMist = () => {
        const board = currentBoard.slice();
        const targets = poisonMistTargets(board, characters);
        addPoison(board, targets, characters);
        harvestMagic(targets.length);
        toxicBloom(board, targets);
        addLog(`「毒霧」を使用（${targets.length}マスに毒）`);
        flashCells(targets);
        playEffect('poison', undefined, undefined, '毒霧');
        setCurrentBoard(board);
        spendMagic(late().calculateCost(seatCosts.onClickPoisonMist, false, true, currentTurnPlayer, 'onClickPoisonMist'), true, true, 'onClickPoisonMist');
    };

    // 一寸先は闇鍋: 敵味方を問わず全コマ(🔑ロック・無敵は除く)に🔥❄⚡☠🌱🍂をランダムに付ける。各エフェクトは最大1、複数種類は同居する。
    // 🔥は先に付けて（氷結の解除・燃焼は他のエフェクトを乗せる前に済ませる）、そのあと⚡☠🌱🍂❄の順に乗せる。抽選は darkPot.ts
    const onClickDarkPot = () => {
        if (gearTurn.current.darkPotUsed[turnSeat]) return;
        gearTurn.current.darkPotUsed[turnSeat] = true;
        const board = currentBoard.slice();
        const targets = board.map((_, k) => k).filter((k) => board[k].player && !isGuarded(board[k], characters));
        const rolls = darkPotRolls(targets.map((k) => board[k].effects.map((e) => e.effect)), Math.random);
        const had = (k: number, e: Effect['effect']) => board[k].effects.some((x) => x.effect === e);
        const before = board.map((sq) => sq.player);
        const thawedAll: number[] = [];
        let granted = 0;
        targets.forEach((k, n) => {
            if (!rolls[n].includes('🔥')) return;
            const f = board[k].effects.filter((e) => e.effect === '🔥').length;
            thawedAll.push(...ignite(board, [k], geo.size, 1, keepBuds).thawed);
            if (board[k].effects.filter((e) => e.effect === '🔥').length > f) granted++;
        });
        const destroyed = targets.filter((k) => before[k] && !board[k].player);
        if (destroyed.length > 0) addCorpses(destroyed.length);
        const poisoned: number[] = [];
        targets.forEach((k, n) => {
            for (const e of rolls[n]) {
                if (!board[k].player || e === '🔥' || e === '❄') continue;
                if (had(k, e)) continue;
                if (e === '⚡') board[k] = addCharge(board[k], characters);
                else if (e === '☠') { board[k] = poisonStrike({ ...board[k], effects: [...board[k].effects, { effect: '☠' }] }); poisoned.push(k); }
                else board[k] = { ...board[k], effects: [...board[k].effects, { effect: e }] };
                granted++;
            }
            if (board[k].player && rolls[n].includes('❄') && canFreeze(board[k]) && !had(k, '❄')) {
                granted += freeze(board, [k]).length;
            }
        });
        harvestMagic(granted);
        toxicBloom(board, poisoned);
        addLog(`「一寸先は闇鍋」を使用（${targets.length}コマに合計${granted}個のエフェクト${destroyed.length > 0 ? `・${destroyed.length}コマが燃え尽きた` : ''}）`);
        if (thawedAll.length > 0) addLog(`氷結が溶けた（${thawedAll.map(posName).join('・')}）`);
        flashCells(targets);
        playEffect('darkPot', undefined, targets);
        setCurrentBoard(withOverload(board));
        spendMagic(late().calculateCost(seatCosts.onClickDarkPot, false, false, currentTurnPlayer, 'onClickDarkPot'), true, true, 'onClickDarkPot');
    };

    return { exeHailMary, onClickNecromancy, onClickSerum, onClickIntensify, onClickPandemic, onClickInjection, onClickMiasma, onClickDarkPot, onClickPoisonMist, onClickPoisonToken, remainNecro, necroCost, hailMaryChoices, addCorpses, setRemainNecroAt, exePandemic, baseNecromancyCost, setNecroCostAt, setRemainNecroAll, setNecroCostAll, hailMaryPick, onClickHailMary, necromancySummonCap, necromancyReviveLife, necromancyDuration };
};
