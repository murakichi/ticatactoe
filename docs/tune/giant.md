# tune-top: giant
- 目標: 環境1位に到達し、その後も環境勝率が上がらなくなるまで洗練する
- 最後に検証したmaster: 3bc89db
- 現在の推奨設定: gears=[titanCost, sturdy] deck=[0,1,2,3,5,6,8,11,12,13,27,28] AIフラグ=なし
- 基準線: 環境勝率 56.5% / 3位 / 1位 tactician 67.8%, 2位 electrician 60.2%   (--rank seed=1 games=60, 旧master 4b849ea)
- 連続不採用回数: 0
- 状態: running(トップ未達。ギア4種追加を受けて再開)
## 試行ログ(新しい順。却下も必ず残す。同じ案を再試行しない)
| # | 軸 | 仮説 | 結果(field Δ±95%CI) | 採否 |
|---|---|---|---|---|
| 6 | joint | `--gears priceWreck,sturdy` × デッキ30近傍(seed1,60)→最良 -バッズ+特売 60.0%(基準57.2%)。seed2,200で再測定 | priceWreck単独 53.0% / +特売 55.1% / titanCostのまま+特売 55.3% (基準55.3%) → 全て基準以下 | 不採用 |
| 5 | メタ(対cryomancer) | `--opp cryomancer` でデッキ1枚40近傍(seed1,200試合)→最良 -バイバイン+火遁 47% vs 基準38%。seed2,200試合の環境全体で再測定 | 環境55.8% vs 基準55.3% (+0.5)。対cryomancer 37→44%だが他は横ばい。勝者の呪い込みで+1.5pt未満 | 不採用(保留: cryomancer特化なら有効) |
| 4 | strategy | ストンプの最低敵数 2→1 (`stompMin`ノブ) | probe-usage で stomp 0.42→0.43回/試合、環境勝率57.0%で同一(seed1,100)。発動条件ではなく魔力が律速 | 不採用(ノブ削除) |
| 3 | synergy | 氷3枚同時入れ替え40近傍(seed1, 60試合, 対cryomancer狙い) | 最良 57.2% vs 56.3% (+0.9)。全て+1pt以内。攻撃カテゴリは未入札が2枚のみで成立せず | 不採用(ノイズ) |
| 2 | deck(1枚) | 1枚差し替え30近傍(seed1, 60試合) | 最良 -バイバイン+火遁 58.1% vs 基準56.3% (+1.8, z≈0.6<3.0)。全て基準±2pt内で分布が一様 | 不採用(ノイズ) |
| 1 | gear | 1枠差し替え全近傍(seed1, 60試合, 1設定17分/全体) | 最良 priceWreck+sturdy 57.2% vs 基準56.3% (+0.9, SE≈2.1)。他は全て基準以下(gambler -14pt) | 不採用(閾値未満・n=32) |
| 0 | - | 基準線取得 | 56.5% (対 cryomancer 36.7%, electrician 45%, tactician 48.3% が弱点) | - |
## 次に試す候補(軸の順 gear → deck → synergy → strategy → メタ → joint)
- strategy: 魔力が律速 → 魔力獲得/コスト側(チャージ運用、軽減札を先撃ち)、ストンプ撃ち所(リーチ防御にストンプを使う)
- synergy 未測: fire/support/charge の3枚入れ替え
- メタ: 対 electrician / tactician も同様に `--opp` で測れる
- joint(次): `--gears priceWreck,sturdy --scan deck`
- メタ: 対 cryomancer / electrician / tactician
