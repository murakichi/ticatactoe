// スキルカードの見た目(アイコン・種類)をスキル名から引くためのメタ情報。
// スキル名はボタン文言 `${name}-${cost}` / `${name}+${gain}` から取り出す。
//
// 汎用スキル(デッキに入るもの)のアイコンと種類は、デッキ編集画面と同じ SKILL_CATALOG(deck.ts)を唯一の出典にする。
// こうしておくと、カタログにスキルを足すだけでカードにも正しい色・アイコンが付き、二重に登録し忘れて
// 「✨・基本」の既定表示になることが無い。ここに書くのはカタログに無いスキル(基本操作とキャラ固有スキル)だけ。
import { CATEGORY_ORDER, SKILL_CATALOG, SkillCategory } from './deck';

export type { SkillCategory };

export const CATEGORY_LABEL = Object.fromEntries(CATEGORY_ORDER.map((c) => [c.id, c.label])) as Record<SkillCategory, string>;

type Meta = { icon: string; category: SkillCategory };

const CATALOG_META = new Map<string, Meta>(SKILL_CATALOG.map((e) => [e.name, { icon: e.icon, category: e.category }]));

// カタログに無いスキル: 基本操作(チャージ・シャッフル・ロック)とキャラ固有スキル
const SKILL_META: Record<string, Meta> = {
    チャージ: { icon: '🔋', category: 'basic' },
    シャッフル: { icon: '🔀', category: 'basic' },
    ロック: { icon: '🔑', category: 'control' },
    ストンプ: { icon: '🦶', category: 'attack' },
    審判の日: { icon: '⚡', category: 'attack' },
    全軍突撃: { icon: '🚩', category: 'attack' },
    蘇生: { icon: '💀', category: 'support' },
    陰陽転化: { icon: '☯️', category: 'control' },
    式神設置: { icon: '📜', category: 'shikigami' },
    式神爆破: { icon: '💥', category: 'shikigami' },
    帯電拡散: { icon: '⚡', category: 'charge' },
    ミアズマ: { icon: '☠', category: 'poison' },
    絶対零度: { icon: '🥶', category: 'ice' },
    業火: { icon: '💥', category: 'fire' },
};

/** カタログか、基本操作・固有スキルの表に載っているスキル名か(載っていなければカードは既定の「✨・基本」表示になる) */
export const hasSkillMeta = (name: string): boolean => CATALOG_META.has(name) || name in SKILL_META;

export const metaOf = (name: string): Meta => CATALOG_META.get(name) ?? SKILL_META[name] ?? { icon: '✨', category: 'basic' };

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
