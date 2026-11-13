// Game.tsx から切り出したハンドラ群: 席ごとの魔力・手札・ロック・ライフ・増殖などの状態と、それに結びつく小さな関数
// 本体は Game.tsx にあったものをそのまま移した。Game の変数は scope(g) で、あとで定義されるもの(calculateCost など)は late() 経由で受け取る
import { GearTurnState } from './gearTurn';
import { RampState, rampAfterRoll, rampBonus, rampStart } from './gear';
import React from 'react';
import { useState, useEffect, useRef } from 'react';
import { CharacterId, YingYangMode } from '../../types/Character';
import { seatOf } from '../../types/Player';
import { SquareInfo } from '../../types/SquareInfo';
import { randomAnyPick, calculateLife, LIFE_STD } from '../../util';
import { noteSkillUsed } from './gearTurn';
import { PROLIFERATE } from './turn';
import { GearId, GEAR_PARAMS, hasGear, gearLifeBonus, gearLifeStd } from './gear';
import { usePendingMode } from './pendingMode';
import { useSeatArray } from './useSeatArray';
import { Discount } from './discount';
import { GameLate } from './gameLate';

export interface SeatResourcesScope {
    seatCount: number;
    gearTurn: React.MutableRefObject<GearTurnState & { infernoReady: boolean[]; freeCast: boolean; processedTurn: number }>;
    turnGears: GearId[];
    addLog: (message: string) => void;
    gearTrigger: (gearId: GearId, text?: string | undefined) => void;
    turnSeat: number;
    characters: CharacterId[];
    gearsBySeat: GearId[][];
}
export const useSeatResources = (g: SeatResourcesScope, late: () => GameLate) => {
    const { seatCount, gearTurn, turnGears, addLog, gearTrigger, turnSeat, characters, gearsBySeat } = g;


    // --- 席ごとの状態（添字 = 席番号） ---
    const [magic, setMagicAt, setMagicAll] = useSeatArray<number>(() => Array(seatCount).fill(2));
    const [useMagicCount, setUseMagicCountAt, setUseMagicCountAll] = useSeatArray<number>(() => Array(seatCount).fill(0));

    // 現在の手番プレイヤーのマジックを cost 消費する共通処理。bumpCount=true でスキル使用回数も+1
    // isSkill=false はシャッフルのようにスキル扱いしない支払い（ギアのスキル使用数に数えない）
    const spendMagic = (cost: number, bumpCount: boolean = true, isSkill: boolean = true, skillId?: string) => {
        let pay = cost;
        if (isSkill) {
            if (gearTurn.current.freeCast && skillId && skillId !== 'onClickRandomCast') {
                pay = 0; // 福引きで発動したスキル
                gearTurn.current.freeCast = false;
            }
            if (pay > 0 && hasGear(turnGears, 'luckyPurse') && Math.random() < GEAR_PARAMS.luckyPurseChance) {
                pay = 0;
                addLog('幸運の財布でコストが0になった');
                gearTrigger('luckyPurse', 'コスト0');
            }
            noteSkillUsed(gearTurn.current, turnSeat, skillId, pay);
            // 四連の極意: この回数に達したので、次のスキルは無料
            if (hasGear(turnGears, 'quadMastery') && gearTurn.current.skills[turnSeat] === GEAR_PARAMS.quadCount) gearTrigger('quadMastery', '次のスキルが無料');
        }
        setMagicAt(turnSeat, (m) => m - pay);
        if (bumpCount) setUseMagicCountAt(turnSeat, (c) => c + 1);
    };

    // 収穫: エフェクトを n 個付与したぶん魔力を得る（上限あり）
    const harvestMagic = (n: number) => {
        if (!hasGear(turnGears, 'harvest') || n <= 0) return;
        const gain = Math.min(n, GEAR_PARAMS.harvestCap);
        setMagicAt(turnSeat, (m) => m + gain);
        addLog(`収穫で魔力+${gain}`);
        gearTrigger('harvest', `魔力+${gain}`);
    };

    // マス選択などの「構え」の状態。同時に構えるのは1つだけなので、1つの状態で持つ（useXxx / setUseXxx は個別に読み書きできる形で渡す）
    const { flag: pendingFlag, setMode: setPendingMode } = usePendingMode();
    const [useToken, setUseToken] = useState<boolean>(false);
    const [useTokenCount, setUseTokenCountAt, setUseTokenCountAll] = useSeatArray<number>(() => Array(seatCount).fill(0));
    useEffect(() => {
        if (useToken) {
            setUseTokenCountAt(turnSeat, (c) => c + 1);
        }
    }, [useToken]);

    const [skills, setSkills] = useState<number[]>([]);
    // ロックしたスキルはシャッフル時も固定で残る。ロックはプレイヤーごとに管理する
    const [lockedSkills, setLockedSkillsAt, setLockedSkillsAll] = useSeatArray<number[]>(() => Array.from({ length: seatCount }, () => []));
    const currentLockedSkills = lockedSkills[turnSeat];
    const toggleLock = (i: number) => {
        setLockedSkillsAt(turnSeat, (prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i].slice(0, 3)));
    };
    // ロック済みスキルを残しつつ、残り枠を席のデッキからランダムに埋める
    const reshuffledSkills = (deck: number[], locks: number[]): number[] => {
        const keep = locks.slice(0, 3);
        const pool = deck.filter((i) => !keep.includes(i));
        return [...keep, ...randomAnyPick(pool, Math.max(0, 3 - keep.length))];
    };

    // --- 増殖（ループ召喚） ---
    // 発動後は自分が着手するたびに「コマ→アイテム」を交互に追加し続ける。
    // 追加のたび維持コストが +1 され、手番開始時に払えなくなるとループが途切れる（自己終息）。
    const proliferateTokenLife = PROLIFERATE.tokenLife;
    const proliferateUpkeepStep = PROLIFERATE.upkeepStep;
    const proliferateMaxStacks = PROLIFERATE.maxStacks;
    // サイレンス: 立っている席は次の手番スキルを使えない（その席の手番が終わるたびに解除）
    const [silenced, setSilencedAt, setSilencedAll] = useSeatArray<boolean>(() => Array(seatCount).fill(false));
    // 普請停止令: 立っている席は次の手番、オブジェクトを設置できない（その席の手番が終わるたびに解除）
    const [objectBan, setObjectBanAt, setObjectBanAll] = useSeatArray<boolean>(() => Array(seatCount).fill(false));
    // お構いなし: 立っている席は、次の自分の手番の頭まで相手のオブジェクトの効果を無視する（自分の手番が始まるたびに解除）
    const [objectIgnore, setObjectIgnoreAt, setObjectIgnoreAll] = useSeatArray<boolean>(() => Array(seatCount).fill(false));
    // オリジナルスキルの「コストn以下/n以上のスキル封じ」: 立っている席は、その席の次の手番の終わりまで、表示コストが範囲内のスキルを使えない
    // （チャージ・シャッフル・ロックを除く）。サイレンスと同じく、封じられた側の手番が終わるたびに解除
    const [skillBan, setSkillBanAt, setSkillBanAll] = useSeatArray<{ mode: 'max' | 'min'; n: number } | null>(() => Array(seatCount).fill(null));
    const bannedByCost = (seat: number, cost: number): boolean => {
        const ban = skillBan[seat];
        return !!ban && (ban.mode === 'max' ? cost <= ban.n : cost >= ban.n);
    };
    // 一寸の虫に魂なし: 立っている席は、その席の次の手番の終わりまでライフ3以下のコマを置けない
    const [lifeBan, setLifeBanAt, setLifeBanAll] = useSeatArray<boolean>(() => Array(seatCount).fill(false));
    // 静電気の季節: 立っている間（残りターン数）、その席が設置する駒（着手・トークン・全軍突撃のトークン）に⚡が付く
    const [chargeBuff, setChargeBuffAt, setChargeBuffAll] = useSeatArray<number>(() => Array(seatCount).fill(0));
    const [proliferate, setProliferateAt, setProliferateAll] = useSeatArray<boolean>(() => Array(seatCount).fill(false));
    const [proliferateCount, setProliferateCountAt, setProliferateCountAll] = useSeatArray<number>(() => Array(seatCount).fill(0));

    const [yinYangMode, setYinYangModeAt] = useSeatArray<YingYangMode | undefined>(() => Array(seatCount).fill('ying'));
    const currentYinYangMode = yinYangMode[turnSeat];
    const yinYangModeName = (seat: number) => (yinYangMode[seat] === 'yang' ? '陽' : '陰');

    // 雪だるま: 席ごとのライフ期待値の積み上げ(最初は+0から)。先手の最初に引いたライフも数える。
    // turn/counted/bonus は同じ手番の効果が二重に走っても、積み上げ・回数を二重に数えず同じ加算で引くための印
    const rampRef = useRef<{ states: RampState[]; turn: number; counted: boolean; bonus: number; first: number | null }>({
        states: gearsBySeat.map(() => rampStart()),
        turn: 0,
        counted: false,
        bonus: 0,
        first: null,
    });
    if (rampRef.current.first === null) {
        const first = calculateLife(
            characters[0],
            yinYangMode[0],
            gearLifeBonus(gearsBySeat[0]) + (hasGear(gearsBySeat[0], 'snowball') ? rampBonus(rampRef.current.states[0]) : 0),
            gearLifeStd(gearsBySeat[0], LIFE_STD)
        );
        rampRef.current.first = first;
        if (hasGear(gearsBySeat[0], 'snowball')) rampRef.current.states[0] = rampAfterRoll(rampRef.current.states[0], first);
    }
    const [life, setLife] = useState<number>(rampRef.current.first);

    // 絶対零度（氷室の番人）: 使用済みで、その席の次の手番開始時に発動待ちのフラグ
    const [glacierPending, setGlacierPendingAt, setGlacierPendingAll] = useSeatArray<boolean>(() => Array(seatCount).fill(false));
    // 冬至の種子: その席のコマの🌱が火炎で消えず、氷結中のマスでも休眠しない間のフラグ（その席の次の手番開始時に解除）
    const [budGuard, setBudGuardAt, setBudGuardAll] = useSeatArray<boolean>(() => Array(seatCount).fill(false));
    // 冬至の種子のガード中の席のコマは、🔥が付いても🌱が消えない
    const keepBuds = (sq: SquareInfo): boolean => !!sq.player && budGuard[seatOf(sq.player)];
    // 絶対零度のコスト軽減: 氷結が作られた回数（誰が作っても全席で数え、その席が撃つとリセット）
    const [glacierCharge, setGlacierChargeAt, setGlacierChargeAll] = useSeatArray<number>(() => Array(seatCount).fill(0));
    const bumpGlacierCharge = (n: number) => {
        if (n > 0) setGlacierChargeAll((prev) => prev.map((c) => c + n));
    };

    return { yinYangMode, setMagicAt, budGuard, setBudGuardAt, glacierPending, setGlacierPendingAt, magic, proliferate, proliferateCount, setProliferateAt, setProliferateCountAt, setSilencedAt, setLifeBanAt, setChargeBuffAt, setLife, setUseToken, setSkills, reshuffledSkills, lockedSkills, life, lifeBan, skills, useToken, chargeBuff, currentYinYangMode, silenced, objectBan, setObjectBanAt, setObjectBanAll, objectIgnore, setObjectIgnoreAt, setObjectIgnoreAll, glacierCharge, setLockedSkillsAt, spendMagic, currentLockedSkills, harvestMagic, pendingFlag, useTokenCount, setUseTokenCountAt, proliferateTokenLife, keepBuds, proliferateUpkeepStep, useMagicCount, setUseMagicCountAt, setYinYangModeAt, bumpGlacierCharge, setGlacierChargeAt, proliferateMaxStacks, setMagicAll, setUseMagicCountAll, setUseTokenCountAll, setProliferateAll, setSilencedAll, setLifeBanAll, setChargeBuffAll, setProliferateCountAll, setPendingMode, setGlacierPendingAll, setGlacierChargeAll, setBudGuardAll, setLockedSkillsAll, yinYangModeName, toggleLock, skillBan, setSkillBanAt, setSkillBanAll, bannedByCost, rampRef };
};
