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

この一連を自動で回すスキルが **`/balance-loop`**（`.claude/skills/balance-loop/`）。
バランス調整ノブは **`sim/config.js`**（ライフ平均・std・巨人の手番スキップ）。

キャラ: `you, tactician, magician, giant, yinYangMaster, necromancer`

## ファイル
- `engine.js` — ゲームエンジン（盤面・ライフ・マジック・手番・全スキル）。移植の
  忠実性メモ（`[FAITHFUL]` / `[FIX]`）をコメントで明記。
- `ai.js` — AI。`faithful`=AIPlayer.ts と同一挙動 / `capture`=捕獲も考慮する強化版。
- `cli.js` — `play` / `auto` / `sim` のフロントエンド。
- `BALANCE.md` — 分析結果と所見。

## 既知の移植上の差異
- マジック付与のソースバグ（後手が先手のマジックを参照）は**正しい挙動**で実装。
  詳細は `BALANCE.md` を参照。
