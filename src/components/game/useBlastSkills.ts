// Game.tsx から切り出したスキルのハンドラ群: 津波・突撃・帯電の仕上げ・ストンプ・審判の日など
// 本体は Game.tsx の同じ位置にあったものをそのまま移した。Game の変数は scope(g) で、あとで定義されるもの(calculateCost など)は late() 経由で受け取る
import { GearTurnState } from './gearTurn';
import { SkillCosts } from './skillCosts';
import React from 'react';
import { useState } from 'react';
import { CharacterId } from '../../types/Character';
import { SquareInfo } from '../../types/SquareInfo';
import { stomp as stompOf, judgeDay as judgeDayOf } from './blast';
import { judgeDayBase, totalAssaultBase } from './cost';
import { SkillEffectType, BurstType } from './BoardEffects';
import { proliferateStep } from './proliferate';
import { BOLT_SILENCE_BOLTS, withCharge, releaseCharges, chargeStacks, stashTargets as stashTargetsOf, bristleTargets as bristleTargetsOf, boltSilenceTargets as boltSilenceTargetsOf, thunderFireTargets as thunderFireTargetsOf, stashBolts, payBolt, thunderFire } from './charge';
import { GearId } from './gear';
import { useSeatArray } from './useSeatArray';
import { Discount } from './discount';
import { BoardGeometry } from './boardGeometry';
import { PendingMode } from './pendingMode';
import { PlayEffectExtra } from './usePresentation';
import { GameLate } from './gameLate';

export interface BlastSkillsScope {
    addLog: (message: string) => void;
    otherSeats: (seat: number) => number[];
    turnSeat: number;
    setMagicAt: (seat: number, value: number | ((prev: number) => number)) => void;
    playEffect: (type: SkillEffectType, index?: number | undefined, indexes?: number[] | undefined, label?: string | undefined, extra?: PlayEffectExtra | undefined) => void;
    spendMagic: (cost: number, bumpCount?: boolean, isSkill?: boolean, skillId?: string) => void;
    seatCosts: SkillCosts;
    currentTurnPlayer: "💙" | "⭕" | "🟩" | "🔶" | "⭐" | "🟣" | "🟫" | "🩷";
    setCurrentTurn: React.Dispatch<React.SetStateAction<number>>;
    currentTurn: number;
    currentBoard: SquareInfo[];
    harvestMagic: (n: number) => void;
    setCurrentBoard: React.Dispatch<React.SetStateAction<SquareInfo[]>>;
    gearCost: (cost: number, seat?: number, isToken?: boolean, skillKey?: string, withLeaf?: boolean) => number;
    useTokenCount: number[];
    seatCount: number;
    setUseTokenCountAt: (seat: number, value: number | ((prev: number) => number)) => void;
    currentCharacter: CharacterId;
    characters: CharacterId[];
    posName: (i: number) => string;
    proliferateTokenLife: number;
    toxicBloom: (board: SquareInfo[], cells: number[]) => void;
    setChargeBuffAt: (seat: number, value: number | ((prev: number) => number)) => void;
    flashCells: (indexes: number[]) => void;
    withOverload: (board: SquareInfo[]) => SquareInfo[];
    pendingFlag: (m: PendingMode) => [boolean, (on: boolean) => void];
    geo: BoardGeometry;
    keepBuds: (sq: SquareInfo) => boolean;
    playBurst: (type: BurstType, cells: number[]) => void;
    gearTurn: React.MutableRefObject<GearTurnState & { infernoReady: boolean[]; freeCast: boolean; processedTurn: number }>;
    setSilencedAt: (seat: number, value: boolean | ((prev: boolean) => boolean)) => void;
    baseGearsBySeat: GearId[][];
    gearOff: boolean[];
    symbols: ("💙" | "⭕" | "🟩" | "🔶" | "⭐" | "🟣" | "🟫" | "🩷")[];
    setGearOffAt: (seat: number, value: boolean | ((prev: boolean) => boolean)) => void;
    proliferateUpkeepStep: number;
    setProliferateAt: (seat: number, value: boolean | ((prev: boolean) => boolean)) => void;
    setProliferateCountAt: (seat: number, value: number | ((prev: number) => number)) => void;
    life: number;
    useMagicCount: number[];
    setUseMagicCountAt: (seat: number, value: number | ((prev: number) => number)) => void;
    turnGears: GearId[];
}
export const useBlastSkills = (g: BlastSkillsScope, late: () => GameLate) => {
    const { addLog, otherSeats, turnSeat, setMagicAt, playEffect, spendMagic, seatCosts, currentTurnPlayer, setCurrentTurn, currentTurn, currentBoard, harvestMagic, setCurrentBoard, gearCost, useTokenCount, seatCount, setUseTokenCountAt, currentCharacter, characters, posName, proliferateTokenLife, toxicBloom, setChargeBuffAt, flashCells, withOverload, pendingFlag, geo, keepBuds, playBurst, gearTurn, setSilencedAt, baseGearsBySeat, gearOff, symbols, setGearOffAt, proliferateUpkeepStep, setProliferateAt, setProliferateCountAt, life, useMagicCount, setUseMagicCountAt, turnGears } = g;


    const onClickTsunami = () => {
        addLog('「チューチュートレイン」を使用（相手全員のマジックを0に・ターン終了）');
        otherSeats(turnSeat).forEach((seat) => setMagicAt(seat, 0));
        playEffect('tsunami');
        spendMagic(late().calculateCost(seatCosts.onClickTsunami, false, false, currentTurnPlayer, 'onClickTsunami'), true, true, 'onClickTsunami');
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
        spendMagic(late().calculateCost(seatCosts.onClickWalpurgisNight, false, false, currentTurnPlayer, 'onClickWalpurgisNight'), true, true, 'onClickWalpurgisNight');
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
        spendMagic(late().calculateCost(seatCosts.onClickChargeSeason, false, false, currentTurnPlayer, 'onClickChargeSeason'), true, true, 'onClickChargeSeason');
    };
    // 総毛立つ: 自陣の全てのコマ（🔑ロック中を除く）に⚡を1つずつ付ける。雷霆の巫以外は乗った時点でダメージを受ける
    const bristleTargets = (): number[] => bristleTargetsOf(currentBoard, currentTurnPlayer);
    const onClickBristle = () => {
        const cells = bristleTargets();
        if (cells.length === 0) return;
        addLog(`「総毛立つ」を使用（自陣${cells.length}コマに⚡）`);
        flashCells(cells);
        playEffect('bristle', undefined, cells);
        setCurrentBoard(withOverload(withCharge(currentBoard, cells, characters)));
        spendMagic(late().calculateCost(seatCosts.onClickBristle, false, false, currentTurnPlayer, 'onClickBristle'), true, true, 'onClickBristle');
    };

    // 雷のない所に火は立たぬ: ⚡のあるコマを1つ選んで破壊し（氷結中なら❄-1だけ）、周囲8マスの敵コマのうち2〜全部をランダムに選んで🔥を1つずつ付ける。
    // 選べるのは⚡のあるコマ。自分の無敵マスは選べるが、🔑ロック中のコマと他人の無敵マスは選べない
    const [useThunderFire, setUseThunderFire] = pendingFlag('thunderFire');
    const thunderFireTargets = (): number[] => thunderFireTargetsOf(currentBoard, currentTurnPlayer, characters);
    const onClickThunderFire = () => {
        addLog('「雷のない所に火は立たぬ」を使用（⚡のあるコマを選択）');
        setUseThunderFire(true);
        spendMagic(late().calculateCost(seatCosts.onClickThunderFire, false, false, currentTurnPlayer, 'onClickThunderFire'), true, true, 'onClickThunderFire');
    };
    const exeThunderFire = (i: number) => {
        const board = currentBoard.slice();
        setUseThunderFire(false);
        const { frozen, picks, thawed } = thunderFire(board, i, currentTurnPlayer, characters, geo.size, Math.random, keepBuds);
        if (frozen) {
            // 氷結中のコマは破壊されず❄が1つ減るだけ。破壊できなかったので火は燃え移らない
            addLog(`${posName(i)}の氷結を1つ砕いた（コマは壊れず、火は燃え移らない）`);
            playBurst('iceBreak', [i]);
            setCurrentBoard(board);
            return;
        }
        late().addCorpses(1);
        addLog(`${posName(i)}のコマを破壊し、周囲の敵${picks.length}コマに🔥`);
        if (thawed.length > 0) addLog(`氷結が溶けた（${thawed.map(posName).join('・')}）`);
        flashCells([i, ...picks]);
        playEffect('thunderFire', i, [i, ...picks]);
        playBurst('thaw', thawed);
        setCurrentBoard(board);
    };

    // 雷神のへそくり: 自陣のコマを1つ選んで⚡を全て取り除き、取り除いたスタック1つにつき、次に打つスキルのコストを-1する（軽減後は最低1）
    const [useStash, setUseStash] = pendingFlag('stash');
    const stashTargets = (): number[] => stashTargetsOf(currentBoard, currentTurnPlayer);
    const onClickStash = () => {
        addLog('「雷神のへそくり」を使用（⚡のある自陣のコマを選択）');
        setUseStash(true);
        spendMagic(late().calculateCost(seatCosts.onClickStash, false, false, currentTurnPlayer, 'onClickStash'), true, true, 'onClickStash');
    };
    const exeStash = (i: number) => {
        if (chargeStacks(currentBoard[i]) === 0) return;
        const board = currentBoard.slice();
        const n = stashBolts(board, i);
        const d = gearTurn.current.discount[turnSeat];
        gearTurn.current.discount[turnSeat] = { ...d, next: d.next + n }; // 軽減札なので「次に打つスキル」を消費せず、足す
        addLog(`${posName(i)}の⚡${n}個を除去（次のスキル-${n}）`);
        flashCells([i]);
        playEffect('stash', i, [i]);
        setUseStash(false);
        setCurrentBoard(board);
    };

    // 沈黙は雷なり: 自陣の⚡を1つ選んで1スタック払い、相手全員が次の手番スキルを使えなくなる（自陣に⚡が無いと使えない）
    const [useBoltSilence, setUseBoltSilence] = useState<number>(0); // あと何個の⚡を選んで払うか（0=使っていない）
    const boltSilenceTargets = (): number[] => boltSilenceTargetsOf(currentBoard, currentTurnPlayer);
    const boltSilenceLegal = (): boolean => boltSilenceTargets().reduce((n, i) => n + chargeStacks(currentBoard[i]), 0) >= BOLT_SILENCE_BOLTS;
    const onClickBoltSilence = () => {
        if (!boltSilenceLegal()) return;
        addLog(`「沈黙は雷なり」を使用（⚡のある自陣のコマを選んで⚡を${BOLT_SILENCE_BOLTS}個払う）`);
        setUseBoltSilence(BOLT_SILENCE_BOLTS);
        spendMagic(late().calculateCost(seatCosts.onClickBoltSilence, false, false, currentTurnPlayer, 'onClickBoltSilence'), true, true, 'onClickBoltSilence');
    };
    const exeBoltSilence = (i: number) => {
        const board = currentBoard.slice();
        if (!payBolt(board, i)) return;
        flashCells([i]);
        const left = useBoltSilence - 1;
        setUseBoltSilence(left);
        if (left === 0) {
            addLog(`${posName(i)}の⚡を払い切った。相手は次の手番スキルを使えない`);
            playEffect('boltSilence', i);
            otherSeats(turnSeat).forEach((seat) => setSilencedAt(seat, true));
        } else {
            addLog(`${posName(i)}の⚡1個を払った（あと${left}個）`);
        }
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
        spendMagic(late().calculateCost(seatCosts.onClickRelease, false, false, currentTurnPlayer, 'onClickRelease'), true, true, 'onClickRelease');
    };

    // 裸の王様: 自分以外の全員のギアが、その席の次の手番の終わりまで無効になる（対象はギアを装備していて、まだ無効でない席）。クリック不要・手番は続く
    const stripTargets = (): number[] => otherSeats(turnSeat).filter((seat) => baseGearsBySeat[seat].length > 0 && !gearOff[seat]);
    const onClickStrip = () => {
        const seats = stripTargets();
        if (seats.length === 0) return;
        addLog(`「裸の王様」を使用（${seats.map((seat) => symbols[seat]).join('・')}のギアが次の手番の終わりまで無効）`);
        playEffect('strip');
        seats.forEach((seat) => setGearOffAt(seat, true));
        spendMagic(late().calculateCost(seatCosts.onClickStrip, false, false, currentTurnPlayer, 'onClickStrip'), true, true, 'onClickStrip');
    };

    // サイレンス: 自分以外の全員が、次の手番にスキルを使えなくなる
    const onClickSilence = () => {
        addLog('「サイレンス」を使用（相手は次の手番スキルを使えない）');
        playEffect('silence');
        otherSeats(turnSeat).forEach((seat) => setSilencedAt(seat, true));
        spendMagic(late().calculateCost(seatCosts.onClickSilence, false, false, currentTurnPlayer, 'onClickSilence'), true, true, 'onClickSilence');
    };

    const onClickProliferate = () => {
        addLog(`「増殖」を使用（以後の着手ごとにコマ⇄アイテムを追加。維持コストが毎回+${proliferateUpkeepStep}）`);
        playEffect('proliferate');
        setProliferateAt(turnSeat, true);
        setProliferateCountAt(turnSeat, 0);
        spendMagic(late().calculateCost(seatCosts.onClickProliferate, false, false, currentTurnPlayer, 'onClickProliferate'), true, true, 'onClickProliferate');
    };

    const [useStomp, setUseStomp] = pendingFlag('stomp');
    const onClickStomp = () => {
        addLog('「ストンプ」を使用（マスを選択）');
        setUseStomp(true);
        spendMagic(gearCost(seatCosts.onClickStomp, turnSeat, false, 'onClickStomp'), false, true, 'onClickStomp');
    };

    // ストンプの破壊範囲 (クリックしたマスの周囲1マス)
    const exeStomp = (i: number, currentBoard: SquareInfo[]) => {
        const { range, destroyed, broken } = stompOf(currentBoard, i, currentTurnPlayer, life);
        late().addCorpses(destroyed);
        addLog(`${posName(i)}を中心にストンプを実行`);
        flashCells(range);
        playEffect('stomp', i);
        playBurst('iceBreak', broken);
        setCurrentBoard(currentBoard);
        setUseStomp(false);
    };

    const baseJudgeDayCost = seatCosts.onClickJudgeDay;
    const judgeDayCost = gearCost(judgeDayBase(baseJudgeDayCost, useMagicCount[turnSeat]), turnSeat, false, 'onClickJudgeDay');
    const [useJudgeDay, setUseJudgeDay] = pendingFlag('judgeDay');
    const onClickJudgeDay = () => {
        addLog('「審判の日」を使用（マスを選択）');
        spendMagic(judgeDayCost, false, true, 'onClickJudgeDay');
        setUseMagicCountAt(turnSeat, 0);
        setUseJudgeDay(true);
    };

    // 審判の日の対象範囲

    const exeJudgeDay = (i: number) => {
        const board = currentBoard.slice();
        const { range: judgeIndexes, destroyed, broken } = judgeDayOf(board, i, currentTurnPlayer, { gears: turnGears, seat: turnSeat });
        late().addCorpses(destroyed);

        setUseMagicCountAt(turnSeat, 0);

        addLog(`${posName(i)}を中心に審判の日を実行`);
        flashCells(judgeIndexes);
        playEffect('judge', i);
        playBurst('iceBreak', broken);
        setCurrentBoard(board);
        setUseJudgeDay(false);
        setCurrentTurn(currentTurn + 1);
    };

    return { onClickTsunami, onClickWalpurgisNight, onClickTotalAssault, onClickStomp, onClickJudgeDay, onClickProliferate, onClickSilence, onClickStrip, onClickChargeSeason, onClickBristle, onClickRelease, onClickStash, onClickBoltSilence, onClickThunderFire, judgeDayCost, totalAssaultCost, setUseStash, setUseBoltSilence, setUseThunderFire, useThunderFire, thunderFireTargets, exeThunderFire, useBoltSilence, boltSilenceTargets, exeBoltSilence, useStash, stashTargets, exeStash, useStomp, exeStomp, useJudgeDay, exeJudgeDay, useAssault, setUseAssaultAt, applyProliferate, setUseStomp, setUseJudgeDay, setUseAssaultAll, stripTargets, bristleTargets, ownChargeStacks, boltSilenceLegal };
};

export type BlastSkillsResult = ReturnType<typeof useBlastSkills>;
