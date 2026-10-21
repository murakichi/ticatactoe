# tune-top: necromancer
- 目標: 環境1位に到達し、その後も環境勝率が上がらなくなるまで洗練する
- 最後に検証したmaster: (未到達。取り込み済み master=4dad41d)
- 現在の推奨設定: gears=[vengeance,lastStand] deck=既定 AIフラグ=なし
- 基準線: 環境勝率 42.6% / 9位 / 1位 tactician 67.8%  (--rank, seed 1, games 60, 2026-10-20)
- 最新master(4dad41d)での順位: 7位 40.9% / 1位 electrician 66.8% (--rank seed1 games60, 2026-10-21)。42.6%(9位)から順位は上がったが、他キャラの変動(poisoner/you/pyromancerの低下)による相対的なもの
- 基準線(採用後, master 3bc89db): 基本 3位 58.0%(1位 magician 64.3%) / envDeck varied 2位 59.9% / oppGears none 1位 72.3% / oppGears random 2位 66.4%  (--rank seed3 games200)
- 連続不採用回数: 0 (採用で戻した)
- 状態: running  # 新ギア lastStand 採用で 7位→3位。トップ(4条件1位)は未達。#92 は降霊コスト案として残る
## 試行ログ(新しい順。却下も必ず残す。同じ案を再試行しない)
| # | 軸 | 仮説 | 結果(field Δ±95%CI) | 採否 |
|---|---|---|---|---|
| 13 | strategy(AI) | ユーザー案の二段構え: lsPhase(防壁発動まで🌱系/ロック/ライフだけ撃って魔力を貯める)、lsRedraw(発動後に撃てる札が出るまで1コストで引き直し)(seed1 games200) | 基準56.7%±2.1に対し lsPhase 57.3%(+0.6) / lsRedraw 55.1%(-1.6) / 両方 55.8%(-0.9)。対poisoner 17〜18%は不変。発動後の敗因は札の不足でなく、対poisoner=魔力2.4しか無い/対tactician=手番2.3回で決着、のどちらか。分岐削除 | 不採用 |
| 12 | strategy(AI) | 防壁未発動の間の立ち回り lsPlan=1(相手の勝ち手を塞がない)/2(+降霊以外の支払いを全停止)/3(+自陣投資系のみ停止) (seed1 games200) | 基準56.7%±2.1に対し 57.3 / 57.8 / 57.4%(+0.6〜+1.1pt, 誤差内)。防壁は塞ぐ/塞がないに関わらず63〜84%の試合で発動済みで、勝敗は発動後(poisoner 0%, tactician 20%, magician 44%, giant 85%)。分岐削除 | 不採用 |
| 11 | gear | 新ギア4種(master 3bc89db)を含む1枠差し替え近傍(seed1 games60)→再測定(seed2 games200) | 基準37.8%に対し vengeance+lastStand 57.0%(+19.2pt, ±2.1)、lastStand+sturdy 53.8%。他の新ギア(ruinSurge/colorGarden/ailmentPact)は基準以下。悪化-15pt超なし(poisoner 26→23%)。推測: 自陣全消滅で死体が一気に貯まり降霊が回る(未検証) | **採用** gears=[vengeance,lastStand] |
| 10 | strategy(AI) | necroFeed: 負けていなくてもスラッシュ系を撃って死体を増やす(seed1 games150) | 43.0→42.9%(±2.6)。対キャラ別も不変。分岐削除 | 不採用 |
| 9 | strategy(AI) | necroMin: 降霊の最低死体数 1/2/3/4 (seed1 games150) | 43.0 / 41.2 / 37.1 / 35.5%(±2.6)。待つほど悪化=即発動が最適。分岐削除 | 不採用 |
| 8 | joint | ギアを vengeance+afterglow に変えてデッキ1枚30近傍(seed1 games60) | 最良44.1%±4.1。ギア単独(#1)で-6ptだったafterglowをデッキで補えず、現推奨(45.5%)を超えない | 不採用 |
| 7 | strategy(AI) | necroReserveAll: 降霊前は全スキルの支払いを温存(seed1 games150) | 基準43.0%±2.6に対し43.4%(+0.4pt)。対キャラ別もほぼ同一=ほぼ発動しない。分岐は削除 | 不採用 |
| 6 | メタ | 対tactician/electrician/yinYangに絞ったデッキ1枚30近傍(seed1 games80) | 基準39.3%±6.2に対し最良 -3+53特売 41.3%(+2.0pt)。SEが大きく全て誤差内 | 不採用 |
| 5 | strategy/deck | 死に札6枚(6,12,13,27,28,32)を使われそうな札へ置換した3案(seed1 games100): A=[..,4,9,10,53,56,58] B=[..,4,9,10,14,29,42] C=[..,4,9,16,17,53,58] | 基準44.9%に対し A 46.5%(+1.6) B 44.7%(-0.2) C 45.1%(+0.2)。SE±1.6(z≈0.7)で全て誤差内。死に札が提示枠を潰す仮説は支持されず | 不採用 |
| 4 | strategy(監査) | audit scan(opp=tactician,yinYang,giant) + probe-usage | base42.4%。札6,12,13,27,28,32が「差なし」=AI未使用(12枠中6枠が死に札)。寄与大: ギア vengeance +14.0/sturdy +9.1、トークン+3.9、バッズ+3.0。降霊は使った試合勝率100%だが使用29〜38%/試合。仮説: 死に札が3枠提示を圧迫 → 使われる札へ置換したデッキを測る | 結果は#5 |
| 3 | synergy | 3枚同時入れ替えランダム40近傍(seed1 games60) | 基準45.5%に対し最良 48.7%(+3.2pt, z≈1.1 < 閾値3.0)。上位3つは特売系(53/56/58)＋氷結/縮地。全て誤差内 | 不採用 |
| 2 | deck | 1枚差し替えランダム30近傍(seed1 games60) | 基準45.5%に対し最良 -3トークン+53特売 48.8%(+3.3pt, z≈1.1 < 閾値3.0)。上位は+2〜3pt帯で氷結/特売系が並ぶが全て誤差内 | 不採用(再測定に進まず) |
| 1 | gear | 1枠差し替え近傍スキャン(vengeance,sturdy から30通り, seed1 games60) | 基準45.5%に対し最良 afterglow/sturdy 39.5%(-6.0pt)。全近傍が基準以下 | 不採用 |
## 次に試す候補(軸の順 gear → deck → strategy を巡回)
- (gear,deck1枚,synergy 済) (6種類測定済み。行き詰まり判定へ)(ギア×デッキ) → strategy(降霊の撃ち所を増やすAIノブ、sim/ai.js necromancer節)。(--swap 3) → strategy(probe-usage) → メタ(対tactician 23%, 対yinYang 27%, 対giant 33%) → joint

## 診断メモ(2026-10-21, gears=[vengeance,lastStand])
- 防壁の発動率: vs tactician 75% / poisoner 84% / giant 63% / magician 69%(150試合, 平均発動は8〜15手目)。発動前に決着した試合は全勝。
- 発動後の勝率: poisoner 0% / tactician 20% / magician 44% / giant 85%。相手の魔力+4・ライフ+2の下で、自陣ゼロから立て直せるかが勝敗。
- 発動後に負けた試合(vs poisoner 62/80): 発動直後の自魔力2.4・生き残る自手番4.7回。vs tactician(45/80): 発動直後10.0→敗北時7.0(使い残し)・自手番2.3回。
- 次の焦点: 発動後の立ち回り(特に対 poisoner 23%・tactician 47%)。降霊を発動直後に撃てているか、発動後の死体数と降霊の効果を測る。
