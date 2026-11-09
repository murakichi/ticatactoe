const P=require('path').join(__dirname,'/');
const engine=require(P+'engine'),ai=require(P+'aiDriver'),deckMod=require(P+'shared/deck'),gearMod=require(P+'shared/gear');
const N=parseInt(process.argv[2]||'150');
const names=Object.keys(engine.SKILLS);let cur=null;
for(const n of names){const o=engine.SKILLS[n];engine.SKILLS[n]=function(s){const b=s.magic[s.turn];const r=o.apply(this,arguments);if(cur&&s.magic[s.turn]!==b||(cur&&n==='charge'))cur.push({seat:s.turn,n});return r;};}
const rows=[];
for(let g=0;g<N;g++){
 const first=g%2===0,chars=first?['pyromancer','witch']:['witch','pyromancer'],me=first?0:1,wi=1-me;
 const s=engine.newGame({chars,rng:engine.makeRng(4242*1000+g),decks:chars.map(c=>deckMod.recommendedDeck(c)),gears:chars.map(c=>gearMod.recommendedGears(c))});
 s.aiFlags=chars.map(()=>({}));
 const SYM=engine.SYMBOLS;let t=0;const rec={turns:0,magicMe:[],magicW:[],leavesBoard:[],costIgn:[],piecesMe:[],piecesW:[],skillsMe:{},skillsW:{}};
 while(!s.winner&&t++<300){
  const seat=s.turn;
  const leavesOwn=s.board.filter(q=>q.player===SYM[wi]).reduce((a,q)=>a+q.effects.filter(e=>e.effect==='🍂').length,0);
  if(seat===me){rec.magicMe.push(s.magic[me]);rec.leavesBoard.push(leavesOwn);try{rec.costIgn.push(engine.calculateCost(s,engine.costsOf(s).onClickIgnite,false,false,'onClickIgnite'));}catch(e){}
   rec.piecesMe.push(s.board.filter(q=>q.player===SYM[me]).length);rec.piecesW.push(s.board.filter(q=>q.player===SYM[wi]).length);}
  else rec.magicW.push(s.magic[wi]);
  cur=[];
  const r=ai.makeMove(s,'faithful');if(!r.turnEnded&&r.move!=null)engine.placeMove(s,r.move);else if(!r.turnEnded)engine.SKILLS.charge(s);
  for(const x of cur){const m=x.seat===me?rec.skillsMe:rec.skillsW;m[x.n]=(m[x.n]||0)+1;}
  cur=null;
 }
 rec.turns=t;rec.won=s.winner&&engine.seatOf(s.winner)===me;rec.first=first;
 rec.finalPiecesMe=s.board.filter(q=>q.player===SYM[me]).length;rec.finalPiecesW=s.board.filter(q=>q.player===SYM[wi]).length;
 rec.finalLeaves=s.board.reduce((a,q)=>a+q.effects.filter(e=>e.effect==='🍂').length,0);
 rows.push(rec);
}
const avg=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:NaN;
const f=x=>x.toFixed(2);
console.log('試合',rows.length,'鍛冶師勝率',f(rows.filter(r=>r.won).length/rows.length));
for(const [lab,rs] of [['全体',rows],['鍛冶師勝ち',rows.filter(r=>r.won)],['鍛冶師負け',rows.filter(r=>!r.won)],['先手(鍛冶師)',rows.filter(r=>r.first)],['後手(鍛冶師)',rows.filter(r=>!r.first)]]){
 console.log(lab,'n='+rs.length,'手数',f(avg(rs.map(r=>r.turns))),'鍛冶師手番数',f(avg(rs.map(r=>r.magicMe.length))));
}
const L=rows.filter(r=>!r.won);
const upto=(k)=>avg(rows.map(r=>r.magicMe[k]).filter(x=>x!==undefined));
console.log('鍛冶師の魔力(手番k開始時) 負けのみ:',[0,1,2,3,4,5].map(k=>f(avg(L.map(r=>r.magicMe[k]).filter(x=>x!==undefined)))).join(' '));
console.log('witchの魔力(手番k) 負けのみ:',[0,1,2,3,4,5].map(k=>f(avg(L.map(r=>r.magicW[k]).filter(x=>x!==undefined)))).join(' '));
console.log('盤上のwitch🍂(鍛冶師手番k) 負けのみ:',[0,1,2,3,4,5].map(k=>f(avg(L.map(r=>r.leavesBoard[k]).filter(x=>x!==undefined)))).join(' '));
console.log('火遁の実コスト(鍛冶師手番k) 負けのみ:',[0,1,2,3,4,5].map(k=>f(avg(L.map(r=>r.costIgn[k]).filter(x=>x!==undefined)))).join(' '));
console.log('盤上の駒 鍛冶師/witch (手番k) 負けのみ:',[0,1,2,3,4,5].map(k=>f(avg(L.map(r=>r.piecesMe[k]).filter(x=>x!==undefined)))+'/'+f(avg(L.map(r=>r.piecesW[k]).filter(x=>x!==undefined)))).join('  '));
const agg=(key)=>{const t={};for(const r of rows)for(const [k,v] of Object.entries(r[key]))t[k]=(t[k]||0)+v;return Object.entries(t).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([k,v])=>k+':'+f(v/rows.length)).join(' ');};
console.log('鍛冶師スキル/試合:',agg('skillsMe'));
console.log('witchスキル/試合:',agg('skillsW'));
console.log('最終 駒 鍛冶師/witch / 🍂(負け):',f(avg(L.map(r=>r.finalPiecesMe))),f(avg(L.map(r=>r.finalPiecesW))),f(avg(L.map(r=>r.finalLeaves))));
