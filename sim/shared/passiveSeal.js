// 自動生成: src/components/game/passiveSeal.ts (node scripts/gen-sim-shared.js)。手で編集しない。
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tickPassiveSeal = exports.effectiveCharacters = exports.isPassiveSealed = exports.SEALED_CHARACTER = exports.PASSIVE_SEAL_TURNS = void 0;
/** 使った手番の終わりと、その席の次の手番の終わりの2回、使った席の手番が終わるたびに1減る */
exports.PASSIVE_SEAL_TURNS = 2;
/** パッシブを無効にされたキャラ（パッシブも固有スキルも無い『あなた』） */
exports.SEALED_CHARACTER = 'you';
/** seat のキャラのパッシブが無効か: 自分以外の席が、まだ効いている『能ある鷹は爪を抜かれる』を使っている */
const isPassiveSealed = (seal, seat) => seal.some((turns, caster) => caster !== seat && turns > 0);
exports.isPassiveSealed = isPassiveSealed;
/** 無効を反映した席ごとのキャラ。base は本来のキャラ */
const effectiveCharacters = (base, seal) => base.map((c, seat) => ((0, exports.isPassiveSealed)(seal, seat) ? exports.SEALED_CHARACTER : c));
exports.effectiveCharacters = effectiveCharacters;
/** 使った席の手番が終わったときの残りターンの更新（0で切れる） */
const tickPassiveSeal = (turns) => Math.max(0, turns - 1);
exports.tickPassiveSeal = tickPassiveSeal;
