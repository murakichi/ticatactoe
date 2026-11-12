// AIPlayer の調整値・定数・型。AIPlayer.ts から分離（AIPlayer.ts が再エクスポートする）
import { CharacterId } from '../../types/Character';

// 汎用スキルプールの大きさ (idx 0..136)。Game.tsx の SKILL_POOL_SIZE / sim/engine.js の POOL_SIZE と同値
export const SKILL_POOL_SIZE = 137;

// 帯電付与の採用しきい値 (旧sim AI の CHARGE_ONE_MIN_SCORE)
export const CHARGE_ONE_MIN_SCORE = 2;
// 範囲帯電の採用しきい値 (旧sim AI の CHARGE_AREA_MIN_SCORE)
export const CHARGE_AREA_MIN_SCORE = 2;
// ジャマーを与ダメージ合計だけで撃つ下限 (旧sim AI の JAM_MIN_DMG)
export const JAMMER_MIN_DMG = 2;
// ランダム帯電を撃つときに残しておく魔力の余裕 (旧sim AI の CHG_RAND_MARGIN)
export const CHARGE_RANDOM_MARGIN = 1;
/** この魔力以上あって撃てるスキルが手札に無いとき、魔法使い以外も1コストで手札を引き直す（防壁発動後の魔力の使い道） */
export const SURPLUS_MAGIC = 12;
/** 払ったあとにこの魔力が残るなら『有り余っている』とみなし、効果の薄い札でも魔力を使い切る方に回る（多人数戦・防壁で長引いた試合） */
export const RICH_MAGIC = 14;
/** 氷室の番人の砕氷: 1手番に壊す敵コマの数・氷結を重ねる回数の上限・撃ったあとに残す魔力 */
export const SHATTER_MAX_PER_TURN = 2;
export const SHATTER_MAX_FREEZES = 3;
export const SHATTER_RESERVE = 10;
/** 追い剥ぎを1手番に連打する回数の上限 */
export const PLUNDER_CHAIN_MAX = 3;
/** 巨人がストンプを1手番に連打する回数の上限 */
export const STOMP_CHAIN_MAX = 4;
/** 毒使いが パンデミック/猛毒化 を撃ったあとに残しておく魔力（毒の連打で空にしない） */
/** 猛毒化を撃たなくなる、敵の1マスの毒の数（ライフ平均は高くても10台。これ以上は倍にしても死ぬ数が変わらない） */
export const INTENSIFY_MAX_CELL_POISON = 32;
export const POISON_RICH_RESERVE = 10;
/** 毒霧→ミアズマ: ミアズマの採点(毒が付く敵マス数＋要所)の最低値 */
export const MIST_MIASMA_MIN_SCORE = 4;
/** パンデミック: 毒が付く敵コマ(−自陣の巻き込み)の最低数 */
export const PANDEMIC_MIN_SCORE = 3;
/** 猛毒化: 敵コマに乗っている毒の最低スタック数 */
export const INTENSIFY_MIN_FOE_POISON = 3;
/** この魔力以上あるときは、手札で使う額が RICH_SPEND_GOAL に届かなければ、引き直し回数(rerollBudget)を使い切っても RICH_EXTRA_REROLLS 回まで引き直す */
export const RICH_REROLL_MAGIC = 24;
/** 魔法使いは魔力が余りやすい（7手番目以降は毎手番20以上）ので、もっと低い魔力から引き直す。24→10: 全相手 62.7→約65（seed922/200）、対ネクロ 24→40%。5以下は引き直しすぎて悪化（0で崩壊） */
export const MAGICIAN_REROLL_MAGIC = 10;
/** 手札で使う額の目標は魔力の1/4（RICH_SPEND_GOAL〜RICH_SPEND_GOAL_MAX）。魔力が多いほど、もっと使える手札が出るまで引き直す */
export const RICH_SPEND_GOAL = 5;
export const RICH_SPEND_GOAL_MAX = 12;
export const RICH_EXTRA_REROLLS = 8;
/** 有り余るときのオピウム: 当てられる敵コマがこの数以上 */
export const RICH_OPIUM_MIN_HIT = 4;

// 陰陽師の式神運用の設定 (旧sim AI の AI_DEFAULTS shMax / shBlastMin / shReserve / shComboReal と同値)
/** 氷室の番人が対ネクロで敵コマの奪取に付ける減点 (旧sim AI noCapNecro) */
export const NO_CAP_NECRO_WEIGHT = 100;

/** 陰陽師が相手のとき、自コマが入っていない列を1本減らす手に加える評価 (旧sim AI yyCover) */
export const YY_COVER_WEIGHT = 150;
export const SH_MAX = 3; // 同時に持つ式神の数
export const SH_BLAST_MIN = 3;
export const SH_RICH_BLAST_MIN = 1; // 魔力に余裕があるときの、爆破に値する最低ライン価値
export const SH_RICH_GUARD = 8; // 同じく、1手番の式神運用の繰り返し回数
export const SH_BLESS_WEAK = 2; // 加護: ライフがこの値以下の自陣コマが2つ以上のとき使う (旧sim AI SH_BLESS_WEAK)
export const SH_CURSE_MIN = 2; // 呪詛: エフェクトが乗っている敵コマの最低数 (旧sim AI SH_CURSE_MIN)
export const SH_PURGE_FREE = 3; // 供犠: 自陣の式神がこの数以上なら0コスト (Game.tsx SHIKIGAMI_PURGE_FREE)
export const SH_SMALL_FRY_MIN = 1; // 一寸の虫に魂なし(92)を撃つ最低の破壊数 (旧sim AI F.smallFry)
export const SH_RESERVE = 9; // 式神を置いたあとに残しておく魔力（爆破の準備）
export const NO_DIG_53_MIN = 8; // 71/73 が揃い 53 だけ無いとき、この魔力以上なら53を探さずチャージで13を目指す
export const SH_COMBO_REAL = 1; // 式神一括コンボの列に最低限必要な通常コマ数

/** トークン扱いのスキル（1手番に1回） */
export const TOKEN_SKILL_KEYS: ReadonlySet<string> = new Set([
    'onClickToken', 'onClickDoubleToken', 'onClickBudsToken', 'onClickBothToken', 'onClickPoisonToken', 'onClickFlameToken', 'onClickDoubleFlameToken',
    'onClickFrostToken', 'onClickDoubleFrostToken', 'onClickChargeToken', 'onClickDoubleChargeToken', 'onClickLeafToken', 'onClickTwinLeafToken',
    'onClickDoubleLeafToken', 'onClickShikigamiRandom', 'onClickFirstFrost', 'onClickGather', 'onClickBurnOff',
]);
export const TURN_ENDING_SKILLS = ['onClickCharge', 'onClickOpium', 'onClickTsunami', 'onClickSeal', 'onClickRoar'];

export type AIResult = {
    move: number | null;
    skills: string[];
    lockTargets?: number[];
    stompTarget?: number; // 着手前にクリックする対象マス (ストンプ/インジェクション)
    /** 「スキル→対象マスのクリック」を順に行うスキル。雷霆の巫の帯電系（帯電拡散→帯電付与の順）と、氷室の番人の絶対零度(target なし)・煉獄の鍛冶師の業火 */
    chargeClicks?: { skill: string; target?: number; /** 2回目のクリック（帯電サイレンスの2個目のマスなど） */ target2?: number }[];
    /** 詰み: ヘイルメアリーを撃つ。当選スキルは Game 側で引くので、対象は planHailMary で後から決める */
    hailMary?: boolean;
    /** 魔法使い: 撃てるスキルが無いので、軽減札(discount)を撃ってから1コストで手札を引き直す。Game 側が [軽減札, シャッフル, 再計画] を順に行う */
    reroll?: { discount?: string };
    /** この手番で勝ちが決まる計画（引き直しなどで崩さない） */
    win?: boolean;
};

// 魔法使いの引き直しに使う軽減札（撃つ優先順。旧sim AI の DISCOUNT_REDUCERS と同順）。cut は次に打つスキルの軽減量
export const REROLL_REDUCERS: { idx: number; key: 'onClickCounterMarkdown' | 'onClickClearance' | 'onClickVitalMarkdown' | 'onClickMarkdown'; cut: number }[] = [
    { idx: 60, key: 'onClickCounterMarkdown', cut: 3 },
    { idx: 58, key: 'onClickClearance', cut: 7 },
    { idx: 56, key: 'onClickVitalMarkdown', cut: 4 },
    { idx: 53, key: 'onClickMarkdown', cut: 3 },
];
/** 夜の帳: 相手の魔力がこの値以上で、他に撃つものが無いとき撃つ（相手が次の手番に高いスキルを撃てそうなとき）。毒返しの構え: 自陣のコマがこの数以上あるとき撃つ */
export const NIGHT_VEIL_OPP_MAGIC = 7;
/** 氷室の番人の絶対零度の基礎コスト / 夜の帳が相手のスキルに足すコスト */
export const GLACIER_COST = 10;
/** 芽吹きでバッズが付くコマのライフ（gear.ts の GEAR_PARAMS.budSeedLife と同じ値） */
export const BUD_SEED_LIFE = 7;
export const NIGHT_VEIL_RAISE = 3;
/** 魔法使いが手札に固定する札: 特売・返し特売・一寸の虫に魂なし（縮地(50)は削除） */
/**
 * 「あなた」が相手キャラ別に手札へ固定する札。他キャラの対策札(一寸の虫=魔女・氷室対策、火口=魔法使い・魔女対策)を、
 * 引いたら固定して毎手番使えるようにする（対応する専用デッキは deck.ts COUNTER_DECKS_FOR_YOU。seed2/300: 対witch 2.7→30.3%、対氷室 8.0→24.0%、対雷霆 0→23.7%、対魔法使い 11.0→14.7%、対軍師 17.0→29.0%）。相手が1キャラだけのときに限る（固定が裏目の相手がいるため。docs/tune/you.md）
 */
export const YOU_HOLD_VS: Partial<Record<CharacterId, number[]>> = {
    magician: [87, 92],
    witch: [92, 87],
    cryomancer: [92],
    electrician: [92],
    tactician: [92, 74],
};

/** 巨人が相手のとき、自コマが盤に無い間、手番開始の魔力がこれ未満なら置かずにチャージする（魔女。対巨人 平均 +24.7pt） */
export const WITCH_GIANT_OPEN_CHARGE_CAP = 14;
/** 同上（陰陽師。5が最良で、8・11は悪化） */
export const YINYANG_GIANT_OPEN_CHARGE_CAP = 5;
/** 同上（魔法使い。上限14で対巨人 平均 +10.7pt。元から85%と強く、巨人の相対順位をさらに下げる点は issue #575 で『許容』を暫定とした） */
export const MAGICIAN_GIANT_OPEN_CHARGE_CAP = 14;

export const MAGICIAN_HOLD = [53, 60, 92];
/** ネクロマンサーが相手のときの固定: 特売(53)を外して追い剥ぎ(52)を固定する。対ネクロ 36→47%（seed1142〜1144 各400で +8.5〜+12） */
export const MAGICIAN_HOLD_VS_NECRO = [60, 92, 52];
/** 陰陽師が相手のときは追い剥ぎ(52)も固定対象に加える。対陰陽師 +4.7pt（seed1161〜1165 各400, 5seed全て正: +2.8/+6.5/+2.0/+5.7/+6.4）*/
export const MAGICIAN_HOLD_VS_YINYANG = [53, 60, 92, 52];
/** パーフェクトゲームの即勝ちに魔力が届かないとき、あと何魔力以内なら他のスキルの支払いを控えてためるか（チャージ+3を2回で届く範囲） */
export const PG_HOLD_GAP = 6;
/** 大木を立てる条件: 自陣の大木の上限 / 盤面の空きマスの下限 */
/** 沈黙は雷なりの札の idx（deck.ts の SKILL_CATALOG） */
export const BOLT_SILENCE_IDX = 113;
export const BIG_TREE_MAX = 1;
/** 雷雲を立てる条件: 自陣の雷雲の上限 / 盤面の空きの下限 / 周囲八マスの敵のコマの下限 */
export const CLOUD_MAX = 1;
export const CLOUD_MIN_EMPTY = 4;
export const CLOUD_MIN_FOES = 2;
export const BIG_TREE_MIN_EMPTY = 6;
/** 大木のコストにあと何魔力以内なら、他のスキルの支払いを控えてためるか */
export const BIG_TREE_HOLD_GAP = 5;
/** ためている間でも支払ってよいスキル（パーフェクトゲーム本体と、そのコストを下げる軽減札） */
export const PG_HOLD_FREE = ['onClickPerfectGame', 'onClickClearance', 'onClickCounterMarkdown', 'onClickMarkdown'];
export const POISON_WARD_MIN_PIECES = 3;
/** 墓守の供物: 自陣のコマがこの数以上で、死体がこの数以下のとき撃つ */
export const GRAVE_OFFERING_MIN_PIECES = 3;
export const GRAVE_OFFERING_MAX_CORPSES = 3;
/** 魔法使いが1手番にロックするバッズ駒の最大数。旧sim AI の AI_DEFAULTS.magLockN と同じ */
export const MAGICIAN_MAX_LOCKS = 3;
/** 対ネクロの先回りロック: 1手番に掛ける最大数と、ロックの残りがこの値以下なら延長する */
export const NECRO_LOCK_MAX = 3;
export const NECRO_LOCK_REFRESH = 2;
/** 先回りロックを入れるキャラ。対ネクロ4シードで改善したもの（鍵師 +6〜+11pt・陰陽師 +1〜+3pt）。雷霆 −8pt・毒使い −6pt は悪化、軍師は +0.3pt で外した */
export const NECRO_LOCK_CHARACTERS: readonly CharacterId[] = ['keysmith', 'yinYangMaster'];
/** 氷室が相手のとき、1手番にロックする自陣コマの最大数 (旧sim AI lockFirstCryo のループ上限) */
export const CRYO_LOCK_MAX = 12;
/** 空蔵を装備した席が同時にかけておく空きマスロックの上限 / ロックする空きマスの価値の下限 / 敵の列を止める価値の重み (旧sim AI の EL_MAX / EL_MIN_VALUE / EL_DENY) */
export const EMPTY_LOCK_MAX = 2;
export const EMPTY_LOCK_MIN_VALUE = 10;
/** 鍵師が空きマスをロックする価値の下限。自分の列が3つ目になる手（40）以上に絞る。10（空蔵と同じ）だと撃ち過ぎで、対 you 35%→50%（各60試合, seed2000）。80だと37% */
export const KEYSMITH_LOCK_MIN_VALUE = 40;
/** 鍵師が自陣のコマをロックして守る条件: ライフがこの値以下（奪われる直前）で、列づくりの価値がこの値以上 */
export const KEYSMITH_OWN_LOCK_MAX_BIND = 1; // 3や無制限に広げると対 you 58%→43〜48%（各60試合, seed2000）。ロックの撃ち過ぎで魔力を食う
export const KEYSMITH_OWN_LOCK_MIN_VALUE = 10;
/** 鍵師の『封鎖の断のために魔力を貯める』（人間の勝ちログ game-log_4/5/6）: 守りが要らない間（双方リーチ無し）は、封鎖の断のコストに届くまで他のスキルを見送って魔力を貯める。
 *  魔力が足りると封鎖の断は最初のロック系として無料なので、貯めれば毎手番ほぼ無料で撃てる。対強豪平均（今の強豪集合）seed5/100: 30.5→45.7, seed9/150: 30.7→43.4。
 *  『自分のロックが残る間は封鎖の断を撃たず埋める』は 45.7→39.4 で悪化したので採用しない（docs/tune/keysmith.md 試行20）。1=有効 */
export const KEYSMITH_SEAL_SAVE: number = 1;
/** 鍵師のコンボ（二列並び→片方ロック→もう片方に置く）の条件: 自陣の2つのコマのライフがこの値以上 */
export const KEYSMITH_COMBO_MIN_BIND = 2; // 各60試合, seed2000: 1→76.7/8.3/8.3, 2→75/8.3/6.7, 3→75/6.7/5, 4→66.7/6.7/3.3（対 you/magician/witch）。緩めても悪化せず差はノイズ。中間の2
/** コンボを撃つときの、ロック中の空きマスの上限（空きマスのロック判断の上限2より1つ多い） */
export const KEYSMITH_COMBO_EMPTY_LOCK_MAX = 3;
/** 火遁で魔法使いの🌱を優先して燃やす重み（旧sim AI の igniteBud） */
export const IGNITE_BUD_WEIGHT = 6;
export const EMPTY_LOCK_DENY = 2;
/** 引き直しの最大回数（手番ごと）。旧sim AI の discountPlan>=2 と同じ */
export const MAX_REROLLS = 2;
/** 対魔女の新スキル探しで、シャッフルのあとに残す魔力。旧sim AI の digMargin */
export const WITCH_DIG_MARGIN = 3;
/** 1手番に引き直せる回数の上限。陰陽師はコンボ札(71/73/53)を探すので多め（旧sim AI の shuffleDig=8） */
/** 雷霆の巫が陰陽師の一撃(百鬼夜行→式神一括)に備えて、自コマの無い線1本ごとに引く点（旧sim AI AI_DEFAULTS.floodCover） */
export const FLOOD_COVER_WEIGHT = 150;

export const rerollBudget = (character: CharacterId): number => (character === 'yinYangMaster' ? 8 : MAX_REROLLS);

// 固有スキルを撃てる魔力の目安(次の手番の魔力がこれ以上なら撃ってくるとみなす)。旧sim AI の EXCLUSIVE_MIN_MAGIC と同値
export const EXCLUSIVE_MIN_MAGIC: Partial<Record<CharacterId, number>> = {
    giant: 6, tactician: 7, magician: 6, yinYangMaster: 5, necromancer: 5, poisoner: 4, electrician: 7, cryomancer: 7, pyromancer: 9, witch: 7,
};

// 毒使い×毒花・ミアズマの調整値 (旧sim AI の BLOOM_* / MIASMA_MIN_SCORE と同値)
export const BLOOM_MAX_OWN_POISON = 3; // 自陣の毒スタックの上限
export const BLOOM_MIN_BIND = 4; // 毒を盛る自コマのライフの下限（毒の数を足した値）
/** ミアズマの対象が氷結中のマスのとき、1マスぶんの価値に掛ける係数（毒は休眠して残り、氷結が解けたら効く） */
export const MIASMA_FROZEN_WEIGHT = 0.5;
export const MIASMA_MIN_SCORE = 2; // 敵2マス、または敵1マス+リーチ列(=3)

/** 強制勝ちの探索の深さ（相手→自分→相手→自分。自分が最大3回打つ勝ちまで見る） */
export const FORCED_WIN_PLIES = 4;

/** 対策ロック: ロック済みの自コマも、残りスタックがこの値以下なら延長の対象にする（0=ロック済みは対象にしない=従来）。
 *  魔法使い 全相手 seed102/100 の対強豪平均 47.3(0)→54.0(2)・53.8(3)。対ネクロ 13→40・対陰陽師 47→54。5以上は対陰陽師が悪化。
 *  全キャラ共通 環境順位 seed111/60: ネクロ 63.5→56.5、火術師 47.3→51.7、鍵師 49.3→52.0、魔法使い 27.8→29.5（他は不変） */
export const ANTI_LOCK_REFRESH = 2;

/** 龍神の巫女（二列勝利）の評価: 1本目が完成しているとき、1本目と重なる窓（共有2マス以上）の加点の倍率と、離れた窓の倍率（evaluateBoard） */
export const TWO_LINE_OVERLAP_WEIGHT = 0.2;
export const TWO_LINE_DISJOINT_WEIGHT = 1.5;

/**
 * 相手を縛るオブジェクトを置く相手（その相手に対して、置いた側の勝率がどれだけ上がるか・pt。2手番目に無料で置いて大岩と比べた実測。
 * docs/skill-cost-rules.md『オブジェクトの算出』）。AI は『値 ≥ 実コスト × OBJECT_PT_PER_MAGIC』の相手がいるときだけ置く。表に無い相手は0
 */
export const OBJECT_VS: Partial<Record<string, Partial<Record<CharacterId, number>>>> = {
    soloSign: { electrician: 59, necromancer: 38, tactician: 36, witch: 35, poisoner: 20, yinYangMaster: 16, cryomancer: 5 },
    oneWord: { electrician: 19, yinYangMaster: 17, witch: 15, necromancer: 5 },
    tongueKing: { witch: 63, electrician: 25, tactician: 19, cryomancer: 19, poisoner: 17, keysmith: 14, yinYangMaster: 7 },
    mudField: { witch: 53, tactician: 17, cryomancer: 10, electrician: 9, poisoner: 6 },
};
/** 序盤に魔力1を払う重さ（勝率pt。大岩を置いて魔力を払わせた実測） */
export const OBJECT_PT_PER_MAGIC = 2.7;
/** 手札から置く汎用のオブジェクト（価値の高い順。縛る種類は OBJECT_VS の相手がいるときだけ） */
export const GENERIC_OBJECT_ORDER = ['soloSign', 'tongueKing', 'bigTree', 'mudField', 'sanctuary', 'poisonSwamp', 'luckyCat', 'oneWord', 'spring', 'fort', 'thundercloud'] as const;
/** 解体を撃つ敵のオブジェクトの価値の下限（設置の基礎コスト。解体4より高いものだけ壊す。自分を縛っているものは必ず壊す） */
export const DEMOLISH_MIN_VALUE = 5;
/** 地ならしを撃つ敵のオブジェクトの価値の合計の下限 */
export const LEVEL_ALL_MIN_VALUE = 10;
