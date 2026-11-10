// 相手の lastStand（土壇場の防壁）が発動した試合の割合と、そのときの勝率を測る（/play-learn の診断用）。使い方: node sim/probe-laststand.js <テスト席キャラ>,<相手> <games> <seed>
const engine=require('./engine'),ai=require('./aiDriver');
const deckMod=require('./shared/deck'),gearMod=require('./shared/gear');
const [c1,c2]=process.argv[2].split(','),games=+process.argv[3],seed0=+process.argv[4];
let used=0,usedWin=0,notUsed=0,notUsedWin=0,dec=0,turnsAfter=[];
for(let g=0;g<games;g++){
 const first=g%2===0,chars=first?[c1,c2]:[c2,c1],test=first?0:1;
 const s=engine.newGame({chars,rng:engine.makeRng(seed0*100003+g),decks:chars.map(c=>deckMod.recommendedDeck(c)),gears:chars.map(c=>gearMod.recommendedGears(c))});
 s.aiFlags=chars.map(()=>({}));
 let t=0,usedAt=null;
 while(!s.winner&&t++<600){
  const r=ai.makeMove(s,'faithful');
  if(!r.turnEnded&&r.move!=null)engine.placeMove(s,r.move);else if(!r.turnEnded)engine.SKILLS.charge(s);
  if(usedAt===null&&s.lastStandUsed.some(Boolean))usedAt=t;
 }
 if(!s.winner)continue;dec++;const won=engine.seatOf(s.winner)===test;
 if(usedAt!==null){used++;if(won)usedWin++;turnsAfter.push(t-usedAt);}else{notUsed++;if(won)notUsedWin++;}
}
console.log(`${c1} vs ${c2} n=${dec} 防壁が発動した試合 ${used} (${(used/dec*100).toFixed(0)}%) 勝率 ${(usedWin/used*100).toFixed(0)}% / 未発動 ${notUsed} 勝率 ${notUsed?(notUsedWin/notUsed*100).toFixed(0):'-'}% / 発動後の平均手数 ${(turnsAfter.reduce((a,b)=>a+b,0)/Math.max(1,turnsAfter.length)).toFixed(1)}`);
