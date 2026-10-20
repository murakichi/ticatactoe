# tune-top: cryomancer
- 目標: 環境1位に到達し、その後も環境勝率が上がらなくなるまで洗練する
- 最後に検証したmaster: f55e71a
- 現在の推奨設定: gears=[afterglow,sturdy] deck=[3,8,12,28,41,42,43,44,45,46,47,48] AIフラグ=cryoCards=1(既定)
- 基準線: 環境勝率 62.5% / 2位 / 1位 magician 67.3%  (seed=3, games=200, master 80d796c)
- 連続不採用回数: 4
- PR #86 を master にマージ済み(ae193e7)。マージ前の再検証(seed3/200, 基本条件): 1位 magician 67.3 / 2位 cryomancer 62.5 / 3位 tactician 60.3。魔法使いの死に札入替(#90)で陥落。
- 状態: running(トップ未達。master 80d796c の魔法使い調整で陥落)
## 試行ログ(新しい順。却下も必ず残す。同じ案を再試行しない)
| # | 軸 | 仮説 | 結果(field Δ±95%CI) | 採否 |
|---|---|---|---|---|
| 8 | meta | 対magician/tactician に絞ったデッキ1枚近傍30(seed1,100。base 46.0±6.9) | 最良 +6.5pt(砕氷→毒霧 52.5±6.9)だが SE 6.9 で z≈0.9、閾値3.0に届かず | 不採用 |
| 7 | strategy | 監査(--scan audit, vs magician/tactician 100): 範囲氷結41・氷柱42・ランダム氷結43・氷結拡散44・砕氷47 が「差なし」=AIが一度も使わない死に札。強制使用 force=41\|42\|43\|44\|47 を試す | seed1/100: 63.6→56.0 (-7.7pt, SE1.6) | 不採用(簡易評価で撃つと魔力を浪費して悪化。専用の撃ち所ロジックが要る=次回候補) |
| 6 | gear | 1枠差し替え全近傍(seed1,60。base 65.1±3.8) | 全て base 以下(最良 lightToken 60.4)。afterglow を外すと -5〜-9pt | 不採用 |
| 5 | synergy | サポート札2枚同時入れ替え swap2 --cat support 30近傍(seed1,60) | 最良 63.5±3.9(特売+活力特売を追加)。基準と同水準で閾値z≥3.0に届かず | 不採用 |
| 4 | strategy | 未使用札の監査: probe-usage で氷系8枚中、霜降り・氷結トークン系が一度も使われない。既存の暫定ノブ useNew を氷室のみに限定した F.cryoCards を既定ON | seed1/100: 58.6→66.6。seed2/200: 55.3→64.3(SE1.1) = +9.1pt | 採用(sim/ai.js + 本番AIPlayer.ts にミラー、回帰テスト追加。本番AIでは環境勝率は未計測) |
| 3 | synergy | 氷系3枚同時入れ替え(--swap 3 --cat ice) | 候補ゼロ(デッキの氷系札が入替対象を使い切っており近傍が生成されず) | 無効/再試行不要 |
| 2 | deck | 1枚差し替え30近傍(seed1,60。base 59.2%) | 最良 +1.5pt(氷結拡散→バッズトークン 60.7±3.8)。n=30の閾値z≥3.0に届かず全て誤差。トークン(3)抜きは -8〜-12pt で必須 | 不採用 |
| 1 | gear | 余韻(afterglow): スキル使用の次ターン最初のスキル-1 → 氷結(2)が毎ターン1で撃てる(ユーザー案)。harvest→afterglow | seed1/100: 46.3→58.6(SE1.6)。seed2/200: 42.3→55.3(SE1.1) = +13.0pt | 採用(gears=afterglow,sturdy)。afterglow+harvestは seed1 49.8 で不採用 |
## 次に試す候補(軸の順 gear → deck → synergy → strategy → メタ → joint)
- 対tactician 26.7%/magician 26.7%/electrician 38.3%/you 36.7% が弱点。氷結札+砕氷のシナジー(--swap 3 --cat ice)、氷室AIの未使用操作監査。

- 完了判定(cryoCards採用後, seed3/200): 基本 1位65.4(2位tactician62.2) / envDeck varied 1位63.9(2位electrician61.8) / oppGears none 1位58.6(2位magician58.1) / oppGears random 5位54.8(1位tactician56.8, -2.0pt)。(注: この4条件は --target 無しで測ったため、none/random では氷室自身も推奨ギアでなくなっていた。測り直し(--target cryomancer --gears afterglow,sturdy): none 1位77.8(2位tactician55.1) / random 1位71.0(2位tactician56.3))。**4条件すべて1位 = トップ到達**。
- 順位(seed3/200, 旧): 1 tactician 63.3, 2 electrician 58.3, 3 cryomancer 56.6, 4 giant 56.3, 5 magician 55.7。8位→3位。本番AIでは未計測。
- 次: deck(1枚/シナジー)走査、氷結を毎ターン撃つAIノブ(strategy)。
