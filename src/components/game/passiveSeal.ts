// 能ある鷹は爪を抜かれる: 相手のキャラのパッシブ(と固有スキル)を、使った席の次の手番の終わりまで無効にする。sim/shared に生成され、Game.tsx と sim/engine.js が同じ関数を呼ぶ。
// 無効な席は『あなた』(パッシブも固有スキルも持たないキャラ)として扱う。ギアは対象外（裸の王様の領分）
import { CharacterId } from '../../types/Character';

/** 使った手番の終わりと、その席の次の手番の終わりの2回、使った席の手番が終わるたびに1減る */
export const PASSIVE_SEAL_TURNS = 2;

/** パッシブを無効にされたキャラ（パッシブも固有スキルも無い『あなた』） */
export const SEALED_CHARACTER: CharacterId = 'you';

/** seat のキャラのパッシブが無効か: 自分以外の席が、まだ効いている『能ある鷹は爪を抜かれる』を使っている */
export const isPassiveSealed = (seal: readonly number[], seat: number): boolean => seal.some((turns, caster) => caster !== seat && turns > 0);

/** 無効を反映した席ごとのキャラ。base は本来のキャラ */
export const effectiveCharacters = (base: readonly CharacterId[], seal: readonly number[]): CharacterId[] =>
    base.map((c, seat) => (isPassiveSealed(seal, seat) ? SEALED_CHARACTER : c));

/** 使った席の手番が終わったときの残りターンの更新（0で切れる） */
export const tickPassiveSeal = (turns: number): number => Math.max(0, turns - 1);
