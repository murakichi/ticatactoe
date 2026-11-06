// tsconfig の jsx は classic ("react") なので .tsx では React の import が必須
import React from 'react';
import styles from './Game.module.css';

export interface ControlBarProps {
    /** 決着がついているか（リスタートを強調する） */
    finished: boolean;
    onRestart: () => void;
    soundOn: boolean;
    onToggleSound: () => void;
    showDetail: boolean;
    onToggleDetail: () => void;
    /** 「キャラ選択に戻る」を出すときだけ渡す */
    onBackToSetup?: () => void;
    /** 全員AIのときだけ「自動進行」「次の手番」を出す */
    isAllAI: boolean;
    autoPlay: boolean;
    onChangeAutoPlay: (on: boolean) => void;
    onStep: () => void;
    stepDisabled: boolean;
}

/** 盤面の下の操作列 */
export const ControlBar = (p: ControlBarProps) => (
    <div className={styles.controls}>
        <button className={`${styles.btn}${p.finished ? ` ${styles.btnPrimary}` : ''}`} onClick={p.onRestart}>
            リスタート
        </button>
        <button
            className={styles.btn}
            onClick={p.onToggleSound}
            aria-pressed={p.soundOn}
            title={p.soundOn ? '効果音をオフにする' : '効果音をオンにする'}
        >
            {p.soundOn ? '🔊 音あり' : '🔇 音なし'}
        </button>
        <button className={`${styles.btn} ${styles.detailBtn}`} aria-pressed={p.showDetail} onClick={p.onToggleDetail}>
            {p.showDetail ? '詳細を閉じる ▴' : '詳細 ▾'}
        </button>
        {p.onBackToSetup && (
            <button className={styles.btn} onClick={p.onBackToSetup}>
                キャラ選択に戻る
            </button>
        )}
        {p.isAllAI && (
            <>
                <label className={styles.check}>
                    <input type='checkbox' checked={p.autoPlay} onChange={(e) => p.onChangeAutoPlay(e.target.checked)} />
                    自動進行
                </label>
                <button className={styles.btn} onClick={p.onStep} disabled={p.stepDisabled}>
                    次の手番
                </button>
            </>
        )}
    </div>
);
