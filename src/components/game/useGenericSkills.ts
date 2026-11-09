// Game.tsx から切り出したスキルのハンドラ群: 汎用スキル（雷を食らわば皿まで・小物・初霜・吹き寄せ・山焼き・超助っ人 ほか）
// 本体は Game.tsx の同じ位置にあったものをそのまま移した。Game の変数は scope(g) で、あとで定義されるもの(calculateCost など)は late() 経由で受け取る
import { GearTurnState } from './gearTurn';
import { SkillCosts } from './skillCosts';
import React from 'react';
import { CharacterId } from '../../types/Character';
import { Player } from '../../types/Player';
import { SquareInfo } from '../../types/SquareInfo';
import { randomAnyPick, findEmptyIndexes, randomPick } from '../../util';
import { TokenKind, PutContext, PlacedToken } from './tokenPlace';
import { SkillEffectType, BurstType } from './BoardEffects';
import { baseCostOf, skillOf } from './deck';
import { withCharge, healCharged, reducedChargeCost, randomChargeCandidates, applyJammer, chargeHealTargets } from './charge';
import { ownCharges } from './comboCost';
import { firstFrost, firstFrostTargets, burnOff, burnOffTargets, gather } from './tokenSkills';
import { smallFry, placeBlocked } from './lifeBan';
import { perfectGame, pickHelperEffect, SECOND_CATCH_MAX_BASE } from './bigSkills';
import { corpseCount, graveDiscountAmount, graveOfferingTarget, POISON_WARD_TURNS } from './graveSkills';
import { TokenEffect } from './gear';
import { Discount } from './discount';
import { BoardGeometry } from './boardGeometry';
import { PendingMode } from './pendingMode';
import { PlayEffectExtra } from './usePresentation';
import { GameLate } from './gameLate';

export interface GenericSkillsScope {
    currentBoard: SquareInfo[];
    currentTurnPlayer: "💙" | "⭕" | "🟩" | "🔶" | "⭐" | "🟣" | "🟫" | "🩷";
    addLog: (message: string) => void;
    flashCells: (indexes: number[]) => void;
    playEffect: (type: SkillEffectType, index?: number | undefined, indexes?: number[] | undefined, label?: string | undefined, extra?: PlayEffectExtra | undefined) => void;
    setCurrentBoard: React.Dispatch<React.SetStateAction<SquareInfo[]>>;
    spendMagic: (cost: number, bumpCount?: boolean, isSkill?: boolean, skillId?: string) => void;
    seatCosts: SkillCosts;
    gearTurn: React.MutableRefObject<GearTurnState & { infernoReady: boolean[]; freeCast: boolean; processedTurn: number }>;
    turnSeat: number;
    characters: CharacterId[];
    addCorpses: (n: number) => void;
    otherSeats: (seat: number) => number[];
    setLifeBanAt: (seat: number, value: boolean | ((prev: boolean) => boolean)) => void;
    useToken: boolean;
    bumpGlacierCharge: (n: number) => void;
    putTokens: (board: SquareInfo[], kind: TokenKind, n: number, extra?: Partial<PutContext>, afterPut?: ((board: SquareInfo[], idx: number) => void) | undefined) => { report: () => void; placed: PlacedToken[]; granted: number; };
    posName: (i: number) => string;
    setUseToken: React.Dispatch<React.SetStateAction<boolean>>;
    calculateTokenBind: () => number;
    geo: BoardGeometry;
    keepBuds: (sq: SquareInfo) => boolean;
    afterTokenPlaced: (board: SquareInfo[], idx: number, effect?: TokenEffect) => number;
    harvestMagic: (n: number) => void;
    applyLock: (board: SquareInfo[], idx: number) => void;
    playBurst: (type: BurstType, cells: number[]) => void;
    baseNecromancyCost: 10;
    necroCost: number[];
    toxicBloom: (board: SquareInfo[], cells: number[]) => void;
    withOverload: (board: SquareInfo[]) => SquareInfo[];
    deckBySeat: number[][];
    lifeBan: boolean[];
    setNecroCostAt: (seat: number, value: number | ((prev: number) => number)) => void;
    setMagicAt: (seat: number, value: number | ((prev: number) => number)) => void;
    pendingFlag: (m: PendingMode) => [boolean, (on: boolean) => void];
}
export const useGenericSkills = (g: GenericSkillsScope, late: () => GameLate) => {
    const { currentBoard, currentTurnPlayer, addLog, flashCells, playEffect, setCurrentBoard, spendMagic, seatCosts, gearTurn, turnSeat, characters, addCorpses, otherSeats, setLifeBanAt, useToken, bumpGlacierCharge, putTokens, posName, setUseToken, calculateTokenBind, geo, keepBuds, afterTokenPlaced, harvestMagic, applyLock, playBurst, baseNecromancyCost, necroCost, toxicBloom, withOverload, deckBySeat, lifeBan, setNecroCostAt, setMagicAt, pendingFlag } = g;


    // 雷を食らわば皿まで: ⚡が効いている自陣のコマのライフを、⚡のスタック1つにつき+2する。この手番に付与した⚡の数だけコスト軽減（撃つとリセット）
    const chargeHealCells = (): number[] => chargeHealTargets(currentBoard, currentTurnPlayer);
    const onClickChargeHeal = () => {
        const board = currentBoard.slice();
        const r = healCharged(board, currentTurnPlayer);
        if (r.healed.length === 0) return;
        addLog(`「雷を食らわば皿まで」を使用（${r.healed.length}コマのライフを合計+${r.total}）`);
        flashCells(r.healed);
        playEffect('thunderHeal', undefined, r.healed);
        setCurrentBoard(board);
        spendMagic(late().calculateCost(seatCosts.onClickChargeHeal, false, false, currentTurnPlayer, 'onClickChargeHeal'), true, true, 'onClickChargeHeal');
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
        playEffect('smallFry', undefined, [...r.destroyed, ...r.blocked]);
        setCurrentBoard(board);
        spendMagic(late().calculateCost(seatCosts.onClickSmallFry, false, false, currentTurnPlayer, 'onClickSmallFry'), true, true, 'onClickSmallFry');
    };

    // 初霜: 敵の🍂があるコマを全て凍結し、自陣にバッズトークンを1つ置く。トークン扱い。盤面の🍂が3枚以上ならコスト0
    const onClickFirstFrost = () => {
        if (useToken || firstFrostTargets(currentBoard, currentTurnPlayer, characters).length === 0) return;
        const pay = late().calculateCost(seatCosts.onClickFirstFrost, true, false, currentTurnPlayer, 'onClickFirstFrost'); // 凍結で🍂が休眠する前のコストで払う
        const board = currentBoard.slice();
        const frozen = firstFrost(board, currentTurnPlayer, characters);
        bumpGlacierCharge(frozen.length);
        const t = putTokens(board, 'buds', 1);
        const index: number | undefined = t.placed[0]?.idx;
        addLog(`「初霜」を使用（敵の🍂のあるコマ${frozen.length}個を凍結${index !== undefined ? `・${posName(index)}にバッズトークン` : ''}）`);
        flashCells(frozen);
        playEffect('firstFrost', index, index !== undefined ? [index, ...frozen] : frozen);
        t.report();
        setCurrentBoard(board);
        spendMagic(pay, true, true, 'onClickFirstFrost');
        setUseToken(true);
    };
    // 吹き寄せ: 自陣にトークンを置き、盤面のエフェクトを全部そのマスに集める（氷結・⚡無敵のマスは動かさない）。トークン扱い
    const onClickGather = () => {
        const empties = findEmptyIndexes(currentBoard);
        if (useToken || empties.length === 0) return;
        const pay = late().calculateCost(seatCosts.onClickGather, true, false, currentTurnPlayer, 'onClickGather'); // 移す前のエフェクトの数で軽減する
        const board = currentBoard.slice();
        const index = randomPick(empties);
        const moved = gather(board, index, { player: currentTurnPlayer, bind: calculateTokenBind() }, characters, geo.size, keepBuds);
        const granted = afterTokenPlaced(board, index);
        addLog(`「吹き寄せ」を使用（${posName(index)}にトークンを置き、エフェクト${moved}個を集めた）`);
        playEffect('gather', index, [index]);
        harvestMagic(granted);
        setCurrentBoard(board);
        spendMagic(pay, true, true, 'onClickGather');
        setUseToken(true);
    };
    // 山焼き: 敵のエフェクトがあるマス（氷結・⚡無敵を除く）全てに🔥を1つ付け、自陣にロック付きトークンを置く。トークン扱い
    const onClickBurnOff = () => {
        const empties = findEmptyIndexes(currentBoard);
        if (useToken || (empties.length === 0 && burnOffTargets(currentBoard, currentTurnPlayer, characters).length === 0)) return;
        const pay = late().calculateCost(seatCosts.onClickBurnOff, true, false, currentTurnPlayer, 'onClickBurnOff'); // 燃やす前のエフェクトの数で軽減する
        const board = currentBoard.slice();
        const r = burnOff(board, currentTurnPlayer, characters, geo.size, keepBuds);
        if (r.destroyed.length > 0) addCorpses(r.destroyed.length);
        const t = putTokens(board, 'plain', 1, undefined, (b, idx) => applyLock(b, idx)); // ロック付きで置く
        const index: number | undefined = t.placed[0]?.idx;
        addLog(`「山焼き」を使用（敵のエフェクトのあるマス${r.cells.length}個に🔥${index !== undefined ? `・${posName(index)}にロック付きトークン` : ''}）`);
        flashCells(r.cells);
        playEffect('burnOff', index, index !== undefined ? [index, ...r.cells] : r.cells);
        playBurst('thaw', r.thawed);
        t.report();
        setCurrentBoard(board);
        spendMagic(pay, true, true, 'onClickBurnOff');
        setUseToken(true);
    };
    // 無礼講: このターン、トークン系スキルのコストを0にする（手番が終わると切れる）
    const onClickFreeToken = () => {
        if (gearTurn.current.tokenFree[turnSeat]) return;
        const pay = late().calculateCost(seatCosts.onClickFreeToken, false, false, currentTurnPlayer, 'onClickFreeToken');
        gearTurn.current.tokenFree[turnSeat] = true;
        addLog('「無礼講」を使用（このターン、トークン系スキルのコストが0）');
        playEffect('freeToken');
        spendMagic(pay, true, true, 'onClickFreeToken');
    };

    // 夜の帳(idx 98): 次の相手全員の手番の間、相手のスキルコストを+3する（自分は影響を受けない）
    const onClickNightVeil = () => {
        const pay = late().calculateCost(seatCosts.onClickNightVeil, false, false, currentTurnPlayer, 'onClickNightVeil');
        otherSeats(turnSeat).forEach((seat) => { gearTurn.current.veilNext[seat] = true; });
        addLog('「夜の帳」を使用（次の相手の手番の間、相手のスキルのコスト+3）');
        playEffect('nightVeil');
        spendMagic(pay, true, true, 'onClickNightVeil');
    };
    // 弔い割引(idx 99): 墓地の死体の数（上限3）だけ、次に打つスキルのコストを軽減する（軽減札なので「次に打つスキル」を消費せず、足す）
    const graveDiscountNow = (): number => graveDiscountAmount(corpseCount(baseNecromancyCost, necroCost[turnSeat]));
    const onClickGraveDiscount = () => {
        const n = graveDiscountNow();
        if (n === 0) return;
        addLog(`「弔い割引」を使用（死体${n}体ぶん、次のスキル-${n}）`);
        spendMagic(late().calculateCost(seatCosts.onClickGraveDiscount, false, false, currentTurnPlayer, 'onClickGraveDiscount'), true, true, 'onClickGraveDiscount');
        const d = gearTurn.current.discount[turnSeat];
        gearTurn.current.discount[turnSeat] = { ...d, next: d.next + n };
        playEffect('graveDiscount');
    };
    // 毒返しの構え(idx 100): 3手番の間、相手の手番ごとに1度まで、自陣のコマが破壊/乗っ取られたらライフ4・☠付きの自陣コマを置く（置く処理は手番が変わるときの advanceGearState の結果から）
    const onClickPoisonWard = () => {
        if (gearTurn.current.ward[turnSeat] > 0) return;
        gearTurn.current.ward[turnSeat] = POISON_WARD_TURNS;
        gearTurn.current.wardFresh[turnSeat] = true;
        addLog(`「毒返しの構え」を使用（${POISON_WARD_TURNS}手番の間、自陣が破壊/乗っ取られたら毒付きのコマを置く）`);
        playEffect('poisonWard');
        spendMagic(late().calculateCost(seatCosts.onClickPoisonWard, false, false, currentTurnPlayer, 'onClickPoisonWard'), true, true, 'onClickPoisonWard');
    };

    // パーフェクトゲーム(idx 102): 盤面のコマを敵味方とも全て破壊する（🔑ロック・無敵は除き、氷結中のコマは❄-1だけ）
    const onClickPerfectGame = () => {
        const board = currentBoard.slice();
        const r = perfectGame(board, characters);
        if (r.destroyed.length > 0) addCorpses(r.destroyed.length);
        addLog(`「パーフェクトゲーム」を使用（${r.destroyed.length}個のコマを破壊${r.blocked.length > 0 ? `・氷結${r.blocked.length}個が身代わり` : ''}）`);
        flashCells([...r.destroyed, ...r.blocked]);
        playEffect('perfectGame');
        setCurrentBoard(board);
        spendMagic(late().calculateCost(seatCosts.onClickPerfectGame, false, false, currentTurnPlayer, 'onClickPerfectGame'), true, true, 'onClickPerfectGame');
    };

    // 超助っ人(idx 103): 🔥❄⚡☠🌱🍂のうちランダムな1つを付けたトークンを、自陣のランダムな空きマスに置く（トークン扱い・ターン1回）
    const onClickHelper = () => {
        const board = currentBoard.slice();
        const effect = pickHelperEffect(Math.random);
        const t = putTokens(board, 'helper', 1, { helperEffect: effect });
        if (t.placed.length > 0) {
            const index = t.placed[0].idx;
            const r = t.placed[0];
            addLog(`「超助っ人」を使用（${posName(index)}に${effect}付きのコマを設置）`);
            if (r.thawed.length > 0) addLog(`氷結が溶けた（${r.thawed.map(posName).join('・')}）`);
            playEffect('helper', index, [index]);
            playBurst('thaw', r.thawed);
            // 🌱☠⚡はトークンのエフェクトとして収穫・伝播に数える。🔥❄🍂は持たない扱い（火炎・氷結・落ち葉トークンと同じ）
            t.report();
            if (effect === '☠') toxicBloom(board, [index]);
            setCurrentBoard(effect === '⚡' ? withOverload(board) : board);
        }
        spendMagic(late().calculateCost(seatCosts.onClickHelper, true, false, currentTurnPlayer, 'onClickHelper'), true, true, 'onClickHelper');
        setUseToken(true);
    };

    // 柳の下に二匹目がいた(idx 104): 自分のデッキから、基礎コスト5以下で今撃てるスキルをランダムに1つ、コストを払わず発動する（福引きと同じ仕組み）。
    // この手番に基礎コスト7以上のスキルを使っていれば0コスト（cost.ts）
    const secondCatchPool = () =>
        deckBySeat[turnSeat]
            .filter((i) => i !== 59 && i !== 104 && baseCostOf(i) <= SECOND_CATCH_MAX_BASE)
            .map((i) => late().shuffleSkillDefs.find((d) => d.idx === i))
            .filter((d): d is NonNullable<typeof d> => !!d && !d.disabled && !placeBlocked(lifeBan[turnSeat], skillOf(d.idx)?.costKey, calculateTokenBind()));
    const onClickSecondCatch = () => {
        const pool = secondCatchPool();
        if (pool.length === 0) {
            addLog('「柳の下に二匹目がいた」: 今撃てるスキルがデッキにありません');
            return;
        }
        const second = randomPick(pool);
        addLog(`「柳の下に二匹目がいた」を使用 → ${skillOf(second.idx)?.name}が発動`);
        spendMagic(late().calculateCost(seatCosts.onClickSecondCatch, false, false, currentTurnPlayer, 'onClickSecondCatch'), true, true, 'onClickSecondCatch');
        gearTurn.current.freeCast = true;
        second.onClick();
    };

    // 墓守の供物(idx 101): 自陣のライフが最も低いコマを1つ消して、自分の墓地に死体+1・魔力+1。ネクロマンサーは「コマが消える」自動の墓地+1に含まれるので二重には数えない
    const onClickGraveOffering = () => {
        const at = graveOfferingTarget(currentBoard, currentTurnPlayer);
        if (at < 0) return;
        const pay = late().calculateCost(seatCosts.onClickGraveOffering, false, false, currentTurnPlayer, 'onClickGraveOffering');
        const board = currentBoard.slice();
        board[at] = { player: undefined, bind: 0, effects: [] };
        addLog(`「墓守の供物」を使用（${posName(at)}の自コマを消して死体+1・魔力+1）`);
        flashCells([at]);
        playEffect('graveOffering', at, [at]);
        addCorpses(1);
        if (characters[turnSeat] !== 'necromancer') setNecroCostAt(turnSeat, (cost) => Math.max(0, cost - 1));
        setCurrentBoard(board);
        spendMagic(pay, true, true, 'onClickGraveOffering');
        setMagicAt(turnSeat, (m) => m + 1);
    };

    // --- 帯電（雷霆の巫） ---
    const [useChargeOne, setUseChargeOne] = pendingFlag('chargeOne');
    const [useChargeSpread, setUseChargeSpread] = pendingFlag('chargeSpread');
    const [useChargeArea, setUseChargeArea] = pendingFlag('chargeArea');
    const [useJammer, setUseJammer] = pendingFlag('jammer');
    // 帯電付与・帯電拡散の実コスト: 基礎 - 盤面の⚡の数（キャラ補正後）、下限は CHARGE_MIN_COST (#43)
    const chargeOneCost = (player: Player = currentTurnPlayer): number =>
        reducedChargeCost(seatCosts.onClickChargeOne, currentBoard, (c) => late().calculateCost(c, false, false, player, 'onClickChargeOne'));
    const chargeSpreadCost = (player: Player = currentTurnPlayer): number =>
        reducedChargeCost(seatCosts.onClickChargeSpread, currentBoard, (c) => late().calculateCost(c, false, false, player, 'onClickChargeSpread'));
    // 帯電トークン: 空きマスにランダムに⚡付きのコマを置く（トークン扱い。発火はしない）
    const onClickChargeToken = () => {
        const board = currentBoard.slice();
        const t = putTokens(board, 'charge', 1);
        if (t.placed.length > 0) {
            const index = t.placed[0].idx;
            addLog(`「帯電トークン」を使用（${posName(index)}に設置）`);
            t.report();
            playEffect('zap', index, undefined, '帯電トークン');
            setCurrentBoard(withOverload(board));
        }
        spendMagic(late().calculateCost(seatCosts.onClickChargeToken, true, false, currentTurnPlayer, 'onClickChargeToken'), true, true, 'onClickChargeToken');
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
        const t = putTokens(board, 'charge', 2);
        const picks = t.placed.map((x) => x.idx);
        addLog(`「帯電ダブルトークン」を使用（${picks.map(posName).join('・')}に設置）`);
        if (picks.length > 0) playEffect('zap', picks[0], undefined, '帯電ダブルトークン');
        t.report();
        setCurrentBoard(withOverload(board));
        spendMagic(late().calculateCost(seatCosts.onClickDoubleChargeToken, true, false, currentTurnPlayer, 'onClickDoubleChargeToken'), true, true, 'onClickDoubleChargeToken');
        setUseToken(true);
    };
    // 範囲帯電: 選んだマスを中心に3x3（空きマス含む）へ⚡を1つずつ付与する。ターンは終わらず、ダメージもない
    const onClickChargeArea = () => {
        addLog('「範囲帯電」を使用（中心のマスを選択）');
        setUseChargeArea(true);
        spendMagic(late().calculateCost(seatCosts.onClickChargeArea, false, false, currentTurnPlayer, 'onClickChargeArea'), true, true, 'onClickChargeArea');
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
        spendMagic(late().calculateCost(seatCosts.onClickChargeRandom, false, false, currentTurnPlayer, 'onClickChargeRandom'), true, true, 'onClickChargeRandom');
    };
    // ジャマー: ⚡のあるマスを選び、縦横隣接の敵コマのライフを⚡の数だけ減らして⚡を取り除く
    const onClickJammer = () => {
        addLog('「ジャマー」を使用（⚡のマスを選択）');
        setUseJammer(true);
        spendMagic(late().calculateCost(seatCosts.onClickJammer, false, false, currentTurnPlayer, 'onClickJammer'), true, true, 'onClickJammer');
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

    return { onClickChargeToken, onClickChargeOne, onClickChargeSpread, onClickChargeHeal, onClickSmallFry, onClickPerfectGame, onClickHelper, onClickSecondCatch, onClickFirstFrost, onClickGather, onClickBurnOff, onClickFreeToken, onClickDoubleChargeToken, onClickChargeArea, onClickChargeRandom, onClickJammer, onClickNightVeil, onClickGraveDiscount, onClickPoisonWard, onClickGraveOffering, useJammer, exeJammer, useChargeOne, setUseChargeOne, useChargeArea, setUseChargeArea, useChargeSpread, setUseChargeSpread, chargeSpreadCost, chargeOneCost, graveDiscountNow, chargeHealCells };
};

export type GenericSkillsResult = ReturnType<typeof useGenericSkills>;
