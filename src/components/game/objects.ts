// オブジェクト（空きマスに設置して使う建造物）の純粋ロジック。Game.tsx と sim/engine.js が同じ関数を呼ぶ (#289)。
//
// ルール
//  - 設置: 空きマス（氷結・🔑ロックで塞がれていないマス）に置く。持ち主 = 置いた席（SquareInfo.player）、ライフ = 種類ごとの OBJECT_DEFS[kind].life
//  - 列（勝利判定）には数えない（util.ts の lineSymbols）。ライフは時間経過で減らない（thermal.ts の decayTick / decay.ts の crowdedDecay）
//  - 乗っ取り: 自陣のオブジェクトは自分の通常のコマでいつでも乗っ取れる（placement.ts）。敵のオブジェクトはライフが0でないと乗っ取れない（ライフを削り切る攻撃でも0になるだけ）。
//    乗り方は選べる: 既定は自陣の通常のコマに置き換え（オブジェクトは消える）／選ぶと自分のオブジェクトとして奪う（placement.ts の asObject）
//  - エフェクトやスキルの効果は通常のコマと同じように受ける。氷結中のオブジェクトは休眠して効果を発揮しない
//  - 大木・枯れた大木は🔥を付けられると即座に壊れる（thermal.ts の ignite。念のため手番開始時に sweepBurntTrees でも掃除する）
//  - 手番開始時、持ち主の席のオブジェクトが objectTurnStart で効果を発揮する
import { ObjectKind, OBJECT_KINDS, isObject, isTree } from '../../types/ObjectKind';
import { Player } from '../../types/Player';
import { SquareInfo } from '../../types/SquareInfo';
import { geometryForCells } from './boardGeometry';
import { PlayerCharacters, addCharge, isGuarded } from './charge';
import { LIFE_BAN_PLACING_KEYS } from './lifeBan';
import { addLock } from './lock';
import { poisonStrike } from './poison';
import { calculateWinner, isShikigami, lineSymbols } from '../../util';
import { shikigamiLandable } from './shikigami';
import { clearLock } from './lock';
import { absorbDestroy, isDormant, zeroOut } from './thermal';

export { OBJECT_KINDS, isObject, isTree };
export type { ObjectKind };

export type ObjectDef = {
    /** 設置スキルの idx（deck.ts の SKILL_CATALOG） */
    idx: number;
    name: string;
    icon: string;
    /** 設置したときのライフ */
    life: number;
    /** スキル名(skillCosts のキー) */
    costKey: 'onClickBigTree' | 'onClickDeadTree' | 'onClickSpring' | 'onClickFort' | 'onClickThundercloud' | 'onClickMarket' | 'onClickSanctuary' | 'onClickPoisonSwamp' | 'onClickWorkshop' | 'onClickBarrierStone' | 'onClickAmuletShrine' | 'onClickLuckyCat' | 'onClickMudField' | 'onClickTongueKing' | 'onClickEightTrigrams' | 'onClickSoloSign' | 'onClickOneWord' | 'onClickBlindMonkey' | 'onClickBoulder';
    /** 手番開始時の効果(説明文) */
    desc: string;
};

/** 効果の数値。説明文もここから描画する（説明文と実装のズレ防止） */
export const OBJECT_PARAMS = {
    /** 大木: 手番開始時のマジック */
    bigTreeMagic: 3,
    /** 生命の泉: その手番に置くコマのライフ期待値 */
    springLife: 2,
    /** 砦: 周囲八マスの自陣コマのライフ */
    fortLife: 1,
    /** 護符の社: 周囲八マスの自陣の式神1体につき手番開始時に得るマジックと、その上限 */
    shrineMagicCap: 3,
    /** 招き猫: 持ち主のスキルコストの軽減（下限1） */
    luckyCatCut: 1,
    /** 補強工事: 自陣のオブジェクト1つに足すライフ */
    reinforceLife: 3,
    /** 増築: 自陣のオブジェクト全てに足すライフ */
    expandLife: 2,
} as const;

/** 設置したときのライフ（全種類共通） */
export const OBJECT_LIFE = 5;
/** 大岩を置くときに付く🔑ロックの残りターン数 */
export const BOULDER_LOCK_STACK = 2;

/** 大工房: 軽減の対象になるスキルのベースコスト・軽減量・設置スキルが無料になる相手の手番の支出 */
export const WORKSHOP_PARAMS = { bigBase: 7, cut: 3, freeSpent: 7 } as const;

export const OBJECT_DEFS: Record<ObjectKind, ObjectDef> = {
    bigTree: { idx: 105, name: '大木', icon: '🌳', life: OBJECT_LIFE, costKey: 'onClickBigTree', desc: '手番開始時にマジックを獲得' },
    deadTree: { idx: 106, name: '枯れた大木', icon: '🪵', life: OBJECT_LIFE, costKey: 'onClickDeadTree', desc: '手番開始時、周囲のコマに🍂を付与' },
    spring: { idx: 107, name: '生命の泉', icon: '⛲', life: OBJECT_LIFE, costKey: 'onClickSpring', desc: '手番開始時のライフが増加' },
    fort: { idx: 108, name: '砦', icon: '🏰', life: OBJECT_LIFE, costKey: 'onClickFort', desc: '手番開始時、周囲の自陣のコマのライフが増加' },
    thundercloud: { idx: 109, name: '雷雲', icon: '🌩️', life: OBJECT_LIFE, costKey: 'onClickThundercloud', desc: '手番開始時、周囲のコマに⚡を付与' },
    market: { idx: 110, name: '市場', icon: '🏪', life: OBJECT_LIFE, costKey: 'onClickMarket', desc: 'シャッフルが無料' },
    sanctuary: { idx: 111, name: '聖域', icon: '⛩️', life: OBJECT_LIFE, costKey: 'onClickSanctuary', desc: '周囲の自陣のコマのライフが減らない' },
    poisonSwamp: { idx: 112, name: '毒沼', icon: '🐸', life: OBJECT_LIFE, costKey: 'onClickPoisonSwamp', desc: '手番開始時、周囲の敵のコマに毒を付与' },
    workshop: { idx: 120, name: '大工房', icon: '🏭', life: OBJECT_LIFE, costKey: 'onClickWorkshop', desc: 'コストの高いスキルが安くなる' },
    barrierStone: { idx: 121, name: '結界石', icon: '🪨', life: OBJECT_LIFE, costKey: 'onClickBarrierStone', desc: '周囲の自陣の式神のライフが減らない' },
    amuletShrine: { idx: 122, name: '護符の社', icon: '⛩️', life: OBJECT_LIFE, costKey: 'onClickAmuletShrine', desc: '手番開始時、周囲の自陣の式神の数だけマジックを獲得' },
    luckyCat: { idx: 123, name: '招き猫', icon: '🐈', life: OBJECT_LIFE, costKey: 'onClickLuckyCat', desc: '自分のスキルのコストが低下' },
    mudField: { idx: 124, name: '泥田坊', icon: '🌾', life: OBJECT_LIFE, costKey: 'onClickMudField', desc: '相手がトークンで置くコマのライフが0' },
    tongueKing: { idx: 125, name: '閻魔の舌', icon: '👅', life: OBJECT_LIFE, costKey: 'onClickTongueKing', desc: '相手が自陣のコマにエフェクトを付けると、そのコマのライフが0' },
    eightTrigrams: { idx: 126, name: '八卦の陣', icon: '🔯', life: OBJECT_LIFE, costKey: 'onClickEightTrigrams', desc: '周囲が全て自陣のコマで埋まると勝利' },
    soloSign: { idx: 127, name: 'お一人様限りの札', icon: '🪧', life: OBJECT_LIFE, costKey: 'onClickSoloSign', desc: '相手は1ターンにコマを1つしか置けない' },
    oneWord: { idx: 128, name: '一言居士', icon: '🗿', life: OBJECT_LIFE, costKey: 'onClickOneWord', desc: '相手は1ターンにスキルを1つしか使えない' },
    unlockStone: { idx: 136, name: '解錠の碑（仮称）', icon: '🗝️', life: OBJECT_LIFE, costKey: 'onClickUnlockStone', desc: '設置したとき、周囲八マスのロックを全て解除する。働いている間、周囲八マスには新しくロックを掛けられない（手番の終わりに、その手番で付いたロックが消える）' },
    blindMonkey: { idx: 129, name: '見ざる地蔵', icon: '🙈', life: OBJECT_LIFE, costKey: 'onClickBlindMonkey', desc: '周囲にはエフェクトを付与できない' },
    boulder: { idx: 136, name: '大岩', icon: '⛰️', life: OBJECT_LIFE, costKey: 'onClickBoulder', desc: '効果は無く、2ターンのロック付きで設置される' },
};

/** オブジェクトを設置するスキルのコストキー（普請道楽の割引の対象） */
export const OBJECT_PLACE_KEYS: ReadonlySet<string> = new Set(Object.values(OBJECT_DEFS).map((d) => d.costKey));

/** player のオブジェクトが盤面にあるか（氷結中で休眠しているものも含む。普請道楽の入力） */
export const hasOwnObject = (board: SquareInfo[], player: Player): boolean => board.some((sq) => sq.object !== undefined && sq.player === player);

/** オブジェクトの設置先として選べるマスか（式神と同じ: 空きで、氷結中でも🔑ロック中でもない） */
export const objectLandable = (sq: SquareInfo): boolean => shikigamiLandable(sq) && !isObject(sq);

/** 種類 kind のオブジェクト。player のものとして、種類ごとのライフで置く。carried は空きマスから引き継ぐエフェクト（🔥） */
export const newObject = (player: Player, kind: ObjectKind, lifeBonus: number = 0, carried: SquareInfo['effects'] = []): SquareInfo => {
    const sq: SquareInfo = { player, bind: OBJECT_DEFS[kind].life + lifeBonus, effects: [...carried], object: kind };
    // 大岩は効果を持たず、2ターンのロック付きで置かれる（相手の邪魔と、オブジェクトに関わるギア・スキルの発動用）
    return kind === 'boulder' ? addLock(sq, BOULDER_LOCK_STACK) : sq;
};

/** 働いている（氷結で休眠していない）player のオブジェクトの数。地代の魔力の元 */
export const activeObjectCount = (board: SquareInfo[], player: Player): number => board.filter((sq) => sq.object !== undefined && sq.player === player && !isDormant(sq)).length;

/** 解錠の碑を cell に設置したとき: 周囲八マスの🔑ロックを全て解除する（持ち主を問わず）。解除したマスを返す。board を直接書き換える */
export const releaseAroundStone = (board: SquareInfo[], cell: number): number[] => {
    const freed: number[] = [];
    for (const j of geometryForCells(board.length).surroundRange(cell)) {
        const cleared = clearLock(board[j]);
        if (cleared !== board[j]) { board[j] = cleared; freed.push(j); }
    }
    return freed;
};

/** 設置先に選べるマス全て（昇順） */
export const objectLandableCells = (board: SquareInfo[]): number[] => board.map((sq, i) => (objectLandable(sq) ? i : -1)).filter((i) => i !== -1);

/** 手番開始時に効果を発揮する、player のオブジェクトのマス（氷結中の休眠したものを除く。昇順） */
export const activeObjectCells = (board: SquareInfo[], player: Player, kind?: ObjectKind): number[] =>
    board.map((sq, i) => (sq.player === player && sq.object && (kind === undefined || sq.object === kind) && !isDormant(sq) ? i : -1)).filter((i) => i !== -1);

// ---- 相手を縛るオブジェクト・招き猫・八卦の陣（idx 123〜129）----

/** actor の敵（持ち主が actor でない）の働いている kind のオブジェクトがあるか（氷結中の休眠したものは働かない） */
export const enemyObjectActive = (board: SquareInfo[], actor: Player, kind: ObjectKind): boolean =>
    board.some((sq) => sq.object === kind && !!sq.player && sq.player !== actor && !isDormant(sq));

/** player に招き猫が働いているか（自分のスキルのコスト-1。重ならない） */
export const luckyCatActive = (board: SquareInfo[], player: Player): boolean => activeObjectCells(board, player, 'luckyCat').length > 0;

/** 泥田坊: actor の敵に働いていれば、トークンのライフは0になる */
export const mudAdjustedBind = (board: SquareInfo[], actor: Player, bind: number): number => (enemyObjectActive(board, actor, 'mudField') ? 0 : bind);

/** 各マスのエフェクトの種類（手番の頭の盤面。手番の終わりに増えたエフェクトを調べるのに使う） */
export type EffectSnapshot = string[][];
export const effectSnapshot = (board: SquareInfo[]): EffectSnapshot => board.map((sq) => sq.effects.map((e) => e.effect));

export type EffectRuleResult = {
    /** 見ざる地蔵に付いたエフェクトを消されたマス */
    removed: number[];
    /** 閻魔の舌でライフが0になったマス */
    zeroed: number[];
};

/**
 * 手番の終わりに、その手番で付いたエフェクト（snapshot より増えた分）に対して働くオブジェクトの規則。board を直接書き換える。
 *  見ざる地蔵（周囲八マス・持ち主を問わず）: 増えたエフェクトを消す
 *  閻魔の舌（持ち主の敵の手番）: 手番の席のコマに増えたエフェクトがあれば、そのコマのライフを0にする
 * エフェクトの付与は約30か所に散らばり、付与の関数の多くはマス単位でしか呼ばれない。入口を1つにまとめる改修をせずに済むよう、手番の頭との差分で処理する
 * （付いた瞬間のダメージ — 🔥の1ダメージ・⚡の着地ダメージ・☠の倍率 — は残る）。
 * @param endPlayer 終わった手番の席
 */
export const enforceEffectRules = (board: SquareInfo[], snap: EffectSnapshot | null, endPlayer: Player): EffectRuleResult => {
    const res: EffectRuleResult = { removed: [], zeroed: [] };
    if (!snap) return res;
    const geo = geometryForCells(board.length);
    const quiet = board.map(() => false);
    board.forEach((sq, k) => {
        if (sq.object !== 'blindMonkey' || !sq.player || isDormant(sq)) return;
        for (const j of geo.surroundRange(k)) quiet[j] = true;
    });
    // 解錠の碑: 周囲八マスには新しくロックを掛けられない（持ち主を問わず）
    const unlocked = board.map(() => false);
    board.forEach((sq, k) => {
        if (sq.object !== 'unlockStone' || !sq.player || isDormant(sq)) return;
        for (const j of geo.surroundRange(k)) unlocked[j] = true;
    });
    const tongue = enemyObjectActive(board, endPlayer, 'tongueKing');
    board.forEach((sq, k) => {
        if (sq.effects.length === 0) return;
        const left = new Map<string, number>();
        for (const e of snap[k] ?? []) left.set(e, (left.get(e) ?? 0) + 1);
        const added: number[] = [];
        sq.effects.forEach((e, idx) => {
            const n = left.get(e.effect) ?? 0;
            if (n > 0) left.set(e.effect, n - 1);
            else added.push(idx);
        });
        if (added.length === 0) return;
        if (quiet[k]) {
            board[k] = { ...sq, effects: sq.effects.filter((_, idx) => !added.includes(idx)) };
            res.removed.push(k);
        } else if (unlocked[k] && added.some((idx) => sq.effects[idx].effect === '🔑')) {
            board[k] = { ...sq, effects: sq.effects.filter((e, idx) => !(added.includes(idx) && e.effect === '🔑')) };
            res.removed.push(k);
        } else if (tongue && sq.player === endPlayer && !sq.object) {
            board[k] = { ...sq, bind: 0 };
            res.zeroed.push(k);
        }
    });
    return res;
};

/** 八卦の陣で勝つ席と、その陣のマス（中心と周囲八マス）。周囲が八マス揃わない端のマスでは成立しない。いなければ undefined */
export const encircleWinner = (board: SquareInfo[]): { player: Player; cells: number[] } | undefined => {
    const geo = geometryForCells(board.length);
    for (let k = 0; k < board.length; k++) {
        const sq = board[k];
        if (sq.object !== 'eightTrigrams' || !sq.player || isDormant(sq)) continue;
        const ring = geo.surroundRange(k);
        if (ring.length === 8 && ring.every((j) => board[j].player === sq.player && !board[j].object && !isShikigami(board[j]))) return { player: sq.player, cells: [k, ...ring] };
    }
    return undefined;
};

/** 盤面の勝者: 4つ並び、なければ八卦の陣 */
export const boardWinner = (board: SquareInfo[]): Player | undefined => calculateWinner(lineSymbols(board)) ?? encircleWinner(board)?.player;

/** お一人様限りの札: コマを2つ以上置くスキル（1つでも使うと札に反する） */
export const ONE_PIECE_MULTI_KEYS: ReadonlySet<string> = new Set([
    'onClickDoubleToken', 'onClickBothToken', 'onClickDoubleChargeToken', 'onClickDoubleFlameToken', 'onClickDoubleFrostToken', 'onClickDoubleLeafToken', 'onClickBothLeafToken',
    'onClickShikigamiFlood', 'onClickTotalAssault', 'onClickNecromancy',
]);

/** player が非オブジェクトのコマを持つ数 */
export const ownPieceCount = (board: SquareInfo[], player: Player): number => board.filter((sq) => sq.player === player && !sq.object).length;

/** お一人様限りの札: この手番に新しいコマを置いたあとは、空きマスに置けない */
export const newPieceBlocked = (board: SquareInfo[], actor: Player, placedThisTurn: number): boolean =>
    placedThisTurn >= 1 && enemyObjectActive(board, actor, 'soloSign');

export type SkillRestrictInput = {
    board: SquareInfo[];
    actor: Player;
    /** コストキー(onClickXxx)。基本操作（チャージ・シャッフル・ロック）は渡さず basic を true にする */
    skillKey?: string;
    basic?: boolean;
    skillsThisTurn: number;
    placedThisTurn: number;
};

/** 相手のオブジェクトに縛られて、そのスキルを今は使えないか（一言居士: 1ターン1スキル／お一人様限りの札: コマを置くスキルを制限） */
export const skillRestricted = (i: SkillRestrictInput): boolean => {
    if (i.basic) return false;
    if (i.skillsThisTurn >= 1 && enemyObjectActive(i.board, i.actor, 'oneWord')) return true;
    if (i.skillKey && enemyObjectActive(i.board, i.actor, 'soloSign')) {
        if (ONE_PIECE_MULTI_KEYS.has(i.skillKey)) return true;
        if (i.placedThisTurn >= 1 && LIFE_BAN_PLACING_KEYS.has(i.skillKey)) return true;
    }
    return false;
};

/** player に大工房が働いているか（ベースコスト7以上のスキルのコスト-3。重ならない。氷結中の休眠したものは働かない） */
export const workshopActive = (board: SquareInfo[], player: Player): boolean => activeObjectCells(board, player, 'workshop').length > 0;

/** player に働いている市場の数（手番ごとに、この回数だけシャッフルが無料。氷結中の休眠したものは数えない） */
export const marketCount = (board: SquareInfo[], player: Player): number => activeObjectCells(board, player, 'market').length;

/** 減衰から守られているマス: 働いている聖域の周囲八マスにある持ち主のコマ全て、働いている結界石の周囲八マスにある持ち主の式神。時間経過のライフ減衰（自然減衰・満杯の追加減衰）を受けない */
export const sanctuaryProtected = (board: SquareInfo[]): boolean[] => {
    const out = board.map(() => false);
    const geo = geometryForCells(board.length);
    board.forEach((sq, k) => {
        if ((sq.object !== 'sanctuary' && sq.object !== 'barrierStone') || !sq.player || isDormant(sq)) return;
        for (const j of geo.surroundRange(k)) {
            if (board[j].player !== sq.player) continue;
            if (sq.object === 'sanctuary' || isShikigami(board[j])) out[j] = true;
        }
    });
    return out;
};

/** player の働いている生命の泉1つにつき、その手番のライフ期待値に足す値の合計 */
export const objectLifeBonus = (board: SquareInfo[], player: Player): number => activeObjectCells(board, player, 'spring').length * OBJECT_PARAMS.springLife;

/** 🔥が付いて壊れるはずの大木・枯れた大木を空きマスにして、壊れたマスを返す（ignite が先に壊すので、残っているのは🔥が直接付いたケースだけ）。board を直接書き換える */
export const sweepBurntTrees = (board: SquareInfo[]): number[] => {
    const burnt: number[] = [];
    board.forEach((sq, k) => {
        if (isTree(sq) && sq.effects.some((e) => e.effect === '🔥') && !sq.effects.some((e) => e.effect === '❄')) {
            board[k] = { player: undefined, bind: 0, effects: [] };
            burnt.push(k);
        }
    });
    return burnt;
};

export type ObjectTurnResult = {
    /** 手番開始時に得るマジック（大木） */
    magic: number;
    /** 🍂を付けられたマス（枯れた大木） */
    leaves: number[];
    /** ⚡を付けられたマス（雷雲） */
    charged: number[];
    /** ライフが増えたマス（砦） */
    fortified: number[];
    /** ☠を付けられたマス（毒沼） */
    poisoned: number[];
};

/** 枯れた大木・雷雲の標的にできるコマ: 周囲八マスのコマのうち、🔑ロック・⚡無敵でないもの */
const randomTargets = (board: SquareInfo[], k: number, chars: PlayerCharacters): number[] =>
    geometryForCells(board.length)
        .surroundRange(k)
        .filter((j) => !!board[j].player && !isGuarded(board[j], chars));

/**
 * player の手番開始時に、player の働いているオブジェクトが効果を発揮する（生命の泉は objectLifeBonus で別に足す）。
 * 席順に昇順のマスから順に処理する。board を直接書き換える（マスは新しく作って差し替える）。
 * @param rng [0,1) を返す乱数。sim が種付きの乱数を渡す
 */
export const objectTurnStart = (board: SquareInfo[], player: Player, chars: PlayerCharacters, rng: () => number = Math.random): ObjectTurnResult => {
    const res: ObjectTurnResult = { magic: 0, leaves: [], charged: [], fortified: [], poisoned: [] };
    const geo = geometryForCells(board.length);
    for (const k of activeObjectCells(board, player)) {
        switch (board[k].object) {
            case 'bigTree':
                res.magic += OBJECT_PARAMS.bigTreeMagic;
                break;
            case 'deadTree': {
                const cands = randomTargets(board, k, chars);
                if (cands.length === 0) break;
                const j = cands[Math.floor(rng() * cands.length)];
                board[j] = { ...board[j], effects: [...board[j].effects, { effect: '🍂' }] };
                res.leaves.push(j);
                break;
            }
            case 'thundercloud': {
                const cands = randomTargets(board, k, chars);
                if (cands.length === 0) break;
                const j = cands[Math.floor(rng() * cands.length)];
                board[j] = addCharge(board[j], chars);
                res.charged.push(j);
                break;
            }
            case 'amuletShrine': {
                const shikigami = geo.surroundRange(k).filter((j) => board[j].player === player && isShikigami(board[j])).length;
                res.magic += Math.min(OBJECT_PARAMS.shrineMagicCap, shikigami);
                break;
            }
            case 'poisonSwamp': {
                const cands = geo.surroundRange(k).filter((j) => !!board[j].player && board[j].player !== player && !isGuarded(board[j], chars));
                if (cands.length === 0) break;
                const j = cands[Math.floor(rng() * cands.length)];
                board[j] = poisonStrike({ ...board[j], effects: [...board[j].effects, { effect: '☠' }] }, chars);
                res.poisoned.push(j);
                break;
            }
            case 'fort':
                for (const j of geo.surroundRange(k)) {
                    if (board[j].player !== player) continue;
                    board[j] = { ...board[j], bind: board[j].bind + OBJECT_PARAMS.fortLife };
                    res.fortified.push(j);
                }
                break;
            default:
                break;
        }
    }
    return res;
};

// ---- オブジェクトを壊す・強くするスキル（汎用スキル idx 114〜119）----
// 壊す: 解体(敵のオブジェクト1つを壊す)・風化(敵のオブジェクト1つのライフを0にする)・地ならし(敵のオブジェクトを全て壊す)
// 強くする: 補強工事(自陣のオブジェクト1つのライフ+3)・増築(自陣のオブジェクト全てのライフ+2)・分譲(自陣のオブジェクト1つを複製してランダムな空きマスに置く)

export type ObjectSkillDef = {
    idx: number;
    name: string;
    icon: string;
    costKey: 'onClickDemolish' | 'onClickWeather' | 'onClickLevelAll' | 'onClickReinforce' | 'onClickExpandAll' | 'onClickDuplicate';
    /** true なら使ってからマスを選ぶ。false なら即座に発動する */
    target: boolean;
    desc: string;
};

export const OBJECT_SKILLS = {
    demolish: { idx: 114, name: '解体', icon: '🧨', costKey: 'onClickDemolish', target: true, desc: '敵のオブジェクトを1つ選んで破壊' },
    weather: { idx: 115, name: '風化', icon: '🌫️', costKey: 'onClickWeather', target: true, desc: '敵のオブジェクトを1つ選んで、ライフを0にする' },
    levelAll: { idx: 116, name: '地ならし', icon: '🚜', costKey: 'onClickLevelAll', target: false, desc: '敵のオブジェクトを全て破壊' },
    reinforce: { idx: 117, name: '補強工事', icon: '🏗️', costKey: 'onClickReinforce', target: true, desc: '自陣のオブジェクトを1つ選んで、ライフを増加' },
    expandAll: { idx: 118, name: '増築', icon: '🧱', costKey: 'onClickExpandAll', target: false, desc: '自陣のオブジェクトの全てのライフを増加' },
    duplicate: { idx: 119, name: '分譲', icon: '🏘️', costKey: 'onClickDuplicate', target: true, desc: '自陣のオブジェクトを1つ選んで、同じものをもう1つ設置' },
} as const;

// 型の確認用（OBJECT_SKILLS の各要素が ObjectSkillDef に合うこと）
const _check: Record<string, ObjectSkillDef> = OBJECT_SKILLS;
void _check;

export type ObjectSkill = keyof typeof OBJECT_SKILLS;
export const OBJECT_SKILL_KEYS = Object.keys(OBJECT_SKILLS) as ObjectSkill[];

const enemyObjects = (board: SquareInfo[], player: Player, chars: PlayerCharacters): number[] =>
    board.map((sq, i) => (sq.object && sq.player && sq.player !== player && !isGuarded(sq, chars) ? i : -1)).filter((i) => i !== -1);
const ownObjects = (board: SquareInfo[], player: Player): number[] =>
    board.map((sq, i) => (sq.object && sq.player === player ? i : -1)).filter((i) => i !== -1);

/**
 * マスを選ぶスキルの対象（昇順）。マスを選ばないスキルは空。
 * 解体・風化: 敵のオブジェクト（風化はライフが残るもの）のうち🔑ロック・⚡無敵でないもの / 補強工事: 自陣のオブジェクト / 分譲: 空きマスがあるときの自陣のオブジェクト
 */
export const objectSkillTargets = (skill: ObjectSkill, board: SquareInfo[], player: Player, chars: PlayerCharacters): number[] => {
    switch (skill) {
        case 'demolish': return enemyObjects(board, player, chars);
        case 'weather': return enemyObjects(board, player, chars).filter((i) => board[i].bind > 0);
        case 'reinforce': return ownObjects(board, player);
        case 'duplicate': return objectLandableCells(board).length > 0 ? ownObjects(board, player) : [];
        default: return [];
    }
};

/** そのスキルを今使えるか（対象が無いと使えない） */
export const objectSkillUsable = (skill: ObjectSkill, board: SquareInfo[], player: Player, chars: PlayerCharacters): boolean => {
    if (OBJECT_SKILLS[skill].target) return objectSkillTargets(skill, board, player, chars).length > 0;
    return skill === 'levelAll' ? enemyObjects(board, player, chars).length > 0 : ownObjects(board, player).length > 0;
};

export type ObjectSkillResult = {
    /** 壊れたマス */
    destroyed: number[];
    /** 氷結が身代わりになって守られたマス */
    blocked: number[];
    /** ライフが変わった・置かれたなど、効果が及んだマス */
    affected: number[];
};

/** 敵のオブジェクトに「壊す」を試みる。氷結中なら壊れず❄が1つ減るだけ。board を直接書き換える */
const destroyOne = (board: SquareInfo[], i: number, res: ObjectSkillResult): void => {
    const guard = absorbDestroy(board[i]);
    if (guard.blocked) {
        board[i] = guard.sq;
        res.blocked.push(i);
        return;
    }
    board[i] = { player: undefined, bind: 0, effects: [] };
    res.destroyed.push(i);
};

/**
 * オブジェクトのスキルを実行する。マスを選ぶスキルは i に選んだマス（対象でなければ何もせず null を返す）。board を直接書き換える。
 * @param rng 分譲の置き先の抽選用 [0,1)
 * @param lifeBonus 分譲で置くオブジェクトの初期ライフへの加算（頑丈な建材）
 */
export const runObjectSkill = (skill: ObjectSkill, board: SquareInfo[], player: Player, chars: PlayerCharacters, i: number, rng: () => number = Math.random, lifeBonus: number = 0): ObjectSkillResult | null => {
    const res: ObjectSkillResult = { destroyed: [], blocked: [], affected: [] };
    if (OBJECT_SKILLS[skill].target && !objectSkillTargets(skill, board, player, chars).includes(i)) return null;
    switch (skill) {
        case 'demolish':
            destroyOne(board, i, res);
            break;
        case 'weather': {
            const guard = absorbDestroy(board[i]);
            if (guard.blocked) {
                board[i] = guard.sq;
                res.blocked.push(i);
            } else {
                board[i] = zeroOut(board[i]);
                res.affected.push(i);
            }
            break;
        }
        case 'levelAll':
            for (const k of enemyObjects(board, player, chars)) destroyOne(board, k, res);
            break;
        case 'reinforce':
            board[i] = { ...board[i], bind: board[i].bind + OBJECT_PARAMS.reinforceLife };
            res.affected.push(i);
            break;
        case 'expandAll':
            for (const k of ownObjects(board, player)) {
                board[k] = { ...board[k], bind: board[k].bind + OBJECT_PARAMS.expandLife };
                res.affected.push(k);
            }
            break;
        case 'duplicate': {
            const empties = objectLandableCells(board);
            const j = empties[Math.floor(rng() * empties.length)];
            board[j] = newObject(player, board[i].object as ObjectKind, lifeBonus, board[j].effects.filter((e) => e.effect === '🔥'));
            sweepBurntTrees(board);
            res.affected.push(j);
            break;
        }
    }
    return res;
};
