// 自動生成: src/components/game/AIPlayer.ts (node scripts/gen-sim-shared.js)。手で編集しない。
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
const aiConstants_1 = require("./aiConstants");
const aiSearch_1 = require("./aiSearch");
const aiTargets_1 = require("./aiTargets");
const aiPlans_1 = require("./aiPlans");
const aiSkillChoice_1 = require("./aiSkillChoice");
const aiPlanMove_1 = require("./aiPlanMove");
__exportStar(require("./aiConstants"), exports);
class AIPlayer {
    /** 自分のデッキに idx があるか（手札にあるものは必ずデッキにある）。旧sim AI の inDeck */
    inDeck(idx, availableSkills) {
        return !this.deck || this.deck.includes(idx) || availableSkills.includes(idx);
    }
    /** 陰陽師のコンボ札(71/73)がどちらも手札かデッキにある=引き直しや温存が報われる。旧sim AI の comboReachable */
    comboReachable(availableSkills) {
        return this.inDeck(71, availableSkills) && this.inDeck(73, availableSkills);
    }
    constructor(playerSymbol, character, opponents = [playerSymbol === '💙' ? '⭕' : '💙'], characters = [], gearCostFn, hasToxicBloom = false, hasEmptyLock = false, deck, hasLockBloom = false, hasGroundRent = false) {
        this.necroActive = false;
        /** 無敵(⚡付き雷霆の巫自陣)マス。手番開始時に更新し、候補列挙・範囲スキルの中心から除外する */
        this.shield = new Set();
        /** 絶対零度が発動待ち（Game が手番ごとに設定する）。待ち中は撃たない */
        this.glacierPending = false;
        /** 土壇場の防壁を装備していて未発動（Game が手番ごとに設定する）。真なら相手の1回目の勝ちは防壁が受けるので止めに行かず攻める。旧sim AI の AI_DEFAULTS.lsAggro と同じ */
        this.lastStandReady = false;
        /** 無礼講が効いている（Game が手番ごとに設定する）。コストは Game の gearCost が0にするので、AIは無礼講を重ねて撃たない */
        this.tokenFree = false;
        /** 毒返しの構えが効いている（Game が手番ごとに設定する）。効いているあいだは重ねて撃たない */
        this.wardActive = false;
        /** 裸の王様の判断材料: 相手全員の有効なギアの数 / 使える土壇場の防壁を持つ相手がいるか（Game.tsx runAIMove が毎手番入れる） */
        this.chargeBuffActive = false; // 静電気の季節が自分に掛かっている
        this.oppGearCount = 0;
        this.oppLastStand = false;
        /** 絶対零度のコスト軽減（氷結が作られた回数。撃つとリセット）。Game が手番ごとに設定する */
        this.glacierCharge = 0;
        /** 業火の無料権（手番を跨いで持ち越し）と、この手番に使ったスキルの種類。Game が毎回セットする */
        this.infernoReady = false;
        /** chooseSkills が直前に計画したスキルの合計コスト */
        this.lastSpent = 0;
        /** 軽減札を撃った場合を仮定した「次に打つスキル」の軽減量（計画の比較中だけ使う） */
        this.hypoCut = 0;
        /** 自陣の働いている大木の数（makeMove の入口で数える。盤面はオブジェクトを『ロック中の空きマス』に置き換えて計画するため） */
        this.ownTrees = 0;
        /** 自陣のオブジェクトの数（鍵師の砦の設置判断に使う） */
        this.ownObjectCount = 0;
        /** 自陣の働いている雷雲の数 */
        this.ownClouds = 0;
        /** 自陣の働いている毒沼の数 */
        this.ownSwamps = 0;
        /** パーフェクトゲームの即勝ちが見えているが魔力が足りないとき、そのコストを残すために他のスキルの支払いを控える(0=控えない) */
        this.holdPG = 0;
        this.skillKinds = new Set();
        /** 魔法使いの引き直し: この手番で残っている引き直し回数（Game が手番開始時に MAX_REROLLS にし、シャッフルのたび減らす） */
        this.rerollsLeft = 0;
        /** 軽減札が手番内で有効（引き直しの途中）。Game が毎回セットする */
        this.discountActive = false;
        /** 冬至の種子の🌱ガード中（Game が手番ごとに設定する）。ガード中は撃たない */
        this.budGuard = false;
        /** 陰陽師の現在のモード(Game が手番ごとに設定する)。陽は全スキルのコスト+1 */
        this.yinYangMode = 'ying';
        /** 盤面にある効力のある🍂の総数（凩の魔女のパッシブ割引。updateShield で更新する） */
        this.leafCount = 0;
        /** 他の席のコマに乗っている効力のある🍂の総数（スキルコストの増加分。updateShield で更新する） */
        this.foeLeaves = 0;
        /** ネクロマンサーのパッシブ: 墓地の死体の数（上限）だけ蘇生以外の全スキルが安い（cost.ts の characterCostOf と同じ。makeMove で更新） */
        this.corpseCut = 0;
        /** これまでの着手数と参加人数。先読みで着手後のライフ減衰(ライフ1→0で奪われる)を見込むのに使う。Game が手番ごとに設定する */
        this.placements = 0;
        this.seatCount = 2;
        /** 毒花を装備しているか。毒使いなら、自陣のコマに積極的に毒を盛る（旧sim AI の毒使い×毒花と同じ） */
        this.hasToxicBloom = false;
        this.hasEmptyLock = false;
        /** 芽吹きの錠を装備しているか（ロックを掛けたライフ2以下の自陣のコマにバッズが付く） */
        this.hasLockBloom = false;
        /** 地代を装備しているか（手番開始時に自陣のオブジェクトの数だけマジック。ネクロマンサーは安い大岩を重ねて置く） */
        this.hasGroundRent = false;
        /** 雷霆の巫の対陰陽師の線カバー重み（テストで0にして比較できる） */
        this.floodCoverWeight = aiConstants_1.FLOOD_COVER_WEIGHT;
        /** 直近の findRescueCenter が選んだ中心で残る敵の脅威マス数（巨人ストンプの防御判定用） */
        this.lastRescueThreats = 0;
        this.playerSymbol = playerSymbol;
        this.character = character;
        this.opponents = opponents;
        this.characters = characters;
        this.gearCostFn = gearCostFn;
        this.hasToxicBloom = hasToxicBloom;
        this.hasEmptyLock = hasEmptyLock;
        this.hasLockBloom = hasLockBloom;
        this.deck = deck;
        this.hasGroundRent = hasGroundRent;
    }
}
Object.assign(AIPlayer.prototype, aiSearch_1.searchMethods, aiTargets_1.targetMethods, aiPlans_1.planMethods, aiSkillChoice_1.skillChoiceMethods, aiPlanMove_1.planMoveMethods);
exports.default = AIPlayer;
