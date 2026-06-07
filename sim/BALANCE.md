# バランス分析レポート

ヘッドレスエンジン（`sim/engine.js`, 実ゲームロジックの忠実移植）で AI 対 AI を多数試行した結果と、
ソース精読で判明した構造的バランス問題。

実行例:
```
node sim/cli.js sim --games 2000 --mode faithful   # 全6キャラ総当たり
node sim/cli.js sim --games 3000 --pair giant,you  # 特定マッチアップ
node sim/cli.js auto --hchar giant --cchar you      # 1試合を観戦
```

## 定量結果（faithful AI = 実装の AIPlayer.ts と同一挙動 / 2000試合/組）

### 先手・後手
| | 勝率 |
|---|---|
| 先手 💙 | 15.6% |
| 後手 ⭕ | 12.9% |
| 引き分け | **71.5%** |

- **引き分けが約7割**。勝ち/ブロックだけの AI と 4x4・4目並べでは決着が付きにくい。
- 先手有利は +約3pt（小さいが一貫）。

### キャラ別勝率（引き分け除外, wins/(wins+losses)）
| キャラ | 先手 | 後手 | 総合 |
|---|---|---|---|
| you | 91.8% | 82.9% | 87.5% |
| tactician（軍師） | 91.0% | 82.4% | 86.9% |
| magician（魔法使い） | 90.6% | 82.1% | 86.6% |
| **giant（巨人）** | **0.8%** | **0.3%** | **0.6%** |
| yinYangMaster（陰陽師） | 91.2% | 82.6% | 87.1% |
| necromancer | 91.2% | 82.9% | 87.2% |

- **giant 以外は統計的に同一**（87%前後、誤差範囲）。
- 非giant同士の直接対決は約95%が引き分け（例: you vs you=94.7%、tactician vs magician=93.6%）。
  → 高い総合勝率はすべて「giantを一方的に倒す」ことに由来。
- **giant は対AIで勝率ほぼ0%**（giant vs you 3000試合: giantの勝ち **0.0%**）。

## 根本原因（ソース精読で判明）

1. **AIのスキルが完全な無効動作**
   `AIPlayer.useSkill` は `skillCallback` を呼ぶが、Game.tsx 側の
   `useSkillForHeart/Circle` は `setMagic(prev - cost)` するだけで、スキル本体
   （`onClickToken` 等）を一切実行しない。→ AIは「マジックを捨てるだけ」。
   このため**キャラ固有スキルが対AIでまったく機能せず、キャラ差が消える**。

2. **巨人の手番スキップが一方的不利**
   `judgeNextIsHeart` の giant 分岐で巨人は約2手に1手しか打てない。
   ライフ3倍（=bind）は、AIが**捕獲手を選ばない**ため活きない
   （`getBestMove` は空きマスのみ対象）。手数だけ減って負ける。

3. **bind が 0 になっても記号が残る（駒の永続化）**
   decay処理 (`onCellClick`) は bind を減らすが player は消さない。勝利判定は
   記号のみ。→ ライフ/bind は AI 戦の勝敗にほぼ無関係。素の4目並べ化。

4. **マジック付与のバグ**（`Game.tsx:102`）
   後手（円）の次マジックを `heartMagic` と heart の buds から計算している
   （`nextMagic = heartMagic + 1 + budsCount('💙')`）。後手のマジックが先手の
   状態に依存する。本エンジンは正しい挙動（各プレイヤー自身の値）で実装し、
   ここで明示。

5. **未実装スキル**: `onClickNecromancy` / `onClickUnlock` は空関数。
   ネクロマンサーの蘇生はUI上存在するが効果なし。

## 改善提案（バランス調整の方向性）

- **AIにスキルを実行させる**: `useSkillCallback` に実スキル関数を渡す（最優先。
  これだけでキャラ差が初めて意味を持つ）。
- **AIに捕獲手を評価させる**: `getBestMove` で占有マスの捕獲による勝ち/ブロック
  も探索（`--mode capture` で実験可能。giant勝率 0.6%→11.5% に改善）。
- **巨人**: 手番スキップが重すぎる。ライフ3倍を活かす捕獲AI前提に再調整、
  またはスキップ頻度を緩和。
- **引き分け過多**: 先手有利を強める/盤面を変える、または bind 0 の駒を
  「弱体化（捕獲容易）」扱いにして終盤の決着性を上げる。

## 改善ループ Phase 1（旧AI・capture モード）

最大の問題 `giantGap`（巨人だけ極端に弱い）を対象に、`capture` モードで反復。

| tag | giantGap | nonGiantSpread | drawRate | 判定 |
|---|---|---|---|---|
| baseline-faithful | +0.864 | 0.016 | 0.715 | 基準 |
| baseline-capture | +0.762 | 0.016 | 0.730 | 基準 |
| iter1: giantSkips=false, life11 | **−0.733** | 0.024 | 0.752 | 行き過ぎ(巨人が圧倒) |
| iter2: giantSkips=false, life6 | −0.666 | 0.035 | 0.810 | まだ巨人優位 |
| iter3: giantSkips=false, life5 | −0.638 | 0.040 | 0.830 | まだ巨人優位 |

**結論**: 数値ノブだけでは巨人のバランスは収束しない。AIスキル実装 + `judgeNextIsHeart` の改修が必要。

## 改善ループ Phase 2（強化AI・faithful モード, 800試合）

AI強化後: minimax(depth 2), 評価関数, スキル実行ディスパッチャー実装済み。
引き分け率 71%→0.01% に激減、ゲームが決着するようになった。

| tag | giantWin% | giantGap | firstAdv | nonGiantSpread | drawRate | 変更 |
|---|---|---|---|---|---|---|
| enhanced-ai | 19.5% | +0.367 | 0.089 | 0.288 | 0.0001 | AI強化（基準） |
| iter1-noSkip | 87.2% | −0.446 | 0.063 | 0.276 | 0.0001 | 巨人スキップなし, life11 |
| iter4-noSkip-life5 | 68.3% | −0.219 | 0.072 | 0.307 | 0.0001 | 巨人スキップなし, life5 |
| iter5-skip-life16 | 22.3% | +0.332 | 0.096 | 0.292 | 0.0015 | 元スキップ, life16 |
| iter6-mod4 | 8.4% | +0.499 | 0.061 | 0.260 | 0.0001 | giantSkipModulo=4（バグ: 逆効果） |
| **iter7-mod5-life8** | **51.1%** | **−0.014** | **0.136** | **0.318** | **0.0001** | **mod=5, life8, ロジック修正** |

### iter7 結果（最終採用）
`giantSkipModulo: 5` + `giant life mean: 8` + modulo ロジック修正:
```javascript
// 旧: 2条件で判定 → modulo値が変わると比率が崩壊
// 新: currentTurn % mod < mod - 1 → allow, else → skip
if (s.currentTurn % mod < mod - 1) return !s.heartTurn;
return s.heartTurn;
```
mod=5 で巨人は5手中4手プレイ（80%の頻度）。mod=3（元）は3手中2手（67%）。

### ターゲット達成状況
| metric | 値 | target | 判定 |
|---|---|---|---|
| giantGap | −0.014 | ±0.10 | **PASS** |
| drawRate | 0.0001 | ≤0.55 | **PASS** |
| firstAdvantage | 0.136 | ≤0.05 | **FAIL** |
| nonGiantSpread | 0.318 | 0.03–0.15 | **FAIL** |

### 残課題
1. **firstAdvantage (0.136)**: 4x4盤で先手が構造的に有利。先手/後手のマジック差（+1など）
   で補償可能だが、ゲームデザインの変更に踏み込む。
2. **nonGiantSpread (0.318)**: tactician(66.5%) vs necromancer(34.7%)。
   軍師のトークンスキルが安く（-2修正）高頻度で使えるのが主因。
   skillCosts調整またはAIのスキル評価重みで改善可能。
3. **キャラ別勝率** (iter7):
   - tactician: 66.5%（最強、トークンスキルのコスト修正が強力）
   - magician: 56.4%
   - yinYangMaster: 54.7%
   - giant: 51.1%（バランス済み）
   - you: 36.6%
   - necromancer: 34.7%（最弱、蘇生スキルの効果が薄い）

## src/ への反映対象
- `sim/engine.js` `judgeNextIsHeart` → `src/components/game/Game.tsx` の同関数
- `sim/config.js` `giantSkipModulo: 5`, `giant life: 8` → `Game.tsx` + `src/util.ts`
- `sim/ai.js` 強化AI → `src/components/game/AIPlayer.ts`（実装済み）

## 注意
本分析は **強化AI（minimax depth 2 + スキル実行）** に基づく。
人間同士のバランスは異なる可能性がある。`node sim/cli.js play` で検証可能。

---

## 改善ループ Phase 3（固有スキル全実装 + 大型リワーク後, faithful 400試合 n=14400）

この間に大きく前進：全キャラが固有スキルを使用（巨人ストンプ/魔法使い審判の日も実装）、
AIが捕獲・スキル枠ロック・テンポ(レース)強化を獲得、ネクロマンサー蘇生を「墓地→召喚」で実装、
魔法使いを「バッズ1個=魔力+3＋バッズ駒ロック」で強化、後手マジックバグ修正。
詳細な採用/却下ログは `.claude/skills/ai-improve/SKILL.md`。

### baseline（postAI-race: 全リワーク+レース強化採用後）
| metric | 値 | target | 判定 |
|---|---|---|---|
| AI強度(対random win-ex-draw) | 100% | ≥0.90 | PASS |
| drawRate | 0.001 | ≤0.55 | PASS |
| giantGap | −0.151 | ±0.10 | FAIL（巨人が強すぎ） |
| nonGiantSpread | 0.364 | 0.03–0.15 | FAIL |
| firstAdvantage | 0.160 | ≤0.05 | FAIL（レース強化の副作用で増） |

キャラ別: 軍師0.662 / 巨人0.626 / 魔法0.493 / 陰陽0.492 / ネクロ0.430 / あなた0.298

### 反復（ユーザー選択: 強すぎる軍師/巨人をナーフ）
| tag | 軍師 | 巨人 | giantGap | spread | 判定 |
|---|---|---|---|---|---|
| postAI-race（基準） | 0.662 | 0.626 | −0.151 | 0.364 | — |
| iter1: 軍師life6→5, 巨人life8→7 | 0.637 | 0.557 | **−0.068** | 0.323 | 採用（giantGap達成） |
| **iter2: 軍師トークン割引 -2→-1** | **0.502** | 0.573 | −0.088 | **0.227** | **採用** |

### iter2 後の最終
キャラ別: 巨人0.573 / 陰陽0.563 / 魔法0.549 / 軍師0.502 / ネクロ0.476 / あなた0.337
- **軍師・巨人を中位へ収束**（0.66/0.63 → 0.50/0.57）。giantGap −0.088（PASS）。
- **あなた以外は 0.476–0.573 の0.10幅**。残る spread(0.227) は事実上「あなた(無特性)が低い」だけ。

### 残課題（ユーザー未選択）
1. **あなた 0.337**: 固有スキルが無く構造的に最弱。ライフ強化 or 軽い特性付与で底上げ可能。
2. **firstAdvantage 0.167**: レース強化(フォーク+200/シングルリーチ+40)の副作用で +0.05。
   フェアネス優先なら シングルリーチ+40→+20 等で緩和できる（AI強度の利得は一部失う）。

### src/ 反映済み
`sim/config.js` lifeMeans(軍師5, 巨人7) → `src/util.ts`、軍師トークン割引-1 →
`Game.tsx calculateCost` + `AIPlayer.ts calculateAICost`。型チェック通過。
