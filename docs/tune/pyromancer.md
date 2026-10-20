# tune-top: pyromancer
- 目標: 環境1位に到達し、その後も環境勝率が上がらなくなるまで洗練する
- 最後に検証したmaster: 993d291(未達のため参考。done になったら更新)
- 現在の推奨設定: gears=[sturdy, harvest] deck=[0,3,5,8,11,12,28,31,53,56,58,61]  (旧: 32浄化→11ダブルトークン) AIフラグ=なし
- 基準線(採用#5後): 環境勝率 44.0% / 7位 / 1位 tactician 63.4%  (seed3, 100試合, `--rank --target`; 下は初期基準)
- 初期基準線: 環境勝率 38.9% / 10位(最下位) / 1位 tactician 67.8%   (master 4b849ea, seed 1, games 60, `--rank`)
  - 対キャラ別: tactician 21.7 / electrician 30.0 / magician 26.7 / giant 41.7 / cryomancer 38.3 / you 40.0 / poisoner 48.3 / yinYangMaster 50.0 / necromancer 53.3
- 連続不採用回数: 1(採用#5のあと strategy)
- 状態: blocked(issue #99)

## 試行ログ(新しい順。却下も必ず残す。同じ案を再試行しない)
| # | 軸 | 仮説 | 結果(field Δ±95%CI) | 採否 |
|---|---|---|---|---|
| (計測中) | gear | `--scan gears --games 60 --seed 1` で1枠差し替え近傍を全測定 | — | — |

## 次に試す候補
- 採用後の基準線を `--rank --games 200 --seed 3` で取り直す(順位は未確認)。次: 新デッキでの gear 再走査、strategy(業火の使用率8%)
(軸の順 gear → deck → synergy → strategy → メタ → joint)
- (済)gear: sturdy,harvest は近傍でほぼ最適。変更しても±ノイズ内
- (済)synergy fire: 🔥札の追加では動かない(+0.6pt)。残りは strategy(使用率監査)/メタ/joint
- 注意: `--target` 単体の base は 45.9%、`--rank` の 38.9% と差(seed/対戦構成の違い)。比較は同じ計測内の base 対候補で行う
- deck: 🔥付与札+軽減札のシナジー(`--swap 3 --cat fire`)
- メタ: tactician / electrician / magician に -10pt 以下 → `--opp` で絞って対策
