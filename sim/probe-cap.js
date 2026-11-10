// @ts-check
'use strict';
/* 600手を超えても勝者が出ない試合（膠着・打ち切り）の割合を数える（/play-learn の診断用）。使い方: node sim/probe-cap.js <キャラA>,<キャラB> <games> <seed>。推奨デッキ・ギア */
const engine=require('./engine'),ai=require('./aiDriver');
const deckMod=require('./shared/deck'),gearMod=require('./shared/gear');
const [c1,c2]=process.argv[2].split(','),games=+process.argv[3],seed0=+process.argv[4];
let cap=0,dec=0,sum=0;
for(let g=0;g<games;g++){
 const first=g%2===0,chars=first?[c1,c2]:[c2,c1];
 const s=engine.newGame({chars,rng:engine.makeRng(seed0*100003+g),decks:chars.map(c=>deckMod.recommendedDeck(c)),gears:chars.map(c=>gearMod.recommendedGears(c))});
 s.aiFlags=chars.map(()=>({}));let t=0;
 while(!s.winner&&t++<600){const r=ai.makeMove(s,'faithful');if(!r.turnEnded&&r.move!=null)engine.placeMove(s,r.move);else if(!r.turnEnded)engine.SKILLS.charge(s);}
 if(s.winner){dec++;sum+=t;}else cap++;
}
console.log(`${c1} vs ${c2} n=${games} 決着${dec} 600手打ち切り${cap} (${(cap/games*100).toFixed(0)}%) 決着試合の平均手数${(sum/Math.max(1,dec)).toFixed(0)}`);
