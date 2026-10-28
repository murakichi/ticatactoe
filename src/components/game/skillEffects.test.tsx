// tsconfig の jsx は classic ("react") なので .tsx では React の import が必須
import React from 'react';
import * as fs from 'fs';
import * as path from 'path';
import { render } from '@testing-library/react';
import { BoardEffects, SkillEffectType } from './BoardEffects';
import { SKILL_CATALOG } from './deck';
import { UNIQUE_EFFECT_TYPES } from './UniqueEffects';

// 「全スキルにアニメーションがある」ことを守る登録表。
// スキルごとに、発動時に Game.tsx の playEffect で出す演出の種類を書く。
// 新しいスキルを SKILL_CATALOG に足したら、ここにも登録しないとテストが落ちる(演出を付け忘れない)。
// 'own' は専用の演出UIを持つスキルで、その目印になるソース上の文字列を値に持つ。
type Entry = SkillEffectType | { own: string };

const CATALOG_SKILL_EFFECTS: Record<string, Entry> = {
    onClickAddLife: 'heal',
    onClickBibine: 'double',
    onClickBuds: 'bloom',
    onClickDoubleBuds: 'bloom',
    onClickToken: 'token',
    onClickBothToken: 'token',
    onClickDoubleToken: 'token',
    onClickBudsToken: 'token',
    onClickPoisonToken: 'token',
    onClickSlash: 'slash',
    onClickBackSlash: 'backslash',
    onClickTsunami: 'tsunami',
    onClickOpium: 'opium',
    onClickDoubleLock: 'lock',
    onClickTripleLock: 'lock',
    onClickWalpurgisNight: 'auraGreen',
    onClickInjection: 'poison',
    onClickSerum: 'cleanse',
    onClickIntensify: 'poison',
    onClickPandemic: 'poison',
    onClickPoisonMist: 'poison',
    onClickProliferate: 'proliferate',
    onClickChargeToken: 'zap',
    onClickChargeOne: 'zap',
    onClickDoubleChargeToken: 'zap',
    onClickChargeArea: 'zap',
    onClickChargeRandom: 'zap',
    onClickJammer: 'zap',
    onClickHailMary: { own: 'setHailMarySpin(' },
    onClickRandomCast: { own: 'picked.idx' },
    onClickSilence: 'silence',
    onClickFreeze: 'freeze',
    onClickFrostArea: 'freeze',
    onClickIcicle: 'freeze',
    onClickRandomFreeze: 'freeze',
    onClickFreezeSpread: 'freeze',
    onClickFrostToken: 'freeze',
    onClickDoubleFrostToken: 'freeze',
    onClickFrostfall: 'freeze',
    onClickShatter: 'glacierBurst',
    onClickIgnite: 'flame',
    onClickFlameToken: 'flame',
    onClickDoubleFlameToken: 'flame',
    onClickSwidden: 'flame',
    onClickSacrifice: 'flame',
    onClickBurnout: 'inferno',
    onClickCleanse: 'cleanse',
    onClickHarvestEve: 'harvestEve',
    onClickSolstice: 'solstice',
    onClickSucker: 'sprout',
    onClickWindborne: 'windborne',
    onClickLeafToken: 'token',
    onClickTwinLeafToken: 'token',
    onClickDoubleLeafToken: 'token',
    onClickBothLeafToken: 'token',
    onClickBonfire: 'autumn',
    onClickMulch: 'autumn',
    onClickAutumn: 'autumn',
    onClickLeafFrost: 'freeze',
    onClickSpringWind: 'discount',
    onClickKimon: 'lock',
    onClickFireWheel: 'flame',
    onClickStrip: 'silence',
    onClickChargeSeason: 'zap',
    onClickBristle: 'zap',
    onClickRelease: 'zap',
    onClickStash: 'zap',
    onClickThunderFire: 'flame',
    onClickDarkPot: 'poison',
    onClickChargeHeal: 'heal',
    onClickBoost: 'rain',
    onClickRelocate: 'dash',
    onClickClone: 'clone',
    onClickPlunder: 'plunder',
    onClickShikigamiAll: 'shikigami',
    onClickShikigamiRandom: 'shikigami',
    onClickShikigamiFlood: 'shikigami',
    onClickMarkdown: 'discount',
    onClickEffectDiscount: 'discount',
    onClickTokenDiscount: 'discount',
    onClickVitalMarkdown: 'discount',
    onClickUniqueDiscount: 'discount',
    onClickClearance: 'discount',
    onClickCounterMarkdown: 'discount',
};

// カタログ(デッキに入る汎用スキル)の外にある、基本操作とキャラ固有スキル
const OTHER_SKILL_EFFECTS: Record<string, Entry> = {
    チャージ: 'chargeUp',
    シャッフル: 'shuffle',
    ロック: 'lock',
    全軍突撃: 'assault',
    ストンプ: 'stomp',
    審判の日: 'judge',
    陰陽転化: 'yinyang',
    // 陰陽転化後のモードで出し分ける(playEffect(mode === 'yang' ? 'harvest' : 'famine'))
    式神設置: 'shikigami',
    式神爆破: 'shikigamiBlast',
    蘇生: 'necromancy',
    ミアズマ: 'miasma',
    帯電拡散: 'chainZap',
    業火: 'inferno',
    絶対零度: 'glacier',
};

const gameSource = fs.readFileSync(path.join(__dirname, 'Game.tsx'), 'utf8');

// 他のスキルと演出(の種類)を共有するスキルは、バナーに自分の名前が出ること(別スキルの名前が出ないこと)を守る。
// 名前は Game.tsx の playEffect / freezeCells の引数に文字列で渡している
const OWN_BANNER_LABELS: Record<string, string> = {
    onClickLeafFrost: '霜枯れ',
    onClickSpringWind: '春一番',
    onClickKimon: '鬼門封じ',
    onClickFireWheel: '火の車',
    onClickStrip: '裸の王様',
    onClickChargeSeason: '静電気の季節',
    onClickBristle: '総毛立つ',
    onClickRelease: '落雷は忘れた頃に',
    onClickStash: '雷神のへそくり',
    onClickThunderFire: '雷のない所に火は立たぬ',
    onClickDarkPot: '一寸先は闇鍋',
    onClickChargeHeal: '雷を食らわば皿まで',
    onClickBonfire: '焚き火の唄',
    onClickMulch: '腐葉土の目覚め',
    onClickAutumn: '一葉知秋',
    onClickBuds: 'バッズ',
    onClickDoubleBuds: 'ダブルバッズ',
    onClickToken: 'トークン',
    onClickBothToken: '両トークン',
    onClickDoubleToken: 'ダブルトークン',
    onClickBudsToken: 'バッズトークン',
    onClickPoisonToken: 'ポイズントークン',
    onClickSerum: '血清',
    onClickInjection: 'インジェクション',
    onClickIntensify: '猛毒化',
    onClickPandemic: 'パンデミック',
    onClickPoisonMist: '毒霧',
    onClickFrostArea: '範囲氷結',
    onClickIcicle: '氷柱',
    onClickRandomFreeze: 'ランダム氷結',
    onClickFreezeSpread: '氷結拡散',
    onClickFrostfall: '霜降り',
    onClickFrostToken: '氷結トークン',
    onClickDoubleFrostToken: '氷結ダブルトークン',
    onClickShatter: '砕氷',
    onClickIgnite: '火遁',
    onClickFlameToken: '火炎トークン',
    onClickDoubleFlameToken: '火炎ダブルトークン',
    onClickSwidden: '焼畑',
    onClickSacrifice: '殉火',
    onClickChargeOne: '帯電付与',
    onClickChargeArea: '範囲帯電',
    onClickChargeToken: '帯電トークン',
    onClickDoubleChargeToken: '帯電ダブルトークン',
    onClickChargeRandom: 'ランダム帯電',
    onClickJammer: 'ジャマー',
};

describe('全スキルに演出がある', () => {
    it('SKILL_CATALOG の全スキルが登録表にある(新スキルの演出の付け忘れ防止)', () => {
        const registered = new Set(Object.keys(CATALOG_SKILL_EFFECTS));
        const missing = SKILL_CATALOG.filter((e) => !registered.has(e.costKey)).map((e) => `${e.name}(${e.costKey})`);
        expect(missing).toEqual([]);
        // 登録表に余計なキー(削除済みスキル)が残っていないこと
        const known = new Set<string>(SKILL_CATALOG.map((e) => e.costKey));
        expect(Object.keys(CATALOG_SKILL_EFFECTS).filter((k) => !known.has(k))).toEqual([]);
    });

    const all: [string, Entry][] = [...Object.entries(CATALOG_SKILL_EFFECTS), ...Object.entries(OTHER_SKILL_EFFECTS)];

    it.each(all)('%s の演出は Game.tsx で実際に呼ばれている', (_name, entry) => {
        if (typeof entry === 'string') expect(gameSource).toContain(`playEffect('${entry}'`);
        else expect(gameSource).toContain(entry.own);
    });

    const types = Array.from(new Set(all.map(([, e]) => e).filter((e): e is SkillEffectType => typeof e === 'string')));

    it.each(types)('演出 %s はバナーと演出要素を描画する', (type) => {
        const { container } = render(<BoardEffects effect={{ type, index: 5, indexes: [0, 5, 10], nonce: 1 }} size={4} />);
        // スキル名のバナー(文字)が出る
        expect(container.querySelector('[class*="banner"]')?.textContent?.length).toBeGreaterThan(0);
        // バナー以外の演出要素(オーラ・パーティクル・マスの絵文字など)が1つ以上ある
        expect(container.querySelectorAll('div,span').length).toBeGreaterThan(2);
    });

    it.each(Object.entries(OWN_BANNER_LABELS))('%s は演出のバナーに自分の名前「%s」を出す', (_key, label) => {
        // `playEffect('type', …, 'ラベル')` か `freezeCells(…, 'ラベル')` の形で、スキル名が渡されている
        const pattern = new RegExp(`(playEffect|freezeCells)\\([^;\\n]*'${label}'`);
        expect(gameSource).toMatch(pattern);
    });

    it('バナーの文言は playEffect の label で上書きできる(同じ演出を共有するスキルの名前出し分け)', () => {
        const { container } = render(<BoardEffects effect={{ type: 'token', indexes: [1], label: 'ダブルトークン', nonce: 1 }} size={4} />);
        expect(container.querySelector('[class*="banner"]')?.textContent).toBe('ダブルトークン');
    });

    // 固有スキルは「予兆 → 本体 → 余波」の多段演出。汎用の「オーラ+パーティクル」より要素が多いこと
    it.each(UNIQUE_EFFECT_TYPES.filter((t) => t !== 'yinyang'))('固有スキル %s の演出は多段(要素が十分ある)で、時間差(animation-delay)も付く', (type) => {
        const { container } = render(<BoardEffects effect={{ type, index: 5, indexes: [0, 5, 10], sources: [1, 2], nonce: 1 }} size={4} />);
        expect(container.querySelectorAll('div,span').length).toBeGreaterThanOrEqual(10);
        const delayed = Array.from(container.querySelectorAll<HTMLElement>('[style]')).filter((el) => parseFloat(el.style.animationDelay || '0') > 0);
        expect(delayed.length).toBeGreaterThanOrEqual(3);
    });

    it('陰陽転化は variant の文字(陰/陽)を太極図に出す', () => {
        const { container } = render(<BoardEffects effect={{ type: 'yinyang', variant: '陽', nonce: 1 }} size={4} />);
        expect(container.textContent).toContain('陽');
    });

    it.each([4, 5, 7, 10])('固有スキルの演出は盤面サイズ %i でも描画できる', (size) => {
        for (const type of UNIQUE_EFFECT_TYPES) {
            const { container, unmount } = render(<BoardEffects effect={{ type, index: size + 1, indexes: [0, size + 1, size * size - 1], sources: [1], nonce: 1 }} size={size} />);
            expect(container.querySelectorAll('div,span').length).toBeGreaterThan(5);
            unmount();
        }
    });
});
