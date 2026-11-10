// Game.tsx から切り出したハンドラ群: ターン開始の効果・勝敗判定まわりの useEffect 群（実行順を保つため同じ位置で呼ぶ）
// 本体は Game.tsx にあったものをそのまま移した。Game の変数は scope(g) で、あとで定義されるもの(calculateCost など)は late() 経由で受け取る
import { DragonState, applyBulwark, dragonBulwarkHolder, dragonLifeBonus, dragonMagicBonus, newDragonState } from './dragon';
import { BurstType } from './BoardEffects';
import { RampState } from './gear';
import { GearTurnState } from './gearTurn';
import { lifeZeroVictims } from './gearTurn';
import { rampAfterRoll, rampBonus } from './gear';
import React from 'react';
import { useEffect, useRef } from 'react';
import { CharacterId, YingYangMode } from '../../types/Character';
import { Player, seatOf } from '../../types/Player';
import { SquareInfo } from '../../types/SquareInfo';
import { calculateWinner, isShikigami, lineSymbols, randomPick, calculateLife, LIFE_STD } from '../../util';
import { breakDeadlock, isDeadlocked } from './deadlock';
import { advanceGearState } from './gearTurn';
import { turnStartMagic, proliferateUpkeep } from './turn';
import { activeObjectCount, effectSnapshot, EffectSnapshot, enforceEffectRules, objectLifeBonus, objectTurnStart, sweepBurntTrees } from './objects';
import { SkillEffectType } from './BoardEffects';
import { placeWardPiece } from './graveSkills';
import { detonate } from './thermal';
import { GearId, GEAR_PARAMS, hasGear, springThunderThaw, gearLifeBonus, gearLifeStd, countVarietySquares, frozenBudCount, rootGain, rentGain, applyRubble, objectBuildLife } from './gear';
import { Discount } from './discount';
import { BoardGeometry } from './boardGeometry';
import { PlayEffectExtra } from './usePresentation';
import { GameLate } from './gameLate';

export interface TurnEffectsScope {
    playBurst: (type: BurstType, cells: number[]) => void;
    setSkillBanAt: (seat: number, value: { mode: "max" | "min"; n: number; } | ((prev: { mode: "max" | "min"; n: number; } | null) => { mode: "max" | "min"; n: number; } | null) | null) => void;
    setReaperSweeps: React.Dispatch<React.SetStateAction<number>>;
    rampRef: React.MutableRefObject<{ states: RampState[]; turn: number; counted: boolean; bonus: number; first: number | null }>;
    currentBoard: SquareInfo[];
    lastStandHolderFor: (w: Player) => number;
    /** 龍神の巫女（#527）: 席ごとの形態と、更新関数 */
    dragon: DragonState[];
    setDragonAt: (seat: number, value: DragonState | ((prev: DragonState) => DragonState)) => void;
    lastStandUsed: React.MutableRefObject<boolean[]>;
    geo: BoardGeometry;
    symbols: ("💙" | "⭕" | "🟩" | "🔶" | "⭐" | "🟣" | "🟫" | "🩷")[];
    addLog: (message: string) => void;
    setCurrentBoard: React.Dispatch<React.SetStateAction<SquareInfo[]>>;
    setLastStandSaves: React.Dispatch<React.SetStateAction<number>>;
    playEffect: (type: SkillEffectType, index?: number | undefined, indexes?: number[] | undefined, label?: string | undefined, extra?: PlayEffectExtra | undefined) => void;
    gearTrigger: (gearId: GearId, text?: string | undefined) => void;
    currentTurn: number;
    characters: CharacterId[];
    placements: number;
    deadlockRef: React.MutableRefObject<{ placements: number; turn: number; }>;
    seatCount: number;
    setGameLog: React.Dispatch<React.SetStateAction<string[]>>;
    flashCells: (indexes: number[]) => void;
    gearTurn: React.MutableRefObject<GearTurnState & { infernoReady: boolean[]; freeCast: boolean; processedTurn: number }>;
    effectSnap: React.MutableRefObject<EffectSnapshot | null>;
    turnSeat: number;
    posName: (i: number) => string;
    ruinState: React.MutableRefObject<{ active: boolean[]; pending: boolean[]; snap: ("💙" | "⭕" | "🟩" | "🔶" | "⭐" | "🟣" | "🟫" | "🩷" | undefined)[] | null; snapBuds: number[] | null; snapFlames: number[] | null; ashActive: number[]; ashPending: number[]; lastMove: number | null; }>;
    gearsBySeat: GearId[][];
    setMagicAt: (seat: number, value: number | ((prev: number) => number)) => void;
    budGuard: boolean[];
    setBudGuardAt: (seat: number, value: boolean | ((prev: boolean) => boolean)) => void;
    glacierPending: boolean[];
    setGlacierPendingAt: (seat: number, value: boolean | ((prev: boolean) => boolean)) => void;
    withOverload: (board: SquareInfo[]) => SquareInfo[];
    lastStandActiveAgainst: (seat: number) => boolean;
    magic: number[];
    yinYangMode: (YingYangMode | undefined)[];
    proliferate: boolean[];
    proliferateCount: number[];
    setProliferateAt: (seat: number, value: boolean | ((prev: boolean) => boolean)) => void;
    setProliferateCountAt: (seat: number, value: number | ((prev: number) => number)) => void;
    setSilencedAt: (seat: number, value: boolean | ((prev: boolean) => boolean)) => void;
    setLifeBanAt: (seat: number, value: boolean | ((prev: boolean) => boolean)) => void;
    setGearOffAt: (seat: number, value: boolean | ((prev: boolean) => boolean)) => void;
    setChargeBuffAt: (seat: number, value: number | ((prev: number) => number)) => void;
    currentCharacter: CharacterId;
    setLife: React.Dispatch<React.SetStateAction<number>>;
    setUseToken: React.Dispatch<React.SetStateAction<boolean>>;
    setTurnSeat: React.Dispatch<React.SetStateAction<number>>;
    setSkills: React.Dispatch<React.SetStateAction<number[]>>;
    reshuffledSkills: (deck: number[], locks: number[]) => number[];
    deckBySeat: number[][];
    lockedSkills: number[][];
    history: SquareInfo[][];
}
export const useTurnEffects = (g: TurnEffectsScope, late: () => GameLate) => {
    const { dragon, setDragonAt, currentBoard, lastStandHolderFor, lastStandUsed, geo, symbols, addLog, setCurrentBoard, setLastStandSaves, playEffect, gearTrigger, currentTurn, characters, placements, deadlockRef, seatCount, setGameLog, flashCells, gearTurn, effectSnap, turnSeat, posName, ruinState, gearsBySeat, setMagicAt, budGuard, setBudGuardAt, glacierPending, setGlacierPendingAt, withOverload, lastStandActiveAgainst, magic, yinYangMode, proliferate, proliferateCount, setProliferateAt, setProliferateCountAt, setSilencedAt, setLifeBanAt, setGearOffAt, setChargeBuffAt, currentCharacter, setLife, setUseToken, setTurnSeat, setSkills, reshuffledSkills, deckBySeat, lockedSkills, history, rampRef, setReaperSweeps, setSkillBanAt, playBurst } = g;


    // 土壇場の防壁: 初めて相手が列を揃えたとき、かわりにその列のマスを消滅させる（ロック・氷結を貫通）。
    // 手番の効果(下の [currentTurn])より先に宣言して、同じ描画で手番が進んでも相手ボーナスに間に合わせる
    useEffect(() => {
        const w = calculateWinner(lineSymbols(currentBoard));
        if (!w) return;
        // 龍の防壁（龍神の巫女・#527）: 龍のあいだに相手が列を揃えたら、かわりにその列と自陣のコマが消滅して巫女に戻る
        const dragonHolder = dragonBulwarkHolder(characters, dragon, symbols, w);
        if (dragonHolder >= 0) {
            const board = currentBoard.slice();
            applyBulwark(board, w, symbols[dragonHolder]);
            setDragonAt(dragonHolder, newDragonState());
            addLog(`${symbols[dragonHolder]}の龍の防壁: ${w}の揃った列と自陣のコマが消滅。巫女に戻る`);
            setCurrentBoard(board);
            playEffect('bulwark');
            return;
        }
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

    // 瓦礫の礎: 自陣の大岩以外のオブジェクトが（自分以外の手番に）壊されたら、その位置に大岩を置いて魔力を得る。
    // 自分の手番に消える建造物（龍神の巫女の覚醒で自分から消すもの）は壊されたことに数えない。盤面が変わるたびに直前の盤面と比べる
    const rubbleBoard = useRef<SquareInfo[] | null>(null);
    useEffect(() => {
        const prev = rubbleBoard.current;
        rubbleBoard.current = currentBoard;
        if (!prev || prev.length !== currentBoard.length) return;
        for (let seat = 0; seat < symbols.length; seat++) {
            if (seat === turnSeat || !hasGear(gearsBySeat[seat], 'rubbleBase')) continue;
            const r = applyRubble(prev, currentBoard, symbols[seat], objectBuildLife(gearsBySeat[seat]));
            if (r.cells.length === 0) continue;
            const magicGain = r.cells.length * GEAR_PARAMS.rubbleMagic;
            rubbleBoard.current = r.board;
            setCurrentBoard(r.board);
            setMagicAt(seat, (m) => m + magicGain);
            addLog(`${symbols[seat]}の瓦礫の礎: 壊されたオブジェクト${r.cells.length}つの位置に大岩を設置（魔力+${magicGain}）`);
            gearTrigger('rubbleBase', `大岩${r.cells.length}つ・魔力+${magicGain}`);
            return;
        }
    }, [currentBoard]);

    useEffect(() => {
        if (currentTurn === 1) {
            return;
        }
        const nextSeat = late().judgeNextSeat();
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
        late().setUseLock(0);
        late().setUseFreeze(false);
        late().setUseSucker(false);
        late().setUseIgnite(false);
        late().setUseSwidden(false);
        late().setUseSacrifice(false);
        late().setUseKimon(false);
        late().setUseStash(false);
        late().setUseBoltSilence(0);
        late().setUseThunderFire(false);
        late().setUseFrostArea(false);
        late().setUseIcicle(false);
        late().setUseFreezeSpread(false);
        late().setUseShatter(false);
        late().setUseShikigamiPlace(false);
        late().setUseShikigamiBlast(false);
        late().setUseShikigamiBless(false);
        late().setUseShikigamiCurse(false);
        late().setUseShikigamiPurge(false);
        late().setObjectPlacing(null);
        late().setObjectTool(null);
        late().setCaptureChoice(null);
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
                late().addCorpses(r.destroyed.length);
            }
            // 春雷: 次の手番の席の自陣のリーチの4つ目が氷結した空きマスなら、その❄を1つ解く（gear.ts）
            if (hasGear(gearsBySeat[seatOf(nextSymbol)], 'springThunder')) {
                const thawed = springThunderThaw(turnBoard, nextSymbol);
                if (thawed.length > 0) {
                    addLog(`春雷が${thawed.map(posName).join('・')}の❄を1つ解いた`);
                    flashCells(thawed);
                    gearTrigger('springThunder', `${thawed.map(posName).join('・')}の❄を解く`);
                    playBurst('gearThunder', thawed);
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
        // 地代: 働いている自陣のオブジェクト1つにつき+1（上限なし）
        const rent = hasGear(gearsBySeat[nextSeat], 'groundRent') ? rentGain(activeObjectCount(currentBoard, nextSymbol)) : 0;
        if (rent > 0) gearTrigger('groundRent', `魔力+${rent}`);
        let nextMagic: number = turnStartMagic({
            magic: magic[nextSeat],
            turn: currentTurn,
            seatCount,
            character: nextCharacter,
            yinYangMode: yinYangMode[nextSeat],
            buds: late().activeBudsCount(nextSymbol),
            garden,
            standBonus,
            scorch: scorchForNext,
            root,
            objects: objectMagicForNext,
            rent,
            dragon: dragonMagicBonus(dragon[nextSeat]),
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
        // 雪だるま: 手番ごとに期待値が1段積み上がり、10以上のライフが3回出たらリセット
        const rampOn = hasGear(nextGears, 'snowball');
        const ramp = rampRef.current;
        if (rampOn && ramp.turn !== currentTurn) {
            ramp.bonus = rampBonus(ramp.states[nextSeat]);
            ramp.turn = currentTurn;
            ramp.counted = false;
        }
        const nextLife = calculateLife(
            nextCharacter,
            yinYangMode[nextSeat],
            (nextCharacter === 'poisoner' ? late().poisonCount(nextSymbol) : 0) +
                gearLifeBonus(nextGears) +
                (rampOn ? ramp.bonus : 0) +
                objectLifeForNext + // 生命の泉
                dragonLifeBonus(dragon[nextSeat]) + // 龍神の巫女（龍）: ベース+N+4
                (standBonus ? GEAR_PARAMS.lastStandLife : 0),
            gearLifeStd(nextGears, LIFE_STD)
        );
        if (rampOn && !ramp.counted) {
            ramp.states[nextSeat] = rampAfterRoll(ramp.states[nextSeat], nextLife);
            ramp.counted = true;
            if (ramp.states[nextSeat].stack === 0) gearTrigger('snowball', '積み上げがリセット');
        }
        // サイレンスは「封じられた側の手番が終わるたび」に解除
        setSilencedAt(turnSeat, false);
        setSkillBanAt(turnSeat, null);
        setLifeBanAt(turnSeat, false);
        // 裸の王様も同じく、ギアを封じられた側の手番が終わるたびに解除
        setGearOffAt(turnSeat, false);
        // 静電気の季節の残りターンは、自分の手番が終わるたびに1減る
        setChargeBuffAt(turnSeat, (v) => Math.max(0, v - 1));
        // 蘇生の残りターンは「発動した側の手番が終わるたび」に減る
        if (currentCharacter === 'necromancer' && late().remainNecro[turnSeat] > 0) {
            late().setRemainNecroAt(turnSeat, late().remainNecro[turnSeat] - 1);
        }
        setLife(nextLife > 0 ? nextLife : 1);
        setUseToken(false);
        setTurnSeat(nextSeat);
    }, [currentTurn]);

    // 死神の鎌: ライフ0の駒を手番の終わりに壊す（勝負が付いていなければ）。手番の効果のあとに走らせる
    useEffect(() => {
        if (currentTurn === 1) return;
        if (calculateWinner(currentBoard.map((x) => x.player))) return;
        const victims = lifeZeroVictims(currentBoard, characters, gearsBySeat);
        if (victims.length === 0) return;
        const board = currentBoard.slice();
        for (const k of victims) board[k] = { player: undefined, bind: 0, effects: [] };
        setCurrentBoard(board);
        late().addCorpses(victims.length);
        addLog(`死神の鎌: ライフ0の${victims.length}コマが壊れた`);
        gearTrigger('reaper', `${victims.length}コマが壊れた`);
        playBurst('gearReap', victims);
        flashCells(victims);
        setReaperSweeps((c) => c + 1);
    }, [currentTurn]);

    useEffect(() => {
        // 次に手番が来るプレイヤーのロックを固定して再シャッフル。
        // チャージのように盤面(history)が変わらずにターンだけ進む場合も、次の席の手札を引き直す（currentTurn も依存に含める）。
        // 含めないと、チャージで手番を渡したとき次の席が前の席の手札をそのまま引き継いでしまう（sim は毎手番引き直す）
        setSkills(reshuffledSkills(deckBySeat[late().judgeNextSeat()], lockedSkills[late().judgeNextSeat()]));
    }, [history, currentTurn]);

    return {  };
};
