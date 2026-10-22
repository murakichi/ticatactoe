// tsconfig の jsx は classic ("react") なので .tsx では React の import が必須
import React from 'react';
import * as fs from 'fs';
import * as path from 'path';
import { render } from '@testing-library/react';
import { BoardEffects, SkillEffectType } from './BoardEffects';
import { SKILL_CATALOG } from './deck';

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
    onClickShikigamiAll: 'shikigami',
    onClickShikigamiRandom: 'shikigami',
    onClickShikigamiFlood: 'shikigami',
    onClickBoost: 'harvest',
    onClickRelocate: 'windborne',
    onClickClone: 'sprout',
    onClickPlunder: 'famine',
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
    豊穣の舞: 'harvest',
    凶荒の舞: 'famine',
    蘇生: 'necromancy',
    ミアズマ: 'poison',
    帯電拡散: 'zap',
    業火: 'inferno',
    絶対零度: 'glacier',
};

const gameSource = fs.readFileSync(path.join(__dirname, 'Game.tsx'), 'utf8');

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

    it('バナーの文言は playEffect の label で上書きできる(同じ演出を共有するスキルの名前出し分け)', () => {
        const { container } = render(<BoardEffects effect={{ type: 'token', indexes: [1], label: 'ダブルトークン', nonce: 1 }} size={4} />);
        expect(container.querySelector('[class*="banner"]')?.textContent).toBe('ダブルトークン');
    });
});
