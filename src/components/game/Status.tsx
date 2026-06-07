import React from 'react';
import { Player } from '../../types/Player';
import styles from './Status.module.css';

type StatusProps = {
    winner: Player | undefined;
    nextPlayer: Player | undefined;
    life: number;
};

export const Status = (props: StatusProps) => (
    <div className={styles.status}>
        {props.winner ? (
            <span className={styles.winner}>
                <span className={styles.player}>{props.winner}</span> の勝利！🎉
            </span>
        ) : (
            <>
                <span className={styles.turn}>
                    <span className={styles.player}>{props.nextPlayer}</span> のターン
                </span>
                <span className={styles.lifeChip}>
                    ライフ <b>{props.life}</b>
                </span>
            </>
        )}
    </div>
);
