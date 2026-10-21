import React from 'react';
import styles from './GearToasts.module.css';

/** ギアが発動したことを知らせる小さなチップ。スキルの盤面演出とは別枠で、盤面の上に積んで出す */
export type GearToast = {
    id: number;
    icon: string;
    name: string;
    /** 何が起きたか(魔力+2・コスト0 など) */
    text?: string;
};

type Props = {
    toasts: GearToast[];
};

export const GearToasts: React.FC<Props> = ({ toasts }) => {
    if (toasts.length === 0) return null;
    return (
        <div className={styles.stack} aria-live='polite'>
            {toasts.map((t) => (
                <div key={t.id} className={styles.toast}>
                    <span className={styles.icon}>{t.icon}</span>
                    <span className={styles.name}>{t.name}</span>
                    {t.text && <span className={styles.text}>{t.text}</span>}
                </div>
            ))}
        </div>
    );
};
