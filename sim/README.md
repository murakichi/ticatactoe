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
- 盤面は人数で決まる（2=4x4 / 3〜4=5x5 / 5〜6=6x6 / 7〜8=7x7）。勝利は全サイズで4連続
- 席0が先手。**均等なら各席 1/人数**。席別勝率で先手有利、キャラ別勝率（出場1回あたり）でキャラ間の差を見る
- ライフ減衰は3人以上で「手番1周ごとに1回」（issue #30。`config.js` の `decayPerRoundMinPlayers`）。
  A/B は環境変数で: `DECAY_PER_ROUND_MIN_PLAYERS=99 node sim/cli.js sim --players 4`（全人数で着手ごと）
- 速度の目安: faithful AI は 3人戦で約0.35秒/試合、8人戦で約5秒/試合（深さを 3/2/1 に落としている）
- 2人戦の結果は多人数対応の前後で（同じseedなら）完全に一致する（capture/faithful とも確認済み）
- `engine.js` の状態は席ごとの配列（`s.chars` / `s.magic` / …、手番は `s.turn`）。2人戦の旧名
  （`s.heartMagic` / `s.circleChar` / `s.heartTurn` など）は getter/setter の別名で残してあり、既存のテストやスクリプトはそのまま動く
- `play`（対人CLI）は2人専用のまま

この一連を自動で回すスキルが **`/balance-loop`**（`.claude/skills/balance-loop/`）。
バランス調整ノブは **`sim/config.js`**（ライフ平均・std・巨人の手番スキップ・増殖の
`cost`/`tokenLife`/`upkeepStep`/`maxStacks`）。増殖のノブを変えたら
`src/components/game/skillCosts.ts` と `Game.tsx` の定数も同じ値に合わせること。

キャラ: `you, tactician, magician, giant, yinYangMaster, necromancer, poisoner`

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
