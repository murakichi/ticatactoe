# 内蔵AI同士を対戦させる手順（Claude 用ランブック）

このゲームの内蔵AI（`src/components/game/AIPlayer.ts` を忠実移植したもの）同士を、
**ブラウザを使わず**ターミナルから対戦させる方法。Playwright は重く・トークンを
消費するので使わない。すべて `sim/`（依存ゼロの素のNode）で完結する。

前提: Node が使えること（`npm install` 不要）。作業ディレクトリは `e:\src\ticatactoe`。

---

## A. 1試合だけ観戦する（手順が見える）

```bash
node sim/cli.js auto --hchar <💙のキャラ> --cchar <⭕のキャラ> --seed <数値> --mode <faithful|capture>
```

例:
```bash
node sim/cli.js auto --hchar giant --cchar you --seed 1
```

- 各ターンの着手（`turn N: 💙 -> 5`）と、最終盤面・勝敗を表示する。
- `--seed` を固定すれば**完全に同じ試合**を再現できる。
- 省略時の既定: `--hchar you --cchar you --seed 1 --mode faithful`。

盤面の見方: `5:💙 6` = マス5に💙、bind（ライフ）6。`・` は空きマス。

---

## B. 多数試合を回して統計を取る（バランス分析）

```bash
# 全6キャラの総当たり（先手💙 × 後手⭕ の36通り）
node sim/cli.js sim --games <試行数/組> --mode <faithful|capture> --seed <数値>

# 特定の1マッチアップだけ
node sim/cli.js sim --games <試行数> --pair <💙キャラ>,<⭕キャラ> --seed <数値>
```

例:
```bash
node sim/cli.js sim --games 2000 --mode faithful          # 総当たり
node sim/cli.js sim --games 3000 --pair giant,you         # giant先手 vs you後手
```

出力に含まれるもの:
- 先手/後手/引き分けの全体勝率と平均ターン数
- キャラ別勝率（先手時・後手時・総合、引き分けは除外）
- `--pair` 指定時はそのマッチアップ1行のみ

---

## パラメータ早見表

| フラグ | 意味 | 既定 |
|---|---|---|
| `--hchar` / `--cchar` | 💙 / ⭕ のキャラ（auto用） | `you` |
| `--pair h,c` | 1マッチアップ指定（sim用） | なし=総当たり |
| `--games N` | 1組あたりの試行数（sim用） | `500` |
| `--seed N` | 乱数シード（再現用, mulberry32） | `1` |
| `--mode` | AIの賢さ（下記） | `faithful`(sim/auto) |

キャラ一覧: `you, tactician, magician, giant, yinYangMaster, necromancer`

---

## `--mode` の違い（重要）

- **`faithful`** … 実装（`AIPlayer.ts`）と**完全に同一**のAI。
  - 着手は「勝てる空きマス → 相手の勝ちをブロックする空きマス → ランダム空きマス」。
  - スキルは**マジックを消費するだけで効果を発動しない**（実ゲームのバグを再現）。
  - 占有マスの**捕獲は一切しない**。
  - → 実ゲームの挙動を測りたいときはこれ。
- **`capture`** … 上記に加え「捕獲で勝てる/ブロックできる手」も探索する強化版。
  - 「AIがもう少し賢かったら」を見る実験用。実ゲームの挙動ではない。

---

## 結果を解釈するときの注意

- AIは弱い（スキル無効・捕獲しない）ため、**人間同士の理論バランスとは別物**。
  あくまで「内蔵AI同士」の傾向を測る。
- 引き分けが非常に多い（faithfulで約7割）。勝率は通常 `wins/(wins+losses)`（引き分け除外）。
- 詳しい所見・既知バグは `sim/BALANCE.md` を参照。

---

## 典型的な使い方の流れ（Claude向け）

1. まず `auto` で1試合観戦し、挙動が想定どおりか目視確認。
2. `sim --games 2000` で総当たりを取り、外れ値キャラ（例: giant）を特定。
3. 気になる組は `--pair` で試行数を増やして精度を上げる。
4. `--mode capture` と比較し、AIの賢さで結果がどう変わるか確認。
5. 所見は `sim/BALANCE.md` に追記する。
