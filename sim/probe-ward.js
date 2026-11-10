// 診断用: 毒使いの spellWard が『毎手番』（スキルを撃たなくても）常に自陣を守るとしたときの勝率（上限実験）。使い方: node sim/probe-ward.js base|always [games=100]
// 環境変数 OPPS=a,b,.. で相手を指定。ギアに合わせた戦略（毎手番スキルを撃つ）に価値があるかを、AIを書く前に見積もる
// 上限実験: 毒使いの spellWard が『毎手番』（スキルを撃たなくても）常に自陣を守るとしたときの勝率
const P = require('path').join(__dirname, '/');
const thermal=require(P+'shared/thermal'); const origSet=thermal.setEffectWard;
const mode=process.argv[2]||'base', N=+process.argv[3]||100;
thermal.setEffectWard=function(fn){ origSet.call(thermal,(sq)=> fn(sq) || (mode==='always' && global.__WARD_SYM && sq.player===global.__WARD_SYM)); };
const engine=require(P+'engine'),gearMod=require(P+'shared/gear'),deckMod=require(P+'shared/deck'),drv=require(P+'aiDriver.js');
const opps=(process.env.OPPS||'yinYangMaster,pyromancer,necromancer,electrician,giant,keysmith').split(',');
let W=0,L=0; const per={};
for(const o of opps){ let w=0,l=0;
  for(let g=0;g<N;g++){
    const first=g%2===0; const chars=first?['poisoner',o]:[o,'poisoner']; const me=first?0:1;
    const s=engine.newGame({chars,rng:engine.makeRng(61000+g),decks:chars.map(c=>deckMod.recommendedDeck(c)),gears:chars.map(c=>gearMod.recommendedGears(c))}); s.aiFlags=[{},{}];
    global.__WARD_SYM=engine.symbolOfSeat(me);
    let n=0; try{ while(!s.winner&&n++<300){ const r=drv.makeMove(s,'faithful'); if(!r.turnEnded&&r.move!=null)engine.placeMove(s,r.move); else if(!r.turnEnded)engine.SKILLS.charge(s);} }catch(e){}
    if(s.winner){ if(engine.seatOf(s.winner)===me)w++; else l++; }
  }
  per[o]=(w+l)?Math.round(100*w/(w+l)):null; W+=w;L+=l;
}
const v=Object.values(per).filter(x=>x!=null);
console.log(mode,'avg',(v.reduce((a,b)=>a+b,0)/v.length).toFixed(1),JSON.stringify(per),'W-L',W+'-'+L);
