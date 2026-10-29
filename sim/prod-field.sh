#!/bin/bash
# 本番AIで、陰陽師(既定。AI_MATCH_CHAR で変更)が他の全キャラに勝つ率(環境勝率)を測る。候補のギア/デッキを本番AIに流して採否を決めるのに使う。
# 使い方: HG=lastStand,luckyPurse HD=0,2,3,... bash sim/prod-field.sh [試合数/相手=60]   (HG/HD 省略で標準設定)
# 4コアで各相手60試合・10相手が約8分。誤差は±4pt(約530試合)なので、大きな効果の判定に使う。
GAMES=${1:-60}
OUT=${OUT:-/tmp/prodfield}
mkdir -p "$OUT"; rm -f "$OUT"/*.txt
HERO=${AI_MATCH_CHAR:-yinYangMaster}
run() {
  o=$1
  [ -n "$HG" ] && export AI_MATCH_HGEARS=$HG
  [ -n "$HD" ] && export AI_MATCH_HDECK=$HD
  r=$(AI_MATCH=1 AI_MATCH_GAMES=$GAMES AI_MATCH_CHAR=$HERO AI_MATCH_OPP=$o CI=true npx react-scripts test --watchAll=false src/components/game/aiMatch.probe.test.tsx 2>&1 | grep -o "yinYang wins [0-9]*/[0-9]*")
  echo "$o $r" > "$OUT/$o.txt"
}
export -f run; export GAMES OUT HERO HG HD
printf "%s\n" you tactician magician giant yinYangMaster necromancer poisoner electrician cryomancer pyromancer witch | grep -vx "$HERO" | xargs -P 4 -I{} bash -c 'run {}'
python3 - "$OUT" <<'PY'
import glob, re, sys
W = N = 0; per = {}
for f in sorted(glob.glob(sys.argv[1] + '/*.txt')):
    m = re.search(r'(\w+) yinYang wins (\d+)/(\d+)', open(f).read())
    if m: W += int(m[2]); N += int(m[3]); per[m[1]] = f"{m[2]}/{m[3]}"
print(f"{W}/{N} = {100 * W / N:.1f}%" if N else 'no result', per)
PY
