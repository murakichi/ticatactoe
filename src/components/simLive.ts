/** public/sim/live.js（sim/live.js のコピー。scripts/copy-sim.js が置く）を画面側で読み込む。集計・分析はここで行い、Worker は対戦だけを回す */

export type CharRow = { id: string; appearances: number; wins: number; winRate: number; ci: number | null; avgTurnsWon: number | null };
export type Summary = { games: number; drawRate: number; avgTurns: number; fair: number; seatWinRate: (number | null)[]; rows: CharRow[] };
export type Matchups = Record<string, Record<string, { meets: number; wins: number; losses: number; winRate: number | null }>>;
export type Analysis = {
    rows: {
        id: string;
        fieldAvg: number | null;
        strongAvg: number | null;
        worst: { id: string; rate: number; decided: number } | null;
        unfavorable: number;
        favorable: number;
        solidOpponents: number;
        opponents: number;
        eq: number;
    }[];
    exploit: number;
    minPairDecided: number;
    solidPairs: number;
    totalPairs: number;
    ready: boolean;
    minDecided: number;
    players: number;
};
export type Verdict = { headline: string; points: string[] };
export type Conv = { window: number; eps: number; minGames: number };

/** Worker が返す累計の統計（中身は sim/live.js の createStats）。画面側では触らず live に渡すだけ */
export type RawStats = { perChar: Record<string, unknown> };

export type LiveApi = {
    createAggregator(ids: string[], players: number, ckEvery: number): unknown;
    aggregate(agg: unknown, parts: (RawStats | null)[]): RawStats;
    summarize(st: RawStats): Summary;
    matchups(st: RawStats): Matchups;
    analyze(st: RawStats): Analysis | null;
    verdict(an: Analysis | null): Verdict;
    maxDrift(st: RawStats, window: number): number | null;
    converged(st: RawStats, conv: Conv): boolean;
};

let cached: Promise<LiveApi> | null = null;
/** sim/live.js は require を持たない CommonJS。fetch して関数として評価する */
export const loadLive = (): Promise<LiveApi> => {
    if (!cached) {
        cached = fetch(`${process.env.PUBLIC_URL}/sim/live.js`)
            .then((r) => {
                if (!r.ok) throw new Error(`live.js ${r.status}`);
                return r.text();
            })
            .then((text) => {
                const module = { exports: {} as unknown };
                new Function('module', 'exports', text)(module, module.exports);
                return module.exports as LiveApi;
            });
        cached.catch(() => { cached = null; });
    }
    return cached;
};
