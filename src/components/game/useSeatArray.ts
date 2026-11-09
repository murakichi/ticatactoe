import { useState, Dispatch, SetStateAction } from 'react';

/** 席ごとの値を配列で持ち、指定席だけを関数形式で更新するための小さなフック */
export const useSeatArray = <T,>(init: () => T[]): [T[], (seat: number, value: T | ((prev: T) => T)) => void, Dispatch<SetStateAction<T[]>>] => {
    const [values, setValues] = useState<T[]>(init);
    const setAt = (seat: number, value: T | ((prev: T) => T)) =>
        setValues((prev) => prev.map((x, i) => (i === seat ? (typeof value === 'function' ? (value as (p: T) => T)(x) : value) : x)));
    return [values, setAt, setValues];
};
