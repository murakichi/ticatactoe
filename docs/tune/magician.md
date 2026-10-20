# tune-top: magician
- 目標: 環境1位に到達し、その後も環境勝率が上がらなくなるまで洗練する
- 最後に検証したmaster: edf73fb
- 現在の推奨設定: gears=[sturdy, ironLock] deck=[2,3,8,10,11,12,13,14,33,34,35,36](サイレンス28→ダブルトークン11) AIフラグ=なし
- 基準線: 環境勝率 61.2%±1.5(採用後。旧デッキは58.6%) / 順位表は未取得(採用前 4位 56.3% / 1位 tactician 67.8%, seed1/60試合)   (seed 3, games 400, master edf73fb)
- 連続不採用回数: 0
- 状態: running(トップ未達)
## 試行ログ(新しい順。却下も必ず残す。同じ案を再試行しない)
| # | 軸 | 仮説 | 結果(field Δ±95%CI) | 採否 |
|---|---|---|---|---|
| 3 | deck | 札1枚差し替え近傍30通り(seed1/60)の上位3つが全て +11ダブルトークン追加。再測定 seed2/200: base 57.2, A(-8) 58.6, B(-28) 59.2, C(-14) 59.1 → 境界のため追試 seed3/400: base 58.6±1.5 → B 61.2±1.5(+2.6pt、対tactician 39→43, 対cryomancer 65→72、悪化なし) | **採用** B: -28サイレンス +11ダブルトークン(sim/deck.js, src/deck.ts にミラー。jest 80件・gear.test 通過。本番AIでは未計測) |
| 1 | gear | 1枠差し替え近傍(30通り)を `--scan gears --games 60 --seed 1`(master edf73fb)で測定。基準 [sturdy,ironLock] 59.3%±3.9 が最上位。次点 slot0→luckyPurse 57.4%、gambler 56.9%。全近傍が基準以下 | 不採用(現ギアが局所最適) |
| 0 | - | 基準線測定のみ。対tactician 23%・対electrician 43%・対necromancer 42% が弱点 | - | - |
## 次に試す候補(軸の順 gear → deck → synergy → strategy → joint を巡回)
- synergy: `--scan deck --swap 3 --cat token --neighbors 40`(ダブルトークン採用を受けトークン系の組)、`--swap 2`
- deck(済: 1枚近傍): `--scan audit`(札の寄与)、`probe-usage.js --chars magician,tactician`
- メタ: 対tactician(23%)に絞った `--opp tactician` の札/ギア探索
