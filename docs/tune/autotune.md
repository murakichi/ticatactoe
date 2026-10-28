# autotune 記憶(自動生成)

sim/autotune.js が「効かない/明らかに悪い」と判断して探索から外したもの。コード(sim/*.js)が変わると失効する。コード版: `133223269d28`

- **無効ノブ**: そのキャラのAIが使わず、動かしても全試合の結果が基準と完全一致したノブ（`k=*` は全ての値が一致）（pilot / 本探索で判定）
- **悪い候補**: 観測3回以上で平均 z ≤ -2 かつ一度も改善しなかったもの（6周回で失効）

## giant
- 無効ノブ(45): pyroLock=*, igniteReserve=*, yyCover=*, shMax=*, noCapNecro=*, igniteSig=*, discountPlan=*, shuffleDig=*, bloomLoop=*, freezeBudsReserve=*, antiPoisonMargin=*, antiSummon=*, frzBlock=*, loopMin=*, cryoPoison=*, unblock=*, floodHold=*, floodCover=*, noDig53=*, pyroChain=*, igniteBud=*, antiPoison=*, cryoCards=*, shBlastMin=*, magLockN=*, burnoutAfter=*, floodLock=*, digSpare=*, freezeBuds=*, discountInferno=*, shReserve=*, chargeSafe=*, antiSummonMax=*, lock53Late=*, yyCoverCryo=*, digRelock=*, loopDig=*, shComboReal=*, necroLock=*, yyBudLock=*, chargeWait=*, comboDiscount=*, elecNoAnti=*, igniteSkip=*, antiFlood=*
