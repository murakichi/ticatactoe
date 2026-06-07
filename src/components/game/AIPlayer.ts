import { CharacterId } from '../../types/Character';
import { Player } from '../../types/Player';
import { SquareInfo } from '../../types/SquareInfo';
import { calculateWinner, findEmptyIndexes } from '../../util';
import { SkillCosts } from './skillCosts';
import { WIN_LINES, STOMP_AREA, JUDGE_AREA } from './boardGeometry';

export const TURN_ENDING_SKILLS = ['onClickCharge', 'onClickOpium', 'onClickTsunami'];

export type AIResult = {
    move: number | null;
    skills: string[];
    lockTargets?: number[];
    needsShuffle?: boolean;
    stompTarget?: number;
};

class AIPlayer {
    playerSymbol: Player;
    character: CharacterId;
    opponent: Player;
    opponentCharacter: CharacterId;
    necroActive: boolean = false;

    constructor(playerSymbol: Player, character: CharacterId, opponentCharacter: CharacterId = 'you') {
        this.playerSymbol = playerSymbol;
        this.character = character;
        this.opponent = playerSymbol === '💙' ? '⭕' : '💙';
        this.opponentCharacter = opponentCharacter;
    }

    /** 盤面評価関数: 各勝利ラインのスコアを合算 */
    evaluateBoard(board: SquareInfo[]): number {
        let score = 0;
        const lineScores = [0, 1, 10, 50, 1000];

        for (const line of WIN_LINES) {
            let myCount = 0, oppCount = 0, myBindSum = 0, oppBindSum = 0;
            for (const idx of line) {
                const sq = board[idx];
                if (sq.player === this.playerSymbol) {
                    myCount++;
                    myBindSum += sq.bind;
                } else if (sq.player === this.opponent) {
                    oppCount++;
                    oppBindSum += sq.bind;
                }
            }
            if (myCount > 0 && oppCount === 0) {
                score += lineScores[myCount];
            } else if (oppCount > 0 && myCount === 0) {
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
            } else if (sq.player === this.opponent) {
                score -= buds * 3 + (hasLock ? 5 : 0);
            }
        }

        return score;
    }

    /** 指定プレイヤーのリーチ数（3つ揃い+空き1）をカウント */
    countReaches(board: SquareInfo[], player: Player): number {
        const opp: Player = player === '💙' ? '⭕' : '💙';
        let reaches = 0;
        for (const line of WIN_LINES) {
            let my = 0, op = 0;
            for (const idx of line) {
                if (board[idx].player === player) my++;
                else if (board[idx].player === opp) op++;
            }
            if (my === 3 && op === 0) reaches++;
        }
        return reaches;
    }

    /** 相手がリーチしているラインの残り1マス（脅威マス）を列挙 */
    findThreatSquares(board: SquareInfo[], player: Player): number[] {
        const opp: Player = player === '💙' ? '⭕' : '💙';
        const threats: number[] = [];
        for (const line of WIN_LINES) {
            let pCount = 0, oCount = 0, emptyIdx = -1;
            for (const idx of line) {
                const sq = board[idx];
                if (sq.player === player) pCount++;
                else if (sq.player === opp) oCount++;
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
        for (let i = 0; i < 16; i++) {
            const sq = board[i];
            // ロック済みかつbind>0はスキップ
            if (sq.effects.some(e => e.effect === '🔑') && sq.bind > 0) continue;

            if (!sq.player) {
                // 空きマス (ロックされていない)
                if (!sq.effects.some(e => e.effect === '🔑')) moves.push(i);
            } else if (sq.player === this.opponent) {
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
        for (let i = 0; i < 16; i++) {
            const sq = board[i];
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
        if (winner === this.opponent) return -1000 - depth;

        const currentPlayer = isMax ? this.playerSymbol : this.opponent;
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
                    this.simulatePlace(board, idx, this.opponent, life),
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
        const oppMoves = this.getMovesFor(board, this.opponent, life);
        for (const i of oppMoves) {
            const sim = this.simulatePlace(board, i, this.opponent, life);
            if (calculateWinner(sim.map(sq => sq.player)) === this.opponent) {
                if (allMoves.includes(i)) return i;
            }
        }

        // 3. Minimax評価 + フォーク検出
        let bestScore = -Infinity;
        let bestMove = allMoves[0];

        for (const i of allMoves) {
            const simBoard = this.simulatePlace(board, i, this.playerSymbol, life);
            let score = this.minimax(simBoard, 3, false, -Infinity, Infinity, life);

            // テンポ/レース強化(A/B検証で +8pt): リーチ作成を重視して先に盤面を取りに行く
            const reaches = this.countReaches(simBoard, this.playerSymbol);
            if (reaches >= 2) score += 200;        // フォーク
            else if (reaches === 1) score += 40;   // シングルリーチ作成も評価

            // bind=0の敵マス乗っ取りボーナス（捕獲の戦術価値は墓地1個の損より大きいと実測で判明したため対ネクロでも維持）
            if (board[i].player === this.opponent && board[i].bind <= 0) {
                score += 30;
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
        if (this.character === 'giant' || this.character === 'magician' || this.character === 'yinYangMaster') {
            return [];
        }
        let myPieces = 0, oppPieces = 0, empties = 0;
        for (const sq of board) {
            if (sq.player === this.playerSymbol) myPieces++;
            else if (sq.player === this.opponent) oppPieces++;
            else if (!sq.player) empties++;
        }
        const enemiesOn = (idxs: number[]) =>
            idxs.filter((i) => board[i].player === this.opponent && !board[i].effects.some((e) => e.effect === '🔑')).length;

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
                case 5: return enemiesOn([3, 6, 9, 12]) >= 2;                   // スラッシュ
                case 6: return enemiesOn([0, 5, 10, 15]) >= 2;                  // バックスラッシュ
                case 8: return oppPieces >= 3;                                  // オピウム
                case 7: return opponentMagic >= 7;                              // チューチュートレイン
                case 14: return myPieces >= 3;                                  // ワルプルギスの夜
                case 0: case 1: return life <= 2;                               // ライフ3/バイバイン
                case 2: case 10: return empties >= 8;                           // バッズ系(序盤)
                default: return false;
            }
        };

        const locks: number[] = [];
        for (const idx of availableSkills) {
            if (idx < 0 || idx > 14) continue;
            if (preferred(idx) || valued(idx)) locks.push(idx);
        }
        // キャラ専用シナジーを優先して残す。守備の余地のため最大2つ
        locks.sort((a, b) => (preferred(b) ? 1 : 0) - (preferred(a) ? 1 : 0));
        return locks.slice(0, 2);
    }

    /** AI用コスト計算 (軍師のトークン割引など) */
    calculateAICost(baseCost: number, isToken: boolean = false): number {
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
        assaultCost: number = 99
    ): string[] {
        const skills: string[] = [];
        let remaining = magic;
        const oppReaches = this.countReaches(board, this.opponent);
        let myPieces = 0, oppPieces = 0;
        for (const sq of board) {
            if (sq.player === this.playerSymbol) myPieces++;
            else if (sq.player === this.opponent) oppPieces++;
        }
        const isLosing = oppPieces > myPieces + 2 || oppReaches > 0;

        const spend = (cost: number, skill: string): boolean => {
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
                    if (sq.player === this.opponent && sq.bind >= 1 && sq.bind <= 4 && !sq.effects.some(e => e.effect === '🔑')) absorbable++;
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
        }

        // --- ターン終了系は単独で返す ---

        // Opiumはリーチ防御に使わない (bindを下げるだけで空きマスは塞げない)
        // → getBestMoveでブロック配置させる

        // 劣勢時の破壊系 (ターン終了するので、相手リーチ時は使わない→ブロック優先)
        if (skills.length === 0 && isLosing && oppReaches === 0) {
            if (availableSkills.includes(5)) {
                let oppOn = 0, myOn = 0;
                for (const idx of [3, 6, 9, 12]) {
                    if (board[idx].player === this.opponent && !board[idx].effects.some(e => e.effect === '🔑')) oppOn++;
                    if (board[idx].player === this.playerSymbol && !board[idx].effects.some(e => e.effect === '🔑')) myOn++;
                }
                if (oppOn > myOn) spend(this.calculateAICost(costs.onClickSlash), 'onClickSlash');
            }
            if (skills.length === 0 && availableSkills.includes(6)) {
                let oppOn = 0, myOn = 0;
                for (const idx of [0, 5, 10, 15]) {
                    if (board[idx].player === this.opponent && !board[idx].effects.some(e => e.effect === '🔑')) oppOn++;
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

        // --- トークン系 ---
        if (!tokenUsed) {
            if (this.character === 'tactician') {
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

        return skills;
    }

    /** 巨人ストンプ: 破壊範囲に敵が最多の中心 (敵2体以上で価値あり)。なければ null */
    findStompTarget(board: SquareInfo[]): number | null {
        let bestIdx: number | null = null, bestEnemies = 0, bestEmptyCenter = false;
        for (let i = 0; i < 16; i++) {
            let enemies = 0;
            for (const idx of STOMP_AREA[i]) if (board[idx].player === this.opponent) enemies++;
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
        for (const idx of STOMP_AREA[i]) {
            if (nb[idx].player === player) nb[idx].bind = nb[idx].bind > 5 ? nb[idx].bind - 5 : 0;
            else nb[idx] = { player: undefined, bind: 0, effects: [] };
        }
        if (nb[i].player === undefined) nb[i] = { player, bind: life, effects: [] };
        return nb;
    }

    /** 魔法使い審判の日: 十字範囲で (敵破壊 - 自軍破壊) 最大の中心 (純増2以上で価値あり) */
    findJudgeTarget(board: SquareInfo[]): number | null {
        let bestIdx: number | null = null, bestNet = 0;
        for (let i = 0; i < 16; i++) {
            let enemy = 0, mine = 0;
            for (const idx of JUDGE_AREA[i]) {
                const sq = board[idx];
                const locked = sq.effects.some(e => e.effect === '🔑');
                const protectedBud = sq.player === this.playerSymbol && sq.effects.some(e => e.effect === '🌱');
                if (locked && protectedBud) continue;
                if (sq.player === this.opponent) enemy++;
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
        afterShuffle: boolean = false,
        assaultCost: number = 99
    ): AIResult {
        this.necroActive = necroRemain > 0;

        // マルチリーチ防御: 脅威数に応じてロック種別を選択
        const threatSquares = this.findThreatSquares(board, this.opponent);
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
            // 必要数を1つのロックでカバーできない場合、シャッフルで手札を引き直す
            const shuffleCost = this.calculateAICost(costs.onClickShuffle);
            if (!afterShuffle && needed > 1 && magic >= shuffleCost + lockOptions[0].cost) {
                return { move: null, skills: [], needsShuffle: true };
            }
            // シャッフル済み or シャッフル不可: 単ロックで最低1つは塞ぐ
            if (magic >= lockOptions[0].cost) {
                return {
                    move: threatSquares[1],
                    skills: ['onClickUseLock'],
                    lockTargets: [threatSquares[0]],
                };
            }
        }

        // 巨人ストンプ / 魔法使い審判の日 (相手リーチが無いとき)
        if (this.countReaches(board, this.opponent) === 0) {
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

        const skills = this.chooseSkills(board, magic, costs, opponentMagic, life, availableSkills, tokenUsed, necroRemain, necroCost, assaultCost);

        // ターン終了スキルの場合は手を打たない
        if (skills.some(s => TURN_ENDING_SKILLS.includes(s))) {
            return { move: null, skills };
        }

        // 蘇生はこのターンから有効化し、敵マスを攻撃対象に含める
        if (skills.includes('onClickNecromancy')) {
            this.necroActive = true;
        }

        const move = this.getBestMove(board, life);
        return { move, skills };
    }
}

export default AIPlayer;
