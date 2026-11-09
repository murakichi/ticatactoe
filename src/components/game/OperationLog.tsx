// tsconfig の jsx は classic ("react") なので .tsx では React の import が必須
import React from 'react';
import styles from './Game.module.css';

export interface OperationLogProps {
    log: string[];
    copied: boolean;
    onCopy: () => void;
    onDownload: () => void;
}

/** 操作ログ。モバイルでは最新の1行だけのプレビューを出し、「詳細」で全文を出す */
export const OperationLog = (p: OperationLogProps) => (
    <>
        <div className={styles.logPreview} aria-hidden='true'>
            {p.log.length === 0 ? 'まだ操作はありません' : p.log[p.log.length - 1]}
        </div>
        <div className={styles.log}>
            <div className={styles.logHead}>
                <span className={styles.logTitle}>操作ログ</span>
                <button className={styles.logBtn} onClick={p.onCopy} disabled={p.log.length === 0}>
                    {p.copied ? 'コピー済' : 'コピー'}
                </button>
                <button className={styles.logBtn} onClick={p.onDownload} disabled={p.log.length === 0}>
                    DL
                </button>
            </div>
            <div className={styles.logBody}>
                {p.log.length === 0 ? (
                    <div className={styles.logEmpty}>まだ操作はありません</div>
                ) : (
                    [...p.log].reverse().map((entry, idx) => (
                        <div key={p.log.length - idx} className={styles.logEntry}>
                            {entry}
                        </div>
                    ))
                )}
            </div>
        </div>
    </>
);
