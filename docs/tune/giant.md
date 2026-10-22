# tune-top: giant
- 目標: 環境1位に到達し、その後も環境勝率が上がらなくなるまで洗練する
- 最後に検証したmaster: 3bc89db
- 現在の推奨設定: gears=[vengeance, sturdy] deck=[0,1,2,3,5,6,8,11,12,13,27,28] AIフラグ=stompMin=1,stompDef=1,auraSim=1(既定)
- 基準線: 環境勝率 50.6% / 7位 / 1位 poisoner 73.5%, 2位 magician 58.8%   (--rank seed=3 games=100, master 取り込み後。ストンプコスト3。取り込み前は 57.9%/4位)
- 連続不採用回数: 2
- 状態: 確定(ユーザー判断でトップ未達のままマージ。一強 poisoner が突出=調整は別途)
## 試行ログ(新しい順。却下も必ず残す。同じ案を再試行しない)
| # | 軸 | 仮説 | 結果(field Δ±95%CI) | 採否 |
|---|---|---|---|---|
| 15 | メタ(対poisoner,magician) | `--opp poisoner,magician` でデッキ1枚30近傍(seed1,150) | 最良 22.4% vs 基準21.8%。全て誤差内（デッキでは動かない） | 不採用 |
| 14 | strategy | 着手評価にオーラを反映(auraSim=1) | 53.1→60.2%(seed2/200, +7.1) | 採用 |
| 13 | deck | ストンプコスト3でデッキ1枚差し替え30近傍(seed1,60) | 最良 51.3% vs 基準50.9%。全て誤差内 | 不採用 |
| 12 | gear | ストンプコスト3で再スキャン: vengeance+sturdy(seed1/60: 50.7 vs 41.7 → seed2/200: 53.1 vs 44.1) | +9.0 | 採用 |
| 11 | gear | 推奨ギア titanCost+sturdy → afterglow+sturdy(剛腕の代償は全スキルコスト+3でストンプ(コスト2)を5に戻していた) | 26.5→80.9%(--rank seed3/100)。4条件(基本/envDeck varied/oppGears none/random)すべて1位(80.9/83.0/92.2/91.3%) | 採用 |
| 10 | strategy | ストンプのAI: stompMin=1 + stompDef=1(相手リーチ時もストンプで脅威を減らす) | 14.6→26.2%(seed2/200, +11.6pt)。stompOwnW=0.5は悪化→削除 | 採用 |
| 9 | 仕様変更(ユーザー指定) | 2ターンに1回行動・ライフ平均10・オーラ(周囲8マスの敵コマ破壊+8マスロック)・ストンプのコスト2 | 環境勝率 52%→0.9→6.3→12.4% | - |
| 8 | deck(再) | 新環境でデッキ1枚30近傍(seed1,60) | 最良 -バイバイン+火遁 53.3% vs 基準51.1% (+2.2, z<1)。旧環境と同じ顔ぶれ | 不採用 |
| 7 | gear(再) | ギア4種追加(colorGarden/ailmentPact/ruinSurge/lastStand)後の1枠差し替え全近傍(seed1,60) | base 51.1%。最良 priceWreck+sturdy 50.6%, emptyLock 50.6%。新ギア4種は全て基準以下(42.6〜46.5%) | 不採用 |
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
