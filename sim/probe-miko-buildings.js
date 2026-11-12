// @ts-check
'use strict';
/*
 * 龍神の巫女の建造物を、相手が壊す／奪う回数と、巫女の覚醒の頻度を数える（#638 の調査用）。
 * 使い方: node sim/probe-miko-buildings.js --games 40 --seed 1 [--opp a,b,c] [--size N]
 * 相手の手番の前後で盤面を比べ、巫女の建造物だったマスが「空き・別物になった(壊された)」「相手のものになった(奪われた)」を数える。
 * 覚醒は dragon.form が miko→dragon に変わった回数。席は試合ごとに交互。
 */
const engine = require('./engine');
const ai = require('./aiDriver');
const objectKind = require('./shared/ObjectKind');
const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].slice(2)] = process.argv[i + 1];
const games = parseInt(args.games || '40', 10);
const seed0 = parseInt(args.seed || '1', 10);
const ALL = ['you', 'tactician', 'magician', 'giant', 'yinYangMaster', 'necromancer', 'poisoner', 'electrician', 'cryomancer', 'pyromancer', 'witch', 'keysmith'];
const opps = args.opp ? args.opp.split(',') : ALL;

console.log('相手\t試合\t巫女勝\t引分\t壊した/試合\t奪った/試合\t覚醒/試合\t初覚醒の手番');
for (const opp of opps) {
    let mikoWins = 0, draws = 0, destroyed = 0, captured = 0, awakens = 0, firstSum = 0, firstN = 0, decided = 0;
    for (let g = 0; g < games; g++) {
        const mikoFirst = g % 2 === 0;
        const chars = mikoFirst ? ['dragonMiko', opp] : [opp, 'dragonMiko'];
        const miko = mikoFirst ? 0 : 1;
        const s = engine.newGame({ chars, rng: engine.makeRng(seed0 * 100003 + g), size: args.size ? parseInt(args.size, 10) : undefined });
        let t = 0, firstAwaken = -1;
        while (!s.winner && t++ < 600) {
            const before = s.board.map((sq) => ({ b: objectKind.isBuilding(sq), p: sq.player, o: sq.object }));
            const mover = s.turn;
            const formBefore = s.dragon[miko].form;
            const r = ai.makeMove(s, 'faithful');
            if (!r.turnEnded && r.move != null) engine.placeMove(s, r.move);
            else if (!r.turnEnded) engine.SKILLS.charge(s);
            if (mover !== miko) {
                for (let i = 0; i < before.length; i++) {
                    if (!before[i].b || before[i].p !== engine.SYMBOLS[miko]) continue;
                    const now = s.board[i];
                    if (now.player === engine.SYMBOLS[miko] && now.object === before[i].o) continue;
                    if (now.player && now.player !== engine.SYMBOLS[miko] && now.object === before[i].o) captured++;
                    else destroyed++;
                }
            }
            if (formBefore === 'miko' && s.dragon[miko].form === 'dragon') { awakens++; if (firstAwaken < 0) firstAwaken = t; }
        }
        if (firstAwaken >= 0) { firstSum += firstAwaken; firstN++; }
        if (s.winner) { decided++; if (engine.seatOf(s.winner) === miko) mikoWins++; } else draws++;
    }
    const f = (x) => (x / games).toFixed(2);
    console.log([opp, games, `${decided ? ((100 * mikoWins) / decided).toFixed(0) : '-'}%`, draws, f(destroyed), f(captured), f(awakens), firstN ? (firstSum / firstN).toFixed(0) : '-'].join('\t'));
}
