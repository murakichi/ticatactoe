import { CostEnv, calculateCostOf, characterCostOf, gearCostOf, tokenBindOf } from './cost';
import { skillCosts } from './skillCosts';
import { emptyDiscount, afterSkill } from './discount';
import { SquareInfo } from '../../types/SquareInfo';
import { CharacterId } from '../../types/Character';

const board = (): SquareInfo[] => Array.from({ length: 16 }, () => ({ player: undefined, bind: 0, effects: [] }));
const env = (character: CharacterId, over: Partial<CostEnv> = {}): CostEnv => ({
    board: board(), seat: 0, player: '💙', turnSeat: 0, characters: [character, 'you'], yinYangMode: 'ying', gears: [],
    ctx: { skillsThisTurn: 0, echoReady: false }, leafBase: 0, kinds: new Set(), chargeBase: 0, shikiPlaced: false,
    tokenFree: false, bigCast: false, oppBigPrev: false, veil: false, oppSkillPrev: false, lockPrev: false, lockFreeUsed: false, magic: 99, plantPrev: false, placedPrev: false, fireBase: 0, discount: emptyDiscount(), ...over,
});

describe('柳の下に二匹目がいた', () => {
    it('この手番に基礎コスト7以上のスキルを使っていれば0。使っていなければ6。手番でない席には掛けない', () => {
        expect(gearCostOf(env('you'), 6, false, 'onClickSecondCatch')).toBe(6);
        expect(gearCostOf(env('you', { bigCast: true }), 6, false, 'onClickSecondCatch')).toBe(0);
        expect(gearCostOf(env('you', { bigCast: true, seat: 1, player: '⭕' }), 6, false, 'onClickSecondCatch')).toBe(6);
        expect(gearCostOf(env('you', { bigCast: true }), 6, false, 'onClickStomp')).toBe(6); // ほかのスキルは変わらない
    });
});

describe('characterCostOf（キャラ補正）', () => {
    it('軍師: トークン系-1・それ以外+2 / 毒使い: 毒系-1・それ以外+1 / 陰陽師の陽: +1', () => {
        expect(characterCostOf(env('tactician'), 4, true, false)).toBe(3);
        expect(characterCostOf(env('tactician'), 4, false, false)).toBe(6);
        expect(characterCostOf(env('poisoner'), 4, false, true)).toBe(3);
        expect(characterCostOf(env('poisoner'), 4, false, false)).toBe(5);
        expect(characterCostOf(env('yinYangMaster', { yinYangMode: 'yang' }), 4, false, false)).toBe(5);
        expect(characterCostOf(env('yinYangMaster'), 4, false, false)).toBe(4);
    });
    it('煉獄の鍛冶師: 🔥を付与するスキルは-1（下限1）/ 凩の魔女: 盤面の🍂の枚数ぶん-1（下限1）', () => {
        expect(characterCostOf(env('pyromancer'), 3, false, false, 'onClickIgnite')).toBe(2);
        expect(characterCostOf(env('pyromancer'), 1, false, false, 'onClickIgnite')).toBe(1);
        expect(characterCostOf(env('pyromancer'), 3, false, false, 'onClickToken')).toBe(3);
        const b = board();
        b[0] = { player: '⭕', bind: 3, effects: [{ effect: '🍂' }, { effect: '🍂' }] };
        // 魔女自身は敵の🍂ぶん増える（⭕の🍂2枚 → +2）が、盤面の🍂2枚で-2: 4+2-2
        expect(characterCostOf(env('witch', { board: b }), 4, false, false)).toBe(4);
    });
});

describe('鍵師のパッシブ: 手番の最初のロック系スキルは何でも無料', () => {
    const lock = (character: CharacterId, over: Partial<CostEnv> = {}) => calculateCostOf(env(character, over), skillCosts.onClickUseLock, false, false, 'onClickUseLock');
    it('鍵師は無料の1回を使っていなければ0、使っていれば通常（鍵師の-1込みで下限1）', () => {
        expect(lock('keysmith', { lockFreeUsed: false })).toBe(0);
        expect(lock('keysmith', { lockFreeUsed: true })).toBe(Math.max(1, skillCosts.onClickUseLock - 1));
    });
    it('鍵師以外は常に通常のコスト', () => {
        expect(lock('you', { lockFreeUsed: false })).toBe(skillCosts.onClickUseLock);
        expect(calculateCostOf(env('you', { lockFreeUsed: false }), skillCosts.onClickDoubleLock, false, false, 'onClickDoubleLock')).toBe(skillCosts.onClickDoubleLock);
    });
    it('ダブルロック・延長など、ロック系なら何でも最初の1回は無料。使ったあとは通常（ロック系でないスキルは無料にならない）', () => {
        for (const key of ['onClickDoubleLock', 'onClickTripleLock', 'onClickLockExtend', 'onClickLockBlessing']) {
            const base = (skillCosts as Record<string, number>)[key];
            expect(calculateCostOf(env('keysmith', { lockFreeUsed: false }), base, false, false, key)).toBe(0);
            expect(calculateCostOf(env('keysmith', { lockFreeUsed: true }), base, false, false, key)).toBe(Math.max(1, base - 1));
        }
        expect(calculateCostOf(env('keysmith', { lockFreeUsed: false }), skillCosts.onClickBuds, false, false, 'onClickBuds')).toBeGreaterThan(0);
    });
    it('通常のコストが手持ちの魔力を超えるロック系は無料にならない（払える額のときだけ無料）', () => {
        const base = skillCosts.onClickSeal;
        const normal = calculateCostOf(env('keysmith', { lockFreeUsed: true }), base, false, false, 'onClickSeal');
        expect(calculateCostOf(env('keysmith', { magic: normal }), base, false, false, 'onClickSeal')).toBe(0);
        expect(calculateCostOf(env('keysmith', { magic: normal - 1 }), base, false, false, 'onClickSeal')).toBe(normal);
    });
    it('手番でない席（パネル表示用）には掛からない', () => {
        expect(lock('keysmith', { lockFreeUsed: false, turnSeat: 1 })).toBe(Math.max(1, skillCosts.onClickUseLock - 1));
    });
});

describe('gearCostOf（導線・無料条件・軽減スキル）', () => {
    it('手番でない席には軽減スキルを掛けない', () => {
        const d = afterSkill(emptyDiscount(), 'onClickMarkdown');
        expect(gearCostOf(env('you', { discount: d }), 6, false, 'onClickToken', false)).toBe(3);
        expect(gearCostOf(env('you', { discount: d, seat: 1, player: '⭕' }), 6, false, 'onClickToken', false)).toBe(6);
    });
    it('無礼講中のトークン系・初霜（盤面の🍂3枚以上）・供犠（自陣の式神3体以上）は0', () => {
        expect(gearCostOf(env('you', { tokenFree: true }), 4, true, 'onClickToken')).toBe(0);
        expect(gearCostOf(env('you', { tokenFree: true }), 4, false, 'onClickCharge')).toBe(4);
        const b = board();
        [0, 1, 2].forEach((i) => { b[i] = { player: '⭕', bind: 3, effects: [{ effect: '🍂' }] }; });
        expect(gearCostOf(env('you', { board: b }), 6, true, 'onClickFirstFrost')).toBe(0);
        const sh = board();
        [0, 1, 2].forEach((i) => { sh[i] = { player: '💙', bind: 2, effects: [], object: 'shikigami' }; });
        expect(gearCostOf(env('yinYangMaster', { board: sh }), 5, false, 'onClickShikigamiPurge')).toBe(0);
    });
    it('陰陽師は式神を置いた手番、全スキル-1（下限1）。置くスキル自身も安い', () => {
        expect(gearCostOf(env('yinYangMaster', { shikiPlaced: true }), 5, false, 'onClickStomp')).toBe(4);
        expect(gearCostOf(env('yinYangMaster'), 3, false, 'onClickShikigamiRandom')).toBe(2);
        expect(gearCostOf(env('yinYangMaster', { shikiPlaced: true }), 1, false, 'onClickStomp')).toBe(1);
    });
});

describe('calculateCostOf / tokenBindOf', () => {
    it('キャラ補正のあとにギア補正を掛ける（軍師のトークン: 4-1、軽量トークンでさらに-1）', () => {
        expect(calculateCostOf(env('tactician'), 4, true, false, 'onClickToken')).toBe(3);
        expect(calculateCostOf(env('tactician', { gears: ['lightToken'] }), 4, true, false, 'onClickToken')).toBe(2);
    });
    it('トークンのライフ: 軍師は6、他は4。増援で+2、軽量トークンで-1（下限1）', () => {
        expect(tokenBindOf('tactician', [])).toBe(6);
        expect(tokenBindOf('you', [])).toBe(4);
        expect(tokenBindOf('you', ['reinforce'])).toBe(6);
        expect(tokenBindOf('you', ['lightToken'])).toBe(3);
    });
});

describe('火口の無料条件（直前の手番に🌱🍂が植えられていれば0）', () => {
    it('plantPrev なら手番の席は0。そうでなければ通常のコスト（鍛冶師は-1）', () => {
        expect(calculateCostOf(env('pyromancer', { plantPrev: true }), 2, false, false, 'onClickTinder')).toBe(0);
        expect(calculateCostOf(env('pyromancer'), 2, false, false, 'onClickTinder')).toBe(1);
    });
    it('手番でない席には掛からない', () => {
        expect(calculateCostOf(env('pyromancer', { plantPrev: true, turnSeat: 1 }), 2, false, false, 'onClickTinder')).toBeGreaterThan(0);
    });
});

describe('飛び火の無料条件（直前の手番に相手がコマを2つ以上設置していれば0）', () => {
    it('placedPrev なら手番の席は0。そうでなければ通常のコスト（鍛冶師は4-1=3）', () => {
        expect(calculateCostOf(env('pyromancer', { placedPrev: true }), 4, false, false, 'onClickSpark')).toBe(0);
        expect(calculateCostOf(env('pyromancer'), 4, false, false, 'onClickSpark')).toBe(3);
        expect(calculateCostOf(env('you'), 4, false, false, 'onClickSpark')).toBe(4);
    });
    it('手番でない席には掛からない', () => {
        expect(calculateCostOf(env('pyromancer', { placedPrev: true, turnSeat: 1 }), 4, false, false, 'onClickSpark')).toBeGreaterThan(0);
    });
});

describe('大工房（オブジェクト）', () => {
    const withWorkshop = (over: Partial<CostEnv> = {}): CostEnv => {
        const b = board();
        b[0] = { player: '💙', bind: 5, effects: [], object: 'workshop' };
        return env('you', { board: b, ...over });
    };
    it('働いている間、ベースコスト7以上のスキルのコストを3軽減する。6以下は変わらない', () => {
        // 絶対零度(10)・審判の日(11)・火の車以外の大技。ベース6のスラッシュは対象外
        expect(calculateCostOf(withWorkshop(), skillCosts.onClickJudgeDay, false, false, 'onClickJudgeDay')).toBe(skillCosts.onClickJudgeDay - 3);
        expect(calculateCostOf(withWorkshop(), skillCosts.onClickPerfectGame, false, false, 'onClickPerfectGame')).toBe(skillCosts.onClickPerfectGame - 3);
        expect(calculateCostOf(withWorkshop(), skillCosts.onClickSlash, false, false, 'onClickSlash')).toBe(skillCosts.onClickSlash);
        expect(calculateCostOf(env('you'), skillCosts.onClickPerfectGame, false, false, 'onClickPerfectGame')).toBe(skillCosts.onClickPerfectGame);
    });
    it('2つあっても重ならない。氷結中の大工房は働かない。相手の大工房は効かない', () => {
        const two = withWorkshop();
        two.board[1] = { player: '💙', bind: 5, effects: [], object: 'workshop' };
        expect(calculateCostOf(two, 10, false, false, 'onClickPerfectGame')).toBe(7);
        const frozen = withWorkshop();
        frozen.board[0] = { ...frozen.board[0], effects: [{ effect: '❄' }] };
        expect(calculateCostOf(frozen, 10, false, false, 'onClickPerfectGame')).toBe(10);
        const enemy = withWorkshop();
        enemy.board[0] = { ...enemy.board[0], player: '⭕' };
        expect(calculateCostOf(enemy, 10, false, false, 'onClickPerfectGame')).toBe(10);
    });
    it('設置スキルは、直前に相手がベースコスト7以上のスキル/合計7以上のマジックを使っていれば0。そうでなければ通常のコスト', () => {
        expect(calculateCostOf(env('you', { oppBigPrev: true }), skillCosts.onClickWorkshop, false, false, 'onClickWorkshop')).toBe(0);
        expect(calculateCostOf(env('you'), skillCosts.onClickWorkshop, false, false, 'onClickWorkshop')).toBe(skillCosts.onClickWorkshop);
        expect(calculateCostOf(env('you', { oppBigPrev: true, turnSeat: 1 }), skillCosts.onClickWorkshop, false, false, 'onClickWorkshop')).toBe(skillCosts.onClickWorkshop); // 手番でない席には掛けない
    });
});

describe('招き猫（オブジェクト）', () => {
    const withCat = (over: Partial<CostEnv> = {}): CostEnv => {
        const b = board();
        b[0] = { player: '💙', bind: 5, effects: [], object: 'luckyCat' };
        return env('you', { board: b, ...over });
    };
    it('働いている間、自分のスキルのコストが1下がる（下限1・コスト1以下は変わらない）', () => {
        expect(calculateCostOf(withCat(), 4, false, false, 'onClickBibine')).toBe(3);
        expect(calculateCostOf(withCat(), 1, false, false, 'onClickShuffle')).toBe(1);
        expect(calculateCostOf(env('you'), 4, false, false, 'onClickBibine')).toBe(4);
    });
    it('2つあっても重ならない。氷結中・相手の招き猫は効かない', () => {
        const two = withCat();
        two.board[1] = { player: '💙', bind: 5, effects: [], object: 'luckyCat' };
        expect(calculateCostOf(two, 4, false, false, 'onClickBibine')).toBe(3);
        const frozen = withCat();
        frozen.board[0] = { ...frozen.board[0], effects: [{ effect: '❄' }] };
        expect(calculateCostOf(frozen, 4, false, false, 'onClickBibine')).toBe(4);
        const enemy = withCat();
        enemy.board[0] = { ...enemy.board[0], player: '⭕' };
        expect(calculateCostOf(enemy, 4, false, false, 'onClickBibine')).toBe(4);
    });
});
