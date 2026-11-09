// Game.tsx から切り出したハンドラ群: ギアの実行時の状態（手番内のスキル使用・廃墟・土壇場の防壁・コスト補正）
// 本体は Game.tsx にあったものをそのまま移した。Game の変数は scope(g) で、あとで定義されるもの(calculateCost など)は late() 経由で受け取る
import { hasOwnObject } from './objects';
import React, { useState, useRef } from 'react';
import { CharacterId } from '../../types/Character';
import { Player } from '../../types/Player';
import { SquareInfo } from '../../types/SquareInfo';
import { gearCostContext } from './gearTurn';
import { EffectSnapshot } from './objects';
import { CostEnv, gearCostOf } from './cost';
import { emptyDiscount } from './discount';
import { GearId, hasGear, countAilmentKinds, CostContext } from './gear';
import { GameLate } from './gameLate';
import { NECROMANCY } from './turn';

export interface GearRuntimeScope {
    seatCount: number;
    gearsBySeat: GearId[][];
    symbols: ("💙" | "⭕" | "🟩" | "🔶" | "⭐" | "🟣" | "🟫" | "🩷")[];
    currentBoard: SquareInfo[];
    turnSeat: number;
    characters: CharacterId[];
    /** 席ごとの蘇生コスト（墓地の死体の数 = 基本コスト − これ）。墓地の state は後で宣言されるので ref で受ける */
    necroCostRef: React.MutableRefObject<number[]>;
}
export const useGearRuntime = (g: GearRuntimeScope, late: () => GameLate) => {
    const { seatCount, gearsBySeat, symbols, currentBoard, turnSeat, characters, necroCostRef } = g;

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
        lockFreeUsed: Array<boolean>(seatCount).fill(false), // 鍵師のパッシブ: この手番に常設のロックの無料の1回を使ったか
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
    const [reaperSweeps, setReaperSweeps] = useState<number>(0); // 死神の鎌でコマが壊れた回数（AIの手番の効果を、盤面が変わったあとにやり直すため）
    const lastStandActiveAgainst = (seat: number): boolean => lastStandUsed.current.some((used, holder) => used && holder !== seat);
    // 勝者 w に対して発動できる土壇場の防壁の持ち主（未使用・w 以外）。いなければ -1
    const lastStandHolderFor = (w: Player): number =>
        gearsBySeat.findIndex((g, seat) => hasGear(g, 'lastStand') && !lastStandUsed.current[seat] && symbols[seat] !== w);
    const gearCtxFor = (seat: number): CostContext => {
        const ailments = hasGear(gearsBySeat[seat], 'ailmentPact') ? countAilmentKinds(currentBoard, symbols[seat]) : 0;
        return gearCostContext(gearTurn.current, ruinState.current, seat, turnSeat, ailments, hasGear(gearsBySeat[seat], 'buildMania') && hasOwnObject(currentBoard, symbols[seat]));
    };
    /** コストを払う席の状況（実コストの計算は cost.ts で sim と共有） */
    const costEnvFor = (seat: number): CostEnv => ({
        board: currentBoard,
        seat,
        player: symbols[seat],
        turnSeat,
        characters,
        yinYangMode: late().yinYangMode[seat],
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
        corpses: NECROMANCY.baseCost - (necroCostRef.current[seat] ?? NECROMANCY.baseCost),
        oppSkillPrev: gearTurn.current.oppSkillPrev[seat],
        lockPrev: gearTurn.current.lockPrev[seat],
        lockFreeUsed: gearTurn.current.lockFreeUsed[seat],
        magic: late().magic[seat],
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

    return { wardRef, gearTurn, gearCost, lastStandUsed, lastStandSaves, lastStandHolderFor, setLastStandSaves, effectSnap, ruinState, lastStandActiveAgainst, costEnvFor, reaperSweeps, setReaperSweeps };
};
