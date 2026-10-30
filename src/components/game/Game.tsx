import React, { useState, useEffect, useRef, Dispatch, SetStateAction } from 'react';
import { CharacterId, YingYangMode } from '../../types/Character';
import { Effect } from '../../types/Effect';
import { Player, PLAYER_SYMBOLS, seatOf } from '../../types/Player';
import { SquareInfo } from '../../types/SquareInfo';
import { randomAnyPick, range, calculateWinner, isShikigami, lineSymbols, findEmptyIndexes, randomPick, calculateLife, LIFE_STD } from '../../util';
import AIPlayer, { TURN_ENDING_SKILLS, MAX_REROLLS, rerollBudget } from './AIPlayer';
import { planAITurn, resolveMoveCell } from './aiTurn';
import { breakDeadlock, isDeadlocked } from './deadlock';
import { advanceGearState, gearCostContext, noteSkillUsed } from './gearTurn';
import { applyLockAt, propagate as propagateEffect } from './tokenAfter';
import { turnStartMagic, NECROMANCY, PROLIFERATE, proliferateUpkeep } from './turn';
import { addPoison, clearOwnPoison, poisonCountFor, intensify as intensifyOf, miasma as miasmaOf, miasmaPlan as miasmaPlanOf, pandemicTargets, poisonMistTargets, poisonStrike as poisonStrikeOf } from './poison';
import { stomp as stompOf, judgeDay as judgeDayOf } from './blast';
import { shikigamiLandable, SHIKIGAMI_BLAST_DAMAGE, SHIKIGAMI_BLESS_LIFE, SHIKIGAMI_CURSE_STACKS, SHIKIGAMI_LIFE, blast as shikigamiBlast, bless as shikigamiBless, blessTargets as blessTargetsOf, curse as shikigamiCurse, curseTargets as curseTargetsOf, newShikigami, ownShikigamiCells, purge as shikigamiPurge, purgeTargets as purgeTargetsOf } from './shikigami';
import { CostEnv, calculateCostOf, gearCostOf, judgeDayBase, totalAssaultBase, tokenBindOf, SHIKIGAMI_PURGE_FREE } from './cost';
import { Board } from './Board';
import { BoardEffects, SkillEffect, SkillEffectType, BurstEffect, BurstType } from './BoardEffects';
import { isUniqueEffect } from './UniqueEffects';
import { VictoryEffect } from './VictoryEffect';
import { GearToast, GearToasts } from './GearToasts';
import { SkillButton } from './SkillButton';
import { boardSizeFor, boardSqCss, clampBoardSize, geometryOf, lineCells, LineDir } from './boardGeometry';
import { decayBoard, shouldDecay, isCrowded, canHitBound } from './decay';
import { proliferateStep } from './proliferate';
import { absorbDefeated, resolvePlacement } from './placement';
import { resolveDeck, baseCostOf, SKILL_CATALOG } from './deck';
import { boostAll, canRelocate, relocate, cloneTargets, cloneInto, plunderTargets, plunder, isPlaceable } from './generic';
import { lateMagicBonus } from './lateMagic';
import { seatForTurn } from './giantTurn';
import { giantAura } from './giantAura';
import { isShielded, isGuarded, shieldedCells, fireCharges, connectedPieces, withCharge, addCharge, landCharge, releaseCharges, healCharged, chargeStacks, boardChargeCount, reducedChargeCost, randomChargeCandidates, canJam, jammerTargets, applyJammer, isFullyCharged, applyOverload } from './charge';
import { comboCut, comboFloor, ownLeaves, ownCharges } from './comboCost';
import { firstFrost, firstFrostTargets, burnOff, burnOffTargets, gather, FIRST_FROST_FREE_LEAVES } from './tokenSkills';
import { smallFry, placeBlocked, moveBlocked } from './lifeBan';
import { darkPotRolls } from './darkPot';
import { emptyDiscount, applyDiscount, discountAmount, afterSkill as afterDiscount, canUseDiscountSkill, lifeDeltaOf, DISCOUNT_SKILLS, DiscountKey, SHIKIGAMI_DISCOUNT_BASE } from './discount';
import { boardLeaves, tinderTargets, BURNOUT_FREE_FLAMES, burnout, burnoutCostOf, burnoutTargets, totalFlames, FLAME_SKILL_KEYS, isFrozen, isDormant, activeBuds, burnDamageOf, emptyBlocked, cleanse, ailmentStacks, lockable, applyDamage, decayTick, absorbDestroy, zeroOut, ignite, harvestBuds, randomFreezeCandidates, placeFrostToken, frostfallTargets, shatter, swidden, canSacrifice, sacrificeTargets, sacrificeFlame, placeFlameToken, GRAFT_MAX, budStacks, budReceivers, graft, sowCandidates, sow, SOW_COUNT, infernoTargets, INFERNO_STACKS, freeze, detonate, reducedGlacierCost, infernoCostOf, INFERNO_FREE_SKILLS, canFreeze, overwriteBlocked, leafSurcharge, placeLeafToken, bonfireTargets, bonfire, mulchCandidates, mulch, autumnTargets, autumn, leafFrostTargets, thawTargets, thawAll, fireStacksTotal, setEffectWard, isEffectWarded, kimonTargets, kimon, fireWheelTargets, FIRE_WHEEL_COUNT, fireWheel, thunderFireVictims, thawOne, witchCostOf, mogaribue, mogaribueDamage, mogaribueTargets, canMogaribue, MOGARIBUE_LIFE, leafDropTargets, leafDrop, leafAllTargets, leafCloakTargets, kindlingTargets, kindling } from './thermal';
import { skillCosts, MIASMA_MIN_COST, SkillCosts } from './skillCosts';
import {
    GearId,
    GEAR_PARAMS,
    gearDefOf,
    hasGear,
    gearLifeBonus,
    gearLifeStd,
    gearLockBind,
    gearTokenBindDelta,
    adjustCostByGear,
    countVarietySquares,
    burnedBudCount,
    scorchGain,
    ignitedCount,
    flameCounts,
    frozenBudCount,
    rootGain,
    budCounts,
    countAilmentKinds,
    lostCells,
    CostContext,
    rollPriceOffsets,
    applyPriceOffsets,
    TokenEffect,
} from './gear';
import { Status } from './Status';
import styles from './Game.module.css';
import { isMuted, playSfx, setMuted } from '../../sound';


// 盤面を揺らすスキル演出
const SHAKE_EFFECTS: SkillEffectType[] = ['stomp', 'judge', 'assault', 'tsunami', 'slash', 'backslash', 'overload', 'glacierBurst', 'inferno', 'bulwark', 'glacier', 'shikigamiBlast', 'miasma'];

export type PlayerConfig = {
    character: CharacterId;
    isAI: boolean;
    /** 装備するギア（省略時はなし） */
    gears?: GearId[];
    /** デッキ（手札3枠を引く汎用スキルの idx、DECK_SIZE枚）。省略・不正ならキャラの推奨デッキ */
    deck?: number[];
};

type GameProps = {
    /** 席順(= 手番順)。先頭が先手。2〜8人 */
    players: PlayerConfig[];
    /** 盤面の一辺のマス数(4〜10)。省略時は人数に応じた既定 */
    boardSize?: number;
    /** 指定すると、盤面の操作列に「キャラ選択に戻る」ボタンが出る */
    onBackToSetup?: () => void;
};

const CHARACTER_NAMES: Record<CharacterId, string> = {
    you: 'あなた',
    tactician: '軍師',
    magician: '魔法使い',
    fighter: '戦士',
    healer: 'ヒーラー',
    giant: '巨人',
    yinYangMaster: '陰陽師',
    necromancer: 'ネクロマンサー',
    poisoner: '毒使い',
    electrician: '雷霆の巫',
    cryomancer: '氷室の番人',
    pyromancer: '煉獄の鍛冶師',
    witch: '凩の魔女',
};

const AVATAR_CLASSES = [
    styles.avatarHeart,
    styles.avatarCircle,
    styles.avatarSeat2,
    styles.avatarSeat3,
    styles.avatarSeat4,
    styles.avatarSeat5,
    styles.avatarSeat6,
    styles.avatarSeat7,
];

/** 席ごとの値を配列で持ち、指定席だけを関数形式で更新するための小さなフック */
const useSeatArray = <T,>(init: () => T[]): [T[], (seat: number, value: T | ((prev: T) => T)) => void, Dispatch<SetStateAction<T[]>>] => {
    const [values, setValues] = useState<T[]>(init);
    const setAt = (seat: number, value: T | ((prev: T) => T)) =>
        setValues((prev) => prev.map((x, i) => (i === seat ? (typeof value === 'function' ? (value as (p: T) => T)(x) : value) : x)));
    return [values, setAt, setValues];
};

export const Game = (props: GameProps) => {
    const seatCount = props.players.length;
    const geo = geometryOf(props.boardSize !== undefined ? clampBoardSize(props.boardSize) : boardSizeFor(seatCount));
    const symbols: Player[] = PLAYER_SYMBOLS.slice(0, seatCount);
    const characters: CharacterId[] = props.players.map((p) => p.character);
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
    const deckBySeat: number[][] = props.players.map((p) => resolveDeck(p.deck, p.character));
    const turnGears = gearsBySeat[turnSeat];
    // 価格破壊: 席ごとのコスト表。試合開始時(リスタート時)に1回だけ抽選して固定する
    const rollPriceTables = (): (SkillCosts | null)[] =>
        baseGearsBySeat.map((g) => (hasGear(g, 'priceWreck') ? applyPriceOffsets(skillCosts, rollPriceOffsets(Math.random)) : null));
    const [priceTables, setPriceTables] = useState<(SkillCosts | null)[]>(rollPriceTables);
    const costTableFor = (seat: number): SkillCosts => (gearOff[seat] ? skillCosts : priceTables[seat] ?? skillCosts);
    const seatCosts = costTableFor(turnSeat);
    // 手番内のスキル使用状況（四連の極意・連鎖割引・余韻の入力）。AIが同じ描画のうちに続けて使うスキルにも
    // すぐ反映したいので state でなく ref に持つ。echoNext=次の手番に余韻が付く / echoReady=この手番の1つ目に余韻が効く
    const gearTurn = useRef({
        skills: Array<number>(seatCount).fill(0),
        echoReady: Array<boolean>(seatCount).fill(false),
        echoNext: Array<boolean>(seatCount).fill(false),
        kinds: Array.from({ length: seatCount }, () => new Set<string>()), // 手番内に使ったスキルの種類（業火の無料権の数え方）
        infernoReady: Array<boolean>(seatCount).fill(false), // 業火の無料権。手番を跨いで持ち越し、業火を撃つと消える
        discount: Array.from({ length: seatCount }, emptyDiscount), // コスト軽減スキルの状態（手番内だけ有効）
        freeCast: false, // 福引きで発動するスキルの支払いを0にする（次の spendMagic で消える）
        oppSkilled: Array<boolean>(seatCount).fill(false), // 自分の前の手番以降に、他の席がスキルを使った（返し特売の0コスト条件の元）
        oppSkillPrev: Array<boolean>(seatCount).fill(false), // 今の手番の頭の時点での oppSkilled
        shikiPlaced: Array<boolean>(seatCount).fill(false), // 陰陽師: この手番に式神を置いたか（置くと以降の全スキルのコスト-1）
        plantPrev: Array<boolean>(seatCount).fill(false), // 直前の手番に🌱🍂が増えた（火口の無料条件。撃つと消える）
        plantBase: Array<number>(seatCount).fill(0), // 手番開始時点の盤面の🌱🍂の総数
        placedPrev: Array<boolean>(seatCount).fill(false), // 直前の手番に相手がコマを2つ以上設置した（飛び火の無料条件。撃つと消える）
        placeBase: Array<number>(seatCount).fill(0), // 手番開始時点の自陣のコマ数
        fireBase: Array<number>(seatCount).fill(0), // 手番開始時点（と火の車を撃った直後）の盤面全体の🔥の総数（火の車の無料条件。増えていれば、この手番に敵か自陣へ🔥を付与した）
        leafBase: Array<number>(seatCount).fill(0), // 手番開始時点の自陣の🍂の総数（紅葉狩りの導線: 増えていれば軽減）
        darkPotUsed: Array<boolean>(seatCount).fill(false), // 一寸先は闇鍋をこの手番に使った（1手番に1度まで）
        tokenFree: Array<boolean>(seatCount).fill(false), // 無礼講: この手番、トークン系スキルのコストが0
        chargeBase: Array<number>(seatCount).fill(0), // 手番開始時点（と雷を食らわば皿までを撃った直後）の自陣の⚡の総数。増えたぶんがこの手番に付与した⚡
        processedTurn: 1,
    });
    // 手番でない席のコスト表示は「その席の次の手番の頭」の状態で出す
    // 廃墟の底力: active=割引が有効（自陣が破壊された後の、自分の次の手番の終わりまで）/ pending=次の自分の手番から有効
    // snap=手番開始時の各マスの持ち主 / lastMove=その手番の通常の着手マス（攻撃で壊れた自コマは「スキル・エフェクトによる破壊」に数えない）
    const ruinState = useRef({
        active: Array<boolean>(seatCount).fill(false),
        pending: Array<boolean>(seatCount).fill(false),
        snap: null as (Player | undefined)[] | null,
        snapBuds: null as number[] | null, // 焦土: 手番開始時の各マスの🌱の数
        snapFlames: null as number[] | null, // 灰の供物: 手番開始時の各マスの🔥の数
        ashActive: Array<number>(seatCount).fill(0), // 灰の供物: 有効な割引の重ね数
        ashPending: Array<number>(seatCount).fill(0), // 次の自分の手番から有効になる重ね数
        lastMove: null as number | null,
    });
    // 土壇場の防壁: 使用済みの席（初めて相手が勝つときに1度だけ。発動後は相手の魔力+2・ライフ+1）
    const lastStandUsed = useRef<boolean[]>(Array<boolean>(seatCount).fill(false));
    const [lastStandSaves, setLastStandSaves] = useState<number>(0);
    const lastStandActiveAgainst = (seat: number): boolean => lastStandUsed.current.some((used, holder) => used && holder !== seat);
    // 勝者 w に対して発動できる土壇場の防壁の持ち主（未使用・w 以外）。いなければ -1
    const lastStandHolderFor = (w: Player): number =>
        gearsBySeat.findIndex((g, seat) => hasGear(g, 'lastStand') && !lastStandUsed.current[seat] && symbols[seat] !== w);
    const gearCtxFor = (seat: number): CostContext => {
        const ailments = hasGear(gearsBySeat[seat], 'ailmentPact') ? countAilmentKinds(currentBoard, symbols[seat]) : 0;
        return gearCostContext(gearTurn.current, ruinState.current, seat, turnSeat, ailments);
    };
    /** コストを払う席の状況（実コストの計算は cost.ts で sim と共有） */
    const costEnvFor = (seat: number): CostEnv => ({
        board: currentBoard,
        seat,
        player: symbols[seat],
        turnSeat,
        characters,
        yinYangMode: yinYangMode[seat],
        gears: gearsBySeat[seat],
        ctx: gearCtxFor(seat),
        leafBase: gearTurn.current.leafBase[seat],
        kinds: gearTurn.current.kinds[seat],
        chargeBase: gearTurn.current.chargeBase[seat],
        shikiPlaced: gearTurn.current.shikiPlaced[seat],
        tokenFree: gearTurn.current.tokenFree[seat],
        oppSkillPrev: gearTurn.current.oppSkillPrev[seat],
        fireBase: gearTurn.current.fireBase[seat],
        plantPrev: gearTurn.current.plantPrev[seat],
        placedPrev: gearTurn.current.placedPrev[seat],
        discount: gearTurn.current.discount[seat],
    });
    /** キャラ補正済みのコストにギアのコスト補正を掛ける */
    // withLeaf: 敵の🍂の増加分を、ギアの補正・割引より先に足す（増加分→減少分の順）。calculateCost は characterCost の中で足し済みなので false で呼ぶ
    const gearCost = (cost: number, seat: number = turnSeat, isToken: boolean = false, skillKey?: string, withLeaf: boolean = true): number =>
        gearCostOf(costEnvFor(seat), cost, isToken, skillKey, withLeaf);

    // 術中の加護: スキルを使った手番の間、装備した席のコマは効果(☠🔥⚡)のダメージを受けない。thermal.ts の述語を ref 越しに差し込む
    const wardRef = useRef({ gears: gearsBySeat, turnSeat });
    wardRef.current = { gears: gearsBySeat, turnSeat };
    useEffect(() => {
        setEffectWard((sq) => !!sq.player && hasGear(wardRef.current.gears[seatOf(sq.player)], 'spellWard') && gearTurn.current.skills[wardRef.current.turnSeat] > 0);
        return () => setEffectWard(() => false);
    }, []);

    const [restartCount, setRestartCount] = useState<number>(0);
    // 連戦時の勝利数 (Restartしてもリセットしない)
    const [wins, setWinsAt] = useSeatArray<number>(() => Array(seatCount).fill(0));
    // 実際に破壊されたマスを濃い目の黄色で点滅させるためのインデックス
    const [highlightedCells, setHighlightedCells] = useState<number[]>([]);
    // ホバー時に破壊範囲をレモン色でプレビューするためのインデックス
    const [previewCells, setPreviewCells] = useState<number[]>([]);
    // スキル発動時の盤面エフェクト
    const [boardEffect, setBoardEffect] = useState<SkillEffect | null>(null);
    const playEffect = (type: SkillEffectType, index?: number, indexes?: number[], label?: string, extra?: { variant?: string; sources?: number[] }) => {
        playSfx(type);
        setBoardEffect((prev) => ({ type, index, indexes, label, ...extra, nonce: (prev?.nonce ?? 0) + 1 }));
        // 固有スキルは予兆→本体→余波の多段演出なので長めに出す
        setTimeout(() => setBoardEffect(null), isUniqueEffect(type) ? 2100 : 1400);
    };
    // マスに重ねる小演出（氷結が砕ける・解凍・燃焼）。メインの演出と同時に出せる
    const [boardBurst, setBoardBurst] = useState<BurstEffect | null>(null);
    const playBurst = (type: BurstType, cells: number[]) => {
        if (cells.length === 0) return;
        playSfx(type);
        setBoardBurst((prev) => ({ type, cells, nonce: (prev?.nonce ?? 0) + 1 }));
        setTimeout(() => setBoardBurst(null), 1200);
    };
    // ギアの発動を知らせる(盤面上端のチップ + 効果音)。スキルの盤面演出とは別枠なので、同時に起きても上書きしない。
    // 同じギア・同じ文言が短時間に続いたら1つにまとめる(StrictMode の二重実行や、同じ手の中の連続発動で、チップが並びすぎないように)
    const [gearToasts, setGearToasts] = useState<GearToast[]>([]);
    const gearToastSeq = useRef(0);
    const lastGearToast = useRef<{ key: string; at: number } | null>(null);
    const gearTrigger = (gearId: GearId, text?: string) => {
        const def = gearDefOf(gearId);
        const key = `${gearId}:${text ?? ''}`;
        const now = Date.now();
        if (lastGearToast.current && lastGearToast.current.key === key && now - lastGearToast.current.at < 400) return;
        lastGearToast.current = { key, at: now };
        playSfx('gear');
        const id = ++gearToastSeq.current;
        // 積み上がりすぎないよう、同時に出すのは最新の3つまで
        setGearToasts((prev) => [...prev, { id, icon: def.icon, name: def.name, text }].slice(-3));
        setTimeout(() => setGearToasts((prev) => prev.filter((t) => t.id !== id)), 2300);
    };
    // スキルカードの説明を、すべて開く/閉じる(カードごとの開閉は SkillButton 側)
    const [expandAllDesc, setExpandAllDesc] = useState<boolean>(false);
    // モバイルは、通常は1画面に収めてスクロールなしで遊べる表示。「詳細」でログ・ギア・コストまで全部出す
    const [showDetail, setShowDetail] = useState<boolean>(false);
    // スキルカードは横一列で、はみ出す側にだけ「‹ ›」と端のフェードを出す(横に続くことを見落とさないため)
    const skillGridRef = useRef<HTMLDivElement>(null);
    const [stripEdge, setStripEdge] = useState<{ left: boolean; right: boolean }>({ left: false, right: false });
    const updateStripEdge = () => {
        const el = skillGridRef.current;
        if (!el) return;
        const left = el.scrollLeft > 4;
        const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
        setStripEdge((prev) => (prev.left === left && prev.right === right ? prev : { left, right }));
    };
    const scrollStrip = (dir: -1 | 1) => skillGridRef.current?.scrollBy({ left: dir * 160, behavior: 'smooth' });
    // 手札・表示モード・画面幅が変わったら判定し直す(依存を付けず毎描画で判定。値が同じなら再描画されない)
    useEffect(updateStripEdge);
    useEffect(() => {
        window.addEventListener('resize', updateStripEdge);
        return () => window.removeEventListener('resize', updateStripEdge);
    }, []);
    // 効果音のオン/オフ(設定は localStorage に保存される)
    const [soundOn, setSoundOn] = useState<boolean>(!isMuted());
    const onClickToggleSound = () => {
        const next = !soundOn;
        setMuted(!next);
        setSoundOn(next);
        // オンにした瞬間に確認音を鳴らす(ブラウザの音声再開も兼ねる)
        if (next) playSfx('charge');
    };
    const flashCells = (indexes: number[]) => {
        // スキル実行時はホバープレビューを消して破壊演出に切り替える
        setPreviewCells([]);
        if (indexes.length === 0) return;
        setHighlightedCells(indexes);
        setTimeout(() => setHighlightedCells([]), 1200);
    };
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
            ? new AIPlayer(symbols[seat], p.character, symbols.filter((_, i) => i !== seat), characters, (cost, isToken, skillKey) => gearCost(cost, seat, isToken, skillKey, false), hasGear(gearsBySeat[seat], 'toxicBloom'), hasGear(gearsBySeat[seat], 'emptyLock'), deckBySeat[seat])
            : null
    );
    const currentAI = aiBySeat[turnSeat];
    // 全員AIのときだけステップ実行UIを出す
    const isAllAI = aiBySeat.every((ai) => ai !== null);
    // AIの実行キュー。number=そのマスをクリック / string=そのスキルを実行（帯電系は「スキル→クリック」を順に並べる）
    const [pendingAIMove, setPendingAIMove] = useState<(number | string)[] | null>(null);
    // AI同士の対戦時のステップ実行制御 (autoPlay=false なら「次の手番」ボタンで1ターンずつ進める)
    const [autoPlay, setAutoPlay] = useState<boolean>(false);
    const [stepRequest, setStepRequest] = useState<number>(0);
    // ヘイルメアリーのルーレット演出 (intro=「ヘイルメアリー！」/ spin=抽選中 / reveal=当選)。非 null の間は入力とAIキューを止める
    const [hailMarySpin, setHailMarySpin] = useState<{ label: string; phase: 'intro' | 'spin' | 'reveal' } | null>(null);

    // 魔法使いAIの引き直し（軽減札→シャッフル→再計画）の手番内の状態。手番開始時に初期化する
    const aiReroll = useRef({ left: MAX_REROLLS, started: false });
    const executeSkillForAI = (skill: string) => {
        if (placeBlocked(lifeBan[turnSeat], skill, calculateTokenBind())) return; // ライフ3以下のコマを置けない縛り
        // ヘイルメアリーは 'onClickHailMary:当選スキル名' (AI が当選に合わせて対象を決めてある)
        if (skill.startsWith('onClickHailMary:')) {
            exeHailMary(skill.slice('onClickHailMary:'.length));
            return;
        }
        switch (skill) {
            case 'onClickToken': onClickToken(); break;
            case 'onClickDoubleToken': onClickDoubleToken(); break;
            case 'onClickBudsToken': onClickBudsToken(); break;
            case 'onClickBothToken': onClickBothToken(); break;
            case 'onClickBuds': onClickBuds(); break;
            case 'onClickDoubleBuds': onClickDoubleBuds(); break;
            case 'onClickSlash': onClickSlash(); break;
            case 'onClickBackSlash': onClickBackSlash(); break;
            case 'onClickOpium': onClickOpium(); break;
            case 'onClickCharge': onClickCharge(); break;
            case 'onClickTsunami': onClickTsunami(); break;
            case 'onClickAddLife': onClickAddLife(); break;
            case 'onClickBibine': onClickBibine(); break;
            case 'onClickWalpurgisNight': onClickWalpurgisNight(); break;
            case 'onClickTotalAssault': onClickTotalAssault(); break;
            case 'onClickNecromancy': onClickNecromancy(); break;
            case 'onClickUseLock': (currentCharacter === 'cryomancer' ? onClickCryoFreeze : onClickUseLock)(); break;
            case 'onClickUseDoubleLock': onClickUseDoubleLock(); break;
            case 'onClickUseTripleLock': onClickUseTripleLock(); break;
            case 'onClickStomp': onClickStomp(); break;
            case 'onClickPlunder': onClickPlunder(); break;
            case 'onClickRelocate': onClickRelocate(); break;
            case 'onClickShatter': onClickShatter(); break;
            case 'onClickJudgeDay': onClickJudgeDay(); break;
            case 'onClickProliferate': onClickProliferate(); break;
            case 'onClickSerum': onClickSerum(); break;
            case 'onClickIntensify': onClickIntensify(); break;
            case 'onClickPandemic': onClickPandemic(); break;
            case 'onClickInjection': onClickInjection(); break;
            case 'onClickMiasma': onClickMiasma(); break;
            case 'onClickChargeToken': onClickChargeToken(); break;
            case 'onClickChargeOne': onClickChargeOne(); break;
            case 'onClickChargeSpread': onClickChargeSpread(); break;
            case 'onClickSilence': onClickSilence(); break;
            case 'onClickStrip': onClickStrip(); break;
            case 'onClickChargeSeason': onClickChargeSeason(); break;
            case 'onClickBristle': onClickBristle(); break;
            case 'onClickRelease': onClickRelease(); break;
            case 'onClickStash': onClickStash(); break;
            case 'onClickThunderFire': onClickThunderFire(); break;
            case 'onClickDarkPot': onClickDarkPot(); break;
            case 'onClickChargeHeal': onClickChargeHeal(); break;
            case 'onClickSmallFry': onClickSmallFry(); break;
            case 'onClickFirstFrost': onClickFirstFrost(); break;
            case 'onClickGather': onClickGather(); break;
            case 'onClickBurnOff': onClickBurnOff(); break;
            case 'onClickFreeToken': onClickFreeToken(); break;
            case 'onClickLeafDrop': onClickLeafDrop(); break;
            case 'onClickKindling': onClickKindling(); break;
            case 'onClickLeafCloak': onClickLeafCloak(); break;
            case 'onClickDoubleChargeToken': onClickDoubleChargeToken(); break;
            case 'onClickChargeArea': onClickChargeArea(); break;
            case 'onClickChargeRandom': onClickChargeRandom(); break;
            case 'onClickJammer': onClickJammer(); break;
            case 'onClickPoisonMist': onClickPoisonMist(); break;
            case 'onClickGlacier': onClickGlacier(); break;
            case 'onClickCleanse': onClickCleanse(); break;
            case 'onClickHarvestEve': onClickHarvestEve(); break;
            case 'onClickSolstice': onClickSolstice(); break;
            case 'onClickSucker': onClickSucker(); break;
            case 'onClickToggleYingYang': onClickToggleYingYang(); break;
            case 'onClickShikigamiPlace': onClickShikigamiPlace(); break;
            case 'onClickShikigamiBlast': onClickShikigamiBlast(); break;
            case 'onClickShikigamiBless': onClickShikigamiBless(); break;
            case 'onClickShikigamiCurse': onClickShikigamiCurse(); break;
            case 'onClickShikigamiPurge': onClickShikigamiPurge(); break;
            case 'onClickShikigamiDiscount': onClickShikigamiDiscount(); break;
            case 'onClickShikigamiAll': onClickShikigamiAll(); break;
            case 'onClickShikigamiRandom': onClickShikigamiRandom(); break;
            case 'onClickShikigamiFlood': onClickShikigamiFlood(); break;
            case 'onClickWindborne': onClickWindborne(); break;
            case 'onClickFlameToken': onClickFlameToken(); break;
            case 'onClickDoubleFlameToken': onClickDoubleFlameToken(); break;
            case 'onClickSwidden': onClickSwidden(); break;
            case 'onClickSacrifice': onClickSacrifice(); break;
            case 'onClickBoost': onClickBoost(); break;
            case 'onClickRandomFreeze': onClickRandomFreeze(); break;
            case 'onClickPoisonToken': onClickPoisonToken(); break;
            case 'onClickFrostToken': onClickFrostToken(); break;
            case 'onClickDoubleFrostToken': onClickDoubleFrostToken(); break;
            case 'onClickFrostfall': onClickFrostfall(); break;
            case 'onClickIgnite': onClickIgnite(); break;
            case 'onClickTinder': onClickTinder(); break;
            case 'onClickInferno': onClickInferno(); break;
            case 'onClickMogaribue': onClickMogaribue(); break;
            case 'onClickRandomCast': onClickRandomCast(); break;
            case 'onClickBurnout': onClickBurnout(); break;
            case 'onClickLeafToken': onClickLeafToken(); break;
            case 'onClickTwinLeafToken': onClickTwinLeafToken(); break;
            case 'onClickDoubleLeafToken': onClickDoubleLeafToken(); break;
            case 'onClickLeafAll': onClickLeafAll(); break;
            case 'onClickBonfire': onClickBonfire(); break;
            case 'onClickMulch': onClickMulch(); break;
            case 'onClickAutumn': onClickAutumn(); break;
            case 'onClickLeafFrost': onClickLeafFrost(); break;
            case 'onClickKimon': onClickKimon(); break;
            case 'onClickFireWheel': onClickFireWheel(); break;
            case 'onClickSpark': onClickSpark(); break;
            case 'onClickShuffle': onClickShuffle(); break;
            case 'aiReplan': runAIMove(); break; // 引き直しのあと、新しい手札で計画し直す
            case 'onClickCounterMarkdown':
            case 'onClickMarkdown': case 'onClickEffectDiscount': case 'onClickTokenDiscount':
            case 'onClickVitalMarkdown': case 'onClickUniqueDiscount': case 'onClickClearance':
                onClickDiscount(skill as DiscountKey); break;
        }
    };

    useEffect(() => {
        if (pendingAIMove !== null && pendingAIMove.length > 0 && !hailMarySpin) {
            const timer = setTimeout(() => {
                const [next, ...rest] = pendingAIMove;
                // 再計画は新しいキューを積むので、先に今のキューを空にしてから呼ぶ（後から null で上書きしない）
                if (next === 'aiReplan') {
                    setPendingAIMove(rest.length > 0 ? rest : null);
                    executeSkillForAI(next);
                    return;
                }
                if (typeof next === 'string') executeSkillForAI(next);
                else if (rest.length === 0 && currentAI) {
                    // 着手マスはスキル実行前の盤面で決めてある。ランダム設置のトークンなどでそのマスが埋まり（⚡付き自陣コマは無敵で
                    // 触れない）クリックが無視されると、手番が進まず止まる。今の盤面で打ち直し、無ければチャージでパスする
                    const cell = resolveMoveCell(currentAI, currentBoard, characters, life, next, lifeBan[turnSeat]);
                    if (cell !== null) onCellClick(cell);
                    else onClickCharge();
                } else onCellClick(next);
                setPendingAIMove(rest.length > 0 ? rest : null);
                if (rest.length === 0) watchAIStall();
            }, 200);
            return () => clearTimeout(timer);
        }
    }, [pendingAIMove, hailMarySpin]);

    const runAIMove = () => {
        const ai = currentAI!;
        // 状態をAIに渡して手番の計画を作る部分は aiTurn.ts（sim と共有）。ここはその計画を React の状態とタイマー付きキューで実行する
        const plan = planAITurn(
            ai,
            {
                board: currentBoard,
                characters,
                seat: turnSeat,
                magic,
                costs: seatCosts,
                hand: skills,
                life,
                tokenUsed: useToken,
                necroRemain: remainNecro[turnSeat],
                necroCosts: necroCost,
                necroPay: gearCost(necroCost[turnSeat]),
                judgeDayCost,
                totalAssaultCost,
                proliferate: proliferate[turnSeat],
                placements,
                seatCount,
                lastStandReady: hasGear(gearsBySeat[turnSeat], 'lastStand') && !lastStandUsed.current[turnSeat],
                tokenFree: gearTurn.current.tokenFree[turnSeat],
                chargeBuffActive: chargeBuff[turnSeat] > 0,
                oppGearCount: otherSeats(turnSeat).reduce((n, seat) => n + gearsBySeat[seat].length, 0),
                oppLastStand: otherSeats(turnSeat).some((seat) => hasGear(gearsBySeat[seat], 'lastStand') && !lastStandUsed.current[seat]),
                yinYangMode: currentYinYangMode === 'yang' ? 'yang' : 'ying',
                silenced: silenced[turnSeat],
                glacierPending: glacierPending[turnSeat],
                glacierCharge: glacierCharge[turnSeat],
                budGuard: budGuard[turnSeat],
                infernoReady: gearTurn.current.infernoReady[turnSeat],
                skillKinds: gearTurn.current.kinds[turnSeat],
                rerollsLeft: aiReroll.current.left,
                discountActive: aiReroll.current.started,
                lifeBan: lifeBan[turnSeat],
                tokenBind: calculateTokenBind(),
            },
            () => randomPick(hailMaryChoices).name
        );

        if (plan.kind === 'silenced') {
            if (plan.move !== null) onCellClick(plan.move);
            else if (plan.charge) onClickCharge();
            return;
        }
        setLockedSkillsAt(turnSeat, plan.locks);

        if (plan.kind === 'reroll') {
            aiReroll.current = { left: aiReroll.current.left - 1, started: true };
            setPendingAIMove(plan.steps);
            return;
        }
        if (plan.kind === 'queue') {
            setPendingAIMove(plan.steps);
            return;
        }

        for (const sk of plan.skills) {
            executeSkillForAI(sk);
        }

        // 対象クリック(ロック・インジェクションなど)で終わり、着手もターン終了スキルも無いなら、クリックのあとにチャージでパスする
        const pendingClicks: (number | string)[] = plan.chargeWhenEmpty && !plan.moveLast ? [...plan.clicks, 'onClickCharge'] : plan.clicks;
        if (pendingClicks.length > 0) {
            if (plan.skills.length > 0 || typeof pendingClicks[0] === 'string') {
                setPendingAIMove(pendingClicks);
            } else {
                onCellClick(pendingClicks[0] as number);
                if (pendingClicks.length > 1) setPendingAIMove(pendingClicks.slice(1));
            }
        } else if (plan.chargeWhenEmpty) {
            // 置ける場所もスキルもなければチャージで手番を終える（何もしないと進行不能になる）
            onClickCharge();
        } else {
            watchAIStall();
        }
    };

    // AIのタイマーは500ms後に発火するので、その時点の最新の runAIMove を呼ぶ。描画時の runAIMove を握ったままだと、
    // 巨人が休んで同じ席が連続で動く手番（turnSeat が変わらず再描画で張り直されない）で、手番開始の魔力・手札・ライフの更新前の値でAIが計画してしまう
    const runAIMoveRef = useRef(runAIMove);
    runAIMoveRef.current = runAIMove;

    // AIの計画を最後まで実行したのに手番が進まないとき（氷結・ロックで対象や着手が無効になった等）は、チャージでパスして止まらないようにする。
    // 計画の実行直後は state がまだ古いので、少し待ってから最新の値で確かめる
    const stallRef = useRef<{ turn: number; over: boolean; queued: boolean; spinning: boolean; charge: () => void }>({ turn: currentTurn, over: true, queued: false, spinning: false, charge: () => {} });
    const watchAIStall = () => {
        const turn = stallRef.current.turn;
        setTimeout(() => {
            const cur = stallRef.current;
            if (cur.turn === turn && !cur.over && !cur.queued && !cur.spinning) cur.charge();
        }, 900);
    };

    useEffect(() => {
        if (!currentAI) return;

        const winner = calculateWinner(lineSymbols(currentBoard));
        if (winner) return;

        // 全員AIでステップ実行モードのときは自動進行せず、「次の手番」ボタンを待つ
        if (isAllAI && !autoPlay) return;

        const timer = setTimeout(() => {
            aiReroll.current = { left: rerollBudget(currentCharacter), started: false };
            runAIMoveRef.current();
        }, 500);

        return () => clearTimeout(timer);
        // currentTurn も依存に含める: 巨人のスキップで turnSeat が変わらず同じ席が連続手番になる場合でも再発火させる
    }, [turnSeat, currentTurn, restartCount, autoPlay, lastStandSaves]);

    // 「次の手番」ボタン押下でAI同士の対戦を1ターン進める
    useEffect(() => {
        if (stepRequest === 0) return;
        if (!currentAI) return;
        if (calculateWinner(lineSymbols(currentBoard))) return;
        aiReroll.current = { left: MAX_REROLLS, started: false };
        runAIMove();
    }, [stepRequest]);

    // --- 席ごとの状態（添字 = 席番号） ---
    const [magic, setMagicAt, setMagicAll] = useSeatArray<number>(() => Array(seatCount).fill(2));
    const [useMagicCount, setUseMagicCountAt, setUseMagicCountAll] = useSeatArray<number>(() => Array(seatCount).fill(0));

    // 現在の手番プレイヤーのマジックを cost 消費する共通処理。bumpCount=true でスキル使用回数も+1
    // isSkill=false はシャッフルのようにスキル扱いしない支払い（ギアのスキル使用数に数えない）
    const spendMagic = (cost: number, bumpCount: boolean = true, isSkill: boolean = true, skillId?: string) => {
        let pay = cost;
        if (isSkill) {
            if (gearTurn.current.freeCast && skillId && skillId !== 'onClickRandomCast') {
                pay = 0; // 福引きで発動したスキル
                gearTurn.current.freeCast = false;
            }
            if (pay > 0 && hasGear(turnGears, 'luckyPurse') && Math.random() < GEAR_PARAMS.luckyPurseChance) {
                pay = 0;
                addLog('幸運の財布でコストが0になった');
                gearTrigger('luckyPurse', 'コスト0');
            }
            noteSkillUsed(gearTurn.current, turnSeat, skillId);
            // 四連の極意: この回数に達したので、次のスキルは無料
            if (hasGear(turnGears, 'quadMastery') && gearTurn.current.skills[turnSeat] === GEAR_PARAMS.quadCount) gearTrigger('quadMastery', '次のスキルが無料');
        }
        setMagicAt(turnSeat, (m) => m - pay);
        if (bumpCount) setUseMagicCountAt(turnSeat, (c) => c + 1);
    };

    // 収穫: エフェクトを n 個付与したぶん魔力を得る（上限あり）
    const harvestMagic = (n: number) => {
        if (!hasGear(turnGears, 'harvest') || n <= 0) return;
        const gain = Math.min(n, GEAR_PARAMS.harvestCap);
        setMagicAt(turnSeat, (m) => m + gain);
        addLog(`収穫で魔力+${gain}`);
        gearTrigger('harvest', `魔力+${gain}`);
    };

    const [useToken, setUseToken] = useState<boolean>(false);
    const [useTokenCount, setUseTokenCountAt, setUseTokenCountAll] = useSeatArray<number>(() => Array(seatCount).fill(0));
    useEffect(() => {
        if (useToken) {
            setUseTokenCountAt(turnSeat, (c) => c + 1);
        }
    }, [useToken]);

    const [skills, setSkills] = useState<number[]>([]);
    // ロックしたスキルはシャッフル時も固定で残る。ロックはプレイヤーごとに管理する
    const [lockedSkills, setLockedSkillsAt, setLockedSkillsAll] = useSeatArray<number[]>(() => Array.from({ length: seatCount }, () => []));
    const currentLockedSkills = lockedSkills[turnSeat];
    const toggleLock = (i: number) => {
        setLockedSkillsAt(turnSeat, (prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i].slice(0, 3)));
    };
    // ロック済みスキルを残しつつ、残り枠を席のデッキからランダムに埋める
    const reshuffledSkills = (deck: number[], locks: number[]): number[] => {
        const keep = locks.slice(0, 3);
        const pool = deck.filter((i) => !keep.includes(i));
        return [...keep, ...randomAnyPick(pool, Math.max(0, 3 - keep.length))];
    };

    // --- 増殖（ループ召喚） ---
    // 発動後は自分が着手するたびに「コマ→アイテム」を交互に追加し続ける。
    // 追加のたび維持コストが +1 され、手番開始時に払えなくなるとループが途切れる（自己終息）。
    const proliferateTokenLife = PROLIFERATE.tokenLife;
    const proliferateUpkeepStep = PROLIFERATE.upkeepStep;
    const proliferateMaxStacks = PROLIFERATE.maxStacks;
    // サイレンス: 立っている席は次の手番スキルを使えない（その席の手番が終わるたびに解除）
    const [silenced, setSilencedAt, setSilencedAll] = useSeatArray<boolean>(() => Array(seatCount).fill(false));
    // 一寸の虫に魂なし: 立っている席は、その席の次の手番の終わりまでライフ3以下のコマを置けない
    const [lifeBan, setLifeBanAt, setLifeBanAll] = useSeatArray<boolean>(() => Array(seatCount).fill(false));
    // 静電気の季節: 立っている間（残りターン数）、その席が設置する駒（着手・トークン・全軍突撃のトークン）に⚡が付く
    const [chargeBuff, setChargeBuffAt, setChargeBuffAll] = useSeatArray<number>(() => Array(seatCount).fill(0));
    const [proliferate, setProliferateAt, setProliferateAll] = useSeatArray<boolean>(() => Array(seatCount).fill(false));
    const [proliferateCount, setProliferateCountAt, setProliferateCountAll] = useSeatArray<number>(() => Array(seatCount).fill(0));

    const [yinYangMode, setYinYangModeAt] = useSeatArray<YingYangMode | undefined>(() => Array(seatCount).fill('ying'));
    const currentYinYangMode = yinYangMode[turnSeat];
    const yinYangModeName = (seat: number) => (yinYangMode[seat] === 'yang' ? '陽' : '陰');

    const [life, setLife] = useState<number>(
        calculateLife(characters[0], yinYangMode[0], gearLifeBonus(gearsBySeat[0]), gearLifeStd(gearsBySeat[0], LIFE_STD))
    );

    // 絶対零度（氷室の番人）: 使用済みで、その席の次の手番開始時に発動待ちのフラグ
    const [glacierPending, setGlacierPendingAt, setGlacierPendingAll] = useSeatArray<boolean>(() => Array(seatCount).fill(false));
    // 冬至の種子: その席のコマの🌱が火炎で消えず、氷結中のマスでも休眠しない間のフラグ（その席の次の手番開始時に解除）
    const [budGuard, setBudGuardAt, setBudGuardAll] = useSeatArray<boolean>(() => Array(seatCount).fill(false));
    // 冬至の種子のガード中の席のコマは、🔥が付いても🌱が消えない
    const keepBuds = (sq: SquareInfo): boolean => !!sq.player && budGuard[seatOf(sq.player)];
    // 絶対零度のコスト軽減: 氷結が作られた回数（誰が作っても全席で数え、その席が撃つとリセット）
    const [glacierCharge, setGlacierChargeAt, setGlacierChargeAll] = useSeatArray<number>(() => Array(seatCount).fill(0));
    const bumpGlacierCharge = (n: number) => {
        if (n > 0) setGlacierChargeAll((prev) => prev.map((c) => c + n));
    };

    // 土壇場の防壁: 初めて相手が列を揃えたとき、かわりにその列のマスを消滅させる（ロック・氷結を貫通）。
    // 手番の効果(下の [currentTurn])より先に宣言して、同じ描画で手番が進んでも相手ボーナスに間に合わせる
    useEffect(() => {
        const w = calculateWinner(lineSymbols(currentBoard));
        if (!w) return;
        const holder = lastStandHolderFor(w);
        if (holder < 0) return;
        lastStandUsed.current[holder] = true;
        const board = currentBoard.slice();
        for (const line of geo.winLines) {
            if (line.every((idx) => !isShikigami(board[idx]) && board[idx].player === w)) for (const idx of line) board[idx] = { player: undefined, bind: 0, effects: [] };
        }
        // 代償: 持ち主の自陣のコマもすべて消滅する
        for (let idx = 0; idx < board.length; idx++) if (board[idx].player === symbols[holder]) board[idx] = { player: undefined, bind: 0, effects: [] };
        addLog(`${symbols[holder]}の土壇場の防壁: ${w}の揃った列が消滅（以降、${symbols[holder]}以外は魔力+${GEAR_PARAMS.lastStandMagic}・ライフ+${GEAR_PARAMS.lastStandLife}）`);
        setCurrentBoard(board);
        setLastStandSaves((c) => c + 1);
        // 防壁の発動は大事件なので、盤面の演出(土壇場の防壁)とギアのチップの両方で知らせる
        playEffect('bulwark');
        gearTrigger('lastStand', '列が消滅');
    }, [currentBoard]);

    useEffect(() => {
        if (currentTurn === 1) {
            return;
        }
        const nextSeat = judgeNextSeat();
        const nextCharacter = characters[nextSeat];
        const nextSymbol = symbols[nextSeat];
        // 膠着の打開: 着手が何周も無い（全マスが氷結・ロックで全員がパスし続ける）と、減衰が進まず永久に終わらないので、盤面の時間を進める
        if (placements !== deadlockRef.current.placements) deadlockRef.current = { placements, turn: currentTurn };
        else if (isDeadlocked(currentTurn, deadlockRef.current.turn, seatCount)) {
            const board = currentBoard.slice();
            const changed = breakDeadlock(board);
            deadlockRef.current = { placements, turn: currentTurn };
            if (changed.length > 0) {
                setCurrentBoard(board);
                setGameLog((prev) => [...prev, `ターン${currentTurn}: 着手が続かないので氷結とロックが一段解けた`]);
                flashCells(changed);
            }
        }
        // 「次のクリックで対象を選ぶ」待ち状態は手番をまたがない（ターン終了スキルで手番が終わったとき、次の席の最初のクリックが前の席のスキルの対象にならないように）
        setUseLock(0);
        setUseFreeze(false);
        setUseSucker(false);
        setUseIgnite(false);
        setUseSwidden(false);
        setUseSacrifice(false);
        setUseKimon(false);
        setUseStash(false);
        setUseThunderFire(false);
        setUseFrostArea(false);
        setUseIcicle(false);
        setUseFreezeSpread(false);
        setUseShatter(false);
        setUseShikigamiPlace(false);
        setUseShikigamiBlast(false);
        setUseShikigamiBless(false);
        setUseShikigamiCurse(false);
        setUseShikigamiPurge(false);
        // ギア: 新しい手番のスキル使用数をリセットし、余韻を引き継ぐ（StrictMode の二重実行に備えて1ターンに1回だけ）
        let scorchForNext = 0;
        if (gearTurn.current.processedTurn !== currentTurn) {
            gearTurn.current.processedTurn = currentTurn;
            // 席ごとのギア・導線・廃墟の状態の更新は gearTurn.ts で sim と共有。魔力や演出は戻り値を見て行う
            const change = advanceGearState(gearTurn.current, ruinState.current, { board: currentBoard, symbols, gears: gearsBySeat, endSeat: turnSeat, nextSeat });
            change.scorch.forEach((gain, seat) => {
                if (gain <= 0) return;
                // 焦土: 次の手番の席の分は、下の手番開始の魔力に足す
                if (seat === nextSeat) scorchForNext = gain;
                else setMagicAt(seat, (m) => m + gain);
                gearTrigger('scorchedEarth', `魔力+${gain}`);
            });
            if (change.ashNext > 0 && hasGear(gearsBySeat[nextSeat], 'ashOffering')) gearTrigger('ashOffering', `スキルのコスト-${change.ashNext * GEAR_PARAMS.ashDiscount}`);
            if (change.ruinNext) gearTrigger('ruinSurge', `スキルのコスト-${GEAR_PARAMS.ruinDiscount}`);
            gearTurn.current.freeCast = false;
            if (change.echoNext && hasGear(gearsBySeat[nextSeat], 'afterglow')) gearTrigger('afterglow', '1つ目のスキルが安い');
            if (budGuard[nextSeat]) setBudGuardAt(nextSeat, false);
            // 絶対零度: 使用者の手番開始時に、他の席の氷結マスへ❄×3のダメージを与えて氷結を解除する
            if (glacierPending[nextSeat]) {
                const board = currentBoard.slice();
                const r = detonate(board, nextSymbol);
                setGlacierPendingAt(nextSeat, false);
                setCurrentBoard(board);
                setGameLog((prev) => [
                    ...prev,
                    `ターン${currentTurn} ${nextSymbol}: 絶対零度が発動（${r.damaged.length}コマにダメージ${r.destroyed.length > 0 ? `・${r.destroyed.length}コマが破壊` : ''}）`,
                ]);
                if (r.damaged.length > 0) {
                    flashCells(r.damaged);
                    playEffect('glacierBurst', undefined, r.damaged);
                }
                addCorpses(r.destroyed.length);
            }
        }
        // 手番開始時の魔力（標準+1に、長期戦ボーナス・自陣の🌱・キャラ補正・ギアを足す。規則は turn.ts で sim と共有）
        const garden = hasGear(gearsBySeat[nextSeat], 'colorGarden') ? countVarietySquares(currentBoard, nextSymbol) * GEAR_PARAMS.varietyMagic : 0;
        if (garden > 0) gearTrigger('colorGarden', `魔力+${garden}`);
        const standBonus = lastStandActiveAgainst(nextSeat);
        // 凍てつく根: 氷結で休眠した🌱(敵味方問わず)1つにつき+1
        const root = hasGear(gearsBySeat[nextSeat], 'frostRoot') ? rootGain(frozenBudCount(currentBoard)) : 0;
        if (root > 0) gearTrigger('frostRoot', `魔力+${root}`);
        let nextMagic: number = turnStartMagic({
            magic: magic[nextSeat],
            turn: currentTurn,
            seatCount,
            character: nextCharacter,
            yinYangMode: yinYangMode[nextSeat],
            buds: activeBudsCount(nextSymbol),
            garden,
            standBonus,
            scorch: scorchForNext,
            root,
        });

        // 増殖: 手番開始時に維持コストを支払う。払えなければループが途切れる
        if (proliferate[nextSeat]) {
            const upkeep = proliferateUpkeep(proliferateCount[nextSeat]);
            if (nextMagic >= upkeep) {
                nextMagic -= upkeep;
            } else {
                setProliferateAt(nextSeat, false);
                setProliferateCountAt(nextSeat, 0);
                setGameLog((prev) => [...prev, `ターン${currentTurn} ${nextSymbol}: 増殖の維持コスト(${upkeep})を払えず途切れた`]);
            }
        }

        setMagicAt(nextSeat, nextMagic);
        const nextGears = gearsBySeat[nextSeat];
        const nextLife = calculateLife(
            nextCharacter,
            yinYangMode[nextSeat],
            (nextCharacter === 'poisoner' ? poisonCount(nextSymbol) : 0) +
                gearLifeBonus(nextGears) +
                (standBonus ? GEAR_PARAMS.lastStandLife : 0),
            gearLifeStd(nextGears, LIFE_STD)
        );
        // サイレンスは「封じられた側の手番が終わるたび」に解除
        setSilencedAt(turnSeat, false);
        setLifeBanAt(turnSeat, false);
        // 裸の王様も同じく、ギアを封じられた側の手番が終わるたびに解除
        setGearOffAt(turnSeat, false);
        // 静電気の季節の残りターンは、自分の手番が終わるたびに1減る
        setChargeBuffAt(turnSeat, (v) => Math.max(0, v - 1));
        // 蘇生の残りターンは「発動した側の手番が終わるたび」に減る
        if (currentCharacter === 'necromancer' && remainNecro[turnSeat] > 0) {
            setRemainNecroAt(turnSeat, remainNecro[turnSeat] - 1);
        }
        setLife(nextLife > 0 ? nextLife : 1);
        setUseToken(false);
        setTurnSeat(nextSeat);
    }, [currentTurn]);

    useEffect(() => {
        // 次に手番が来るプレイヤーのロックを固定して再シャッフル。
        // チャージのように盤面(history)が変わらずにターンだけ進む場合も、次の席の手札を引き直す（currentTurn も依存に含める）。
        // 含めないと、チャージで手番を渡したとき次の席が前の席の手札をそのまま引き継いでしまう（sim は毎手番引き直す）
        setSkills(reshuffledSkills(deckBySeat[judgeNextSeat()], lockedSkills[judgeNextSeat()]));
    }, [history, currentTurn]);

    const onCellClick = (i: number) => {
        if (hailMarySpin) return;
        setPreviewCells([]);
        // 雷のない所に火は立たぬ: ⚡のあるコマを選ぶ。無敵マスでも自分のものは選べる（無敵の早期リターンより前に判定する）
        if (useThunderFire) {
            if (!thunderFireTargets().includes(i)) return; // ⚡のないマス・守られた他人のコマは選び直せる
            exeThunderFire(i);
            return;
        }
        // 雷神のへそくり: ⚡のある自陣のコマを選ぶ。無敵マスでも自分のものは選べる（雷霆の巫の⚡マスはすべて無敵なので、無敵の早期リターンより前に判定する）
        if (useStash) {
            if (!stashTargets().includes(i)) return; // ⚡のない・自陣でないマスは選び直せる
            exeStash(i);
            return;
        }
        // ジャマー: ⚡のあるマスを選ぶ。無敵マスでも**自分の**ものは選べる（弱点を解く唯一の手段）。
        // ⚡のないマス・他人の無敵マスは無視（選び直せる）。無敵の早期リターンより前に判定する
        if (useJammer) {
            if (!canJam(currentBoard, i, currentTurnPlayer, characters)) return;
            exeJammer(i);
            return;
        }
        // 雷霆の巫の⚡付き自陣マスは、本人も相手も触れない (無敵＋弱点)。対象選択スキルも含めて受け付けない
        if (isShielded(currentBoard[i], characters)) return;
        const prevPlayer = currentBoard[i].player;
        const necroActive = currentCharacter === 'necromancer' && remainNecro[turnSeat] > 0;
        const nextBoard = currentBoard.slice();
        if (useChargeOne) {
            nextBoard[i] = addCharge(nextBoard[i], characters);
            addLog(`${posName(i)}に⚡を付与`);
            playEffect('zap', i, undefined, '帯電付与');
            harvestMagic(1);
            setUseChargeOne(false);
            setCurrentBoard(withOverload(nextBoard));
            return;
        }

        if (useChargeArea) {
            const cells = geo.stompRange(i);
            addLog(`${posName(i)}を中心に範囲帯電（${cells.length}マスに⚡）`);
            flashCells(cells);
            playEffect('zap', i, undefined, '範囲帯電');
            setUseChargeArea(false);
            setCurrentBoard(withOverload(withCharge(currentBoard, cells, characters)));
            return;
        }

        if (useChargeSpread) {
            const cells = connectedPieces(currentBoard, i, geo.size);
            if (cells.length === 0) return; // 空きマスは起点にできない。選び直せる
            harvestMagic(cells.length);
            addLog(`${posName(i)}から帯電拡散（${cells.length}マスに⚡）`);
            flashCells(cells);
            playEffect('chainZap', i, cells);
            setUseChargeSpread(false);
            setCurrentBoard(withOverload(withCharge(currentBoard, cells, characters)));
            return;
        }

        if (useFreeze) {
            exeFreeze(i);
            return;
        }

        if (useSucker) {
            exeSucker(i);
            return;
        }

        if (useShikigamiPlace) {
            exeShikigamiPlace(i);
            return;
        }

        if (useShikigamiBlast) {
            exeShikigamiBlast(i);
            return;
        }

        if (useShikigamiBless) {
            exeShikigamiBless(i);
            return;
        }

        if (useShikigamiCurse) {
            exeShikigamiCurse(i);
            return;
        }

        if (useShikigamiPurge) {
            exeShikigamiPurge(i);
            return;
        }

        if (useSwidden) {
            exeSwidden(i);
            return;
        }

        if (useSacrifice) {
            exeSacrifice(i);
            return;
        }

        if (useKimon) {
            exeKimon(i);
            return;
        }

        if (useFrostArea) {
            exeFrostArea(i);
            return;
        }

        if (useRelocate) {
            exeRelocate(i);
            return;
        }

        if (useClone) {
            exeClone(i);
            return;
        }

        if (usePlunder) {
            exePlunder(i);
            return;
        }

        if (useIcicle) {
            // 氷柱: 通る線の基点を選び直せる（方向は盤の下のボタンで選ぶ）
            setIcicleCell(i);
            return;
        }

        if (useFreezeSpread) {
            exeFreezeSpread(i);
            return;
        }

        if (useShatter) {
            exeShatter(i);
            return;
        }

        if (useTinder) {
            if (!tinderCandidates().includes(i)) return; // 🌱も🍂も無いコマは選び直せる
            exeTinder(i);
            return;
        }

        if (useIgnite) {
            exeIgnite(i);
            return;
        }

        if (useLock > 0) {
            if (!lockable(nextBoard[i])) return; // 氷結中のマスにはロックできない。選び直せる
            applyLock(nextBoard, i);
            harvestMagic(1);
            addLog(`${posName(i)}をロック`);
            playEffect('lock', i);
            setUseLock(useLock - 1);
            setCurrentBoard(nextBoard);
            return;
        }

        if (useInjection > 0) {
            nextBoard[i] = poisonStrike({ ...nextBoard[i], effects: [...nextBoard[i].effects, { effect: '☠' }] });
            toxicBloom(nextBoard, [i]);
            harvestMagic(1);
            addLog(`${posName(i)}に毒を注入`);
            setUseInjection(useInjection - 1);
            playEffect('poison', i, undefined, 'インジェクション');
            setCurrentBoard(nextBoard);
            return;
        }

        if (usePandemic) {
            exePandemic(i);
            return;
        }

        if (useStomp) {
            exeStomp(i, nextBoard);
            return;
        }

        if (useJudgeDay) {
            exeJudgeDay(i);
            return;
        }

        if (calculateWinner(lineSymbols(currentBoard))) {
            return;
        } else if (moveBlocked(lifeBan[turnSeat], life)) {
            return; // ライフ3以下のコマは置けない（ライフを上げるか、チャージで手番を終える）
        } else if (currentBoard[i].player && currentBoard[i].player !== currentTurnPlayer) {
            if (currentBoard[i].bind > 0 && !canHitBound(currentCharacter, currentBoard, seatCount)) {
                return;
            }
        }

        if (nextBoard[i].effects.find((x) => x.effect === '🔑') && nextBoard[i].bind > 0) {
            return;
        }

        // ❄氷結中の空きマスには、🔑ロック中と同様に誰も着手できない
        if (emptyBlocked(currentBoard[i])) {
            return;
        }

        // ❄氷結中の自陣コマには重ねて強化できない
        if (currentBoard[i].player === currentTurnPlayer && overwriteBlocked(currentBoard[i])) {
            return;
        }

        const nextHistory = [...history.slice(0, currentTurn + 1), nextBoard];
        playSfx('place');

        // 毒で bind が 0 になったマス（拡散パッシブの起点）
        const spreadOrigins: number[] = [];
        let poisonVanished = 0;
        // 3人以上は手番が1周するごとに1回だけ減衰させる (issue #30)
        ruinState.current.lastMove = i;
        const decayNow = shouldDecay(placements, seatCount);
        setPlacements(placements + 1);
        // 自然減衰・🔥と毒の継続ダメージ・ロックの期限切れ・毒で0になったコマの消滅は decay.ts で sim と共有
        const decayed = decayNow ? decayBoard(nextBoard, i, characters, symbols, isCrowded(nextBoard, seatCount)) : null; // 満杯の盤面は自然減衰がもう1回
        const burnCells = decayed?.burnCells ?? [];
        if (decayed) {
            spreadOrigins.push(...decayed.spreadOrigins);
            poisonVanished = decayed.spreadOrigins.length;
            for (const s of decayed.emptyLockSpawns) {
                const owner = nextBoard[s].player;
                addLog(`空蔵: ${posName(s)}が${owner}のコマになった`);
                gearTrigger('emptyLock', `${posName(s)}にコマ`);
                playBurst('gearEmpty', [s]);
            }
        }
        // 🔥の継続ダメージを受けたマスに炎の小演出
        playBurst('burn', burnCells);
        // 毒使い側は、毒で空いたマス1つにつき魔力+1
        if (poisonVanished > 0) {
            characters.forEach((c, seat) => {
                if (c === 'poisoner') setMagicAt(seat, (m) => m + poisonVanished);
            });
            addLog(`毒でマスが${poisonVanished}個消えた${poisonerInPlay ? '（毒使いの魔力+' + poisonVanished + '）' : ''}`);
        }

        // 着手の結果（強化・奪取・破壊・攻撃・新規）は placement.ts で sim と共有
        const placed = resolvePlacement(nextBoard[i], currentTurnPlayer, life);
        const capturedFrom = placed.capturedFrom; // 通常の攻撃で奪取した相手（復讐の刃）
        if (placed.poisonSpread) spreadOrigins.push(i); // 毒持ちの敵コマを奪取/破壊した場合は拡散の起点にする
        if (placed.corpse) addCorpses(1); // 敵味方問わずコマが奪われる/消えるたびに墓地+1
        const newPlayer = placed.square.player;
        const newEffects = placed.square.effects;
        if (newPlayer === currentTurnPlayer && useBuds[0]) {
            newEffects.push(...Array<Effect>(useBuds[1]).fill({ effect: '🌱' }));
            setUseBuds([false, 0]);
        }

        nextBoard[i] = { player: newPlayer, bind: placed.square.bind, effects: newEffects };

        // 復讐の刃: 奪われた側は魔力を得る（1手の獲得は上限あり）。奪った側が装備していれば魔力を失う
        const vengeanceGained: Record<number, number> = {};
        const vengeanceGain = (seat: number) => {
            if (!hasGear(gearsBySeat[seat], 'vengeance')) return;
            const add = Math.min(GEAR_PARAMS.vengeanceGain, GEAR_PARAMS.vengeanceCap - (vengeanceGained[seat] ?? 0));
            if (add <= 0) return;
            vengeanceGained[seat] = (vengeanceGained[seat] ?? 0) + add;
            setMagicAt(seat, (m) => m + add);
            addLog(`復讐の刃: ${symbols[seat]}の魔力+${add}`);
            gearTrigger('vengeance', `魔力+${add}`);
        };
        if (capturedFrom) {
            vengeanceGain(seatOf(capturedFrom));
            if (hasGear(turnGears, 'vengeance')) {
                setMagicAt(turnSeat, (m) => Math.max(0, m - GEAR_PARAMS.vengeancePenalty));
                gearTrigger('vengeance', `魔力-${GEAR_PARAMS.vengeancePenalty}`);
            }
        }

        if (!prevPlayer) {
            addLog(`${posName(i)}にコマを配置`);
        } else if (prevPlayer === currentTurnPlayer) {
            addLog(`${posName(i)}のコマを強化`);
        } else if (newPlayer === currentTurnPlayer) {
            addLog(`${posName(i)}の相手のコマを奪取`);
        } else if (!newPlayer) {
            addLog(`${posName(i)}の相手のコマを破壊`);
        } else {
            addLog(`${posName(i)}の相手のコマを攻撃`);
        }

        if (useAssault[turnSeat] > 0) {
            const emptyIndex = randomPick(findEmptyIndexes(nextBoard));
            nextBoard[emptyIndex] = { player: currentTurnPlayer, bind: 0, effects: [] };
            if (chargeBuff[turnSeat] > 0) nextBoard[emptyIndex] = addCharge(nextBoard[emptyIndex], characters);
            addLog(`全軍突撃で${posName(emptyIndex)}にトークンを設置`);
            setUseAssaultAt(turnSeat, useAssault[turnSeat] - 1);
        }

        // 増殖発動中: 着手のたびにコマ→アイテムを交互に1つずつ追加し続ける
        if (proliferate[turnSeat]) {
            const nextCount = proliferateCount[turnSeat] + 1;
            const added = applyProliferate(nextBoard, nextCount);
            if (added) {
                addLog(`増殖(${nextCount}回目): ${added}`);
                playEffect('proliferate');
                setProliferateCountAt(turnSeat, nextCount);
                // 上限に達したら自然収束（維持コストの暴走とループの無限化を防ぐ）
                if (nextCount >= proliferateMaxStacks) {
                    addLog('増殖が限界に達して収束した');
                    setProliferateAt(turnSeat, false);
                    setProliferateCountAt(turnSeat, 0);
                }
            }
        }

        // ⚡発火: 着手マスの隣にある帯電マスが、その縦横隣接のコマへ1ダメージ（蘇生の吸収より前）
        const fire = fireCharges(nextBoard, i, geo.size, characters, gearsBySeat.map((g) => hasGear(g, 'conduction')));
        if (fire.fired.length > 0) {
            addLog(`⚡発火（${fire.fired.map(posName).join('・')}）${fire.damaged.length > 0 ? `で${fire.damaged.length}コマにダメージ` : ''}`);
            flashCells(fire.damaged);
            playEffect('zap', fire.fired[0], undefined, '⚡発火');
            if (fire.carried.length > 0) gearTrigger('conduction', `毒・火炎が${fire.carried.length}マスに移った`);
        }

        // 静電気の季節: 新しく置いた（奪った）自分のコマに⚡を付ける。発火のあとに付けるので、自分では発火しない（補強は設置ではないので対象外）
        let buffCharged = false;
        if (chargeBuff[turnSeat] > 0 && prevPlayer !== currentTurnPlayer && nextBoard[i].player === currentTurnPlayer) {
            nextBoard[i] = addCharge(nextBoard[i], characters);
            buffCharged = true;
        }

        // 巨人のオーラ: 周囲8マスの敵コマを破壊し、周囲8マス全部をロックする
        if (currentCharacter === 'giant' && nextBoard[i].player === currentTurnPlayer) {
            const aura = giantAura(nextBoard, geo.surroundRange(i), currentTurnPlayer, characters);
            if (aura.destroyed.length > 0) addCorpses(aura.destroyed.length);
            if (aura.destroyed.length > 0 || aura.locked.length > 0) {
                addLog(`巨人のオーラ: ${aura.destroyed.length}コマを破壊、${aura.locked.length}マスをロック`);
                flashCells(aura.destroyed);
            }
        }

        // 蘇生発動中: ライフが0になった敵コマを自動で自陣に吸収する
        if (necroActive) {
            const absorbedCells = absorbDefeated(nextBoard, currentTurnPlayer);
            absorbedCells.forEach((c) => vengeanceGain(seatOf(c.from)));
            const absorbed = absorbedCells.length;
            if (absorbed > 0) {
                addLog(`蘇生発動中: ライフ0の敵コマ${absorbed}個を自陣に吸収`);
                addCorpses(absorbed);
            }
        }

        // 毒拡散パッシブ: 毒で死んだ/毒持ちが奪取破壊されたマスの周囲へ毒を拡散
        if (poisonerInPlay && spreadOrigins.length > 0) {
            for (const o of spreadOrigins) spreadPoisonAround(nextBoard, o);
            addLog('毒が周囲に拡散');
        }

        setCurrentBoard(buffCharged ? withOverload(nextBoard) : nextBoard);

        setHistory(nextHistory);
        setCurrentTurn(currentTurn + 1);
    };

    const charge = 3;
    const onClickCharge = () => {
        playEffect('chargeUp', undefined, undefined, `チャージ+${charge}`);
        addLog(`「チャージ」を使用（ターン終了・マジック+${charge}）`);
        setMagicAt(turnSeat, (m) => m + charge);
        setCurrentTurn(currentTurn + 1);
    };

    const onClickAddLife = () => {
        addLog('「ライフ3」を使用（ライフ+3）');
        playEffect('heal');
        setLife(life + 3);
        spendMagic(calculateCost(seatCosts.onClickAddLife, false, false, currentTurnPlayer, 'onClickAddLife'), true, true, 'onClickAddLife');
    };

    const onClickShuffle = () => {
        addLog('「シャッフル」を使用');
        playEffect('shuffle');
        // 手札はデッキ（12枚）から引く
        setSkills(reshuffledSkills(deckBySeat[turnSeat], currentLockedSkills));
        spendMagic(seatCosts.onClickShuffle, true, false);
    };

    const onClickBibine = () => {
        addLog('「バイバイン」を使用（ライフ2倍）');
        playEffect('double');
        setLife(life * 2);
        spendMagic(calculateCost(seatCosts.onClickBibine, false, false, currentTurnPlayer, 'onClickBibine'), true, true, 'onClickBibine');
    };

    // --- 毒（毒使い）関連 ---
    // どちらかが毒使いなら、毒セルが死んだ時の「周囲へ毒拡散」パッシブが有効になる
    const poisonerInPlay = characters.includes('poisoner');
    // 指定プレイヤーの自陣にある毒スタック数（休眠マスの☠は数えない）
    const poisonCount = (player: Player): number => poisonCountFor(currentBoard, player);
    // 毒使いの駒に毒が付いた瞬間、そのマスのライフが POISON_LIFE_MULT 倍になる（毒を付与した直後のマスに適用する）
    const poisonStrike = (sq: SquareInfo): SquareInfo => poisonStrikeOf(sq, characters);
    // --- ギアのエフェクト系ヘルパー（sim/engine.js の同名関数と同じ規則） ---
    // ロックを付ける。期間(ライフ)は堅牢の鍵で延びる。空きマスなら空蔵の持ち主を記録しておく
    const applyLock = (board: SquareInfo[], idx: number) => {
        applyLockAt(board, idx, turnGears, turnSeat);
    };
    // 毒花: 毒が付いたコマ(cells)のうち、持ち主が毒花を装備しているものに、1つずつバッズも付く。
    // 誰が付けた毒でも発動する（自分で付けた毒でも、相手から付けられた毒でも。毒を付ける側の装備は関係ない）
    const toxicBloom = (board: SquareInfo[], cells: number[]) => {
        for (const k of cells) {
            const owner = board[k].player;
            if (!owner || !hasGear(gearsBySeat[seatOf(owner)], 'toxicBloom')) continue;
            board[k] = { ...board[k], effects: [...board[k].effects, { effect: '🌱' }] };
            addLog(`毒花: ${posName(k)}にバッズ`);
            gearTrigger('toxicBloom', 'バッズ付与');
            playBurst('gearBloom', [k]);
        }
    };
    // トークン系スキルでコマを置いた後の処理: 道連れの鍵(確率でロック) と 伝播(周囲のコマに同じエフェクト)。
    // effect はトークンが持つエフェクト。収穫に渡す「付与したエフェクト数」を返す
    const afterTokenPlaced = (board: SquareInfo[], idx: number, effect?: TokenEffect): number => {
        let granted = effect ? 1 : 0;
        // 静電気の季節: 設置したトークンに⚡（収穫・伝播には数えない）
        if (chargeBuff[turnSeat] > 0 && board[idx].player === currentTurnPlayer) board[idx] = addCharge(board[idx], characters);
        if (hasGear(turnGears, 'bindingLock') && Math.random() < GEAR_PARAMS.bindingLockChance) {
            applyLock(board, idx);
            granted += 1;
            addLog(`道連れの鍵: ${posName(idx)}にロックが付いた`);
            gearTrigger('bindingLock', 'ロック付与');
            playBurst('gearKey', [idx]);
        }
        if (effect && hasGear(turnGears, 'propagate')) {
            const j = propagateEffect(board, idx, effect, currentTurnPlayer, characters);
            if (j !== null) {
                granted += 1;
                addLog(`伝播: ${posName(j)}に${effect}が広がった`);
                gearTrigger('propagate', `${effect}が広がった`);
                playBurst('gearSpread', [j]);
            }
        }
        return granted;
    };
    // 周囲1マスのコマ(敵味方問わず)1つにランダムで毒を1付与する（毒拡散パッシブ）
    const spreadPoisonAround = (board: SquareInfo[], idx: number) => {
        const targets = geo.surroundRange(idx).filter((j) => board[j].player);
        if (targets.length === 0) return;
        const t = randomPick(targets);
        board[t] = poisonStrike({ ...board[t], effects: [...board[t].effects, { effect: '☠' }] });
        toxicBloom(board, [t]);
    };
    const [useInjection, setUseInjection] = useState<number>(0);
    const [usePandemic, setUsePandemic] = useState<boolean>(false);
    // ミアズマの実コスト: 基礎 - 自陣の毒の数、毒使い割引(-1)、下限は MIASMA_MIN_COST
    const miasmaCost = (player: Player = currentTurnPlayer): number =>
        Math.max(MIASMA_MIN_COST, calculateCost(costTableFor(seatOf(player)).onClickMiasma - poisonCount(player), false, true, player, 'onClickMiasma'));
    // ミアズマが毒を付与するマス → 付与する毒の数。自陣の毒が乗っているマスごとに、周囲1マスの敵マス(ロック/無敵は除く)へ1つずつ（重複あり）
    const miasmaPlan = (board: SquareInfo[], player: Player): Map<number, number> => miasmaPlanOf(board, player, characters);

    const budsReduce = 1;
    const [useBuds, setUseBuds] = useState<[boolean, number]>([false, 0]);
    const budsCount = (player: Player): number => {
        const ownerSquares = currentBoard.filter((x) => x.player === player);
        return ownerSquares
            .map((x) => x.effects)
            .flat()
            .filter((x) => x.effect === '🌱').length;
    };
    // 氷結中のマスの🌱は消えないが休眠していて、魔力ボーナスに数えない（冬至の種子のガード中を除く）
    const activeBudsCount = (player: Player): number =>
        currentBoard.filter((x) => x.player === player).reduce((n, sq) => n + activeBuds(sq, budGuard[seatOf(player)]), 0);

    const onClickBuds = () => {
        addLog('「バッズ」を使用（次の一手でバッズを植える）');
        playEffect('bloom', undefined, undefined, 'バッズ');
        harvestMagic(1);
        setUseBuds([true, useBuds[1] + 1]);
        spendMagic(calculateCost(seatCosts.onClickBuds, false, false, currentTurnPlayer, 'onClickBuds'), true, true, 'onClickBuds');
    };

    const onClickDoubleBuds = () => {
        addLog('「ダブルバッズ」を使用（次の一手でバッズを2つ植える）');
        playEffect('bloom', undefined, undefined, 'ダブルバッズ');
        harvestMagic(2);
        setUseBuds([true, useBuds[1] + 2]);
        spendMagic(calculateCost(seatCosts.onClickDoubleBuds, false, false, currentTurnPlayer, 'onClickDoubleBuds'), true, true, 'onClickDoubleBuds');
    };

    const [useLock, setUseLock] = useState<number>(0);
    const onClickUseLock = () => {
        addLog('「ロック」を使用（マスを選択）');
        setUseLock(useLock + 1);
        spendMagic(calculateCost(seatCosts.onClickUseLock, false, false, currentTurnPlayer, 'onClickUseLock'), true, true, 'onClickUseLock');
    };

    const onClickUseDoubleLock = () => {
        addLog('「ダブルロック」を使用（マスを2つ選択）');
        setUseLock(useLock + 2);
        spendMagic(calculateCost(seatCosts.onClickDoubleLock, false, false, currentTurnPlayer, 'onClickDoubleLock'), true, true, 'onClickDoubleLock');
    };

    const onClickUseTripleLock = () => {
        addLog('「トリプルロック」を使用（マスを3つ選択）');
        setUseLock(useLock + 3);
        spendMagic(calculateCost(seatCosts.onClickTripleLock, false, false, currentTurnPlayer, 'onClickTripleLock'), true, true, 'onClickTripleLock');
    };

    const unlockCost = 4;
    const onClickUnlock = () => {};

    // 「ライフを0にする」スキルを1マスに当てる。氷結中ならライフはそのまま氷結だけ解除（false）、そうでなければ0にして🔥も消す（true）
    const zeroBySkill = (board: SquareInfo[], idx: number, broken: number[]): boolean => {
        const guard = absorbDestroy(board[idx]);
        if (guard.blocked) {
            board[idx] = guard.sq;
            broken.push(idx);
            return false;
        }
        board[idx] = zeroOut(board[idx]);
        return true;
    };

    const onClickOpium = () => {
        addLog('「オピウム」を使用（相手の全コマのライフ-2・ターン終了）');
        const board = currentBoard.slice();
        const affected: number[] = [];
        const iceBroken: number[] = [];
        board.forEach((square, idx) => {
            if (square.player !== currentTurnPlayer && square.player && square.bind > 0 && !isGuarded(square, characters)) {
                // スキルダメージ: 氷結なら解除だけ、🔥なら1.5倍。-2して1以下になったマスはライフ0
                const hit = applyDamage(square, 2, 'skill');
                board[idx] = hit.blocked || hit.sq.bind > 1 ? hit.sq : { ...hit.sq, bind: 0 };
                if (hit.blocked) iceBroken.push(idx);
                else affected.push(idx);
            }
        });
        if (iceBroken.length > 0) addLog(`氷結が身代わりになった（${iceBroken.map(posName).join('・')}）`);
        flashCells(affected);
        playEffect('opium');
        playBurst('iceBreak', iceBroken);
        setCurrentBoard(board);
        spendMagic(calculateCost(seatCosts.onClickOpium, false, false, currentTurnPlayer, 'onClickOpium'), true, true, 'onClickOpium');
        setCurrentTurn(currentTurn + 1);
    };

    const onClickSlash = () => {
        addLog(`「スラッシュ」を使用（右上→左下の${geo.size}マスのライフを0に）`);
        const board = currentBoard.slice();
        const affected: number[] = [];
        const broken: number[] = [];
        for (const idx of geo.antiDiagonal) {
            if (!isGuarded(board[idx], characters)) {
                if (zeroBySkill(board, idx, broken)) affected.push(idx);
            }
        }
        flashCells(affected);
        playEffect('slash');
        playBurst('iceBreak', broken);
        setCurrentBoard(board);
        spendMagic(calculateCost(seatCosts.onClickSlash, false, false, currentTurnPlayer, 'onClickSlash'), true, true, 'onClickSlash');
    };

    const onClickBackSlash = () => {
        addLog(`「バックスラッシュ」を使用（左上→右下の${geo.size}マスのライフを0に）`);
        const board = currentBoard.slice();
        const affected: number[] = [];
        const broken: number[] = [];
        for (const idx of geo.mainDiagonal) {
            if (!isGuarded(board[idx], characters)) {
                if (zeroBySkill(board, idx, broken)) affected.push(idx);
            }
        }
        flashCells(affected);
        playEffect('backslash');
        playBurst('iceBreak', broken);
        setCurrentBoard(board);
        spendMagic(calculateCost(seatCosts.onClickBackSlash, false, false, currentTurnPlayer, 'onClickBackSlash'), true, true, 'onClickBackSlash');
    };

    const onClickBothToken = () => {
        const board = currentBoard.slice();
        const emptyIndexes = findEmptyIndexes(board);
        // 参加者全員に1つずつ（席順に空きマスからランダムに）。空きが足りなければ先着の席だけ
        const picks = randomAnyPick(emptyIndexes, Math.min(seatCount, emptyIndexes.length));
        addLog(`「両トークン」を使用（${picks.map((idx, seat) => `${symbols[seat]}: ${posName(idx)}`).join(' / ')}に設置）`);
        let granted = 0;
        picks.forEach((idx, seat) => {
            board[idx] = { player: symbols[seat], bind: seat === turnSeat ? calculateTokenBind() : 4, effects: [] };
            if (seat === turnSeat) granted += afterTokenPlaced(board, idx);
        });
        harvestMagic(granted);
        playEffect('token', undefined, picks, '両トークン');
        spendMagic(calculateCost(seatCosts.onClickBothToken, true, false, currentTurnPlayer, 'onClickBothToken'), true, true, 'onClickBothToken');
        setCurrentBoard(board);
        setUseToken(true);
    };

    const onClickToken = () => {
        const board = currentBoard.slice();
        const emptyIndexes = findEmptyIndexes(board);
        const index = randomPick(emptyIndexes);
        board[index] = { player: currentTurnPlayer, bind: calculateTokenBind(), effects: [] };
        addLog(`「トークン」を使用（${posName(index)}に設置）`);
        playEffect('token', index, [index], 'トークン');
        harvestMagic(afterTokenPlaced(board, index));
        setCurrentBoard(board);
        spendMagic(calculateCost(seatCosts.onClickToken, true, false, currentTurnPlayer, 'onClickToken'), true, true, 'onClickToken');
        setUseToken(true);
    };

    const onClickDoubleToken = () => {
        const board = currentBoard.slice();
        const emptyIndexes = findEmptyIndexes(board);
        const [emptyIndex1, emptyIndex2] = randomAnyPick(emptyIndexes, 2);
        board[emptyIndex1] = { player: currentTurnPlayer, bind: calculateTokenBind(), effects: [] };
        board[emptyIndex2] = { player: currentTurnPlayer, bind: calculateTokenBind(), effects: [] };
        addLog(`「ダブルトークン」を使用（${posName(emptyIndex1)}・${posName(emptyIndex2)}に設置）`);
        playEffect('token', undefined, [emptyIndex1, emptyIndex2], 'ダブルトークン');
        harvestMagic(afterTokenPlaced(board, emptyIndex1) + afterTokenPlaced(board, emptyIndex2));
        setCurrentBoard(board);
        spendMagic(calculateCost(seatCosts.onClickDoubleToken, true, false, currentTurnPlayer, 'onClickDoubleToken'), true, true, 'onClickDoubleToken');
        setUseToken(true);
    };

    const calculateTokenBind = (): number => tokenBindOf(currentCharacter, turnGears);

    const onClickBudsToken = () => {
        const board = currentBoard.slice();
        const emptyIndexes = findEmptyIndexes(board);
        const index = randomPick(emptyIndexes);
        board[index] = { player: currentTurnPlayer, bind: calculateTokenBind(), effects: [{ effect: '🌱' }] };
        addLog(`「バッズトークン」を使用（${posName(index)}に設置）`);
        playEffect('token', index, [index], 'バッズトークン');
        harvestMagic(afterTokenPlaced(board, index, '🌱'));
        setCurrentBoard(board);
        spendMagic(calculateCost(seatCosts.onClickBudsToken, true, false, currentTurnPlayer, 'onClickBudsToken'), true, true, 'onClickBudsToken');
        setUseToken(true);
    };

    const onClickTsunami = () => {
        addLog('「チューチュートレイン」を使用（相手全員のマジックを0に・ターン終了）');
        otherSeats(turnSeat).forEach((seat) => setMagicAt(seat, 0));
        playEffect('tsunami');
        spendMagic(calculateCost(seatCosts.onClickTsunami, false, false, currentTurnPlayer, 'onClickTsunami'), true, true, 'onClickTsunami');
        setCurrentTurn(currentTurn + 1);
    };

    const onClickWalpurgisNight = () => {
        addLog('「ワルプルギスの夜」を使用（全コマにバッズを植える）');
        const board = currentBoard.slice();
        let planted = 0;
        for (const square of board) {
            if (square.player && !square.effects.map((x) => x.effect).includes('🔑')) {
                square.effects.push({ effect: '🌱' });
                planted++;
            }
        }
        harvestMagic(planted);
        setCurrentBoard(board);
        playEffect('auraGreen');
        spendMagic(calculateCost(seatCosts.onClickWalpurgisNight, false, false, currentTurnPlayer, 'onClickWalpurgisNight'), true, true, 'onClickWalpurgisNight');
    };

    const totalAssaultCost = gearCost(totalAssaultBase(seatCosts.onClickTotalAssault, useTokenCount[turnSeat]), turnSeat, false, 'onClickTotalAssault');
    const [useAssault, setUseAssaultAt, setUseAssaultAll] = useSeatArray<number>(() => Array(seatCount).fill(0));
    const onClickTotalAssault = () => {
        addLog('「全軍突撃」を使用（3ターンの間ターン終了時にトークン設置）');
        playEffect('assault');
        setUseAssaultAt(turnSeat, 3);
        spendMagic(totalAssaultCost, false, true, 'onClickTotalAssault');
        setUseTokenCountAt(turnSeat, 0);
    };

    // 増殖の1ループ分を盤面に適用する。奇数回=コマ(キャラ)、偶数回=アイテムを追加。
    // 何も追加できなかった場合は null を返し、ループ回数を進めない（維持コストを不当に上げないため）
    const applyProliferate = (board: SquareInfo[], step: number): string | null => {
        const r = proliferateStep(board, step, currentTurnPlayer, currentCharacter, characters);
        if (!r) return null;
        if (r.added === 'piece') return `${posName(r.cell)}にライフ${proliferateTokenLife}のコマを追加`;
        if (r.added === '☠') toxicBloom(board, [r.cell]);
        return `${posName(r.cell)}に${r.added}を追加`;
    };

    // 静電気の季節: 今の手番を含む3ターンの間、自分が設置する駒（着手・トークン・全軍突撃のトークン）に⚡を付ける。雷霆の巫以外は乗った時点でダメージを受ける
    const CHARGE_SEASON_TURNS = 3;
    const onClickChargeSeason = () => {
        addLog(`「静電気の季節」を使用（今の手番を含む${CHARGE_SEASON_TURNS}ターン、設置する駒に⚡）`);
        playEffect('staticSeason');
        setChargeBuffAt(turnSeat, CHARGE_SEASON_TURNS);
        spendMagic(calculateCost(seatCosts.onClickChargeSeason, false, false, currentTurnPlayer, 'onClickChargeSeason'), true, true, 'onClickChargeSeason');
    };
    // 総毛立つ: 自陣の全てのコマ（🔑ロック中を除く）に⚡を1つずつ付ける。雷霆の巫以外は乗った時点でダメージを受ける
    const bristleTargets = (): number[] =>
        currentBoard.map((sq, i) => (sq.player === currentTurnPlayer && !sq.effects.some((e) => e.effect === '🔑') ? i : -1)).filter((i) => i !== -1);
    const onClickBristle = () => {
        const cells = bristleTargets();
        if (cells.length === 0) return;
        addLog(`「総毛立つ」を使用（自陣${cells.length}コマに⚡）`);
        flashCells(cells);
        playEffect('bristle', undefined, cells);
        setCurrentBoard(withOverload(withCharge(currentBoard, cells, characters)));
        spendMagic(calculateCost(seatCosts.onClickBristle, false, false, currentTurnPlayer, 'onClickBristle'), true, true, 'onClickBristle');
    };

    // 雷のない所に火は立たぬ: ⚡のあるコマを1つ選んで破壊し（氷結中なら❄-1だけ）、周囲8マスの敵コマのうち2〜全部をランダムに選んで🔥を1つずつ付ける。
    // 選べるのは⚡のあるコマ。自分の無敵マスは選べるが、🔑ロック中のコマと他人の無敵マスは選べない
    const [useThunderFire, setUseThunderFire] = useState<boolean>(false);
    const thunderFireTargets = (): number[] =>
        currentBoard
            .map((sq, i) => (sq.player && chargeStacks(sq) > 0 && !sq.effects.some((e) => e.effect === '🔑') && (sq.player === currentTurnPlayer || !isShielded(sq, characters)) ? i : -1))
            .filter((i) => i !== -1);
    const onClickThunderFire = () => {
        addLog('「雷のない所に火は立たぬ」を使用（⚡のあるコマを選択）');
        setUseThunderFire(true);
        spendMagic(calculateCost(seatCosts.onClickThunderFire, false, false, currentTurnPlayer, 'onClickThunderFire'), true, true, 'onClickThunderFire');
    };
    const exeThunderFire = (i: number) => {
        const board = currentBoard.slice();
        setUseThunderFire(false);
        if (isFrozen(board[i])) {
            // 氷結中のコマは破壊されず❄が1つ減るだけ。破壊できなかったので火は燃え移らない
            board[i] = thawOne(board[i]);
            addLog(`${posName(i)}の氷結を1つ砕いた（コマは壊れず、火は燃え移らない）`);
            playBurst('iceBreak', [i]);
            setCurrentBoard(board);
            return;
        }
        board[i] = { player: undefined, bind: 0, effects: [] };
        addCorpses(1);
        const cands = geo.surroundRange(i).filter((j) => board[j].player && board[j].player !== currentTurnPlayer && !isGuarded(board[j], characters));
        const picks = thunderFireVictims(cands, Math.random);
        const thawed = ignite(board, picks, geo.size, 1, keepBuds).thawed;
        addLog(`${posName(i)}のコマを破壊し、周囲の敵${picks.length}コマに🔥`);
        if (thawed.length > 0) addLog(`氷結が溶けた（${thawed.map(posName).join('・')}）`);
        flashCells([i, ...picks]);
        playEffect('thunderFire', i, [i, ...picks]);
        playBurst('thaw', thawed);
        setCurrentBoard(board);
    };

    // 雷神のへそくり: 自陣のコマを1つ選んで⚡を全て取り除き、取り除いたスタック1つにつき、次に打つスキルのコストを-1する（軽減後は最低1）
    const [useStash, setUseStash] = useState<boolean>(false);
    const stashTargets = (): number[] =>
        currentBoard.map((sq, i) => (sq.player === currentTurnPlayer && chargeStacks(sq) > 0 ? i : -1)).filter((i) => i !== -1);
    const onClickStash = () => {
        addLog('「雷神のへそくり」を使用（⚡のある自陣のコマを選択）');
        setUseStash(true);
        spendMagic(calculateCost(seatCosts.onClickStash, false, false, currentTurnPlayer, 'onClickStash'), true, true, 'onClickStash');
    };
    const exeStash = (i: number) => {
        const n = chargeStacks(currentBoard[i]);
        if (n === 0) return;
        const board = currentBoard.slice();
        board[i] = { ...board[i], effects: board[i].effects.filter((e) => e.effect !== '⚡') };
        const d = gearTurn.current.discount[turnSeat];
        gearTurn.current.discount[turnSeat] = { ...d, next: d.next + n }; // 軽減札なので「次に打つスキル」を消費せず、足す
        addLog(`${posName(i)}の⚡${n}個を除去（次のスキル-${n}）`);
        flashCells([i]);
        playEffect('stash', i, [i]);
        setUseStash(false);
        setCurrentBoard(board);
    };

    // 落雷は忘れた頃に: 自陣の⚡をすべて取り除き、取り除いた数だけ敵の全コマにダメージを与える（ロック・無敵・氷結中・ライフ0のコマは受けない）。無敵だった自陣の⚡コマは普通のコマに戻る
    const ownChargeStacks = (): number => currentBoard.reduce((n, sq) => (sq.player === currentTurnPlayer ? n + chargeStacks(sq) : n), 0);
    const onClickRelease = () => {
        const board = currentBoard.slice();
        const r = releaseCharges(board, currentTurnPlayer, characters);
        if (r.removed === 0) return;
        addLog(`「落雷は忘れた頃に」を使用（自陣の⚡${r.removed}個を放出・敵${r.damaged.length}コマに${r.removed}ダメージ）`);
        flashCells(r.damaged);
        playEffect('thunderFall', undefined, r.damaged);
        setCurrentBoard(board);
        spendMagic(calculateCost(seatCosts.onClickRelease, false, false, currentTurnPlayer, 'onClickRelease'), true, true, 'onClickRelease');
    };

    // 裸の王様: 自分以外の全員のギアが、その席の次の手番の終わりまで無効になる（対象はギアを装備していて、まだ無効でない席）。クリック不要・手番は続く
    const stripTargets = (): number[] => otherSeats(turnSeat).filter((seat) => baseGearsBySeat[seat].length > 0 && !gearOff[seat]);
    const onClickStrip = () => {
        const seats = stripTargets();
        if (seats.length === 0) return;
        addLog(`「裸の王様」を使用（${seats.map((seat) => symbols[seat]).join('・')}のギアが次の手番の終わりまで無効）`);
        playEffect('strip');
        seats.forEach((seat) => setGearOffAt(seat, true));
        spendMagic(calculateCost(seatCosts.onClickStrip, false, false, currentTurnPlayer, 'onClickStrip'), true, true, 'onClickStrip');
    };

    // サイレンス: 自分以外の全員が、次の手番にスキルを使えなくなる
    const onClickSilence = () => {
        addLog('「サイレンス」を使用（相手は次の手番スキルを使えない）');
        playEffect('silence');
        otherSeats(turnSeat).forEach((seat) => setSilencedAt(seat, true));
        spendMagic(calculateCost(seatCosts.onClickSilence, false, false, currentTurnPlayer, 'onClickSilence'), true, true, 'onClickSilence');
    };

    const onClickProliferate = () => {
        addLog(`「増殖」を使用（以後の着手ごとにコマ⇄アイテムを追加。維持コストが毎回+${proliferateUpkeepStep}）`);
        playEffect('proliferate');
        setProliferateAt(turnSeat, true);
        setProliferateCountAt(turnSeat, 0);
        spendMagic(calculateCost(seatCosts.onClickProliferate, false, false, currentTurnPlayer, 'onClickProliferate'), true, true, 'onClickProliferate');
    };

    const [useStomp, setUseStomp] = useState<boolean>(false);
    const onClickStomp = () => {
        addLog('「ストンプ」を使用（マスを選択）');
        setUseStomp(true);
        spendMagic(gearCost(seatCosts.onClickStomp, turnSeat, false, 'onClickStomp'), false, true, 'onClickStomp');
    };

    // ストンプの破壊範囲 (クリックしたマスの周囲1マス)
    const exeStomp = (i: number, currentBoard: SquareInfo[]) => {
        const { range, destroyed, broken } = stompOf(currentBoard, i, currentTurnPlayer, life);
        addCorpses(destroyed);
        addLog(`${posName(i)}を中心にストンプを実行`);
        flashCells(range);
        playEffect('stomp', i);
        playBurst('iceBreak', broken);
        setCurrentBoard(currentBoard);
        setUseStomp(false);
    };

    const baseJudgeDayCost = seatCosts.onClickJudgeDay;
    const judgeDayCost = gearCost(judgeDayBase(baseJudgeDayCost, useMagicCount[turnSeat]), turnSeat, false, 'onClickJudgeDay');
    const [useJudgeDay, setUseJudgeDay] = useState<boolean>(false);
    const onClickJudgeDay = () => {
        addLog('「審判の日」を使用（マスを選択）');
        spendMagic(judgeDayCost, false, true, 'onClickJudgeDay');
        setUseMagicCountAt(turnSeat, 0);
        setUseJudgeDay(true);
    };

    // 審判の日の対象範囲

    const exeJudgeDay = (i: number) => {
        const board = currentBoard.slice();
        const { range: judgeIndexes, destroyed, broken } = judgeDayOf(board, i, currentTurnPlayer);
        addCorpses(destroyed);

        setUseMagicCountAt(turnSeat, 0);

        addLog(`${posName(i)}を中心に審判の日を実行`);
        flashCells(judgeIndexes);
        playEffect('judge', i);
        playBurst('iceBreak', broken);
        setCurrentBoard(board);
        setUseJudgeDay(false);
        setCurrentTurn(currentTurn + 1);
    };

    const onClickToggleYingYang = () => {
        addLog('「陰陽転化」を使用（陰陽モードを切替）');
        // 自分のモードを見て反転する (issue #12: 以前は💙のモードを見ていて⭕が永久に陽へ切り替えられなかった)
        playEffect('yinyang', undefined, undefined, undefined, { variant: currentYinYangMode === 'yang' ? '陰' : '陽' });
        setYinYangModeAt(turnSeat, (m) => (m === 'yang' ? 'ying' : 'yang'));
        spendMagic(gearCost(seatCosts.onClickToggleYingYang, turnSeat, false, 'onClickToggleYingYang'), false, true, 'onClickToggleYingYang');
    };

    // 式神(📜): 紙の分身。ライフ2で列には数えない。自分で補強すると🌱付きの自陣コマ、相手に乗っ取られると空きマスになる。
    // 陰: 任意の空きマスに置く(コスト2) / 陽: 自分の式神を1つ選んで爆破(コスト4)。sim/engine.js の SHIKIGAMI_* と同値
    const [useShikigamiPlace, setUseShikigamiPlace] = useState<boolean>(false);
    const [useShikigamiBlast, setUseShikigamiBlast] = useState<boolean>(false);
    const [useShikigamiBless, setUseShikigamiBless] = useState<boolean>(false);
    const [useShikigamiCurse, setUseShikigamiCurse] = useState<boolean>(false);
    const [useShikigamiPurge, setUseShikigamiPurge] = useState<boolean>(false);
    const ownShikigami = (): number[] => ownShikigamiCells(currentBoard, currentTurnPlayer);
    const onClickShikigamiPlace = () => {
        addLog('「式神設置」を使用（空きマスを選択）');
        setUseShikigamiPlace(true);
        spendMagic(gearCost(seatCosts.onClickShikigamiPlace, turnSeat, false, 'onClickShikigamiPlace'), false, true, 'onClickShikigamiPlace');
    };
    const exeShikigamiPlace = (i: number) => {
        if (!shikigamiLandable(currentBoard[i])) return; // 埋まっている・氷結中・ロック中のマスは選び直せる
        const board = currentBoard.slice();
        board[i] = newShikigami(currentTurnPlayer);
        gearTurn.current.shikiPlaced[turnSeat] = true;
        addLog(`${posName(i)}に式神を設置`);
        flashCells([i]);
        playEffect('shikigami', i);
        setUseShikigamiPlace(false);
        setCurrentBoard(board);
    };
    const onClickShikigamiBlast = () => {
        addLog('「式神爆破」を使用（自分の式神を選択）');
        setUseShikigamiBlast(true);
        spendMagic(gearCost(seatCosts.onClickShikigamiBlast, turnSeat, false, 'onClickShikigamiBlast'), false, true, 'onClickShikigamiBlast');
    };
    const exeShikigamiBlast = (i: number) => {
        if (!ownShikigami().includes(i)) return; // 自分の式神でないマスは選び直せる
        const board = currentBoard.slice();
        const { affected, broken, destroyed } = shikigamiBlast(board, i, currentTurnPlayer, characters);
        addCorpses(destroyed);
        addLog(`${posName(i)}の式神が爆破（周囲${affected.length}マスに影響${destroyed > 0 ? `・${destroyed}コマ破壊` : ''}）`);
        flashCells(affected);
        playEffect('shikigamiBlast', i);
        playBurst('iceBreak', broken);
        setUseShikigamiBlast(false);
        setCurrentBoard(board);
    };
    // 汎用(idx 88 式神の加護・コスト5): 自分の式神を1体選んで消費し、自陣のコマ全て（式神を除く）のライフを+3する。自陣のコマが無いと使えない。sim/engine.js の exeShikigamiBless と同値
    const blessTargets = (): number[] => blessTargetsOf(currentBoard, currentTurnPlayer);
    const onClickShikigamiBless = () => {
        if (ownShikigami().length === 0 || blessTargets().length === 0) return;
        addLog('「式神の加護」を使用（消費する自分の式神を選択）');
        setUseShikigamiBless(true);
        spendMagic(calculateCost(seatCosts.onClickShikigamiBless, false, false, currentTurnPlayer, 'onClickShikigamiBless'), true, true, 'onClickShikigamiBless');
    };
    const exeShikigamiBless = (i: number) => {
        if (!ownShikigami().includes(i)) return; // 自分の式神でないマスは選び直せる
        const board = currentBoard.slice();
        const targets = shikigamiBless(board, i, currentTurnPlayer);
        addLog(`${posName(i)}の式神を消費（自陣${targets.length}コマのライフ+${SHIKIGAMI_BLESS_LIFE}）`);
        flashCells([i, ...targets]);
        playEffect('shikigami', i, targets, '式神の加護');
        setUseShikigamiBless(false);
        setCurrentBoard(board);
    };
    // 汎用(idx 89 式神の呪詛・コスト5): 自分の式神を1体選んで消費し、エフェクトが乗っている敵のコマ全て（🔑ロック・無敵を除く）に☠を2つ付与する。対象が無いと使えない。sim/engine.js の exeShikigamiCurse と同値
    const curseTargets = (): number[] => curseTargetsOf(currentBoard, currentTurnPlayer, characters);
    const onClickShikigamiCurse = () => {
        if (ownShikigami().length === 0 || curseTargets().length === 0) return;
        addLog('「式神の呪詛」を使用（消費する自分の式神を選択）');
        setUseShikigamiCurse(true);
        spendMagic(calculateCost(seatCosts.onClickShikigamiCurse, false, false, currentTurnPlayer, 'onClickShikigamiCurse'), true, true, 'onClickShikigamiCurse');
    };
    const exeShikigamiCurse = (i: number) => {
        if (!ownShikigami().includes(i)) return; // 自分の式神でないマスは選び直せる
        const board = currentBoard.slice();
        const targets = shikigamiCurse(board, i, currentTurnPlayer, characters);
        harvestMagic(targets.length * SHIKIGAMI_CURSE_STACKS);
        toxicBloom(board, targets);
        addLog(`${posName(i)}の式神を消費（敵${targets.length}コマに☠×${SHIKIGAMI_CURSE_STACKS}）`);
        flashCells([i, ...targets]);
        playEffect('poison', i, targets, '式神の呪詛');
        setUseShikigamiCurse(false);
        setCurrentBoard(board);
    };
    // 汎用(idx 91 式神の供犠・コスト5、自陣の式神3体以上で0): 自陣の式神をランダムに1体壊し、続けて選んだ敵のコマ1体（式神を除く・🔑ロック/無敵を除く）のライフを0にする。sim/engine.js の exeShikigamiPurge と同値
    const purgeTargets = (): number[] => purgeTargetsOf(currentBoard, currentTurnPlayer, characters);
    const onClickShikigamiPurge = () => {
        const mine = ownShikigami();
        if (mine.length === 0 || purgeTargets().length === 0) return;
        addLog('「式神の供犠」を使用（式神を1体壊し、敵のコマを選択）');
        setUseShikigamiPurge(true);
        spendMagic(calculateCost(seatCosts.onClickShikigamiPurge, false, false, currentTurnPlayer, 'onClickShikigamiPurge'), true, true, 'onClickShikigamiPurge');
        const victim = mine[Math.floor(Math.random() * mine.length)]; // 先に1体壊す（コストは壊す前の式神の数で決まる）
        const board = currentBoard.slice();
        board[victim] = { player: undefined, bind: 0, effects: [] };
        flashCells([victim]);
        playEffect('shikigamiBlast', victim, undefined, '式神の供犠');
        setCurrentBoard(board);
    };
    const exeShikigamiPurge = (i: number) => {
        if (!purgeTargets().includes(i)) return; // 対象でない敵コマは選び直せる
        const board = currentBoard.slice();
        shikigamiPurge(board, i);
        addLog(`${posName(i)}のライフを0に`);
        flashCells([i]);
        playEffect('shikigamiBlast', i, undefined, '式神の供犠');
        setUseShikigamiPurge(false);
        setCurrentBoard(board);
    };
    // 汎用(idx 90 式神割引・コスト2): 次に打つスキルのコストを 2＋盤面にある式神の数 だけ軽減する（軽減札なので「次に打つスキル」を消費せず、足す）
    const onClickShikigamiDiscount = () => {
        const n = SHIKIGAMI_DISCOUNT_BASE + currentBoard.filter((sq) => isShikigami(sq)).length;
        addLog(`「式神割引」を使用（次のスキル-${n}）`);
        spendMagic(calculateCost(seatCosts.onClickShikigamiDiscount, false, false, currentTurnPlayer, 'onClickShikigamiDiscount'), true, true, 'onClickShikigamiDiscount');
        const d = gearTurn.current.discount[turnSeat];
        gearTurn.current.discount[turnSeat] = { ...d, next: d.next + n };
        playEffect('discount', undefined, undefined, '式神割引');
    };
    // 汎用(idx 71): 自分の式神を全て通常の自陣コマにする
    const onClickShikigamiAll = () => {
        const mine = ownShikigami();
        const board = currentBoard.slice();
        for (const i of mine) board[i] = { ...board[i], effects: board[i].effects.filter((e) => e.effect !== '📜') };
        if (mine.length === 0) return;
        addLog(`「式神一括」を使用（${mine.length}体が自陣のコマに）`);
        flashCells(mine);
        playEffect('shikigami');
        setCurrentBoard(board);
        // コストは式神1体あたり
        spendMagic(calculateCost(seatCosts.onClickShikigamiAll * mine.length, false, false, currentTurnPlayer, 'onClickShikigamiAll'), true, true, 'onClickShikigamiAll');
    };
    // 汎用(idx 73 百鬼夜行): 着手できる全ての空きマスにライフ0の式神を置く
    const onClickShikigamiFlood = () => {
        const board = currentBoard.slice();
        const placed: number[] = [];
        board.forEach((sq, i) => {
            if (shikigamiLandable(sq)) { board[i] = newShikigami(currentTurnPlayer, 0); placed.push(i); }
        });
        addLog(`「百鬼夜行」を使用（${placed.length}マスに式神）`);
        flashCells(placed);
        playEffect('shikigami');
        setCurrentBoard(board);
        spendMagic(calculateCost(seatCosts.onClickShikigamiFlood, false, false, currentTurnPlayer, 'onClickShikigamiFlood'), true, true, 'onClickShikigamiFlood');
        if (placed.length > 0) gearTurn.current.shikiPlaced[turnSeat] = true;
    };
    // 汎用(idx 72・トークン扱い): ランダムな空きマスに式神。トークン系ギア(補強・軽量)のライフ補正を受ける
    const onClickShikigamiRandom = () => {
        const board = currentBoard.slice();
        const emptyIndexes = findEmptyIndexes(board);
        if (emptyIndexes.length > 0) {
            const index = randomPick(emptyIndexes);
            board[index] = newShikigami(currentTurnPlayer, Math.max(1, SHIKIGAMI_LIFE + gearTokenBindDelta(turnGears)));
            addLog(`「式神ランダム設置」を使用（${posName(index)}に設置）`);
            flashCells([index]);
            playEffect('shikigami', index);
            harvestMagic(afterTokenPlaced(board, index));
            setCurrentBoard(board);
        }
        spendMagic(calculateCost(seatCosts.onClickShikigamiRandom, true, false, currentTurnPlayer, 'onClickShikigamiRandom'), true, true, 'onClickShikigamiRandom');
        if (emptyIndexes.length > 0) gearTurn.current.shikiPlaced[turnSeat] = true;
        setUseToken(true);
    };

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
        { name: '帯電拡散', run: () => setUseChargeSpread(true) },
    ];
    // ヘイルメアリーで引いたスキル名。マス選択型は演出より先に画面へ出すため、一定時間表示する
    const [hailMaryPick, setHailMaryPick] = useState<string | null>(null);
    const HAIL_MARY_INTRO_MS = 800;
    const HAIL_MARY_REVEAL_MS = 900;
    // forcedName: AI が事前に対象を決めた当選スキル。省略時はここでランダムに選ぶ
    const exeHailMary = (forcedName?: string) => {
        const picked = hailMaryChoices.find((c) => c.name === forcedName) ?? randomPick(hailMaryChoices);
        addLog(`「ヘイルメアリー」を使用 → 「${picked.name}」が発動`);
        spendMagic(calculateCost(seatCosts.onClickHailMary, false, false, currentTurnPlayer, 'onClickHailMary'), true, true, 'onClickHailMary');
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
        spendMagic(calculateCost(seatCosts.onClickInjection, false, true, currentTurnPlayer, 'onClickInjection'), true, true, 'onClickInjection');
    };

    const onClickPoisonToken = () => {
        const board = currentBoard.slice();
        const emptyIndexes = findEmptyIndexes(board);
        const index = randomPick(emptyIndexes);
        board[index] = poisonStrike({ player: currentTurnPlayer, bind: calculateTokenBind(), effects: [{ effect: '☠' }] });
        addLog(`「ポイズントークン」を使用（${posName(index)}に設置）`);
        playEffect('token', index, [index], 'ポイズントークン');
        harvestMagic(afterTokenPlaced(board, index, '☠'));
        toxicBloom(board, [index]);
        setCurrentBoard(board);
        spendMagic(calculateCost(seatCosts.onClickPoisonToken, true, true, currentTurnPlayer, 'onClickPoisonToken'), true, true, 'onClickPoisonToken');
        setUseToken(true);
    };

    const onClickSerum = () => {
        addLog('「血清」を使用（自陣の毒をすべて除去）');
        playEffect('cleanse', undefined, undefined, '血清');
        const board = currentBoard.slice();
        clearOwnPoison(board, currentTurnPlayer);
        setCurrentBoard(board);
        spendMagic(calculateCost(seatCosts.onClickSerum, false, true, currentTurnPlayer, 'onClickSerum'), true, true, 'onClickSerum');
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
        spendMagic(calculateCost(seatCosts.onClickIntensify, false, true, currentTurnPlayer, 'onClickIntensify'), true, true, 'onClickIntensify');
    };

    const onClickPandemic = () => {
        addLog('「パンデミック」を使用（マスを選択）');
        setUsePandemic(true);
        spendMagic(calculateCost(seatCosts.onClickPandemic, false, true, currentTurnPlayer, 'onClickPandemic'), true, true, 'onClickPandemic');
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
        spendMagic(calculateCost(seatCosts.onClickPoisonMist, false, true, currentTurnPlayer, 'onClickPoisonMist'), true, true, 'onClickPoisonMist');
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
        spendMagic(calculateCost(seatCosts.onClickDarkPot, false, false, currentTurnPlayer, 'onClickDarkPot'), true, true, 'onClickDarkPot');
    };

    // 雷を食らわば皿まで: ⚡が効いている自陣のコマのライフを、⚡のスタック1つにつき+2する。この手番に付与した⚡の数だけコスト軽減（撃つとリセット）
    const chargeHealCells = (): number[] => currentBoard.map((sq, k) => (sq.player === currentTurnPlayer && chargeStacks(sq) > 0 && !isDormant(sq) ? k : -1)).filter((k) => k !== -1);
    const onClickChargeHeal = () => {
        const board = currentBoard.slice();
        const r = healCharged(board, currentTurnPlayer);
        if (r.healed.length === 0) return;
        addLog(`「雷を食らわば皿まで」を使用（${r.healed.length}コマのライフを合計+${r.total}）`);
        flashCells(r.healed);
        playEffect('thunderHeal', undefined, r.healed);
        setCurrentBoard(board);
        spendMagic(calculateCost(seatCosts.onClickChargeHeal, false, false, currentTurnPlayer, 'onClickChargeHeal'), true, true, 'onClickChargeHeal');
        gearTurn.current.chargeBase[turnSeat] = ownCharges(board, currentTurnPlayer); // 条件のリセット
    };

    // 一寸の虫に魂なし: 敵のライフ3以下のコマを全て破壊し（氷結中は❄-1だけ・🔑ロックと無敵は除く）、相手全員を次の手番の終わりまで「ライフ3以下のコマを置けない」縛りにする。
    // コストは盤面のコマの数だけ軽減（最低1）
    const onClickSmallFry = () => {
        const board = currentBoard.slice();
        const r = smallFry(board, currentTurnPlayer, characters);
        if (r.destroyed.length > 0) addCorpses(r.destroyed.length);
        otherSeats(turnSeat).forEach((seat) => setLifeBanAt(seat, true));
        addLog(`「一寸の虫に魂なし」を使用（ライフ3以下の敵コマ${r.destroyed.length}個を破壊${r.blocked.length > 0 ? `・氷結${r.blocked.length}個が身代わり` : ''}。相手は次の手番、ライフ3以下のコマを置けない）`);
        flashCells([...r.destroyed, ...r.blocked]);
        playEffect('silence', undefined, undefined, '一寸の虫に魂なし');
        setCurrentBoard(board);
        spendMagic(calculateCost(seatCosts.onClickSmallFry, false, false, currentTurnPlayer, 'onClickSmallFry'), true, true, 'onClickSmallFry');
    };

    // 初霜: 敵の🍂があるコマを全て凍結し、自陣にバッズトークンを1つ置く。トークン扱い。盤面の🍂が3枚以上ならコスト0
    const onClickFirstFrost = () => {
        if (useToken || firstFrostTargets(currentBoard, currentTurnPlayer, characters).length === 0) return;
        const pay = calculateCost(seatCosts.onClickFirstFrost, true, false, currentTurnPlayer, 'onClickFirstFrost'); // 凍結で🍂が休眠する前のコストで払う
        const board = currentBoard.slice();
        const frozen = firstFrost(board, currentTurnPlayer, characters);
        bumpGlacierCharge(frozen.length);
        const empties = findEmptyIndexes(board);
        let granted = 0;
        let index: number | undefined;
        if (empties.length) {
            index = randomPick(empties);
            board[index] = { player: currentTurnPlayer, bind: calculateTokenBind(), effects: [{ effect: '🌱' }] };
            granted = afterTokenPlaced(board, index, '🌱');
        }
        addLog(`「初霜」を使用（敵の🍂のあるコマ${frozen.length}個を凍結${index !== undefined ? `・${posName(index)}にバッズトークン` : ''}）`);
        flashCells(frozen);
        playEffect('freeze', index, frozen, '初霜');
        harvestMagic(granted);
        setCurrentBoard(board);
        spendMagic(pay, true, true, 'onClickFirstFrost');
        setUseToken(true);
    };
    // 吹き寄せ: 自陣にトークンを置き、盤面のエフェクトを全部そのマスに集める（氷結・⚡無敵のマスは動かさない）。トークン扱い
    const onClickGather = () => {
        const empties = findEmptyIndexes(currentBoard);
        if (useToken || empties.length === 0) return;
        const pay = calculateCost(seatCosts.onClickGather, true, false, currentTurnPlayer, 'onClickGather'); // 移す前のエフェクトの数で軽減する
        const board = currentBoard.slice();
        const index = randomPick(empties);
        const moved = gather(board, index, { player: currentTurnPlayer, bind: calculateTokenBind() }, characters, geo.size, keepBuds);
        const granted = afterTokenPlaced(board, index);
        addLog(`「吹き寄せ」を使用（${posName(index)}にトークンを置き、エフェクト${moved}個を集めた）`);
        playEffect('token', index, [index], '吹き寄せ');
        harvestMagic(granted);
        setCurrentBoard(board);
        spendMagic(pay, true, true, 'onClickGather');
        setUseToken(true);
    };
    // 山焼き: 敵のエフェクトがあるマス（氷結・⚡無敵を除く）全てに🔥を1つ付け、自陣にロック付きトークンを置く。トークン扱い
    const onClickBurnOff = () => {
        const empties = findEmptyIndexes(currentBoard);
        if (useToken || (empties.length === 0 && burnOffTargets(currentBoard, currentTurnPlayer, characters).length === 0)) return;
        const pay = calculateCost(seatCosts.onClickBurnOff, true, false, currentTurnPlayer, 'onClickBurnOff'); // 燃やす前のエフェクトの数で軽減する
        const board = currentBoard.slice();
        const r = burnOff(board, currentTurnPlayer, characters, geo.size, keepBuds);
        if (r.destroyed.length > 0) addCorpses(r.destroyed.length);
        const free = findEmptyIndexes(board);
        let granted = 0;
        let index: number | undefined;
        if (free.length) {
            index = randomPick(free);
            board[index] = { player: currentTurnPlayer, bind: calculateTokenBind(), effects: [] };
            applyLock(board, index);
            granted = afterTokenPlaced(board, index);
        }
        addLog(`「山焼き」を使用（敵のエフェクトのあるマス${r.cells.length}個に🔥${index !== undefined ? `・${posName(index)}にロック付きトークン` : ''}）`);
        flashCells(r.cells);
        playEffect('flame', index, r.cells, '山焼き');
        playBurst('thaw', r.thawed);
        harvestMagic(granted);
        setCurrentBoard(board);
        spendMagic(pay, true, true, 'onClickBurnOff');
        setUseToken(true);
    };
    // 無礼講: このターン、トークン系スキルのコストを0にする（手番が終わると切れる）
    const onClickFreeToken = () => {
        if (gearTurn.current.tokenFree[turnSeat]) return;
        const pay = calculateCost(seatCosts.onClickFreeToken, false, false, currentTurnPlayer, 'onClickFreeToken');
        gearTurn.current.tokenFree[turnSeat] = true;
        addLog('「無礼講」を使用（このターン、トークン系スキルのコストが0）');
        playEffect('token', undefined, undefined, '無礼講');
        spendMagic(pay, true, true, 'onClickFreeToken');
    };

    // --- 帯電（雷霆の巫） ---
    const [useChargeOne, setUseChargeOne] = useState<boolean>(false);
    const [useChargeSpread, setUseChargeSpread] = useState<boolean>(false);
    const [useChargeArea, setUseChargeArea] = useState<boolean>(false);
    const [useJammer, setUseJammer] = useState<boolean>(false);
    // 帯電付与・帯電拡散の実コスト: 基礎 - 盤面の⚡の数（キャラ補正後）、下限は CHARGE_MIN_COST (#43)
    const chargeOneCost = (player: Player = currentTurnPlayer): number =>
        reducedChargeCost(seatCosts.onClickChargeOne, currentBoard, (c) => calculateCost(c, false, false, player, 'onClickChargeOne'));
    const chargeSpreadCost = (player: Player = currentTurnPlayer): number =>
        reducedChargeCost(seatCosts.onClickChargeSpread, currentBoard, (c) => calculateCost(c, false, false, player, 'onClickChargeSpread'));
    // 帯電トークン: 空きマスにランダムに⚡付きのコマを置く（トークン扱い。発火はしない）
    const onClickChargeToken = () => {
        const board = currentBoard.slice();
        const emptyIndexes = findEmptyIndexes(board);
        if (emptyIndexes.length > 0) {
            const index = randomPick(emptyIndexes);
            board[index] = landCharge({ player: currentTurnPlayer, bind: calculateTokenBind(), effects: [{ effect: '⚡' }] }, characters);
            addLog(`「帯電トークン」を使用（${posName(index)}に設置）`);
            harvestMagic(afterTokenPlaced(board, index, '⚡'));
            playEffect('zap', index, undefined, '帯電トークン');
            setCurrentBoard(withOverload(board));
        }
        spendMagic(calculateCost(seatCosts.onClickChargeToken, true, false, currentTurnPlayer, 'onClickChargeToken'), true, true, 'onClickChargeToken');
        setUseToken(true);
    };
    // 帯電付与: 選んだマス（空きマスも可）に⚡を1つ付与する。雷霆の巫以外のコマは乗った時点で2ダメージ
    const onClickChargeOne = () => {
        addLog('「帯電付与」を使用（マスを選択）');
        setUseChargeOne(true);
        spendMagic(chargeOneCost(), true, true, 'onClickChargeOne');
    };
    // 固有スキル 帯電拡散: コマのあるマスだけを縦横に辿って届く全マスに⚡を付与する
    const onClickChargeSpread = () => {
        addLog('「帯電拡散」を使用（コマを選択）');
        setUseChargeSpread(true);
        spendMagic(chargeSpreadCost(), false, true, 'onClickChargeSpread');
    };
    // 帯電ダブルトークン: 空きマスにランダムに⚡付きのコマを2つ置く（トークン扱い。発火はしない）
    const onClickDoubleChargeToken = () => {
        const board = currentBoard.slice();
        const picks = randomAnyPick(findEmptyIndexes(board), 2).filter((idx) => idx !== undefined);
        for (const idx of picks) {
            board[idx] = landCharge({ player: currentTurnPlayer, bind: calculateTokenBind(), effects: [{ effect: '⚡' }] }, characters);
        }
        addLog(`「帯電ダブルトークン」を使用（${picks.map(posName).join('・')}に設置）`);
        if (picks.length > 0) playEffect('zap', picks[0], undefined, '帯電ダブルトークン');
        setCurrentBoard(withOverload(board));
        spendMagic(calculateCost(seatCosts.onClickDoubleChargeToken, true, false, currentTurnPlayer, 'onClickDoubleChargeToken'), true, true, 'onClickDoubleChargeToken');
        setUseToken(true);
    };
    // 範囲帯電: 選んだマスを中心に3x3（空きマス含む）へ⚡を1つずつ付与する。ターンは終わらず、ダメージもない
    const onClickChargeArea = () => {
        addLog('「範囲帯電」を使用（中心のマスを選択）');
        setUseChargeArea(true);
        spendMagic(calculateCost(seatCosts.onClickChargeArea, false, false, currentTurnPlayer, 'onClickChargeArea'), true, true, 'onClickChargeArea');
    };
    // ランダム帯電: ランダムな1〜4マス（空きマス可。無敵マス・🔑ロック中は除く）に⚡を付与する。クリック不要
    const onClickChargeRandom = () => {
        const cands = randomChargeCandidates(currentBoard, characters);
        const n = Math.min(cands.length, 1 + Math.floor(Math.random() * 4));
        const picks = randomAnyPick(cands, n);
        addLog(`「ランダム帯電」を使用（${picks.map(posName).join('・')}に⚡）`);
        if (picks.length > 0) {
            flashCells(picks);
            playEffect('zap', picks[0], undefined, 'ランダム帯電');
        }
        setCurrentBoard(withOverload(withCharge(currentBoard, picks, characters)));
        spendMagic(calculateCost(seatCosts.onClickChargeRandom, false, false, currentTurnPlayer, 'onClickChargeRandom'), true, true, 'onClickChargeRandom');
    };
    // ジャマー: ⚡のあるマスを選び、縦横隣接の敵コマのライフを⚡の数だけ減らして⚡を取り除く
    const onClickJammer = () => {
        addLog('「ジャマー」を使用（⚡のマスを選択）');
        setUseJammer(true);
        spendMagic(calculateCost(seatCosts.onClickJammer, false, false, currentTurnPlayer, 'onClickJammer'), true, true, 'onClickJammer');
    };
    const exeJammer = (i: number) => {
        const board = currentBoard.slice();
        const r = applyJammer(board, i, geo.size, currentTurnPlayer);
        addLog(`${posName(i)}のジャマー（${r.damaged.length}コマのライフを減少${r.zeroed.length > 0 ? `・${r.zeroed.length}コマがライフ0` : ''}）`);
        flashCells(r.damaged);
        playEffect('zap', i, undefined, 'ジャマー');
        setUseJammer(false);
        setCurrentBoard(board);
    };


    // --- 氷結・火炎（thermal.ts。氷室の番人・煉獄の鍛冶師） ---
    const [useFreeze, setUseFreeze] = useState<boolean>(false);
    const [useIgnite, setUseIgnite] = useState<boolean>(false);
    const [useTinder, setUseTinder] = useState<boolean>(false);
    // 氷結: 選んだコマに❄を付与する（敵味方どちらでも。付与しただけではダメージは出ない）
    const onClickFreeze = () => {
        addLog('「氷結」を使用（コマを選択）');
        setUseFreeze(true);
        spendMagic(calculateCost(seatCosts.onClickFreeze, false, false, currentTurnPlayer, 'onClickFreeze'), true, true, 'onClickFreeze');
    };
    // 火口: 🌱か🍂のある敵コマを1つ選んで🔥を1つ付与する（対象が無ければ使えない）
    const tinderCandidates = (): number[] => tinderTargets(currentBoard, currentTurnPlayer, (sq) => isGuarded(sq, characters));
    const onClickTinder = () => {
        if (tinderCandidates().length === 0) return;
        addLog('「火口」を使用（🌱・🍂・❄のある敵コマを選択）');
        setUseTinder(true);
        spendMagic(calculateCost(seatCosts.onClickTinder, false, false, currentTurnPlayer, 'onClickTinder'), true, true, 'onClickTinder');
        gearTurn.current.plantPrev[turnSeat] = false; // 無料で撃てるのは1手番に1回まで
    };
    // 火遁（旧・火炎付与）: 選んだコマに🔥を1つ付与する。そのマスと縦横隣の氷結は即座に解ける
    const onClickIgnite = () => {
        addLog('「火遁」を使用（コマを選択）');
        setUseIgnite(true);
        spendMagic(calculateCost(seatCosts.onClickIgnite, false, false, currentTurnPlayer, 'onClickIgnite'), true, true, 'onClickIgnite');
    };
    // 固有スキル 絶対零度（氷室の番人）: 全マス（空きマス含む。🔑は除く）に❄を足す。クリック不要・手番は続く。
    // 次の自分の手番開始時に、他の席の氷結マスへ❄1スタックにつき3ダメージを与えて氷結を解除し、ライフ0のマスは破壊する
    const glacierCost = (player: Player = currentTurnPlayer): number =>
        reducedGlacierCost(costTableFor(seatOf(player)).onClickGlacier, glacierCharge[seatOf(player)], (c) => calculateCost(c, false, false, player, 'onClickGlacier'));
    const onClickGlacier = () => {
        if (glacierPending[turnSeat]) return;
        const cost = glacierCost();
        const board = currentBoard.slice();
        setGlacierChargeAt(turnSeat, 0); // 撃ったらリセット（この❄は数えない）
        const done = freeze(
            board,
            notShielded(board.map((_, k) => k))
        );
        addLog(`「絶対零度」を使用（${done.length}マスが氷結。次の手番開始時に発動）`);
        flashCells(done);
        playEffect('glacier');
        setCurrentBoard(board);
        setGlacierPendingAt(turnSeat, true);
        spendMagic(cost, false, true, 'onClickGlacier');
    };
    // --- バッズ系の汎用スキル（idx 33-36） ---
    const [useSucker, setUseSucker] = useState<boolean>(false);
    // 刈り入れ前夜: 自陣の🌱を全部刈り取り、その数だけ魔力を得る（クリック不要・手番は続く）
    const ownBudTotal = (): number => currentBoard.reduce((n, sq) => (sq.player === currentTurnPlayer ? n + activeBuds(sq, budGuard[turnSeat]) : n), 0);
    const onClickHarvestEve = () => {
        const board = currentBoard.slice();
        const n = harvestBuds(board, currentTurnPlayer, budGuard[turnSeat]);
        if (n === 0) return;
        addLog(`「刈り入れ前夜」を使用（🌱${n}個を刈り取り、魔力+${n}）`);
        playEffect('harvestEve');
        setCurrentBoard(board);
        spendMagic(calculateCost(seatCosts.onClickHarvestEve, false, false, currentTurnPlayer, 'onClickHarvestEve'), true, true, 'onClickHarvestEve');
        setMagicAt(turnSeat, (m) => m + n);
    };
    // 冬至の種子: 次の自分の手番開始時まで、自陣の🌱が火炎で消えず、氷結中のマスでも休眠しない
    const onClickSolstice = () => {
        if (budGuard[turnSeat]) return;
        addLog('「冬至の種子」を使用（次の自分の手番まで、🌱は火炎で消えず、氷結中も働く）');
        playEffect('solstice');
        setBudGuardAt(turnSeat, true);
        spendMagic(calculateCost(seatCosts.onClickSolstice, false, false, currentTurnPlayer, 'onClickSolstice'), true, true, 'onClickSolstice');
    };
    // ひこばえ: 🌱を持つ自陣のコマを選ぶと、縦横隣の自陣のコマ全てに🌱が1つずつ付く
    const suckerSources = (): number[] =>
        currentBoard
            .map((sq, i) => (sq.player === currentTurnPlayer && budStacks(sq) > 0 && budReceivers(currentBoard, i, currentTurnPlayer, geo.size).length > 0 ? i : -1))
            .filter((i) => i !== -1);
    const onClickSucker = () => {
        addLog('「ひこばえ」を使用（🌱を持つ自陣のコマを選択）');
        setUseSucker(true);
        spendMagic(calculateCost(seatCosts.onClickSucker, false, false, currentTurnPlayer, 'onClickSucker'), true, true, 'onClickSucker');
    };
    const exeSucker = (i: number) => {
        if (!suckerSources().includes(i)) return; // 🌱を持たない・隣に受け手がいないマスは選び直せる
        const board = currentBoard.slice();
        const receivers = budReceivers(board, i, currentTurnPlayer, geo.size);
        // 受け手が3つ以上なら、ランダムに2つだけに付く
        const picked = receivers.length > GRAFT_MAX ? randomAnyPick([...receivers], GRAFT_MAX) : receivers;
        const done = graft(board, i, currentTurnPlayer, geo.size, picked);
        addLog(`${posName(i)}からひこばえ（${done.length}コマに🌱）`);
        flashCells(done);
        playEffect('sprout', undefined, done);
        setUseSucker(false);
        setCurrentBoard(board);
    };
    // 風の落とし子: 自陣のコマにランダムで🌱を2つ（1マスに1つまで）
    const onClickWindborne = () => {
        const cands = sowCandidates(currentBoard, currentTurnPlayer);
        if (cands.length === 0) return;
        const picks = randomAnyPick([...cands], Math.min(SOW_COUNT, cands.length));
        const board = currentBoard.slice();
        sow(board, picks);
        addLog(`「風の落とし子」を使用（${picks.map(posName).join('・')}に🌱）`);
        flashCells(Array.from(new Set(picks)));
        playEffect('windborne', undefined, Array.from(new Set(picks)));
        setCurrentBoard(board);
        spendMagic(calculateCost(seatCosts.onClickWindborne, false, false, currentTurnPlayer, 'onClickWindborne'), true, true, 'onClickWindborne');
    };

    // --- 火炎系の汎用スキル（idx 37-39）。氷結への対抗手段 ---
    // 火炎トークン: 🔥付きの自陣コマをランダムな空きマスに置く（置いたマスの縦横隣の氷結は全解除）
    const placeFlame = (board: SquareInfo[], idx: number): number[] =>
        placeFlameToken(board, idx, currentTurnPlayer, calculateTokenBind(), geo.size);
    const onClickFlameToken = () => {
        const board = currentBoard.slice();
        const emptyIndexes = findEmptyIndexes(board);
        if (emptyIndexes.length > 0) {
            const index = randomPick(emptyIndexes);
            const thawed = placeFlame(board, index);
            addLog(`「火炎トークン」を使用（${posName(index)}に設置）`);
            if (thawed.length > 0) addLog(`氷結が溶けた（${thawed.map(posName).join('・')}）`);
            playEffect('flame', index, undefined, '火炎トークン');
            playBurst('thaw', thawed);
            setCurrentBoard(board);
        }
        spendMagic(calculateCost(seatCosts.onClickFlameToken, true, false, currentTurnPlayer, 'onClickFlameToken'), true, true, 'onClickFlameToken');
        setUseToken(true);
    };
    const onClickDoubleFlameToken = () => {
        const board = currentBoard.slice();
        const picks = randomAnyPick(findEmptyIndexes(board), 2).filter((idx) => idx !== undefined);
        const thawed = new Set<number>();
        for (const idx of picks) placeFlame(board, idx).forEach((k) => thawed.add(k));
        addLog(`「火炎ダブルトークン」を使用（${picks.map(posName).join('・')}に設置）`);
        if (thawed.size > 0) addLog(`氷結が溶けた（${Array.from(thawed).map(posName).join('・')}）`);
        if (picks.length > 0) playEffect('flame', picks[0], undefined, '火炎ダブルトークン');
        playBurst('thaw', Array.from(thawed));
        setCurrentBoard(board);
        spendMagic(calculateCost(seatCosts.onClickDoubleFlameToken, true, false, currentTurnPlayer, 'onClickDoubleFlameToken'), true, true, 'onClickDoubleFlameToken');
        setUseToken(true);
    };
    // 焼畑: 🌱を持つマス（敵味方どちらでも）を選ぶと、その🌱を全て同じ数の🔥に変える
    const [useSwidden, setUseSwidden] = useState<boolean>(false);
    const onClickSwidden = () => {
        addLog('「焼畑」を使用（🌱のあるマスを選択）');
        setUseSwidden(true);
        spendMagic(calculateCost(seatCosts.onClickSwidden, false, false, currentTurnPlayer, 'onClickSwidden'), true, true, 'onClickSwidden');
    };
    const exeSwidden = (i: number) => {
        if (budStacks(currentBoard[i]) === 0) return; // 🌱の無いマスは選び直せる
        const board = currentBoard.slice();
        const { n, thawed } = swidden(board, i, geo.size);
        addLog(`${posName(i)}の🌱${n}個を焼畑で🔥に変えた`);
        if (thawed.length > 0) addLog(`氷結が溶けた（${thawed.map(posName).join('・')}）`);
        flashCells([i]);
        playEffect('flame', i, undefined, '焼畑');
        playBurst('thaw', thawed);
        setUseSwidden(false);
        setCurrentBoard(board);
    };

    // --- 汎用スキル（idx 49-52）: 慈雨・縮地・写し身・追い剥ぎ ---
    const [useRelocate, setUseRelocate] = useState<boolean>(false);
    const [relocateFrom, setRelocateFrom] = useState<number | null>(null);
    const [useClone, setUseClone] = useState<boolean>(false);
    const [usePlunder, setUsePlunder] = useState<boolean>(false);
    // 慈雨: 自陣の全コマのライフ+1（クリック不要・手番は続く）
    // 福引き(idx 59): 自分のデッキから、基礎コスト3以下で今撃てるスキルをランダムに1つ、コストを払わず発動する（手札に出ていないスキルも対象）
    const lotteryPool = () =>
        deckBySeat[turnSeat]
            .filter((i) => i !== 59 && baseCostOf(i) <= 3)
            .map((i) => shuffleSkillDefs.find((d) => d.idx === i))
            .filter((d): d is NonNullable<typeof d> => !!d && !d.disabled);
    const onClickRandomCast = () => {
        const pool = lotteryPool();
        if (pool.length === 0) {
            addLog('「福引き」: 今撃てるスキルがデッキにありません');
            return;
        }
        const picked = randomPick(pool);
        addLog(`「福引き」を使用 → ${SKILL_CATALOG[picked.idx].name}が発動`);
        spendMagic(calculateCost(seatCosts.onClickRandomCast, false, false, currentTurnPlayer, 'onClickRandomCast'), true, true, 'onClickRandomCast');
        gearTurn.current.freeCast = true;
        picked.onClick();
    };
    // --- 🍂落ち葉系の汎用スキル(idx 62-68) ---
    // 自陣の🍂は、相手全員のスキルコストを🍂の枚数ぶん上げる（氷結中は休眠・🔥が付くと消える）。🍂付きトークンはトークンのエフェクトを持たない扱い（収穫/伝播ギアとは連動しない）
    type LeafTokenKey = 'onClickLeafToken' | 'onClickTwinLeafToken' | 'onClickDoubleLeafToken';
    const finishLeafToken = (key: LeafTokenKey, label: string, cells: number[], granted: number) => {
        harvestMagic(granted);
        playEffect('token', undefined, cells, label);
        spendMagic(calculateCost(seatCosts[key], true, false, currentTurnPlayer, key), true, true, key);
        setUseToken(true);
    };
    const placeLeafTokens = (key: LeafTokenKey, label: string, count: number, leaves: number) => {
        const board = currentBoard.slice();
        const picks = randomAnyPick(findEmptyIndexes(board), count).filter((idx) => idx !== undefined);
        let granted = 0;
        for (const idx of picks) {
            placeLeafToken(board, idx, currentTurnPlayer, calculateTokenBind(), leaves);
            granted += afterTokenPlaced(board, idx);
        }
        addLog(`「${label}」を使用（${picks.map(posName).join('・')}に🍂${leaves}枚付きで設置）`);
        setCurrentBoard(board);
        finishLeafToken(key, label, picks, granted);
    };
    const onClickLeafToken = () => placeLeafTokens('onClickLeafToken', '木枯らしの使い', 1, 1);
    const onClickTwinLeafToken = () => placeLeafTokens('onClickTwinLeafToken', '落葉松の双子', 1, 2);
    const onClickDoubleLeafToken = () => placeLeafTokens('onClickDoubleLeafToken', '紅葉狩り', 2, 1);
    // 枯野の相席: 盤面の全てのコマ（敵味方問わず・🔑ロック中と⚡無敵を除く）に🍂を1つずつ付ける。クリック不要・手番は続く
    const leafAllCandidates = (): number[] => leafAllTargets(currentBoard, (sq) => isGuarded(sq, characters));
    const onClickLeafAll = () => {
        const cells = leafAllCandidates();
        if (cells.length === 0) return;
        const board = currentBoard.slice();
        for (const k of cells) leafDrop(board, k);
        addLog(`「枯野の相席」を使用（${cells.length}コマに🍂）`);
        flashCells(cells);
        playEffect('autumn', undefined, cells, '枯野の相席');
        setCurrentBoard(board);
        spendMagic(calculateCost(seatCosts.onClickLeafAll, false, false, currentTurnPlayer, 'onClickLeafAll'), true, true, 'onClickLeafAll');
    };
    // 焚き火の唄: 敵陣の🍂を全て除去する（🔑ロック・❄氷結のマスは対象外）
    const onClickBonfire = () => {
        const board = currentBoard.slice();
        const { n, cells } = bonfire(board, currentTurnPlayer);
        addLog(`「焚き火の唄」を使用（敵陣の🍂${n}枚を除去）`);
        playEffect('autumn', undefined, cells, '焚き火の唄');
        setCurrentBoard(board);
        spendMagic(calculateCost(seatCosts.onClickBonfire, false, false, currentTurnPlayer, 'onClickBonfire'), true, true, 'onClickBonfire');
    };
    // 腐葉土の目覚め: 自陣のランダムな🍂1枚を🌱に変える
    const onClickMulch = () => {
        const board = currentBoard.slice();
        const cands = mulchCandidates(board, currentTurnPlayer);
        if (cands.length === 0) return;
        const cell = randomPick(cands);
        mulch(board, cell);
        addLog(`「腐葉土の目覚め」を使用（${posName(cell)}の🍂を🌱に）`);
        playEffect('autumn', undefined, [cell], '腐葉土の目覚め');
        setCurrentBoard(board);
        spendMagic(calculateCost(seatCosts.onClickMulch, false, false, currentTurnPlayer, 'onClickMulch'), true, true, 'onClickMulch');
    };
    // 一葉知秋: 盤面の🌱をすべて🍂に変える（敵味方問わず。🔥が付いたマスは変えない）
    const onClickAutumn = () => {
        const board = currentBoard.slice();
        const { n, cells } = autumn(board);
        addLog(`「一葉知秋」を使用（盤面の🌱${n}枚を🍂に）`);
        playEffect('autumn', undefined, cells, '一葉知秋');
        setCurrentBoard(board);
        spendMagic(calculateCost(seatCosts.onClickAutumn, false, false, currentTurnPlayer, 'onClickAutumn'), true, true, 'onClickAutumn');
    };
    // バーンアウト(idx 61): 🔥が乗っているマスを全て破壊する（クリック不要・手番は続く）。盤面に🔥が4つ以上あればコスト0
    const burnoutCost = (): number =>
        burnoutCostOf(seatCosts.onClickBurnout, totalFlames(currentBoard), (c) => calculateCost(c, false, false, currentTurnPlayer, 'onClickBurnout'));
    const onClickBurnout = () => {
        const targets = burnoutTargets(currentBoard, characters);
        if (targets.length === 0) return;
        const board = currentBoard.slice();
        const cost = burnoutCost();
        const destroyed = burnout(board, targets);
        addCorpses(destroyed);
        addLog(`「バーンアウト」を使用（🔥のあるマス${targets.length}個を破壊${cost === 0 ? '・🔥が' + BURNOUT_FREE_FLAMES + 'つ以上でタダ' : ''}）`);
        flashCells(targets);
        playEffect('inferno', undefined, targets);
        setCurrentBoard(board);
        spendMagic(cost, true, true, 'onClickBurnout');
    };
    // コスト軽減スキル(idx 53-58): 手番内だけ有効。効果の中身は discount.ts
    const DISCOUNT_NAMES: Record<DiscountKey, string> = {
        onClickMarkdown: '特売', onClickEffectDiscount: '付与割引', onClickTokenDiscount: 'トークン割引',
        onClickVitalMarkdown: '活力特売', onClickUniqueDiscount: '固有割引', onClickClearance: '大特価', onClickCounterMarkdown: '返し特売',
    };
    const canUseDiscount = (key: DiscountKey): boolean =>
        canUseDiscountSkill(gearTurn.current.discount[turnSeat], key, life) && magic[turnSeat] >= calculateCost(seatCosts[key], false, false, currentTurnPlayer, key);
    const onClickDiscount = (key: DiscountKey) => {
        if (!canUseDiscountSkill(gearTurn.current.discount[turnSeat], key, life)) return;
        const e = DISCOUNT_SKILLS[key];
        const parts: string[] = [];
        if ('next' in e) parts.push(`次のスキル-${e.next}`);
        if ('effect' in e) parts.push(`エフェクト付与スキル-${e.effect}`);
        if ('token' in e) parts.push(`トークン付与スキル-${e.token}`);
        if ('unique' in e) parts.push(`固有スキル-${e.unique}`);
        addLog(`「${DISCOUNT_NAMES[key]}」を使用（${parts.join('・')}）`);
        playEffect('discount', undefined, undefined, DISCOUNT_NAMES[key]);
        spendMagic(calculateCost(seatCosts[key], false, false, currentTurnPlayer, key), true, true, key);
        const delta = lifeDeltaOf(key);
        if (delta !== 0) setLife(life + delta);
    };
    // 手番内の軽減の状況（ボタン説明・手番パネルの表示用）
    const discountLabel = (seat: number): string | null => {
        if (seat !== turnSeat) return null;
        const d = gearTurn.current.discount[seat];
        const parts: string[] = [];
        if (d.next > 0) parts.push(`次のスキル-${d.next}`);
        if (d.effect > 0) parts.push(`エフェクト付与-${d.effect}`);
        if (d.token > 0) parts.push(`トークン付与-${d.token}`);
        if (d.unique > 0) parts.push(`固有スキル-${d.unique}`);
        if (d.turn > 0) parts.push(`このターンのスキル-${d.turn}`);
        return parts.length > 0 ? `コスト軽減中: ${parts.join('・')}` : null;
    };
    const onClickBoost = () => {
        const board = currentBoard.slice();
        const done = boostAll(board, currentTurnPlayer);
        if (done.length === 0) return;
        addLog(`「慈雨」を使用（${done.length}コマのライフ+1）`);
        flashCells(done);
        playEffect('rain', undefined, done);
        setCurrentBoard(board);
        spendMagic(calculateCost(seatCosts.onClickBoost, false, false, currentTurnPlayer, 'onClickBoost'), true, true, 'onClickBoost');
    };
    // 縮地: 自陣のコマ（🔑・氷結中は不可）を選び、空きマスを選ぶと、ライフ・エフェクトごと移動する
    const relocateSources = (): number[] =>
        currentBoard.map((sq, i) => (canRelocate(sq, currentTurnPlayer) ? i : -1)).filter((i) => i !== -1);
    const onClickRelocate = () => {
        addLog('「縮地」を使用（動かす自陣のコマを選択）');
        setUseRelocate(true);
        setRelocateFrom(null);
        spendMagic(calculateCost(seatCosts.onClickRelocate, false, false, currentTurnPlayer, 'onClickRelocate'), true, true, 'onClickRelocate');
    };
    const exeRelocate = (i: number) => {
        if (relocateFrom === null) {
            if (canRelocate(currentBoard[i], currentTurnPlayer)) setRelocateFrom(i); // 動かせるコマだけ選べる
            return;
        }
        if (canRelocate(currentBoard[i], currentTurnPlayer)) {
            setRelocateFrom(i); // 別のコマに選び直せる
            return;
        }
        const board = currentBoard.slice();
        if (!relocate(board, relocateFrom, i, currentTurnPlayer)) return; // 置けないマスは選び直せる
        addLog(`${posName(relocateFrom)}のコマを${posName(i)}へ移動`);
        flashCells([i]);
        playEffect('dash', i, [relocateFrom, i]);
        setUseRelocate(false);
        setRelocateFrom(null);
        setCurrentBoard(board);
    };
    // 写し身: 自陣のコマを選ぶと、縦横隣のランダムな空きマスにライフ半分の写しが現れる
    const cloneSources = (): number[] =>
        currentBoard.map((sq, i) => (sq.player === currentTurnPlayer && cloneTargets(currentBoard, i, geo.size).length > 0 ? i : -1)).filter((i) => i !== -1);
    const onClickClone = () => {
        addLog('「写し身」を使用（自陣のコマを選択）');
        setUseClone(true);
        spendMagic(calculateCost(seatCosts.onClickClone, false, false, currentTurnPlayer, 'onClickClone'), true, true, 'onClickClone');
    };
    const exeClone = (i: number) => {
        if (!cloneSources().includes(i)) return; // 縦横隣に空きマスの無いコマ・敵のコマは選び直せる
        const to = randomPick(cloneTargets(currentBoard, i, geo.size));
        const board = currentBoard.slice();
        cloneInto(board, i, to, currentTurnPlayer);
        addLog(`${posName(i)}の写し身が${posName(to)}に現れた`);
        flashCells([to]);
        playEffect('clone', to, [i, to]);
        setUseClone(false);
        setCurrentBoard(board);
    };
    // 追い剥ぎ: ライフ0の敵のコマを1つ選ぶと、自陣のコマ（ライフ1）にする。手番は続く
    const onClickPlunder = () => {
        addLog('「追い剥ぎ」を使用（ライフ0の敵のコマを選択）');
        setUsePlunder(true);
        spendMagic(calculateCost(seatCosts.onClickPlunder, false, false, currentTurnPlayer, 'onClickPlunder'), true, true, 'onClickPlunder');
    };
    const exePlunder = (i: number) => {
        if (!plunderTargets(currentBoard, currentTurnPlayer, characters).includes(i)) return; // 対象外は選び直せる
        const board = currentBoard.slice();
        plunder(board, i, currentTurnPlayer);
        addCorpses(1);
        addLog(`${posName(i)}のライフ0の敵コマを奪った`);
        flashCells([i]);
        playEffect('plunder', i, [i]);
        setUsePlunder(false);
        setCurrentBoard(board);
    };

    // --- 氷結系の汎用スキル（idx 41-48）。作った❄は1個ずつ絶対零度のコスト軽減に数える ---
    const [useFrostArea, setUseFrostArea] = useState<boolean>(false);
    const [useIcicle, setUseIcicle] = useState<boolean>(false);
    const [icicleCell, setIcicleCell] = useState<number | null>(null);
    const [useFreezeSpread, setUseFreezeSpread] = useState<boolean>(false);
    const [useShatter, setUseShatter] = useState<boolean>(false);
    // cells のうち氷結を付けられるマスに❄を付け、数えて演出する。作れた数を返す
    // 雷霆の巫の⚡無敵のコマは、状態異常（氷結）の対象にならない（毒霧・パンデミックなどと同じ）
    const notShielded = (cells: number[]): number[] => cells.filter((k) => !isShielded(currentBoard[k], characters));
    const freezeCells = (cells: number[], label: string, focus?: number, banner?: string): number => {
        const board = currentBoard.slice();
        const made = freeze(board, notShielded(cells));
        bumpGlacierCharge(made.length);
        addLog(`${label}（${made.length}マスが氷結）`);
        flashCells(made);
        playEffect('freeze', focus, made, banner);
        setCurrentBoard(board);
        return made.length;
    };
    // 範囲氷結: 選んだマスと周囲8マス（3x3、空きマス含む）に❄
    const onClickFrostArea = () => {
        addLog('「範囲氷結」を使用（中心のマスを選択）');
        setUseFrostArea(true);
        spendMagic(calculateCost(seatCosts.onClickFrostArea, false, false, currentTurnPlayer, 'onClickFrostArea'), true, true, 'onClickFrostArea');
    };
    const exeFrostArea = (i: number) => {
        if (geo.stompRange(i).every((k) => !canFreeze(currentBoard[k]))) return; // 凍らせるマスが無い所は選び直せる
        freezeCells(geo.stompRange(i), `${posName(i)}を中心に範囲氷結`, i, '範囲氷結');
        setUseFrostArea(false);
    };
    // 氷柱: マスを選んで方向（横・縦・斜め）を選ぶと、盤の端から端までの線上に❄
    const onClickIcicle = () => {
        addLog('「氷柱」を使用（マスを選んで方向を選択）');
        setUseIcicle(true);
        setIcicleCell(null);
        spendMagic(calculateCost(seatCosts.onClickIcicle, false, false, currentTurnPlayer, 'onClickIcicle'), true, true, 'onClickIcicle');
    };
    const exeIcicle = (dir: LineDir) => {
        if (icicleCell === null) return;
        const cells = lineCells(geo.size, icicleCell, dir);
        if (cells.every((k) => !canFreeze(currentBoard[k]))) return;
        freezeCells(cells, `${posName(icicleCell)}を通る氷柱`, icicleCell, '氷柱');
        setUseIcicle(false);
        setIcicleCell(null);
    };
    // ランダム氷結: ランダムな1〜4マス（空きマス含む）に❄
    const onClickRandomFreeze = () => {
        const cands = notShielded(randomFreezeCandidates(currentBoard));
        if (cands.length === 0) return;
        const n = Math.min(cands.length, 1 + Math.floor(Math.random() * 4));
        freezeCells(randomAnyPick([...cands], n), '「ランダム氷結」を使用', undefined, 'ランダム氷結');
        spendMagic(calculateCost(seatCosts.onClickRandomFreeze, false, false, currentTurnPlayer, 'onClickRandomFreeze'), true, true, 'onClickRandomFreeze');
    };
    // 氷結拡散: コマを選ぶと、コマのあるマスだけを縦横に辿って届く全てのコマ（敵味方問わず）に❄
    const onClickFreezeSpread = () => {
        addLog('「氷結拡散」を使用（コマを選択）');
        setUseFreezeSpread(true);
        spendMagic(calculateCost(seatCosts.onClickFreezeSpread, false, false, currentTurnPlayer, 'onClickFreezeSpread'), true, true, 'onClickFreezeSpread');
    };
    const exeFreezeSpread = (i: number) => {
        const cells = connectedPieces(currentBoard, i, geo.size);
        if (cells.length === 0 || cells.every((k) => !canFreeze(currentBoard[k]))) return; // 空きマスは起点にできない
        freezeCells(cells, `${posName(i)}から氷結拡散`, i, '氷結拡散');
        setUseFreezeSpread(false);
    };
    // 氷結トークン: ❄付きの自陣コマをランダムな空きマスに置く
    const onClickFrostToken = () => {
        const board = currentBoard.slice();
        const emptyIndexes = findEmptyIndexes(board);
        if (emptyIndexes.length > 0) {
            const index = randomPick(emptyIndexes);
            bumpGlacierCharge(placeFrostToken(board, index, currentTurnPlayer, calculateTokenBind()));
            addLog(`「氷結トークン」を使用（${posName(index)}に設置）`);
            playEffect('freeze', index, [index], '氷結トークン');
            setCurrentBoard(board);
        }
        spendMagic(calculateCost(seatCosts.onClickFrostToken, true, false, currentTurnPlayer, 'onClickFrostToken'), true, true, 'onClickFrostToken');
        setUseToken(true);
    };
    const onClickDoubleFrostToken = () => {
        const board = currentBoard.slice();
        const picks = randomAnyPick(findEmptyIndexes(board), 2).filter((idx) => idx !== undefined);
        let made = 0;
        for (const idx of picks) made += placeFrostToken(board, idx, currentTurnPlayer, calculateTokenBind());
        bumpGlacierCharge(made);
        addLog(`「氷結ダブルトークン」を使用（${picks.map(posName).join('・')}に設置）`);
        if (picks.length > 0) playEffect('freeze', picks[0], picks, '氷結ダブルトークン');
        setCurrentBoard(board);
        spendMagic(calculateCost(seatCosts.onClickDoubleFrostToken, true, false, currentTurnPlayer, 'onClickDoubleFrostToken'), true, true, 'onClickDoubleFrostToken');
        setUseToken(true);
    };
    // 砕氷: 氷結中のコマを選ぶと、❄を全部砕いて❄1つにつき3ダメージ（ライフ0なら破壊）。氷結は作られないのでコスト軽減には数えない
    const onClickShatter = () => {
        addLog('「砕氷」を使用（氷結中のコマを選択）');
        setUseShatter(true);
        spendMagic(calculateCost(seatCosts.onClickShatter, false, false, currentTurnPlayer, 'onClickShatter'), true, true, 'onClickShatter');
    };
    const exeShatter = (i: number) => {
        const sq = currentBoard[i];
        if (!sq.player || !isFrozen(sq)) return; // 氷結中のコマ以外は選び直せる
        const board = currentBoard.slice();
        const r = shatter(board, i);
        addLog(`${posName(i)}の氷を砕いた（❄${r.stacks}個で${r.damage}ダメージ${r.destroyed ? '・破壊' : ''}）`);
        if (r.destroyed) addCorpses(1);
        flashCells([i]);
        playEffect('glacierBurst', i, [i], '砕氷');
        setUseShatter(false);
        setCurrentBoard(board);
    };
    // 霜降り: 自陣のライフ2以下のコマすべてに❄
    const onClickFrostfall = () => {
        const targets = notShielded(frostfallTargets(currentBoard, currentTurnPlayer));
        if (targets.length === 0) return;
        freezeCells(targets, '「霜降り」を使用', undefined, '霜降り');
        spendMagic(calculateCost(seatCosts.onClickFrostfall, false, false, currentTurnPlayer, 'onClickFrostfall'), true, true, 'onClickFrostfall');
    };

    // 春一番: 自陣の❄を全て解除し、解除した❄の数だけ、このターンに打つ全スキルを軽減する（軽減札。自分自身は軽減されない）
    const onClickSpringWind = () => {
        const board = currentBoard.slice();
        const { stacks, cells } = thawAll(board, currentTurnPlayer);
        if (stacks === 0) return;
        addLog(`「春一番」を使用（自陣の❄${stacks}個を解除・このターンのスキル-${stacks}）`);
        flashCells(cells);
        playEffect('discount', undefined, cells, '春一番');
        playBurst('thaw', cells);
        setCurrentBoard(board);
        spendMagic(calculateCost(seatCosts.onClickSpringWind, false, false, currentTurnPlayer, 'onClickSpringWind'), true, true, 'onClickSpringWind');
        const d = gearTurn.current.discount[turnSeat];
        gearTurn.current.discount[turnSeat] = { ...d, turn: d.turn + stacks };
    };

    // 霜枯れ: 自陣の🍂を持つコマすべてに❄（氷結中は🍂が休眠してコスト上乗せが止まる代わりに、🔥や上書きから守れる）
    const onClickLeafFrost = () => {
        const targets = notShielded(leafFrostTargets(currentBoard, currentTurnPlayer));
        if (targets.length === 0) return;
        freezeCells(targets, '「霜枯れ」を使用', undefined, '霜枯れ');
        spendMagic(calculateCost(seatCosts.onClickLeafFrost, false, false, currentTurnPlayer, 'onClickLeafFrost'), true, true, 'onClickLeafFrost');
    };

    // 殉火（仮名）: 自陣のコマを1つ選んでライフをゼロにし、そのライフ以下の敵のコマ全てに🔥を付ける。手番は続く
    const [useSacrifice, setUseSacrifice] = useState<boolean>(false);
    const sacrificeCandidates = (): number[] =>
        currentBoard
            .map((sq, i) => (canSacrifice(sq, currentTurnPlayer) && sacrificeTargets(currentBoard, sq.bind, currentTurnPlayer, characters).length > 0 ? i : -1))
            .filter((i) => i !== -1);
    const onClickSacrifice = () => {
        addLog('「殉火」を使用（犠牲にする自陣のコマを選択）');
        setUseSacrifice(true);
        spendMagic(calculateCost(seatCosts.onClickSacrifice, false, false, currentTurnPlayer, 'onClickSacrifice'), true, true, 'onClickSacrifice');
    };
    const exeSacrifice = (i: number) => {
        if (!sacrificeCandidates().includes(i)) return; // 自陣のライフが残るコマ以外・対象の敵がいないコマは選び直せる
        const board = currentBoard.slice();
        const r = sacrificeFlame(board, i, currentTurnPlayer, characters, geo.size, keepBuds);
        addLog(`${posName(i)}（ライフ${r.threshold}）を犠牲に、ライフ${r.threshold}以下の敵${r.targets.length}コマに🔥`);
        if (r.thawed.length > 0) addLog(`氷結が溶けた（${r.thawed.map(posName).join('・')}）`);
        flashCells([i, ...r.targets]);
        playEffect('flame', i, r.targets, '殉火');
        playBurst('thaw', r.thawed);
        setUseSacrifice(false);
        setCurrentBoard(board);
    };

    // 鬼門封じ: 敵のコマを1つ選んで破壊する（氷結中は❄-1だけ）。破壊して空きマスになったら3ターンロックする。🔑ロック・⚡無敵のコマは選べない
    const [useKimon, setUseKimon] = useState<boolean>(false);
    // 落ち葉の置き土産: ランダムな敵のコマ1つに🍂を1つ付ける（🔑ロック・⚡無敵は除く）。クリック不要・手番は続く
    const leafDropCandidates = (): number[] => leafDropTargets(currentBoard, currentTurnPlayer, (sq) => isGuarded(sq, characters));
    const onClickLeafDrop = () => {
        const cands = leafDropCandidates();
        if (cands.length === 0) return;
        const pick = randomPick(cands);
        const board = currentBoard.slice();
        leafDrop(board, pick);
        addLog(`「落ち葉の置き土産」を使用（${posName(pick)}に🍂）`);
        flashCells([pick]);
        playEffect('autumn', undefined, [pick], '落ち葉の置き土産');
        setCurrentBoard(board);
        spendMagic(calculateCost(seatCosts.onClickLeafDrop, false, false, currentTurnPlayer, 'onClickLeafDrop'), true, true, 'onClickLeafDrop');
    };
    // 落葉の衣: ランダムな自陣のコマ1つ（🔑ロック中も含む）に🍂を1つ付ける。クリック不要・手番は続く
    const leafCloakCandidates = (): number[] => leafCloakTargets(currentBoard, currentTurnPlayer);
    const onClickLeafCloak = () => {
        const cands = leafCloakCandidates();
        if (cands.length === 0) return;
        const pick = randomPick(cands);
        const board = currentBoard.slice();
        leafDrop(board, pick);
        addLog(`「落葉の衣」を使用（${posName(pick)}に🍂）`);
        flashCells([pick]);
        playEffect('autumn', undefined, [pick], '落葉の衣');
        setCurrentBoard(board);
        spendMagic(calculateCost(seatCosts.onClickLeafCloak, false, false, currentTurnPlayer, 'onClickLeafCloak'), true, true, 'onClickLeafCloak');
    };
    // 焚きつけ: 敵の🍂を全て🔥に変換する（🍂1枚につき🔥1つ。🔑ロック・⚡無敵は除く）。クリック不要・手番は続く
    const kindlingCandidates = (): number[] => kindlingTargets(currentBoard, currentTurnPlayer, (sq) => isGuarded(sq, characters));
    const onClickKindling = () => {
        const cands = kindlingCandidates();
        if (cands.length === 0) return;
        const board = currentBoard.slice();
        const { leaves, thawed } = kindling(board, cands, geo.size, keepBuds);
        addLog(`「焚きつけ」を使用（敵の🍂${leaves}枚を🔥に変換）`);
        if (thawed.length > 0) addLog(`氷結が溶けた（${thawed.map(posName).join('・')}）`);
        flashCells(cands);
        playEffect('flame', undefined, cands, '焚きつけ');
        playBurst('thaw', thawed);
        setCurrentBoard(board);
        spendMagic(calculateCost(seatCosts.onClickKindling, false, false, currentTurnPlayer, 'onClickKindling'), true, true, 'onClickKindling');
    };
    const kimonCandidates = (): number[] => kimonTargets(currentBoard, currentTurnPlayer, (sq) => isGuarded(sq, characters));
    const onClickKimon = () => {
        addLog('「鬼門封じ」を使用（敵のコマを選択）');
        setUseKimon(true);
        spendMagic(calculateCost(seatCosts.onClickKimon, false, false, currentTurnPlayer, 'onClickKimon'), true, true, 'onClickKimon');
    };
    const exeKimon = (i: number) => {
        if (!kimonCandidates().includes(i)) return; // 敵のコマ以外・守られているコマは選び直せる
        const board = currentBoard.slice();
        const r = kimon(board, i);
        if (r.destroyed) {
            addCorpses(1);
            addLog(`${posName(i)}の敵コマを破壊し、3ターンロック`);
        } else {
            addLog(`${posName(i)}の氷結を1つ砕いた`);
        }
        flashCells([i]);
        playEffect('lock', i, [i], '鬼門封じ');
        playBurst('iceBreak', r.thawed ? [i] : []);
        setUseKimon(false);
        setCurrentBoard(board);
    };
    // 火の車: ランダムな敵のコマ2つに🔥を1つずつ付け、その後自分の手札をシャッフルする（無料）。このターン敵か自陣に🔥を付与していれば0コスト（撃つとリセット）。クリック不要・手番は続く
    const fireWheelGuard = (sq: SquareInfo) => isGuarded(sq, characters);
    const onClickFireWheel = () => {
        const cands = fireWheelTargets(currentBoard, currentTurnPlayer, fireWheelGuard);
        if (cands.length === 0) return;
        const picks = randomAnyPick(cands, Math.min(FIRE_WHEEL_COUNT, cands.length));
        const board = currentBoard.slice();
        const thawed = fireWheel(board, picks, geo.size, keepBuds);
        addLog(`「火の車」を使用（${picks.map(posName).join('・')}に🔥・手札をシャッフル）`);
        if (thawed.length > 0) addLog(`氷結が溶けた（${thawed.map(posName).join('・')}）`);
        flashCells(picks);
        playEffect('flame', undefined, picks, '火の車');
        playBurst('thaw', thawed);
        setCurrentBoard(board);
        spendMagic(calculateCost(seatCosts.onClickFireWheel, false, false, currentTurnPlayer, 'onClickFireWheel'), true, true, 'onClickFireWheel');
        gearTurn.current.fireBase[turnSeat] = fireStacksTotal(board); // 条件のリセット（この札自身が付けた🔥は数えない）
        setSkills(reshuffledSkills(deckBySeat[turnSeat], currentLockedSkills)); // 手札のシャッフル（無料。スキル扱いではない）
    };

    // 飛び火: ランダムな敵マス2つに🔥を1つずつ付ける（火の車からシャッフルを除いたもの）。直前の手番に相手がコマを2つ以上設置していれば0（1手番に1回まで）
    const onClickSpark = () => {
        const cands = fireWheelTargets(currentBoard, currentTurnPlayer, fireWheelGuard);
        if (cands.length === 0) return;
        const picks = randomAnyPick(cands, Math.min(FIRE_WHEEL_COUNT, cands.length));
        const board = currentBoard.slice();
        const thawed = fireWheel(board, picks, geo.size, keepBuds);
        addLog(`「飛び火」を使用（${picks.map(posName).join('・')}に🔥）`);
        if (thawed.length > 0) addLog(`氷結が溶けた（${thawed.map(posName).join('・')}）`);
        flashCells(picks);
        playEffect('flame', undefined, picks, '飛び火');
        playBurst('thaw', thawed);
        setCurrentBoard(board);
        spendMagic(calculateCost(seatCosts.onClickSpark, false, false, currentTurnPlayer, 'onClickSpark'), true, true, 'onClickSpark');
        gearTurn.current.placedPrev[turnSeat] = false; // 無料で撃てるのは1手番に1回まで
    };

    // 浄化: 自陣のコマの状態異常（毒・火炎・氷結・帯電）を全部回復する。クリック不要・手番は続く
    const ownAilmentCells = (): number[] =>
        currentBoard.map((sq, i) => (sq.player === currentTurnPlayer && ailmentStacks(sq) > 0 ? i : -1)).filter((i) => i !== -1);
    const onClickCleanse = () => {
        const board = currentBoard.slice();
        const done = cleanse(board, currentTurnPlayer);
        addLog(`「浄化」を使用（${done.length}コマの状態異常を回復）`);
        flashCells(done);
        playEffect('cleanse');
        setCurrentBoard(board);
        spendMagic(calculateCost(seatCosts.onClickCleanse, false, false, currentTurnPlayer, 'onClickCleanse'), true, true, 'onClickCleanse');
    };
    // 氷室の番人は常在のロックの代わりにこの「氷結」を持つ: マスを1つ選んで❄を付ける（空きマス可）
    const onClickCryoFreeze = () => {
        addLog('「氷結」を使用（マスを選択）');
        setUseFreeze(true);
        spendMagic(calculateCost(seatCosts.onClickCryoFreeze, false, false, currentTurnPlayer, 'onClickCryoFreeze'), true, true, 'onClickCryoFreeze');
    };
    // 固有スキル 業火（煉獄の鍛冶師）: 敵のコマ全て（🔑ロック中・⚡無敵を除く）に🔥を2スタックずつ付ける。クリック不要・手番は続く。
    // 氷結中のマスは🔥の代わりに❄が減る
    const infernoCost = (player: Player = currentTurnPlayer): number =>
        infernoCostOf(costTableFor(seatOf(player)).onClickInferno, gearTurn.current.infernoReady[seatOf(player)], (c) => calculateCost(c, false, false, player, 'onClickInferno'));
    const onClickInferno = () => {
        const targets = infernoTargets(currentBoard, currentTurnPlayer, characters);
        if (targets.length === 0) return;
        const board = currentBoard.slice();
        addLog(`「業火」を使用（${targets.length}コマに🔥+${INFERNO_STACKS}）`);
        const { thawed } = ignite(board, targets, geo.size, INFERNO_STACKS, keepBuds);
        if (thawed.length > 0) addLog(`氷結が溶けた（${thawed.map(posName).join('・')}）`);
        flashCells(targets);
        playEffect('inferno', undefined, targets);
        playBurst('thaw', thawed);
        setCurrentBoard(board);
        spendMagic(infernoCost(), false, true, 'onClickInferno');
        gearTurn.current.infernoReady[turnSeat] = false; // 撃ったら無料権とカウントをリセット
        gearTurn.current.kinds[turnSeat] = new Set();
    };
    // 固有スキル 虎落笛（凩の魔女）: 自陣の🍂の枚数ぶん敵のコマ全てにスキルダメージ（🔑ロック中・⚡無敵を除く。氷結中は❄が減るだけ）、
    // 同時に自陣のコマ全てのライフ+2。クリック不要・手番は続く
    const mogaribueCost = (player: Player = currentTurnPlayer): number =>
        calculateCost(costTableFor(seatOf(player)).onClickMogaribue, false, false, player, 'onClickMogaribue');
    const onClickMogaribue = () => {
        if (!canMogaribue(currentBoard, currentTurnPlayer)) return;
        const board = currentBoard.slice();
        const { damage, hit, boosted } = mogaribue(board, currentTurnPlayer, characters);
        addLog(`「虎落笛」を使用（敵${hit.length}コマに${damage}ダメージ・自陣${boosted.length}コマのライフ+${MOGARIBUE_LIFE}）`);
        flashCells(hit);
        playEffect('autumn', undefined, hit.length > 0 ? hit : boosted, '虎落笛');
        setCurrentBoard(board);
        spendMagic(mogaribueCost(), false, true, 'onClickMogaribue');
    };
    const exeFreeze = (i: number) => {
        if (!canFreeze(currentBoard[i])) return; // 🔑ロック・🔥のあるマスは選び直せる
        const board = currentBoard.slice();
        const made = freeze(board, [i]);
        bumpGlacierCharge(made.length);
        addLog(`${posName(i)}を氷結`);
        playEffect('freeze', i);
        setUseFreeze(false);
        setCurrentBoard(board);
    };
    // 🔥を付けたあとの共通処理: 解けた氷結をログに出す
    const igniteCells = (board: SquareInfo[], cells: number[]) => {
        const { thawed } = ignite(board, cells, geo.size, 1, keepBuds);
        if (thawed.length > 0) addLog(`氷結が溶けた（${thawed.map(posName).join('・')}）`);
        flashCells(cells);
        playEffect('flame', cells[0], undefined, '火遁');
        playBurst('thaw', thawed);
        setCurrentBoard(board);
    };
    const exeTinder = (i: number) => {
        const board = currentBoard.slice();
        addLog(`${posName(i)}に🔥を付与（火口）`);
        setUseTinder(false);
        const { thawed } = ignite(board, [i], geo.size, 1, keepBuds);
        if (thawed.length > 0) addLog(`氷結が溶けた（${thawed.map(posName).join('・')}）`);
        flashCells([i]);
        playEffect('flame', i, undefined, '火口');
        playBurst('thaw', thawed);
        setCurrentBoard(board);
    };
    const exeIgnite = (i: number) => {
        const board = currentBoard.slice();
        addLog(`${posName(i)}に🔥を付与`);
        setUseIgnite(false);
        igniteCells(board, [i]);
    };

    // 次の手番の席。巨人は2ターンに1回しか動かない（並びは giantTurn.ts。currentTurn だけで決まる）
    const judgeNextSeat = (): number => seatForTurn(currentTurn, characters, turnSeat);

    const checkSkillDisable = (cost: number, isToken: boolean = false, isPoison: boolean = false, skillKey?: string): boolean => {
        const calculatedCost: number = calculateCost(cost, isToken, isPoison, currentTurnPlayer, skillKey);
        return magic[turnSeat] < calculatedCost || (isToken && useToken);
    };

    // player 省略時は手番プレイヤー。パネルで非手番側のコストを出すために指定できる。
    // 増加分（キャラの加算・敵の🍂）を先に足し、減少分（キャラの割引・魔女のパッシブ・ギア・割引スキル）をそのあとに掛ける。
    // characterCost が増加分→キャラの減少分、gearCost がギアの補正と割引スキル。下限1は減少のたびに掛かる
    const calculateCost = (cost: number, isToken: boolean = false, isPoison: boolean = false, player: Player = currentTurnPlayer, skillKey?: string) =>
        calculateCostOf(costEnvFor(seatOf(player)), cost, isToken, isPoison, skillKey);

    // 土壇場の防壁が発動する勝利は、列が消えるまで勝ちとして扱わない
    const rawWinner = calculateWinner(lineSymbols(currentBoard));
    const winner = rawWinner && lastStandHolderFor(rawWinner) < 0 ? rawWinner : undefined;
    // AIの手番の間は、人間の操作(マス・スキル・ロック切替)を受け付けない。AIは onCellClick/executeSkillForAI を直接呼ぶので影響しない
    const aiTurn = currentAI !== null && !winner;
    stallRef.current = { turn: currentTurn, over: !!winner || currentAI === null, queued: pendingAIMove !== null, spinning: hailMarySpin !== null, charge: onClickCharge };
    // 勝ちを決めた列(複数同時に揃ったら全部)。盤面で光らせる
    const winCells = winner
        ? Array.from(new Set(geo.winLines.filter((line) => line.every((idx) => lineSymbols(currentBoard)[idx] === winner)).flat()))
        : [];
    const currentNecroCost = necroCost[turnSeat];
    const currentNecroRemain = remainNecro[turnSeat];

    // 勝者が確定したら勝利数を1回だけ加算する
    useEffect(() => {
        if (winner) {
            setWinsAt(seatOf(winner), (w) => w + 1);
            playSfx('win');
        }
    }, [winner]);

    // サイレンス中に置けるマスが無い（絶対零度の氷結で全マスが塞がれた等）と進行不能になるので、自動でパスする
    const canPlaceAt = (i: number): boolean => {
        const sq = currentBoard[i];
        if (isShielded(sq, characters)) return false;
        if (sq.player && sq.player !== currentTurnPlayer && sq.bind > 0 && !canHitBound(currentCharacter, currentBoard, seatCount)) return false;
        if (sq.effects.some((x) => x.effect === '🔑') && sq.bind > 0) return false;
        if (emptyBlocked(sq)) return false;
        if (sq.player === currentTurnPlayer && overwriteBlocked(sq)) return false;
        return true;
    };
    const mustPass = !winner && !rawWinner && silenced[turnSeat] && !currentBoard.some((_, i) => canPlaceAt(i));
    useEffect(() => {
        if (!mustPass || hailMarySpin) return;
        const timer = setTimeout(() => {
            addLog('サイレンス中で置ける場所がないため自動でパス');
            setCurrentTurn(currentTurn + 1);
        }, 600);
        return () => clearTimeout(timer);
    }, [mustPass, currentTurn, hailMarySpin]);

    // 継続中スキルの残りターン数を返す
    const continuousEffects = (seat: number): string[] => {
        const labels: string[] = [];
        const assault = useAssault[seat];
        if (assault > 0) labels.push(`全軍突撃 残り${assault}ターン`);
        if (silenced[seat]) labels.push('サイレンス 次の手番スキル不可');
        if (lifeBan[seat]) labels.push('一寸の虫に魂なし ライフ3以下のコマを置けない');
        if (chargeBuff[seat] > 0) labels.push(`静電気の季節 残り${chargeBuff[seat]}ターン`);
        if (gearOff[seat]) labels.push('裸の王様 ギア無効（その手番の終わりまで）');
        const dl = discountLabel(seat);
        if (dl) labels.push(dl);
        if (budGuard[seat]) labels.push('冬至の種子 🌱は火炎で消えず氷結中も働く');
        const necro = remainNecro[seat];
        if (necro > 0) labels.push(`蘇生 残り${necro}ターン`);
        if (proliferate[seat]) {
            const count = proliferateCount[seat];
            labels.push(`増殖 ${count}回目 (次の維持${proliferateUpkeep(count)})`);
        }
        return labels;
    };

    // キャラ固有スキルの現在コスト(スキルボタンの表示と同じ値)。固有スキルのないキャラは空
    const exclusiveSkillCosts = (seat: number): { name: string; cost: number }[] => {
        const sc = costTableFor(seat);
        const g = (cost: number) => gearCost(cost, seat);
        switch (characters[seat]) {
            case 'tactician':
                return [{ name: '全軍突撃', cost: g(sc.onClickTotalAssault - useTokenCount[seat] * 2) }];
            case 'giant':
                return [{ name: 'ストンプ', cost: g(sc.onClickStomp) }];
            case 'magician':
                return [{ name: '審判の日', cost: g(Math.max(0, sc.onClickJudgeDay - useMagicCount[seat])) }];
            case 'yinYangMaster': {
                const yang = yinYangMode[seat] === 'yang';
                return [
                    { name: '陰陽転化', cost: g(sc.onClickToggleYingYang) },
                    yang ? { name: '式神爆破', cost: g(sc.onClickShikigamiBlast) } : { name: '式神設置', cost: g(sc.onClickShikigamiPlace) },
                ];
            }
            case 'necromancer':
                return [{ name: '蘇生', cost: g(necroCost[seat]) }];
            case 'poisoner':
                return [{ name: 'ミアズマ', cost: miasmaCost(symbols[seat]) }];
            case 'electrician':
                return [{ name: '帯電拡散', cost: chargeSpreadCost(symbols[seat]) }];
            case 'cryomancer':
                return [{ name: '絶対零度', cost: glacierCost(symbols[seat]) }];
            case 'pyromancer':
                return [{ name: '業火', cost: infernoCost(symbols[seat]) }];
            case 'witch':
                return [{ name: '虎落笛', cost: mogaribueCost(symbols[seat]) }];
            default:
                return [];
        }
    };

    // 盤面の両サイドに表示するプレイヤー情報パネル
    const playerPanel = (seat: number) => {
        const player = symbols[seat];
        const character = characters[seat];
        const isAI = props.players[seat].isAI;
        const isCurrent = turnSeat === seat && !winner;
        const effects = continuousEffects(seat);
        const exclusiveCosts = exclusiveSkillCosts(seat);
        return (
            <div
                key={seat}
                className={`${styles.panel}${isCurrent ? ` ${styles.panelCurrent}` : ''}`}
                style={{ ['--seat' as string]: `var(--color-seat-${seat})` }}
            >
                <div className={`${styles.avatar} ${AVATAR_CLASSES[seat]}`}>{player}</div>
                <div className={styles.name}>{CHARACTER_NAMES[character]}</div>
                <div className={styles.tags}>
                    <span className={styles.tag}>{isAI ? 'AI' : '人間'}</span>
                    {isCurrent && <span className={styles.turnBadge}>手番</span>}
                </div>
                {baseGearsBySeat[seat].length > 0 && (
                    <div className={`${styles.gears} ${styles.more}`}>
                        {baseGearsBySeat[seat].map((id) => {
                            // 土壇場の防壁は1試合に1回きり。発動済みの席は非活性(灰色・取り消し線)で表示する
                            const spent = gearOff[seat] || (id === 'lastStand' && lastStandUsed.current[seat]); // 裸の王様で無効な間は全部灰色
                            return (
                                <span
                                    key={id}
                                    className={`${styles.gear}${spent ? ` ${styles.gearSpent}` : ''}`}
                                    aria-disabled={spent || undefined}
                                    title={`${gearDefOf(id).name}: ${gearDefOf(id).desc}${spent ? '（発動済み）' : ''}`}
                                >
                                    {gearDefOf(id).icon} {gearDefOf(id).name}
                                    {spent && <span className={styles.gearSpentLabel}>発動済み</span>}
                                </span>
                            );
                        })}
                    </div>
                )}
                <div className={styles.stats}>
                    <span className={styles.chip}>🏆 {wins[seat]}</span>
                    <span className={`${styles.chip} ${styles.chipMagic}`}>⚡ {magic[seat]}</span>
                </div>
                {exclusiveCosts.length > 0 && (
                    <div className={`${styles.skillCosts} ${styles.more}`}>
                        {exclusiveCosts.map((s) => (
                            <div key={s.name} className={styles.skillCost}>
                                <span>{s.name}</span>
                                <b>⚡ {s.cost}</b>
                            </div>
                        ))}
                    </div>
                )}
                {effects.length > 0 && (
                    <div className={`${styles.effects} ${styles.more}`}>
                        {effects.map((label) => (
                            <span key={label} className={styles.effectBadge}>
                                {label}
                            </span>
                        ))}
                    </div>
                )}
            </div>
        );
    };

    const buildLogText = (): string => {
        const header = [
            '# 対戦ログ',
            `盤面: ${geo.size}x${geo.size} / ${seatCount}人`,
            ...props.players.map((p, seat) => `${symbols[seat]} ${CHARACTER_NAMES[p.character]}（${p.isAI ? 'AI' : '人間'}）`),
            winner ? `勝者: ${winner}` : '対戦中',
            '',
            '## 操作ログ',
        ];
        return [...header, ...gameLog].join('\n');
    };

    const [copied, setCopied] = useState<boolean>(false);
    const onClickCopyLog = async () => {
        const text = buildLogText();
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            // クリップボードが使えない環境向けのフォールバック
            window.prompt('以下のログをコピーしてください', text);
        }
    };

    const onClickDownloadLog = () => {
        const blob = new Blob([buildLogText()], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'game-log.txt';
        a.click();
        URL.revokeObjectURL(url);
    };

    // 盤面からキャラクター選択に戻る。対戦の途中なら、中断してよいか確認する
    const onClickBackToSetup = () => {
        const inProgress = currentTurn > 1 && !winner;
        if (inProgress && !window.confirm('対戦を中断して、キャラクター選択に戻りますか？')) return;
        props.onBackToSetup?.();
    };

    const onClickRestart = () => {
        const board = makeBoard();
        const zeros = () => Array(seatCount).fill(0);
        setCurrentBoard(board);
        setHistory([board]);
        setCurrentTurn(1);
        setPlacements(0);
        setMagicAll(Array(seatCount).fill(2));
        setUseMagicCountAll(zeros());
        setUseTokenCountAll(zeros());
        setUseToken(false);
        setUseAssaultAll(zeros());
        setProliferateAll(Array(seatCount).fill(false));
        setSilencedAll(Array(seatCount).fill(false));
        setLifeBanAll(Array(seatCount).fill(false));
        setGearOffAll(Array(seatCount).fill(false));
        setChargeBuffAll(Array(seatCount).fill(0));
        setProliferateCountAll(zeros());
        setUseStomp(false);
        setUseJudgeDay(false);
        setUseBuds([false, 0]);
        setUseLock(0);
        setUseInjection(0);
        setUsePandemic(false);
        setUseChargeOne(false);
        setUseChargeSpread(false);
        setUseChargeArea(false);
        setUseJammer(false);
        setUseFreeze(false);
        setUseIgnite(false);
        setUseTinder(false);
        setGlacierPendingAll(Array(seatCount).fill(false));
        setGlacierChargeAll(Array(seatCount).fill(0));
        setBudGuardAll(Array(seatCount).fill(false));
        setUseSucker(false);
        setUseShikigamiPlace(false);
        setUseShikigamiBlast(false);
        setUseShikigamiBless(false);
        setUseShikigamiCurse(false);
        setUseShikigamiPurge(false);
        setUseSwidden(false);
        setUseSacrifice(false);
        setUseFrostArea(false);
        setUseRelocate(false);
        setRelocateFrom(null);
        setUseClone(false);
        setUsePlunder(false);
        setUseIcicle(false);
        setIcicleCell(null);
        setUseFreezeSpread(false);
        setUseShatter(false);
        setRemainNecroAll(zeros());
        setNecroCostAll(Array(seatCount).fill(baseNecromancyCost));
        setPendingAIMove(null);
        setGameLog([]);
        setHighlightedCells([]);
        setTurnSeat(0);
        setStepRequest(0);
        setRestartCount((c) => c + 1);
        setPreviewCells([]);
        setBoardEffect(null);
        setBoardBurst(null);
        setLockedSkillsAll(Array.from({ length: seatCount }, () => []));
        // ギア: 手番内のスキル使用状況をリセットし、価格破壊のコスト表を引き直す
        gearTurn.current = {
            skills: Array<number>(seatCount).fill(0),
            echoReady: Array<boolean>(seatCount).fill(false),
            echoNext: Array<boolean>(seatCount).fill(false),
            kinds: Array.from({ length: seatCount }, () => new Set<string>()),
            infernoReady: Array<boolean>(seatCount).fill(false),
            discount: Array.from({ length: seatCount }, emptyDiscount),
            freeCast: false,
            oppSkilled: Array<boolean>(seatCount).fill(false),
            oppSkillPrev: Array<boolean>(seatCount).fill(false),
            plantPrev: Array<boolean>(seatCount).fill(false),
            plantBase: Array<number>(seatCount).fill(0),
            placedPrev: Array<boolean>(seatCount).fill(false),
            placeBase: Array<number>(seatCount).fill(0),
            fireBase: Array<number>(seatCount).fill(0),
            shikiPlaced: Array<boolean>(seatCount).fill(false),
            leafBase: Array<number>(seatCount).fill(0),
            tokenFree: Array<boolean>(seatCount).fill(false),
            darkPotUsed: Array<boolean>(seatCount).fill(false),
            chargeBase: Array<number>(seatCount).fill(0),
            processedTurn: 1,
        };
        ruinState.current = {
            active: Array<boolean>(seatCount).fill(false),
            pending: Array<boolean>(seatCount).fill(false),
            snap: null,
            snapBuds: null,
            snapFlames: null,
            ashActive: Array<number>(seatCount).fill(0),
            ashPending: Array<number>(seatCount).fill(0),
            lastMove: null,
        };
        lastStandUsed.current = Array<boolean>(seatCount).fill(false);
        setLastStandSaves(0);
        setPriceTables(rollPriceTables());
    };

    const notLocked = (idx: number) => !isGuarded(currentBoard[idx], characters);
    const isOpponentCell = (idx: number) => !!currentBoard[idx].player && currentBoard[idx].player !== currentTurnPlayer;

    // ボタンホバー時に破壊範囲をプレビューするマス
    const slashPreview = (): number[] => geo.antiDiagonal.filter((idx) => notLocked(idx));
    const backSlashPreview = (): number[] => geo.mainDiagonal.filter((idx) => notLocked(idx));
    const opiumPreview = (): number[] =>
        currentBoard.map((_, idx) => idx).filter((idx) => isOpponentCell(idx) && currentBoard[idx].bind > 0 && notLocked(idx));

    const showPreview = (cells: number[]) => setPreviewCells(cells);
    const clearPreview = () => setPreviewCells([]);

    // マスのホバー時: マス選択型の破壊スキル(ストンプ/審判の日)が構えている間だけ範囲を表示
    const onCellHover = (i: number) => {
        if (useStomp) setPreviewCells(geo.stompRange(i));
        else if (useJudgeDay) setPreviewCells(geo.judgeRange(i));
        else if (usePandemic) setPreviewCells(geo.stompRange(i));
        else if (useInjection > 0) setPreviewCells([i]);
        else if (useChargeOne) setPreviewCells([i]);
        else if (useChargeSpread) setPreviewCells(connectedPieces(currentBoard, i, geo.size));
        else if (useChargeArea) setPreviewCells(geo.stompRange(i));
        else if (useRelocate) setPreviewCells(relocateFrom === null ? (canRelocate(currentBoard[i], currentTurnPlayer) ? [i] : []) : isPlaceable(currentBoard[i]) ? [i] : []);
        else if (useClone) setPreviewCells(cloneSources().includes(i) ? [i, ...cloneTargets(currentBoard, i, geo.size)] : []);
        else if (usePlunder) setPreviewCells(plunderTargets(currentBoard, currentTurnPlayer, characters).includes(i) ? [i] : []);
        else if (useFrostArea) setPreviewCells(geo.stompRange(i));
        else if (useIcicle) setPreviewCells([i]);
        else if (useFreezeSpread) setPreviewCells(connectedPieces(currentBoard, i, geo.size));
        else if (useShatter) setPreviewCells(currentBoard[i].player && isFrozen(currentBoard[i]) ? [i] : []);
        else if (useKimon) setPreviewCells(kimonCandidates().includes(i) ? [i] : []);
        else if (useSacrifice) setPreviewCells(sacrificeCandidates().includes(i) ? [i, ...sacrificeTargets(currentBoard, currentBoard[i].bind, currentTurnPlayer, characters)] : []);
        else if (useSwidden) setPreviewCells(budStacks(currentBoard[i]) > 0 ? [i] : []);
        else if (useShikigamiPlace) setPreviewCells(shikigamiLandable(currentBoard[i]) ? [i, ...geo.surroundRange(i)] : []);
        else if (useShikigamiBlast) setPreviewCells(ownShikigami().includes(i) ? [i, ...geo.surroundRange(i)] : []);
        else if (useShikigamiBless) setPreviewCells(ownShikigami().includes(i) ? [i, ...blessTargets()] : []);
        else if (useShikigamiCurse) setPreviewCells(ownShikigami().includes(i) ? [i, ...curseTargets()] : []);
        else if (useShikigamiPurge) setPreviewCells(purgeTargets().includes(i) ? [i] : []);
        else if (useSucker) setPreviewCells(suckerSources().includes(i) ? [i, ...budReceivers(currentBoard, i, currentTurnPlayer, geo.size)] : []);
        else if (useFreeze) setPreviewCells(canFreeze(currentBoard[i]) ? [i] : []);
        else if (useIgnite) setPreviewCells([i]);
        else if (useTinder) setPreviewCells(tinderCandidates().includes(i) ? [i] : []);
        else if (useThunderFire) setPreviewCells(thunderFireTargets().includes(i) ? [i, ...geo.surroundRange(i)] : []);
        else if (useStash) setPreviewCells(stashTargets().includes(i) ? [i] : []);
        else if (useJammer) setPreviewCells(canJam(currentBoard, i, currentTurnPlayer, characters) ? jammerTargets(currentBoard, i, geo.size, currentTurnPlayer) : []);
    };
    const onCellLeave = () => {
        if (useStomp || useJudgeDay || usePandemic || useInjection > 0 || useChargeOne || useChargeSpread || useChargeArea || useJammer || useStash || useThunderFire || useFreeze || useIgnite || useTinder || useSucker || useShikigamiPlace || useShikigamiBlast || useShikigamiBless || useShikigamiCurse || useShikigamiPurge || useSwidden || useSacrifice || useKimon || useRelocate || useClone || usePlunder || useFrostArea || useIcicle || useFreezeSpread || useShatter) setPreviewCells([]);
    };

    // マス選択待ちのスキル名。選択後の演出より先に「何が発動したか」を盤面上に出す
    const pendingSkillName = useStomp
        ? 'ストンプ'
        : useThunderFire
        ? '雷のない所に火は立たぬ'
        : useStash
        ? '雷神のへそくり'
        : useJudgeDay
        ? '審判の日'
        : useChargeSpread
        ? '帯電拡散'
        : usePandemic
        ? 'パンデミック'
        : useInjection > 0
        ? 'インジェクション'
        : useChargeOne
        ? '帯電付与'
        : useRelocate
        ? '縮地'
        : useClone
        ? '写し身'
        : usePlunder
        ? '追い剥ぎ'
        : useFrostArea
        ? '範囲氷結'
        : useIcicle
        ? '氷柱'
        : useFreezeSpread
        ? '氷結拡散'
        : useShatter
        ? '砕氷'
        : useSacrifice
        ? '殉火'
        : useKimon
        ? '鬼門封じ'
        : useSwidden
        ? '焼畑'
        : useShikigamiPlace
        ? '式神設置'
        : useShikigamiBlast
        ? '式神爆破'
        : useShikigamiBless
        ? '式神の加護'
        : useShikigamiCurse
        ? '式神の呪詛'
        : useShikigamiPurge
        ? '式神の供犠'
        : useSucker
        ? 'ひこばえ'
        : useFreeze
        ? '氷結'
        : useIgnite
        ? '火遁'
        : useTinder
        ? '火口'
        : null;
    const skillAnnounce = pendingSkillName
        ? `${hailMaryPick ? `ヘイルメアリー → ` : ''}${pendingSkillName}：マスを選択`
        : hailMaryPick
        ? `ヘイルメアリー → ${hailMaryPick}`
        : null;

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
        { idx: 12, onClick: onClickUseDoubleLock, buttonText: `ダブルロック-${calculateCost(seatCosts.onClickDoubleLock, false, false, currentTurnPlayer, 'onClickDoubleLock')}`, paragraph: `マスを2つ選択し、${gearLockBind(turnGears)}ターン以上ロックします`, disabled: checkSkillDisable(seatCosts.onClickDoubleLock) },
        { idx: 13, onClick: onClickUseTripleLock, buttonText: `トリプルロック-${calculateCost(seatCosts.onClickTripleLock, false, false, currentTurnPlayer, 'onClickTripleLock')}`, paragraph: `マスを3つ選択し、${gearLockBind(turnGears)}ターン以上ロックします`, disabled: checkSkillDisable(seatCosts.onClickTripleLock) },
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
        { idx: 50, onClick: onClickRelocate, buttonText: `縮地-${calculateCost(seatCosts.onClickRelocate, false, false, currentTurnPlayer, 'onClickRelocate')}`, paragraph: `自陣のコマを選び、空きマスを選ぶと、ライフ・エフェクトごと移動します\n🔑ロック中・氷結中のコマは動かせません`, disabled: checkSkillDisable(seatCosts.onClickRelocate) || relocateSources().length === 0 || !currentBoard.some(isPlaceable) },
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
        { idx: 76, onClick: onClickStrip, buttonText: `裸の王様-${calculateCost(seatCosts.onClickStrip, false, false, currentTurnPlayer, 'onClickStrip')}`, paragraph: `相手全員のギアを、その相手の次の手番の終わりまで無効にします（ギアを装備している相手だけが対象）`, disabled: checkSkillDisable(seatCosts.onClickStrip) || stripTargets().length === 0 },
        { idx: 77, onClick: onClickChargeSeason, buttonText: `静電気の季節-${calculateCost(seatCosts.onClickChargeSeason, false, false, currentTurnPlayer, 'onClickChargeSeason')}`, paragraph: `今の手番を含む3ターンの間、自分が設置する駒（着手・トークン）に⚡を付けます（雷霆の巫以外は乗った時点でダメージ）\n自陣に⚡が1つもなければ、コスト-2`, disabled: checkSkillDisable(seatCosts.onClickChargeSeason, false, false, 'onClickChargeSeason') || chargeBuff[turnSeat] > 0 },
        { idx: 78, onClick: onClickBristle, buttonText: `総毛立つ-${calculateCost(seatCosts.onClickBristle, false, false, currentTurnPlayer, 'onClickBristle')}`, paragraph: `自陣のすべてのコマ（🔑ロック中を除く）に⚡を1つずつ付けます（雷霆の巫以外は乗った時点でダメージ）\nこのターンに⚡を付与するスキルを使っていれば、コスト-2`, disabled: checkSkillDisable(seatCosts.onClickBristle, false, false, 'onClickBristle') || bristleTargets().length === 0 },
        { idx: 79, onClick: onClickRelease, buttonText: `落雷は忘れた頃に-${calculateCost(seatCosts.onClickRelease, false, false, currentTurnPlayer, 'onClickRelease')}`, paragraph: `自陣の⚡をすべて取り除き、取り除いた数だけ敵の全コマにダメージを与えます（ロック・無敵・氷結中・ライフ0のコマには効きません）`, disabled: checkSkillDisable(seatCosts.onClickRelease) || ownChargeStacks() === 0 },
        { idx: 80, onClick: onClickStash, buttonText: `雷神のへそくり-${calculateCost(seatCosts.onClickStash, false, false, currentTurnPlayer, 'onClickStash')}`, paragraph: `⚡のある自陣のコマを1つ選んで⚡を全て取り除き、取り除いたスタック1つにつき、次に打つスキルのコストを-1します（軽減後は最低1。この手番の間だけ有効）`, disabled: checkSkillDisable(seatCosts.onClickStash) || stashTargets().length === 0 },
        { idx: 81, onClick: onClickThunderFire, buttonText: `雷のない所に火は立たぬ-${calculateCost(seatCosts.onClickThunderFire, false, false, currentTurnPlayer, 'onClickThunderFire')}`, paragraph: `⚡のあるコマ（自分の無敵マスも可。🔑ロック中と他人の無敵マスは不可）を1つ選んで破壊し、周囲8マスの敵コマのうち2つ〜全部をランダムに選んで🔥を1つずつ付けます（氷結中のコマは❄が1つ減るだけで、火は燃え移りません）`, disabled: checkSkillDisable(seatCosts.onClickThunderFire) || thunderFireTargets().length === 0 },
        { idx: 82, onClick: onClickDarkPot, buttonText: `一寸先は闇鍋-${calculateCost(seatCosts.onClickDarkPot, false, false, currentTurnPlayer, 'onClickDarkPot')}`, paragraph: `敵味方を問わず全コマ（🔑ロック・無敵は除く）に🔥❄⚡☠🌱🍂をランダムに付けます\n盤面のエフェクトの数だけコストが下がります（最低1）。1ターンに1度だけ使えます\n各エフェクトはコマごとに最大1で、複数の種類が同居します（🔥は❄🌱🍂と同居できず、出会うと半々で🔥が勝つか消えます）`, disabled: checkSkillDisable(seatCosts.onClickDarkPot, false, false, 'onClickDarkPot') || gearTurn.current.darkPotUsed[turnSeat] || !currentBoard.some((sq) => sq.player && !isGuarded(sq, characters)) },
        { idx: 83, onClick: onClickChargeHeal, buttonText: `雷を食らわば皿まで-${calculateCost(seatCosts.onClickChargeHeal, false, false, currentTurnPlayer, 'onClickChargeHeal')}`, paragraph: `⚡が効いている自陣のコマのライフを、⚡のスタック1つにつき+2します\nこのターンに付与した⚡の数だけコストが下がります（最低1。使うとリセット）`, disabled: checkSkillDisable(seatCosts.onClickChargeHeal, false, false, 'onClickChargeHeal') || chargeHealCells().length === 0 },
        { idx: 92, onClick: onClickSmallFry, buttonText: `一寸の虫に魂なし-${calculateCost(seatCosts.onClickSmallFry, false, false, currentTurnPlayer, 'onClickSmallFry')}`, paragraph: `敵のライフ3以下のコマを全て破壊します（氷結中は❄が1つ減るだけ・🔑ロックと無敵は除く）\n相手全員は次の手番の終わりまで、ライフ3以下のコマを置けません（トークン・式神などのスキルも含む）\n盤面のコマの数だけコストが下がります（最低1）`, disabled: checkSkillDisable(seatCosts.onClickSmallFry, false, false, 'onClickSmallFry') },
        { idx: 93, onClick: onClickFirstFrost, buttonText: `初霜-${calculateCost(seatCosts.onClickFirstFrost, true, false, currentTurnPlayer, 'onClickFirstFrost')}`, paragraph: `敵の🍂があるコマを全て凍結し（🔑ロック・⚡無敵は除く）、自陣にバッズトークンを1つ置きます\nトークンはターンに一度だけ。盤面の🍂が3枚以上ならコスト0`, disabled: checkSkillDisable(seatCosts.onClickFirstFrost, true, false, 'onClickFirstFrost') || firstFrostTargets(currentBoard, currentTurnPlayer, characters).length === 0 },
        { idx: 94, onClick: onClickGather, buttonText: `吹き寄せ-${calculateCost(seatCosts.onClickGather, true, false, currentTurnPlayer, 'onClickGather')}`, paragraph: `自陣にトークンを1つ置き、盤面のエフェクトを全てそのマスに集めます（氷結のあるマスと⚡無敵のマスは動かさず、🔑と📜はその場に残ります。🔥は集め終えてから処理）\nエフェクト1つにつきコスト-2（氷結のマスは❄の数だけ・🔑自体は数えない。最低1）`, disabled: checkSkillDisable(seatCosts.onClickGather, true, false, 'onClickGather') || findEmptyIndexes(currentBoard).length === 0 },
        { idx: 95, onClick: onClickBurnOff, buttonText: `山焼き-${calculateCost(seatCosts.onClickBurnOff, true, false, currentTurnPlayer, 'onClickBurnOff')}`, paragraph: `敵のエフェクトがあるマス（氷結・⚡無敵のマスは除く）全てに🔥を1つ付け、自陣にロック付きトークンを1つ置きます\nエフェクト1つにつきコスト-3（氷結のマスは❄の数だけ・🔑自体は数えない。最低1）`, disabled: checkSkillDisable(seatCosts.onClickBurnOff, true, false, 'onClickBurnOff') },
        { idx: 96, onClick: onClickFreeToken, buttonText: `無礼講-${calculateCost(seatCosts.onClickFreeToken, false, false, currentTurnPlayer, 'onClickFreeToken')}`, paragraph: `このターン、トークン系スキルのコストを0にします（手番が終わると切れます）`, disabled: checkSkillDisable(seatCosts.onClickFreeToken) || gearTurn.current.tokenFree[turnSeat] },
        { idx: 84, onClick: onClickLeafDrop, buttonText: `落ち葉の置き土産-${calculateCost(seatCosts.onClickLeafDrop, false, false, currentTurnPlayer, 'onClickLeafDrop')}`, paragraph: `ランダムな敵のコマ1つに🍂を1つ付与します（🔑ロックと⚡無敵のコマは対象外）\n敵の🍂は、その持ち主以外のスキルコストを増やします`, disabled: checkSkillDisable(seatCosts.onClickLeafDrop, false, false) || leafDropCandidates().length === 0 },
        { idx: 85, onClick: onClickKindling, buttonText: `焚きつけ-${calculateCost(seatCosts.onClickKindling, false, false, currentTurnPlayer, 'onClickKindling')}`, paragraph: `敵の🍂を全て🔥に変換します（🍂1枚につき🔥1つ。🔑ロックと⚡無敵のコマは対象外）\n氷結中のコマは🔥の代わりに❄が解除されます`, disabled: checkSkillDisable(seatCosts.onClickKindling, false, false) || kindlingCandidates().length === 0 },
        { idx: 87, onClick: onClickTinder, buttonText: `火口-${calculateCost(seatCosts.onClickTinder, false, false, currentTurnPlayer, 'onClickTinder')}`, paragraph: `🌱バッズ・🍂・❄氷結のいずれかを持つ敵のコマを1つ選び、🔥火炎を1つ付与します（氷結中は氷結が解けます）\n付与した瞬間に1ダメージ。🔥は🌱・🍂を焼いて消します（🔑ロックと⚡無敵のコマは選べません）\n直前の手番に🌱か🍂が植えられていれば、各ターン1回まで無料です\n鍛冶師は🔥付与のスキルが-1`, disabled: checkSkillDisable(seatCosts.onClickTinder) || tinderCandidates().length === 0 },
        { idx: 86, onClick: onClickLeafCloak, buttonText: `落葉の衣-${calculateCost(seatCosts.onClickLeafCloak, false, false, currentTurnPlayer, 'onClickLeafCloak')}`, paragraph: `ランダムな自陣のコマ1つ（🔑ロック中も含む）に🍂を1つ付与します\n自陣の🍂は、相手全員のスキルコストを🍂の数だけ増やします`, disabled: checkSkillDisable(seatCosts.onClickLeafCloak) || leafCloakCandidates().length === 0 },
    ];

    return (
        <div className={`${styles.game}${showDetail ? ` ${styles.detail}` : ''}`}>
            <div className={styles.main}>
                {seatCount === 2 ? playerPanel(0) : <div className={styles.seatList}>{range(0, seatCount).map(playerPanel)}</div>}
                <div className={styles.boardWrap}>
                    <Status winner={winner} nextPlayer={currentTurnPlayer} life={life} magicBonus={lateMagicBonus(currentTurn, seatCount)} />
                    {skillAnnounce && <div className={styles.announce}>{skillAnnounce}</div>}
                    {useIcicle && icicleCell !== null && (
                        <div className={styles.announce}>
                            {posName(icicleCell)}を通る線:{' '}
                            {([['row', '横'], ['col', '縦'], ['diag', '↘'], ['anti', '↗']] as [LineDir, string][]).map(([dir, label]) => (
                                <button key={dir} className={styles.btn} disabled={aiTurn} onClick={() => exeIcicle(dir)}>
                                    {label}
                                </button>
                            ))}
                        </div>
                    )}
                    <div
                        className={`${styles.boardArea}${boardEffect && SHAKE_EFFECTS.includes(boardEffect.type) ? ` ${styles.shake}` : ''}`}
                        style={{ ['--sq' as string]: boardSqCss(geo.size) }}
                    >
                        <Board
                            size={geo.size}
                            squares={currentBoard}
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
                        />
                        <BoardEffects effect={boardEffect} burst={boardBurst} size={geo.size} />
                        {winner && <VictoryEffect key={winner} winner={winner} seat={seatOf(winner)} />}
                        <GearToasts toasts={gearToasts} />
                        {hailMarySpin && (
                            <div className={styles.hmOverlay}>
                                <div className={`${styles.hmBand} ${styles[`hm_${hailMarySpin.phase}`]}`}>{hailMarySpin.label}</div>
                            </div>
                        )}
                    </div>
                    <div className={styles.controls}>
                        <button className={`${styles.btn}${winner ? ` ${styles.btnPrimary}` : ''}`} onClick={onClickRestart}>
                            リスタート
                        </button>
                        <button
                            className={styles.btn}
                            onClick={onClickToggleSound}
                            aria-pressed={soundOn}
                            title={soundOn ? '効果音をオフにする' : '効果音をオンにする'}
                        >
                            {soundOn ? '🔊 音あり' : '🔇 音なし'}
                        </button>
                        <button className={`${styles.btn} ${styles.detailBtn}`} aria-pressed={showDetail} onClick={() => setShowDetail((v) => !v)}>
                            {showDetail ? '詳細を閉じる ▴' : '詳細 ▾'}
                        </button>
                        {props.onBackToSetup && (
                            <button className={styles.btn} onClick={onClickBackToSetup}>
                                キャラ選択に戻る
                            </button>
                        )}
                        {isAllAI && (
                            <>
                                <label className={styles.check}>
                                    <input type='checkbox' checked={autoPlay} onChange={(e) => setAutoPlay(e.target.checked)} />
                                    自動進行
                                </label>
                                <button
                                    className={styles.btn}
                                    onClick={() => setStepRequest((c) => c + 1)}
                                    disabled={autoPlay || !!winner || pendingAIMove !== null}
                                >
                                    次の手番
                                </button>
                            </>
                        )}
                    </div>
                </div>
                {seatCount === 2 && playerPanel(1)}
                <div className={styles.logPreview} aria-hidden='true'>
                    {gameLog.length === 0 ? 'まだ操作はありません' : gameLog[gameLog.length - 1]}
                </div>
                <div className={styles.log}>
                    <div className={styles.logHead}>
                        <span className={styles.logTitle}>操作ログ</span>
                        <button className={styles.logBtn} onClick={onClickCopyLog} disabled={gameLog.length === 0}>
                            {copied ? 'コピー済' : 'コピー'}
                        </button>
                        <button className={styles.logBtn} onClick={onClickDownloadLog} disabled={gameLog.length === 0}>
                            DL
                        </button>
                    </div>
                    <div className={styles.logBody}>
                        {gameLog.length === 0 ? (
                            <div className={styles.logEmpty}>まだ操作はありません</div>
                        ) : (
                            [...gameLog].reverse().map((entry, idx) => (
                                <div key={gameLog.length - idx} className={styles.logEntry}>
                                    {entry}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
            <div className={`${styles.skills}${hailMarySpin || silenced[turnSeat] ? ` ${styles.skillsBusy}` : ''}`}>
                <div className={styles.skillsHead}>
                    <div className={styles.skillsTitle}>スキル{silenced[turnSeat] && <span className={styles.silenceNote}> サイレンス中: この手番はスキルを使えません</span>}</div>
                    <button type='button' className={styles.expandAll} aria-pressed={expandAllDesc} onClick={() => setExpandAllDesc((v) => !v)}>
                        {expandAllDesc ? '説明をすべて閉じる' : '説明をすべて開く'}
                    </button>
                </div>
                <div className={styles.skillStrip}>
                    {stripEdge.left && (
                        <button type='button' className={`${styles.stripArrow} ${styles.stripLeft}`} aria-label='左のスキルを見る' onClick={() => scrollStrip(-1)}>
                            ‹
                        </button>
                    )}
                    <div className={styles.skillGrid} ref={skillGridRef} onScroll={updateStripEdge}>
                    <SkillButton inputBlocked={aiTurn} magic={magic[turnSeat]} tokenUsed={useToken} expandAll={expandAllDesc} onClick={onClickCharge} buttonText={`チャージ+${charge}`} paragraph={`ターンを終了し、マジックを+${charge}します`} />
                    <SkillButton inputBlocked={aiTurn} magic={magic[turnSeat]} tokenUsed={useToken} expandAll={expandAllDesc}
                        onClick={onClickShuffle}
                        buttonText={`シャッフル-${seatCosts.onClickShuffle}`}
                        paragraph='固定でないスキルをシャッフルします'
                        disabled={magic[turnSeat] < seatCosts.onClickShuffle}
                    />
                    <SkillButton inputBlocked={aiTurn} magic={magic[turnSeat]} tokenUsed={useToken} expandAll={expandAllDesc}
                        onClick={onClickUseLock}
                        hidden={currentCharacter === 'cryomancer'}
                        buttonText={`ロック-${calculateCost(seatCosts.onClickUseLock, false, false, currentTurnPlayer, 'onClickUseLock')}`}
                        paragraph={`選択したマスを${gearLockBind(turnGears)}ターン以上ロックします`}
                        disabled={checkSkillDisable(seatCosts.onClickUseLock)}
                    />
                    <SkillButton inputBlocked={aiTurn} magic={magic[turnSeat]} tokenUsed={useToken} expandAll={expandAllDesc}
                        onClick={onClickCryoFreeze}
                        buttonText={`氷結-${calculateCost(seatCosts.onClickCryoFreeze, false, false, currentTurnPlayer, 'onClickCryoFreeze')}`}
                        paragraph={'マスを1つ選び、❄氷結を付与します（空きマスも可）\n氷結中の空きマスには誰も着手できません。氷結したコマはターン進行でライフが減らず、スキルのダメージを❄1つで肩代わりしますが、自分も重ねて強化できません'}
                        hidden={currentCharacter !== 'cryomancer'}
                        disabled={checkSkillDisable(seatCosts.onClickCryoFreeze)}
                    />
                    <SkillButton inputBlocked={aiTurn} magic={magic[turnSeat]} tokenUsed={useToken} expandAll={expandAllDesc}
                        onClick={onClickTotalAssault}
                        buttonText={`全軍突撃-${totalAssaultCost}`}
                        paragraph={
                            '3ターンの間、ターン終了時にランダムにトークンを設置します コストは使用したトークンの回数×2軽減されます(使用後はカウントがリセットされます)'
                        }
                        hidden={currentCharacter !== 'tactician'}
                        exclusive
                        disabled={magic[turnSeat] < totalAssaultCost}
                    />
                    <SkillButton inputBlocked={aiTurn} magic={magic[turnSeat]} tokenUsed={useToken} expandAll={expandAllDesc}
                        onClick={onClickStomp}
                        buttonText={`ストンプ-${gearCost(seatCosts.onClickStomp, turnSeat, false, 'onClickStomp')}`}
                        paragraph={'クリックしたセルと周囲1マスを破壊します'}
                        hidden={currentCharacter !== 'giant'}
                        exclusive
                        disabled={checkSkillDisable(seatCosts.onClickStomp)}
                    />
                    <SkillButton inputBlocked={aiTurn} magic={magic[turnSeat]} tokenUsed={useToken} expandAll={expandAllDesc}
                        onClick={onClickJudgeDay}
                        buttonText={`審判の日-${judgeDayCost}`}
                        paragraph='セルをクリックし、審判を下します コストは使用したスキルの回数軽減されます(使用後はカウントがリセットされます)'
                        hidden={currentCharacter !== 'magician'}
                        exclusive
                        disabled={magic[turnSeat] < judgeDayCost}
                    />
                    <SkillButton inputBlocked={aiTurn} magic={magic[turnSeat]} tokenUsed={useToken} expandAll={expandAllDesc}
                        onClick={onClickToggleYingYang}
                        buttonText={`陰陽転化-${gearCost(seatCosts.onClickToggleYingYang, turnSeat, false, 'onClickToggleYingYang')}`}
                        paragraph={`陰陽のモードを切り替えます 現在のモード:${yinYangModeName(turnSeat)}`}
                        hidden={currentCharacter !== 'yinYangMaster'}
                        exclusive
                        disabled={checkSkillDisable(seatCosts.onClickToggleYingYang)}
                    />
                    <SkillButton inputBlocked={aiTurn} magic={magic[turnSeat]} tokenUsed={useToken} expandAll={expandAllDesc}
                        onClick={onClickNecromancy}
                        buttonText={`蘇生-${gearCost(currentNecroCost, turnSeat, false, 'onClickNecromancy')}${currentNecroRemain > 0 ? `(発動中:残${currentNecroRemain})` : ''}`}
                        paragraph={`発動時に墓地の死体数だけ(最大${necromancySummonCap})ライフ${necromancyReviveLife}のコマを召喚し、${necromancyDuration}ターンの間ライフ0の敵コマを自動吸収します 墓地は盤上でコマが奪われる/消えるたびに貯まり、コスト軽減と召喚数になります(使用後リセット)`}
                        hidden={currentCharacter !== 'necromancer'}
                        exclusive
                        disabled={checkSkillDisable(currentNecroCost) || placeBlocked(lifeBan[turnSeat], 'onClickNecromancy', calculateTokenBind())}
                    />
                    <SkillButton inputBlocked={aiTurn} magic={magic[turnSeat]} tokenUsed={useToken} expandAll={expandAllDesc}
                        onClick={onClickMiasma}
                        buttonText={`ミアズマ-${miasmaCost()}`}
                        paragraph={'自陣の毒が乗っているマスの周囲1マスの敵コマに毒を付与します（毒マスが重なると積み上がります） 自陣の毒はすべて消えます コストは自陣の毒の数だけ軽減されます'}
                        hidden={currentCharacter !== 'poisoner'}
                        exclusive
                        disabled={magic[turnSeat] < miasmaCost() || miasmaPlan(currentBoard, currentTurnPlayer).size === 0}
                    />
                    <SkillButton inputBlocked={aiTurn} magic={magic[turnSeat]} tokenUsed={useToken} expandAll={expandAllDesc}
                        onClick={onClickChargeSpread}
                        buttonText={`帯電拡散-${chargeSpreadCost()}`}
                        paragraph={'コマを選択し、そこからコマのあるマスだけを縦横に辿って届くすべてのコマ(敵味方問わず)に⚡を1つ付与します（雷霆の巫以外のコマは乗った時点で2ダメージ） コストは盤面の⚡の数だけ軽減されます'}
                        hidden={currentCharacter !== 'electrician'}
                        exclusive
                        disabled={magic[turnSeat] < chargeSpreadCost()}
                    />
                    <SkillButton inputBlocked={aiTurn} magic={magic[turnSeat]} tokenUsed={useToken} expandAll={expandAllDesc}
                        onClick={onClickGlacier}
                        buttonText={`絶対零度-${glacierCost()}`}
                        paragraph={`全てのマス（空きマス含む。🔑ロック中を除く）に❄を1つ足します\n次の自分の手番開始時に、他のプレイヤーの氷結マスへ❄1つにつき3ダメージを与えて氷結を解除し、ライフが0になったマスを破壊します\nコストは盤面の氷結マスの数だけ軽減されます（下限1）${glacierPending[turnSeat] ? '\n発動待ちです' : ''}`}
                        hidden={currentCharacter !== 'cryomancer'}
                        exclusive
                        disabled={magic[turnSeat] < glacierCost() || glacierPending[turnSeat]}
                    />
                    <SkillButton inputBlocked={aiTurn} magic={magic[turnSeat]} tokenUsed={useToken} expandAll={expandAllDesc}
                        onClick={onClickInferno}
                        buttonText={`業火-${infernoCost()}`}
                        paragraph={'敵のコマ全て(🔑ロック中・⚡無敵を除く)に🔥火炎を2つずつ付与します\n氷結中のマスは🔥の代わりに❄が全て解除されます。🔥が付いたマスの縦横隣の氷結は即座に解けます\n1手番に異なるスキルを3種類以上使うと、次の業火がコスト0になります（手番を跨いで持ち越し。同じスキルの連打は1種類と数えます。撃つとリセット）'}
                        hidden={currentCharacter !== 'pyromancer'}
                        exclusive
                        disabled={magic[turnSeat] < infernoCost() || infernoTargets(currentBoard, currentTurnPlayer, characters).length === 0}
                    />
                    <SkillButton inputBlocked={aiTurn} magic={magic[turnSeat]} tokenUsed={useToken} expandAll={expandAllDesc}
                        onClick={onClickMogaribue}
                        buttonText={`虎落笛-${mogaribueCost()}`}
                        paragraph={`自陣の🍂の枚数(${mogaribueDamage(currentBoard, currentTurnPlayer)})ぶん、敵のコマ全てにダメージを与えます(🔑ロック中・⚡無敵を除く。氷結中は❄が1つ減るだけ、🔥中は1.5倍)\n同時に自陣のコマ全てのライフが+${MOGARIBUE_LIFE}されます`}
                        hidden={currentCharacter !== 'witch'}
                        exclusive
                        disabled={magic[turnSeat] < mogaribueCost() || !canMogaribue(currentBoard, currentTurnPlayer)}
                    />
                    <SkillButton inputBlocked={aiTurn} magic={magic[turnSeat]} tokenUsed={useToken} expandAll={expandAllDesc}
                        onClick={onClickIgnite}
                        buttonText={`火遁-${calculateCost(seatCosts.onClickIgnite, false, false, currentTurnPlayer, 'onClickIgnite')}`}
                        paragraph={'マスを選択し、🔥火炎を1つ付与します（重複可）。空きマスにも置けます\n空きマスの🔥は、そこに置かれたコマ（誰のコマでも）に引き継がれます\n付与したマスと縦横隣の氷結は即座に解けます'}
                        hidden={currentCharacter !== 'pyromancer'}
                        exclusive
                        disabled={checkSkillDisable(seatCosts.onClickIgnite)}
                    />
                    <SkillButton inputBlocked={aiTurn} magic={magic[turnSeat]} tokenUsed={useToken} expandAll={expandAllDesc}
                        onClick={onClickShikigamiPlace}
                        buttonText={`式神設置-${gearCost(seatCosts.onClickShikigamiPlace, turnSeat, false, 'onClickShikigamiPlace')}`}
                        paragraph={'任意の空きマスに式神（ライフ2の紙の分身）を置きます 式神は列の並びに数えません\n自分で補強すると🌱付きの自陣のコマになり、相手に乗っ取られると空きマスになります'}
                        hidden={currentCharacter !== 'yinYangMaster' || currentYinYangMode === 'yang'}
                        exclusive
                        disabled={checkSkillDisable(seatCosts.onClickShikigamiPlace) || findEmptyIndexes(currentBoard).length === 0 || placeBlocked(lifeBan[turnSeat], 'onClickShikigamiPlace', calculateTokenBind())}
                    />
                    <SkillButton inputBlocked={aiTurn} magic={magic[turnSeat]} tokenUsed={useToken} expandAll={expandAllDesc}
                        onClick={onClickShikigamiBlast}
                        buttonText={`式神爆破-${gearCost(seatCosts.onClickShikigamiBlast, turnSeat, false, 'onClickShikigamiBlast')}`}
                        paragraph={`自分の式神を1つ選んで爆破します 式神は消え、周囲8マスの敵のコマに${SHIKIGAMI_BLAST_DAMAGE}ダメージ（0になったコマは破壊）\n周囲の空きマスは自分の式神になります`}
                        hidden={currentCharacter !== 'yinYangMaster' || currentYinYangMode !== 'yang'}
                        exclusive
                        disabled={checkSkillDisable(seatCosts.onClickShikigamiBlast) || ownShikigami().length === 0}
                    />
                    {shuffleSkillDefs.map((s) => (
                        <SkillButton inputBlocked={aiTurn} magic={magic[turnSeat]} tokenUsed={useToken} expandAll={expandAllDesc}
                            key={s.idx}
                            onClick={s.onClick}
                            buttonText={s.buttonText}
                            paragraph={s.paragraph}
                            disabled={s.disabled || placeBlocked(lifeBan[turnSeat], SKILL_CATALOG[s.idx]?.costKey, calculateTokenBind())}
                            hidden={!skills.includes(s.idx) || (s.idx === 30 && currentCharacter === 'cryomancer')}
                            locked={currentLockedSkills.includes(s.idx)}
                            onToggleLock={() => toggleLock(s.idx)}
                            onHoverStart={s.onHoverStart}
                            onHoverEnd={s.onHoverEnd}
                        />
                    ))}
                    </div>
                    {stripEdge.right && (
                        <button type='button' className={`${styles.stripArrow} ${styles.stripRight}`} aria-label='右のスキルを見る' onClick={() => scrollStrip(1)}>
                            ›
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
