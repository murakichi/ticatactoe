'use strict';
/*
 * probe-*.js / duel.js が使うAI。既定は本番のAI(aiDriver = AIPlayer.ts の生成物)。
 * 旧 sim 版AI(ai.js。F.xxx のノブ付き)で測りたいときだけ SIM_AI=legacy を付ける（廃止予定）。
 */
module.exports = process.env.SIM_AI === 'legacy' ? require('./ai') : require('./aiDriver');
