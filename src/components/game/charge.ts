// ⚡帯電（雷霆の巫）の純粋ロジック。Game.tsx / AIPlayer.ts で共有する。
// sim/engine.js の chargeStacks / orthoNeighbors / isShielded / isGuarded / fireCharges / connectedPieces と同じ仕様。
import { CharacterId } from '../../types/Character';
import { Player, seatOf } from '../../types/Player';
import { SquareInfo } from '../../types/SquareInfo';
import { CHARGE_MIN_COST } from './skillCosts';
import { orthoNeighbors, geometryOf } from './boardGeometry';
import { applyDamage, isFrozen, isDormant, ignite, thawOne, thunderFireVictims } from './thermal';

export { orthoNeighbors };

/** 席ごとのキャラ（添字 = 席番号。シンボルからは seatOf で引く）。sim/engine.js の s.chars と同じ */
export type PlayerCharacters = readonly CharacterId[];

const charOf = (chars: PlayerCharacters, player: Player): CharacterId | undefined => chars[seatOf(player)];

/** ⚡の個数（スタック数） */
/** 沈黙は雷なり: 払う⚡の数（自陣の⚡が合計でこれ以上ないと使えない） */
export const BOLT_SILENCE_BOLTS = 2;

export const chargeStacks = (sq: SquareInfo): number => sq.effects.filter((e) => e.effect === '⚡').length;

const hasLock = (sq: SquareInfo): boolean => sq.effects.some((e) => e.effect === '🔑');

const cellsWhere = (board: SquareInfo[], pred: (sq: SquareInfo) => boolean): number[] => board.map((sq, i) => (pred(sq) ? i : -1)).filter((i) => i !== -1);

/** ⚡のある自陣のマス（雷神のへそくり・沈黙は雷なりの対象） */
export const ownChargedCells = (board: SquareInfo[], me: Player): number[] => cellsWhere(board, (sq) => sq.player === me && chargeStacks(sq) > 0);
export const stashTargets = ownChargedCells;
export const boltSilenceTargets = ownChargedCells;
/** ロックされていない自陣のマス（総毛立つの対象） */
export const bristleTargets = (board: SquareInfo[], me: Player): number[] => cellsWhere(board, (sq) => sq.player === me && !hasLock(sq));
/** ライフを回復できる⚡の自陣マス（雷を食らわば皿まで。休眠中は除く） */
export const chargeHealTargets = (board: SquareInfo[], me: Player): number[] => cellsWhere(board, (sq) => sq.player === me && chargeStacks(sq) > 0 && !isDormant(sq));

/** 雷霆の巫の⚡付き自陣マスは「無敵」。弱点として本人も含め誰も触れない */
export const isShielded = (sq: SquareInfo, chars: PlayerCharacters): boolean =>
    !!sq.player && charOf(chars, sq.player) === 'electrician' && chargeStacks(sq) > 0 && !isDormant(sq); // 休眠マス（氷結中・火炎中）は⚡が休眠して無敵も働かない

/** 🔑ロックまたは⚡の無敵＝ダメージ系スキルの対象外にするマス */
export const isGuarded = (sq: SquareInfo, chars: PlayerCharacters): boolean => hasLock(sq) || isShielded(sq, chars);

/** 無敵マスの添字集合 */
export const shieldedCells = (board: SquareInfo[], chars: PlayerCharacters): number[] =>
    board.map((sq, i) => (isShielded(sq, chars) ? i : -1)).filter((i) => i !== -1);

export type FireResult = {
    /** 発火した帯電マス */
    fired: number[];
    /** 実際に1ダメージを受けたマス */
    damaged: number[];
    /** 伝導(ギア)で毒・火炎を移されたマス */
    carried: number[];
};

/** 発火で隣のコマが受けるダメージ。sim は A/B 検証用に fireCharges の damage 引数で上書きする（CHG_FIRE_DMG） */
export const FIRE_DAMAGE = 1;

/**
 * 着手マス i の隣にある⚡を発火させる（size は盤の一辺。board を直接書き換える）。
 * 発火した帯電マス k の縦横隣接のうち、ライフ>0・🔑なしのコマが1ダメージ（k 自身は対象外、
 * 着手したコマが k の隣ならそれも含む）。発火した k の⚡は全部消える。連鎖はしない。
 * ギア「伝導」: conductors[席] が真の席のコマが載った帯電マス k に☠/🔥が付いていれば、ダメージを受けた**敵**（k のコマの持ち主以外）のマスに同じ効果を1スタックずつ付与する（🔥は ignite の規則どおり）。
 */
export const fireCharges = (board: SquareInfo[], i: number, size: number, chars: readonly CharacterId[] = [], conductors: readonly boolean[] = [], damage: number = FIRE_DAMAGE): FireResult => {
    const fired: number[] = [];
    const damaged: number[] = [];
    const carried: number[] = [];
    for (const k of orthoNeighbors(i, size)) {
        if (chargeStacks(board[k]) === 0 || isDormant(board[k])) continue; // 休眠マスの⚡は発火源にならない（発火せず消えもしない）
        fired.push(k);
        for (const n of orthoNeighbors(k, size)) {
            const sq = board[n];
            if (!sq.player || sq.bind <= 0) continue;
            if (hasLock(sq)) continue; // ロックは貫通しない
            if (isFrozen(sq)) continue; // 氷結中のマスは隣接⚡のダメージを受けない
            // 雷霆の巫は、自陣由来（自分のコマが載っている⚡マス）の発火ダメージを受けない
            if (sq.player === board[k].player && chars[seatOf(sq.player)] === 'electrician') continue;
            board[n] = applyDamage(sq, damage, 'electric').sq; // 隣接⚡のダメージは氷結中のマスには通らない。🔥は消えない（帯電と火炎は重複する）
            damaged.push(n);
            // 帯電していたコマの毒・火炎を、ダメージを受けた敵のマスへ1スタック移す
            const owner = board[k].player;
            if (owner && sq.player !== owner && conductors[seatOf(owner)]) {
                const before = board[n].effects.length;
                if (board[k].effects.some((e) => e.effect === '☠')) board[n] = { ...board[n], effects: [...board[n].effects, { effect: '☠' }] };
                if (board[k].effects.some((e) => e.effect === '🔥')) ignite(board, [n], size);
                if (board[n].effects.length !== before || !board[n].player) carried.push(n);
            }
        }
        board[k] = { ...board[k], effects: board[k].effects.filter((e) => e.effect !== '⚡') };
    }
    return { fired, damaged, carried };
};

export type ReleaseResult = {
    /** 取り除いた⚡の数（スタック込み）= 敵の各コマに与えるダメージ */
    removed: number;
    /** ⚡を取り除いた自陣のマス */
    from: number[];
    /** 実際にダメージを受けた敵のマス */
    damaged: number[];
};

/**
 * 落雷は忘れた頃に: player の自陣のコマの⚡をすべて取り除き、取り除いた数だけ、敵の全コマにダメージを与える（ライフは0まで。破壊はしない）。
 * ライフ0のコマ・🔑ロック・⚡の無敵コマ・氷結中のコマ（隣接⚡のダメージと同じく通らない）は受けない。board を直接書き換える。sim/engine.js の releaseCharges と同じ
 */
export const releaseCharges = (board: SquareInfo[], player: Player | undefined, chars: PlayerCharacters): ReleaseResult => {
    const from: number[] = [];
    let removed = 0;
    board.forEach((sq, i) => {
        if (sq.player !== player || chargeStacks(sq) === 0) return;
        removed += chargeStacks(sq);
        from.push(i);
        board[i] = { ...sq, effects: sq.effects.filter((e) => e.effect !== '⚡') };
    });
    const damaged: number[] = [];
    if (removed === 0) return { removed, from, damaged };
    board.forEach((sq, i) => {
        if (!sq.player || sq.player === player || sq.bind <= 0 || isFrozen(sq) || isGuarded(sq, chars)) return;
        board[i] = applyDamage(sq, removed, 'electric').sq;
        damaged.push(i);
    });
    return { removed, from, damaged };
};

/** 固有スキル: start から、コマのあるマスだけを縦横に辿って届くすべてのマス（start 自身を含む）。空きマスなら [] */
export const connectedPieces = (board: SquareInfo[], start: number, size: number): number[] => {
    if (!board[start].player) return [];
    const seen = new Set<number>([start]);
    const queue = [start];
    while (queue.length > 0) {
        const cur = queue.shift() as number;
        for (const n of orthoNeighbors(cur, size)) {
            if (!seen.has(n) && board[n].player) {
                seen.add(n);
                queue.push(n);
            }
        }
    }
    return Array.from(seen);
};

/** 雷霆の巫以外のコマは、⚡が乗った時点でこのダメージを受ける。sim/engine.js の CHARGE_LANDING_DAMAGE と同値 */
export const CHARGE_LANDING_DAMAGE = 2;

/**
 * ⚡を1つ付与したマスを返す（元のマスは変更しない）。雷霆の巫以外のコマは付いた時点で2ダメージ
 * （ライフ0・🔑ロック中・氷結中のコマと空きマスは受けない。🔥は消えない）。トークンは ⚡ 付きで作ったマスに landCharge をかける
 */
export const addCharge = (sq: SquareInfo, chars: readonly (CharacterId | undefined)[]): SquareInfo =>
    landCharge({ ...sq, effects: [...sq.effects, { effect: '⚡' }] }, chars);

/** すでに⚡が乗ったマスに、乗った時点のダメージ（addCharge の後半）だけをかける */
export const landCharge = (sq: SquareInfo, chars: readonly (CharacterId | undefined)[]): SquareInfo => {
    if (!sq.player || sq.bind <= 0 || hasLock(sq) || chars[seatOf(sq.player)] === 'electrician') return sq;
    return applyDamage(sq, CHARGE_LANDING_DAMAGE, 'electric').sq;
};

/** 指定マスに⚡を1つずつ付与した新しい盤面を返す（元の盤面は変更しない） */
export const withCharge = (board: SquareInfo[], cells: number[], chars: readonly (CharacterId | undefined)[]): SquareInfo[] => {
    const next = board.slice();
    for (const k of cells) next[k] = addCharge(next[k], chars);
    return next;
};

/** 盤面全体の⚡の数（スタック込み）。sim/engine.js の boardChargeCount と同じ */
export const boardChargeCount = (board: SquareInfo[]): number => board.reduce((n, sq) => (isDormant(sq) ? n : n + chargeStacks(sq)), 0); // 休眠マスの⚡は数えない

/**
 * 帯電付与・帯電拡散の実コスト: 盤面の⚡の数だけ基礎コストを軽減してからキャラ補正（calc）をかけ、
 * 下限は CHARGE_MIN_COST (#43)。sim/engine.js の chargeOneCost / chargeSpreadCost と同じ
 */
export const reducedChargeCost = (baseCost: number, board: SquareInfo[], calc: (cost: number) => number): number =>
    Math.max(CHARGE_MIN_COST, calc(baseCost - boardChargeCount(board)));

/** ランダム帯電の候補マス: 空きマス含む全マスから、無敵マスと🔑ロック中のマスを除く */
export const randomChargeCandidates = (board: SquareInfo[], chars: PlayerCharacters): number[] =>
    board.map((sq, i) => (!isShielded(sq, chars) && !hasLock(sq) ? i : -1)).filter((i) => i !== -1);

/** ジャマーが選べるマスか: ⚡があり、無敵マスなら自分のものだけ（弱点を解く唯一の手段）。他人の無敵マスは不可 */
export const canJam = (board: SquareInfo[], i: number, current: Player, chars: PlayerCharacters): boolean =>
    chargeStacks(board[i]) > 0 && !isDormant(board[i]) && !(isShielded(board[i], chars) && board[i].player !== current);

/** ジャマーのダメージ対象: i の縦横隣接の敵コマ（ライフ>0・🔑なし。current 以外のコマ） */
export const jammerTargets = (board: SquareInfo[], i: number, size: number, current: Player): number[] =>
    orthoNeighbors(i, size).filter((j) => {
        const sq = board[j];
        return !!sq.player && sq.player !== current && sq.bind > 0 && !hasLock(sq) && !isFrozen(sq);
    });

export type JammerResult = {
    /** ライフを減らされたマス */
    damaged: number[];
    /** ライフが0になったマス */
    zeroed: number[];
};

/**
 * ジャマー: i の⚡のスタック数ぶん、縦横隣接の敵コマのライフを減らし（最小0）、i の⚡を全部消す。
 * 自分のコマ・🔑付きのコマは対象外。board を直接書き換える。sim/engine.js の exeJammer と同じ
 */
export const applyJammer = (board: SquareInfo[], i: number, size: number, current: Player): JammerResult => {
    const stacks = chargeStacks(board[i]);
    const damaged = jammerTargets(board, i, size, current);
    const zeroed: number[] = [];
    for (const j of damaged) {
        // 氷結中のコマは jammerTargets で除外済み（ジャマーのダメージは氷結中のマスに通らない）。ここに来るのは氷結していないコマだけ
        board[j] = applyDamage(board[j], stacks, 'electric').sq;
        if (board[j].bind === 0) zeroed.push(j);
    }
    board[i] = { ...board[i], effects: board[i].effects.filter((e) => e.effect !== '⚡') };
    return { damaged, zeroed };
};

/** 全マス（空きマス含む）に⚡が1つ以上あるか。sim/engine.js checkDischarge の判定と同じ */
export const isFullyCharged = (board: SquareInfo[]): boolean => board.length > 0 && board.every((sq) => chargeStacks(sq) > 0 && !isDormant(sq));

/**
 * 過負荷: 全マスが⚡で埋まっていたら、全⚡と全🔑を取り除き、全マスのライフを0にした新しい盤面を返す。
 * 埋まっていなければ同じ盤面をそのまま返す（元の盤面は変更しない）。sim/engine.js の checkDischarge が同仕様になる想定（ロックも解除）
 */
export const applyOverload = (board: SquareInfo[]): SquareInfo[] => {
    if (!isFullyCharged(board)) return board;
    return board.map((sq) => ({
        ...sq,
        effects: sq.effects.filter((e) => e.effect !== '⚡' && e.effect !== '🔑'),
        bind: 0,
    }));
};

/**
 * 雷を食らわば皿まで: player の⚡が効いているコマ（休眠中を除く）のライフを、⚡のスタック1つにつき +CHARGE_HEAL する。
 * board を直接書き換え、回復したコマと合計回復量を返す。ライフ0のコマも回復する
 */
export const CHARGE_HEAL = 2;
export const healCharged = (board: SquareInfo[], player: Player | undefined): { healed: number[]; total: number } => {
    const healed: number[] = [];
    let total = 0;
    board.forEach((sq, i) => {
        if (sq.player !== player || isDormant(sq)) return;
        const stacks = chargeStacks(sq);
        if (stacks === 0) return;
        board[i] = { ...sq, bind: sq.bind + stacks * CHARGE_HEAL };
        healed.push(i);
        total += stacks * CHARGE_HEAL;
    });
    return { healed, total };
};

/** 雷のない所に火は立たぬの対象: ⚡のあるコマ（ロック中は除く。敵の無敵マスは除く） */
export const thunderFireTargets = (board: SquareInfo[], me: Player, chars: PlayerCharacters): number[] =>
    cellsWhere(board, (sq) => !!sq.player && chargeStacks(sq) > 0 && !hasLock(sq) && (sq.player === me || !isShielded(sq, chars)));

/** 雷神のへそくり: マスの⚡を全て外す。board を直接書き換え、外した数（次のスキルの軽減に回る）を返す */
export const stashBolts = (board: SquareInfo[], cell: number): number => {
    const n = chargeStacks(board[cell]);
    board[cell] = { ...board[cell], effects: board[cell].effects.filter((e) => e.effect !== '⚡') };
    return n;
};

/** 沈黙は雷なり: マスの⚡を1個払う。board を直接書き換え、払えたら true（⚡が無ければ false） */
export const payBolt = (board: SquareInfo[], cell: number): boolean => {
    const at = board[cell].effects.findIndex((e) => e.effect === '⚡');
    if (at === -1) return false;
    board[cell] = { ...board[cell], effects: board[cell].effects.filter((_, k) => k !== at) };
    return true;
};

/**
 * 雷のない所に火は立たぬ: 氷結中のコマなら❄を1つ砕くだけ（frozen=true。コマは壊れず火も移らない）。
 * そうでなければコマを壊して空きマスにし、周囲8マスの敵コマ（ロック・無敵を除く）の無作為な一部に🔥を付ける。
 * board を直接書き換える。壊したときの墓地（addCorpses）は呼び出し側が数える。rng は [0,1) を返す関数
 */
export const thunderFire = (
    board: SquareInfo[],
    cell: number,
    me: Player,
    chars: PlayerCharacters,
    size: number,
    rng: () => number,
    keepBuds?: (sq: SquareInfo) => boolean
): { frozen: boolean; picks: number[]; thawed: number[] } => {
    if (isFrozen(board[cell])) {
        board[cell] = thawOne(board[cell]);
        return { frozen: true, picks: [], thawed: [] };
    }
    board[cell] = { player: undefined, bind: 0, effects: [] };
    const cands = geometryOf(size).surroundRange(cell).filter((j) => board[j].player && board[j].player !== me && !isGuarded(board[j], chars));
    const picks = thunderFireVictims(cands, rng);
    const { thawed } = ignite(board, picks, size, 1, keepBuds);
    return { frozen: false, picks, thawed };
};
