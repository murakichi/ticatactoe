// AIPlayer のメソッド群: 勝ち筋・コンボの計画（パーフェクトゲーム・ストンプ・強奪・ヘイルメアリー・式神）
// メソッド本体は AIPlayer.ts から移しただけ（this は AIPlayer）。AIPlayer.ts がインターフェース統合とプロトタイプへの合成で戻す
import type AIPlayer from './AIPlayer';
import { SquareInfo } from '../../types/SquareInfo';
import { perfectGame } from './bigSkills';
import { calculateWinner, isShikigami, lineSymbols } from '../../util';
import { SkillCosts } from './skillCosts';
import { geometryForCells } from './boardGeometry';
import { emptyBlocked } from './thermal';
import { lockBlocksPlacement } from './keysmith';
import { stomp as stompOf } from './blast';
import { plunderTargets as plunderTargetsOf } from './generic';
import { SHIKIGAMI_LIFE, shikigamiLandable } from './shikigami';
import { isGuarded } from './charge';
import { PG_HOLD_GAP, PLUNDER_CHAIN_MAX, RICH_REROLL_MAGIC, SH_BLAST_MIN, SH_BLESS_WEAK, SH_COMBO_REAL, SH_CURSE_MIN, SH_MAX, SH_PURGE_FREE, SH_RESERVE, SH_RICH_BLAST_MIN, SH_RICH_GUARD, STOMP_CHAIN_MAX } from './aiConstants';

export const planMethods = {

    /**
     * 帯電付与の対象。攻め=縦横隣接の(敵コマ数−自コマ数)、守り=ライフ0〜1の自コマが他の席のいない列で
     * 2つ以上(リーチ列なら3つ)の一部なら⚡の無敵で守る。大きいほうが MIN 以上なら撃つ。
     */
    /**
     * パーフェクトゲームの即勝ち計画: 撃った後の盤面で、自陣3つ+空き1つ(敵のコマが無い)の列ができれば、その空きマスと、撃つまでに払うスキル
     * （魔力が足りなければ、届く軽減札を先に撃つ）を返す。無ければ null
     */
    planPerfectGameWin(this: AIPlayer, board: SquareInfo[], magic: number, costs: Record<keyof SkillCosts, number>, availableSkills: number[]): { move: number; clicks: { skill: string }[] } | null {
        const post = board.map((sq) => ({ ...sq, effects: [...sq.effects] }));
        perfectGame(post, this.characters);
        let move: number | null = null;
        for (const line of geometryForCells(board.length).winLines) {
            const mine = line.filter((i) => post[i].player === this.playerSymbol).length;
            const empty = line.filter((i) => !post[i].player);
            if (mine === 3 && empty.length === 1) { move = empty[0]; break; }
        }
        if (move === null) return null;
        const pg = this.calculateAICost(costs.onClickPerfectGame, false, false, 'onClickPerfectGame');
        if (magic >= pg) return { move, clicks: [{ skill: 'onClickPerfectGame' }] };
        const reducers = [
            { idx: 58, key: 'onClickClearance' as const, cut: 7 },
            { idx: 60, key: 'onClickCounterMarkdown' as const, cut: 3 },
            { idx: 53, key: 'onClickMarkdown' as const, cut: 3 },
        ];
        for (const r of reducers) {
            if (!availableSkills.includes(r.idx)) continue;
            const rc = this.calculateAICost(costs[r.key], false, false, r.key);
            if (magic >= rc + Math.max(1, pg - r.cut)) return { move, clicks: [{ skill: r.key }, { skill: 'onClickPerfectGame' }] };
        }
        // 届かない: あと PG_HOLD_GAP 以内なら、次の手番で撃てるように他のスキルの支払いを控える
        if (magic >= pg - PG_HOLD_GAP) this.holdPG = pg;
        return null;
    },

    /**
     * ストンプを連打して、1手番のうちに4つ並べる計画。ストンプの中心には必ず自分のコマが置かれる（氷結中の空きマスを除く）ので、
     * 自陣でないマスの数がちょうど回数になる列のうち、最も回数が少ないものを選ぶ。実際にストンプを順に適用して列が自陣で揃うことを確かめる。
     * なければ null（maxCasts は魔力で撃てる回数）
     */
    planStompWin(this: AIPlayer, board: SquareInfo[], maxCasts: number, life: number): { centers: number[]; board: SquareInfo[] } | null {
        const cap = Math.min(maxCasts, STOMP_CHAIN_MAX);
        if (cap < 1) return null;
        const geo = geometryForCells(board.length);
        let best: { centers: number[]; board: SquareInfo[] } | null = null;
        for (const line of geo.winLines) {
            const need = line.filter((c) => board[c].player !== this.playerSymbol);
            if (need.length === 0 || need.length > cap || (best && need.length >= best.centers.length)) continue;
            const nb = board.map((sq) => ({ ...sq, effects: [...sq.effects] }));
            for (const c of need) stompOf(nb, c, this.playerSymbol, life);
            if (line.every((c) => nb[c].player === this.playerSymbol)) best = { centers: need, board: nb };
        }
        return best;
    },

    /** 追い剥ぎの連打で1列を揃える計画。列の自陣でないマスは、追い剥ぎできる(ライフ0の敵)か、最後の着手に使う空きマス1つだけ */
    planPlunderWin(this: AIPlayer, board: SquareInfo[], maxCasts: number): { cells: number[]; move: number } | null {
        const cap = Math.min(maxCasts, PLUNDER_CHAIN_MAX);
        const targets = new Set(plunderTargetsOf(board, this.playerSymbol, this.characters));
        let best: { cells: number[]; move: number } | null = null;
        for (const line of geometryForCells(board.length).winLines) {
            const need = line.filter((c) => board[c].player !== this.playerSymbol);
            const rob = need.filter((c) => targets.has(c));
            const rest = need.filter((c) => !targets.has(c));
            if (rob.length === 0 || rob.length > cap || rest.length !== 1) continue;
            const sq = board[rest[0]];
            if (sq.player || sq.effects.some((e) => e.effect === '🔑' || e.effect === '❄') || (best && rob.length >= best.cells.length)) continue;
            best = { cells: rob, move: rest[0] };
        }
        return best;
    },

    /** ヘイルメアリーで当選したスキルに対する、AIの対象クリックと着手 (target=null ならクリック不要) */
    planHailMary(this: AIPlayer, board: SquareInfo[], skillName: string, life: number): { target: number | null; move: number | null } {
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
    },


    /**
     * 百鬼夜行→式神一括の実コストの計画 (旧sim AI comboPlan)。特売(53)が手札にあれば、各スキルの前に特売を重ね撃ちして安くする
     * （特売は1魔力で次のスキルを-3、何回でも撃てる。下限1）
     */
    comboPlan(this: AIPlayer, board: SquareInfo[], costs: Record<keyof SkillCosts, number>, availableSkills: number[], assumeMd: boolean = false): { floodCasts: number; allCasts: number; total: number } {
        const md = (assumeMd && this.inDeck(53, availableSkills)) || availableSkills.includes(53) ? this.calculateAICost(costs.onClickMarkdown, false, false, 'onClickMarkdown') : Infinity;
        const best = (base: number): { m: number; total: number } => {
            let bm = 0, bt = base;
            for (let m = 1; m <= 4 && md !== Infinity; m++) {
                const t = m * md + Math.max(1, base - 3 * m);
                if (t < bt) { bt = t; bm = m; }
            }
            return { m: bm, total: bt };
        };
        const f = best(this.calculateAICost(costs.onClickShikigamiFlood, false, false, 'onClickShikigamiFlood'));
        // 式神一括は式神1体あたりのコスト。百鬼夜行のあとは『今の式神+埋まる空きマス』が全て対象になる
        const nAfterFlood = board.filter((sq) => (sq.player === this.playerSymbol && isShikigami(sq)) || shikigamiLandable(sq)).length;
        // 百鬼夜行で式神を置くと、以降のスキルは-1（陰陽師のパッシブ。旧sim AI comboPlan と同一）
        const a = best(Math.max(1, this.calculateAICost(costs.onClickShikigamiAll * Math.max(1, nAfterFlood), false, false, 'onClickShikigamiAll') - 1));
        return { floodCasts: f.m, allCasts: a.m, total: f.total + a.total };
    },

    /** 百鬼夜行→式神一括で（手札と魔力に関わらず）自分が勝つ盤面か (旧sim AI floodComboWins) */
    floodComboWins(this: AIPlayer, board: SquareInfo[]): boolean {
        const me = this.playerSymbol;
        const nb = board.map((sq) => (shikigamiLandable(sq) ? { player: me, bind: 0, effects: [] }
            : (sq.player === me && isShikigami(sq) ? { ...sq, effects: sq.effects.filter((e) => e.effect !== '📜') } : sq))) as SquareInfo[];
        return calculateWinner(lineSymbols(nb)) === me;
    },

    /**
     * 陰陽師の1手番の式神運用 (旧sim AI shikigamiTurn と同一)。陽で爆破できるなら転化して爆破、陰なら式神を置いて貯める。
     * 式神一括（手札に idx 71）は、通常のコマに戻して列が完成するようにコンボで組む。スキル→対象クリックの列と、それを反映した盤面を返す。何もしないなら null
     */
    planShikigami(this: AIPlayer, board: SquareInfo[], magic: number, costs: Record<keyof SkillCosts, number>, availableSkills: number[]): { clicks: { skill: string; target?: number }[]; board: SquareInfo[]; win: boolean } | null {
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
                const combo = this.comboPlan(b, costs, availableSkills);
                if (m >= combo.total) {
                    const nb: SquareInfo[] = b.map((sq) => (shikigamiLandable(sq) ? { player: me, bind: 0, effects: [] }
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
                const ownShiki = mine().length;
                const allCostFor = (n: number): number => this.calculateAICost(costs.onClickShikigamiAll * Math.max(1, n), false, false, 'onClickShikigamiAll'); // 式神1体あたり
                const toggleCost = costOf('onClickToggleYingYang');
                let bestLine: { empties: number[]; total: number } | null = null;
                for (const line of geometryForCells(b.length).winLines) {
                    let real = 0, shiki = 0, bad = false;
                    const empties: number[] = [];
                    for (const idx of line) {
                        const sq = b[idx];
                        if (sq.player === me) { if (isShikigami(sq)) shiki++; else real++; }
                        else if (sq.player) bad = true;
                        else if (emptyBlocked(sq) || lockBlocksPlacement(sq, this.character) || this.shield.has(idx)) bad = true;
                        else empties.push(idx);
                    }
                    if (bad || shiki + empties.length === 0) continue;
                    // 通常コマが1つも無い列は、魔力に大きな余裕があるときだけ（式神を4つ置いて一括で通常コマにする）
                    if (real < SH_COMBO_REAL && m < RICH_REROLL_MAGIC) continue;
                    // 式神を置く手番は全スキル-1（陰陽師のパッシブ）: 設置は各1安く、式神一括も1安い
                    const placeSum = empties.length * placeCost; // 設置自身も-1（calculateAICost が含む）
                    const allSum = empties.length > 0 ? Math.max(1, allCostFor(ownShiki + empties.length) - 1) : allCostFor(ownShiki + empties.length);
                    const total = placeSum + allSum + (empties.length > 0 && mode === 'yang' ? toggleCost : 0);
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
            // 魔力が大きく余るときは、爆破の価値が低くても、置く→爆破を繰り返す（爆破で空いたマスにまた式神を置ける）
            const rich = magic >= RICH_REROLL_MAGIC;
            for (let guard = 0; guard < (rich ? SH_RICH_GUARD : 3); guard++) {
                const own = mine();
                const best = own.map((i) => ({ i, v: this.blastValue(b, i) })).sort((x, y) => y.v - x.v)[0];
                const worth = !!best && best.v >= (rich ? SH_RICH_BLAST_MIN : SH_BLAST_MIN);
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
                // 式神の加護(88)/呪詛(89)/供犠(91): 消費する式神は爆破価値の低いものから (旧sim AI shikigamiSpecials と同一)
                if (own.length > 0) {
                    const cheapest = (): number => own.map((i) => ({ i, v: this.blastValue(b, i) })).sort((x, y) => x.v - y.v)[0].i;
                    const guarded = (sq: SquareInfo): boolean => isGuarded(sq, this.characters);
                    const foes = (pred: (sq: SquareInfo) => boolean): number[] => b.map((sq, i) => (sq.player && sq.player !== me && !isShikigami(sq) && !guarded(sq) && pred(sq) ? i : -1)).filter((i) => i >= 0);
                    const purgeTs = foes((sq) => sq.bind > 0);
                    if (availableSkills.includes(91) && own.length >= SH_PURGE_FREE && purgeTs.length > 0) {
                        const target = purgeTs.map((i) => ({ i, v: b[i].bind })).sort((x, y) => y.v - x.v || x.i - y.i)[0].i;
                        clicks.push({ skill: 'onClickShikigamiPurge', target });
                        b[target] = { ...b[target], bind: 0 };
                        break; // 壊す式神がランダムなので、このターンの式神運用はここまで
                    }
                    const cost = (key: 'onClickShikigamiCurse' | 'onClickShikigamiBless'): number => this.calculateAICost(costs[key], false, false, key);
                    if (availableSkills.includes(89) && foes((sq) => sq.effects.length > 0).length >= SH_CURSE_MIN && m >= cost('onClickShikigamiCurse')) {
                        clicks.push({ skill: 'onClickShikigamiCurse', target: cheapest() });
                        break;
                    }
                    if (availableSkills.includes(88) && m >= cost('onClickShikigamiBless')) {
                        const ownReal = b.map((sq, i) => (sq.player === me && !isShikigami(sq) ? i : -1)).filter((i) => i >= 0);
                        if (ownReal.length >= 3 && ownReal.filter((i) => b[i].bind <= SH_BLESS_WEAK).length >= 2) {
                            clicks.push({ skill: 'onClickShikigamiBless', target: cheapest() });
                            break;
                        }
                    }
                }
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
    },
};
export type PlanMethods = typeof planMethods;
