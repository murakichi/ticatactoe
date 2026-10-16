import { CharacterId } from '../../types/Character';
import { Player, seatOf } from '../../types/Player';
import { SquareInfo } from '../../types/SquareInfo';
import { calculateWinner, findEmptyIndexes } from '../../util';
import { SkillCosts } from './skillCosts';
import { geometryForCells } from './boardGeometry';
import { chargeStacks, orthoNeighbors, connectedPieces, withCharge, reducedChargeCost, applyJammer } from './charge';

// 汎用スキルプールの大きさ (idx 0..26)。Game.tsx の SKILL_POOL_SIZE / sim/engine.js の POOL_SIZE と同値
export const SKILL_POOL_SIZE = 27;

// 帯電付与の採用しきい値 (sim/ai.js の CHARGE_ONE_MIN_SCORE)
const CHARGE_ONE_MIN_SCORE = 2;
// 範囲帯電の採用しきい値 (sim/ai.js の CHARGE_AREA_MIN_SCORE)
const CHARGE_AREA_MIN_SCORE = 2;
// ジャマーを与ダメージ合計だけで撃つ下限 (sim/ai.js の JAM_MIN_DMG)
const JAMMER_MIN_DMG = 2;
// ランダム帯電を撃つときに残しておく魔力の余裕 (sim/ai.js の CHG_RAND_MARGIN)
const CHARGE_RANDOM_MARGIN = 1;

export const TURN_ENDING_SKILLS = ['onClickCharge', 'onClickOpium', 'onClickTsunami'];

export type AIResult = {
    move: number | null;
    skills: string[];
    lockTargets?: number[];
    stompTarget?: number; // 着手前にクリックする対象マス (ストンプ/インジェクション)
    /** 雷霆の巫: 「スキル→対象マスのクリック」を順に行う帯電スキル（帯電拡散→帯電付与の順） */
    chargeClicks?: { skill: string; target: number }[];
};

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

    constructor(
        playerSymbol: Player,
        character: CharacterId,
        opponents: Player[] = [playerSymbol === '💙' ? '⭕' : '💙'],
        characters: readonly CharacterId[] = []
    ) {
        this.playerSymbol = playerSymbol;
        this.character = character;
        this.opponents = opponents;
        this.characters = characters;
    }

    private characterOf(player: Player): CharacterId | undefined {
        return player === this.playerSymbol ? this.character : this.characters[seatOf(player)];
    }

    /** 無敵マス(雷霆の巫の⚡付き自陣)の集合を更新する (sim/ai.js updateShield) */
    updateShield(board: SquareInfo[]): void {
        this.shield = new Set();
        board.forEach((sq, i) => {
            if (sq.player && this.characterOf(sq.player) === 'electrician' && chargeStacks(sq) > 0) this.shield.add(i);
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
            if (chargeStacks(board[k]) === 0) continue;
            for (const n of orthoNeighbors(k, size)) {
                const sq = board[n];
                if (!sq.player || sq.bind <= 0) continue;
                if (sq.effects.some((e) => e.effect === '🔑')) continue;
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
            if (chargeStacks(board[i]) > 0) continue;
            let attack = 0;
            for (const n of orthoNeighbors(i, size)) {
                const sq = board[n];
                if (!sq.player || sq.bind <= 0) continue;
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
                    if (this.isEnemy(board[n].player) && board[n].bind > 0 && !cells.includes(n)) adj.add(n);
                }
            }
            // 範囲内の敵コマ自身も帯電させる(隣接で巻き込める)ので、範囲内の敵(ライフ>0)も数える
            for (const k of cells) if (this.isEnemy(board[k].player) && board[k].bind > 0) adj.add(k);
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
                if (!sq.player || sq.bind <= 0) continue;
                if (this.isEnemy(sq.player)) score++; else score--;
            }
            if (score > bestScore) { bestScore = score; bestIdx = i; }
        }
        return bestScore >= CHARGE_AREA_MIN_SCORE ? bestIdx : null;
    }

    /** 敵駒 i が「どかさないと負ける列」(持ち主が3つ揃い・他のコマなし・残り1マスが空き) に含まれるか (sim/ai.js inOppReachLine) */
    private inOppReachLine(board: SquareInfo[], i: number): boolean {
        const owner = board[i].player;
        for (const line of geometryForCells(board.length).winLines) {
            if (!line.includes(i)) continue;
            let op = 0, other = 0, empty = 0;
            for (const idx of line) {
                if (board[idx].player === owner) op++;
                else if (board[idx].player) other++;
                else empty++;
            }
            if (op === 3 && other === 0 && empty === 1) return true;
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
            if (n === 0 || (this.shield.has(k) && board[k].player !== this.playerSymbol)) continue;
            let zeroed = 0, critical = 0, dmg = 0;
            for (const j of orthoNeighbors(k, size)) {
                const sq = board[j];
                if (!this.isEnemy(sq.player) || sq.bind <= 0 || sq.effects.some((e) => e.effect === '🔑')) continue;
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
            const buds = sq.effects.filter(e => e.effect === '🌱').length;
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
            let my = 0, op = 0;
            for (const idx of line) {
                if (board[idx].player === player) my++;
                else if (board[idx].player) op++;
            }
            if (my === 3 && op === 0) reaches++;
        }
        return reaches;
    }

    /** 相手がリーチしているラインの残り1マス（脅威マス）を列挙 */
    findThreatSquares(board: SquareInfo[], player: Player): number[] {
        const threats: number[] = [];
        for (const line of geometryForCells(board.length).winLines) {
            let pCount = 0, oCount = 0, emptyIdx = -1;
            for (const idx of line) {
                const sq = board[idx];
                if (sq.player === player) pCount++;
                else if (sq.player) oCount++;
                else if (!sq.player && !(sq.effects.some(e => e.effect === '🔑') && sq.bind > 0)) emptyIdx = idx;
            }
            if (pCount === 3 && oCount === 0 && emptyIdx !== -1) {
                if (!threats.includes(emptyIdx)) threats.push(emptyIdx);
            }
        }
        return threats;
    }

    /** 盤面上にコマを置いたシミュレーション (bind=0の乗っ取り対応) */
    simulatePlace(board: SquareInfo[], index: number, player: Player, life: number): SquareInfo[] {
        const newBoard = board.map(sq => ({ ...sq, effects: [...sq.effects] }));
        const sq = newBoard[index];

        if (!sq.player) {
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
                if (!sq.effects.some(e => e.effect === '🔑')) moves.push(i);
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
                if (!sq.effects.some(e => e.effect === '🔑')) moves.push(i);
            } else if (sq.player !== player) {
                if (sq.bind <= 0) moves.push(i);
            }
        }
        return moves;
    }

    /** Minimax + Alpha-Beta 枝刈り (深さ2) */
    minimax(board: SquareInfo[], depth: number, isMax: boolean, alpha: number, beta: number, life: number): number {
        const winner = calculateWinner(board.map(sq => sq.player));
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
            if (calculateWinner(sim.map(sq => sq.player)) === this.playerSymbol) return i;
        }

        // 2. 相手の即勝ちをブロック (空きマス + 乗っ取り可能な自マス)
        for (const opp of this.opponents) {
            const oppMoves = this.getMovesFor(board, opp, life);
            for (const i of oppMoves) {
                const sim = this.simulatePlace(board, i, opp, life);
                if (calculateWinner(sim.map(sq => sq.player)) === opp) {
                    if (allMoves.includes(i)) return i;
                }
            }
        }

        // 3. Minimax評価 + フォーク検出
        let bestScore = -Infinity;
        let bestMove = allMoves[0];

        for (const i of allMoves) {
            const simBoard = this.simulatePlace(board, i, this.playerSymbol, life);
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
        if (this.character === 'giant' || this.character === 'magician' || this.character === 'yinYangMaster') {
            return [];
        }
        let myPieces = 0, oppPieces = 0, empties = 0;
        for (const sq of board) {
            if (sq.player === this.playerSymbol) myPieces++;
            else if (sq.player) oppPieces++;
            else if (!sq.player) empties++;
        }
        const geo = geometryForCells(board.length);
        const enemiesOn = (idxs: number[]) =>
            idxs.filter((i) => this.isEnemy(board[i].player) && !board[i].effects.some((e) => e.effect === '🔑')).length;

        // キャラ専用シナジー: 軍師→トークン系 / 魔法使い→バッズ系
        const tokenIdx = [3, 4, 9, 11];
        const budsIdx = [2, 10];
        const preferred = (idx: number) =>
            (this.character === 'tactician' && tokenIdx.includes(idx)) ||
            (this.character === 'magician' && budsIdx.includes(idx));

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
    calculateAICost(baseCost: number, isToken: boolean = false, isPoison: boolean = false): number {
        if (this.character === 'poisoner') return isPoison ? baseCost - 1 : baseCost + 1;
        if (this.character === 'tactician') return isToken ? baseCost - 1 : baseCost + 2;
        return baseCost;
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
        proliferateActive: boolean = false
    ): string[] {
        const skills: string[] = [];
        let remaining = magic;
        const oppReaches = this.opponents.reduce((n, o) => n + this.countReaches(board, o), 0);
        let myPieces = 0, oppPieces = 0;
        const piecesOf = new Map<Player, number>();
        for (const sq of board) {
            if (sq.player === this.playerSymbol) myPieces++;
            else if (sq.player) piecesOf.set(sq.player, (piecesOf.get(sq.player) ?? 0) + 1);
        }
        // 敵が複数いるときは最大勢力の敵と比べる（2人戦なら従来どおり相手の数）
        piecesOf.forEach((n) => { oppPieces = Math.max(oppPieces, n); });
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
            if (this.character === 'necromancer' && necroRemain === 0 && remaining >= necroCost) {
                const corpses = 10 - necroCost; // baseNecromancyCost=10。軽減量=墓地の死体数=召喚数
                let absorbable = 0;
                for (const sq of board) {
                    if (this.isEnemy(sq.player) && sq.bind >= 1 && sq.bind <= 4 && !sq.effects.some(e => e.effect === '🔑')) absorbable++;
                }
                if (corpses >= 3 || absorbable >= 2) spend(necroCost, 'onClickNecromancy');
            }

            // 陰陽師: 凶荒の舞(相手-2)
            if (this.character === 'yinYangMaster') {
                const yyCost = this.calculateAICost(costs.onClickYingYangSkill);
                if (remaining >= yyCost && (oppPieces > myPieces || myPieces >= 3)) {
                    spend(yyCost, 'onClickYingYangSkill');
                }
            }

            // 軍師: 全軍突撃 (実コストは「9−使用トークン×2」。calculateAICostの+2ペナルティは誤りなので使わない)
            if (this.character === 'tactician') {
                if (remaining >= assaultCost && myPieces >= 2) spend(assaultCost, 'onClickTotalAssault');
            }

            // 増殖: 空きマスが残っていて、維持コストを数ターン払える余裕があるうちに回し始める
            // (発動が遅いほど盤面が埋まりループの旨味が減るため、序盤〜中盤限定)
            if (!proliferateActive && availableSkills.includes(20)) {
                const proliferateCost = this.calculateAICost(costs.onClickProliferate);
                const emptyCount = board.filter((sq) => !sq.player).length;
                if (remaining >= proliferateCost + 1 && emptyCount >= 5) {
                    spend(proliferateCost, 'onClickProliferate');
                }
            }
        }

        // --- ターン終了系は単独で返す ---

        // Opiumはリーチ防御に使わない (bindを下げるだけで空きマスは塞げない)
        // → getBestMoveでブロック配置させる

        // 劣勢時の破壊系 (ターン終了するので、相手リーチ時は使わない→ブロック優先)
        if (skills.length === 0 && isLosing && oppReaches === 0) {
            if (availableSkills.includes(5)) {
                let oppOn = 0, myOn = 0;
                for (const idx of geo.antiDiagonal) {
                    if (this.isEnemy(board[idx].player) && !board[idx].effects.some(e => e.effect === '🔑')) oppOn++;
                    if (board[idx].player === this.playerSymbol && !board[idx].effects.some(e => e.effect === '🔑')) myOn++;
                }
                if (oppOn > myOn) spend(this.calculateAICost(costs.onClickSlash), 'onClickSlash');
            }
            if (skills.length === 0 && availableSkills.includes(6)) {
                let oppOn = 0, myOn = 0;
                for (const idx of geo.mainDiagonal) {
                    if (this.isEnemy(board[idx].player) && !board[idx].effects.some(e => e.effect === '🔑')) oppOn++;
                    if (board[idx].player === this.playerSymbol && !board[idx].effects.some(e => e.effect === '🔑')) myOn++;
                }
                if (oppOn > myOn) spend(this.calculateAICost(costs.onClickBackSlash), 'onClickBackSlash');
            }
            if (skills.length === 0 && availableSkills.includes(7) && opponentMagic >= 6) {
                spend(this.calculateAICost(costs.onClickTsunami), 'onClickTsunami');
            }
        }



        // ターン終了スキルが選ばれていたらここで返す
        if (skills.some(s => TURN_ENDING_SKILLS.includes(s))) return skills;

        // --- 準備スキル (配置前に追加) ---

        // ライフが低い時: AddLife で +3
        if (life <= 2 && availableSkills.includes(0)) {
            spend(this.calculateAICost(costs.onClickAddLife), 'onClickAddLife');
        }

        // バッズ: コスト4で毎ターン+1マジック → 4ターン以上残りそうなら元が取れる
        if (availableSkills.includes(2)) {
            const budsCost = this.calculateAICost(costs.onClickBuds);
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
            const doomed = board.filter(sq => sq.player === this.playerSymbol
                && sq.effects.filter(e => e.effect === '☠').length >= Math.max(1, sq.bind)
                && sq.effects.some(e => e.effect === '☠')).length;
            if (doomed >= 1) spend(this.calculateAICost(costs.onClickSerum, false, true), 'onClickSerum');
        }

        // --- トークン系 ---
        if (!tokenUsed) {
            if (this.character === 'electrician' && availableSkills.includes(23) && remaining >= this.calculateAICost(costs.onClickDoubleChargeToken, true)) {
                spend(this.calculateAICost(costs.onClickDoubleChargeToken, true), 'onClickDoubleChargeToken');
            } else if (this.character === 'electrician' && availableSkills.includes(21) && remaining >= this.calculateAICost(costs.onClickChargeToken, true)) {
                spend(this.calculateAICost(costs.onClickChargeToken, true), 'onClickChargeToken');
            } else if (this.character === 'tactician') {
                if (availableSkills.includes(11) && remaining >= this.calculateAICost(costs.onClickDoubleToken, true)) {
                    spend(this.calculateAICost(costs.onClickDoubleToken, true), 'onClickDoubleToken');
                } else if (availableSkills.includes(9) && remaining >= this.calculateAICost(costs.onClickBudsToken, true)) {
                    spend(this.calculateAICost(costs.onClickBudsToken, true), 'onClickBudsToken');
                } else if (availableSkills.includes(3) && remaining >= this.calculateAICost(costs.onClickToken, true)) {
                    spend(this.calculateAICost(costs.onClickToken, true), 'onClickToken');
                }
            } else {
                if (availableSkills.includes(11) && remaining >= this.calculateAICost(costs.onClickDoubleToken, true)) {
                    spend(this.calculateAICost(costs.onClickDoubleToken, true), 'onClickDoubleToken');
                } else if (availableSkills.includes(9) && remaining >= this.calculateAICost(costs.onClickBudsToken, true)) {
                    spend(this.calculateAICost(costs.onClickBudsToken, true), 'onClickBudsToken');
                } else if (availableSkills.includes(3) && remaining >= this.calculateAICost(costs.onClickToken, true)) {
                    spend(this.calculateAICost(costs.onClickToken, true), 'onClickToken');
                }
            }
        }

        // 雷霆の巫: 他に撃つものが無く、魔力に余裕があるときだけランダム帯電（コスト+1 以上残る）
        if (this.character === 'electrician' && skills.length === 0 && availableSkills.includes(25)) {
            const rc = this.calculateAICost(costs.onClickChargeRandom);
            if (remaining >= rc + CHARGE_RANDOM_MARGIN) spend(rc, 'onClickChargeRandom');
        }

        return skills;
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
            if (sq.player !== this.playerSymbol || sq.bind > 3 || sq.effects.some((e) => e.effect === '🔑')) continue;
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

    /** 巨人ストンプ: 破壊範囲に敵が最多の中心 (敵2体以上で価値あり)。なければ null */
    findStompTarget(board: SquareInfo[]): number | null {
        const geo = geometryForCells(board.length);
        let bestIdx: number | null = null, bestEnemies = 0, bestEmptyCenter = false;
        for (let i = 0; i < board.length; i++) {
            if (this.shield.has(i)) continue;
            let enemies = 0;
            for (const idx of geo.stompRange(i)) if (this.isEnemy(board[idx].player)) enemies++;
            const emptyCenter = !board[i].player;
            if (enemies > bestEnemies || (enemies === bestEnemies && emptyCenter && !bestEmptyCenter)) {
                bestEnemies = enemies; bestIdx = i; bestEmptyCenter = emptyCenter;
            }
        }
        return bestEnemies >= 2 ? bestIdx : null;
    }

    /** ストンプ後の盤面を返す (Game.tsx exeStomp と同じ挙動) */
    simulateStomp(board: SquareInfo[], i: number, player: Player, life: number): SquareInfo[] {
        const nb = board.map(sq => ({ ...sq, effects: [...sq.effects] }));
        for (const idx of geometryForCells(board.length).stompRange(i)) {
            if (nb[idx].player === player) nb[idx].bind = nb[idx].bind > 5 ? nb[idx].bind - 5 : 0;
            else nb[idx] = { player: undefined, bind: 0, effects: [] };
        }
        if (nb[i].player === undefined) nb[i] = { player, bind: life, effects: [] };
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
                if (this.isEnemy(sq.player)) enemy++;
                else if (sq.player === this.playerSymbol) mine++;
            }
            const net = enemy - mine;
            if (net > bestNet) { bestNet = net; bestIdx = i; }
        }
        return bestNet >= 2 ? bestIdx : null;
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
        proliferateActive: boolean = false
    ): AIResult {
        this.necroActive = necroRemain > 0;
        this.updateShield(board);

        // マルチリーチ防御: 脅威数に応じてロック種別を選択
        const threatSquares = Array.from(new Set(this.opponents.flatMap((o) => this.findThreatSquares(board, o))));
        if (threatSquares.length >= 2) {
            const lockOptions: { skill: string; count: number; cost: number }[] = [
                { skill: 'onClickUseLock', count: 1, cost: this.calculateAICost(costs.onClickUseLock) },
            ];
            if (availableSkills.includes(12)) {
                lockOptions.push({ skill: 'onClickUseDoubleLock', count: 2, cost: this.calculateAICost(costs.onClickDoubleLock) });
            }
            if (availableSkills.includes(13)) {
                lockOptions.push({ skill: 'onClickUseTripleLock', count: 3, cost: this.calculateAICost(costs.onClickTripleLock) });
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

        // 対ネクロ: 敵にネクロがいるときは、吸収されそうな低bindの自コマを常にロックして守る (sim/ai.js と同一)。
        // A/B: ネクロ以外6キャラ vs ネクロ 0.45→0.62 (+16〜18pt)。軍師は+2コストで悪化、ネクロ同士は未検証のため対象外
        if (
            this.character !== 'tactician' &&
            this.character !== 'necromancer' &&
            this.characters.some((c, seat) => c === 'necromancer' && seat !== seatOf(this.playerSymbol)) &&
            magic >= this.calculateAICost(costs.onClickUseLock)
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
            magic >= this.calculateAICost(costs.onClickInjection, false, true) &&
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

        // 雷霆の巫: 帯電拡散→範囲帯電→帯電付与は対象マスをクリックする2段階スキル。手番は進まないので、
        // 撃った後の盤面・魔力で通常のスキル選択と着手へ続ける（相手にリーチがあるときは撃たない）。
        // ジャマーは相手にリーチがあっても撃つ（要の駒をライフ0にして、同じ手番で奪って崩す）
        const chargeClicks: { skill: string; target: number }[] = [];
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
            if (availableSkills.includes(24) && magic >= this.calculateAICost(costs.onClickChargeArea)) {
                const center = this.bestChargeAreaTarget(board);
                if (center !== null) {
                    chargeClicks.push({ skill: 'onClickChargeArea', target: center });
                    board = withCharge(board, geometryForCells(board.length).stompRange(center));
                    magic -= this.calculateAICost(costs.onClickChargeArea);
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
        if (this.character === 'electrician' && availableSkills.includes(26) && magic >= this.calculateAICost(costs.onClickJammer)) {
            const target = this.bestJammerTarget(board);
            if (target !== null) {
                chargeClicks.push({ skill: 'onClickJammer', target });
                board = board.slice();
                applyJammer(board, target, this.sizeOf(board), this.playerSymbol);
                magic -= this.calculateAICost(costs.onClickJammer);
                this.updateShield(board);
            }
        }
        const chargeResult = chargeClicks.length > 0 ? chargeClicks : undefined;

        // 巨人ストンプ / 魔法使い審判の日 (相手リーチが無いとき)
        if (this.opponents.every((o) => this.countReaches(board, o) === 0)) {
            if (this.character === 'giant' && magic >= costs.onClickStomp) {
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
            if (this.character === 'magician' && magic >= costs.onClickUseLock) {
                const budCell = board.findIndex(
                    (sq) =>
                        sq.player === this.playerSymbol &&
                        sq.effects.some((e) => e.effect === '🌱') &&
                        !sq.effects.some((e) => e.effect === '🔑')
                );
                if (budCell !== -1) {
                    return { move: this.getBestMove(board, life), skills: ['onClickUseLock'], lockTargets: [budCell] };
                }
            }
        }

        const skills = this.chooseSkills(board, magic, costs, opponentMagic, life, availableSkills, tokenUsed, necroRemain, necroCost, assaultCost, proliferateActive);

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
