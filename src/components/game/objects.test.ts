import { CharacterId } from '../../types/Character';
import { Player } from '../../types/Player';
import { SquareInfo } from '../../types/SquareInfo';
import { calculateWinner, lineSymbols } from '../../util';
import { isBuilding, isObject, isShikigami } from '../../types/ObjectKind';
import { newShikigami, toPiece } from './shikigami';
import { decayBoard } from './decay';
import { boardWinner, effectSnapshot, enforceEffectRules, encircleWinner, mudAdjustedBind, newPieceBlocked, skillRestricted, OBJECT_SKILLS, OBJECT_SKILL_KEYS, objectSkillTargets, objectSkillUsable, runObjectSkill, OBJECT_DEFS, OBJECT_PARAMS, activeObjectCells, hasOwnObject, ownPieceCount, marketCount, sanctuaryProtected, newObject, objectLandable, objectLandableCells, objectLifeBonus, objectTurnStart, sweepBurntTrees } from './objects';
import { resolvePlacement } from './placement';
import { ignite } from './thermal';

const board = (): SquareInfo[] => Array.from({ length: 16 }, () => ({ player: undefined, bind: 0, effects: [] }));
const chars: CharacterId[] = ['you', 'you'];
const rngFirst = () => 0; // 常に先頭の候補を選ぶ

describe('オブジェクト: 設置とライフ', () => {
    it('空きマスにだけ置ける（コマ・オブジェクト・氷結・ロック中のマスは不可）', () => {
        const b = board();
        b[0] = { player: '💙', bind: 1, effects: [] };
        b[1] = newObject('💙', 'fort');
        b[2] = { player: undefined, bind: 0, effects: [{ effect: '❄' }] };
        b[3] = { player: undefined, bind: 2, effects: [{ effect: '🔑' }] };
        expect(objectLandable(b[0])).toBe(false);
        expect(objectLandable(b[1])).toBe(false);
        expect(objectLandable(b[2])).toBe(false);
        expect(objectLandable(b[3])).toBe(false);
        expect(objectLandableCells(b)).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    });

    it('種類ごとのライフで、持ち主のものとして置かれる', () => {
        expect(newObject('⭕', 'fort')).toEqual({ player: '⭕', bind: OBJECT_DEFS.fort.life, effects: [], object: 'fort' });
    });

    it('列に数えない: 4つ並んでも勝利にならない（通常のコマが3つ+オブジェクト）', () => {
        const b = board();
        for (const k of [0, 1, 2]) b[k] = { player: '💙', bind: 1, effects: [] };
        b[3] = newObject('💙', 'bigTree');
        expect(calculateWinner(lineSymbols(b))).toBeUndefined();
        b[3] = { player: '💙', bind: 1, effects: [] };
        expect(calculateWinner(lineSymbols(b))).toBe('💙');
    });

    it('時間経過でライフが減らない（通常のコマは減る）', () => {
        const b = board();
        b[0] = newObject('💙', 'fort');
        b[1] = { player: '💙', bind: 5, effects: [] };
        decayBoard(b, -1, chars, ['💙', '⭕'], true);
        expect(b[0].bind).toBe(OBJECT_DEFS.fort.life);
        expect(b[1].bind).toBeLessThan(5);
    });
});

describe('オブジェクト: 乗っ取り', () => {
    it('自陣のオブジェクトはいつでも通常のコマで乗っ取れる（オブジェクトは消えてライフ life のコマになる）', () => {
        const r = resolvePlacement(newObject('💙', 'fort'), '💙', 3);
        expect(r.square).toEqual({ player: '💙', bind: 3, effects: [] });
        expect(r.square.object).toBeUndefined();
        expect(r.reinforced).toBe(false);
        expect(r.corpse).toBe(false);
    });

    it('敵のオブジェクトはライフが0なら乗っ取れる。オブジェクトも効果も引き継がない', () => {
        const dead = { ...newObject('⭕', 'bigTree'), bind: 0 };
        const r = resolvePlacement(dead, '💙', 2);
        expect(r.square).toEqual({ player: '💙', bind: 2, effects: [] });
        expect(r.capturedFrom).toBe('⭕');
    });

    it('ライフが残る攻撃（巨人など）ではオブジェクトのまま残り、ライフだけ減る', () => {
        const r = resolvePlacement(newObject('⭕', 'fort'), '💙', 3);
        expect(r.square.object).toBe('fort');
        expect(r.square.player).toBe('⭕');
        expect(r.square.bind).toBeLessThan(OBJECT_DEFS.fort.life);
    });
});

describe('オブジェクト: 乗っ取りはライフ0が条件', () => {
    it('ライフを削り切る攻撃でも、敵のオブジェクトはライフ0になるだけで乗っ取れない。次の着手で乗っ取れる', () => {
        const r = resolvePlacement(newObject('⭕', 'fort'), '💙', 99);
        expect(r.square).toEqual({ player: '⭕', bind: 0, effects: [], object: 'fort' });
        expect(r.capturedFrom).toBeUndefined();
        expect(r.corpse).toBe(false);
        const t = resolvePlacement(r.square, '💙', 2);
        expect(t.square).toEqual({ player: '💙', bind: 2, effects: [] });
        expect(t.capturedFrom).toBe('⭕');
    });
});

describe('オブジェクト: 乗っ取り方を選ぶ', () => {
    const dead = { ...newObject('⭕', 'fort'), bind: 0 };
    it('既定は自陣の通常のコマとして置き換える', () => {
        expect(resolvePlacement(dead, '💙', 4).square).toEqual({ player: '💙', bind: 4, effects: [] });
    });
    it('asObject なら自分のオブジェクトとして奪う（ライフは着手のライフ）', () => {
        const r = resolvePlacement(dead, '💙', 4, true);
        expect(r.square).toEqual({ player: '💙', bind: 4, effects: [], object: 'fort' });
        expect(r.capturedFrom).toBe('⭕');
    });
    it('asObject でも、通常のコマの奪取や、ライフが残るオブジェクトの攻撃は変わらない', () => {
        expect(resolvePlacement({ player: '⭕', bind: 0, effects: [] }, '💙', 3, true).square).toEqual({ player: '💙', bind: 3, effects: [] });
        expect(resolvePlacement(newObject('⭕', 'fort'), '💙', 99, true).square).toEqual({ player: '⭕', bind: 0, effects: [], object: 'fort' });
    });
});

describe('オブジェクト: 火炎', () => {
    it('大木・枯れた大木は🔥を付けられると即座に壊れる。砦などは壊れない', () => {
        const b = board();
        b[0] = newObject('💙', 'bigTree');
        b[1] = newObject('💙', 'deadTree');
        b[2] = newObject('💙', 'fort');
        ignite(b, [0, 1, 2], 4);
        expect(b[0]).toEqual({ player: undefined, bind: 0, effects: [] });
        expect(b[1]).toEqual({ player: undefined, bind: 0, effects: [] });
        expect(b[2].object).toBe('fort');
        expect(b[2].bind).toBe(OBJECT_DEFS.fort.life - 1); // 通常のコマと同じ1ダメージ
    });

    it('氷結中の大木は、🔥の代わりに氷結が解けるだけ', () => {
        const b = board();
        b[0] = { ...newObject('💙', 'bigTree'), effects: [{ effect: '❄' }] };
        ignite(b, [0], 4);
        expect(b[0].object).toBe('bigTree');
        expect(b[0].effects).toEqual([]);
    });

    it('sweepBurntTrees: 🔥の乗った大木だけを空きマスにする（氷結中は残す）', () => {
        const b = board();
        b[0] = { ...newObject('💙', 'bigTree'), effects: [{ effect: '🔥' }] };
        b[1] = { ...newObject('💙', 'deadTree'), effects: [{ effect: '🔥' }, { effect: '❄' }] };
        b[2] = { ...newObject('💙', 'fort'), effects: [{ effect: '🔥' }] };
        expect(sweepBurntTrees(b)).toEqual([0]);
        expect(b[0].player).toBeUndefined();
        expect(b[1].object).toBe('deadTree');
        expect(b[2].object).toBe('fort');
    });
});

describe('オブジェクト: 手番開始時の効果', () => {
    it('大木: 持ち主のものだけ、1本につきマジック+3。敵の大木・氷結中の大木は働かない', () => {
        const b = board();
        b[0] = newObject('💙', 'bigTree');
        b[1] = newObject('💙', 'bigTree');
        b[2] = newObject('⭕', 'bigTree');
        b[3] = { ...newObject('💙', 'bigTree'), effects: [{ effect: '❄' }] };
        expect(objectTurnStart(b, '💙', chars, rngFirst).magic).toBe(OBJECT_PARAMS.bigTreeMagic * 2);
        expect(objectTurnStart(b, '⭕', chars, rngFirst).magic).toBe(OBJECT_PARAMS.bigTreeMagic);
    });

    it('枯れた大木: 周囲八マスのコマのうちランダムな1つに🍂（空きマスと🔑ロックのコマには付けない）', () => {
        const b = board();
        b[5] = newObject('💙', 'deadTree');
        b[0] = { player: '⭕', bind: 3, effects: [{ effect: '🔑' }] };
        b[1] = { player: '⭕', bind: 3, effects: [] };
        b[10] = { player: '💙', bind: 3, effects: [] };
        b[15] = { player: '⭕', bind: 3, effects: [] }; // 周囲外
        const r = objectTurnStart(b, '💙', chars, rngFirst);
        expect(r.leaves).toEqual([1]); // 候補は 1 と 10。rng=0 で先頭
        expect(b[1].effects).toEqual([{ effect: '🍂' }]);
        expect(b[0].effects).toEqual([{ effect: '🔑' }]);
        expect(b[15].effects).toEqual([]);
    });

    it('枯れた大木: 周囲にコマが無ければ何も起きない', () => {
        const b = board();
        b[5] = newObject('💙', 'deadTree');
        expect(objectTurnStart(b, '💙', chars, rngFirst).leaves).toEqual([]);
    });

    it('雷雲: 周囲八マスのコマのランダムな1つに⚡（着地の1ダメージを受ける）', () => {
        const b = board();
        b[5] = newObject('💙', 'thundercloud');
        b[6] = { player: '⭕', bind: 3, effects: [] };
        const r = objectTurnStart(b, '💙', chars, rngFirst);
        expect(r.charged).toEqual([6]);
        expect(b[6].effects).toEqual([{ effect: '⚡' }]);
        expect(b[6].bind).toBeLessThan(3);
    });

    it('砦: 周囲八マスの自陣のコマのライフ+1（敵のコマ・周囲外は変わらない）', () => {
        const b = board();
        b[5] = newObject('💙', 'fort');
        b[0] = { player: '💙', bind: 2, effects: [] };
        b[1] = { player: '⭕', bind: 2, effects: [] };
        b[15] = { player: '💙', bind: 2, effects: [] };
        const r = objectTurnStart(b, '💙', chars, rngFirst);
        expect(r.fortified).toEqual([0]);
        expect(b[0].bind).toBe(3);
        expect(b[1].bind).toBe(2);
        expect(b[15].bind).toBe(2);
        expect(b[5].bind).toBe(OBJECT_DEFS.fort.life); // 砦自身は増えない
    });

    it('生命の泉: 持ち主の働いている泉1つにつきライフ期待値+2（objectTurnStart では盤面は変わらない）', () => {
        const b = board();
        b[0] = newObject('💙', 'spring');
        b[1] = newObject('💙', 'spring');
        b[2] = newObject('⭕', 'spring');
        expect(objectLifeBonus(b, '💙')).toBe(OBJECT_PARAMS.springLife * 2);
        expect(objectLifeBonus(b, '⭕')).toBe(OBJECT_PARAMS.springLife);
        expect(activeObjectCells(b, '💙', 'spring')).toEqual([0, 1]);
        const before = JSON.stringify(b);
        objectTurnStart(b, '💙', chars, rngFirst);
        expect(JSON.stringify(b)).toBe(before);
    });
});

describe('市場・聖域・毒沼', () => {
    it('市場: 働いている（氷結中でない）持ち主の分だけ数える。複数あれば数だけ', () => {
        const b = board();
        b[0] = newObject('💙', 'market');
        b[1] = { ...newObject('⭕', 'market'), effects: [{ effect: '❄' }] };
        expect(marketCount(b, '💙')).toBe(1);
        expect(marketCount(b, '⭕')).toBe(0);
        b[2] = newObject('💙', 'market');
        expect(marketCount(b, '💙')).toBe(2);
    });

    it('聖域: 周囲八マスの自陣のコマだけが守られる（敵のコマ・周囲外・氷結中の聖域は守らない）', () => {
        const b = board();
        b[5] = newObject('💙', 'sanctuary');
        b[0] = { player: '💙', bind: 3, effects: [] };
        b[1] = { player: '⭕', bind: 3, effects: [] };
        b[15] = { player: '💙', bind: 3, effects: [] };
        const p = sanctuaryProtected(b);
        expect(p[0]).toBe(true);
        expect(p[1]).toBe(false);
        expect(p[15]).toBe(false);
        b[5] = { ...b[5], effects: [{ effect: '❄' }] };
        expect(sanctuaryProtected(b)[0]).toBe(false);
    });

    it('聖域: 守られたコマは時間経過のライフ減衰（満杯の追加分も）を受けないが、🔥の継続ダメージは受ける', () => {
        const b = board();
        b[5] = newObject('💙', 'sanctuary');
        b[0] = { player: '💙', bind: 5, effects: [] }; // 守られる
        b[3] = { player: '💙', bind: 5, effects: [] }; // 周囲外
        b[4] = { player: '💙', bind: 5, effects: [{ effect: '🔥' }] }; // 守られるが🔥は別
        decayBoard(b, -1, chars, ['💙', '⭕'], true);
        expect(b[0].bind).toBe(5);
        expect(b[3].bind).toBeLessThan(5);
        expect(b[4].bind).toBeLessThan(5);
    });

    it('毒沼: 周囲八マスの敵のコマのランダムな1つに☠（自陣のコマ・🔑ロックのコマには付けない）', () => {
        const b = board();
        b[5] = newObject('💙', 'poisonSwamp');
        b[0] = { player: '💙', bind: 3, effects: [] };
        b[1] = { player: '⭕', bind: 3, effects: [{ effect: '🔑' }] };
        b[2] = { player: '⭕', bind: 3, effects: [] };
        const r = objectTurnStart(b, '💙', chars, rngFirst);
        expect(r.poisoned).toEqual([2]);
        expect(b[2].effects).toEqual([{ effect: '☠' }]);
        expect(b[0].effects).toEqual([]);
        expect(b[1].effects).toEqual([{ effect: '🔑' }]);
    });
});

describe('オブジェクトを壊す・強くするスキル', () => {
    const run = (skill: Parameters<typeof runObjectSkill>[0], b: SquareInfo[], i = -1, player: '💙' | '⭕' = '💙') => runObjectSkill(skill, b, player, chars, i, rngFirst);

    it('9種類あり、マスを選ぶのは解体・風化・補強工事・分譲・付け火、即発動は地ならし・増築・普請停止令・お構いなし', () => {
        expect(OBJECT_SKILL_KEYS.filter((k) => OBJECT_SKILLS[k].target)).toEqual(['demolish', 'weather', 'reinforce', 'duplicate', 'arson']);
        expect(OBJECT_SKILL_KEYS.filter((k) => !OBJECT_SKILLS[k].target)).toEqual(['levelAll', 'expandAll', 'buildBan', 'ignoreObjects']);
    });

    it('解体: 敵のオブジェクトだけが対象。壊すと空きマスになる。氷結中は❄が1つ減るだけ。🔑ロックは対象外', () => {
        const b = board();
        b[0] = newObject('⭕', 'fort');
        b[1] = { ...newObject('⭕', 'bigTree'), effects: [{ effect: '❄' }] };
        b[2] = { ...newObject('⭕', 'spring'), effects: [{ effect: '🔑' }] };
        b[3] = newObject('💙', 'fort'); // 自陣
        b[4] = { player: '⭕', bind: 3, effects: [] }; // 通常のコマ
        expect(objectSkillTargets('demolish', b, '💙', chars)).toEqual([0, 1]);
        expect(run('demolish', b, 3)).toBeNull(); // 自陣は選べない
        const r = run('demolish', b, 0)!;
        expect(r.destroyed).toEqual([0]);
        expect(b[0]).toEqual({ player: undefined, bind: 0, effects: [] });
        const f = run('demolish', b, 1)!;
        expect(f.blocked).toEqual([1]);
        expect(b[1].object).toBe('bigTree');
        expect(b[1].effects).toEqual([]);
    });

    it('風化: ライフが残る敵のオブジェクトのライフを0にする（壊れない）。ライフ0のものは対象外', () => {
        const b = board();
        b[0] = newObject('⭕', 'fort');
        b[1] = { ...newObject('⭕', 'fort'), bind: 0 };
        expect(objectSkillTargets('weather', b, '💙', chars)).toEqual([0]);
        run('weather', b, 0);
        expect(b[0].bind).toBe(0);
        expect(b[0].object).toBe('fort');
        expect(b[0].player).toBe('⭕');
    });

    it('地ならし: 敵のオブジェクトを全て壊す（自陣・通常のコマ・ロック中は残る）', () => {
        const b = board();
        b[0] = newObject('⭕', 'fort');
        b[1] = newObject('⭕', 'market');
        b[2] = newObject('💙', 'fort');
        b[3] = { ...newObject('⭕', 'spring'), effects: [{ effect: '🔑' }] };
        b[4] = { player: '⭕', bind: 3, effects: [] };
        expect(objectSkillUsable('levelAll', b, '💙', chars)).toBe(true);
        const r = run('levelAll', b)!;
        expect(r.destroyed).toEqual([0, 1]);
        expect(b[2].object).toBe('fort');
        expect(b[3].object).toBe('spring');
        expect(b[4].player).toBe('⭕');
        expect(objectSkillUsable('levelAll', board(), '💙', chars)).toBe(false);
    });

    it('補強工事: 自陣のオブジェクト1つのライフ+3。増築: 自陣のオブジェクト全てのライフ+2', () => {
        const b = board();
        b[0] = newObject('💙', 'fort');
        b[1] = newObject('💙', 'market');
        b[2] = newObject('⭕', 'fort');
        expect(objectSkillTargets('reinforce', b, '💙', chars)).toEqual([0, 1]);
        run('reinforce', b, 0);
        expect(b[0].bind).toBe(OBJECT_DEFS.fort.life + OBJECT_PARAMS.reinforceLife);
        const r = run('expandAll', b)!;
        expect(r.affected).toEqual([0, 1]);
        expect(b[1].bind).toBe(OBJECT_DEFS.market.life + OBJECT_PARAMS.expandLife);
        expect(b[2].bind).toBe(OBJECT_DEFS.fort.life); // 敵のオブジェクトは変わらない
    });

    it('分譲: 自陣のオブジェクトと同じ種類を、ライフ5でランダムな空きマスに置く。空きマスが無ければ使えない', () => {
        const b = board();
        b[0] = { ...newObject('💙', 'bigTree'), bind: 9 };
        const r = run('duplicate', b, 0)!;
        expect(r.affected).toEqual([1]); // rng=0 で先頭の空きマス
        expect(b[1]).toEqual(newObject('💙', 'bigTree'));
        expect(b[0].bind).toBe(9);
        const full = board().map((_, i) => ({ ...newObject('💙', 'fort'), bind: 5 + i % 1 }));
        expect(objectSkillUsable('duplicate', full, '💙', chars)).toBe(false);
    });
});

describe('結界石・護符の社（陰陽師向け）', () => {
    it('結界石: 周囲八マスの自陣の式神だけを守りの対象にする（通常のコマ・敵の式神・周囲外は対象外）。式神は元から自然減衰を受けないので、現状は守りとして働く場面が無い', () => {
        const b = board();
        b[5] = newObject('💙', 'barrierStone');
        b[0] = newShikigami('💙');
        b[1] = { player: '💙', bind: 5, effects: [] }; // 通常のコマ
        b[2] = newShikigami('⭕'); // 敵の式神
        b[15] = newShikigami('💙'); // 周囲外
        expect(sanctuaryProtected(b)).toEqual(b.map((_, i) => i === 0));
        decayBoard(b, -1, chars, ['💙', '⭕'], false);
        expect(b[0].bind).toBe(2);
        expect(b[1].bind).toBeLessThan(5); // 通常のコマは結界石では守られない
    });

    it('護符の社: 周囲八マスの自陣の式神1体につきマジック+1、最大+3。通常のコマ・敵の式神・周囲外は数えない', () => {
        const b = board();
        b[5] = newObject('💙', 'amuletShrine');
        b[0] = newShikigami('💙');
        b[1] = { player: '💙', bind: 5, effects: [] };
        b[2] = newShikigami('⭕');
        b[15] = newShikigami('💙');
        expect(objectTurnStart(b, '💙', chars, rngFirst).magic).toBe(1);
        b[4] = newShikigami('💙'); b[6] = newShikigami('💙'); b[8] = newShikigami('💙'); b[9] = newShikigami('💙');
        expect(objectTurnStart(b, '💙', chars, rngFirst).magic).toBe(OBJECT_PARAMS.shrineMagicCap);
        expect(objectTurnStart(b, '⭕', chars, rngFirst).magic).toBe(0);
    });
});

describe('相手を縛るオブジェクト・八卦の陣', () => {
    it('泥田坊: 相手の泥田坊が働いていれば、トークンのライフは0。自分の泥田坊や氷結中は効かない', () => {
        const b = board();
        b[0] = newObject('⭕', 'mudField');
        expect(mudAdjustedBind(b, '💙', 4)).toBe(0);
        expect(mudAdjustedBind(b, '⭕', 4)).toBe(4);
        b[0] = { ...b[0], effects: [{ effect: '❄' }] };
        expect(mudAdjustedBind(b, '💙', 4)).toBe(4);
    });

    it('見ざる地蔵: 周囲八マスで手番中に増えたエフェクトを消す（元からあるものと周囲外は残る）', () => {
        const b = board();
        b[5] = newObject('💙', 'blindMonkey');
        b[0] = { player: '⭕', bind: 3, effects: [{ effect: '🌱' }] };
        b[1] = { player: '⭕', bind: 3, effects: [] };
        b[15] = { player: '⭕', bind: 3, effects: [] };
        const snap = effectSnapshot(b);
        b[0] = { ...b[0], effects: [{ effect: '🌱' }, { effect: '🌱' }] }; // 1つ増えた
        b[1] = { ...b[1], effects: [{ effect: '⚡' }] };
        b[15] = { ...b[15], effects: [{ effect: '⚡' }] }; // 周囲外
        const r = enforceEffectRules(b, snap, '⭕');
        expect(r.removed).toEqual([0, 1]);
        expect(b[0].effects).toEqual([{ effect: '🌱' }]);
        expect(b[1].effects).toEqual([]);
        expect(b[15].effects).toEqual([{ effect: '⚡' }]);
    });

    it('閻魔の舌: 手番の席が自分のコマに付けたエフェクトで、そのコマのライフが0になる（相手のコマに付けた分・舌が無ければ何も起きない）', () => {
        const b = board();
        b[0] = newObject('💙', 'tongueKing');
        b[1] = { player: '⭕', bind: 5, effects: [] };
        b[2] = { player: '💙', bind: 5, effects: [] };
        const snap = effectSnapshot(b);
        b[1] = { ...b[1], effects: [{ effect: '🌱' }] };
        b[2] = { ...b[2], effects: [{ effect: '☠' }] }; // 舌の持ち主のコマに付けた（敵陣への攻撃）
        const r = enforceEffectRules(b, snap, '⭕');
        expect(r.zeroed).toEqual([1]);
        expect(b[1].bind).toBe(0);
        expect(b[2].bind).toBe(5);
        const none = board();
        none[1] = { player: '⭕', bind: 5, effects: [{ effect: '🌱' }] };
        expect(enforceEffectRules(none, effectSnapshot(board()), '⭕').zeroed).toEqual([]);
    });

    it('八卦の陣: 周囲八マスが全て自陣のコマなら勝利。1マスでも欠ける・式神・オブジェクト・盤の端では不成立', () => {
        const b = board();
        b[5] = newObject('💙', 'eightTrigrams');
        for (const k of [0, 1, 2, 4, 6, 8, 9, 10]) b[k] = { player: '💙', bind: 1, effects: [] };
        expect(encircleWinner(b)).toEqual({ player: '💙', cells: [5, 0, 1, 2, 4, 6, 8, 9, 10] });
        expect(boardWinner(b)).toBe('💙');
        b[10] = { player: '⭕', bind: 1, effects: [] };
        expect(boardWinner(b)).toBeUndefined();
        b[10] = newShikigami('💙');
        expect(boardWinner(b)).toBeUndefined();
        const edge = board();
        edge[0] = newObject('💙', 'eightTrigrams');
        for (const k of [1, 4, 5]) edge[k] = { player: '💙', bind: 1, effects: [] };
        expect(boardWinner(edge)).toBeUndefined();
    });

    it('お一人様限りの札と一言居士: 相手のものだけが縛る。基本操作は縛られない', () => {
        const b = board();
        b[0] = newObject('⭕', 'soloSign');
        b[1] = newObject('⭕', 'oneWord');
        const base = { board: b, actor: '💙' as const, skillsThisTurn: 0, placedThisTurn: 0 };
        expect(newPieceBlocked(b, '💙', 0)).toBe(false);
        expect(newPieceBlocked(b, '💙', 1)).toBe(true);
        expect(newPieceBlocked(b, '⭕', 1)).toBe(false);
        expect(skillRestricted({ ...base, skillKey: 'onClickSlash' })).toBe(false);
        expect(skillRestricted({ ...base, skillKey: 'onClickSlash', skillsThisTurn: 1 })).toBe(true);
        expect(skillRestricted({ ...base, basic: true, skillsThisTurn: 3 })).toBe(false);
        expect(skillRestricted({ ...base, skillKey: 'onClickDoubleToken' })).toBe(true); // 2つ置くスキルは最初から不可
        expect(skillRestricted({ ...base, skillKey: 'onClickToken' })).toBe(false);
        expect(skillRestricted({ ...base, skillKey: 'onClickToken', placedThisTurn: 1 })).toBe(true);
        expect(skillRestricted({ ...base, actor: '⭕', skillKey: 'onClickDoubleToken', skillsThisTurn: 2 })).toBe(false);
    });
});

describe('式神はオブジェクトの一種', () => {
    it('式神は isObject / isShikigami が真で、isBuilding は偽。設置した建造物は isBuilding が真で isShikigami は偽', () => {
        const sh = newShikigami('💙');
        expect(sh).toEqual({ player: '💙', bind: 2, effects: [], object: 'shikigami' });
        expect([isObject(sh), isShikigami(sh), isBuilding(sh)]).toEqual([true, true, false]);
        const fort = newObject('💙', 'fort');
        expect([isObject(fort), isShikigami(fort), isBuilding(fort)]).toEqual([true, false, true]);
    });

    it('列に数えず、自然減衰を受けない（オブジェクトの規則）。toPiece で通常のコマになる（通常のコマは減衰を受ける）', () => {
        const b = board();
        b[0] = newShikigami('💙');
        b[1] = newShikigami('💙');
        for (const k of [2, 3]) b[k] = { player: '💙', bind: 1, effects: [] };
        expect(calculateWinner(lineSymbols(b))).toBeUndefined();
        decayBoard(b, -1, chars, ['💙', '⭕'], false);
        expect(b[0].bind).toBe(2); // 式神は減衰しない
        const piece = toPiece(b[0]);
        expect(piece.object).toBeUndefined();
        const c = board();
        c[0] = piece;
        decayBoard(c, -1, chars, ['💙', '⭕'], false);
        expect(c[0].bind).toBe(1); // 通常のコマになれば減衰する
    });

    it('敵に乗っ取られると空きマス、自分で補強すると🌱付きの通常のコマ。ライフが残る攻撃ではオブジェクトとして乗っ取られない', () => {
        expect(resolvePlacement({ ...newShikigami('⭕'), bind: 0 }, '💙', 3).square).toEqual({ player: undefined, bind: 0, effects: [] });
        const self = resolvePlacement(newShikigami('💙'), '💙', 3);
        expect(self.square).toEqual({ player: '💙', bind: 6, effects: [{ effect: '🌱' }] });
        expect(self.square.object).toBeUndefined();
    });

    it('解体・風化・地ならし・補強工事の対象になるが、分譲では複製できない。普請道楽・コマ数の数え方は建造物だけを見る', () => {
        const b = board();
        b[0] = newShikigami('⭕');
        b[1] = newShikigami('💙');
        expect(objectSkillTargets('demolish', b, '💙', chars)).toEqual([0]);
        expect(objectSkillTargets('reinforce', b, '💙', chars)).toEqual([1]);
        expect(objectSkillTargets('duplicate', b, '💙', chars)).toEqual([]);
        expect(hasOwnObject(b, '💙')).toBe(false);
        expect(ownPieceCount(b, '💙')).toBe(1); // お一人様限りの札: 式神を置くのも新しいコマ
        b[2] = newObject('💙', 'fort');
        expect(hasOwnObject(b, '💙')).toBe(true);
        expect(ownPieceCount(b, '💙')).toBe(1);
    });
});

describe('新スキル: 普請停止令・付け火・お構いなし', () => {
    it('付け火: 大木は燃え尽き、それ以外は🔥が付いてライフが1減る。氷結中は❄が解けるだけ。🔑ロック中は選べない', () => {
        const b = board();
        b[0] = newObject('⭕', 'bigTree');
        b[1] = newObject('⭕', 'fort');
        b[10] = { ...newObject('⭕', 'fort'), effects: [{ effect: '❄' }] };
        b[15] = { ...newObject('⭕', 'fort'), effects: [{ effect: '🔑', value: 2 }] };
        expect(objectSkillTargets('arson', b, '💙', chars)).toEqual([0, 1, 10]);
        const burn = runObjectSkill('arson', b, '💙', chars, 0) as NonNullable<ReturnType<typeof runObjectSkill>>;
        expect(burn.destroyed).toEqual([0]);
        expect(b[0].object).toBeUndefined();
        const fire = runObjectSkill('arson', b, '💙', chars, 1) as NonNullable<ReturnType<typeof runObjectSkill>>;
        expect(fire.affected).toEqual([1]);
        expect(b[1].effects.some((e) => e.effect === '🔥')).toBe(true);
        expect(b[1].bind).toBe(OBJECT_DEFS.fort.life - 1);
        const thaw = runObjectSkill('arson', b, '💙', chars, 10) as NonNullable<ReturnType<typeof runObjectSkill>>;
        expect(thaw.blocked).toEqual([10]);
        expect(b[10].effects.some((e) => e.effect === '🔥')).toBe(false);
        expect(runObjectSkill('arson', b, '💙', chars, 15)).toBeNull();
    });
    it('お構いなしは敵のオブジェクトがあるときだけ使える。普請停止令はいつでも使える', () => {
        const b = board();
        expect(objectSkillUsable('ignoreObjects', b, '💙', chars)).toBe(false);
        expect(objectSkillUsable('buildBan', b, '💙', chars)).toBe(true);
        b[0] = newObject('⭕', 'oneWord');
        expect(objectSkillUsable('ignoreObjects', b, '💙', chars)).toBe(true);
    });
    it('普請停止令: オブジェクトを設置する全てのスキル（祈り・分譲を含む）が使えなくなる。通常のトークンは使える', () => {
        const b = board();
        const base = { board: b, actor: '💙' as const, skillsThisTurn: 0, placedThisTurn: 0, objectBanned: true };
        for (const key of ['onClickBigTree', 'onClickFort', 'onClickPrayer', 'onClickDuplicate', 'onClickBoulder']) expect(skillRestricted({ ...base, skillKey: key })).toBe(true);
        expect(skillRestricted({ ...base, skillKey: 'onClickToken' })).toBe(false);
        expect(skillRestricted({ ...base, objectBanned: false, skillKey: 'onClickBigTree' })).toBe(false);
        expect(skillRestricted({ ...base, skillKey: 'onClickBigTree', basic: true })).toBe(false);
    });
    it('お構いなし: 敵の一言居士・お一人様限りの札・泥田坊・閻魔の舌の縛りを受けない', () => {
        const b = board();
        b[0] = newObject('⭕', 'oneWord');
        b[1] = newObject('⭕', 'soloSign');
        b[2] = newObject('⭕', 'mudField');
        b[3] = newObject('⭕', 'tongueKing');
        const one = { board: b, actor: '💙' as const, skillsThisTurn: 1, placedThisTurn: 1, skillKey: 'onClickToken' };
        expect(skillRestricted(one)).toBe(true);
        expect(skillRestricted({ ...one, ignoring: true })).toBe(false);
        expect(newPieceBlocked(b, '💙', 1)).toBe(true);
        expect(newPieceBlocked(b, '💙', 1, true)).toBe(false);
        expect(mudAdjustedBind(b, '💙', 5)).toBe(0);
        expect(mudAdjustedBind(b, '💙', 5, true)).toBe(5);
        const snap = effectSnapshot(b);
        const after = b.map((sq, i) => (i === 5 ? { player: '💙' as const, bind: 4, effects: [{ effect: '🔥' as const }] } : sq));
        snap[5] = [];
        const zeroed = enforceEffectRules(after.slice(), snap, '💙', true);
        expect(zeroed.zeroed).toEqual([]);
        expect(enforceEffectRules(after.slice(), snap, '💙').zeroed).toEqual([5]);
    });
    it('お構いなし: 敵の毒沼・雷雲・枯れた大木の手番開始時の標的にならない（自分のコマだけが周囲にあれば何も起きない）', () => {
        for (const kind of ['poisonSwamp', 'thundercloud', 'deadTree'] as const) {
            const b = board();
            b[5] = newObject('⭕', kind);
            b[6] = { player: '💙', bind: 4, effects: [] };
            const hit = objectTurnStart(b.map((sq) => ({ ...sq })), '⭕', chars, rngFirst);
            expect(hit.poisoned.length + hit.charged.length + hit.leaves.length).toBe(1);
            const safe = objectTurnStart(b.map((sq) => ({ ...sq })), '⭕', chars, rngFirst, new Set<Player>(['💙']));
            expect(safe.poisoned.length + safe.charged.length + safe.leaves.length).toBe(0);
        }
    });
});
