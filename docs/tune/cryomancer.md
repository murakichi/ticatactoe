# tune-top: cryomancer
- 目標: 環境1位に到達し、その後も環境勝率が上がらなくなるまで洗練する
- 最後に検証したmaster: f55e71a
- 現在の推奨設定: gears=[afterglow,sturdy] deck=[3,8,12,28,41,42,43,44,45,46,47,48] AIフラグ=既定
- 基準線: 環境勝率 56.6% / 3位 / 1位 tactician 63.3%, 2位 electrician 58.3%  (seed=3, games=200, ギア afterglow,sturdy 反映後)
- 連続不採用回数: 0
- 状態: running(トップ未達)
## 試行ログ(新しい順。却下も必ず残す。同じ案を再試行しない)
| # | 軸 | 仮説 | 結果(field Δ±95%CI) | 採否 |
|---|---|---|---|---|
| 1 | gear | 余韻(afterglow): スキル使用の次ターン最初のスキル-1 → 氷結(2)が毎ターン1で撃てる(ユーザー案)。harvest→afterglow | seed1/100: 46.3→58.6(SE1.6)。seed2/200: 42.3→55.3(SE1.1) = +13.0pt | 採用(gears=afterglow,sturdy)。afterglow+harvestは seed1 49.8 で不採用 |
## 次に試す候補(軸の順 gear → deck → synergy → strategy → メタ → joint)
- 対tactician 26.7%/magician 26.7%/electrician 38.3%/you 36.7% が弱点。氷結札+砕氷のシナジー(--swap 3 --cat ice)、氷室AIの未使用操作監査。

- 順位(seed3/200): 1 tactician 63.3, 2 electrician 58.3, 3 cryomancer 56.6, 4 giant 56.3, 5 magician 55.7。8位→3位。本番AIでは未計測。
- 次: deck(1枚/シナジー)走査、氷結を毎ターン撃つAIノブ(strategy)。
