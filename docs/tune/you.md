# tune-top: you (あなた)
- 目標(ユーザー指示 2026-11-06): 最下位でトップ不可は前提。**勝率を少しでも上げる**。全キャラ共通の1設定は不可能なので、**相手を1キャラずつ選んで専用デッキ・ギアを組む**。ある程度勝てるようになった対策は `docs/tune/LEARNINGS.md` に「対X」で書き、他キャラの対策の参考にする。
- 最後に検証したmaster: 55043be
- 現在の推奨設定(共通): gears=[luckyPurse,titanCost,sturdy] deck=[0,2,3,5,6,8,10,11,12,28,32,52]
- 相手別の専用ギア(`gear.ts` `COUNTER_GEARS_FOR_YOU`。相手が1キャラのときだけ AI 席の「あなた」が使う): poisoner=[lastStand,spellWard,sturdy] / magician・keysmith・yinYangMaster=[lastStand,sturdy,luckyPurse]
- 強豪リスト(固定): electrician,magician,cryomancer,tactician,poisoner,giant
- 基準線: 対強豪平均 6.8%±2.0 (field 11.0%) / 12位(最下位) (--target you seed1/100)。対キャラ別: tactician18 magician3 giant7 yinYang9 necro32 poisoner7 electrician0 cryo6 pyro0 witch3 keysmith36
- 連続不採用回数: 0
- 状態: running(相手を1キャラずつ潰している)

## 診断
- 「あなた」は固有スキルも固有の資源も無い。全相手共通のギア triple(6通り, seed1/60)は 4.4〜9.4% でノイズ内。デッキ2枚差し替え24近傍(強豪6体, 40試合)も最良 +1.7pt(z<1)。→ **共通設定は探索しても動かない**。相手を絞ると差が出る(下表)。
- 機構: lastStand は1回の列完成を吸収して延命(発動後は自駒全消滅・相手の魔力+4)。spellWard は毒・状態異常を止める。titanCost はライフ+3(スキルコスト+3)。相手の勝ち筋(毒・列完成の速さ・長期戦)でどれが効くかが変わる。

## 相手別の結果(`--target you --opp X`、現推奨= luckyPurse,titanCost,sturdy との比較)
| 相手 | 現推奨 | 最良ギア | 結果(seed, 試合数) | 採否 |
|---|---|---|---|---|
| poisoner | 10.3% | lastStand,spellWard,sturdy | 37.3%±5.5(seed2/300) | 採用(COUNTER_GEARS_FOR_YOU) |
| yinYangMaster | 9.3% | lastStand,sturdy,luckyPurse | 21.0%±4.0(seed2/400) | 採用 |
| keysmith | 31.8% | lastStand,sturdy,luckyPurse | 40.8%±4.8(seed2/400) | 採用 |
| magician | 3.3% | lastStand,sturdy,luckyPurse | 11.0%±3.5(seed2/300。seed1/150 でも 2.7→10.7) | 採用 |
| necromancer | 30.0% | (現推奨が最良。測った8通り) | lastStand系 12.7〜16.7% | 変更なし |
| tactician | 18.7% | (現推奨が最良。測った8通り) | lastStand系 6〜9% | 変更なし |
| giant | 8.7% | 差なし(harvest,lightToken,sturdy も 8.7%) | — | 変更なし |
| electrician / cryomancer / pyromancer / witch | 0〜9% | ギアでは差なし(8通り、0〜9%、witch 4〜6%) | — | 変更なし。デッキ側の手が要る |

## 試行ログ(新しい順)
| # | 軸 | 仮説 | 結果 | 採否 |
|---|---|---|---|---|
| 8 | gear(対poisoner) | spellWard が毒を止める | 10.3→37.3%(seed2/300)。spellWard抜き lastStand,sturdy,luckyPurse 14.0 | 採用 |
| 7 | gear(対yinYang/keysmith) | lastStand で延命 | yinYang +11.7pt、keysmith +9.0pt(seed2/400) | 採用 |
| 6 | gear(対necro/tactician/giant) | 8通りの triple | 現推奨が最良か差なし | 不採用 |
| 5 | deck(対necro) swap1 30近傍 80試合 | 1枚差し替え | 最良でも base -1.3pt(全てノイズ) | 不採用 |
| 9 | deck(対electrician/cryo/pyro/witch) | 相手の勝ち筋に当たる札 | 全てノイズ内(上記) | 不採用 |
| 4 | deck(共通) swap2 24近傍 40試合 | 一寸の虫(92) 等 | 最良 +1.7pt(12.5 vs 10.8, z<1) | 不採用(要追試: 92入れ) |
| 3 | gear(共通) triple 6通り 60試合 | lastStand,spellWard,sturdy 等 | 最良 9.4%±2.7 vs 6.8%(seed違い) | 不採用(対強豪で+1.5pt/z基準に届かず) |

## 不採用にした案
- 相手別デッキ(electrician/cryomancer/pyromancer/witch、各150試合 seed1、現行ギア): 相手の勝ち筋に当たる札(ジャマー26・火遁31・砕氷47・焚き火の唄66・焚きつけ85・血清17・毒返し100・鬼門封じ74・一寸の虫92・特売53)を5通りずつ。最良でも electrician 0→5.3%(26+92)、cryomancer 9.3→12.0%(6→53)、witch 4.7→8.0%(12→92)、pyromancer は全て0〜0.7%。いずれも SE(±3〜5)内でノイズ。対pyromancer は札では動かない。
- 一寸の虫(92)を6と入れ替え(8相手×150試合 seed2): 対強豪… 7.8→8.7%(+0.9pt)、field 6.2→7.5(+1.3)。採用基準の+1.5ptに届かず保留(要追試)。
- 対magician のデッキに氷結(30)・範囲氷結(41)・火口(87)・一寸の虫(92)を入れる(他キャラの対魔法使い策の流用): 12.0→0.7〜8.7%(afterglow,vengeance,sturdy, seed1/150)。AI が「あなた」ではそれらを活かせず、入れるだけでは悪化。手札固定(pyromancer の火口固定 37→58%)が要るので、固定とセットで再測定する。
- 全相手共通の gear/deck 1設定の探索: 上記のとおりノイズ内。相手別に分けて測る方針に切り替え(ユーザー指示)。
- 共通ギアを lastStand 系にする: necromancer/tactician で大幅悪化(necro 30→13〜17%、tactician 18.7→6〜9%)。

## 次に試す候補
- electrician/cryomancer/pyromancer/witch はギアで動かない。デッキ側: 対魔法使い・対氷室で他キャラが効いた手(氷結札・火口の手札固定、サイレンス固定)を、手札固定とセットで試す。
- 対poisoner のデッキ近傍(実行した swap1 30近傍の結果は未回収。再実行)、対yinYang のデッキ。
- 人間が「あなた」を選ぶセットアップ画面に、相手別の推奨ギアを出す(未実装。AI席の「あなた」のみ反映)。
