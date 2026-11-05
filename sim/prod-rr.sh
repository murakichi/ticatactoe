#!/bin/bash
# 本番AI(src の Game.tsx + AIPlayer.ts)で全キャラ総当たりして、環境順位を出す。sim の順位が本番とずれるキャラがあるので(docs/tune/LEARNINGS.md, issue #180)、
# 本番側の順位を見たいときに使う。4コアで各ペア40試合・55ペアが約25分。
# 使い方: bash sim/prod-rr.sh [試合数/ペア=40]   → 結果は $OUT(既定 /tmp/prodrr)/*.txt、最後に順位表を出す
# 備考: 決着しなかった試合(AIが詰まる等)は数えない。対氷室・対ネクロなどは決着数が少なくなる。
GAMES=${1:-40}
OUT=${OUT:-/tmp/prodrr}
mkdir -p "$OUT"; rm -f "$OUT"/*.txt
CHARS="you tactician magician giant yinYangMaster necromancer poisoner electrician cryomancer pyromancer witch"
pairs() { set -- $CHARS; while [ $# -gt 1 ]; do a=$1; shift; for b in "$@"; do echo "$a $b"; done; done; }
run() {
  a=$1; b=$2
  r=$(AI_MATCH=1 AI_MATCH_GAMES=$GAMES AI_MATCH_CHAR=$a AI_MATCH_OPP=$b CI=true npx react-scripts test --watchAll=false src/components/game/aiMatch.probe.test.tsx 2>&1 | grep -o "yinYang wins [0-9]*/[0-9]*")
  echo "$a $b $r" > "$OUT/$a-$b.txt"
}
export -f run; export GAMES OUT
pairs | xargs -P 4 -L 1 bash -c 'run "$@"' _
python3 - "$OUT" <<'PY'
import glob, re, sys, collections
w = collections.defaultdict(list)
for f in glob.glob(sys.argv[1] + '/*.txt'):
    m = re.match(r'(\w+) (\w+) yinYang wins (\d+)/(\d+)', open(f).read().strip())
    if not m or int(m[4]) == 0: continue
    a, b, x, y = m[1], m[2], int(m[3]), int(m[4])
    w[a].append(x / y); w[b].append(1 - x / y)
for i, (c, v) in enumerate(sorted(w.items(), key=lambda kv: -sum(kv[1]) / len(kv[1])), 1):
    print(i, c.ljust(14), f"{100 * sum(v) / len(v):.1f}%")
PY
