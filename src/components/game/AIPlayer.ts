import { CharacterId } from '../../types/Character';
import { Player } from '../../types/Player';
import { FLOOD_COVER_WEIGHT } from './aiConstants';
import { searchMethods, SearchMethods } from './aiSearch';
import { targetMethods, TargetMethods } from './aiTargets';
import { planMethods, PlanMethods } from './aiPlans';
import { skillChoiceMethods, SkillChoiceMethods } from './aiSkillChoice';
import { planMoveMethods, PlanMoveMethods } from './aiPlanMove';
import { dragonMethods, DragonMethods } from './aiDragon';
import { DragonForm } from './dragon';

export * from './aiConstants';

class AIPlayer {
    playerSymbol: Player;
    character: CharacterId;
    /** 自分以外の全プレイヤー(2人戦なら1人)。先頭を探索木の「相手役」に使う */
    opponents: Player[];
    necroActive: boolean = false;
    /** 席ごとのキャラ（添字 = 席番号）。無敵マスの判定に使う。省略時は自分のキャラだけ分かる */
    characters: readonly CharacterId[];
    /** 無敵(⚡付き雷霆の巫自陣)マス。手番開始時に更新し、候補列挙・範囲スキルの中心から除外する */
    shield: Set<number> = new Set();
    /** 絶対零度が発動待ち（Game が手番ごとに設定する）。待ち中は撃たない */
    glacierPending: boolean = false;
    /** 土壇場の防壁を装備していて未発動（Game が手番ごとに設定する）。真なら相手の1回目の勝ちは防壁が受けるので止めに行かず攻める。旧sim AI の AI_DEFAULTS.lsAggro と同じ */
    lastStandReady: boolean = false;
    /** 無礼講が効いている（Game が手番ごとに設定する）。コストは Game の gearCost が0にするので、AIは無礼講を重ねて撃たない */
    tokenFree: boolean = false;
    /** 毒返しの構えが効いている（Game が手番ごとに設定する）。効いているあいだは重ねて撃たない */
    wardActive: boolean = false;
    /** 裸の王様の判断材料: 相手全員の有効なギアの数 / 使える土壇場の防壁を持つ相手がいるか（Game.tsx runAIMove が毎手番入れる） */
    chargeBuffActive: boolean = false; // 静電気の季節が自分に掛かっている
    oppGearCount: number = 0;
    oppLastStand: boolean = false;
    /** 絶対零度のコスト軽減（氷結が作られた回数。撃つとリセット）。Game が手番ごとに設定する */
    glacierCharge: number = 0;
    /** 業火の無料権（手番を跨いで持ち越し）と、この手番に使ったスキルの種類。Game が毎回セットする */
    infernoReady: boolean = false;
    /** chooseSkills が直前に計画したスキルの合計コスト */
    lastSpent: number = 0;
    /** 軽減札を撃った場合を仮定した「次に打つスキル」の軽減量（計画の比較中だけ使う） */
    hypoCut: number = 0;
    /** 自陣の働いている大木の数（makeMove の入口で数える。盤面はオブジェクトを『ロック中の空きマス』に置き換えて計画するため） */
    ownTrees: number = 0;
    /** 自陣のオブジェクトの数（鍵師の砦の設置判断に使う） */
    ownObjectCount: number = 0;
    /** 龍神の巫女の形態（planAITurn が毎手番セットする。#527） */
    dragonForm: DragonForm = 'miko';
    /** 自陣の働いている雷雲の数 */
    ownClouds: number = 0;
    /** 自陣の働いている毒沼の数 */
    ownSwamps: number = 0;
    ownTongues: number = 0;
    /** パーフェクトゲームの即勝ちが見えているが魔力が足りないとき、そのコストを残すために他のスキルの支払いを控える(0=控えない) */
    holdPG: number = 0;
    skillKinds: Set<string> = new Set();
    /** 魔法使いの引き直し: この手番で残っている引き直し回数（Game が手番開始時に MAX_REROLLS にし、シャッフルのたび減らす） */
    rerollsLeft: number = 0;
    /** 軽減札が手番内で有効（引き直しの途中）。Game が毎回セットする */
    discountActive: boolean = false;
    /** 冬至の種子の🌱ガード中（Game が手番ごとに設定する）。ガード中は撃たない */
    budGuard: boolean = false;

    /** 陰陽師の現在のモード(Game が手番ごとに設定する)。陽は全スキルのコスト+1 */
    yinYangMode: 'ying' | 'yang' = 'ying';

    /** ギアのコスト補正（キャラ補正済みのコストを受け取り、補正後を返す）。ギアが無ければ未指定 */
    gearCostFn?: (cost: number, isToken: boolean, skillKey?: string) => number;
    /** 盤面にある効力のある🍂の総数（凩の魔女のパッシブ割引。updateShield で更新する） */
    leafCount = 0;
    /** 他の席のコマに乗っている効力のある🍂の総数（スキルコストの増加分。updateShield で更新する） */
    foeLeaves = 0;
    /** ネクロマンサーのパッシブ: 墓地の死体の数（上限）だけ蘇生以外の全スキルが安い（cost.ts の characterCostOf と同じ。makeMove で更新） */
    corpseCut = 0;
    /** これまでの着手数と参加人数。先読みで着手後のライフ減衰(ライフ1→0で奪われる)を見込むのに使う。Game が手番ごとに設定する */
    placements: number = 0;
    seatCount: number = 2;
    /** 毒花を装備しているか。毒使いなら、自陣のコマに積極的に毒を盛る（旧sim AI の毒使い×毒花と同じ） */
    hasToxicBloom: boolean = false;
    hasEmptyLock: boolean = false;
    /** 芽吹きの錠を装備しているか（ロックを掛けたライフ2以下の自陣のコマにバッズが付く） */
    hasLockBloom: boolean = false;
    /** 地代を装備しているか（手番開始時に自陣のオブジェクトの数だけマジック。ネクロマンサーは安い大岩を重ねて置く） */
    hasGroundRent: boolean = false;
    /** 自分のデッキ(スキル番号12枚)。未指定なら全て引けるものとして動く（旧sim AI の s.decks と同じ） */
    deck?: number[];
    /** 自分のデッキに idx があるか（手札にあるものは必ずデッキにある）。旧sim AI の inDeck */
    inDeck(idx: number, availableSkills: number[]): boolean {
        return !this.deck || this.deck.includes(idx) || availableSkills.includes(idx);
    }
    /** 陰陽師のコンボ札(71/73)がどちらも手札かデッキにある=引き直しや温存が報われる。旧sim AI の comboReachable */
    comboReachable(availableSkills: number[]): boolean {
        return this.inDeck(71, availableSkills) && this.inDeck(73, availableSkills);
    }
    /** 雷霆の巫の対陰陽師の線カバー重み（テストで0にして比較できる） */
    floodCoverWeight: number = FLOOD_COVER_WEIGHT;

    constructor(
        playerSymbol: Player,
        character: CharacterId,
        opponents: Player[] = [playerSymbol === '💙' ? '⭕' : '💙'],
        characters: readonly CharacterId[] = [],
        gearCostFn?: (cost: number, isToken: boolean, skillKey?: string) => number,
        hasToxicBloom: boolean = false,
        hasEmptyLock: boolean = false,
        deck?: number[],
        hasLockBloom: boolean = false,
        hasGroundRent: boolean = false
    ) {
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

    /** 直近の findRescueCenter が選んだ中心で残る敵の脅威マス数（巨人ストンプの防御判定用） */
    lastRescueThreats = 0;
}

// 本体の大きなメソッド群は別ファイル。型はインターフェース統合、実体はプロトタイプへの合成で AIPlayer に戻す
interface AIPlayer extends SearchMethods, TargetMethods, PlanMethods, SkillChoiceMethods, PlanMoveMethods, DragonMethods {}
Object.assign(AIPlayer.prototype, searchMethods, targetMethods, planMethods, skillChoiceMethods, planMoveMethods, dragonMethods);

export default AIPlayer;
