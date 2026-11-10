// Game.tsx から切り出したハンドラ群: プレイヤーパネルに出す継続中の効果と、固有スキルの現在コスト
// 本体は Game.tsx にあったものをそのまま移した。Game の変数は scope(g) で、あとで定義されるもの(calculateCost など)は late() 経由で受け取る
import { YingYangMode } from '../../types/Character';
import { CharacterId } from '../../types/Character';
import { proliferateUpkeep } from './turn';
import { SkillCosts } from './skillCosts';
import { GameLate } from './gameLate';

export interface PanelInfoScope {
    skillBan: ({ mode: "max" | "min"; n: number; } | null)[];
    useAssault: number[];
    silenced: boolean[];
    lifeBan: boolean[];
    chargeBuff: number[];
    gearOff: boolean[];
    discountLabel: (seat: number) => string | null;
    budGuard: boolean[];
    remainNecro: number[];
    proliferate: boolean[];
    proliferateCount: number[];
    costTableFor: (seat: number) => SkillCosts;
    gearCost: (cost: number, seat?: number, isToken?: boolean, skillKey?: string | undefined, withLeaf?: boolean) => number;
    characters: CharacterId[];
    useTokenCount: number[];
    useMagicCount: number[];
    yinYangMode: (YingYangMode | undefined)[];
    necroCost: number[];
    miasmaCost: (player?: "💙" | "⭕" | "🟩" | "🔶" | "⭐" | "🟣" | "🟫" | "🩷") => number;
    symbols: ("💙" | "⭕" | "🟩" | "🔶" | "⭐" | "🟣" | "🟫" | "🩷")[];
    chargeSpreadCost: (player?: "💙" | "⭕" | "🟩" | "🔶" | "⭐" | "🟣" | "🟫" | "🩷") => number;
    glacierCost: (player?: "💙" | "⭕" | "🟩" | "🔶" | "⭐" | "🟣" | "🟫" | "🩷") => number;
    infernoCost: (player?: "💙" | "⭕" | "🟩" | "🔶" | "⭐" | "🟣" | "🟫" | "🩷") => number;
    mogaribueCost: (player?: "💙" | "⭕" | "🟩" | "🔶" | "⭐" | "🟣" | "🟫" | "🩷") => number;
    sealCost: (player?: "💙" | "⭕" | "🟩" | "🔶" | "⭐" | "🟣" | "🟫" | "🩷") => number;
    prayerCost: (player?: "💙" | "⭕" | "🟩" | "🔶" | "⭐" | "🟣" | "🟫" | "🩷") => number;
    roarCost: (player?: "💙" | "⭕" | "🟩" | "🔶" | "⭐" | "🟣" | "🟫" | "🩷") => number;
    dragon: { form: 'miko' | 'dragon'; n: number }[];
}
export const usePanelInfo = (g: PanelInfoScope, late: () => GameLate) => {
    const { dragon, prayerCost, roarCost, useAssault, silenced, lifeBan, chargeBuff, gearOff, discountLabel, budGuard, remainNecro, proliferate, proliferateCount, costTableFor, gearCost, characters, useTokenCount, useMagicCount, yinYangMode, necroCost, miasmaCost, symbols, chargeSpreadCost, glacierCost, infernoCost, mogaribueCost, sealCost, skillBan } = g;


    // 継続中スキルの残りターン数を返す
    const continuousEffects = (seat: number): string[] => {
        const labels: string[] = [];
        const assault = useAssault[seat];
        if (assault > 0) labels.push(`全軍突撃 残り${assault}ターン`);
        if (silenced[seat]) labels.push('サイレンス 次の手番スキル不可');
        const ban = skillBan[seat];
        if (ban) labels.push(`スキル封じ 次の手番、コスト${ban.n}${ban.mode === 'max' ? '以下' : '以上'}のスキル不可`);
        if (lifeBan[seat]) labels.push('一寸の虫に魂なし ライフ3以下のコマを置けない');
        if (chargeBuff[seat] > 0) labels.push(`静電気の季節 残り${chargeBuff[seat]}ターン`);
        if (gearOff[seat]) labels.push('裸の王様 ギア無効（その手番の終わりまで）');
        const dl = discountLabel(seat);
        if (dl) labels.push(dl);
        if (budGuard[seat]) labels.push('冬至の種子 🌱は火炎で消えず氷結中も働く');
        const necro = remainNecro[seat];
        if (necro > 0) labels.push(`蘇生 残り${necro}ターン`);
        if (proliferate[seat]) {
            const count = proliferateCount[seat];
            labels.push(`増殖 ${count}回目 (次の維持${proliferateUpkeep(count)})`);
        }
        return labels;
    };

    // キャラ固有スキルの現在コスト(スキルボタンの表示と同じ値)。固有スキルのないキャラは空
    const exclusiveSkillCosts = (seat: number): { name: string; cost: number }[] => {
        const sc = costTableFor(seat);
        const g = (cost: number) => gearCost(cost, seat);
        switch (characters[seat]) {
            case 'tactician':
                return [{ name: '全軍突撃', cost: g(sc.onClickTotalAssault - useTokenCount[seat] * 2) }];
            case 'giant':
                return [{ name: 'ストンプ', cost: g(sc.onClickStomp) }];
            case 'magician':
                return [{ name: '審判の日', cost: g(Math.max(0, sc.onClickJudgeDay - useMagicCount[seat])) }];
            case 'yinYangMaster': {
                const yang = yinYangMode[seat] === 'yang';
                return [
                    { name: '陰陽転化', cost: g(sc.onClickToggleYingYang) },
                    yang ? { name: '式神爆破', cost: g(sc.onClickShikigamiBlast) } : { name: '式神設置', cost: g(sc.onClickShikigamiPlace) },
                ];
            }
            case 'necromancer':
                return [{ name: '蘇生', cost: g(necroCost[seat]) }];
            case 'poisoner':
                return [{ name: 'ミアズマ', cost: miasmaCost(symbols[seat]) }];
            case 'electrician':
                return [{ name: '帯電拡散', cost: chargeSpreadCost(symbols[seat]) }];
            case 'cryomancer':
                return [{ name: '絶対零度', cost: glacierCost(symbols[seat]) }];
            case 'pyromancer':
                return [{ name: '業火', cost: infernoCost(symbols[seat]) }];
            case 'witch':
                return [{ name: '虎落笛', cost: mogaribueCost(symbols[seat]) }];
            case 'keysmith':
                return [{ name: '封鎖の断', cost: sealCost(symbols[seat]) }];
            case 'dragonMiko':
                return dragon[seat]?.form === 'dragon'
                    ? [{ name: '八百万の祈り', cost: prayerCost(symbols[seat]) }, { name: '龍の咆哮', cost: roarCost(symbols[seat]) }]
                    : [{ name: '八百万の祈り', cost: prayerCost(symbols[seat]) }];
            default:
                return [];
        }
    };

    return { exclusiveSkillCosts, continuousEffects };
};
