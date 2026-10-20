# tune-top: electrician (雷霆の巫)
- 目標: 環境1位に到達し、その後も環境勝率が上がらなくなるまで洗練する
- 最後に検証したmaster: 837a29b
- 現在の推奨設定: gears=[sturdy,harvest] deck=[0,3,8,12,21,22,23,24,26,28,49,53](浄化32・ランダム帯電25 → 特売53・慈雨49) AIフラグ=なし
- 基準線: 環境勝率 63.9% / 1位 / 2位 tactician 62.1%   (seed 3, games 200, size 4)。旧: 60.2%/2位(tactician 67.8%, seed1/60試合)
- トップ到達(seed3/200試合): 基本 63.9 vs tactician 62.1 / envDeck varied 64.6 vs giant 58.7 / oppGears none 61.4 vs magician 58.6 / oppGears random 59.9 vs tactician 58.4 — 4条件すべて1位
- 連続不採用回数: 2
- 状態: running(トップ未達。master 837a29b で陥落)
- 陥落: master 837a29b(seed3/200試合)で 4位 59.2% / 1位 magician 65.3%(差6.1pt)・cryomancer 62.1%・tactician 59.2%。envDeck varied でも 2位 62.1% vs magician 63.7%。原因は magician(デッキ調整 #98)と cryomancer の調整。
## 試行ログ(新しい順。却下も必ず残す。同じ案を再試行しない)
| # | 軸 | 仮説 | 結果(field Δ±95%CI) | 採否 |
|---|---|---|---|---|
| 11 | synergy/meta | 新環境の上位3相手(magician,cryomancer,tactician)に絞った2枚swap 40候補(seed10/80試合) | 最良 53.8%±6.2 vs base 51.7%、誤差内 | 不採用 |
| 10 | strategy | ロックを使わない(F.elecNoLock)。対magicianで『ロックを使った試合の勝率3%』に着目 | seed3/200試合: 60.8→53.7(-7.1)。ロックは有益。使った試合の低勝率は『長引く試合ほど使う』という選択バイアス | 不採用(ノブ削除) |
| 9 | joint | ギア lightToken,harvest 固定で 1枚差し替え30近傍(seed9/80試合) | 最良 63.1% vs base 61.9% 差なし | 不採用 |
| 8 | synergy(3枚) | 3枚同時入れ替え40候補(seed8/80試合)。最良 66.3% vs base 61.9% (+4.4, SE≈3.4) | z≈0.9、閾値3.0に遠く再測定せず | 不採用 |
| 7 | deck(1枚) | 1枚差し替え30近傍(seed7/80試合)。最良 62.9% vs base 61.3% (+1.6, SE≈3.4) | z≈0.3、閾値(2.7〜3.0)に遠く再測定せず | 不採用 |
| 6 | meta(対magician) | `--opp magician --scan deck --swap 2` 40候補(seed6/80試合)で対magician勝率を上げる札 | 最良 50.0%±11.0(80試合・単独相手では誤差が大きく、全候補が誤差内) | 不採用(再測定に値する候補なし) |
| 5 | strategy | 相手にリーチがあっても帯電拡散/範囲帯電/帯電付与を撃つ(F.elecSpreadAlways) | seed5/250試合: 61.2→60.5(-0.7±2.8)、差なし | 不採用(ノブ削除) |
| 4 | gear(再スキャン,新デッキ) | 29近傍(seed4/80試合)。最良 lightToken+harvest 67.1% vs base 65.3% | 再測定 seed5/250試合: 61.2→62.1(+0.9±2.8)。最低効果量+1.5pt未満。magician戦は36→47と改善、yinYang戦は68→58と悪化 | 不採用(gearは2回測定済み・保留解消) |
| 3 | synergy/deck | 未使用札(浄化32・ランダム帯電25)を 特売53+慈雨49 に入れ替え。探索(vs tactician,giant,magician,60試合,2枚swap40候補)で最良63.3% vs base54.4%(閾値z未達)。全環境で再測定 | seed2/150試合: 57.6→63.8(+6.2、9/9キャラで改善) / seed3/200試合: 61.7→65.6(+3.9±1.6)。tactician戦も47→53 | 採用(deck.ts/deck.js ミラー済み。本番AIでは未計測) |
| 2 | deck(audit) | 寄与監査。差なし札: 12,25,26,28,32 | 下記メモ参照 | 情報のみ |
| 1 | gear | 1枠差し替え全29近傍(seed1,60試合)。基準[sturdy,harvest]63.5%、最良 lightToken+harvest 66.7%(+3.2) / afterglow+harvest 65.9%(+2.4)。SE≈2.0なのでz≈1.1、n≤40の閾値3.0に届かず | 再測定せず不採用(保留: 要追試。lightToken/afterglow は slot0 で上位2つ) | 不採用 |
## 監査メモ(seed1, 60試合, 相手 tactician,giant,magician, base 54.4%)
- 寄与: 帯電トークン(21) +11.7 / harvest +10.5 / sturdy +5.5 / オピウム(8) +2.2 / ライフ3(0) +1.1 / 帯電付与(22) +0.5 / トークン(3) -1.1 / 帯電ダブルトークン(23)・範囲帯電(24) -0.6
- 差なし(未使用): ダブルロック(12) ランダム帯電(25) ジャマー(26) サイレンス(28) 浄化(32) → 入れ替え候補5枠
- 使用率(vs tactician,100試合): 1試合あたり全スキル計≈1.6回と少ない。帯電トークン0.34回が主力、固有の範囲帯電0.07回
## 次に試す候補(軸の順 gear → deck → synergy → strategy → joint)
- メタ: 現状 magician 戦が 34-47% と最弱(seed5/250)。`--opp magician` で刺さる札・立ち回りを探す(未実施)
- joint: 採用デッキでギア近傍を再測定済み(#4)。ほかに 特売53 を活かすギア(priceWreck/chainDiscount)は#4で不振
- synergy: `--scan deck --swap 3 --cat charge --neighbors 40`(帯電付与+発火)
- deck: `--scan deck --neighbors 30`
- gear保留: lightToken/afterglow を seed2・200試合で後追い可
- 対 tactician 50.0%、対 giant 55%、対 magician 56.7%(基準線 per より)
