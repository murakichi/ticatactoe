# tune-top: electrician (雷霆の巫)
- 目標: 環境1位に到達し、その後も環境勝率が上がらなくなるまで洗練する
- 最後に検証したmaster: 81ad8ce
- 現在の推奨設定: gears=[lightToken,harvest](別案 [afterglow,harvest]) deck=[21,22,23,24,26,28,49,50,51,52,53,58] AIフラグ=なし
- 基準線: 環境勝率 63.9% / 1位 / 2位 tactician 62.1%   (seed 3, games 200, size 4)。旧: 60.2%/2位(tactician 67.8%, seed1/60試合)
- トップ到達(seed3/200試合): 基本 63.9 vs tactician 62.1 / envDeck varied 64.6 vs giant 58.7 / oppGears none 61.4 vs magician 58.6 / oppGears random 59.9 vs tactician 58.4 — 4条件すべて1位
- 連続不採用回数: 0
- 2026-10-27(play-learn A1): 対策ロックを撃たない(elecNoAnti)で環境 50.3→57.8%、rank seed12/100 で3位 59.8%(1位 poisoner 68.0)。状態は blocked を維持（1位との差 約8pt）
- 状態: blocked(issue #109 / #124。陰陽師(89%)・毒使い(63%)が突出)。対陰陽師は対策済み(12→33%)
- 基準線(gear変更後, master 837a29b, seed3/200): 3位 59.9% / 1位 magician 63.9%(差4.0pt)・cryomancer 61.2%・tactician 59.2%
- 基準線(gear+deck変更後, seed3/200): 2位 63.0% / 1位 magician 63.4%(差0.4pt)・cryomancer 60.7%
- 4条件(seed4/300, --target electrician 付き。付け忘れの旧結果は無効): 基本 1位 64.8 vs magician 63.4 / envDeck varied 2位 60.2 vs magician 61.8(-1.6) / oppGears none 1位 75.3 vs 64.4 / oppGears random 1位 72.6 vs 62.6 → 未達はenvDeck variedのみ
- 陥落: master 837a29b(seed3/200試合)で 4位 59.2% / 1位 magician 65.3%(差6.1pt)・cryomancer 62.1%・tactician 59.2%。envDeck varied でも 2位 62.1% vs magician 63.7%。原因は magician(デッキ調整 #98)と cryomancer の調整。
- 最新master cc22236(seed6/300, --target): 基本 1位 64.1 vs magician 62.8 / envDeck varied 2位 60.2 vs magician 60.4(-0.2、実質同率。seed4:-1.6 seed5:-2.0 seed6:-0.2)
- envDeck varied seed7/600: 2位 60.6 vs magician 61.5(-0.9)。4条件中3条件は1位、残り1条件が約1pt差 → issue #109 を起票して blocked。
- 現行(デッキX+主案ギア, seed8/400, --target): 基本 2位 64.2 vs magician 66.1(-1.9) / envDeck varied 2位 62.2 vs 63.6(-1.4) / oppGears none 1位 74.6 vs 67.0 / random 1位 72.1 vs 64.1。seedごとにmagicianの値が±2〜3ptぶれ、基本・envDeck variedは平均すると互角〜-1.5pt。
## 診断(master 81ad8ce, seed50/300, --target)
- 基本: 4位 54.1%(1位 poisoner 75.0 / magician 59.7 / necromancer 54.9)、envDeck varied: 7位 50.6%(1位 poisoner 66.3)。1位 poisoner との差は 21pt/16pt と大きい。
- 律速は **対毒使い 21%(envDeck varied 25%)**。他は対 necromancer 39%、対 magician 43% が弱い。ほか(対あなた78・対巨人65・対氷室65)は強い。→ 次は対毒使いの原因を調べる(毒でライフが削られる中、⚡の盾が働くか・毒札が多い試合の手数)。
## 診断(新ギア追加後)
- 勝ち筋: 帯電トークンで⚡を重ねた自陣は無敵+弱点。帯電トークン6回/試合が主力(サマリ: 寄与 帯電トークン+14pt、ギア lightToken/harvest +15pt前後)。AIは既定でギアを見ない(hasGear参照なし)ので、ギアは効果の付与・コストなどパッシブで効く。
- 新ギアの機構: 彩りの庭=1マスにエフェクト複数種類(雷霆の巫は⚡中心で成立しにくい) / 病炎の契り=自陣の毒・火炎(雷霆の巫は無縁) / 廃墟の底力=自陣が破壊されたときコスト-(相手の破壊が少なければ稀) / 土壇場の防壁=初めて負ける列をコマごと消して延命(+相手に魔力+4・ライフ+2)。→ 土壇場の防壁だけ有望と仮説。
- 完了判定は 基本 と envDeck varied の2条件のみ(ユーザー指示 2026-10-21。ギアなし/ギアランダムは測らない)
- 最新master(8adca66, seed40/300, --target): 基本 5位 56.0%(1位 poisoner 71.8) / envDeck varied 5位 53.9%(1位 poisoner 64.6)。poisoner・pyromancer の調整で環境が大きく動いた。
## 試行ログ(新しい順。却下も必ず残す。同じ案を再試行しない)
| # | 軸 | 仮説 | 結果(field Δ±95%CI) | 採否 |
|---|---|---|---|---|
| 26 | strategy(対陰陽師) | ユーザー指示『陰陽師の一撃対策』。陰陽師は百鬼夜行→式神一括を92%の試合で撃ち、撃った試合は100%勝つ(対電巫 89%)。空きが全部相手のコマになっても列が完成しないよう、自コマの無い線の数×重みを着手で減点(F.floodCover、雷霆の巫のみ・相手に陰陽師がいるとき)。単発の『一撃が成立する盤面を避ける』(antiFlood)は 11→14〜15 で効かず、早い段階から全線を覆う方が効く | 対陰陽師のみ seed81/82×300: 11.0/11.3 → 重み20:18.0 / 60:26.7 / 150:28.7,27.3 / 400:27.3 / 1000:28.3。全キャラ順位表 seed90/250: 4位 49.9 vs 対策なし5位 47.5(+2.4、対陰陽師 12→33%のみ変化、他の相手は不変) | 採用(sim/ai.js 既定150・雷霆の巫限定、AIPlayer.ts にミラー+回帰テスト)。本番AIでの勝率は未計測。式神一括ナーフ後(master 28291db, seed91/300): 対陰陽師 対策なし52.7 → あり84.3 |
| 25 | strategy(陰陽師のコンボ待ちを参考) | 帯電拡散(固有)の発動ファネルを測定: 手番の11.7%で撃てる盤面(対象あり)・払えるのは2.8%(魔力平均3.2/コスト平均6.9、盤面の⚡平均0.11)。『撃てる盤面で1チャージ(+3)で足りるなら駒を置かずチャージして次手番に撃つ』ノブ F.spreadCharge。上位4相手 seed70/300 | 38.4 → 34.0(-4.4) | 不採用(ノブ削除)。盤面は相手の手番で変わるため、陰陽師のように待てない |
| 24 | joint(issue #160 の周回) | 連鎖割引ギア+36/33入りデッキで、風の落とし子→刈り入れ前夜を1手番に最大6周回すノブ F.harvestLoop。ロック固定の有無で比較。上位3相手(magician,poisoner,tactician) seed60/300 | 基準(現行) 37.0 / chainDiscount,harvest+デッキ 24.4 / +ループ 24.8 / +ループ+36・33をロック固定 17.7。ロック固定ではループが 3.9周/試合 回る(魔力は増える)が勝てない | 不採用(ノブ削除)。雷霆の巫では実用性なし |
| 23 | gear(対poisoner) | 対毒使いのみのギア近傍(seed51/150): 基準 lightToken,harvest 18.7、最良 ironLock,harvest 36.0(多くの差し替えが基準超え=lightTokenのトークンライフ-1が毒に弱い)。全キャラ順位表で ironLock,harvest を測定(seed50/300) | 基本 54.1→49.0 / envDeck varied 50.6→47.6、対magician 43→26。全体で悪化 | 不採用 |
| 22 | gear+deck+strategy(彩りの庭) | ユーザー指摘: 彩りの庭は『2種類エフェクトのマス』で魔力+1/マス。🌱を重ねる札(風の落とし子36・ワルプルギス14・ひこばえ35・バッズトークン9)入りデッキ+gear colorGarden,harvest。AIは14/36を既定で撃たないため F.elecGarden で撃つ条件を足した(⚡があり🌱が無い自陣コマ≥N)。上位3相手 seed31/300 | 現行 58.8 → 構成のみ 44.2 → +ワルプルギス(N=2/3) 44.1 → +風の落とし子(N=1/2) 44.6/44.2。ノブがほぼ効かない(ワルプルギスはコスト9で撃てない、風の落とし子は撃っても伸びない)。さらに colorGarden は主力の lightToken(寄与+15pt)か harvest(+14pt)を押し出すため、魔力+1/マスでそれを補えない | 不採用(ノブ削除)。新ギア4種を現行構成に1枠差し替えのみで測ると(seed30/100) lastStand 41.3 / ruinSurge 40.3 / colorGarden 39.3 / ailmentPact 39.3 で現行 47.7 を下回る |
| 21 | strategy(sim に写し身を実装) | sim エンジンに写し身(51)を実装(本番 Game.tsx と同じ: 1クリック・置き先ランダム・手番継続)、雷霆の巫AIが『どの置き先でも自陣リーチが平均+0.5以上増えるコマ』で撃つ(F.elecClone=1)。上位3相手 seed25/400 | 58.4 → 59.2(+0.8、誤差内)。使用は0.05回/試合と稀(魔力が帯電トークンに回り、手札に51が来て条件を満たす場面が少ない) | 不採用(実装・ノブとも削除)。死に札の活用で伸ばす案(#109)は慈雨・写し身とも効果なし |
| 20 | strategy(sim に慈雨を実装) | sim エンジンに慈雨(49)を実装し、雷霆の巫AIが『ライフ1以下の自陣コマ ≥N』で撃つ(F.elecBoost=2/3)。上位3相手 seed24/400 | 基準 58.8 → N=2: 57.8(-1.0) / N=3: 58.3(-0.5)。効果なし | 不採用(実装・ノブとも削除)。#109 の死に札案のうち慈雨は不要と判明。縮地/写し身は未検証 |
| 19 | deck+gear(別案) | 追い剥ぎ52を入れ(sim では撃てない札=帯電札比率が上がる)、ダブルロック12を抜く(案X)。ギア別案 afterglow,harvest / luckyPurse,harvest を測定 | 上位3相手 envDeck varied seed22/400: 59.1→63.9。rank envDeck varied seed23/400(--target): 旧デッキ 58.9(3位)→案X 66.7(1位, +7.8)。seed4/300: 基本 案X 64.0(2位, 旧64.8と同等)、envDeck varied 案X 65.7(1位)。ギア別案 afterglow: 基本 62.7 / env 65.0(主案と同等)、luckyPurse: 基本 59.3(弱い) | 採用: デッキ案X、ギア別案 afterglow,harvest(主案と50%ずつ)。本番AIでは未計測 |
| 18 | gear/strategy | envDeck varied 向けギア近傍(seed20/120)、サイレンス早撃ち F.silenceEarly=2 (上位3相手 envDeck varied seed21/400) | ギア: 現行が最上位級(57.1 vs afterglow 59.2、誤差内)。silenceEarly: 55.9→56.3(+0.4) | 不採用(ノブ削除) |
| 17 | deck(envDeck varied向け) | `--envDeck varied --opp magician,cryomancer` 2枚swap 40候補(seed19/100) | 最良 74.5%±6.0 vs base 65.0%(z≈1、閾値未達)。envDeck variedの順位は seed5/400でも 2位 60.3 vs magician 62.3(-2.0)で再現 | 不採用 |
| 16 | meta(対ギアなしmagician) | `--opp magician --oppGears none` 3枚swap 40候補(seed18/100試合) | 最良 72.0%±8.8 vs base 68.0%、誤差内。なお `--rank --oppGears none` の失敗は『ギアなしの雷霆の巫自身』が弱いため(lightToken -16.7/harvest -14.3pt の寄与)で、対magician単体(68%)は問題なし | 不採用 |
| 14 | deck(監査→手作り) | 採用デッキの監査で未使用6枚(12,28,49,50,51,58)。それらをランダム帯電25・軽減系(56,57,60,54)に替えた案A/B/C/D | 上位3相手 seed17/300: base 59.0, A 63.3, B 63.1, C 59.0, D 61.9。全キャラ seed3/250: base 67.0, A 66.7(-0.3), B 67.4(+0.4) | 不採用(上位相手のみ+、全体は差なし) |
| 15 | gear(joint,新デッキ) | 上位3相手 seed15/100試合のギア近傍 | 現行 lightToken,harvest 60.3% が最上位(次点 59.7) | 不採用 |
| 13 | synergy/meta | 上位2相手(magician,cryomancer)向け3枚swap 40候補(seed13/100試合)の上位。共通項=大特価58追加・オピウム8/トークン3削除。候補2: トークン3・ライフ3・オピウム8 → 縮地50・写し身51・大特価58 | 上位3相手 seed14/400試合: 52.4→59.5(+7.1)。全キャラ seed3/200試合: 62.5→66.4(+3.9、全相手で同等以上、対magician 49→64) | 採用(deck.ts/deck.js ミラー済み。本番AIでは未計測) |
| 12 | gear | 新環境の上位3相手向けギア近傍(seed11/100試合)で lightToken+harvest が最上位(59.0 vs 51.7)。3回目の最上位 | 上位3相手 seed12/400試合: 45.8→54.3(+8.5、z≈2.2。対magician 29→46)。全キャラ seed3/200試合: 60.8→62.5(+1.7、悪化する相手なし) | 採用(gear.ts/gear.js ミラー済み。本番AIでは未計測) |
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
- AI(戦略)の採用変更はなし → 本番 AIPlayer.ts へのミラー対象なし。採用済みは推奨ギア/デッキのみ(src/components/game/gear.ts・deck.ts に反映済み)。本番AIでは未計測。
## 次に試す候補(軸の順 gear → deck → synergy → strategy → joint)
- メタ: 現状 magician 戦が 34-47% と最弱(seed5/250)。`--opp magician` で刺さる札・立ち回りを探す(未実施)
- joint: 採用デッキでギア近傍を再測定済み(#4)。ほかに 特売53 を活かすギア(priceWreck/chainDiscount)は#4で不振
- synergy: `--scan deck --swap 3 --cat charge --neighbors 40`(帯電付与+発火)
- deck: `--scan deck --neighbors 30`
- gear保留: lightToken/afterglow を seed2・200試合で後追い可
- 対 tactician 50.0%、対 giant 55%、対 magician 56.7%(基準線 per より)
