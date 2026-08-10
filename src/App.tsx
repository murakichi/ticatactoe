import './App.css';
import React, { useState } from 'react';
import { Game } from './components/game/Game';
import { CharacterId } from './types/Character';
import styles from './App.module.css';

type CharacterDef = {
    id: CharacterId;
    name: string;
    icon: string;
    passive: string;
};

const CHARACTERS: CharacterDef[] = [
    { id: 'you', name: 'あなた', icon: '🧑', passive: '何者にもなれなかったお前' },
    { id: 'tactician', name: '軍師', icon: '🎖️', passive: 'トークン系のコストを-2、それ以外のコストを+1。トークンのライフを+2' },
    { id: 'magician', name: '魔法使い', icon: '🧙', passive: 'ターン開始時のマジック+1。ライフの期待値-1' },
    { id: 'giant', name: '巨人', icon: '👹', passive: 'ライフ3倍。2ターンに一度しか行動できない。3x3を破壊する鉄槌' },
    { id: 'yinYangMaster', name: '陰陽師', icon: '☯️', passive: '陰陽を切替。陽=ライフ+1/コスト+1、陰=マジック+1/ライフ-1' },
    { id: 'necromancer', name: 'ネクロマンサー', icon: '💀', passive: '死者を蘇らせる。ライフ-1。ライフ0の敵を味方として復活' },
    { id: 'poisoner', name: '毒使い', icon: '🧪', passive: '毒セルが0/破壊で周囲に毒拡散。自陣の毒だけライフ+1。毒スキル-1/他+1' },
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
