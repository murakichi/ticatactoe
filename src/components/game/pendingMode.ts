// マス選択などの「構え」の状態。スキルを撃つ前に対象を選ぶ間だけ立つ。同時に立つのは1つだけ（新しく構えると前の構えは外れる）。
import { useState } from 'react';

export type PendingMode =
    | 'pandemic'
    | 'thunderFire'
    | 'stash'
    | 'stomp'
    | 'judgeDay'
    | 'shikigamiPlace'
    | 'shikigamiBlast'
    | 'shikigamiBless'
    | 'shikigamiCurse'
    | 'shikigamiPurge'
    | 'chargeOne'
    | 'chargeSpread'
    | 'chargeArea'
    | 'jammer'
    | 'freeze'
    | 'ignite'
    | 'tinder'
    | 'sucker'
    | 'swidden'
    | 'clone'
    | 'plunder'
    | 'frostArea'
    | 'icicle'
    | 'freezeSpread'
    | 'shatter'
    | 'sacrifice'
    | 'kimon';

export const usePendingMode = () => {
    const [mode, setMode] = useState<PendingMode | null>(null);
    /** 1つの構えを boolean の読み書きとして取り出す。false にするのは、いまその構えのときだけ（別の構えは外さない） */
    const flag = (m: PendingMode): [boolean, (on: boolean) => void] => [mode === m, (on) => setMode((prev) => (on ? m : prev === m ? null : prev))];
    return { mode, setMode, flag };
};
