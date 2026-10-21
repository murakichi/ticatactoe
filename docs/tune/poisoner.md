# tune-top: poisoner
- 目標: 環境1位に到達し、その後も環境勝率が上がらなくなるまで洗練する
- 最後に検証したmaster: 249e5c1
- 現在の推奨設定: gears=[titanCost,sturdy] deck=[0,3,8,12,15,16,17,18,19,28,29,32] AIフラグ=既定
- 基準線: 環境勝率 36.8% / 順位 10位 / 1位 electrician 66.8%   (seed1, games60, rank)
- 連続不採用回数: 0
- 状態: running(トップ未達)
## 試行ログ(新しい順。却下も必ず残す。同じ案を再試行しない)
| # | 軸 | 仮説 | 結果(field Δ±95%CI) | 採否 |
|---|---|---|---|---|
| 0 | - | 基準線測定 | 対cryomancer 21%, pyromancer 32%, electrician 32% が弱い | - |
## 次に試す候補(軸の順 gear → deck → strategy を巡回)
- gear 1枠差し替えスキャン
- probe-usage で毒札(15-19,29)の使用回数監査
