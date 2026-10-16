import React, { useState, useEffect, Dispatch, SetStateAction } from 'react';
import { CharacterId, YingYangMode } from '../../types/Character';
import { Effect } from '../../types/Effect';
import { Player, PLAYER_SYMBOLS, seatOf } from '../../types/Player';
import { SquareInfo } from '../../types/SquareInfo';
import { randomAnyPick, range, calculateWinner, findEmptyIndexes, randomPick, calculateLife } from '../../util';
import AIPlayer, { TURN_ENDING_SKILLS, SKILL_POOL_SIZE } from './AIPlayer';
import { Board } from './Board';
import { BoardEffects, SkillEffect, SkillEffectType } from './BoardEffects';
import { SkillButton } from './SkillButton';
import { boardSizeFor, clampBoardSize, geometryOf } from './boardGeometry';
import { shouldDecay } from './decay';
import { lateMagicBonus } from './lateMagic';
import { isShielded, isGuarded, shieldedCells, fireCharges, connectedPieces, withCharge, boardChargeCount, reducedChargeCost, randomChargeCandidates, canJam, jammerTargets, applyJammer, isFullyCharged, applyOverload } from './charge';
import { skillCosts, MIASMA_MIN_COST, POISON_LIFE_MULT } from './skillCosts';
import { Status } from './Status';
import styles from './Game.module.css';

// 盤面を揺らすスキル演出
const SHAKE_EFFECTS: SkillEffectType[] = ['stomp', 'judge', 'assault', 'tsunami', 'slash', 'backslash', 'overload'];

export type PlayerConfig = {
    character: CharacterId;
    isAI: boolean;
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

    const [restartCount, setRestartCount] = useState<number>(0);
    // 連戦時の勝利数 (Restartしてもリセットしない)
    const [wins, setWinsAt] = useSeatArray<number>(() => Array(seatCount).fill(0));
    // 実際に破壊されたマスを濃い目の黄色で点滅させるためのインデックス
    const [highlightedCells, setHighlightedCells] = useState<number[]>([]);
    // ホバー時に破壊範囲をレモン色でプレビューするためのインデックス
    const [previewCells, setPreviewCells] = useState<number[]>([]);
    // スキル発動時の盤面エフェクト
    const [boardEffect, setBoardEffect] = useState<SkillEffect | null>(null);
    const playEffect = (type: SkillEffectType, index?: number) => {
        setBoardEffect((prev) => ({ type, index, nonce: (prev?.nonce ?? 0) + 1 }));
        setTimeout(() => setBoardEffect(null), 1400);
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
        p.isAI ? new AIPlayer(symbols[seat], p.character, symbols.filter((_, i) => i !== seat), characters) : null
    );
    const currentAI = aiBySeat[turnSeat];
    // 全員AIのときだけステップ実行UIを出す
    const isAllAI = aiBySeat.every((ai) => ai !== null);
    // AIの実行キュー。number=そのマスをクリック / string=そのスキルを実行（帯電系は「スキル→クリック」を順に並べる）
    const [pendingAIMove, setPendingAIMove] = useState<(number | string)[] | null>(null);
    // AI同士の対戦時のステップ実行制御 (autoPlay=false なら「次の手番」ボタンで1ターンずつ進める)
    const [autoPlay, setAutoPlay] = useState<boolean>(false);
    const [stepRequest, setStepRequest] = useState<number>(0);

    const executeSkillForAI = (skill: string) => {
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
            case 'onClickUseLock': onClickUseLock(); break;
            case 'onClickUseDoubleLock': onClickUseDoubleLock(); break;
            case 'onClickUseTripleLock': onClickUseTripleLock(); break;
            case 'onClickStomp': onClickStomp(); break;
            case 'onClickJudgeDay': onClickJudgeDay(); break;
            case 'onClickProliferate': onClickProliferate(); break;
            case 'onClickSerum': onClickSerum(); break;
            case 'onClickInjection': onClickInjection(); break;
            case 'onClickChargeToken': onClickChargeToken(); break;
            case 'onClickChargeOne': onClickChargeOne(); break;
            case 'onClickChargeSpread': onClickChargeSpread(); break;
            case 'onClickDoubleChargeToken': onClickDoubleChargeToken(); break;
            case 'onClickChargeArea': onClickChargeArea(); break;
            case 'onClickChargeRandom': onClickChargeRandom(); break;
            case 'onClickJammer': onClickJammer(); break;
        }
    };

    useEffect(() => {
        if (pendingAIMove !== null && pendingAIMove.length > 0) {
            const timer = setTimeout(() => {
                const [next, ...rest] = pendingAIMove;
                if (typeof next === 'string') executeSkillForAI(next);
                else onCellClick(next);
                setPendingAIMove(rest.length > 0 ? rest : null);
            }, 200);
            return () => clearTimeout(timer);
        }
    }, [pendingAIMove]);

    const runAIMove = () => {
        const ai = currentAI!;
        const currentMagic = magic[turnSeat];
        // 敵が複数いるときは最も魔力の多い相手を基準にする（2人戦なら従来どおり相手の魔力）
        const oppMagic = Math.max(...otherSeats(turnSeat).map((i) => magic[i]));
        const currentSkills = skills;

        const aiNecroRemain = remainNecro[turnSeat];
        const aiNecroCost = necroCost[turnSeat];
        const aiProliferate = proliferate[turnSeat];
        const result = ai.makeMove(currentBoard, currentMagic, skillCosts, oppMagic, life, currentSkills, useToken, aiNecroRemain, aiNecroCost, judgeDayCost, totalAssaultCost, aiProliferate);

        // AIが盤面・キャラに応じてスキルをロック（次のシャッフルで固定する）[要検証]
        const aiLocks = ai.chooseLocks(currentBoard, oppMagic, life, currentSkills);
        setLockedSkillsAt(turnSeat, aiLocks);

        // 雷霆の巫: 帯電拡散→帯電付与は「スキル→対象クリック」を順に行う。トークン等の後続スキルも
        // 盤面への反映順を保つため同じキューに積む (sim/ai.js の faithfulMakeMove と同じ順序)
        if (result.chargeClicks && result.chargeClicks.length > 0) {
            const steps: (number | string)[] = [];
            for (const c of result.chargeClicks) steps.push(c.skill, c.target);
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
    const spendMagic = (cost: number, bumpCount: boolean = true) => {
        setMagicAt(turnSeat, (m) => m - cost);
        if (bumpCount) setUseMagicCountAt(turnSeat, (c) => c + 1);
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
    // ロック済みスキルを残しつつ、残り枠を [0,poolEnd) からランダムに埋める
    const reshuffledSkills = (poolEnd: number, locks: number[]): number[] => {
        const keep = locks.slice(0, 3);
        const pool = range(0, poolEnd).filter((i) => !keep.includes(i));
        return [...keep, ...randomAnyPick(pool, Math.max(0, 3 - keep.length))];
    };

    // --- 増殖（ループ召喚） ---
    // 発動後は自分が着手するたびに「コマ→アイテム」を交互に追加し続ける。
    // 追加のたび維持コストが +1 され、手番開始時に払えなくなるとループが途切れる（自己終息）。
    const proliferateTokenLife = 2;
    const proliferateUpkeepStep = 1;
    const proliferateMaxStacks = 8;
    const [proliferate, setProliferateAt, setProliferateAll] = useSeatArray<boolean>(() => Array(seatCount).fill(false));
    const [proliferateCount, setProliferateCountAt, setProliferateCountAll] = useSeatArray<number>(() => Array(seatCount).fill(0));
    const proliferateUpkeep = (count: number): number => count * proliferateUpkeepStep;

    const [yinYangMode, setYinYangModeAt] = useSeatArray<YingYangMode | undefined>(() => Array(seatCount).fill('ying'));
    const currentYinYangMode = yinYangMode[turnSeat];
    const yinYangModeName = (seat: number) => (yinYangMode[seat] === 'yang' ? '陽' : '陰');

    const [life, setLife] = useState<number>(calculateLife(characters[0], yinYangMode[0]));

    useEffect(() => {
        if (currentTurn === 1) {
            return;
        }
        const nextSeat = judgeNextSeat();
        const nextCharacter = characters[nextSeat];
        const nextSymbol = symbols[nextSeat];
        // 巨人はタンク特性(高ライフ)を持つ代わりに毎ターンの魔力ボーナスは無し
        // (life8復元時のストンプ過多をオフェンス側で抑制。検証: giantGap -0.174→+0.002)
        const magicCharacter: CharacterId[] = ['magician'];
        // 50ターンごとに、手番開始時に得られる魔力が全員+1ずつ増える（長引く試合の打ち切り用）
        let nextMagic: number = magic[nextSeat] + 1 + lateMagicBonus(currentTurn, seatCount) + budsCount(nextSymbol);
        if (magicCharacter.includes(nextCharacter)) {
            nextMagic++;
        }

        if (nextCharacter === 'yinYangMaster' && yinYangMode[nextSeat] === 'ying') {
            nextMagic++;
        }

        // 魔法使い: 自陣のバッズ1つにつき魔力回復+3 (標準の+1に追加で+2)。バッズ蓄積→スキル連打のコンセプト
        if (nextCharacter === 'magician') {
            nextMagic += budsCount(nextSymbol) * 2;
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
        const nextLife = calculateLife(nextCharacter, yinYangMode[nextSeat], nextCharacter === 'poisoner' ? poisonCount(nextSymbol) : 0);
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
        setSkills(reshuffledSkills(SKILL_POOL_SIZE, lockedSkills[judgeNextSeat()]));
    }, [history]);

    const onCellClick = (i: number) => {
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
            addLog(`${posName(i)}から帯電拡散（${cells.length}マスに⚡）`);
            flashCells(cells);
            playEffect('zap');
            setUseChargeSpread(false);
            setCurrentBoard(withOverload(withCharge(currentBoard, cells)));
            return;
        }

        if (useLock > 0) {
            nextBoard[i].effects.push({ effect: '🔑' });
            if (nextBoard[i].bind < 6) {
                nextBoard[i].bind = 6;
            }
            addLog(`${posName(i)}をロック`);
            setUseLock(useLock - 1);
            setCurrentBoard(nextBoard);
            return;
        }

        if (useInjection > 0) {
            nextBoard[i] = poisonStrike({ ...nextBoard[i], effects: [...nextBoard[i].effects, { effect: '☠' }] });
            addLog(`${posName(i)}に毒を注入`);
            setUseInjection(useInjection - 1);
            playEffect('poison', i);
            setCurrentBoard(nextBoard);
            return;
        }

        if (useMiasma) {
            exeMiasma(i);
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

        const nextHistory = [...history.slice(0, currentTurn + 1), nextBoard];

        // 毒で bind が 0 になったマス（拡散パッシブの起点）
        const spreadOrigins: number[] = [];
        let poisonVanished = 0;
        // 3人以上は手番が1周するごとに1回だけ減衰させる (issue #30)
        const decayNow = shouldDecay(placements, seatCount);
        setPlacements(placements + 1);
        for (let s = 0; decayNow && s < nextBoard.length; s++) {
            const square = nextBoard[s];
            if ((square.player || square.effects.filter((x) => x.effect === '🔑').length !== 0) && square.bind > 0) square.bind--;
            // 毒: スタック数だけ追加で bind を減らす（毎ターン bind-1 × 毒の数）
            const poison = square.effects.filter((x) => x.effect === '☠').length;
            if (poison > 0 && square.bind > 0) square.bind = Math.max(0, square.bind - poison);
            if (square.bind === 0) {
                square.effects = square.effects.filter((x) => x.effect !== '🔑');
            }
            // 毒持ちのコマでライフが0のマスは消えて拡散の起点になる。
            // 「このターンに0へ落ちた」とは限らない: ライフ0のコマに後から毒を撒いた場合も消す
            if (poison > 0 && square.bind === 0 && square.player && s !== i) {
                spreadOrigins.push(s);
                nextBoard[s] = { player: undefined, bind: 0, effects: [] };
                poisonVanished++;
            }
        }
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
        if (nextBoard[i].player === currentTurnPlayer) {
            newPlayer = nextBoard[i].player;
            newBind = nextBoard[i].bind + life + 1;
            newEffects = nextBoard[i].effects;
        } else if (nextBoard[i].player) {
            const calculatedBind = nextBoard[i].bind - life + (nextBoard[i].bind > 0 ? 1 : 0);
            if (calculatedBind < 0) {
                newPlayer = currentTurnPlayer;
                newBind = calculatedBind * -1;
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
        addLog(`「チャージ」を使用（ターン終了・マジック+${charge}）`);
        setMagicAt(turnSeat, (m) => m + charge);
        setCurrentTurn(currentTurn + 1);
    };

    const onClickAddLife = () => {
        addLog('「ライフ3」を使用（ライフ+3）');
        setLife(life + 3);
        spendMagic(calculateCost(skillCosts.onClickAddLife));
    };

    const onClickShuffle = () => {
        addLog('「シャッフル」を使用');
        // プールは全27スキル。8 だと毒スキル(15-19)・増殖(20)・帯電(21-26)を永久に引けなかった
        setSkills(reshuffledSkills(SKILL_POOL_SIZE, currentLockedSkills));
        spendMagic(skillCosts.onClickShuffle);
    };

    const onClickBibine = () => {
        addLog('「バイバイン」を使用（ライフ2倍）');
        setLife(life * 2);
        spendMagic(calculateCost(skillCosts.onClickBibine));
    };

    // --- 毒（毒使い）関連 ---
    // どちらかが毒使いなら、毒セルが死んだ時の「周囲へ毒拡散」パッシブが有効になる
    const poisonerInPlay = characters.includes('poisoner');
    // 指定プレイヤーの自陣にある毒スタック数
    const poisonCount = (player: Player): number =>
        currentBoard
            .filter((x) => x.player === player)
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
    // 周囲1マスのコマ(敵味方問わず)1つにランダムで毒を1付与する（毒拡散パッシブ）
    const spreadPoisonAround = (board: SquareInfo[], idx: number) => {
        const targets = geo.surroundRange(idx).filter((j) => board[j].player);
        if (targets.length === 0) return;
        const t = randomPick(targets);
        board[t] = poisonStrike({ ...board[t], effects: [...board[t].effects, { effect: '☠' }] });
    };
    const [useMiasma, setUseMiasma] = useState<boolean>(false);
    const [useInjection, setUseInjection] = useState<number>(0);
    const [usePandemic, setUsePandemic] = useState<boolean>(false);
    // ミアズマの実コスト: 基礎 - 盤面の毒数、毒使い割引(-1)、下限は MIASMA_MIN_COST
    const miasmaCost = (player: Player = currentTurnPlayer): number =>
        Math.max(MIASMA_MIN_COST, calculateCost(skillCosts.onClickMiasma - boardPoisonCount(currentBoard), false, true, player));

    const budsReduce = 1;
    const [useBuds, setUseBuds] = useState<[boolean, number]>([false, 0]);
    const budsCount = (player: Player): number => {
        const ownerSquares = currentBoard.filter((x) => x.player === player);
        return ownerSquares
            .map((x) => x.effects)
            .flat()
            .filter((x) => x.effect === '🌱').length;
    };

    const onClickBuds = () => {
        addLog('「バッズ」を使用（次の一手でバッズを植える）');
        setUseBuds([true, useBuds[1] + 1]);
        spendMagic(calculateCost(skillCosts.onClickBuds));
    };

    const onClickDoubleBuds = () => {
        addLog('「ダブルバッズ」を使用（次の一手でバッズを2つ植える）');
        setUseBuds([true, useBuds[1] + 2]);
        spendMagic(calculateCost(skillCosts.onClickDoubleBuds));
    };

    const [useLock, setUseLock] = useState<number>(0);
    const onClickUseLock = () => {
        addLog('「ロック」を使用（マスを選択）');
        setUseLock(useLock + 1);
        spendMagic(calculateCost(skillCosts.onClickUseLock));
    };

    const onClickUseDoubleLock = () => {
        addLog('「ダブルロック」を使用（マスを2つ選択）');
        setUseLock(useLock + 2);
        spendMagic(calculateCost(skillCosts.onClickDoubleLock));
    };

    const onClickUseTripleLock = () => {
        addLog('「トリプルロック」を使用（マスを3つ選択）');
        setUseLock(useLock + 3);
        spendMagic(calculateCost(skillCosts.onClickTripleLock));
    };

    const unlockCost = 4;
    const onClickUnlock = () => {};

    const onClickOpium = () => {
        addLog('「オピウム」を使用（相手の全コマのライフ-2・ターン終了）');
        const board = currentBoard.slice();
        const affected: number[] = [];
        board.forEach((square, idx) => {
            if (square.player !== currentTurnPlayer && square.player && square.bind > 0 && !isGuarded(square, characters)) {
                const calclatedBind = square.bind - 2;
                if (calclatedBind > 1) square.bind = square.bind - 2;
                else square.bind = 0;
                affected.push(idx);
            }
        });
        flashCells(affected);
        playEffect('opium');
        setCurrentBoard(board);
        spendMagic(calculateCost(skillCosts.onClickOpium));
        setCurrentTurn(currentTurn + 1);
    };

    const onClickSlash = () => {
        addLog(`「スラッシュ」を使用（右上→左下の${geo.size}マスのライフを0に）`);
        const board = currentBoard.slice();
        const affected: number[] = [];
        for (const idx of geo.antiDiagonal) {
            if (!isGuarded(board[idx], characters)) {
                board[idx].bind = 0;
                affected.push(idx);
            }
        }
        flashCells(affected);
        playEffect('slash');
        setCurrentBoard(board);
        spendMagic(calculateCost(skillCosts.onClickSlash));
    };

    const onClickBackSlash = () => {
        addLog(`「バックスラッシュ」を使用（左上→右下の${geo.size}マスのライフを0に）`);
        const board = currentBoard.slice();
        const affected: number[] = [];
        for (const idx of geo.mainDiagonal) {
            if (!isGuarded(board[idx], characters)) {
                board[idx].bind = 0;
                affected.push(idx);
            }
        }
        flashCells(affected);
        playEffect('backslash');
        setCurrentBoard(board);
        spendMagic(calculateCost(skillCosts.onClickBackSlash));
    };

    const onClickBothToken = () => {
        const board = currentBoard.slice();
        const emptyIndexes = findEmptyIndexes(board);
        // 参加者全員に1つずつ（席順に空きマスからランダムに）。空きが足りなければ先着の席だけ
        const picks = randomAnyPick(emptyIndexes, Math.min(seatCount, emptyIndexes.length));
        addLog(`「両トークン」を使用（${picks.map((idx, seat) => `${symbols[seat]}: ${posName(idx)}`).join(' / ')}に設置）`);
        picks.forEach((idx, seat) => {
            board[idx] = { player: symbols[seat], bind: seat === turnSeat ? calculateTokenBind() : 4, effects: [] };
        });
        spendMagic(calculateCost(skillCosts.onClickBothToken, true));
        setCurrentBoard(board);
        setUseToken(true);
    };

    const onClickToken = () => {
        const board = currentBoard.slice();
        const emptyIndexes = findEmptyIndexes(board);
        const index = randomPick(emptyIndexes);
        board[index] = { player: currentTurnPlayer, bind: calculateTokenBind(), effects: [] };
        addLog(`「トークン」を使用（${posName(index)}に設置）`);
        setCurrentBoard(board);
        spendMagic(calculateCost(skillCosts.onClickToken, true));
        setUseToken(true);
    };

    const onClickDoubleToken = () => {
        const board = currentBoard.slice();
        const emptyIndexes = findEmptyIndexes(board);
        const [emptyIndex1, emptyIndex2] = randomAnyPick(emptyIndexes, 2);
        board[emptyIndex1] = { player: currentTurnPlayer, bind: calculateTokenBind(), effects: [] };
        board[emptyIndex2] = { player: currentTurnPlayer, bind: calculateTokenBind(), effects: [] };
        addLog(`「ダブルトークン」を使用（${posName(emptyIndex1)}・${posName(emptyIndex2)}に設置）`);
        setCurrentBoard(board);
        spendMagic(calculateCost(skillCosts.onClickDoubleToken, true));
        setUseToken(true);
    };

    const calculateTokenBind = (): number => {
        if (currentCharacter === 'tactician') {
            return 6;
        } else {
            return 4;
        }
    };

    const onClickBudsToken = () => {
        const board = currentBoard.slice();
        const emptyIndexes = findEmptyIndexes(board);
        const index = randomPick(emptyIndexes);
        board[index] = { player: currentTurnPlayer, bind: calculateTokenBind(), effects: [{ effect: '🌱' }] };
        addLog(`「バッズトークン」を使用（${posName(index)}に設置）`);
        setCurrentBoard(board);
        spendMagic(calculateCost(skillCosts.onClickBudsToken, true));
        setUseToken(true);
    };

    const onClickTsunami = () => {
        addLog('「チューチュートレイン」を使用（相手全員のマジックを0に・ターン終了）');
        otherSeats(turnSeat).forEach((seat) => setMagicAt(seat, 0));
        playEffect('tsunami');
        spendMagic(calculateCost(skillCosts.onClickTsunami));
        setCurrentTurn(currentTurn + 1);
    };

    const onClickWalpurgisNight = () => {
        addLog('「ワルプルギスの夜」を使用（全コマにバッズを植える）');
        const board = currentBoard.slice();
        for (const square of board) {
            if (square.player && !square.effects.map((x) => x.effect).includes('🔑')) {
                square.effects.push({ effect: '🌱' });
            }
        }
        setCurrentBoard(board);
        playEffect('auraGreen');
        spendMagic(calculateCost(skillCosts.onClickWalpurgisNight));
    };

    const totalAssaultCost = skillCosts.onClickTotalAssault - useTokenCount[turnSeat] * 2;
    const [useAssault, setUseAssaultAt, setUseAssaultAll] = useSeatArray<number>(() => Array(seatCount).fill(0));
    const onClickTotalAssault = () => {
        addLog('「全軍突撃」を使用（3ターンの間ターン終了時にトークン設置）');
        playEffect('assault');
        setUseAssaultAt(turnSeat, 3);
        setMagicAt(turnSeat, (m) => m - totalAssaultCost);
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
        if (isPoisoner) board[index] = poisonStrike(board[index]);
        return `${posName(index)}に${item.effect}を追加`;
    };

    const onClickProliferate = () => {
        addLog(`「増殖」を使用（以後の着手ごとにコマ⇄アイテムを追加。維持コストが毎回+${proliferateUpkeepStep}）`);
        playEffect('proliferate');
        setProliferateAt(turnSeat, true);
        setProliferateCountAt(turnSeat, 0);
        spendMagic(calculateCost(skillCosts.onClickProliferate));
    };

    const [useStomp, setUseStomp] = useState<boolean>(false);
    const onClickStomp = () => {
        addLog('「ストンプ」を使用（マスを選択）');
        setUseStomp(true);
        spendMagic(skillCosts.onClickStomp, false);
    };

    // ストンプの破壊範囲 (クリックしたマスの周囲1マス)
    const exeStomp = (i: number, currentBoard: SquareInfo[]) => {
        const stompIndexes = geo.stompRange(i);
        let destroyed = 0;
        for (const stompIndex of stompIndexes) {
            if (currentBoard[stompIndex].player === currentTurnPlayer) {
                currentBoard[stompIndex].bind = currentBoard[stompIndex].bind > 5 ? currentBoard[stompIndex].bind - 5 : 0;
            } else {
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
        setCurrentBoard(currentBoard);
        setUseStomp(false);
    };

    const baseJudgeDayCost = 11;
    let judgeDayCost: number;
    if (useMagicCount[turnSeat] < baseJudgeDayCost) {
        judgeDayCost = baseJudgeDayCost - useMagicCount[turnSeat];
    } else {
        judgeDayCost = 0;
    }
    const [useJudgeDay, setUseJudgeDay] = useState<boolean>(false);
    const onClickJudgeDay = () => {
        addLog('「審判の日」を使用（マスを選択）');
        setMagicAt(turnSeat, (m) => m - judgeDayCost);
        setUseMagicCountAt(turnSeat, 0);
        setUseJudgeDay(true);
    };

    // 審判の日の対象範囲

    const exeJudgeDay = (i: number) => {
        const board = currentBoard.slice();
        const judgeIndexes = geo.judgeRange(i);

        let destroyed = 0;
        for (const judgeIndex of judgeIndexes) {
            if (
                !board[judgeIndex].effects.map((x) => x.effect).includes('🔑') ||
                !(board[judgeIndex].player === currentTurnPlayer && board[judgeIndex].effects.map((x) => x.effect).includes('🌱'))
            ) {
                if (board[judgeIndex].player) destroyed++;
                board[judgeIndex] = { player: undefined, bind: 0, effects: [] };
            }
        }
        addCorpses(destroyed);

        setUseMagicCountAt(turnSeat, 0);

        board[i] = { player: currentTurnPlayer, bind: 2, effects: [{ effect: '🌱' }] };
        addLog(`${posName(i)}を中心に審判の日を実行`);
        flashCells(judgeIndexes);
        playEffect('judge');
        setCurrentBoard(board);
        setUseJudgeDay(false);
        setCurrentTurn(currentTurn + 1);
    };

    const onClickToggleYingYang = () => {
        addLog('「陰陽転化」を使用（陰陽モードを切替）');
        playEffect('yinyang');
        // 自分のモードを見て反転する (issue #12: 以前は💙のモードを見ていて⭕が永久に陽へ切り替えられなかった)
        setYinYangModeAt(turnSeat, (m) => (m === 'yang' ? 'ying' : 'yang'));
        spendMagic(skillCosts.onClickToggleYingYang, false);
    };

    const yingYangSkllCost = 5;
    const onClickYingYangSkll = () => {
        addLog(`「${currentYinYangMode === 'yang' ? '豊穣の舞（自分の全コマ+2）' : '凶荒の舞（相手の全コマ-2）'}」を使用`);
        const board = currentBoard.slice();
        const affected: number[] = [];
        let destroyed = 0;
        if (currentYinYangMode === 'yang') {
            for (const square of board) {
                if (square.player === currentTurnPlayer) {
                    square.bind = square.bind + 2;
                }
            }
        } else {
            board.forEach((square, idx) => {
                if (square.player && square.player !== currentTurnPlayer) {
                    square.bind = square.bind - 2;
                    affected.push(idx);
                    if (square.bind < 1) {
                        square.player = undefined;
                        square.effects = [];
                        square.bind = 0;
                        destroyed++;
                    }
                }
            });
        }
        spendMagic(yingYangSkllCost, false);
        addCorpses(destroyed);
        flashCells(affected);
        playEffect(currentYinYangMode === 'yang' ? 'harvest' : 'famine');
        setCurrentBoard(board);
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
        const board = currentBoard.slice();
        const empties = findEmptyIndexes(board);
        // 墓地に貯まった死体数だけ召喚（上限・空きマス数でクランプ）
        const summonCount = Math.min(baseNecromancyCost - curCost, necromancySummonCap, empties.length);
        const summonTargets = randomAnyPick(empties, summonCount);
        for (const idx of summonTargets) {
            board[idx] = { player: currentTurnPlayer, bind: necromancyReviveLife, effects: [] };
        }
        setCurrentBoard(board);
        playEffect('necromancy');
        addLog(`「蘇生」を使用（墓地から${summonCount}体召喚 / ${necromancyDuration}ターン吸収）`);
        setMagicAt(turnSeat, (m) => m - curCost);
        setUseMagicCountAt(turnSeat, (c) => c + 1);
        setRemainNecroAt(turnSeat, necromancyDuration);
        setNecroCostAt(turnSeat, baseNecromancyCost);
    };

    // --- 毒使い 固有スキル「ミアズマ」 ---
    const onClickMiasma = () => {
        addLog('「ミアズマ」を使用（自陣を選択）');
        setUseMiasma(true);
        spendMagic(miasmaCost(), false);
    };
    const exeMiasma = (i: number) => {
        const board = currentBoard.slice();
        // 周囲1マスの敵セル(ロック以外)すべてに毒を1付与
        const targets = geo.surroundRange(i).filter(
            (j) => board[j].player && board[j].player !== currentTurnPlayer && !isGuarded(board[j], characters)
        );
        for (const t of targets) board[t] = poisonStrike({ ...board[t], effects: [...board[t].effects, { effect: '☠' }] });
        addLog(`${posName(i)}を中心にミアズマ（敵${targets.length}マスに毒）`);
        flashCells(targets);
        playEffect('poison', i);
        setCurrentBoard(board);
        setUseMiasma(false);
    };

    // --- 通常枠 毒スキル ---
    const onClickInjection = () => {
        addLog('「インジェクション」を使用（マスを選択）');
        setUseInjection(useInjection + 1);
        spendMagic(calculateCost(skillCosts.onClickInjection, false, true));
    };

    const onClickPoisonToken = () => {
        const board = currentBoard.slice();
        const emptyIndexes = findEmptyIndexes(board);
        const index = randomPick(emptyIndexes);
        board[index] = poisonStrike({ player: currentTurnPlayer, bind: calculateTokenBind(), effects: [{ effect: '☠' }] });
        addLog(`「ポイズントークン」を使用（${posName(index)}に設置）`);
        setCurrentBoard(board);
        spendMagic(calculateCost(skillCosts.onClickPoisonToken, true, true));
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
        spendMagic(calculateCost(skillCosts.onClickSerum, false, true));
    };

    const onClickIntensify = () => {
        addLog('「猛毒化」を使用（毒の数を倍化）');
        const board = currentBoard.slice();
        const affected: number[] = [];
        board.forEach((sq, idx) => {
            const poison = sq.effects.filter((e) => e.effect === '☠').length;
            if (poison > 0) {
                board[idx] = poisonStrike({ ...sq, effects: [...sq.effects, ...Array<Effect>(poison).fill({ effect: '☠' })] });
                affected.push(idx);
            }
        });
        flashCells(affected);
        playEffect('poison');
        setCurrentBoard(board);
        spendMagic(calculateCost(skillCosts.onClickIntensify, false, true));
    };

    const onClickPandemic = () => {
        addLog('「パンデミック」を使用（マスを選択）');
        setUsePandemic(true);
        spendMagic(calculateCost(skillCosts.onClickPandemic, false, true));
    };
    const exePandemic = (i: number) => {
        const board = currentBoard.slice();
        // 選択マスと周囲1マス(3x3)のコマに毒を1付与（敵味方問わず）
        const targets = geo.stompRange(i).filter((j) => board[j].player && !isGuarded(board[j], characters));
        for (const t of targets) board[t] = poisonStrike({ ...board[t], effects: [...board[t].effects, { effect: '☠' }] });
        addLog(`${posName(i)}を中心にパンデミック（${targets.length}マスに毒）`);
        flashCells(targets);
        playEffect('poison', i);
        setCurrentBoard(board);
        setUsePandemic(false);
    };

    // --- 帯電（雷霆の巫） ---
    const [useChargeOne, setUseChargeOne] = useState<boolean>(false);
    const [useChargeSpread, setUseChargeSpread] = useState<boolean>(false);
    const [useChargeArea, setUseChargeArea] = useState<boolean>(false);
    const [useJammer, setUseJammer] = useState<boolean>(false);
    // 帯電付与・帯電拡散の実コスト: 基礎 - 盤面の⚡の数（キャラ補正後）、下限は CHARGE_MIN_COST (#43)
    const chargeOneCost = (player: Player = currentTurnPlayer): number =>
        reducedChargeCost(skillCosts.onClickChargeOne, currentBoard, (c) => calculateCost(c, false, false, player));
    const chargeSpreadCost = (player: Player = currentTurnPlayer): number =>
        reducedChargeCost(skillCosts.onClickChargeSpread, currentBoard, (c) => calculateCost(c, false, false, player));
    // 帯電トークン: 空きマスにランダムに⚡付きのコマを置く（トークン扱い。発火はしない）
    const onClickChargeToken = () => {
        const board = currentBoard.slice();
        const emptyIndexes = findEmptyIndexes(board);
        if (emptyIndexes.length > 0) {
            const index = randomPick(emptyIndexes);
            board[index] = { player: currentTurnPlayer, bind: calculateTokenBind(), effects: [{ effect: '⚡' }] };
            addLog(`「帯電トークン」を使用（${posName(index)}に設置）`);
            playEffect('zap', index);
            setCurrentBoard(withOverload(board));
        }
        spendMagic(calculateCost(skillCosts.onClickChargeToken, true));
        setUseToken(true);
    };
    // 帯電付与: 選んだマス（空きマスも可）に⚡を1つ付与する。付与しただけではダメージは出ない
    const onClickChargeOne = () => {
        addLog('「帯電付与」を使用（マスを選択）');
        setUseChargeOne(true);
        spendMagic(chargeOneCost());
    };
    // 固有スキル 帯電拡散: コマのあるマスだけを縦横に辿って届く全マスに⚡を付与する
    const onClickChargeSpread = () => {
        addLog('「帯電拡散」を使用（コマを選択）');
        setUseChargeSpread(true);
        spendMagic(chargeSpreadCost(), false);
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
        spendMagic(calculateCost(skillCosts.onClickDoubleChargeToken, true));
        setUseToken(true);
    };
    // 範囲帯電: 選んだマスを中心に3x3（空きマス含む）へ⚡を1つずつ付与する。ターンは終わらず、ダメージもない
    const onClickChargeArea = () => {
        addLog('「範囲帯電」を使用（中心のマスを選択）');
        setUseChargeArea(true);
        spendMagic(calculateCost(skillCosts.onClickChargeArea));
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
        spendMagic(calculateCost(skillCosts.onClickChargeRandom));
    };
    // ジャマー: ⚡のあるマスを選び、縦横隣接の敵コマのライフを⚡の数だけ減らして⚡を取り除く
    const onClickJammer = () => {
        addLog('「ジャマー」を使用（⚡のマスを選択）');
        setUseJammer(true);
        spendMagic(calculateCost(skillCosts.onClickJammer));
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

    // player 省略時は手番プレイヤー。パネルで非手番側のコストを出すために指定できる
    const calculateCost = (cost: number, isToken: boolean = false, isPoison: boolean = false, player: Player = currentTurnPlayer) => {
        const seat = seatOf(player);
        const characterId = characters[seat];
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
        if (winner) setWinsAt(seatOf(winner), (w) => w + 1);
    }, [winner]);

    // 継続中スキルの残りターン数を返す
    const continuousEffects = (seat: number): string[] => {
        const labels: string[] = [];
        const assault = useAssault[seat];
        if (assault > 0) labels.push(`全軍突撃 残り${assault}ターン`);
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
        switch (characters[seat]) {
            case 'tactician':
                return [{ name: '全軍突撃', cost: skillCosts.onClickTotalAssault - useTokenCount[seat] * 2 }];
            case 'giant':
                return [{ name: 'ストンプ', cost: skillCosts.onClickStomp }];
            case 'magician':
                return [{ name: '審判の日', cost: Math.max(0, baseJudgeDayCost - useMagicCount[seat]) }];
            case 'yinYangMaster': {
                const yang = yinYangMode[seat] === 'yang';
                return [
                    { name: '陰陽転化', cost: skillCosts.onClickToggleYingYang },
                    { name: yang ? '豊穣の舞' : '凶荒の舞', cost: skillCosts.onClickYingYangSkill },
                ];
            }
            case 'necromancer':
                return [{ name: '蘇生', cost: necroCost[seat] }];
            case 'poisoner':
                return [{ name: 'ミアズマ', cost: miasmaCost(symbols[seat]) }];
            case 'electrician':
                return [{ name: '帯電拡散', cost: chargeSpreadCost(symbols[seat]) }];
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
        setProliferateCountAll(zeros());
        setUseStomp(false);
        setUseJudgeDay(false);
        setUseBuds([false, 0]);
        setUseLock(0);
        setUseMiasma(false);
        setUseInjection(0);
        setUsePandemic(false);
        setUseChargeOne(false);
        setUseChargeSpread(false);
        setUseChargeArea(false);
        setUseJammer(false);
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
        setLockedSkillsAll(Array.from({ length: seatCount }, () => []));
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
        else if (useMiasma) setPreviewCells(geo.surroundRange(i));
        else if (useInjection > 0) setPreviewCells([i]);
        else if (useChargeOne) setPreviewCells([i]);
        else if (useChargeSpread) setPreviewCells(connectedPieces(currentBoard, i, geo.size));
        else if (useChargeArea) setPreviewCells(geo.stompRange(i));
        else if (useJammer) setPreviewCells(canJam(currentBoard, i, currentTurnPlayer, characters) ? jammerTargets(currentBoard, i, geo.size, currentTurnPlayer) : []);
    };
    const onCellLeave = () => {
        if (useStomp || useJudgeDay || usePandemic || useMiasma || useInjection > 0 || useChargeOne || useChargeSpread || useChargeArea || useJammer) setPreviewCells([]);
    };

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
        { idx: 0, onClick: onClickAddLife, buttonText: `ライフ3-${calculateCost(skillCosts.onClickAddLife)}`, paragraph: 'ライフを3追加します', disabled: checkSkillDisable(skillCosts.onClickAddLife) },
        { idx: 1, onClick: onClickBibine, buttonText: `バイバイン-${calculateCost(skillCosts.onClickBibine)}`, paragraph: 'ライフが倍になります', disabled: checkSkillDisable(skillCosts.onClickBibine) },
        { idx: 2, onClick: onClickBuds, buttonText: `バッズ-${calculateCost(skillCosts.onClickBuds)}`, paragraph: '次の一手でバッズを植えます', disabled: checkSkillDisable(skillCosts.onClickBuds) },
        { idx: 3, onClick: onClickToken, buttonText: `トークン-${calculateCost(skillCosts.onClickToken, true)}`, paragraph: `空きマスにランダムにライフが${calculateTokenBind()}の${currentTurnPlayer}を置きます。\nトークンはターンに一度しか使用できません`, disabled: checkSkillDisable(skillCosts.onClickToken, true) },
        { idx: 4, onClick: onClickBothToken, buttonText: `両トークン-${calculateCost(skillCosts.onClickBothToken, true)}`, paragraph: `空きマスにランダムにライフが4の全プレイヤーのコマを1つずつ置きます(自分はライフ${calculateTokenBind()})。\nトークンはターンに一度しか使用できません`, disabled: checkSkillDisable(skillCosts.onClickBothToken, true) },
        { idx: 5, onClick: onClickSlash, buttonText: `スラッシュ-${calculateCost(skillCosts.onClickSlash)}`, paragraph: `右上から左下にかけての${geo.size}マスのライフを0にします`, disabled: checkSkillDisable(skillCosts.onClickSlash), onHoverStart: () => showPreview(slashPreview()), onHoverEnd: clearPreview },
        { idx: 6, onClick: onClickBackSlash, buttonText: `バックスラッシュ-${calculateCost(skillCosts.onClickBackSlash)}`, paragraph: `左上から右下にかけての${geo.size}マスのライフを0にします`, disabled: checkSkillDisable(skillCosts.onClickBackSlash), onHoverStart: () => showPreview(backSlashPreview()), onHoverEnd: clearPreview },
        { idx: 7, onClick: onClickTsunami, buttonText: `チューチュートレイン-${calculateCost(skillCosts.onClickTsunami)}`, paragraph: `相手全員のマジックを0にします`, disabled: checkSkillDisable(skillCosts.onClickTsunami) },
        { idx: 8, onClick: onClickOpium, buttonText: `オピウム-${calculateCost(skillCosts.onClickOpium)}`, paragraph: `相手の駒全てのライフを-2し、ターンを終了します`, disabled: checkSkillDisable(skillCosts.onClickOpium), onHoverStart: () => showPreview(opiumPreview()), onHoverEnd: clearPreview },
        { idx: 9, onClick: onClickBudsToken, buttonText: `バッズトークン-${calculateCost(skillCosts.onClickBudsToken, true)}`, paragraph: `バッズ付き・ライフ3のコマをランダムに設置します\nトークンはターンに一度しか使用できません`, disabled: checkSkillDisable(skillCosts.onClickBudsToken, true) },
        { idx: 10, onClick: onClickDoubleBuds, buttonText: `ダブルバッズ-${calculateCost(skillCosts.onClickDoubleBuds)}`, paragraph: '次の一手でバッズを2つ植えます', disabled: checkSkillDisable(skillCosts.onClickDoubleBuds) },
        { idx: 11, onClick: onClickDoubleToken, buttonText: `ダブルトークン-${calculateCost(skillCosts.onClickDoubleToken, true)}`, paragraph: `空きマスにランダムにライフが${calculateTokenBind()}の${currentTurnPlayer}を2つ置きます\nトークンはターンに一度しか使用できません`, disabled: checkSkillDisable(skillCosts.onClickDoubleToken) },
        { idx: 12, onClick: onClickUseDoubleLock, buttonText: `ダブルロック-${calculateCost(skillCosts.onClickDoubleLock)}`, paragraph: `マスを2つ選択し、6ターン以上ロックします`, disabled: checkSkillDisable(skillCosts.onClickDoubleLock) },
        { idx: 13, onClick: onClickUseTripleLock, buttonText: `トリプルロック-${calculateCost(skillCosts.onClickTripleLock)}`, paragraph: `マスを3つ選択し、6ターン以上ロックします`, disabled: checkSkillDisable(skillCosts.onClickTripleLock) },
        { idx: 14, onClick: onClickWalpurgisNight, buttonText: `ワルプルギスの夜-${calculateCost(skillCosts.onClickWalpurgisNight)}`, paragraph: `全コマにバッズを植えます`, disabled: checkSkillDisable(skillCosts.onClickWalpurgisNight) },
        { idx: 15, onClick: onClickInjection, buttonText: `インジェクション-${calculateCost(skillCosts.onClickInjection, false, true)}`, paragraph: `マスを選択し、毒を1付与します（毒は毎ターンbind-1・重複可）`, disabled: checkSkillDisable(skillCosts.onClickInjection, false, true) },
        { idx: 16, onClick: onClickPoisonToken, buttonText: `ポイズントークン-${calculateCost(skillCosts.onClickPoisonToken, true, true)}`, paragraph: `毒付き・ライフ${calculateTokenBind()}の自陣コマをランダムに設置します\nトークンはターンに一度しか使用できません`, disabled: checkSkillDisable(skillCosts.onClickPoisonToken, true, true) },
        { idx: 17, onClick: onClickSerum, buttonText: `血清-${calculateCost(skillCosts.onClickSerum, false, true)}`, paragraph: `自陣のコマの毒をすべて除去します`, disabled: checkSkillDisable(skillCosts.onClickSerum, false, true) },
        { idx: 18, onClick: onClickIntensify, buttonText: `猛毒化-${calculateCost(skillCosts.onClickIntensify, false, true)}`, paragraph: `毒が付与されている全マスの毒の数を倍にします`, disabled: checkSkillDisable(skillCosts.onClickIntensify, false, true) },
        { idx: 19, onClick: onClickPandemic, buttonText: `パンデミック-${calculateCost(skillCosts.onClickPandemic, false, true)}`, paragraph: `マスを選択し、そのマスと周囲1マス(3x3)のコマに毒を1付与します`, disabled: checkSkillDisable(skillCosts.onClickPandemic, false, true) },
        {
            idx: 20,
            onClick: onClickProliferate,
            buttonText: `増殖-${calculateCost(skillCosts.onClickProliferate)}`,
            paragraph: `発動後は着手のたびに「ライフ${proliferateTokenLife}のコマ」→「アイテム(🌱/毒使いは敵に☠)」を交互に追加し続けます\n維持コストは手番開始時に払い、追加のたび+${proliferateUpkeepStep}増加。払えなくなるか${proliferateMaxStacks}回で終了`,
            disabled: checkSkillDisable(skillCosts.onClickProliferate) || proliferate[turnSeat],
        },
        { idx: 21, onClick: onClickChargeToken, buttonText: `帯電トークン-${calculateCost(skillCosts.onClickChargeToken, true)}`, paragraph: `⚡付き・ライフ${calculateTokenBind()}の自陣コマをランダムに設置します\n⚡の隣に誰かが置くと、⚡マスの縦横隣のコマに1ダメージ\nトークンはターンに一度しか使用できません`, disabled: checkSkillDisable(skillCosts.onClickChargeToken, true) },
        { idx: 22, onClick: onClickChargeOne, buttonText: `帯電付与-${chargeOneCost()}`, paragraph: `マスを選択し、⚡を1つ付与します（空きマスも可）\n付与しただけではダメージは出ません\nコストは盤面の⚡の数だけ軽減されます`, disabled: magic[turnSeat] < chargeOneCost() },
        { idx: 23, onClick: onClickDoubleChargeToken, buttonText: `帯電ダブルトークン-${calculateCost(skillCosts.onClickDoubleChargeToken, true)}`, paragraph: `⚡付き・ライフ${calculateTokenBind()}の自陣コマをランダムに2つ設置します\n⚡の隣に誰かが置くと、⚡マスの縦横隣のコマに1ダメージ\nトークンはターンに一度しか使用できません`, disabled: checkSkillDisable(skillCosts.onClickDoubleChargeToken, true) },
        { idx: 24, onClick: onClickChargeArea, buttonText: `範囲帯電-${calculateCost(skillCosts.onClickChargeArea)}`, paragraph: `マスを選択し、そのマスと周囲1マス(3x3)に⚡を1つずつ付与します（空きマスも可）\n付与しただけではダメージは出ません`, disabled: checkSkillDisable(skillCosts.onClickChargeArea) },
        { idx: 25, onClick: onClickChargeRandom, buttonText: `ランダム帯電-${calculateCost(skillCosts.onClickChargeRandom)}`, paragraph: `ランダムな1〜4マスに⚡を1つずつ付与します（空きマスも可）\n無敵のマスと🔑ロック中のマスは対象外です`, disabled: checkSkillDisable(skillCosts.onClickChargeRandom) },
        { idx: 26, onClick: onClickJammer, buttonText: `ジャマー-${calculateCost(skillCosts.onClickJammer)}`, paragraph: `⚡のあるマスを選択し、縦横に隣接する相手のコマのライフを⚡の数だけ減らして、そのマスの⚡を取り除きます\n自分のコマと🔑ロック中のコマは影響を受けません\n自分の無敵マスも選べます（弱点を解除できます）`, disabled: checkSkillDisable(skillCosts.onClickJammer) || boardChargeCount(currentBoard) === 0 },
    ];

    return (
        <div className={styles.game}>
            <div className={styles.main}>
                {seatCount === 2 ? playerPanel(0) : <div className={styles.seatList}>{range(0, seatCount).map(playerPanel)}</div>}
                <div className={styles.boardWrap}>
                    <Status winner={winner} nextPlayer={currentTurnPlayer} life={life} magicBonus={lateMagicBonus(currentTurn, seatCount)} />
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
                        <BoardEffects effect={boardEffect} size={geo.size} />
                    </div>
                    <div className={styles.controls}>
                        <button className={styles.btn} onClick={onClickRestart}>
                            リスタート
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
            <div className={styles.skills}>
                <div className={styles.skillsTitle}>スキル</div>
                <div className={styles.skillGrid}>
                    <SkillButton onClick={onClickCharge} buttonText={`チャージ+${charge}`} paragraph={`ターンを終了し、マジックを+${charge}します`} />
                    <SkillButton
                        onClick={onClickShuffle}
                        buttonText={`シャッフル-${ skillCosts.onClickShuffle}`}
                        paragraph='固定でないスキルをシャッフルします'
                        disabled={checkSkillDisable(skillCosts.onClickShuffle)}
                    />
                    <SkillButton
                        onClick={onClickUseLock}
                        buttonText={`ロック-${calculateCost(skillCosts.onClickUseLock)}`}
                        paragraph={`選択したマスを6ターン以上ロックします`}
                        disabled={checkSkillDisable(skillCosts.onClickUseLock)}
                    />
                    <SkillButton
                        onClick={onClickTotalAssault}
                        buttonText={`全軍突撃-${totalAssaultCost}`}
                        paragraph={
                            '3ターンの間、ターン終了時にランダムにトークンを設置します コストは使用したトークンの回数×2軽減されます(使用後はカウントがリセットされます)'
                        }
                        hidden={currentCharacter !== 'tactician'}
                        disabled={checkSkillDisable(totalAssaultCost - 2)}
                    />
                    <SkillButton
                        onClick={onClickStomp}
                        buttonText={`ストンプ-${skillCosts.onClickStomp}`}
                        paragraph={'クリックしたセルと周囲1マスを破壊します'}
                        hidden={currentCharacter !== 'giant'}
                        disabled={checkSkillDisable(skillCosts.onClickStomp)}
                    />
                    <SkillButton
                        onClick={onClickJudgeDay}
                        buttonText={`審判の日-${judgeDayCost}`}
                        paragraph='セルをクリックし、審判を下します コストは使用したスキルの回数軽減されます(使用後はカウントがリセットされます)'
                        hidden={currentCharacter !== 'magician'}
                        disabled={checkSkillDisable(judgeDayCost)}
                    />
                    <SkillButton
                        onClick={onClickToggleYingYang}
                        buttonText={`陰陽転化-${skillCosts.onClickToggleYingYang}`}
                        paragraph={`陰陽のモードを切り替えます 現在のモード:${yinYangModeName(turnSeat)}`}
                        hidden={currentCharacter !== 'yinYangMaster'}
                        disabled={checkSkillDisable(skillCosts.onClickToggleYingYang)}
                    />
                    <SkillButton
                        onClick={onClickNecromancy}
                        buttonText={`蘇生-${currentNecroCost}${currentNecroRemain > 0 ? `(発動中:残${currentNecroRemain})` : ''}`}
                        paragraph={`発動時に墓地の死体数だけ(最大${necromancySummonCap})ライフ${necromancyReviveLife}のコマを召喚し、${necromancyDuration}ターンの間ライフ0の敵コマを自動吸収します 墓地は盤上でコマが奪われる/消えるたびに貯まり、コスト軽減と召喚数になります(使用後リセット)`}
                        hidden={currentCharacter !== 'necromancer'}
                        disabled={checkSkillDisable(currentNecroCost)}
                    />
                    <SkillButton
                        onClick={onClickMiasma}
                        buttonText={`ミアズマ-${miasmaCost()}`}
                        paragraph={'自陣を選択し、周囲1マスの敵コマすべてに毒を1付与します コストは盤面の毒の数だけ軽減されます'}
                        hidden={currentCharacter !== 'poisoner'}
                        disabled={magic[turnSeat] < miasmaCost()}
                    />
                    <SkillButton
                        onClick={onClickChargeSpread}
                        buttonText={`帯電拡散-${chargeSpreadCost()}`}
                        paragraph={'コマを選択し、そこからコマのあるマスだけを縦横に辿って届くすべてのコマ(敵味方問わず)に⚡を1つ付与します コストは盤面の⚡の数だけ軽減されます'}
                        hidden={currentCharacter !== 'electrician'}
                        disabled={magic[turnSeat] < chargeSpreadCost()}
                    />
                    <SkillButton
                        onClick={onClickYingYangSkll}
                        buttonText={`${currentYinYangMode === 'yang' ? '豊穣の舞' : '凶荒の舞'}-${skillCosts.onClickYingYangSkill}`}
                        paragraph={`${
                            currentYinYangMode === 'yang'
                                ? '自身の全てのコマのライフを+2します'
                                : '相手のすべてのコマのライフを-2します 0になったコマは破壊します'
                        }`}
                        hidden={currentCharacter !== 'yinYangMaster'}
                        disabled={checkSkillDisable(skillCosts.onClickYingYangSkill)}
                        onHoverStart={currentYinYangMode === 'ying' ? () => showPreview(kyokoPreview()) : undefined}
                        onHoverEnd={currentYinYangMode === 'ying' ? clearPreview : undefined}
                    />
                    {shuffleSkillDefs.map((s) => (
                        <SkillButton
                            key={s.idx}
                            onClick={s.onClick}
                            buttonText={s.buttonText}
                            paragraph={s.paragraph}
                            disabled={s.disabled}
                            hidden={!skills.includes(s.idx)}
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
