// tsconfig の jsx は classic ("react") なので .tsx では React の import が必須
import React from 'react';
import styles from './Game.module.css';
import { Player } from '../../types/Player';
import { SquareInfo } from '../../types/SquareInfo';
import { Board } from './Board';
import { BoardEffects, SkillEffect, BurstEffect } from './BoardEffects';
import { VictoryEffect } from './VictoryEffect';
import { GearToast, GearToasts } from './GearToasts';

export interface BoardStageProps {
    size: number;
    squares: SquareInfo[];
    /** 盤面の揺れ（スキル演出・巨人の着手）のクラス名。無ければ空文字 */
    shakeClass: string;
    /** --sq（1マスの大きさ）の CSS 値 */
    sqCss: string;
    onPlay: (i: number) => void;
    destroyCells: number[];
    previewCells: number[];
    shieldedCells: number[];
    winCells: number[];
    turnColor?: string;
    onCellHover?: (i: number) => void;
    onCellLeave: () => void;
    effect: SkillEffect | null;
    burst: BurstEffect | null;
    winner?: Player;
    /** 勝者の席 */
    winnerSeat: number;
    gearToasts: GearToast[];
    /** ヘイルメアリーのルーレット演出（出ていなければ null） */
    hailMarySpin: { label: string; phase: 'intro' | 'spin' | 'reveal' } | null;
}

/** 盤面と、その上に重ねる演出（スキル演出・勝利・ギアのチップ・ヘイルメアリー） */
export const BoardStage = (p: BoardStageProps) => (
    <div className={`${styles.boardArea}${p.shakeClass}`} style={{ ['--sq' as string]: p.sqCss }}>
        <Board
            size={p.size}
            squares={p.squares}
            onPlay={p.onPlay}
            destroyCells={p.destroyCells}
            previewCells={p.previewCells}
            shieldedCells={p.shieldedCells}
            winCells={p.winCells}
            turnColor={p.turnColor}
            onCellHover={p.onCellHover}
            onCellLeave={p.onCellLeave}
        />
        <BoardEffects effect={p.effect} burst={p.burst} size={p.size} />
        {p.winner && <VictoryEffect key={p.winner} winner={p.winner} seat={p.winnerSeat} />}
        <GearToasts toasts={p.gearToasts} />
        {p.hailMarySpin && (
            <div className={styles.hmOverlay}>
                <div className={`${styles.hmBand} ${styles[`hm_${p.hailMarySpin.phase}`]}`}>{p.hailMarySpin.label}</div>
            </div>
        )}
    </div>
);
