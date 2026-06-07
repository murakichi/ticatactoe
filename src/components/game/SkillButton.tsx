import React from 'react';
import styles from './SkillButton.module.css';

type SkillButtonProps = {
    onClick: () => void;
    disabled?: boolean;
    hidden?: boolean;
    buttonText: string;
    paragraph: string;
    onHoverStart?: () => void;
    onHoverEnd?: () => void;
    locked?: boolean;
    onToggleLock?: () => void;
}

export const SkillButton = (props: SkillButtonProps) => {
    if (props.hidden) return null;
    return (
        <div className={styles.wrap}>
            <div className={styles.row}>
                <button
                    className={styles.btn}
                    onClick={props.onClick}
                    disabled={props.disabled}
                    onMouseEnter={props.onHoverStart}
                    onMouseLeave={props.onHoverEnd}
                >
                    {props.buttonText}
                </button>
                {props.onToggleLock && (
                    <button
                        className={`${styles.lock}${props.locked ? ` ${styles.lockOn}` : ''}`}
                        onClick={props.onToggleLock}
                        title={props.locked ? 'ロック解除' : 'ロック（シャッフルで固定）'}
                    >
                        {props.locked ? '🔒' : '🔓'}
                    </button>
                )}
            </div>
            <p className={styles.desc}>{props.paragraph}</p>
        </div>
    );
};
