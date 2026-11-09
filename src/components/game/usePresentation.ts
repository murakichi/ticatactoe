// Game の「見せ方」だけの状態（盤面演出・ギアのチップ・スキル帯のスクロール端・効果音）。
// ゲームの規則とは独立なので、Game.tsx から切り出してある。
import { useEffect, useRef, useState } from 'react';
import { SkillEffect, SkillEffectType, BurstEffect, BurstType } from './BoardEffects';
import { isUniqueEffect } from './UniqueEffects';
import { GearToast } from './GearToasts';
import { GearId, gearDefOf } from './gear';
import { isMuted, playSfx, setMuted } from '../../sound';

export type PlayEffectExtra = { variant?: string; sources?: number[] };

/** 盤面のハイライト・ホバープレビュー・スキル発動演出・マスに重ねる小演出 */
export const useBoardEffects = () => {
    // 実際に破壊されたマスを濃い目の黄色で点滅させるためのインデックス
    const [highlightedCells, setHighlightedCells] = useState<number[]>([]);
    // ホバー時に破壊範囲をレモン色でプレビューするためのインデックス
    const [previewCells, setPreviewCells] = useState<number[]>([]);
    // スキル発動時の盤面エフェクト
    const [boardEffect, setBoardEffect] = useState<SkillEffect | null>(null);
    // マスに重ねる小演出（氷結が砕ける・解凍・燃焼）。メインの演出と同時に出せる
    const [boardBurst, setBoardBurst] = useState<BurstEffect | null>(null);

    const playEffect = (type: SkillEffectType, index?: number, indexes?: number[], label?: string, extra?: PlayEffectExtra) => {
        playSfx(type);
        setBoardEffect((prev) => ({ type, index, indexes, label, ...extra, nonce: (prev?.nonce ?? 0) + 1 }));
        // 固有スキルは予兆→本体→余波の多段演出なので長めに出す
        setTimeout(() => setBoardEffect(null), isUniqueEffect(type) ? 2100 : 1400);
    };
    const playBurst = (type: BurstType, cells: number[]) => {
        if (cells.length === 0) return;
        playSfx(type);
        setBoardBurst((prev) => ({ type, cells, nonce: (prev?.nonce ?? 0) + 1 }));
        setTimeout(() => setBoardBurst(null), 1200);
    };
    const flashCells = (indexes: number[]) => {
        // スキル実行時はホバープレビューを消して破壊演出に切り替える
        setPreviewCells([]);
        if (indexes.length === 0) return;
        setHighlightedCells(indexes);
        setTimeout(() => setHighlightedCells([]), 1200);
    };
    return { highlightedCells, setHighlightedCells, previewCells, setPreviewCells, boardEffect, setBoardEffect, boardBurst, setBoardBurst, playEffect, playBurst, flashCells };
};

/** ギアの発動を知らせる(盤面上端のチップ + 効果音)。スキルの盤面演出とは別枠なので、同時に起きても上書きしない。
 *  同じギア・同じ文言が短時間に続いたら1つにまとめる(StrictMode の二重実行や、同じ手の中の連続発動で、チップが並びすぎないように) */
export const useGearToasts = () => {
    const [gearToasts, setGearToasts] = useState<GearToast[]>([]);
    const gearToastSeq = useRef(0);
    const lastGearToast = useRef<{ key: string; at: number } | null>(null);
    const gearTrigger = (gearId: GearId, text?: string) => {
        const def = gearDefOf(gearId);
        const key = `${gearId}:${text ?? ''}`;
        const now = Date.now();
        if (lastGearToast.current && lastGearToast.current.key === key && now - lastGearToast.current.at < 400) return;
        lastGearToast.current = { key, at: now };
        playSfx('gear');
        const id = ++gearToastSeq.current;
        // 積み上がりすぎないよう、同時に出すのは最新の3つまで
        setGearToasts((prev) => [...prev, { id, icon: def.icon, name: def.name, text }].slice(-3));
        setTimeout(() => setGearToasts((prev) => prev.filter((t) => t.id !== id)), 2300);
    };
    return { gearToasts, setGearToasts, gearTrigger };
};

/** スキルカードは横一列で、はみ出す側にだけ「‹ ›」と端のフェードを出す(横に続くことを見落とさないため) */
export const useSkillStrip = () => {
    const skillGridRef = useRef<HTMLDivElement>(null);
    const [stripEdge, setStripEdge] = useState<{ left: boolean; right: boolean }>({ left: false, right: false });
    const updateStripEdge = () => {
        const el = skillGridRef.current;
        if (!el) return;
        const left = el.scrollLeft > 4;
        const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
        setStripEdge((prev) => (prev.left === left && prev.right === right ? prev : { left, right }));
    };
    const scrollStrip = (dir: -1 | 1) => skillGridRef.current?.scrollBy({ left: dir * 160, behavior: 'smooth' });
    // 手札・表示モード・画面幅が変わったら判定し直す(依存を付けず毎描画で判定。値が同じなら再描画されない)
    useEffect(updateStripEdge);
    useEffect(() => {
        window.addEventListener('resize', updateStripEdge);
        return () => window.removeEventListener('resize', updateStripEdge);
    }, []);
    return { skillGridRef, stripEdge, scrollStrip, updateStripEdge };
};

/** 効果音のオン/オフ(設定は localStorage に保存される) */
export const useSoundToggle = () => {
    const [soundOn, setSoundOn] = useState<boolean>(!isMuted());
    const onClickToggleSound = () => {
        const next = !soundOn;
        setMuted(!next);
        setSoundOn(next);
        // オンにした瞬間に確認音を鳴らす(ブラウザの音声再開も兼ねる)
        if (next) playSfx('charge');
    };
    return { soundOn, onClickToggleSound };
};
