# tune-top: magician
- 目標: 環境1位に到達し、その後も環境勝率が上がらなくなるまで洗練する
- 最後に検証したmaster: edf73fb
- 現在の推奨設定: gears=[sturdy, ironLock] deck=推奨のまま AIフラグ=なし
- 基準線: 環境勝率 56.3% / 4位 / 1位 tactician 67.8%   (seed 1, games 60, master 4b849ea 時点)
- 連続不採用回数: 1(gear)
- 状態: running(トップ未達)
## 試行ログ(新しい順。却下も必ず残す。同じ案を再試行しない)
| # | 軸 | 仮説 | 結果(field Δ±95%CI) | 採否 |
|---|---|---|---|---|
| 1 | gear | 1枠差し替え近傍(30通り)を `--scan gears --games 60 --seed 1`(master edf73fb)で測定。基準 [sturdy,ironLock] 59.3%±3.9 が最上位。次点 slot0→luckyPurse 57.4%、gambler 56.9%。全近傍が基準以下 | 不採用(現ギアが局所最適) |
| 0 | - | 基準線測定のみ。対tactician 23%・対electrician 43%・対necromancer 42% が弱点 | - | - |
## 次に試す候補(軸の順 gear → deck → synergy → strategy → joint を巡回)
- deck: `--scan deck --neighbors 30`、`--scan audit`(札の寄与)、`probe-usage.js --chars magician,tactician`
- メタ: 対tactician(23%)に絞った `--opp tactician` の札/ギア探索
