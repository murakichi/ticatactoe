# tune-top: magician
- 目標: 環境1位に到達し、その後も環境勝率が上がらなくなるまで洗練する
- 最後に検証したmaster: 4f58cf0(基本: 1位 poisoner 75.6 / 2位 cryomancer 62.1 / 3位 magician 61.2。陥落)
- 現在の推奨設定: gears=[lastStand, ironLock] deck=[2,3,4,9,10,11,12,13,35,53,56,60](死に札のオピウム8・刈り入れ前夜33・冬至の種子34→両トークン4・バッズトークン9・返し特売60) AIフラグ=なし
- 基準線(旧デッキY時): 環境勝率 65.0% / 1位 / 2位 tactician 62.2%(基本, seed3/200)。envDeck varied 63.6%(2位 electrician 61.7)、oppGears none 76.1%(2位 56.3)、oppGears random 71.6%(2位 56.8)=4条件すべて1位。デッキ単体の測定は65.2%±1.5(seed3/400) / 順位表は未取得(採用前 4位 56.3% / 1位 tactician 67.8%, seed1/60試合)   (seed 3, games 400, master edf73fb)
- 関連 issue: #116 新ギア4種の勝率計測（魔法使いでの結果をコメント済み予定）
- 連続不採用回数: 0(試行20の複数ロックで採用。再開前は 6。再開前は 6。洗練中。W3採用後: gear再スキャン / deck1枚近傍 / strategy再監査 / メタ(対tactician) / synergy swap2 / 寄与監査(audit) がいずれも不採用)
- 状態: running(master 4f58cf0 で3位に陥落。1位 poisoner 75.6%。ギア/デッキのメタ探索で対毒使い(23%)を詰められず、issue #124 に追記して待機)

## 試行ログ(新しい順。却下も必ず残す。同じ案を再試行しない)
| # | 軸 | 仮説 | 結果(field Δ±95%CI) | 採否 |
|---|---|---|---|---|
| 23 | メタ(対poisoner/cryomancer) | master 4f58cf0 で陥落（毒使いが lastStand+sturdy で 77.8→75.6%、氷室が魔法使いの🌱凍結対策で対魔法使い 25→68%）。対毒使い 23%・対氷室 32%（seed1/60）。対毒使い絞りの deck scan（40近傍）・gears scan（全入替）は基準(24%)から 有意に動く候補なし（最大 gear 25%、deck は両トークンを抜くだけの無効変更が33%）。対氷室絞りの deck scan も基準28%から最大35%（-2バッズ+6スラッシュ。バッズを抜く案でnoisy・再測定未） | 不採用（ギア・デッキでは詰められない）。毒使いの lastStand 依存を issue #124 に追記（魔法使いのデータ） |
| 22 | gear(新ギア) | 新ギア4種を含む `--scan gears`（seed1/60, 基準 [sturdy,ironLock] 67.4）で slot0→lastStand [lastStand,ironLock] が 72.0(+4.6)。再測定 seed3/400: 68.0→71.2(+3.2)、seed4/400: 66.3→69.1(+2.8)。対giant 60→87、対poisoner 38〜42→45〜46、一方 対陰陽師 -4/-12・対ネクロ -4/-5（-15超なし）。4条件すべて1位（基本69.2・envDeck varied 68.3・none 80.7・random 76.9） | **採用** gears=[lastStand, ironLock]（sim/gear.js・gear.ts）。[sturdy,lastStand] は +1.9/+2.1 で劣る |
| 21 | gear(新ギア) | 彩りの庭(colorGarden)は『ロック済みバッズ駒=🌱+🔑の2種でターン開始時魔力+1』と見立てたが、`[colorGarden,ironLock]` は 64.1（基準 67.4、-3.3、seed1/60）。ruinSurge 63.9・ailmentPact 63.7 も基準以下 | 不採用（機構の仮説は反証。sturdy を失う損のほうが大きい／AIのロックは複数でも彩りの庭の数え方に乗らない可能性） |
| 20 | strategy(AI) | **複数バッズ駒ロック**（ユーザー指摘: ロックは1手番に何個でもよいのにAIは1個だった）。1手番に魔力が許す限り最大N個ロック。seed2/200: base 66.3 → N=2 68.9・N=3 69.2・N=9 69.2・N=9+魔力3温存 69.1。再測定: seed3/400 67.4→70.4(+3.0)、seed4/400 66.1→69.6(+3.5)。3以上で頭打ち | **採用**（N=3）。sim/ai.js 既定 magLockN=3、本番 AIPlayer.ts は MAGICIAN_MAX_LOCKS=3（chargeClicks で順にロック。氷結中のマスは除く）。回帰テスト4件。ブラウザ実機での複数ロックの動きは未確認 |
| 19 | joint(ギア2枠) | ギア2枠同時入替（seed2/200, 基準70.5）: vengeance+luckyPurse 65.0(-5.5)・luckyPurse+bindingLock 62.3(-8.2)・gambler+luckyPurse 64.5(-6.0) | 不採用（現ギア [sturdy, ironLock] が最適） |
| 18 | synergy(3枚) | 新デッキで `--scan deck --swap 3 --neighbors 40 --games 60 --seed 5`（カテゴリ無制限）。基準69.6、最良 71.3（+1.7）、他は+1.1以下 | 不採用（閾値+3に届かず再測定せず） |
| 17 | strategy(AI) | 既存ノブ discountPlan: 0(無効) 60.8(-9.7、特売系の先撃ちは必須)。2(手札に軽減で撃てる札が無いとき、軽減札を撃ってから1コストで引き直して探す) は seed2/200 +1.7・seed3/400 +1.7(71.0→72.7)・seed4/400 +1.8(70.1→71.9)。3回とも同じ向き、悪化なし(対tactician +4〜5, electrician +3) | **移植済み（PR #107）**。当初は保留（移植コスト大）だった:: sim上は合算で約2.5σの有効。ただし本番AIにはターン中のシャッフル→再計画の経路が無く(AIPlayer.ts に shuffle なし。Game.tsx の onClickShuffle は人間用)、ミラーには AI ターンのループ改修が要る。本番に入らない限り意味が無いので採用せず issue 化 |
| 16 | strategy(AI) | 審判の日を撃つ前にコスト+N の魔力を残す judgeBuf（seed2/200, 基準70.5）。N=1 68.6(-1.9)・N=2 67.5(-3.0) | 不採用（待たずに撃つのが最適。ノブは削除） |
| 15 | strategy(AI) | 審判を撃たない手番のバッズ駒ロックを無効化(magLock=0, seed2/200, 基準70.5): 69.2(-1.3)。ロックは僅かに効いている | 不採用（既定のまま。ノブは削除） |
| 14 | strategy(AI) | 審判の日の撃つ最低純増 judgeMin（既定2）を 1/3 に（seed2/200, 基準70.5）。judgeMin=1 61.7（-8.8、対electrician 72→55, cryomancer 85→66）、judgeMin=3 65.4（-5.1、対giant 59→46） | 不採用（既定2が鋭い最適。ノブは削除） |
| 13 | 寄与監査(audit) | `--scan audit --games 100 --seed 1`（基準70.4%）。札を禁止しても勝率が上がる札は無い（寄与: 特売+2.9・バッズトークン+1.7・バッズ+1.3・活力特売+1.2・返し特売+1.1・ダブルトークン+0.2・トークン-0.1。両トークン/ダブルバッズ/ダブルロック/トリプルロック/ひこばえは『差なし』）。ギアは ironLock +6.1・sturdy +3.7 | 不採用（抜いて上がる札なし。洗練飽和） |
| 12 | synergy(洗練) | 新デッキで `--swap 2`。support(seed1/60, 基準70.0): 最良 -12ダブルロック-10ダブルバッズ+51写し身+50縮地 73.0(+3.0)、他は+2.4以下。30通りの最良は多重比較の閾値(z≥3.0)に届かず、候補のほとんどは撃たれない札(写し身・縮地・福引き)への入替でノイズ。token: デッキ外のトークン札が無く成立せず | 不採用(再測定せず。閾値未満) |
| 11 | メタ(対tactician) | `--scan deck --opp tactician --neighbors 40 --games 120`(seed1)。基準60.8%±8.7、上位は -10+58 65.8・-4+任意 62.5 と、全環境で既に再測定済み(不採用)の候補と同じ。95%CI が±8.5と広く、基準との差は誤差の内側 | 不採用(新しい候補なし。対tactician 62%はすでに洗練前の47%から改善済み) |
| 10 | strategy(再監査) | 新デッキの `probe-usage.js --chars magician,tactician`(100試合): 使われている札 lock2.89・judgeDay2.34・markdown1.08・vitalMarkdown0.93・token0.60・buds0.55・counterMarkdown0.47・budsToken0.33・doubleToken0.28・sucker0.28。**両トークン(4)とダブルバッズ(10)は出力に現れない=撃たれていない**。ただし抜いて他の札に替えても(C)+0.4ptで差なし | 不採用: 死に札を替えても得るものが無い。AIが両トークン/ダブルバッズを撃てるようにする方が筋(AI改修。未着手) |
| 9 | deck(1枚近傍) | 新デッキで `--scan deck --neighbors 30`(seed1/60)。上位: -10+58 73.5・-4+任意 73.0〜73.3(基準70.0)。seed3/400 で再測定: A(-10+58) 71.1(+0.1)・B(-4+15) 69.6(-1.4)・C(-10-4+58+50) 71.4(+0.4)。基準71.0 | 不採用(60試合の+3ptは勝者の呪いで消えた) |
| 8 | joint(gear再スキャン) | 新デッキ(W3)で `--scan gears --games 60 --seed 1`。基準 [sturdy,ironLock] 70.0%±3.7 が最上位、次点 vengeance 69.1・luckyPurse 68.2。全近傍が基準以下 | 不採用(ギアは再スキャンでも現状が最適) |
| 7 | strategy(監査) | `probe-usage.js --chars magician,tactician` でデッキ内のオピウム8・刈り入れ前夜33・冬至の種子34がAIに1度も撃たれない死に札と判明(ひこばえ35も0.19回/試合)。3枚を使われる札に替える: W3=+4両トークン+9バッズトークン+60返し特売。seed2/200: base 63.4 → W3 70.5(+7.1)。再測定 seed3/400: base 65.2 → W3 71.0±1.4(+5.8pt、対tactician 47→61, electrician 62→74, cryomancer 77→86。悪化なし)。envDeck varied 順位表 71.4% 1位(2位 electrician 60.2) | **採用** W3(ミラー済み・jest 80件通過。本番AIで同じ札が死に札かは未確認 #88) |
| 6 | synergy(洗練) | swap2 support(現デッキ, seed1/60): 最良 Z=-8オピウム-34冬至の種子 +60返し特売+54付与割引 69.3%(基準66.8)、他は+0.8以下。再測定 seed3/400: base 65.2 → Z 66.8(+1.6pt, 対tactician 47→52, electrician 62→67)。差のSE≈1.1なので2SE(2.1)に届かない | 保留(要追試): 基準の+1.5pt以上は満たすが約2SE未満。同種(synergy)の繰り返しなので連続不採用には数えない |
| 5 | synergy | swap2: support(seed1/60)で -14ワルプルギス -36風の落とし子 +53特売 +56活力特売 が 66.8%(基準61.5)で最良。再測定 seed3/400: base 61.2 → Y 65.2±1.5(+4.0pt。対giant 49→55, yinYang 57→62, electrician 54→62, pyromancer 71→78、悪化なし) | **採用** Y(ミラー済み・jest 80件通過。本番AIでは未計測) |
| 4 | synergy | swap2: token(seed1/60)で両トークン4+バッズトークン9 を入れ芽札2枚抜きが上位。再測定 seed3/400: X1(-14,-35)63.4(+2.2、ぎりぎり)、X2(-36,-33)62.4(+1.2) | 保留: Yが上回ったので未採用。Y採用後の基準でX1型(トークン2枚追加)を再測定する(joint) |
| 3 | deck | 札1枚差し替え近傍30通り(seed1/60)の上位3つが全て +11ダブルトークン追加。再測定 seed2/200: base 57.2, A(-8) 58.6, B(-28) 59.2, C(-14) 59.1 → 境界のため追試 seed3/400: base 58.6±1.5 → B 61.2±1.5(+2.6pt、対tactician 39→43, 対cryomancer 65→72、悪化なし) | **採用** B: -28サイレンス +11ダブルトークン(sim/deck.js, src/deck.ts にミラー。jest 80件・gear.test 通過。本番AIでは未計測) |
| 1 | gear | 1枠差し替え近傍(30通り)を `--scan gears --games 60 --seed 1`(master edf73fb)で測定。基準 [sturdy,ironLock] 59.3%±3.9 が最上位。次点 slot0→luckyPurse 57.4%、gambler 56.9%。全近傍が基準以下 | 不採用(現ギアが局所最適) |
| 0 | - | 基準線測定のみ。対tactician 23%・対electrician 43%・対necromancer 42% が弱点 | - | - |
## 次に試す候補
- strategy(AI) 再開: 審判の日の撃つ閾値 judgeMin(既定2)=1/3、ロックの運用、特売系を先に撃つ順序、バッズ増殖の撃ち順 など（sim/ai.js に F ノブ→probe-top --flags で測定→有効なら AIPlayer.ts にミラー+回帰テスト）

- strategy(AI改修): 両トークン(4)・ダブルバッズ(10)をAIが撃たない理由を `sim/ai.js` で調べ、撃てるようにする(F.xxx ノブ+probe-ai.js paired A/B。本番AIへのミラーが必要)
(軸の順 gear → deck → synergy → strategy → joint を巡回)
- joint: Y採用後のデッキに対し、トークン2枚(4,9)追加型(X1)や他のコスト軽減札(58大特価,60返し特売,54付与割引)を `--scan deck --swap 2` で再探索
- deck(済: 1枚近傍): `--scan audit`(札の寄与)、`probe-usage.js --chars magician,tactician`
- メタ: 対tactician(23%)に絞った `--opp tactician` の札/ギア探索

## トップ到達の記録 (2026-10-20)
採用: 札28サイレンス→11ダブルトークン、14ワルプルギスの夜・36風の落とし子→53特売・56活力特売。gear は全近傍が現状以下で据え置き。4条件(seed3/200)すべて1位。最も余裕が小さいのは envDeck varied(差1.9pt)。
積み残し issue: #88(本番AI未計測)、#89(洗練の保留)

## 再検証 (2026-10-20)
- master ae193e7（cryomancer のギア・AI調整 #86）取り込み後、4条件(seed3/200)すべて1位で維持。基本 67.3%(2位 cryomancer 62.5, 差4.7)／envDeck varied 63.9%(2位 cryomancer 61.8, 差2.2)／oppGears none 79.6%(2位 cryomancer 54.1)／random 75.9%(2位 tactician 53.8)。cryomancer が2位に上がり差が縮小(基本 8.8→4.7、envDeck varied 約11→2.2)
- master 8f8e484（electrician のデッキ変更 #95 を含む）で再々検証。4条件(seed3/200)すべて1位: 基本 66.2%(2位 cryomancer 62.2, 差4.0)／envDeck varied 63.7%(2位 electrician 61.9, 差1.8＝誤差の範囲の接戦)／oppGears none 78.9%(2位 electrician 56.9)／random 75.2%(2位 electrician 56.1)
- master 837a29b（pyromancer のデッキ変更 #100）で再検証。変更が波及しにくいので2条件に絞った: 基本(seed3/200) 65.3%・1位(2位 cryomancer 62.1, 差3.2)／envDeck varied(seed3/400) 63.5%・1位(2位 cryomancer 60.1, 3位 electrician 59.9, 差3.4)。oppGears none/random は前回の差が19pt以上のため省略
- master f21a834（魔法使いの引き直しを本番AIに移植 #107 後、tactician 等のデッキ調整を含む）で再検証。2条件に絞った: 基本(seed3/200) 67.6%・1位(2位 electrician 62.0, 差5.6)／envDeck varied(seed3/400) 64.1%・1位(2位 electrician 61.9, 差2.2)。引き直し移植後の基本は 65.3→67.6 と上がった(別master。参考値)。本番AIでの実測は #88、ブラウザ実機での動作確認は未了

## 陥落の記録 (2026-10-21)
- PR #126（推奨ギア→lastStand）のマージ前に4条件1位を確認したが、確認後に master（毒使い #123・氷室 #125/#127）を取り込んだ状態で再測定していなかった。取り込み後は 3位（61.2%）。マージ後の再確認が漏れていた
- 毒使いが突出（75.6%）。#124 に魔法使いのデータを追記した。毒使いの調整が入るまで魔法使いは待機。master が動いたら手順8で再検証


## master dfe4e52 取り込み後の順位（seed3/200）
1 poisoner 74.7 / 2 pyromancer 60.1 / 3 cryomancer 59.1 / **4 magician 58.8** / 5 electrician 54.8。
対 poisoner 25.5%・対 cryomancer 26.1% が足を引っ張る構図は不変（対鍛冶師は 69% で問題なし）。
ギア・デッキのメタ探索は前回済みで有効な反撃なし。#124（poisoner の lastStand 調整）待ち。状態: running（master 変更待ち）。

## 試行: 魔力が余るとき審判の日を緩める（surplusJudge）— 不採用
相手の土壇場の防壁が発動すると魔法使いの手番開始時魔力は平均93（中央75, p90=192）まで余る（発動前は平均8〜18・中央4〜10で余らない）。
魔力が審判コストのK倍以上なら net>=1 でも審判を撃つノブを seed5/200 で測定: 基準 61.1% / K=2 58.1% / K=4 59.3%。むしろ悪化。対 poisoner 27% も動かず。ノブは revert。
余り魔力の別の使い道（引き直し・軽スキル連打）は未検証。

## 試行: 魔力余剰時に全コマへ🌱を広げ、全🌱駒をロックして審判の日（budSurplus）— 不採用
魔力が K 以上のとき (1) バッズ系札(2/10/35/36)が無ければ最大4回引き直し (2) バッズ3個上限・ひこばえ2隣条件を外す (3) 審判の前に全🌱駒をロック。
全環境 seed5/200: 基準 61.1 / K=30 61.4 / K=60 61.0。対 poisoner seed7/300: 28.0 → 26.7。効果なしで revert。
考察: 魔力が余る(防壁発動後)のは相手の防壁が自陣のコマを全て消したあとで、盤面が空に近く、審判の日で壊せる敵コマ自体が少ない。魔力不足ではなく盤面の駒数が律速。
余り魔力の使い道で未検証: 軽スキル連打でのコスト削減→通常スキルの多重撃ち、引き直しで防御系を探す。

## master a9e45ea 取り込み後の順位（seed3/200）
1 poisoner 74.9 / **2 magician 61.2** / 3 tactician 57.1 / 4 pyromancer 56.3 / 5 cryomancer 55.0 / 6 electrician 54.8。差 13.7pt。
氷室・鍛冶師が下がり魔法使いは2位に復帰。1位 poisoner（lastStand+sturdy）との差は変わらず、#124 待ち。設定は変更なし。
防壁発動後の対 poisoner（seed1/100 の54試合, 勝率44%）: 負け試合は決着まで平均37手番かかり終局時の自駒3.5・敵駒7.3、勝ち試合は25手番で自6.4・敵4.3 — 長引くと駒数で押し負ける。

## master fbe6d4e 取り込み後の順位（seed3/200）
1 poisoner 73.9 / **2 magician 58.2** / 3 tactician 56.7 / 4 necromancer 55.8 / 5 cryomancer 53.6 / 6 pyromancer 52.4。差 15.7pt。
ネクロマンサーが lastStand 採用で4位に浮上。魔法使いは2位維持だが 61.2→58.2。1位 poisoner（lastStand+sturdy）は gear/deck/AI の範囲では崩せない
（対 poisoner 25〜28%。メタ探索・surplusJudge・budSurplus・judgeMin・magLock など不採用）。#124（poisoner の調整案）待ちで **blocked**。master で poisoner が調整されたら step 8 から再開。

## 試行: 対 poisoner のデッキ 2〜3枚同時入れ替え探索 — 不採用（winner's curse）
swap3 80近傍・swap2 80近傍（対 poisoner seed2/100）。最良は swap3 の 37.0%（基準26〜28）、swap2 は 32.0%。
上位2デッキを seed6/300 で再測定: 現デッキ 29.1 / swap3 1位 28.8 / swap3 2位 26.0 → 差なし（100試合の+10ptは80近傍の最大値のノイズ）。
紅葉狩り(64)など新カードを入れても対 poisoner は動かない。gear・deck・AI の範囲で poisoner（lastStand+sturdy）は崩せない結論を維持。blocked（#124）。

## 試行: 相手の未発動の防壁を見て、相手のコマが K 個未満なら列を揃えるのを待つ（lsWait）— 不採用
対 poisoner seed8/200: K=0 25.1 / K=4 23.6 / K=6 21.1。待つほど悪化（待っている間に毒・盤面で押される）。ノブは revert。
防壁の発動タイミングを遅らせる方向は逆効果。むしろ早く発動させる（lsAggro 的）方向は未検証だが、発動後が44%で負け越すため見込み薄。
