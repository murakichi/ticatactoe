# tune-top: magician
- 目標: 環境1位に到達し、その後も環境勝率が上がらなくなるまで洗練する
- 最後に検証したmaster: 993d291
- 現在の推奨設定: gears=[sturdy, ironLock] deck=推奨のまま AIフラグ=なし
- 基準線: 環境勝率 56.3% / 4位 / 1位 tactician 67.8%   (seed 1, games 60, master 4b849ea 時点)
- 連続不採用回数: 0
- 状態: running(トップ未達)
## 試行ログ(新しい順。却下も必ず残す。同じ案を再試行しない)
| # | 軸 | 仮説 | 結果(field Δ±95%CI) | 採否 |
|---|---|---|---|---|
| - | - | 基準線測定のみ。対tactician 23%・対electrician 43%・対necromancer 42% が弱点 | - | - |
## 次に試す候補(軸の順 gear → deck → synergy → strategy → joint を巡回)
- gear: `--scan gears`(master 取り込み後の probe-top で再実行。前回は10分超でフォアグラウンド打ち切り)
- メタ: 対tactician(23%)に絞った `--opp tactician` の札/ギア探索
