// 自動生成: src/components/game/blast.ts (node scripts/gen-sim-shared.js)。手で編集しない。
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.judgeDayVictims = exports.judgeDay = exports.JUDGE_DAY_DAMAGE = exports.stomp = void 0;
const boardGeometry_1 = require("./boardGeometry");
const tokenAfter_1 = require("./tokenAfter");
const thermal_1 = require("./thermal");
const empty = () => ({ player: undefined, bind: 0, effects: [] });
/** ストンプ: i を中心とする範囲の敵コマ・空きマスのロックなどを全て破壊し、自陣のコマはライフ-5（氷結なら解除だけ・🔥は1.5倍）。
 *  中心が空きマス（氷結中でない）なら、自分のコマ（ライフ life）を置く */
const stomp = (board, i, player, life) => {
    const range = (0, boardGeometry_1.geometryForCells)(board.length).stompRange(i);
    let destroyed = 0;
    const broken = [];
    for (const idx of range) {
        if (board[idx].player === player) {
            board[idx] = (0, thermal_1.applyDamage)(board[idx], 5, 'skill').sq;
            continue;
        }
        const guard = (0, thermal_1.absorbDestroy)(board[idx]);
        if (guard.blocked) {
            board[idx] = guard.sq; // 氷結が身代わりになる
            broken.push(idx);
            continue;
        }
        if (board[idx].player)
            destroyed++;
        board[idx] = empty();
    }
    if (board[i].player === undefined && !(0, thermal_1.emptyBlocked)(board[i]))
        board[i] = { player, bind: life, effects: [] };
    return { range, destroyed, broken };
};
exports.stomp = stomp;
/** 審判の日のダメージ。ロックを外し氷結を解いたあとのコマに与える（ライフが0になったら破壊） */
exports.JUDGE_DAY_DAMAGE = 99;
/**
 * 審判の日。i を中心とする範囲（十字＋斜め。judgeRange）の各マスを、次の順に処理する（敵味方問わず）。
 *  - バッズ(🌱)のあるマス: 何もしない（コマも、ロック・氷結もそのまま）
 *  - バッズのないマス: すべてのエフェクト-99（ロック・氷結・炎・毒・⚡など全てが外れる。氷結は身代わりにならない）→ 99ダメージ（スキルのダメージ）
 *    → ライフ0は破壊（コマのない空きマスは、エフェクトが全て外れるだけ）
 *  - 中心: 敵のコマが残っていたら（バッズ付き・ダメージを受けきった）置かない。置くなら自分の🌱付きコマ（ライフ2）で、
 *    🔑ロック付き（lock を渡したとき。スタックは堅牢の鍵で延びる）。バッズ付きの🔑ロックのコマは次の審判の日でも壊れない
 * ダメージは thermal.ts の applyDamage('skill')（鍵師の封鎖の断と同じ関数）。
 * broken は氷結が解けたマス（演出用）
 */
const judgeDay = (board, i, player, lock) => {
    const range = (0, boardGeometry_1.geometryForCells)(board.length).judgeRange(i);
    let destroyed = 0;
    const broken = [];
    for (const idx of range) {
        const sq = board[idx];
        if (sq.effects.some((e) => e.effect === '🌱'))
            continue; // バッズのあるマスは対象外
        if ((0, thermal_1.isFrozen)(sq))
            broken.push(idx);
        const stripped = { ...sq, effects: [] }; // すべてのエフェクト-99
        if (!sq.player) {
            board[idx] = stripped;
            continue;
        }
        const hit = (0, thermal_1.applyDamage)(stripped, exports.JUDGE_DAY_DAMAGE, 'skill'); // 99ダメージ
        if (hit.sq.bind > 0) {
            board[idx] = hit.sq; // ダメージを受けきった（ライフが残る）なら破壊されない
            continue;
        }
        destroyed++; // ライフ0は破壊
        board[idx] = empty();
    }
    if (!board[i].player || board[i].player === player) {
        board[i] = { player, bind: 2, effects: [{ effect: '🌱' }] };
        if (lock)
            (0, tokenAfter_1.applyLockAt)(board, i, lock.gears, lock.seat);
    }
    return { range, destroyed, broken };
};
exports.judgeDay = judgeDay;
/** 審判の日を i に撃ったとき壊れる、コマのあるマス（元の持ち主つき）。board は書き換えない（AIの読み筋用） */
const judgeDayVictims = (board, i, player) => {
    const post = board.map((sq) => ({ ...sq, effects: sq.effects.slice() }));
    (0, exports.judgeDay)(post, i, player);
    const out = [];
    board.forEach((sq, k) => {
        if (sq.player && !post[k].player && k !== i)
            out.push({ cell: k, owner: sq.player });
        else if (sq.player && k === i && post[k].player !== sq.player)
            out.push({ cell: k, owner: sq.player });
    });
    return out;
};
exports.judgeDayVictims = judgeDayVictims;
