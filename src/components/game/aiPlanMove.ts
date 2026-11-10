// AIPlayer のメソッド群: 1手番の計画のエントリ（makeMove → planMove）
// メソッド本体は AIPlayer.ts から移しただけ（this は AIPlayer）。AIPlayer.ts がインターフェース統合とプロトタイプへの合成で戻す
import { lockedSquareCount, sealBaseCost, sealReleaseCells } from './keysmith';
import type AIPlayer from './AIPlayer';
import { seatOf } from '../../types/Player';
import { SquareInfo } from '../../types/SquareInfo';
import { isDiscountSkill } from './discount';
import { OBJECT_DEFS, objectLandable, enemyObjectActive } from './objects';
import { calculateWinner, findEmptyIndexes, isObject, lineSymbols } from '../../util';
import { SkillCosts, MIASMA_MIN_COST } from './skillCosts';
import { geometryForCells } from './boardGeometry';
import { ailmentStacks, cleanse, canFreeze, budStacks, budReceivers, harvestBuds, graft, GRAFT_MAX, sow, sowCandidates, SOW_COUNT, infernoTargets, INFERNO_STACKS, freezeAll, reducedGlacierCost, burnoutTargets, burnoutCostOf, totalFlames, burnout, INFERNO_FREE_SKILLS, ignite, isFrozen, freeze, shatter, isDormant, activeBuds, lockable, leafSurcharge, bonfireTargets, bonfire, mulchCandidates, mulch, autumn, fireWheelTargets, mogaribue, mogaribueDamage, mogaribueTargets } from './thermal';
import { addLock, lockEffect, lockStack } from './lock';
import { pandemicTargets, poisonMistTargets, intensify as intensifyPoison, activePoison, poisonCountFor, addPoison } from './poison';
import { NECROMANCY } from './turn';
import { corpseCount, graveDiscountAmount, NECRO_CORPSE_CUT_CAP } from './graveSkills';
import { smallFry, smallFryTargets } from './lifeBan';
import { BOLT_SILENCE_BOLTS, chargeStacks, connectedPieces, withCharge, reducedChargeCost, applyJammer } from './charge';
import { AIResult, NECRO_LOCK_CHARACTERS, NECRO_LOCK_MAX, NECRO_LOCK_REFRESH, KEYSMITH_SEAL_SAVE, MAGICIAN_REROLL_MAGIC, BIG_TREE_HOLD_GAP, BIG_TREE_MAX, BIG_TREE_MIN_EMPTY, BOLT_SILENCE_IDX, CLOUD_MAX, CLOUD_MIN_EMPTY, CRYO_LOCK_MAX, EMPTY_LOCK_MAX, INTENSIFY_MAX_CELL_POISON, INTENSIFY_MIN_FOE_POISON, KEYSMITH_COMBO_EMPTY_LOCK_MAX, MAGICIAN_MAX_LOCKS, MIASMA_MIN_SCORE, MIST_MIASMA_MIN_SCORE, NO_DIG_53_MIN, PLUNDER_CHAIN_MAX, POISON_RICH_RESERVE, RICH_EXTRA_REROLLS, RICH_REROLL_MAGIC, RICH_SPEND_GOAL, RICH_SPEND_GOAL_MAX, SHATTER_MAX_PER_TURN, SHATTER_RESERVE, SH_SMALL_FRY_MIN, STOMP_CHAIN_MAX, SURPLUS_MAGIC, TOKEN_SKILL_KEYS, TURN_ENDING_SKILLS, WITCH_DIG_MARGIN, WITCH_GIANT_OPEN_CHARGE_CAP, YINYANG_GIANT_OPEN_CHARGE_CAP } from './aiConstants';
import { isBuilding } from '../../types/ObjectKind';

/** planMove の引数（makeMove が受け取る型）。型の循環を避けるため、クラスのメソッドではなく関数として定義する */
export type PlanMoveArgs = Parameters<typeof planMove>;

/** planMove の各段階が共有する入力と途中経過。board/magic は段階の途中で更新され（あとの段階はその値を使う）、
 *  facesWitch/holdFlood/chargeClicks は途中の段階が決めて後ろの段階が読む */
interface PlanContext {
    board: SquareInfo[];
    magic: number;
    costs: Record<keyof SkillCosts, number>;
    opponentMagic: number;
    life: number;
    availableSkills: number[];
    tokenUsed: boolean;
    necroRemain: number;
    necroCost: number;
    judgeCost: number;
    assaultCost: number;
    proliferateActive: boolean;
    seatMagic: number[];
    necroPay: number;
    necroCosts: number[];
    /** 相手に凩の魔女がいる（planOpening が決める） */
    facesWitch: boolean;
    /** 陰陽師がコンボ待ちで魔力を貯めている（planThawAndYinYang が決める） */
    holdFlood: boolean;
    /** 帯電系の「スキル→クリック」の並び（planChargeAndObjects が積む） */
    chargeClicks: { skill: string; target?: number; target2?: number }[];
}

/** planMove の段階。上から順に試し、最初に結果を返した段階で手番の計画が決まる */
const PLAN_PHASES = [planOpening, planThawAndYinYang, planDefense, planCounterLocks, planChargeAndObjects, planOverflowCasts, planBudsAndFire];

/** 巨人のストンプ・パーフェクトゲーム・追い剥ぎの即勝ちと、手札の引き直し。当てはまる手があればその結果を返し、なければ null（次の段階へ） */
function planOpening(this: AIPlayer, c: PlanContext): AIResult | null {
    const { board, magic, costs, opponentMagic, life, availableSkills, tokenUsed, necroRemain, necroCost, assaultCost, proliferateActive, seatMagic, necroPay } = c;
    // 巨人: ストンプは手番を終えず、中心のマスに自分のコマを置く（中心の敵コマは壊れてから置く）。連打すれば1手番で4つ並べられる
    // （自陣のコマが範囲に入ってもライフ-5だけ）。最少回数で1列を自陣にできるなら、魔力が許す限り連打して勝つ
    if (this.character === 'giant') {
        // 今すぐ着手で勝てるなら、ストンプを挟まずに打つ（全キャラ共通の「勝てる手は先に打つ」は、炎などで勝ちにならない手を
        // 勝てると誤判定して鍛冶師が 64%→18% に悪化したため入れない。巨人のストンプ連打の中だけで判断する）
        const direct = this.directWinMove(board, life);
        if (direct !== null) return { move: direct, skills: [] };
        const stompCost = this.calculateAICost(costs.onClickStomp, false, false, 'onClickStomp');
        const win = this.planStompWin(board, stompCost > 0 ? Math.floor(magic / stompCost) : STOMP_CHAIN_MAX, life);
        if (win !== null) {
            return { move: this.getBestMove(win.board, life), skills: [], chargeClicks: win.centers.map((c) => ({ skill: 'onClickStomp', target: c })), win: true };
        }
    }

    // パーフェクトゲーム(102): 全コマを壊した後に、残る自陣のコマ(⚡の無敵・🔑ロック)3つ+空き1つの列ができるなら、撃ってからその空きに置いて勝つ
    // （自分のリーチを敵のコマが塞いでいる場面。ロックや⚡のコマが残るので、塞いでいる敵コマだけが消える）
    this.holdPG = 0;
    if (availableSkills.includes(102)) {
        const win = this.planPerfectGameWin(board, magic, costs, availableSkills);
        if (win !== null) return { move: win.move, skills: [], chargeClicks: win.clicks, win: true };
        // 即勝ちが見えているが魔力が足りない: 相手のリーチが無いうちは、駒を置かずチャージ(+3)で魔力をためて次の手番以降に撃つ
        if (this.holdPG > 0 && this.opponents.every((o) => this.countReaches(board, o) === 0)) return { move: null, skills: ['onClickCharge'] };
    }

    // 追い剥ぎ(52): ライフ0の敵コマを自陣にする。手番は続くので、列の足りないマスがライフ0の敵コマ（と、最後の1マスの空き）だけなら、連打して着手で揃えて勝つ
    if (availableSkills.includes(52)) {
        const plunderCost = this.calculateAICost(costs.onClickPlunder, false, false, 'onClickPlunder');
        const win = this.planPlunderWin(board, plunderCost > 0 ? Math.floor(magic / plunderCost) : PLUNDER_CHAIN_MAX);
        if (win !== null) {
            return { move: win.move, skills: [], chargeClicks: win.cells.map((c) => ({ skill: 'onClickPlunder', target: c })), win: true };
        }
    }

    // 魔法使い: 撃てるスキルが無いとき、軽減札を撃ってから1コストで手札を引き直して探す（旧sim AI の discountPlan>=2 と同方針。
    // A/B: 環境勝率 +1.7pt(seed2/200, seed3/400, seed4/400 で一致)）。手札が変わってから計画し直すので、Game 側が再度 makeMove を呼ぶ
    // 71と73が揃っていて特売(53)だけ無いときは、53を探して引き直す（1枠で約10%/回）より、チャージで特売なしの実コスト(13)を目指す（旧sim AI の noDig53=8）
    const waitFor13 = this.comboReachable(availableSkills) && availableSkills.includes(71) && availableSkills.includes(73) && !availableSkills.includes(53)
        && magic >= NO_DIG_53_MIN && magic < this.comboPlan(board, costs, availableSkills).total;
    // 陰陽師: 勝てる盤面で、魔力がコンボ分（特売が引ける前提）+引き直し分あるなら、1コストで手札を引き直してコンボ札(71/73/53)を探す
    // （旧sim AI の shuffleDig。コンボの発動率 53→75%、環境勝率 +8pt）
    if (this.character === 'yinYangMaster' && this.rerollsLeft > 0 && !waitFor13 && this.comboReachable(availableSkills)) {
        const complete = availableSkills.includes(71) && availableSkills.includes(73)
            && (availableSkills.includes(53) || magic >= this.comboPlan(board, costs, availableSkills).total);
        if (!complete && this.floodComboWins(board) && magic >= this.comboPlan(board, costs, availableSkills, true).total + costs.onClickShuffle) {
            return { move: null, skills: [], reroll: {} };
        }
    }
    // 陰陽師: 勝てる盤面（敵コマの入っていない列がある）で相手のリーチも無く、探索に足りない魔力のうちは、駒を置かずチャージで魔力を貯める
    // （旧sim AI の chargeWait=1。コンボ発動率 75→80%、環境勝率 +6pt）
    const facesWitch = c.facesWitch = this.characters.some((c, seat) => seat !== seatOf(this.playerSymbol) && c === 'witch'); // 魔女は短期決戦なので、コンボ待ちでチャージに回らない (#276。対魔女 約3→約25%)
    // 魔女・陰陽師が巨人と当たるとき、最初は置かずにチャージする。最初の1駒は巨人のストンプで必ず消される。巨人は2手番に1回しか動かないので、その間に魔力を貯める。
    // 貯める上限（手番開始の魔力がこれ未満の間チャージ）は、魔女 14・陰陽師 5。対巨人 魔女（seed961〜964 各300）: 上限5 28.7/29.3/31.3/35.3 → 上限14 57.0/61.0/52.7/52.7（平均 +24.7）。
    // 上限8/11/17は 33/45/46〜56 で14が最良。陰陽師（seed961/300）: 上限5 50.0 / 8 28.0 / 11 36.7 で5が最良（seed921〜923: 34.7/35.7/33.0 → 45.3/46.7/46.7）。他のキャラは対ネクロ -21・対氷室 -14 などで悪化するのでこの2キャラだけ
    const openChargeCap = this.character === 'witch' ? WITCH_GIANT_OPEN_CHARGE_CAP : this.character === 'yinYangMaster' ? YINYANG_GIANT_OPEN_CHARGE_CAP : 0;
    if (magic < openChargeCap && this.characters.some((ch, seat) => seat !== seatOf(this.playerSymbol) && ch === 'giant')
        && !board.some((sq) => sq.player === this.playerSymbol) && this.opponents.every((o) => this.countReaches(board, o) === 0)) {
        return { move: null, skills: ['onClickCharge'] };
    }
    // 百鬼夜行コンボを待つ前に、式神を置いて一括で通常コマにする安い勝ち方（planShikigami）がいま撃てるなら、待たずに撃つ
    const cheapWin = this.character === 'yinYangMaster' && magic >= RICH_REROLL_MAGIC && this.planShikigami(board, magic, costs, availableSkills)?.win === true;
    if (!cheapWin && !facesWitch && this.character === 'yinYangMaster' && this.comboReachable(availableSkills) && this.opponents.every((o) => this.countReaches(board, o) === 0)
        && this.floodComboWins(board) && (magic < this.comboPlan(board, costs, availableSkills, true).total + costs.onClickShuffle || waitFor13)) {
        return { move: null, skills: ['onClickCharge'] };
    }
    // 対魔女: 初霜・吹き寄せ・山焼きが手札に無く、デッキにあって、シャッフルのあとも魔力が3残るなら、1コストで手札を引き直して探す
    // （見つけた札は引き直しのたびに chooseLocks が固定し直す。旧sim AI の witchDig=2, digMargin=3）
    if (facesWitch && this.character !== 'witch' && this.rerollsLeft > 0 && ![93, 94, 95].some((i) => availableSkills.includes(i)) && [93, 94, 95].some((i) => this.inDeck(i, availableSkills))
        && magic >= costs.onClickShuffle + WITCH_DIG_MARGIN) {
        return { move: null, skills: [], reroll: {} };
    }
    // 氷室の番人 対魔女: デッキに一寸の虫に魂なし(92)があり手札に無く、壊せる敵コマが2個以上あって、シャッフルと92の分の魔力があれば、1コストで引き直して探す
    // （見つけた92は chooseLocks が固定する。sim/ai.js の fryDig=2）
    if (facesWitch && this.character === 'cryomancer' && this.rerollsLeft > 0 && !availableSkills.includes(92) && this.inDeck(92, availableSkills)
        && smallFryTargets(board, this.playerSymbol, this.characters).length >= 2
        && magic >= costs.onClickShuffle + this.calculateAICost(costs.onClickSmallFry, false, false, 'onClickSmallFry')) {
        return { move: null, skills: [], reroll: {} };
    }
    // 陰陽師×対魔女: 一寸の虫に魂なし(92)が手札に無く、デッキにあって、シャッフルのあとも魔力が3残るなら、1コストで引き直して探す
    // （見つけた92は chooseLocks が魔女戦で固定する。旧sim AI の yinDig。本番AI 対魔女 55%(124/227) → 66%(109/166)）
    if (facesWitch && this.character === 'yinYangMaster' && this.rerollsLeft > 0 && !availableSkills.includes(92) && this.inDeck(92, availableSkills)
        && magic >= costs.onClickShuffle + WITCH_DIG_MARGIN) {
        return { move: null, skills: [], reroll: {} };
    }
    if (this.rerollsLeft > 0 && this.character !== 'magician' && this.character !== 'yinYangMaster' && magic >= SURPLUS_MAGIC) {
        const plan = this.chooseSkills(board, magic, costs, opponentMagic, life, availableSkills, tokenUsed, necroRemain, necroCost, assaultCost, proliferateActive, seatMagic, necroPay);
        if (plan.length === 0) return { move: null, skills: [], reroll: {} };
    }
    if (this.character === 'magician' && this.rerollsLeft > 0) {
        const rr = this.planReroll(board, magic, costs, opponentMagic, life, availableSkills, tokenUsed, necroRemain, necroCost, assaultCost, proliferateActive, seatMagic, necroPay);
        if (rr) return { move: null, skills: [], reroll: rr };
    }
    return null;
}

/** 氷結中の空きマスで塞がれた列の火遁での解除と、陰陽師の砕氷・式神。当てはまる手があればその結果を返し、なければ null（次の段階へ） */
function planThawAndYinYang(this: AIPlayer, c: PlanContext): AIResult | null {
    const { board, magic, costs, life, availableSkills, facesWitch } = c;
    // 自分のリーチの4つ目が氷結中の空きマスで塞がれているとき、火遁（onClickIgnite）で隣のコマを燃やして解凍し、同じ手番で完成させる
    // （旧sim AI の unblock=2 と同一。A/B: 氷室の番人相手に全キャラ平均 +3.2pt、魔法使い +10.3±5.5(n=600)、氷室の番人でない相手では差 0.0）
    if (availableSkills.includes(31) && magic >= this.calculateAICost(costs.onClickIgnite, false, false, 'onClickIgnite')) {
        const k = this.blockedReachCell(board);
        const t = k === null ? null : this.thawIgniteTarget(board, k);
        if (t !== null) {
            const post = board.map((sq) => ({ ...sq, effects: [...sq.effects] }));
            ignite(post, [t], this.sizeOf(board), 1);
            this.updateShield(post);
            const followup = this.getBestMove(post, life);
            if (followup !== null) return { move: followup, skills: ['onClickIgnite'], lockTargets: [t] };
            this.updateShield(board);
        }
    }

    // 陰陽師: 砕氷(47)で、氷室・軍師の氷結で守られたコマを壊す（❄の数×3ダメージ。壊すとコンボが組める／敵の並びが崩れるコマを優先）
    if (this.character === 'yinYangMaster' && availableSkills.includes(47) && magic >= this.calculateAICost(costs.onClickShatter, false, false, 'onClickShatter')) {
        const tg = this.yinShatterTarget(board);
        if (tg !== null) {
            const post = board.map((sq) => ({ ...sq, effects: [...sq.effects] }));
            shatter(post, tg);
            this.updateShield(post);
            const followup = this.getBestMove(post, life);
            this.updateShield(board);
            return { move: followup, skills: [], chargeClicks: [{ skill: 'onClickShatter', target: tg }] };
        }
    }

    // 陰陽師・氷室以外: 砕氷(47)が手札にあれば、氷結で守られた敵コマを壊して自分の列を伸ばす／敵の並びを崩す
    if (this.character !== 'yinYangMaster' && this.character !== 'cryomancer' && availableSkills.includes(47) && magic >= this.calculateAICost(costs.onClickShatter, false, false, 'onClickShatter')) {
        const tg = this.shatterTarget(board);
        if (tg !== null) {
            const post = board.map((sq) => ({ ...sq, effects: [...sq.effects] }));
            shatter(post, tg);
            this.updateShield(post);
            const followup = this.getBestMove(post, life);
            this.updateShield(board);
            return { move: followup, skills: [], chargeClicks: [{ skill: 'onClickShatter', target: tg }] };
        }
    }

    // 陰陽師: 氷結中の空きマスが百鬼夜行→式神一括の列を塞いでいるとき、火遁で隣のコマを燃やして溶かし、コンボを組める盤面にする
    // （氷室・軍師の氷結で列が作れず、コンボ待ちのまま遅くなるのを防ぐ）
    if (this.character === 'yinYangMaster' && availableSkills.includes(31) && magic >= this.calculateAICost(costs.onClickIgnite, false, false, 'onClickIgnite')) {
        const tg = this.comboThawTarget(board);
        if (tg !== null) {
            const post = board.map((sq) => ({ ...sq, effects: [...sq.effects] }));
            ignite(post, [tg], this.sizeOf(board), 1);
            this.updateShield(post);
            const followup = this.getBestMove(post, life);
            if (followup !== null) return { move: followup, skills: ['onClickIgnite'], lockTargets: [tg] };
            this.updateShield(board);
        }
    }

    // 陰陽師: コンボ札（71/73）のどちらかを持っていて魔力が足りないうちは、他のスキルに魔力を使わず貯める（旧sim AI の floodHold=2）
    const holdFlood = c.holdFlood = !facesWitch && this.character === 'yinYangMaster' && this.comboReachable(availableSkills) && (availableSkills.includes(71) || availableSkills.includes(73))
        && magic < this.comboPlan(board, costs, availableSkills).total;
    // 陰陽師: 一寸の虫に魂なし(92)で壊せる敵コマがあれば撃つ（盤面のコマの数だけ安い。旧sim AI の smallFry と同一。
    // 本番AI 対魔女 22→45%(13/59→29/65、デッキの12を92に差し替え)、全相手 52.7→54.2% #276）
    if (this.character === 'yinYangMaster' && availableSkills.includes(92)) {
        const post = board.map((sq) => ({ ...sq, effects: [...sq.effects] }));
        const r = smallFry(post, this.playerSymbol, this.characters);
        if (r.destroyed.length >= SH_SMALL_FRY_MIN && magic >= this.calculateAICost(costs.onClickSmallFry, false, false, 'onClickSmallFry')) {
            this.updateShield(post);
            const followup = this.getBestMove(post, life);
            this.updateShield(board);
            return { move: followup, skills: ['onClickSmallFry'] };
        }
    }
    // 陰陽師: 式神の設置・転化・爆破（旧sim AI の shikigamiTurn）
    if (this.character === 'yinYangMaster' && !holdFlood) {
        const plan = this.planShikigami(board, magic, costs, availableSkills);
        if (plan) {
            if (plan.win) return { move: null, skills: [], chargeClicks: plan.clicks };
            this.updateShield(plan.board);
            const followup = this.getBestMove(plan.board, life);
            this.updateShield(board);
            return { move: followup, skills: [], chargeClicks: plan.clicks };
        }
    }
    return null;
}

/** 相手のリーチへの防御（ロックの種類の選択・氷結で塞ぐ・巨人のストンプ）。当てはまる手があればその結果を返し、なければ null（次の段階へ） */
function planDefense(this: AIPlayer, c: PlanContext): AIResult | null {
    const { board, magic, costs, life, availableSkills, seatMagic, necroCosts } = c;
    // マルチリーチ防御: 脅威数に応じてロック種別を選択
    const threatSquares = Array.from(new Set(this.opponents.flatMap((o) => this.findThreatSquares(board, o))));
    // 巨人: 相手にリーチがあるとき、ストンプ(コスト2・着手も兼ねる)で脅威が減るならロックより先に撃つ
    // （旧sim AI の stompDef=1 と同一。A/B: 環境勝率 12.4→19.8% seed1/100、stompMin=1 と併せて 14.6→26.2% seed2/200）
    if (this.character === 'giant' && threatSquares.length >= 1 && magic >= this.calculateAICost(costs.onClickStomp, false, false, 'onClickStomp')) {
        const rescue = this.findRescueCenter(board, 'stomp');
        if (rescue !== null && this.lastRescueThreats < threatSquares.length) {
            const postBoard = this.simulateStomp(board, rescue, this.playerSymbol, life);
            const followup = this.getBestMove(postBoard, life);
            return { move: followup, skills: ['onClickStomp'], stompTarget: rescue };
        }
    }

    // 氷室の番人: ロックが氷結に置き換わっている。単独の脅威は氷結で塞げば着手を使わずに済み、その手番を攻めに使える
    // （旧sim AI と同一。A/B: 氷室の番人の勝率 +11.7pt vs あなた(n=400)、全キャラ相手でほぼ向上）
    // 氷室の番人: 脅威が無いとき、魔法使いの🌱付きでロックされていないコマを凍らせる。氷結中の🌱は休眠して魔力を生まず、魔法使いの魔力エンジンが止まる
    // （旧sim AI F.freezeBuds と同一。A/B: 対魔法使い 25→68%、環境勝率 seed2/200 で +4.4pt。魔法使い以外のコマは凍らせない: 毒使い相手では 64→31% に悪化）
    // 氷室の番人: 毒で倒れそうな（毒≥ライフ-2）自陣コマを先に凍らせる。氷結中のマスの毒は継続ダメージを与えない
    // （旧sim AI F.antiPoison=1, antiPoisonMargin=2 と同一。A/B: 対毒使い 勝ち86→112/200試合、環境勝率 seed2/200 で +1.5pt）
    if (this.character === 'cryomancer' && threatSquares.length === 0 && magic >= this.calculateAICost(costs.onClickCryoFreeze, false, false, 'onClickCryoFreeze')) {
        const poisoned = board.findIndex((sq, i) => {
            if (sq.player !== this.playerSymbol || this.shield.has(i) || isFrozen(sq) || !canFreeze(sq)) return false;
            const p = sq.effects.filter((e) => e.effect === '☠').length;
            return p > 0 && p >= sq.bind - 2;
        });
        if (poisoned !== -1) {
            const post = board.map((sq) => ({ ...sq, effects: [...sq.effects] }));
            freeze(post, [poisoned]);
            this.updateShield(post);
            const followup = this.getBestMove(post, life);
            if (followup !== null) return { move: followup, skills: ['onClickUseLock'], lockTargets: [poisoned] };
            this.updateShield(board);
        }
    }
    // 氷室の番人: 対陰陽師。百鬼夜行は氷結中の空きマスを飛ばすので、陰陽師の魔力が12以上のとき、自コマも氷結も入っていない列の空きマスを
    // 最も多くの列に乗るものから1つ凍らせる（旧sim AI F.antiFlood=13。対陰陽師 seed1-3/400 で 31〜36% → 49〜53%。常時や魔力7では悪化）
    if (this.character === 'cryomancer' && threatSquares.length === 0 && magic >= this.calculateAICost(costs.onClickCryoFreeze, false, false, 'onClickCryoFreeze')) {
        const yy = this.opponents.find((o) => this.characterOf(o) === 'yinYangMaster' && (seatMagic[seatOf(o)] ?? 0) >= 12);
        if (yy) {
            const score = new Map<number, number>();
            for (const line of geometryForCells(board.length).winLines) {
                if (line.some((i) => board[i].player === this.playerSymbol || (!board[i].player && isFrozen(board[i])))) continue;
                for (const i of line) if (!board[i].player && canFreeze(board[i])) score.set(i, (score.get(i) || 0) + 1);
            }
            let cell = -1;
            let best = 0;
            score.forEach((v, i) => { if (v > best) { best = v; cell = i; } });
            if (cell !== -1) {
                const post = board.map((sq) => ({ ...sq, effects: [...sq.effects] }));
                freeze(post, [cell]);
                this.updateShield(post);
                const followup = this.getBestMove(post, life);
                if (followup !== null) return { move: followup, skills: ['onClickUseLock'], lockTargets: [cell] };
                this.updateShield(board);
            }
        }
    }
    // 氷室の番人: 対ネクロ。降霊は墓地の数だけ空きマスにランダム召喚する。氷結した空きマスには召喚されないので、墓地が1以上のとき、
    // ネクロのコマがあり自コマが無い列の空きマスを1つ先に凍らせる（旧sim AI F.antiSummon=1, antiSummonMax=1。対ネクロ seed1-3/400 で +5〜+11pt）
    if (this.character === 'cryomancer' && threatSquares.length === 0 && magic >= this.calculateAICost(costs.onClickCryoFreeze, false, false, 'onClickCryoFreeze')) {
        const necro = this.opponents.find((o) => this.characterOf(o) === 'necromancer');
        if (necro && 10 - (necroCosts[seatOf(necro)] ?? 10) >= 1) {
            const score = new Map<number, number>();
            for (const line of geometryForCells(board.length).winLines) {
                if (line.some((i) => board[i].player === this.playerSymbol)) continue;
                const n = line.filter((i) => board[i].player === necro).length;
                if (n === 0) continue;
                const empt = line.filter((i) => !board[i].player && !isFrozen(board[i]) && canFreeze(board[i]));
                if (empt.length === 0 || line.some((i) => !board[i].player && isFrozen(board[i]))) continue;
                for (const i of empt) score.set(i, (score.get(i) || 0) + n);
            }
            let cell = -1;
            let best = 0;
            score.forEach((v, i) => { if (v > best) { best = v; cell = i; } });
            if (cell !== -1) {
                const post = board.map((sq) => ({ ...sq, effects: [...sq.effects] }));
                freeze(post, [cell]);
                this.updateShield(post);
                const followup = this.getBestMove(post, life);
                if (followup !== null) return { move: followup, skills: ['onClickUseLock'], lockTargets: [cell] };
                this.updateShield(board);
            }
        }
    }
    if (this.character === 'cryomancer' && threatSquares.length === 0 && magic >= this.calculateAICost(costs.onClickCryoFreeze, false, false, 'onClickCryoFreeze')) {
        const cell = board.findIndex((sq, i) => !!sq.player && this.isEnemy(sq.player) && this.characterOf(sq.player) === 'magician'
            && !this.shield.has(i) && budStacks(sq) > 0 && !isFrozen(sq) && canFreeze(sq));
        if (cell !== -1) {
            const post = board.map((sq) => ({ ...sq, effects: [...sq.effects] }));
            freeze(post, [cell]);
            this.updateShield(post);
            const followup = this.getBestMove(post, life);
            if (followup !== null) return { move: followup, skills: ['onClickUseLock'], lockTargets: [cell] };
            this.updateShield(board);
        }
    }
    if (this.character === 'cryomancer' && threatSquares.length === 1 && magic >= this.calculateAICost(costs.onClickCryoFreeze, false, false, 'onClickCryoFreeze')) {
        const post = board.map((sq) => ({ ...sq, effects: [...sq.effects] }));
        freeze(post, [threatSquares[0]]);
        this.updateShield(post);
        const followup = this.getBestMove(post, life);
        if (followup !== null) return { move: followup, skills: ['onClickUseLock'], lockTargets: [threatSquares[0]] };
        this.updateShield(board); // 打てるマスが無くなるなら氷結せず通常の流れへ
    }
    if (threatSquares.length >= 2) {
        const lockOptions: { skill: string; count: number; cost: number }[] = [
            { skill: 'onClickUseLock', count: 1, cost: this.calculateAICost(costs.onClickUseLock, false, false, 'onClickUseLock') },
        ];
        if (availableSkills.includes(12)) {
            lockOptions.push({ skill: 'onClickUseDoubleLock', count: 2, cost: this.calculateAICost(costs.onClickDoubleLock, false, false, 'onClickDoubleLock') });
        }
        if (availableSkills.includes(13)) {
            lockOptions.push({ skill: 'onClickUseTripleLock', count: 3, cost: this.calculateAICost(costs.onClickTripleLock, false, false, 'onClickTripleLock') });
        }
        // 脅威数 - 1 個ロックして、残り1つに配置
        const needed = threatSquares.length - 1;
        // 必要数をカバーできる最安ロックを選ぶ
        const viable = lockOptions
            .filter(o => o.count >= needed && magic >= o.cost)
            .sort((a, b) => a.cost - b.cost);
        if (viable.length > 0) {
            const chosen = viable[0];
            const lockTargets = threatSquares.slice(0, chosen.count);
            // 占有先の脅威が残っていればそこへ、全脅威をロックする場合はロック対象以外の最善手/空きマスへ
            let moveTarget = threatSquares.find(t => !lockTargets.includes(t));
            if (moveTarget === undefined) {
                const best = this.getBestMove(board, life);
                moveTarget =
                    best !== null && !lockTargets.includes(best)
                        ? best
                        : findEmptyIndexes(board).find((em: number) => !lockTargets.includes(em));
            }
            return {
                move: moveTarget ?? null,
                skills: [chosen.skill],
                lockTargets,
            };
        }
        // 詰み(ロックでは全脅威を塞げない)で自分に即勝ちもない: ヘイルメアリーに賭ける
        if (
            availableSkills.includes(27) &&
            magic >= this.calculateAICost(costs.onClickHailMary, false, false, 'onClickHailMary') &&
            this.findThreatSquares(board, this.playerSymbol).length === 0
        ) {
            return { move: null, skills: [], hailMary: true };
        }
        // 必要数を1つのロックでカバーできない場合: 単ロックで最低1つは塞ぐ
        // (かつてここに「シャッフルで防御札を引き直す」分岐があったが、発火条件が
        //  同時脅威3つ以上で実測 3,631手番中1回(0.03%)。閾値を2つに緩めても直接対決
        //  980試合で 49.1%±3.1pt と効果が無く、削除した。詳細は issue #10)
        if (magic >= lockOptions[0].cost) {
            return {
                move: threatSquares[1],
                skills: ['onClickUseLock'],
                lockTargets: [threatSquares[0]],
            };
        }
    }
    return null;
}

/** 対策ロック・インジェクション・鬼門封じ・ミアズマ・毒花。当てはまる手があればその結果を返し、なければ null（次の段階へ） */
function planCounterLocks(this: AIPlayer, c: PlanContext): AIResult | null {
    const { board, magic, costs, life, availableSkills } = c;
    // 対策ロック: 敵にネクロ/毒使い/陰陽師がいるときは、失いそうな低bindの自コマを事前にロックして守る (旧sim AI と同一)。
    // A/B: 対ネクロ 0.45→0.62、対陰陽師 +4.5〜+13pt、対毒使い 平均+4.8pt。軍師・毒使いはロックの追加コストで悪化、ネクロ同士は未検証のため対象外
    if (
        this.character !== 'tactician' &&
        this.character !== 'poisoner' &&
        // 雷霆の巫は撃たない: 魔力を帯電トークン等に回すほうが強い (旧sim AI elecNoAnti=1。対ネクロ22→57/対毒使い15→41%, 環境 50.3→57.8%)
        this.character !== 'electrician' &&
        // 凩の魔女も撃たない: 毎手番2魔力が対策ロックに消えて🍂トークンが撃たれなかった (旧sim AI witchNoAnti=1。環境勝率 51.3→61.4%, seed2/200)
        this.character !== 'witch' &&
        this.characters.some(
            (c, seat) =>
                seat !== seatOf(this.playerSymbol) &&
                ['necromancer', 'poisoner', 'yinYangMaster'].includes(c) &&
                !(c === 'necromancer' && this.character === 'necromancer')
        ) &&
        magic >= this.calculateAICost(costs.onClickUseLock, false, false, 'onClickUseLock')
    ) {
        const lockCell = this.findAntiNecroLockTarget(board);
        if (lockCell !== null) {
            return { move: this.getBestMove(board, life), skills: ['onClickUseLock'], lockTargets: [lockCell] };
        }
    }

    // 毒使い インジェクション: 敵の要のコマを毒で消す (相手リーチ中でも有効。自分の勝ち手があるときは温存)
    if (
        this.character === 'poisoner' &&
        availableSkills.includes(15) &&
        magic >= this.calculateAICost(costs.onClickInjection, false, true, 'onClickInjection') &&
        this.countReaches(board, this.playerSymbol) === 0
    ) {
        const inj = this.findInjectionTarget(board, 10);
        if (inj !== null) {
            // 消える場合は着手時の減衰で盤面から消えるので、その盤面で通常着手を選ぶ
            const postBoard = board.map((sq, i) => (inj.kills && i === inj.index ? { ...sq, player: undefined, bind: 0, effects: [] } : sq));
            const followup = this.getBestMove(postBoard, life);
            return { move: followup, skills: ['onClickInjection'], stompTarget: inj.index };
        }
    }

    // 鬼門封じ: 敵のラインの要（3つ揃いなど）のコマを破壊して、その空きマスを3ターンロックする。自分に勝ち手があるときは温存 (旧sim AI と同一)
    if (
        availableSkills.includes(74) &&
        magic >= this.calculateAICost(costs.onClickKimon, false, false, 'onClickKimon') &&
        this.countReaches(board, this.playerSymbol) === 0
    ) {
        const target = this.findKimonTarget(board, 50);
        if (target !== null) {
            const postBoard = board.map((sq, i) => (i === target ? { player: undefined, bind: 0, effects: [lockEffect(3)] } : sq));
            return { move: this.getBestMove(postBoard, life), skills: ['onClickKimon'], stompTarget: target };
        }
    }

    // 毒使い ミアズマ: 自陣の毒マスの周囲の敵に毒を撒く（対象選択なし。手番は進まないので通常着手へ続ける）(旧sim AI と同一)
    if (this.character === 'poisoner') {
        const miasmaCost = Math.max(MIASMA_MIN_COST, this.calculateAICost(costs.onClickMiasma - this.ownPoisonCount(board), false, true));
        // 魔力が有り余るとき: 毒霧(全コマに毒) → ミアズマ の連打。毒霧で自陣の全コマに毒が乗り（ライフ1.5倍）、ミアズマが自陣の毒を全て敵に送って消す。
        // 自陣の毒は残らず、毒が付いた自陣のコマの数だけ、隣の敵コマに毒が積み上がる
        if (availableSkills.includes(29) && this.opponents.every((o) => this.countReaches(board, o) === 0)) {
            const mistCost = this.calculateAICost(costs.onClickPoisonMist, false, true, 'onClickPoisonMist');
            if (magic >= mistCost + MIASMA_MIN_COST + POISON_RICH_RESERVE) {
                const after = board.map((sq) => ({ ...sq, effects: [...sq.effects] }));
                addPoison(after, poisonMistTargets(after, this.characters), this.characters);
                const mistMiasmaCost = Math.max(MIASMA_MIN_COST, this.calculateAICost(costs.onClickMiasma - poisonCountFor(after, this.playerSymbol), false, true));
                if (magic >= mistCost + mistMiasmaCost + POISON_RICH_RESERVE && this.miasmaScore(after) >= MIST_MIASMA_MIN_SCORE) {
                    return { move: this.getBestMove(board, life), skills: ['onClickPoisonMist', 'onClickMiasma'] };
                }
            }
        }
        if (magic >= miasmaCost && this.miasmaScore(board) >= MIASMA_MIN_SCORE) {
            return { move: this.getBestMove(board, life), skills: ['onClickMiasma'] };
        }
    }

    // 毒使い×毒花: インジェクションが手札にあるとき、敵に隣接する自コマに積極的に毒を盛る（バッズが付き、後でミアズマで敵に送る）
    if (
        this.character === 'poisoner' &&
        this.hasToxicBloom &&
        availableSkills.includes(15) &&
        magic >= this.calculateAICost(costs.onClickInjection, false, true) &&
        this.countReaches(board, this.playerSymbol) === 0
    ) {
        const target = this.findOwnBloomTarget(board);
        if (target !== null) {
            return { move: this.getBestMove(board, life), skills: ['onClickInjection'], stompTarget: target };
        }
    }
    return null;
}

/** 雷霆の巫の帯電とオブジェクト（大木・雷雲・毒沼）。当てはまる手があればその結果を返し、なければ null（次の段階へ） */
function planChargeAndObjects(this: AIPlayer, c: PlanContext): AIResult | null {
    const { costs, availableSkills, seatMagic, chargeClicks } = c;
    let { board, magic } = c;
    // 雷霆の巫: 帯電拡散→範囲帯電→帯電付与は対象マスをクリックする2段階スキル。手番は進まないので、
    // 撃った後の盤面・魔力で通常のスキル選択と着手へ続ける（相手にリーチがあるときは撃たない）。
    // ジャマーは相手にリーチがあっても撃つ（要の駒をライフ0にして、同じ手番で奪って崩す）
    const chargeCost = (base: number) => reducedChargeCost(base, board, (c) => this.calculateAICost(c));
    if (this.character === 'electrician' && this.opponents.every((o) => this.countReaches(board, o) === 0)) {
        const spreadCost = chargeCost(costs.onClickChargeSpread);
        if (magic >= spreadCost) {
            const start = this.bestChargeSpreadTarget(board);
            if (start !== null) {
                chargeClicks.push({ skill: 'onClickChargeSpread', target: start });
                board = withCharge(board, connectedPieces(board, start, this.sizeOf(board)), this.seatCharacters());
                magic -= spreadCost;
                this.updateShield(board);
            }
        }
        if (availableSkills.includes(24) && magic >= this.calculateAICost(costs.onClickChargeArea, false, false, 'onClickChargeArea')) {
            const center = this.bestChargeAreaTarget(board);
            if (center !== null) {
                chargeClicks.push({ skill: 'onClickChargeArea', target: center });
                board = withCharge(board, geometryForCells(board.length).stompRange(center), this.seatCharacters());
                magic -= this.calculateAICost(costs.onClickChargeArea, false, false, 'onClickChargeArea');
                this.updateShield(board);
            }
        }
        const oneCost = chargeCost(costs.onClickChargeOne);
        if (availableSkills.includes(22) && magic >= oneCost) {
            const target = this.bestChargeOneTarget(board);
            if (target !== null) {
                chargeClicks.push({ skill: 'onClickChargeOne', target });
                board = withCharge(board, [target], this.seatCharacters());
                magic -= oneCost;
                this.updateShield(board);
            }
        }
    }
    if (this.character === 'electrician' && availableSkills.includes(26) && magic >= this.calculateAICost(costs.onClickJammer, false, false, 'onClickJammer')) {
        const target = this.bestJammerTarget(board);
        if (target !== null) {
            chargeClicks.push({ skill: 'onClickJammer', target });
            board = board.slice();
            applyJammer(board, target, this.sizeOf(board), this.playerSymbol);
            magic -= this.calculateAICost(costs.onClickJammer, false, false, 'onClickJammer');
            this.updateShield(board);
        }
    }
    // 沈黙は雷なり（雷霆の巫）: 自陣の⚡を1スタック払って、相手の次の手番のスキルを封じる。相手が次の手番に固有スキルを撃てる魔力に届いていて、
    // 相手にリーチが無いときだけ撃つ（汎用サイレンスと同じ考え方。氷室の番人の絶対零度は実コスト = 10 − 氷結の数 で見積もる）
    if (this.character === 'electrician' && availableSkills.includes(BOLT_SILENCE_IDX) && this.opponents.every((o) => this.countReaches(board, o) === 0)) {
        const cost = this.calculateAICost(costs.onClickBoltSilence, false, false, 'onClickBoltSilence');
        const total = board.reduce((n, sq) => (sq.player === this.playerSymbol && !isDormant(sq) ? n + chargeStacks(sq) : n), 0);
        if (total >= BOLT_SILENCE_BOLTS && magic >= cost && this.opponentsCanCastBig(board, seatMagic)) {
            // ⚡を払うコマを1つずつ選ぶ（払うたびに盤面を更新して、同じコマから2個になってもよい）
            const targets: number[] = [];
            let b = board.map((sq) => ({ ...sq, effects: [...sq.effects] }));
            for (let k = 0; k < BOLT_SILENCE_BOLTS; k++) {
                const t = this.boltSilenceTarget(b);
                if (t === null) break;
                targets.push(t);
                const at = b[t].effects.findIndex((e) => e.effect === '⚡');
                b[t] = { ...b[t], effects: b[t].effects.filter((_, j) => j !== at) };
            }
            if (targets.length === BOLT_SILENCE_BOLTS) {
                chargeClicks.push({ skill: 'onClickBoltSilence', target: targets[0], target2: targets[1] }); // スキル→1個目のマス→2個目のマスの順にクリックする
                board = b;
                magic -= cost;
                this.updateShield(board);
            }
        }
    }
    // 大木（雷霆の巫）: 手番開始時のマジック+3。魔力が律速の雷霆の巫は、早めに立てるほど回収できる（コスト8 ÷ 3 ≒ 3手番で元が取れる）。
    // 相手にリーチも自分に勝ち筋も無く、盤面に空きが十分あり、🔥で壊される相手（煉獄の鍛冶師）がいないときだけ立てる。
    // 置くマスは、自分の列を潰さず、敵の列を潰せるマス（オブジェクトは列に数えず、置けないマスとして残る）
    if (this.character === 'yinYangMaster' && availableSkills.includes(OBJECT_DEFS.bigTree.idx) && this.ownTrees < BIG_TREE_MAX
        && this.opponents.every((o) => this.countReaches(board, o) === 0) && this.countReaches(board, this.playerSymbol) === 0
        && !this.opponents.some((o) => this.characterOf(o) === 'pyromancer')
        && findEmptyIndexes(board).length >= BIG_TREE_MIN_EMPTY) {
        const cost = this.calculateAICost(costs.onClickBigTree, false, false, 'onClickBigTree');
        const cell = this.bestTreeCell(board);
        // コストに届かないがあと少しなら、他のスキルへの支払いを控えてためる（届いた手番に立てる）
        if (cell !== null && magic < cost && magic >= cost - BIG_TREE_HOLD_GAP) this.holdPG = cost;
        if (cell !== null && magic >= cost) {
            chargeClicks.push({ skill: 'onClickBigTree', target: cell });
            board = board.slice();
            board[cell] = { player: undefined, bind: 0, effects: [{ effect: '🔑' }] }; // 以後の計画では『置けない空きマス』として扱う
            magic -= cost;
        }
    }
    // 砦・市場（鍵師）: 自陣にオブジェクトが無い間だけ1つ立てる。普請道楽ギア（自陣にオブジェクトがある間は全スキル-3）の起点にする。
    // 相手にリーチも自分に勝ち筋も無いときに、自分の列を潰さず敵の列を潰せるマスへ（大木と同じ置き場所の選び方）
    if ((this.character === 'keysmith' || this.character === 'witch') && this.ownObjectCount === 0
        && this.opponents.every((o) => this.countReaches(board, o) === 0) && this.countReaches(board, this.playerSymbol) === 0
        && findEmptyIndexes(board).length >= BIG_TREE_MIN_EMPTY) {
        for (const [def, key] of [[OBJECT_DEFS.fort, 'onClickFort'], [OBJECT_DEFS.market, 'onClickMarket']] as const) {
            if (!availableSkills.includes(def.idx)) continue;
            const cost = this.calculateAICost(costs[key], false, false, key);
            const cell = this.bestTreeCell(board);
            if (cell === null || magic < cost) continue;
            chargeClicks.push({ skill: key, target: cell });
            board = board.slice();
            board[cell] = { player: undefined, bind: 0, effects: [{ effect: '🔑' }] };
            magic -= cost;
            break;
        }
    }
    // 雷雲（雷霆の巫）: 手番開始のたび、周囲八マスのコマのランダムな1つに⚡（雷霆以外のコマは着地ダメージ2）。敵のコマが2つ以上隣り合うマスに立てると、
    // 毎手番、帯電付与を無料で撃つのと同じ（ライフの低い敵コマが0になり奪える）。相手にリーチが無く、自分に勝ち筋が無いときだけ
    if (this.character === 'electrician' && availableSkills.includes(OBJECT_DEFS.thundercloud.idx) && this.ownClouds < CLOUD_MAX
        && this.opponents.every((o) => this.countReaches(board, o) === 0) && this.countReaches(board, this.playerSymbol) === 0
        && findEmptyIndexes(board).length >= CLOUD_MIN_EMPTY) {
        const cost = this.calculateAICost(costs.onClickThundercloud, false, false, 'onClickThundercloud');
        const cell = this.bestCloudCell(board);
        if (cell !== null && magic >= cost) {
            chargeClicks.push({ skill: 'onClickThundercloud', target: cell });
            board = board.slice();
            board[cell] = { player: undefined, bind: 0, effects: [{ effect: '🔑' }] };
            magic -= cost;
        }
    }
    // 毒沼（雷霆の巫）: 手番開始のたび、周囲八マスの敵のコマのランダムな1つに☠。ライフ0で奪われない雷霆は、削れて0になった敵コマを一方的に奪える。
    // 敵のコマが2つ以上隣り合うマスに立てる。相手にリーチが無く、自分に勝ち筋が無いときだけ（雷雲と同じ考え方。測定は差なし: docs/tune/electrician.md 試行53）
    if (this.character === 'electrician' && availableSkills.includes(OBJECT_DEFS.poisonSwamp.idx) && this.ownSwamps < CLOUD_MAX
        && this.opponents.every((o) => this.countReaches(board, o) === 0) && this.countReaches(board, this.playerSymbol) === 0
        && findEmptyIndexes(board).length >= CLOUD_MIN_EMPTY) {
        const cost = this.calculateAICost(costs.onClickPoisonSwamp, false, false, 'onClickPoisonSwamp');
        const cell = this.bestCloudCell(board);
        if (cell !== null && magic >= cost) {
            chargeClicks.push({ skill: 'onClickPoisonSwamp', target: cell });
            board = board.slice();
            board[cell] = { player: undefined, bind: 0, effects: [{ effect: '🔑' }] };
            magic -= cost;
        }
    }
    // 閻魔の舌（毒使い×氷室の番人）: 相手が自分のコマにエフェクトを付けると、そのコマのライフが手番終わりに0になる。氷室の番人は自陣のコマに❄を付け続けるので、
    // ❄で毒を止めていたコマがライフ0になって奪える（毒使いの最悪対面。上限実験 対氷室 9→24%: docs/tune/poisoner.md）。1つあれば働くので1つだけ立てる。
    // 置き場所の条件と選び方は大木と同じ（相手にリーチも自分に勝ち筋も無いとき、自分の列を潰さず敵の列を潰せるマス）
    if (this.character === 'poisoner' && availableSkills.includes(OBJECT_DEFS.tongueKing.idx) && this.ownTongues === 0
        && this.opponents.some((o) => this.characterOf(o) === 'cryomancer')
        && this.opponents.every((o) => this.countReaches(board, o) === 0) && this.countReaches(board, this.playerSymbol) === 0
        && findEmptyIndexes(board).length >= BIG_TREE_MIN_EMPTY) {
        const cost = this.calculateAICost(costs.onClickTongueKing, false, false, 'onClickTongueKing');
        const cell = this.bestTreeCell(board);
        if (cell !== null && magic >= cost) {
            chargeClicks.push({ skill: 'onClickTongueKing', target: cell });
            board = board.slice();
            board[cell] = { player: undefined, bind: 0, effects: [{ effect: '🔑' }] };
            magic -= cost;
        }
    }
    c.board = board;
    c.magic = magic;
    return null;
}

/** 氷室・魔女・毒使いの固有の撃ち方と、浄化。当てはまる手があればその結果を返し、なければ null（次の段階へ） */
function planOverflowCasts(this: AIPlayer, c: PlanContext): AIResult | null {
    const { costs, availableSkills, chargeClicks } = c;
    let { board, magic } = c;
    // 氷室の番人の絶対零度（クリック不要・手番は続く）/ 煉獄の鍛冶師の業火（どちらもクリック不要・手番は続く）
    if (this.character === 'cryomancer') {
        const cost = reducedGlacierCost(costs.onClickGlacier, this.glacierCharge, (c) => this.calculateAICost(c));
        if (!this.glacierPending && magic >= cost && this.shouldGlacier(board)) {
            chargeClicks.push({ skill: 'onClickGlacier' });
            board = board.slice();
            freezeAll(board);
            magic -= cost;
        }
    }
    // 氷室の番人×魔力が有り余るとき: 氷結を重ねて砕氷（❄1つにつき3ダメージ）で敵コマを壊す。壊すとネクロの墓地が増えるので、ネクロが相手のときは撃たない
    if (this.character === 'cryomancer' && availableSkills.includes(47) && !this.characters.some((c, seat) => seat !== seatOf(this.playerSymbol) && c === 'necromancer')) {
        const freezeCost = this.calculateAICost(costs.onClickCryoFreeze, false, false, 'onClickCryoFreeze');
        const shatterCost = this.calculateAICost(costs.onClickShatter, false, false, 'onClickShatter');
        for (let n = 0; n < SHATTER_MAX_PER_TURN; n++) {
            const plan = this.bestShatterTarget(board, freezeCost);
            if (plan === null || magic - plan.freezes * freezeCost - shatterCost < SHATTER_RESERVE) break;
            for (let k = 0; k < plan.freezes; k++) chargeClicks.push({ skill: 'onClickUseLock', target: plan.cell });
            chargeClicks.push({ skill: 'onClickShatter', target: plan.cell });
            board = board.map((sq) => ({ ...sq, effects: [...sq.effects] }));
            for (let k = 0; k < plan.freezes; k++) freeze(board, [plan.cell]);
            shatter(board, plan.cell);
            this.updateShield(board);
            magic -= plan.freezes * freezeCost + shatterCost;
        }
    }
    // 凩の魔女の虎落笛（クリック不要・手番は続く）: 自陣の🍂が2枚以上あり、ライフの残った敵コマ2つ以上に当たるときに撃つ
    if (this.character === 'witch') {
        const cost = this.calculateAICost(costs.onClickMogaribue, false, false, 'onClickMogaribue');
        if (magic >= cost && mogaribueDamage(board, this.playerSymbol) >= 2 && mogaribueTargets(board, this.playerSymbol, this.seatCharacters()).filter((i) => !this.shield.has(i)).length >= 2) {
            chargeClicks.push({ skill: 'onClickMogaribue' });
            board = board.slice();
            mogaribue(board, this.playerSymbol, this.seatCharacters());
            magic -= cost;
            this.updateShield(board);
        }
    }
    // 毒使い×魔力が有り余るとき: 連続で撃つと強い パンデミック(敵が集まる3×3に毒) → 猛毒化(盤面の毒を倍) の順に撃つ。
    // 毒は着手のたびに減衰するので、撃った手番のうちに倍にするのが効く。どちらも対象に自陣を巻き込みすぎないときだけ
    if (this.character === 'poisoner' && this.opponents.every((o) => this.countReaches(board, o) === 0)) {
        const pandemicCost = this.calculateAICost(costs.onClickPandemic, false, true, 'onClickPandemic');
        if (availableSkills.includes(19) && magic - pandemicCost >= POISON_RICH_RESERVE) {
            const center = this.bestPandemicTarget(board);
            if (center !== null) {
                chargeClicks.push({ skill: 'onClickPandemic', target: center });
                board = board.slice();
                const hit = pandemicTargets(board, center, this.characters);
                addPoison(board, hit, this.characters);
                magic -= pandemicCost;
                this.updateShield(board);
            }
        }
        const intensifyCost = this.calculateAICost(costs.onClickIntensify, false, true, 'onClickIntensify');
        if (availableSkills.includes(18) && magic - intensifyCost >= POISON_RICH_RESERVE) {
            const foe = board.reduce((n, sq) => (this.isEnemy(sq.player) ? n + activePoison(sq) : n), 0);
            // 敵の1マスの毒が十分大きい（ライフを超える）なら、もう倍にしても意味がない。🔑ロック中のコマは毒で死なないので、撃ち続けると毒が倍々に増えて試合が終わらなくなる
            const foeMax = board.reduce((m, sq) => (this.isEnemy(sq.player) ? Math.max(m, activePoison(sq)) : m), 0);
            if (foe >= INTENSIFY_MIN_FOE_POISON && foe > poisonCountFor(board, this.playerSymbol) + 1 && foeMax < INTENSIFY_MAX_CELL_POISON) {
                chargeClicks.push({ skill: 'onClickIntensify' });
                board = board.map((sq) => ({ ...sq, effects: [...sq.effects] }));
                intensifyPoison(board, this.characters);
                magic -= intensifyCost;
                this.updateShield(board);
            }
        }
    }
    // 浄化（汎用スキル）: 自陣のコマ（ライフ>0）の状態異常が合計3スタック以上で撃つ。雷霆の巫の⚡無敵は数えない
    if (availableSkills.includes(32)) {
        const cost = this.calculateAICost(costs.onClickCleanse, false, false, 'onClickCleanse');
        const stacks = board.reduce(
            (n, sq, i) => (sq.player === this.playerSymbol && sq.bind > 0 ? n + ailmentStacks(sq) - (this.shield.has(i) ? chargeStacks(sq) : 0) : n),
            0
        );
        if (magic >= cost && stacks >= 3) {
            chargeClicks.push({ skill: 'onClickCleanse' });
            board = board.slice();
            cleanse(board, this.playerSymbol);
            magic -= cost;
            this.updateShield(board);
        }
    }
    c.board = board;
    c.magic = magic;
    return null;
}

/** バッズ系の汎用スキルと煉獄の鍛冶師の火炎。当てはまる手があればその結果を返し、なければ null（次の段階へ） */
function planBudsAndFire(this: AIPlayer, c: PlanContext): AIResult | null {
    const { costs, opponentMagic, life, availableSkills, chargeClicks } = c;
    let { board, magic } = c;
    // バッズ系の汎用スキル。氷結・火炎で🌱が消えるキャラ（氷室の番人・煉獄の鍛冶師）が他席にいるときに守りに使う
    {
        const size = this.sizeOf(board);
        const threatened = this.characters.some((c, seat) => seat !== seatOf(this.playerSymbol) && (c === 'cryomancer' || c === 'pyromancer'));
        const ownBuds = () => board.reduce((n, sq) => (sq.player === this.playerSymbol ? n + activeBuds(sq, this.budGuard) : n), 0);
        // 冬至の種子: 自陣の休眠マス（氷結中）の🌱が2以上あり、まだガード中でなければ（ガード中は🌱が働く）
        const dormantBuds = board.reduce((n, sq) => (sq.player === this.playerSymbol && isDormant(sq) ? n + budStacks(sq) : n), 0);
        if (availableSkills.includes(34) && dormantBuds >= 2 && !this.budGuard && magic >= this.calculateAICost(costs.onClickSolstice, false, false, 'onClickSolstice')) {
            chargeClicks.push({ skill: 'onClickSolstice' });
            magic -= this.calculateAICost(costs.onClickSolstice, false, false, 'onClickSolstice');
        } else if (availableSkills.includes(33) && threatened && this.character !== 'magician' && ownBuds() >= 4 && magic >= this.calculateAICost(costs.onClickHarvestEve, false, false, 'onClickHarvestEve')) {
            chargeClicks.push({ skill: 'onClickHarvestEve' });
            board = board.slice();
            magic += harvestBuds(board, this.playerSymbol, this.budGuard) - this.calculateAICost(costs.onClickHarvestEve, false, false, 'onClickHarvestEve');
        }
        if (availableSkills.includes(35) && magic >= this.calculateAICost(costs.onClickSucker, false, false, 'onClickSucker')) {
            let best = -1, bestN = 1;
            board.forEach((sq, i) => {
                if (sq.player !== this.playerSymbol || budStacks(sq) === 0 || this.shield.has(i)) return;
                const n = budReceivers(board, i, this.playerSymbol, size).length;
                if (n > bestN) { best = i; bestN = n; }
            });
            if (best !== -1) {
                chargeClicks.push({ skill: 'onClickSucker', target: best });
                board = board.slice();
                graft(board, best, this.playerSymbol, size, budReceivers(board, best, this.playerSymbol, size).slice(0, GRAFT_MAX));
                magic -= this.calculateAICost(costs.onClickSucker, false, false, 'onClickSucker');
            }
        }
        // 🍂落ち葉: 敵陣の🍂が2枚以上でコストが重いなら焚き火の唄で払う。自陣の🍂が3枚以上たまったら1枚を腐葉土で🌱に。
        // 一葉知秋は、自陣の🌱が多く敵に🌱が無く、相手がスキルに頼っている（魔力が多い）ときだけ（盤面の🌱が全部🍂になる）
        const leafCost = (key: 'onClickBonfire' | 'onClickMulch' | 'onClickAutumn') => this.calculateAICost(costs[key], false, false, key);
        if (availableSkills.includes(66) && leafSurcharge(board, this.playerSymbol) >= 2 && bonfireTargets(board, this.playerSymbol).length > 0 && magic >= leafCost('onClickBonfire')) {
            chargeClicks.push({ skill: 'onClickBonfire' });
            board = board.slice();
            bonfire(board, this.playerSymbol);
            magic -= leafCost('onClickBonfire');
        }
        if (availableSkills.includes(67) && magic >= leafCost('onClickMulch')) {
            const leaves = mulchCandidates(board, this.playerSymbol);
            if (leaves.length >= 3) {
                chargeClicks.push({ skill: 'onClickMulch' });
                board = board.slice();
                mulch(board, leaves[0]);
                magic -= leafCost('onClickMulch');
            }
        }
        if (availableSkills.includes(68) && opponentMagic >= 6 && ownBuds() >= 4 && magic >= leafCost('onClickAutumn')) {
            const enemyBuds = board.reduce((n, sq) => (sq.player && sq.player !== this.playerSymbol ? n + budStacks(sq) : n), 0);
            if (enemyBuds === 0) {
                chargeClicks.push({ skill: 'onClickAutumn' });
                board = board.slice();
                autumn(board);
                magic -= leafCost('onClickAutumn');
            }
        }
        if (availableSkills.includes(36) && magic >= this.calculateAICost(costs.onClickWindborne, false, false, 'onClickWindborne')) {
            const cands = sowCandidates(board, this.playerSymbol);
            if (cands.length >= SOW_COUNT && ownBuds() < SOW_COUNT) {
                chargeClicks.push({ skill: 'onClickWindborne' });
                // 実際の配置はランダム。AIの内部盤面は代表として先頭のマスに足して見積もる
                board = board.slice();
                sow(board, cands.slice(0, SOW_COUNT));
                magic -= this.calculateAICost(costs.onClickWindborne, false, false, 'onClickWindborne');
            }
        }
    }
    if (this.character === 'pyromancer') {
        const targets = infernoTargets(board, this.playerSymbol, this.characters);
        const worth = targets.length > 0 && this.shouldInferno(board);
        // 業火は前回の業火から3回スキルを使うと無料。クリック不要の軽いスキルを足りない回数だけ先に撃ち、
        // その合計が業火の通常コスト以下なら連打してから無料で撃つ（旧sim AI の pyroChain と同方針）
        const kinds = new Set([...Array.from(this.skillKinds), ...chargeClicks.map((c) => c.skill)]);
        const need = this.infernoReady ? 0 : INFERNO_FREE_SKILLS - kinds.size;
        const normal = this.calculateAICost(costs.onClickInferno, false, false, 'onClickInferno');
        // 無料権は手番を跨いで持ち越せるので、業火を撃てる状況でなくても先に貯める
        if (need > 0) {
            const mine = (f: (sq: SquareInfo) => boolean) => board.some((sq) => sq.player === this.playerSymbol && f(sq));
            const fillers = [
                { idx: 53, skill: 'onClickMarkdown', cost: this.calculateAICost(costs.onClickMarkdown, false, false, 'onClickMarkdown'), ok: true },
                { idx: 54, skill: 'onClickEffectDiscount', cost: this.calculateAICost(costs.onClickEffectDiscount, false, false, 'onClickEffectDiscount'), ok: true },
                { idx: 55, skill: 'onClickTokenDiscount', cost: this.calculateAICost(costs.onClickTokenDiscount, false, false, 'onClickTokenDiscount'), ok: true },
                { idx: 56, skill: 'onClickVitalMarkdown', cost: this.calculateAICost(costs.onClickVitalMarkdown, false, false, 'onClickVitalMarkdown'), ok: true },
                { idx: 0, skill: 'onClickAddLife', cost: this.calculateAICost(costs.onClickAddLife, false, false, 'onClickAddLife'), ok: true },
                { idx: 1, skill: 'onClickBibine', cost: this.calculateAICost(costs.onClickBibine, false, false, 'onClickBibine'), ok: true },
                { idx: 36, skill: 'onClickWindborne', cost: this.calculateAICost(costs.onClickWindborne, false, false, 'onClickWindborne'), ok: sowCandidates(board, this.playerSymbol).length > 0 },
                { idx: 34, skill: 'onClickSolstice', cost: this.calculateAICost(costs.onClickSolstice, false, false, 'onClickSolstice'), ok: !this.budGuard && mine(() => true) },
                { idx: 32, skill: 'onClickCleanse', cost: this.calculateAICost(costs.onClickCleanse, false, false, 'onClickCleanse'), ok: mine((sq) => ailmentStacks(sq) > 0) },
                { idx: 33, skill: 'onClickHarvestEve', cost: this.calculateAICost(costs.onClickHarvestEve, false, false, 'onClickHarvestEve'), ok: mine((sq) => activeBuds(sq, this.budGuard) > 0) },
            ].filter((f) => availableSkills.includes(f.idx) && f.ok && !kinds.has(f.skill));
            const chosen = [...fillers].sort((a, b) => a.cost - b.cost).slice(0, need);
            const total = chosen.reduce((n, f) => n + f.cost, 0);
            if (chosen.length === need && total <= normal && total <= magic) {
                for (const f of fillers.filter((x) => chosen.includes(x))) {
                    chargeClicks.push({ skill: f.skill });
                    board = board.slice();
                    if (f.idx === 36) sow(board, sowCandidates(board, this.playerSymbol).slice(0, SOW_COUNT));
                    else if (f.idx === 32) cleanse(board, this.playerSymbol);
                    else if (f.idx === 33) magic += harvestBuds(board, this.playerSymbol, this.budGuard);
                    magic -= f.cost;
                }
            }
        }
        // 軽減札で業火が安くなる/撃てるようになるなら先に撃つ（旧sim AI の discountInferno と同方針）。
        // 計画中の軽減量は plannedCut に持ち、業火の見積もりから引く
        let plannedCut = 0;
        const freeNow = () => this.infernoReady || new Set([...Array.from(this.skillKinds), ...chargeClicks.map((c) => c.skill)]).size >= INFERNO_FREE_SKILLS;
        const infernoBase = () => this.calculateAICost(costs.onClickInferno, false, false, 'onClickInferno');
        const infernoNow = () => (freeNow() ? 0 : Math.max(1, infernoBase() - plannedCut));
        if (worth && !freeNow()) {
            const reducers: { idx: number; key: keyof typeof costs; cut: number; unique?: boolean }[] = [
                { idx: 60, key: 'onClickCounterMarkdown', cut: 3 },
                { idx: 58, key: 'onClickClearance', cut: 7 },
                { idx: 56, key: 'onClickVitalMarkdown', cut: 4 },
                { idx: 53, key: 'onClickMarkdown', cut: 3 },
                { idx: 57, key: 'onClickUniqueDiscount', cut: 6, unique: true },
            ];
            for (let i = 0; i < 3; i++) {
                const cur = infernoNow();
                if (cur === 0) break;
                let pick: { r: (typeof reducers)[number]; rc: number; total: number } | null = null;
                for (const r of reducers) {
                    if (!availableSkills.includes(r.idx) || chargeClicks.some((c) => c.skill === r.key)) continue;
                    if (r.unique && (life < 2 || this.skillKinds.has(r.key))) continue; // 固有割引は1ターン1度・ライフ-1
                    const rc = this.calculateAICost(costs[r.key], false, false, r.key);
                    if (magic < rc) continue;
                    const total = rc + Math.max(1, infernoBase() - plannedCut - r.cut);
                    if (total <= magic && total < cur && (!pick || total < pick.total)) pick = { r, rc, total };
                }
                if (!pick) break;
                chargeClicks.push({ skill: pick.r.key });
                magic -= pick.rc;
                plannedCut += pick.r.cut;
            }
        }
        // 固有の火遁: 敵コマを燃やす。異なるスキル3種類で業火が無料になるので、その1種類にもなる。
        // ネクロマンサーが相手のときは撃たない（コマが壊れるたび墓地が増え、蘇生の資源になる）。旧sim AI の igniteSig=1 / igniteSkip=1
        const igniteCost = this.calculateAICost(costs.onClickIgnite, false, false, 'onClickIgnite');
        const necroFoe = this.characters.some((c, seat) => seat !== seatOf(this.playerSymbol) && c === 'necromancer');
        // 業火が今撃てるなら、火遁で魔力を使って業火を撃てなくしない
        const blocksInferno = worth && magic >= infernoNow() && magic - igniteCost < infernoNow();
        // 火口(🌱か🍂のある敵コマ専用。鍛冶師は1コスト)は火遁より先に撃つ。別の種類のスキルなので火遁とも両方撃てる。旧sim AI の火口と同一
        const tinderCost = this.calculateAICost(costs.onClickTinder, false, false, 'onClickTinder');
        if (!necroFoe && availableSkills.includes(87) && !this.skillKinds.has('onClickTinder') && !chargeClicks.some((c) => c.skill === 'onClickTinder') && magic >= tinderCost
            && !(worth && magic >= infernoNow() && magic - tinderCost < infernoNow())) {
            const t = this.bestTinderTarget(board);
            if (t !== null) {
                chargeClicks.push({ skill: 'onClickTinder', target: t });
                board = board.slice();
                ignite(board, [t], this.sizeOf(board), 1);
                this.updateShield(board);
                magic -= tinderCost;
            }
        }
        // 飛び火(ランダムな敵2マスに🔥。直前の手番に相手が2コマ以上設置していれば無料)。火遁より🔥が多く付くので先に撃つ。対象は撃つ時に決まるので盤面は更新しない
        const sparkCost = this.calculateAICost(costs.onClickSpark, false, false, 'onClickSpark');
        if (!necroFoe && availableSkills.includes(97) && !this.skillKinds.has('onClickSpark') && !chargeClicks.some((c) => c.skill === 'onClickSpark') && magic >= sparkCost
            && !(worth && magic >= infernoNow() && magic - sparkCost < infernoNow())
            && fireWheelTargets(board, this.playerSymbol, (sq, i) => this.shield.has(i) || sq.effects.some((e) => e.effect === '🔑')).length >= 2) {
            chargeClicks.push({ skill: 'onClickSpark' });
            magic -= sparkCost;
        }
        if (!necroFoe && !blocksInferno && !this.skillKinds.has('onClickIgnite') && !chargeClicks.some((c) => c.skill === 'onClickIgnite') && magic >= igniteCost) {
            const t = this.bestIgniteTarget(board);
            if (t !== null) {
                chargeClicks.push({ skill: 'onClickIgnite', target: t });
                board = board.slice();
                ignite(board, [t], this.sizeOf(board), 1);
                this.updateShield(board);
                magic -= igniteCost;
            }
        }
        const cost = infernoNow();
        if (magic >= cost && worth) {
            chargeClicks.push({ skill: 'onClickInferno' });
            board = board.slice();
            ignite(board, targets, this.sizeOf(board), INFERNO_STACKS);
            magic -= cost;
        }
        // バーンアウト: 🔥のマスを全て壊す。敵のコマが自陣より2つ以上多く壊れるなら撃つ（業火の直後は敵全員が🔥2つなので、合計4以上でタダになりやすい）
        if (availableSkills.includes(61)) {
            const burnTargets = burnoutTargets(board, this.characters);
            const foes = burnTargets.filter((k) => this.isEnemy(board[k].player)).length;
            const own = burnTargets.filter((k) => board[k].player === this.playerSymbol).length;
            const burnCost = burnoutCostOf(costs.onClickBurnout, totalFlames(board), (c) => this.calculateAICost(c, false, false, 'onClickBurnout'));
            if (foes - own >= 2 && magic >= burnCost) {
                chargeClicks.push({ skill: 'onClickBurnout' });
                board = board.slice();
                burnout(board, burnTargets);
                magic -= burnCost;
            }
        }
    }
    c.board = board;
    c.magic = magic;
    return null;
}


export function planMove(
    this: AIPlayer,
    board: SquareInfo[],
    magic: number,
    costs: Record<keyof SkillCosts, number>,
    opponentMagic: number,
    life: number,
    availableSkills: number[],
    tokenUsed: boolean,
    necroRemain: number = 0,
    necroCost: number = 0,
    judgeCost: number = 99,
    assaultCost: number = 99,
    proliferateActive: boolean = false,
    seatMagic: number[] = [],
    necroPay: number = necroCost,
    necroCosts: number[] = []
): AIResult {
    this.necroActive = necroRemain > 0;
    this.updateShield(board);

    const c: PlanContext = { board, magic, costs, opponentMagic, life, availableSkills, tokenUsed, necroRemain, necroCost, judgeCost, assaultCost, proliferateActive, seatMagic, necroPay, necroCosts, facesWitch: false, holdFlood: false, chargeClicks: [] };
    for (const phase of PLAN_PHASES) {
        const result = phase.call(this, c);
        if (result) return result;
    }
    // 段階の途中で更新された board / magic を引き継ぐ
    board = c.board;
    magic = c.magic;
    const { holdFlood, chargeClicks } = c;
    let chargeResult: { skill: string; target?: number }[] | undefined = chargeClicks.length > 0 ? chargeClicks : undefined;

    // 魔法使い: 相手にリーチがあっても、敵のリーチを全て崩せる審判の日は撃つ（sim/ai.js judgeUnderThreat: 対魔女・毒使い 40.5→45.3% seed8/300、全相手 49.6→55.3% seed9/150）
    if (this.character === 'magician' && magic >= judgeCost && !this.opponents.some((o) => this.characters[seatOf(o)] === 'necromancer')
        && !this.opponents.every((o) => this.countReaches(board, o) === 0)) {
        const breakTarget = this.findJudgeBreakingReach(board);
        if (breakTarget !== null) return { move: breakTarget, skills: ['onClickJudgeDay'] };
    }

    // 巨人ストンプ / 魔法使い審判の日 (相手リーチが無いとき)
    if (this.opponents.every((o) => this.countReaches(board, o) === 0)) {
        if (this.character === 'giant' && magic >= this.calculateAICost(costs.onClickStomp, false, false, 'onClickStomp')) {
            const target = this.findStompTarget(board);
            if (target !== null) {
                // ストンプは手番を終えないので、破壊後の盤面で通常着手も返す
                const postBoard = this.simulateStomp(board, target, this.playerSymbol, life);
                const followup = this.getBestMove(postBoard, life);
                return { move: followup, skills: ['onClickStomp'], stompTarget: target };
            }
        }
        // 氷室の番人は『ロックされていない🌱付きのコマ』を凍らせて魔力を止め、鍛冶師の🔥もロック中のコマには付かない。ロックしておけば防げるので、氷室・鍛冶師が相手のときは
        // 審判の日より先に自陣のコマを全てロックする（🌱付きを先に、次に🌱の無いコマ。旧sim AI lockFirstCryo=2: 対氷室 10→20%, lockFirstPyro=2: 対鍛冶師 33〜37→47〜51%）
        // 氷室が相手のときは先にロックしない: 手札固定(縮地・特売・返し特売・一寸の虫)を入れた後は、ロックに魔力を回すほうが裏目（対氷室 35.0→66.0%, seed151/300。LC=0）。鍛冶師は先にロックが最良（81.7 vs 71.0/70.7, seed152/300）
        if (this.character === 'magician' && this.opponents.some((o) => this.characters[seatOf(o)] === 'pyromancer')) {
            const lockCost = this.calculateAICost(costs.onClickUseLock, false, false, 'onClickUseLock');
            const afford = lockCost > 0 ? Math.floor(magic / lockCost) : CRYO_LOCK_MAX;
            const cells: number[] = [];
            const unlocked = (sq: SquareInfo) => sq.player === this.playerSymbol && !sq.effects.some((e) => e.effect === '🔑') && lockable(sq);
            for (let i = 0; i < board.length && cells.length < Math.min(CRYO_LOCK_MAX, afford); i++) {
                if (unlocked(board[i]) && board[i].effects.some((e) => e.effect === '🌱')) cells.push(i);
            }
            for (let i = 0; i < board.length && cells.length < Math.min(CRYO_LOCK_MAX, afford); i++) {
                if (unlocked(board[i]) && !cells.includes(i)) cells.push(i);
            }
            if (cells.length === 1) return { move: this.getBestMove(board, life), skills: ['onClickUseLock'], lockTargets: cells };
            if (cells.length > 1) return { move: this.getBestMove(board, life), skills: [], chargeClicks: cells.map((c) => ({ skill: 'onClickUseLock', target: c })) };
        }
        // 審判の日で壊したコマは墓地になり、ネクロマンサーの蘇生を安く大きくする。ネクロが相手のときは撃たない（旧sim AI noJudgeNecro: 対ネクロ 17→26%, seed22/300）
        const judgeFuelsNecro = this.opponents.some((o) => this.characters[seatOf(o)] === 'necromancer');
        if (this.character === 'magician' && !judgeFuelsNecro && magic >= judgeCost) {
            const target = this.findJudgeTarget(board);
            if (target !== null) {
                // 審判の日はそのターゲット着手で手番終了する
                return { move: target, skills: ['onClickJudgeDay'] };
            }
        }
        // 対ネクロ: 蘇生はライフ0のコマを吸収する（ロック中のコマは奪われない）。吸収されそうな自陣のコマ（ライフ1以下で未ロック）を先にロックし、
        // 切れそうなロック（残り NECRO_LOCK_REFRESH 以下）は重ねて延長する。効いたキャラだけ（NECRO_LOCK_CHARACTERS）
        if (NECRO_LOCK_CHARACTERS.includes(this.character) && this.opponents.some((o) => this.characters[seatOf(o)] === 'necromancer')) {
            const lockCost = this.calculateAICost(costs.onClickUseLock, false, false, 'onClickUseLock');
            const afford = lockCost > 0 ? Math.floor(magic / lockCost) : NECRO_LOCK_MAX;
            const guardCells: number[] = [];
            for (let i = 0; i < board.length && guardCells.length < Math.min(NECRO_LOCK_MAX, afford); i++) {
                const sq = board[i];
                if (sq.player !== this.playerSymbol || isObject(sq) || !lockable(sq) || sq.bind > 1) continue;
                const locked = sq.effects.some((e) => e.effect === '🔑');
                const stack = lockStack(sq);
                if (!locked || (stack > 0 && stack <= NECRO_LOCK_REFRESH)) guardCells.push(i);
            }
            if (guardCells.length === 1) return { move: this.getBestMove(board, life), skills: ['onClickUseLock'], lockTargets: guardCells };
            if (guardCells.length > 1) return { move: this.getBestMove(board, life), skills: [], chargeClicks: guardCells.map((c) => ({ skill: 'onClickUseLock', target: c })) };
        }
        // 魔法使い: 審判を撃たないなら、未ロックのバッズ駒を🔑ロックして魔力エンジンを守る
        // 1手番に複数のバッズ駒をロックしてよい（魔力が許す限り最大 MAGICIAN_MAX_LOCKS 個。旧sim AI の magLockN。
        // A/B: 環境勝率 +2.9pt(seed2/200)・+3.0pt(seed3/400)・+3.5pt(seed4/400)）
        if (this.character === 'magician') {
            const lockCost = this.calculateAICost(costs.onClickUseLock, false, false, 'onClickUseLock');
            const afford = lockCost > 0 ? Math.floor(magic / lockCost) : MAGICIAN_MAX_LOCKS;
            const budCells: number[] = [];
            for (let i = 0; i < board.length && budCells.length < Math.min(MAGICIAN_MAX_LOCKS, afford); i++) {
                const sq = board[i];
                if (sq.player === this.playerSymbol && sq.effects.some((e) => e.effect === '🌱') && !sq.effects.some((e) => e.effect === '🔑') && lockable(sq)) budCells.push(i);
            }
            if (budCells.length === 1) {
                return { move: this.getBestMove(board, life), skills: ['onClickUseLock'], lockTargets: budCells };
            }
            if (budCells.length > 1) {
                // 「スキル→対象クリック」を1回ずつ順に行う（chargeClicks）
                return { move: this.getBestMove(board, life), skills: [], chargeClicks: budCells.map((c) => ({ skill: 'onClickUseLock', target: c })) };
            }
        }
    }

    // 空蔵: 空きマスにかけたロックが切れると自陣のコマ(ライフ1)になる。自分の列の要になる空きマスを先にロックしておく。
    // ロック中は敵も置けないので敵の列を止める効果もある（旧sim AI の EL_AI と同一。tune-top 鍛冶師: 空蔵+収穫で環境勝率 +11.7pt）
    // 鍵師のコンボ: 二列並びの片方をロックして、もう片方に置く（敵は塞げない）。自分にリーチがあれば着手が先、敵にリーチがあれば止めるのが先
    if (
        this.character === 'keysmith' &&
        this.countReaches(board, this.playerSymbol) === 0 &&
        this.opponents.every((o) => this.countReaches(board, o) === 0) &&
        this.myEmptyLocks(board) < KEYSMITH_COMBO_EMPTY_LOCK_MAX &&
        magic >= this.calculateAICost(costs.onClickUseLock, false, false, 'onClickUseLock')
    ) {
        const combo = this.bestLockCombo(board, life);
        if (combo !== null) return { move: combo.place, skills: ['onClickUseLock'], lockTargets: [combo.lock] };
    }
    // 鍵師: ライフが尽きかけの、列づくりに効いている自陣のコマをロックして守る（1手番に1つ。ロック中のコマは奪われない）
    if (
        this.character === 'keysmith' &&
        magic >= this.calculateAICost(costs.onClickUseLock, false, false, 'onClickUseLock')
    ) {
        const own = this.bestOwnLockTarget(board);
        if (own !== null) {
            const post = board.map((sq) => ({ ...sq, effects: [...sq.effects] }));
            post[own] = addLock(post[own], 6);
            const followup = this.getBestMove(post, life);
            if (followup !== null) return { move: followup, skills: ['onClickUseLock'], lockTargets: [own] };
        }
    }
    // 鍵師+芽吹きの錠: ライフ2以下でバッズの無い自陣のコマをロックすると、そのコマにバッズが付く（バッズは毎手番の魔力になり、ロックで奪われない）。
    // 無料の1回で撃てるので、守りの判断のあとに1手番1つだけ。列づくりに効いているコマを優先する
    if (
        this.character === 'keysmith' && this.hasLockBloom &&
        this.countReaches(board, this.playerSymbol) === 0 &&
        magic >= this.calculateAICost(costs.onClickUseLock, false, false, 'onClickUseLock')
    ) {
        const sprout = this.bestBloomLockTarget(board);
        if (sprout !== null) {
            const post = board.map((sq) => ({ ...sq, effects: [...sq.effects] }));
            post[sprout] = addLock(post[sprout], 6);
            const followup = this.getBestMove(post, life);
            if (followup !== null) return { move: followup, skills: ['onClickUseLock'], lockTargets: [sprout] };
        }
    }
    // 鍵師は空きマスのロックを無視して置けるので、ギアが無くても常にこの判断を行う（敵だけが置けない空きマスを作る）
    if (
        (this.hasEmptyLock || this.character === 'keysmith') &&
        this.countReaches(board, this.playerSymbol) === 0 &&
        magic >= this.calculateAICost(costs.onClickUseLock, false, false, 'onClickUseLock') &&
        this.myEmptyLocks(board) < EMPTY_LOCK_MAX
    ) {
        const target = this.bestEmptyLockTarget(board);
        if (target !== null) {
            const post = board.map((sq) => ({ ...sq, effects: [...sq.effects] }));
            post[target] = addLock(post[target], 6, this.character === 'keysmith' ? undefined : seatOf(this.playerSymbol) + 1);
            const followup = this.getBestMove(post, life);
            if (followup !== null) return { move: followup, skills: ['onClickUseLock'], lockTargets: [target] };
        }
    }

    // 軽減札を先に撃つと、この手番に撃てるスキルが増える/魔力が余るなら撃つ（旧sim AI の discountPlan と同方針。
    // chooseSkills を「次のスキルを軽減した状態」で選び直して比べる）。クリック不要の計画（chargeClicks）に軽減札以外があると
    // 「次に打つ」の軽減をそちらが消費してしまうので、そのときは行わない
    const holdNoSpend = holdFlood && this.opponents.every((o) => this.countReaches(board, o) === 0); // 相手のリーチがあるときは防御のため通常どおり
    let planned = holdNoSpend ? [] : [...this.chooseSkills(board, magic, costs, opponentMagic, life, availableSkills, tokenUsed, necroRemain, necroCost, assaultCost, proliferateActive, seatMagic, necroPay)];
    if (chargeClicks.every((c) => isDiscountSkill(c.skill)) && !planned.some((s) => TURN_ENDING_SKILLS.includes(s))) {
        const baseLeft = magic - this.lastSpent;
        const reducers: { idx: number; key: keyof typeof costs; cut: number }[] = [
            { idx: 60, key: 'onClickCounterMarkdown', cut: 3 },
            { idx: 58, key: 'onClickClearance', cut: 7 },
            { idx: 56, key: 'onClickVitalMarkdown', cut: 4 },
            { idx: 53, key: 'onClickMarkdown', cut: 3 },
        ];
        // 弔い割引: 墓地の死体の数（上限3）だけ次のスキルを軽減する。コスト1より多く軽減できる（死体2体以上）ときだけ候補にする
        const graveCut = graveDiscountAmount(corpseCount(NECROMANCY.baseCost, necroCost));
        if (graveCut >= 2) reducers.push({ idx: 99, key: 'onClickGraveDiscount', cut: graveCut });
        // 錠前割引（idx 135）: 盤面のロックのマスの数だけ、このターンの全スキルを軽減する。コスト1より多く軽減できる（ロック2つ以上）ときだけ候補にする
        const lockCut = lockedSquareCount(board);
        if (lockCut >= 2) reducers.push({ idx: 135, key: 'onClickLockDiscount', cut: lockCut });
        let best: { r: (typeof reducers)[number]; rc: number; plan: string[]; left: number } | null = null;
        for (const r of reducers) {
            if (!availableSkills.includes(r.idx) || chargeClicks.some((c) => c.skill === r.key)) continue;
            const rc = this.calculateAICost(costs[r.key], false, false, r.key);
            if (magic < rc) continue;
            this.hypoCut = r.cut;
            const plan = [...this.chooseSkills(board, magic - rc, costs, opponentMagic, life, availableSkills.filter((i) => i !== r.idx), tokenUsed, necroRemain, necroCost, assaultCost, proliferateActive, seatMagic, necroPay)];
            const left = magic - rc - this.lastSpent;
            this.hypoCut = 0;
            if (plan.length > planned.length || (plan.length === planned.length && plan.length > 0 && left > baseLeft)) {
                if (!best || plan.length > best.plan.length || (plan.length === best.plan.length && left > best.left)) best = { r, rc, plan, left };
            }
        }
        if (best) {
            chargeClicks.push({ skill: best.r.key });
            magic -= best.rc;
            planned = best.plan;
            chargeResult = chargeClicks;
        }
    }
    this.hypoCut = 0;
    const skills = planned;

    // 大岩(136): 相手に即勝ちの手（リーチの要の空きマス）があるとき、そのマスに大岩を置いて塞ぐ。大岩は2ターンのロック付きでライフ5・減衰しないので、
    // ライフ1〜2で減衰してすぐ消える自コマの壁より持つ。コスト1で1手番に複数置ける。ネクロマンサーだけ（#399）
    if (this.character === 'necromancer' && availableSkills.includes(OBJECT_DEFS.boulder.idx) && !skills.some(sk => TURN_ENDING_SKILLS.includes(sk))) {
        const threats = Array.from(new Set(this.opponents.flatMap((o) => this.findThreatSquares(board, o)))).filter((c) => objectLandable(board[c]));
        const bcost = this.calculateAICost(costs.onClickBoulder, false, false, 'onClickBoulder');
        let left = magic - this.lastSpent;
        const clicks: { skill: string; target: number }[] = [];
        const post = board.map((sq) => ({ ...sq, effects: [...sq.effects] }));
        for (const c of threats) {
            if (left - bcost < 0) break;
            post[c] = { player: undefined, bind: 0, effects: [{ effect: '🔑' as const }] }; // AIには『ロック中の空きマス』として見せる（makeMove の他のオブジェクトと同じ）
            clicks.push({ skill: 'onClickBoulder', target: c });
            left -= bcost;
        }
        if (clicks.length > 0) {
            const followup = this.getBestMove(post, life);
            if (followup !== null) return { move: followup, skills, chargeClicks: [...(chargeResult ?? []), ...clicks] };
        }
    }

    // オブジェクト(#399): ネクロマンサーだけ。相手のリーチが無く魔力に余裕がある手番に、聖域・砦・生命の泉・大木・市場などを自陣の近くに1つずつ設置する。
    // 設置は着手を消費しない（スキル→空きマスのクリック→通常の着手）ので、着手は設置後の盤面で選び直す
    if (this.character === 'necromancer' && !skills.some(s => TURN_ENDING_SKILLS.includes(s)) && this.opponents.every((o) => this.countReaches(board, o) === 0)) {
        const pick = planObject.call(this, board, magic - this.lastSpent, costs, availableSkills, availableSkills.includes(92) || (necroRemain === 0 && NECROMANCY.baseCost - necroCost >= 2));
        if (pick) {
            const post = board.map((sq) => ({ ...sq, effects: [...sq.effects] }));
            post[pick.cell] = { player: this.playerSymbol, bind: OBJECT_DEFS[pick.kind].life, effects: post[pick.cell].effects.filter((e) => e.effect === '🔥'), object: pick.kind };
            const followup = this.getBestMove(post, life);
            if (followup !== null) return { move: followup, skills, chargeClicks: [...(chargeResult ?? []), { skill: OBJECT_DEFS[pick.kind].costKey, target: pick.cell }] };
        }
    }

    // ターン終了スキルの場合は手を打たない
    if (skills.some(s => TURN_ENDING_SKILLS.includes(s))) {
        return { move: null, skills, chargeClicks: chargeResult };
    }

    // 蘇生はこのターンから有効化し、敵マスを攻撃対象に含める
    if (skills.includes('onClickNecromancy')) {
        this.necroActive = true;
    }

    const move = this.getBestMove(board, life);
    // 打てるマスが無い（無敵の⚡マスだらけ・全部ロックなど）ときはチャージでパスする。放置すると手番が進まず止まる
    if (move === null) {
        return { move: null, skills: [...skills, 'onClickCharge'], chargeClicks: chargeResult };
    }
    return { move, skills, chargeClicks: chargeResult };
}

export const planMoveMethods = {

    /** メインエントリポイント: スキル選択 + 最善手を返す */
    /**
     * 1手番の計画。魔力が大きく余っているのに使う額が少ない計画なら、手札を引き直す（引き直し回数を超えて RICH_EXTRA_REROLLS 回まで。
     * シャッフルは1コスト）。巨人のストンプのように手札の外で撃つ札があるキャラも、計画を立てたうえで額を見る
     */
    makeMove(this: AIPlayer, ...argsIn: PlanMoveArgs): AIResult {
        return this.guardPass(this.limitToOneSkill(this.makeMoveCore(...argsIn), argsIn), argsIn);
    },

    /**
     * 相手の一言居士（スキルは1ターンに1つ）が働いているとき、計画のスキルを最初の1つ（チャージ・シャッフル・ロックは数えない）に絞る。
     * 2つ目以降は実行時に無視されるので、スキルが効いた前提で決めた着手が崩れ、相手のリーチを塞がずに手番が終わっていた（#623）。着手は今の盤面で決め直す
     */
    limitToOneSkill(this: AIPlayer, result: AIResult, argsIn: PlanMoveArgs): AIResult {
        if (!enemyObjectActive(argsIn[0], this.playerSymbol, 'oneWord')) return result;
        const basic = (sk: string): boolean => sk === 'onClickCharge' || sk === 'onClickShuffle' || sk === 'onClickUseLock';
        const planned = [...result.skills.filter((sk) => !basic(sk)), ...(result.chargeClicks ?? []).map((c) => c.skill).filter((sk) => !basic(sk))];
        if (planned.length <= 1 || result.reroll || result.hailMary) return result;
        const keep = planned[0];
        const keptClick = (result.chargeClicks ?? []).filter((c) => c.skill === keep || basic(c.skill));
        const skills = result.skills.filter((sk) => basic(sk) || sk === keep);
        const move = this.getBestMove(argsIn[0], argsIn[4]);
        return { ...result, move, skills: move === null && skills.length === 0 ? ['onClickCharge'] : skills, chargeClicks: keptClick, win: false };
    },

    /**
     * 計画が『チャージで手番を終えるだけ』なのに、相手に1手で勝たれる（空きマスだけでなく敵コマの奪取で完成する勝ちも）なら、塞ぐ手に差し替える。
     * 陰陽師のコンボ待ちの温存・巨人戦の最初のチャージなど、パスする分岐は countReaches（空きマスで完成するリーチ）しか見ず、奪取で完成する相手の勝ちを見落としていた
     */
    guardPass(this: AIPlayer, result: AIResult, argsIn: PlanMoveArgs): AIResult {
        if (result.reroll || result.hailMary || result.win || result.chargeClicks?.length || this.lastStandReady) return result; // 土壇場の防壁が未発動なら、守りは意図的に捨てる
        const [board, , , , life] = argsIn;
        const oppWinsOn = (b: SquareInfo[]): boolean => this.opponents.some((opp) => this.getMovesFor(b, opp, life).some((i) => calculateWinner(lineSymbols(this.simulatePlace(b, i, opp, life, 0))) === opp));
        const passOnly = result.skills.length === 1 && result.skills[0] === 'onClickCharge';
        // ロックだけの計画（鍵師・ネクロ）も同じ。ロックしたマスと着手のあとでも相手に1手で勝たれるなら、止められる通常の着手に差し替える
        const lockOnly = result.skills.length > 0 && result.skills.every((sk) => sk === 'onClickUseLock');
        if (!passOnly && !lockOnly) return result;
        if (!oppWinsOn(board)) return result;
        if (lockOnly) {
            let post = board.map((sq) => ({ ...sq, effects: [...sq.effects] }));
            for (const c of result.lockTargets ?? []) post[c] = addLock(post[c], 3); // 着手の減衰（−1）で消えない長さ。実際のロックも相手の次の手番まで残る
            if (result.move !== null && result.move !== undefined) post = this.simulatePlace(post, result.move, this.playerSymbol, life, 0);
            if (!oppWinsOn(post)) return result; // この計画で止まっている
        }
        const block = this.getBestMove(board, life);
        if (block === null) return result;
        if (lockOnly && oppWinsOn(this.simulatePlace(board, block, this.playerSymbol, life, 0))) return result; // 通常の着手でも止まらないなら、元の計画のまま
        return { move: block, skills: [] };
    },

    makeMoveCore(this: AIPlayer, ...argsIn: PlanMoveArgs): AIResult {
        // 1手で勝てるなら、スキルを撃たずにその手を打つ。スキルの発動条件は『空きマスで完成する自分のリーチ』しか見ないものが多く、
        // 敵コマの奪取で完成する勝ちがあるのにロック・封鎖の断・審判の日・引き直しなどを先に選んでいた（鍵師が魔力136を抱えたまま封鎖の断を撃ち続けた・#600）
        // 相手の土壇場の防壁が使えるときは、1回目の勝ちが防壁に吸われるので、ギアを壊すスキルなど普通の計画に任せる
        const winNow = this.oppLastStand ? null : this.immediateWinMove(argsIn[0], argsIn[4]);
        if (winNow !== null) return { move: winNow, skills: [] };
        // 龍神の巫女（#527）: 建造物を置いて覚醒／咆哮。該当しなければ通常の計画に進む
        if (this.character === 'dragonMiko') {
            const dragonPlan = this.planDragon(argsIn);
            if (dragonPlan) return dragonPlan;
        }
        // オブジェクト（大木など）は列に数えず、置けないマス。AI には『🔑ロック中の空きマス』として見せる（列を数える処理が自陣・敵のコマと誤認しない）
        this.ownSwamps = argsIn[0].filter((sq) => sq.object === 'poisonSwamp' && sq.player === this.playerSymbol && !isDormant(sq)).length;
        this.ownClouds = argsIn[0].filter((sq) => sq.object === 'thundercloud' && sq.player === this.playerSymbol && !isDormant(sq)).length;
        this.ownObjectCount = argsIn[0].filter((sq) => isBuilding(sq) && sq.player === this.playerSymbol && !isDormant(sq)).length;
        this.ownTongues = argsIn[0].filter((sq) => sq.object === 'tongueKing' && sq.player === this.playerSymbol && !isDormant(sq)).length;
        this.ownTrees = argsIn[0].filter((sq) => sq.object === 'bigTree' && sq.player === this.playerSymbol && !isDormant(sq)).length;
        this.corpseCut = this.character === 'necromancer' ? Math.min(NECRO_CORPSE_CUT_CAP, Math.max(0, NECROMANCY.baseCost - (argsIn[8] ?? NECROMANCY.baseCost))) : 0;
        const args: PlanMoveArgs = argsIn[0].some((sq) => isBuilding(sq))
            ? [argsIn[0].map((sq) => (isBuilding(sq) ? { player: undefined, bind: 0, effects: [{ effect: '🔑' as const }] } : sq)), ...argsIn.slice(1)] as PlanMoveArgs
            : argsIn;
        let result = this.planMove(...args);
        const magic = args[1];
        let saving = false;
        // 鍵師: 守りが要らない間は魔力を貯めて、封鎖の断のコストに届かせる（魔力が足りれば封鎖の断は最初のロック系として無料）。ロック以外のスキルは見送って着手だけ行う
        if (KEYSMITH_SEAL_SAVE > 0 && this.character === 'keysmith' && !result.reroll && !result.hailMary && !result.win && !result.skills.includes('onClickSeal')
            && this.countReaches(args[0], this.playerSymbol) === 0 && this.opponents.every((o) => this.countReaches(args[0], o) === 0)) {
            const released = sealReleaseCells(args[0], this.playerSymbol).length;
            const sealCost = this.calculateAICost(sealBaseCost(args[2].onClickSeal, released), false, false, 'onClickSeal');
            if (magic < sealCost) {
                const isLock = (sk: string) => sk === 'onClickUseLock';
                const kept = { ...result, skills: result.skills.filter(isLock), chargeClicks: result.chargeClicks?.filter((c) => isLock(c.skill)) };
                if (kept.skills.length === 0 && (kept.chargeClicks?.length ?? 0) === 0 && !kept.lockTargets) {
                    const move = result.move ?? this.getBestMove(args[0], args[4]);
                    result = { move, skills: [] };
                } else result = kept;
                saving = true; // 貯める間は、残りの魔力で手札のスキルを足す処理（extendPlan）も止める
            }
        }
        // 鍵師: ロックなど固有スキルの計画は、手札の他の札を見ずに返る。ロックを撃ったあとに魔力が残るなら、手札のトークン・バッズなどを足す。
        // 以前は魔力24以上（RICH_REROLL_MAGIC）でしか足されず、鍵師（手番開始の魔力は平均7.5）では働いていなかった。ダブルトークンは払える手番が104あって12回しか撃たれず
        // （払えたのに先に撃ったのはロック69・封鎖の断11）、敵が1手番に平均1.2〜1.6個の駒を増やすのに鍵師は0.8〜0.9個だった。
        // 対強豪平均: seed9/200 21.4→26.3, seed7/100 21.3→28.8（+4.9/+7.5pt）。魔力のしきい値を1〜7で振ってもどれも26〜29%で、8以上では効果が消える
        if (this.character === 'keysmith' && !result.reroll && !result.hailMary && !result.win && !result.skills.some((sk) => TURN_ENDING_SKILLS.includes(sk))) {
            // 無料の1回（手番の最初のロック系）は、安いロックではなく封鎖の断（通常9〜10）に使いたい。魔力が足りて封鎖の断を撃つ判断なら、そちらを返す。
            // かつては先に安いロックの計画が返り、封鎖の断は落ちていた（魔力9以上の手番の約8割で、安いロックだけ撃って魔力が余った）。対強豪平均 38→53〜54%（docs/tune/keysmith.md 試行17）
            if (this.sealWanted(args)) return { move: null, skills: ['onClickSeal'] };
            return saving ? result : this.extendPlan(result, args);
        }
        if (result.reroll || result.hailMary || result.win || magic < (this.character === 'magician' ? MAGICIAN_REROLL_MAGIC : RICH_REROLL_MAGIC) || this.rerollsLeft <= -RICH_EXTRA_REROLLS) return result;
        if (this.character === 'yinYangMaster') return result; // コンボ待ちの温存があるため別ロジック
        if (result.skills.some((sk) => TURN_ENDING_SKILLS.includes(sk) || sk === 'onClickJudgeDay')) return result;
        const goal = Math.max(RICH_SPEND_GOAL, Math.min(RICH_SPEND_GOAL_MAX, Math.floor(magic / 4)));
        if (this.plannedSpend(result, args[2]) >= goal) return result;
        // 固有スキルの計画（氷結・ロックなど）は手札の他の札を見ずに返ることがある。残りの魔力で、手札のトークンなどを足せるなら足す
        const extended = this.extendPlan(result, args);
        if (this.plannedSpend(extended, args[2]) >= goal) return extended;
        const winMove = this.immediateWinMove(args[0], args[4]);
        if (winMove !== null) return { move: winMove, skills: [] }; // 勝てるなら、手札の引き直しより勝ちの着手
        return { move: null, skills: [], reroll: {} };
    },

    /** 鍵師: 封鎖の断を撃つ判断か（スキル選択の結果に封鎖の断が含まれる）。魔力が足りないときは false */
    sealWanted(this: AIPlayer, args: PlanMoveArgs): boolean {
        const [board, magic, costs, opponentMagic, life, availableSkills, tokenUsed, necroRemain = 0, necroCost = 0, , assaultCost = 99, proliferateActive = false, seatMagic = [], necroPay = necroCost] = args;
        if (this.countReaches(board, this.playerSymbol) !== 0 || this.immediateWinMove(board, life) !== null) return false; // 奪取で完成する勝ちも『自分のリーチ』として着手を優先する
        const released = sealReleaseCells(board, this.playerSymbol).length;
        const sealCost = this.calculateAICost(sealBaseCost(costs.onClickSeal, released), false, false, 'onClickSeal');
        if (magic < sealCost) return false;
        return this.chooseSkills(board, magic, costs, opponentMagic, life, availableSkills, tokenUsed, necroRemain, necroCost, assaultCost, proliferateActive, seatMagic, necroPay).includes('onClickSeal');
    },

    /** 計画 result に、残りの魔力で撃てる手札のスキル（対象の要らないもの。トークンは未使用のときだけ）を足す */
    extendPlan(this: AIPlayer, result: AIResult, args: PlanMoveArgs): AIResult {
        const [board, magic, costs, opponentMagic, life, availableSkills, tokenUsed, necroRemain = 0, necroCost = 0, , assaultCost = 99, proliferateActive = false, seatMagic = [], necroPay = necroCost] = args;
        const planned = [...result.skills, ...(result.chargeClicks ?? []).map((c) => c.skill)];
        const left = magic - this.plannedSpend(result, costs);
        const usedToken = tokenUsed || planned.some((sk) => TOKEN_SKILL_KEYS.has(sk));
        const extra = this.chooseSkills(board, left, costs, opponentMagic, life, availableSkills, usedToken, necroRemain, necroCost, assaultCost, proliferateActive, seatMagic, necroPay)
            .filter((sk) => !planned.includes(sk) && !TURN_ENDING_SKILLS.includes(sk));
        if (extra.length === 0) return result;
        return { ...result, skills: [...result.skills, ...extra] };
    },

    /** 計画で払う魔力のおおよその額（スキル名からコスト表を引く。割引・特殊な軽減は見ない） */
    plannedSpend(this: AIPlayer, result: AIResult, costs: Record<keyof SkillCosts, number>): number {
        const names = [...result.skills, ...(result.chargeClicks ?? []).map((c) => c.skill)];
        let total = 0;
        for (const name of names) {
            const base = (costs as Record<string, number>)[name];
            if (typeof base === 'number') total += this.calculateAICost(base, false, false, name);
        }
        if (result.lockTargets) total += result.lockTargets.length * this.calculateAICost(costs.onClickUseLock, false, false, 'onClickUseLock');
        return total;
    },

    planMove,
};
export type PlanMoveMethods = typeof planMoveMethods;


/** 設置するオブジェクトと設置マス。聖域・砦は自陣のコマが2つ以上周囲にあるマス、それ以外は盤の隅に近いマス。置けなければ null */
const BOULDER_MAX = 4;

function planObject(this: AIPlayer, board: SquareInfo[], left: number, costs: SkillCosts, availableSkills: number[], heavyReady: boolean): { kind: keyof typeof OBJECT_DEFS; cell: number } | null {
    const geo = geometryForCells(board.length);
    const size = Math.round(Math.sqrt(board.length));
    const mine = board.filter((sq) => sq.player === this.playerSymbol && !isBuilding(sq)).length;
    if (mine < 2) return null;
    const order = this.hasGroundRent
        ? (['boulder', 'market', 'sanctuary', 'fort', 'spring', 'bigTree', 'workshop', 'luckyCat', 'oneWord', 'soloSign'] as const)
        : (['market', 'sanctuary', 'fort', 'spring', 'bigTree', 'workshop', 'luckyCat', 'oneWord', 'soloSign'] as const);
    for (const kind of order) {
        const idx = OBJECT_DEFS[kind].idx;
        if (!availableSkills.includes(idx)) continue;
        // 大岩は地代のためにBOULDER_MAXまで重ねて置く。それ以外は1種類1つ
        const owned = board.filter((sq) => sq.player === this.playerSymbol && sq.object === kind).length;
        if (kind === 'boulder' ? owned >= BOULDER_MAX : owned > 0) continue;
        // 大工房はベースコスト7以上の札(降霊・一寸の虫)を撃てる見込みがあるときだけ。一言居士はスキルを連打する相手がいるときだけ
        if (kind === 'workshop' && !heavyReady) continue;
        if (kind === 'oneWord' && !this.opponents.some((o) => ['cryomancer', 'poisoner', 'witch', 'tactician', 'magician', 'pyromancer'].includes(this.characterOf(o) ?? ''))) continue;
        const cost = this.calculateAICost(costs[OBJECT_DEFS[kind].costKey], false, false, OBJECT_DEFS[kind].costKey);
        if (left - cost < 1) continue;
        // 市場は普請道楽(オブジェクトが無いとき設置が-2)で1コストになるときだけ。全スキルが安くなる『最初のオブジェクト』として置く
        if (kind === 'market' && cost > 1) continue;
        let best = -1;
        let bestScore = -1;
        for (let i = 0; i < board.length; i++) {
            if (!objectLandable(board[i])) continue;
            const near = geo.surroundRange(i).filter((j) => board[j].player === this.playerSymbol && !isBuilding(board[j])).length;
            const r = Math.floor(i / size);
            const c = i % size;
            const edge = Math.abs(r - (size - 1) / 2) + Math.abs(c - (size - 1) / 2);
            const score = kind === 'sanctuary' || kind === 'fort' ? (near >= 2 ? near : -1) : edge;
            if (score > bestScore) { bestScore = score; best = i; }
        }
        if (best >= 0) return { kind, cell: best };
    }
    return null;
}
