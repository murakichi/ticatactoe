# tune-top: tactician
- 目標: 環境1位に到達し、その後も環境勝率が上がらなくなるまで洗練する
- 最後に検証したmaster: 80d796c(魔法使いの推奨デッキ更新が入った。sim エンジン・AI は不変)
- 現在の推奨設定: 変更なし(推奨ギア・推奨デッキのまま) AIフラグ=なし
- 基準線: 環境勝率 67.8% / 1位 / 2位 electrician 60.2%   (seed 1, games 60, 基本条件のみ。200試合・4条件の完了判定は未実施)
- 連続不採用回数: 6(トップ未達のため行き詰まり判定は6種類測定後)
- 状態: blocked(issue #85)
## master 80d796c で再基準(seed3, 100試合, --cache)
- 基本条件の順位表: 1位 magician 70.0% / **2位 tactician 61.2%** / 3位 giant 57.7%。魔法使いの推奨デッキ更新(別セッション, +5.8pt)で軍師は2位に陥落。
- 軍師の対キャラ別: magician 40% / giant 49% / 他は58〜75%。
- gear 再スキャン(対 magician+giant, seed1, 80試合): base 48.1%、最良 luckyPurse/gambler 51.9%(+3.8pt, z≈0.7)=誤差 → 不採用。

## 完了判定(4条件, --rank --target tactician --games 100 --seed 3, master edf73fb)
| 条件 | 軍師 | 順位 |
|---|---|---|
| 基本(seed1, 60試合, 暫定) | 67.8% | 1位 (2位 electrician 60.2%) |
| --oppGears none | 69.8% | 1位 (2位 magician 57.8%) |
| --oppGears random | 67.2% | 1位 (2位 magician 57.0%) |
| --envDeck varied | 59.0% | **3位** (1位 electrician 63.4% / giant 60.0%) |
| --envDeck varied (seed3, 200試合) | 56.8% | **4位** (1位 electrician 63.3% / giant 58.9% / magician 57.7%) |
→ 相手のデッキが推奨から崩れると軍師だけ約-9pt落ちる(他は電気使い・巨人が上がる)。推奨デッキが相手の崩れに弱い=推奨デッキの頑健性が課題。

## 試行ログ(新しい順。却下も必ず残す。同じ案を再試行しない)
| # | 軸 | 仮説 | 結果(field Δ±95%CI) | 採否 |
|---|---|---|---|---|
| 7 | gear(新master) | 対 magician+giant の1枠差し替え全近傍(seed1, 80試合) | 最良 +3.8pt(z≈0.7)=誤差 | 不採用 |
| 6 | joint | gears=vengeance,priceWreck × デッキ1枚差し替え10近傍(varied, seed1, 60試合): 最良 69.3 vs base 69.1 | 差なし(+0.2pt) | 不採用 |
| 5 | strategy | 総攻撃は使った試合の勝率82%(対巨人)だが使用は0.09回/試合。相手リーチ中(oppReaches>0)でも撃つ `F.taAlways` を追加 | 対巨人66-84、対電気使い48-102 とも基準と完全一致=一度も発動せず(リーチ中は別経路で手番が決まる)。ノブ削除 | 不採用 |
| 4 | meta/deck | envDeck varied で対巨人47%・対電気使い52%が弱点(他は57〜71%、全体62.0% seed1/100)。`--opp giant,electrician --envDeck varied --scan deck --swap 2 --neighbors 14 --games 80`: 基準54.4%±7.6、最良58.8%(+4.4, z≈0.8)。上位候補は共通の札が無く一貫性なし | 補正閾値z≥2.7に遠く誤差。不採用 | 不採用 |
| 3 | synergy | `--scan deck --swap 2 --neighbors 30`(seed1, 60試合, 全相手)。最良 69.6%(-4,-21 +7,+29)、基準 69.1%。上位は69.4%台に密集 | 最良でも +0.5pt(z<1)=誤差。未使用札を有効札に替えても動かない | 不採用 |
| 2 | gear | `--scan gears` 1枠差し替え全近傍(seed1, 60試合, 全9相手): 基準 sturdy+priceWreck 69.1%±3.8 が最良。次点 slot0→vengeance 67.6%、priceWreck を替えると 58%台以下に低下 | 全近傍が基準以下(最良でも -1.5pt、有意でない)。先の監査の「priceWreck除去 +10.8pt」は対2相手60試合のノイズ | 不採用 |
| 1 | strategy | 総攻撃を撃つ条件を絞る(`F.taMinTok`=使用済みトークン数の下限 / `F.taMinPieces`=自コマ数の下限)。使用率監査で対電気使い 33% | 対電気使い 65勝→A:65/66(基準66)、対巨人 84〜86(基準87)。taMinTok=1,2 / taMinPieces=3 すべて差 ±3勝以内=誤差(seed1, 200試合) | 不採用(ノブは削除) |
## 監査(scan audit, 対 electrician+giant, seed1, 60試合/相手, base 50.8%)
- 寄与の大きい順: priceWreck を外すと +10.8pt(!)、トークン(3)を禁止 +5.8pt、バッズトークン(9)禁止 -3.3pt、sturdy を外す -3.3pt。
- 差なし(AIが使っていない): 16,21,23,37,45,46,12,28 の8枚。デッキ12枚中8枚が未使用=入れ替え余地が大きい。
- 注意: 60試合×2相手はノイズが大きい(SE≈±5pt)。priceWreck除去は有望な仮説だが未再測定(seed2,200試合で要確認)。

## 次に試す候補
- **次(具体コマンド)**: strategy 軸(対巨人47%): `node sim/probe-usage.js --chars tactician,giant --games 200` で札の使用を見て、auto で負け筋を観戦 → `sim/ai.js` に F.xxx ノブ。joint 軸: `--gears a,b --scan deck --envDeck varied`。完了判定の弱点は『電気使い・巨人が varied で上がる』ことで、軍師側の-9pt(基本→varied)は主因が軍師の推奨デッキの頑健性か相手の上振れかを `--target electrician --envDeck varied` と比較して切り分ける
- 仮説: 軍師の推奨デッキは固有スキル(総攻撃)に偏った札に依存し、varied だと相手の対策札が増えて崩れる? 相手側の変動がなぜ軍師に不利かを per-opponent で確認
- ~~gear の priceWreck 差し替え~~(試行#2で却下)。**次**: 未使用8枚を有効な札に替える deck 探索(`--scan deck --swap 2`)
- strategy: 対電気使い(50%)・対巨人(51.7%)のメタ
- gear: `--scan gears` / deck: `--scan deck --swap 2`
- 完了判定の4条件(基本 / envDeck varied / oppGears none / random)を 200 試合で
