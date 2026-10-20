// スキルカードの見た目(アイコン・種類)をスキル名から引くためのメタ情報。
// スキル名はボタン文言 `${name}-${cost}` / `${name}+${gain}` から取り出す。

export type SkillCategory = 'attack' | 'support' | 'token' | 'poison' | 'control' | 'basic';

export const CATEGORY_LABEL: Record<SkillCategory, string> = {
    attack: '攻撃',
    support: '強化',
    token: 'トークン',
    poison: '毒',
    control: '場の操作',
    basic: '基本',
};

type Meta = { icon: string; category: SkillCategory };

const SKILL_META: Record<string, Meta> = {
    チャージ: { icon: '🔋', category: 'basic' },
    シャッフル: { icon: '🔀', category: 'basic' },
    ロック: { icon: '🔑', category: 'control' },
    ダブルロック: { icon: '🔑', category: 'control' },
    トリプルロック: { icon: '🔑', category: 'control' },
    ライフ3: { icon: '💚', category: 'support' },
    バイバイン: { icon: '✖️', category: 'support' },
    バッズ: { icon: '🌱', category: 'support' },
    ダブルバッズ: { icon: '🌱', category: 'support' },
    ワルプルギスの夜: { icon: '🌸', category: 'support' },
    増殖: { icon: '♾️', category: 'support' },
    豊穣の舞: { icon: '🌾', category: 'support' },
    トークン: { icon: '🪙', category: 'token' },
    両トークン: { icon: '🪙', category: 'token' },
    ダブルトークン: { icon: '🪙', category: 'token' },
    バッズトークン: { icon: '🪙', category: 'token' },
    ポイズントークン: { icon: '🪙', category: 'token' },
    帯電トークン: { icon: '🪙', category: 'token' },
    スラッシュ: { icon: '⚔️', category: 'attack' },
    バックスラッシュ: { icon: '🗡️', category: 'attack' },
    チューチュートレイン: { icon: '🚂', category: 'attack' },
    オピウム: { icon: '💨', category: 'attack' },
    ストンプ: { icon: '🦶', category: 'attack' },
    審判の日: { icon: '⚡', category: 'attack' },
    全軍突撃: { icon: '🚩', category: 'attack' },
    凶荒の舞: { icon: '🥀', category: 'attack' },
    蘇生: { icon: '💀', category: 'support' },
    ヘイルメアリー: { icon: '🎲', category: 'support' },
    サイレンス: { icon: '🤫', category: 'control' },
    陰陽転化: { icon: '☯️', category: 'control' },
    帯電付与: { icon: '⚡', category: 'support' },
    帯電拡散: { icon: '⚡', category: 'attack' },
    インジェクション: { icon: '💉', category: 'poison' },
    血清: { icon: '🧪', category: 'poison' },
    猛毒化: { icon: '☠', category: 'poison' },
    パンデミック: { icon: '🦠', category: 'poison' },
    毒霧: { icon: '🌫️', category: 'poison' },
    ミアズマ: { icon: '☠', category: 'poison' },
    氷結: { icon: '❄', category: 'control' },
    火遁: { icon: '🔥', category: 'support' },
    火炎トークン: { icon: '🪙', category: 'token' },
    火炎ダブルトークン: { icon: '🪙', category: 'token' },
    範囲氷結: { icon: '❄', category: 'control' },
    氷柱: { icon: '🧊', category: 'control' },
    ランダム氷結: { icon: '🌨️', category: 'control' },
    氷結拡散: { icon: '❄', category: 'attack' },
    氷結トークン: { icon: '🪙', category: 'token' },
    氷結ダブルトークン: { icon: '🪙', category: 'token' },
    砕氷: { icon: '🔨', category: 'attack' },
    霜降り: { icon: '🌫️', category: 'support' },
    殉火: { icon: '🕯️', category: 'attack' },
    焼畑: { icon: '🌾', category: 'attack' },
    刈り入れ前夜: { icon: '🌾', category: 'support' },
    冬至の種子: { icon: '🌰', category: 'support' },
    ひこばえ: { icon: '🌿', category: 'support' },
    風の落とし子: { icon: '🍃', category: 'support' },
    浄化: { icon: '✨', category: 'support' },
    絶対零度: { icon: '🥶', category: 'attack' },
    業火: { icon: '💥', category: 'attack' },
};

export const metaOf = (name: string): Meta => SKILL_META[name] ?? { icon: '✨', category: 'basic' };

export type ParsedSkillText = {
    name: string;
    /** '-' はマジック消費、'+' は獲得(チャージ) */
    sign: '-' | '+';
    amount: number;
    /** コストの後ろの補足(例: 蘇生の「(発動中:残3)」) */
    suffix: string;
};

/** `ロック-2` / `チャージ+3` / `蘇生-4(発動中:残2)` を分解する。形式外なら null */
export const parseSkillText = (text: string): ParsedSkillText | null => {
    const m = /^(.+?)([-+])(\d+)(.*)$/.exec(text);
    if (!m) return null;
    return { name: m[1], sign: m[2] as '-' | '+', amount: Number(m[3]), suffix: m[4] };
};
