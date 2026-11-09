#!/usr/bin/env node
'use strict';
// 建造物エンジン(工房→招き猫→大木)の上限実験。手札に札があるかは問わず、手番頭に払える限り建てる。usage: node sim/probe-object-engine.js <mode none|build> <games per opp> <char> ; env: GEARS, SIZE, OPPS, MAXTREES, RESERVE
const P=require('path').join(__dirname,'/');
const engine=require(P+'engine'),gearMod=require(P+'shared/gear'),deckMod=require(P+'shared/deck'),drv=require(P+'aiDriver.js'),objs=require(P+'shared/objects'),geo=require(P+'shared/boardGeometry');
const MODE=process.argv[2]||'none',N=+process.argv[3]||20,CH=process.argv[4]||'you';
const GEARS=process.env.GEARS?process.env.GEARS.split(','):null;
const SIZE=process.env.SIZE?+process.env.SIZE:undefined;
const MAXTREES=+(process.env.MAXTREES||99),RESERVE=+(process.env.RESERVE||0);
const opps=(process.env.OPPS||engine.CHARACTERS.join(',')).split(',');
const KEY={workshop:'onClickWorkshop',luckyCat:'onClickLuckyCat',bigTree:'onClickBigTree'};
const stats={builtTrees:0,games:0,firstTreeTurn:[],objCells:0};
function lines(s){const g=geo.geometryOf?geo.geometryOf(s.size):null;return g&&g.winLines?g.winLines:null;}
function pickCell(s,me){
  const L=lines(s);let best=-1,bs=-1e9;
  s.board.forEach((q,i)=>{ if(!objs.objectLandable(q))return;
    let sc=0;
    if(L){for(const ln of L){if(!ln.includes(i))continue;let mine=0,foe=0;for(const j of ln){const t=s.board[j];if(!t.player||t.object)continue;if(t.player===me)mine++;else foe++;}
      if(foe>0&&mine===0)sc+=foe*foe; if(mine>0)sc-=mine*mine*0.5;}}
    sc+=Math.random()*0.01; if(sc>bs){bs=sc;best=i;}});
  return best;
}
function build(s,me){
  const sym=engine.curPlayer(s);let guard=0;
  while(guard++<40){
    const mine=(k)=>s.board.filter(q=>q.object===k&&q.player===sym).length;
    const want=!mine('workshop')?'workshop':!mine('luckyCat')?'luckyCat':'bigTree';
    if(want==='bigTree'&&mine('bigTree')>=MAXTREES)break;
    const c=engine.calculateCost(s,engine.costsOf(s)[KEY[want]],false,false,KEY[want]);
    if(engine.curMagic(s)<c+RESERVE)break;
    const cell=pickCell(s,sym);if(cell<0)break;
    const empt=s.board.filter(q=>objs.objectLandable(q)).length; if(empt<=2)break;
    engine.SKILLS[want](s);if(!engine.placeMove(s,cell))break;
    stats.objCells++; if(want==='bigTree'){stats.builtTrees++;}
  }
}
let W=0,L=0,D=0;const per={};
for(const o of opps){let w=0,l=0;
  for(let g=0;g<N;g++){
    const first=g%2===0,chars=first?[CH,o]:[o,CH],me=first?0:1;
    const s=engine.newGame({chars,size:SIZE,rng:engine.makeRng(52000+g),decks:chars.map(c=>deckMod.recommendedDeck(c)),gears:chars.map(c=>(c===CH&&GEARS&&chars.indexOf(c)===me)?GEARS:gearMod.recommendedGears(c))});
    s.aiFlags=[{},{}];let n=0;
    try{while(!s.winner&&n++<500){
      if(MODE==='build'&&s.turn===me)build(s,me);
      const r=drv.makeMove(s,'faithful');if(!r.turnEnded&&r.move!=null)engine.placeMove(s,r.move);else if(!r.turnEnded)engine.SKILLS.charge(s);
    }}catch(e){stats.err=(stats.err||0)+1;}
    stats.games++;
    if(s.winner){if(engine.seatOf(s.winner)===me)w++;else l++;}else D++;
  }
  per[o]=(w+l)?Math.round(100*w/(w+l)):null;W+=w;L+=l;
}
const v=Object.values(per).filter(x=>x!=null);
console.log(`${MODE} ${CH} gears=${(GEARS||['rec']).join('+')} size=${SIZE||'def'} avg=${(v.reduce((a,b)=>a+b,0)/v.length).toFixed(1)} W-L=${W}-${L} draws=${D} treesPerGame=${(stats.builtTrees/stats.games).toFixed(2)} objCells/game=${(stats.objCells/stats.games).toFixed(2)} err=${stats.err||0}`);
console.log(JSON.stringify(per));
