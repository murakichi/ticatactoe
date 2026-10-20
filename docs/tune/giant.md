# tune-top: giant
- 目標: 環境1位に到達し、その後も環境勝率が上がらなくなるまで洗練する
- 最後に検証したmaster: 993d291
- 現在の推奨設定: gears=[titanCost, sturdy] deck=[0,1,2,3,5,6,8,11,12,13,27,28] AIフラグ=なし
- 基準線: 環境勝率 56.5% / 3位 / 1位 tactician 67.8%, 2位 electrician 60.2%   (--rank seed=1 games=60, 旧master 4b849ea)
- 連続不採用回数: 2
- 状態: running(トップ未達)
## 試行ログ(新しい順。却下も必ず残す。同じ案を再試行しない)
| # | 軸 | 仮説 | 結果(field Δ±95%CI) | 採否 |
|---|---|---|---|---|
| 2 | deck(1枚) | 1枚差し替え30近傍(seed1, 60試合) | 最良 -バイバイン+火遁 58.1% vs 基準56.3% (+1.8, z≈0.6<3.0)。全て基準±2pt内で分布が一様 | 不採用(ノイズ) |
| 1 | gear | 1枠差し替え全近傍(seed1, 60試合, 1設定17分/全体) | 最良 priceWreck+sturdy 57.2% vs 基準56.3% (+0.9, SE≈2.1)。他は全て基準以下(gambler -14pt) | 不採用(閾値未満・n=32) |
| 0 | - | 基準線取得 | 56.5% (対 cryomancer 36.7%, electrician 45%, tactician 48.3% が弱点) | - |
## 次に試す候補(軸の順 gear → deck → synergy → strategy → メタ → joint)
- synergy(次): `--scan deck --swap 3 --cat <category> --neighbors 40`(攻撃/氷/火など、対 cryomancer・electrician を意識)
- strategy: `probe-usage.js --chars giant,cryomancer --games 200` で使用率監査
- メタ: 対 cryomancer / electrician / tactician
