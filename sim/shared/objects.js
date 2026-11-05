// 自動生成: src/components/game/objects.ts (node scripts/gen-sim-shared.js)。手で編集しない。
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runObjectSkill = exports.objectSkillUsable = exports.objectSkillTargets = exports.OBJECT_SKILL_KEYS = exports.OBJECT_SKILLS = exports.objectTurnStart = exports.sweepBurntTrees = exports.objectLifeBonus = exports.sanctuaryProtected = exports.marketCount = exports.workshopActive = exports.activeObjectCells = exports.objectLandableCells = exports.newObject = exports.objectLandable = exports.OBJECT_DEFS = exports.WORKSHOP_PARAMS = exports.OBJECT_LIFE = exports.OBJECT_PARAMS = exports.isTree = exports.isObject = exports.OBJECT_KINDS = void 0;
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
const ObjectKind_1 = require("./ObjectKind");
Object.defineProperty(exports, "OBJECT_KINDS", { enumerable: true, get: function () { return ObjectKind_1.OBJECT_KINDS; } });
Object.defineProperty(exports, "isObject", { enumerable: true, get: function () { return ObjectKind_1.isObject; } });
Object.defineProperty(exports, "isTree", { enumerable: true, get: function () { return ObjectKind_1.isTree; } });
const boardGeometry_1 = require("./boardGeometry");
const charge_1 = require("./charge");
const poison_1 = require("./poison");
const util_1 = require("./util");
const shikigami_1 = require("./shikigami");
const thermal_1 = require("./thermal");
/** 効果の数値。説明文もここから描画する（説明文と実装のズレ防止） */
exports.OBJECT_PARAMS = {
    /** 大木: 手番開始時のマジック */
    bigTreeMagic: 3,
    /** 生命の泉: その手番に置くコマのライフ期待値 */
    springLife: 2,
    /** 砦: 周囲八マスの自陣コマのライフ */
    fortLife: 1,
    /** 護符の社: 周囲八マスの自陣の式神1体につき手番開始時に得るマジックと、その上限 */
    shrineMagicCap: 3,
    /** 補強工事: 自陣のオブジェクト1つに足すライフ */
    reinforceLife: 3,
    /** 増築: 自陣のオブジェクト全てに足すライフ */
    expandLife: 2,
};
/** 設置したときのライフ（全種類共通） */
exports.OBJECT_LIFE = 5;
/** 大工房: 軽減の対象になるスキルのベースコスト・軽減量・設置スキルが無料になる相手の手番の支出 */
exports.WORKSHOP_PARAMS = { bigBase: 7, cut: 3, freeSpent: 7 };
exports.OBJECT_DEFS = {
    bigTree: { idx: 105, name: '大木', icon: '🌳', life: exports.OBJECT_LIFE, costKey: 'onClickBigTree', desc: `手番開始時、マジック+${exports.OBJECT_PARAMS.bigTreeMagic}。🔥を付けられると即座に壊れる` },
    deadTree: { idx: 106, name: '枯れた大木', icon: '🪵', life: exports.OBJECT_LIFE, costKey: 'onClickDeadTree', desc: '手番開始時、周囲八マスのコマのうちランダムな1つに🍂を付ける。🔥を付けられると即座に壊れる' },
    spring: { idx: 107, name: '生命の泉', icon: '⛲', life: exports.OBJECT_LIFE, costKey: 'onClickSpring', desc: `手番開始時のライフ期待値+${exports.OBJECT_PARAMS.springLife}` },
    fort: { idx: 108, name: '砦', icon: '🏰', life: exports.OBJECT_LIFE, costKey: 'onClickFort', desc: `手番開始時、周囲八マスの自陣のコマのライフ+${exports.OBJECT_PARAMS.fortLife}` },
    thundercloud: { idx: 109, name: '雷雲', icon: '🌩️', life: exports.OBJECT_LIFE, costKey: 'onClickThundercloud', desc: '手番開始時、周囲八マスのコマのうちランダムな1つに⚡を付ける' },
    market: { idx: 110, name: '市場', icon: '🏪', life: exports.OBJECT_LIFE, costKey: 'onClickMarket', desc: '手番ごとに、市場の数だけシャッフル（手札の引き直し）が無料になる' },
    sanctuary: { idx: 111, name: '聖域', icon: '⛩️', life: exports.OBJECT_LIFE, costKey: 'onClickSanctuary', desc: '周囲八マスの自陣のコマは、時間経過のライフ減衰を受けない' },
    poisonSwamp: { idx: 112, name: '毒沼', icon: '🐸', life: exports.OBJECT_LIFE, costKey: 'onClickPoisonSwamp', desc: '手番開始時、周囲八マスの敵のコマのうちランダムな1つに☠を付ける' },
    workshop: { idx: 120, name: '大工房', icon: '🏭', life: exports.OBJECT_LIFE, costKey: 'onClickWorkshop', desc: `働いている間、ベースコスト${exports.WORKSHOP_PARAMS.bigBase}以上のスキルのコストを${exports.WORKSHOP_PARAMS.cut}軽減する（重ならない）。設置スキルは、直前の相手の手番にベースコスト${exports.WORKSHOP_PARAMS.bigBase}以上のスキルが使われたか、スキルに合計${exports.WORKSHOP_PARAMS.freeSpent}以上のマジックが払われていたら0コスト` },
    barrierStone: { idx: 121, name: '結界石', icon: '🪨', life: exports.OBJECT_LIFE, costKey: 'onClickBarrierStone', desc: '周囲八マスの自陣の式神は、時間経過のライフ減衰を受けない' },
    amuletShrine: { idx: 122, name: '護符の社', icon: '⛩️', life: exports.OBJECT_LIFE, costKey: 'onClickAmuletShrine', desc: `手番開始時、周囲八マスの自陣の式神1体につきマジック+1（最大+${exports.OBJECT_PARAMS.shrineMagicCap}）` },
};
/** オブジェクトの設置先として選べるマスか（式神と同じ: 空きで、氷結中でも🔑ロック中でもない） */
const objectLandable = (sq) => (0, shikigami_1.shikigamiLandable)(sq) && !(0, ObjectKind_1.isObject)(sq);
exports.objectLandable = objectLandable;
/** 種類 kind のオブジェクト。player のものとして、種類ごとのライフで置く */
const newObject = (player, kind) => ({ player, bind: exports.OBJECT_DEFS[kind].life, effects: [], object: kind });
exports.newObject = newObject;
/** 設置先に選べるマス全て（昇順） */
const objectLandableCells = (board) => board.map((sq, i) => ((0, exports.objectLandable)(sq) ? i : -1)).filter((i) => i !== -1);
exports.objectLandableCells = objectLandableCells;
/** 手番開始時に効果を発揮する、player のオブジェクトのマス（氷結中の休眠したものを除く。昇順） */
const activeObjectCells = (board, player, kind) => board.map((sq, i) => (sq.player === player && sq.object && (kind === undefined || sq.object === kind) && !(0, thermal_1.isDormant)(sq) ? i : -1)).filter((i) => i !== -1);
exports.activeObjectCells = activeObjectCells;
/** player に大工房が働いているか（ベースコスト7以上のスキルのコスト-3。重ならない。氷結中の休眠したものは働かない） */
const workshopActive = (board, player) => (0, exports.activeObjectCells)(board, player, 'workshop').length > 0;
exports.workshopActive = workshopActive;
/** player に働いている市場の数（手番ごとに、この回数だけシャッフルが無料。氷結中の休眠したものは数えない） */
const marketCount = (board, player) => (0, exports.activeObjectCells)(board, player, 'market').length;
exports.marketCount = marketCount;
/** 減衰から守られているマス: 働いている聖域の周囲八マスにある持ち主のコマ全て、働いている結界石の周囲八マスにある持ち主の式神。時間経過のライフ減衰（自然減衰・満杯の追加減衰）を受けない */
const sanctuaryProtected = (board) => {
    const out = board.map(() => false);
    const geo = (0, boardGeometry_1.geometryForCells)(board.length);
    board.forEach((sq, k) => {
        if ((sq.object !== 'sanctuary' && sq.object !== 'barrierStone') || !sq.player || (0, thermal_1.isDormant)(sq))
            return;
        for (const j of geo.surroundRange(k)) {
            if (board[j].player !== sq.player)
                continue;
            if (sq.object === 'sanctuary' || (0, util_1.isShikigami)(board[j]))
                out[j] = true;
        }
    });
    return out;
};
exports.sanctuaryProtected = sanctuaryProtected;
/** player の働いている生命の泉1つにつき、その手番のライフ期待値に足す値の合計 */
const objectLifeBonus = (board, player) => (0, exports.activeObjectCells)(board, player, 'spring').length * exports.OBJECT_PARAMS.springLife;
exports.objectLifeBonus = objectLifeBonus;
/** 🔥が付いて壊れるはずの大木・枯れた大木を空きマスにして、壊れたマスを返す（ignite が先に壊すので、残っているのは🔥が直接付いたケースだけ）。board を直接書き換える */
const sweepBurntTrees = (board) => {
    const burnt = [];
    board.forEach((sq, k) => {
        if ((0, ObjectKind_1.isTree)(sq) && sq.effects.some((e) => e.effect === '🔥') && !sq.effects.some((e) => e.effect === '❄')) {
            board[k] = { player: undefined, bind: 0, effects: [] };
            burnt.push(k);
        }
    });
    return burnt;
};
exports.sweepBurntTrees = sweepBurntTrees;
/** 枯れた大木・雷雲の標的にできるコマ: 周囲八マスのコマのうち、🔑ロック・⚡無敵でないもの */
const randomTargets = (board, k, chars) => (0, boardGeometry_1.geometryForCells)(board.length)
    .surroundRange(k)
    .filter((j) => !!board[j].player && !(0, charge_1.isGuarded)(board[j], chars));
/**
 * player の手番開始時に、player の働いているオブジェクトが効果を発揮する（生命の泉は objectLifeBonus で別に足す）。
 * 席順に昇順のマスから順に処理する。board を直接書き換える（マスは新しく作って差し替える）。
 * @param rng [0,1) を返す乱数。sim が種付きの乱数を渡す
 */
const objectTurnStart = (board, player, chars, rng = Math.random) => {
    const res = { magic: 0, leaves: [], charged: [], fortified: [], poisoned: [] };
    const geo = (0, boardGeometry_1.geometryForCells)(board.length);
    for (const k of (0, exports.activeObjectCells)(board, player)) {
        switch (board[k].object) {
            case 'bigTree':
                res.magic += exports.OBJECT_PARAMS.bigTreeMagic;
                break;
            case 'deadTree': {
                const cands = randomTargets(board, k, chars);
                if (cands.length === 0)
                    break;
                const j = cands[Math.floor(rng() * cands.length)];
                board[j] = { ...board[j], effects: [...board[j].effects, { effect: '🍂' }] };
                res.leaves.push(j);
                break;
            }
            case 'thundercloud': {
                const cands = randomTargets(board, k, chars);
                if (cands.length === 0)
                    break;
                const j = cands[Math.floor(rng() * cands.length)];
                board[j] = (0, charge_1.addCharge)(board[j], chars);
                res.charged.push(j);
                break;
            }
            case 'amuletShrine': {
                const shikigami = geo.surroundRange(k).filter((j) => board[j].player === player && (0, util_1.isShikigami)(board[j])).length;
                res.magic += Math.min(exports.OBJECT_PARAMS.shrineMagicCap, shikigami);
                break;
            }
            case 'poisonSwamp': {
                const cands = geo.surroundRange(k).filter((j) => !!board[j].player && board[j].player !== player && !(0, charge_1.isGuarded)(board[j], chars));
                if (cands.length === 0)
                    break;
                const j = cands[Math.floor(rng() * cands.length)];
                board[j] = (0, poison_1.poisonStrike)({ ...board[j], effects: [...board[j].effects, { effect: '☠' }] }, chars);
                res.poisoned.push(j);
                break;
            }
            case 'fort':
                for (const j of geo.surroundRange(k)) {
                    if (board[j].player !== player)
                        continue;
                    board[j] = { ...board[j], bind: board[j].bind + exports.OBJECT_PARAMS.fortLife };
                    res.fortified.push(j);
                }
                break;
            default:
                break;
        }
    }
    return res;
};
exports.objectTurnStart = objectTurnStart;
exports.OBJECT_SKILLS = {
    demolish: { idx: 114, name: '解体', icon: '🧨', costKey: 'onClickDemolish', target: true, desc: '敵のオブジェクトを1つ選んで壊します（氷結中は❄が1つ減るだけ。🔑ロック・⚡無敵は除く）' },
    weather: { idx: 115, name: '風化', icon: '🌫️', costKey: 'onClickWeather', target: true, desc: '敵のオブジェクトを1つ選んで、ライフを0にします（壊れず、次の着手で乗っ取れるようになります。氷結中は❄が1つ減るだけ。🔑ロック・⚡無敵は除く）' },
    levelAll: { idx: 116, name: '地ならし', icon: '🚜', costKey: 'onClickLevelAll', target: false, desc: '敵のオブジェクトを全て壊します（氷結中は❄が1つ減るだけ。🔑ロック・⚡無敵は除く）' },
    reinforce: { idx: 117, name: '補強工事', icon: '🏗️', costKey: 'onClickReinforce', target: true, desc: `自陣のオブジェクトを1つ選んで、ライフを+${exports.OBJECT_PARAMS.reinforceLife}します` },
    expandAll: { idx: 118, name: '増築', icon: '🧱', costKey: 'onClickExpandAll', target: false, desc: `自陣のオブジェクトの全てのライフを+${exports.OBJECT_PARAMS.expandLife}します` },
    duplicate: { idx: 119, name: '分譲', icon: '🏘️', costKey: 'onClickDuplicate', target: true, desc: '自陣のオブジェクトを1つ選んで、同じ種類のオブジェクトをランダムな空きマスにもう1つ置きます（ライフは設置時の5）' },
};
// 型の確認用（OBJECT_SKILLS の各要素が ObjectSkillDef に合うこと）
const _check = exports.OBJECT_SKILLS;
void _check;
exports.OBJECT_SKILL_KEYS = Object.keys(exports.OBJECT_SKILLS);
const enemyObjects = (board, player, chars) => board.map((sq, i) => (sq.object && sq.player && sq.player !== player && !(0, charge_1.isGuarded)(sq, chars) ? i : -1)).filter((i) => i !== -1);
const ownObjects = (board, player) => board.map((sq, i) => (sq.object && sq.player === player ? i : -1)).filter((i) => i !== -1);
/**
 * マスを選ぶスキルの対象（昇順）。マスを選ばないスキルは空。
 * 解体・風化: 敵のオブジェクト（風化はライフが残るもの）のうち🔑ロック・⚡無敵でないもの / 補強工事: 自陣のオブジェクト / 分譲: 空きマスがあるときの自陣のオブジェクト
 */
const objectSkillTargets = (skill, board, player, chars) => {
    switch (skill) {
        case 'demolish': return enemyObjects(board, player, chars);
        case 'weather': return enemyObjects(board, player, chars).filter((i) => board[i].bind > 0);
        case 'reinforce': return ownObjects(board, player);
        case 'duplicate': return (0, exports.objectLandableCells)(board).length > 0 ? ownObjects(board, player) : [];
        default: return [];
    }
};
exports.objectSkillTargets = objectSkillTargets;
/** そのスキルを今使えるか（対象が無いと使えない） */
const objectSkillUsable = (skill, board, player, chars) => {
    if (exports.OBJECT_SKILLS[skill].target)
        return (0, exports.objectSkillTargets)(skill, board, player, chars).length > 0;
    return skill === 'levelAll' ? enemyObjects(board, player, chars).length > 0 : ownObjects(board, player).length > 0;
};
exports.objectSkillUsable = objectSkillUsable;
/** 敵のオブジェクトに「壊す」を試みる。氷結中なら壊れず❄が1つ減るだけ。board を直接書き換える */
const destroyOne = (board, i, res) => {
    const guard = (0, thermal_1.absorbDestroy)(board[i]);
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
const runObjectSkill = (skill, board, player, chars, i, rng = Math.random) => {
    const res = { destroyed: [], blocked: [], affected: [] };
    if (exports.OBJECT_SKILLS[skill].target && !(0, exports.objectSkillTargets)(skill, board, player, chars).includes(i))
        return null;
    switch (skill) {
        case 'demolish':
            destroyOne(board, i, res);
            break;
        case 'weather': {
            const guard = (0, thermal_1.absorbDestroy)(board[i]);
            if (guard.blocked) {
                board[i] = guard.sq;
                res.blocked.push(i);
            }
            else {
                board[i] = (0, thermal_1.zeroOut)(board[i]);
                res.affected.push(i);
            }
            break;
        }
        case 'levelAll':
            for (const k of enemyObjects(board, player, chars))
                destroyOne(board, k, res);
            break;
        case 'reinforce':
            board[i] = { ...board[i], bind: board[i].bind + exports.OBJECT_PARAMS.reinforceLife };
            res.affected.push(i);
            break;
        case 'expandAll':
            for (const k of ownObjects(board, player)) {
                board[k] = { ...board[k], bind: board[k].bind + exports.OBJECT_PARAMS.expandLife };
                res.affected.push(k);
            }
            break;
        case 'duplicate': {
            const empties = (0, exports.objectLandableCells)(board);
            const j = empties[Math.floor(rng() * empties.length)];
            board[j] = { ...(0, exports.newObject)(player, board[i].object), effects: board[j].effects.filter((e) => e.effect === '🔥') };
            (0, exports.sweepBurntTrees)(board);
            res.affected.push(j);
            break;
        }
    }
    return res;
};
exports.runObjectSkill = runObjectSkill;
