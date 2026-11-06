// Game.tsx から切り出したスキルのハンドラ群: 帯電・氷結・火炎・ひこばえ・クローン・落ち葉などの属性スキル
// 本体は Game.tsx の同じ位置にあったものをそのまま移した。Game の変数は scope(g) で、あとで定義されるもの(calculateCost など)は late() 経由で受け取る
import React from 'react';
import { CharacterId } from '../../types/Character';
import { Player, seatOf } from '../../types/Player';
import { SquareInfo } from '../../types/SquareInfo';
import { randomAnyPick, randomPick } from '../../util';
import { TokenAfterResult } from './tokenAfter';
import { TokenKind, PutContext, pickEmptyCells, PlacedToken } from './tokenPlace';
import { SkillEffectType, BurstType } from './BoardEffects';
import { baseCostOf, skillOf } from './deck';
import { boostAll, cloneTargets, cloneInto, plunderTargets, plunder } from './generic';
import { isGuarded } from './charge';
import { canUseDiscountSkill, lifeDeltaOf, DISCOUNT_SKILLS, DiscountKey, Discount } from './discount';
import { tinderTargets, BURNOUT_FREE_FLAMES, burnout, burnoutCostOf, burnoutTargets, totalFlames, activeBuds, suckerGraft, harvestBuds, swidden, budStacks, budReceivers, sowCandidates, sow, SOW_COUNT, freeze, reducedGlacierCost, bonfire, mulchCandidates, mulch, autumn, leafDrop, leafAllTargets } from './thermal';
import { SkillCosts } from './skillCosts';
import { TokenEffect } from './gear';
import { BoardGeometry } from './boardGeometry';
import { PendingMode } from './pendingMode';
import { PlayEffectExtra } from './usePresentation';
import { GameLate } from './gameLate';

export interface ElementSkillsScope {
    pendingFlag: (m: PendingMode) => [boolean, (on: boolean) => void];
    addLog: (message: string) => void;
    spendMagic: (cost: number, bumpCount?: boolean, isSkill?: boolean, skillId?: string) => void;
    seatCosts: { onClickToken: number; onClickTotalAssault: number; onClickToggleYingYang: number; onClickShikigamiPlace: number; onClickShikigamiBlast: number; onClickShikigamiAll: number; onClickShikigamiRandom: number; onClickShikigamiFlood: number; onClickShikigamiBless: number; onClickShikigamiPurge: number; onClickShikigamiCurse: number; onClickShikigamiDiscount: number; onClickStomp: number; onClickJudgeDay: number; onClickCharge: number; onClickAddLife: number; onClickDepressionCherry: number; onClickShuffle: number; onClickBibine: number; onClickUseLock: number; onClickDoubleLock: number; onClickTripleLock: number; onClickBuds: number; onClickDoubleBuds: number; onClickBudsToken: number; onClickBothToken: number; onClickDoubleToken: number; onClickSlash: number; onClickBackSlash: number; onClickTsunami: number; onClickOpium: number; onClickWalpurgisNight: number; onClickMiasma: number; onClickInjection: number; onClickPoisonToken: number; onClickSerum: number; onClickIntensify: number; onClickPandemic: number; onClickProliferate: number; onClickChargeToken: number; onClickChargeOne: number; onClickChargeSpread: number; onClickDoubleChargeToken: number; onClickChargeArea: number; onClickChargeRandom: number; onClickJammer: number; onClickHailMary: number; onClickSilence: number; onClickPoisonMist: number; onClickFreeze: number; onClickIgnite: number; onClickGlacier: number; onClickCryoFreeze: number; onClickCleanse: number; onClickInferno: number; onClickMogaribue: number; onClickSeal: number; onClickHarvestEve: number; onClickSolstice: number; onClickSucker: number; onClickWindborne: number; onClickFlameToken: number; onClickDoubleFlameToken: number; onClickSwidden: number; onClickSacrifice: number; onClickFrostArea: number; onClickIcicle: number; onClickRandomFreeze: number; onClickFreezeSpread: number; onClickFrostToken: number; onClickDoubleFrostToken: number; onClickShatter: number; onClickFrostfall: number; onClickBoost: number; onClickClone: number; onClickPlunder: number; onClickMarkdown: number; onClickEffectDiscount: number; onClickTokenDiscount: number; onClickVitalMarkdown: number; onClickUniqueDiscount: number; onClickClearance: number; onClickRandomCast: number; onClickCounterMarkdown: number; onClickBurnout: number; onClickLeafToken: number; onClickTwinLeafToken: number; onClickDoubleLeafToken: number; onClickLeafAll: number; onClickBonfire: number; onClickMulch: number; onClickAutumn: number; onClickLeafFrost: number; onClickSpringWind: number; onClickKimon: number; onClickFireWheel: number; onClickStrip: number; onClickChargeSeason: number; onClickBristle: number; onClickRelease: number; onClickStash: number; onClickThunderFire: number; onClickDarkPot: number; onClickChargeHeal: number; onClickLeafDrop: number; onClickKindling: number; onClickLeafCloak: number; onClickTinder: number; onClickSmallFry: number; onClickFirstFrost: number; onClickGather: number; onClickBurnOff: number; onClickFreeToken: number; onClickSpark: number; onClickNightVeil: number; onClickGraveDiscount: number; onClickPoisonWard: number; onClickGraveOffering: number; onClickPerfectGame: number; onClickHelper: number; onClickSecondCatch: number; onClickBigTree: number; onClickDeadTree: number; onClickSpring: number; onClickFort: number; onClickThundercloud: number; onClickMarket: number; onClickSanctuary: number; onClickPoisonSwamp: number; onClickBoltSilence: number; onClickDemolish: number; onClickWeather: number; onClickLevelAll: number; onClickReinforce: number; onClickExpandAll: number; onClickDuplicate: number; onClickWorkshop: number; onClickBarrierStone: number; onClickAmuletShrine: number; onClickLuckyCat: number; onClickMudField: number; onClickTongueKing: number; onClickEightTrigrams: number; onClickSoloSign: number; onClickOneWord: number; onClickBlindMonkey: number; onClickLockRaid: number; onClickLockExtend: number; onClickLockBlessing: number; onClickVacantSeal: number; };
    currentTurnPlayer: "💙" | "⭕" | "🟩" | "🔶" | "⭐" | "🟣" | "🟫" | "🩷";
    currentBoard: SquareInfo[];
    characters: CharacterId[];
    gearTurn: React.MutableRefObject<{ skills: number[]; echoReady: boolean[]; echoNext: boolean[]; kinds: Set<string>[]; infernoReady: boolean[]; discount: Discount[]; freeCast: boolean; oppSkilled: boolean[]; oppSkillPrev: boolean[]; shikiPlaced: boolean[]; plantPrev: boolean[]; plantBase: number[]; placedPrev: boolean[]; placeBase: number[]; fireBase: number[]; leafBase: number[]; darkPotUsed: boolean[]; tokenFree: boolean[]; pieceBase: number[]; turnSpent: number[]; oppBigSeen: boolean[]; oppBigPrev: boolean[]; marketUsed: number[]; bigCast: boolean[]; veil: boolean[]; veilNext: boolean[]; ward: number[]; wardFresh: boolean[]; lockSeen: boolean[]; lockPrev: boolean[]; blessing: number[]; blessingFresh: boolean[]; chargeBase: number[]; processedTurn: number; }>;
    turnSeat: number;
    costTableFor: (seat: number) => SkillCosts;
    glacierCharge: number[];
    glacierPending: boolean[];
    setGlacierChargeAt: (seat: number, value: number | ((prev: number) => number)) => void;
    flashCells: (indexes: number[]) => void;
    playEffect: (type: SkillEffectType, index?: number | undefined, indexes?: number[] | undefined, label?: string | undefined, extra?: PlayEffectExtra | undefined) => void;
    setCurrentBoard: React.Dispatch<React.SetStateAction<SquareInfo[]>>;
    setGlacierPendingAt: (seat: number, value: boolean | ((prev: boolean) => boolean)) => void;
    budGuard: boolean[];
    setMagicAt: (seat: number, value: number | ((prev: number) => number)) => void;
    setBudGuardAt: (seat: number, value: boolean | ((prev: boolean) => boolean)) => void;
    geo: BoardGeometry;
    posName: (i: number) => string;
    putTokens: (board: SquareInfo[], kind: TokenKind, n: number, extra?: Partial<PutContext>, afterPut?: ((board: SquareInfo[], idx: number) => void) | undefined) => { report: () => void; placed: PlacedToken[]; granted: number; };
    playBurst: (type: BurstType, cells: number[]) => void;
    setUseToken: React.Dispatch<React.SetStateAction<boolean>>;
    deckBySeat: number[][];
    harvestMagic: (n: number) => void;
    putTokensAt: (board: SquareInfo[], kind: TokenKind, cells: number[], extra?: Partial<PutContext>, afterPut?: ((board: SquareInfo[], idx: number) => void) | undefined) => { report: () => void; placed: PlacedToken[]; granted: number; };
    reportAfter: (idx: number, effect: TokenEffect | undefined, r: TokenAfterResult | null) => void;
    addCorpses: (n: number) => void;
    life: number;
    magic: number[];
    setLife: React.Dispatch<React.SetStateAction<number>>;
}
export const useElementSkills = (g: ElementSkillsScope, late: () => GameLate) => {
    const { pendingFlag, addLog, spendMagic, seatCosts, currentTurnPlayer, currentBoard, characters, gearTurn, turnSeat, costTableFor, glacierCharge, glacierPending, setGlacierChargeAt, flashCells, playEffect, setCurrentBoard, setGlacierPendingAt, budGuard, setMagicAt, setBudGuardAt, geo, posName, putTokens, playBurst, setUseToken, deckBySeat, harvestMagic, putTokensAt, reportAfter, addCorpses, life, magic, setLife } = g;



    // --- 氷結・火炎（thermal.ts。氷室の番人・煉獄の鍛冶師） ---
    const [useFreeze, setUseFreeze] = pendingFlag('freeze');
    const [useIgnite, setUseIgnite] = pendingFlag('ignite');
    const [useTinder, setUseTinder] = pendingFlag('tinder');
    // 氷結: 選んだコマに❄を付与する（敵味方どちらでも。付与しただけではダメージは出ない）
    const onClickFreeze = () => {
        addLog('「氷結」を使用（コマを選択）');
        setUseFreeze(true);
        spendMagic(late().calculateCost(seatCosts.onClickFreeze, false, false, currentTurnPlayer, 'onClickFreeze'), true, true, 'onClickFreeze');
    };
    // 火口: 🌱か🍂のある敵コマを1つ選んで🔥を1つ付与する（対象が無ければ使えない）
    const tinderCandidates = (): number[] => tinderTargets(currentBoard, currentTurnPlayer, (sq) => isGuarded(sq, characters));
    const onClickTinder = () => {
        if (tinderCandidates().length === 0) return;
        addLog('「火口」を使用（🌱・🍂・❄のある敵コマを選択）');
        setUseTinder(true);
        spendMagic(late().calculateCost(seatCosts.onClickTinder, false, false, currentTurnPlayer, 'onClickTinder'), true, true, 'onClickTinder');
        gearTurn.current.plantPrev[turnSeat] = false; // 無料で撃てるのは1手番に1回まで
    };
    // 火遁（旧・火炎付与）: 選んだコマに🔥を1つ付与する。そのマスと縦横隣の氷結は即座に解ける
    const onClickIgnite = () => {
        addLog('「火遁」を使用（コマを選択）');
        setUseIgnite(true);
        spendMagic(late().calculateCost(seatCosts.onClickIgnite, false, false, currentTurnPlayer, 'onClickIgnite'), true, true, 'onClickIgnite');
    };
    // 固有スキル 絶対零度（氷室の番人）: 全マス（空きマス含む。🔑は除く）に❄を足す。クリック不要・手番は続く。
    // 次の自分の手番開始時に、他の席の氷結マスへ❄1スタックにつき3ダメージを与えて氷結を解除し、ライフ0のマスは破壊する
    const glacierCost = (player: Player = currentTurnPlayer): number =>
        reducedGlacierCost(costTableFor(seatOf(player)).onClickGlacier, glacierCharge[seatOf(player)], (c) => late().calculateCost(c, false, false, player, 'onClickGlacier'));
    const onClickGlacier = () => {
        if (glacierPending[turnSeat]) return;
        const cost = glacierCost();
        const board = currentBoard.slice();
        setGlacierChargeAt(turnSeat, 0); // 撃ったらリセット（この❄は数えない）
        const done = freeze(
            board,
            late().notShielded(board.map((_, k) => k))
        );
        addLog(`「絶対零度」を使用（${done.length}マスが氷結。次の手番開始時に発動）`);
        flashCells(done);
        playEffect('glacier');
        setCurrentBoard(board);
        setGlacierPendingAt(turnSeat, true);
        spendMagic(cost, false, true, 'onClickGlacier');
    };
    // --- バッズ系の汎用スキル（idx 33-36） ---
    const [useSucker, setUseSucker] = pendingFlag('sucker');
    // 刈り入れ前夜: 自陣の🌱を全部刈り取り、その数だけ魔力を得る（クリック不要・手番は続く）
    const ownBudTotal = (): number => currentBoard.reduce((n, sq) => (sq.player === currentTurnPlayer ? n + activeBuds(sq, budGuard[turnSeat]) : n), 0);
    const onClickHarvestEve = () => {
        const board = currentBoard.slice();
        const n = harvestBuds(board, currentTurnPlayer, budGuard[turnSeat]);
        if (n === 0) return;
        addLog(`「刈り入れ前夜」を使用（🌱${n}個を刈り取り、魔力+${n}）`);
        playEffect('harvestEve');
        setCurrentBoard(board);
        spendMagic(late().calculateCost(seatCosts.onClickHarvestEve, false, false, currentTurnPlayer, 'onClickHarvestEve'), true, true, 'onClickHarvestEve');
        setMagicAt(turnSeat, (m) => m + n);
    };
    // 冬至の種子: 次の自分の手番開始時まで、自陣の🌱が火炎で消えず、氷結中のマスでも休眠しない
    const onClickSolstice = () => {
        if (budGuard[turnSeat]) return;
        addLog('「冬至の種子」を使用（次の自分の手番まで、🌱は火炎で消えず、氷結中も働く）');
        playEffect('solstice');
        setBudGuardAt(turnSeat, true);
        spendMagic(late().calculateCost(seatCosts.onClickSolstice, false, false, currentTurnPlayer, 'onClickSolstice'), true, true, 'onClickSolstice');
    };
    // ひこばえ: 🌱を持つ自陣のコマを選ぶと、縦横隣の自陣のコマ全てに🌱が1つずつ付く
    const suckerSources = (): number[] =>
        currentBoard
            .map((sq, i) => (sq.player === currentTurnPlayer && budStacks(sq) > 0 && budReceivers(currentBoard, i, currentTurnPlayer, geo.size).length > 0 ? i : -1))
            .filter((i) => i !== -1);
    const onClickSucker = () => {
        addLog('「ひこばえ」を使用（🌱を持つ自陣のコマを選択）');
        setUseSucker(true);
        spendMagic(late().calculateCost(seatCosts.onClickSucker, false, false, currentTurnPlayer, 'onClickSucker'), true, true, 'onClickSucker');
    };
    const exeSucker = (i: number) => {
        if (!suckerSources().includes(i)) return; // 🌱を持たない・隣に受け手がいないマスは選び直せる
        const board = currentBoard.slice();
        // 受け手が3つ以上なら、ランダムに2つだけに付く
        const done = suckerGraft(board, i, currentTurnPlayer, geo.size, (receivers, n) => randomAnyPick([...receivers], n));
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
        spendMagic(late().calculateCost(seatCosts.onClickWindborne, false, false, currentTurnPlayer, 'onClickWindborne'), true, true, 'onClickWindborne');
    };

    // --- 火炎系の汎用スキル（idx 37-39）。氷結への対抗手段 ---
    // 火炎トークン: 🔥付きの自陣コマをランダムな空きマスに置く（置いたマスの縦横隣の氷結は全解除）
    const onClickFlameToken = () => {
        const board = currentBoard.slice();
        const t = putTokens(board, 'flame', 1);
        if (t.placed.length > 0) {
            const index = t.placed[0].idx;
            const thawed = t.placed[0].thawed;
            addLog(`「火炎トークン」を使用（${posName(index)}に設置）`);
            if (thawed.length > 0) addLog(`氷結が溶けた（${thawed.map(posName).join('・')}）`);
            playEffect('flame', index, undefined, '火炎トークン');
            playBurst('thaw', thawed);
            t.report();
            setCurrentBoard(board);
        }
        spendMagic(late().calculateCost(seatCosts.onClickFlameToken, true, false, currentTurnPlayer, 'onClickFlameToken'), true, true, 'onClickFlameToken');
        setUseToken(true);
    };
    const onClickDoubleFlameToken = () => {
        const board = currentBoard.slice();
        const t = putTokens(board, 'flame', 2);
        const picks = t.placed.map((x) => x.idx);
        const thawed = new Set<number>();
        t.placed.forEach((x) => x.thawed.forEach((k) => thawed.add(k)));
        addLog(`「火炎ダブルトークン」を使用（${picks.map(posName).join('・')}に設置）`);
        if (thawed.size > 0) addLog(`氷結が溶けた（${Array.from(thawed).map(posName).join('・')}）`);
        if (picks.length > 0) playEffect('flame', picks[0], undefined, '火炎ダブルトークン');
        playBurst('thaw', Array.from(thawed));
        t.report();
        setCurrentBoard(board);
        spendMagic(late().calculateCost(seatCosts.onClickDoubleFlameToken, true, false, currentTurnPlayer, 'onClickDoubleFlameToken'), true, true, 'onClickDoubleFlameToken');
        setUseToken(true);
    };
    // 焼畑: 🌱を持つマス（敵味方どちらでも）を選ぶと、その🌱を全て同じ数の🔥に変える
    const [useSwidden, setUseSwidden] = pendingFlag('swidden');
    const onClickSwidden = () => {
        addLog('「焼畑」を使用（🌱のあるマスを選択）');
        setUseSwidden(true);
        spendMagic(late().calculateCost(seatCosts.onClickSwidden, false, false, currentTurnPlayer, 'onClickSwidden'), true, true, 'onClickSwidden');
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
    const [useClone, setUseClone] = pendingFlag('clone');
    const [usePlunder, setUsePlunder] = pendingFlag('plunder');
    // 慈雨: 自陣の全コマのライフ+1（クリック不要・手番は続く）
    // 福引き(idx 59): 自分のデッキから、基礎コスト3以下で今撃てるスキルをランダムに1つ、コストを払わず発動する（手札に出ていないスキルも対象）
    const lotteryPool = () =>
        deckBySeat[turnSeat]
            .filter((i) => i !== 59 && baseCostOf(i) <= 3)
            .map((i) => late().shuffleSkillDefs.find((d) => d.idx === i))
            .filter((d): d is NonNullable<typeof d> => !!d && !d.disabled);
    const onClickRandomCast = () => {
        const pool = lotteryPool();
        if (pool.length === 0) {
            addLog('「福引き」: 今撃てるスキルがデッキにありません');
            return;
        }
        const picked = randomPick(pool);
        addLog(`「福引き」を使用 → ${skillOf(picked.idx)?.name}が発動`);
        spendMagic(late().calculateCost(seatCosts.onClickRandomCast, false, false, currentTurnPlayer, 'onClickRandomCast'), true, true, 'onClickRandomCast');
        gearTurn.current.freeCast = true;
        picked.onClick();
    };
    // --- 🍂落ち葉系の汎用スキル(idx 62-68) ---
    // 自陣の🍂は、相手全員のスキルコストを🍂の枚数ぶん上げる（氷結中は休眠・🔥が付くと消える）。🍂付きトークンはトークンのエフェクトを持たない扱い（収穫/伝播ギアとは連動しない）
    type LeafTokenKey = 'onClickLeafToken' | 'onClickTwinLeafToken' | 'onClickDoubleLeafToken';
    const finishLeafToken = (key: LeafTokenKey, label: string, cells: number[], granted: number) => {
        harvestMagic(granted);
        playEffect('token', undefined, cells, label);
        spendMagic(late().calculateCost(seatCosts[key], true, false, currentTurnPlayer, key), true, true, key);
        setUseToken(true);
    };
    const placeLeafTokens = (key: LeafTokenKey, label: string, count: number, leaves: number) => {
        const board = currentBoard.slice();
        // 1個でも randomAnyPick で選ぶ（従来どおり）
        const t = putTokensAt(board, 'leaf', pickEmptyCells(board, count, (cells, n) => randomAnyPick(cells, n)), { leaves });
        const picks = t.placed.map((x) => x.idx);
        const granted = t.granted;
        t.placed.forEach((x) => reportAfter(x.idx, x.effect, x.after));
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
        spendMagic(late().calculateCost(seatCosts.onClickLeafAll, false, false, currentTurnPlayer, 'onClickLeafAll'), true, true, 'onClickLeafAll');
    };
    // 焚き火の唄: 敵陣の🍂を全て除去する（🔑ロック・❄氷結のマスは対象外）
    const onClickBonfire = () => {
        const board = currentBoard.slice();
        const { n, cells } = bonfire(board, currentTurnPlayer);
        addLog(`「焚き火の唄」を使用（敵陣の🍂${n}枚を除去）`);
        playEffect('autumn', undefined, cells, '焚き火の唄');
        setCurrentBoard(board);
        spendMagic(late().calculateCost(seatCosts.onClickBonfire, false, false, currentTurnPlayer, 'onClickBonfire'), true, true, 'onClickBonfire');
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
        spendMagic(late().calculateCost(seatCosts.onClickMulch, false, false, currentTurnPlayer, 'onClickMulch'), true, true, 'onClickMulch');
    };
    // 一葉知秋: 盤面の🌱をすべて🍂に変える（敵味方問わず。🔥が付いたマスは変えない）
    const onClickAutumn = () => {
        const board = currentBoard.slice();
        const { n, cells } = autumn(board);
        addLog(`「一葉知秋」を使用（盤面の🌱${n}枚を🍂に）`);
        playEffect('autumn', undefined, cells, '一葉知秋');
        setCurrentBoard(board);
        spendMagic(late().calculateCost(seatCosts.onClickAutumn, false, false, currentTurnPlayer, 'onClickAutumn'), true, true, 'onClickAutumn');
    };
    // バーンアウト(idx 61): 🔥が乗っているマスを全て破壊する（クリック不要・手番は続く）。盤面に🔥が4つ以上あればコスト0
    const burnoutCost = (): number =>
        burnoutCostOf(seatCosts.onClickBurnout, totalFlames(currentBoard), (c) => late().calculateCost(c, false, false, currentTurnPlayer, 'onClickBurnout'));
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
        canUseDiscountSkill(gearTurn.current.discount[turnSeat], key, life) && magic[turnSeat] >= late().calculateCost(seatCosts[key], false, false, currentTurnPlayer, key);
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
        spendMagic(late().calculateCost(seatCosts[key], false, false, currentTurnPlayer, key), true, true, key);
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
        spendMagic(late().calculateCost(seatCosts.onClickBoost, false, false, currentTurnPlayer, 'onClickBoost'), true, true, 'onClickBoost');
    };
    // 写し身: 自陣のコマを選ぶと、縦横隣のランダムな空きマスにライフ半分の写しが現れる
    const cloneSources = (): number[] =>
        currentBoard.map((sq, i) => (sq.player === currentTurnPlayer && cloneTargets(currentBoard, i, geo.size).length > 0 ? i : -1)).filter((i) => i !== -1);
    const onClickClone = () => {
        addLog('「写し身」を使用（自陣のコマを選択）');
        setUseClone(true);
        spendMagic(late().calculateCost(seatCosts.onClickClone, false, false, currentTurnPlayer, 'onClickClone'), true, true, 'onClickClone');
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
        spendMagic(late().calculateCost(seatCosts.onClickPlunder, false, false, currentTurnPlayer, 'onClickPlunder'), true, true, 'onClickPlunder');
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

    return { onClickPlunder, onClickGlacier, onClickHarvestEve, onClickSolstice, onClickSucker, onClickWindborne, onClickFlameToken, onClickDoubleFlameToken, onClickSwidden, onClickBoost, onClickIgnite, onClickTinder, onClickRandomCast, onClickBurnout, onClickLeafToken, onClickTwinLeafToken, onClickDoubleLeafToken, onClickLeafAll, onClickBonfire, onClickMulch, onClickAutumn, onClickDiscount, setUseFreeze, setUseSucker, setUseIgnite, setUseSwidden, useFreeze, useSucker, exeSucker, useSwidden, exeSwidden, useClone, exeClone, usePlunder, exePlunder, useTinder, tinderCandidates, useIgnite, setUseTinder, discountLabel, glacierCost, cloneSources, suckerSources, onClickFreeze, ownBudTotal, onClickClone, canUseDiscount, burnoutCost, leafAllCandidates };
};

export type ElementSkillsResult = ReturnType<typeof useElementSkills>;
