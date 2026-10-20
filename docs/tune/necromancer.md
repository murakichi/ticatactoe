# tune-top: necromancer
- 目標: 環境1位に到達し、その後も環境勝率が上がらなくなるまで洗練する
- 最後に検証したmaster: (未到達。取り込み済み master=edf73fb)
- 現在の推奨設定: 既定(推奨ギア/デッキそのまま)
- 基準線: 環境勝率 42.6% / 9位 / 1位 tactician 67.8%  (--rank, seed 1, games 60, 2026-10-20)
- 連続不採用回数: 4 (gear, deck, synergy, strategy/audit)
- 状態: running
## 試行ログ(新しい順。却下も必ず残す。同じ案を再試行しない)
| # | 軸 | 仮説 | 結果(field Δ±95%CI) | 採否 |
|---|---|---|---|---|
| 5 | strategy/deck | 死に札6枚(6,12,13,27,28,32)を使われそうな札へ置換した3案(seed1 games100): A=[..,4,9,10,53,56,58] B=[..,4,9,10,14,29,42] C=[..,4,9,16,17,53,58] | 基準44.9%に対し A 46.5%(+1.6) B 44.7%(-0.2) C 45.1%(+0.2)。SE±1.6(z≈0.7)で全て誤差内。死に札が提示枠を潰す仮説は支持されず | 不採用 |
| 4 | strategy(監査) | audit scan(opp=tactician,yinYang,giant) + probe-usage | base42.4%。札6,12,13,27,28,32が「差なし」=AI未使用(12枠中6枠が死に札)。寄与大: ギア vengeance +14.0/sturdy +9.1、トークン+3.9、バッズ+3.0。降霊は使った試合勝率100%だが使用29〜38%/試合。仮説: 死に札が3枠提示を圧迫 → 使われる札へ置換したデッキを測る | 結果は#5 |
| 3 | synergy | 3枚同時入れ替えランダム40近傍(seed1 games60) | 基準45.5%に対し最良 48.7%(+3.2pt, z≈1.1 < 閾値3.0)。上位3つは特売系(53/56/58)＋氷結/縮地。全て誤差内 | 不採用 |
| 2 | deck | 1枚差し替えランダム30近傍(seed1 games60) | 基準45.5%に対し最良 -3トークン+53特売 48.8%(+3.3pt, z≈1.1 < 閾値3.0)。上位は+2〜3pt帯で氷結/特売系が並ぶが全て誤差内 | 不採用(再測定に進まず) |
| 1 | gear | 1枠差し替え近傍スキャン(vengeance,sturdy から30通り, seed1 games60) | 基準45.5%に対し最良 afterglow/sturdy 39.5%(-6.0pt)。全近傍が基準以下 | 不採用 |
## 次に試す候補(軸の順 gear → deck → strategy を巡回)
- (gear,deck1枚,synergy 済) メタ(対tactician 38%/electrician 39%/yinYang 42%に絞る) → joint(ギア×デッキ) → strategy(降霊の撃ち所を増やすAIノブ、sim/ai.js necromancer節)。(--swap 3) → strategy(probe-usage) → メタ(対tactician 23%, 対yinYang 27%, 対giant 33%) → joint
