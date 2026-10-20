import React, { useState, useEffect, useRef, Dispatch, SetStateAction } from 'react';
import { CharacterId, YingYangMode } from '../../types/Character';
import { Effect } from '../../types/Effect';
import { Player, PLAYER_SYMBOLS, seatOf } from '../../types/Player';
import { SquareInfo } from '../../types/SquareInfo';
import { randomAnyPick, range, calculateWinner, findEmptyIndexes, randomPick, calculateLife, LIFE_STD } from '../../util';
import AIPlayer, { TURN_ENDING_SKILLS } from './AIPlayer';
import { Board } from './Board';
import { BoardEffects, SkillEffect, SkillEffectType, BurstEffect, BurstType } from './BoardEffects';
import { SkillButton } from './SkillButton';
import { boardSizeFor, clampBoardSize, geometryOf, lineCells, LineDir } from './boardGeometry';
import { shouldDecay } from './decay';
import { resolveDeck, baseCostOf, SKILL_CATALOG } from './deck';
import { boostAll, canRelocate, relocate, cloneTargets, cloneInto, plunderTargets, plunder, isPlaceable } from './generic';
import { lateMagicBonus } from './lateMagic';
import { isShielded, isGuarded, shieldedCells, fireCharges, connectedPieces, withCharge, boardChargeCount, reducedChargeCost, randomChargeCandidates, canJam, jammerTargets, applyJammer, isFullyCharged, applyOverload } from './charge';
import { emptyDiscount, applyDiscount, discountAmount, afterSkill as afterDiscount, canUseDiscountSkill, lifeDeltaOf, DISCOUNT_SKILLS, DiscountKey } from './discount';
import { BURNOUT_FREE_FLAMES, burnout, burnoutCostOf, burnoutTargets, totalFlames, FLAME_SKILL_KEYS, isFrozen, isDormant, activeBuds, burnDamageOf, emptyBlocked, cleanse, ailmentStacks, lockable, applyDamage, decayTick, absorbDestroy, zeroOut, ignite, harvestBuds, randomFreezeCandidates, placeFrostToken, frostfallTargets, shatter, swidden, canSacrifice, sacrificeTargets, sacrificeFlame, placeFlameToken, GRAFT_MAX, budStacks, budReceivers, graft, sowCandidates, sow, infernoTargets, INFERNO_STACKS, freeze, detonate, reducedGlacierCost, infernoCostOf, INFERNO_FREE_SKILLS, canFreeze, overwriteBlocked } from './thermal';
import { skillCosts, MIASMA_MIN_COST, POISON_LIFE_MULT, SkillCosts } from './skillCosts';
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
    CostContext,
    rollPriceOffsets,
    applyPriceOffsets,
    TokenEffect,
} from './gear';
import { Status } from './Status';
import styles from './Game.module.css';
import { isMuted, playSfx, setMuted } from '../../sound';

// 盤面を揺らすスキル演出
const SHAKE_EFFECTS: SkillEffectType[] = ['stomp', 'judge', 'assault', 'tsunami', 'slash', 'backslash', 'overload', 'glacierBurst', 'inferno'];

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

// 巨人は5ターンに1回休み（currentTurn % 5 === 4 のとき、次に手番が来るはずの巨人が飛ばされる）
const GIANT_SKIP_MODULO = 5;

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
    // 手番の席番号(0始まり)
    const [turnSeat, setTurnSeat] = useState<number>(0);
    const currentTurnPlayer = symbols[turnSeat];
    const currentCharacter = characters[turnSeat];
    const otherSeats = (seat: number): number[] => range(0, seatCount).filter((i) => i !== seat);

    // --- ギア（キャラ選択時に装備する追加パッシブ。定義は gear.ts、ヘッドレス版は sim/gear.js） ---
    const gearsBySeat: GearId[][] = props.players.map((p) => p.gears ?? []);
    // 席ごとのデッキ（手札3枠の引き元）。指定が無い・不正ならキャラの推奨デッキ
    const deckBySeat: number[][] = props.players.map((p) => resolveDeck(p.deck, p.character));
    const turnGears = gearsBySeat[turnSeat];
    // 価格破壊: 席ごとのコスト表。試合開始時(リスタート時)に1回だけ抽選して固定する
    const rollPriceTables = (): (SkillCosts | null)[] =>
        gearsBySeat.map((g) => (hasGear(g, 'priceWreck') ? applyPriceOffsets(skillCosts, rollPriceOffsets(Math.random)) : null));
    const [priceTables, setPriceTables] = useState<(SkillCosts | null)[]>(rollPriceTables);
    const costTableFor = (seat: number): SkillCosts => priceTables[seat] ?? skillCosts;
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
        processedTurn: 1,
    });
    // 手番でない席のコスト表示は「その席の次の手番の頭」の状態で出す
    const gearCtxFor = (seat: number): CostContext =>
        seat === turnSeat
            ? { skillsThisTurn: gearTurn.current.skills[seat], echoReady: gearTurn.current.echoReady[seat] }
            : { skillsThisTurn: 0, echoReady: gearTurn.current.echoNext[seat] };
    /** キャラ補正済みのコストにギアのコスト補正を掛ける */
    const gearCost = (cost: number, seat: number = turnSeat, isToken: boolean = false, skillKey?: string): number => {
        const adjusted = adjustCostByGear(cost, gearsBySeat[seat], gearCtxFor(seat), isToken);
        // コスト軽減スキル（手番内だけ有効なので、手番でない席には掛けない）
        if (skillKey === 'onClickCounterMarkdown' && gearTurn.current.oppSkillPrev[seat]) return 0; // 返し特売: 直前に相手がスキルを使っていれば0
        return seat === turnSeat ? applyDiscount(adjusted, discountAmount(gearTurn.current.discount[seat], skillKey, isToken)) : adjusted;
    };

    const [restartCount, setRestartCount] = useState<number>(0);
    // 連戦時の勝利数 (Restartしてもリセットしない)
    const [wins, setWinsAt] = useSeatArray<number>(() => Array(seatCount).fill(0));
    // 実際に破壊されたマスを濃い目の黄色で点滅させるためのインデックス
    const [highlightedCells, setHighlightedCells] = useState<number[]>([]);
    // ホバー時に破壊範囲をレモン色でプレビューするためのインデックス
    const [previewCells, setPreviewCells] = useState<number[]>([]);
    // スキル発動時の盤面エフェクト
    const [boardEffect, setBoardEffect] = useState<SkillEffect | null>(null);
    const playEffect = (type: SkillEffectType, index?: number, indexes?: number[]) => {
        playSfx(type);
        setBoardEffect((prev) => ({ type, index, indexes, nonce: (prev?.nonce ?? 0) + 1 }));
        setTimeout(() => setBoardEffect(null), 1400);
    };
    // マスに重ねる小演出（氷結が砕ける・解凍・燃焼）。メインの演出と同時に出せる
    const [boardBurst, setBoardBurst] = useState<BurstEffect | null>(null);
    const playBurst = (type: BurstType, cells: number[]) => {
        if (cells.length === 0) return;
        playSfx(type);
        setBoardBurst((prev) => ({ type, cells, nonce: (prev?.nonce ?? 0) + 1 }));
        setTimeout(() => setBoardBurst(null), 1200);
    };
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
            ? new AIPlayer(symbols[seat], p.character, symbols.filter((_, i) => i !== seat), characters, (cost, isToken, skillKey) => gearCost(cost, seat, isToken, skillKey), hasGear(gearsBySeat[seat], 'toxicBloom'))
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

    const executeSkillForAI = (skill: string) => {
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
            case 'onClickJudgeDay': onClickJudgeDay(); break;
            case 'onClickProliferate': onClickProliferate(); break;
            case 'onClickSerum': onClickSerum(); break;
            case 'onClickInjection': onClickInjection(); break;
            case 'onClickMiasma': onClickMiasma(); break;
            case 'onClickChargeToken': onClickChargeToken(); break;
            case 'onClickChargeOne': onClickChargeOne(); break;
            case 'onClickChargeSpread': onClickChargeSpread(); break;
            case 'onClickSilence': onClickSilence(); break;
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
            case 'onClickWindborne': onClickWindborne(); break;
            case 'onClickFlameToken': onClickFlameToken(); break;
            case 'onClickDoubleFlameToken': onClickDoubleFlameToken(); break;
            case 'onClickSwidden': onClickSwidden(); break;
            case 'onClickSacrifice': onClickSacrifice(); break;
            case 'onClickBoost': onClickBoost(); break;
            case 'onClickRandomFreeze': onClickRandomFreeze(); break;
            case 'onClickFrostToken': onClickFrostToken(); break;
            case 'onClickDoubleFrostToken': onClickDoubleFrostToken(); break;
            case 'onClickFrostfall': onClickFrostfall(); break;
            case 'onClickIgnite': onClickIgnite(); break;
            case 'onClickInferno': onClickInferno(); break;
            case 'onClickRandomCast': onClickRandomCast(); break;
            case 'onClickBurnout': onClickBurnout(); break;
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
                if (typeof next === 'string') executeSkillForAI(next);
                else onCellClick(next);
                setPendingAIMove(rest.length > 0 ? rest : null);
            }, 200);
            return () => clearTimeout(timer);
        }
    }, [pendingAIMove, hailMarySpin]);

    const runAIMove = () => {
        const ai = currentAI!;
        const currentMagic = magic[turnSeat];
        // 敵が複数いるときは最も魔力の多い相手を基準にする（2人戦なら従来どおり相手の魔力）
        const oppMagic = Math.max(...otherSeats(turnSeat).map((i) => magic[i]));
        const currentSkills = skills;

        const aiNecroRemain = remainNecro[turnSeat];
        const aiNecroCost = necroCost[turnSeat];
        const aiProliferate = proliferate[turnSeat];

        // サイレンス中はスキルを使えない: 通常の着手だけ行う
        if (silenced[turnSeat]) {
            ai.updateShield(currentBoard);
            const move = ai.getBestMove(currentBoard, life);
            if (move !== null) onCellClick(move);
            return;
        }
        ai.glacierPending = glacierPending[turnSeat];
        ai.glacierCharge = glacierCharge[turnSeat];
        ai.budGuard = budGuard[turnSeat];
        ai.infernoReady = gearTurn.current.infernoReady[turnSeat];
        ai.skillKinds = gearTurn.current.kinds[turnSeat];
        const result = ai.makeMove(currentBoard, currentMagic, seatCosts, oppMagic, life, currentSkills, useToken, aiNecroRemain, aiNecroCost, judgeDayCost, totalAssaultCost, aiProliferate, magic, gearCost(aiNecroCost));

        // 氷結中のマスにはロックできない。ロック対象に混じっていたら、待ち状態で止まらないようロック自体をやめる
        // （氷室の番人はロックの代わりに氷結を撃つので、氷結が付けられるかで見る）
        const canMark = (t: number) => (currentCharacter === 'cryomancer' ? canFreeze(currentBoard[t]) : lockable(currentBoard[t]));
        if (result.lockTargets?.some((t) => !canMark(t))) {
            result.skills = result.skills.filter((sk) => !sk.startsWith('onClickUse') || !sk.endsWith('Lock'));
            result.lockTargets = undefined;
        }

        // AIが盤面・キャラに応じてスキルをロック（次のシャッフルで固定する）[要検証]
        const aiLocks = ai.chooseLocks(currentBoard, oppMagic, life, currentSkills);
        setLockedSkillsAt(turnSeat, aiLocks);

        // 詰みからのヘイルメアリー: 当選スキルをここで決め、AI がそのスキルに合った対象を選んでキューに積む
        if (result.hailMary) {
            const picked = randomPick(hailMaryChoices);
            const plan = ai.planHailMary(currentBoard, picked.name, life);
            const steps: (number | string)[] = [`onClickHailMary:${picked.name}`];
            if (plan.target !== null) steps.push(plan.target);
            if (plan.move !== null) steps.push(plan.move);
            setPendingAIMove(steps);
            return;
        }

        // 雷霆の巫: 帯電拡散→帯電付与は「スキル→対象クリック」を順に行う。トークン等の後続スキルも
        // 盤面への反映順を保つため同じキューに積む (sim/ai.js の faithfulMakeMove と同じ順序)
        if (result.chargeClicks && result.chargeClicks.length > 0) {
            const steps: (number | string)[] = [];
            for (const c of result.chargeClicks) {
                steps.push(c.skill);
                if (c.target !== undefined) steps.push(c.target);
            }
            steps.push(...result.skills);
            if (result.lockTargets) steps.push(...result.lockTargets);
            if (result.stompTarget !== undefined) steps.push(result.stompTarget);
            if (result.move !== null) steps.push(result.move);
            setPendingAIMove(steps);
            return;
        }

        for (const sk of result.skills) {
            executeSkillForAI(sk);
        }

        const pendingClicks: number[] = [];
        if (result.lockTargets) pendingClicks.push(...result.lockTargets);
        if (result.stompTarget !== undefined) pendingClicks.push(result.stompTarget);
        if (result.move !== null) pendingClicks.push(result.move);

        if (pendingClicks.length > 0) {
            if (result.skills.length > 0) {
                setPendingAIMove(pendingClicks);
            } else {
                onCellClick(pendingClicks[0]);
                if (pendingClicks.length > 1) setPendingAIMove(pendingClicks.slice(1));
            }
        }
    };

    useEffect(() => {
        if (!currentAI) return;

        const winner = calculateWinner(currentBoard.map(x => x.player));
        if (winner) return;

        // 全員AIでステップ実行モードのときは自動進行せず、「次の手番」ボタンを待つ
        if (isAllAI && !autoPlay) return;

        const timer = setTimeout(() => {
            runAIMove();
        }, 500);

        return () => clearTimeout(timer);
        // currentTurn も依存に含める: 巨人のスキップで turnSeat が変わらず同じ席が連続手番になる場合でも再発火させる
    }, [turnSeat, currentTurn, restartCount, autoPlay]);

    // 「次の手番」ボタン押下でAI同士の対戦を1ターン進める
    useEffect(() => {
        if (stepRequest === 0) return;
        if (!currentAI) return;
        if (calculateWinner(currentBoard.map(x => x.player))) return;
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
            }
            gearTurn.current.skills[turnSeat] += 1;
            if (skillId) {
                gearTurn.current.discount[turnSeat] = afterDiscount(gearTurn.current.discount[turnSeat], skillId);
                gearTurn.current.oppSkilled = gearTurn.current.oppSkilled.map((v, i) => (i === turnSeat ? v : true));
            }
            if (skillId && skillId !== 'onClickInferno') {
                gearTurn.current.kinds[turnSeat].add(skillId);
                if (gearTurn.current.kinds[turnSeat].size >= INFERNO_FREE_SKILLS) gearTurn.current.infernoReady[turnSeat] = true;
            }
            gearTurn.current.echoNext[turnSeat] = true;
            gearTurn.current.echoReady[turnSeat] = false;
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
    const proliferateTokenLife = 2;
    const proliferateUpkeepStep = 1;
    const proliferateMaxStacks = 8;
    // サイレンス: 立っている席は次の手番スキルを使えない（その席の手番が終わるたびに解除）
    const [silenced, setSilencedAt, setSilencedAll] = useSeatArray<boolean>(() => Array(seatCount).fill(false));
    const [proliferate, setProliferateAt, setProliferateAll] = useSeatArray<boolean>(() => Array(seatCount).fill(false));
    const [proliferateCount, setProliferateCountAt, setProliferateCountAll] = useSeatArray<number>(() => Array(seatCount).fill(0));
    const proliferateUpkeep = (count: number): number => count * proliferateUpkeepStep;

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

    useEffect(() => {
        if (currentTurn === 1) {
            return;
        }
        const nextSeat = judgeNextSeat();
        const nextCharacter = characters[nextSeat];
        const nextSymbol = symbols[nextSeat];
        // ギア: 新しい手番のスキル使用数をリセットし、余韻を引き継ぐ（StrictMode の二重実行に備えて1ターンに1回だけ）
        if (gearTurn.current.processedTurn !== currentTurn) {
            gearTurn.current.processedTurn = currentTurn;
            gearTurn.current.skills[nextSeat] = 0;
            gearTurn.current.kinds[nextSeat] = new Set();
            gearTurn.current.discount[nextSeat] = emptyDiscount();
            gearTurn.current.oppSkillPrev[nextSeat] = gearTurn.current.oppSkilled[nextSeat];
            gearTurn.current.oppSkilled[nextSeat] = false;
            gearTurn.current.freeCast = false;
            gearTurn.current.echoReady[nextSeat] = gearTurn.current.echoNext[nextSeat];
            gearTurn.current.echoNext[nextSeat] = false;
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
        // 巨人はタンク特性(高ライフ)を持つ代わりに毎ターンの魔力ボーナスは無し
        // (life8復元時のストンプ過多をオフェンス側で抑制。検証: giantGap -0.174→+0.002)
        const magicCharacter: CharacterId[] = ['magician'];
        // 50ターンごとに、手番開始時に得られる魔力が全員+1ずつ増える（長引く試合の打ち切り用）
        let nextMagic: number = magic[nextSeat] + 1 + lateMagicBonus(currentTurn, seatCount) + activeBudsCount(nextSymbol);
        if (magicCharacter.includes(nextCharacter)) {
            nextMagic++;
        }

        if (nextCharacter === 'yinYangMaster' && yinYangMode[nextSeat] === 'ying') {
            nextMagic++;
        }

        // 魔法使い: 自陣のバッズ1つにつき魔力回復+3 (標準の+1に追加で+2)。バッズ蓄積→スキル連打のコンセプト
        if (nextCharacter === 'magician') {
            nextMagic += activeBudsCount(nextSymbol) * 2;
        }

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
                gearLifeBonus(nextGears),
            gearLifeStd(nextGears, LIFE_STD)
        );
        // サイレンスは「封じられた側の手番が終わるたび」に解除
        setSilencedAt(turnSeat, false);
        // 蘇生の残りターンは「発動した側の手番が終わるたび」に減る
        if (currentCharacter === 'necromancer' && remainNecro[turnSeat] > 0) {
            setRemainNecroAt(turnSeat, remainNecro[turnSeat] - 1);
        }
        setLife(nextLife > 0 ? nextLife : 1);
        setUseToken(false);
        setTurnSeat(nextSeat);
    }, [currentTurn]);

    useEffect(() => {
        // 次に手番が来るプレイヤーのロックを固定して再シャッフル
        setSkills(reshuffledSkills(deckBySeat[judgeNextSeat()], lockedSkills[judgeNextSeat()]));
    }, [history]);

    const onCellClick = (i: number) => {
        if (hailMarySpin) return;
        setPreviewCells([]);
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
            nextBoard[i] = { ...nextBoard[i], effects: [...nextBoard[i].effects, { effect: '⚡' }] };
            addLog(`${posName(i)}に⚡を付与`);
            playEffect('zap', i);
            harvestMagic(1);
            setUseChargeOne(false);
            setCurrentBoard(withOverload(nextBoard));
            return;
        }

        if (useChargeArea) {
            const cells = geo.stompRange(i);
            addLog(`${posName(i)}を中心に範囲帯電（${cells.length}マスに⚡）`);
            flashCells(cells);
            playEffect('zap', i);
            setUseChargeArea(false);
            setCurrentBoard(withOverload(withCharge(currentBoard, cells)));
            return;
        }

        if (useChargeSpread) {
            const cells = connectedPieces(currentBoard, i, geo.size);
            if (cells.length === 0) return; // 空きマスは起点にできない。選び直せる
            harvestMagic(cells.length);
            addLog(`${posName(i)}から帯電拡散（${cells.length}マスに⚡）`);
            flashCells(cells);
            playEffect('zap');
            setUseChargeSpread(false);
            setCurrentBoard(withOverload(withCharge(currentBoard, cells)));
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

        if (useSwidden) {
            exeSwidden(i);
            return;
        }

        if (useSacrifice) {
            exeSacrifice(i);
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

        if (useIgnite) {
            exeIgnite(i);
            return;
        }

        if (useLock > 0) {
            if (!lockable(nextBoard[i])) return; // 氷結中のマスにはロックできない。選び直せる
            applyLock(nextBoard, i);
            harvestMagic(1);
            addLog(`${posName(i)}をロック`);
            playSfx('lock');
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
            playEffect('poison', i);
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

        if (calculateWinner(currentBoard.map((x) => x.player))) {
            return;
        } else if (currentBoard[i].player && currentBoard[i].player !== currentTurnPlayer) {
            if (currentBoard[i].bind > 0 && currentCharacter !== 'giant') {
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
        const decayNow = shouldDecay(placements, seatCount);
        const burnCells: number[] = [];
        setPlacements(placements + 1);
        for (let s = 0; decayNow && s < nextBoard.length; s++) {
            if (burnDamageOf(nextBoard[s], characters) > 0) burnCells.push(s);
            // ライフの減衰（自然減衰・🔥の継続ダメージ・毒。氷結の扱いは thermal.ts の decayTick）。
            // 履歴の盤面と共有しないよう、新しいマスを作って差し替える
            const square = decayTick(nextBoard[s], characters);
            nextBoard[s] = square;
            const poison = square.effects.filter((x) => x.effect === '☠').length;
            // 期限切れのロック。空蔵の持ち主が空きマスにかけたロックなら、そのマスが持ち主のコマになる
            const expiredLock = square.bind === 0 ? square.effects.find((x) => x.effect === '🔑') : undefined;
            if (square.bind === 0) {
                square.effects = square.effects.filter((x) => x.effect !== '🔑');
            }
            if (expiredLock?.value != null && !square.player) {
                nextBoard[s] = { player: symbols[expiredLock.value - 1], bind: GEAR_PARAMS.emptyLockLife, effects: [] };
                addLog(`空蔵: ${posName(s)}が${symbols[expiredLock.value - 1]}のコマになった`);
                continue;
            }
            // 毒持ちのコマでライフが0のマスは消えて拡散の起点になる。
            // 「このターンに0へ落ちた」とは限らない: ライフ0のコマに後から毒を撒いた場合も消す
            if (poison > 0 && square.bind === 0 && square.player && s !== i) {
                spreadOrigins.push(s);
                nextBoard[s] = { player: undefined, bind: 0, effects: [] };
                poisonVanished++;
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

        let newBind: number;
        let newEffects: Effect[];
        let newPlayer: Player | undefined;
        let capturedFrom: Player | undefined; // 通常の攻撃で奪取した相手（復讐の刃）
        if (nextBoard[i].player === currentTurnPlayer) {
            newPlayer = nextBoard[i].player;
            newBind = nextBoard[i].bind + life + 1;
            newEffects = nextBoard[i].effects;
        } else if (nextBoard[i].player) {
            const calculatedBind = nextBoard[i].bind - life + (nextBoard[i].bind > 0 ? 1 : 0);
            if (calculatedBind < 0) {
                newPlayer = currentTurnPlayer;
                newBind = calculatedBind * -1;
                capturedFrom = nextBoard[i].player;
            } else if (calculatedBind === 0) {
                newPlayer = undefined;
                newBind = 0;
            } else {
                newPlayer = nextBoard[i].player;
                newBind = calculatedBind;
            }
            // 毒持ちの敵コマを奪取/破壊した場合は拡散の起点にする
            if (calculatedBind <= 0 && nextBoard[i].effects.some((e) => e.effect === '☠')) {
                spreadOrigins.push(i);
            }
            newEffects = [];
            // 敵味方問わずコマが奪われる/消えるたびに墓地+1
            if (calculatedBind <= 0) {
                addCorpses(1);
            }
        } else {
            newPlayer = currentTurnPlayer;
            newBind = life;
            newEffects = [];
        }

        if (newPlayer === currentTurnPlayer && useBuds[0]) {
            newEffects.push(...Array<Effect>(useBuds[1]).fill({ effect: '🌱' }));
            setUseBuds([false, 0]);
        }

        nextBoard[i] = {
            player: newPlayer,
            bind: newBind,
            effects: newEffects,
        };

        // 復讐の刃: 奪われた側は魔力を得る（1手の獲得は上限あり）。奪った側が装備していれば魔力を失う
        const vengeanceGained: Record<number, number> = {};
        const vengeanceGain = (seat: number) => {
            if (!hasGear(gearsBySeat[seat], 'vengeance')) return;
            const add = Math.min(GEAR_PARAMS.vengeanceGain, GEAR_PARAMS.vengeanceCap - (vengeanceGained[seat] ?? 0));
            if (add <= 0) return;
            vengeanceGained[seat] = (vengeanceGained[seat] ?? 0) + add;
            setMagicAt(seat, (m) => m + add);
            addLog(`復讐の刃: ${symbols[seat]}の魔力+${add}`);
        };
        if (capturedFrom) {
            vengeanceGain(seatOf(capturedFrom));
            if (hasGear(turnGears, 'vengeance')) setMagicAt(turnSeat, (m) => Math.max(0, m - GEAR_PARAMS.vengeancePenalty));
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
        const fire = fireCharges(nextBoard, i, geo.size, characters);
        if (fire.fired.length > 0) {
            addLog(`⚡発火（${fire.fired.map(posName).join('・')}）${fire.damaged.length > 0 ? `で${fire.damaged.length}コマにダメージ` : ''}`);
            flashCells(fire.damaged);
            playEffect('zap', fire.fired[0]);
        }

        // 蘇生発動中: ライフが0になった敵コマを自動で自陣に吸収する
        if (necroActive) {
            let absorbed = 0;
            for (let k = 0; k < nextBoard.length; k++) {
                const sq = nextBoard[k];
                if (sq.player && sq.player !== currentTurnPlayer && sq.bind === 0 && !sq.effects.some((x) => x.effect === '🔑')) {
                    vengeanceGain(seatOf(sq.player));
                    nextBoard[k] = { player: currentTurnPlayer, bind: necromancyReviveLife, effects: [] };
                    absorbed++;
                }
            }
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

        setCurrentBoard(nextBoard);

        setHistory(nextHistory);
        setCurrentTurn(currentTurn + 1);
    };

    const charge = 3;
    const onClickCharge = () => {
        playSfx('charge');
        addLog(`「チャージ」を使用（ターン終了・マジック+${charge}）`);
        setMagicAt(turnSeat, (m) => m + charge);
        setCurrentTurn(currentTurn + 1);
    };

    const onClickAddLife = () => {
        addLog('「ライフ3」を使用（ライフ+3）');
        setLife(life + 3);
        spendMagic(calculateCost(seatCosts.onClickAddLife, false, false, currentTurnPlayer, 'onClickAddLife'), true, true, 'onClickAddLife');
    };

    const onClickShuffle = () => {
        addLog('「シャッフル」を使用');
        // 手札はデッキ（12枚）から引く
        setSkills(reshuffledSkills(deckBySeat[turnSeat], currentLockedSkills));
        spendMagic(seatCosts.onClickShuffle, true, false);
    };

    const onClickBibine = () => {
        addLog('「バイバイン」を使用（ライフ2倍）');
        setLife(life * 2);
        spendMagic(calculateCost(seatCosts.onClickBibine, false, false, currentTurnPlayer, 'onClickBibine'), true, true, 'onClickBibine');
    };

    // --- 毒（毒使い）関連 ---
    // どちらかが毒使いなら、毒セルが死んだ時の「周囲へ毒拡散」パッシブが有効になる
    const poisonerInPlay = characters.includes('poisoner');
    // 指定プレイヤーの自陣にある毒スタック数
    const poisonCount = (player: Player): number =>
        currentBoard
            .filter((x) => x.player === player && !isDormant(x)) // 休眠マスの☠は数えない
            .map((x) => x.effects)
            .flat()
            .filter((e) => e.effect === '☠').length;
    // 盤面全体の毒スタック数
    const boardPoisonCount = (board: SquareInfo[]): number => board.flatMap((x) => x.effects).filter((e) => e.effect === '☠').length;
    // 毒使いの駒に毒が付いた瞬間、そのマスのライフが POISON_LIFE_MULT 倍になる（毒を付与した直後のマスに適用する）
    const poisonStrike = (sq: SquareInfo): SquareInfo => {
        if (!sq.player) return sq;
        const owner = characters[seatOf(sq.player)];
        return owner === 'poisoner' ? { ...sq, bind: Math.round(sq.bind * POISON_LIFE_MULT) } : sq;
    };
    // --- ギアのエフェクト系ヘルパー（sim/engine.js の同名関数と同じ規則） ---
    // ロックを付ける。期間(ライフ)は堅牢の鍵で延びる。空きマスなら空蔵の持ち主を記録しておく
    const applyLock = (board: SquareInfo[], idx: number) => {
        const sq = board[idx];
        if (!lockable(sq)) return;
        const owner = hasGear(turnGears, 'emptyLock') && !sq.player ? turnSeat + 1 : undefined;
        const lockBind = gearLockBind(turnGears);
        const lock: Effect = owner ? { effect: '🔑', value: owner } : { effect: '🔑' };
        board[idx] = { ...sq, effects: [...sq.effects, lock], bind: sq.bind < lockBind ? lockBind : sq.bind };
    };
    // 毒花: 毒が付いたコマ(cells)のうち、持ち主が毒花を装備しているものに、1つずつバッズも付く。
    // 誰が付けた毒でも発動する（自分で付けた毒でも、相手から付けられた毒でも。毒を付ける側の装備は関係ない）
    const toxicBloom = (board: SquareInfo[], cells: number[]) => {
        for (const k of cells) {
            const owner = board[k].player;
            if (!owner || !hasGear(gearsBySeat[seatOf(owner)], 'toxicBloom')) continue;
            board[k] = { ...board[k], effects: [...board[k].effects, { effect: '🌱' }] };
            addLog(`毒花: ${posName(k)}にバッズ`);
        }
    };
    // トークン系スキルでコマを置いた後の処理: 道連れの鍵(確率でロック) と 伝播(周囲のコマに同じエフェクト)。
    // effect はトークンが持つエフェクト。収穫に渡す「付与したエフェクト数」を返す
    const afterTokenPlaced = (board: SquareInfo[], idx: number, effect?: TokenEffect): number => {
        let granted = effect ? 1 : 0;
        if (hasGear(turnGears, 'bindingLock') && Math.random() < GEAR_PARAMS.bindingLockChance) {
            applyLock(board, idx);
            granted += 1;
            addLog(`道連れの鍵: ${posName(idx)}にロックが付いた`);
        }
        if (effect && hasGear(turnGears, 'propagate')) {
            // 周囲8マスのコマのうち、ロックされておらず、エフェクトの種類に合うもの（バッズ=自陣 / 毒=敵 / ⚡=誰でも）
            const cands = geo.surroundRange(idx).filter((j) => {
                const sq = board[j];
                if (!sq.player || isGuarded(sq, characters)) return false;
                if (effect === '🌱') return sq.player === currentTurnPlayer;
                if (effect === '☠') return sq.player !== currentTurnPlayer;
                return true;
            });
            if (cands.length > 0) {
                const j = randomPick(cands);
                const spread = { ...board[j], effects: [...board[j].effects, { effect }] };
                board[j] = effect === '☠' ? poisonStrike(spread) : spread;
                granted += 1;
                addLog(`伝播: ${posName(j)}に${effect}が広がった`);
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
    const miasmaPlan = (board: SquareInfo[], player: Player): Map<number, number> => {
        const plan = new Map<number, number>();
        board.forEach((sq, i) => {
            if (sq.player !== player || isDormant(sq) || !sq.effects.some((e) => e.effect === '☠')) return;
            for (const j of geo.surroundRange(i)) {
                const target = board[j];
                if (target.player && target.player !== player && !isGuarded(target, characters)) plan.set(j, (plan.get(j) ?? 0) + 1);
            }
        });
        return plan;
    };

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
        harvestMagic(1);
        setUseBuds([true, useBuds[1] + 1]);
        spendMagic(calculateCost(seatCosts.onClickBuds, false, false, currentTurnPlayer, 'onClickBuds'), true, true, 'onClickBuds');
    };

    const onClickDoubleBuds = () => {
        addLog('「ダブルバッズ」を使用（次の一手でバッズを2つ植える）');
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
        harvestMagic(afterTokenPlaced(board, emptyIndex1) + afterTokenPlaced(board, emptyIndex2));
        setCurrentBoard(board);
        spendMagic(calculateCost(seatCosts.onClickDoubleToken, true, false, currentTurnPlayer, 'onClickDoubleToken'), true, true, 'onClickDoubleToken');
        setUseToken(true);
    };

    const calculateTokenBind = (): number => {
        const base = currentCharacter === 'tactician' ? 6 : 4;
        // 増援 / 軽量トークンで補正（ライフは1以上）
        const delta = gearTokenBindDelta(turnGears);
        return delta === 0 ? base : Math.max(1, base + delta);
    };

    const onClickBudsToken = () => {
        const board = currentBoard.slice();
        const emptyIndexes = findEmptyIndexes(board);
        const index = randomPick(emptyIndexes);
        board[index] = { player: currentTurnPlayer, bind: calculateTokenBind(), effects: [{ effect: '🌱' }] };
        addLog(`「バッズトークン」を使用（${posName(index)}に設置）`);
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

    const totalAssaultCost = gearCost(seatCosts.onClickTotalAssault - useTokenCount[turnSeat] * 2, turnSeat, false, 'onClickTotalAssault');
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
        const me = currentTurnPlayer;
        if (step % 2 === 1) {
            const empties = findEmptyIndexes(board);
            if (empties.length === 0) return null;
            const index = randomPick(empties);
            board[index] = { player: me, bind: proliferateTokenLife, effects: [] };
            return `${posName(index)}にライフ${proliferateTokenLife}のコマを追加`;
        }
        // 毒使いだけは敵コマへの毒がアイテムになる（毒拡散パッシブとつながる）
        const isPoisoner = currentCharacter === 'poisoner';
        const item: Effect = isPoisoner ? { effect: '☠' } : { effect: '🌱' };
        const targets = board
            .map((_, idx) => idx)
            .filter((idx) => {
                const sq = board[idx];
                if (sq.effects.some((e) => e.effect === '🔑')) return false;
                return isPoisoner ? !!sq.player && sq.player !== me : sq.player === me;
            });
        if (targets.length === 0) return null;
        const index = randomPick(targets);
        board[index] = { ...board[index], effects: [...board[index].effects, item] };
        if (isPoisoner) {
            board[index] = poisonStrike(board[index]);
            toxicBloom(board, [index]);
        }
        return `${posName(index)}に${item.effect}を追加`;
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
        const stompIndexes = geo.stompRange(i);
        let destroyed = 0;
        const broken: number[] = [];
        for (const stompIndex of stompIndexes) {
            if (currentBoard[stompIndex].player === currentTurnPlayer) {
                // 自陣のコマは-5（氷結なら解除だけ・🔥なら1.5倍）
                currentBoard[stompIndex] = applyDamage(currentBoard[stompIndex], 5, 'skill').sq;
            } else {
                const guard = absorbDestroy(currentBoard[stompIndex]);
                if (guard.blocked) {
                    currentBoard[stompIndex] = guard.sq; // 氷結が身代わりになる
                    broken.push(stompIndex);
                    continue;
                }
                if (currentBoard[stompIndex].player) destroyed++;
                currentBoard[stompIndex] = { player: undefined, bind: 0, effects: [] };
            }
        }
        addCorpses(destroyed);
        if (currentBoard[i].player === undefined) {
            currentBoard[i] = { player: currentTurnPlayer, bind: life, effects: [] };
        }
        addLog(`${posName(i)}を中心にストンプを実行`);
        flashCells(stompIndexes);
        playEffect('stomp', i);
        playBurst('iceBreak', broken);
        setCurrentBoard(currentBoard);
        setUseStomp(false);
    };

    const baseJudgeDayCost = seatCosts.onClickJudgeDay;
    const judgeDayCost = gearCost(Math.max(0, baseJudgeDayCost - useMagicCount[turnSeat]), turnSeat, false, 'onClickJudgeDay');
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
        const judgeIndexes = geo.judgeRange(i);

        let destroyed = 0;
        let centerSurvived = false;
        const broken: number[] = [];
        for (const judgeIndex of judgeIndexes) {
            if (
                !board[judgeIndex].effects.map((x) => x.effect).includes('🔑') ||
                !(board[judgeIndex].player === currentTurnPlayer && board[judgeIndex].effects.map((x) => x.effect).includes('🌱'))
            ) {
                const guard = absorbDestroy(board[judgeIndex]);
                if (guard.blocked) {
                    board[judgeIndex] = guard.sq; // 氷結が身代わりになる
                    broken.push(judgeIndex);
                    if (judgeIndex === i) centerSurvived = true;
                    continue;
                }
                if (board[judgeIndex].player) destroyed++;
                board[judgeIndex] = { player: undefined, bind: 0, effects: [] };
            }
        }
        addCorpses(destroyed);

        setUseMagicCountAt(turnSeat, 0);

        // 中心は自分のコマになる。ただし氷結が身代わりになって残った敵コマは奪えない
        if (!centerSurvived) board[i] = { player: currentTurnPlayer, bind: 2, effects: [{ effect: '🌱' }] };
        addLog(`${posName(i)}を中心に審判の日を実行`);
        flashCells(judgeIndexes);
        playEffect('judge');
        playBurst('iceBreak', broken);
        setCurrentBoard(board);
        setUseJudgeDay(false);
        setCurrentTurn(currentTurn + 1);
    };

    const onClickToggleYingYang = () => {
        addLog('「陰陽転化」を使用（陰陽モードを切替）');
        playEffect('yinyang');
        // 自分のモードを見て反転する (issue #12: 以前は💙のモードを見ていて⭕が永久に陽へ切り替えられなかった)
        setYinYangModeAt(turnSeat, (m) => (m === 'yang' ? 'ying' : 'yang'));
        spendMagic(gearCost(seatCosts.onClickToggleYingYang, turnSeat, false, 'onClickToggleYingYang'), false, true, 'onClickToggleYingYang');
    };

    // 豊穣の舞/凶荒の舞の効果本体。コストは呼び出し側で払う（ヘイルメアリーからも使う）
    const applyYingYangDance = (mode: YingYangMode) => {
        addLog(`「${mode === 'yang' ? '豊穣の舞（自分の全コマ+2）' : '凶荒の舞（相手の全コマ-2）'}」を使用`);
        const board = currentBoard.slice();
        const affected: number[] = [];
        const broken: number[] = [];
        let destroyed = 0;
        if (mode === 'yang') {
            for (const square of board) {
                if (square.player === currentTurnPlayer) {
                    square.bind = square.bind + 2;
                }
            }
        } else {
            board.forEach((square, idx) => {
                if (square.player && square.player !== currentTurnPlayer) {
                    // スキルダメージ: 氷結なら解除だけ、🔥なら1.5倍。ライフ1以下になったら破壊
                    const hit = applyDamage(square, 2, 'skill');
                    if (hit.blocked) {
                        board[idx] = hit.sq;
                        broken.push(idx);
                        return;
                    }
                    affected.push(idx);
                    if (hit.sq.bind < 1) {
                        board[idx] = { player: undefined, bind: 0, effects: [] };
                        destroyed++;
                    } else {
                        board[idx] = hit.sq;
                    }
                }
            });
        }
        addCorpses(destroyed);
        flashCells(affected);
        playEffect(mode === 'yang' ? 'harvest' : 'famine');
        playBurst('iceBreak', broken);
        setCurrentBoard(board);
    };
    const onClickYingYangSkll = () => {
        applyYingYangDance(currentYinYangMode === 'yang' ? 'yang' : 'ying');
        spendMagic(gearCost(seatCosts.onClickYingYangSkill, turnSeat, false, 'onClickYingYangSkill'), false, true, 'onClickYingYangSkill');
    };

    const baseNecromancyCost = 10;
    const necromancyDuration = 4;
    const necromancyReviveLife = 2;
    const necromancySummonCap = 5;
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
        playEffect('necromancy');
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
        { name: '豊穣の舞', run: () => applyYingYangDance('yang') },
        { name: '凶荒の舞', run: () => applyYingYangDance('ying') },
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
        const plan = miasmaPlan(board, currentTurnPlayer);
        const targets = Array.from(plan.keys());
        plan.forEach((n, j) => {
            board[j] = poisonStrike({ ...board[j], effects: [...board[j].effects, ...Array<Effect>(n).fill({ effect: '☠' })] });
        });
        board.forEach((sq, k) => {
            if (sq.player === currentTurnPlayer && sq.effects.some((e) => e.effect === '☠')) {
                board[k] = { ...sq, effects: sq.effects.filter((e) => e.effect !== '☠') };
            }
        });
        harvestMagic(targets.length);
        toxicBloom(board, targets);
        addLog(`ミアズマ（敵${targets.length}マスに毒、自陣の毒はすべて消えた）`);
        flashCells(targets);
        playEffect('poison');
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
        harvestMagic(afterTokenPlaced(board, index, '☠'));
        toxicBloom(board, [index]);
        setCurrentBoard(board);
        spendMagic(calculateCost(seatCosts.onClickPoisonToken, true, true, currentTurnPlayer, 'onClickPoisonToken'), true, true, 'onClickPoisonToken');
        setUseToken(true);
    };

    const onClickSerum = () => {
        addLog('「血清」を使用（自陣の毒をすべて除去）');
        const board = currentBoard.slice();
        board.forEach((sq, idx) => {
            if (sq.player === currentTurnPlayer && sq.effects.some((e) => e.effect === '☠')) {
                board[idx] = { ...sq, effects: sq.effects.filter((e) => e.effect !== '☠') };
            }
        });
        setCurrentBoard(board);
        spendMagic(calculateCost(seatCosts.onClickSerum, false, true, currentTurnPlayer, 'onClickSerum'), true, true, 'onClickSerum');
    };

    const onClickIntensify = () => {
        addLog('「猛毒化」を使用（毒の数を倍化）');
        const board = currentBoard.slice();
        const affected: number[] = [];
        let added = 0;
        board.forEach((sq, idx) => {
            const poison = sq.effects.filter((e) => e.effect === '☠').length;
            if (poison > 0) {
                board[idx] = poisonStrike({ ...sq, effects: [...sq.effects, ...Array<Effect>(poison).fill({ effect: '☠' })] });
                affected.push(idx);
                added += poison;
            }
        });
        harvestMagic(added);
        toxicBloom(board, affected);
        flashCells(affected);
        playEffect('poison');
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
        const targets = geo.stompRange(i).filter((j) => board[j].player && !isGuarded(board[j], characters));
        for (const t of targets) board[t] = poisonStrike({ ...board[t], effects: [...board[t].effects, { effect: '☠' }] });
        harvestMagic(targets.length);
        toxicBloom(board, targets);
        addLog(`${posName(i)}を中心にパンデミック（${targets.length}マスに毒）`);
        flashCells(targets);
        playEffect('poison', i);
        setCurrentBoard(board);
        setUsePandemic(false);
    };

    // 毒霧: 盤上の全コマ（敵味方問わず。🔑ロック・無敵は除く）に毒を1付与する。対象選択なし
    const onClickPoisonMist = () => {
        const board = currentBoard.slice();
        const targets = board.map((_, k) => k).filter((k) => board[k].player && !isGuarded(board[k], characters));
        for (const k of targets) board[k] = poisonStrike({ ...board[k], effects: [...board[k].effects, { effect: '☠' }] });
        harvestMagic(targets.length);
        toxicBloom(board, targets);
        addLog(`「毒霧」を使用（${targets.length}マスに毒）`);
        flashCells(targets);
        playEffect('poison');
        setCurrentBoard(board);
        spendMagic(calculateCost(seatCosts.onClickPoisonMist, false, true, currentTurnPlayer, 'onClickPoisonMist'), true, true, 'onClickPoisonMist');
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
            board[index] = { player: currentTurnPlayer, bind: calculateTokenBind(), effects: [{ effect: '⚡' }] };
            addLog(`「帯電トークン」を使用（${posName(index)}に設置）`);
            harvestMagic(afterTokenPlaced(board, index, '⚡'));
            playEffect('zap', index);
            setCurrentBoard(withOverload(board));
        }
        spendMagic(calculateCost(seatCosts.onClickChargeToken, true, false, currentTurnPlayer, 'onClickChargeToken'), true, true, 'onClickChargeToken');
        setUseToken(true);
    };
    // 帯電付与: 選んだマス（空きマスも可）に⚡を1つ付与する。付与しただけではダメージは出ない
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
            board[idx] = { player: currentTurnPlayer, bind: calculateTokenBind(), effects: [{ effect: '⚡' }] };
        }
        addLog(`「帯電ダブルトークン」を使用（${picks.map(posName).join('・')}に設置）`);
        if (picks.length > 0) playEffect('zap', picks[0]);
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
            playEffect('zap', picks[0]);
        }
        setCurrentBoard(withOverload(withCharge(currentBoard, picks)));
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
        playEffect('zap', i);
        setUseJammer(false);
        setCurrentBoard(board);
    };


    // --- 氷結・火炎（thermal.ts。氷室の番人・煉獄の鍛冶師） ---
    const [useFreeze, setUseFreeze] = useState<boolean>(false);
    const [useIgnite, setUseIgnite] = useState<boolean>(false);
    // 氷結: 選んだコマに❄を付与する（敵味方どちらでも。付与しただけではダメージは出ない）
    const onClickFreeze = () => {
        addLog('「氷結」を使用（コマを選択）');
        setUseFreeze(true);
        spendMagic(calculateCost(seatCosts.onClickFreeze, false, false, currentTurnPlayer, 'onClickFreeze'), true, true, 'onClickFreeze');
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
    // 風の落とし子: 自陣のコマにランダムで🌱を3つ（同じコマに重なることもある）
    const onClickWindborne = () => {
        const cands = sowCandidates(currentBoard, currentTurnPlayer);
        if (cands.length === 0) return;
        const picks = [0, 1, 2].map(() => randomPick(cands));
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
            playEffect('flame', index);
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
        if (picks.length > 0) playEffect('flame', picks[0]);
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
        playEffect('flame', i);
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
        return parts.length > 0 ? `コスト軽減中: ${parts.join('・')}` : null;
    };
    const onClickBoost = () => {
        const board = currentBoard.slice();
        const done = boostAll(board, currentTurnPlayer);
        if (done.length === 0) return;
        addLog(`「慈雨」を使用（${done.length}コマのライフ+1）`);
        flashCells(done);
        playEffect('harvest');
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
        playEffect('windborne', undefined, [i]);
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
        playEffect('sprout', undefined, [to]);
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
        playEffect('famine');
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
    const freezeCells = (cells: number[], label: string, focus?: number): number => {
        const board = currentBoard.slice();
        const made = freeze(board, notShielded(cells));
        bumpGlacierCharge(made.length);
        addLog(`${label}（${made.length}マスが氷結）`);
        flashCells(made);
        playEffect('freeze', focus, made);
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
        freezeCells(geo.stompRange(i), `${posName(i)}を中心に範囲氷結`, i);
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
        freezeCells(cells, `${posName(icicleCell)}を通る氷柱`, icicleCell);
        setUseIcicle(false);
        setIcicleCell(null);
    };
    // ランダム氷結: ランダムな1〜4マス（空きマス含む）に❄
    const onClickRandomFreeze = () => {
        const cands = notShielded(randomFreezeCandidates(currentBoard));
        if (cands.length === 0) return;
        const n = Math.min(cands.length, 1 + Math.floor(Math.random() * 4));
        freezeCells(randomAnyPick([...cands], n), '「ランダム氷結」を使用');
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
        freezeCells(cells, `${posName(i)}から氷結拡散`, i);
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
            playEffect('freeze', index, [index]);
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
        if (picks.length > 0) playEffect('freeze', picks[0], picks);
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
        playEffect('glacierBurst', i, [i]);
        setUseShatter(false);
        setCurrentBoard(board);
    };
    // 霜降り: 自陣のライフ2以下のコマすべてに❄
    const onClickFrostfall = () => {
        const targets = notShielded(frostfallTargets(currentBoard, currentTurnPlayer));
        if (targets.length === 0) return;
        freezeCells(targets, '「霜降り」を使用');
        spendMagic(calculateCost(seatCosts.onClickFrostfall, false, false, currentTurnPlayer, 'onClickFrostfall'), true, true, 'onClickFrostfall');
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
        playEffect('flame', i, r.targets);
        playBurst('thaw', r.thawed);
        setUseSacrifice(false);
        setCurrentBoard(board);
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
        playEffect('flame', cells[0]);
        playBurst('thaw', thawed);
        setCurrentBoard(board);
    };
    const exeIgnite = (i: number) => {
        if (!currentBoard[i].player) return; // コマのないマスは選び直せる
        const board = currentBoard.slice();
        addLog(`${posName(i)}に🔥を付与`);
        setUseIgnite(false);
        igniteCells(board, [i]);
    };

    // 次の手番の席。基本は席順どおりで、次が巨人のときだけ5ターンに1回その席を飛ばす
    const judgeNextSeat = (): number => {
        if (currentTurn === 1) {
            return 0;
        }

        let next = (turnSeat + 1) % seatCount;
        // 2人戦で同キャラ(巨人ミラー含む)のときは従来どおり休みなしで交互に回す
        const mirror = seatCount === 2 && characters[0] === characters[1];
        if (!mirror && characters[next] === 'giant' && currentTurn % GIANT_SKIP_MODULO >= GIANT_SKIP_MODULO - 1) {
            next = (next + 1) % seatCount;
        }
        return next;
    };

    const checkSkillDisable = (cost: number, isToken: boolean = false, isPoison: boolean = false): boolean => {
        const calculatedCost: number = calculateCost(cost, isToken, isPoison);
        return magic[turnSeat] < calculatedCost || (isToken && useToken);
    };

    // player 省略時は手番プレイヤー。パネルで非手番側のコストを出すために指定できる。
    // キャラ補正(characterCost)のあと、ギアのコスト補正(gearCost)を掛ける
    const calculateCost = (cost: number, isToken: boolean = false, isPoison: boolean = false, player: Player = currentTurnPlayer, skillKey?: string) =>
        gearCost(characterCost(cost, isToken, isPoison, player, skillKey), seatOf(player), isToken, skillKey);

    const characterCost = (cost: number, isToken: boolean, isPoison: boolean, player: Player, skillKey?: string) => {
        const seat = seatOf(player);
        const characterId = characters[seat];
        // 煉獄の鍛冶師: 🔥を付与するスキルは常に-1（下限1）
        if (characterId === 'pyromancer') {
            return skillKey && FLAME_SKILL_KEYS.has(skillKey) && cost > 1 ? cost - 1 : cost;
        }
        // 毒使い: 毒系スキルは-1、それ以外は+1
        if (characterId === 'poisoner') {
            return isPoison ? cost - 1 : cost + 1;
        }
        if (characterId === 'tactician') {
            if (isToken) {
                return cost - 1;
            } else {
                return cost + 2;
            }
        }

        // 陰陽師: 陽は「手番プレイヤー自身のモード」で判定する。以前は両分岐とも heartTurn 条件付きで、
        // ⭕側は陽のライフを得ながらコスト増を免れ、💙側は⭕のモードで+1される誤りがあった (issue #12)
        if (characterId === 'yinYangMaster' && yinYangMode[seat] === 'yang') {
            return cost + 1;
        }

        return cost;
    };

    const winner = calculateWinner(currentBoard.map((x) => x.player));
    const currentNecroCost = necroCost[turnSeat];
    const currentNecroRemain = remainNecro[turnSeat];

    // 勝者が確定したら勝利数を1回だけ加算する
    useEffect(() => {
        if (winner) {
            setWinsAt(seatOf(winner), (w) => w + 1);
            playSfx('win');
        }
    }, [winner]);

    // 継続中スキルの残りターン数を返す
    const continuousEffects = (seat: number): string[] => {
        const labels: string[] = [];
        const assault = useAssault[seat];
        if (assault > 0) labels.push(`全軍突撃 残り${assault}ターン`);
        if (silenced[seat]) labels.push('サイレンス 次の手番スキル不可');
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
                    { name: yang ? '豊穣の舞' : '凶荒の舞', cost: g(sc.onClickYingYangSkill) },
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
            <div key={seat} className={`${styles.panel}${isCurrent ? ` ${styles.panelCurrent}` : ''}`}>
                <div className={`${styles.avatar} ${AVATAR_CLASSES[seat]}`}>{player}</div>
                <div className={styles.name}>{CHARACTER_NAMES[character]}</div>
                <div className={styles.tags}>
                    <span className={styles.tag}>{isAI ? 'AI' : '人間'}</span>
                    {isCurrent && <span className={styles.turnBadge}>手番</span>}
                </div>
                {gearsBySeat[seat].length > 0 && (
                    <div className={styles.gears}>
                        {gearsBySeat[seat].map((id) => (
                            <span key={id} className={styles.gear} title={`${gearDefOf(id).name}: ${gearDefOf(id).desc}`}>
                                {gearDefOf(id).icon} {gearDefOf(id).name}
                            </span>
                        ))}
                    </div>
                )}
                <div className={styles.stats}>
                    <span className={styles.chip}>🏆 {wins[seat]}</span>
                    <span className={`${styles.chip} ${styles.chipMagic}`}>⚡ {magic[seat]}</span>
                </div>
                {exclusiveCosts.length > 0 && (
                    <div className={styles.skillCosts}>
                        {exclusiveCosts.map((s) => (
                            <div key={s.name} className={styles.skillCost}>
                                <span>{s.name}</span>
                                <b>⚡ {s.cost}</b>
                            </div>
                        ))}
                    </div>
                )}
                {effects.length > 0 && (
                    <div className={styles.effects}>
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
        setGlacierPendingAll(Array(seatCount).fill(false));
        setGlacierChargeAll(Array(seatCount).fill(0));
        setBudGuardAll(Array(seatCount).fill(false));
        setUseSucker(false);
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
            processedTurn: 1,
        };
        setPriceTables(rollPriceTables());
    };

    const notLocked = (idx: number) => !isGuarded(currentBoard[idx], characters);
    const isOpponentCell = (idx: number) => !!currentBoard[idx].player && currentBoard[idx].player !== currentTurnPlayer;

    // ボタンホバー時に破壊範囲をプレビューするマス
    const slashPreview = (): number[] => geo.antiDiagonal.filter((idx) => notLocked(idx));
    const backSlashPreview = (): number[] => geo.mainDiagonal.filter((idx) => notLocked(idx));
    const opiumPreview = (): number[] =>
        currentBoard.map((_, idx) => idx).filter((idx) => isOpponentCell(idx) && currentBoard[idx].bind > 0 && notLocked(idx));
    const kyokoPreview = (): number[] => currentBoard.map((_, idx) => idx).filter((idx) => isOpponentCell(idx));

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
        else if (useSacrifice) setPreviewCells(sacrificeCandidates().includes(i) ? [i, ...sacrificeTargets(currentBoard, currentBoard[i].bind, currentTurnPlayer, characters)] : []);
        else if (useSwidden) setPreviewCells(budStacks(currentBoard[i]) > 0 ? [i] : []);
        else if (useSucker) setPreviewCells(suckerSources().includes(i) ? [i, ...budReceivers(currentBoard, i, currentTurnPlayer, geo.size)] : []);
        else if (useFreeze) setPreviewCells(canFreeze(currentBoard[i]) ? [i] : []);
        else if (useIgnite) setPreviewCells(currentBoard[i].player ? [i] : []);
        else if (useJammer) setPreviewCells(canJam(currentBoard, i, currentTurnPlayer, characters) ? jammerTargets(currentBoard, i, geo.size, currentTurnPlayer) : []);
    };
    const onCellLeave = () => {
        if (useStomp || useJudgeDay || usePandemic || useInjection > 0 || useChargeOne || useChargeSpread || useChargeArea || useJammer || useFreeze || useIgnite || useSucker || useSwidden || useSacrifice || useRelocate || useClone || usePlunder || useFrostArea || useIcicle || useFreezeSpread || useShatter) setPreviewCells([]);
    };

    // マス選択待ちのスキル名。選択後の演出より先に「何が発動したか」を盤面上に出す
    const pendingSkillName = useStomp
        ? 'ストンプ'
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
        : useSwidden
        ? '焼畑'
        : useSucker
        ? 'ひこばえ'
        : useFreeze
        ? '氷結'
        : useIgnite
        ? '火遁'
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
        { idx: 21, onClick: onClickChargeToken, buttonText: `帯電トークン-${calculateCost(seatCosts.onClickChargeToken, true, false, currentTurnPlayer, 'onClickChargeToken')}`, paragraph: `⚡付き・ライフ${calculateTokenBind()}の自陣コマをランダムに設置します\n⚡の隣に誰かが置くと、⚡マスの縦横隣のコマに1ダメージ\nトークンはターンに一度しか使用できません`, disabled: checkSkillDisable(seatCosts.onClickChargeToken, true) },
        { idx: 22, onClick: onClickChargeOne, buttonText: `帯電付与-${chargeOneCost()}`, paragraph: `マスを選択し、⚡を1つ付与します（空きマスも可）\n付与しただけではダメージは出ません\nコストは盤面の⚡の数だけ軽減されます`, disabled: magic[turnSeat] < chargeOneCost() },
        { idx: 23, onClick: onClickDoubleChargeToken, buttonText: `帯電ダブルトークン-${calculateCost(seatCosts.onClickDoubleChargeToken, true, false, currentTurnPlayer, 'onClickDoubleChargeToken')}`, paragraph: `⚡付き・ライフ${calculateTokenBind()}の自陣コマをランダムに2つ設置します\n⚡の隣に誰かが置くと、⚡マスの縦横隣のコマに1ダメージ\nトークンはターンに一度しか使用できません`, disabled: checkSkillDisable(seatCosts.onClickDoubleChargeToken, true) },
        { idx: 24, onClick: onClickChargeArea, buttonText: `範囲帯電-${calculateCost(seatCosts.onClickChargeArea, false, false, currentTurnPlayer, 'onClickChargeArea')}`, paragraph: `マスを選択し、そのマスと周囲1マス(3x3)に⚡を1つずつ付与します（空きマスも可）\n付与しただけではダメージは出ません`, disabled: checkSkillDisable(seatCosts.onClickChargeArea) },
        { idx: 25, onClick: onClickChargeRandom, buttonText: `ランダム帯電-${calculateCost(seatCosts.onClickChargeRandom, false, false, currentTurnPlayer, 'onClickChargeRandom')}`, paragraph: `ランダムな1〜4マスに⚡を1つずつ付与します（空きマスも可）\n無敵のマスと🔑ロック中のマスは対象外です`, disabled: checkSkillDisable(seatCosts.onClickChargeRandom) },
        { idx: 26, onClick: onClickJammer, buttonText: `ジャマー-${calculateCost(seatCosts.onClickJammer, false, false, currentTurnPlayer, 'onClickJammer')}`, paragraph: `⚡のあるマスを選択し、縦横に隣接する相手のコマのライフを⚡の数だけ減らして、そのマスの⚡を取り除きます\n自分のコマと🔑ロック中のコマは影響を受けません\n自分の無敵マスも選べます（弱点を解除できます）`, disabled: checkSkillDisable(seatCosts.onClickJammer) || boardChargeCount(currentBoard) === 0 },
        { idx: 27, onClick: onClickHailMary, buttonText: `ヘイルメアリー-${calculateCost(seatCosts.onClickHailMary, false, false, currentTurnPlayer, 'onClickHailMary')}`, paragraph: `陰陽転化を除く固有スキルをランダムに1つ、追加コストなしで発動します`, disabled: checkSkillDisable(seatCosts.onClickHailMary) },
        { idx: 28, onClick: onClickSilence, buttonText: `サイレンス-${calculateCost(seatCosts.onClickSilence, false, false, currentTurnPlayer, 'onClickSilence')}`, paragraph: `相手全員が次の手番、スキルを使えなくなります（駒を置くことはできます）`, disabled: checkSkillDisable(seatCosts.onClickSilence) || otherSeats(turnSeat).every((seat) => silenced[seat]) },
        { idx: 29, onClick: onClickPoisonMist, buttonText: `毒霧-${calculateCost(seatCosts.onClickPoisonMist, false, true, currentTurnPlayer, 'onClickPoisonMist')}`, paragraph: `盤上の全コマ（敵味方問わず）に毒を1付与します 🔑ロック中・無敵のコマは対象外です`, disabled: checkSkillDisable(seatCosts.onClickPoisonMist, false, true) || !currentBoard.some((sq) => sq.player) },
        { idx: 30, onClick: onClickFreeze, buttonText: `氷結-${calculateCost(seatCosts.onClickFreeze, false, false, currentTurnPlayer, 'onClickFreeze')}`, paragraph: `コマを選択し、❄氷結を付与します（敵味方どちらでも）\n氷結中はターン進行でライフが減らず、隣接⚡のダメージも受けず（そのマスの⚡は休眠）、スキルのダメージは氷結が解除される代わりに無効になります（毒は通ります）\n自陣の氷結コマには重ねて強化できません`, disabled: checkSkillDisable(seatCosts.onClickFreeze) || !currentBoard.some(canFreeze) },
        { idx: 31, onClick: onClickIgnite, buttonText: `火遁-${calculateCost(seatCosts.onClickIgnite, false, false, currentTurnPlayer, 'onClickIgnite')}`, paragraph: `コマを選択し、🔥火炎を1つ付与します（重複可）\n毎ターン1スタックにつき2ダメージ。ダメージを受けると消え、スキルのダメージは1.5倍に\n付与したマスと縦横隣の氷結は即座に解けます`, disabled: checkSkillDisable(seatCosts.onClickIgnite) || !currentBoard.some((sq) => sq.player) },
        { idx: 32, onClick: onClickCleanse, buttonText: `浄化-${calculateCost(seatCosts.onClickCleanse, false, false, currentTurnPlayer, 'onClickCleanse')}`, paragraph: `自陣のコマの状態異常（☠毒・🔥火炎・❄氷結・⚡帯電）をすべて回復します\n🌱バッズと🔑ロックはそのままです`, disabled: checkSkillDisable(seatCosts.onClickCleanse) || ownAilmentCells().length === 0 },
        { idx: 33, onClick: onClickHarvestEve, buttonText: `刈り入れ前夜-${calculateCost(seatCosts.onClickHarvestEve, false, false, currentTurnPlayer, 'onClickHarvestEve')}`, paragraph: `自陣の🌱をすべて刈り取り、刈った数だけ魔力を得ます\n氷結や火炎で失う前に現金化できます`, disabled: checkSkillDisable(seatCosts.onClickHarvestEve) || ownBudTotal() === 0 },
        { idx: 34, onClick: onClickSolstice, buttonText: `冬至の種子-${calculateCost(seatCosts.onClickSolstice, false, false, currentTurnPlayer, 'onClickSolstice')}`, paragraph: `次の自分の手番が来るまで、自陣のコマの🌱が🔥で消えず、氷結中のマスでも休眠せず働きます（魔力・刈り入れ前夜）`, disabled: checkSkillDisable(seatCosts.onClickSolstice) || budGuard[turnSeat] },
        { idx: 35, onClick: onClickSucker, buttonText: `ひこばえ-${calculateCost(seatCosts.onClickSucker, false, false, currentTurnPlayer, 'onClickSucker')}`, paragraph: `🌱を持つ自陣のコマを選ぶと、縦横に隣り合う自陣のコマに🌱が1つずつ付きます（隣が3つ以上ならランダムに2つ）\n氷結・火炎中のコマには付きません`, disabled: checkSkillDisable(seatCosts.onClickSucker) || suckerSources().length === 0 },
        { idx: 36, onClick: onClickWindborne, buttonText: `風の落とし子-${calculateCost(seatCosts.onClickWindborne, false, false, currentTurnPlayer, 'onClickWindborne')}`, paragraph: `自陣のコマにランダムで🌱を3つ配ります（同じコマに重なることもあります）\n氷結・火炎中のコマには付きません`, disabled: checkSkillDisable(seatCosts.onClickWindborne) || sowCandidates(currentBoard, currentTurnPlayer).length === 0 },
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
    ];

    return (
        <div className={styles.game}>
            <div className={styles.main}>
                {seatCount === 2 ? playerPanel(0) : <div className={styles.seatList}>{range(0, seatCount).map(playerPanel)}</div>}
                <div className={styles.boardWrap}>
                    <Status winner={winner} nextPlayer={currentTurnPlayer} life={life} magicBonus={lateMagicBonus(currentTurn, seatCount)} />
                    {skillAnnounce && <div className={styles.announce}>{skillAnnounce}</div>}
                    {useIcicle && icicleCell !== null && (
                        <div className={styles.announce}>
                            {posName(icicleCell)}を通る線:{' '}
                            {([['row', '横'], ['col', '縦'], ['diag', '↘'], ['anti', '↗']] as [LineDir, string][]).map(([dir, label]) => (
                                <button key={dir} className={styles.btn} onClick={() => exeIcicle(dir)}>
                                    {label}
                                </button>
                            ))}
                        </div>
                    )}
                    <div className={`${styles.boardArea}${boardEffect && SHAKE_EFFECTS.includes(boardEffect.type) ? ` ${styles.shake}` : ''}`}>
                        <Board
                            size={geo.size}
                            squares={currentBoard}
                            onPlay={onCellClick}
                            destroyCells={highlightedCells}
                            previewCells={previewCells}
                            shieldedCells={shieldedCells(currentBoard, characters)}
                            onCellHover={onCellHover}
                            onCellLeave={onCellLeave}
                        />
                        <BoardEffects effect={boardEffect} burst={boardBurst} size={geo.size} />
                        {hailMarySpin && (
                            <div className={styles.hmOverlay}>
                                <div className={`${styles.hmBand} ${styles[`hm_${hailMarySpin.phase}`]}`}>{hailMarySpin.label}</div>
                            </div>
                        )}
                    </div>
                    <div className={styles.controls}>
                        <button className={styles.btn} onClick={onClickRestart}>
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
                <div className={styles.skillsTitle}>スキル{silenced[turnSeat] && <span className={styles.silenceNote}> サイレンス中: この手番はスキルを使えません</span>}</div>
                <div className={styles.skillGrid}>
                    <SkillButton magic={magic[turnSeat]} tokenUsed={useToken} onClick={onClickCharge} buttonText={`チャージ+${charge}`} paragraph={`ターンを終了し、マジックを+${charge}します`} />
                    <SkillButton magic={magic[turnSeat]} tokenUsed={useToken}
                        onClick={onClickShuffle}
                        buttonText={`シャッフル-${seatCosts.onClickShuffle}`}
                        paragraph='固定でないスキルをシャッフルします'
                        disabled={magic[turnSeat] < seatCosts.onClickShuffle}
                    />
                    <SkillButton magic={magic[turnSeat]} tokenUsed={useToken}
                        onClick={onClickUseLock}
                        hidden={currentCharacter === 'cryomancer'}
                        buttonText={`ロック-${calculateCost(seatCosts.onClickUseLock, false, false, currentTurnPlayer, 'onClickUseLock')}`}
                        paragraph={`選択したマスを${gearLockBind(turnGears)}ターン以上ロックします`}
                        disabled={checkSkillDisable(seatCosts.onClickUseLock)}
                    />
                    <SkillButton magic={magic[turnSeat]} tokenUsed={useToken}
                        onClick={onClickCryoFreeze}
                        buttonText={`氷結-${calculateCost(seatCosts.onClickCryoFreeze, false, false, currentTurnPlayer, 'onClickCryoFreeze')}`}
                        paragraph={'マスを1つ選び、❄氷結を付与します（空きマスも可）\n氷結中の空きマスには誰も着手できません。氷結したコマはターン進行でライフが減らず、スキルのダメージを❄1つで肩代わりしますが、自分も重ねて強化できません'}
                        hidden={currentCharacter !== 'cryomancer'}
                        disabled={checkSkillDisable(seatCosts.onClickCryoFreeze)}
                    />
                    <SkillButton magic={magic[turnSeat]} tokenUsed={useToken}
                        onClick={onClickTotalAssault}
                        buttonText={`全軍突撃-${totalAssaultCost}`}
                        paragraph={
                            '3ターンの間、ターン終了時にランダムにトークンを設置します コストは使用したトークンの回数×2軽減されます(使用後はカウントがリセットされます)'
                        }
                        hidden={currentCharacter !== 'tactician'}
                        exclusive
                        disabled={magic[turnSeat] < totalAssaultCost}
                    />
                    <SkillButton magic={magic[turnSeat]} tokenUsed={useToken}
                        onClick={onClickStomp}
                        buttonText={`ストンプ-${gearCost(seatCosts.onClickStomp, turnSeat, false, 'onClickStomp')}`}
                        paragraph={'クリックしたセルと周囲1マスを破壊します'}
                        hidden={currentCharacter !== 'giant'}
                        exclusive
                        disabled={checkSkillDisable(seatCosts.onClickStomp)}
                    />
                    <SkillButton magic={magic[turnSeat]} tokenUsed={useToken}
                        onClick={onClickJudgeDay}
                        buttonText={`審判の日-${judgeDayCost}`}
                        paragraph='セルをクリックし、審判を下します コストは使用したスキルの回数軽減されます(使用後はカウントがリセットされます)'
                        hidden={currentCharacter !== 'magician'}
                        exclusive
                        disabled={magic[turnSeat] < judgeDayCost}
                    />
                    <SkillButton magic={magic[turnSeat]} tokenUsed={useToken}
                        onClick={onClickToggleYingYang}
                        buttonText={`陰陽転化-${gearCost(seatCosts.onClickToggleYingYang, turnSeat, false, 'onClickToggleYingYang')}`}
                        paragraph={`陰陽のモードを切り替えます 現在のモード:${yinYangModeName(turnSeat)}`}
                        hidden={currentCharacter !== 'yinYangMaster'}
                        exclusive
                        disabled={checkSkillDisable(seatCosts.onClickToggleYingYang)}
                    />
                    <SkillButton magic={magic[turnSeat]} tokenUsed={useToken}
                        onClick={onClickNecromancy}
                        buttonText={`蘇生-${gearCost(currentNecroCost, turnSeat, false, 'onClickNecromancy')}${currentNecroRemain > 0 ? `(発動中:残${currentNecroRemain})` : ''}`}
                        paragraph={`発動時に墓地の死体数だけ(最大${necromancySummonCap})ライフ${necromancyReviveLife}のコマを召喚し、${necromancyDuration}ターンの間ライフ0の敵コマを自動吸収します 墓地は盤上でコマが奪われる/消えるたびに貯まり、コスト軽減と召喚数になります(使用後リセット)`}
                        hidden={currentCharacter !== 'necromancer'}
                        exclusive
                        disabled={checkSkillDisable(currentNecroCost)}
                    />
                    <SkillButton magic={magic[turnSeat]} tokenUsed={useToken}
                        onClick={onClickMiasma}
                        buttonText={`ミアズマ-${miasmaCost()}`}
                        paragraph={'自陣の毒が乗っているマスの周囲1マスの敵コマに毒を付与します（毒マスが重なると積み上がります） 自陣の毒はすべて消えます コストは自陣の毒の数だけ軽減されます'}
                        hidden={currentCharacter !== 'poisoner'}
                        exclusive
                        disabled={magic[turnSeat] < miasmaCost() || miasmaPlan(currentBoard, currentTurnPlayer).size === 0}
                    />
                    <SkillButton magic={magic[turnSeat]} tokenUsed={useToken}
                        onClick={onClickChargeSpread}
                        buttonText={`帯電拡散-${chargeSpreadCost()}`}
                        paragraph={'コマを選択し、そこからコマのあるマスだけを縦横に辿って届くすべてのコマ(敵味方問わず)に⚡を1つ付与します コストは盤面の⚡の数だけ軽減されます'}
                        hidden={currentCharacter !== 'electrician'}
                        exclusive
                        disabled={magic[turnSeat] < chargeSpreadCost()}
                    />
                    <SkillButton magic={magic[turnSeat]} tokenUsed={useToken}
                        onClick={onClickGlacier}
                        buttonText={`絶対零度-${glacierCost()}`}
                        paragraph={`全てのマス（空きマス含む。🔑ロック中を除く）に❄を1つ足します\n次の自分の手番開始時に、他のプレイヤーの氷結マスへ❄1つにつき3ダメージを与えて氷結を解除し、ライフが0になったマスを破壊します\nコストは盤面の氷結マスの数だけ軽減されます（下限1）${glacierPending[turnSeat] ? '\n発動待ちです' : ''}`}
                        hidden={currentCharacter !== 'cryomancer'}
                        exclusive
                        disabled={magic[turnSeat] < glacierCost() || glacierPending[turnSeat]}
                    />
                    <SkillButton magic={magic[turnSeat]} tokenUsed={useToken}
                        onClick={onClickInferno}
                        buttonText={`業火-${infernoCost()}`}
                        paragraph={'敵のコマ全て(🔑ロック中・⚡無敵を除く)に🔥火炎を2つずつ付与します\n氷結中のマスは🔥の代わりに❄が全て解除されます。🔥が付いたマスの縦横隣の氷結は即座に解けます\n1手番に異なるスキルを3種類以上使うと、次の業火がコスト0になります（手番を跨いで持ち越し。同じスキルの連打は1種類と数えます。撃つとリセット）'}
                        hidden={currentCharacter !== 'pyromancer'}
                        exclusive
                        disabled={magic[turnSeat] < infernoCost() || infernoTargets(currentBoard, currentTurnPlayer, characters).length === 0}
                    />
                    <SkillButton magic={magic[turnSeat]} tokenUsed={useToken}
                        onClick={onClickYingYangSkll}
                        buttonText={`${currentYinYangMode === 'yang' ? '豊穣の舞' : '凶荒の舞'}-${gearCost(seatCosts.onClickYingYangSkill, turnSeat, false, 'onClickYingYangSkill')}`}
                        paragraph={`${
                            currentYinYangMode === 'yang'
                                ? '自身の全てのコマのライフを+2します'
                                : '相手のすべてのコマのライフを-2します 0になったコマは破壊します'
                        }`}
                        hidden={currentCharacter !== 'yinYangMaster'}
                        exclusive
                        disabled={checkSkillDisable(seatCosts.onClickYingYangSkill)}
                        onHoverStart={currentYinYangMode === 'ying' ? () => showPreview(kyokoPreview()) : undefined}
                        onHoverEnd={currentYinYangMode === 'ying' ? clearPreview : undefined}
                    />
                    {shuffleSkillDefs.map((s) => (
                        <SkillButton magic={magic[turnSeat]} tokenUsed={useToken}
                            key={s.idx}
                            onClick={s.onClick}
                            buttonText={s.buttonText}
                            paragraph={s.paragraph}
                            disabled={s.disabled}
                            hidden={!skills.includes(s.idx) || (s.idx === 30 && currentCharacter === 'cryomancer')}
                            locked={currentLockedSkills.includes(s.idx)}
                            onToggleLock={() => toggleLock(s.idx)}
                            onHoverStart={s.onHoverStart}
                            onHoverEnd={s.onHoverEnd}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
};
