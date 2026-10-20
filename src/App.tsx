import './App.css';
import React, { useState } from 'react';
import { Game, PlayerConfig } from './components/game/Game';
import { boardSizeFor, MIN_BOARD_SIZE, MAX_BOARD_SIZE } from './components/game/boardGeometry';
import { CharacterId } from './types/Character';
import { PLAYER_SYMBOLS, MAX_PLAYERS } from './types/Player';
import { LIFE_MEANS, range } from './util';
import { GEARS, GearId, gearSlotsFor, gearDefOf, randomGears, recommendedGears } from './components/game/gear';
import { DECK_SIZE, SKILL_CATALOG, isValidDeck, randomDeck, recommendedDeck, variedAIDeck } from './components/game/deck';
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
    { id: 'poisoner', name: '毒使い', icon: '🧪', passive: `毒スキル-1/他+1。自陣の毒の数だけライフ+1。毒が付いた自分のコマはライフ1.5倍。毒でライフが尽きたマスは消えて魔力+1。そこから周囲へ毒が拡散` },
    {
        id: 'electrician',
        name: '雷霆の巫',
        icon: '⛩️',
        passive: `⚡が付いた自分のコマは誰にも触れない無敵（ただし自分も触れない）。自陣の⚡の発火ダメージは受けない。ライフ平均${L.electrician}。固有:帯電拡散`,
    },
    {
        id: 'cryomancer',
        name: '氷室の番人',
        icon: '🧊',
        passive: `ライフ平均${L.cryomancer}。常在のロックの代わりに「氷結」(コスト2・空きマスも可。氷結した空きマスは誰も置けない。🔑・🔥のあるマスには置けない)を持つ。❄は重なり、ターン進行・隣接⚡のダメージを受けず、スキルのダメージを1スタック分肩代わりする。固有:絶対零度`,
    },
    {
        id: 'pyromancer',
        name: '煉獄の鍛冶師',
        icon: '🔥',
        passive: `敵が🔥の継続ダメージを受けるとき追加で1ダメージ（🔥は毎ターン1つにつき2ダメージ・スキル被ダメ1.5倍）。ライフ平均${L.pyromancer}。固有:業火（仮）`,
    },
];

const MIN_PLAYERS = 2;
const DEFAULT_PLAYERS: PlayerConfig[] = PLAYER_SYMBOLS.map((_, seat) => ({ character: 'you', isAI: seat !== 0, gears: [] }));

export const App = () => {
    // 8席ぶんの設定を保持し、人数を変えても入力済みの内容を失わない。実際に使うのは先頭 playerCount 席
    const [players, setPlayers] = useState<PlayerConfig[]>(DEFAULT_PLAYERS);
    const [playerCount, setPlayerCount] = useState<number>(MIN_PLAYERS);
    // 盤面サイズ: 'auto'=人数に応じた既定(おまかせ) / 数値=人数に関わらずその一辺のマス数
    const [boardSizeChoice, setBoardSizeChoice] = useState<'auto' | number>('auto');
    const [isGameStarted, setIsGameStarted] = useState<boolean>(false);
    // 対戦開始時に確定した席の設定（AIのデッキのランダム入れ替えは開始時に1回だけ決める）
    const [startedPlayers, setStartedPlayers] = useState<PlayerConfig[]>([]);

    const updatePlayer = (seat: number, patch: Partial<PlayerConfig>) =>
        setPlayers((prev) =>
            prev.map((p, i) => {
                if (i !== seat) return p;
                const next = { ...p, ...patch };
                // キャラを変えて枠数が減ったとき（「あなた」3枠 → 他2枠）は、はみ出したギアを外す
                return { ...next, gears: (next.gears ?? []).slice(0, gearSlotsFor(next.character)) };
            })
        );
    const randomizeGears = (seat: number) => updatePlayer(seat, { gears: randomGears(gearSlotsFor(players[seat].character)) });
    const randomizeAllGears = () =>
        setPlayers((prev) => prev.map((p, seat) => (seat < playerCount ? { ...p, gears: randomGears(gearSlotsFor(p.character)) } : p)));
    const boardSize = boardSizeChoice === 'auto' ? boardSizeFor(playerCount) : boardSizeChoice;
    // AI席のキャラを「あなた」以外からランダムに決め直す（人間の席は触らない。重複あり）
    const randomizeAICharacters = () =>
        setPlayers((prev) =>
            prev.map((p, seat) => {
                if (seat >= playerCount || !p.isAI) return p;
                const pool = CHARACTERS.filter((c) => c.id !== 'you');
                return { ...p, character: pool[Math.floor(Math.random() * pool.length)].id };
            })
        );
    // 開始時に席の設定を確定する。ギアを選んでいないAI席は、キャラに合うギアを自分で選ぶ（人間が選んだギアはそのまま）。
    // デッキを指定していない席は推奨デッキ。ただしAI席は推奨デッキをベースに一部をランダムに入れ替える
    const buildGamePlayers = (): PlayerConfig[] =>
        players.slice(0, playerCount).map((p) => {
            const withGears = p.isAI && (p.gears ?? []).length === 0 ? { ...p, gears: recommendedGears(p.character) } : p;
            if (isValidDeck(p.deck)) return withGears;
            return { ...withGears, deck: p.isAI ? variedAIDeck(p.character) : recommendedDeck(p.character) };
        });
    // デッキを自分で組んだ席が不正（12枚でない）なら開始できない
    const invalidDeckSeat = players.slice(0, playerCount).findIndex((p) => p.deck !== undefined && !isValidDeck(p.deck));
    const hasAISeat = players.slice(0, playerCount).some((p) => p.isAI);

    return (
        <div className='App'>
            {isGameStarted ? (
                <div className='App-game'>
                    <Game players={startedPlayers} boardSize={boardSize} />
                </div>
            ) : (
                <div className={styles.prep}>
                    <div className={styles.title}>戦術三目並べ</div>
                    <div className={styles.subtitle}>人数・キャラクター・操作を選んで対戦開始</div>
                    <div className={styles.countRow}>
                        <span className={styles.countLabel}>人数</span>
                        <div className={styles.seg} role='group' aria-label='人数'>
                            {range(MIN_PLAYERS, MAX_PLAYERS - MIN_PLAYERS + 1).map((n) => (
                                <button
                                    key={n}
                                    className={`${styles.segBtn} ${playerCount === n ? styles.segBtnActive : ''}`}
                                    onClick={() => setPlayerCount(n)}
                                >
                                    {n}人
                                </button>
                            ))}
                        </div>
                        <span className={styles.boardSizeNote}>
                            盤面 {boardSize}x{boardSize}・4マス並べで勝ち
                        </span>
                    </div>
                    <div className={styles.countRow}>
                        <span className={styles.countLabel}>マス数</span>
                        <div className={styles.seg} role='group' aria-label='マス数'>
                            <button
                                className={`${styles.segBtn} ${boardSizeChoice === 'auto' ? styles.segBtnActive : ''}`}
                                onClick={() => setBoardSizeChoice('auto')}
                                title='人数に応じて自動で決めます（2人=4x4 / 3〜4人=5x5 / 5〜6人=6x6 / 7〜8人=7x7）'
                            >
                                おまかせ
                            </button>
                            {range(MIN_BOARD_SIZE, MAX_BOARD_SIZE - MIN_BOARD_SIZE + 1).map((n) => (
                                <button
                                    key={n}
                                    className={`${styles.segBtn} ${boardSizeChoice === n ? styles.segBtnActive : ''}`}
                                    onClick={() => setBoardSizeChoice(n)}
                                >
                                    {n}x{n}
                                </button>
                            ))}
                        </div>
                    </div>
                    <button className={styles.randomBtn} onClick={randomizeAICharacters} disabled={!hasAISeat}>
                        🎲 AI席のキャラをランダムに決める（あなた以外）
                    </button>
                    <button className={styles.randomBtn} onClick={randomizeAllGears}>
                        🎲 全員のギアをランダムに決める
                    </button>
                    <div className={styles.players}>
                        {range(0, playerCount).map((seat) => (
                            <PlayerSetting
                                key={seat}
                                seat={seat}
                                compact={playerCount > 2}
                                checkedCharacter={players[seat].character}
                                onCheckCharacter={(character) => updatePlayer(seat, { character })}
                                isAI={players[seat].isAI}
                                onToggleAI={(isAI) => updatePlayer(seat, { isAI })}
                                gears={players[seat].gears ?? []}
                                onChangeGears={(gears) => updatePlayer(seat, { gears })}
                                onRandomGears={() => randomizeGears(seat)}
                                deck={players[seat].deck}
                                onChangeDeck={(deck) => updatePlayer(seat, { deck })}
                            />
                        ))}
                    </div>
                    {invalidDeckSeat >= 0 && (
                        <div className={styles.deckWarn}>
                            プレイヤー{invalidDeckSeat + 1}のデッキが{DECK_SIZE}枚ではありません（「推奨」に戻すか、{DECK_SIZE}枚に調整してください）
                        </div>
                    )}
                    <button
                        className={styles.start}
                        disabled={invalidDeckSeat >= 0}
                        onClick={() => {
                            setStartedPlayers(buildGamePlayers());
                            setIsGameStarted(true);
                        }}
                    >
                        ⚔️ 対戦スタート
                    </button>
                </div>
            )}
        </div>
    );
};

type PlayerSettingProps = {
    seat: number;
    /** 3人以上のときは説明文を省いて、選択中のキャラの説明だけ下に出す */
    compact: boolean;
    checkedCharacter: CharacterId;
    onCheckCharacter: (id: CharacterId) => void;
    isAI: boolean;
    onToggleAI: (isAI: boolean) => void;
    gears: GearId[];
    onChangeGears: (gears: GearId[]) => void;
    onRandomGears: () => void;
    /** 組んだデッキ（未指定なら推奨デッキ） */
    deck: number[] | undefined;
    onChangeDeck: (deck: number[] | undefined) => void;
};

const PlayerSetting = (props: PlayerSettingProps) => {
    const selected = CHARACTERS.find((c) => c.id === props.checkedCharacter);
    const slots = gearSlotsFor(props.checkedCharacter);
    const toggleGear = (id: GearId) =>
        props.onChangeGears(props.gears.includes(id) ? props.gears.filter((g) => g !== id) : [...props.gears, id].slice(0, slots));
    return (
        <div
            className={`${styles.playerCard}${props.compact ? ` ${styles.playerCardCompact}` : ''}`}
            style={{ borderTopColor: `var(--color-seat-${props.seat})` }}
        >
            <div className={styles.playerHead}>
                <span>{PLAYER_SYMBOLS[props.seat]}</span>
                <span>プレイヤー{props.seat + 1}</span>
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
                            {!props.compact && <span className={styles.charDesc}>{c.passive}</span>}
                        </span>
                    </button>
                ))}
            </div>
            {props.compact && selected && <div className={styles.charNote}>{selected.passive}</div>}
            <div className={styles.gearBox}>
                <div className={styles.gearHead}>
                    <span>
                        ギア {props.gears.length}/{slots}
                    </span>
                    <span>
                        <button className={styles.gearMiniBtn} onClick={props.onRandomGears} aria-label={`プレイヤー${props.seat + 1}のギアをランダムに`}>
                            🎲
                        </button>{' '}
                        <button className={styles.gearMiniBtn} onClick={() => props.onChangeGears([])} disabled={props.gears.length === 0}>
                            外す
                        </button>
                    </span>
                </div>
                <div className={styles.gearGrid}>
                    {GEARS.map((g) => {
                        const active = props.gears.includes(g.id);
                        return (
                            <button
                                key={g.id}
                                className={`${styles.gearChip} ${active ? styles.gearChipActive : ''}`}
                                onClick={() => toggleGear(g.id)}
                                disabled={!active && props.gears.length >= slots}
                                title={g.desc}
                                aria-pressed={active}
                            >
                                {g.icon} {g.name}
                            </button>
                        );
                    })}
                </div>
                <DeckBox
                    seat={props.seat}
                    character={props.checkedCharacter}
                    isAI={props.isAI}
                    deck={props.deck}
                    onChangeDeck={props.onChangeDeck}
                />
                {props.gears.length > 0 && (
                    <div className={styles.gearNote}>
                        {props.gears.map((id) => (
                            <div key={id}>
                                {gearDefOf(id).icon} {gearDefOf(id).name}: {gearDefOf(id).desc}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

type DeckBoxProps = {
    seat: number;
    character: CharacterId;
    isAI: boolean;
    deck: number[] | undefined;
    onChangeDeck: (deck: number[] | undefined) => void;
};

/** デッキ選び: 未指定は推奨デッキ（AI席は推奨をベースに数枚ランダムに入れ替わる）。自分で組むときは汎用スキルから12枚 */
const DeckBox = (props: DeckBoxProps) => {
    const custom = props.deck !== undefined;
    const shown = props.deck ?? recommendedDeck(props.character);
    const toggle = (idx: number) => {
        const next = shown.includes(idx) ? shown.filter((x) => x !== idx) : [...shown, idx];
        if (next.length > DECK_SIZE) return;
        props.onChangeDeck(next.sort((a, b) => a - b));
    };
    return (
        <details className={styles.gearBox}>
            <summary className={styles.gearHead}>
                <span>
                    デッキ {shown.length}/{DECK_SIZE}（{custom ? 'カスタム' : props.isAI ? '推奨ベース・一部ランダム' : '推奨'}）
                </span>
            </summary>
            <div className={styles.gearHead}>
                <span>手札の3枠はこのデッキから引きます</span>
                <span>
                    <button className={styles.gearMiniBtn} onClick={() => props.onChangeDeck(undefined)} disabled={!custom}>
                        推奨
                    </button>{' '}
                    <button
                        className={styles.gearMiniBtn}
                        onClick={() => props.onChangeDeck(randomDeck())}
                        aria-label={`プレイヤー${props.seat + 1}のデッキをランダムに`}
                    >
                        🎲
                    </button>
                </span>
            </div>
            <div className={styles.gearGrid}>
                {SKILL_CATALOG.map((c) => {
                    const active = shown.includes(c.idx);
                    return (
                        <button
                            key={c.idx}
                            className={`${styles.gearChip} ${active ? styles.gearChipActive : ''}`}
                            onClick={() => toggle(c.idx)}
                            disabled={!active && shown.length >= DECK_SIZE}
                            aria-pressed={active}
                        >
                            {c.icon} {c.name}
                        </button>
                    );
                })}
            </div>
        </details>
    );
};
