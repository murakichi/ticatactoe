import './App.css';
import React, { useState, useEffect } from 'react';
import { Game } from './components/game/Game';
import { CharacterId } from './types/Character';

export const App = () => {
    const [heartSelectedCharacter, setHeartSelectedCharacter] = useState<CharacterId>('you');
    const [circleSelectedCharacter, setCircleSelectedCharacter] = useState<CharacterId>('you');
    const [heartIsAI, setHeartIsAI] = useState<boolean>(false);
    const [circleIsAI, setCircleIsAI] = useState<boolean>(true);
    const [isGameStarted, setIsGameStarted] = useState<boolean>(false);
    const [isGameEnded, setIsGameEnded] = useState<boolean>(false);
    const [gameRestart, setGameRestart] = useState<boolean>(false);
    const gameRestarted = () => {
        setIsGameEnded(false);
    };

    return (
        <div className='App'>
            <header className='App-header'>{/* <img src={'./logo.svg'} className='App-logo' alt='logo' /> */}</header>
            {isGameStarted ? (
                <div className='App-game'>
                    <Game heartSelectedCharacter={heartSelectedCharacter} circleSelectedCharacter={circleSelectedCharacter} heartIsAI={heartIsAI} circleIsAI={circleIsAI} />
                </div>
            ) : (
                <div className='App-game-preparation'>
                    <div className='player-settings'>
                        <PlayerSetting player={'💙'} checkedCharacter={heartSelectedCharacter} onCheckCharacter={setHeartSelectedCharacter} isAI={heartIsAI} onToggleAI={setHeartIsAI} />
                        <PlayerSetting player={'⭕'} checkedCharacter={circleSelectedCharacter} onCheckCharacter={setCircleSelectedCharacter} isAI={circleIsAI} onToggleAI={setCircleIsAI} />
                    </div>
                    <button className='start-button' onClick={() => setIsGameStarted(true)}>
                        スタート
                    </button>
                </div>
            )}
        </div>
    );
};

type PlayerSettingProps = {
    player: string;
    checkedCharacter: CharacterId;
    onCheckCharacter: React.Dispatch<React.SetStateAction<CharacterId>>;
    isAI: boolean;
    onToggleAI: React.Dispatch<React.SetStateAction<boolean>>;
};

const PlayerSetting = (props: PlayerSettingProps) => {
    return (
        <div className='player-setting'>
            <fieldset>
                <legend>{props.player}</legend>
                <fieldset>
                    <legend>操作</legend>
                    <label>
                        <input
                            type='radio'
                            name={`controlFor${props.player}`}
                            checked={!props.isAI}
                            onChange={() => props.onToggleAI(false)}
                        />
                        人間
                    </label>
                    <label>
                        <input
                            type='radio'
                            name={`controlFor${props.player}`}
                            checked={props.isAI}
                            onChange={() => props.onToggleAI(true)}
                        />
                        AI
                    </label>
                </fieldset>
                <fieldset>
                    <legend>キャラクター</legend>
                    <CharacterRadio
                        player={props.player}
                        characterId={'you'}
                        characterName={'あなた'}
                        checked={props.checkedCharacter === 'you'}
                        passiveDescription={'何者にもなれなかったお前'}
                        onClick={props.onCheckCharacter}
                    />
                    <CharacterRadio
                        player={props.player}
                        characterId={'tactician'}
                        characterName={'軍師'}
                        checked={props.checkedCharacter === 'tactician'}
                        passiveDescription={'トークン系のコストを-2、それ以外のマジックのコストを+1する\nトークンのライフを+2する'}
                        onClick={props.onCheckCharacter}
                    />
                    <CharacterRadio
                        player={props.player}
                        characterId={'magician'}
                        characterName={'魔法使い'}
                        checked={props.checkedCharacter === 'magician'}
                        passiveDescription={'ターン開始時に得られるマジックを+1する ライフの期待値を-1する'}
                        onClick={props.onCheckCharacter}
                    />
                    <CharacterRadio
                        player={props.player}
                        characterId={'giant'}
                        characterName={'巨人'}
                        checked={props.checkedCharacter === 'giant'}
                        passiveDescription={'ライフが3倍になる 2ターンに一度しか行動できない 3x3を破壊する鉄槌'}
                        onClick={props.onCheckCharacter}
                    />
                    <CharacterRadio
                        player={props.player}
                        characterId={'yinYangMaster'}
                        characterName={'陰陽師'}
                        checked={props.checkedCharacter === 'yinYangMaster'}
                        passiveDescription={'陰陽を切り替えて戦う 陽の時はライフ+1,コスト+1 陰の時はターン開始時マジック+1,ライフ-1'}
                        onClick={props.onCheckCharacter}
                    />
                    <CharacterRadio
                        player={props.player}
                        characterId={'necromancer'}
                        characterName={'ネクロマンサー'}
                        checked={props.checkedCharacter === 'necromancer'}
                        passiveDescription={'死者を蘇らせることができる ライフ-1 スキルでライフ0になった敵を味方としてよみがえらせる'}
                        onClick={props.onCheckCharacter}
                    />
                </fieldset>
            </fieldset>
        </div>
    );
};

type CharacterRadioProps = {
    player: string;
    characterId: CharacterId;
    characterName: string;
    passiveDescription: string;
    checked: boolean;
    onClick: (checkedCharacter: CharacterId) => void;
};

export const CharacterRadio = (props: CharacterRadioProps) => {
    return (
        <div>
            <div>
                <input
                    type='radio'
                    id={`${props.player}-magician`}
                    name={`characterFor${props.player}`}
                    value={props.characterId}
                    checked={props.checked}
                    onClick={(e) => props.onClick(e.currentTarget.value as CharacterId)}
                />
                <label htmlFor={`${props.player}-magician`}>{props.characterName}</label>
            </div>
            <div className='passive-description'>{props.passiveDescription}</div>
        </div>
    );
};
