// AIPlayer のメソッド群: 盤面の評価・先読み・着手の候補（minimax と脅威の検出）
// メソッド本体は AIPlayer.ts から移しただけ（this は AIPlayer）。AIPlayer.ts がインターフェース統合とプロトタイプへの合成で戻す
import type { GearId } from './gear';
import type AIPlayer from './AIPlayer';
import { CharacterId } from '../../types/Character';
import { Player, seatOf } from '../../types/Player';
import { SquareInfo } from '../../types/SquareInfo';
import { calculateWinner, findEmptyIndexes, isObject, isShikigami, lineSymbols } from '../../util';
import { geometryForCells } from './boardGeometry';
import { isFrozen, emptyBlocked, absorbDestroy, frozenStacks, isDormant, activeBuds, leafSurcharge, decayTick, overwriteBlocked, boardLeaves } from './thermal';
import { addLock, isLocked, tickLock } from './lock';
import { lockBlocksPlacement } from './keysmith';
import { shouldDecay, canHitBound, isTakeProtected } from './decay';
import { chargeStacks, orthoNeighbors } from './charge';
import { EXCLUSIVE_MIN_MAGIC, FORCED_WIN_PLIES, GLACIER_COST, NO_CAP_NECRO_WEIGHT, TWO_LINE_DISJOINT_WEIGHT, TWO_LINE_OVERLAP_WEIGHT, YY_COVER_WEIGHT } from './aiConstants';
import { toPiece } from './shikigami';

export const searchMethods = {

    /** 相手に陰陽師がいるか */
    facingYinYang(this: AIPlayer): boolean {
        return this.opponents.some((o) => this.characterOf(o) === 'yinYangMaster');
    },

    /** 自分のコマが1つ以上入っている勝ち筋の列の数 (旧sim AI coveredLines と同一) */
    coveredLines(this: AIPlayer, board: SquareInfo[]): number {
        let n = 0;
        for (const line of geometryForCells(board.length).winLines) {
            if (line.some((idx) => board[idx].player === this.playerSymbol)) n++;
        }
        return n;
    },

    /** 席ごとのキャラ（自分の席は this.character）。charge.ts の addCharge に渡す */
    seatCharacters(this: AIPlayer): (CharacterId | undefined)[] {
        return this.characters.map((c, seat) => (seat === seatOf(this.playerSymbol) ? this.character : c));
    },

    characterOf(this: AIPlayer, player: Player): CharacterId | undefined {
        return player === this.playerSymbol ? this.character : this.characters[seatOf(player)];
    },

    /** 無敵マス(雷霆の巫の⚡付き自陣)の集合を更新する (旧sim AI updateShield) */
    updateShield(this: AIPlayer, board: SquareInfo[]): void {
        this.leafCount = boardLeaves(board);
        this.foeLeaves = leafSurcharge(board, this.playerSymbol);
        this.shield = new Set();
        board.forEach((sq, i) => {
            if (sq.player && this.characterOf(sq.player) === 'electrician' && chargeStacks(sq) > 0 && !isDormant(sq)) this.shield.add(i); // 氷結中は⚡が休眠で無敵でない
        });
    },

    sizeOf(this: AIPlayer, board: SquareInfo[]): number {
        return Math.round(Math.sqrt(board.length));
    },

    /** 着手マス i が発火させる⚡の損得。敵コマ(ライフ>0)を削れば加点、自コマを削れば減点。ライフ1は0になるので重く見る */
    fireGain(this: AIPlayer, board: SquareInfo[], i: number): number {
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
    },

    /** 自コマ i が入っている列のうち、他の席のコマが無く自コマが最も多い列の自コマ数 (i を含む) */
    bestOwnLineCount(this: AIPlayer, board: SquareInfo[], i: number): number {
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
    },

    /** 相手のだれかが、次の手番に固有スキルを撃てそうな魔力に届いているか（氷室の番人は絶対零度の実コスト = 10 − 盤面の❄の数で見積もる） */
    opponentsCanCastBig(this: AIPlayer, board: SquareInfo[], seatMagic: number[]): boolean {
        const frost = board.reduce((n, sq) => n + frozenStacks(sq), 0);
        return this.opponents.some((o) => {
            const seat = seatOf(o);
            const ch = this.characters[seat];
            const need = ch === 'cryomancer' ? Math.max(1, GLACIER_COST - frost) : EXCLUSIVE_MIN_MAGIC[ch ?? 'you'] ?? Infinity;
            return (seatMagic[seat] ?? 0) + 1 >= need;
        });
    },

    /** 敵駒 i が「どかさないと負ける列」(持ち主が3つ揃い・他のコマなし・残り1マスが空き) に含まれるか (旧sim AI inOppReachLine) */
    inOppReachLine(this: AIPlayer, board: SquareInfo[], i: number): boolean {
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
    },

    /** 自分以外のコマか（盤上にあるのは参加者のコマだけなので、自分以外＝敵） */
    /** 自分がそのギアを装備しているか（装備に合わせて戦略を変える判断に使う） */
    ownsGear(this: AIPlayer, id: GearId): boolean {
        return this.gears.includes(id);
    },

    isEnemy(this: AIPlayer, player: Player | undefined): boolean {
        return player !== undefined && player !== this.playerSymbol;
    },

    /** 探索の深さ。盤が大きいほど候補手が増えるので浅くする（4x4=3 / 5x5=2 / それ以上=1） */
    searchDepth(this: AIPlayer, board: SquareInfo[]): number {
        const cells = board.length;
        if (cells <= 16) return 3;
        if (cells <= 25) return 2;
        return 1;
    },

    /** 盤面評価関数: 各勝利ラインのスコアを合算 */
    evaluateBoard(this: AIPlayer, board: SquareInfo[]): number {
        let score = 0;
        const lineScores = [0, 1, 10, 50, 1000];
        // 龍神の巫女（二列勝利）: 1本目が完成していたら、それと重なる窓（共有2マス以上）は2本目にならないので評価を下げ、離れた窓を上げる。
        // 重なる窓も同じ点で数えると、1本目の周りに積むほうが得に見えて、2本目を作る動きが選ばれない
        let primary: number[] | null = null;
        if (this.character === 'dragonMiko') {
            primary = geometryForCells(board.length).winLines.find((line) => line.every((idx) => board[idx].player === this.playerSymbol && !isObject(board[idx]))) ?? null;
        }

        for (const line of geometryForCells(board.length).winLines) {
            // 氷結中の空きマスを含むライン（着手不能な4つ目）は完成させられないので評価しない。式神を含むラインも同様
            if (line.some((idx) => emptyBlocked(board[idx]) || isShikigami(board[idx]) || isObject(board[idx]))) continue;
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
                let weight = 1;
                if (primary && line !== primary) weight = line.filter((idx) => primary!.includes(idx)).length >= 2 ? TWO_LINE_OVERLAP_WEIGHT : TWO_LINE_DISJOINT_WEIGHT;
                score += lineScores[myCount] * weight;
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
    },

    /** 指定プレイヤーのリーチ数（3つ揃い+空き1）をカウント */
    countReaches(this: AIPlayer, board: SquareInfo[], player: Player): number {
        let reaches = 0;
        for (const line of geometryForCells(board.length).winLines) {
            if (line.some((idx) => isShikigami(board[idx]) || isObject(board[idx]))) continue; // 式神・オブジェクトは列に数えない
            let my = 0, op = 0, blocked = false;
            for (const idx of line) {
                const sq = board[idx];
                if (sq.player === player) my++;
                else if (sq.player) op++;
                // 残り1マスが着手不能（氷結中の空きマス・ロック中の空きマス）ならリーチではない（findThreatSquares と同じ判定）
                else if (emptyBlocked(sq) || lockBlocksPlacement(sq, this.characterOf(player))) blocked = true;
            }
            if (my === 3 && op === 0 && !blocked) reaches++;
        }
        return reaches;
    },

    /** 自分のリーチ（自コマ3つ・他のコマ無し）の残り1マスが氷結中の空きマスで塞がれているときの、そのマス (旧sim AI blockedReachCell) */
    blockedReachCell(this: AIPlayer, board: SquareInfo[]): number | null {
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
    },

    /** 相手がリーチしているラインの残り1マス（脅威マス）を列挙 */
    findThreatSquares(this: AIPlayer, board: SquareInfo[], player: Player): number[] {
        const threats: number[] = [];
        for (const line of geometryForCells(board.length).winLines) {
            if (line.some((idx) => isShikigami(board[idx]) || isObject(board[idx]))) continue; // 式神・オブジェクトは列に数えない
            let pCount = 0, oCount = 0, emptyIdx = -1;
            for (const idx of line) {
                const sq = board[idx];
                if (sq.player === player) pCount++;
                else if (sq.player) oCount++;
                else if (!sq.player && !lockBlocksPlacement(sq, this.character) && !emptyBlocked(sq)) emptyIdx = idx;
            }
            if (pCount === 3 && oCount === 0 && emptyIdx !== -1) {
                if (!threats.includes(emptyIdx)) threats.push(emptyIdx);
            }
        }
        return threats;
    },

    /**
     * 着手ごとのライフ減衰を先読み用に適用した盤面（旧sim AI decayBoard と同じ）。着手マス skip の毒消滅だけは除く。
     * ライフ1の自コマは自分の着手の直後に0になり、相手に奪われる
     */
    decayBoard(this: AIPlayer, board: SquareInfo[], skip: number): SquareInfo[] {
        return board.map((sq, k) => {
            const hadPoison = !isDormant(sq) && sq.effects.some((e) => e.effect === '☠');
            const next = tickLock(decayTick(sq, this.characters)).sq; // ロックはスタックが尽きたら外れる (#438)
            if (hadPoison && next.bind === 0 && next.player && k !== skip && !isLocked(next)) return { player: undefined, bind: 0, effects: [] };
            return next;
        });
    },

    /**
     * 巨人のオーラを着手後の盤面に反映する（Game.tsx / giantAura.ts と同じ規則。旧sim AI の auraSim=1 と同一）。
     * 着手マスの周囲の敵コマを壊し、周囲を全部ロックする。A/B: 環境勝率 53.1→60.2%（seed2/200）
     */
    applyAuraSim(this: AIPlayer, sim: SquareInfo[], index: number): SquareInfo[] {
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
            sim[j] = addLock(sq, Math.max(sq.bind, 1));
        }
        return sim;
    },

    /** 盤面上にコマを置いたシミュレーション (bind=0の乗っ取り対応)。ply を渡すと、その着手で減衰が進む場合は先に減衰させる（0=今回の着手） */
    simulatePlace(this: AIPlayer, board: SquareInfo[], index: number, player: Player, life: number, ply?: number): SquareInfo[] {
        const decayed = ply !== undefined && shouldDecay(this.placements + ply, this.seatCount) ? this.decayBoard(board, index) : board;
        const newBoard = decayed.map(sq => ({ ...sq, effects: [...sq.effects] }));
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
            if (isShikigami(sq)) newBoard[index] = { ...toPiece(newBoard[index]), effects: [...newBoard[index].effects, { effect: '🌱' }] };
        }

        return newBoard;
    },

    /** 有効な手の一覧 (空きマス + 乗っ取り/攻撃可能な敵マス) */
    getValidMoves(this: AIPlayer, board: SquareInfo[], life: number): number[] {
        const moves: number[] = [];
        for (let i = 0; i < board.length; i++) {
            const sq = board[i];
            if (this.shield.has(i)) continue;
            // ロック済みかつbind>0はスキップ
            if (lockBlocksPlacement(sq, this.character)) continue;

            if (!sq.player) {
                // 空きマス (ロックされていない)
                if (!lockBlocksPlacement(sq, this.character) && !emptyBlocked(sq)) moves.push(i);
            } else if (this.isEnemy(sq.player)) {
                // bind=0の敵マスは無条件で乗っ取り可能（雷霆の巫のコマは除く）
                if (sq.bind <= 0 && !isTakeProtected(sq, this.characters)) {
                    moves.push(i);
                } else if (canHitBound(this.character, board, this.opponents.length + 1)) {
                    // 巨人と、満杯の盤面では誰でも、bind>0の敵マスを攻撃可能
                    moves.push(i);
                }
            }
        }
        return moves;
    },

    /**
     * 自コマを重ね置きで補強する候補。補強しないと、着手後の減衰で自コマのライフが0になり、
     * 相手がそこを取って4つ揃える(負ける)コマだけを返す (旧sim AI reinforceMoves と同じ)
     */
    reinforceMoves(this: AIPlayer, board: SquareInfo[], life: number): number[] {
        const decayed = shouldDecay(this.placements, this.seatCount) ? this.decayBoard(board, -1) : board;
        const moves: number[] = [];
        for (let i = 0; i < board.length; i++) {
            const sq = board[i];
            if (sq.player !== this.playerSymbol || decayed[i].player !== sq.player || decayed[i].bind > 0) continue;
            if (lockBlocksPlacement(sq, this.character)) continue;
            if (overwriteBlocked(sq)) continue;
            const lost = this.opponents.some((o) =>
                calculateWinner(lineSymbols(this.simulatePlace(decayed, i, o, life))) === o);
            if (lost) moves.push(i);
        }
        return moves;
    },

    /** 指定プレイヤーが着手可能なマスを列挙 */
    getMovesFor(this: AIPlayer, board: SquareInfo[], player: Player, life: number): number[] {
        const moves: number[] = [];
        for (let i = 0; i < board.length; i++) {
            const sq = board[i];
            if (this.shield.has(i)) continue;
            if (lockBlocksPlacement(sq, this.character)) continue;
            if (!sq.player) {
                if (!lockBlocksPlacement(sq, this.character) && !emptyBlocked(sq)) moves.push(i);
            } else if (sq.player !== player) {
                if (sq.bind <= 0 && !isTakeProtected(sq, this.characters)) moves.push(i);
            }
        }
        return moves;
    },

    /** Minimax + Alpha-Beta 枝刈り (深さ2) */
    minimax(this: AIPlayer, board: SquareInfo[], depth: number, isMax: boolean, alpha: number, beta: number, life: number, ply: number = 1): number {
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
                    this.simulatePlace(board, idx, this.playerSymbol, life, ply),
                    depth - 1, false, alpha, beta, life, ply + 1
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
                    this.simulatePlace(board, idx, opponent, life, ply),
                    depth - 1, true, alpha, beta, life, ply + 1
                );
                best = Math.min(best, score);
                beta = Math.min(beta, score);
                if (beta <= alpha) break;
            }
            return best;
        }
    },

    /** 最善手を選択: 即勝ち→即ブロック→Minimax+フォーク評価 */
    /**
     * 強制勝ちの着手。相手がどう打っても（着手だけの盤面ゲームとして）FORCED_WIN_PLIES 手先までに自分が勝てる着手を探す。
     * minimax(深さ3)は相手の着手で評価が終わるため、自分が3回打つ勝ちを見逃す。2人戦の小さい盤（16マス以下）だけ。
     * オラクル照合(sim/probe-oracle.js): 見逃しは着手判断の 4.5%、そこで最善手を打つと実戦勝率 +9.6pt (z=3.5)
     */
    forcedWinMove(this: AIPlayer, board: SquareInfo[], life: number, moves: number[]): number | null {
        if (this.opponents.length !== 1 || board.length > 16) return null;
        const me = this.playerSymbol;
        const opp = this.opponents[0];
        // me の視点の値 (+1 強制勝ち / -1 強制負け / 0 未決)。mover が手番、ply は着手の通し番号（減衰の文脈）、depth は残りの手数
        const search = (b: SquareInfo[], mover: Player, ply: number, depth: number, alpha: number, beta: number): number => {
            if (depth === 0) return 0;
            const next = this.getMovesFor(b, mover, life);
            if (next.length === 0) return 0;
            let best = mover === me ? -2 : 2;
            for (const j of next) {
                const nb = this.simulatePlace(b, j, mover, life, ply);
                const w = calculateWinner(lineSymbols(nb));
                const v = w ? (w === me ? 1 : -1) : search(nb, mover === me ? opp : me, ply + 1, depth - 1, alpha, beta);
                if (mover === me) { if (v > best) best = v; if (best > alpha) alpha = best; } else { if (v < best) best = v; if (best < beta) beta = best; }
                if (beta <= alpha) break;
            }
            return best;
        };
        for (const m of moves) {
            const nb = this.simulatePlace(board, m, me, life, 0);
            const w = calculateWinner(lineSymbols(nb));
            if (w) { if (w === me) return m; continue; }
            if (search(nb, opp, 1, FORCED_WIN_PLIES, -2, 2) === 1) return m;
        }
        return null;
    },

    /** 今すぐ完成できる着手(捕獲・補強を含む)。無ければ null。着手後の炎・毒による減衰は見ない（巨人のストンプ連打の判断だけに使う） */
    directWinMove(this: AIPlayer, board: SquareInfo[], life: number): number | null {
        const moves = Array.from(new Set([...findEmptyIndexes(board), ...this.getValidMoves(board, life), ...this.reinforceMoves(board, life)]));
        for (const i of moves) {
            if (calculateWinner(lineSymbols(this.simulatePlace(board, i, this.playerSymbol, life))) === this.playerSymbol) return i;
        }
        return null;
    },

    /** スキルを使わず、この1手で自分が勝てるマス（空きマス・補強・奪取）。無ければ null。ターン終了系のスキルを撃つ前に確かめる */
    immediateWinMove(this: AIPlayer, board: SquareInfo[], life: number): number | null {
        const empty = findEmptyIndexes(board);
        const allMoves = Array.from(new Set([...empty, ...this.getValidMoves(board, life), ...this.reinforceMoves(board, life)]));
        for (const i of allMoves) {
            const sim = this.simulatePlace(board, i, this.playerSymbol, life);
            if (calculateWinner(lineSymbols(sim)) === this.playerSymbol) return i;
        }
        return null;
    },

    getBestMove(this: AIPlayer, board: SquareInfo[], life: number): number | null {
        const empty = findEmptyIndexes(board);
        const validMoves = this.getValidMoves(board, life);
        const allMoves = Array.from(new Set([...empty, ...validMoves, ...this.reinforceMoves(board, life)]));

        if (allMoves.length === 0) return null;

        // 1. 即勝ち
        for (const i of allMoves) {
            const sim = this.simulatePlace(board, i, this.playerSymbol, life);
            if (calculateWinner(lineSymbols(sim)) === this.playerSymbol) return i;
        }

        // 1.5 強制勝ち（土壇場の防壁が未発動のときは、相手の勝ちを防壁が受けるので普通の判断に任せる）
        if (!this.lastStandReady) {
            const forced = this.forcedWinMove(board, life, allMoves);
            if (forced !== null) return forced;
        }

        // 2. 相手の即勝ちをブロック (空きマス + 乗っ取り可能な自マス)。土壇場の防壁が未発動なら止めに行かない
        let candidates = allMoves;
        for (const opp of this.lastStandReady ? [] : this.opponents) {
            const oppMoves = this.getMovesFor(board, opp, life);
            for (const i of oppMoves) {
                const sim = this.simulatePlace(board, i, opp, life);
                if (calculateWinner(lineSymbols(sim)) === opp) {
                    if (!allMoves.includes(i)) continue;
                    // 塞いだ後の減衰で別のコマが 0 になって奪われ、相手に別の勝ち手ができることがある。
                    // 減衰後も相手に勝ち手が残らない着手だけを候補に絞って、通常の評価で選ぶ（無ければ従来どおりこのマスを塞ぐ。sim/ai.js の safeBlock）
                    const safe = allMoves.filter((m) => {
                        const after = this.simulatePlace(board, m, this.playerSymbol, life, 0);
                        return this.opponents.every((q) => !this.getMovesFor(after, q, life).some((j) => calculateWinner(lineSymbols(this.simulatePlace(after, j, q, life))) === q));
                    });
                    if (safe.length === 0) return i;
                    candidates = safe;
                    break;
                }
            }
            if (candidates !== allMoves) break;
        }

        // 3. Minimax評価 + フォーク検出
        let bestScore = -Infinity;
        let bestMove = candidates[0];
        // 雷霆の巫: 相手に陰陽師がいると、百鬼夜行→式神一括で空きマスが全部相手のコマになる。自分のコマが1つも無い線があると
        // その線で一撃で負けるので、全ての線に自コマを置くよう着手を誘導する（旧sim AI F.floodCover と同じ。対陰陽師 11→28%）
        const floodCover = this.character === 'electrician' && this.opponents.some((o) => this.characterOf(o) === 'yinYangMaster') ? this.floodCoverWeight : 0;
        const floodLines = floodCover ? geometryForCells(board.length).winLines : [];

        for (const i of candidates) {
            const simBoard = this.simulatePlace(board, i, this.playerSymbol, life, 0);
            if (this.character === 'giant' && simBoard[i].player === this.playerSymbol) this.applyAuraSim(simBoard, i);
            let score = this.minimax(simBoard, this.searchDepth(board), false, -Infinity, Infinity, life);

            // テンポ/レース強化(A/B検証で +8pt): リーチ作成を重視して先に盤面を取りに行く
            const reaches = this.countReaches(simBoard, this.playerSymbol);
            if (reaches >= 2) score += 200;        // フォーク
            else if (reaches === 1) score += 40;   // シングルリーチ作成も評価

            // 陰陽師の百鬼夜行→式神一括(盤の空きを全て自コマにして列を完成させる)は、自コマが入った列には効かない。全ての列に自コマを1つは置く
            // (旧sim AI yyCover=150。ネクロマンサーが陰陽師と戦うとき 対陰陽師 7→30%。氷室の番人も同様: yyCoverCryo 対陰陽師 +4.6〜+17.4pt, seed1-3)
            if ((this.character === 'necromancer' || this.character === 'cryomancer') && this.facingYinYang()) {
                score += YY_COVER_WEIGHT * (this.coveredLines(simBoard) - this.coveredLines(board));
            }

            // bind=0の敵マス乗っ取りボーナス（捕獲の戦術価値は墓地1個の損より大きいと実測で判明したため対ネクロでも維持）
            if (this.isEnemy(board[i].player) && board[i].bind <= 0 && !isTakeProtected(board[i], this.characters)) {
                score += 30;
                // 氷室の番人はネクロが相手のとき奪取を避ける（奪取は敵味方問わずネクロの墓地+1＝降霊の召喚数とコスト減）。
                // 旧sim AI noCapNecro=100: 対ネクロ +5〜+11pt (seed1-3、各300〜400試合)
                if (this.character === 'cryomancer' && this.opponents.some((o) => this.characterOf(o) === 'necromancer')) {
                    score -= NO_CAP_NECRO_WEIGHT;
                }
            }

            // ⚡の発火: 隣の帯電マスが敵を削れば加点、自コマを削れば減点
            score += this.fireGain(board, i);

            if (floodCover) {
                let uncovered = 0;
                for (const line of floodLines) if (!line.some((k) => simBoard[k].player === this.playerSymbol)) uncovered++;
                score -= uncovered * floodCover;
            }

            if (score > bestScore) {
                bestScore = score;
                bestMove = i;
            }
        }

        return bestMove;
    },

    /**
     * 盤面・キャラに応じて固定（ロック）したいスキルを返す。[要検証]
     * 守備のために1枠は空けておけるよう最大2つまで。キャラ専用シナジーを優先。
     */
    /** 自分以外の席に凩の魔女がいる（魔女自身は含めない） */
    facesWitchNow(this: AIPlayer): boolean {
        return this.character !== 'witch' && this.characters.some((c, seat) => seat !== seatOf(this.playerSymbol) && c === 'witch');
    },
};
export type SearchMethods = typeof searchMethods;
