import React from 'react';
import styles from './VictoryEffect.module.css';

type Props = {
    /** 勝者の記号（💙など） */
    winner: string;
    /** 勝者の席番号。紙吹雪の色に使う */
    seat: number;
};

// 紙吹雪の位置・時間・回転は毎回同じ並びにする(乱数を使わず、テストでも見た目でも再現できるように)
const CONFETTI = Array.from({ length: 110 }, (_, i) => {
    // 項目ごとに別の係数で散らす(同じ列を使うと、位置と遅延が相関して斜めの筋になる)
    const r = (n: number) => {
        const v = Math.sin(i * 12.9898 + n * 78.233) * 43758.5453;
        return v - Math.floor(v);
    };
    return {
        x: r(1) * 100,
        delay: r(2) * 900,
        dur: 1500 + r(3) * 1200,
        drift: (r(4) - 0.5) * 120,
        spin: 360 + r(5) * 720,
        w: 9 + r(6) * 9,
        color: i % 4, // 0=席の色 1=金 2=白 3=席の色(薄)
    };
});

/** 勝負が付いた瞬間の演出: 白い閃光 → 金のリングが広がる → 大きな「勝利！」→ 紙吹雪が降りしきる */
export const VictoryEffect: React.FC<Props> = ({ winner, seat }) => (
    <div className={styles.overlay} style={{ ['--seat' as string]: `var(--color-seat-${seat})` }} aria-hidden='true'>
        <div className={styles.flash} />
        {[0, 1, 2].map((i) => (
            <div key={i} className={styles.ring} style={{ animationDelay: `${i * 160}ms` }} />
        ))}
        {CONFETTI.map((c, i) => (
            <span
                key={i}
                className={`${styles.confetti} ${styles[`c${c.color}`]}`}
                style={{
                    left: `${c.x}%`,
                    width: c.w,
                    height: c.w * 0.6,
                    animationDelay: `${c.delay}ms`,
                    animationDuration: `${c.dur}ms`,
                    ['--drift' as string]: `${c.drift}px`,
                    ['--spin' as string]: `${c.spin}deg`,
                }}
            />
        ))}
        <div className={styles.banner}>
            <span className={styles.bannerMark}>{winner}</span>
            <span className={styles.bannerText}>勝利！</span>
        </div>
    </div>
);
