// 自動生成: src/components/game/shikigami.ts (node scripts/gen-sim-shared.js)。手で編集しない。
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.purge = exports.curse = exports.bless = exports.blast = exports.purgeTargets = exports.curseTargets = exports.blessTargets = exports.ownShikigamiCells = exports.newShikigami = exports.SHIKIGAMI_CURSE_STACKS = exports.SHIKIGAMI_BLESS_LIFE = exports.SHIKIGAMI_BLAST_DAMAGE = exports.SHIKIGAMI_LIFE = void 0;
const boardGeometry_1 = require("./boardGeometry");
const charge_1 = require("./charge");
const poison_1 = require("./poison");
const thermal_1 = require("./thermal");
const util_1 = require("./util");
/** 式神を置いたときのライフ */
exports.SHIKIGAMI_LIFE = 2;
/** 爆破が周囲の敵コマに与えるダメージ（0になったら破壊） */
exports.SHIKIGAMI_BLAST_DAMAGE = 4;
/** 式神の加護: 自陣のコマ全てに足すライフ */
exports.SHIKIGAMI_BLESS_LIFE = 3;
/** 式神の呪詛: エフェクトの乗った敵コマ1つに付ける☠の数 */
exports.SHIKIGAMI_CURSE_STACKS = 2;
const newShikigami = (player, bind = exports.SHIKIGAMI_LIFE) => ({ player, bind, effects: [{ effect: '📜' }] });
exports.newShikigami = newShikigami;
const empty = () => ({ player: undefined, bind: 0, effects: [] });
/** player の式神のあるマス */
const ownShikigamiCells = (board, player) => board.map((sq, i) => (sq.player === player && (0, util_1.isShikigami)(sq) ? i : -1)).filter((i) => i !== -1);
exports.ownShikigamiCells = ownShikigamiCells;
/** 加護の対象: 自陣のコマ（式神を除く） */
const blessTargets = (board, player) => board.map((sq, i) => (sq.player === player && !(0, util_1.isShikigami)(sq) ? i : -1)).filter((i) => i !== -1);
exports.blessTargets = blessTargets;
/** 呪詛の対象: エフェクトが乗っている敵のコマ（式神・🔑ロック・⚡無敵を除く） */
const curseTargets = (board, player, chars) => board.map((sq, i) => (sq.player && sq.player !== player && !(0, util_1.isShikigami)(sq) && sq.effects.length > 0 && !(0, charge_1.isGuarded)(sq, chars) ? i : -1)).filter((i) => i !== -1);
exports.curseTargets = curseTargets;
/** 供犠の対象: ライフの残った敵のコマ（式神・🔑ロック・⚡無敵を除く） */
const purgeTargets = (board, player, chars) => board.map((sq, i) => (sq.player && sq.player !== player && !(0, util_1.isShikigami)(sq) && sq.bind > 0 && !(0, charge_1.isGuarded)(sq, chars) ? i : -1)).filter((i) => i !== -1);
exports.purgeTargets = purgeTargets;
/** 自分の式神 i を爆破: 式神は消え、周囲8マスの敵陣に4ダメージ（氷結なら解除だけ・🔥なら1.5倍。0になったら破壊）、空きマスは式神になる。board を直接書き換える */
const blast = (board, i, player, chars) => {
    board[i] = empty();
    const affected = [];
    const broken = [];
    let destroyed = 0;
    for (const j of (0, boardGeometry_1.geometryForCells)(board.length).surroundRange(i)) {
        const sq = board[j];
        if (!sq.player) {
            if (!(0, thermal_1.emptyBlocked)(sq)) {
                board[j] = (0, exports.newShikigami)(player);
                affected.push(j);
            }
            continue;
        }
        if (sq.player === player || (0, charge_1.isGuarded)(sq, chars))
            continue;
        const hit = (0, thermal_1.applyDamage)(sq, exports.SHIKIGAMI_BLAST_DAMAGE, 'skill');
        if (hit.blocked) {
            board[j] = hit.sq;
            broken.push(j);
            continue;
        }
        affected.push(j);
        if (hit.sq.bind < 1) {
            board[j] = empty();
            destroyed++;
        }
        else
            board[j] = hit.sq;
    }
    return { affected, broken, destroyed };
};
exports.blast = blast;
/** 加護: 式神 i を消費して、自陣のコマ全て（式神を除く）のライフを+3する。ライフを足したマスを返す。board を直接書き換える */
const bless = (board, i, player) => {
    board[i] = empty();
    const targets = (0, exports.blessTargets)(board, player);
    for (const k of targets)
        board[k] = { ...board[k], bind: board[k].bind + exports.SHIKIGAMI_BLESS_LIFE };
    return targets;
};
exports.bless = bless;
/** 呪詛: 式神 i を消費して、エフェクトの乗った敵のコマ全てに☠を2つ付ける（1つずつ付けるので、毒使いのコマはライフが2回1.5倍になる）。対象のマスを返す。board を直接書き換える */
const curse = (board, i, player, chars) => {
    const targets = (0, exports.curseTargets)(board, player, chars);
    board[i] = empty(); // 消費する式神は自陣なので、対象は消費の前後で変わらない
    for (let n = 0; n < exports.SHIKIGAMI_CURSE_STACKS; n++)
        (0, poison_1.addPoison)(board, targets, chars);
    return targets;
};
exports.curse = curse;
/** 供犠: 敵のコマ i のライフを0にする（効果は残る）。board を直接書き換える */
const purge = (board, i) => {
    board[i] = { ...board[i], bind: 0 };
};
exports.purge = purge;
