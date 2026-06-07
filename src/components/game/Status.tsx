import React from 'react';
import { Player } from '../../types/Player';

type StatusProps = {
    winner: Player | undefined;
    nextPlayer: Player | undefined;
    statusText?: string | number;
};

export const Status = (props: StatusProps) => (
    <div className='status'>{props.winner ? `Winner: ${props.winner}` : `Next player: ${props.nextPlayer} ${props.statusText ?? `,${props.statusText}`}`}</div>
);
