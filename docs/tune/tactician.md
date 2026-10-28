# tune-top: tactician
- 目標: 環境1位に到達し、その後も環境勝率が上がらなくなるまで洗練する
- 最後に検証したmaster: 3bc89db(新ギア colorGarden/ailmentPact/ruinSurge/lastStand 追加後)(魔法使いの推奨デッキ更新が入った。sim エンジン・AI は不変)
- 現在の推奨設定: gears=[lastStand, priceWreck](sturdy→lastStand に変更, 試行#11) deck=推奨のまま AIフラグ=なし
- 基準線: 環境勝率 61.3% / 3位 / 1位 magician 66.0% / 2位 poisoner 63.3%   (seed 3, games 100, 基本条件, lastStand+lsAggro 採用後。4条件の完了判定は未実施)
- 連続不採用回数: 2(#13, #14)
- 状態: running(ギア4種追加を受けて再開, master 3bc89db)
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
| 16 | synergy(デッキ2枚同時入れ替え) | `--scan deck --swap 2 --neighbors 40`(seed1/60, 基準45.7%)の最良は -4(両トークン) -21(帯電トークン) +55(トークン割引) +64(紅葉狩り)=49.2%。上位候補の多くが両トークン(4)を抜いている。別シードで追試(seed2/100): 基準43.0 → 50.4(+7.4)、seed3/100: 46.9 → 50.6(+3.7)、seed3/100 `--envDeck varied`: 43.0 → 52.2(+9.2)。対キャラ別は毒使い 26→43、電気 34→47 など悪化なし | 3条件とも+1.5pt以上かつ+1.96×SE以上。探索で最良を選んだ勝者の呪いは、別シードの追試で再現したため採用 | **採用**(推奨デッキ 3,9,11,12,16,23,28,37,45,46,55,64。`deck.ts`・`sim/deck.js`)。採用後の検証: 環境順位(`--rank --games 100 --seed 3`)で 旧デッキ 7位 45.8% → 新デッキ 6位 49.7%(他キャラは±1pt以内)。本番AI(TS, `aiMatch.probe`, 4相手×約40試合)は 旧 52/158=32.9% → 新 53/155=34.2% で差なし(悪化もしていない)。本番AIの追加確認(8相手×約80試合): 旧 240/591=40.6% → 新 254/606=41.9%(+1.3pt, z≈0.5、4相手の先行分と合算でも旧39.0→新40.3)。相手別は氷室+11・ネクロ+6・魔法使い+5、巨人-7・魔女-11で一貫せず、実戦(本番AI)で効くとは言えない。トップ(1位 witch 76.7%)には遠い |
| 15 | 波及確認 | lsAggro は防壁を持つ全キャラに効く。master が魔法使い・毒使いも防壁を推奨にしたため、対象キャラ単独で lsAggro=0/1 を比較(seed2/150): magician 58.1→63.1(+5.0)、poisoner 73.1→73.7(+0.6, 中立) | 他キャラへの悪影響なし(魔法使いは改善) | 確認済み |
| 14 | strategy(相手の防壁発動後の魔力余り) | ユーザー指摘『相手の防壁が発動するとこちらの魔力が+4/手番で有り余る』。`probe-top --oppGears lastStand`(相手全員が防壁装備)を追加して測定。軍師の基準 55.9%(seed2/100)。余り魔力で手札を引き直して撃てるものを探す `F.rich`(3,6)は 55.8% / 56.3% で差なし | sim(軍師 vs 巨人防壁, 100試合)で防壁発動後の軍師の手番開始魔力は中央値7・p90 11、スキル使用後の余りは中央値2・p90 6。AIは既にほぼ使い切っており、構造上の余剰は小さい。ノブ削除 | 不採用 |
| 13 | strategy(lastStand 2段階) | ユーザー案『防壁が未発動の間は魔力を貯め(ロック/バッズ系は使う)、発動後にトークン連打で勝つ』。未発動中は token/doubleToken/totalAssault を魔力が N 残る範囲でしか撃たない `F.lsHoard`。seed2/200: 基準 60.1% → N=4 で 50.7%、N=8 で 45.6% | 大幅悪化(-9〜-15pt)。トークンが軍師の手数(テンポ)の源で、貯めている間に盤面を取られる。ノブ削除 | 不採用 |
| 12 | strategy(lastStand) | ユーザー案『防壁が未発動のうちは相手の1回目の勝ちを止めに行かず攻める』。強制ブロックを防壁未発動時はスキップ(AI_DEFAULTS.lsAggro)。seed2/200: 57.6→60.1(+2.5)、seed4/200: 58.9→61.8(+2.9)。合算400で +2.7pt(CI±2.2)。対magician・対cryomancer が改善、悪化なし | **採用**(sim/ai.js + 本番 AIPlayer.lastStandReady + Game.tsx、回帰テスト2件。基本順位 seed3/100: 軍師 61.3%・3位) |
| 11 | gear | slot0 sturdy→lastStand(土壇場の防壁)。seed2/200: 54.8→57.6、seed4/200: 54.8→58.9。合算400で +3.5pt(CI±2.2)。対巨人 51→72/50→77 が主因、対cryomancer/electrician は -2〜-6 | **採用**(RECOMMENDED_GEARS を sim/src 両方更新) |
| 10 | gear+strategy(彩りの庭) | 現デッキ/AIでは2種類マスが0%。氷結/帯電付与/ロックで重ねる AI(F.garden)を試作。現状58.3% / 彩りの庭のみ52.3% / +重ねAI 50.3% / +デッキに22,30追加 50.1%(seed1/100) | 2種類マスは4.7%の手番止まり。1試合≈6手番で回収前に終わり、重ねる支出が総攻撃・トークンを圧迫して悪化。ノブ削除 | 不採用 |
| 9 | gear(新4種を含む再スキャン) | `--scan gears`(seed1/60, 全相手)。base 60.0%、最良 slot0→lastStand 62.6%(+2.6pt, 候補30でz閾値3.0に届かず) | 保留→#11で追試し採用 | 保留 |
| 8 | strategy(対magician) | probe-usage で対魔法使い38%: buds 勝率4%・lock 勝率0%(負け筋の併発)。バッズトークン/ダブルロックを使わせない `ban`(probe-ai vs, seed1, 150試合) | ban=9: 47勝(基準53)、ban=12: 53勝(基準53, 差なし)、ban=9|12: 47勝 → 悪化または無差 | 不採用 |
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

## 採用後の順位(master 3bc89db + lastStand, seed3/100, 基本条件)
1位 magician 65.8% / 2位 poisoner 63.5% / **3位 tactician 58.8%** / 4位 electrician 58.8%。トップ未達(魔法使い・毒使いに届かない)。

## 次に試す候補
- 新ギアでの deck 再探索(lastStand は被弾前提のため、守りの札・ロックとの joint): `node sim/probe-top.js --target tactician --gears lastStand,priceWreck --scan deck --neighbors 15 --games 60 --cache .tune-cache`
- **次(具体コマンド)**: strategy 軸(対巨人47%): `node sim/probe-usage.js --chars tactician,giant --games 200` で札の使用を見て、auto で負け筋を観戦 → `sim/ai.js` に F.xxx ノブ。joint 軸: `--gears a,b --scan deck --envDeck varied`。完了判定の弱点は『電気使い・巨人が varied で上がる』ことで、軍師側の-9pt(基本→varied)は主因が軍師の推奨デッキの頑健性か相手の上振れかを `--target electrician --envDeck varied` と比較して切り分ける
- 仮説: 軍師の推奨デッキは固有スキル(総攻撃)に偏った札に依存し、varied だと相手の対策札が増えて崩れる? 相手側の変動がなぜ軍師に不利かを per-opponent で確認
- ~~gear の priceWreck 差し替え~~(試行#2で却下)。**次**: 未使用8枚を有効な札に替える deck 探索(`--scan deck --swap 2`)
- strategy: 対電気使い(50%)・対巨人(51.7%)のメタ
- gear: `--scan gears` / deck: `--scan deck --swap 2`
- 完了判定の4条件(基本 / envDeck varied / oppGears none / random)を 200 試合で
