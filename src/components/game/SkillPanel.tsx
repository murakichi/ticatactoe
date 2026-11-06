// tsconfig の jsx は classic ("react") なので .tsx では React の import が必須
import React from 'react';
import styles from './Game.module.css';
import { SkillButton } from './SkillButton';

/** スキルカード1枚ぶんの定義。SkillButton の props から、全カード共通のもの（restrict など）を除いた形 */
export interface SkillCardDef {
    key: string | number;
    onClick: () => void;
    buttonText: string;
    paragraph: string;
    disabled?: boolean;
    hidden?: boolean;
    exclusive?: boolean;
    locked?: boolean;
    onToggleLock?: () => void;
    onHoverStart?: () => void;
    onHoverEnd?: () => void;
}

export interface SkillPanelProps {
    cards: SkillCardDef[];
    /** 全カード共通 */
    restrict: (buttonText: string) => boolean;
    inputBlocked: boolean;
    magic: number;
    tokenUsed: boolean;
    expandAll: boolean;
    onToggleExpandAll: () => void;
    /** サイレンス中（この手番はスキルを使えない） */
    silenced: boolean;
    /** ヘイルメアリーの演出中（入力を止める） */
    busy: boolean;
    /** カード帯の端のフェードと「‹ ›」 */
    stripEdge: { left: boolean; right: boolean };
    onScrollStrip: (dir: -1 | 1) => void;
    gridRef: React.RefObject<HTMLDivElement>;
    onGridScroll: () => void;
}

/** スキルカードの帯（横一列。はみ出す側にだけ「‹ ›」を出す） */
export const SkillPanel = (p: SkillPanelProps) => (
    <div className={`${styles.skills}${p.busy || p.silenced ? ` ${styles.skillsBusy}` : ''}`}>
        <div className={styles.skillsHead}>
            <div className={styles.skillsTitle}>スキル{p.silenced && <span className={styles.silenceNote}> サイレンス中: この手番はスキルを使えません</span>}</div>
            <button type='button' className={styles.expandAll} aria-pressed={p.expandAll} onClick={p.onToggleExpandAll}>
                {p.expandAll ? '説明をすべて閉じる' : '説明をすべて開く'}
            </button>
        </div>
        <div className={styles.skillStrip}>
            {p.stripEdge.left && (
                <button type='button' className={`${styles.stripArrow} ${styles.stripLeft}`} aria-label='左のスキルを見る' onClick={() => p.onScrollStrip(-1)}>
                    ‹
                </button>
            )}
            <div className={styles.skillGrid} ref={p.gridRef} onScroll={p.onGridScroll}>
                {p.cards.map(({ key, ...card }) => (
                    <SkillButton
                        key={key}
                        restrict={p.restrict}
                        inputBlocked={p.inputBlocked}
                        magic={p.magic}
                        tokenUsed={p.tokenUsed}
                        expandAll={p.expandAll}
                        {...card}
                    />
                ))}
            </div>
            {p.stripEdge.right && (
                <button type='button' className={`${styles.stripArrow} ${styles.stripRight}`} aria-label='右のスキルを見る' onClick={() => p.onScrollStrip(1)}>
                    ›
                </button>
            )}
        </div>
    </div>
);
