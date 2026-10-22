import { CharacterId } from '../../types/Character';
import { Player, seatOf } from '../../types/Player';
import { SquareInfo } from '../../types/SquareInfo';
import { isDiscountSkill } from './discount';
import { calculateWinner, findEmptyIndexes, isShikigami, lineSymbols } from '../../util';
import { SkillCosts, MIASMA_MIN_COST } from './skillCosts';
import { geometryForCells } from './boardGeometry';
import { ailmentStacks, cleanse, frostfallTargets, canFreeze, budStacks, budReceivers, canBud, harvestBuds, graft, GRAFT_MAX, sow, sowCandidates, infernoTargets, INFERNO_STACKS, freezeAll, reducedGlacierCost, infernoCostOf, FLAME_SKILL_KEYS, burnoutTargets, burnoutCostOf, totalFlames, burnout, INFERNO_FREE_SKILLS, ignite, isFrozen, emptyBlocked, applyDamage, absorbDestroy, freeze, isDormant, activeBuds, lockable, leafSurcharge, bonfireTargets, bonfire, mulchCandidates, mulch, autumn, leafFrostTargets, fireWheelTargets } from './thermal';
import { chargeStacks, orthoNeighbors, connectedPieces, withCharge, reducedChargeCost, applyJammer, isGuarded } from './charge';

// 汎用スキルプールの大きさ (idx 0..73)。Game.tsx の SKILL_POOL_SIZE / sim/engine.js の POOL_SIZE と同値
export const SKILL_POOL_SIZE = 76;

// 帯電付与の採用しきい値 (sim/ai.js の CHARGE_ONE_MIN_SCORE)
const CHARGE_ONE_MIN_SCORE = 2;
// 範囲帯電の採用しきい値 (sim/ai.js の CHARGE_AREA_MIN_SCORE)
const CHARGE_AREA_MIN_SCORE = 2;
// ジャマーを与ダメージ合計だけで撃つ下限 (sim/ai.js の JAM_MIN_DMG)
const JAMMER_MIN_DMG = 2;
// ランダム帯電を撃つときに残しておく魔力の余裕 (sim/ai.js の CHG_RAND_MARGIN)
const CHARGE_RANDOM_MARGIN = 1;
/** この魔力以上あって撃てるスキルが手札に無いとき、魔法使い以外も1コストで手札を引き直す（防壁発動後の魔力の使い道） */
const SURPLUS_MAGIC = 12;

// 陰陽師の式神運用の設定 (sim/ai.js の AI_DEFAULTS shMax / shBlastMin / shReserve / shComboReal と同値)
const SHIKIGAMI_LIFE = 2;
const SHIKIGAMI_BLAST_DAMAGE = 4;
const SH_MAX = 3; // 同時に持つ式神の数
const SH_BLAST_MIN = 3; // 爆破に値する最低ライン価値
const SH_RESERVE = 9; // 式神を置いたあとに残しておく魔力（爆破の準備）
const NO_DIG_53_MIN = 8; // 71/73 が揃い 53 だけ無いとき、この魔力以上なら53を探さずチャージで13を目指す
const SH_COMBO_REAL = 1; // 式神一括コンボの列に最低限必要な通常コマ数

export const TURN_ENDING_SKILLS = ['onClickCharge', 'onClickOpium', 'onClickTsunami'];

export type AIResult = {
    move: number | null;
    skills: string[];
    lockTargets?: number[];
    stompTarget?: number; // 着手前にクリックする対象マス (ストンプ/インジェクション)
    /** 「スキル→対象マスのクリック」を順に行うスキル。雷霆の巫の帯電系（帯電拡散→帯電付与の順）と、氷室の番人の絶対零度(target なし)・煉獄の鍛冶師の業火 */
    chargeClicks?: { skill: string; target?: number }[];
    /** 詰み: ヘイルメアリーを撃つ。当選スキルは Game 側で引くので、対象は planHailMary で後から決める */
    hailMary?: boolean;
    /** 魔法使い: 撃てるスキルが無いので、軽減札(discount)を撃ってから1コストで手札を引き直す。Game 側が [軽減札, シャッフル, 再計画] を順に行う */
    reroll?: { discount?: string };
};

// 魔法使いの引き直しに使う軽減札（撃つ優先順。sim/ai.js の DISCOUNT_REDUCERS と同順）。cut は次に打つスキルの軽減量
const REROLL_REDUCERS: { idx: number; key: 'onClickCounterMarkdown' | 'onClickClearance' | 'onClickVitalMarkdown' | 'onClickMarkdown'; cut: number }[] = [
    { idx: 60, key: 'onClickCounterMarkdown', cut: 3 },
    { idx: 58, key: 'onClickClearance', cut: 7 },
    { idx: 56, key: 'onClickVitalMarkdown', cut: 4 },
    { idx: 53, key: 'onClickMarkdown', cut: 3 },
];
/** 魔法使いが1手番にロックするバッズ駒の最大数。sim/ai.js の AI_DEFAULTS.magLockN と同じ */
export const MAGICIAN_MAX_LOCKS = 3;
/** 空蔵を装備した席が同時にかけておく空きマスロックの上限 / ロックする空きマスの価値の下限 / 敵の列を止める価値の重み (sim/ai.js の EL_MAX / EL_MIN_VALUE / EL_DENY) */
export const EMPTY_LOCK_MAX = 2;
const EMPTY_LOCK_MIN_VALUE = 10;
/** 火遁で魔法使いの🌱を優先して燃やす重み（sim/ai.js の igniteBud） */
const IGNITE_BUD_WEIGHT = 6;
const EMPTY_LOCK_DENY = 2;
/** 引き直しの最大回数（手番ごと）。sim/ai.js の discountPlan>=2 と同じ */
export const MAX_REROLLS = 2;
/** 1手番に引き直せる回数の上限。陰陽師はコンボ札(71/73/53)を探すので多め（sim/ai.js の shuffleDig=8） */
/** 陰陽師の百鬼夜行→式神一括への対策の重み (sim/ai.js antiFlood / antiFloodLines)。敵コマの入っていない列を全部塞げる着手の加点と、減らせた列1本あたりの加点 */
const FLOOD_BLOCK_BONUS = 300;
const FLOOD_LINE_WEIGHT = 100;
export const rerollBudget = (character: CharacterId): number => (character === 'yinYangMaster' ? 8 : MAX_REROLLS);

// 固有スキルを撃てる魔力の目安(次の手番の魔力がこれ以上なら撃ってくるとみなす)。sim/ai.js の EXCLUSIVE_MIN_MAGIC と同値
const EXCLUSIVE_MIN_MAGIC: Partial<Record<CharacterId, number>> = {
    giant: 6, tactician: 7, magician: 6, yinYangMaster: 5, necromancer: 5, poisoner: 4, electrician: 7, cryomancer: 7, pyromancer: 9,
};

// 毒使い×毒花・ミアズマの調整値 (sim/ai.js の BLOOM_* / MIASMA_MIN_SCORE と同値)
const BLOOM_MAX_OWN_POISON = 3; // 自陣の毒スタックの上限
const BLOOM_MIN_BIND = 4; // 毒を盛る自コマのライフの下限（毒の数を足した値）
const MIASMA_MIN_SCORE = 2; // 敵2マス、または敵1マス+リーチ列(=3)

class AIPlayer {
    playerSymbol: Player;
    character: CharacterId;
    /** 自分以外の全プレイヤー(2人戦なら1人)。先頭を探索木の「相手役」に使う */
    opponents: Player[];
    necroActive: boolean = false;
    /** 席ごとのキャラ（添字 = 席番号）。無敵マスの判定に使う。省略時は自分のキャラだけ分かる */
    characters: readonly CharacterId[];
    /** 無敵(⚡付き雷霆の巫自陣)マス。手番開始時に更新し、候補列挙・範囲スキルの中心から除外する */
    shield: Set<number> = new Set();
    /** 絶対零度が発動待ち（Game が手番ごとに設定する）。待ち中は撃たない */
    glacierPending: boolean = false;
    /** 土壇場の防壁を装備していて未発動（Game が手番ごとに設定する）。真なら相手の1回目の勝ちは防壁が受けるので止めに行かず攻める。sim/ai.js の AI_DEFAULTS.lsAggro と同じ */
    lastStandReady: boolean = false;
    /** 絶対零度のコスト軽減（氷結が作られた回数。撃つとリセット）。Game が手番ごとに設定する */
    glacierCharge: number = 0;
    /** 業火の無料権（手番を跨いで持ち越し）と、この手番に使ったスキルの種類。Game が毎回セットする */
    infernoReady: boolean = false;
    /** chooseSkills が直前に計画したスキルの合計コスト */
    lastSpent: number = 0;
    /** 軽減札を撃った場合を仮定した「次に打つスキル」の軽減量（計画の比較中だけ使う） */
    hypoCut: number = 0;
    skillKinds: Set<string> = new Set();
    /** 魔法使いの引き直し: この手番で残っている引き直し回数（Game が手番開始時に MAX_REROLLS にし、シャッフルのたび減らす） */
    rerollsLeft: number = 0;
    /** 軽減札が手番内で有効（引き直しの途中）。Game が毎回セットする */
    discountActive: boolean = false;
    /** 冬至の種子の🌱ガード中（Game が手番ごとに設定する）。ガード中は撃たない */
    budGuard: boolean = false;

    /** 陰陽師の現在のモード(Game が手番ごとに設定する)。陽は全スキルのコスト+1 */
    yinYangMode: 'ying' | 'yang' = 'ying';

    /** ギアのコスト補正（キャラ補正済みのコストを受け取り、補正後を返す）。ギアが無ければ未指定 */
    gearCostFn?: (cost: number, isToken: boolean, skillKey?: string) => number;
    /** 毒花を装備しているか。毒使いなら、自陣のコマに積極的に毒を盛る（sim/ai.js の毒使い×毒花と同じ） */
    hasToxicBloom: boolean = false;
    hasEmptyLock: boolean = false;

    constructor(
        playerSymbol: Player,
        character: CharacterId,
        opponents: Player[] = [playerSymbol === '💙' ? '⭕' : '💙'],
        characters: readonly CharacterId[] = [],
        gearCostFn?: (cost: number, isToken: boolean, skillKey?: string) => number,
        hasToxicBloom: boolean = false,
        hasEmptyLock: boolean = false
    ) {
        this.playerSymbol = playerSymbol;
        this.character = character;
        this.opponents = opponents;
        this.characters = characters;
        this.gearCostFn = gearCostFn;
        this.hasToxicBloom = hasToxicBloom;
        this.hasEmptyLock = hasEmptyLock;
    }

    private characterOf(player: Player): CharacterId | undefined {
        return player === this.playerSymbol ? this.character : this.characters[seatOf(player)];
    }

    /** 空蔵: 自分がかけた空きマスロック（まだ自陣のコマになっていないもの）の数 (sim/ai.js myEmptyLocks) */
    private myEmptyLocks(board: SquareInfo[]): number {
        const owner = seatOf(this.playerSymbol) + 1;
        return board.filter((sq) => !sq.player && sq.effects.some((e) => e.effect === '🔑' && e.value === owner)).length;
    }

    /** 空蔵: ロックしておく空きマス。自分の列の要になるマス、または敵の列を止められるマスのうち価値が最大のもの。なければ null
     * (sim/ai.js bestEmptyLockTarget と同一。EL_MIN_VALUE=10, EL_DENY=2) */
    private bestEmptyLockTarget(board: SquareInfo[]): number | null {
        const lineScores = [0, 1, 10, 50, 1000];
        const geo = geometryForCells(board.length);
        let bestIdx: number | null = null;
        let bestVal = EMPTY_LOCK_MIN_VALUE - 1e-9;
        for (let i = 0; i < board.length; i++) {
            const sq = board[i];
            if (sq.player || sq.effects.some((e) => e.effect === '🔑') || this.shield.has(i)) continue;
            let val = 0;
            for (const line of geo.winLines) {
                if (!line.includes(i)) continue;
                let mine = 0;
                let foreign = 0;
                const oc = new Map<Player, number>();
                for (const idx of line) {
                    const p = board[idx].player;
                    if (p === this.playerSymbol) mine++;
                    else if (p) {
                        foreign++;
                        oc.set(p, (oc.get(p) || 0) + 1);
                    }
                }
                if (foreign === 0) val += lineScores[Math.min(mine + 1, 4)] - lineScores[Math.min(mine, 4)];
                else if (mine === 0 && oc.size === 1) {
                    const c = Array.from(oc.values())[0];
                    val += EMPTY_LOCK_DENY * (lineScores[Math.min(c + 1, 4)] - lineScores[Math.min(c, 4)]);
                }
            }
            if (val > bestVal) {
                bestVal = val;
                bestIdx = i;
            }
        }
        return bestIdx;
    }

    /** 火遁(鍛冶師の固有)の対象: ライフが残り🔥・❄の無い敵コマのうち、敵の列を作りかけているもの(列の敵コマが2つ以上・自コマなし)とライフが高いものを優先。
     * なければ null (sim/ai.js bestIgniteTarget の mode 1 と同一) */
    private bestIgniteTarget(board: SquareInfo[]): number | null {
        const geo = geometryForCells(board.length);
        let best: number | null = null;
        let bestVal = 0;
        for (let i = 0; i < board.length; i++) {
            const sq = board[i];
            if (!sq.player || sq.player === this.playerSymbol || sq.bind <= 0) continue;
            if (this.shield.has(i) || isFrozen(sq) || sq.effects.some((e) => e.effect === '🔥')) continue;
            let build = 0;
            for (const line of geo.winLines) {
                if (!line.includes(i)) continue;
                const foes = line.filter((j) => this.isEnemy(board[j].player)).length;
                const mine = line.filter((j) => board[j].player === this.playerSymbol).length;
                if (mine === 0 && foes >= 2) build += foes;
            }
            let val = sq.bind + build * 2;
            // 魔法使いの🌱は🔥で燃えて消える（🌱1つで魔力+3の稼ぎ頭）。優先して燃やす（sim/ai.js の igniteBud=6）
            if (this.characterOf(sq.player) === 'magician') val += IGNITE_BUD_WEIGHT * sq.effects.filter((e) => e.effect === '🌱').length * 3;
            if (val > bestVal) {
                bestVal = val;
                best = i;
            }
        }
        return best;
    }

    /** 無敵マス(雷霆の巫の⚡付き自陣)の集合を更新する (sim/ai.js updateShield) */
    updateShield(board: SquareInfo[]): void {
        this.shield = new Set();
        board.forEach((sq, i) => {
            if (sq.player && this.characterOf(sq.player) === 'electrician' && chargeStacks(sq) > 0 && !isDormant(sq)) this.shield.add(i); // 氷結中は⚡が休眠で無敵でない
        });
    }

    private sizeOf(board: SquareInfo[]): number {
        return Math.round(Math.sqrt(board.length));
    }

    /** 着手マス i が発火させる⚡の損得。敵コマ(ライフ>0)を削れば加点、自コマを削れば減点。ライフ1は0になるので重く見る */
    fireGain(board: SquareInfo[], i: number): number {
        const size = this.sizeOf(board);
        let gain = 0;
        for (const k of orthoNeighbors(i, size)) {
            if (chargeStacks(board[k]) === 0 || isDormant(board[k])) continue; // 休眠マス（氷結中）の⚡は発火しない
            for (const n of orthoNeighbors(k, size)) {
                const sq = board[n];
                if (!sq.player || sq.bind <= 0) continue;
                if (sq.effects.some((e) => e.effect === '🔑') || isFrozen(sq)) continue; // 氷結は隣接⚡を受けない
                if (sq.player === board[k].player && this.characterOf(sq.player) === 'electrician') continue; // 自陣由来の発火は雷霆の巫に効かない
                const w = 3 + (sq.bind === 1 ? 4 : 0);
                gain += this.isEnemy(sq.player) ? w : -w;
            }
        }
        return gain;
    }

    /** 自コマ i が入っている列のうち、他の席のコマが無く自コマが最も多い列の自コマ数 (i を含む) */
    bestOwnLineCount(board: SquareInfo[], i: number): number {
        let best = 0;
        for (const line of geometryForCells(board.length).winLines) {
            if (!line.includes(i)) continue;
            let mine = 0, bad = false;
            for (const idx of line) {
                if (board[idx].player === this.playerSymbol) mine++;
                else if (board[idx].player) bad = true;
            }
            if (!bad && mine > best) best = mine;
        }
        return best;
    }

    /**
     * 帯電付与の対象。攻め=縦横隣接の(敵コマ数−自コマ数)、守り=ライフ0〜1の自コマが他の席のいない列で
     * 2つ以上(リーチ列なら3つ)の一部なら⚡の無敵で守る。大きいほうが MIN 以上なら撃つ。
     */
    bestChargeOneTarget(board: SquareInfo[]): number | null {
        const size = this.sizeOf(board);
        let bestIdx: number | null = null, bestScore = 0;
        for (let i = 0; i < board.length; i++) {
            if (this.shield.has(i) || board[i].effects.some((e) => e.effect === '🔑')) continue;
            if (chargeStacks(board[i]) > 0 || isDormant(board[i])) continue; // 休眠マスの⚡は働かない
            let attack = 0;
            for (const n of orthoNeighbors(i, size)) {
                const sq = board[n];
                if (!sq.player || sq.bind <= 0 || isFrozen(sq)) continue; // 氷結中のコマは隣接⚡のダメージを受けない
                if (this.isEnemy(sq.player)) attack++; else attack--;
            }
            let defend = 0;
            if (board[i].player === this.playerSymbol && board[i].bind <= 1) {
                const own = this.bestOwnLineCount(board, i);
                if (own >= 3) defend = 4; else if (own === 2) defend = 2;
            }
            const score = Math.max(attack, defend);
            if (score > bestScore) { bestScore = score; bestIdx = i; }
        }
        return bestScore >= CHARGE_ONE_MIN_SCORE ? bestIdx : null;
    }

    /** 固有スキル(帯電拡散)の起点。リーチ列を無敵で守れる、または自コマ3つ以上で敵2体以上を巻き込めるとき */
    bestChargeSpreadTarget(board: SquareInfo[]): number | null {
        const size = this.sizeOf(board);
        let bestIdx: number | null = null, bestScore = 0;
        for (let i = 0; i < board.length; i++) {
            if (!board[i].player || this.shield.has(i)) continue;
            const cells = connectedPieces(board, i, size);
            const mine = cells.filter((k) => board[k].player === this.playerSymbol).length;
            let reach = false;
            for (const k of cells) if (board[k].player === this.playerSymbol && this.bestOwnLineCount(board, k) >= 3) reach = true;
            const adj = new Set<number>();
            for (const k of cells) {
                for (const n of orthoNeighbors(k, size)) {
                    if (this.isEnemy(board[n].player) && board[n].bind > 0 && !isFrozen(board[n]) && !cells.includes(n)) adj.add(n);
                }
            }
            // 範囲内の敵コマ自身も帯電させる(隣接で巻き込める)ので、範囲内の敵(ライフ>0)も数える
            for (const k of cells) if (this.isEnemy(board[k].player) && board[k].bind > 0 && !isFrozen(board[k])) adj.add(k);
            const ok = reach || (mine >= 3 && adj.size >= 2);
            if (!ok) continue;
            const score = adj.size + mine + (reach ? 10 : 0);
            if (score > bestScore) { bestScore = score; bestIdx = i; }
        }
        return bestIdx;
    }

    /**
     * 範囲帯電(3x3)の中心。範囲内の(敵コマ数−自コマ数)（ライフ>0のコマのみ）が最大で、CHARGE_AREA_MIN_SCORE 以上なら撃つ
     * (sim/ai.js bestChargeAreaTarget と同一)
     */
    bestChargeAreaTarget(board: SquareInfo[]): number | null {
        const geo = geometryForCells(board.length);
        let bestIdx: number | null = null, bestScore = 0;
        for (let i = 0; i < board.length; i++) {
            if (this.shield.has(i)) continue;
            let score = 0;
            for (const k of geo.stompRange(i)) {
                const sq = board[k];
                if (!sq.player || sq.bind <= 0 || isFrozen(sq)) continue;
                if (this.isEnemy(sq.player)) score++; else score--;
            }
            if (score > bestScore) { bestScore = score; bestIdx = i; }
        }
        return bestScore >= CHARGE_AREA_MIN_SCORE ? bestIdx : null;
    }

    /** 自陣の毒スタック数 */
    private ownPoisonCount(board: SquareInfo[]): number {
        let n = 0;
        for (const sq of board) if (sq.player === this.playerSymbol) n += sq.effects.filter((e) => e.effect === '☠').length;
        return n;
    }

    /** ミアズマ: 自陣の毒マスの周囲1マスにいる敵マス（ロック/守りは除く）→ 付与される毒の数 (sim/engine.js miasmaPlan と同一) */
    private miasmaPlan(board: SquareInfo[]): Map<number, number> {
        const geo = geometryForCells(board.length);
        const plan = new Map<number, number>();
        board.forEach((sq, i) => {
            if (sq.player !== this.playerSymbol || !sq.effects.some((e) => e.effect === '☠')) return;
            for (const j of geo.surroundRange(i)) {
                const t = board[j];
                if (t.player && t.player !== this.playerSymbol && !isGuarded(t, this.characters)) plan.set(j, (plan.get(j) ?? 0) + 1);
            }
        });
        return plan;
    }

    /** ミアズマを撃つ価値: 毒が付く敵マスの数 + リーチ列の要のコマ×2 (sim/ai.js miasmaScore と同一) */
    private miasmaScore(board: SquareInfo[]): number {
        const plan = this.miasmaPlan(board);
        let critical = 0;
        plan.forEach((_, j) => { if (this.inOppReachLine(board, j)) critical++; });
        return plan.size + critical * 2;
    }

    /**
     * 毒花を活かす: 自陣のコマ(敵に隣接・ライフに余裕あり)にインジェクションを打つ対象 (sim/ai.js と同一)。なければ null。
     * 毒を盛るとバッズが付き、毒はミアズマで敵に送れる。自陣の毒が多すぎると自コマが消えるので上限を設ける
     */
    private findOwnBloomTarget(board: SquareInfo[]): number | null {
        if (this.ownPoisonCount(board) >= BLOOM_MAX_OWN_POISON) return null;
        const geo = geometryForCells(board.length);
        let best: number | null = null;
        let bestScore = -1;
        board.forEach((sq, i) => {
            if (sq.player !== this.playerSymbol || this.shield.has(i) || sq.effects.some((e) => e.effect === '🔑')) return;
            const own = sq.effects.filter((e) => e.effect === '☠').length;
            if (sq.bind < BLOOM_MIN_BIND + own) return;
            const n = geo.surroundRange(i).filter((j) => this.isEnemy(board[j].player) && !board[j].effects.some((e) => e.effect === '🔑')).length;
            const score = n * 10 + sq.bind - own * 5;
            if (score > bestScore) { bestScore = score; best = i; }
        });
        return best;
    }

    /** 敵駒 i が「どかさないと負ける列」(持ち主が3つ揃い・他のコマなし・残り1マスが空き) に含まれるか (sim/ai.js inOppReachLine) */
    private inOppReachLine(board: SquareInfo[], i: number): boolean {
        const owner = board[i].player;
        for (const line of geometryForCells(board.length).winLines) {
            if (!line.includes(i)) continue;
            let op = 0, other = 0, empty = 0, blocked = false;
            for (const idx of line) {
                if (board[idx].player === owner) op++;
                else if (board[idx].player) other++;
                else { empty++; if (emptyBlocked(board[idx])) blocked = true; } // 着手不能（氷結中の空き）な4つ目は脅威ではない
            }
            if (op === 3 && other === 0 && empty === 1 && !blocked) return true;
        }
        return false;
    }

    /**
     * ジャマーの対象(⚡マス)。縦横隣接の敵コマ(ライフ>0・ロックなし)を⚡のスタック数でライフ0にできる数が2以上、
     * 敵のリーチ列の要をライフ0にできる、または与ダメージ合計が JAMMER_MIN_DMG 以上なら撃つ。他人の無敵マスは選べない (sim/ai.js bestJammerTarget と同一)
     */
    bestJammerTarget(board: SquareInfo[]): number | null {
        const size = this.sizeOf(board);
        let bestIdx: number | null = null, bestScore = 0;
        for (let k = 0; k < board.length; k++) {
            const n = chargeStacks(board[k]);
            if (n === 0 || isDormant(board[k]) || (this.shield.has(k) && board[k].player !== this.playerSymbol)) continue;
            let zeroed = 0, critical = 0, dmg = 0;
            for (const j of orthoNeighbors(k, size)) {
                const sq = board[j];
                if (!this.isEnemy(sq.player) || sq.bind <= 0 || sq.effects.some((e) => e.effect === '🔑') || isFrozen(sq)) continue;
                dmg += Math.min(n, sq.bind);
                if (sq.bind <= n) { zeroed++; if (this.inOppReachLine(board, j)) critical++; }
            }
            if (zeroed >= 2 || critical >= 1 || dmg >= JAMMER_MIN_DMG) {
                const score = zeroed + critical * 2 + dmg * 0.1;
                if (score > bestScore) { bestScore = score; bestIdx = k; }
            }
        }
        return bestIdx;
    }

    /** 絶対零度を撃つ価値があるか: ライフが残る敵コマが3個以上（全マスに❄が足され、次の手番に3ダメージ。sim/ai.js と同方針） */
    shouldGlacier(board: SquareInfo[]): boolean {
        return board.filter((sq) => this.isEnemy(sq.player) && sq.bind > 0 && !sq.effects.some((e) => e.effect === '🔑')).length >= 3;
    }

    /** 業火を撃つ価値があるか: ライフが残る敵コマが3個以上（sim/ai.js と同方針） */
    shouldInferno(board: SquareInfo[]): boolean {
        return board.filter((sq) => this.isEnemy(sq.player) && sq.bind > 0 && !sq.effects.some((e) => e.effect === '🔑')).length >= 3;
    }

    /** 自分以外のコマか（盤上にあるのは参加者のコマだけなので、自分以外＝敵） */
    isEnemy(player: Player | undefined): boolean {
        return player !== undefined && player !== this.playerSymbol;
    }

    /** 探索の深さ。盤が大きいほど候補手が増えるので浅くする（4x4=3 / 5x5=2 / それ以上=1） */
    searchDepth(board: SquareInfo[]): number {
        const cells = board.length;
        if (cells <= 16) return 3;
        if (cells <= 25) return 2;
        return 1;
    }

    /** 盤面評価関数: 各勝利ラインのスコアを合算 */
    evaluateBoard(board: SquareInfo[]): number {
        let score = 0;
        const lineScores = [0, 1, 10, 50, 1000];

        for (const line of geometryForCells(board.length).winLines) {
            // 氷結中の空きマスを含むライン（着手不能な4つ目）は完成させられないので評価しない。式神を含むラインも同様
            if (line.some((idx) => emptyBlocked(board[idx]) || isShikigami(board[idx]))) continue;
            let myCount = 0, oppCount = 0, myBindSum = 0, oppBindSum = 0;
            // 敵が1人だけのラインでのみ脅威として数える（複数の敵が混在するラインは互いに潰し合う）
            const enemiesInLine = new Set<Player>();
            for (const idx of line) {
                const sq = board[idx];
                if (sq.player === this.playerSymbol) {
                    myCount++;
                    myBindSum += sq.bind;
                } else if (sq.player) {
                    oppCount++;
                    oppBindSum += sq.bind;
                    enemiesInLine.add(sq.player);
                }
            }
            if (myCount > 0 && oppCount === 0) {
                score += lineScores[myCount];
            } else if (oppCount > 0 && myCount === 0 && enemiesInLine.size === 1) {
                score -= lineScores[oppCount];
                // 相手2つ+空き2つ: トークンで即リーチ→即勝ちの脅威
                if (oppCount === 2) {
                    let emptyInLine = 0;
                    for (const idx of line) {
                        if (!board[idx].player) emptyInLine++;
                    }
                    if (emptyInLine === 2) score -= 20;
                }
            }
            // bind安定性ボーナス
            score += myBindSum * 0.5 - oppBindSum * 0.5;
        }

        // バッズ・ロックボーナス
        for (const sq of board) {
            const buds = activeBuds(sq); // 休眠マスの🌱は数えない
            const hasLock = sq.effects.some(e => e.effect === '🔑');
            if (sq.player === this.playerSymbol) {
                score += buds * 3 + (hasLock ? 5 : 0);
            } else if (sq.player) {
                score -= buds * 3 + (hasLock ? 5 : 0);
            }
        }

        return score;
    }

    /** 指定プレイヤーのリーチ数（3つ揃い+空き1）をカウント */
    countReaches(board: SquareInfo[], player: Player): number {
        let reaches = 0;
        for (const line of geometryForCells(board.length).winLines) {
            if (line.some((idx) => isShikigami(board[idx]))) continue; // 式神は列に数えない
            let my = 0, op = 0, blocked = false;
            for (const idx of line) {
                const sq = board[idx];
                if (sq.player === player) my++;
                else if (sq.player) op++;
                // 残り1マスが着手不能（氷結中の空きマス・ロック中の空きマス）ならリーチではない（findThreatSquares と同じ判定）
                else if (emptyBlocked(sq) || (sq.effects.some((e) => e.effect === '🔑') && sq.bind > 0)) blocked = true;
            }
            if (my === 3 && op === 0 && !blocked) reaches++;
        }
        return reaches;
    }

    /** 自分のリーチ（自コマ3つ・他のコマ無し）の残り1マスが氷結中の空きマスで塞がれているときの、そのマス (sim/ai.js blockedReachCell) */
    blockedReachCell(board: SquareInfo[]): number | null {
        for (const line of geometryForCells(board.length).winLines) {
            let mine = 0, other = 0, blockedIdx = -1, free = 0;
            for (const idx of line) {
                const sq = board[idx];
                if (sq.player === this.playerSymbol) mine++;
                else if (sq.player) other++;
                else if (emptyBlocked(sq)) blockedIdx = idx;
                else free++;
            }
            if (mine === 3 && other === 0 && blockedIdx !== -1 && free === 0) return blockedIdx;
        }
        return null;
    }

    /** 火遁で k の氷結を解く対象: k の縦横隣のコマで氷結・ロック・無敵でないもの（敵を優先、無ければ自陣）。sim/ai.js thawIgniteTarget(allowOwn) */
    thawIgniteTarget(board: SquareInfo[], k: number): number | null {
        let own: number | null = null;
        for (const n of orthoNeighbors(k, this.sizeOf(board))) {
            const sq = board[n];
            if (!sq.player || isFrozen(sq) || this.shield.has(n) || sq.effects.some((e) => e.effect === '🔑')) continue;
            if (this.isEnemy(sq.player)) return n;
            if (own === null) own = n;
        }
        return own;
    }

    /** 相手がリーチしているラインの残り1マス（脅威マス）を列挙 */
    findThreatSquares(board: SquareInfo[], player: Player): number[] {
        const threats: number[] = [];
        for (const line of geometryForCells(board.length).winLines) {
            if (line.some((idx) => isShikigami(board[idx]))) continue; // 式神は列に数えない
            let pCount = 0, oCount = 0, emptyIdx = -1;
            for (const idx of line) {
                const sq = board[idx];
                if (sq.player === player) pCount++;
                else if (sq.player) oCount++;
                else if (!sq.player && !(sq.effects.some(e => e.effect === '🔑') && sq.bind > 0) && !emptyBlocked(sq)) emptyIdx = idx;
            }
            if (pCount === 3 && oCount === 0 && emptyIdx !== -1) {
                if (!threats.includes(emptyIdx)) threats.push(emptyIdx);
            }
        }
        return threats;
    }

    /** 盤面上にコマを置いたシミュレーション (bind=0の乗っ取り対応) */
    /**
     * 巨人のオーラを着手後の盤面に反映する（Game.tsx / giantAura.ts と同じ規則。sim/ai.js の auraSim=1 と同一）。
     * 着手マスの周囲の敵コマを壊し、周囲を全部ロックする。A/B: 環境勝率 53.1→60.2%（seed2/200）
     */
    applyAuraSim(sim: SquareInfo[], index: number): SquareInfo[] {
        const range = geometryForCells(sim.length).surroundRange(index);
        for (const j of range) {
            const sq = sim[j];
            if (!sq.player || sq.player === this.playerSymbol || sq.effects.some((e) => e.effect === '🔑') || this.shield.has(j)) continue;
            const guard = absorbDestroy(sq);
            sim[j] = guard.blocked ? guard.sq : { player: undefined, bind: 0, effects: [] };
        }
        for (const j of range) {
            const sq = sim[j];
            if (isFrozen(sq) || sq.effects.some((e) => e.effect === '🔑')) continue;
            sim[j] = { ...sq, bind: sq.player ? sq.bind : Math.max(sq.bind, 1), effects: [...sq.effects, { effect: '🔑' }] };
        }
        return sim;
    }

    simulatePlace(board: SquareInfo[], index: number, player: Player, life: number): SquareInfo[] {
        const newBoard = board.map(sq => ({ ...sq, effects: [...sq.effects] }));
        const sq = newBoard[index];

        if (isShikigami(sq) && sq.player !== player && sq.bind <= 0) {
            newBoard[index] = { player: undefined, bind: 0, effects: [] }; // 式神は乗っ取られると空きマスになる
        } else if (!sq.player) {
            // 空きマスに配置
            newBoard[index] = { player, bind: life, effects: [] };
        } else if (sq.player !== player) {
            if (sq.bind <= 0) {
                // bind=0 → 無条件で乗っ取り
                newBoard[index] = { player, bind: life, effects: [] };
            } else {
                // bind>0 → 攻撃 (防御側 +1 アドバンテージ)
                const calcBind = sq.bind - life + 1;
                if (calcBind < 0) {
                    newBoard[index] = { player, bind: -calcBind, effects: [] };
                } else if (calcBind === 0) {
                    newBoard[index] = { player: undefined, bind: 0, effects: [] };
                } else {
                    newBoard[index] = { ...sq, bind: calcBind };
                }
            }
        } else {
            // 自分のマスに重ね置き
            newBoard[index] = { ...sq, bind: sq.bind + life + 1 };
            // 式神を補強すると🌱付きの通常コマになる
            if (isShikigami(sq)) newBoard[index].effects = newBoard[index].effects.filter((e) => e.effect !== '📜').concat([{ effect: '🌱' }]);
        }

        return newBoard;
    }

    /** 有効な手の一覧 (空きマス + 乗っ取り/攻撃可能な敵マス) */
    getValidMoves(board: SquareInfo[], life: number): number[] {
        const moves: number[] = [];
        for (let i = 0; i < board.length; i++) {
            const sq = board[i];
            if (this.shield.has(i)) continue;
            // ロック済みかつbind>0はスキップ
            if (sq.effects.some(e => e.effect === '🔑') && sq.bind > 0) continue;

            if (!sq.player) {
                // 空きマス (ロックされていない)
                if (!sq.effects.some(e => e.effect === '🔑') && !emptyBlocked(sq)) moves.push(i);
            } else if (this.isEnemy(sq.player)) {
                // bind=0の敵マスは無条件で乗っ取り可能
                if (sq.bind <= 0) {
                    moves.push(i);
                } else if (this.character === 'giant') {
                    // 巨人のみbind>0の敵マスを攻撃可能
                    moves.push(i);
                }
            }
        }
        return moves;
    }

    /** 指定プレイヤーが着手可能なマスを列挙 */
    getMovesFor(board: SquareInfo[], player: Player, life: number): number[] {
        const moves: number[] = [];
        for (let i = 0; i < board.length; i++) {
            const sq = board[i];
            if (this.shield.has(i)) continue;
            if (sq.effects.some(e => e.effect === '🔑') && sq.bind > 0) continue;
            if (!sq.player) {
                if (!sq.effects.some(e => e.effect === '🔑') && !emptyBlocked(sq)) moves.push(i);
            } else if (sq.player !== player) {
                if (sq.bind <= 0) moves.push(i);
            }
        }
        return moves;
    }

    /** Minimax + Alpha-Beta 枝刈り (深さ2) */
    minimax(board: SquareInfo[], depth: number, isMax: boolean, alpha: number, beta: number, life: number): number {
        const winner = calculateWinner(lineSymbols(board));
        if (winner === this.playerSymbol) return 1000 + depth;
        if (winner) return -1000 - depth;

        // 敵が複数いても探索木では先頭の敵を「相手役」として代表させる（深さは盤サイズで制限済み）
        const opponent = this.opponents[0];
        const currentPlayer = isMax ? this.playerSymbol : opponent;
        const moves = this.getMovesFor(board, currentPlayer, life);
        if (depth === 0 || moves.length === 0) return this.evaluateBoard(board);

        if (isMax) {
            let best = -Infinity;
            for (const idx of moves) {
                const score = this.minimax(
                    this.simulatePlace(board, idx, this.playerSymbol, life),
                    depth - 1, false, alpha, beta, life
                );
                best = Math.max(best, score);
                alpha = Math.max(alpha, score);
                if (beta <= alpha) break;
            }
            return best;
        } else {
            let best = Infinity;
            for (const idx of moves) {
                const score = this.minimax(
                    this.simulatePlace(board, idx, opponent, life),
                    depth - 1, true, alpha, beta, life
                );
                best = Math.min(best, score);
                beta = Math.min(beta, score);
                if (beta <= alpha) break;
            }
            return best;
        }
    }

    /** 最善手を選択: 即勝ち→即ブロック→Minimax+フォーク評価 */
    getBestMove(board: SquareInfo[], life: number): number | null {
        const empty = findEmptyIndexes(board);
        const validMoves = this.getValidMoves(board, life);
        const allMoves = Array.from(new Set([...empty, ...validMoves]));

        if (allMoves.length === 0) return null;

        // 1. 即勝ち
        for (const i of allMoves) {
            const sim = this.simulatePlace(board, i, this.playerSymbol, life);
            if (calculateWinner(lineSymbols(sim)) === this.playerSymbol) return i;
        }

        // 2. 相手の即勝ちをブロック (空きマス + 乗っ取り可能な自マス)。土壇場の防壁が未発動なら止めに行かない
        for (const opp of this.lastStandReady ? [] : this.opponents) {
            const oppMoves = this.getMovesFor(board, opp, life);
            for (const i of oppMoves) {
                const sim = this.simulatePlace(board, i, opp, life);
                if (calculateWinner(lineSymbols(sim)) === opp) {
                    if (allMoves.includes(i)) return i;
                }
            }
        }

        // 陰陽師の百鬼夜行→式神一括は『敵コマの入っていない列』が1本でもあれば一手番で勝つ。陰陽師が相手のときは、
        // その列を自コマで埋めて減らす着手を優先する（全部塞げるなら大きく加点。sim/ai.js の antiFlood=300 / antiFloodLines=100）
        const floodFoes = this.opponents.filter((o) => this.characters[seatOf(o)] === 'yinYangMaster');
        const geo = geometryForCells(board.length);
        const floodFreeLines = (bd: SquareInfo[], foe: Player) =>
            geo.winLines.filter((line) => line.every((k) => (!bd[k].player && !emptyBlocked(bd[k])) || bd[k].player === foe)).length;

        // 3. Minimax評価 + フォーク検出
        let bestScore = -Infinity;
        let bestMove = allMoves[0];

        for (const i of allMoves) {
            const simBoard = this.simulatePlace(board, i, this.playerSymbol, life);
            if (this.character === 'giant' && simBoard[i].player === this.playerSymbol) this.applyAuraSim(simBoard, i);
            let score = this.minimax(simBoard, this.searchDepth(board), false, -Infinity, Infinity, life);

            // テンポ/レース強化(A/B検証で +8pt): リーチ作成を重視して先に盤面を取りに行く
            const reaches = this.countReaches(simBoard, this.playerSymbol);
            if (reaches >= 2) score += 200;        // フォーク
            else if (reaches === 1) score += 40;   // シングルリーチ作成も評価

            // bind=0の敵マス乗っ取りボーナス（捕獲の戦術価値は墓地1個の損より大きいと実測で判明したため対ネクロでも維持）
            if (this.isEnemy(board[i].player) && board[i].bind <= 0) {
                score += 30;
            }

            // ⚡の発火: 隣の帯電マスが敵を削れば加点、自コマを削れば減点
            score += this.fireGain(board, i);

            if (floodFoes.length > 0) {
                const left = Math.max(...floodFoes.map((foe) => floodFreeLines(simBoard, foe)));
                if (left === 0) score += FLOOD_BLOCK_BONUS;
                else score += FLOOD_LINE_WEIGHT * Math.max(...floodFoes.map((foe) => floodFreeLines(board, foe) - floodFreeLines(simBoard, foe)));
            }

            if (score > bestScore) {
                bestScore = score;
                bestMove = i;
            }
        }

        return bestMove;
    }

    /**
     * 盤面・キャラに応じて固定（ロック）したいスキルを返す。[要検証]
     * 守備のために1枠は空けておけるよう最大2つまで。キャラ専用シナジーを優先。
     */
    chooseLocks(
        board: SquareInfo[],
        opponentMagic: number,
        life: number,
        availableSkills: number[]
    ): number[] {
        // A/B検証の結果、固有スキル依存のキャラ(巨人/魔法使い/陰陽師)はロックが柔軟性を削いで不利だったため無効化。
        // 有益だったキャラ(軍師=トークン固定 / あなた / ネクロ=中立)のみロックする。
        // 陰陽師は百鬼夜行(73)+式神一括(71)のコンボ札だけを手札に固定して、揃うまで持ち続ける（sim/ai.js の floodLock=1）
        if (this.character === 'yinYangMaster') return availableSkills.filter((i) => i === 71 || i === 73 || i === 53); // 特売(53)もコンボの圧縮に使うので固定
        if (this.character === 'giant' || this.character === 'magician') {
            return [];
        }
        let myPieces = 0, oppPieces = 0, empties = 0;
        // オピウム等のダメージが通る敵コマだけを数える（氷結中は❄が肩代わりする）
        for (const sq of board) {
            if (sq.player === this.playerSymbol) myPieces++;
            else if (sq.player) { if (!isFrozen(sq)) oppPieces++; }
            else if (!isFrozen(sq)) empties++;
        }
        const geo = geometryForCells(board.length);
        const enemiesOn = (idxs: number[]) =>
            idxs.filter((i) => this.isEnemy(board[i].player) && !isFrozen(board[i]) && !board[i].effects.some((e) => e.effect === '🔑')).length;

        // キャラ専用シナジー: 軍師→トークン系 / 魔法使い→バッズ系
        const tokenIdx = [3, 4, 9, 11];
        const budsIdx = [2, 10];
        // 毒使い: トークン系スキル(両トークンを除く。ポイズントークンを含む)を手札でロックして、毎手番トークンを撃てるようにする (sim/ai.js と同一)
        const poisonerTokenIdx = [3, 9, 11, 16];
        const preferred = (idx: number) =>
            (this.character === 'tactician' && tokenIdx.includes(idx)) ||
            (this.character === 'magician' && budsIdx.includes(idx)) ||
            (this.character === 'poisoner' && poisonerTokenIdx.includes(idx));

        // 盤面的に価値が高いスキル
        const valued = (idx: number): boolean => {
            switch (idx) {
                case 3: case 4: case 9: case 11: return empties >= 3;          // トークン系
                case 5: return enemiesOn(geo.antiDiagonal) >= 2;                   // スラッシュ
                case 6: return enemiesOn(geo.mainDiagonal) >= 2;                  // バックスラッシュ
                case 8: return oppPieces >= 3;                                  // オピウム
                case 7: return opponentMagic >= 7;                              // チューチュートレイン
                case 14: return myPieces >= 3;                                  // ワルプルギスの夜
                case 0: case 1: return life <= 2;                               // ライフ3/バイバイン
                case 2: case 10: return empties >= 8;                           // バッズ系(序盤)
                case 20: return empties >= 6;                                   // 増殖(空きが多いほどループが伸びる)
                case 21: case 23: return this.character === 'electrician' && empties >= 3; // 帯電トークン/帯電ダブルトークン
                default: return false;
            }
        };

        const locks: number[] = [];
        for (const idx of availableSkills) {
            if (idx < 0 || idx >= SKILL_POOL_SIZE) continue;
            if (preferred(idx) || valued(idx)) locks.push(idx);
        }
        // キャラ専用シナジーを優先して残す。守備の余地のため最大2つ
        locks.sort((a, b) => (preferred(b) ? 1 : 0) - (preferred(a) ? 1 : 0));
        return locks.slice(0, 2);
    }

    /** AI用コスト計算 (軍師のトークン割引など) */
    calculateAICost(baseCost: number, isToken: boolean = false, isPoison: boolean = false, skillKey?: string): number {
        let cost = baseCost;
        if (this.character === 'poisoner') cost = isPoison ? baseCost - 1 : baseCost + 1;
        else if (this.character === 'tactician') cost = isToken ? baseCost - 1 : baseCost + 2;
        else if (this.character === 'pyromancer' && skillKey && FLAME_SKILL_KEYS.has(skillKey) && cost > 1) cost -= 1; // 🔥付与スキルは常に-1
        else if (this.character === 'yinYangMaster' && this.yinYangMode === 'yang') cost += 1; // 陽は全スキル+1
        const paid = this.gearCostFn ? this.gearCostFn(cost, isToken, skillKey) : cost;
        // 軽減札を撃つ前提の比較中は、軽減札でないスキルに「次に打つスキル」の軽減を掛ける（下限1）
        return this.hypoCut > 0 && paid > 0 && !(skillKey && isDiscountSkill(skillKey)) ? Math.max(1, paid - this.hypoCut) : paid;
    }

    /**
     * 魔法使いの引き直し計画。撃てるスキルが無く（軽減札を撃っても増えない）、魔力に余裕があるときだけ返す。
     * 軽減札が未使用なら [軽減札, シャッフル]、引き直しの途中（軽減済み）ならシャッフルだけ。
     */
    planReroll(
        board: SquareInfo[],
        magic: number,
        costs: Record<keyof SkillCosts, number>,
        opponentMagic: number,
        life: number,
        availableSkills: number[],
        tokenUsed: boolean,
        necroRemain: number,
        necroCost: number,
        assaultCost: number,
        proliferateActive: boolean,
        seatMagic: number[],
        necroPay: number
    ): { discount?: string } | null {
        const plan = (m: number, avail: number[]) =>
            this.chooseSkills(board, m, costs, opponentMagic, life, avail, tokenUsed, necroRemain, necroCost, assaultCost, proliferateActive, seatMagic, necroPay);
        const base = [...plan(magic, availableSkills)];
        if (base.length > 0) return null;
        // 引き直しの途中: 軽減は既に掛かっている。魔力に余裕があればもう一度シャッフルする
        if (this.discountActive) return magic >= costs.onClickShuffle + 2 ? {} : null;
        // 軽減札を撃てば撃てるスキルが出るなら、引き直しではなく通常の軽減札プランに任せる
        for (const r of REROLL_REDUCERS) {
            if (!availableSkills.includes(r.idx)) continue;
            const rc = this.calculateAICost(costs[r.key], false, false, r.key);
            if (magic < rc) continue;
            this.hypoCut = r.cut;
            const n = plan(magic - rc, availableSkills.filter((i) => i !== r.idx)).length;
            this.hypoCut = 0;
            if (n > 0) return null;
        }
        // 軽減札 + シャッフル(+2の余裕) + 引き直し後に撃つ分(+4) の魔力があるとき
        const r = REROLL_REDUCERS.find((x) => availableSkills.includes(x.idx) && magic >= this.calculateAICost(costs[x.key], false, false, x.key) + 2 + 4);
        return r ? { discount: r.key } : null;
    }

    /** 戦略的スキル選択（複数スキルを返す場合あり） */
    chooseSkills(
        board: SquareInfo[],
        magic: number,
        costs: Record<keyof SkillCosts, number>,
        opponentMagic: number,
        life: number,
        availableSkills: number[],
        tokenUsed: boolean,
        necroRemain: number = 0,
        necroCost: number = 0,
        assaultCost: number = 99,
        proliferateActive: boolean = false,
        seatMagic: number[] = [],
        /** 蘇生で実際に払う魔力（ギア補正込み）。省略時は necroCost */
        necroPay: number = necroCost
    ): string[] {
        const skills: string[] = [];
        let remaining = magic;
        const oppReaches = this.opponents.reduce((n, o) => n + this.countReaches(board, o), 0);
        let myPieces = 0, oppPieces = 0, oppHit = 0;
        const piecesOf = new Map<Player, number>();
        const hitOf = new Map<Player, number>();
        for (const sq of board) {
            if (sq.player === this.playerSymbol) myPieces++;
            else if (sq.player) {
                piecesOf.set(sq.player, (piecesOf.get(sq.player) ?? 0) + 1);
                if (!isFrozen(sq)) hitOf.set(sq.player, (hitOf.get(sq.player) ?? 0) + 1); // スキルダメージが通る敵コマ
            }
        }
        // 敵が複数いるときは最大勢力の敵と比べる（2人戦なら従来どおり相手の数）
        piecesOf.forEach((n) => { oppPieces = Math.max(oppPieces, n); });
        hitOf.forEach((n) => { oppHit = Math.max(oppHit, n); });
        const geo = geometryForCells(board.length);
        const isLosing = oppPieces > myPieces + 2 || oppReaches > 0;

        // 固有スキル用の魔力温存: ネクロは蘇生のコスト分を下回る汎用スキル(バッズ/トークン/ライフ)の支払いを控える
        // (sim/ai.js chooseSkills と同一。A/B: ネクロ +2〜6pt。巨人は誤差内、軍師は大幅悪化で対象外)
        let reserve = 0;
        if (this.character === 'necromancer' && necroRemain === 0) reserve = necroCost;
        const RESERVE_SKIP = ['onClickBuds', 'onClickAddLife', 'onClickToken', 'onClickBudsToken', 'onClickDoubleToken'];
        const spend = (cost: number, skill: string): boolean => {
            if (reserve > 0 && RESERVE_SKIP.includes(skill) && remaining - cost < reserve) return false;
            if (remaining >= cost) { remaining -= cost; skills.push(skill); return true; }
            return false;
        };

        // --- 固有スキル (相手リーチがなければ積極的に使う) ---

        if (oppReaches === 0) {
            // ネクロマンサー蘇生: 墓地が貯まり召喚が見込める or 吸収対象が複数いるなら発動
            if (this.character === 'necromancer' && necroRemain === 0 && remaining >= necroPay) {
                const corpses = 10 - necroCost; // baseNecromancyCost=10。軽減量=墓地の死体数=召喚数
                let absorbable = 0;
                for (const sq of board) {
                    if (this.isEnemy(sq.player) && sq.bind >= 1 && sq.bind <= 4 && !sq.effects.some(e => e.effect === '🔑')) absorbable++;
                }
                // 死体が1つでもあれば即発動 (sim/ai.js と同一。A/B: 他キャラの勝率 -3〜-4.6pt)
                if (corpses >= 1 || absorbable >= 2) spend(necroPay, 'onClickNecromancy');
            }

            // 軍師: 全軍突撃 (実コストは「9−使用トークン×2」。calculateAICostの+2ペナルティは誤りなので使わない)
            if (this.character === 'tactician') {
                if (remaining >= assaultCost && myPieces >= 2) spend(assaultCost, 'onClickTotalAssault');
            }

            // 増殖: 空きマスが残っていて、維持コストを数ターン払える余裕があるうちに回し始める
            // (発動が遅いほど盤面が埋まりループの旨味が減るため、序盤〜中盤限定)
            if (!proliferateActive && availableSkills.includes(20)) {
                const proliferateCost = this.calculateAICost(costs.onClickProliferate, false, false, 'onClickProliferate');
                const emptyCount = board.filter((sq) => !sq.player).length;
                if (remaining >= proliferateCost + 1 && emptyCount >= 5) {
                    spend(proliferateCost, 'onClickProliferate');
                }
            }
        }

        // サイレンス: 相手が次の手番に固有スキルを撃てそうなら先回りで封じる (自分に即勝ちがあるときは勝ち優先)
        // 毒霧: 毒使いが、敵コマが自コマより2つ以上多いとき撃つ（sim/ai.js と同じ条件）
        if (this.character === 'poisoner' && availableSkills.includes(29)) {
            let mine = 0;
            let theirs = 0;
            for (const sq of board) {
                if (!sq.player || sq.effects.some((e) => e.effect === '🔑')) continue;
                if (sq.player === this.playerSymbol) mine++;
                else theirs++;
            }
            if (theirs >= 4 && theirs >= mine + 2) spend(this.calculateAICost(costs.onClickPoisonMist, false, true, 'onClickPoisonMist'), 'onClickPoisonMist');
        }

        if (
            oppReaches === 0 &&
            availableSkills.includes(28) &&
            this.countReaches(board, this.playerSymbol) === 0 &&
            this.opponents.some((o) => {
                const seat = seatOf(o);
                return (seatMagic[seat] ?? 0) + 1 >= (EXCLUSIVE_MIN_MAGIC[this.characters[seat]] ?? Infinity);
            })
        ) {
            spend(this.calculateAICost(costs.onClickSilence, false, false, 'onClickSilence'), 'onClickSilence');
        }

        // --- ターン終了系は単独で返す ---

        // Opiumはリーチ防御に使わない (bindを下げるだけで空きマスは塞げない)
        // → getBestMoveでブロック配置させる

        // 劣勢時の破壊系 (ターン終了するので、相手リーチ時は使わない→ブロック優先)
        if (skills.length === 0 && isLosing && oppReaches === 0) {
            if (availableSkills.includes(5)) {
                let oppOn = 0, myOn = 0;
                for (const idx of geo.antiDiagonal) {
                    if (isFrozen(board[idx])) continue; // 氷結中は❄1つが身代わり（敵も自陣も無傷）
                    if (this.isEnemy(board[idx].player) && !board[idx].effects.some(e => e.effect === '🔑')) oppOn++;
                    if (board[idx].player === this.playerSymbol && !board[idx].effects.some(e => e.effect === '🔑')) myOn++;
                }
                if (oppOn > myOn) spend(this.calculateAICost(costs.onClickSlash, false, false, 'onClickSlash'), 'onClickSlash');
            }
            if (skills.length === 0 && availableSkills.includes(6)) {
                let oppOn = 0, myOn = 0;
                for (const idx of geo.mainDiagonal) {
                    if (isFrozen(board[idx])) continue;
                    if (this.isEnemy(board[idx].player) && !board[idx].effects.some(e => e.effect === '🔑')) oppOn++;
                    if (board[idx].player === this.playerSymbol && !board[idx].effects.some(e => e.effect === '🔑')) myOn++;
                }
                if (oppOn > myOn) spend(this.calculateAICost(costs.onClickBackSlash, false, false, 'onClickBackSlash'), 'onClickBackSlash');
            }
            if (skills.length === 0 && availableSkills.includes(7) && opponentMagic >= 6) {
                spend(this.calculateAICost(costs.onClickTsunami, false, false, 'onClickTsunami'), 'onClickTsunami');
            }
        }



        // ターン終了スキルが選ばれていたらここで返す
        if (skills.some(s => TURN_ENDING_SKILLS.includes(s))) {
            this.lastSpent = magic - remaining;
            this.lastSpent = magic - remaining;
        return skills;
        }

        // --- 準備スキル (配置前に追加) ---

        // ライフが低い時: AddLife で +3
        if (life <= 2 && availableSkills.includes(0)) {
            spend(this.calculateAICost(costs.onClickAddLife, false, false, 'onClickAddLife'), 'onClickAddLife');
        }

        // バッズ: コスト4で毎ターン+1マジック → 4ターン以上残りそうなら元が取れる
        if (availableSkills.includes(2)) {
            const budsCost = this.calculateAICost(costs.onClickBuds, false, false, 'onClickBuds');
            const emptyCount = board.filter(sq => !sq.player).length;
            const myBuds = board.filter(sq => sq.player === this.playerSymbol && sq.effects.some(e => e.effect === '🌱')).length;
            // 空きマスが多い(序盤〜中盤) かつ バッズが少ない時のみ
            if (remaining >= budsCost && emptyCount >= 6 && myBuds < 3) {
                spend(budsCost, 'onClickBuds');
            }
        }

        // 血清: 自陣の毒で次の減衰までに消えそうなコマ(毒数>=bind)があれば除去
        // (ランダム枠に出ているときのみ)
        if (availableSkills.includes(17)) {
            const doomed = board.filter(sq => sq.player === this.playerSymbol && !isDormant(sq)
                && sq.effects.filter(e => e.effect === '☠').length >= Math.max(1, sq.bind)
                && sq.effects.some(e => e.effect === '☠')).length;
            if (doomed >= 1) spend(this.calculateAICost(costs.onClickSerum, false, true, 'onClickSerum'), 'onClickSerum');
        }

        // --- トークン系 ---
        // 氷室の番人: 霜降り・氷結トークン系を使う (sim/ai.js F.cryoCards と同一。環境勝率 seed2/200 で +9.1pt)
        const freeCells = findEmptyIndexes(board).length;
        const cryo = this.character === 'cryomancer' || this.character === 'poisoner'; // 毒使いも氷結札を使う(自陣の毒マスを凍らせる。sim F.cryoPoison)
        if (cryo && availableSkills.includes(48) && frostfallTargets(board, this.playerSymbol).length >= 2) {
            spend(this.calculateAICost(costs.onClickFrostfall, false, false, 'onClickFrostfall'), 'onClickFrostfall');
        }
        // 霜枯れ: 煉獄の鍛冶師が敵にいるとき、自陣の🍂マスを凍らせて🔥から守る（氷結中は🍂が休眠するので、2マス以上あるときだけ。sim/ai.js と同一）
        if (
            availableSkills.includes(69) &&
            this.characters.some((c, seat) => seat !== seatOf(this.playerSymbol) && c === 'pyromancer') &&
            leafFrostTargets(board, this.playerSymbol).filter((i) => !this.shield.has(i)).length >= 2
        ) {
            spend(this.calculateAICost(costs.onClickLeafFrost, false, false, 'onClickLeafFrost'), 'onClickLeafFrost');
        }
        // 🍂落ち葉トークン: 自陣の🍂は相手全員のスキルコストを上げる。固有のトークン札を持つキャラ以外は、普通のトークンより先に撃つ
        const leafToken = !tokenUsed && !cryo && this.character !== 'electrician' ? this.pickLeafToken(availableSkills, freeCells, remaining, costs) : null;
        if (leafToken && spend(leafToken.cost, leafToken.skill)) {
            // 🍂付きのトークンを撃った（トークンはターンに1回）
        } else if (!tokenUsed) {
            if (this.character === 'poisoner' && availableSkills.includes(16) && remaining >= this.calculateAICost(costs.onClickPoisonToken, true, true, 'onClickPoisonToken')) {
                spend(this.calculateAICost(costs.onClickPoisonToken, true, true, 'onClickPoisonToken'), 'onClickPoisonToken');
            } else if (this.character === 'yinYangMaster' && availableSkills.includes(72)
                && board.filter((sq) => sq.player === this.playerSymbol && isShikigami(sq)).length < SH_MAX
                && remaining >= this.calculateAICost(costs.onClickShikigamiRandom, true, false, 'onClickShikigamiRandom') + SH_RESERVE) {
                spend(this.calculateAICost(costs.onClickShikigamiRandom, true, false, 'onClickShikigamiRandom'), 'onClickShikigamiRandom');
            } else if (cryo && freeCells >= 4 && availableSkills.includes(46) && remaining >= this.calculateAICost(costs.onClickDoubleFrostToken, true, false, 'onClickDoubleFrostToken')) {
                spend(this.calculateAICost(costs.onClickDoubleFrostToken, true, false, 'onClickDoubleFrostToken'), 'onClickDoubleFrostToken');
            } else if (cryo && freeCells >= 3 && availableSkills.includes(45) && remaining >= this.calculateAICost(costs.onClickFrostToken, true, false, 'onClickFrostToken')) {
                spend(this.calculateAICost(costs.onClickFrostToken, true, false, 'onClickFrostToken'), 'onClickFrostToken');
            } else if (this.character === 'electrician' && availableSkills.includes(23) && remaining >= this.calculateAICost(costs.onClickDoubleChargeToken, true, false, 'onClickDoubleChargeToken')) {
                spend(this.calculateAICost(costs.onClickDoubleChargeToken, true, false, 'onClickDoubleChargeToken'), 'onClickDoubleChargeToken');
            } else if (this.character === 'electrician' && availableSkills.includes(21) && remaining >= this.calculateAICost(costs.onClickChargeToken, true, false, 'onClickChargeToken')) {
                spend(this.calculateAICost(costs.onClickChargeToken, true, false, 'onClickChargeToken'), 'onClickChargeToken');
            } else if (this.character === 'tactician') {
                if (availableSkills.includes(11) && remaining >= this.calculateAICost(costs.onClickDoubleToken, true, false, 'onClickDoubleToken')) {
                    spend(this.calculateAICost(costs.onClickDoubleToken, true, false, 'onClickDoubleToken'), 'onClickDoubleToken');
                } else if (availableSkills.includes(9) && remaining >= this.calculateAICost(costs.onClickBudsToken, true, false, 'onClickBudsToken')) {
                    spend(this.calculateAICost(costs.onClickBudsToken, true, false, 'onClickBudsToken'), 'onClickBudsToken');
                } else if (availableSkills.includes(3) && remaining >= this.calculateAICost(costs.onClickToken, true, false, 'onClickToken')) {
                    spend(this.calculateAICost(costs.onClickToken, true, false, 'onClickToken'), 'onClickToken');
                }
            } else {
                if (availableSkills.includes(11) && remaining >= this.calculateAICost(costs.onClickDoubleToken, true, false, 'onClickDoubleToken')) {
                    spend(this.calculateAICost(costs.onClickDoubleToken, true, false, 'onClickDoubleToken'), 'onClickDoubleToken');
                } else if (availableSkills.includes(9) && remaining >= this.calculateAICost(costs.onClickBudsToken, true, false, 'onClickBudsToken')) {
                    spend(this.calculateAICost(costs.onClickBudsToken, true, false, 'onClickBudsToken'), 'onClickBudsToken');
                } else if (availableSkills.includes(3) && remaining >= this.calculateAICost(costs.onClickToken, true, false, 'onClickToken')) {
                    spend(this.calculateAICost(costs.onClickToken, true, false, 'onClickToken'), 'onClickToken');
                }
            }
        }

        // 雷霆の巫: 他に撃つものが無く、魔力に余裕があるときだけランダム帯電（コスト+1 以上残る）
        if (this.character === 'electrician' && skills.length === 0 && availableSkills.includes(25)) {
            const rc = this.calculateAICost(costs.onClickChargeRandom, false, false, 'onClickChargeRandom');
            if (remaining >= rc + CHARGE_RANDOM_MARGIN) spend(rc, 'onClickChargeRandom');
        }

        // 火の車: ランダムな敵マス2つに🔥、その後手札をシャッフルする。手札が変わるので、計画の最後に撃つ（このターン🔥を付与済みなら0コスト。sim/ai.js と同一）
        if (
            availableSkills.includes(75) &&
            fireWheelTargets(board, this.playerSymbol, (sq, i) => this.shield.has(i) || sq.effects.some((e) => e.effect === '🔑')).length >= 2
        ) {
            spend(this.calculateAICost(costs.onClickFireWheel, false, false, 'onClickFireWheel'), 'onClickFireWheel');
        }

        return skills;
    }

    /** 🍂付きトークンの選択: ダブル(空き4以上)→双子→1枚の順に、払える最初のもの (sim/ai.js pickLeafToken と同一) */
    pickLeafToken(availableSkills: number[], freeCells: number, remaining: number, costs: Record<keyof SkillCosts, number>): { skill: string; cost: number } | null {
        const options: { idx: number; skill: 'onClickDoubleLeafToken' | 'onClickTwinLeafToken' | 'onClickLeafToken'; minFree: number }[] = [
            { idx: 64, skill: 'onClickDoubleLeafToken', minFree: 4 },
            { idx: 63, skill: 'onClickTwinLeafToken', minFree: 3 },
            { idx: 62, skill: 'onClickLeafToken', minFree: 3 },
        ];
        for (const o of options) {
            if (!availableSkills.includes(o.idx) || freeCells < o.minFree) continue;
            const cost = this.calculateAICost(costs[o.skill], true, false, o.skill);
            if (remaining >= cost) return { skill: o.skill, cost };
        }
        return null;
    }

    /**
     * 鬼門封じ: 敵のコマを破壊して3ターンロックする対象。氷結中・🔑ロック・無敵のコマは選ばない。
     * 破壊されたコマの持ち主のラインの価値（そのコマを含む、他の敵の駒が混ざらないライン）が大きいものを選び、minValue 未満なら null (sim/ai.js bestKimonTarget と同一)
     */
    findKimonTarget(board: SquareInfo[], minValue: number): number | null {
        const lineScores = [0, 1, 10, 50, 1000];
        const geo = geometryForCells(board.length);
        let best: number | null = null;
        let bestVal = 0;
        for (let i = 0; i < board.length; i++) {
            const sq = board[i];
            if (!this.isEnemy(sq.player) || this.shield.has(i) || isFrozen(sq) || sq.effects.some((e) => e.effect === '🔑')) continue;
            let val = 0;
            for (const line of geo.winLines) {
                if (!line.includes(i)) continue;
                let oc = 0, foreign = 0;
                for (const idx of line) {
                    if (board[idx].player === sq.player) oc++;
                    else if (board[idx].player) foreign++;
                }
                if (foreign === 0) val += lineScores[Math.min(oc, 4)];
            }
            if (val > bestVal) { bestVal = val; best = i; }
        }
        return bestVal >= minValue ? best : null;
    }

    /**
     * 毒使い インジェクション: 敵コマ1つに毒を1付与。次の着手の減衰(1+毒数)で bind が 0 になれば消える。
     * 消えるまでの手数が少なく、敵のライン価値が高いコマを狙う。なければ null (sim/ai.js bestInjectionTarget と同一)
     */
    findInjectionTarget(board: SquareInfo[], minValue: number): { index: number; kills: boolean } | null {
        const lineScores = [0, 1, 10, 50, 1000];
        const geo = geometryForCells(board.length);
        let best: { index: number; kills: boolean } | null = null;
        let bestVal = 0;
        for (let i = 0; i < board.length; i++) {
            const sq = board[i];
            if (!this.isEnemy(sq.player) || this.shield.has(i)) continue;
            if (isDormant(sq)) continue; // 休眠マス（氷結中）の毒は継続ダメージなし
            const p = sq.effects.filter((e) => e.effect === '☠').length + 1;
            const turns = Math.ceil(sq.bind / (1 + p));
            if (turns > 2) continue;
            let val = 0;
            for (const line of geo.winLines) {
                if (!line.includes(i)) continue;
                let oc = 0, foreign = 0;
                for (const idx of line) {
                    if (board[idx].player === sq.player) oc++;
                    else if (board[idx].player) foreign++;
                }
                if (foreign === 0) val += lineScores[Math.min(oc, 4)];
            }
            if (turns !== 1) val /= 2;
            if (val > bestVal) { bestVal = val; best = { index: i, kills: turns === 1 }; }
        }
        return bestVal >= minValue ? best : null;
    }

    /**
     * 対ネクロ: 吸収されそうな低bind(<=3)の未ロック自コマのうち、通っている自ラインの価値が最大のもの。
     * なければ null (sim/ai.js bestAntiNecroLockTarget と同一)
     */
    findAntiNecroLockTarget(board: SquareInfo[]): number | null {
        const lineScores = [0, 1, 10, 50, 1000];
        const geo = geometryForCells(board.length);
        let best: number | null = null;
        let bestVal = 0;
        for (let i = 0; i < board.length; i++) {
            const sq = board[i];
            // ⚡で無敵の自コマは誰も触れず、ロックの対象にもできない(クリックが空振りしてロックの選択待ちで止まる)
            if (sq.player !== this.playerSymbol || sq.bind > 3 || this.shield.has(i) || sq.effects.some((e) => e.effect === '🔑')) continue;
            let val = 1;
            for (const line of geo.winLines) {
                if (!line.includes(i)) continue;
                let mc = 0, foreign = 0;
                for (const idx of line) {
                    if (board[idx].player === this.playerSymbol) mc++;
                    else if (board[idx].player) foreign++;
                }
                if (foreign === 0) val += lineScores[Math.min(mc, 4)];
            }
            if (val > bestVal) { bestVal = val; best = i; }
        }
        return best;
    }

    /** 直近の findRescueCenter が選んだ中心で残る敵の脅威マス数（巨人ストンプの防御判定用） */
    private lastRescueThreats = 0;

    /** 巨人ストンプ: 破壊範囲に敵が最多の中心 (敵1体以上で価値あり。コスト2なので積極的に撃つ)。なければ null */
    findStompTarget(board: SquareInfo[]): number | null {
        const geo = geometryForCells(board.length);
        let bestIdx: number | null = null, bestEnemies = 0, bestEmptyCenter = false;
        for (let i = 0; i < board.length; i++) {
            if (this.shield.has(i)) continue;
            let enemies = 0;
            // 氷結中の敵コマはスキルダメージを❄1つ肩代わりするだけで壊れないので数えない
            for (const idx of geo.stompRange(i)) if (this.isEnemy(board[idx].player) && !isFrozen(board[idx])) enemies++;
            const emptyCenter = !board[i].player;
            if (enemies > bestEnemies || (enemies === bestEnemies && emptyCenter && !bestEmptyCenter)) {
                bestEnemies = enemies; bestIdx = i; bestEmptyCenter = emptyCenter;
            }
        }
        return bestEnemies >= 1 ? bestIdx : null;
    }

    /** ストンプ後の盤面を返す (Game.tsx exeStomp と同じ挙動) */
    simulateStomp(board: SquareInfo[], i: number, player: Player, life: number): SquareInfo[] {
        const nb = board.map(sq => ({ ...sq, effects: [...sq.effects] }));
        for (const idx of geometryForCells(board.length).stompRange(i)) {
            if (nb[idx].player === player) { nb[idx] = applyDamage(nb[idx], 5, 'skill').sq; continue; }
            const guard = absorbDestroy(nb[idx]);
            if (guard.blocked) { nb[idx] = guard.sq; continue; } // 氷結は❄1つが身代わりになる
            nb[idx] = { player: undefined, bind: 0, effects: [] };
        }
        if (nb[i].player === undefined && !emptyBlocked(nb[i])) nb[i] = { player, bind: life, effects: [] };
        return nb;
    }

    /** 魔法使い審判の日: 十字範囲で (敵破壊 - 自軍破壊) 最大の中心 (純増2以上で価値あり) */
    findJudgeTarget(board: SquareInfo[]): number | null {
        const geo = geometryForCells(board.length);
        let bestIdx: number | null = null, bestNet = 0;
        for (let i = 0; i < board.length; i++) {
            if (this.shield.has(i)) continue;
            let enemy = 0, mine = 0;
            for (const idx of geo.judgeRange(i)) {
                const sq = board[idx];
                const locked = sq.effects.some(e => e.effect === '🔑');
                const protectedBud = sq.player === this.playerSymbol && sq.effects.some(e => e.effect === '🌱');
                if (locked && protectedBud) continue;
                if (isFrozen(sq)) continue; // 氷結中は❄1つが身代わりになり、敵も自陣も壊れない
                if (this.isEnemy(sq.player)) enemy++;
                else if (sq.player === this.playerSymbol) mine++;
            }
            const net = enemy - mine;
            if (net > bestNet) { bestNet = net; bestIdx = i; }
        }
        return bestNet >= 2 ? bestIdx : null;
    }

    /** ヘイルメアリー用: 範囲破壊(ストンプ/審判の日)後に敵の脅威マスが最も減る中心。同点なら壊せる敵が多い方 */
    findRescueCenter(board: SquareInfo[], kind: 'stomp' | 'judge'): number | null {
        const geo = geometryForCells(board.length);
        const me = this.playerSymbol;
        let bestIdx: number | null = null, bestThreats = Infinity, bestKilled = -1;
        for (let i = 0; i < board.length; i++) {
            if (this.shield.has(i)) continue;
            const nb = board.map((sq) => ({ ...sq, effects: sq.effects.slice() }));
            let killed = 0;
            for (const idx of kind === 'stomp' ? geo.stompRange(i) : geo.judgeRange(i)) {
                const sq = nb[idx];
                if (kind === 'stomp' && sq.player === me) { nb[idx] = applyDamage(sq, 5, 'skill').sq; continue; }
                if (kind === 'judge' && sq.player === me && sq.effects.some(e => e.effect === '🔑') && sq.effects.some(e => e.effect === '🌱')) continue;
                const guard = absorbDestroy(sq);
                if (guard.blocked) { nb[idx] = guard.sq; continue; } // 氷結は❄1つが身代わりになる
                if (this.isEnemy(sq.player)) killed++;
                nb[idx] = { player: undefined, bind: 0, effects: [] };
            }
            if (!nb[i].player) nb[i] = { player: me, bind: kind === 'stomp' ? 1 : 2, effects: [] };
            const threats = new Set(this.opponents.flatMap((o) => this.findThreatSquares(nb, o))).size;
            if (threats < bestThreats || (threats === bestThreats && killed > bestKilled)) { bestThreats = threats; bestKilled = killed; bestIdx = i; }
        }
        this.lastRescueThreats = bestThreats;
        return bestIdx;
    }

    /** ヘイルメアリーで当選したスキルに対する、AIの対象クリックと着手 (target=null ならクリック不要) */
    planHailMary(board: SquareInfo[], skillName: string, life: number): { target: number | null; move: number | null } {
        this.updateShield(board);
        const me = this.playerSymbol;
        const geo = geometryForCells(board.length);
        switch (skillName) {
            case 'ストンプ': {
                const target = this.findRescueCenter(board, 'stomp');
                if (target === null) return { target: null, move: this.getBestMove(board, life) };
                return { target, move: this.getBestMove(this.simulateStomp(board, target, me, life), life) };
            }
            case '審判の日':
                // 審判の日は対象クリックの着手で手番が終わる
                return { target: this.findRescueCenter(board, 'judge'), move: null };
            case 'ミアズマ': {
                let best = board.findIndex((sq) => sq.player === me), bestN = -1;
                board.forEach((sq, i) => {
                    if (sq.player !== me) return;
                    const n = geo.surroundRange(i).filter((j) => this.isEnemy(board[j].player)).length;
                    if (n > bestN) { bestN = n; best = i; }
                });
                return { target: best >= 0 ? best : 0, move: this.getBestMove(board, life) };
            }
            case '帯電拡散': {
                const start = this.bestChargeSpreadTarget(board) ?? board.findIndex((sq) => sq.player);
                return { target: start >= 0 ? start : 0, move: this.getBestMove(board, life) };
            }
            default:
                return { target: null, move: this.getBestMove(board, life) };
        }
    }


    /**
     * 百鬼夜行→式神一括の実コストの計画 (sim/ai.js comboPlan)。特売(53)が手札にあれば、各スキルの前に特売を重ね撃ちして安くする
     * （特売は1魔力で次のスキルを-3、何回でも撃てる。下限1）
     */
    comboPlan(costs: Record<keyof SkillCosts, number>, availableSkills: number[], assumeMd: boolean = false): { floodCasts: number; allCasts: number; total: number } {
        const md = assumeMd || availableSkills.includes(53) ? this.calculateAICost(costs.onClickMarkdown, false, false, 'onClickMarkdown') : Infinity;
        const best = (base: number): { m: number; total: number } => {
            let bm = 0, bt = base;
            for (let m = 1; m <= 4 && md !== Infinity; m++) {
                const t = m * md + Math.max(1, base - 3 * m);
                if (t < bt) { bt = t; bm = m; }
            }
            return { m: bm, total: bt };
        };
        const f = best(this.calculateAICost(costs.onClickShikigamiFlood, false, false, 'onClickShikigamiFlood'));
        const a = best(this.calculateAICost(costs.onClickShikigamiAll, false, false, 'onClickShikigamiAll'));
        return { floodCasts: f.m, allCasts: a.m, total: f.total + a.total };
    }

    /** 百鬼夜行→式神一括で（手札と魔力に関わらず）自分が勝つ盤面か (sim/ai.js floodComboWins) */
    floodComboWins(board: SquareInfo[]): boolean {
        const me = this.playerSymbol;
        const nb = board.map((sq) => (!sq.player && !emptyBlocked(sq) ? { player: me, bind: 0, effects: [] }
            : (sq.player === me && isShikigami(sq) ? { ...sq, effects: sq.effects.filter((e) => e.effect !== '📜') } : sq))) as SquareInfo[];
        return calculateWinner(lineSymbols(nb)) === me;
    }

    /** 爆破の価値 (sim/ai.js blastValue): 周囲8マスの敵陣（4ダメージで壊れるコマは3、それ以外は1）と、式神になる空きマス（0.5） */
    private blastValue(board: SquareInfo[], i: number): number {
        const geo = geometryForCells(board.length);
        let v = 0;
        for (const j of geo.surroundRange(i)) {
            const sq = board[j];
            if (!sq.player) { if (!emptyBlocked(sq)) v += 0.5; continue; }
            if (sq.player === this.playerSymbol || isGuarded(sq, this.characters)) continue;
            if (isFrozen(sq)) { v += 0.2; continue; }
            v += sq.bind <= SHIKIGAMI_BLAST_DAMAGE ? 3 : 1;
        }
        return v;
    }

    private bestShikigamiCell(board: SquareInfo[]): number | null {
        let best: number | null = null, bestV = -1;
        board.forEach((sq, i) => {
            if (sq.player || emptyBlocked(sq) || this.shield.has(i)) return;
            const v = this.blastValue(board, i);
            if (v > bestV) { bestV = v; best = i; }
        });
        return best;
    }

    /** 爆破の盤面反映（Game.tsx exeShikigamiBlast と同じ） */
    private applyShikigamiBlast(board: SquareInfo[], i: number): void {
        const geo = geometryForCells(board.length);
        board[i] = { player: undefined, bind: 0, effects: [] };
        for (const j of geo.surroundRange(i)) {
            const sq = board[j];
            if (!sq.player) { if (!emptyBlocked(sq)) board[j] = { player: this.playerSymbol, bind: SHIKIGAMI_LIFE, effects: [{ effect: '📜' }] }; continue; }
            if (sq.player === this.playerSymbol || isGuarded(sq, this.characters)) continue;
            const hit = applyDamage(sq, SHIKIGAMI_BLAST_DAMAGE, 'skill');
            if (hit.blocked) { board[j] = hit.sq; continue; }
            board[j] = hit.sq.bind < 1 ? { player: undefined, bind: 0, effects: [] } : hit.sq;
        }
    }

    /**
     * 陰陽師の1手番の式神運用 (sim/ai.js shikigamiTurn と同一)。陽で爆破できるなら転化して爆破、陰なら式神を置いて貯める。
     * 式神一括（手札に idx 71）は、通常のコマに戻して列が完成するようにコンボで組む。スキル→対象クリックの列と、それを反映した盤面を返す。何もしないなら null
     */
    planShikigami(board: SquareInfo[], magic: number, costs: Record<keyof SkillCosts, number>, availableSkills: number[]): { clicks: { skill: string; target?: number }[]; board: SquareInfo[]; win: boolean } | null {
        const me = this.playerSymbol;
        const b = board.map((sq) => ({ ...sq, effects: [...sq.effects] }));
        const clicks: { skill: string; target?: number }[] = [];
        let m = magic;
        let mode = this.yinYangMode;
        const savedMode = this.yinYangMode;
        const costOf = (key: 'onClickShikigamiPlace' | 'onClickShikigamiBlast' | 'onClickShikigamiAll' | 'onClickToggleYingYang'): number => {
            this.yinYangMode = mode;
            return this.calculateAICost(costs[key], false, false, key);
        };
        const mine = (): number[] => b.map((sq, i) => (sq.player === me && isShikigami(sq) ? i : -1)).filter((i) => i >= 0);
        try {
            // 百鬼夜行(73)+式神一括(71): 全ての空きマスをライフ0の自コマにして、列が完成するなら一手番で勝つ
            if (availableSkills.includes(73) && availableSkills.includes(71)) {
                this.yinYangMode = mode;
                const combo = this.comboPlan(costs, availableSkills);
                if (m >= combo.total) {
                    const nb: SquareInfo[] = b.map((sq) => (!sq.player && !emptyBlocked(sq) ? { player: me, bind: 0, effects: [] }
                        : (sq.player === me && isShikigami(sq) ? { ...sq, effects: sq.effects.filter((e) => e.effect !== '📜') } : sq)));
                    if (calculateWinner(lineSymbols(nb)) === me) {
                        // 特売(53)を重ね撃ちして、各スキルのコストを下げてから撃つ
                        for (let k = 0; k < combo.floodCasts; k++) clicks.push({ skill: 'onClickMarkdown' });
                        clicks.push({ skill: 'onClickShikigamiFlood' });
                        for (let k = 0; k < combo.allCasts; k++) clicks.push({ skill: 'onClickMarkdown' });
                        clicks.push({ skill: 'onClickShikigamiAll' });
                        return { clicks, board: nb, win: true };
                    }
                }
            }
            // 式神一括コンボ: 同じ列に自コマ+式神(+空き)で4つ揃えられ、置く分+一括の魔力があるなら一手番で完成させる
            if (availableSkills.includes(71)) {
                const placeCost = costOf('onClickShikigamiPlace');
                const allCost = costOf('onClickShikigamiAll');
                const toggleCost = costOf('onClickToggleYingYang');
                let bestLine: { empties: number[]; total: number } | null = null;
                for (const line of geometryForCells(b.length).winLines) {
                    let real = 0, shiki = 0, bad = false;
                    const empties: number[] = [];
                    for (const idx of line) {
                        const sq = b[idx];
                        if (sq.player === me) { if (isShikigami(sq)) shiki++; else real++; }
                        else if (sq.player) bad = true;
                        else if (emptyBlocked(sq) || (sq.effects.some((e) => e.effect === '🔑') && sq.bind > 0) || this.shield.has(idx)) bad = true;
                        else empties.push(idx);
                    }
                    if (bad || real < SH_COMBO_REAL || shiki + empties.length === 0) continue;
                    const total = empties.length * placeCost + allCost + (empties.length > 0 && mode === 'yang' ? toggleCost : 0);
                    if (m < total) continue;
                    if (!bestLine || empties.length < bestLine.empties.length) bestLine = { empties, total };
                }
                if (bestLine) {
                    if (bestLine.empties.length > 0 && mode === 'yang') clicks.push({ skill: 'onClickToggleYingYang' });
                    for (const cell of bestLine.empties) clicks.push({ skill: 'onClickShikigamiPlace', target: cell });
                    clicks.push({ skill: 'onClickShikigamiAll' });
                    return { clicks, board: b, win: true };
                }
            }
            for (let guard = 0; guard < 3; guard++) {
                const own = mine();
                const best = own.map((i) => ({ i, v: this.blastValue(b, i) })).sort((x, y) => y.v - x.v)[0];
                const worth = !!best && best.v >= SH_BLAST_MIN;
                const toggleCost = costOf('onClickToggleYingYang');
                const blastCost = costOf('onClickShikigamiBlast') + (mode === 'ying' ? 1 : 0); // 陰からは転化+陽のコスト+1
                if (worth && m >= blastCost + (mode === 'ying' ? toggleCost : 0)) {
                    if (mode === 'ying') { clicks.push({ skill: 'onClickToggleYingYang' }); m -= toggleCost; mode = 'yang'; }
                    const c = costOf('onClickShikigamiBlast');
                    clicks.push({ skill: 'onClickShikigamiBlast', target: best!.i });
                    m -= c;
                    this.applyShikigamiBlast(b, best!.i);
                    continue;
                }
                if (mode === 'yang' && !worth && own.length === 0) {
                    if (m >= toggleCost) clicks.push({ skill: 'onClickToggleYingYang' }); // 爆破する式神が無いので陰に戻って貯める
                    break;
                }
                if (worth) break; // 爆破できる式神があるなら、魔力を貯めて爆破に備える
                const placeCost = costOf('onClickShikigamiPlace');
                if (mode === 'ying' && own.length < SH_MAX && m >= placeCost + SH_RESERVE) {
                    const cell = this.bestShikigamiCell(b);
                    if (cell === null) break;
                    clicks.push({ skill: 'onClickShikigamiPlace', target: cell });
                    m -= placeCost;
                    b[cell] = { player: me, bind: SHIKIGAMI_LIFE, effects: [{ effect: '📜' }] };
                    continue;
                }
                break;
            }
        } finally {
            this.yinYangMode = savedMode;
        }
        return clicks.length > 0 ? { clicks, board: b, win: false } : null;
    }

    /** メインエントリポイント: スキル選択 + 最善手を返す */
    makeMove(
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
        necroPay: number = necroCost
    ): AIResult {
        this.necroActive = necroRemain > 0;
        this.updateShield(board);

        // 魔法使い: 撃てるスキルが無いとき、軽減札を撃ってから1コストで手札を引き直して探す（sim/ai.js の discountPlan>=2 と同方針。
        // A/B: 環境勝率 +1.7pt(seed2/200, seed3/400, seed4/400 で一致)）。手札が変わってから計画し直すので、Game 側が再度 makeMove を呼ぶ
        // 71と73が揃っていて特売(53)だけ無いときは、53を探して引き直す（1枠で約10%/回）より、チャージで特売なしの実コスト(13)を目指す（sim/ai.js の noDig53=8）
        const waitFor13 = availableSkills.includes(71) && availableSkills.includes(73) && !availableSkills.includes(53)
            && magic >= NO_DIG_53_MIN && magic < this.comboPlan(costs, availableSkills).total;
        // 陰陽師: 勝てる盤面で、魔力がコンボ分（特売が引ける前提）+引き直し分あるなら、1コストで手札を引き直してコンボ札(71/73/53)を探す
        // （sim/ai.js の shuffleDig。コンボの発動率 53→75%、環境勝率 +8pt）
        if (this.character === 'yinYangMaster' && this.rerollsLeft > 0 && !waitFor13) {
            const complete = availableSkills.includes(71) && availableSkills.includes(73)
                && (availableSkills.includes(53) || magic >= this.comboPlan(costs, availableSkills).total);
            if (!complete && this.floodComboWins(board) && magic >= this.comboPlan(costs, availableSkills, true).total + costs.onClickShuffle) {
                return { move: null, skills: [], reroll: {} };
            }
        }
        // 陰陽師: 勝てる盤面（敵コマの入っていない列がある）で相手のリーチも無く、探索に足りない魔力のうちは、駒を置かずチャージで魔力を貯める
        // （sim/ai.js の chargeWait=1。コンボ発動率 75→80%、環境勝率 +6pt）
        if (this.character === 'yinYangMaster' && this.opponents.every((o) => this.countReaches(board, o) === 0)
            && this.floodComboWins(board) && (magic < this.comboPlan(costs, availableSkills, true).total + costs.onClickShuffle || waitFor13)) {
            return { move: null, skills: ['onClickCharge'] };
        }
        if (this.rerollsLeft > 0 && this.character !== 'magician' && this.character !== 'yinYangMaster' && magic >= SURPLUS_MAGIC) {
            const plan = this.chooseSkills(board, magic, costs, opponentMagic, life, availableSkills, tokenUsed, necroRemain, necroCost, assaultCost, proliferateActive, seatMagic, necroPay);
            if (plan.length === 0) return { move: null, skills: [], reroll: {} };
        }
        if (this.character === 'magician' && this.rerollsLeft > 0) {
            const rr = this.planReroll(board, magic, costs, opponentMagic, life, availableSkills, tokenUsed, necroRemain, necroCost, assaultCost, proliferateActive, seatMagic, necroPay);
            if (rr) return { move: null, skills: [], reroll: rr };
        }

        // 自分のリーチの4つ目が氷結中の空きマスで塞がれているとき、火遁（onClickIgnite）で隣のコマを燃やして解凍し、同じ手番で完成させる
        // （sim/ai.js の unblock=2 と同一。A/B: 氷室の番人相手に全キャラ平均 +3.2pt、魔法使い +10.3±5.5(n=600)、氷室の番人でない相手では差 0.0）
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

        // 陰陽師: コンボ札（71/73）のどちらかを持っていて魔力が足りないうちは、他のスキルに魔力を使わず貯める（sim/ai.js の floodHold=2）
        const holdFlood = this.character === 'yinYangMaster' && (availableSkills.includes(71) || availableSkills.includes(73))
            && magic < this.comboPlan(costs, availableSkills).total;
        // 陰陽師: 式神の設置・転化・爆破（sim/ai.js の shikigamiTurn）
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

        // マルチリーチ防御: 脅威数に応じてロック種別を選択
        const threatSquares = Array.from(new Set(this.opponents.flatMap((o) => this.findThreatSquares(board, o))));
        // 巨人: 相手にリーチがあるとき、ストンプ(コスト2・着手も兼ねる)で脅威が減るならロックより先に撃つ
        // （sim/ai.js の stompDef=1 と同一。A/B: 環境勝率 12.4→19.8% seed1/100、stompMin=1 と併せて 14.6→26.2% seed2/200）
        if (this.character === 'giant' && threatSquares.length >= 1 && magic >= this.calculateAICost(costs.onClickStomp, false, false, 'onClickStomp')) {
            const rescue = this.findRescueCenter(board, 'stomp');
            if (rescue !== null && this.lastRescueThreats < threatSquares.length) {
                const postBoard = this.simulateStomp(board, rescue, this.playerSymbol, life);
                const followup = this.getBestMove(postBoard, life);
                return { move: followup, skills: ['onClickStomp'], stompTarget: rescue };
            }
        }

        // 氷室の番人: ロックが氷結に置き換わっている。単独の脅威は氷結で塞げば着手を使わずに済み、その手番を攻めに使える
        // （sim/ai.js と同一。A/B: 氷室の番人の勝率 +11.7pt vs あなた(n=400)、全キャラ相手でほぼ向上）
        // 氷室の番人: 脅威が無いとき、魔法使いの🌱付きでロックされていないコマを凍らせる。氷結中の🌱は休眠して魔力を生まず、魔法使いの魔力エンジンが止まる
        // （sim/ai.js F.freezeBuds と同一。A/B: 対魔法使い 25→68%、環境勝率 seed2/200 で +4.4pt。魔法使い以外のコマは凍らせない: 毒使い相手では 64→31% に悪化）
        // 氷室の番人: 毒で倒れそうな（毒≥ライフ-2）自陣コマを先に凍らせる。氷結中のマスの毒は継続ダメージを与えない
        // （sim/ai.js F.antiPoison=1, antiPoisonMargin=2 と同一。A/B: 対毒使い 勝ち86→112/200試合、環境勝率 seed2/200 で +1.5pt）
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

        // 対策ロック: 敵にネクロ/毒使い/陰陽師がいるときは、失いそうな低bindの自コマを事前にロックして守る (sim/ai.js と同一)。
        // A/B: 対ネクロ 0.45→0.62、対陰陽師 +4.5〜+13pt、対毒使い 平均+4.8pt。軍師・毒使いはロックの追加コストで悪化、ネクロ同士は未検証のため対象外
        if (
            this.character !== 'tactician' &&
            this.character !== 'poisoner' &&
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

        // 鬼門封じ: 敵のラインの要（3つ揃いなど）のコマを破壊して、その空きマスを3ターンロックする。自分に勝ち手があるときは温存 (sim/ai.js と同一)
        if (
            availableSkills.includes(74) &&
            magic >= this.calculateAICost(costs.onClickKimon, false, false, 'onClickKimon') &&
            this.countReaches(board, this.playerSymbol) === 0
        ) {
            const target = this.findKimonTarget(board, 50);
            if (target !== null) {
                const postBoard = board.map((sq, i) => (i === target ? { player: undefined, bind: 3, effects: [{ effect: '🔑' as const }] } : sq));
                return { move: this.getBestMove(postBoard, life), skills: ['onClickKimon'], stompTarget: target };
            }
        }

        // 毒使い ミアズマ: 自陣の毒マスの周囲の敵に毒を撒く（対象選択なし。手番は進まないので通常着手へ続ける）(sim/ai.js と同一)
        if (this.character === 'poisoner') {
            const miasmaCost = Math.max(MIASMA_MIN_COST, this.calculateAICost(costs.onClickMiasma - this.ownPoisonCount(board), false, true));
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

        // 雷霆の巫: 帯電拡散→範囲帯電→帯電付与は対象マスをクリックする2段階スキル。手番は進まないので、
        // 撃った後の盤面・魔力で通常のスキル選択と着手へ続ける（相手にリーチがあるときは撃たない）。
        // ジャマーは相手にリーチがあっても撃つ（要の駒をライフ0にして、同じ手番で奪って崩す）
        const chargeClicks: { skill: string; target?: number }[] = [];
        const chargeCost = (base: number) => reducedChargeCost(base, board, (c) => this.calculateAICost(c));
        if (this.character === 'electrician' && this.opponents.every((o) => this.countReaches(board, o) === 0)) {
            const spreadCost = chargeCost(costs.onClickChargeSpread);
            if (magic >= spreadCost) {
                const start = this.bestChargeSpreadTarget(board);
                if (start !== null) {
                    chargeClicks.push({ skill: 'onClickChargeSpread', target: start });
                    board = withCharge(board, connectedPieces(board, start, this.sizeOf(board)));
                    magic -= spreadCost;
                    this.updateShield(board);
                }
            }
            if (availableSkills.includes(24) && magic >= this.calculateAICost(costs.onClickChargeArea, false, false, 'onClickChargeArea')) {
                const center = this.bestChargeAreaTarget(board);
                if (center !== null) {
                    chargeClicks.push({ skill: 'onClickChargeArea', target: center });
                    board = withCharge(board, geometryForCells(board.length).stompRange(center));
                    magic -= this.calculateAICost(costs.onClickChargeArea, false, false, 'onClickChargeArea');
                    this.updateShield(board);
                }
            }
            const oneCost = chargeCost(costs.onClickChargeOne);
            if (availableSkills.includes(22) && magic >= oneCost) {
                const target = this.bestChargeOneTarget(board);
                if (target !== null) {
                    chargeClicks.push({ skill: 'onClickChargeOne', target });
                    board = withCharge(board, [target]);
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
                if (cands.length >= 3 && ownBuds() < 3) {
                    chargeClicks.push({ skill: 'onClickWindborne' });
                    // 実際の配置はランダム。AIの内部盤面は代表として先頭3マスに足して見積もる
                    board = board.slice();
                    sow(board, cands.slice(0, 3));
                    magic -= this.calculateAICost(costs.onClickWindborne, false, false, 'onClickWindborne');
                }
            }
        }
        if (this.character === 'pyromancer') {
            const targets = infernoTargets(board, this.playerSymbol, this.characters);
            const worth = targets.length > 0 && this.shouldInferno(board);
            // 業火は前回の業火から3回スキルを使うと無料。クリック不要の軽いスキルを足りない回数だけ先に撃ち、
            // その合計が業火の通常コスト以下なら連打してから無料で撃つ（sim/ai.js の pyroChain と同方針）
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
                        if (f.idx === 36) sow(board, sowCandidates(board, this.playerSymbol).slice(0, 3));
                        else if (f.idx === 32) cleanse(board, this.playerSymbol);
                        else if (f.idx === 33) magic += harvestBuds(board, this.playerSymbol, this.budGuard);
                        magic -= f.cost;
                    }
                }
            }
            // 軽減札で業火が安くなる/撃てるようになるなら先に撃つ（sim/ai.js の discountInferno と同方針）。
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
            // ネクロマンサーが相手のときは撃たない（コマが壊れるたび墓地が増え、蘇生の資源になる）。sim/ai.js の igniteSig=1 / igniteSkip=1
            const igniteCost = this.calculateAICost(costs.onClickIgnite, false, false, 'onClickIgnite');
            const necroFoe = this.characters.some((c, seat) => seat !== seatOf(this.playerSymbol) && c === 'necromancer');
            // 業火が今撃てるなら、火遁で魔力を使って業火を撃てなくしない
            const blocksInferno = worth && magic >= infernoNow() && magic - igniteCost < infernoNow();
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

        let chargeResult: { skill: string; target?: number }[] | undefined = chargeClicks.length > 0 ? chargeClicks : undefined;

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
            if (this.character === 'magician' && magic >= judgeCost) {
                const target = this.findJudgeTarget(board);
                if (target !== null) {
                    // 審判の日はそのターゲット着手で手番終了する
                    return { move: target, skills: ['onClickJudgeDay'] };
                }
            }
            // 魔法使い: 審判を撃たないなら、未ロックのバッズ駒を🔑ロックして魔力エンジンを守る
            // 1手番に複数のバッズ駒をロックしてよい（魔力が許す限り最大 MAGICIAN_MAX_LOCKS 個。sim/ai.js の magLockN。
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
        // ロック中は敵も置けないので敵の列を止める効果もある（sim/ai.js の EL_AI と同一。tune-top 鍛冶師: 空蔵+収穫で環境勝率 +11.7pt）
        if (
            this.hasEmptyLock &&
            this.countReaches(board, this.playerSymbol) === 0 &&
            magic >= this.calculateAICost(costs.onClickUseLock, false, false, 'onClickUseLock') &&
            this.myEmptyLocks(board) < EMPTY_LOCK_MAX
        ) {
            const target = this.bestEmptyLockTarget(board);
            if (target !== null) {
                const post = board.map((sq) => ({ ...sq, effects: [...sq.effects] }));
                post[target] = { ...post[target], bind: Math.max(post[target].bind, 1), effects: [...post[target].effects, { effect: '🔑', value: seatOf(this.playerSymbol) + 1 }] };
                const followup = this.getBestMove(post, life);
                if (followup !== null) return { move: followup, skills: ['onClickUseLock'], lockTargets: [target] };
            }
        }

        // 軽減札を先に撃つと、この手番に撃てるスキルが増える/魔力が余るなら撃つ（sim/ai.js の discountPlan と同方針。
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
}

export default AIPlayer;
