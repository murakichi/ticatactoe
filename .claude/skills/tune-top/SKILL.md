---
name: tune-top
description: 指定したキャラを「環境トップ」(全キャラ総当たりの環境勝率1位)にするまで、ギア・デッキ・AIの立ち回りを1イテレーション1仮説でチューニングする。`/loop` や goal から回す前提(状態はファイルに残る)。どうしても上がらないときは改善案を issue に起票して止まる。「このキャラを強くしたい/トップにしたい」「推奨デッキ・ギアを詰めたい」ときに使う。
---

# tune-top

対象キャラ **`<char>`** を環境トップにするループ。**1回の呼び出し = 1イテレーション**(1仮説を測って採用/撤回→記録)。
`/loop 30m /tune-top pyromancer` や goal から繰り返し呼ばれる想定なので、**状態は必ず `docs/tune/<char>.md` に書き、毎回そこから再開する**。会話の記憶に頼らない。

## 用語

- **環境** = 全キャラが推奨デッキ・推奨ギア・既定AIで戦う状態(本番のAIと同じ)。
- **環境勝率(field)** = 対象が他の全キャラに勝つ率の単純平均(引き分け除く・席交互)。
- **トップ** = `--rank` の1位、かつ **2位との差 ≥ 2pt**(最終確認は `--games 200` 以上)。

## 道具(`sim/probe-top.js`。ブラウザ不要、コア数で並列)

```bash
node sim/probe-top.js --rank --games 60 --seed 1                      # 現在の環境順位表(10キャラ総当たり)
node sim/probe-top.js --target <char> --games 100 --seed 1            # 対象の環境勝率と対キャラ別
node sim/probe-top.js --target <char> --scan gears --games 60         # ギア1枠差し替えの近傍を全部測る
node sim/probe-top.js --target <char> --scan deck --neighbors 30 --games 60   # デッキ1枚差し替えをランダムにN個
node sim/probe-top.js --target <char> --gears a,b --deck 0,3,... --flags k=v --modA ai.new.js   # 候補を直接測る
node sim/probe-top.js --rank --target <char> --gears a,b --games 200  # 候補を環境に反映した順位(最終確認)
```
共通: `--size N`(既定4)、`--envDeck varied`(相手が本番どおり推奨から3枚入れ替えのデッキ。**最終確認で必ず1回**)、`--opp a,b`。
目安: 2人戦1試合≈0.3秒。`--target` 1設定 ×100試合 ≈ 数十秒〜1分、`--rank --games 60` ≈ 数分。
ギアは `sim/gear.js`(`GEAR_IDS`)、デッキは `sim/deck.js`(`SKILL_CATALOG` の idx 0..61)、AIの検証用ノブは `sim/ai.js` の `AI_DEFAULTS`/`F.xxx` と `probe-ai.js`/`probe-usage.js`(ai-improve 参照)。

## 状態ファイル `docs/tune/<char>.md`

無ければ作る。次の見出しを保つ(毎回読んで更新):

```
# tune-top: <char>
- 目標: 環境1位 & 2位と +2pt 以上
- 最後に検証したmaster: <sha>
- 現在の推奨設定: gears=[..] deck=[..] AIフラグ=..
- 基準線: 環境勝率 xx.x% / 順位 n位 / 1位 <char> yy.y%   (seed, games を併記)
- 連続不採用回数: n   (採用が出たら0に戻す)
- 状態: running | done | blocked(issue #N)
## 試行ログ(新しい順。却下も必ず残す。同じ案を再試行しない)
| # | 軸 | 仮説 | 結果(field Δ±95%CI) | 採否 |
## 次に試す候補(軸の順 gear → deck → strategy を巡回)
```

## 1イテレーションの手順

1. **読む**: まず `docs/tune/LEARNINGS.md`(全キャラ共通の知見。無ければ作る)、次に `docs/tune/<char>.md`(無ければ作成し、`--rank --games 60 --seed 1` で基準線を記録)。`状態: blocked` なら **何もせず「停止中」と報告して終了**(loop を止めるよう伝える)。`状態: done` なら **手順8(再検証)** を行う。
2. **完了判定**: 直近の採用後に `--rank --games 200 --seed 3` と `--envDeck varied` の両方で「1位かつ2位との差 ≥ 2pt」→ 手順7へ。
3. **軸を1つ選ぶ**(ログの巡回順で、まだ近傍を測っていない軸):
   - **gear**: `--scan gears` で近傍(1枠差し替え)を測り、上位2〜3個を採用候補に。「あなた」は3枠。
   - **deck**: 対キャラ別勝率で負けている相手に効く札、または対象のAIが実際に使う札(`probe-usage.js` で使用回数を確認)を入れる/使われない札を抜く。`--scan deck --neighbors 30` でランダム近傍、`--flags ban=<idx>` で札単体の寄与も測れる。
   - **strategy**: `auto --chars <char>,<weakest-matchup>` で観戦し、固有スキルの撃ち所・布石・ロック運用の悪手を ai-improve の監査表で探す。`sim/ai.js` に `F.xxx` ノブで仮説を足し `probe-ai.js --mode vs` で paired 比較。
4. **測る**: 探索は `--games 60〜100`(粗く)。**採用候補は別シード(`--seed 2`, `--games 200`)で再測定して勝ち上がった場合だけ採用**(探索で選んだ最良は上振れする=勝者の呪い)。基準: field が基準線より **+1.96×SE 以上** かつ、どの対キャラ別勝率も極端に悪化しない(-15pt超なし)。
5. **採否**:
   - 採用 → 本番に反映(下記「ミラー」)→ テスト → 基準線を更新、`連続不採用回数=0`。
   - 不採用 → 撤回し、却下理由つきでログへ。`連続不採用回数 += 1`。
6. **コミット**: `docs/tune/<char>.md` と変更ファイルを `tune(<char>): ...` でコミット・現在ブランチに push。1イテレーション=1コミット(不採用でもログだけコミット)。PR は求められたときだけ作る。
7. **終了判定**:
   - **達成**: 知見ログに「このキャラで効いた/効かなかった軸の要約」を追記。`状態: done`・`最後に検証したmaster: <git rev-parse origin/master>` を記録して `/work-diary` で日記を書く(CLAUDE.md の workflow)。積み残しは issue にも起票。そのあと **手順8 に進む**(ここで loop を止めない。master が動くまで待つ)。
   - **行き詰まり**: `連続不採用回数 ≥ 6`(gear/deck/strategy を各1周以上測った後)→ **改善案 issue を起票**(下記)、`状態: blocked(issue #N)`、日記を書き、loop を止めるよう伝える。
   - それ以外は 1 行で進捗(基準線 → 今回の結果 → 次の候補)を報告して終了。
8. **再検証(done 後・毎回)**: トップは他の変更で崩れるので、done のあとも呼ばれるたびに確認する。
   1. `git fetch origin master` して `origin/master` が `最後に検証したmaster`から**進んでいなければ**、何もせず「master 変更なし・トップ維持」と1行報告して終了(loop は継続)。
   2. 進んでいたら最新 master を作業ブランチに取り込む(`git merge origin/master`。コンフリクトは推奨設定の行を両方残すよう解消し、テストを通す)。
   3. 手順2 の完了判定(`--rank --games 200 --seed 3` と `--envDeck varied`)をやり直す。
   4. **トップ維持**(1位かつ2位と +2pt 以上): `最後に検証したmaster` を更新、ログに「再検証OK」を1行追記してコミット・push。
   5. **トップ陥落**: `状態: running`・`連続不採用回数: 0` に戻し、ログに「master <sha> で陥落: 1位 <char> / 差」と原因の見当(`git log` で gear/deck/skill/AI/コスト/キャラ変更を確認)を記録。そのまま手順3〜7 のチューニングを再開する(基準線も新 master で取り直す)。
   - 再開後に行き詰まったら通常どおり手順7の issue 起票(既存の issue があれば追記コメント)で `blocked`。

## 知見ログ `docs/tune/LEARNINGS.md`(全キャラ共通・毎イテレーションで更新)

キャラ別ログは「このキャラで何を試したか」、こちらは「次のキャラ・次のイテレーションを速くする知識」。**毎イテレーションの終わりに、新しく分かったことがあれば追記する**(採否に関わらず。何も無ければ書かない)。書く対象:

- **効いたこと/効かなかったこと**(一般化できる形で): 例「`sturdy` はライフ依存の弱いキャラに効かない」「AIが使わない札をデッキに入れても無意味(probe-usage で使用回数を先に見る)」
- **計測のコツ**: 必要な games 数・SE の目安、探索に時間がかかる/ノイズが大きい軸、並列数、`--envDeck varied` で結論が変わった例、勝者の呪いで再測定に落ちた割合
- **相性の傾向**: 対キャラ別勝率で恒常的に負ける組(どのキャラでも同じなら環境側の問題)、環境の1位が誰か・なぜ強いか
- **AI/エンジンのクセ**: sim と本番AIのズレ、バグらしき挙動(スコープ外なら issue 化して番号を書く)、使われないスキル
- **近道**: 先に試すべき順序、スキップしてよい探索、有効だった `--flags`/`ban` の使い方
- **次に生かすメモ**: 計測器やスキル自体の改善案(例: probe-top にこの出力があれば楽)。小さければその場で `sim/probe-top.js` を直して記録、大きければ issue に

書式: 日付・キャラ・一行の結論・根拠(数値と seed/games)。古くなった知見(master の変更で成り立たなくなったもの)は消さず「(無効: <sha>)」と印を付ける。**手順1で必ず読み、同じ失敗や遠回りを繰り返さない。** 手順6のコミットに含める。

## ミラー(採用した変更を本番へ。sim と src は必ず対で)

| 変更 | sim | src |
|---|---|---|
| 推奨ギア | `sim/gear.js` `RECOMMENDED_GEARS` | `src/components/game/gear.ts` `RECOMMENDED_GEARS` |
| 推奨デッキ | `sim/deck.js` `RECOMMENDED_DECKS` | `src/components/game/deck.ts` `RECOMMENDED_DECKS` |
| AIの立ち回り | `sim/ai.js` | `src/components/game/AIPlayer.ts`(`AIPlayer.test.ts` に回帰テスト) |

その後 `node sim/gear.test.js`、`CI=true npx jest --watchAll=false src/components/game/{gear,deck,AIPlayer}.test.ts`(一致テスト含む)を通す。推奨設定を文章で説明している箇所(`docs/characters.md` など)があれば直す。

## やってはいけないこと(このスキルの範囲)

- **ライフ平均・スキルコスト・固有スキル効果・他キャラの弱体化はしない**(それは balance-loop / ユーザー判断)。このスキルが動かせるのは **ギア選択・デッキ構成・AIの立ち回りだけ**。数値で解決するしかない場合は issue 提案に回す。
- 探索の最良値をそのまま採用しない(手順4の再測定を省かない)。試行回数を増やせば結論が変わる保留は、ログに残して issue 化する対象。
- 他キャラのAI/デッキを意図的に下げて相対順位を稼がない(環境は常に全員の推奨設定)。
- 本番AI(TS)は sim と別実装。sim でしか測れていない立ち回りは、ミラー後に「本番AIでは未計測」とログに書く。

## 行き詰まり時の issue(改善案)

`mcp__github__issue_write`(method=create。`gh` が使えるなら `gh issue create`)で起票。**重複確認**(`search_issues` で `tune-top <char>`)してから。本文に必ず入れる:

1. 目標と現状(環境勝率・順位・1位との差。seed/games)
2. 試した軸と結果の表(gear/deck/strategy、却下理由つき。`docs/tune/<char>.md` へのパスも)
3. **ボトルネックの診断**: どの対キャラで負けているか(対キャラ別勝率)、なぜ(例: 固有スキルが重い・ライフ平均が低い・対策札がデッキに無い・AIが固有スキルを活かせない)
4. **改善案(数値/仕様)**: 例「ライフ平均 +1」「固有スキルのコスト -1」「ギア新規: …」「汎用スキル新規: …」を、期待効果の推定と**副作用リスク**(他キャラへの影響、`/balance-loop` で検証すべき指標)つきで。案は 1〜3 個に絞り、優先順位をつける
5. 検証方法(`node sim/probe-top.js ...` の再現コマンド)

ラベルは付けられるなら `balance`。起票後、番号を `docs/tune/<char>.md` と日記に残す(CLAUDE.md: 日記の積み残しは例外なく issue にも起票)。issue は `/diary-improve-loop` が拾って実装できる粒度で書く。
