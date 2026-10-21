# tune-top: poisoner
- 目標: 環境1位に到達し、その後も環境勝率が上がらなくなるまで洗練する
- 最後に検証したmaster: 3bc89db
- 現在の推奨設定: gears=[lastStand,sturdy] deck=[0,3,12,15,16,17,18,19,29,45,46,48] AIフラグ=cryoPoison=1(既定)
- 基準線: 環境勝率 79.2% / 順位 1位 / 2位 magician 64.3%   (seed3, games100, rank --target poisoner, master 3bc89db)
- 連続不採用回数: 0
- 状態: running(ギア4種追加の master 3bc89db で再開。#117 は継続)
## 試行ログ(新しい順。却下も必ず残す。同じ案を再試行しない)
| # | 軸 | 仮説 | 結果(field Δ±95%CI) | 採否 |
|---|---|---|---|---|
| 13 | gear | 新ギア lastStand(土壇場の防壁)を slot0 に(master 3bc89db でギア4種追加) | scan(seed21/60) 64.6→76.5。再測定(seed22/200) 63.4→77.1 (+13.7)。toxicBloom,lastStand は72.7 | 採用 |
| 12 | deck | 氷結デッキで swap3 ランダム40近傍(seed12/60) 最良59.4 vs base53.3 → 再測定(seed13/200) 現状54.2 vs 候補52.5 | 勝者の呪いで消えた | 不採用 |
| 11 | joint | ギア2枠同時 vengeance,harvest / propagate,vengeance / harvest,propagate (seed11/200) | 基準56.3に対し 54.3 / 53.1 / 52.1 すべて下 | 不採用 |
| 10 | synergy | 氷結デッキで swap3 cat=ice 30近傍(seed10/60) | 最良 +3.2pt(z≈0.8)誤差内 | 不採用 |
| 9 | メタ | --opp cryomancer,magician 絞り swap2 40近傍(seed9/100) | 最良 +4.6(SE±7)ノイズ内 | 不採用 |
| 8 | deck | 氷結デッキで1枚近傍30(seed7/60)。上位2つの-3トークン+39焼畑/+49慈雨 | 再測定(seed8/200) 基準56.8に対し +0.9 / -0.1 | 不採用 |
| 7 | strategy+deck | 自陣の毒マスを氷結で守る(ユーザー案): 氷結札45/46/48をデッキに入れ cryoPoison=1 (毒使いが霜降り・氷結トークンを使う)、28/32/43を抜く | seed5/150: 48.0→55.8(+7.7)、seed6/200: 52.3→56.8(+4.5)。札だけ(cryoPoison=0)は48.3で効かない=セット | 採用 |
| 6 | strategy | 猛毒化を撃つ(intensify)+手札に無ければシャッフルで探す(poisonSearch)(ユーザー案) | seed5/150: 48.0→47.6→47.3、cryoPoison上乗せでも56.8→56.7。毒が盤面に残る時間が短く機会が稀 | 不採用(コード撤回) |
| 5 | joint | 新デッキ下でギア再スキャン(seed4/60) | 最良 vengeance 59.1 vs base 57.0(+2.1, 誤差内) | 不採用 |
| 4 | strategy | 猛毒化(18)のAI判断を新設 | 発動機会がほぼ無い(毒盤面かつ手札に18=2/133回) | 不採用(#6で再測定) |
| 3 | synergy | swap2 cat=support 30近傍 | 最良 +2.1pt(55.4 vs base53.3, z<1)、誤差内 | 不採用 |
| 2 | deck | -8(オピウム) +43(氷結トークン) (1枚近傍上位4つが全部-8) | scan(seed1/60) 49.1→53.3。再測定(seed2/200) 47.8→51.2 (+3.4, 閾値3.2ぎりぎり)。+53は50.7,+44は51.2(43と同値=追加札は未使用で、効果は『オピウムを抜く』こと) | 採用(境界) |
| 1 | gear | slot0 titanCost→toxicBloom | scan(seed1/60) 36.6→49.1。再測定(seed2/200) 39.4→47.8 (+8.4, z≈5) | 採用 |
| 0 | - | 基準線測定 | 対cryomancer 21%, pyromancer 32%, electrician 32% が弱い | - |
## 次に試す候補(軸の順 gear → deck → strategy を巡回)
- strategy: usage監査(毒札は使用が少ない: 毒トークン0.29回・パンデミック0.08回/試合)
- 弱い相手: cryomancer 33%, magician 35%
- probe-usage で毒札(15-19,29)の使用回数監査
