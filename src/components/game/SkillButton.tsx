import React, { useEffect, useId, useState } from 'react';
import styles from './SkillButton.module.css';
import { CATEGORY_LABEL, metaOf, parseSkillText } from './skillMeta';

type SkillButtonProps = {
    onClick: () => void;
    disabled?: boolean;
    hidden?: boolean;
    /** `名前-コスト` 形式(例: ロック-2)。アクセシブル名にもなる */
    buttonText: string;
    paragraph: string;
    onHoverStart?: () => void;
    onHoverEnd?: () => void;
    locked?: boolean;
    onToggleLock?: () => void;
    /** 手番プレイヤーの現在マジック。使えない理由(あと⚡N)の算出に使う */
    magic?: number;
    /** 今ターンすでにトークンを使ったか */
    tokenUsed?: boolean;
    /** キャラ固有スキル */
    exclusive?: boolean;
    /** AIの手番など、人間の操作を受け付けない間(カードもロック切替も押せない。AIは別経路で実行する) */
    inputBlocked?: boolean;
    /** 「説明をすべて開く/閉じる」の状態。変わるたびに、このカードの説明の開閉もそろえる */
    expandAll?: boolean;
}

export const SkillButton = (props: SkillButtonProps) => {
    // 説明のアコーディオン: 既定は2行に省略。開くと全文を出す
    const [open, setOpen] = useState<boolean>(props.expandAll ?? false);
    useEffect(() => {
        if (props.expandAll !== undefined) setOpen(props.expandAll);
    }, [props.expandAll]);
    const descId = useId();
    if (props.hidden) return null;
    const parsed = parseSkillText(props.buttonText);
    const name = parsed?.name ?? props.buttonText;
    const meta = metaOf(name);
    const isGain = parsed?.sign === '+';

    // 使えない理由: マジック不足なら不足分、トークンなら使用済みを示す
    let reason: string | undefined;
    if (props.disabled && parsed && !isGain) {
        if (props.magic !== undefined && parsed.amount > props.magic) reason = `あと⚡${parsed.amount - props.magic}`;
        else if (props.tokenUsed && name.includes('トークン')) reason = '今ターン使用済み';
    }

    const classes = [styles.card, styles[meta.category], props.exclusive ? styles.exclusive : ''].filter(Boolean).join(' ');
    return (
        <div className={styles.wrap}>
            <div className={styles.row}>
                <button
                    className={classes}
                    onClick={props.onClick}
                    disabled={props.disabled || props.inputBlocked}
                    onMouseEnter={props.onHoverStart}
                    onMouseLeave={props.onHoverEnd}
                    aria-label={props.buttonText}
                    title={props.paragraph}
                >
                    <span className={styles.head}>
                        <span className={styles.icon}>{meta.icon}</span>
                        <span className={`${styles.name}${name.length > 6 ? ` ${styles.nameLong}` : ''}`}>{name}</span>
                        {parsed && (
                            <span className={`${styles.cost}${isGain ? ` ${styles.gain}` : ''}`}>
                                {isGain ? `+${parsed.amount}` : `⚡${parsed.amount}`}
                            </span>
                        )}
                    </span>
                    <span className={styles.tags}>
                        {props.exclusive && <span className={styles.tagExclusive}>固有</span>}
                        <span className={styles.tagCategory}>{CATEGORY_LABEL[meta.category]}</span>
                        {parsed?.suffix && <span className={styles.tagCategory}>{parsed.suffix.replace(/[()]/g, '')}</span>}
                    </span>
                    <span id={descId} className={`${styles.desc}${open ? ` ${styles.descOpen}` : ''}`}>
                        {props.paragraph}
                    </span>
                    {reason && <span className={styles.reason}>{reason}</span>}
                </button>
                {props.onToggleLock && (
                    <button
                        className={`${styles.lock}${props.locked ? ` ${styles.lockOn}` : ''}`}
                        onClick={props.onToggleLock}
                        disabled={props.inputBlocked}
                        title={props.locked ? 'ロック解除' : 'ロック（シャッフルで固定）'}
                    >
                        {props.locked ? '🔒' : '🔓'}
                    </button>
                )}
            </div>
            {/* 説明の開閉(アコーディオン)。カード自体がボタンなので、入れ子にならないよう外に置く */}
            <button type='button' className={styles.descToggle} aria-expanded={open} aria-controls={descId} onClick={() => setOpen((o) => !o)}>
                {open ? '説明を閉じる ▴' : '説明を開く ▾'}
            </button>
        </div>
    );
};
