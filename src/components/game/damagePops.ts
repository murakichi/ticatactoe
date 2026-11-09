import { SquareInfo } from '../../types/SquareInfo';
import { DamagePop } from './BoardEffects';

/** 着手などの処理の中で積んだ、原因の分かるダメージ(マス → 内訳)。icon は 🔥☠⚡、無ければ自然減衰 */
export type DamageHints = Map<number, { icon?: string; amount: number }[]>;

/**
 * 前の盤面と今の盤面から、コマが受けたダメージの表示を作る。
 * - hints にある分は、そのまま(絵文字付きで)出す
 * - 同じ持ち主のコマのライフが、hints の合計より多く減っていれば、その差を絵文字なしで足す(攻撃・スキルなど、原因を積んでいないもの)
 * - 持ち主が変わった(奪われた・壊れた)マスは、差を数えない(hints があればそれだけ出す)
 */
export const buildDamagePops = (prev: SquareInfo[], cur: SquareInfo[], hints: DamageHints): DamagePop[] => {
    if (prev.length !== cur.length) return [];
    const items: DamagePop[] = [];
    cur.forEach((sq, k) => {
        const lines = [...(hints.get(k) ?? [])].filter((l) => l.amount > 0);
        const hinted = lines.reduce((n, l) => n + l.amount, 0);
        const before = prev[k];
        const diff = before.player && sq.player === before.player ? before.bind - sq.bind : 0;
        if (diff > hinted) lines.push({ amount: diff - hinted });
        if (lines.length > 0) items.push({ cell: k, lines });
    });
    return items;
};
