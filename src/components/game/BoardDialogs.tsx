// tsconfig の jsx は classic ("react") なので .tsx では React の import が必須
import React from 'react';
import styles from './Game.module.css';
import { LineDir } from './boardGeometry';

export interface CaptureDialogProps {
    /** 乗っ取る対象の場所（例: B2）・オブジェクト名・持ち主のシンボル */
    cellName: string;
    objectName: string;
    owner: string;
    onToPiece: () => void;
    onToObject: () => void;
    onCancel: () => void;
}

/** 敵のオブジェクトを乗っ取るときの選択（自陣のコマにするか、自分のオブジェクトにするか） */
export const CaptureDialog = (p: CaptureDialogProps) => (
    <div className={styles.dialogBackdrop} onClick={p.onCancel}>
        <div className={styles.dialog} role="dialog" aria-label="オブジェクトの乗っ取り" onClick={(e) => e.stopPropagation()}>
            <p>
                {p.cellName}の{p.objectName}（{p.owner}）を乗っ取ります
            </p>
            <button onClick={p.onToPiece}>自陣のコマにする</button>
            <button onClick={p.onToObject}>自分の{p.objectName}にする</button>
            <button onClick={p.onCancel}>キャンセル</button>
        </div>
    </div>
);

export interface IcicleChoicesProps {
    cellName: string;
    disabled: boolean;
    onPick: (dir: LineDir) => void;
}

const ICICLE_DIRS: [LineDir, string][] = [['row', '横'], ['col', '縦'], ['diag', '↘'], ['anti', '↗']];

/** 氷柱: 選んだマスを通る線の向きを選ぶ */
export const IcicleChoices = (p: IcicleChoicesProps) => (
    <div className={styles.announce}>
        {p.cellName}を通る線:{' '}
        {ICICLE_DIRS.map(([dir, label]) => (
            <button key={dir} className={styles.btn} disabled={p.disabled} onClick={() => p.onPick(dir)}>
                {label}
            </button>
        ))}
    </div>
);
