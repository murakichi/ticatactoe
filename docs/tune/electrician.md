# tune-top: electrician (雷霆の巫)
- 目標: 環境1位に到達し、その後も環境勝率が上がらなくなるまで洗練する
- 最後に検証したmaster: 993d291
- 現在の推奨設定: (sim/gear.js・sim/deck.js の RECOMMENDED を参照。未変更)
- 基準線: 環境勝率 60.2% / 2位 / 1位 tactician 67.8%   (seed 1, games 60, size 4, master 4b849ea)
- 連続不採用回数: 1
- 状態: running(トップ未達)
## 試行ログ(新しい順。却下も必ず残す。同じ案を再試行しない)
| # | 軸 | 仮説 | 結果(field Δ±95%CI) | 採否 |
|---|---|---|---|---|
| 1 | gear | 1枠差し替え全29近傍(seed1,60試合)。基準[sturdy,harvest]63.5%、最良 lightToken+harvest 66.7%(+3.2) / afterglow+harvest 65.9%(+2.4)。SE≈2.0なのでz≈1.1、n≤40の閾値3.0に届かず | 再測定せず不採用(保留: 要追試。lightToken/afterglow は slot0 で上位2つ) | 不採用 |
## 次に試す候補(軸の順 gear → deck → synergy → strategy → joint)
- synergy: `--scan deck --swap 3 --cat charge --neighbors 40`(帯電付与+発火)
- deck: `--scan deck --neighbors 30`
- gear保留: lightToken/afterglow を seed2・200試合で後追い可
- 対 tactician 50.0%、対 giant 55%、対 magician 56.7%(基準線 per より)
