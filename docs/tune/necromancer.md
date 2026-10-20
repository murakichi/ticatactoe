# tune-top: necromancer
- 目標: 環境1位に到達し、その後も環境勝率が上がらなくなるまで洗練する
- 最後に検証したmaster: (未到達)
- 現在の推奨設定: 既定(推奨ギア/デッキそのまま)
- 基準線: 環境勝率 42.6% / 9位 / 1位 tactician 67.8%  (--rank, seed 1, games 60, 2026-10-20)
- 連続不採用回数: 0
- 状態: running
## 試行ログ(新しい順。却下も必ず残す。同じ案を再試行しない)
| # | 軸 | 仮説 | 結果(field Δ±95%CI) | 採否 |
|---|---|---|---|---|
| 1 | gear | 1枠差し替え近傍スキャン | 計測中 | - |
## 次に試す候補(軸の順 gear → deck → strategy を巡回)
- gear scan → deck scan(1枚) → synergy(--swap 3) → strategy(probe-usage) → メタ(対tactician 23%, 対yinYang 27%, 対giant 33%) → joint
