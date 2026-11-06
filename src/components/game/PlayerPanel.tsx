// tsconfig の jsx は classic ("react") なので .tsx では React の import が必須
import React from 'react';
import styles from './Game.module.css';
import { CharacterId } from '../../types/Character';
import { Player } from '../../types/Player';
import { GearId, gearDefOf } from './gear';
import { CHARACTER_NAMES } from './gameTypes';

const AVATAR_CLASSES = [
    styles.avatarHeart,
    styles.avatarCircle,
    styles.avatarSeat2,
    styles.avatarSeat3,
    styles.avatarSeat4,
    styles.avatarSeat5,
    styles.avatarSeat6,
    styles.avatarSeat7,
];

export interface PlayerPanelProps {
    seat: number;
    player: Player;
    character: CharacterId;
    isAI: boolean;
    isCurrent: boolean;
    /** 装備しているギア（裸の王様などの効果を受ける前の、席が持つギア） */
    gears: GearId[];
    /** 裸の王様でギアが無効な間は、全部灰色にする */
    gearsOff: boolean;
    /** 土壇場の防壁を発動済みか（1試合に1回きり） */
    lastStandUsed: boolean;
    wins: number;
    magic: number;
    /** キャラ固有スキルの現在コスト */
    exclusiveCosts: { name: string; cost: number }[];
    /** 継続中の効果のラベル */
    effects: string[];
}

/** 盤面の両サイドに表示するプレイヤー情報パネル */
export const PlayerPanel = (p: PlayerPanelProps) => (
    <div
        className={`${styles.panel}${p.isCurrent ? ` ${styles.panelCurrent}` : ''}`}
        style={{ ['--seat' as string]: `var(--color-seat-${p.seat})` }}
    >
        <div className={`${styles.avatar} ${AVATAR_CLASSES[p.seat]}`}>{p.player}</div>
        <div className={styles.name}>{CHARACTER_NAMES[p.character]}</div>
        <div className={styles.tags}>
            <span className={styles.tag}>{p.isAI ? 'AI' : '人間'}</span>
            {p.isCurrent && <span className={styles.turnBadge}>手番</span>}
        </div>
        {p.gears.length > 0 && (
            <div className={`${styles.gears} ${styles.more}`}>
                {p.gears.map((id) => {
                    // 土壇場の防壁は1試合に1回きり。発動済みの席は非活性(灰色・取り消し線)で表示する
                    const spent = p.gearsOff || (id === 'lastStand' && p.lastStandUsed);
                    return (
                        <span
                            key={id}
                            className={`${styles.gear}${spent ? ` ${styles.gearSpent}` : ''}`}
                            aria-disabled={spent || undefined}
                            title={`${gearDefOf(id).name}: ${gearDefOf(id).desc}${spent ? '（発動済み）' : ''}`}
                        >
                            {gearDefOf(id).icon} {gearDefOf(id).name}
                            {spent && <span className={styles.gearSpentLabel}>発動済み</span>}
                        </span>
                    );
                })}
            </div>
        )}
        <div className={styles.stats}>
            <span className={styles.chip}>🏆 {p.wins}</span>
            <span className={`${styles.chip} ${styles.chipMagic}`}>⚡ {p.magic}</span>
        </div>
        {p.exclusiveCosts.length > 0 && (
            <div className={`${styles.skillCosts} ${styles.more}`}>
                {p.exclusiveCosts.map((s) => (
                    <div key={s.name} className={styles.skillCost}>
                        <span>{s.name}</span>
                        <b>⚡ {s.cost}</b>
                    </div>
                ))}
            </div>
        )}
        {p.effects.length > 0 && (
            <div className={`${styles.effects} ${styles.more}`}>
                {p.effects.map((label) => (
                    <span key={label} className={styles.effectBadge}>
                        {label}
                    </span>
                ))}
            </div>
        )}
    </div>
);
