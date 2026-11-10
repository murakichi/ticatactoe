// 毒使い vs 雷霆の巫のAI同士で、負けた試合の帯電拡散の手番の前後に毒使いのコマ数・ライフ0の数・ライフ合計がどう変わるかを集計する（診断用。使い方: node sim/probe-spreadtrace.js 80）。
// 注意: 手番まるごとの前後なので、着手ごとの自然減衰（コマ数ぶんのライフ-1）が混ざる。帯電拡散だけの被害ではない
const P=require('path').join(__dirname,'/');
const engine=require(P+'engine'),gearMod=require(P+'shared/gear'),deckMod=require(P+'shared/deck'),drv=require(P+'aiDriver.js');
const N=+process.argv[2]||60; let lost=0,won=0,rows=[];
const orig=engine.SKILLS.chargeSpread; let curLog=null;
engine.SKILLS.chargeSpread=function(s){ const before=snap(s); const r=orig.apply(this,arguments); if(curLog) curLog.push({kind:'spread-click',before}); return r; };
function snap(s){ const me=s.chars.indexOf('poisoner'); const sym=engine.symbolOfSeat(me); let n=0,life0=0,zap=0,lifeSum=0; for(const q of s.board){ if(q.player===sym){n++; lifeSum+=q.bind; if(q.bind<=0)life0++; } zap+=(q.effects||[]).filter(e=>e.effect==='⚡').length; } return {n,life0,zap,lifeSum}; }
for(let g=0;g<N;g++){
  const first=g%2===0; const chars=first?['poisoner','electrician']:['electrician','poisoner']; const me=first?0:1;
  const s=engine.newGame({chars,rng:engine.makeRng(7700+g),decks:chars.map(c=>deckMod.recommendedDeck(c)),gears:chars.map(c=>gearMod.recommendedGears(c))}); s.aiFlags=[{},{}];
  curLog=[]; let n=0, timeline=[];
  try{ while(!s.winner&&n++<300){ const seat=s.turn; const b=snap(s); const r=drv.makeMove(s,'faithful'); if(!r.turnEnded&&r.move!=null)engine.placeMove(s,r.move); else if(!r.turnEnded)engine.SKILLS.charge(s);
     const a=snap(s); if(curLog.length){ timeline.push({turn:n,afterSpread:a,beforeSpread:curLog[0].before}); curLog=[]; } }
  }catch(e){}
  const res=s.winner? (engine.seatOf(s.winner)===me?'W':'L'):'D';
  if(res==='L'){ lost++; rows.push(timeline); } else if(res==='W') won++;
}
console.log({won,lost});
// 負けた試合: 帯電拡散の前後で毒使いのコマ数・ライフ0の数・ライフ合計がどう変わるか
let k=0, agg={n:0,dn:0,dl0:0,dsum:0};
for(const tl of rows) for(const t of tl){ k++; agg.dn+= t.afterSpread.n - t.beforeSpread.n; agg.dl0+= t.afterSpread.life0 - t.beforeSpread.life0; agg.dsum+= t.afterSpread.lifeSum - t.beforeSpread.lifeSum; }
console.log('負け試合の帯電拡散の手番', k, '回あたり 平均: コマ数Δ', (agg.dn/k).toFixed(2), 'ライフ0のコマΔ', (agg.dl0/k).toFixed(2), '毒使いのライフ合計Δ', (agg.dsum/k).toFixed(2));
console.log('例', JSON.stringify(rows.slice(0,3).map(tl=>tl.slice(0,3))));
