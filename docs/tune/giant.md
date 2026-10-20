# tune-top: giant
- 目標: 環境1位に到達し、その後も環境勝率が上がらなくなるまで洗練する
- 最後に検証したmaster: 993d291
- 現在の推奨設定: gears=[titanCost, sturdy] deck=[0,1,2,3,5,6,8,11,12,13,27,28] AIフラグ=なし
- 基準線: 環境勝率 56.5% / 3位 / 1位 tactician 67.8%, 2位 electrician 60.2%   (--rank seed=1 games=60, 旧master 4b849ea)
- 連続不採用回数: 0
- 状態: running(トップ未達)
## 試行ログ(新しい順。却下も必ず残す。同じ案を再試行しない)
| # | 軸 | 仮説 | 結果(field Δ±95%CI) | 採否 |
|---|---|---|---|---|
| 0 | - | 基準線取得 | 56.5% (対 cryomancer 36.7%, electrician 45%, tactician 48.3% が弱点) | - |
## 次に試す候補(軸の順 gear → deck → synergy → strategy → メタ → joint)
- gear: `--scan gears`(実行中)
- メタ: 対 cryomancer / electrician / tactician
