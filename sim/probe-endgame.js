// 毒使い vs 雷霆の巫のAI同士で、雷霆が勝つ最後の局面を集計する（診断用。使い方: node sim/probe-endgame.js 200）。
// 勝ちの列の⚡コマ数・最後の着手が毒使いのコマの奪取か・先後別の勝敗・試合の長さ（makeMove回数の中央値）を出す
const P = require('path').join(__dirname, '/');
const engine=require(P+'engine'),gearMod=require(P+'shared/gear'),deckMod=require(P+'shared/deck'),drv=require(P+'aiDriver.js'),charge=require(P+'shared/charge'),geo=require(P+'shared/boardGeometry');
const N=+process.argv[2]||100; let lost=0,won=0; const bySeat={first:{w:0,l:0},second:{w:0,l:0}}; const agg={turns:[],zapInLine:[0,0,0,0,0],capLast:0,lastHadZap:0,n:0,lineOwnedByElecAllZap:0,survivedPoison:0};
for(let g=0;g<N;g++){
  const first=g%2===0; const chars=first?['poisoner','electrician']:['electrician','poisoner']; const me=first?0:1;
  const s=engine.newGame({chars,rng:engine.makeRng(9100+g),decks:chars.map(c=>deckMod.recommendedDeck(c)),gears:chars.map(c=>gearMod.recommendedGears(c))}); s.aiFlags=[{},{}];
  const elecSym=engine.symbolOfSeat(1-me), meSym=engine.symbolOfSeat(me);
  let n=0, prev=null;
  try{ while(!s.winner&&n++<300){
    prev=s.board.map(q=>({player:q.player,bind:q.bind}));
    const r=drv.makeMove(s,'faithful'); let mv=null; if(!r.turnEnded&&r.move!=null){mv=r.move; engine.placeMove(s,r.move);} else if(!r.turnEnded)engine.SKILLS.charge(s);
    if(s.winner && engine.seatOf(s.winner)===1-me){
      lost++; bySeat[first?'first':'second'].l++; agg.turns.push(n);
      // 勝ちの列
      const lines=geo.geometryForCells(s.board.length).winLines.filter(l=>l.every(i=>s.board[i].player===elecSym));
      const line=lines[0]||[]; const zap=line.filter(i=>charge.chargeStacks(s.board[i])>0).length; agg.zapInLine[zap]++;
      if(mv!=null && prev[mv] && prev[mv].player===meSym) agg.capLast++;
      if(mv!=null && charge.chargeStacks(s.board[mv])>0) agg.lastHadZap++;
      agg.n++;
    }
  }}catch(e){}
  if(s.winner && engine.seatOf(s.winner)===me){ won++; bySeat[first?'first':'second'].w++; }
}
const med=a=>a.sort((x,y)=>x-y)[Math.floor(a.length/2)];
console.log(JSON.stringify({won,lost,medianTurn:med(agg.turns),zapPiecesInWinningLine_0to4:agg.zapInLine,lastMoveWasCaptureOfPoisonerPiece:agg.capLast,lastMoveCellHadZap:agg.lastHadZap,bySeat}));
