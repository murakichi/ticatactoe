# tune-top: you (あなた)
- 目標(ユーザー指示 2026-11-06): 最下位でトップ不可は前提。**勝率を少しでも上げる**(対強豪平均を主、field を併記)。キャラ(相手)ごとの専用デッキ・ギアを組んでよい。特定の相手にある程度勝てるようになった対策は `docs/tune/LEARNINGS.md` に「対X」で書き、他キャラの対策の参考にする。
- 最後に検証したmaster: 55043be
- 現在の推奨設定: gears=[luckyPurse,titanCost,sturdy] deck=[0,2,3,5,6,8,10,11,12,28,32,52]
- 強豪リスト(固定): electrician,magician,cryomancer,tactician,poisoner,giant
- 基準線: 対強豪平均 6.8%±2.0 (field 11.0%) / 12位(最下位) (--target you seed1/100)。rank表(seed1/60): 6.1%・field 10.4%。対キャラ別: tactician18 magician3 giant7 yinYang9 necro32 poisoner7 electrician0 cryo6 pyro0 witch3 keysmith36
- 連続不採用回数: 0
- 状態: running
## 試行ログ(新しい順)
| # | 軸 | 仮説 | 結果 | 採否 |
## 不採用にした案
## 次に試す候補
- gear 1枠差し替え走査(実行中) → deck 近傍 → 勝てている相手(necromancer/keysmith/tactician)から対策を抽出
