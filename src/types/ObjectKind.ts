/**
 * オブジェクト: 空きマスに設置して使う、ライフを持つ建造物。コマと違い列(勝利判定)には数えず、時間経過でライフが減らない。
 * 持ち主(SquareInfo.player)のものとして手番開始時に効果を発揮する。種類の定義は src/components/game/objects.ts。
 */
export const OBJECT_KINDS = ['bigTree', 'deadTree', 'spring', 'fort', 'thundercloud', 'market', 'sanctuary', 'poisonSwamp', 'workshop', 'barrierStone', 'amuletShrine', 'luckyCat', 'mudField', 'tongueKing', 'eightTrigrams', 'soloSign', 'oneWord', 'blindMonkey'] as const;

export type ObjectKind = typeof OBJECT_KINDS[number];

/** SquareInfo.object に入る種類: 設置できるオブジェクトに、式神（紙の分身。陰陽師のスキルで生まれる）を加えたもの */
export type SquareObject = ObjectKind | 'shikigami';

/** マスがオブジェクトか（thermal.ts などの低レイヤーから循環 import なしで使えるよう、ここに置く） */
export const isObject = (sq: { object?: SquareObject }): boolean => sq.object !== undefined;

/** 設置したオブジェクト（建造物）か。式神は含まない — 式神は『コマ』として数える・狙うなど、従来の扱いのまま残す場所で使う */
export const isBuilding = (sq: { object?: SquareObject }): boolean => sq.object !== undefined && sq.object !== 'shikigami';

/** 式神か。式神はオブジェクトの一種（列に数えない・コマ数に数えない…の特例を持たず、オブジェクトの規則に従う）。ただし自然減衰は受け、乗っ取られると消え、自分で補強するとバッズ付きの通常のコマになる（placement.ts / thermal.ts） */
export const isShikigami = (sq: { object?: SquareObject }): boolean => sq.object === 'shikigami';

/** 火炎を付けられると即座に壊れるオブジェクト（大木・枯れた大木） */
export const isTree = (sq: { object?: SquareObject }): boolean => sq.object === 'bigTree' || sq.object === 'deadTree';
