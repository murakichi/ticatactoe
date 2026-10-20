---
name: ai-improve
description: Iteratively strengthen the game AI (AIPlayer.ts / sim/ai.js). Phase 1 fixes bugs and tactical blind spots. Phase 2 optimizes evaluation weights, explores new strategies, and tunes parameters to maximize win rate. Use when the user reports AI playing badly or wants the AI made smarter.
---

# ai-improve

Two-phase AI improvement loop for the tactical tic-tac-toe variant.
Uses the headless sim (`sim/`) to detect weaknesses, fix them, then push
win rate higher through optimization.

## 鉄則: 検証してから採用 (verify-or-revert)

どんな改善案も**直感で採用しない**。特にヒューリスティック（評価重み・相手キャラ考慮・スキル発動条件）は、
**paired A/B（同一シードで改修前後を比較）で勝率が上がったものだけ残す。上がらなければ撤回**する。
盤面数学は直感を裏切ることがある（例: 「対ネクロで破壊を控える」は逆効果だった → #5ログ）。
**却下した実験は #5 のログ表に必ず記録**して、同じ案を盲目的に再試行しないこと。
方針（例: 相手キャラ考慮）は1回の失敗で捨てず、別の具体ルールを立てて検証し続ける。

## Tools

```bash
node sim/cli.js auto --hchar you --cchar you               # watch one game (spot mistakes)
node sim/cli.js auto --hchar giant --cchar tactician        # specific matchup
node sim/cli.js bench --games 1500 --char you --seed 1      # AI strength benchmark
node sim/cli.js metrics --games 800 --mode faithful --seed 1 # full balance snapshot
```

paired A/B と使用率の計測（`cli.js` は全ペア総当たりで遅いので、AI の改修検証はこちらを使う）:
```bash
# 改修前後を同一シードで比較。flags は sim/ai.js の AI_DEFAULTS / F.xxx、--modB で別版 ai ファイルとも比較できる
node sim/probe-ai.js --mode vs --chars cryomancer,you --games 100 --seed 1 --flagsA frzBlock=0 [--modB ai.old.js]  # ai.old.js は git show <旧コミット>:sim/ai.js > sim/ai.old.js で作る | node sim/probe-sum.js
node sim/probe-ai.js --mode h2h --chars you,you --games 200 --flagsA ban=36    # ban='33|36' でスキルidxを使わない版との対戦
node sim/probe-usage.js --chars magician,cryomancer --games 400 --size 4       # スキルの使用回数/試合と、使った試合の勝率
```
4 コアなら `xargs -P4` で seed を変えた複数ジョブを並列に回し、`probe-sum.js` に流すと合算の勝率と 95%CI が出る。

## AI source files (keep in sync)

| sim (headless) | src (React) |
|---|---|
| `sim/ai.js` — `getEnhancedBestMove`, `chooseSkills`, `minimax`, `faithfulMakeMove` | `src/components/game/AIPlayer.ts` — `getBestMove`, `chooseSkills`, `minimax`, `makeMove` |

Any fix to one MUST be mirrored to the other.

---

## Phase 1: 弱点修正 (Bug / Blind Spot Fix)

目標: 明らかな戦術ミスをゼロにする。

### 検出方法

#### 1. Replay analysis (`auto`)
3-5ゲーム観戦して以下を探す:
- **Missed blocks**: opponent has 3-in-a-row with 4th empty, AI doesn't block
- **Missed wins**: AI has 3-in-a-row with 4th empty, AI places elsewhere
- **Wasted skills**: skill fired with no tactical benefit
- **Ignoring captures**: bind-0 enemy piece could complete a line, AI ignores it
- **Lock not used**: multi-reach situation but AI doesn't use Lock defense

#### 2. Targeted probes
```bash
node sim/cli.js auto --hchar you --cchar you 2>&1 | grep -i "reach\|block\|win"
```

#### 3. Tactical strategy checklist
各イテレーションで以下の戦術が正しく動作しているか確認する。
問題があれば修正→検証。

**防御:**
- Single reach block (3-in-a-row の 4th を塞ぐ)
- Multi-reach Lock defense (脅威数に応じて single/double/triple Lock を選択)
- Pre-reach awareness (2-in-a-row + 2 empty → Token で即リーチの危険)
- Opium defense (相手リーチ時に Opium で bind を削る)
- Capture-aware blocking (相手が bind-0 の自駒を奪って勝てるケースの検出)

**攻撃:**
- Immediate win (勝てる手は最優先)
- Fork creation (1手で 2+ リーチを作る)
- Capture attack (bind-0 の敵駒を奪う)
- Token for reach (Token で追加配置→ライン延伸)

**スキル運用 (全固有スキルが「撃てるのに撃たない」状態になっていないか必ず確認):**
- 軍師: 全軍突撃 / 魔法使い: 審判の日 / 巨人: ストンプ / 陰陽師: 陰陽転化＋豊穣・凶荒の舞 / ネクロ: 蘇生
- 上記はすべて `oppReaches === 0` ガード付きで、実際に発火するか（5キャラ分）を毎回チェック
- Multi-skill per turn (1ターンに複数スキル発動)
- Buds cost-effectiveness (`emptyCount >= 6 && myBuds < 3`)
- Charge timing (magic <= 2 で駒あり)
- Destructive skills (Slash/BackSlash: 相手駒 > 自駒のときのみ)
- Tsunami (劣勢 かつ 相手 magic >= 6)

#### 4. 固有スキルの「タイミング適切性」&「立ち回り」監査
「撃てるか」だけでなく、**キャラ特性に合った適切な状況で撃ち、かつそれを能動的に作りに行く立ち回り**をしているかを見る。
各キャラの先手/後手を `auto` で数ゲームずつ観戦し、下表で照合する。

| キャラ | スキル | 撃つべきタイミング | それを作る立ち回り |
|---|---|---|---|
| 軍師 | 全軍突撃 | トークンを数回使ってコスト軽減した後／盤面に味方がある中盤 | まずトークン優先連打（割引＋盤面拡大）してから発動 |
| 魔法使い | 審判の日 | 十字範囲に敵≧2かつ自駒が少ない中心／他スキルでコスト軽減後 | 自駒を十字に固めない・安いスキルでカウントを稼ぐ |
| 巨人 | ストンプ | 3×3範囲に敵が2体以上密集（中心が空なら自駒も設置） | bind>0攻撃と高ライフで前に出て敵を一箇所に誘導 |
| 陰陽師 | 凶荒/豊穣の舞＋陰陽転化 | 攻勢=陰(凶荒/敵-2)、自駒を守る=陽(豊穣/+2)。状況でモード切替 | 不利なら陽へ転化し延命、磨耗狙いは陰維持(陰は+1魔力) |
| ネクロ | 蘇生 | 墓地(撃破/被破壊数)が貯まり召喚が見込める／敵に低ライフ駒が複数 | トレードを誘って墓地を稼ぐ・過伸長しない |

**NGサイン（観戦時に探す）:**
- 割引が乗る前に固有スキルを即撃ち（軍師/魔法使い/ネクロ）
- 効果範囲に対象がいないのに発動（ストンプ/審判/凶荒の舞）
- モード固定で状況に合わない舞を撃つ（陰陽師が常に陰のまま転化しない）
- スキルを撃つための布石（トークン展開／トレード誘発／敵の密集化）を一切しない＝「撃てたら撃つ」だけの受動運用

**計測（発火頻度・タイミングの定量化）:** `SKILLS.<skill>` をラップして発火回数・発火時の盤面条件（範囲内の敵数・割引量・モード）を記録し、上表の理想と乖離していないか数値で確認する。

#### 5. 相手キャラ/ステータスを考慮した行動 (opponent-aware play)
AIは自分のキャラだけでなく **相手のキャラと盤面ステータス** を見て手を変えるべき。
現状 `this.opponent` は記号(💙/⭕)のみで相手キャラを参照していない → 相手キャラを AI に渡して以下を考慮する。

| 相手 | 警戒/避けること | 推奨行動 |
|---|---|---|
| ネクロマンサー | **無駄な破壊/捕獲**（墓地を肥やし蘇生召喚を強化してしまう） | 勝ち/ブロック以外の捕獲を控える・範囲破壊(スラッシュ/ストンプ/審判/凶荒)を相手に撃たない・敵の低ライフ駒を放置して朽ちさせない選択 |
| 巨人 | bind壁が無力(bind>0でも殴られる)・高ライフで居座る | bindに頼らず即リーチ作成/ブロック優先 |
| 軍師 | トークンで急速に盤面が埋まる | 重要ラインを早めに押さえる |
| 魔法使い | 審判の日で十字を一掃される | 自駒を十字パターンに密集させない・ロックで要石を守る |
| 陰陽師 | 凶荒の舞で全駒-2 | bindバッファを厚めに保つ |

検出: `auto` で相手キャラ別に観戦し、上記の悪手（例: 対ネクロで不要な捕獲、対魔法使いで十字に密集）が出ていないか確認。
実装: 相手キャラは既に AI に渡してある（`AIPlayer` の `opponentCharacter` / sim は `s.heart/circleChar` から導出）。`evaluateBoard`・`getBestMove`・`chooseSkills` で相手キャラ依存の補正を足せる。

**方針は維持するが、各ルールは「直感」で採用してはならない。必ず paired A/B 検証して、勝率が上がったものだけ残す**（下がれば撤回）。`metrics --seed S` を改修前後で回す or 該当キャラの総合勝率を同一シードで比較する。直感的に正しそうでも盤面数学で裏目に出る（下記ログ参照）。

##### 検証済みルールのログ（再挑戦を避けるため必ず記録）
| ルール | 結果 | 備考 |
|---|---|---|
| 対ネクロで捕獲ボーナスを減点＋破壊スキル(ストンプ/審判/凶荒)を封印 | ❌ **却下** | ネクロ総合 52.9%→**61.1%**（逆効果）。捕獲/破壊の戦術価値（盤面占有・相手駒否定。特に巨人ストンプ）が、墓地に与える死体1個の損を上回る。相手を無害化してしまい逆にネクロが伸びる。 |
| AIスキルロック: 軍師→トークン固定 / あなた→汎用強スキル固定 | ✅ **採用** | ロックAI vs 非ロックAI(同キャラミラー)で軍師58%・あなた57%・ネクロ51%。ランダム枠に依存するキャラに有効。`chooseLocks`(最大2枠)。 |
| AIスキルロック: 巨人/魔法使い/陰陽師 | ❌ 無効化 | 同ミラーで巨人40%・陰陽45%・魔法47%（ロックが不利）。固有スキル(ストンプ/審判/舞)依存でランダム枠固定は柔軟性を削ぐだけ。これらは `chooseLocks` で return []。「魔法使い→バッズ固定」も不発で不採用。絞込後 総合ロック側 **51.7%**。 |
| 魔法使いコンセプト強化(バッズ→魔力→連打) | ✅ **採用** | バッズ1個=魔力+3(rule, engine/Game.tsx) + AIが審判を撃たない時バッズ駒を🔑ロックして経済保護。魔法使い総合 36.0%→41.3%(+2/個)→47.6%(+3/個)→**52.6%**(+ロック)。均衡達成。 |
| 魔法使いAIのバッズ積極蓄積(ワルプルギス/ダブルバッズ多用) | ❌ 却下 | 47.6%→39.7%(逆効果)。バッズ植えの手番/魔力の機会損失が +魔力 を上回る。バッズは自然発生分を活かす(per-budボーナス↑)方が良い。 |
| 魔法使い: 審判の前に十字内バッズ駒を🔑ロックして自陣保護 | ❌ 却下 | 総合52.6%→53.0%(中立)・対ネクロ35.7%→34.7%(改善せず)。複雑化に見合う効果なし。 |
| テンポ/レース強化: リーチ作成を重視(フォーク+100→+200, シングルリーチ+40) | ✅ **採用** | レース強化AI vs 現状AI(同キャラミラー)で **58.1%**(全キャラ汎用)。リーチを先に作って盤面を取りに行く=テンポで押し切るのが強い。`getBestMove`/`getEnhancedBestMove`。軍師のみ46%とやや不利だが全体は大幅プラス。 |

| **氷結・火炎ギミック追随 (2026-10-19, paired A/B: `sim/probe-ai.js`, 同一シード, vs 基準AI)** | | 計測は `node sim/probe-ai.js --mode vs --chars テスト対象,相手 --flagsA k=v`（A=設定あり/B=なし、席を交互に先手）。n は表記のとおり、差は 95%CI 付き |
| 氷室の番人: 相手の**単独リーチ**を氷結(ロック置換・コスト2)で塞ぎ、着手は攻めに使う (`frzBlock`) | ✅ **採用** | 氷室の番人 vs あなた 57.8%→**69.5%**(+11.7±6.6, n=400) / vs 軍師 +17.0 / 魔法使い +9.5 / 巨人 **+34.5** / 陰陽師 +19.0 / 雷霆 +11.0 / 煉獄 +10.5 (n=200〜400)、ネクロ +5.5・毒使い +6.0 は誤差内。煉獄の鍛冶師は差 0.0。⚠ AI が強くなりすぎるのでバランス側の注意（あなた vs 氷室 21〜29%） |
| 氷結を全キャラが使う (汎用idx30 で塞ぐ) / 複数脅威でも氷結で1つ塞ぐ (`frzBlock=2`) | ❌ 対象外 | 煉獄の鍛冶師 +0.0〜+1.0pt（idx30 が手札に来ないと撃てない）。複数脅威は結果が `frzBlock=1` と同一。氷室の番人限定の単独脅威のみ採用 |
| evaluateBoard に状態効果の項 (自陣❄+/敵❄−/自陣🔥−/敵🔥+, 重み 2 と 5) | ❌ 却下 | 4組×300 で差 **0.0pt**。AI 同士の試合では❄/🔥が付いたコマ自体がほぼ発生せず、評価が手を変えない（発生しないので重みの良し悪しも測れない） |
| 火炎付与(idx31)を敵の高ライフコマ(bind≥6)/リーチ列の要に撃つ | ❌ 却下 | +0.7/+0.3/0.0/0.3pt（誤差内）。手札に来て条件も満たす局面が稀で効果が出ない |
| 氷室の番人: 脅威が無くても相手の2連ライン(空き2)を先行氷結 (`frzPre`) | ❌ 却下 | しきい値10: vs あなた **−11.8±6.4**・vs 煉獄 **−10.8** と有意に低下。20 は差 0.0（ほぼ発動せず）。2魔力を先行投資すると展開が遅れて負ける |
| 絶対零度(氷室)/業火(煉獄)の発動閾値「敵3個以上」を 2/4/5/6 に、優勢時のみ/劣勢時のみ | ❌ 変更なし | 絶対零度は 0.03 回/試合・業火は 0.06 回/試合しか撃たれず（魔力 10/9 が溜まる前に決着）、2/4/6 いずれも差 0.0〜±1.3pt で測定不能。3 のまま |
| 浄化/刈り入れ前夜/冬至の種子/ひこばえ/風の落とし子の発動条件 | ✅ 現状維持（使用率と寄与を計測） | 使用率(1試合あたり, 4x4, n=400): 風の落とし子 0.11〜0.17 / ひこばえ 0.00〜0.23（魔法使いで多い）/ 冬至 ≤0.01 / 刈り入れ ≈0 / 浄化 0.00。スキルを封じた ablation は全て −1.3〜+0.8pt の誤差内。**風の落とし子**は魔法使いミラー n=1600 で「毎回撃つ」+3.1±3.5、「封印」−0.1±3.5 と強すぎる兆候なし（コスト変更なし） |

| **対氷結の能動策 (2026-10-20, 仕様: 氷結・火炎で🌱/⚡/☠が休眠, 氷室の番人ライフ5)** | | 計測は `probe-ai.js --mode vs --chars テスト対象,相手 --flagsA k=v` を、各キャラ AI（あなた/軍師/魔法使い/巨人/陰陽師/ネクロ/毒使い/雷霆）が氷室の番人を相手にしたときの「あり/なし」で比較（n=300〜600, 同シード） |
| B: 自分のリーチの4つ目が氷結中の空きマスで塞がれたら、火遁(idx31)で隣のコマ（敵優先・無ければ自陣）を燃やして解凍し、同じ手番で完成させる (`unblock=2`) | ✅ **採用** | 対氷室で全8キャラ平均 **+3.2pt**（魔法使い **+10.3±5.5**(n=600) 有意、他は +0.8〜+4.2 でいずれも正方向、n=600）。敵のコマだけに限る `unblock=1` は +0.7pt 平均で効かず（自陣を燃やす手も許すのが効いた）。氷室でない相手（あなた/巨人/魔法使い/ネクロ/陰陽師/毒使い/軍師/雷霆/煉獄の鍛冶師）では氷結空きマスが無く差 0.0 |
| A: 敵の絶対零度が発動待ちのとき、自陣の❄コマを浄化(idx32)で剥がす (`antiGl=1`: 壊れそうなコマ1つ以上 / `=2`: ❄コマ2つ以上) と、浄化が無ければ火遁で壊れそうな❄コマを1つ解凍 (`antiGl=3`) | ❌ 却下 | 全8キャラ ±0.0〜0.7pt（誤差内）。絶対零度が撃たれるのが 0.03 回/試合で、発動待ちの手番に浄化・火遁が手札にある局面がほぼ無く効果が測れない |
| D: 全マス凍結で着手候補が空のとき、スラッシュ/バックスラッシュ/ストンプで氷結を削って打てるようにする (`breakIce`) | ❌ 却下 | 全8キャラ 0.0〜−0.7pt。発生が稀で、通常のチャージでパスする方で十分 |
| 殉火(idx40)を自陣低ライフのコマ1つの犠牲で敵2つ以上に🔥 (`sac=2`) | ❌ 却下 | 全8キャラ −0.7〜+0.3pt（誤差内）。手札に来て条件を満たす局面が稀 |
| 焼畑(idx39)を敵の🌱が1以上/3以上のコマに撃つ (`swidden=1`/`=3`) | ❌ 却下 | 対魔法使い 8キャラ −0.7〜+0.3pt / 0.0pt（誤差内）。AI の🌱は少なく、魔法使いでも手札に来る機会が少ない |
| 火炎トークン/火炎ダブルトークン(idx37/38)を能動策に使う | ❌ 実装せず | 置き場所がランダムなので「リーチの4つ目の隣」「発動待ちの自陣コマ」など狙った解凍に使えない。通常の展開用トークンとしても自陣のコマが🔥で毎ターン削れるため使わない |
| C: 氷結で着手不能になったライン/空きマスの扱い（`inOppReachLine` の脅威判定・評価関数・フォーク探索の残り） | ✅ 修正（A/B不要） | `inOppReachLine` が4つ目の凍った空きマスを脅威に数えていたのを修正。評価関数・`countReaches`・`findThreatSquares` は Phase1 で対応済み |

未検証の候補（試すなら必ず A/B 計測してからログに追記）:
- 対魔法使い: 自駒を審判の十字パターンに密集させない（**破壊を伴わない**ので副作用が小さい見込み）
- 対巨人: 自駒の bind 価値を下げる（bind>0でも殴られるので bind 壁が無力）→ リーチ優先
- 対ネクロ: 「ネクロが既に蘇生分の魔力を持ち、墓地が召喚上限近い」局面**だけ**破壊を1手控える狭い条件（ブランケット禁止ではなく）

##### 氷結・火炎ギミック追随の Phase 1 修正（2026-10-19。A/B 不要の正しさ修正・sim と AIPlayer.ts 両方）
- `countReaches` / `evaluateBoard`: 残り1マスが着手不能（氷結中の空きマス・ライフ>0のロック中の空きマス）なラインをリーチ・ライン評価に入れない（`findThreatSquares` と揃えた）
- スキル対象の価値: 氷結中の敵コマはスキルダメージを❄1つ肩代わりするだけで壊れないので、ストンプ/審判の日/スラッシュ・バックスラッシュ/オピウム(`chooseLocks`)/凶荒の舞/救済中心(`findRescueCenter`)/`simulateStomp` で「効く敵」に数えない。自陣の氷結コマは守られるので損失に数えない
- 電気: 帯電付与/拡散/範囲帯電は氷結中のコマ（隣接⚡のダメージを受けない）と氷結中のマスの⚡（休眠）を対象・巻き込み数に数えない。インジェクションの消滅までの手数は氷結中は自然減衰が無いので毒数だけで数える
- AI 同士の試合が止まらないこと: 絶対零度の直後や氷結空きマスだらけで着手候補が空 → 既存の「打てるマスが無ければチャージでパス」で進むことを確認（2〜6人戦 236 試合・停止 0）

### Phase 1 ループ

1. **Detect**: `auto` 観戦 or チェックリスト照合で弱点を特定
2. **Root cause**: `AIPlayer.ts` / `sim/ai.js` の該当関数を読んで原因特定
3. **Fix**: 最小限の変更を両ファイルに適用
4. **Verify**:
   - `npx tsc --noEmit`
   - `node sim/cli.js auto` で該当シナリオを確認
   - `node sim/cli.js bench --games 1500 --char you --seed 1` で退化チェック
5. **Repeat**: 弱点がなくなるまで (cap ~5 iterations)

**Phase 1 完了条件**: チェックリスト全項目OK かつ `auto` で明らかなミスなし。

---

## Phase 2: 強化 (Strength Optimization)

目標: ベンチマーク勝率を可能な限り上げる。

### ベースライン記録

Phase 2 開始時に必ず現在のスコアを記録:
```bash
node sim/cli.js bench --games 1500 --char you --seed 1
```
主要指標:
- `faithful win-ex-draw vs random` (現在の強さ。目標: できるだけ高く)
- `head-to-head faithful vs capture` (戦略の優位性)

### 強化アプローチ

#### A. 評価関数チューニング
現在の重みを変えてベンチスコアへの影響を測定:

| パラメータ | 現在値 | 調整方向 |
|---|---|---|
| LINE_SCORES | [0, 1, 10, 50, 1000] | 中間値 (10, 50) を上下 |
| Pre-reach penalty | -20 | 上げる→守備的、下げる→攻撃的 |
| Fork bonus | +100 | 上げる→フォーク重視 |
| Capture bonus | +30 | 上げる→奪取重視 |
| Bind stability | ±0.5 | bind の重要度 |
| Buds bonus | ±3 | 🌱の価値 |
| Lock bonus | ±5 | 🔑の価値 |

手順: 1パラメータずつ変更 → bench → スコア上がれば採用、下がれば戻す。

#### B. 探索の改善
- **Minimax depth**: 2 → 3 にして勝率が上がるか試す (性能に注意)
- **Move ordering**: 中央寄り・キャプチャを先に探索して枝刈り効率UP
- **Killer move heuristic**: 前回良かった手を優先探索

#### C. 新しい戦略パターンの追加
`auto` 観戦で「人間なら気づくがAIが見逃す」パターンを探す:
- 2手先のフォーク準備 (直接フォークにならないが次ターンでフォーク確定)
- スキルと配置の組み合わせ最適化 (Token + 最適配置位置の同時評価)
- 盤面の支配領域評価 (中央・角の価値)
- 相手スキル予測 (相手 magic が高い時の警戒)

#### D. スキル戦略の最適化
- スキル使用タイミングの最適化 (序盤 Buds、中盤 Token、終盤 Lock)
- 固有スキル発動条件の微調整
- magic 管理 (温存 vs 即使用のバランス)

### Phase 2 ループ

1. **Baseline**: bench スコアを記録
2. **Hypothesis**: 1つの変更案を立てる (重み調整/探索改善/新戦略)
3. **Apply**: `sim/ai.js` に変更
4. **Measure**: 同じ bench コマンド (同じ seed) で比較
5. **Decide**: スコア上昇 → 採用して `AIPlayer.ts` にもミラー、下降 → リバート
6. **Repeat**: 改善幅が小さくなるまで (cap ~5 iterations)

**Phase 2 完了条件**: 3連続で改善なし、またはイテレーション上限。

---

## 全体フロー

```
Phase 1 (弱点修正)
  └── チェックリスト全OK? → No → Fix → Verify → loop
                           → Yes ↓
Phase 2 (強化)
  └── ベンチスコア記録
  └── パラメータ変更 → bench → 改善? → Yes → 採用 → loop
                                      → No  → リバート → 次の案
  └── 3連続改善なし → 完了
Report (修正内容 + ベンチ推移)
```

---

## Known AI architecture

```
makeMove(board, magic, costs, ...)
  ├── Lock defense     → multi-reach: lock N-1 threats, place on remaining
  ├── chooseSkills()   → pick skills (returns string[])
  │     ├── countReaches() → detect opponent 3-in-a-row threats
  │     ├── character skills (guarded by oppReaches === 0)
  │     ├── turn-ending: opium (block) > slash/backslash/tsunami (losing)
  │     ├── charge (low magic)
  │     ├── preparation: addLife, buds (cost-effective check)
  │     └── tokens: doubleToken > budsToken > token
  ├── executeSkillForAI() → Game.tsx dispatches each chosen skill
  └── getBestMove()    → pick best square
        ├── immediate win check (all valid moves)
        ├── immediate block check (opponent's valid moves incl. captures)
        └── minimax(depth=2) + fork bonus + capture bonus
```

### Key functions to check/improve
- `minimax()` — searches with `getMovesFor()` (empty + bind-0 captures). Depth 2.
- `getBestMove()` — immediate win/block, then minimax scoring
- `getMovesFor()` / `getValidMoves()` — enumerates legal moves
- `evaluateBoard()` — line scoring + bind stability + buds/lock bonuses + pre-reach penalty
- `chooseSkills()` — strategic skill selection with reach awareness, returns string[]
- `simulatePlace()` — board simulation for lookahead (handles capture math)

## Common pitfalls

- **React state batching**: AI skill + move must be sequenced via `pendingAIMove`.
- **getValidMoves vs getMovesFor**: `getValidMoves` includes giant/necro specials;
  `getMovesFor` is generic (used in minimax).
- **Turn-ending skills**: Charge, Opium, Tsunami end the turn — `move` must be null.
- **Giant can attack bind>0**: only giant (and necro during 蘇生) can attack bind>0.
- **pendingAIMove is number[]**: supports multi-step moves (Lock targets + placement).
- **Available skills**: 3 random skill indices (0-15) per turn. Lock is fixed.
  Double/triple lock need indices 12/13 in the random pool.
- **sim/ai.js と AIPlayer.ts は常に同期**: 片方だけ変えると sim と実ゲームで挙動が乖離する。
- **2段階ターゲットスキル (ストンプ / 審判の日)**: 「マス選択」で発動する2段階スキル。
  - ストンプ: `exeStomp` は手番を進めない → 破壊後に通常着手が必要（`AIResult` に `stompTarget` + 追撃 `move` を返す）。
  - 審判の日: `exeJudgeDay` は手番終了 → その対象着手が手番になる（`move` = 対象マス）。
  - sim は `faithfulMakeMove` 内で `SKILLS.x(s)` + `placeMove(target)` を実行、src は `executeSkillForAI` + `pendingAIMove` で配線。範囲マップ(STOMP_AREA/JUDGE_AREA)は両ファイルに複製。
- **AIの起動トリガー**: React版のAI起動 `useEffect` は `currentTurn` を依存に含める。巨人のスキップで `heartTurn` が変わらず同じ側が連続手番になる場合、`heartTurn` だけだと再発火せず固まる。
- **固有スキルの受動運用に注意**: 「撃てるから撃つ」ではなく、特性に合ったタイミング（割引・効果範囲・モード）で撃ち、それを作る布石まで打てているかを Phase 1 #4 で監査する。
