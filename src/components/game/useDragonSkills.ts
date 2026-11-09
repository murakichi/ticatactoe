// Game.tsx から切り出したスキルのハンドラ群: 龍神の巫女（#527）の覚醒・八百万の祈り・龍の咆哮・龍の防壁
// 純粋ロジックは dragon.ts（sim/engine.js と共有）。Game の変数は scope(g) で、あとで定義されるものは late() 経由で受け取る
import { useEffect } from 'react';
import { CharacterId } from '../../types/Character';
import { Player, seatOf } from '../../types/Player';
import { SquareInfo } from '../../types/SquareInfo';
import { SkillCosts } from './skillCosts';
import { SkillEffectType } from './BoardEffects';
import { PlayEffectExtra } from './usePresentation';
import { DragonState, applyAwaken, awakenPlan, pickPrayerKind, prayerUsable, roar, roarUsable } from './dragon';
import { GameLate } from './gameLate';

export interface DragonScope {
    symbols: Player[];
    characters: CharacterId[];
    currentBoard: SquareInfo[];
    currentTurnPlayer: Player;
    turnSeat: number;
    currentTurn: number;
    setCurrentTurn: React.Dispatch<React.SetStateAction<number>>;
    setCurrentBoard: React.Dispatch<React.SetStateAction<SquareInfo[]>>;
    addLog: (message: string) => void;
    flashCells: (indexes: number[]) => void;
    playEffect: (type: SkillEffectType, index?: number | undefined, indexes?: number[] | undefined, label?: string | undefined, extra?: PlayEffectExtra | undefined) => void;
    spendMagic: (cost: number, bumpCount?: boolean, isSkill?: boolean, skillId?: string) => void;
    costTableFor: (seat: number) => SkillCosts;
    deckBySeat: number[][];
    dragon: DragonState[];
    setDragonAt: (seat: number, value: DragonState | ((prev: DragonState) => DragonState)) => void;
}

export const useDragonSkills = (g: DragonScope, late: () => GameLate) => {
    const { symbols, characters, currentBoard, currentTurnPlayer, turnSeat, currentTurn, setCurrentTurn, setCurrentBoard, addLog, flashCells, playEffect, spendMagic, costTableFor, deckBySeat, dragon, setDragonAt } = g;

    // 覚醒: 巫女のとき自陣の建造物が4つになったら、囲んだ範囲と自陣の建造物を消滅させて龍になる（どのスキルで建造物が増えても、盤面の変化で判定する）
    useEffect(() => {
        characters.forEach((c, seat) => {
            if (c !== 'dragonMiko' || dragon[seat].form !== 'miko') return;
            const plan = awakenPlan(currentBoard, symbols[seat]);
            if (!plan) return;
            const board = currentBoard.slice();
            const n = applyAwaken(board, plan);
            addLog(`${symbols[seat]}の龍神降臨: 建造物${plan.buildings.length}つが結界を張り、${plan.enclosed.length}マスを囲んで消滅（N=${n}）。龍に覚醒`);
            flashCells([...plan.enclosed, ...plan.buildings]);
            playEffect('judge', undefined, [...plan.enclosed, ...plan.buildings], '龍神降臨');
            setDragonAt(seat, { form: 'dragon', n });
            setCurrentBoard(board);
        });
    }, [currentBoard]);

    const prayerCost = (player: Player = currentTurnPlayer): number =>
        late().calculateCost(costTableFor(seatOf(player)).onClickPrayer, false, false, player, 'onClickPrayer');
    const roarCost = (player: Player = currentTurnPlayer): number =>
        late().calculateCost(costTableFor(seatOf(player)).onClickRoar, false, false, player, 'onClickRoar');
    const prayerLegal = (): boolean => prayerUsable(currentBoard, deckBySeat[turnSeat]);
    const roarLegal = (): boolean => dragon[turnSeat]?.form === 'dragon' && roarUsable(currentBoard, currentTurnPlayer);

    // 固有スキル 八百万の祈り: デッキ内のオブジェクト設置スキルをランダムに1つ発動する（中身のコストは払わない）。設置マスは自分で選ぶ
    const onClickPrayer = () => {
        const kind = pickPrayerKind(deckBySeat[turnSeat], Math.random);
        if (!kind) return;
        addLog(`「八百万の祈り」を使用（${kind}を引いた。空きマスを選択）`);
        late().setObjectPlacing(kind);
        spendMagic(prayerCost(), true, true, 'onClickPrayer');
    };

    // 固有スキル 龍の咆哮（龍のみ）: 自陣のオブジェクト全ての周囲8マスの敵コマを破壊し、そのあと自陣のオブジェクト全てに⚡。ターン終了
    const onClickRoar = () => {
        const cost = roarCost();
        const board = currentBoard.slice();
        const r = roar(board, currentTurnPlayer, characters);
        addLog(`「龍の咆哮」を使用（敵${r.destroyed}コマを破壊${r.blocked.length > 0 ? `・氷結${r.blocked.length}個が身代わり` : ''}、自陣のオブジェクト${r.charged.length}個に⚡・ターン終了）`);
        late().addCorpses(r.destroyed);
        flashCells([...r.range, ...r.charged]);
        playEffect('inferno', undefined, [...r.range, ...r.charged], '龍の咆哮');
        setCurrentBoard(board);
        spendMagic(cost, true, true, 'onClickRoar');
        setCurrentTurn(currentTurn + 1);
    };

    return { onClickPrayer, onClickRoar, prayerCost, roarCost, prayerLegal, roarLegal };
};

export type DragonSkillsResult = ReturnType<typeof useDragonSkills>;
