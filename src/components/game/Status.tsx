import React from 'react';
import { Player } from '../../types/Player';
import styles from './Status.module.css';

type StatusProps = {
    winner: Player | undefined;
    nextPlayer: Player | undefined;
    life: number;
    /** 長引いた多人数戦の魔力ボーナス(手番開始時+N)。0なら表示しない */
    magicBonus?: number;
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
                {!!props.magicBonus && (
                    <span className={styles.lifeChip} title='50ターンごとに、手番開始時に得られる魔力が全員+1ずつ増えます'>
                        魔力ボーナス <b>+{props.magicBonus}</b>
                    </span>
                )}
            </>
        )}
    </div>
);
