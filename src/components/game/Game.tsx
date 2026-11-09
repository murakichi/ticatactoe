import { setWinNeeds } from './winRule';
import React, { useState, useEffect, useRef } from 'react';
import { DamageEffect } from './BoardEffects';
import { buildDamagePops } from './damagePops';
import { CUSTOM_SKILL_IDX } from './deck';
import { CustomSkillSpec, customCategory, customIcon, isValidSpec, normalizeSpec } from './customSkill';
import { registerCustomMeta } from './skillMeta';
import AIPlayer from './AIPlayer';
import { CharacterId } from '../../types/Character';
import { Player, PLAYER_SYMBOLS, seatOf } from '../../types/Player';
import { SquareInfo } from '../../types/SquareInfo';
import { range } from '../../util';
import { ownPieceCount, skillRestricted, OBJECT_DEFS, ObjectKind } from './objects';
import { SkillEffectType } from './BoardEffects';
import { boardSizeFor, boardSqCss, clampBoardSize, geometryOf } from './boardGeometry';
import { resolveDeck, SKILL_CATALOG } from './deck';
import { parseSkillText } from './skillMeta';
import { lateMagicBonus } from './lateMagic';
import { shieldedCells, isFullyCharged, applyOverload } from './charge';
import { setEffectWard } from './thermal';
import { skillCosts, SkillCosts } from './skillCosts';
import {
    GearId,
    hasGear,
    rollPriceOffsets,
    applyPriceOffsets,
} from './gear';
import { Status } from './Status';
import styles from './Game.module.css';
import { useBasicSkills } from './useBasicSkills';
import { useBlastSkills } from './useBlastSkills';
import { useShikigamiSkills } from './useShikigamiSkills';
import { useNecroSkills } from './useNecroSkills';
import { useGenericSkills } from './useGenericSkills';
import { useElementSkills } from './useElementSkills';
import { useFrostLockSkills } from './useFrostLockSkills';
import { GameLate } from './gameLate';
import { NECROMANCY } from './turn';
import { useCustomSkill } from './useCustomSkill';
import { useSkillCards } from './useSkillCards';
import { useHoverPreview } from './useHoverPreview';
import { usePanelInfo } from './usePanelInfo';
import { useTurnDerived } from './useTurnDerived';
import { useGearRuntime } from './useGearRuntime';
import { useSeatResources } from './useSeatResources';
import { PlayerPanel } from './PlayerPanel';
import { ControlBar } from './ControlBar';
import { OperationLog } from './OperationLog';
import { CaptureDialog, IcicleChoices } from './BoardDialogs';
import { BoardStage } from './BoardStage';
import { SkillPanel } from './SkillPanel';
import { useAIRunner } from './useAIRunner';
import { useTurnEffects } from './useTurnEffects';
import { useSkillDispatch } from './useSkillDispatch';
import { useCellClick } from './useCellClick';
import { useGameControls } from './useGameControls';
import { GameProps } from './gameTypes';
import { useSeatArray } from './useSeatArray';
import { useBoardEffects, useGearToasts, useSkillStrip, useSoundToggle } from './usePresentation';

export type { PlayerConfig } from './gameTypes';


// 盤面を揺らすスキル演出
const SHAKE_EFFECTS: SkillEffectType[] = ['stomp', 'judge', 'assault', 'tsunami', 'slash', 'backslash', 'overload', 'glacierBurst', 'inferno', 'bulwark', 'glacier', 'shikigamiBlast', 'miasma'];

export const Game = (props: GameProps) => {
    const seatCount = props.players.length;
    const geo = geometryOf(props.boardSize !== undefined ? clampBoardSize(props.boardSize) : boardSizeFor(seatCount));
    const symbols: Player[] = PLAYER_SYMBOLS.slice(0, seatCount);
    const characters: CharacterId[] = props.players.map((p) => p.character);
    setWinNeeds(characters); // 席ごとの勝利に必要な4連の本数（#526）。描画のたびに同じ値を登録するだけなので副作用は無い
    const makeBoard = (): SquareInfo[] => Array.from({ length: geo.cells }, () => ({ player: undefined, bind: 0, effects: [] }));
    const initialBoard = makeBoard();
    const [history, setHistory] = useState<SquareInfo[][]>([initialBoard]);
    const [currentBoard, setCurrentBoard] = useState<SquareInfo[]>(initialBoard);
    const [currentTurn, setCurrentTurn] = useState<number>(1);
    // 盤面に着手した回数。3人以上のときの減衰タイミング(手番が1周するごと)の判定に使う
    const [placements, setPlacements] = useState<number>(0);
    // 最後に着手があった手番（膠着の判定用）
    const deadlockRef = useRef({ placements: 0, turn: 1 });
    // 手番の席番号(0始まり)
    const [turnSeat, setTurnSeat] = useState<number>(0);
    const currentTurnPlayer = symbols[turnSeat];
    const currentCharacter = characters[turnSeat];
    const otherSeats = (seat: number): number[] => range(0, seatCount).filter((i) => i !== seat);

    // --- ギア（キャラ選択時に装備する追加パッシブ。定義は gear.ts、ヘッドレス版は sim/gear.js） ---
    // 裸の王様: 立っている席のギアは、その席の次の手番の終わりまで無効になる。以降の判定は無効化後の gearsBySeat を見る（表示と価格破壊の抽選だけは元の装備）
    const [gearOff, setGearOffAt, setGearOffAll] = useSeatArray<boolean>(() => Array(seatCount).fill(false));
    const baseGearsBySeat: GearId[][] = props.players.map((p) => p.gears ?? []);
    const gearsBySeat: GearId[][] = baseGearsBySeat.map((g, seat) => (gearOff[seat] ? [] : g));
    // 席ごとのデッキ（手札3枠の引き元）。指定が無い・不正ならキャラの推奨デッキ
    // オリジナルスキルは人間席だけ。仕様が無い・AI席ならデッキから外す（その分デッキは1枚減る）
    const customBySeat: (CustomSkillSpec | undefined)[] = props.players.map((p) => (!p.isAI && p.customSkill && isValidSpec(normalizeSpec(p.customSkill)) ? normalizeSpec(p.customSkill) : undefined));
    const deckBySeat: number[][] = props.players.map((p, seat) => resolveDeck(p.deck, p.character).filter((i) => i !== CUSTOM_SKILL_IDX || customBySeat[seat] !== undefined));
    const customSpec = customBySeat[turnSeat];
    customBySeat.forEach((c) => c && registerCustomMeta(c.name, customIcon(c), customCategory(c)));
    const turnGears = gearsBySeat[turnSeat];
    // 価格破壊: 席ごとのコスト表。試合開始時(リスタート時)に1回だけ抽選して固定する
    const rollPriceTables = (): (SkillCosts | null)[] =>
        baseGearsBySeat.map((g) => (hasGear(g, 'priceWreck') ? applyPriceOffsets(skillCosts, rollPriceOffsets(Math.random)) : null));
    const [priceTables, setPriceTables] = useState<(SkillCosts | null)[]>(rollPriceTables);
    const costTableFor = (seat: number): SkillCosts => (gearOff[seat] ? skillCosts : priceTables[seat] ?? skillCosts);
    const seatCosts = costTableFor(turnSeat);
    const necroCostRef = useRef<number[]>(Array(seatCount).fill(NECROMANCY.baseCost));
    const { wardRef, gearTurn, gearCost, lastStandUsed, lastStandSaves, lastStandHolderFor, setLastStandSaves, effectSnap, ruinState, lastStandActiveAgainst, costEnvFor, reaperSweeps, setReaperSweeps } = useGearRuntime({ seatCount, gearsBySeat, symbols, currentBoard, turnSeat, characters, necroCostRef }, late);
    wardRef.current = { gears: gearsBySeat, turnSeat };
    useEffect(() => {
        setEffectWard((sq) => !!sq.player && hasGear(wardRef.current.gears[seatOf(sq.player)], 'spellWard') && gearTurn.current.skills[wardRef.current.turnSeat] > 0);
        return () => setEffectWard(() => false);
    }, []);

    const [restartCount, setRestartCount] = useState<number>(0);
    // 連戦時の勝利数 (Restartしてもリセットしない)
    const [wins, setWinsAt] = useSeatArray<number>(() => Array(seatCount).fill(0));
    const { highlightedCells, setHighlightedCells, previewCells, setPreviewCells, boardEffect, setBoardEffect, boardBurst, setBoardBurst, playEffect, playBurst, flashCells } = useBoardEffects();
    // コマが受けたダメージの表示(赤字の -n)。原因の分かるもの(🔥☠⚡)は、着手の処理の中で hint に積み、
    // 盤面が更新されたときに、前の盤面とのライフの差と突き合わせて表示する(差のうち原因の分からない分=自然減衰・攻撃・スキルは絵文字なし)
    const [boardDamage, setBoardDamage] = useState<DamageEffect | null>(null);
    const damageHints = useRef<Map<number, { icon?: string; amount: number }[]>>(new Map());
    const addDamageHint = (cell: number, icon: string | undefined, amount: number) => {
        if (amount <= 0) return;
        damageHints.current.set(cell, [...(damageHints.current.get(cell) ?? []), { icon, amount }]);
    };
    const prevBoardRef = useRef<SquareInfo[] | null>(null);
    const damageTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
        const prev = prevBoardRef.current;
        prevBoardRef.current = currentBoard;
        const hints = damageHints.current;
        damageHints.current = new Map();
        if (!prev) return;
        const items = buildDamagePops(prev, currentBoard, hints);
        if (items.length === 0) return;
        setBoardDamage((p) => ({ items, nonce: (p?.nonce ?? 0) + 1 }));
        if (damageTimer.current) clearTimeout(damageTimer.current);
        damageTimer.current = setTimeout(() => setBoardDamage(null), 1500);
    }, [currentBoard]);
    // 巨人の着手の揺れ(0=まだ揺れていない)。奇数/偶数で別名のアニメーションにして、連続でも再生し直す
    const [giantShake, setGiantShake] = useState<number>(0);
    const { gearToasts, gearTrigger } = useGearToasts();
    // スキルカードの説明を、すべて開く/閉じる(カードごとの開閉は SkillButton 側)
    const [expandAllDesc, setExpandAllDesc] = useState<boolean>(false);
    // モバイルは、通常は1画面に収めてスクロールなしで遊べる表示。「詳細」でログ・ギア・コストまで全部出す
    const [showDetail, setShowDetail] = useState<boolean>(false);
    const { skillGridRef, stripEdge, scrollStrip, updateStripEdge } = useSkillStrip();
    const { soundOn, onClickToggleSound } = useSoundToggle();
    // ⚡を増やす操作の直後に、次の盤面を通す。全マス⚡なら過負荷（全⚡・全🔑除去、全マスのライフ0）。ターンは続く
    const withOverload = (board: SquareInfo[]): SquareInfo[] => {
        if (!isFullyCharged(board)) return board;
        addLog('⚡過負荷！全マスの⚡が爆発して、ロックも解除され、全マスのライフが0になった');
        flashCells(board.map((_, i) => i));
        playEffect('overload');
        return applyOverload(board);
    };
    const [gameLog, setGameLog] = useState<string[]>([]);
    const addLog = (message: string) => {
        setGameLog((prev) => [...prev, `ターン${currentTurn} ${currentTurnPlayer}: ${message}`]);
    };
    const posName = geo.posName;

    const aiBySeat = props.players.map((p, seat) =>
        p.isAI
            ? new AIPlayer(symbols[seat], p.character, symbols.filter((_, i) => i !== seat), characters, (cost, isToken, skillKey) => gearCost(cost, seat, isToken, skillKey, false), hasGear(gearsBySeat[seat], 'toxicBloom'), hasGear(gearsBySeat[seat], 'emptyLock'), deckBySeat[seat], hasGear(gearsBySeat[seat], 'lockBloom'), hasGear(gearsBySeat[seat], 'groundRent'))
            : null
    );
    const currentAI = aiBySeat[turnSeat];
    // 全員AIのときだけステップ実行UIを出す
    const isAllAI = aiBySeat.every((ai) => ai !== null);
    const { setHailMarySpin, runAIMove, hailMarySpin, stallRef, pendingAIMove, setPendingAIMove, setStepRequest, autoPlay, setAutoPlay } = useAIRunner({ reaperSweeps, currentAI, currentBoard, characters, turnSeat, currentTurnPlayer, seatCosts, gearCost, placements, seatCount, gearsBySeat, lastStandUsed, gearTurn, otherSeats, currentTurn, isAllAI, currentCharacter, restartCount, lastStandSaves }, late);
    const { yinYangMode, setMagicAt, budGuard, setBudGuardAt, glacierPending, setGlacierPendingAt, magic, proliferate, proliferateCount, setProliferateAt, setProliferateCountAt, setSilencedAt, setLifeBanAt, setChargeBuffAt, setLife, setUseToken, setSkills, reshuffledSkills, lockedSkills, life, lifeBan, skills, useToken, chargeBuff, currentYinYangMode, silenced, glacierCharge, setLockedSkillsAt, spendMagic, currentLockedSkills, harvestMagic, pendingFlag, useTokenCount, setUseTokenCountAt, proliferateTokenLife, keepBuds, proliferateUpkeepStep, useMagicCount, setUseMagicCountAt, setYinYangModeAt, bumpGlacierCharge, setGlacierChargeAt, proliferateMaxStacks, setMagicAll, setUseMagicCountAll, setUseTokenCountAll, setProliferateAll, setSilencedAll, setLifeBanAll, setChargeBuffAll, setProliferateCountAll, setPendingMode, setGlacierPendingAll, setGlacierChargeAll, setBudGuardAll, setLockedSkillsAll, yinYangModeName, toggleLock, skillBan, setSkillBanAt, setSkillBanAll, bannedByCost, rampRef } = useSeatResources({ seatCount, gearTurn, turnGears, addLog, gearTrigger, turnSeat, characters, gearsBySeat }, late);
    const {  } = useTurnEffects({ playBurst, setSkillBanAt, setReaperSweeps, rampRef, currentBoard, lastStandHolderFor, lastStandUsed, geo, symbols, addLog, setCurrentBoard, setLastStandSaves, playEffect, gearTrigger, currentTurn, characters, placements, deadlockRef, seatCount, setGameLog, flashCells, gearTurn, effectSnap, turnSeat, posName, ruinState, gearsBySeat, setMagicAt, budGuard, setBudGuardAt, glacierPending, setGlacierPendingAt, withOverload, lastStandActiveAgainst, magic, yinYangMode, proliferate, proliferateCount, setProliferateAt, setProliferateCountAt, setSilencedAt, setLifeBanAt, setGearOffAt, setChargeBuffAt, currentCharacter, setLife, setUseToken, setTurnSeat, setSkills, reshuffledSkills, deckBySeat, lockedSkills, history }, late);

    // この手番に置いた新しいコマの数（手番開始時との差。お一人様限りの札の入力）
    const placedThisTurn = Math.max(0, ownPieceCount(currentBoard, currentTurnPlayer) - gearTurn.current.pieceBase[turnSeat]);
    // 相手のオブジェクト（一言居士・お一人様限りの札）に縛られて、そのスキルを今は使えないか。ボタンの文言（名前-コスト）から判定する
    const skillKeyByName = (name: string): string | undefined => {
        const hit = SKILL_CATALOG.find((e) => e.name === name);
        return hit ? hit.costKey : ({ 式神設置: 'onClickShikigamiPlace', 蘇生: 'onClickNecromancy', 全軍突撃: 'onClickTotalAssault' } as Record<string, string>)[name];
    };
    const restrictSkill = (text: string): boolean => {
        const parsed = parseSkillText(text);
        if (!parsed || parsed.sign === '+') return false;
        if (!['シャッフル', 'ロック'].includes(parsed.name) && bannedByCost(turnSeat, parsed.amount)) return true; // スキル封じ（表示コストで判定）
        return skillRestricted({ board: currentBoard, actor: currentTurnPlayer, skillKey: skillKeyByName(parsed.name), basic: ['シャッフル', 'ロック'].includes(parsed.name), skillsThisTurn: gearTurn.current.skills[turnSeat], placedThisTurn });
    };
    // あとで定義される値（calculateCost など）。スキルのハンドラが実行される時点では揃っている
    function late(): GameLate {
        return {
            get calculateCost() {
                return calculateCost;
            },
            get addCorpses() {
                return addCorpses;
            },
            get setUseChargeSpread() {
                return setUseChargeSpread;
            },
            get shuffleSkillDefs() {
                return shuffleSkillDefs;
            },
            get notShielded() {
                return notShielded;
            },
            get judgeNextSeat() {
                return judgeNextSeat;
            },
            get setUseLock() {
                return setUseLock;
            },
            get setUseFreeze() {
                return setUseFreeze;
            },
            get setUseSucker() {
                return setUseSucker;
            },
            get setUseIgnite() {
                return setUseIgnite;
            },
            get setUseSwidden() {
                return setUseSwidden;
            },
            get setUseSacrifice() {
                return setUseSacrifice;
            },
            get setUseKimon() {
                return setUseKimon;
            },
            get setUseStash() {
                return setUseStash;
            },
            get setUseBoltSilence() {
                return setUseBoltSilence;
            },
            get setUseThunderFire() {
                return setUseThunderFire;
            },
            get setUseFrostArea() {
                return setUseFrostArea;
            },
            get setUseIcicle() {
                return setUseIcicle;
            },
            get setUseFreezeSpread() {
                return setUseFreezeSpread;
            },
            get setUseShatter() {
                return setUseShatter;
            },
            get setUseShikigamiPlace() {
                return setUseShikigamiPlace;
            },
            get setUseShikigamiBlast() {
                return setUseShikigamiBlast;
            },
            get setUseShikigamiBless() {
                return setUseShikigamiBless;
            },
            get setUseShikigamiCurse() {
                return setUseShikigamiCurse;
            },
            get setUseShikigamiPurge() {
                return setUseShikigamiPurge;
            },
            get setObjectPlacing() {
                return setObjectPlacing;
            },
            get setObjectTool() {
                return setObjectTool;
            },
            get setCaptureChoice() {
                return setCaptureChoice;
            },
            get activeBudsCount() {
                return activeBudsCount;
            },
            get poisonCount() {
                return poisonCount;
            },
            get remainNecro() {
                return remainNecro;
            },
            get setRemainNecroAt() {
                return setRemainNecroAt;
            },
            get executeSkillForAI() {
                return executeSkillForAI;
            },
            get life() {
                return life;
            },
            get lifeBan() {
                return lifeBan;
            },
            get placedThisTurn() {
                return placedThisTurn;
            },
            get onCellClick() {
                return onCellClick;
            },
            get onClickCharge() {
                return onClickCharge;
            },
            get magic() {
                return magic;
            },
            get skills() {
                return skills;
            },
            get useToken() {
                return useToken;
            },
            get necroCost() {
                return necroCost;
            },
            get judgeDayCost() {
                return judgeDayCost;
            },
            get totalAssaultCost() {
                return totalAssaultCost;
            },
            get proliferate() {
                return proliferate;
            },
            get chargeBuff() {
                return chargeBuff;
            },
            get currentYinYangMode() {
                return currentYinYangMode;
            },
            get silenced() {
                return silenced;
            },
            get glacierPending() {
                return glacierPending;
            },
            get glacierCharge() {
                return glacierCharge;
            },
            get budGuard() {
                return budGuard;
            },
            get calculateTokenBind() {
                return calculateTokenBind;
            },
            get hailMaryChoices() {
                return hailMaryChoices;
            },
            get setLockedSkillsAt() {
                return setLockedSkillsAt;
            },
            get yinYangMode() {
                return yinYangMode;
            },
        };
    }
    // マス選択の待ち: オリジナルスキル（対象のマスを選ぶ）・錠の転換（ロックのマスを選ぶ）
    const [useCustom, setUseCustom] = pendingFlag('custom');
    const [customPicks, setCustomPicks] = useState<number[]>([]);
    const [useLockConvert, setUseLockConvert] = pendingFlag('lockConvert');
    const basicSkills = useBasicSkills({ playEffect, addLog, setMagicAt, turnSeat, setCurrentTurn, currentTurn, setLife, life, spendMagic, seatCosts, currentTurnPlayer, gearTurn, currentBoard, setSkills, reshuffledSkills, deckBySeat, currentLockedSkills, characters, turnGears, gearsBySeat, posName, gearTrigger, playBurst, chargeBuff, geo, harvestMagic, pendingFlag, costTableFor, budGuard, flashCells, setCurrentBoard, seatCount, symbols, setUseToken, currentCharacter }, late);
    const { calculateTokenBind, onClickToken, onClickDoubleToken, onClickBudsToken, onClickBothToken, onClickBuds, onClickDoubleBuds, onClickSlash, onClickBackSlash, onClickOpium, onClickCharge, onClickAddLife, onClickBibine, onClickUseLock, onClickUseDoubleLock, onClickUseTripleLock, onClickShuffle, setUseLock, activeBudsCount, poisonCount, useLock, applyLock, useInjection, poisonStrike, toxicBloom, setUseInjection, usePandemic, poisonerInPlay, useBuds, setUseBuds, spreadPoisonAround, putTokens, miasmaCost, setUsePandemic, afterTokenPlaced, putTokensAt, reportAfter } = basicSkills;
    const blastSkills = useBlastSkills({ addLog, otherSeats, turnSeat, setMagicAt, playEffect, spendMagic, seatCosts, currentTurnPlayer, setCurrentTurn, currentTurn, currentBoard, harvestMagic, setCurrentBoard, gearCost, useTokenCount, seatCount, setUseTokenCountAt, currentCharacter, characters, posName, proliferateTokenLife, toxicBloom, setChargeBuffAt, flashCells, withOverload, pendingFlag, geo, keepBuds, playBurst, gearTurn, setSilencedAt, baseGearsBySeat, gearOff, symbols, setGearOffAt, proliferateUpkeepStep, setProliferateAt, setProliferateCountAt, life, useMagicCount, setUseMagicCountAt, turnGears }, late);
    const { onClickTsunami, onClickWalpurgisNight, onClickTotalAssault, onClickStomp, onClickJudgeDay, onClickProliferate, onClickSilence, onClickStrip, onClickChargeSeason, onClickBristle, onClickRelease, onClickStash, onClickBoltSilence, onClickThunderFire, judgeDayCost, totalAssaultCost, setUseStash, setUseBoltSilence, setUseThunderFire, useThunderFire, thunderFireTargets, exeThunderFire, useBoltSilence, boltSilenceTargets, exeBoltSilence, useStash, stashTargets, exeStash, useStomp, exeStomp, useJudgeDay, exeJudgeDay, useAssault, setUseAssaultAt, applyProliferate, setUseStomp, setUseJudgeDay, setUseAssaultAll, stripTargets } = blastSkills;
    const shikigamiSkills = useShikigamiSkills({ addLog, playEffect, currentYinYangMode, setYinYangModeAt, turnSeat, spendMagic, gearCost, seatCosts, pendingFlag, currentBoard, currentTurnPlayer, characters, flashCells, setCurrentBoard, posName, gearTurn, playBurst, harvestMagic, toxicBloom, putTokens, turnGears, setUseToken }, late);
    const { onClickToggleYingYang, onClickShikigamiPlace, onClickShikigamiBlast, onClickShikigamiBless, onClickShikigamiCurse, onClickShikigamiPurge, onClickShikigamiDiscount, onClickShikigamiAll, onClickShikigamiRandom, onClickShikigamiFlood, onClickObjectSkill, onClickObject, setUseShikigamiPlace, setUseShikigamiBlast, setUseShikigamiBless, setUseShikigamiCurse, setUseShikigamiPurge, setObjectPlacing, setObjectTool, setCaptureChoice, useShikigamiPlace, exeShikigamiPlace, objectPlacing, exeObjectPlace, objectTool, exeObjectTool, useShikigamiBlast, exeShikigamiBlast, useShikigamiBless, exeShikigamiBless, useShikigamiCurse, exeShikigamiCurse, useShikigamiPurge, exeShikigamiPurge, objectSkillTargetsNow, ownShikigami, blessTargets, curseTargets, purgeTargets, captureChoice } = shikigamiSkills;
    const necroSkills = useNecroSkills({ seatCount, characters, lifeBan, turnSeat, calculateTokenBind, spendMagic, gearCost, currentBoard, currentTurnPlayer, setCurrentBoard, playEffect, addLog, setUseAssaultAt, setUseTokenCountAt, setUseStomp, setUseJudgeDay, setUseShikigamiPlace, currentCharacter, seatCosts, setHailMarySpin, harvestMagic, toxicBloom, flashCells, miasmaCost, setUseInjection, useInjection, putTokens, posName, setUseToken, setUsePandemic, gearTurn, geo, keepBuds, poisonStrike, withOverload }, late);
    const { exeHailMary, onClickNecromancy, onClickSerum, onClickIntensify, onClickPandemic, onClickInjection, onClickMiasma, onClickDarkPot, onClickPoisonMist, onClickPoisonToken, remainNecro, necroCost, hailMaryChoices, addCorpses, setRemainNecroAt, exePandemic, baseNecromancyCost, setNecroCostAt, setRemainNecroAll, setNecroCostAll, hailMaryPick } = necroSkills;
    necroCostRef.current = necroCost; // コスト計算（useGearRuntime）が死体の数として読む
    const genericSkills = useGenericSkills({ currentBoard, currentTurnPlayer, addLog, flashCells, playEffect, setCurrentBoard, spendMagic, seatCosts, gearTurn, turnSeat, characters, addCorpses, otherSeats, setLifeBanAt, useToken, bumpGlacierCharge, putTokens, posName, setUseToken, calculateTokenBind, geo, keepBuds, afterTokenPlaced, harvestMagic, applyLock, playBurst, baseNecromancyCost, necroCost, toxicBloom, withOverload, deckBySeat, lifeBan, setNecroCostAt, setMagicAt, pendingFlag }, late);
    const { onClickChargeToken, onClickChargeOne, onClickChargeSpread, onClickChargeHeal, onClickSmallFry, onClickPerfectGame, onClickHelper, onClickSecondCatch, onClickFirstFrost, onClickGather, onClickBurnOff, onClickFreeToken, onClickDoubleChargeToken, onClickChargeArea, onClickChargeRandom, onClickJammer, onClickNightVeil, onClickGraveDiscount, onClickPoisonWard, onClickGraveOffering, useJammer, exeJammer, useChargeOne, setUseChargeOne, useChargeArea, setUseChargeArea, useChargeSpread, setUseChargeSpread, chargeSpreadCost } = genericSkills;
    const elementSkills = useElementSkills({ pendingFlag, addLog, spendMagic, seatCosts, currentTurnPlayer, currentBoard, characters, gearTurn, turnSeat, costTableFor, glacierCharge, glacierPending, setGlacierChargeAt, flashCells, playEffect, setCurrentBoard, setGlacierPendingAt, budGuard, setMagicAt, setBudGuardAt, geo, posName, putTokens, playBurst, setUseToken, deckBySeat, harvestMagic, putTokensAt, reportAfter, addCorpses, life, magic, setLife }, late);
    const { onClickPlunder, onClickGlacier, onClickHarvestEve, onClickSolstice, onClickSucker, onClickWindborne, onClickFlameToken, onClickDoubleFlameToken, onClickSwidden, onClickBoost, onClickIgnite, onClickTinder, onClickRandomCast, onClickBurnout, onClickLeafToken, onClickTwinLeafToken, onClickDoubleLeafToken, onClickLeafAll, onClickBonfire, onClickMulch, onClickAutumn, onClickDiscount, setUseFreeze, setUseSucker, setUseIgnite, setUseSwidden, useFreeze, useSucker, exeSucker, useSwidden, exeSwidden, useClone, exeClone, usePlunder, exePlunder, useTinder, tinderCandidates, useIgnite, setUseTinder, discountLabel, glacierCost, cloneSources, suckerSources } = elementSkills;
    const frostLockSkills = useFrostLockSkills({ setUseLockConvert, setLife, life, pendingFlag, currentBoard, characters, bumpGlacierCharge, addLog, flashCells, playEffect, setCurrentBoard, spendMagic, seatCosts, currentTurnPlayer, geo, posName, putTokens, setUseToken, addCorpses, playBurst, gearTurn, turnSeat, keepBuds, setSkills, reshuffledSkills, deckBySeat, currentLockedSkills, setUseFreeze, costTableFor, setCurrentTurn, currentTurn, setUseTinder, setUseIgnite }, late);
    const { onClickCryoFreeze, onClickShatter, onClickLeafDrop, onClickKindling, onClickLeafCloak, onClickCleanse, onClickLockRaid, onClickLockExtend, onClickLockBlessing, onClickVacantSeal, onClickSacrifice, onClickRandomFreeze, onClickFrostToken, onClickDoubleFrostToken, onClickFrostfall, onClickInferno, onClickMogaribue, onClickSeal, onClickLeafFrost, onClickKimon, onClickFireWheel, onClickSpark, setUseSacrifice, setUseKimon, setUseFrostArea, setUseIcicle, setUseFreezeSpread, setUseShatter, exeFreeze, useSacrifice, exeSacrifice, useKimon, exeKimon, useFrostArea, exeFrostArea, useIcicle, setIcicleCell, useFreezeSpread, exeFreezeSpread, useShatter, exeShatter, exeTinder, exeIgnite, notShielded, infernoCost, mogaribueCost, sealCost, kimonCandidates, sacrificeCandidates, icicleCell, exeIcicle, exeLockConvert, onClickLockConvert, onClickLockDiscount } = frostLockSkills;
    const { customBase, customHasPoison, customCost, onClickCustom, exeCustom } = useCustomSkill({ stripTargets, setSkillBanAt, customSpec, currentTurnPlayer, characters, geo, keepBuds, currentBoard, addLog, posName, flashCells, playEffect, playBurst, otherSeats, turnSeat, setSilencedAt, setGearOffAt, symbols, harvestMagic, setCurrentBoard, withOverload, setUseCustom, setCustomPicks, setCurrentTurn, currentTurn, spendMagic, customPicks }, late);

    const { executeSkillForAI } = useSkillDispatch({ seatCosts, skillBan, bannedByCost, lifeBan, turnSeat, calculateTokenBind, currentBoard, currentTurnPlayer, gearTurn, placedThisTurn, exeHailMary, onClickToken, onClickDoubleToken, onClickBudsToken, onClickBothToken, onClickBuds, onClickDoubleBuds, onClickSlash, onClickBackSlash, onClickOpium, onClickCharge, onClickTsunami, onClickAddLife, onClickBibine, onClickWalpurgisNight, onClickTotalAssault, onClickNecromancy, currentCharacter, onClickCryoFreeze, onClickUseLock, onClickUseDoubleLock, onClickUseTripleLock, onClickStomp, onClickPlunder, onClickShatter, onClickJudgeDay, onClickProliferate, onClickSerum, onClickIntensify, onClickPandemic, onClickInjection, onClickMiasma, onClickChargeToken, onClickChargeOne, onClickChargeSpread, onClickSilence, onClickStrip, onClickChargeSeason, onClickBristle, onClickRelease, onClickStash, onClickBoltSilence, onClickThunderFire, onClickDarkPot, onClickChargeHeal, onClickSmallFry, onClickPerfectGame, onClickHelper, onClickSecondCatch, onClickFirstFrost, onClickGather, onClickBurnOff, onClickFreeToken, onClickLeafDrop, onClickKindling, onClickLeafCloak, onClickDoubleChargeToken, onClickChargeArea, onClickChargeRandom, onClickJammer, onClickPoisonMist, onClickGlacier, onClickCleanse, onClickHarvestEve, onClickSolstice, onClickSucker, onClickToggleYingYang, onClickShikigamiPlace, onClickShikigamiBlast, onClickShikigamiBless, onClickShikigamiCurse, onClickShikigamiPurge, onClickShikigamiDiscount, onClickShikigamiAll, onClickShikigamiRandom, onClickShikigamiFlood, onClickNightVeil, onClickGraveDiscount, onClickPoisonWard, onClickObjectSkill, onClickObject, onClickLockRaid, onClickLockExtend, onClickLockBlessing, onClickVacantSeal, onClickGraveOffering, onClickWindborne, onClickFlameToken, onClickDoubleFlameToken, onClickSwidden, onClickSacrifice, onClickBoost, onClickRandomFreeze, onClickPoisonToken, onClickFrostToken, onClickDoubleFrostToken, onClickFrostfall, onClickIgnite, onClickTinder, onClickInferno, onClickMogaribue, onClickSeal, onClickRandomCast, onClickBurnout, onClickLeafToken, onClickTwinLeafToken, onClickDoubleLeafToken, onClickLeafAll, onClickBonfire, onClickMulch, onClickAutumn, onClickLeafFrost, onClickKimon, onClickFireWheel, onClickSpark, onClickShuffle, runAIMove, onClickDiscount }, late);
    const { onCellClick } = useCellClick({ addDamageHint, useLockConvert, useCustom, exeLockConvert, exeCustom, hailMarySpin, setPreviewCells, useThunderFire, thunderFireTargets, exeThunderFire, useBoltSilence, boltSilenceTargets, exeBoltSilence, useStash, stashTargets, exeStash, useJammer, currentBoard, currentTurnPlayer, characters, exeJammer, currentCharacter, remainNecro, turnSeat, useChargeOne, addLog, posName, playEffect, harvestMagic, setUseChargeOne, setCurrentBoard, withOverload, useChargeArea, geo, flashCells, setUseChargeArea, useChargeSpread, setUseChargeSpread, useFreeze, exeFreeze, useSucker, exeSucker, useShikigamiPlace, exeShikigamiPlace, objectPlacing, exeObjectPlace, objectTool, exeObjectTool, useShikigamiBlast, exeShikigamiBlast, useShikigamiBless, exeShikigamiBless, useShikigamiCurse, exeShikigamiCurse, useShikigamiPurge, exeShikigamiPurge, useSwidden, exeSwidden, useSacrifice, exeSacrifice, useKimon, exeKimon, useFrostArea, exeFrostArea, useClone, exeClone, usePlunder, exePlunder, useIcicle, setIcicleCell, useFreezeSpread, exeFreezeSpread, useShatter, exeShatter, useTinder, tinderCandidates, exeTinder, useIgnite, exeIgnite, useLock, applyLock, setUseLock, useInjection, poisonStrike, toxicBloom, setUseInjection, usePandemic, exePandemic, useStomp, exeStomp, useJudgeDay, exeJudgeDay, lifeBan, life, seatCount, currentAI, setCaptureChoice, placedThisTurn, history, currentTurn, setGiantShake, ruinState, placements, setPlacements, symbols, gearTrigger, playBurst, setMagicAt, poisonerInPlay, addCorpses, useBuds, setUseBuds, gearTurn, gearsBySeat, turnGears, useAssault, chargeBuff, setUseAssaultAt, proliferate, proliferateCount, applyProliferate, setProliferateCountAt, proliferateMaxStacks, setProliferateAt, spreadPoisonAround, setHistory, setCurrentTurn }, late);
    const { calculateCost, judgeNextSeat, winner, checkSkillDisable, currentNecroCost, currentNecroRemain, aiTurn, winCells } = useTurnDerived({ currentTurn, characters, turnSeat, currentTurnPlayer, magic, useToken, costEnvFor, currentBoard, lastStandHolderFor, currentAI, stallRef, pendingAIMove, hailMarySpin, onClickCharge, geo, necroCost, remainNecro, setWinsAt, currentCharacter, seatCount, silenced, addLog, setCurrentTurn }, late);
    const { exclusiveSkillCosts, continuousEffects } = usePanelInfo({ skillBan, useAssault, silenced, lifeBan, chargeBuff, gearOff, discountLabel, budGuard, remainNecro, proliferate, proliferateCount, costTableFor, gearCost, characters, useTokenCount, useMagicCount, yinYangMode, necroCost, miasmaCost, symbols, chargeSpreadCost, glacierCost, infernoCost, mogaribueCost, sealCost }, late);

    // 盤面の両サイドに表示するプレイヤー情報パネル
    const playerPanel = (seat: number) => (
        <PlayerPanel
            key={seat}
            seat={seat}
            player={symbols[seat]}
            character={characters[seat]}
            isAI={props.players[seat].isAI}
            isCurrent={turnSeat === seat && !winner}
            gears={baseGearsBySeat[seat]}
            gearsOff={gearOff[seat]}
            lastStandUsed={lastStandUsed.current[seat]}
            wins={wins[seat]}
            magic={magic[seat]}
            exclusiveCosts={exclusiveSkillCosts(seat)}
            effects={continuousEffects(seat)}
        />
    );
    const { onClickRestart, onClickBackToSetup, onClickCopyLog, copied, onClickDownloadLog } = useGameControls({ damageHints, setBoardDamage, setSkillBanAll, rampRef, gearsBySeat, geo, seatCount, props, symbols, winner, gameLog, currentTurn, makeBoard, setCurrentBoard, setHistory, setCurrentTurn, setPlacements, setMagicAll, setUseMagicCountAll, setUseTokenCountAll, setUseToken, setUseAssaultAll, setProliferateAll, setSilencedAll, setLifeBanAll, setGearOffAll, setChargeBuffAll, setProliferateCountAll, setPendingMode, setUseBuds, setUseLock, setUseInjection, setGlacierPendingAll, setGlacierChargeAll, setBudGuardAll, setObjectPlacing, setObjectTool, setCaptureChoice, setIcicleCell, setRemainNecroAll, setNecroCostAll, baseNecromancyCost, setPendingAIMove, setGameLog, setHighlightedCells, setTurnSeat, setStepRequest, setRestartCount, setPreviewCells, setBoardEffect, setBoardBurst, setLockedSkillsAll, gearTurn, ruinState, lastStandUsed, setLastStandSaves, setPriceTables, rollPriceTables }, late);
    const { showPreview, slashPreview, clearPreview, backSlashPreview, opiumPreview, skillAnnounce, onCellHover, onCellLeave } = useHoverPreview({ currentBoard, characters, currentTurnPlayer, geo, setPreviewCells, useStomp, useJudgeDay, usePandemic, useInjection, useChargeOne, useChargeSpread, useChargeArea, useClone, cloneSources, usePlunder, useFrostArea, useIcicle, useFreezeSpread, useShatter, useKimon, kimonCandidates, useSacrifice, sacrificeCandidates, useSwidden, useShikigamiPlace, objectPlacing, objectTool, objectSkillTargetsNow, useShikigamiBlast, ownShikigami, useShikigamiBless, blessTargets, useShikigamiCurse, curseTargets, useShikigamiPurge, purgeTargets, useSucker, suckerSources, useFreeze, useIgnite, useTinder, tinderCandidates, useThunderFire, thunderFireTargets, useStash, stashTargets, useBoltSilence, boltSilenceTargets, useJammer, hailMaryPick }, late);
    const { shuffleSkillDefs, skillCards } = useSkillCards({ onClickLockDiscount, onClickLockConvert, onClickCustom, customHasPoison, customCost, customBase, customSpec, handlers: { ...basicSkills, ...blastSkills, ...shikigamiSkills, ...necroSkills, ...genericSkills, ...elementSkills, ...frostLockSkills }, calculateCost, seatCosts, currentTurnPlayer, checkSkillDisable, geo, showPreview, slashPreview, clearPreview, backSlashPreview, opiumPreview, turnGears, proliferateTokenLife, proliferateUpkeepStep, proliferateMaxStacks, proliferate, turnSeat, magic, currentBoard, otherSeats, silenced, budGuard, characters, gearTurn, chargeBuff, currentCharacter, gearCost, yinYangModeName, currentNecroCost, currentNecroRemain, lifeBan, glacierPending, currentYinYangMode, skills, currentLockedSkills, toggleLock }, late);

    return (
        <div className={`${styles.game}${showDetail ? ` ${styles.detail}` : ''}`}>
            <div className={styles.main}>
                {seatCount === 2 ? playerPanel(0) : <div className={styles.seatList}>{range(0, seatCount).map(playerPanel)}</div>}
                <div className={styles.boardWrap}>
                    <Status winner={winner} nextPlayer={currentTurnPlayer} life={life} magicBonus={lateMagicBonus(currentTurn, seatCount)} />
                    {skillAnnounce && <div className={styles.announce}>{skillAnnounce}</div>}
                    {captureChoice !== null && currentBoard[captureChoice]?.object && (
                        <CaptureDialog
                            cellName={posName(captureChoice)}
                            objectName={OBJECT_DEFS[currentBoard[captureChoice].object as ObjectKind].name}
                            owner={currentBoard[captureChoice].player ?? ''}
                            onToPiece={() => onCellClick(captureChoice, false)}
                            onToObject={() => onCellClick(captureChoice, true)}
                            onCancel={() => setCaptureChoice(null)}
                        />
                    )}
                    {useIcicle && icicleCell !== null && <IcicleChoices cellName={posName(icicleCell)} disabled={aiTurn} onPick={exeIcicle} />}
                    <BoardStage
                        size={geo.size}
                        squares={currentBoard}
                        shakeClass={boardEffect && SHAKE_EFFECTS.includes(boardEffect.type) ? ` ${styles.shake}` : giantShake > 0 ? ` ${giantShake % 2 ? styles.shakeLightA : styles.shakeLightB}` : ''}
                        sqCss={boardSqCss(geo.size)}
                        onPlay={(i) => {
                            if (aiTurn) return;
                            onCellClick(i);
                        }}
                        destroyCells={highlightedCells}
                        previewCells={previewCells}
                        shieldedCells={shieldedCells(currentBoard, characters)}
                        winCells={winCells}
                        turnColor={winner ? undefined : `var(--color-seat-${turnSeat})`}
                        onCellHover={aiTurn ? undefined : onCellHover}
                        onCellLeave={onCellLeave}
                        effect={boardEffect}
                        burst={boardBurst}
                        damage={boardDamage}
                        winner={winner}
                        winnerSeat={winner ? seatOf(winner) : 0}
                        gearToasts={gearToasts}
                        hailMarySpin={hailMarySpin}
                    />
                    <ControlBar
                        finished={!!winner}
                        onRestart={onClickRestart}
                        soundOn={soundOn}
                        onToggleSound={onClickToggleSound}
                        showDetail={showDetail}
                        onToggleDetail={() => setShowDetail((v) => !v)}
                        onBackToSetup={props.onBackToSetup ? onClickBackToSetup : undefined}
                        isAllAI={isAllAI}
                        autoPlay={autoPlay}
                        onChangeAutoPlay={setAutoPlay}
                        onStep={() => setStepRequest((c) => c + 1)}
                        stepDisabled={autoPlay || !!winner || pendingAIMove !== null}
                    />
                </div>
                {seatCount === 2 && playerPanel(1)}
                <OperationLog log={gameLog} copied={copied} onCopy={onClickCopyLog} onDownload={onClickDownloadLog} />
            </div>
            <SkillPanel
                cards={skillCards}
                restrict={restrictSkill}
                inputBlocked={aiTurn}
                magic={magic[turnSeat]}
                tokenUsed={useToken}
                expandAll={expandAllDesc}
                onToggleExpandAll={() => setExpandAllDesc((v) => !v)}
                silenced={silenced[turnSeat]}
                busy={!!hailMarySpin}
                stripEdge={stripEdge}
                onScrollStrip={scrollStrip}
                gridRef={skillGridRef}
                onGridScroll={updateStripEdge}
            />
        </div>
    );
};
