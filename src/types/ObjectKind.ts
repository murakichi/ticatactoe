/**
 * オブジェクト: 空きマスに設置して使う、ライフを持つ建造物。コマと違い列(勝利判定)には数えず、時間経過でライフが減らない。
 * 持ち主(SquareInfo.player)のものとして手番開始時に効果を発揮する。種類の定義は src/components/game/objects.ts。
 */
export const OBJECT_KINDS = ['bigTree', 'deadTree', 'spring', 'fort', 'thundercloud', 'market', 'sanctuary', 'poisonSwamp', 'workshop', 'barrierStone', 'amuletShrine', 'luckyCat', 'mudField', 'tongueKing', 'eightTrigrams', 'soloSign', 'oneWord', 'blindMonkey', 'boulder'] as const;

export type ObjectKind = typeof OBJECT_KINDS[number];

/** マスがオブジェクトか（thermal.ts などの低レイヤーから循環 import なしで使えるよう、ここに置く） */
export const isObject = (sq: { object?: ObjectKind }): boolean => sq.object !== undefined;

/** 火炎を付けられると即座に壊れるオブジェクト（大木・枯れた大木） */
export const isTree = (sq: { object?: ObjectKind }): boolean => sq.object === 'bigTree' || sq.object === 'deadTree';
