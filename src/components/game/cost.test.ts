import { CostEnv, calculateCostOf, characterCostOf, gearCostOf, tokenBindOf } from './cost';
import { emptyDiscount, afterSkill } from './discount';
import { SquareInfo } from '../../types/SquareInfo';
import { CharacterId } from '../../types/Character';

const board = (): SquareInfo[] => Array.from({ length: 16 }, () => ({ player: undefined, bind: 0, effects: [] }));
const env = (character: CharacterId, over: Partial<CostEnv> = {}): CostEnv => ({
    board: board(), seat: 0, player: '💙', turnSeat: 0, characters: [character, 'you'], yinYangMode: 'ying', gears: [],
    ctx: { skillsThisTurn: 0, echoReady: false }, leafBase: 0, kinds: new Set(), chargeBase: 0, shikiPlaced: false,
    tokenFree: false, oppSkillPrev: false, plantPrev: false, placedPrev: false, fireBase: 0, discount: emptyDiscount(), ...over,
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
        [0, 1, 2].forEach((i) => { sh[i] = { player: '💙', bind: 2, effects: [{ effect: '📜' }] }; });
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

