# tune-top: poisoner
- 目標: 環境1位に到達し、その後も環境勝率が上がらなくなるまで洗練する
- 最後に検証したmaster: 249e5c1
- 現在の推奨設定: gears=[toxicBloom,sturdy] deck=[0,3,12,15,16,17,18,19,28,29,32,43] AIフラグ=既定
- 基準線: 環境勝率 49.2% / 順位 6位 / 1位 magician 67.1%   (seed3, games100, rank --target poisoner)
- 連続不採用回数: 0
- 状態: running(トップ未達)
## 試行ログ(新しい順。却下も必ず残す。同じ案を再試行しない)
| # | 軸 | 仮説 | 結果(field Δ±95%CI) | 採否 |
|---|---|---|---|---|
| 2 | deck | -8(オピウム) +43(氷結トークン) (1枚近傍上位4つが全部-8) | scan(seed1/60) 49.1→53.3。再測定(seed2/200) 47.8→51.2 (+3.4, 閾値3.2ぎりぎり)。+53は50.7,+44は51.2(43と同値=追加札は未使用で、効果は『オピウムを抜く』こと) | 採用(境界) |
| 1 | gear | slot0 titanCost→toxicBloom | scan(seed1/60) 36.6→49.1。再測定(seed2/200) 39.4→47.8 (+8.4, z≈5) | 採用 |
| 0 | - | 基準線測定 | 対cryomancer 21%, pyromancer 32%, electrician 32% が弱い | - |
## 次に試す候補(軸の順 gear → deck → strategy を巡回)
- strategy: usage監査(毒札は使用が少ない: 毒トークン0.29回・パンデミック0.08回/試合)
- 弱い相手: cryomancer 33%, magician 35%
- probe-usage で毒札(15-19,29)の使用回数監査
