// @ts-check
'use strict';
/* 手番開始時の魔力の貯め込みを測る（/play-learn の仮説検証用）。使い方: node sim/probe-hoard.js <テスト席キャラ>,<相手> <games> <seed>。推奨デッキ・ギア。魔力>=12の手番の割合と、貯め込み試合(>=25%の手番)の勝率を出す */

const engine=require('./engine'),ai=require('./aiDriver');
const deckMod=require('./shared/deck'),gearMod=require('./shared/gear');
const [c1,c2]=process.argv[2].split(','),games=+process.argv[3],seed0=+process.argv[4];
let turns=0,sum=0,hi=0,w=0,d=0,hiW=0,hiD=0,loW=0,loD=0;
const all=[]; // 手番開始の魔力の全サンプル（平均は600手まで続く少数の試合に引きずられるので中央値も出す）
for(let g=0;g<games;g++){
 const first=g%2===0,chars=first?[c1,c2]:[c2,c1],test=first?0:1;
 const s=engine.newGame({chars,rng:engine.makeRng(seed0*100003+g),decks:chars.map(c=>deckMod.recommendedDeck(c)),gears:chars.map(c=>gearMod.recommendedGears(c))});
 s.aiFlags=chars.map(()=>({}));
 let t=0,hoardTurns=0,myTurns=0;
 while(!s.winner&&t++<600){
  if(s.turn===test){myTurns++;const m=s.magic[test];sum+=m;turns++;all.push(m);if(m>=12){hi++;hoardTurns++;}}
  const r=ai.makeMove(s,'faithful');
  if(!r.turnEnded&&r.move!=null)engine.placeMove(s,r.move);else if(!r.turnEnded)engine.SKILLS.charge(s);
 }
 if(s.winner){const won=engine.seatOf(s.winner)===test;d++;if(won)w++;
  if(hoardTurns/myTurns>=0.25){hiD++;if(won)hiW++;}else{loD++;if(won)loW++;}}
}
console.log(`${c1} vs ${c2} n=${games} win=${(w/d*100).toFixed(1)}% 手番開始の魔力 平均 ${(sum/turns).toFixed(1)} 中央値 ${all.sort((a,b)=>a-b)[Math.floor(all.length/2)]} 魔力>=12の手番 ${(hi/turns*100).toFixed(1)}% | 貯め込み試合(>=25%手番) n=${hiD} 勝率 ${hiD?(hiW/hiD*100).toFixed(0):'-'}% / それ以外 n=${loD} 勝率 ${(loW/loD*100).toFixed(0)}%`);
