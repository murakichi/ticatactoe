// Game の入力(props)の型と、キャラの表示名。Game.tsx とそこから切り出したフックが共有する
import { CustomSkillSpec } from './customSkill';
import { CharacterId } from '../../types/Character';
import { GearId } from './gear';

export type PlayerConfig = {
    character: CharacterId;
    isAI: boolean;
    /** 装備するギア（省略時はなし） */
    gears?: GearId[];
    /** デッキ（手札3枠を引く汎用スキルの idx、DECK_SIZE枚）。省略・不正ならキャラの推奨デッキ */
    deck?: number[];
    /** オリジナルスキル（人間席のデッキに CUSTOM_SKILL_IDX があれば手札に出る。AI席では使わない） */
    customSkill?: CustomSkillSpec;
};

export type GameProps = {
    /** 席順(= 手番順)。先頭が先手。2〜8人 */
    players: PlayerConfig[];
    /** 盤面の一辺のマス数(4〜10)。省略時は人数に応じた既定 */
    boardSize?: number;
    /** 指定すると、盤面の操作列に「キャラ選択に戻る」ボタンが出る */
    onBackToSetup?: () => void;
};

export const CHARACTER_NAMES: Record<CharacterId, string> = {
    you: 'あなた',
    tactician: '軍師',
    magician: '魔法使い',
    fighter: '戦士',
    healer: 'ヒーラー',
    giant: '巨人',
    yinYangMaster: '陰陽師',
    necromancer: 'ネクロマンサー',
    poisoner: '毒使い',
    electrician: '雷霆の巫',
    cryomancer: '氷室の番人',
    pyromancer: '煉獄の鍛冶師',
    witch: '凩の魔女',
    keysmith: '鍵師',
};
