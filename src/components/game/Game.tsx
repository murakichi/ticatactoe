import React, { useState, useEffect } from 'react';
import { CharacterId, YingYangMode } from '../../types/Character';
import { Effect } from '../../types/Effect';
import { Player } from '../../types/Player';
import { SquareInfo } from '../../types/SquareInfo';
import { randomAnyPick, range, calculateWinner, findEmptyIndexes, randomPick, calculateLife } from '../../util';
import AIPlayer, { TURN_ENDING_SKILLS } from './AIPlayer';
import { Board } from './Board';
import { BoardEffects, SkillEffect, SkillEffectType } from './BoardEffects';
import { SkillButton } from './SkillButton';
import { stompRange, judgeRange, surroundRange } from './boardGeometry';
import { skillCosts } from './skillCosts';
import { Status } from './Status';
import styles from './Game.module.css';

type GameProps = {
    heartSelectedCharacter: CharacterId;
    circleSelectedCharacter: CharacterId;
    heartIsAI: boolean;
    circleIsAI: boolean;
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
};
export const Game = (props: GameProps) => {
    const initialBoard = Array.from({ length: 16 }, () => ({ player: undefined, bind: 0, effects: [] }));
    const [history, setHistory] = useState<SquareInfo[][]>([initialBoard]);
    const [currentBoard, setCurrentBoard] = useState<SquareInfo[]>(initialBoard);
    const [currentTurn, setCurrentTurn] = useState<number>(1);
    const [heartTurn, setHeartTurn] = useState<boolean>(true);

    const [restartCount, setRestartCount] = useState<number>(0);
    // 連戦時の勝利数 (Restartしてもリセットしない)
    const [heartWins, setHeartWins] = useState<number>(0);
    const [circleWins, setCircleWins] = useState<number>(0);
    // 実際に破壊されたマスを濃い目の黄色で点滅させるためのインデックス
    const [highlightedCells, setHighlightedCells] = useState<number[]>([]);
    // ホバー時に破壊範囲をレモン色でプレビューするためのインデックス
    const [previewCells, setPreviewCells] = useState<number[]>([]);
    // スキル発動時の盤面エフェクト
    const [boardEffect, setBoardEffect] = useState<SkillEffect | null>(null);
    const playEffect = (type: SkillEffectType, index?: number) => {
        setBoardEffect((prev) => ({ type, index, nonce: (prev?.nonce ?? 0) + 1 }));
        setTimeout(() => setBoardEffect(null), 850);
    };
    const flashCells = (indexes: number[]) => {
        // スキル実行時はホバープレビューを消して破壊演出に切り替える
        setPreviewCells([]);
        if (indexes.length === 0) return;
        setHighlightedCells(indexes);
        setTimeout(() => setHighlightedCells([]), 1200);
    };
    const [gameLog, setGameLog] = useState<string[]>([]);
    const addLog = (message: string) => {
        setGameLog((prev) => [...prev, `ターン${currentTurn} ${currentTurnPlayer}: ${message}`]);
    };
    const posName = (i: number) => `${Math.floor(i / 4) + 1}行${(i % 4) + 1}列`;
    
    const heartAI = props.heartIsAI ? new AIPlayer('💙', props.heartSelectedCharacter, props.circleSelectedCharacter) : null;
    const circleAI = props.circleIsAI ? new AIPlayer('⭕', props.circleSelectedCharacter, props.heartSelectedCharacter) : null;
    const isBothAI = !!heartAI && !!circleAI;
    const [pendingAIMove, setPendingAIMove] = useState<number[] | null>(null);
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
        }
    };

    useEffect(() => {
        if (pendingAIMove !== null && pendingAIMove.length > 0) {
            const timer = setTimeout(() => {
                const [next, ...rest] = pendingAIMove;
                onCellClick(next);
                setPendingAIMove(rest.length > 0 ? rest : null);
            }, 200);
            return () => clearTimeout(timer);
        }
    }, [pendingAIMove]);

    const runAIMove = () => {
        const ai = heartTurn ? heartAI! : circleAI!;
        let currentMagic = heartTurn ? heartMagic : circleMagic;
        const oppMagic = heartTurn ? circleMagic : heartMagic;
        let currentSkills = skills;

        const aiNecroRemain = heartTurn ? remainHeartNecro : remainCircleNecro;
        const aiNecroCost = heartTurn ? currentHeartNecroCost : currentCircleNecroCost;
        const aiProliferate = heartTurn ? heartProliferate : circleProliferate;
        let result = ai.makeMove(currentBoard, currentMagic, skillCosts, oppMagic, life, currentSkills, useToken, aiNecroRemain, aiNecroCost, judgeDayCost, false, totalAssaultCost, aiProliferate);

        if (result.needsShuffle && currentMagic >= skillCosts.onClickShuffle) {
            currentMagic -= skillCosts.onClickShuffle;
            if (heartTurn) setHeartMagic(currentMagic);
            else setCircleMagic(currentMagic);
            // 器用な防御: 防御スキルを引くためロックを解除してから引き直す
            if (heartTurn) setHeartLockedSkills([]);
            else setCircleLockedSkills([]);
            currentSkills = reshuffledSkills(8, []);
            setSkills(currentSkills);
            result = ai.makeMove(currentBoard, currentMagic, skillCosts, oppMagic, life, currentSkills, useToken, aiNecroRemain, aiNecroCost, judgeDayCost, true, totalAssaultCost, aiProliferate);
        }

        // AIが盤面・キャラに応じてスキルをロック（次のシャッフルで固定する）[要検証]
        const aiLocks = ai.chooseLocks(currentBoard, oppMagic, life, currentSkills);
        if (heartTurn) setHeartLockedSkills(aiLocks);
        else setCircleLockedSkills(aiLocks);

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
        const isAITurn = (heartTurn && heartAI) || (!heartTurn && circleAI);
        if (!isAITurn) return;

        const winner = calculateWinner(currentBoard.map(x => x.player));
        if (winner) return;

        // AI同士でステップ実行モードのときは自動進行せず、「次の手番」ボタンを待つ
        if (isBothAI && !autoPlay) return;

        const timer = setTimeout(() => {
            runAIMove();
        }, 500);

        return () => clearTimeout(timer);
        // currentTurn も依存に含める: 巨人のスキップで heartTurn が変わらず同じ側が連続手番になる場合でも再発火させる
    }, [heartTurn, currentTurn, restartCount, autoPlay]);

    // 「次の手番」ボタン押下でAI同士の対戦を1ターン進める
    useEffect(() => {
        if (stepRequest === 0) return;
        const isAITurn = (heartTurn && heartAI) || (!heartTurn && circleAI);
        if (!isAITurn) return;
        if (calculateWinner(currentBoard.map(x => x.player))) return;
        runAIMove();
    }, [stepRequest]);
    const currentTurnPlayer = heartTurn ? '💙' : '⭕';
    const currentPlayerCharacter = heartTurn ? props.heartSelectedCharacter : props.circleSelectedCharacter;

    const [heartMagic, setHeartMagic] = useState<number>(2);
    const [heartUseMagicCount, setHeartUseMagicCount] = useState<number>(0);

    const [circleMagic, setCircleMagic] = useState<number>(2);
    const [circleUseMagicCount, setCircleUseMagicCount] = useState<number>(0);

    // 現在の手番プレイヤーのマジックを cost 消費する共通処理。bumpCount=true でスキル使用回数も+1
    const spendMagic = (cost: number, bumpCount: boolean = true) => {
        if (heartTurn) {
            setHeartMagic(heartMagic - cost);
            if (bumpCount) setHeartUseMagicCount(heartUseMagicCount + 1);
        } else {
            setCircleMagic(circleMagic - cost);
            if (bumpCount) setCircleUseMagicCount(circleUseMagicCount + 1);
        }
    };

    const [useToken, setUseToken] = useState<boolean>(false);
    const [heartUseTokenCount, setHeartUseTokenCount] = useState<number>(0);
    const [circleUseTokenCount, setCircleUseTokenCount] = useState<number>(0);
    useEffect(() => {
        if (useToken) {
            if (heartTurn) {
                setHeartUseTokenCount(heartUseTokenCount + 1);
            } else {
                setCircleUseTokenCount(circleUseTokenCount + 1);
            }
        }
    }, [useToken]);

    const [skills, setSkills] = useState<number[]>([]);
    // ロックしたスキルはシャッフル時も固定で残る。ロックはプレイヤーごとに管理する
    const [heartLockedSkills, setHeartLockedSkills] = useState<number[]>([]);
    const [circleLockedSkills, setCircleLockedSkills] = useState<number[]>([]);
    const currentLockedSkills = heartTurn ? heartLockedSkills : circleLockedSkills;
    const toggleLock = (i: number) => {
        const setter = heartTurn ? setHeartLockedSkills : setCircleLockedSkills;
        setter((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i].slice(0, 3)));
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
    const [heartProliferate, setHeartProliferate] = useState<boolean>(false);
    const [heartProliferateCount, setHeartProliferateCount] = useState<number>(0);
    const [circleProliferate, setCircleProliferate] = useState<boolean>(false);
    const [circleProliferateCount, setCircleProliferateCount] = useState<number>(0);
    const proliferateUpkeep = (count: number): number => count * proliferateUpkeepStep;

    const [heartYinYangMode, setHeartYingYangMode] = useState<YingYangMode | undefined>('ying');
    const heartYinYangModeName = heartYinYangMode === 'yang' ? '陽' : '陰';
    const [circleYinYangMode, setCircleYingYangMode] = useState<YingYangMode | undefined>('ying');
    const circleYinYangModeName = circleYinYangMode === 'yang' ? '陽' : '陰';

    const [life, setLife] = useState<number>(calculateLife(props.heartSelectedCharacter, heartYinYangMode));

    useEffect(() => {
        if (currentTurn === 1) {
            return;
        }
        const nextIsHeart = judgeNextIsHeart();
        let nextLife: number;
        // 巨人はタンク特性(高ライフ)を持つ代わりに毎ターンの魔力ボーナスは無し
        // (life8復元時のストンプ過多をオフェンス側で抑制。検証: giantGap -0.174→+0.002)
        const magicCharacter: CharacterId[] = ['magician'];
        if (nextIsHeart) {
            let nextMagic: number = heartMagic + 1 + budsCount('💙');
            if (magicCharacter.includes(props.heartSelectedCharacter)) {
                nextMagic++;
            }

            if (props.heartSelectedCharacter === 'yinYangMaster' && heartYinYangMode === 'ying') {
                nextMagic++;
            }

            // 魔法使い: 自陣のバッズ1つにつき魔力回復+3 (標準の+1に追加で+2)。バッズ蓄積→スキル連打のコンセプト
            if (props.heartSelectedCharacter === 'magician') {
                nextMagic += budsCount('💙') * 2;
            }

            // 増殖: 手番開始時に維持コストを支払う。払えなければループが途切れる
            if (heartProliferate) {
                const upkeep = proliferateUpkeep(heartProliferateCount);
                if (nextMagic >= upkeep) {
                    nextMagic -= upkeep;
                } else {
                    setHeartProliferate(false);
                    setHeartProliferateCount(0);
                    setGameLog((prev) => [...prev, `ターン${currentTurn} 💙: 増殖の維持コスト(${upkeep})を払えず途切れた`]);
                }
            }

            setHeartMagic(nextMagic);
            nextLife = calculateLife(
                props.heartSelectedCharacter,
                heartYinYangMode,
                props.heartSelectedCharacter === 'poisoner' ? poisonCount('💙') : 0
            );
        } else {
            let nextMagic: number = circleMagic + 1 + budsCount('⭕');
            if (magicCharacter.includes(props.circleSelectedCharacter)) {
                nextMagic++;
            }

            if (props.circleSelectedCharacter === 'yinYangMaster' && circleYinYangMode === 'ying') {
                nextMagic++;
            }

            // 魔法使い: 自陣のバッズ1つにつき魔力回復+3 (標準の+1に追加で+2)
            if (props.circleSelectedCharacter === 'magician') {
                nextMagic += budsCount('⭕') * 2;
            }

            // 増殖: 手番開始時に維持コストを支払う。払えなければループが途切れる
            if (circleProliferate) {
                const upkeep = proliferateUpkeep(circleProliferateCount);
                if (nextMagic >= upkeep) {
                    nextMagic -= upkeep;
                } else {
                    setCircleProliferate(false);
                    setCircleProliferateCount(0);
                    setGameLog((prev) => [...prev, `ターン${currentTurn} ⭕: 増殖の維持コスト(${upkeep})を払えず途切れた`]);
                }
            }

            setCircleMagic(nextMagic);
            nextLife = calculateLife(
                props.circleSelectedCharacter,
                circleYinYangMode,
                props.circleSelectedCharacter === 'poisoner' ? poisonCount('⭕') : 0
            );
        }
        // 蘇生の残りターンは「発動した側の手番が終わるたび」に減る
        if (heartTurn && props.heartSelectedCharacter === 'necromancer' && remainHeartNecro > 0) {
            setRemainHeartNecro(remainHeartNecro - 1);
        }
        if (!heartTurn && props.circleSelectedCharacter === 'necromancer' && remainCircleNecro > 0) {
            setRemainCircleNecro(remainCircleNecro - 1);
        }
        setLife(nextLife > 0 ? nextLife : 1);
        setUseToken(false);
        setHeartTurn(nextIsHeart);
    }, [currentTurn]);

    useEffect(() => {
        // 次に手番が来るプレイヤーのロックを固定して再シャッフル
        const next = judgeNextIsHeart();
        setSkills(reshuffledSkills(21, next ? heartLockedSkills : circleLockedSkills));
    }, [history]);

    const onCellClick = (i: number) => {
        setPreviewCells([]);
        const prevPlayer = currentBoard[i].player;
        const necroActive =
            (heartTurn && props.heartSelectedCharacter === 'necromancer' && remainHeartNecro > 0) ||
            (!heartTurn && props.circleSelectedCharacter === 'necromancer' && remainCircleNecro > 0);
        const nextBoard = currentBoard.slice();
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
            nextBoard[i] = { ...nextBoard[i], effects: [...nextBoard[i].effects, { effect: '☠' }] };
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
        } else if (currentBoard[i].player === (heartTurn ? '⭕' : '💙')) {
            if (currentBoard[i].bind > 0 && (heartTurn ? props.heartSelectedCharacter : props.circleSelectedCharacter) !== 'giant') {
                return;
            }
        }

        if (nextBoard[i].effects.find((x) => x.effect === '🔑') && nextBoard[i].bind > 0) {
            return;
        }

        const nextHistory = [...history.slice(0, currentTurn + 1), nextBoard];

        // 毒で bind が 0 になったマス（拡散パッシブの起点）
        const spreadOrigins: number[] = [];
        for (let s = 0; s < nextBoard.length; s++) {
            const square = nextBoard[s];
            const hadLife = square.bind > 0;
            if ((square.player || square.effects.filter((x) => x.effect === '🔑').length !== 0) && square.bind > 0) square.bind--;
            // 毒: スタック数だけ追加で bind を減らす（毎ターン bind-1 × 毒の数）
            const poison = square.effects.filter((x) => x.effect === '☠').length;
            if (poison > 0 && square.bind > 0) square.bind = Math.max(0, square.bind - poison);
            if (square.bind === 0) {
                square.effects = square.effects.filter((x) => x.effect !== '🔑');
            }
            // 毒持ちのマスが 0 に落ちた瞬間に拡散の起点として記録
            if (poison > 0 && hadLife && square.bind === 0 && s !== i) spreadOrigins.push(s);
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

        if (heartTurn && heartUseAssault > 0) {
            const emptyIndex = randomPick(findEmptyIndexes(nextBoard));
            nextBoard[emptyIndex] = { player: '💙', bind: 0, effects: [] };
            addLog(`全軍突撃で${posName(emptyIndex)}にトークンを設置`);
            setHeartUseAssault(heartUseAssault - 1);
        } else if (!heartTurn && circleUseAssault > 0) {
            const emptyIndex = randomPick(findEmptyIndexes(nextBoard));
            nextBoard[emptyIndex] = { player: '⭕', bind: 0, effects: [] };
            addLog(`全軍突撃で${posName(emptyIndex)}にトークンを設置`);
            setCircleUseAssault(circleUseAssault - 1);
        }

        // 増殖発動中: 着手のたびにコマ→アイテムを交互に1つずつ追加し続ける
        if (heartTurn ? heartProliferate : circleProliferate) {
            const nextCount = (heartTurn ? heartProliferateCount : circleProliferateCount) + 1;
            const added = applyProliferate(nextBoard, nextCount);
            if (added) {
                addLog(`増殖(${nextCount}回目): ${added}`);
                playEffect('proliferate');
                if (heartTurn) setHeartProliferateCount(nextCount);
                else setCircleProliferateCount(nextCount);
                // 上限に達したら自然収束（維持コストの暴走とループの無限化を防ぐ）
                if (nextCount >= proliferateMaxStacks) {
                    addLog('増殖が限界に達して収束した');
                    if (heartTurn) {
                        setHeartProliferate(false);
                        setHeartProliferateCount(0);
                    } else {
                        setCircleProliferate(false);
                        setCircleProliferateCount(0);
                    }
                }
            }
        }

        // 蘇生発動中: ライフが0になった敵コマを自動で自陣に吸収する
        if (necroActive) {
            const opp: Player = currentTurnPlayer === '💙' ? '⭕' : '💙';
            let absorbed = 0;
            for (let k = 0; k < nextBoard.length; k++) {
                const sq = nextBoard[k];
                if (sq.player === opp && sq.bind === 0 && !sq.effects.some((x) => x.effect === '🔑')) {
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
        if (heartTurn) {
            setHeartMagic(heartMagic + charge);
        } else {
            setCircleMagic(circleMagic + charge);
        }
        setCurrentTurn(currentTurn + 1);
    };

    const onClickAddLife = () => {
        addLog('「ライフ3」を使用（ライフ+3）');
        setLife(life + 3);
        spendMagic(calculateCost(skillCosts.onClickAddLife));
    };

    const depressionCherryCost = 1;
    const onClickDepressionCherry = () => {
        setLife(life - 1);
        setHeartMagic(heartMagic - depressionCherryCost);
        setCircleMagic(circleMagic - 1);
    };

    const onClickShuffle = () => {
        addLog('「シャッフル」を使用');
        setSkills(reshuffledSkills(8, currentLockedSkills));
        spendMagic(skillCosts.onClickShuffle);
    };

    const onClickBibine = () => {
        addLog('「バイバイン」を使用（ライフ2倍）');
        setLife(life * 2);
        spendMagic(calculateCost(skillCosts.onClickBibine));
    };

    // --- 毒（毒使い）関連 ---
    // どちらかが毒使いなら、毒セルが死んだ時の「周囲へ毒拡散」パッシブが有効になる
    const poisonerInPlay = props.heartSelectedCharacter === 'poisoner' || props.circleSelectedCharacter === 'poisoner';
    // 指定プレイヤーの自陣にある毒スタック数
    const poisonCount = (player: Player): number =>
        currentBoard
            .filter((x) => x.player === player)
            .map((x) => x.effects)
            .flat()
            .filter((e) => e.effect === '☠').length;
    // 盤面全体の毒スタック数
    const boardPoisonCount = (board: SquareInfo[]): number => board.flatMap((x) => x.effects).filter((e) => e.effect === '☠').length;
    // 周囲1マスのコマ(敵味方問わず)1つにランダムで毒を1付与する（毒拡散パッシブ）
    const spreadPoisonAround = (board: SquareInfo[], idx: number) => {
        const targets = surroundRange(idx).filter((j) => board[j].player);
        if (targets.length === 0) return;
        const t = randomPick(targets);
        board[t] = { ...board[t], effects: [...board[t].effects, { effect: '☠' }] };
    };
    const [useMiasma, setUseMiasma] = useState<boolean>(false);
    const [useInjection, setUseInjection] = useState<number>(0);
    const [usePandemic, setUsePandemic] = useState<boolean>(false);
    // ミアズマの実コスト: 基礎 - 盤面の毒数、毒使い割引(-1)、0未満は0
    const miasmaCost = (): number => Math.max(0, calculateCost(skillCosts.onClickMiasma - boardPoisonCount(currentBoard), false, true));

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
            if (square.player !== currentTurnPlayer && square.player && square.bind > 0 && !square.effects.map((x) => x.effect).includes('🔑')) {
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
        addLog('「スラッシュ」を使用（右上→左下の4マスのライフを0に）');
        const board = currentBoard.slice();
        const affected: number[] = [];
        for (const idx of [3, 6, 9, 12]) {
            if (!board[idx].effects.map((x) => x.effect).includes('🔑')) {
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
        addLog('「バックスラッシュ」を使用（左上→右下の4マスのライフを0に）');
        const board = currentBoard.slice();
        const affected: number[] = [];
        for (const idx of [0, 5, 10, 15]) {
            if (!board[idx].effects.map((x) => x.effect).includes('🔑')) {
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
        const [emptyHeartIndex, emptyCircleIndex] = randomAnyPick(emptyIndexes, 2);
        addLog(`「両トークン」を使用（💙: ${posName(emptyHeartIndex)} / ⭕: ${posName(emptyCircleIndex)}に設置）`);
        if (heartTurn) {
            board[emptyHeartIndex] = { player: '💙', bind: calculateTokenBind(), effects: [] };
            board[emptyCircleIndex] = { player: '⭕', bind: 4, effects: [] };
        } else {
            board[emptyCircleIndex] = { player: '⭕', bind: calculateTokenBind(), effects: [] };
            board[emptyHeartIndex] = { player: '💙', bind: 4, effects: [] };
        }
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
        const characterId = heartTurn ? props.heartSelectedCharacter : props.circleSelectedCharacter;
        if (characterId === 'tactician') {
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
        addLog('「チューチュートレイン」を使用（相手のマジックを0に・ターン終了）');
        if (heartTurn) setCircleMagic(0);
        else setHeartMagic(0);
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

    const totalAssaultCost = skillCosts.onClickTotalAssault - (heartTurn ? heartUseTokenCount : circleUseTokenCount) * 2;
    const [heartUseAssault, setHeartUseAssault] = useState<number>(0);
    const [circleUseAssault, setCircleUseAssault] = useState<number>(0);
    const onClickTotalAssault = () => {
        addLog('「全軍突撃」を使用（3ターンの間ターン終了時にトークン設置）');
        playEffect('assault');
        if (heartTurn) {
            setHeartUseAssault(3);
            setHeartMagic(heartMagic - totalAssaultCost);
            setHeartUseTokenCount(0);
        } else {
            setCircleUseAssault(3);
            setCircleMagic(circleMagic - totalAssaultCost);
            setCircleUseTokenCount(0);
        }
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
        const isPoisoner = (heartTurn ? props.heartSelectedCharacter : props.circleSelectedCharacter) === 'poisoner';
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
        return `${posName(index)}に${item.effect}を追加`;
    };

    const onClickProliferate = () => {
        addLog(`「増殖」を使用（以後の着手ごとにコマ⇄アイテムを追加。維持コストが毎回+${proliferateUpkeepStep}）`);
        playEffect('proliferate');
        if (heartTurn) {
            setHeartProliferate(true);
            setHeartProliferateCount(0);
        } else {
            setCircleProliferate(true);
            setCircleProliferateCount(0);
        }
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
        const stompIndexes = stompRange(i);
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
    if ((heartTurn ? heartUseMagicCount : circleUseMagicCount) < baseJudgeDayCost) {
        judgeDayCost = baseJudgeDayCost - (heartTurn ? heartUseMagicCount : circleUseMagicCount);
    } else {
        judgeDayCost = 0;
    }
    const [useJudgeDay, setUseJudgeDay] = useState<boolean>(false);
    const onClickJudgeDay = () => {
        addLog('「審判の日」を使用（マスを選択）');
        if (heartTurn) {
            setHeartMagic(heartMagic - judgeDayCost);
            setHeartUseMagicCount(0);
        } else {
            setCircleMagic(circleMagic - judgeDayCost);
            setCircleUseMagicCount(0);
        }
        setUseJudgeDay(true);
    };

    // 審判の日の対象範囲

    const exeJudgeDay = (i: number) => {
        const board = currentBoard.slice();
        const judgeIndexes = judgeRange(i);

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

        if (heartTurn) {
            setHeartUseMagicCount(0);
        } else {
            setCircleUseMagicCount(0);
        }

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
        if (heartTurn) {
            if (heartYinYangMode === 'yang') {
                setHeartYingYangMode('ying');
            } else {
                setHeartYingYangMode('yang');
            }
        } else {
            if (heartYinYangMode === 'ying') {
                setCircleYingYangMode('ying');
            } else {
                setCircleYingYangMode('yang');
            }
        }
        spendMagic(skillCosts.onClickToggleYingYang, false);
    };

    const yingYangSkllCost = 5;
    const onClickYingYangSkll = () => {
        addLog(`「${(heartTurn ? heartYinYangMode : circleYinYangMode) === 'yang' ? '豊穣の舞（自分の全コマ+2）' : '凶荒の舞（相手の全コマ-2）'}」を使用`);
        const board = currentBoard.slice();
        const affected: number[] = [];
        let destroyed = 0;
        if (heartTurn) {
            if (heartYinYangMode === 'yang') {
                for (const square of board) {
                    if (square.player === '💙') {
                        square.bind = square.bind + 2;
                    }
                }
            } else {
                board.forEach((square, idx) => {
                    if (square.player === '⭕') {
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
        } else {
            if (circleYinYangMode === 'yang') {
                for (const square of board) {
                    if (square.player === '⭕') {
                        square.bind = square.bind + 2;
                    }
                }
            } else {
                board.forEach((square, idx) => {
                    if (square.player === '💙') {
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
    const [currentHeartNecroCost, setCurrentHeartNecroCost] = useState<number>(baseNecromancyCost);
    const [remainHeartNecro, setRemainHeartNecro] = useState<number>(0);
    const [currentCircleNecroCost, setCurrentCircleNecroCost] = useState<number>(baseNecromancyCost);
    const [remainCircleNecro, setRemainCircleNecro] = useState<number>(0);

    // 盤上で駒が消える/奪われるたびに「墓地」を貯める＝ネクロの蘇生コストを軽減（敵味方問わず）
    // 軽減量 (baseNecromancyCost - currentCost) がそのまま蘇生時の召喚数になる
    const addCorpses = (n: number) => {
        if (n <= 0) return;
        if (props.heartSelectedCharacter === 'necromancer') setCurrentHeartNecroCost((c) => Math.max(0, c - n));
        if (props.circleSelectedCharacter === 'necromancer') setCurrentCircleNecroCost((c) => Math.max(0, c - n));
    };

    const onClickNecromancy = () => {
        const curCost = heartTurn ? currentHeartNecroCost : currentCircleNecroCost;
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
        if (heartTurn) {
            setHeartMagic(heartMagic - currentHeartNecroCost);
            setHeartUseMagicCount(heartUseMagicCount + 1);
            setRemainHeartNecro(necromancyDuration);
            setCurrentHeartNecroCost(baseNecromancyCost);
        } else {
            setCircleMagic(circleMagic - currentCircleNecroCost);
            setCircleUseMagicCount(circleUseMagicCount + 1);
            setRemainCircleNecro(necromancyDuration);
            setCurrentCircleNecroCost(baseNecromancyCost);
        }
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
        const targets = surroundRange(i).filter(
            (j) => board[j].player && board[j].player !== currentTurnPlayer && !board[j].effects.some((e) => e.effect === '🔑')
        );
        for (const t of targets) board[t] = { ...board[t], effects: [...board[t].effects, { effect: '☠' }] };
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
        board[index] = { player: currentTurnPlayer, bind: calculateTokenBind(), effects: [{ effect: '☠' }] };
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
                board[idx] = { ...sq, effects: [...sq.effects, ...Array<Effect>(poison).fill({ effect: '☠' })] };
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
        const targets = stompRange(i).filter((j) => board[j].player && !board[j].effects.some((e) => e.effect === '🔑'));
        for (const t of targets) board[t] = { ...board[t], effects: [...board[t].effects, { effect: '☠' }] };
        addLog(`${posName(i)}を中心にパンデミック（${targets.length}マスに毒）`);
        flashCells(targets);
        playEffect('poison', i);
        setCurrentBoard(board);
        setUsePandemic(false);
    };

    const judgeNextIsHeart = (): boolean => {
        if (currentTurn === 1) {
            return true;
        }

        if (props.circleSelectedCharacter === props.heartSelectedCharacter) {
            return !heartTurn;
        }

        const nextPlayerCharacter = heartTurn ? props.circleSelectedCharacter : props.heartSelectedCharacter;
        const giantSkipModulo = 5;
        if (nextPlayerCharacter !== 'giant' || !giantSkipModulo) {
            return !heartTurn;
        }

        if (currentTurn % giantSkipModulo < giantSkipModulo - 1) {
            return !heartTurn;
        }

        return heartTurn;
    };

    const checkSkillDisable = (cost: number, isToken: boolean = false, isPoison: boolean = false): boolean => {
        const magic = heartTurn ? heartMagic : circleMagic;
        const calculatedCost: number = calculateCost(cost, isToken, isPoison);
        return magic < calculatedCost || (isToken && useToken);
    };

    const calculateCost = (cost: number, isToken: boolean = false, isPoison: boolean = false) => {
        const characterId = heartTurn ? props.heartSelectedCharacter : props.circleSelectedCharacter;
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

        if (characterId === 'yinYangMaster') {
            if (heartTurn && heartYinYangMode === 'yang') {
                return cost + 1;
            }

            if (heartTurn && circleYinYangMode === 'yang') {
                return cost + 1;
            }
        }

        return cost;
    };

    const winner = calculateWinner(currentBoard.map((x) => x.player));
    const necroCost = heartTurn ? currentHeartNecroCost : currentCircleNecroCost;
    const necroRemain = heartTurn ? remainHeartNecro : remainCircleNecro;

    // 勝者が確定したら勝利数を1回だけ加算する
    useEffect(() => {
        if (winner === '💙') setHeartWins((w) => w + 1);
        else if (winner === '⭕') setCircleWins((w) => w + 1);
    }, [winner]);

    // 継続中スキルの残りターン数を返す
    const continuousEffects = (player: Player): string[] => {
        const labels: string[] = [];
        const assault = player === '💙' ? heartUseAssault : circleUseAssault;
        if (assault > 0) labels.push(`全軍突撃 残り${assault}ターン`);
        const necro = player === '💙' ? remainHeartNecro : remainCircleNecro;
        if (necro > 0) labels.push(`蘇生 残り${necro}ターン`);
        const proliferate = player === '💙' ? heartProliferate : circleProliferate;
        if (proliferate) {
            const count = player === '💙' ? heartProliferateCount : circleProliferateCount;
            labels.push(`増殖 ${count}回目 (次の維持${proliferateUpkeep(count)})`);
        }
        return labels;
    };

    // 盤面の両サイドに表示するプレイヤー情報パネル
    const playerPanel = (player: Player) => {
        const isHeart = player === '💙';
        const character = isHeart ? props.heartSelectedCharacter : props.circleSelectedCharacter;
        const isAI = isHeart ? props.heartIsAI : props.circleIsAI;
        const magic = isHeart ? heartMagic : circleMagic;
        const wins = isHeart ? heartWins : circleWins;
        const isCurrent = currentTurnPlayer === player && !winner;
        const effects = continuousEffects(player);
        return (
            <div className={`${styles.panel}${isCurrent ? ` ${styles.panelCurrent}` : ''}`}>
                <div className={`${styles.avatar} ${isHeart ? styles.avatarHeart : styles.avatarCircle}`}>{player}</div>
                <div className={styles.name}>{CHARACTER_NAMES[character]}</div>
                <div className={styles.tags}>
                    <span className={styles.tag}>{isAI ? 'AI' : '人間'}</span>
                    {isCurrent && <span className={styles.turnBadge}>手番</span>}
                </div>
                <div className={styles.stats}>
                    <span className={styles.chip}>🏆 {wins}</span>
                    <span className={`${styles.chip} ${styles.chipMagic}`}>⚡ {magic}</span>
                </div>
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
            `💙 ${CHARACTER_NAMES[props.heartSelectedCharacter]}（${props.heartIsAI ? 'AI' : '人間'}）`,
            `⭕ ${CHARACTER_NAMES[props.circleSelectedCharacter]}（${props.circleIsAI ? 'AI' : '人間'}）`,
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
        setCurrentBoard(initialBoard);
        setHistory([initialBoard]);
        setCurrentTurn(1);
        setHeartMagic(2);
        setCircleMagic(2);
        setHeartUseMagicCount(0);
        setCircleUseMagicCount(0);
        setHeartUseTokenCount(0);
        setCircleUseTokenCount(0);
        setUseToken(false);
        setHeartUseAssault(0);
        setCircleUseAssault(0);
        setHeartProliferate(false);
        setHeartProliferateCount(0);
        setCircleProliferate(false);
        setCircleProliferateCount(0);
        setUseStomp(false);
        setUseJudgeDay(false);
        setUseBuds([false, 0]);
        setUseLock(0);
        setUseMiasma(false);
        setUseInjection(0);
        setUsePandemic(false);
        setRemainHeartNecro(0);
        setRemainCircleNecro(0);
        setCurrentHeartNecroCost(baseNecromancyCost);
        setCurrentCircleNecroCost(baseNecromancyCost);
        setUseToken(false);
        setPendingAIMove(null);
        setGameLog([]);
        setHighlightedCells([]);
        setHeartTurn(true);
        setStepRequest(0);
        setRestartCount((c) => c + 1);
        setPreviewCells([]);
        setBoardEffect(null);
        setHeartLockedSkills([]);
        setCircleLockedSkills([]);
    };

    const notLocked = (idx: number) => !currentBoard[idx].effects.map((x) => x.effect).includes('🔑');
    const opponentPlayer: Player = currentTurnPlayer === '💙' ? '⭕' : '💙';

    // ボタンホバー時に破壊範囲をプレビューするマス
    const slashPreview = (): number[] => [3, 6, 9, 12].filter((idx) => notLocked(idx));
    const backSlashPreview = (): number[] => [0, 5, 10, 15].filter((idx) => notLocked(idx));
    const opiumPreview = (): number[] =>
        currentBoard.map((_, idx) => idx).filter((idx) => currentBoard[idx].player === opponentPlayer && currentBoard[idx].bind > 0 && notLocked(idx));
    const kyokoPreview = (): number[] => currentBoard.map((_, idx) => idx).filter((idx) => currentBoard[idx].player === opponentPlayer);

    const showPreview = (cells: number[]) => setPreviewCells(cells);
    const clearPreview = () => setPreviewCells([]);

    // マスのホバー時: マス選択型の破壊スキル(ストンプ/審判の日)が構えている間だけ範囲を表示
    const onCellHover = (i: number) => {
        if (useStomp) setPreviewCells(stompRange(i));
        else if (useJudgeDay) setPreviewCells(judgeRange(i));
        else if (usePandemic) setPreviewCells(stompRange(i));
        else if (useMiasma) setPreviewCells(surroundRange(i));
        else if (useInjection > 0) setPreviewCells([i]);
    };
    const onCellLeave = () => {
        if (useStomp || useJudgeDay || usePandemic || useMiasma || useInjection > 0) setPreviewCells([]);
    };

    const currentYinYangMode = heartTurn ? heartYinYangMode : circleYinYangMode;

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
        { idx: 4, onClick: onClickBothToken, buttonText: `両トークン-${calculateCost(skillCosts.onClickBothToken, true)}`, paragraph: `空きマスにランダムにライフが3の両プレイヤーのコマを置きます。\nトークンはターンに一度しか使用できません`, disabled: checkSkillDisable(skillCosts.onClickBothToken, true) },
        { idx: 5, onClick: onClickSlash, buttonText: `スラッシュ-${calculateCost(skillCosts.onClickSlash)}`, paragraph: `右上から左下にかけての4マスのライフを0にします`, disabled: checkSkillDisable(skillCosts.onClickSlash), onHoverStart: () => showPreview(slashPreview()), onHoverEnd: clearPreview },
        { idx: 6, onClick: onClickBackSlash, buttonText: `バックスラッシュ-${calculateCost(skillCosts.onClickBackSlash)}`, paragraph: `左上から右下にかけての4マスのライフを0にします`, disabled: checkSkillDisable(skillCosts.onClickBackSlash), onHoverStart: () => showPreview(backSlashPreview()), onHoverEnd: clearPreview },
        { idx: 7, onClick: onClickTsunami, buttonText: `チューチュートレイン-${calculateCost(skillCosts.onClickTsunami)}`, paragraph: `相手のマジックを0にします`, disabled: checkSkillDisable(skillCosts.onClickTsunami) },
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
            disabled: checkSkillDisable(skillCosts.onClickProliferate) || (heartTurn ? heartProliferate : circleProliferate),
        },
    ];

    return (
        <div className={styles.game}>
            <div className={styles.main}>
                {playerPanel('💙')}
                <div className={styles.boardWrap}>
                    <Status winner={winner} nextPlayer={heartTurn ? '💙' : '⭕'} life={life} />
                    <div className={`${styles.boardArea}${boardEffect?.type === 'stomp' ? ` ${styles.shake}` : ''}`}>
                        <Board
                            squares={currentBoard}
                            onPlay={onCellClick}
                            destroyCells={highlightedCells}
                            previewCells={previewCells}
                            onCellHover={onCellHover}
                            onCellLeave={onCellLeave}
                        />
                        <BoardEffects effect={boardEffect} />
                    </div>
                    <div className={styles.controls}>
                        <button className={styles.btn} onClick={onClickRestart}>
                            リスタート
                        </button>
                        {isBothAI && (
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
                {playerPanel('⭕')}
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
                        hidden={(heartTurn ? props.heartSelectedCharacter : props.circleSelectedCharacter) !== 'tactician'}
                        disabled={checkSkillDisable(totalAssaultCost - 2)}
                    />
                    <SkillButton
                        onClick={onClickStomp}
                        buttonText={`ストンプ-${skillCosts.onClickStomp}`}
                        paragraph={'クリックしたセルと周囲1マスを破壊します'}
                        hidden={(heartTurn ? props.heartSelectedCharacter : props.circleSelectedCharacter) !== 'giant'}
                        disabled={checkSkillDisable(skillCosts.onClickStomp)}
                    />
                    <SkillButton
                        onClick={onClickJudgeDay}
                        buttonText={`審判の日-${judgeDayCost}`}
                        paragraph='セルをクリックし、審判を下します コストは使用したスキルの回数軽減されます(使用後はカウントがリセットされます)'
                        hidden={(heartTurn ? props.heartSelectedCharacter : props.circleSelectedCharacter) !== 'magician'}
                        disabled={checkSkillDisable(judgeDayCost)}
                    />
                    <SkillButton
                        onClick={onClickToggleYingYang}
                        buttonText={`陰陽転化-${skillCosts.onClickToggleYingYang}`}
                        paragraph={`陰陽のモードを切り替えます 現在のモード:${heartTurn ? heartYinYangModeName : circleYinYangModeName}`}
                        hidden={(heartTurn ? props.heartSelectedCharacter : props.circleSelectedCharacter) !== 'yinYangMaster'}
                        disabled={checkSkillDisable(skillCosts.onClickToggleYingYang)}
                    />
                    <SkillButton
                        onClick={onClickNecromancy}
                        buttonText={`蘇生-${necroCost}${necroRemain > 0 ? `(発動中:残${necroRemain})` : ''}`}
                        paragraph={`発動時に墓地の死体数だけ(最大${necromancySummonCap})ライフ${necromancyReviveLife}のコマを召喚し、${necromancyDuration}ターンの間ライフ0の敵コマを自動吸収します 墓地は盤上でコマが奪われる/消えるたびに貯まり、コスト軽減と召喚数になります(使用後リセット)`}
                        hidden={(heartTurn ? props.heartSelectedCharacter : props.circleSelectedCharacter) !== 'necromancer'}
                        disabled={checkSkillDisable(necroCost)}
                    />
                    <SkillButton
                        onClick={onClickMiasma}
                        buttonText={`ミアズマ-${miasmaCost()}`}
                        paragraph={'自陣を選択し、周囲1マスの敵コマすべてに毒を1付与します コストは盤面の毒の数だけ軽減されます'}
                        hidden={(heartTurn ? props.heartSelectedCharacter : props.circleSelectedCharacter) !== 'poisoner'}
                        disabled={(heartTurn ? heartMagic : circleMagic) < miasmaCost()}
                    />
                    <SkillButton
                        onClick={onClickYingYangSkll}
                        buttonText={`${(heartTurn ? heartYinYangMode : circleYinYangMode) === 'yang' ? '豊穣の舞' : '凶荒の舞'}-${skillCosts.onClickYingYangSkill}`}
                        paragraph={`${
                            (heartTurn ? heartYinYangMode : circleYinYangMode) === 'yang'
                                ? '自身の全てのコマのライフを+2します'
                                : '相手のすべてのコマのライフを-2します 0になったコマは破壊します'
                        }`}
                        hidden={(heartTurn ? props.heartSelectedCharacter : props.circleSelectedCharacter) !== 'yinYangMaster'}
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
