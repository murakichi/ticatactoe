# tune-top: giant
- 目標: 環境1位に到達し、その後も環境勝率が上がらなくなるまで洗練する
- 最後に検証したmaster: 81ad8ce
- 現在の推奨設定: gears=[lastStand, sturdy] deck=[0,1,2,3,5,6,8,11,12,13,27,28] AIフラグ=stompMin=1,stompDef=1,auraSim=1(既定)
- 基準線: 環境勝率 50.9% / 6位 / 1位 poisoner 70.7%, 2位 magician 56.4%   (--rank seed=3 games=100, master 取り込み後)
- 連続不採用回数: 1
- 状態: blocked(issue #97。6種の軸を測り終え、1位poisonerが2位より約14pt突出=調整は別途)
## 試行ログ(新しい順。却下も必ず残す。同じ案を再試行しない)
| # | 軸 | 仮説 | 結果(field Δ±95%CI) | 採否 |
|---|---|---|---|---|
| 22 | synergy/strategy(陰陽師の戦略を参考) | 割引札を足す（固有割引57・特売53。陰陽師はコンボを13→6魔力に圧縮して勝つ）, seed1/100 | 基準43.6%（最新master）に対し 43.4 / 43.2 / 43.1。AIは固有割引を一度も撃たない（使用0）、特売は0.2回/試合。ストンプは元から3魔力で、圧縮の余地が小さい | 不採用 |
| 21 | strategy(防壁のAI) | lsAggro=0 / hoard=3 / rush=1 / spam=1（巨人でlastStand使用, seed1/100） | 55.8(現行) / 53.9 / 55.8 / 41.0 / 56.8(+1.0) | 不採用 |
| 20 | gear | 最新masterでギア再スキャン→ lastStand+sturdy （seed1/60: 55.5 vs 52.1。seed2/200: 57.5 vs 52.8、seed4/200: 58.5 vs 52.0）。対poisoner 26-32→53-54%、対necro 9-11→26-32% | +4.7/+6.5 | 採用 |
| 19 | joint | gears=lastStand,sturdy でデッキ1枚30近傍(seed1,60) | 最良 56.3% vs 基準≈55.5。誤差内 | 不採用 |
| 18 | strategy(対necromancer) | 相手にネクロマンサーがいるときストンプを撃たない(stompNoNecro; 破壊で墓地が増えるため) | `--opp necromancer` 150試合: 12.0%→0.7%。ストンプ自体が必須 | 不採用(ノブ削除) |
| 17 | synergy | support札2枚同時入れ替え40近傍(seed1,60) | 最良 53.9% vs 基準≈51%。z<1.5で誤差内 | 不採用 |
| 16 | strategy | ストンプ閾値/防御の見直し(stompMin=2, stompDef=0)（コスト3で過剰撃ちか確認, seed1/100） | 現行 50.8% > stompMin=2 47.7% > stompDef=0 39.5% > 両方 36.6%。現行既定が最良 | 不採用 |
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
