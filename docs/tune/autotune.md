# autotune 記憶(自動生成)

sim/autotune.js が「効かない/明らかに悪い」と判断して探索から外したもの。コード(sim/*.js)が変わると失効する。コード版: `1586e0ec5025`

- **無効ノブ**: そのキャラのAIが使わず、動かしても全試合の結果が基準と完全一致したノブ（`k=*` は全ての値が一致）（pilot / 本探索で判定）
- **悪い候補**: 観測3回以上で平均 z ≤ -2 かつ一度も改善しなかったもの（6周回で失効）

## necromancer
- 無効ノブ(64): yyCover=*, necroLock=2, floodHold=*, witchReserve=*, digSpare=*, loopDig=*, burnoutAfter=*, shComboReal=*, freeTok=*, unblock=*, shuffleDig=*, shSpecials=*, loopMin=*, chargeWait=*, antiPoison=*, lockFirstPyro=*, elecNoAnti=*, digMargin=*, freezeBuds=*, smallFryMin=*, shReserve=*, noJudgeNecro=*, antiSummonMax=*, taFrost=*, noDig53=*, antiPoisonMargin=*, cryoPoison=*, auraSim=*, smallFry=*, igniteSkip=*, witchDig=*, staleMove=2, lsAggro=2, pyroChain=*, stompMin=*, shMax=*, shBlastMin=*, comboDiscount=*, pyroLock=*, taFrostLock=*, yyBudLock=*, lock53Late=*, cryoCards=*, floodCover=*, witchNoAnti=*, igniteBud=*, frzBlock=*, noCapNecro=*, antiFlood=*, lockFirstCryo=*, antiSummon=*, igniteSig=*, yyCoverCryo=*, stompDef=*, discountInferno=*, tinderLock=*, chargeSafe=*, igniteReserve=*, lockNew=*, magLockN=*, freezeBudsReserve=*, floodLock=*, digRelock=*, bloomLoop=*
- 抜くと悪い札(必須): 58(z̄-2.2, n=3)

## yinYangMaster
- 無効ノブ(61): yyCover=*, necroLock=*, floodHold=4, floodHold=3, witchReserve=*, loopDig=*, burnoutAfter=*, freeTok=*, unblock=*, shuffleDig=9, shuffleDig=16, shSpecials=*, loopMin=*, antiPoison=*, lockFirstPyro=*, elecNoAnti=*, digMargin=*, freezeBuds=*, smallFryMin=*, shReserve=10, shReserve=8, noJudgeNecro=*, antiSummonMax=*, taFrost=*, noDig53=*, antiPoisonMargin=*, cryoPoison=*, auraSim=*, igniteSkip=*, witchDig=*, staleMove=2, lsAggro=2, pyroChain=*, stompMin=*, shMax=*, shBlastMin=2, comboDiscount=2, pyroLock=*, taFrostLock=*, yyBudLock=*, cryoCards=*, floodCover=*, witchNoAnti=*, igniteBud=*, frzBlock=*, noCapNecro=*, antiFlood=*, lockFirstCryo=*, antiSummon=*, igniteSig=*, yyCoverCryo=*, stompDef=*, discountInferno=*, tinderLock=*, igniteReserve=*, lockNew=*, magLockN=*, freezeBudsReserve=*, floodLock=2, digRelock=2, bloomLoop=*
- 入れると悪い札: 20(z̄-6.7, n=3), 93(z̄-2.9, n=3)
- 抜くと悪い札(必須): 53(z̄-6.8, n=5), 71(z̄-7.3, n=5), 92(z̄-5.0, n=8)
