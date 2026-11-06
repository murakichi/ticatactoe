import React, { useState, useEffect, useRef } from 'react';
import { CharacterId, YingYangMode } from '../../types/Character';
import { Player, PLAYER_SYMBOLS, seatOf } from '../../types/Player';
import { SquareInfo } from '../../types/SquareInfo';
import { randomAnyPick, range, calculateWinner, isShikigami, lineSymbols, findEmptyIndexes, randomPick, calculateLife, LIFE_STD } from '../../util';
import AIPlayer, { MAX_REROLLS, rerollBudget } from './AIPlayer';
import { planAITurn, resolveMoveCell } from './aiTurn';
import { breakDeadlock, isDeadlocked } from './deadlock';
import { advanceGearState, gearCostContext, noteSkillUsed } from './gearTurn';
import { BLESSING_STACK, BLESSING_TURNS, LOCK_EXTEND_STACK, SEAL_EMPTY_STACK, SEAL_MIN_COST, SEAL_OWN_STACK, VACANT_SEAL_REACH_CUT, VACANT_SEAL_STACK, lockBlocksPlacement, lockExtendCells, lockRaidCells, vacantSealCells } from './keysmith';
import { turnStartMagic, PROLIFERATE, proliferateUpkeep } from './turn';
import { shikigamiLandable, SHIKIGAMI_BLAST_DAMAGE, SHIKIGAMI_BLESS_LIFE, SHIKIGAMI_CURSE_STACKS, SHIKIGAMI_LIFE } from './shikigami';
import { boardWinner, effectSnapshot, EffectSnapshot, enforceEffectRules, encircleWinner, newPieceBlocked, ownPieceCount, skillRestricted, OBJECT_SKILLS, OBJECT_SKILL_KEYS, ObjectSkill, objectSkillUsable, OBJECT_DEFS, OBJECT_KINDS, ObjectKind, objectLandable, objectLandableCells, objectLifeBonus, objectTurnStart, sweepBurntTrees } from './objects';
import { CostEnv, calculateCostOf, gearCostOf, SHIKIGAMI_PURGE_FREE } from './cost';
import { Board } from './Board';
import { BoardEffects, SkillEffectType } from './BoardEffects';
import { VictoryEffect } from './VictoryEffect';
import { GearToasts } from './GearToasts';
import { SkillButton } from './SkillButton';
import { boardSizeFor, boardSqCss, clampBoardSize, geometryOf, LineDir } from './boardGeometry';
import { canHitBound, isTakeProtected } from './decay';
import { resolveDeck, SKILL_CATALOG, skillOf } from './deck';
import { parseSkillText } from './skillMeta';
import { cloneTargets, plunderTargets } from './generic';
import { lateMagicBonus } from './lateMagic';
import { seatForTurn } from './giantTurn';
import { BOLT_SILENCE_BOLTS, isShielded, isGuarded, shieldedCells, connectedPieces, boardChargeCount, canJam, jammerTargets, isFullyCharged, applyOverload } from './charge';
import { firstFrostTargets } from './tokenSkills';
import { placeBlocked } from './lifeBan';
import { SECOND_CATCH_MAX_BASE } from './bigSkills';
import { graveOfferingTarget, placeWardPiece, POISON_WARD_TURNS } from './graveSkills';
import { emptyDiscount, DiscountKey, SHIKIGAMI_DISCOUNT_BASE } from './discount';
import { BURNOUT_FREE_FLAMES, burnoutTargets, totalFlames, isFrozen, emptyBlocked, randomFreezeCandidates, frostfallTargets, sacrificeTargets, budStacks, budReceivers, sowCandidates, infernoTargets, detonate, canFreeze, overwriteBlocked, bonfireTargets, mulchCandidates, autumnTargets, leafFrostTargets, thawTargets, setEffectWard, fireWheelTargets, mogaribueDamage, canMogaribue, MOGARIBUE_LIFE } from './thermal';
import { skillCosts, SkillCosts } from './skillCosts';
import {
    GearId,
    GEAR_PARAMS,
    gearDefOf,
    hasGear,
    springThunderThaw,
    gearLifeBonus,
    gearLifeStd,
    gearLockStack,
    gearTokenBindDelta,
    countVarietySquares,
    frozenBudCount,
    rootGain,
    countAilmentKinds,
    CostContext,
    rollPriceOffsets,
    applyPriceOffsets,
} from './gear';
import { Status } from './Status';
import styles from './Game.module.css';
import { playSfx } from '../../sound';
import { usePendingMode } from './pendingMode';
import { useBasicSkills } from './useBasicSkills';
import { useBlastSkills } from './useBlastSkills';
import { useShikigamiSkills } from './useShikigamiSkills';
import { useNecroSkills } from './useNecroSkills';
import { useGenericSkills } from './useGenericSkills';
import { useElementSkills } from './useElementSkills';
import { useFrostLockSkills } from './useFrostLockSkills';
import { GameLate } from './gameLate';
import { useCellClick } from './useCellClick';
import { useGameControls } from './useGameControls';
import { GameProps, CHARACTER_NAMES } from './gameTypes';
export type { PlayerConfig } from './gameTypes';
import { useSeatArray } from './useSeatArray';
import { useBoardEffects, useGearToasts, useSkillStrip, useSoundToggle } from './usePresentation';


// 盤面を揺らすスキル演出
const SHAKE_EFFECTS: SkillEffectType[] = ['stomp', 'judge', 'assault', 'tsunami', 'slash', 'backslash', 'overload', 'glacierBurst', 'inferno', 'bulwark', 'glacier', 'shikigamiBlast', 'miasma'];

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
    // 手番の頭の各マスのエフェクト（見ざる地蔵・閻魔の舌が、手番の終わりに増えた分を調べる）
    const effectSnap = useRef<EffectSnapshot | null>(null);
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
        pieceBase: Array<number>(seatCount).fill(0), // 各席の手番開始時点の非オブジェクトのコマの数（お一人様限りの札）
        turnSpent: Array<number>(seatCount).fill(0), // この手番にスキルに払ったマジックの合計
        oppBigSeen: Array<boolean>(seatCount).fill(false),
        oppBigPrev: Array<boolean>(seatCount).fill(false), // 大工房の設置の無料条件
        marketUsed: Array<number>(seatCount).fill(0), // 市場の無料シャッフルをこの手番に使った回数
        bigCast: Array<boolean>(seatCount).fill(false), // 柳の下に二匹目がいた: この手番に基礎コスト7以上のスキルを使った
        veil: Array<boolean>(seatCount).fill(false), // 夜の帳: この席の今の手番はスキルコスト+3
        veilNext: Array<boolean>(seatCount).fill(false), // 夜の帳: この席の次の手番から効く
        ward: Array<number>(seatCount).fill(0), // 毒返しの構え: 残りの手番数（その席の手番が終わるたびに1減る）
        wardFresh: Array<boolean>(seatCount).fill(false), // 毒返しの構えを使った手番（その手番の終わりでは減らさない）
        lockSeen: Array<boolean>(seatCount).fill(false), // 自分の前の手番以降に、他の席がロックを使った（錠前荒らしの0コスト条件）
        lockPrev: Array<boolean>(seatCount).fill(false), // 今の手番の頭の時点での lockSeen
        blessing: Array<number>(seatCount).fill(0), // 施錠の加護: 残りの手番数（その席の手番が終わるたびに1減る）
        blessingFresh: Array<boolean>(seatCount).fill(false), // 施錠の加護を使った手番（その手番の終わりでは減らさない）
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
        bigCast: gearTurn.current.bigCast[seat],
        oppBigPrev: gearTurn.current.oppBigPrev[seat],
        veil: gearTurn.current.veil[seat],
        oppSkillPrev: gearTurn.current.oppSkillPrev[seat],
        lockPrev: gearTurn.current.lockPrev[seat],
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
    const { highlightedCells, setHighlightedCells, previewCells, setPreviewCells, boardEffect, setBoardEffect, boardBurst, setBoardBurst, playEffect, playBurst, flashCells } = useBoardEffects();
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
                    const cell = resolveMoveCell(currentAI, currentBoard, characters, life, next, lifeBan[turnSeat], newPieceBlocked(currentBoard, currentTurnPlayer, placedThisTurn));
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
                wardActive: gearTurn.current.ward[turnSeat] > 0,
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

        const winner = boardWinner(currentBoard);
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
        if (boardWinner(currentBoard)) return;
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
            noteSkillUsed(gearTurn.current, turnSeat, skillId, pay);
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

    // マス選択などの「構え」の状態。同時に構えるのは1つだけなので、1つの状態で持つ（useXxx / setUseXxx は個別に読み書きできる形で渡す）
    const { flag: pendingFlag, setMode: setPendingMode } = usePendingMode();
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
        setUseBoltSilence(0);
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
        setObjectPlacing(null);
        setObjectTool(null);
        setCaptureChoice(null);
        // ギア: 新しい手番のスキル使用数をリセットし、余韻を引き継ぐ（StrictMode の二重実行に備えて1ターンに1回だけ）
        let scorchForNext = 0;
        let objectMagicForNext = 0; // 手番開始時のオブジェクト（大木）の魔力
        let objectLifeForNext = 0; // 生命の泉のライフ期待値ボーナス
        let turnBoard = currentBoard; // この手番開始時の処理で盤面が変わったら差し替える
        if (gearTurn.current.processedTurn !== currentTurn) {
            gearTurn.current.processedTurn = currentTurn;
            // 席ごとのギア・導線・廃墟の状態の更新は gearTurn.ts で sim と共有。魔力や演出は戻り値を見て行う
            // 見ざる地蔵・閻魔の舌: 終わった手番で付いたエフェクトを処理する（手番の頭の盤面との差分。objects.ts の enforceEffectRules）
            let startBoard = currentBoard;
            {
                const eb = currentBoard.slice();
                const er = enforceEffectRules(eb, effectSnap.current, symbols[turnSeat]);
                if (er.removed.length > 0 || er.zeroed.length > 0) {
                    if (er.removed.length > 0) addLog(`見ざる地蔵: ${er.removed.map(posName).join('・')}に付いたエフェクトが消えた`);
                    if (er.zeroed.length > 0) addLog(`閻魔の舌: ${er.zeroed.map(posName).join('・')}のコマのライフが0になった`);
                    flashCells([...er.removed, ...er.zeroed]);
                    startBoard = eb;
                    setCurrentBoard(eb);
                }
            }
            const change = advanceGearState(gearTurn.current, ruinState.current, { board: startBoard, symbols, gears: gearsBySeat, endSeat: turnSeat, nextSeat });
            // 毒返しの構え: 終わった手番の間に自陣が破壊/乗っ取られた席に、ライフ4・☠付きのコマを置く
            let wardBoard = startBoard;
            change.wardPlace.forEach((seat) => {
                if (wardBoard === startBoard) wardBoard = startBoard.slice();
                const at = placeWardPiece(wardBoard, symbols[seat], randomPick);
                if (at < 0) return;
                addLog(`${symbols[seat]}の毒返しの構えが発動（${posName(at)}にライフ4・☠付きのコマを置いた）`);
                flashCells([at]);
                playEffect('token', at, [at], '毒返しの構え');
            });
            if (wardBoard !== startBoard) setCurrentBoard(wardBoard);
            turnBoard = wardBoard;
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
                const board = wardBoard.slice();
                const r = detonate(board, nextSymbol);
                setGlacierPendingAt(nextSeat, false);
                setCurrentBoard(board);
                turnBoard = board;
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
            // 春雷: 次の手番の席の自陣のリーチの4つ目が氷結した空きマスなら、その❄を1つ解く（gear.ts）
            if (hasGear(gearsBySeat[seatOf(nextSymbol)], 'springThunder')) {
                const thawed = springThunderThaw(turnBoard, nextSymbol);
                if (thawed.length > 0) {
                    addLog(`春雷が${thawed.map(posName).join('・')}の❄を1つ解いた`);
                    flashCells(thawed);
                    gearTrigger('springThunder', `${thawed.map(posName).join('・')}の❄を解く`);
                }
            }
            // オブジェクト: 🔥で燃え尽きた大木を掃除し、次の手番の席のオブジェクトが効果を発揮する（objects.ts。魔力とライフの分は下の手番開始の計算に足す）
            const objBoard = turnBoard.slice();
            const burnt = sweepBurntTrees(objBoard);
            const objRes = objectTurnStart(objBoard, nextSymbol, characters);
            if (burnt.length > 0) {
                addLog(`🔥で${burnt.map(posName).join('・')}のオブジェクトが燃え尽きた`);
                flashCells(burnt);
            }
            if (objRes.magic > 0) addLog(`${nextSymbol}のオブジェクト（大木・護符の社）で魔力+${objRes.magic}`);
            if (objRes.leaves.length > 0) addLog(`枯れた大木が${objRes.leaves.map(posName).join('・')}に🍂を付けた`);
            if (objRes.charged.length > 0) addLog(`雷雲が${objRes.charged.map(posName).join('・')}に⚡を付けた`);
            if (objRes.poisoned.length > 0) addLog(`毒沼が${objRes.poisoned.map(posName).join('・')}に☠を付けた`);
            if (objRes.fortified.length > 0) addLog(`砦が自陣${objRes.fortified.length}コマのライフ+1`);
            const objTouched = [...objRes.leaves, ...objRes.charged, ...objRes.fortified, ...objRes.poisoned];
            if (burnt.length > 0 || objTouched.length > 0) {
                flashCells(objTouched);
                turnBoard = objBoard;
                setCurrentBoard(withOverload(objBoard));
            }
            objectMagicForNext = objRes.magic;
            objectLifeForNext = objectLifeBonus(objBoard, nextSymbol);
            effectSnap.current = effectSnapshot(turnBoard); // 次の手番の頭のエフェクト（手番の終わりに増えた分を調べる）
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
            objects: objectMagicForNext,
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
                objectLifeForNext + // 生命の泉
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
        };
    }
    const { calculateTokenBind, onClickToken, onClickDoubleToken, onClickBudsToken, onClickBothToken, onClickBuds, onClickDoubleBuds, onClickSlash, onClickBackSlash, onClickOpium, onClickCharge, onClickAddLife, onClickBibine, onClickUseLock, onClickUseDoubleLock, onClickUseTripleLock, onClickShuffle, setUseLock, activeBudsCount, poisonCount, useLock, applyLock, useInjection, poisonStrike, toxicBloom, setUseInjection, usePandemic, poisonerInPlay, useBuds, setUseBuds, spreadPoisonAround, putTokens, miasmaCost, setUsePandemic, afterTokenPlaced, putTokensAt, reportAfter, charge, shuffleCost, miasmaPlan } = useBasicSkills({ playEffect, addLog, setMagicAt, turnSeat, setCurrentTurn, currentTurn, setLife, life, spendMagic, seatCosts, currentTurnPlayer, gearTurn, currentBoard, setSkills, reshuffledSkills, deckBySeat, currentLockedSkills, characters, turnGears, gearsBySeat, posName, gearTrigger, playBurst, chargeBuff, geo, harvestMagic, pendingFlag, costTableFor, budGuard, flashCells, setCurrentBoard, seatCount, symbols, setUseToken, currentCharacter }, late);
    const { onClickTsunami, onClickWalpurgisNight, onClickTotalAssault, onClickStomp, onClickJudgeDay, onClickProliferate, onClickSilence, onClickStrip, onClickChargeSeason, onClickBristle, onClickRelease, onClickStash, onClickBoltSilence, onClickThunderFire, judgeDayCost, totalAssaultCost, setUseStash, setUseBoltSilence, setUseThunderFire, useThunderFire, thunderFireTargets, exeThunderFire, useBoltSilence, boltSilenceTargets, exeBoltSilence, useStash, stashTargets, exeStash, useStomp, exeStomp, useJudgeDay, exeJudgeDay, useAssault, setUseAssaultAt, applyProliferate, setUseStomp, setUseJudgeDay, setUseAssaultAll, stripTargets, bristleTargets, ownChargeStacks, boltSilenceLegal } = useBlastSkills({ addLog, otherSeats, turnSeat, setMagicAt, playEffect, spendMagic, seatCosts, currentTurnPlayer, setCurrentTurn, currentTurn, currentBoard, harvestMagic, setCurrentBoard, gearCost, useTokenCount, seatCount, setUseTokenCountAt, currentCharacter, characters, posName, proliferateTokenLife, toxicBloom, setChargeBuffAt, flashCells, withOverload, pendingFlag, geo, keepBuds, playBurst, gearTurn, setSilencedAt, baseGearsBySeat, gearOff, symbols, setGearOffAt, proliferateUpkeepStep, setProliferateAt, setProliferateCountAt, life, useMagicCount, setUseMagicCountAt, turnGears }, late);
    const { onClickToggleYingYang, onClickShikigamiPlace, onClickShikigamiBlast, onClickShikigamiBless, onClickShikigamiCurse, onClickShikigamiPurge, onClickShikigamiDiscount, onClickShikigamiAll, onClickShikigamiRandom, onClickShikigamiFlood, onClickObjectSkill, onClickObject, setUseShikigamiPlace, setUseShikigamiBlast, setUseShikigamiBless, setUseShikigamiCurse, setUseShikigamiPurge, setObjectPlacing, setObjectTool, setCaptureChoice, useShikigamiPlace, exeShikigamiPlace, objectPlacing, exeObjectPlace, objectTool, exeObjectTool, useShikigamiBlast, exeShikigamiBlast, useShikigamiBless, exeShikigamiBless, useShikigamiCurse, exeShikigamiCurse, useShikigamiPurge, exeShikigamiPurge, objectSkillTargetsNow, ownShikigami, blessTargets, curseTargets, purgeTargets, captureChoice } = useShikigamiSkills({ addLog, playEffect, currentYinYangMode, setYinYangModeAt, turnSeat, spendMagic, gearCost, seatCosts, pendingFlag, currentBoard, currentTurnPlayer, characters, flashCells, setCurrentBoard, posName, gearTurn, playBurst, harvestMagic, toxicBloom, putTokens, turnGears, setUseToken }, late);
    const { exeHailMary, onClickNecromancy, onClickSerum, onClickIntensify, onClickPandemic, onClickInjection, onClickMiasma, onClickDarkPot, onClickPoisonMist, onClickPoisonToken, remainNecro, necroCost, hailMaryChoices, addCorpses, setRemainNecroAt, exePandemic, baseNecromancyCost, setNecroCostAt, setRemainNecroAll, setNecroCostAll, hailMaryPick, onClickHailMary, necromancySummonCap, necromancyReviveLife, necromancyDuration } = useNecroSkills({ seatCount, characters, lifeBan, turnSeat, calculateTokenBind, spendMagic, gearCost, currentBoard, currentTurnPlayer, setCurrentBoard, playEffect, addLog, setUseAssaultAt, setUseTokenCountAt, setUseStomp, setUseJudgeDay, setUseShikigamiPlace, currentCharacter, seatCosts, setHailMarySpin, harvestMagic, toxicBloom, flashCells, miasmaCost, setUseInjection, useInjection, putTokens, posName, setUseToken, setUsePandemic, gearTurn, geo, keepBuds, poisonStrike, withOverload }, late);
    const { onClickChargeToken, onClickChargeOne, onClickChargeSpread, onClickChargeHeal, onClickSmallFry, onClickPerfectGame, onClickHelper, onClickSecondCatch, onClickFirstFrost, onClickGather, onClickBurnOff, onClickFreeToken, onClickDoubleChargeToken, onClickChargeArea, onClickChargeRandom, onClickJammer, onClickNightVeil, onClickGraveDiscount, onClickPoisonWard, onClickGraveOffering, useJammer, exeJammer, useChargeOne, setUseChargeOne, useChargeArea, setUseChargeArea, useChargeSpread, setUseChargeSpread, chargeSpreadCost, chargeOneCost, graveDiscountNow, chargeHealCells } = useGenericSkills({ currentBoard, currentTurnPlayer, addLog, flashCells, playEffect, setCurrentBoard, spendMagic, seatCosts, gearTurn, turnSeat, characters, addCorpses, otherSeats, setLifeBanAt, useToken, bumpGlacierCharge, putTokens, posName, setUseToken, calculateTokenBind, geo, keepBuds, afterTokenPlaced, harvestMagic, applyLock, playBurst, baseNecromancyCost, necroCost, toxicBloom, withOverload, deckBySeat, lifeBan, setNecroCostAt, setMagicAt, pendingFlag }, late);
    const { onClickPlunder, onClickGlacier, onClickHarvestEve, onClickSolstice, onClickSucker, onClickWindborne, onClickFlameToken, onClickDoubleFlameToken, onClickSwidden, onClickBoost, onClickIgnite, onClickTinder, onClickRandomCast, onClickBurnout, onClickLeafToken, onClickTwinLeafToken, onClickDoubleLeafToken, onClickLeafAll, onClickBonfire, onClickMulch, onClickAutumn, onClickDiscount, setUseFreeze, setUseSucker, setUseIgnite, setUseSwidden, useFreeze, useSucker, exeSucker, useSwidden, exeSwidden, useClone, exeClone, usePlunder, exePlunder, useTinder, tinderCandidates, useIgnite, setUseTinder, discountLabel, glacierCost, cloneSources, suckerSources, onClickFreeze, ownBudTotal, onClickClone, canUseDiscount, burnoutCost, leafAllCandidates } = useElementSkills({ pendingFlag, addLog, spendMagic, seatCosts, currentTurnPlayer, currentBoard, characters, gearTurn, turnSeat, costTableFor, glacierCharge, glacierPending, setGlacierChargeAt, flashCells, playEffect, setCurrentBoard, setGlacierPendingAt, budGuard, setMagicAt, setBudGuardAt, geo, posName, putTokens, playBurst, setUseToken, deckBySeat, harvestMagic, putTokensAt, reportAfter, addCorpses, life, magic, setLife }, late);
    const { onClickCryoFreeze, onClickShatter, onClickLeafDrop, onClickKindling, onClickLeafCloak, onClickCleanse, onClickLockRaid, onClickLockExtend, onClickLockBlessing, onClickVacantSeal, onClickSacrifice, onClickRandomFreeze, onClickFrostToken, onClickDoubleFrostToken, onClickFrostfall, onClickInferno, onClickMogaribue, onClickSeal, onClickLeafFrost, onClickKimon, onClickFireWheel, onClickSpark, setUseSacrifice, setUseKimon, setUseFrostArea, setUseIcicle, setUseFreezeSpread, setUseShatter, exeFreeze, useSacrifice, exeSacrifice, useKimon, exeKimon, useFrostArea, exeFrostArea, useIcicle, setIcicleCell, useFreezeSpread, exeFreezeSpread, useShatter, exeShatter, exeTinder, exeIgnite, notShielded, infernoCost, mogaribueCost, sealCost, kimonCandidates, sacrificeCandidates, ownAilmentCells, onClickFrostArea, onClickIcicle, onClickFreezeSpread, onClickSpringWind, fireWheelGuard, vacantSealCost, leafDropCandidates, kindlingCandidates, leafCloakCandidates, icicleCell, exeIcicle } = useFrostLockSkills({ pendingFlag, currentBoard, characters, bumpGlacierCharge, addLog, flashCells, playEffect, setCurrentBoard, spendMagic, seatCosts, currentTurnPlayer, geo, posName, putTokens, setUseToken, addCorpses, playBurst, gearTurn, turnSeat, keepBuds, setSkills, reshuffledSkills, deckBySeat, currentLockedSkills, setUseFreeze, costTableFor, setCurrentTurn, currentTurn, setUseTinder, setUseIgnite }, late);
    const { onCellClick } = useCellClick({ hailMarySpin, setPreviewCells, useThunderFire, thunderFireTargets, exeThunderFire, useBoltSilence, boltSilenceTargets, exeBoltSilence, useStash, stashTargets, exeStash, useJammer, currentBoard, currentTurnPlayer, characters, exeJammer, currentCharacter, remainNecro, turnSeat, useChargeOne, addLog, posName, playEffect, harvestMagic, setUseChargeOne, setCurrentBoard, withOverload, useChargeArea, geo, flashCells, setUseChargeArea, useChargeSpread, setUseChargeSpread, useFreeze, exeFreeze, useSucker, exeSucker, useShikigamiPlace, exeShikigamiPlace, objectPlacing, exeObjectPlace, objectTool, exeObjectTool, useShikigamiBlast, exeShikigamiBlast, useShikigamiBless, exeShikigamiBless, useShikigamiCurse, exeShikigamiCurse, useShikigamiPurge, exeShikigamiPurge, useSwidden, exeSwidden, useSacrifice, exeSacrifice, useKimon, exeKimon, useFrostArea, exeFrostArea, useClone, exeClone, usePlunder, exePlunder, useIcicle, setIcicleCell, useFreezeSpread, exeFreezeSpread, useShatter, exeShatter, useTinder, tinderCandidates, exeTinder, useIgnite, exeIgnite, useLock, applyLock, setUseLock, useInjection, poisonStrike, toxicBloom, setUseInjection, usePandemic, exePandemic, useStomp, exeStomp, useJudgeDay, exeJudgeDay, lifeBan, life, seatCount, currentAI, setCaptureChoice, placedThisTurn, history, currentTurn, setGiantShake, ruinState, placements, setPlacements, symbols, gearTrigger, playBurst, setMagicAt, poisonerInPlay, addCorpses, useBuds, setUseBuds, gearTurn, gearsBySeat, turnGears, useAssault, chargeBuff, setUseAssaultAt, proliferate, proliferateCount, applyProliferate, setProliferateCountAt, proliferateMaxStacks, setProliferateAt, spreadPoisonAround, setHistory, setCurrentTurn }, late);

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
    // 八卦の陣の勝利は4つ並びではないので、土壇場の防壁（列を消す）の対象にならない
    const lineWinner = calculateWinner(lineSymbols(currentBoard));
    const encircle = encircleWinner(currentBoard);
    const rawWinner = lineWinner ?? encircle?.player;
    const winner = rawWinner && (!lineWinner || lastStandHolderFor(rawWinner) < 0) ? rawWinner : undefined;
    // AIの手番の間は、人間の操作(マス・スキル・ロック切替)を受け付けない。AIは onCellClick/executeSkillForAI を直接呼ぶので影響しない
    const aiTurn = currentAI !== null && !winner;
    stallRef.current = { turn: currentTurn, over: !!winner || currentAI === null, queued: pendingAIMove !== null, spinning: hailMarySpin !== null, charge: onClickCharge };
    // 勝ちを決めた列(複数同時に揃ったら全部)。盤面で光らせる
    const winCells = winner
        ? lineWinner
            ? Array.from(new Set(geo.winLines.filter((line) => line.every((idx) => lineSymbols(currentBoard)[idx] === winner)).flat()))
            : encircle?.cells ?? []
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
        if (sq.player && sq.player !== currentTurnPlayer && (sq.bind > 0 || isTakeProtected(sq, characters)) && !canHitBound(currentCharacter, currentBoard, seatCount)) return false;
        if (lockBlocksPlacement(sq, currentCharacter)) return false;
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
            case 'keysmith':
                return [{ name: '封鎖の断', cost: sealCost(symbols[seat]) }];
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
    const { onClickRestart, onClickBackToSetup, onClickCopyLog, copied, onClickDownloadLog } = useGameControls({ geo, seatCount, props, symbols, winner, gameLog, currentTurn, makeBoard, setCurrentBoard, setHistory, setCurrentTurn, setPlacements, setMagicAll, setUseMagicCountAll, setUseTokenCountAll, setUseToken, setUseAssaultAll, setProliferateAll, setSilencedAll, setLifeBanAll, setGearOffAll, setChargeBuffAll, setProliferateCountAll, setPendingMode, setUseBuds, setUseLock, setUseInjection, setGlacierPendingAll, setGlacierChargeAll, setBudGuardAll, setObjectPlacing, setObjectTool, setCaptureChoice, setIcicleCell, setRemainNecroAll, setNecroCostAll, baseNecromancyCost, setPendingAIMove, setGameLog, setHighlightedCells, setTurnSeat, setStepRequest, setRestartCount, setPreviewCells, setBoardEffect, setBoardBurst, setLockedSkillsAll, gearTurn, ruinState, lastStandUsed, setLastStandSaves, setPriceTables, rollPriceTables }, late);

    const notLocked = (idx: number) => !isGuarded(currentBoard[idx], characters);
    const isOpponentCell = (idx: number) => !!currentBoard[idx].player && currentBoard[idx].player !== currentTurnPlayer;

    // ボタンホバー時に破壊範囲をプレビューするマス
    const slashPreview = (): number[] => geo.antiDiagonal.filter((idx) => notLocked(idx));
    const backSlashPreview = (): number[] => geo.mainDiagonal.filter((idx) => notLocked(idx));
    const opiumPreview = (): number[] =>
        currentBoard.map((_, idx) => idx).filter((idx) => isOpponentCell(idx) && currentBoard[idx].bind > 0 && notLocked(idx));

    const showPreview = (cells: number[]) => setPreviewCells(cells);
    const clearPreview = () => setPreviewCells([]);

    // マス選択待ちのスキルごとの、ホバー時のプレビュー範囲。先に並べた方が優先（同時に構えるのは1つだけ）
    const hoverPreviews: [unknown, (i: number) => number[]][] = [
        [useStomp, (i) => geo.stompRange(i)],
        [useJudgeDay, (i) => geo.judgeRange(i)],
        [usePandemic, (i) => geo.stompRange(i)],
        [useInjection > 0, (i) => [i]],
        [useChargeOne, (i) => [i]],
        [useChargeSpread, (i) => connectedPieces(currentBoard, i, geo.size)],
        [useChargeArea, (i) => geo.stompRange(i)],
        [useClone, (i) => cloneSources().includes(i) ? [i, ...cloneTargets(currentBoard, i, geo.size)] : []],
        [usePlunder, (i) => plunderTargets(currentBoard, currentTurnPlayer, characters).includes(i) ? [i] : []],
        [useFrostArea, (i) => geo.stompRange(i)],
        [useIcicle, (i) => [i]],
        [useFreezeSpread, (i) => connectedPieces(currentBoard, i, geo.size)],
        [useShatter, (i) => currentBoard[i].player && isFrozen(currentBoard[i]) ? [i] : []],
        [useKimon, (i) => kimonCandidates().includes(i) ? [i] : []],
        [useSacrifice, (i) => sacrificeCandidates().includes(i) ? [i, ...sacrificeTargets(currentBoard, currentBoard[i].bind, currentTurnPlayer, characters)] : []],
        [useSwidden, (i) => budStacks(currentBoard[i]) > 0 ? [i] : []],
        [useShikigamiPlace, (i) => shikigamiLandable(currentBoard[i]) ? [i, ...geo.surroundRange(i)] : []],
        [objectPlacing, (i) => objectLandable(currentBoard[i]) ? [i, ...geo.surroundRange(i)] : []],
        [objectTool, (i) => objectSkillTargetsNow(objectTool as ObjectSkill).includes(i) ? [i] : []],
        [useShikigamiBlast, (i) => ownShikigami().includes(i) ? [i, ...geo.surroundRange(i)] : []],
        [useShikigamiBless, (i) => ownShikigami().includes(i) ? [i, ...blessTargets()] : []],
        [useShikigamiCurse, (i) => ownShikigami().includes(i) ? [i, ...curseTargets()] : []],
        [useShikigamiPurge, (i) => purgeTargets().includes(i) ? [i] : []],
        [useSucker, (i) => suckerSources().includes(i) ? [i, ...budReceivers(currentBoard, i, currentTurnPlayer, geo.size)] : []],
        [useFreeze, (i) => canFreeze(currentBoard[i]) ? [i] : []],
        [useIgnite, (i) => [i]],
        [useTinder, (i) => tinderCandidates().includes(i) ? [i] : []],
        [useThunderFire, (i) => thunderFireTargets().includes(i) ? [i, ...geo.surroundRange(i)] : []],
        [useStash, (i) => stashTargets().includes(i) ? [i] : []],
        [useBoltSilence, (i) => boltSilenceTargets().includes(i) ? [i] : []],
        [useJammer, (i) => canJam(currentBoard, i, currentTurnPlayer, characters) ? jammerTargets(currentBoard, i, geo.size, currentTurnPlayer) : []],
    ];
    // マスのホバー時: マス選択型のスキルが構えている間だけ範囲を表示
    const onCellHover = (i: number) => {
        const active = hoverPreviews.find(([on]) => on);
        if (active) setPreviewCells(active[1](i));
    };
    const onCellLeave = () => {
        if (hoverPreviews.some(([on]) => on)) setPreviewCells([]);
    };

    // マス選択待ちのスキル名。選択後の演出より先に「何が発動したか」を盤面上に出す
    // 先に並べた方が優先。条件が偽なら false/null になり、find で飛ばされる
    const pendingSkillName: string | null = [
        useStomp && 'ストンプ',
        useThunderFire && '雷のない所に火は立たぬ',
        useBoltSilence && '沈黙は雷なり',
        useStash && '雷神のへそくり',
        useJudgeDay && '審判の日',
        useChargeSpread && '帯電拡散',
        usePandemic && 'パンデミック',
        useInjection > 0 && 'インジェクション',
        useChargeOne && '帯電付与',
        useClone && '写し身',
        usePlunder && '追い剥ぎ',
        useFrostArea && '範囲氷結',
        useIcicle && '氷柱',
        useFreezeSpread && '氷結拡散',
        useShatter && '砕氷',
        useSacrifice && '殉火',
        useKimon && '鬼門封じ',
        useSwidden && '焼畑',
        objectPlacing && OBJECT_DEFS[objectPlacing].name,
        objectTool && OBJECT_SKILLS[objectTool].name,
        useShikigamiPlace && '式神設置',
        useShikigamiBlast && '式神爆破',
        useShikigamiBless && '式神の加護',
        useShikigamiCurse && '式神の呪詛',
        useShikigamiPurge && '式神の供犠',
        useSucker && 'ひこばえ',
        useFreeze && '氷結',
        useIgnite && '火遁',
        useTinder && '火口',
    ].find((name) => name) || null;
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

    return (
        <div className={`${styles.game}${showDetail ? ` ${styles.detail}` : ''}`}>
            <div className={styles.main}>
                {seatCount === 2 ? playerPanel(0) : <div className={styles.seatList}>{range(0, seatCount).map(playerPanel)}</div>}
                <div className={styles.boardWrap}>
                    <Status winner={winner} nextPlayer={currentTurnPlayer} life={life} magicBonus={lateMagicBonus(currentTurn, seatCount)} />
                    {skillAnnounce && <div className={styles.announce}>{skillAnnounce}</div>}
                    {captureChoice !== null && currentBoard[captureChoice]?.object && (
                        <div className={styles.dialogBackdrop} onClick={() => setCaptureChoice(null)}>
                            <div className={styles.dialog} role="dialog" aria-label="オブジェクトの乗っ取り" onClick={(e) => e.stopPropagation()}>
                                <p>
                                    {posName(captureChoice)}の{OBJECT_DEFS[currentBoard[captureChoice].object as ObjectKind].name}（{currentBoard[captureChoice].player}）を乗っ取ります
                                </p>
                                <button onClick={() => onCellClick(captureChoice, false)}>自陣のコマにする</button>
                                <button onClick={() => onCellClick(captureChoice, true)}>
                                    自分の{OBJECT_DEFS[currentBoard[captureChoice].object as ObjectKind].name}にする
                                </button>
                                <button onClick={() => setCaptureChoice(null)}>キャンセル</button>
                            </div>
                        </div>
                    )}
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
                        className={`${styles.boardArea}${boardEffect && SHAKE_EFFECTS.includes(boardEffect.type) ? ` ${styles.shake}` : giantShake > 0 ? ` ${giantShake % 2 ? styles.shakeLightA : styles.shakeLightB}` : ''}`}
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
                    <SkillButton restrict={restrictSkill} inputBlocked={aiTurn} magic={magic[turnSeat]} tokenUsed={useToken} expandAll={expandAllDesc} onClick={onClickCharge} buttonText={`チャージ+${charge}`} paragraph={`ターンを終了し、マジックを+${charge}します`} />
                    <SkillButton restrict={restrictSkill} inputBlocked={aiTurn} magic={magic[turnSeat]} tokenUsed={useToken} expandAll={expandAllDesc}
                        onClick={onClickShuffle}
                        buttonText={`シャッフル-${shuffleCost}`}
                        paragraph='固定でないスキルをシャッフルします'
                        disabled={magic[turnSeat] < shuffleCost}
                    />
                    <SkillButton restrict={restrictSkill} inputBlocked={aiTurn} magic={magic[turnSeat]} tokenUsed={useToken} expandAll={expandAllDesc}
                        onClick={onClickUseLock}
                        hidden={currentCharacter === 'cryomancer'}
                        buttonText={`ロック-${calculateCost(seatCosts.onClickUseLock, false, false, currentTurnPlayer, 'onClickUseLock')}`}
                        paragraph={`選択したマスを${gearLockStack(turnGears)}ターン以上ロックします`}
                        disabled={checkSkillDisable(seatCosts.onClickUseLock)}
                    />
                    <SkillButton restrict={restrictSkill} inputBlocked={aiTurn} magic={magic[turnSeat]} tokenUsed={useToken} expandAll={expandAllDesc}
                        onClick={onClickCryoFreeze}
                        buttonText={`氷結-${calculateCost(seatCosts.onClickCryoFreeze, false, false, currentTurnPlayer, 'onClickCryoFreeze')}`}
                        paragraph={'マスを1つ選び、❄氷結を付与します（空きマスも可）\n氷結中の空きマスには誰も着手できません。氷結したコマはターン進行でライフが減らず、スキルのダメージを❄1つで肩代わりしますが、自分も重ねて強化できません'}
                        hidden={currentCharacter !== 'cryomancer'}
                        disabled={checkSkillDisable(seatCosts.onClickCryoFreeze)}
                    />
                    <SkillButton restrict={restrictSkill} inputBlocked={aiTurn} magic={magic[turnSeat]} tokenUsed={useToken} expandAll={expandAllDesc}
                        onClick={onClickTotalAssault}
                        buttonText={`全軍突撃-${totalAssaultCost}`}
                        paragraph={
                            '3ターンの間、ターン終了時にランダムにトークンを設置します コストは使用したトークンの回数×2軽減されます(使用後はカウントがリセットされます)'
                        }
                        hidden={currentCharacter !== 'tactician'}
                        exclusive
                        disabled={magic[turnSeat] < totalAssaultCost}
                    />
                    <SkillButton restrict={restrictSkill} inputBlocked={aiTurn} magic={magic[turnSeat]} tokenUsed={useToken} expandAll={expandAllDesc}
                        onClick={onClickStomp}
                        buttonText={`ストンプ-${gearCost(seatCosts.onClickStomp, turnSeat, false, 'onClickStomp')}`}
                        paragraph={'クリックしたセルと周囲1マスを破壊します'}
                        hidden={currentCharacter !== 'giant'}
                        exclusive
                        disabled={checkSkillDisable(seatCosts.onClickStomp)}
                    />
                    <SkillButton restrict={restrictSkill} inputBlocked={aiTurn} magic={magic[turnSeat]} tokenUsed={useToken} expandAll={expandAllDesc}
                        onClick={onClickJudgeDay}
                        buttonText={`審判の日-${judgeDayCost}`}
                        paragraph='セルをクリックし、審判を下します コストは使用したスキルの回数軽減されます(使用後はカウントがリセットされます)'
                        hidden={currentCharacter !== 'magician'}
                        exclusive
                        disabled={magic[turnSeat] < judgeDayCost}
                    />
                    <SkillButton restrict={restrictSkill} inputBlocked={aiTurn} magic={magic[turnSeat]} tokenUsed={useToken} expandAll={expandAllDesc}
                        onClick={onClickToggleYingYang}
                        buttonText={`陰陽転化-${gearCost(seatCosts.onClickToggleYingYang, turnSeat, false, 'onClickToggleYingYang')}`}
                        paragraph={`陰陽のモードを切り替えます 現在のモード:${yinYangModeName(turnSeat)}`}
                        hidden={currentCharacter !== 'yinYangMaster'}
                        exclusive
                        disabled={checkSkillDisable(seatCosts.onClickToggleYingYang)}
                    />
                    <SkillButton restrict={restrictSkill} inputBlocked={aiTurn} magic={magic[turnSeat]} tokenUsed={useToken} expandAll={expandAllDesc}
                        onClick={onClickNecromancy}
                        buttonText={`蘇生-${gearCost(currentNecroCost, turnSeat, false, 'onClickNecromancy')}${currentNecroRemain > 0 ? `(発動中:残${currentNecroRemain})` : ''}`}
                        paragraph={`発動時に墓地の死体数だけ(最大${necromancySummonCap})ライフ${necromancyReviveLife}のコマを召喚し、${necromancyDuration}ターンの間ライフ0の敵コマを自動吸収します 墓地は盤上でコマが奪われる/消えるたびに貯まり、コスト軽減と召喚数になります(使用後リセット)`}
                        hidden={currentCharacter !== 'necromancer'}
                        exclusive
                        disabled={checkSkillDisable(currentNecroCost) || placeBlocked(lifeBan[turnSeat], 'onClickNecromancy', calculateTokenBind())}
                    />
                    <SkillButton restrict={restrictSkill} inputBlocked={aiTurn} magic={magic[turnSeat]} tokenUsed={useToken} expandAll={expandAllDesc}
                        onClick={onClickMiasma}
                        buttonText={`ミアズマ-${miasmaCost()}`}
                        paragraph={'自陣の毒が乗っているマスの周囲1マスの敵コマに毒を付与します（毒マスが重なると積み上がります） 自陣の毒はすべて消えます コストは自陣の毒の数だけ軽減されます'}
                        hidden={currentCharacter !== 'poisoner'}
                        exclusive
                        disabled={magic[turnSeat] < miasmaCost() || miasmaPlan(currentBoard, currentTurnPlayer).size === 0}
                    />
                    <SkillButton restrict={restrictSkill} inputBlocked={aiTurn} magic={magic[turnSeat]} tokenUsed={useToken} expandAll={expandAllDesc}
                        onClick={onClickChargeSpread}
                        buttonText={`帯電拡散-${chargeSpreadCost()}`}
                        paragraph={'コマを選択し、そこからコマのあるマスだけを縦横に辿って届くすべてのコマ(敵味方問わず)に⚡を1つ付与します（雷霆の巫以外のコマは乗った時点で2ダメージ） コストは盤面の⚡の数だけ軽減されます'}
                        hidden={currentCharacter !== 'electrician'}
                        exclusive
                        disabled={magic[turnSeat] < chargeSpreadCost()}
                    />
                    <SkillButton restrict={restrictSkill} inputBlocked={aiTurn} magic={magic[turnSeat]} tokenUsed={useToken} expandAll={expandAllDesc}
                        onClick={onClickGlacier}
                        buttonText={`絶対零度-${glacierCost()}`}
                        paragraph={`全てのマス（空きマス含む。🔑ロック中を除く）に❄を1つ足します\n次の自分の手番開始時に、他のプレイヤーの氷結マスへ❄1つにつき3ダメージを与えて氷結を解除し、ライフが0になったマスを破壊します\nコストは盤面の氷結マスの数だけ軽減されます（下限1）${glacierPending[turnSeat] ? '\n発動待ちです' : ''}`}
                        hidden={currentCharacter !== 'cryomancer'}
                        exclusive
                        disabled={magic[turnSeat] < glacierCost() || glacierPending[turnSeat]}
                    />
                    <SkillButton restrict={restrictSkill} inputBlocked={aiTurn} magic={magic[turnSeat]} tokenUsed={useToken} expandAll={expandAllDesc}
                        onClick={onClickInferno}
                        buttonText={`業火-${infernoCost()}`}
                        paragraph={'敵のコマ全て(🔑ロック中・⚡無敵を除く)に🔥火炎を2つずつ付与します\n氷結中のマスは🔥の代わりに❄が全て解除されます。🔥が付いたマスの縦横隣の氷結は即座に解けます\n1手番に異なるスキルを3種類以上使うと、次の業火がコスト0になります（手番を跨いで持ち越し。同じスキルの連打は1種類と数えます。撃つとリセット）'}
                        hidden={currentCharacter !== 'pyromancer'}
                        exclusive
                        disabled={magic[turnSeat] < infernoCost() || infernoTargets(currentBoard, currentTurnPlayer, characters).length === 0}
                    />
                    <SkillButton restrict={restrictSkill} inputBlocked={aiTurn} magic={magic[turnSeat]} tokenUsed={useToken} expandAll={expandAllDesc}
                        onClick={onClickMogaribue}
                        buttonText={`虎落笛-${mogaribueCost()}`}
                        paragraph={`自陣の🍂の枚数(${mogaribueDamage(currentBoard, currentTurnPlayer)})ぶん、敵のコマ全てにダメージを与えます(🔑ロック中・⚡無敵を除く。氷結中は❄が1つ減るだけ、🔥中は1.5倍)\n同時に自陣のコマ全てのライフが+${MOGARIBUE_LIFE}されます`}
                        hidden={currentCharacter !== 'witch'}
                        exclusive
                        disabled={magic[turnSeat] < mogaribueCost() || !canMogaribue(currentBoard, currentTurnPlayer)}
                    />
                    <SkillButton restrict={restrictSkill} inputBlocked={aiTurn} magic={magic[turnSeat]} tokenUsed={useToken} expandAll={expandAllDesc}
                        onClick={onClickSeal}
                        buttonText={`封鎖の断-${sealCost()}`}
                        paragraph={`自陣のコマ全てを${SEAL_OWN_STACK}ターン、空きマス全てを${SEAL_EMPTY_STACK}ターンロックします（鍵師は空きマスのロックを無視して置けます）\n敵のコマのロックを全て解除し、解除した数（最低1）だけ敵のコマ全てにダメージを与えます（⚡無敵を除く。氷結中は❄が減るだけ）\n敵のロックの数だけコストが下がります（下限${SEAL_MIN_COST}）。使うとターン終了`}
                        hidden={currentCharacter !== 'keysmith'}
                        exclusive
                        disabled={magic[turnSeat] < sealCost()}
                    />
                    <SkillButton restrict={restrictSkill} inputBlocked={aiTurn} magic={magic[turnSeat]} tokenUsed={useToken} expandAll={expandAllDesc}
                        onClick={onClickIgnite}
                        buttonText={`火遁-${calculateCost(seatCosts.onClickIgnite, false, false, currentTurnPlayer, 'onClickIgnite')}`}
                        paragraph={'マスを選択し、🔥火炎を1つ付与します（重複可）。空きマスにも置けます\n空きマスの🔥は、そこに置かれたコマ（誰のコマでも）に引き継がれます\n付与したマスと縦横隣の氷結は即座に解けます'}
                        hidden={currentCharacter !== 'pyromancer'}
                        exclusive
                        disabled={checkSkillDisable(seatCosts.onClickIgnite)}
                    />
                    <SkillButton restrict={restrictSkill} inputBlocked={aiTurn} magic={magic[turnSeat]} tokenUsed={useToken} expandAll={expandAllDesc}
                        onClick={onClickShikigamiPlace}
                        buttonText={`式神設置-${gearCost(seatCosts.onClickShikigamiPlace, turnSeat, false, 'onClickShikigamiPlace')}`}
                        paragraph={'任意の空きマスに式神（ライフ2の紙の分身）を置きます 式神は列の並びに数えません\n自分で補強すると🌱付きの自陣のコマになり、相手に乗っ取られると空きマスになります'}
                        hidden={currentCharacter !== 'yinYangMaster' || currentYinYangMode === 'yang'}
                        exclusive
                        disabled={checkSkillDisable(seatCosts.onClickShikigamiPlace) || findEmptyIndexes(currentBoard).length === 0 || placeBlocked(lifeBan[turnSeat], 'onClickShikigamiPlace', calculateTokenBind())}
                    />
                    <SkillButton restrict={restrictSkill} inputBlocked={aiTurn} magic={magic[turnSeat]} tokenUsed={useToken} expandAll={expandAllDesc}
                        onClick={onClickShikigamiBlast}
                        buttonText={`式神爆破-${gearCost(seatCosts.onClickShikigamiBlast, turnSeat, false, 'onClickShikigamiBlast')}`}
                        paragraph={`自分の式神を1つ選んで爆破します 式神は消え、周囲8マスの敵のコマに${SHIKIGAMI_BLAST_DAMAGE}ダメージ（0になったコマは破壊）\n周囲の空きマスは自分の式神になります`}
                        hidden={currentCharacter !== 'yinYangMaster' || currentYinYangMode !== 'yang'}
                        exclusive
                        disabled={checkSkillDisable(seatCosts.onClickShikigamiBlast) || ownShikigami().length === 0}
                    />
                    {shuffleSkillDefs.map((s) => (
                        <SkillButton restrict={restrictSkill} inputBlocked={aiTurn} magic={magic[turnSeat]} tokenUsed={useToken} expandAll={expandAllDesc}
                            key={s.idx}
                            onClick={s.onClick}
                            buttonText={s.buttonText}
                            paragraph={s.paragraph}
                            disabled={s.disabled || placeBlocked(lifeBan[turnSeat], skillOf(s.idx)?.costKey, calculateTokenBind())}
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
