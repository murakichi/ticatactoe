#!/usr/bin/env node
// @ts-check
'use strict';
/*
 * オブジェクトの「上限実験」: 対象キャラが、手番頭に指定のオブジェクトを(コストは正規に払って)ヒューリスティックなマスへ最大 N 個まで置けるとしたときの、対強豪の勝率。
 * AI はまだオブジェクトを置けない(#399)ので、デッキに入れて測る前に「理想的に置けても勝てるか」を見て、採用する価値があるかを判断するための道具。
 *
 *   node sim/probe-object.js <kind|none> [games=30] [maxObjects=2] [char=poisoner]
 *   kind: bigTree | deadTree | spring | fort | thundercloud | market | sanctuary | poisonSwamp | none(基準)
 *
 * 置くマス: 毒沼は周囲の敵コマが多い空きマス、それ以外は周囲の自陣コマが多い空きマス。置くのは魔力がコスト+4以上あるときだけ(以降の手番を潰さない)。
 * 相手は環境変数 OPPS(既定 cryomancer,tactician,witch,magician,yinYangMaster。対象自身は除く)、対象のギアは GEARS で上書きできる(例: GEARS=lastStand,buildMania)。1相手あたり games 試合・席交互。標準誤差は大きい(30試合で±8pt程度)ので、基準(none)と同じ条件で並べて見る。
 */
const P = require('path').join(__dirname, '/');
const engine=require(P+'engine'),gearMod=require(P+'shared/gear'),deckMod=require(P+'shared/deck'),drv=require(P+'aiDriver.js'),objs=require(P+'shared/objects');
const CH=process.argv[5]||'poisoner';
const kind=process.argv[2]||'none', N=+process.argv[3]||30, MAXOBJ=+process.argv[4]||2;
const opps=(process.env.OPPS||'cryomancer,tactician,witch,magician,yinYangMaster').split(',').filter(x=>x!==CH);
const GEARS=process.env.GEARS?process.env.GEARS.split(','):null; // 対象キャラのギアを上書き(例: GEARS=lastStand,buildMania)
let W=0,L=0,D=0; const per={};
const adj=(i,size)=>{const r=Math.floor(i/size),c=i%size,o=[];for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){if(!dr&&!dc)continue;const rr=r+dr,cc=c+dc;if(rr>=0&&rr<size&&cc>=0&&cc<size)o.push(rr*size+cc);}return o;};
for(const o of opps){ let w=0,l=0;
  for(let g=0;g<N;g++){
    const first=g%2===0; const chars=first?[CH,o]:[o,CH]; const me=first?0:1;
    const s=engine.newGame({chars,rng:engine.makeRng(31000+g),decks:chars.map(c=>deckMod.recommendedDeck(c)),gears:chars.map(c=>(c===CH&&GEARS)?GEARS:gearMod.recommendedGears(c))}); s.aiFlags=[{},{}];
    let n=0, errs=0;
    try{
    while(!s.winner&&n++<400){
      if(kind!=='none'&&s.turn===me){
        const size=Math.sqrt(s.board.length); const symMe=engine.curPlayer(s);
        let placed=s.board.filter(q=>q.object===kind&&q.player===symMe).length;
        const def=objs.OBJECT_DEFS[kind]; 
        while(placed<MAXOBJ){
          const cost=engine.calculateCost?engine.calculateCost(s,engine.costsOf(s)[def.costKey],false,false,def.costKey):5;
          if(engine.curMagic(s)<cost+4) break;
          // 置くマス: 空きマスのうち、毒沼=周囲の敵コマが多い / 聖域=周囲の自陣コマが多い / 他=自陣が多い
          let best=-1,bs=-1;
          s.board.forEach((q,i)=>{ if(!objs.objectLandable(q))return; let sc=0; for(const j of adj(i,size)){const t=s.board[j]; if(!t.player||t.object)continue; if(kind==='poisonSwamp'){ if(t.player!==symMe) sc++; } else { if(t.player===symMe) sc++; } } if(sc>bs){bs=sc;best=i;} });
          if(best<0||bs<1) break;
          engine.SKILLS[kind](s); engine.placeMove(s,best); placed++;
        }
      }
      const r=drv.makeMove(s,'faithful'); if(!r.turnEnded&&r.move!=null)engine.placeMove(s,r.move); else if(!r.turnEnded)engine.SKILLS.charge(s);
    }}catch(e){errs++;}
    if(s.winner){ if(engine.seatOf(s.winner)===me)w++; else l++; }
  }
  per[o]=(w+l)?Math.round(100*w/(w+l)):null; W+=w;L+=l;
}
const vals=Object.values(per).filter(x=>x!=null);
console.log(kind,'max',MAXOBJ,'strong',(vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(1),JSON.stringify(per),'W-L',W+'-'+L);
