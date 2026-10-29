'use strict';
// src/components/game/lifeBan.ts の複製（ヘッドレス版）。lifeBan.test.ts が一致を確認する。
const LIFE_BAN_MAX = 3;
const LIFE_BAN_PLACING_KEYS = new Set([
    'onClickToken', 'onClickDoubleToken', 'onClickBothToken', 'onClickBudsToken', 'onClickPoisonToken',
    'onClickChargeToken', 'onClickDoubleChargeToken', 'onClickFlameToken', 'onClickDoubleFlameToken',
    'onClickFrostToken', 'onClickDoubleFrostToken', 'onClickFirstFrost', 'onClickGather', 'onClickBurnOff',
    'onClickLeafToken', 'onClickTwinLeafToken', 'onClickDoubleLeafToken', 'onClickBothLeafToken',
    'onClickShikigamiPlace', 'onClickShikigamiRandom', 'onClickShikigamiFlood',
]);
const placedLifeOf = (key, tokenBind) => {
    if (key === 'onClickShikigamiFlood') return 0;
    if (key === 'onClickShikigamiPlace' || key === 'onClickShikigamiRandom') return 2;
    return tokenBind;
};
const placeBlocked = (banned, key, tokenBind) => banned && !!key && LIFE_BAN_PLACING_KEYS.has(key) && placedLifeOf(key, tokenBind) <= LIFE_BAN_MAX;
const moveBlocked = (banned, life) => banned && life <= LIFE_BAN_MAX;
module.exports = { LIFE_BAN_MAX, LIFE_BAN_PLACING_KEYS, placedLifeOf, placeBlocked, moveBlocked };
