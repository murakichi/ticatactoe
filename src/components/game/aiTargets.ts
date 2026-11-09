// AIPlayer のメソッド群: スキルの狙いマス（ロック・着火・帯電・氷結・毒・式神などの最良のマスを選ぶ）
// メソッド本体は AIPlayer.ts から移しただけ（this は AIPlayer）。AIPlayer.ts がインターフェース統合とプロトタイプへの合成で戻す
import type AIPlayer from './AIPlayer';
import { Player, seatOf } from '../../types/Player';
import { SquareInfo } from '../../types/SquareInfo';
import { isObject, isShikigami } from '../../util';
import { SkillCosts } from './skillCosts';
import { geometryForCells } from './boardGeometry';
import { tinderTargets, canFreeze, budStacks, ignite, isFrozen, emptyBlocked, applyDamage, absorbDestroy, frozenStacks, isDormant, SHATTER_DAMAGE_PER_STACK } from './thermal';
import { miasmaPlan as miasmaPlanOf, pandemicTargets } from './poison';
import { stomp as stompOf, judgeDay as judgeDayOf, judgeDayVictims } from './blast';
import { SHIKIGAMI_BLAST_DAMAGE, blast as shikigamiBlast, shikigamiLandable } from './shikigami';
import { chargeStacks, orthoNeighbors, connectedPieces, isGuarded } from './charge';
import { BLOOM_MAX_OWN_POISON, BLOOM_MIN_BIND, CHARGE_AREA_MIN_SCORE, CHARGE_ONE_MIN_SCORE, CLOUD_MIN_FOES, EMPTY_LOCK_DENY, EMPTY_LOCK_MIN_VALUE, IGNITE_BUD_WEIGHT, JAMMER_MIN_DMG, KEYSMITH_COMBO_MIN_BIND, KEYSMITH_LOCK_MIN_VALUE, KEYSMITH_OWN_LOCK_MAX_BIND, KEYSMITH_OWN_LOCK_MIN_VALUE, MIASMA_FROZEN_WEIGHT, PANDEMIC_MIN_SCORE, SHATTER_MAX_FREEZES } from './aiConstants';

import { objectLandable } from './objects';

export const targetMethods = {
    /**
     * 大岩（2ターンのロック付きで置く邪魔者。オブジェクトは列に数えない）を置くマス: 敵の勝ち筋を塞ぐ空きマス。
     * 敵のリーチ(敵3つ＋設置できる空き1つ)の空きマスを最優先。無ければ、敵が2つ以上並び自陣のコマが無い列に含まれる空きマスの数が最大のもの。無ければ null
     */
    bestBoulderCell(this: AIPlayer, board: SquareInfo[]): number | null {
        const lines = geometryForCells(board.length).winLines;
        let reach: number | null = null;
        const score = board.map(() => 0);
        for (const line of lines) {
            const foes = line.filter((k) => this.isEnemy(board[k].player) && !board[k].object).length;
            const mine = line.filter((k) => board[k].player === this.playerSymbol).length;
            if (mine > 0) continue;
            const empties = line.filter((k) => objectLandable(board[k]));
            if (foes === 3 && empties.length === 1 && line.every((k) => k === empties[0] || (this.isEnemy(board[k].player) && !board[k].object))) reach = empties[0];
            if (foes >= 2) empties.forEach((k) => { score[k] += foes === 3 ? 10 : foes; });
        }
        if (reach !== null) return reach;
        let best: number | null = null;
        let bestScore = 0;
        score.forEach((v, k) => { if (v > bestScore && objectLandable(board[k])) { bestScore = v; best = k; } });
        return best;
    },

    /** 解錠の碑(136)を置くマス: 周囲八マスの🔑ロック中の敵コマが最も多い、設置できる空きマス（2コ以上。同数なら中央寄り）。無ければ null */
    bestUnlockStoneCell(this: AIPlayer, board: SquareInfo[]): number | null {
        const geo = geometryForCells(board.length);
        let best: number | null = null;
        let bestScore = 1;
        board.forEach((sq, k) => {
            if (!objectLandable(sq)) return;
            const ring = geo.surroundRange(k);
            const locked = ring.filter((j) => (this.isEnemy(board[j].player) || !board[j].player) && !board[j].object && board[j].effects.some((e) => e.effect === '🔑')).length; // 敵のコマと空きマス（鍵師の封鎖で置けなくなったマス）のロック
            const score = locked * 10 + ring.length; // 同数なら周囲が多い(中央寄り)ほうを選ぶ
            if (locked >= 2 && score > bestScore) { bestScore = score; best = k; }
        });
        return best;
    },


    /**
     * 鍵師のコンボ『二列並び → 片方をロック、もう片方に置く』: 敵のコマが無い列に自陣が2つ並び、残り2マスが置ける空きマスのとき、
     * 片方 lock をロックして、もう片方 place に置く。鍵師だけがロックしたマスに置けるので、置いた手番の次に lock へ置いて揃う。敵が止められるのは、
     * 自陣のコマを奪う（ライフ0が必要）か、先に自分が揃えるときだけ。
     * 2つの自陣のコマのライフが KEYSMITH_COMBO_MIN_BIND 以上（ロック中のコマはロックが残る間は奪われないので可）を求める。値は実測で決めた（厳しくするほど悪化した）。
     * 候補が複数あれば、2つの自陣のコマのライフの合計が大きい列。lock は敵の列に入っているマスを優先（そのマスを敵にも使わせない）
     */
    bestLockCombo(this: AIPlayer, board: SquareInfo[], life: number): { lock: number; place: number } | null {
        const geo = geometryForCells(board.length);
        const moves = new Set(this.getValidMoves(board, life));
        let best: { lock: number; place: number } | null = null;
        let bestVal = -1;
        for (const line of geo.winLines) {
            if (line.some((idx) => isShikigami(board[idx]) || isObject(board[idx]))) continue;
            const mine: number[] = [];
            const open: number[] = [];
            let bad = false;
            for (const idx of line) {
                const sq = board[idx];
                if (sq.player === this.playerSymbol) mine.push(idx);
                else if (sq.player) bad = true;
                else if (!emptyBlocked(sq) && !this.shield.has(idx)) open.push(idx);
                else bad = true;
            }
            if (bad || mine.length !== 2 || open.length !== 2) continue;
            if (!open.every((idx) => moves.has(idx) && !board[idx].effects.some((e) => e.effect === '🔑'))) continue;
            // 2つの自陣のコマが奪われない（ロック中か、ライフが減衰2回を越えて残る）
            const safe = mine.every((idx) => board[idx].effects.some((e) => e.effect === '🔑') || board[idx].bind >= KEYSMITH_COMBO_MIN_BIND);
            if (!safe) continue;
            const val = mine.reduce((n, idx) => n + board[idx].bind, 0);
            if (val <= bestVal) continue;
            // 敵の列に入っている回数が多いほうをロックする
            const enemyLines = (cell: number): number =>
                geo.winLines.filter((l) => l.includes(cell) && l.some((idx) => this.isEnemy(board[idx].player))).length;
            const [a, b] = open;
            const lock = enemyLines(a) >= enemyLines(b) ? a : b;
            best = { lock, place: lock === a ? b : a };
            bestVal = val;
        }
        return best;
    },

    /**
     * 鍵師: ロックして守る自陣のコマ。ライフが尽きかけ（KEYSMITH_OWN_LOCK_MAX_BIND 以下）で奪われそうな、自分の列づくりに効いているコマのうち価値が最大のもの。なければ null。
     * 価値は、そのコマを含む『敵のコマが無い列』の自陣の数に応じた得点の合計（列が2つ並んでいれば10、3つなら50）。すでにロック中のコマは重ねない
     */
    bestOwnLockTarget(this: AIPlayer, board: SquareInfo[]): number | null {
        const lineScores = [0, 1, 10, 50, 1000];
        const geo = geometryForCells(board.length);
        let bestIdx: number | null = null;
        let bestVal = KEYSMITH_OWN_LOCK_MIN_VALUE - 1e-9;
        for (let i = 0; i < board.length; i++) {
            const sq = board[i];
            if (sq.player !== this.playerSymbol || isObject(sq) || isShikigami(sq) || isFrozen(sq) || sq.bind > KEYSMITH_OWN_LOCK_MAX_BIND || this.shield.has(i)) continue;
            if (sq.effects.some((e) => e.effect === '🔑')) continue;
            let val = 0;
            for (const line of geo.winLines) {
                if (!line.includes(i)) continue;
                let mine = 0;
                let foreign = 0;
                for (const idx of line) {
                    const p = board[idx].player;
                    if (p === this.playerSymbol) mine++;
                    else if (p) foreign++;
                }
                if (foreign === 0) val += lineScores[Math.min(mine, 4)];
            }
            if (val > bestVal) {
                bestVal = val;
                bestIdx = i;
            }
        }
        return bestIdx;
    },

    /** 空蔵: 自分がかけた空きマスロック（まだ自陣のコマになっていないもの）の数 (旧sim AI myEmptyLocks) */
    myEmptyLocks(this: AIPlayer, board: SquareInfo[]): number {
        // 鍵師のロックは持ち主を記録しない（空蔵ではない）ので、誰が掛けたかを問わず、ロック中の空きマスを数える
        if (this.character === 'keysmith') return board.filter((sq) => !sq.player && !sq.object && sq.effects.some((e) => e.effect === '🔑')).length;
        const owner = seatOf(this.playerSymbol) + 1;
        return board.filter((sq) => !sq.player && sq.effects.some((e) => e.effect === '🔑' && e.owner === owner)).length;
    },

    /** 空蔵: ロックしておく空きマス。自分の列の要になるマス、または敵の列を止められるマスのうち価値が最大のもの。なければ null
     * (旧sim AI bestEmptyLockTarget と同一。EL_MIN_VALUE=10, EL_DENY=2) */
    bestEmptyLockTarget(this: AIPlayer, board: SquareInfo[]): number | null {
        const lineScores = [0, 1, 10, 50, 1000];
        const geo = geometryForCells(board.length);
        let bestIdx: number | null = null;
        let bestVal = (this.character === 'keysmith' ? KEYSMITH_LOCK_MIN_VALUE : EMPTY_LOCK_MIN_VALUE) - 1e-9;
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
    },

    /** 火口(idx 87)の対象: 🌱か🍂か❄を持つ、ライフが残り🔥のない敵コマのうち、ライフ+🌱🍂の数×3+敵の列づくりの大きいもの。なければ null (旧sim AI bestTinderTarget と同一) */
    bestTinderTarget(this: AIPlayer, board: SquareInfo[]): number | null {
        const geo = geometryForCells(board.length);
        const guardedCell = (sq: SquareInfo, i: number) => this.shield.has(i) || sq.effects.some((e) => e.effect === '🔑');
        let best: number | null = null;
        let bestVal = 0;
        for (const i of tinderTargets(board, this.playerSymbol, guardedCell)) {
            const sq = board[i];
            if (sq.bind <= 0 || sq.effects.some((e) => e.effect === '🔥')) continue;
            let build = 0;
            for (const line of geo.winLines) {
                if (!line.includes(i)) continue;
                const foes = line.filter((j) => this.isEnemy(board[j].player)).length;
                const mine = line.filter((j) => board[j].player === this.playerSymbol).length;
                if (mine === 0 && foes >= 2) build += foes;
            }
            // ❄のコマは氷結を解いて攻撃の通る状態に戻す（❄1スタックにつき3）
            const val = sq.bind + (budStacks(sq) + sq.effects.filter((e) => e.effect === '🍂').length + frozenStacks(sq)) * 3 + build * 2;
            if (val > bestVal) {
                bestVal = val;
                best = i;
            }
        }
        return best;
    },

    /** 火遁(鍛冶師の固有)の対象: ライフが残り🔥・❄の無い敵コマのうち、敵の列を作りかけているもの(列の敵コマが2つ以上・自コマなし)とライフが高いものを優先。
     * なければ null (旧sim AI bestIgniteTarget の mode 1 と同一) */
    bestIgniteTarget(this: AIPlayer, board: SquareInfo[]): number | null {
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
            // 魔法使いの🌱は🔥で燃えて消える（🌱1つで魔力+3の稼ぎ頭）。優先して燃やす（旧sim AI の igniteBud=6）
            if (this.characterOf(sq.player) === 'magician') val += IGNITE_BUD_WEIGHT * sq.effects.filter((e) => e.effect === '🌱').length * 3;
            if (val > bestVal) {
                bestVal = val;
                best = i;
            }
        }
        return best;
    },

    /** 沈黙は雷なりで⚡を払うコマ: 自陣の⚡のコマのうち、自陣のリーチ列に入っていないものを優先し、⚡の多いものを選ぶ（無ければ null） */
    boltSilenceTarget(this: AIPlayer, board: SquareInfo[]): number | null {
        const lines = geometryForCells(board.length).winLines;
        const inReach = new Set<number>();
        for (const line of lines) {
            const mine = line.filter((i) => board[i].player === this.playerSymbol);
            if (mine.length >= 3 && line.every((i) => !board[i].player || board[i].player === this.playerSymbol)) mine.forEach((i) => inReach.add(i));
        }
        let best: number | null = null;
        let bestKey = -Infinity;
        board.forEach((sq, i) => {
            if (sq.player !== this.playerSymbol || isDormant(sq)) return;
            const n = chargeStacks(sq);
            if (n === 0) return;
            const key = (inReach.has(i) ? 0 : 100) + n;
            if (key > bestKey) { best = i; bestKey = key; }
        });
        return best;
    },

    /** 大木を置くマス: 敵の列（敵のコマがあり自陣のコマが無い列）を潰せて、自陣の列（自陣のコマがあり敵のコマが無い列）を潰さないマス。置ける空きマスが無ければ null */
    bestTreeCell(this: AIPlayer, board: SquareInfo[]): number | null {
        const lines = geometryForCells(board.length).winLines;
        let best: number | null = null;
        let bestScore = -Infinity;
        board.forEach((sq, i) => {
            if (sq.player || sq.effects.some((e) => e.effect === '🔑') || emptyBlocked(sq)) return;
            let score = 0;
            for (const line of lines) {
                if (!line.includes(i)) continue;
                const mine = line.filter((j) => board[j].player === this.playerSymbol).length;
                const foes = line.filter((j) => this.isEnemy(board[j].player)).length;
                if (foes > 0 && mine === 0) score += foes * 2; // 敵の列を潰す
                if (mine > 0 && foes === 0) score -= mine * 3; // 自陣の列を潰さない
                if (mine === 0 && foes === 0) score -= 0.5; // 空の列も少し惜しい
            }
            if (score > bestScore) { bestScore = score; best = i; }
        });
        return best;
    },

    /** 雷雲を置くマス: 周囲八マスに敵のコマ（⚡の無敵・🔑でない）が CLOUD_MIN_FOES 個以上あるマスのうち、敵が多く自陣が少ないもの。無ければ null */
    bestCloudCell(this: AIPlayer, board: SquareInfo[]): number | null {
        const geo = geometryForCells(board.length);
        let best: number | null = null;
        let bestScore = -Infinity;
        board.forEach((sq, i) => {
            if (sq.player || sq.effects.some((e) => e.effect === '🔑') || emptyBlocked(sq)) return;
            const around = geo.surroundRange(i);
            const foes = around.filter((j) => this.isEnemy(board[j].player) && !isGuarded(board[j], this.characters) && board[j].bind > 0).length;
            const mine = around.filter((j) => board[j].player === this.playerSymbol).length;
            if (foes < CLOUD_MIN_FOES) return;
            const score = foes * 2 - mine * 0.5;
            if (score > bestScore) { bestScore = score; best = i; }
        });
        return best;
    },

    bestChargeOneTarget(this: AIPlayer, board: SquareInfo[]): number | null {
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
    },

    /** 固有スキル(帯電拡散)の起点。リーチ列を無敵で守れる、または自コマ3つ以上で敵2体以上を巻き込めるとき */
    bestChargeSpreadTarget(this: AIPlayer, board: SquareInfo[]): number | null {
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
    },

    /**
     * 範囲帯電(3x3)の中心。範囲内の(敵コマ数−自コマ数)（ライフ>0のコマのみ）が最大で、CHARGE_AREA_MIN_SCORE 以上なら撃つ
     * (旧sim AI bestChargeAreaTarget と同一)
     */
    bestChargeAreaTarget(this: AIPlayer, board: SquareInfo[]): number | null {
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
    },

    /** 自陣の毒スタック数 */
    ownPoisonCount(this: AIPlayer, board: SquareInfo[]): number {
        let n = 0;
        for (const sq of board) if (sq.player === this.playerSymbol) n += sq.effects.filter((e) => e.effect === '☠').length;
        return n;
    },

    /** ミアズマ: 自陣の毒マスの周囲1マスにいる敵マス（ロック/守りは除く）→ 付与される毒の数（Game・sim と共有の poison.ts） */
    miasmaPlan(this: AIPlayer, board: SquareInfo[]): Map<number, number> {
        return miasmaPlanOf(board, this.playerSymbol, this.characters);
    },

    /** ミアズマを撃つ価値: 毒が効く敵マスの数（氷結中は MIASMA_FROZEN_WEIGHT 倍）+ リーチ列の要のコマ×2 */
    miasmaScore(this: AIPlayer, board: SquareInfo[]): number {
        const plan = this.miasmaPlan(board);
        let effective = 0, critical = 0;
        plan.forEach((_, j) => {
            // 氷結中の敵マスの毒は休眠する（消えはしないが、氷結が解けるまでダメージが出ない）ので半分の価値で数える
            if (isDormant(board[j])) { effective += MIASMA_FROZEN_WEIGHT; return; }
            effective++;
            if (this.inOppReachLine(board, j)) critical++;
        });
        return effective + critical * 2;
    },

    /**
     * 毒花を活かす: 自陣のコマ(敵に隣接・ライフに余裕あり)にインジェクションを打つ対象 (旧sim AI と同一)。なければ null。
     * 毒を盛るとバッズが付き、毒はミアズマで敵に送れる。自陣の毒が多すぎると自コマが消えるので上限を設ける
     */
    findOwnBloomTarget(this: AIPlayer, board: SquareInfo[]): number | null {
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
    },

    /**
     * ジャマーの対象(⚡マス)。縦横隣接の敵コマ(ライフ>0・ロックなし)を⚡のスタック数でライフ0にできる数が2以上、
     * 敵のリーチ列の要をライフ0にできる、または与ダメージ合計が JAMMER_MIN_DMG 以上なら撃つ。他人の無敵マスは選べない (旧sim AI bestJammerTarget と同一)
     */
    /**
     * 砕氷で壊す敵コマ。氷結を重ねて ❄×3 ≥ ライフ にできるもの（重ねる回数は SHATTER_MAX_FREEZES まで）のうち、敵の列づくりに効くもの・ライフの低いものを優先。
     * 🔑ロック・🔥・無敵は凍らせられない。なければ null
     */
    bestShatterTarget(this: AIPlayer, board: SquareInfo[], freezeCost: number): { cell: number; freezes: number } | null {
        const geo = geometryForCells(board.length);
        let best: { cell: number; freezes: number } | null = null;
        let bestVal = -Infinity;
        board.forEach((sq, i) => {
            if (!this.isEnemy(sq.player) || sq.bind <= 0 || this.shield.has(i) || !canFreeze(sq)) return;
            const stacks = frozenStacks(sq);
            const freezes = Math.max(stacks > 0 ? 0 : 1, Math.ceil(sq.bind / 3) - stacks);
            if (freezes > SHATTER_MAX_FREEZES) return;
            let build = 0;
            for (const line of geo.winLines) {
                if (!line.includes(i)) continue;
                const foes = line.filter((j) => board[j].player === sq.player).length;
                const mine = line.filter((j) => board[j].player === this.playerSymbol).length;
                if (mine === 0 && foes >= 2) build += foes;
            }
            const val = build * 3 - freezes * freezeCost;
            if (val > bestVal) { bestVal = val; best = { cell: i, freezes }; }
        });
        return best;
    },

    /** パンデミックの中心: 3×3で毒が付く敵コマが多く(自陣の巻き込みは1つ1点減点)、合計が PANDEMIC_MIN_SCORE 以上のマス */
    bestPandemicTarget(this: AIPlayer, board: SquareInfo[]): number | null {
        let best: number | null = null;
        let bestScore = PANDEMIC_MIN_SCORE - 1;
        for (let i = 0; i < board.length; i++) {
            // ⚡で無敵のマスは中心に選べない（クリックが無視されて手番が進まなくなる）
            if (this.shield.has(i)) continue;
            let score = 0;
            for (const j of pandemicTargets(board, i, this.characters)) {
                if (this.isEnemy(board[j].player) && !this.shield.has(j)) score++;
                else if (board[j].player === this.playerSymbol) score--;
            }
            if (score > bestScore) { bestScore = score; best = i; }
        }
        return best;
    },

    bestJammerTarget(this: AIPlayer, board: SquareInfo[]): number | null {
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
    },

    /** 絶対零度を撃つ価値があるか: ライフが残る敵コマが3個以上（全マスに❄が足され、次の手番に3ダメージ。旧sim AI と同方針） */
    shouldGlacier(this: AIPlayer, board: SquareInfo[]): boolean {
        return board.filter((sq) => this.isEnemy(sq.player) && sq.bind > 0 && !sq.effects.some((e) => e.effect === '🔑')).length >= 3;
    },

    /** 業火を撃つ価値があるか: ライフが残る敵コマが3個以上（旧sim AI と同方針） */
    shouldInferno(this: AIPlayer, board: SquareInfo[]): boolean {
        // 業火は敵陣のロックを先に解除して🔥を付けるので、🔑中のコマも数える（ロックで守る魔法使い対策）
        return board.filter((sq) => this.isEnemy(sq.player) && sq.bind > 0).length >= 3;
    },

    /** 陰陽師: 砕氷（❄1つにつき3ダメージ）で壊せる、氷結中の敵コマのうち、壊すと列が空くもの。壊すと百鬼夜行→式神一括が組めるコマを最優先、無ければ敵が並びかけている列に乗るコマ。無ければ null */
    yinShatterTarget(this: AIPlayer, board: SquareInfo[]): number | null {
        const geo = geometryForCells(board.length);
        const comboNow = this.floodComboWins(board);
        let best: number | null = null;
        let bestVal = 0;
        board.forEach((sq, i) => {
            if (!this.isEnemy(sq.player) || isShikigami(sq) || sq.bind <= 0 || this.shield.has(i) || sq.effects.some((e) => e.effect === '🔑')) return;
            const stacks = frozenStacks(sq);
            if (stacks === 0 || stacks * SHATTER_DAMAGE_PER_STACK < sq.bind) return; // 壊し切れない
            const post = board.map((x) => ({ ...x, effects: [...x.effects] }));
            post[i] = { player: undefined, bind: 0, effects: [] };
            let val = 0;
            if (!comboNow && this.floodComboWins(post)) val += 100; // 壊すとコンボが組める
            for (const line of geo.winLines) {
                if (!line.includes(i)) continue;
                const foes = line.filter((j) => board[j].player === sq.player).length;
                if (line.every((j) => board[j].player !== this.playerSymbol)) val += foes; // 自コマの無い列で敵が並ぶ
            }
            if (val > bestVal) { bestVal = val; best = i; }
        });
        return best;
    },

    /** 陰陽師: 火遁で燃やすと、隣の氷結が溶けて百鬼夜行→式神一括の列が完成する盤面になるコマ（敵を優先）。すでに組める盤面や、燃やしても組めない盤面は null */
    comboThawTarget(this: AIPlayer, board: SquareInfo[]): number | null {
        if (this.floodComboWins(board)) return null; // すでに組める
        const size = this.sizeOf(board);
        let own: number | null = null;
        for (let n = 0; n < board.length; n++) {
            const sq = board[n];
            if (!sq.player || isFrozen(sq) || this.shield.has(n) || sq.effects.some((e) => e.effect === '🔑')) continue;
            if (!orthoNeighbors(n, size).some((m) => emptyBlocked(board[m]))) continue; // 溶かせる氷結が隣に無い
            const post = board.map((x) => ({ ...x, effects: [...x.effects] }));
            ignite(post, [n], size, 1);
            if (!this.floodComboWins(post)) continue;
            if (this.isEnemy(sq.player)) return n;
            if (own === null) own = n;
        }
        return own;
    },

    /** 火遁で k の氷結を解く対象: k の縦横隣のコマで氷結・ロック・無敵でないもの（敵を優先、無ければ自陣）。旧sim AI thawIgniteTarget(allowOwn) */
    thawIgniteTarget(this: AIPlayer, board: SquareInfo[], k: number): number | null {
        let own: number | null = null;
        for (const n of orthoNeighbors(k, this.sizeOf(board))) {
            const sq = board[n];
            if (!sq.player || isFrozen(sq) || this.shield.has(n) || sq.effects.some((e) => e.effect === '🔑')) continue;
            if (this.isEnemy(sq.player)) return n;
            if (own === null) own = n;
        }
        return own;
    },

    /** 🍂付きトークンの選択: ダブル(空き4以上)→双子→1枚の順に、払える最初のもの (旧sim AI pickLeafToken と同一) */
    pickLeafToken(this: AIPlayer, availableSkills: number[], freeCells: number, remaining: number, costs: Record<keyof SkillCosts, number>): { skill: string; cost: number } | null {
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
    },

    /**
     * 鬼門封じ: 敵のコマを破壊して3ターンロックする対象。氷結中・🔑ロック・無敵のコマは選ばない。
     * 破壊されたコマの持ち主のラインの価値（そのコマを含む、他の敵の駒が混ざらないライン）が大きいものを選び、minValue 未満なら null (旧sim AI bestKimonTarget と同一)
     */
    findKimonTarget(this: AIPlayer, board: SquareInfo[], minValue: number): number | null {
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
    },

    /**
     * 毒使い インジェクション: 敵コマ1つに毒を1付与。次の着手の減衰(1+毒数)で bind が 0 になれば消える。
     * 消えるまでの手数が少なく、敵のライン価値が高いコマを狙う。なければ null (旧sim AI bestInjectionTarget と同一)
     */
    findInjectionTarget(this: AIPlayer, board: SquareInfo[], minValue: number): { index: number; kills: boolean } | null {
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
    },

    /**
     * 対ネクロ: 吸収されそうな低bind(<=3)の未ロック自コマのうち、通っている自ラインの価値が最大のもの。
     * なければ null (旧sim AI bestAntiNecroLockTarget と同一)
     */
    findAntiNecroLockTarget(this: AIPlayer, board: SquareInfo[]): number | null {
        const lineScores = [0, 1, 10, 50, 1000];
        const geo = geometryForCells(board.length);
        let best: number | null = null;
        let bestVal = 0;
        for (let i = 0; i < board.length; i++) {
            const sq = board[i];
            // ⚡で無敵の自コマは誰も触れず、ロックの対象にもできない(クリックが空振りしてロックの選択待ちで止まる)
            // 氷結中のコマは上書きされない（氷室の番人ではロック=氷結。ライフが上がらないので、凍らせた同じコマを毎手番選び続けて氷結を重ね、盤面が止まっていた）
            if (sq.player !== this.playerSymbol || sq.bind > 3 || this.shield.has(i) || isFrozen(sq) || sq.effects.some((e) => e.effect === '🔑')) continue;
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
    },

    /** 巨人ストンプ: 破壊範囲に敵が最多の中心 (敵1体以上で価値あり。コスト2なので積極的に撃つ)。なければ null */
    findStompTarget(this: AIPlayer, board: SquareInfo[]): number | null {
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
    },

    /** ストンプ後の盤面を返す (Game.tsx exeStomp と同じ挙動) */
    simulateStomp(this: AIPlayer, board: SquareInfo[], i: number, player: Player, life: number): SquareInfo[] {
        const nb = board.map(sq => ({ ...sq, effects: [...sq.effects] }));
        stompOf(nb, i, player, life);
        return nb;
    },

    /** 魔法使い審判の日: 十字範囲で (敵破壊 - 自軍破壊) 最大の中心 (純増2以上で価値あり) */
    findJudgeTarget(this: AIPlayer, board: SquareInfo[]): number | null {
        let bestIdx: number | null = null, bestNet = 0;
        for (let i = 0; i < board.length; i++) {
            if (this.shield.has(i)) continue;
            const victims = judgeDayVictims(board, i, this.playerSymbol); // blast.ts の judgeDay と同じ処理で壊れるコマを数える
            const enemy = victims.filter((v) => this.isEnemy(v.owner)).length;
            const mine = victims.length - enemy;
            const net = enemy - mine;
            if (net > bestNet) { bestNet = net; bestIdx = i; }
        }
        // 軍師は駒を並べ直して取り返すので、純増2では割に合わない（対軍師 20〜22→27〜31%, 純増3）
        const minNet = this.opponents.some((o) => this.characterOf(o) === 'tactician') ? 3 : 2;
        return bestNet >= minNet ? bestIdx : null;
    },

    /** 魔法使い: 相手にリーチがあるとき、敵の3つ揃いの列を全て崩せる審判の日の中心（純増1以上）。なければ null。sim/ai.js の judgeBreakingReach（judgeUnderThreat） */
    findJudgeBreakingReach(this: AIPlayer, board: SquareInfo[]): number | null {
        const geo = geometryForCells(board.length);
        const me = this.playerSymbol;
        const reachLines: number[][] = [];
        for (const line of geo.winLines) {
            let owner: Player | undefined, op = 0, other = 0, empty = 0, blocked = false;
            for (const idx of line) {
                const pl = board[idx].player;
                if (!pl) { empty++; if (emptyBlocked(board[idx])) blocked = true; continue; }
                if (pl === me) { other++; continue; }
                if (owner === undefined) owner = pl;
                if (pl === owner) op++; else other++;
            }
            if (op === 3 && other === 0 && empty === 1 && !blocked) reachLines.push(line);
        }
        if (reachLines.length === 0) return null;
        let bestIdx: number | null = null, bestNet = 0;
        for (let i = 0; i < board.length; i++) {
            if (this.shield.has(i)) continue;
            const victims = judgeDayVictims(board, i, me);
            const gone = new Set<number>(victims.filter((v) => this.isEnemy(v.owner)).map((v) => v.cell));
            const enemy = gone.size;
            const mine = victims.length - enemy;
            if (!reachLines.every((line) => line.some((idx) => gone.has(idx)))) continue;
            if (enemy - mine > bestNet) { bestNet = enemy - mine; bestIdx = i; }
        }
        return bestNet >= 1 ? bestIdx : null;
    },

    /** ヘイルメアリー用: 範囲破壊(ストンプ/審判の日)後に敵の脅威マスが最も減る中心。同点なら壊せる敵が多い方 */
    findRescueCenter(this: AIPlayer, board: SquareInfo[], kind: 'stomp' | 'judge'): number | null {
        const geo = geometryForCells(board.length);
        const me = this.playerSymbol;
        let bestIdx: number | null = null, bestThreats = Infinity, bestKilled = -1;
        for (let i = 0; i < board.length; i++) {
            if (this.shield.has(i)) continue;
            const nb = board.map((sq) => ({ ...sq, effects: sq.effects.slice() }));
            let killed = 0;
            if (kind === 'judge') {
                killed = judgeDayVictims(board, i, me).filter((v) => this.isEnemy(v.owner)).length;
                judgeDayOf(nb, i, me); // blast.ts の judgeDay と同じ処理
            } else {
                for (const idx of geo.stompRange(i)) {
                    const sq = nb[idx];
                    if (sq.player === me) { nb[idx] = applyDamage(sq, 5, 'skill').sq; continue; }
                    const guard = absorbDestroy(sq);
                    if (guard.blocked) { nb[idx] = guard.sq; continue; } // 氷結は❄1つが身代わりになる
                    if (this.isEnemy(sq.player)) killed++;
                    nb[idx] = { player: undefined, bind: 0, effects: [] };
                }
            }
            if (!nb[i].player) nb[i] = { player: me, bind: kind === 'stomp' ? 1 : 2, effects: [] };
            const threats = new Set(this.opponents.flatMap((o) => this.findThreatSquares(nb, o))).size;
            if (threats < bestThreats || (threats === bestThreats && killed > bestKilled)) { bestThreats = threats; bestKilled = killed; bestIdx = i; }
        }
        this.lastRescueThreats = bestThreats;
        return bestIdx;
    },

    /** 爆破の価値 (旧sim AI blastValue): 周囲8マスの敵陣（4ダメージで壊れるコマは3、それ以外は1）と、式神になる空きマス（0.5） */
    blastValue(this: AIPlayer, board: SquareInfo[], i: number): number {
        const geo = geometryForCells(board.length);
        let v = 0;
        for (const j of geo.surroundRange(i)) {
            const sq = board[j];
            if (!sq.player) { if (shikigamiLandable(sq)) v += 0.5; continue; }
            if (sq.player === this.playerSymbol || isGuarded(sq, this.characters)) continue;
            if (isFrozen(sq)) { v += 0.2; continue; }
            v += sq.bind <= SHIKIGAMI_BLAST_DAMAGE ? 3 : 1;
        }
        return v;
    },

    bestShikigamiCell(this: AIPlayer, board: SquareInfo[]): number | null {
        let best: number | null = null, bestV = -1;
        board.forEach((sq, i) => {
            if (!shikigamiLandable(sq) || this.shield.has(i)) return;
            const v = this.blastValue(board, i);
            if (v > bestV) { bestV = v; best = i; }
        });
        return best;
    },

    /** 爆破の盤面反映（Game.tsx exeShikigamiBlast と同じ） */
    applyShikigamiBlast(this: AIPlayer, board: SquareInfo[], i: number): void {
        shikigamiBlast(board, i, this.playerSymbol, this.characters);
    },
};
export type TargetMethods = typeof targetMethods;
