# sim/ — ヘッドレス版（ブラウザ不要のCUI）

`src/components/game/Game.tsx` + `util.ts` のゲームロジックを**依存ゼロの素のNode**へ
忠実移植したもの。ブラウザ（＝重い/トークン消費）なしで、ターミナルから
**プレイ**でき、**多数対戦の統計バランス分析**ができる。

## 必要環境
Node のみ（npm install 不要）。

## 使い方

### 1. 自分でプレイ（対AI）
```bash
node sim/cli.js play --me 💙 --mychar you --aichar giant
```
- マス番号 `0`〜`15` を入力して着手
- `skill <名前> [idx]` でスキル使用（例 `skill token`、`skill lock` の後にマス指定）
- `help` でスキル一覧、`quit` で終了
- `--mode capture`（既定）でAIは捕獲手も考慮 / `--mode faithful` で実装通りの弱いAI

### 2. 1試合を観戦（AI対AI）
```bash
node sim/cli.js auto --hchar giant --cchar you --seed 1
```

### 3. バランス分析（バッチ）
```bash
node sim/cli.js sim --games 2000 --mode faithful          # 全6キャラ総当たり
node sim/cli.js sim --games 3000 --pair giant,you         # 特定マッチアップ
node sim/cli.js sim --games 2000 --mode capture           # 捕獲考慮AIで比較
```
`--seed` で再現可能（mulberry32 のシード固定）。

### 4. 改善ループ用の計測
```bash
node sim/cli.js metrics --games 800 --mode faithful --seed 1   # バランス指標をJSON出力
node sim/cli.js metrics --games 800 --tag baseline --log sim/iterations.jsonl  # 比較用に追記
node sim/cli.js bench   --games 1500 --char you --seed 1       # AIの強さ(対random/直接対決)
```
`metrics` の主な値: `drawRate` / `firstAdvantage` / `nonGiantSpread`（非giantキャラの
均衡度, 0=横並び）/ `giantGap`（giantの弱さ）/ `charWinRate`。

### 5. 増殖ループの終息テスト
```bash
node sim/probe-proliferate.js 60      # n=60/側。約5分
```
増殖は AI の発動率が1手番あたり約4%しかなく**勝率にシグナルが乗らない**。
「ループが終息するか」を見たいときは勝率ではなくこちらを使う（強制発動させて
ループ到達回数の分布を直接測る統制実験）。`cap到達% = 0` なら暴走していない。

### 6. 多人数（2〜8人・盤面 4x4〜7x7）
```bash
node sim/cli.js sim     --players 4 --games 300                 # 席別・キャラ別の勝率（キャラはゲームごとにランダム）
node sim/cli.js sim     --players 3 --chars you,giant,poisoner  # 席のキャラを固定
node sim/cli.js metrics --players 6 --games 300 --seed 1        # 同じ内容をJSONで（--log で追記）
node sim/cli.js auto    --chars you,giant,poisoner --seed 1     # 1試合を観戦
```
- 盤面は既定では人数で決まる（2=4x4 / 3〜4=5x5 / 5〜6=6x6 / 7〜8=7x7）。`--size N`（4〜10）で人数と無関係に指定できる（sim/metrics/auto）。勝利は全サイズで4連続
- 席0が先手。**均等なら各席 1/人数**。席別勝率で先手有利、キャラ別勝率（出場1回あたり）でキャラ間の差を見る
- ライフ減衰は3人以上で「手番1周ごとに1回」（issue #30。`config.js` の `decayPerRoundMinPlayers`）。
  A/B は環境変数で: `DECAY_PER_ROUND_MIN_PLAYERS=99 node sim/cli.js sim --players 4`（全人数で着手ごと）
- 50ターンごとに手番開始時の魔力が全員+1ずつ増える（2人戦も対象）（`config.js` の `lateGameMagicInterval` / `lateGameMagicMinPlayers`）。
  A/B は `LATE_MAGIC_INTERVAL=0 node sim/cli.js sim --players 4`（無効化）
- 速度の目安: faithful AI は 3人戦で約0.35秒/試合、8人戦で約5秒/試合（深さを 3/2/1 に落としている）
- 2人戦の結果は多人数対応の前後で（同じseedなら）完全に一致する（capture/faithful とも確認済み）
- `engine.js` の状態は席ごとの配列（`s.chars` / `s.magic` / …、手番は `s.turn`）。2人戦の旧名
  （`s.heartMagic` / `s.circleChar` / `s.heartTurn` など）は getter/setter の別名で残してあり、既存のテストやスクリプトはそのまま動く
- `play`（対人CLI）は2人専用のまま

### 6. 帯電（雷霆の巫）の機構指標
```bash
node sim/probe-charge.js 120 5        # 雷霆の巫 vs 各キャラの勝率・発火回数・帯電系スキルの使用回数/試合（2人戦）
```
勝率だけでは「⚡が効いているか」が分からないので、発火回数・両者の被ダメージ・⚡が盤上にある手番の割合を
直接出す。A/B検証用に環境変数 `CHG_FIRE_W`（発火の重み）/ `CHG_ONE_MIN`（帯電付与の閾値）/
`SIM_POOL_SIZE`（プールの大きさ）/ `SIM_CHARS`（2人戦 metrics の対象キャラ）が使える。
雷霆の巫のライフ平均は `config.js` の `lifeMeans.electrician`、帯電系のコストは `charge` ノブ。

この一連を自動で回すスキルが **`/balance-loop`**（`.claude/skills/balance-loop/`）。
バランス調整ノブは **`sim/config.js`**（ライフ平均・std・巨人の手番スキップ・増殖の
`cost`/`tokenLife`/`upkeepStep`/`maxStacks`）。増殖のノブを変えたら
`src/components/game/skillCosts.ts` と `Game.tsx` の定数も同じ値に合わせること。

キャラ: `you, tactician, magician, giant, yinYangMaster, necromancer, poisoner, electrician`（electrician = 雷霆の巫）

### 7. ギア（キャラ選択時に装備する追加パッシブ）の強さ
```bash
node sim/probe-gear.js 500 1 baseline,sturdy,ironLock   # 2人戦・faithful AI・キャラ毎試合ランダム。1ギア=1行のJSON
node sim/gear.test.js                                   # ギアの単体テスト
```
片方の席だけにギアを1つ持たせ、先手/後手を半々にして、装備側の勝率（引き分け除く）を出す。`baseline` は
同じ条件で何も付けない対照群（0.5付近が出るはず）。1ギアあたり500試合で標準誤差は約±2pt。4コアなら
ギアを分けて並列に走らせる。ギアの定義は `gear.js`（`src/components/game/gear.ts` の複製。
`gear.test.ts` が一致を確認する）。`newGame({ chars, gears })` の `gears[seat]` にギアIDの配列を渡す。

## ファイル
- `engine.js` — ゲームエンジン（盤面・ライフ・マジック・手番・全スキル）。移植の
  忠実性メモ（`[FAITHFUL]` / `[FIX]`）をコメントで明記。
- `geometry.js` — 盤面ジオメトリ（勝利ライン・ストンプ/審判の範囲・対角）。`src/components/game/boardGeometry.ts` の複製で、
  一致は jest（`boardGeometry.test.ts`）が 4〜7 の全サイズで検証する。
- `ai.js` — AI。`faithful`=AIPlayer.ts と同一挙動 / `capture`=捕獲も考慮する強化版。
- `cli.js` — `play` / `auto` / `sim` のフロントエンド。
- `BALANCE.md` — 分析結果と所見。

## 既知の移植上の差異
- マジック付与のソースバグ（後手が先手のマジックを参照）は**正しい挙動**で実装。
  詳細は `BALANCE.md` を参照。

## AI の paired A/B（ai-improve）

- `node sim/probe-ai.js --mode vs|h2h --chars A,B --games N --seed S --flagsA k=v [--modB ai.old.js]  # ai.old.js は git show <旧コミット>:sim/ai.js > sim/ai.old.js で作る` — 同一シード・席入れ替えで AI 設定を比較（結果は `RESULT {json}` 行。`| node sim/probe-sum.js` で勝率と 95%CI に集計）
- `node sim/probe-usage.js --chars A,B --games N [--size N] [--flags k=v]` — スキルの使用回数/試合と、使った試合の勝率
- `sim/ai.js` の `AI_DEFAULTS`（採用済み）と `F.xxx`（検証用ノブ。`s.aiFlags[seat]` で席ごとに上書き）

## 環境トップのチューニング（tune-top）
```bash
node sim/probe-top.js --rank --games 60 --seed 1                       # 全キャラ総当たりの環境順位
node sim/probe-top.js --target pyromancer --scan gears --games 60      # ギア近傍の探索（--scan deck も可）
```
対象キャラにだけ候補のデッキ/ギア/AIフラグを与え、他キャラは推奨設定のまま「環境勝率」を測る。詳細は `.claude/skills/tune-top/SKILL.md`（`/loop` から回す）。
デッキのシナジー探索: `node sim/probe-top.js --target X --scan deck --swap 3 --cat ice --neighbors 40`（`--swap` で同時に入れ替える枚数、`--cat` で入れる札のカテゴリを限る）。
`--oppGears none|random` で相手のギアを無し/ランダムにして頑健性を測れる（tune-top の完了判定で使う）。
札・ギアの寄与と未使用の確認: `node sim/probe-top.js --target X --scan audit --games 60 --opp you,giant`、使用回数は `node sim/probe-usage.js --chars X,you --deck ... --gears ...`。
