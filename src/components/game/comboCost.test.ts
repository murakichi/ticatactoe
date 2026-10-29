import { comboCut, comboFloor, ownCharges, ownLeaves, boardEffectCount, boardPieceCount, reduceCount, GATHER_CUT, BURN_OFF_CUT, COMBO_CUT, CHARGE_GRANT_KEYS } from './comboCost';
import { SquareInfo } from '../../types/SquareInfo';


const sq = (player: SquareInfo['player'], effects: SquareInfo['effects'] = []): SquareInfo => ({ bind: 3, player, effects });
const LEAF = { effect: '🍂' as const };
const BOLT = { effect: '⚡' as const };
const FREEZE = { effect: '❄' as const };
const LOCK = { effect: '🔑' as const };

describe('導線(コンボ)の軽減', () => {
    test('紅葉狩り: 自陣の🍂が手番開始より増えていれば-2', () => {
        const board = [sq('💙', [LEAF]), sq('⭕', [LEAF, LEAF])];
        expect(ownLeaves(board, '💙')).toBe(1);
        expect(comboCut('onClickDoubleLeafToken', board, '💙', 0, new Set())).toBe(COMBO_CUT);
        expect(comboCut('onClickDoubleLeafToken', board, '💙', 1, new Set())).toBe(0);
    });
    test('総毛立つ: ⚡を付与するスキルを使っていれば-2（静電気の季節・総毛立つ自身は数えない）', () => {
        const board = [sq('💙')];
        expect(comboCut('onClickBristle', board, '💙', 0, new Set())).toBe(0);
        expect(comboCut('onClickBristle', board, '💙', 0, new Set(['onClickChargeSeason']))).toBe(0);
        expect(comboCut('onClickBristle', board, '💙', 0, new Set(['onClickChargeOne']))).toBe(COMBO_CUT);
    });
    test('静電気の季節: 自陣に⚡が無ければ-2（敵の⚡は数えない）', () => {
        expect(comboCut('onClickChargeSeason', [sq('💙')], '💙', 0, new Set())).toBe(COMBO_CUT);
        expect(comboCut('onClickChargeSeason', [sq('💙', [BOLT])], '💙', 0, new Set())).toBe(0);
        expect(comboCut('onClickChargeSeason', [sq('⭕', [BOLT])], '💙', 0, new Set())).toBe(COMBO_CUT);
        expect(ownCharges([sq('💙', [BOLT, BOLT])], '💙')).toBe(2);
    });
    test('一寸先は闇鍋: 盤面のエフェクトの数だけ（空きマス・敵のコマも数え、式神の印は数えない）', () => {
        const board = [sq('💙', [LEAF, BOLT]), sq('⭕', [BOLT]), sq(undefined, [{ effect: '🔑' as const }]), sq('💙', [{ effect: '📜' as const }])];
        expect(boardEffectCount(board)).toBe(4);
        expect(comboCut('onClickDarkPot', board, '💙', 0, new Set())).toBe(4);
        expect(comboCut('onClickDarkPot', [sq('💙')], '💙', 0, new Set())).toBe(0);
    });
    test('雷を食らわば皿まで: この手番に付与した⚡（自陣の⚡が手番開始 chargeBase より増えたぶん）だけ。下限1のスキルは闇鍋と同じ', () => {
        const board = [sq('💙', [BOLT, BOLT]), sq('💙', [BOLT]), sq('⭕', [BOLT])];
        expect(comboCut('onClickChargeHeal', board, '💙', 0, new Set(), 1)).toBe(2);
        expect(comboCut('onClickChargeHeal', board, '💙', 0, new Set(), 3)).toBe(0);
        expect(comboCut('onClickChargeHeal', board, '💙', 0, new Set(), 5)).toBe(0); // 減っても負にならない
        expect(comboFloor('onClickChargeHeal')).toBe(1);
        expect(comboFloor('onClickDarkPot')).toBe(1);
        expect(comboFloor('onClickBristle')).toBe(0);
    });
    test('一寸の虫に魂なし: 盤面のコマの数だけ（敵味方とも）。下限1', () => {
        const board = [sq('💙'), sq('⭕'), sq(undefined, [BOLT]), sq('⭕', [BOLT])];
        expect(boardPieceCount(board)).toBe(3);
        expect(comboCut('onClickSmallFry', board, '💙', 0, new Set())).toBe(3);
        expect(comboFloor('onClickSmallFry')).toBe(1);
    });
    test('対象外のスキルは常に0', () => {
        expect(comboCut('onClickToken', [sq('💙')], '💙', 0, new Set(CHARGE_GRANT_KEYS))).toBe(0);
        expect(comboCut(undefined, [sq('💙')], '💙', 0, new Set())).toBe(0);
    });

    test('吹き寄せ・山焼き: 氷結のマスは❄の数だけ・🔑自体と📜は数えず、ロックのマスの他のエフェクトは数える。1つにつき2/3軽減で下限1', () => {
        // 1:🌱🍂(2) 2:❄🌱☠ → ❄だけ(1) 3:🔑🌱 → 🌱(1) 4:📜だけ(0) 5:❄❄(2) = 6
        const board = [sq('💙', [{ effect: '🌱' }, LEAF]), sq('⭕', [FREEZE, { effect: '🌱' }, { effect: '☠' }]), sq('💙', [LOCK, { effect: '🌱' }]), sq('⭕', [{ effect: '📜' }]), sq('⭕', [FREEZE, FREEZE])];
        expect(reduceCount(board)).toBe(6);
        expect(comboCut('onClickGather', board, '💙', 0, new Set())).toBe(GATHER_CUT * 6);
        expect(comboCut('onClickBurnOff', board, '💙', 0, new Set())).toBe(BURN_OFF_CUT * 6);
        expect(comboFloor('onClickGather')).toBe(1);
        expect(comboFloor('onClickBurnOff')).toBe(1);
    });
});
