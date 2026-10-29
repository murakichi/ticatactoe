# sim/ — ヘッドレス版（ブラウザ不要のCUI）

本番(`src/`)のゲームを**依存ゼロの素のNode**で動かす。ブラウザ（＝重い/トークン消費）なしで、
ターミナルから**プレイ**でき、**多数対戦の統計バランス分析**ができる。

## 本番との関係（#289: 二重実装の解消）
ルールとAIは `src/components/game/*.ts` を**唯一の実装**にして、sim はその生成物を使う。

| 何を | どこで | sim 側 |
|---|---|---|
| 純粋ロジック（gear / deck / discount / comboCost / lifeBan / darkPot / generic / thermal / charge / tokenSkills / giantAura / giantTurn / decay / lateMagic / skillCosts / boardGeometry / util / **cost**=実コスト / **turn**=手番開始の魔力・増殖・蘇生の定数 / **poison** / **blast**=ストンプ・審判の日 / **shikigami**） | `src/` のTS | `scripts/gen-sim-shared.js` が `sim/shared/*.js`（CommonJS）に変換。**コミットする**。TS を直したら `node scripts/gen-sim-shared.js`（`npm start/build` の前にも自動で走る）。古いと `simShared.test.ts` が落ちる |
| AI本体（`AIPlayer`） | `AIPlayer.ts` | `sim/shared/AIPlayer.js`（上と同じ生成物） |
| AIの1手番の計画（AIに何の状態を渡し、返った結果をどの順に実行するか） | `aiTurn.ts` の `planAITurn` / `resolveMoveCell` | `sim/shared/aiTurn.js`。`Game.tsx` の `runAIMove` も同じ関数を呼ぶ |
| ゲーム進行（手番の切り替え・スキルの支払いと状態の更新・乱数の引き方） | `Game.tsx`（React の state） | `engine.js`（手書きの移植。盤面に効く計算は上の共有関数に出したので、残る二重実装は「状態の持ち方と順序」だけ） |
| 計画の実行 | `Game.tsx`（タイマー付きキュー） | `aiDriver.js`（engine のスキル・着手を同期実行） |

つまり **AIの判断は本番と sim で同一**。sim の結果と本番の差が出るなら、原因は `engine.js` と `Game.tsx` のルールの差だけ。
`aiDriver.js` は本番で止まってしまう状態（手番が進まない計画）を `s.stats.aiStall` に数えてチャージでパスする（本番側は `planAITurn` が最初から手番を終える計画を返す）。

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
- `AIは常に本番のAIそのもの（旧 sim 版AIは #307 で削除。`--mode` は互換のために受け付けるだけ）

### 2. 1試合を観戦（AI対AI）
```bash
node sim/cli.js auto --hchar giant --cchar you --seed 1
```

### 3. バランス分析（バッチ）
```bash
node sim/cli.js sim --games 2000                          # 全キャラ総当たり（本番AI）
node sim/cli.js sim --games 3000 --pair giant,you         # 特定マッチアップ
```
`--seed` で再現可能（mulberry32 のシード固定）。

### 3b. 常駐対戦（watch）
```bash
node sim/cli.js watch                          # 2人戦。Ctrl-C か勝率が収束するまで対戦し続ける
node sim/cli.js watch --players 4 --matrix     # 対面別勝率の表も常時表示
node sim/cli.js watch --forever --log w.jsonl  # 自動停止なし。停止時の統計をJSONで追記
node sim/cli.js watch --jobs 2               # 並列数（既定=コア数。worker_threads）
node sim/cli.js watch --no-gear                # ギアなし（--no-skill でスキルを使わず置くだけ）
```
1対1は全キャラの組(席順つき)を線形に1周して繰り返す（ランダムに引かない。先手・後手が同数で、全組の試合数が揃う）。3人以上はランダム。計算は `--jobs`（既定=コア数）の worker_threads で分担し、ゲーム番号 g の結果は g だけで決まるので並列数を変えても結果は同じ。
既定は**本番のAI席と同じ装備**（推奨デッキから3枚入れ替え＋推奨ギア/別案）。`--no-gear` / `--no-skill` で外せる（画面ではチェックボックス）。
キャラ別勝率(±95%)・席別勝率・**対面別勝率**（行が列に勝つ割合。多人数では同卓した試合のうち
どちらかが勝った試合で按分）を1秒ごとに更新。収束判定は「直近 `--window`(10) 回の
スナップショット(`--checkpoint` 200局ごと)で全キャラの勝率の動きが `--eps`(0.5pt) 以内」かつ
`--min-games`(2000) 以上。`--max N` で局数上限。停止時（Ctrl-C含む）は必ず最終統計と対面表を出す。

**ブラウザ版**: セットアップ画面の「📊 シミュレーション」から同じ集計を画面で見られる（ユーザーの端末の Web Worker で動く。
`public/simWorker.js`（計算だけ。端末のコア数-1 個を並列に立てる）が `sim/compute.js` 経由で `sim/` のモジュールを読み、集計・分析は画面側が `public/sim/live.js` を読み込んで行う。`npm start` / `npm run build` の前に `scripts/copy-sim.js` が
`compute.js` / `live.js` から辿れる `sim/*.js` を `public/sim/` にコピーする（git管理外）。sim のエンジンを直せば
CLI と画面の両方に反映される。`sim/` に Node 専用 API（fs 等）を足すとブラウザ版が壊れるので注意。

### 4. 改善ループ用の計測
```bash
node sim/cli.js metrics --games 800 --seed 1              # バランス指標をJSON出力
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
- ライフ減衰は3人以上で「手番1周ごとに1回」（issue #30。本番の `decay.ts` の規則をそのまま使う）。
  A/B は環境変数で: `DECAY_PER_ROUND_MIN_PLAYERS=99 node sim/cli.js sim --players 4`（全人数で着手ごと）
- 50ターンごとに手番開始時の魔力が全員+1ずつ増える（2人戦も対象）（本番の `lateMagic.ts` の規則をそのまま使う）。
  A/B は `LATE_MAGIC_INTERVAL=0 node sim/cli.js sim --players 4`（無効化）
- 速度の目安: 旧AIは 3人戦で約0.35秒/試合、8人戦で約5秒/試合（深さを 3/2/1 に落としている）
- 2人戦の結果は多人数対応の前後で（同じseedなら）完全に一致する
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
node sim/probe-gear.js 500 1 baseline,sturdy,ironLock   # 2人戦・本番AI・キャラ毎試合ランダム。1ギア=1行のJSON
node sim/gear.test.js                                   # ギアの単体テスト
```
片方の席だけにギアを1つ持たせ、先手/後手を半々にして、装備側の勝率（引き分け除く）を出す。`baseline` は
同じ条件で何も付けない対照群（0.5付近が出るはず）。1ギアあたり500試合で標準誤差は約±2pt。4コアなら
ギアを分けて並列に走らせる。ギアの定義は `src/components/game/gear.ts`（`sim/shared/gear.js` はその生成物）。`newGame({ chars, gears })` の `gears[seat]` にギアIDの配列を渡す。

## ファイル
- `engine.js` — ゲームエンジン（盤面・ライフ・マジック・手番・全スキル）。移植の
  忠実性メモ（`[FAITHFUL]` / `[FIX]`）をコメントで明記。
- `shared/` — 本番のTSから生成した純粋ロジックとAI（手で編集しない。上の表）。
- `aiDriver.js` — 本番AIを engine で動かす（`playTurn` / `makeMove`）。probe-*.js / duel.js も同じ `aiDriver.js` を使う。
- `cli.js` — `play` / `auto` / `sim` のフロントエンド。
- `BALANCE.md` — 分析結果と所見。

## 既知の移植上の差異
- マジック付与のソースバグ（後手が先手のマジックを参照）は**正しい挙動**で実装。
  詳細は `BALANCE.md` を参照。

## AI の paired A/B（ai-improve）

- `node sim/probe-usage.js --chars A,B --games N [--size N] [--flags k=v]` — スキルの使用回数/試合と、使った試合の勝率
- AIの調整ノブは無い。AIを変えるときは `AIPlayer.ts` を直接直し、改修前後を同一シードで `probe-top.js` などに回して比べる

## 環境トップのチューニング（tune-top）
```bash
node sim/probe-top.js --rank --games 60 --seed 1                       # 全キャラ総当たりの環境順位
node sim/probe-top.js --target pyromancer --scan gears --games 60      # ギア近傍の探索（--scan deck も可）
```
対象キャラにだけ候補のデッキ/ギア/AIフラグを与え、他キャラは推奨設定のまま「環境勝率」を測る。詳細は `.claude/skills/tune-top/SKILL.md`（`/loop` から回す）。
デッキのシナジー探索: `node sim/probe-top.js --target X --scan deck --swap 3 --cat ice --neighbors 40`（`--swap` で同時に入れ替える枚数、`--cat` で入れる札のカテゴリを限る）。
`--oppGears none|random|lastStand` で相手のギアを無し/ランダム/全員土壇場の防壁(1枠目)にして頑健性を測れる（tune-top の完了判定で使う。lastStand は防壁発動後の立ち回りの検証用）。
札・ギアの寄与と未使用の確認: `node sim/probe-top.js --target X --scan audit --games 60 --opp you,giant`、使用回数は `node sim/probe-usage.js --chars X,you --deck ... --gears ...`。
