# tune-top: cryomancer
- 目標: 環境1位に到達し、その後も環境勝率が上がらなくなるまで洗練する
- 最後に検証したmaster: 993d291
- 現在の推奨設定: gears=[sturdy,harvest] deck=[3,8,12,28,41,42,43,44,45,46,47,48] AIフラグ=既定
- 基準線: 環境勝率 43.5% / 8位 / 1位 tactician 67.8%  (seed=1, games=60, master 4b849ea。新master 993d291 では未取り直し)
- 連続不採用回数: 0
- 状態: running(トップ未達)
## 試行ログ(新しい順。却下も必ず残す。同じ案を再試行しない)
| # | 軸 | 仮説 | 結果(field Δ±95%CI) | 採否 |
|---|---|---|---|---|
| 1 | gear | 1枠差し替え近傍を全測定(seed1,60) | 計測中 | - |
## 次に試す候補(軸の順 gear → deck → synergy → strategy → メタ → joint)
- 対tactician 26.7%/magician 26.7%/electrician 38.3%/you 36.7% が弱点。氷結札+砕氷のシナジー(--swap 3 --cat ice)、氷室AIの未使用操作監査。
