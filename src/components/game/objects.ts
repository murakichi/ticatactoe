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
import { poisonStrike } from './poison';
import { shikigamiLandable } from './shikigami';
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
    costKey: 'onClickBigTree' | 'onClickDeadTree' | 'onClickSpring' | 'onClickFort' | 'onClickThundercloud' | 'onClickMarket' | 'onClickSanctuary' | 'onClickPoisonSwamp' | 'onClickWorkshop';
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
    /** 補強工事: 自陣のオブジェクト1つに足すライフ */
    reinforceLife: 3,
    /** 増築: 自陣のオブジェクト全てに足すライフ */
    expandLife: 2,
} as const;

/** 設置したときのライフ（全種類共通） */
export const OBJECT_LIFE = 5;

/** 大工房: 軽減の対象になるスキルのベースコスト・軽減量・設置スキルが無料になる相手の手番の支出 */
export const WORKSHOP_PARAMS = { bigBase: 7, cut: 3, freeSpent: 7 } as const;

export const OBJECT_DEFS: Record<ObjectKind, ObjectDef> = {
    bigTree: { idx: 105, name: '大木', icon: '🌳', life: OBJECT_LIFE, costKey: 'onClickBigTree', desc: `手番開始時、マジック+${OBJECT_PARAMS.bigTreeMagic}。🔥を付けられると即座に壊れる` },
    deadTree: { idx: 106, name: '枯れた大木', icon: '🪵', life: OBJECT_LIFE, costKey: 'onClickDeadTree', desc: '手番開始時、周囲八マスのコマのうちランダムな1つに🍂を付ける。🔥を付けられると即座に壊れる' },
    spring: { idx: 107, name: '生命の泉', icon: '⛲', life: OBJECT_LIFE, costKey: 'onClickSpring', desc: `手番開始時のライフ期待値+${OBJECT_PARAMS.springLife}` },
    fort: { idx: 108, name: '砦', icon: '🏰', life: OBJECT_LIFE, costKey: 'onClickFort', desc: `手番開始時、周囲八マスの自陣のコマのライフ+${OBJECT_PARAMS.fortLife}` },
    thundercloud: { idx: 109, name: '雷雲', icon: '🌩️', life: OBJECT_LIFE, costKey: 'onClickThundercloud', desc: '手番開始時、周囲八マスのコマのうちランダムな1つに⚡を付ける' },
    market: { idx: 110, name: '市場', icon: '🏪', life: OBJECT_LIFE, costKey: 'onClickMarket', desc: '手番ごとに、市場の数だけシャッフル（手札の引き直し）が無料になる' },
    sanctuary: { idx: 111, name: '聖域', icon: '⛩️', life: OBJECT_LIFE, costKey: 'onClickSanctuary', desc: '周囲八マスの自陣のコマは、時間経過のライフ減衰を受けない' },
    poisonSwamp: { idx: 112, name: '毒沼', icon: '🐸', life: OBJECT_LIFE, costKey: 'onClickPoisonSwamp', desc: '手番開始時、周囲八マスの敵のコマのうちランダムな1つに☠を付ける' },
    workshop: { idx: 119, name: '大工房', icon: '🏭', life: OBJECT_LIFE, costKey: 'onClickWorkshop', desc: `働いている間、ベースコスト${WORKSHOP_PARAMS.bigBase}以上のスキルのコストを${WORKSHOP_PARAMS.cut}軽減する（重ならない）。設置スキルは、直前の相手の手番にベースコスト${WORKSHOP_PARAMS.bigBase}以上のスキルが使われたか、スキルに合計${WORKSHOP_PARAMS.freeSpent}以上のマジックが払われていたら0コスト` },
};

/** オブジェクトの設置先として選べるマスか（式神と同じ: 空きで、氷結中でも🔑ロック中でもない） */
export const objectLandable = (sq: SquareInfo): boolean => shikigamiLandable(sq) && !isObject(sq);

/** 種類 kind のオブジェクト。player のものとして、種類ごとのライフで置く */
export const newObject = (player: Player, kind: ObjectKind): SquareInfo => ({ player, bind: OBJECT_DEFS[kind].life, effects: [], object: kind });

/** 設置先に選べるマス全て（昇順） */
export const objectLandableCells = (board: SquareInfo[]): number[] => board.map((sq, i) => (objectLandable(sq) ? i : -1)).filter((i) => i !== -1);

/** 手番開始時に効果を発揮する、player のオブジェクトのマス（氷結中の休眠したものを除く。昇順） */
export const activeObjectCells = (board: SquareInfo[], player: Player, kind?: ObjectKind): number[] =>
    board.map((sq, i) => (sq.player === player && sq.object && (kind === undefined || sq.object === kind) && !isDormant(sq) ? i : -1)).filter((i) => i !== -1);

/** player に大工房が働いているか（ベースコスト7以上のスキルのコスト-3。重ならない。氷結中の休眠したものは働かない） */
export const workshopActive = (board: SquareInfo[], player: Player): boolean => activeObjectCells(board, player, 'workshop').length > 0;

/** player に働いている市場の数（手番ごとに、この回数だけシャッフルが無料。氷結中の休眠したものは数えない） */
export const marketCount = (board: SquareInfo[], player: Player): number => activeObjectCells(board, player, 'market').length;

/** 聖域に守られているマス: 働いている聖域の周囲八マスにある、その聖域の持ち主のコマ。時間経過のライフ減衰（自然減衰・満杯の追加減衰）を受けない。昇順 */
export const sanctuaryProtected = (board: SquareInfo[]): boolean[] => {
    const out = board.map(() => false);
    const geo = geometryForCells(board.length);
    board.forEach((sq, k) => {
        if (sq.object !== 'sanctuary' || !sq.player || isDormant(sq)) return;
        for (const j of geo.surroundRange(k)) if (board[j].player === sq.player) out[j] = true;
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

// ---- オブジェクトを壊す・強くするスキル（汎用スキル idx 113〜118）----
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
    demolish: { idx: 113, name: '解体', icon: '🧨', costKey: 'onClickDemolish', target: true, desc: '敵のオブジェクトを1つ選んで壊します（氷結中は❄が1つ減るだけ。🔑ロック・⚡無敵は除く）' },
    weather: { idx: 114, name: '風化', icon: '🌫️', costKey: 'onClickWeather', target: true, desc: '敵のオブジェクトを1つ選んで、ライフを0にします（壊れず、次の着手で乗っ取れるようになります。氷結中は❄が1つ減るだけ。🔑ロック・⚡無敵は除く）' },
    levelAll: { idx: 115, name: '地ならし', icon: '🚜', costKey: 'onClickLevelAll', target: false, desc: '敵のオブジェクトを全て壊します（氷結中は❄が1つ減るだけ。🔑ロック・⚡無敵は除く）' },
    reinforce: { idx: 116, name: '補強工事', icon: '🏗️', costKey: 'onClickReinforce', target: true, desc: `自陣のオブジェクトを1つ選んで、ライフを+${OBJECT_PARAMS.reinforceLife}します` },
    expandAll: { idx: 117, name: '増築', icon: '🧱', costKey: 'onClickExpandAll', target: false, desc: `自陣のオブジェクトの全てのライフを+${OBJECT_PARAMS.expandLife}します` },
    duplicate: { idx: 118, name: '分譲', icon: '🏘️', costKey: 'onClickDuplicate', target: true, desc: '自陣のオブジェクトを1つ選んで、同じ種類のオブジェクトをランダムな空きマスにもう1つ置きます（ライフは設置時の5）' },
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
 */
export const runObjectSkill = (skill: ObjectSkill, board: SquareInfo[], player: Player, chars: PlayerCharacters, i: number, rng: () => number = Math.random): ObjectSkillResult | null => {
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
            board[j] = { ...newObject(player, board[i].object as ObjectKind), effects: board[j].effects.filter((e) => e.effect === '🔥') };
            sweepBurntTrees(board);
            res.affected.push(j);
            break;
        }
    }
    return res;
};
