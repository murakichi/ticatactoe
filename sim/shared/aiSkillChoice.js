// 自動生成: src/components/game/aiSkillChoice.ts (node scripts/gen-sim-shared.js)。手で編集しない。
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.skillChoiceMethods = void 0;
// AIPlayer のメソッド群: スキルの選択（コストの見積もり・引き直し・ロックの選び方・手札から使う札の決定）
// メソッド本体は AIPlayer.ts から移しただけ（this は AIPlayer）。AIPlayer.ts がインターフェース統合とプロトタイプへの合成で戻す
const aiConstants_1 = require("./aiConstants");
const Player_1 = require("./Player");
const discount_1 = require("./discount");
const bigSkills_1 = require("./bigSkills");
const util_1 = require("./util");
const boardGeometry_1 = require("./boardGeometry");
const thermal_1 = require("./thermal");
const keysmith_1 = require("./keysmith");
const turn_1 = require("./turn");
const tokenSkills_1 = require("./tokenSkills");
const lifeBan_1 = require("./lifeBan");
const charge_1 = require("./charge");
const aiConstants_2 = require("./aiConstants");
/** 固有スキル・サイレンス・毒霧（相手リーチがなければ積極的に使う）。決まれば確定したスキル列を返し、そうでなければ null（次の段階へ） */
function chooseFinisherSkills(c) {
    const { board, costs, availableSkills, necroRemain, necroCost, assaultCost, proliferateActive, seatMagic, necroPay, mana, oppReaches, myPieces, spend } = c;
    // 夜の帳×対氷室: 氷室の番人の絶対零度（⚡の無敵を一斉に止める）を、撃てる魔力に届く手番だけ先回りで遅らせる。
    // 絶対零度の実コストは 10 − 氷結が作られた回数（下限1）。回数は相手から見えないので、盤面の❄の数で見積もる。
    // 次の手番の魔力が実コスト以上で、+3 しても届かなくならない（実コスト+3未満）ときだけ撃つ。他のスキルより先に払う（トークンで魔力を使い切ると撃てない）
    if (this.character === 'electrician' && availableSkills.includes(98)) {
        const frost = board.reduce((n, sq) => n + (0, thermal_1.frozenStacks)(sq), 0);
        const glacierCost = Math.max(1, aiConstants_2.GLACIER_COST - frost);
        const nextCryoMagic = this.opponents.filter((o) => this.characters[(0, Player_1.seatOf)(o)] === 'cryomancer').map((o) => { var _a; return ((_a = seatMagic[(0, Player_1.seatOf)(o)]) !== null && _a !== void 0 ? _a : 0) + 1; });
        if (nextCryoMagic.some((m) => m >= glacierCost && m < glacierCost + aiConstants_2.NIGHT_VEIL_RAISE)) {
            spend(this.calculateAICost(costs.onClickNightVeil, false, false, 'onClickNightVeil'), 'onClickNightVeil');
        }
    }
    // --- 固有スキル (相手リーチがなければ積極的に使う) ---
    if (oppReaches === 0) {
        // ネクロマンサー蘇生: 墓地が貯まり召喚が見込める or 吸収対象が複数いるなら発動
        if (this.character === 'necromancer' && necroRemain === 0 && mana.remaining >= necroPay) {
            const corpses = turn_1.NECROMANCY.baseCost - necroCost; // 軽減量=墓地の死体数=召喚数
            let absorbable = 0;
            for (const sq of board) {
                if (this.isEnemy(sq.player) && sq.bind >= 1 && sq.bind <= 4 && !sq.effects.some(e => e.effect === '🔑'))
                    absorbable++;
            }
            // 死体が1つでもあれば即発動 (旧sim AI と同一。A/B: 他キャラの勝率 -3〜-4.6pt)
            if (corpses >= 1 || absorbable >= 2)
                spend(necroPay, 'onClickNecromancy');
        }
        // 軍師: 全軍突撃 (実コストは「9−使用トークン×2」。calculateAICostの+2ペナルティは誤りなので使わない)
        if (this.character === 'tactician') {
            if (mana.remaining >= assaultCost && myPieces >= 2)
                spend(assaultCost, 'onClickTotalAssault');
        }
        // 増殖: 空きマスが残っていて、維持コストを数ターン払える余裕があるうちに回し始める
        // (発動が遅いほど盤面が埋まりループの旨味が減るため、序盤〜中盤限定)
        // 氷室の番人は使わない: 使った手番は、使わない手番より実戦勝率が -13.4pt、手札から外した次善の計画より -11.6pt
        // （n=32, SE 3.8, z=-3.1。sim/probe-skilluse.js）。氷結で盤面を止めるキャラに増殖の維持コストが重い
        if (!proliferateActive && availableSkills.includes(20) && this.character !== 'cryomancer') {
            const proliferateCost = this.calculateAICost(costs.onClickProliferate, false, false, 'onClickProliferate');
            const emptyCount = board.filter((sq) => !sq.player).length;
            if (mana.remaining >= proliferateCost + 1 && emptyCount >= 5) {
                spend(proliferateCost, 'onClickProliferate');
            }
        }
    }
    // サイレンス: 相手が次の手番に固有スキルを撃てそうなら先回りで封じる (自分に即勝ちがあるときは勝ち優先)
    // 毒霧: 毒使いが、敵コマが自コマより2つ以上多いとき撃つ（旧sim AI と同じ条件）
    if (this.character === 'poisoner' && availableSkills.includes(29)) {
        let mine = 0;
        let theirs = 0;
        for (const sq of board) {
            if (!sq.player || sq.effects.some((e) => e.effect === '🔑'))
                continue;
            if (sq.player === this.playerSymbol)
                mine++;
            else
                theirs++;
        }
        if (theirs >= 4 && theirs >= mine + 2)
            spend(this.calculateAICost(costs.onClickPoisonMist, false, true, 'onClickPoisonMist'), 'onClickPoisonMist');
    }
    if (oppReaches === 0 &&
        availableSkills.includes(28) &&
        this.countReaches(board, this.playerSymbol) === 0 &&
        this.opponents.some((o) => {
            var _a, _b;
            const seat = (0, Player_1.seatOf)(o);
            return ((_a = seatMagic[seat]) !== null && _a !== void 0 ? _a : 0) + 1 >= ((_b = aiConstants_2.EXCLUSIVE_MIN_MAGIC[this.characters[seat]]) !== null && _b !== void 0 ? _b : Infinity);
        })) {
        spend(this.calculateAICost(costs.onClickSilence, false, false, 'onClickSilence'), 'onClickSilence');
    }
    return null;
}
/** ターン終了系（劣勢時の破壊・封鎖など）。選ばれたらここで確定する。決まれば確定したスキル列を返し、そうでなければ null（次の段階へ） */
function chooseTurnEndingSkills(c) {
    const { board, magic, costs, opponentMagic, availableSkills, skills, mana, oppReaches, myPieces, oppHitTotal, geo, isLosing, spend } = c;
    // --- ターン終了系は単独で返す ---
    // Opiumはリーチ防御に使わない (bindを下げるだけで空きマスは塞げない)
    // → getBestMoveでブロック配置させる
    // 劣勢時の破壊系 (ターン終了するので、相手リーチ時は使わない→ブロック優先)
    // 魔力が有り余るとき(RICH_MAGIC以上残る)は劣勢でなくても撃つ（斜めの敵コマが自陣より多いときだけ。オピウムは敵コマが多いとき）
    const richFor = (cost) => mana.remaining >= cost + aiConstants_2.RICH_MAGIC;
    if (skills.length === 0 && oppReaches === 0 && (isLosing || richFor(this.calculateAICost(costs.onClickSlash, false, false, 'onClickSlash')))) {
        if (availableSkills.includes(5)) {
            let oppOn = 0, myOn = 0;
            for (const idx of geo.antiDiagonal) {
                if ((0, thermal_1.isFrozen)(board[idx]))
                    continue; // 氷結中は❄1つが身代わり（敵も自陣も無傷）
                if (this.isEnemy(board[idx].player) && !board[idx].effects.some(e => e.effect === '🔑'))
                    oppOn++;
                if (board[idx].player === this.playerSymbol && !board[idx].effects.some(e => e.effect === '🔑'))
                    myOn++;
            }
            if (oppOn > myOn)
                spend(this.calculateAICost(costs.onClickSlash, false, false, 'onClickSlash'), 'onClickSlash');
        }
        if (skills.length === 0 && availableSkills.includes(6)) {
            let oppOn = 0, myOn = 0;
            for (const idx of geo.mainDiagonal) {
                if ((0, thermal_1.isFrozen)(board[idx]))
                    continue;
                if (this.isEnemy(board[idx].player) && !board[idx].effects.some(e => e.effect === '🔑'))
                    oppOn++;
                if (board[idx].player === this.playerSymbol && !board[idx].effects.some(e => e.effect === '🔑'))
                    myOn++;
            }
            if (oppOn > myOn)
                spend(this.calculateAICost(costs.onClickBackSlash, false, false, 'onClickBackSlash'), 'onClickBackSlash');
        }
        if (skills.length === 0 && isLosing && availableSkills.includes(7) && opponentMagic >= 6) {
            spend(this.calculateAICost(costs.onClickTsunami, false, false, 'onClickTsunami'), 'onClickTsunami');
        }
    }
    // 空き家封じ（汎用 idx 133・ターンは続く）: 敵にリーチがあるとき、空きマス全てを2ターンロックして敵の次の手を止める。相手のリーチ1つにつきコスト-3
    // なので、リーチが多いほど安い。鍵師は空きマスのロックを無視して置けるので、撃ったあとにそのまま自分の手を打てる。自分にリーチがあるなら着手が先
    if (skills.length === 0 && availableSkills.includes(133) && oppReaches >= 1 && this.countReaches(board, this.playerSymbol) === 0) {
        const reaches = (0, keysmith_1.opponentReaches)(board, this.playerSymbol, this.seatCharacters());
        const vsCost = this.calculateAICost((0, keysmith_1.vacantSealBaseCost)(costs.onClickVacantSeal, reaches), false, false, 'onClickVacantSeal');
        // 鍵師以外は自分も置けなくなる（空きマスが全部ロック）ので、敵のリーチが2つ以上（1手で塞げない）のときだけ撃つ
        if (mana.remaining >= vsCost && (this.character === 'keysmith' || oppReaches >= 2))
            spend(vsCost, 'onClickVacantSeal');
    }
    // 鍵師の封鎖の断（ターン終了・固有スキルなので手札に依らない）: 払えれば撃つ（自分の手番は着手が先になるので、自分にリーチがあるときは撃たない）。
    // 自分にリーチがあるなら着手が先（鍵師は空きマスのロックを無視して置ける）
    if (this.character === 'keysmith' && skills.length === 0 && this.countReaches(board, this.playerSymbol) === 0) {
        const released = (0, keysmith_1.sealReleaseCells)(board, this.playerSymbol).length;
        const sealCost = this.calculateAICost((0, keysmith_1.sealBaseCost)(costs.onClickSeal, released), false, false, 'onClickSeal');
        // 払えれば撃つ。かつては『敵のリーチ2つ以上、または魔力に余裕かつ敵のロック2つ以上解除』に絞っていたが、ほぼ撃たれなかった（60試合で0回）。
        // 払えれば常に撃つ版は、対強豪平均 seed2/200: 18.0→22.6, seed3/200: 18.7→22.0（+4.6/+3.3pt）。撃った試合の勝率が高い（10試合中5勝）。条件を絞る案: 敵リーチ1つ以上は撃たれず（3回/60試合）、魔力に余裕(richFor)も2回/60試合
        if (mana.remaining >= sealCost)
            spend(sealCost, 'onClickSeal');
    }
    if (skills.length === 0 && oppReaches === 0 && availableSkills.includes(8)) {
        const opiumCost = this.calculateAICost(costs.onClickOpium, false, false, 'onClickOpium');
        if (richFor(opiumCost) && oppHitTotal >= aiConstants_2.RICH_OPIUM_MIN_HIT && oppHitTotal > myPieces)
            spend(opiumCost, 'onClickOpium');
    }
    // ターン終了スキルが選ばれていたらここで返す
    if (skills.some(s => aiConstants_2.TURN_ENDING_SKILLS.includes(s))) {
        this.lastSpent = magic - mana.remaining;
        this.lastSpent = magic - mana.remaining;
        return skills;
    }
    return null;
}
/** 準備スキル（配置前に足す。回復・バッズ・血清・魔女と雷霆の仕込み）。決まれば確定したスキル列を返し、そうでなければ null（次の段階へ） */
function choosePrepSkills(c) {
    const { board, costs, life, availableSkills, mana, spend } = c;
    // --- 準備スキル (配置前に追加) ---
    // ライフが低い時: AddLife で +3
    if (life <= 2 && availableSkills.includes(0)) {
        spend(this.calculateAICost(costs.onClickAddLife, false, false, 'onClickAddLife'), 'onClickAddLife');
    }
    // バッズ: コスト4で毎ターン+1マジック → 4ターン以上残りそうなら元が取れる
    if (availableSkills.includes(2)) {
        const budsCost = this.calculateAICost(costs.onClickBuds, false, false, 'onClickBuds');
        const emptyCount = board.filter(sq => !sq.player).length;
        const myBuds = board.filter(sq => sq.player === this.playerSymbol && sq.effects.some(e => e.effect === '🌱')).length;
        // 空きマスが多い(序盤〜中盤) かつ バッズが少ない時のみ
        if (mana.remaining >= budsCost && emptyCount >= 6 && myBuds < 3) {
            spend(budsCost, 'onClickBuds');
        }
    }
    // 血清: 自陣の毒で次の減衰までに消えそうなコマ(毒数>=bind)があれば除去
    // (ランダム枠に出ているときのみ)
    if (availableSkills.includes(17)) {
        const doomed = board.filter(sq => sq.player === this.playerSymbol && !(0, thermal_1.isDormant)(sq)
            && sq.effects.filter(e => e.effect === '☠').length >= Math.max(1, sq.bind)
            && sq.effects.some(e => e.effect === '☠')).length;
        if (doomed >= 1)
            spend(this.calculateAICost(costs.onClickSerum, false, true, 'onClickSerum'), 'onClickSerum');
    }
    // 凩の魔女: 落ち葉の置き土産（1コスト）で敵のコマに🍂を溜め、敵の🍂が3枚以上になったら焚きつけで🔥に変える。敵の🍂は魔女のコストを上げるが、パッシブで相殺される (旧sim AI と同一)
    if (this.character === 'witch') {
        const foeLeaves = board.reduce((n, sq) => (sq.player && sq.player !== this.playerSymbol ? n + sq.effects.filter((e) => e.effect === '🍂').length : n), 0);
        const guardedCell = (sq, i) => this.shield.has(i) || sq.effects.some((e) => e.effect === '🔑');
        if (availableSkills.includes(85) && foeLeaves >= 3 && (0, thermal_1.kindlingTargets)(board, this.playerSymbol, guardedCell).length > 0) {
            spend(this.calculateAICost(costs.onClickKindling, false, false, 'onClickKindling'), 'onClickKindling');
        }
        else if (availableSkills.includes(84) && foeLeaves < 3 && (0, thermal_1.leafDropTargets)(board, this.playerSymbol, guardedCell).length > 0) {
            spend(this.calculateAICost(costs.onClickLeafDrop, false, false, 'onClickLeafDrop'), 'onClickLeafDrop');
        }
    }
    // 雷霆の巫: 静電気の季節（3ターン設置する駒に⚡）と総毛立つ（自陣の⚡なしのコマが3つ以上のとき全てに⚡）。トークンより先に撃つ (旧sim AI と同一)
    if (this.character === 'electrician') {
        // 落雷は忘れた頃に: 自陣の⚡が3つ以上たまり、ダメージが通る敵のコマが2つ以上あるとき、全部放出して敵の全コマにダメージ（このあとで季節・総毛立つが⚡を付け直す）
        const ownBolts = board.reduce((n, sq) => (sq.player === this.playerSymbol ? n + (0, charge_1.chargeStacks)(sq) : n), 0);
        const hittable = board.filter((sq, i) => this.isEnemy(sq.player) && sq.bind > 0 && !(0, thermal_1.isFrozen)(sq) && !sq.effects.some((e) => e.effect === '🔑') && !this.shield.has(i)).length;
        if (availableSkills.includes(79) && ownBolts >= 3 && hittable >= 2) {
            spend(this.calculateAICost(costs.onClickRelease, false, false, 'onClickRelease'), 'onClickRelease');
        }
        if (availableSkills.includes(77) && !this.chargeBuffActive && board.filter((sq) => !sq.player).length >= 3) {
            spend(this.calculateAICost(costs.onClickChargeSeason, false, false, 'onClickChargeSeason'), 'onClickChargeSeason');
        }
        const bare = board.filter((sq) => sq.player === this.playerSymbol && !sq.effects.some((e) => e.effect === '🔑') && !sq.effects.some((e) => e.effect === '⚡')).length;
        if (availableSkills.includes(78) && bare >= 3) {
            spend(this.calculateAICost(costs.onClickBristle, false, false, 'onClickBristle'), 'onClickBristle');
        }
        // パーフェクトゲーム: 全コマを壊すが、⚡の無敵コマは残る。敵の壊れるコマが3つ以上あり、自分の壊れるコマより2つ以上多いとき撃つ（自陣のリーチを敵のコマが塞いでいて、壊せば同じ手番で勝てるときは、手番の先頭で撃つ: planPerfectGameWin）。
        // 総毛立つで自陣に⚡を付けてから撃つので、先に撃つ総毛立つより後ろに置く
        if (availableSkills.includes(102)) {
            const killed = (0, bigSkills_1.perfectGame)(board.map((sq) => ({ ...sq, effects: [...sq.effects] })), this.characters).destroyed;
            const foe = killed.filter((i) => this.isEnemy(board[i].player)).length;
            const mine = killed.length - foe;
            if (foe >= 3 && foe - mine >= 2) {
                spend(this.calculateAICost(costs.onClickPerfectGame, false, false, 'onClickPerfectGame'), 'onClickPerfectGame');
            }
        }
    }
    return null;
}
/** トークン系と氷結札（置くコマを決める）。決まれば確定したスキル列を返し、そうでなければ null（次の段階へ） */
function chooseTokenSkills(c) {
    const { board, costs, availableSkills, tokenUsed, mana, spend } = c;
    // --- トークン系 ---
    // 氷室の番人: 霜降り・氷結トークン系を使う (旧sim AI F.cryoCards と同一。環境勝率 seed2/200 で +9.1pt)
    const freeCells = (0, util_1.findEmptyIndexes)(board).length;
    const cryo = this.character === 'cryomancer' || this.character === 'poisoner'; // 毒使いも氷結札を使う(自陣の毒マスを凍らせる。sim F.cryoPoison)
    // 軍師も氷結札(霜降り・氷結トークン)を使う: 凍ったコマは☠🔥のダメージを受けず、毒使い・鍛冶師に強くなる (旧sim AI の taFrost=1。全相手 49.4→60.8%)
    const frostUse = cryo || this.character === 'tactician';
    if (frostUse && availableSkills.includes(48) && (0, thermal_1.frostfallTargets)(board, this.playerSymbol).length >= 2) {
        spend(this.calculateAICost(costs.onClickFrostfall, false, false, 'onClickFrostfall'), 'onClickFrostfall');
    }
    // 霜枯れ: 煉獄の鍛冶師が敵にいるとき、自陣の🍂マスを凍らせて🔥から守る（氷結中は🍂が休眠するので、2マス以上あるときだけ。旧sim AI と同一）
    if (availableSkills.includes(69) &&
        this.characters.some((c, seat) => seat !== (0, Player_1.seatOf)(this.playerSymbol) && c === 'pyromancer') &&
        (0, thermal_1.leafFrostTargets)(board, this.playerSymbol).filter((i) => !this.shield.has(i)).length >= 2) {
        spend(this.calculateAICost(costs.onClickLeafFrost, false, false, 'onClickLeafFrost'), 'onClickLeafFrost');
    }
    // 一寸の虫に魂なし: 壊せる（ライフ3以下の）敵コマが2個以上のとき撃つ。軽量トークンの魔女など低ライフのコマを撒く相手に効く (旧sim AI の smallFryMin=2)
    if (availableSkills.includes(92) && (0, lifeBan_1.smallFryTargets)(board, this.playerSymbol, this.characters).length >= 2) {
        spend(this.calculateAICost(costs.onClickSmallFry, false, false, 'onClickSmallFry'), 'onClickSmallFry');
    }
    // 対魔女の新スキル（トークン扱い）。旧sim AI の初霜・吹き寄せ・山焼き・無礼講と同じ判断
    const foeLeaves = board.reduce((n, sq) => (sq.player && sq.player !== this.playerSymbol ? n + (0, thermal_1.leafStacks)(sq) : n), 0);
    const canFirstFrost = availableSkills.includes(93) && (0, tokenSkills_1.firstFrostTargets)(board, this.playerSymbol, this.characters).length > 0;
    const canGather = availableSkills.includes(94) && freeCells > 0 && foeLeaves >= 2;
    const canBurnOff = availableSkills.includes(95) && (0, tokenSkills_1.burnOffTargets)(board, this.playerSymbol, this.characters).length >= 2;
    let freeTok = false;
    if (!tokenUsed && !this.tokenFree && availableSkills.includes(96)) {
        const best = Math.max(canFirstFrost ? this.calculateAICost(costs.onClickFirstFrost, true, false, 'onClickFirstFrost') : 0, canGather ? this.calculateAICost(costs.onClickGather, true, false, 'onClickGather') : 0, canBurnOff ? this.calculateAICost(costs.onClickBurnOff, true, false, 'onClickBurnOff') : 0);
        const freeCost = this.calculateAICost(costs.onClickFreeToken, false, false, 'onClickFreeToken');
        if (best > freeCost && mana.remaining >= freeCost && spend(freeCost, 'onClickFreeToken'))
            freeTok = true;
    }
    const tokCost = (c) => (freeTok ? 0 : c);
    let newToken = false;
    if (!tokenUsed) {
        const gc = tokCost(this.calculateAICost(costs.onClickGather, true, false, 'onClickGather'));
        const bc = tokCost(this.calculateAICost(costs.onClickBurnOff, true, false, 'onClickBurnOff'));
        const fc = tokCost(this.calculateAICost(costs.onClickFirstFrost, true, false, 'onClickFirstFrost'));
        if (canGather && mana.remaining >= gc && spend(gc, 'onClickGather'))
            newToken = true;
        else if (canBurnOff && mana.remaining >= bc && spend(bc, 'onClickBurnOff'))
            newToken = true;
        else if (canFirstFrost && mana.remaining >= fc && spend(fc, 'onClickFirstFrost'))
            newToken = true;
    }
    // 🍂落ち葉トークン: 自陣の🍂は相手全員のスキルコストを上げる。固有のトークン札を持つキャラ以外は、普通のトークンより先に撃つ
    const leafToken = !tokenUsed && !newToken && !cryo && this.character !== 'electrician' ? this.pickLeafToken(availableSkills, freeCells, mana.remaining, costs) : null;
    if (newToken) {
        // 新スキルのトークンを撃った（トークンはターンに1回）
    }
    else if (leafToken && spend(leafToken.cost, leafToken.skill)) {
        // 🍂付きのトークンを撃った（トークンはターンに1回）
    }
    else if (!tokenUsed) {
        if (this.character === 'poisoner' && availableSkills.includes(16) && mana.remaining >= this.calculateAICost(costs.onClickPoisonToken, true, true, 'onClickPoisonToken')) {
            spend(this.calculateAICost(costs.onClickPoisonToken, true, true, 'onClickPoisonToken'), 'onClickPoisonToken');
        }
        else if (this.character === 'yinYangMaster' && availableSkills.includes(72)
            && board.filter((sq) => sq.player === this.playerSymbol && (0, util_1.isShikigami)(sq)).length < aiConstants_2.SH_MAX
            && mana.remaining >= this.calculateAICost(costs.onClickShikigamiRandom, true, false, 'onClickShikigamiRandom') + aiConstants_2.SH_RESERVE) {
            spend(this.calculateAICost(costs.onClickShikigamiRandom, true, false, 'onClickShikigamiRandom'), 'onClickShikigamiRandom');
        }
        else if (frostUse && freeCells >= 4 && availableSkills.includes(46) && mana.remaining >= this.calculateAICost(costs.onClickDoubleFrostToken, true, false, 'onClickDoubleFrostToken')) {
            spend(this.calculateAICost(costs.onClickDoubleFrostToken, true, false, 'onClickDoubleFrostToken'), 'onClickDoubleFrostToken');
        }
        else if (frostUse && freeCells >= 3 && availableSkills.includes(45) && mana.remaining >= this.calculateAICost(costs.onClickFrostToken, true, false, 'onClickFrostToken')) {
            spend(this.calculateAICost(costs.onClickFrostToken, true, false, 'onClickFrostToken'), 'onClickFrostToken');
        }
        else if (this.character === 'electrician' && availableSkills.includes(23) && mana.remaining >= this.calculateAICost(costs.onClickDoubleChargeToken, true, false, 'onClickDoubleChargeToken')) {
            spend(this.calculateAICost(costs.onClickDoubleChargeToken, true, false, 'onClickDoubleChargeToken'), 'onClickDoubleChargeToken');
        }
        else if (this.character === 'electrician' && availableSkills.includes(21) && mana.remaining >= this.calculateAICost(costs.onClickChargeToken, true, false, 'onClickChargeToken')) {
            spend(this.calculateAICost(costs.onClickChargeToken, true, false, 'onClickChargeToken'), 'onClickChargeToken');
        }
        else if (this.character === 'tactician') {
            if (availableSkills.includes(11) && mana.remaining >= this.calculateAICost(costs.onClickDoubleToken, true, false, 'onClickDoubleToken')) {
                spend(this.calculateAICost(costs.onClickDoubleToken, true, false, 'onClickDoubleToken'), 'onClickDoubleToken');
            }
            else if (availableSkills.includes(9) && mana.remaining >= this.calculateAICost(costs.onClickBudsToken, true, false, 'onClickBudsToken')) {
                spend(this.calculateAICost(costs.onClickBudsToken, true, false, 'onClickBudsToken'), 'onClickBudsToken');
            }
            else if (availableSkills.includes(3) && mana.remaining >= this.calculateAICost(costs.onClickToken, true, false, 'onClickToken')) {
                spend(this.calculateAICost(costs.onClickToken, true, false, 'onClickToken'), 'onClickToken');
            }
        }
        else {
            if (availableSkills.includes(11) && mana.remaining >= this.calculateAICost(costs.onClickDoubleToken, true, false, 'onClickDoubleToken')) {
                spend(this.calculateAICost(costs.onClickDoubleToken, true, false, 'onClickDoubleToken'), 'onClickDoubleToken');
            }
            else if (availableSkills.includes(9) && mana.remaining >= this.calculateAICost(costs.onClickBudsToken, true, false, 'onClickBudsToken')) {
                spend(this.calculateAICost(costs.onClickBudsToken, true, false, 'onClickBudsToken'), 'onClickBudsToken');
            }
            else if (availableSkills.includes(3) && mana.remaining >= this.calculateAICost(costs.onClickToken, true, false, 'onClickToken')) {
                spend(this.calculateAICost(costs.onClickToken, true, false, 'onClickToken'), 'onClickToken');
            }
        }
    }
    return null;
}
/** 余った魔力の使い道（ランダム帯電・裸の王様・火の車・夜の帳・毒返し・供物・ライフ上乗せ）。決まれば確定したスキル列を返し、そうでなければ null（次の段階へ） */
function chooseLeftoverSkills(c) {
    const { board, magic, costs, opponentMagic, availableSkills, necroRemain, necroCost, skills, mana, spend } = c;
    // 雷霆の巫: 他に撃つものが無く、魔力に余裕があるときだけランダム帯電（コスト+1 以上残る）
    if (this.character === 'electrician' && skills.length === 0 && availableSkills.includes(25)) {
        const rc = this.calculateAICost(costs.onClickChargeRandom, false, false, 'onClickChargeRandom');
        if (mana.remaining >= rc + aiConstants_2.CHARGE_RANDOM_MARGIN)
            spend(rc, 'onClickChargeRandom');
    }
    // 裸の王様: 相手の有効なギアが2つ以上ある、または自分に勝ち筋(リーチ)があって相手に使える土壇場の防壁があるとき、ギアを封じる (旧sim AI と同一)
    if (availableSkills.includes(76) &&
        ((this.oppLastStand && this.countReaches(board, this.playerSymbol) > 0) || this.oppGearCount >= 2)) {
        spend(this.calculateAICost(costs.onClickStrip, false, false, 'onClickStrip'), 'onClickStrip');
    }
    // 火の車: ランダムな敵マス2つに🔥、その後手札をシャッフルする。手札が変わるので、計画の最後に撃つ（このターン🔥を付与済みなら0コスト。旧sim AI と同一）
    if (availableSkills.includes(75) &&
        (0, thermal_1.fireWheelTargets)(board, this.playerSymbol, (sq, i) => this.shield.has(i) || sq.effects.some((e) => e.effect === '🔑')).length >= 2) {
        spend(this.calculateAICost(costs.onClickFireWheel, false, false, 'onClickFireWheel'), 'onClickFireWheel');
    }
    // 夜の帳: 次の相手の手番のスキルコストを+3。他に撃つものが無く、相手が高いスキルを撃てそうな魔力を持っているときだけ
    if (availableSkills.includes(98) && skills.length === 0 && opponentMagic >= aiConstants_2.NIGHT_VEIL_OPP_MAGIC) {
        spend(this.calculateAICost(costs.onClickNightVeil, false, false, 'onClickNightVeil'), 'onClickNightVeil');
    }
    // 毒返しの構え: 自陣のコマが3つ以上あり、構えが無く、他に撃つものが無いとき（壊されると毒付きのコマが返る）
    if (availableSkills.includes(100) && !this.wardActive && skills.length === 0 &&
        board.filter((sq) => sq.player === this.playerSymbol).length >= aiConstants_2.POISON_WARD_MIN_PIECES) {
        spend(this.calculateAICost(costs.onClickPoisonWard, false, false, 'onClickPoisonWard'), 'onClickPoisonWard');
    }
    // 墓守の供物: ネクロマンサーが、降霊が未発動で、自陣のコマが3つ以上・死体が3体以下のとき、最も弱いコマを供物にして死体と魔力を作る
    if (availableSkills.includes(101) && this.character === 'necromancer' && necroRemain === 0 && skills.length === 0 &&
        turn_1.NECROMANCY.baseCost - necroCost <= aiConstants_2.GRAVE_OFFERING_MAX_CORPSES &&
        board.filter((sq) => sq.player === this.playerSymbol).length >= aiConstants_2.GRAVE_OFFERING_MIN_PIECES) {
        spend(this.calculateAICost(costs.onClickGraveOffering, false, false, 'onClickGraveOffering'), 'onClickGraveOffering');
    }
    // 魔力が有り余るとき: 置くコマのライフを厚くする（ライフ+3 → 2倍の順。減衰で盤面が空になる長期戦でコマが残りやすくなる）
    if (mana.remaining >= aiConstants_2.RICH_MAGIC) {
        for (const [idx, key] of [[0, 'onClickAddLife'], [1, 'onClickBibine']]) {
            if (availableSkills.includes(idx) && !skills.includes(key))
                spend(this.calculateAICost(costs[key], false, false, key), key);
        }
    }
    this.lastSpent = magic - mana.remaining;
    return null;
}
const SKILL_PHASES = [chooseFinisherSkills, chooseTurnEndingSkills, choosePrepSkills, chooseTokenSkills, chooseLeftoverSkills];
exports.skillChoiceMethods = {
    /** 「あなた」: 相手が1キャラだけで、その相手向けに固定する札（YOU_HOLD_VS）か */
    holdsVsOpponent(idx) {
        var _a;
        const foes = this.characters.filter((_, seat) => seat !== (0, Player_1.seatOf)(this.playerSymbol));
        const kinds = Array.from(new Set(foes));
        return kinds.length === 1 && ((_a = aiConstants_1.YOU_HOLD_VS[kinds[0]]) !== null && _a !== void 0 ? _a : []).includes(idx);
    },
    chooseLocks(board, opponentMagic, life, availableSkills) {
        // A/B検証の結果、固有スキル依存のキャラ(巨人/魔法使い/陰陽師)はロックが柔軟性を削いで不利だったため無効化。
        // 有益だったキャラ(軍師=トークン固定 / あなた / ネクロ=中立)のみロックする。
        // 陰陽師は百鬼夜行(73)+式神一括(71)のコンボ札だけを手札に固定して、揃うまで持ち続ける（旧sim AI の floodLock=1）
        if (this.character === 'yinYangMaster') {
            const combo = availableSkills.filter((i) => i === 71 || i === 73 || i === 53); // 特売(53)もコンボの圧縮に使うので固定
            // 魔女戦: 一寸の虫に魂なし(92)を最優先で固定する（旧sim AI と同一。本番AI 対魔女 28→51%(51/182→92/179)。相手が魔女以外だと固定が裏目: 対毒使い 26/54→10/39、対軍師 21/55→6/37）
            const vsWitch = this.characters.some((c, seat) => seat !== (0, Player_1.seatOf)(this.playerSymbol) && c === 'witch');
            return vsWitch && availableSkills.includes(92) ? [92, ...combo].slice(0, 2) : combo;
        }
        // 氷室の番人: 魔女が相手のときだけ、一寸の虫に魂なし(92)を手札に固定して壊せる敵コマが揃うまで持ち続ける（sim/ai.js F.fryDig=2。対魔女 22〜26→58〜61%。魔女以外では固定が邪魔になり対巨人 72→61%、対鍛冶師 23→15%）
        if (this.character === 'cryomancer' && availableSkills.includes(92)
            && this.characters.some((c, seat) => seat !== (0, Player_1.seatOf)(this.playerSymbol) && c === 'witch')) {
            return [92];
        }
        // 毒使い×氷室の番人: 閻魔の舌(125)を手札に固定して、立てられる手番まで持ち続ける（立てたら外す。舌は1つあれば働く）。置く処理は aiPlanMove.ts
        if (this.character === 'poisoner' && availableSkills.includes(125)
            && this.characters.some((c, seat) => seat !== (0, Player_1.seatOf)(this.playerSymbol) && c === 'cryomancer')
            && !board.some((sq) => sq.object === 'tongueKing' && sq.player === this.playerSymbol)) {
            return [125];
        }
        if (this.character === 'giant') {
            return [];
        }
        let myPieces = 0, oppPieces = 0, empties = 0;
        // オピウム等のダメージが通る敵コマだけを数える（氷結中は❄が肩代わりする）
        for (const sq of board) {
            if (sq.player === this.playerSymbol)
                myPieces++;
            else if (sq.player) {
                if (!(0, thermal_1.isFrozen)(sq))
                    oppPieces++;
            }
            else if (!(0, thermal_1.isFrozen)(sq))
                empties++;
        }
        const geo = (0, boardGeometry_1.geometryForCells)(board.length);
        const enemiesOn = (idxs) => idxs.filter((i) => this.isEnemy(board[i].player) && !(0, thermal_1.isFrozen)(board[i]) && !board[i].effects.some((e) => e.effect === '🔑')).length;
        // キャラ専用シナジー: 軍師→トークン系 / 魔法使い→バッズ系
        // 軍師は氷結トークン(45/46)も固定する: 凍ったコマは☠🔥のダメージを受けない (旧sim AI の taFrostLock=1。全相手 61→66%)
        const tokenIdx = [3, 4, 9, 11, 45, 46];
        const budsIdx = [2, 10];
        // 毒使い: トークン系スキル(両トークンを除く。ポイズントークンを含む)を手札でロックして、毎手番トークンを撃てるようにする (旧sim AI と同一)
        const poisonerTokenIdx = [3, 9, 11, 16];
        const preferred = (idx) => 
        // 凩の魔女: 🍂付きトークン(木枯らしの使い・双子・紅葉狩り)を手札に固定して毎手番撒く (旧sim AI と同一)
        (this.character === 'witch' && (idx === 62 || idx === 63 || idx === 64)) ||
            // 対魔女の新スキル(初霜93・吹き寄せ94・山焼き95)は、引いたら先に手札に固定する (旧sim AI の lockNew=1)
            (this.facesWitchNow() && (idx === 93 || idx === 94 || idx === 95)) ||
            (this.character === 'tactician' && tokenIdx.includes(idx)) ||
            // 軍師: 雷霆の巫が相手のときは、一寸の虫に魂なし(92)を手札に固定して、撃てる機会を逃さない（対雷霆の巫 21.3→26.7%、6シード各150〜250試合・計1300で全て正、+5.4pt、z=3.2）
            (this.character === 'tactician' && idx === 92 && this.characters.some((c, seat) => seat !== (0, Player_1.seatOf)(this.playerSymbol) && c === 'electrician')) ||
            // 魔法使い: 特売(53)・返し特売(60)・一寸の虫に魂なし(92)を手札に固定して毎手番使えるようにする（縮地(50)は削除済み）。バッズ系の固定は裏目（42.4 vs 固定なし50.1、強豪5体 seed121/150）。
            // 旧『魔法使いはロック無効』（古いA/B）を撤回: 固定あり 51.7→57.6%（seed131/200）、50.1→60.5%（seed121/150）。全相手で改善（対氷室 22→45）
            (this.character === 'magician' && (this.opponents.some((o) => this.characters[(0, Player_1.seatOf)(o)] === 'necromancer') ? aiConstants_1.MAGICIAN_HOLD_VS_NECRO : this.opponents.some((o) => this.characters[(0, Player_1.seatOf)(o)] === 'yinYangMaster') ? aiConstants_1.MAGICIAN_HOLD_VS_YINYANG : aiConstants_2.MAGICIAN_HOLD).includes(idx)) ||
            (this.character === 'poisoner' && poisonerTokenIdx.includes(idx)) ||
            // ネクロマンサー: 割引札(特売/固有割引/大特価)を固定して、降霊のコストを圧縮する (旧sim AI necroLock=1)
            (this.character === 'necromancer' && (idx === 53 || idx === 57 || idx === 58 || idx === 99)) ||
            // 鍛冶師: 相手に魔法使いか魔女がいるとき、火口(87)を手札に固定して毎手番🌱🍂のコマを燃やす (魔法使い 37→58%、魔女 6〜7→14〜15%: seed3/5/6 の400〜600試合)
            (this.character === 'you' && this.holdsVsOpponent(idx)) ||
            (this.character === 'pyromancer' && idx === 87 && this.characters.some((c, seat) => seat !== (0, Player_1.seatOf)(this.playerSymbol) && (c === 'magician' || c === 'witch')));
        // 盤面的に価値が高いスキル
        const valued = (idx) => {
            switch (idx) {
                case 3:
                case 4:
                case 9:
                case 11: return empties >= 3; // トークン系
                case 5: return enemiesOn(geo.antiDiagonal) >= 2; // スラッシュ
                case 6: return enemiesOn(geo.mainDiagonal) >= 2; // バックスラッシュ
                case 8: return oppPieces >= 3; // オピウム
                case 7: return opponentMagic >= 7; // チューチュートレイン
                case 14: return myPieces >= 3; // ワルプルギスの夜
                case 0:
                case 1: return life <= 2; // ライフ3/バイバイン
                case 2:
                case 10: return empties >= 8; // バッズ系(序盤)
                case 20: return empties >= 6; // 増殖(空きが多いほどループが伸びる)
                case 21:
                case 23: return this.character === 'electrician' && empties >= 3; // 帯電トークン/帯電ダブルトークン
                default: return false;
            }
        };
        const locks = [];
        for (const idx of availableSkills) {
            if (idx < 0 || idx >= aiConstants_2.SKILL_POOL_SIZE)
                continue;
            if (preferred(idx) || valued(idx))
                locks.push(idx);
        }
        // キャラ専用シナジーを優先して残す。守備の余地のため最大2つ
        // 軍師が雷霆の巫と当たるときは、上限2枚でも92を落とさない(トークン系に押し出されない)
        const topIdx = this.character === 'tactician' && this.characters.some((c, seat) => seat !== (0, Player_1.seatOf)(this.playerSymbol) && c === 'electrician') ? 92 : -1;
        locks.sort((a, b) => ((b === topIdx ? 2 : 0) + (preferred(b) ? 1 : 0)) - ((a === topIdx ? 2 : 0) + (preferred(a) ? 1 : 0)));
        return locks.slice(0, 2);
    },
    /** AI用コスト計算 (軍師のトークン割引など) */
    calculateAICost(baseCost, isToken = false, isPoison = false, skillKey) {
        // 敵の🍂による増加分を先に足す（キャラの減少分・ギア・割引はそのあと。Game.tsx characterCost / gearCost と同じ順）
        let cost = baseCost + this.foeLeaves;
        if (this.character === 'poisoner')
            cost = isPoison ? cost - 1 : cost + 1;
        else if (this.character === 'tactician')
            cost = isToken ? cost - 1 : cost + 2;
        else if (this.character === 'pyromancer' && skillKey && thermal_1.FLAME_SKILL_KEYS.has(skillKey) && cost > 1)
            cost -= 1; // 🔥付与スキルは常に-1
        else if (this.character === 'witch' && cost > 1)
            cost = Math.max(1, cost - this.leafCount); // 盤面の🍂1枚につき-1（下限1）
        else if (this.character === 'yinYangMaster' && this.yinYangMode === 'yang')
            cost += 1; // 陽は全スキル+1
        else if (this.character === 'necromancer' && this.corpseCut > 0 && skillKey !== 'onClickNecromancy' && cost > 1)
            cost = Math.max(1, cost - this.corpseCut); // 墓地の死体の数だけ軽減
        const paid = this.gearCostFn ? this.gearCostFn(cost, isToken, skillKey) : cost;
        // 軽減札を撃つ前提の比較中は、軽減札でないスキルに「次に打つスキル」の軽減を掛ける（下限1）
        return this.hypoCut > 0 && paid > 0 && !(skillKey && (0, discount_1.isDiscountSkill)(skillKey)) ? Math.max(1, paid - this.hypoCut) : paid;
    },
    /**
     * 魔法使いの引き直し計画。撃てるスキルが無く（軽減札を撃っても増えない）、魔力に余裕があるときだけ返す。
     * 軽減札が未使用なら [軽減札, シャッフル]、引き直しの途中（軽減済み）ならシャッフルだけ。
     */
    planReroll(board, magic, costs, opponentMagic, life, availableSkills, tokenUsed, necroRemain, necroCost, assaultCost, proliferateActive, seatMagic, necroPay) {
        const plan = (m, avail) => this.chooseSkills(board, m, costs, opponentMagic, life, avail, tokenUsed, necroRemain, necroCost, assaultCost, proliferateActive, seatMagic, necroPay);
        const base = [...plan(magic, availableSkills)];
        if (base.length > 0)
            return null;
        // 引き直しの途中: 軽減は既に掛かっている。魔力に余裕があればもう一度シャッフルする
        if (this.discountActive)
            return magic >= costs.onClickShuffle + 2 ? {} : null;
        // 軽減札を撃てば撃てるスキルが出るなら、引き直しではなく通常の軽減札プランに任せる
        for (const r of aiConstants_2.REROLL_REDUCERS) {
            if (!availableSkills.includes(r.idx))
                continue;
            const rc = this.calculateAICost(costs[r.key], false, false, r.key);
            if (magic < rc)
                continue;
            this.hypoCut = r.cut;
            const n = plan(magic - rc, availableSkills.filter((i) => i !== r.idx)).length;
            this.hypoCut = 0;
            if (n > 0)
                return null;
        }
        // 軽減札 + シャッフル(+2の余裕) + 引き直し後に撃つ分(+4) の魔力があるとき
        const r = aiConstants_2.REROLL_REDUCERS.find((x) => availableSkills.includes(x.idx) && magic >= this.calculateAICost(costs[x.key], false, false, x.key) + 2 + 4);
        return r ? { discount: r.key } : null;
    },
    /** 戦略的スキル選択（複数スキルを返す場合あり） */
    chooseSkills(board, magic, costs, opponentMagic, life, availableSkills, tokenUsed, necroRemain = 0, necroCost = 0, assaultCost = 99, proliferateActive = false, seatMagic = [], 
    /** 蘇生で実際に払う魔力（ギア補正込み）。省略時は necroCost */
    necroPay = necroCost) {
        var _a, _b;
        const skills = [];
        const mana = { remaining: magic }; // 段階をまたいで減っていく魔力
        const oppReaches = this.opponents.reduce((n, o) => n + this.countReaches(board, o), 0);
        let myPieces = 0, oppPieces = 0, oppHit = 0;
        const piecesOf = new Map();
        const hitOf = new Map();
        for (const sq of board) {
            if (sq.player === this.playerSymbol)
                myPieces++;
            else if (sq.player) {
                piecesOf.set(sq.player, ((_a = piecesOf.get(sq.player)) !== null && _a !== void 0 ? _a : 0) + 1);
                if (!(0, thermal_1.isFrozen)(sq))
                    hitOf.set(sq.player, ((_b = hitOf.get(sq.player)) !== null && _b !== void 0 ? _b : 0) + 1); // スキルダメージが通る敵コマ
            }
        }
        // 敵が複数いるときは最大勢力の敵と比べる（2人戦なら従来どおり相手の数）
        let oppHitTotal = 0;
        hitOf.forEach((n) => { oppHitTotal += n; });
        piecesOf.forEach((n) => { oppPieces = Math.max(oppPieces, n); });
        hitOf.forEach((n) => { oppHit = Math.max(oppHit, n); });
        const geo = (0, boardGeometry_1.geometryForCells)(board.length);
        const isLosing = oppPieces > myPieces + 2 || oppReaches > 0;
        // 固有スキル用の魔力温存: ネクロは蘇生のコスト分を下回る汎用スキル(バッズ/トークン/ライフ)の支払いを控える
        // (旧sim AI chooseSkills と同一。A/B: ネクロ +2〜6pt。巨人は誤差内、軍師は大幅悪化で対象外)
        let reserve = 0;
        if (this.character === 'necromancer' && necroRemain === 0)
            reserve = necroCost;
        // 凩の魔女: 手札に🍂付きトークンがあるとき、その最安のコスト未満になる他スキルの支払いを控える (旧sim AI witchReserve=1。3シード×200試合で平均+2.7pt)
        const WITCH_LEAF_SPEND = ['onClickLeafToken', 'onClickTwinLeafToken', 'onClickDoubleLeafToken', 'onClickLeafDrop', 'onClickKindling', 'onClickLeafCloak'];
        if (this.character === 'witch' && !tokenUsed) {
            const leafOpts = [
                { idx: 64, key: 'onClickDoubleLeafToken' },
                { idx: 63, key: 'onClickTwinLeafToken' },
                { idx: 62, key: 'onClickLeafToken' },
            ].filter((o) => availableSkills.includes(o.idx));
            if (leafOpts.length > 0)
                reserve = Math.min(...leafOpts.map((o) => this.calculateAICost(costs[o.key], true, false, o.key)));
        }
        const RESERVE_SKIP = ['onClickBuds', 'onClickAddLife', 'onClickToken', 'onClickBudsToken', 'onClickDoubleToken'];
        const spend = (cost, skill) => {
            if (this.holdPG > 0 && !aiConstants_2.PG_HOLD_FREE.includes(skill) && mana.remaining - cost < this.holdPG)
                return false;
            if (reserve > 0 && (RESERVE_SKIP.includes(skill) || (this.character === 'witch' && !WITCH_LEAF_SPEND.includes(skill))) && mana.remaining - cost < reserve)
                return false;
            if (mana.remaining >= cost) {
                mana.remaining -= cost;
                skills.push(skill);
                return true;
            }
            return false;
        };
        const c = { board, magic, costs, opponentMagic, life, availableSkills, tokenUsed, necroRemain, necroCost, assaultCost, proliferateActive, seatMagic, necroPay, skills, mana, oppReaches, myPieces, oppHitTotal, geo, isLosing, spend };
        for (const phase of SKILL_PHASES) {
            const chosen = phase.call(this, c);
            if (chosen !== null)
                return chosen;
        }
        return skills;
    },
    /** 引き直しの前に、手札が全て固定されていれば固定を1つ外して札が入れ替わるようにする（特売(53)など、無くても組める札を優先して外す） */
    locksForReroll(locks, handSize) {
        if (locks.length < handSize || locks.length === 0)
            return locks;
        const drop = locks.includes(53) ? 53 : locks[locks.length - 1];
        return locks.filter((i) => i !== drop);
    },
};
