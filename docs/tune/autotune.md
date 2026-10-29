# autotune 記憶(自動生成)

sim/autotune.js が「効かない/明らかに悪い」と判断して探索から外したもの。コード(sim/*.js)が変わると失効する。コード版: `2f54eb8f50f5`

- **無効ノブ**: そのキャラのAIが使わず、動かしても全試合の結果が基準と完全一致したノブ（`k=*` は全ての値が一致）（pilot / 本探索で判定）
- **悪い候補**: 観測3回以上で平均 z ≤ -2 かつ一度も改善しなかったもの（6周回で失効）

## magician
- 入れると悪い札: 0(z̄-2.5, n=3), 25(z̄-2.3, n=3)
- 抜くと悪い札(必須): 2(z̄-2.6, n=5), 9(z̄-2.2, n=6), 11(z̄-2.4, n=5), 47(z̄-2.0, n=5), 56(z̄-2.1, n=5), 60(z̄-2.5, n=5)

## you
- 無効ノブ(65): yyCover=*, necroLock=*, floodHold=*, witchReserve=*, digSpare=*, loopDig=*, burnoutAfter=*, shComboReal=*, freeTok=*, unblock=*, shuffleDig=*, shSpecials=*, loopMin=*, chargeWait=*, antiPoison=*, lockFirstPyro=*, elecNoAnti=*, digMargin=*, freezeBuds=*, smallFryMin=*, shReserve=*, noJudgeNecro=*, antiSummonMax=*, taFrost=*, noDig53=*, antiPoisonMargin=*, cryoPoison=*, auraSim=*, smallFry=*, igniteSkip=*, witchDig=*, staleMove=2, lsAggro=*, pyroChain=*, stompMin=*, shMax=*, shBlastMin=*, comboDiscount=*, discountPlan=*, pyroLock=*, taFrostLock=*, yyBudLock=*, lock53Late=*, cryoCards=*, floodCover=*, witchNoAnti=*, igniteBud=*, frzBlock=*, noCapNecro=*, antiFlood=*, lockFirstCryo=*, antiSummon=*, igniteSig=*, yyCoverCryo=*, stompDef=*, discountInferno=*, tinderLock=*, chargeSafe=*, igniteReserve=*, lockNew=*, magLockN=*, freezeBudsReserve=*, floodLock=*, digRelock=*, bloomLoop=*
