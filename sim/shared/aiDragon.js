// 自動生成: src/components/game/aiDragon.ts (node scripts/gen-sim-shared.js)。手で編集しない。
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dragonMethods = exports.cornerCuts = exports.PRAYER_MAX_PER_TURN = exports.DRAGON_EMPTY_RESERVE = exports.BUILDING_CAP = exports.ROAR_MIN_VICTIMS = void 0;
const boardGeometry_1 = require("./boardGeometry");
const dragon_1 = require("./dragon");
const objects_1 = require("./objects");
const ObjectKind_1 = require("./ObjectKind");
const aiConstants_1 = require("./aiConstants");
const charge_1 = require("./charge");
const thermal_1 = require("./thermal");
/** 咆哮を撃つ最小の巻き込み数 */
exports.ROAR_MIN_VICTIMS = 3;
/** 自陣の建造物の上限。建造物は列に数えないので、増やしすぎると自分の列を作るマスが無くなり、盤面が埋まって膠着する（sim で魔力1000超・盤面が建造物だらけの試合を確認） */
exports.BUILDING_CAP = 5;
/** 龍が祈りで建造物を増やすのをやめる空きマスの数。建造物は列に数えないので、盤が建造物で埋まると2本目の窓が潰れて膠着する（4x4 の対強豪 +9.4pt: seed21/31/41 で +7.4/+11.8/+8.9、対ネクロが主） */
exports.DRAGON_EMPTY_RESERVE = 4;
/** 1手番に祈りを重ねる上限（覚醒に必要な建造物の数） */
exports.PRAYER_MAX_PER_TURN = dragon_1.AWAKEN_BUILDINGS;
/** 盤の4つの角を斜めに切る4マスの組（囲める範囲が最大6マス） */
const cornerCuts = (size) => {
    const at = (r, c) => r * size + c;
    const d = 3;
    return [
        [0, 1, 2, 3].map((r) => at(r, d - r)),
        [0, 1, 2, 3].map((r) => at(r, size - 1 - d + r)),
        [0, 1, 2, 3].map((r) => at(size - 1 - r, d - r)),
        [0, 1, 2, 3].map((r) => at(size - 1 - r, size - 1 - d + r)),
    ];
};
exports.cornerCuts = cornerCuts;
const lockedEmpty = () => ({ player: undefined, bind: 0, effects: [{ effect: '🔑' }] });
exports.dragonMethods = {
    mikoBuildCell(real, me) {
        // 4つ目（覚醒する手）: 置き先の全候補を試し、囲みの中で消える敵のコマが多く、消える自分のコマが少ないマスを選ぶ。
        // 囲みの中のコマは敵味方を問わず消滅する（仕様）ので、自分のコマを巻き込まないようにする
        if ((0, dragon_1.ownBuildingCells)(real, me).length === dragon_1.AWAKEN_BUILDINGS - 1) {
            let best = null;
            for (let i = 0; i < real.length; i++) {
                if (!(0, objects_1.objectLandable)(real[i]))
                    continue;
                const hyp = real.map((sq, j) => (j === i ? { player: me, bind: 5, effects: [], object: 'fort' } : sq));
                const plan = (0, dragon_1.awakenPlan)(hyp, me);
                if (!plan)
                    continue;
                const ownLost = plan.enclosed.filter((j) => real[j].player === me && !(0, ObjectKind_1.isBuilding)(real[j])).length;
                const enemyGone = plan.enclosed.filter((j) => real[j].player && real[j].player !== me).length;
                const score = plan.n + 2 * enemyGone - 4 * ownLost;
                if (!best || score > best.score)
                    best = { cell: i, score };
            }
            if (best)
                return best.cell;
        }
        const size = Math.round(Math.sqrt(real.length));
        const mine = (i) => (0, ObjectKind_1.isBuilding)(real[i]) && real[i].player === me;
        let best = null;
        for (const cut of (0, exports.cornerCuts)(size)) {
            const have = cut.filter(mine).length;
            const open = cut.filter((i) => (0, objects_1.objectLandable)(real[i]));
            // 型の4マスのうち、建造物でも空きでもないマス（敵のコマなど）があれば、この型は作れない
            if (have + open.length < dragon_1.AWAKEN_BUILDINGS || open.length === 0)
                continue;
            // 角に近い（囲む範囲が広い）マスから置く。同点なら番号の小さいマス
            const cell = open[0];
            const score = have * 10 - cut.indexOf(cell);
            if (!best || score > best.score)
                best = { cell, score };
        }
        return best ? best.cell : null;
    },
    dragonBuildCell(real, me) {
        const geo = (0, boardGeometry_1.geometryForCells)(real.length);
        let best = null;
        for (let i = 0; i < real.length; i++) {
            if (!(0, objects_1.objectLandable)(real[i]))
                continue;
            const hit = geo.surroundRange(i).filter((j) => real[j].player && real[j].player !== me).length;
            if (hit > 0 && (!best || hit > best.hit))
                best = { cell: i, hit };
        }
        return best ? best.cell : null;
    },
    planDragon(args) {
        const plan = this.planDragonPlan(args);
        if (!plan || plan.skills.some((sk) => aiConstants_1.TURN_ENDING_SKILLS.includes(sk)))
            return plan;
        // 祈り・大岩・沈黙のあとに魔力が余るなら、手札のほかのスキル（トークン・ロックなど）も撃つ（余った魔力が溜まって決着しない試合があった）
        const masked = args[0].map((sq) => ((0, ObjectKind_1.isBuilding)(sq) ? lockedEmpty() : sq));
        const maskedArgs = [...args];
        maskedArgs[0] = masked;
        return this.extendPlan(plan, maskedArgs);
    },
    boltSilencePlan(args, real) {
        var _a;
        const magic = args[1];
        const costs = args[2];
        const available = args[5];
        const seatMagic = (_a = args[12]) !== null && _a !== void 0 ? _a : [];
        if (!available.includes(aiConstants_1.BOLT_SILENCE_IDX))
            return null;
        const masked = real.map((sq) => ((0, ObjectKind_1.isBuilding)(sq) ? lockedEmpty() : sq));
        if (this.opponents.some((o) => this.countReaches(masked, o) > 0))
            return null;
        const cost = this.calculateAICost(costs.onClickBoltSilence, false, false, 'onClickBoltSilence');
        const total = real.reduce((n, sq) => (sq.player === this.playerSymbol && !(0, thermal_1.isDormant)(sq) ? n + (0, charge_1.chargeStacks)(sq) : n), 0);
        if (total < charge_1.BOLT_SILENCE_BOLTS || magic < cost || !this.opponentsCanCastBig(real, seatMagic))
            return null;
        const targets = [];
        let b = real.map((sq) => ({ ...sq, effects: [...sq.effects] }));
        for (let k = 0; k < charge_1.BOLT_SILENCE_BOLTS; k++) {
            const t = this.boltSilenceTarget(b);
            if (t === null)
                return null;
            targets.push(t);
            const at = b[t].effects.findIndex((e) => e.effect === '⚡');
            b[t] = { ...b[t], effects: b[t].effects.filter((_, j) => j !== at) };
        }
        return { clicks: [{ skill: 'onClickBoltSilence', target: targets[0], target2: targets[1] }], cost };
    },
    planDragonPlan(args) {
        var _a;
        const silence = this.boltSilencePlan(args, args[0]);
        if (!silence)
            return this.planDragonCore(args);
        const rest = [...args];
        rest[1] = args[1] - silence.cost;
        const core = this.planDragonCore(rest);
        if (core)
            return { ...core, chargeClicks: [...silence.clicks, ...((_a = core.chargeClicks) !== null && _a !== void 0 ? _a : [])] };
        const masked = args[0].map((sq) => ((0, ObjectKind_1.isBuilding)(sq) ? lockedEmpty() : sq));
        const move = this.getBestMove(masked, args[4]);
        return { move, skills: move === null ? ['onClickCharge'] : [], chargeClicks: silence.clicks };
    },
    blockWithBoulders(args, real, masked) {
        const magic = args[1];
        const costs = args[2];
        const life = args[4];
        const available = args[5];
        const prayCost = this.calculateAICost(costs.onClickPrayer, false, false, 'onClickPrayer');
        const bcost = this.calculateAICost(costs.onClickBoulder, false, false, 'onClickBoulder');
        const hasBoulder = available.includes(objects_1.OBJECT_DEFS.boulder.idx);
        const threats = Array.from(new Set(this.opponents.flatMap((o) => this.findThreatSquares(masked, o)))).filter((c) => (0, objects_1.objectLandable)(real[c]));
        const clicks = [];
        const post = masked.map((sq) => ({ ...sq, effects: [...sq.effects] }));
        let left = magic;
        // 祈りを優先する: 引いた建造物はどれも空きマスをふさげる（置いた建造物は減衰せず、ライフ0でない敵には奪えない）。種類は選べないが、置き先は選べる。
        // 祈りで足りない分の脅威マスに、手札の大岩（コスト1・2ターンのロック付き）を置く
        let prayers = 0;
        let room = exports.BUILDING_CAP - (0, dragon_1.ownBuildingCells)(real, this.playerSymbol).length;
        for (const c of threats) {
            if (room <= 0)
                break;
            room--;
            if (prayers < exports.PRAYER_MAX_PER_TURN && left >= prayCost && (0, dragon_1.prayerUsable)(real, this.deck)) {
                clicks.push({ skill: 'onClickPrayer', target: c });
                left -= prayCost;
                prayers++;
            }
            else if (hasBoulder && left >= bcost) {
                clicks.push({ skill: 'onClickBoulder', target: c });
                left -= bcost;
            }
            else
                continue;
            post[c] = lockedEmpty();
        }
        if (clicks.length === 0)
            return null;
        const followup = this.getBestMove(post, life);
        return { move: followup, skills: followup === null ? ['onClickCharge'] : [], chargeClicks: clicks };
    },
    planDragonCore(args) {
        const real = args[0];
        const magic = args[1];
        const costs = args[2];
        const life = args[4];
        const me = this.playerSymbol;
        const masked = real.map((sq) => ((0, ObjectKind_1.isBuilding)(sq) ? lockedEmpty() : sq));
        // 相手にリーチがあるとき: 手札に大岩があれば、相手の即勝ちマス（リーチの要の空きマス）に大岩を置いて塞ぐ。
        // 大岩は建造物なので覚醒の4つに数えられる（妨害しながら覚醒に近づく）。無ければ通常の防御・攻めの計画に任せる
        if (this.opponents.some((o) => this.countReaches(masked, o) > 0))
            return this.blockWithBoulders(args, real, masked);
        const deck = this.deck;
        const prayCost = this.calculateAICost(costs.onClickPrayer, false, false, 'onClickPrayer');
        const roarCost = this.calculateAICost(costs.onClickRoar, false, false, 'onClickRoar');
        const isDragon = this.dragonForm === 'dragon';
        // 龍: 敵が固まっていれば咆哮で焼き払う
        if (isDragon && (0, dragon_1.roarUsable)(real, me) && magic >= roarCost && (0, dragon_1.roarVictims)(real, me).length >= exports.ROAR_MIN_VICTIMS) {
            return { move: null, skills: ['onClickRoar'] };
        }
        // 龍: 覚醒の直後は自陣の建造物が無い（消滅した）。祈りで敵の固まりの隣に建造物を置き、同じ手番にそのまま咆哮を撃つ
        // （祈りは手番を終えず、咆哮は終える）。ふつうに2手番かけると、そのあいだに相手に列を揃えられて防壁が発動し、巫女に戻ってしまう
        if (isDragon && magic >= prayCost + roarCost && (0, dragon_1.prayerUsable)(real, deck) && (0, dragon_1.ownBuildingCells)(real, me).length < exports.BUILDING_CAP) {
            let best = null;
            for (let i = 0; i < real.length; i++) {
                if (!(0, objects_1.objectLandable)(real[i]))
                    continue;
                const hyp = real.map((sq, j) => (j === i ? { player: me, bind: 5, effects: [], object: 'fort' } : sq));
                const v = (0, dragon_1.roarVictims)(hyp, me).length;
                if (v >= exports.ROAR_MIN_VICTIMS && (!best || v > best.victims))
                    best = { cell: i, victims: v };
            }
            if (best)
                return { move: null, skills: ['onClickRoar'], chargeClicks: [{ skill: 'onClickPrayer', target: best.cell }] };
        }
        // 祈りで建造物を置く（巫女は覚醒の型へ、龍は敵の固まりの隣へ）。魔力が続く限り重ねる（1手番に最大4つ）
        const clicks = [];
        let left = magic;
        let cur = real.map((sq) => ({ ...sq, effects: [...sq.effects] }));
        if (isDragon && real.filter((sq) => !sq.player && !sq.object).length <= exports.DRAGON_EMPTY_RESERVE)
            return null;
        const maxPrayers = Math.min(isDragon ? 1 : exports.PRAYER_MAX_PER_TURN - (0, dragon_1.ownBuildingCells)(real, me).length, exports.BUILDING_CAP - (0, dragon_1.ownBuildingCells)(real, me).length);
        while (clicks.length < maxPrayers && left >= prayCost && (0, dragon_1.prayerUsable)(cur, deck)) {
            const cell = isDragon ? this.dragonBuildCell(cur, me) : this.mikoBuildCell(cur, me);
            if (cell === null)
                break;
            clicks.push({ skill: 'onClickPrayer', target: cell });
            left -= prayCost;
            cur = cur.map((sq, i) => (i === cell ? { player: me, bind: 5, effects: [], object: 'fort' } : sq));
        }
        if (clicks.length === 0)
            return null;
        const post = cur.map((sq) => ((0, ObjectKind_1.isBuilding)(sq) ? lockedEmpty() : sq));
        const followup = this.getBestMove(post, life);
        return { move: followup, skills: followup === null ? ['onClickCharge'] : [], chargeClicks: clicks };
    },
};
