import './App.css';
import React, { useState } from 'react';
import { Game } from './components/game/Game';
import { CharacterId } from './types/Character';
import { LIFE_MEANS } from './util';
import styles from './App.module.css';

type CharacterDef = {
    id: CharacterId;
    name: string;
    icon: string;
    passive: string;
};

// 説明文は実装と一致させること。ライフ平均は util.ts の LIFE_MEANS を参照して埋め込む
// （数値のズレを構造的に防ぐ / issue #13）。詳細は docs/characters.md
const L = LIFE_MEANS;
const CHARACTERS: CharacterDef[] = [
    { id: 'you', name: 'あなた', icon: '🧑', passive: `補正も固有スキルも無い基準点。ライフ平均${L.default}` },
    { id: 'tactician', name: '軍師', icon: '🎖️', passive: `トークン系コスト-1/他+2。自分のトークンはライフ6。固有:全軍突撃` },
    { id: 'magician', name: '魔法使い', icon: '🧙', passive: `毎ターン魔力+1、自陣バッズ1個ごとに更に+2。ライフ平均${L.magician}。固有:審判の日` },
    { id: 'giant', name: '巨人', icon: '👹', passive: `ライフ平均${L.giant}。5ターンに1回休み。ライフの残る敵も殴れる。固有:ストンプ` },
    {
        id: 'yinYangMaster',
        name: '陰陽師',
        icon: '☯️',
        passive: `陰陽を切替。陽=ライフ平均${L.yinYangMaster_yang}/全スキル+1、陰=ライフ平均${L.yinYangMaster_ying}/魔力+1`,
    },
    { id: 'necromancer', name: 'ネクロマンサー', icon: '💀', passive: `コマが消えるたび墓地+1→蘇生が安く強くなる。ライフ平均${L.default}。固有:蘇生` },
    { id: 'poisoner', name: '毒使い', icon: '🧪', passive: `毒スキル-1/他+1。自陣の毒の数だけライフ+1。毒で死んだマスから周囲へ毒が拡散` },
];

export const App = () => {
    const [heartSelectedCharacter, setHeartSelectedCharacter] = useState<CharacterId>('you');
    const [circleSelectedCharacter, setCircleSelectedCharacter] = useState<CharacterId>('you');
    const [heartIsAI, setHeartIsAI] = useState<boolean>(false);
    const [circleIsAI, setCircleIsAI] = useState<boolean>(true);
    const [isGameStarted, setIsGameStarted] = useState<boolean>(false);

    return (
        <div className='App'>
            {isGameStarted ? (
                <div className='App-game'>
                    <Game
                        heartSelectedCharacter={heartSelectedCharacter}
                        circleSelectedCharacter={circleSelectedCharacter}
                        heartIsAI={heartIsAI}
                        circleIsAI={circleIsAI}
                    />
                </div>
            ) : (
                <div className={styles.prep}>
                    <div className={styles.title}>戦術三目並べ</div>
                    <div className={styles.subtitle}>キャラクターと操作を選んで対戦開始</div>
                    <div className={styles.players}>
                        <PlayerSetting
                            player='💙'
                            variant='heart'
                            checkedCharacter={heartSelectedCharacter}
                            onCheckCharacter={setHeartSelectedCharacter}
                            isAI={heartIsAI}
                            onToggleAI={setHeartIsAI}
                        />
                        <PlayerSetting
                            player='⭕'
                            variant='circle'
                            checkedCharacter={circleSelectedCharacter}
                            onCheckCharacter={setCircleSelectedCharacter}
                            isAI={circleIsAI}
                            onToggleAI={setCircleIsAI}
                        />
                    </div>
                    <button className={styles.start} onClick={() => setIsGameStarted(true)}>
                        ⚔️ 対戦スタート
                    </button>
                </div>
            )}
        </div>
    );
};

type PlayerSettingProps = {
    player: string;
    variant: 'heart' | 'circle';
    checkedCharacter: CharacterId;
    onCheckCharacter: (id: CharacterId) => void;
    isAI: boolean;
    onToggleAI: (isAI: boolean) => void;
};

const PlayerSetting = (props: PlayerSettingProps) => {
    const cardClass = `${styles.playerCard} ${props.variant === 'heart' ? styles.playerCardHeart : styles.playerCardCircle}`;
    return (
        <div className={cardClass}>
            <div className={styles.playerHead}>
                <span>{props.player}</span>
                <span>プレイヤー</span>
            </div>
            <div className={styles.seg}>
                <button
                    className={`${styles.segBtn} ${!props.isAI ? styles.segBtnActive : ''}`}
                    onClick={() => props.onToggleAI(false)}
                >
                    人間
                </button>
                <button
                    className={`${styles.segBtn} ${props.isAI ? styles.segBtnActive : ''}`}
                    onClick={() => props.onToggleAI(true)}
                >
                    AI
                </button>
            </div>
            <div className={styles.charGrid}>
                {CHARACTERS.map((c) => (
                    <button
                        key={c.id}
                        className={`${styles.charCard} ${props.checkedCharacter === c.id ? styles.charCardActive : ''}`}
                        onClick={() => props.onCheckCharacter(c.id)}
                    >
                        <span className={styles.charIcon}>{c.icon}</span>
                        <span>
                            <span className={styles.charName}>{c.name}</span>
                            <span className={styles.charDesc}>{c.passive}</span>
                        </span>
                    </button>
                ))}
            </div>
        </div>
    );
};
