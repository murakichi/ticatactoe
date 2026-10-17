// 効果音: 音声ファイルは使わず Web Audio API で合成する(アセット不要・軽量)。
// 合成ロジック(scheduleSfx)は BaseAudioContext を受け取るので、実機の AudioContext でも
// OfflineAudioContext(テスト・波形確認)でも同じコードが動く。
import type { SkillEffectType } from './components/game/BoardEffects';

export type Sfx = SkillEffectType | 'place' | 'charge' | 'win';

type ToneOpts = {
    type?: OscillatorType;
    f0: number;
    /** 指定すると f0 → f1 へ指数的にスライドする */
    f1?: number;
    t: number;
    dur: number;
    gain: number;
    /** ローパスのカットオフ(Hz)。角を丸めて耳に刺さらなくする */
    lowpass?: number;
};

type NoiseOpts = {
    t: number;
    dur: number;
    gain: number;
    filter: BiquadFilterType;
    f0: number;
    f1?: number;
    q?: number;
};

const FLOOR = 0.0001;

const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>();
const noiseBufferOf = (ctx: BaseAudioContext): AudioBuffer => {
    let buf = noiseBuffers.get(ctx);
    if (!buf) {
        buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 1.5), ctx.sampleRate);
        const data = buf.getChannelData(0);
        // 毎回同じ波形になるよう簡易な疑似乱数(LCG)で埋める
        let seed = 12345;
        for (let i = 0; i < data.length; i++) {
            seed = (seed * 1664525 + 1013904223) >>> 0;
            data[i] = (seed / 0xffffffff) * 2 - 1;
        }
        noiseBuffers.set(ctx, buf);
    }
    return buf;
};

// 立ち上がり5msで最大 → 指数的に減衰する、クリックノイズの出ないエンベロープ
const envelope = (g: AudioParam, t: number, dur: number, peak: number) => {
    g.setValueAtTime(FLOOR, t);
    g.linearRampToValueAtTime(peak, t + 0.005);
    g.exponentialRampToValueAtTime(FLOOR, t + dur);
};

const tone = (ctx: BaseAudioContext, dest: AudioNode, o: ToneOpts) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(o.f0, o.t);
    if (o.f1 !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(o.f1, 1), o.t + o.dur);
    envelope(g.gain, o.t, o.dur, o.gain);
    osc.connect(g);
    if (o.lowpass) {
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = o.lowpass;
        g.connect(lp);
        lp.connect(dest);
    } else {
        g.connect(dest);
    }
    osc.start(o.t);
    osc.stop(o.t + o.dur + 0.02);
};

const noise = (ctx: BaseAudioContext, dest: AudioNode, o: NoiseOpts) => {
    const src = ctx.createBufferSource();
    src.buffer = noiseBufferOf(ctx);
    const f = ctx.createBiquadFilter();
    f.type = o.filter;
    f.Q.value = o.q ?? 0.8;
    f.frequency.setValueAtTime(o.f0, o.t);
    if (o.f1 !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(o.f1, 1), o.t + o.dur);
    const g = ctx.createGain();
    envelope(g.gain, o.t, o.dur, o.gain);
    src.connect(f);
    f.connect(g);
    g.connect(dest);
    src.start(o.t);
    src.stop(o.t + o.dur + 0.02);
};

// 腹に響く「ドン」。ほぼ全スキルの頭に入れて、バナーがドンと出る瞬間と合わせる
const boom = (ctx: BaseAudioContext, d: AudioNode, t: number, gain = 0.9) => {
    tone(ctx, d, { f0: 150, f1: 38, t, dur: 0.42, gain });
    noise(ctx, d, { t, dur: 0.14, gain: gain * 0.45, filter: 'lowpass', f0: 500, f1: 120 });
};

// 上昇アルペジオなどの「きらめき」
const sparkle = (ctx: BaseAudioContext, d: AudioNode, t: number, notes: number[], step: number, gain = 0.2) => {
    notes.forEach((f, i) => tone(ctx, d, { type: 'triangle', f0: f, t: t + i * step, dur: 0.32, gain }));
};

// 音階(ヘルツ)
const C5 = 523.25;
const E5 = 659.25;
const G5 = 783.99;
const C6 = 1046.5;
const E6 = 1318.5;

/**
 * 効果音を t0 から鳴るよう予約し、鳴り終わるまでの秒数を返す。
 * 各 sfx の時間配置は BoardEffects.module.css のアニメーションに合わせてある。
 */
export const scheduleSfx = (ctx: BaseAudioContext, d: AudioNode, sfx: Sfx, t0: number): number => {
    const T = (s: number) => t0 + s;
    switch (sfx) {
        case 'slash':
        case 'backslash': {
            // 3連撃: 斬撃ラインが110msずつずれて走るのに合わせる
            for (let i = 0; i < 3; i++) {
                noise(ctx, d, { t: T(i * 0.11), dur: 0.2, gain: 0.5, filter: 'bandpass', f0: 2500, f1: 9000, q: 1.2 });
                const up = sfx === 'backslash';
                tone(ctx, d, { type: 'triangle', f0: up ? 1300 : 2200, f1: up ? 2400 : 1100, t: T(i * 0.11), dur: 0.14, gain: 0.16 });
            }
            boom(ctx, d, T(0.2), 0.5);
            return 0.7;
        }
        case 'stomp': {
            tone(ctx, d, { f0: 140, f1: 32, t: T(0), dur: 0.55, gain: 1 });
            noise(ctx, d, { t: T(0), dur: 0.35, gain: 0.8, filter: 'lowpass', f0: 700, f1: 90 });
            // 衝撃波リングの余韻と、飛び散る瓦礫
            tone(ctx, d, { f0: 110, f1: 40, t: T(0.14), dur: 0.3, gain: 0.35 });
            tone(ctx, d, { f0: 90, f1: 40, t: T(0.28), dur: 0.3, gain: 0.25 });
            for (let i = 0; i < 6; i++) noise(ctx, d, { t: T(0.1 + i * 0.07), dur: 0.05, gain: 0.25, filter: 'highpass', f0: 2500 + i * 400 });
            return 0.8;
        }
        case 'judge': {
            // 雷鳴 + 2回のフラッシュに合わせた雷撃
            noise(ctx, d, { t: T(0), dur: 1.0, gain: 0.8, filter: 'lowpass', f0: 3000, f1: 180 });
            for (const s of [0, 0.26]) {
                tone(ctx, d, { type: 'sawtooth', f0: 2000, f1: 100, t: T(s), dur: 0.25, gain: 0.28, lowpass: 5000 });
                boom(ctx, d, T(s), 0.8);
            }
            return 1.1;
        }
        case 'opium': {
            tone(ctx, d, { f0: 220, f1: 105, t: T(0), dur: 1.0, gain: 0.6 });
            tone(ctx, d, { f0: 226, f1: 110, t: T(0), dur: 1.0, gain: 0.5 });
            noise(ctx, d, { t: T(0), dur: 0.8, gain: 0.3, filter: 'bandpass', f0: 500, q: 0.7 });
            return 1.0;
        }
        case 'tsunami': {
            for (let i = 0; i < 3; i++) {
                noise(ctx, d, { t: T(i * 0.16), dur: 0.6, gain: 1.0, filter: 'bandpass', f0: 300, f1: 2500, q: 0.8 });
                tone(ctx, d, { f0: 500 + i * 120, f1: 1400 + i * 200, t: T(0.1 + i * 0.16), dur: 0.1, gain: 0.3 });
            }
            return 1.0;
        }
        case 'assault': {
            // 行進の太鼓4連打 → 突撃ラッパ
            for (let i = 0; i < 4; i++) {
                tone(ctx, d, { f0: 130, f1: 50, t: T(i * 0.12), dur: 0.14, gain: 0.85 });
                noise(ctx, d, { t: T(i * 0.12 + 0.06), dur: 0.06, gain: 0.3, filter: 'highpass', f0: 1800 });
            }
            tone(ctx, d, { type: 'sawtooth', f0: 220, t: T(0.5), dur: 0.55, gain: 0.2, lowpass: 1500 });
            tone(ctx, d, { type: 'sawtooth', f0: 330, t: T(0.5), dur: 0.55, gain: 0.16, lowpass: 1500 });
            tone(ctx, d, { type: 'sawtooth', f0: 440, t: T(0.5), dur: 0.55, gain: 0.12, lowpass: 1500 });
            return 1.1;
        }
        case 'necromancy': {
            boom(ctx, d, T(0), 0.6);
            [329.6, 293.7, 261.6, 220].forEach((f, i) =>
                tone(ctx, d, { type: 'sawtooth', f0: f, t: T(0.1 + i * 0.16), dur: 0.4, gain: 0.22, lowpass: 900 })
            );
            tone(ctx, d, { f0: 880, f1: 1320, t: T(0.5), dur: 0.7, gain: 0.12 });
            return 1.2;
        }
        case 'yinyang': {
            // 太極図の回転に合わせた上昇グリッサンドと鈴
            tone(ctx, d, { f0: 400, f1: 1600, t: T(0), dur: 0.6, gain: 0.25 });
            for (const [s, f] of [[0.1, 880], [0.1, 1320], [0.35, 1175], [0.35, 1760]] as const) {
                tone(ctx, d, { f0: f, t: T(s), dur: 0.5, gain: 0.18 });
            }
            return 0.9;
        }
        case 'harvest': {
            sparkle(ctx, d, T(0), [C5, E5, G5, C6, E6], 0.07, 0.3);
            tone(ctx, d, { f0: 2093, t: T(0.4), dur: 0.5, gain: 0.12 });
            return 0.95;
        }
        case 'famine':
        case 'auraRed': {
            [440, 415.3, 392, 370].forEach((f, i) =>
                tone(ctx, d, { type: 'sawtooth', f0: f, t: T(i * 0.12), dur: 0.3, gain: 0.4, lowpass: 1200 })
            );
            noise(ctx, d, { t: T(0.1), dur: 0.5, gain: 0.3, filter: 'lowpass', f0: 1200, f1: 300 });
            return 0.8;
        }
        case 'auraGreen': {
            // 全コマに芽吹く: 長めの和音がゆっくり立ち上がる
            [261.6, 329.6, 392, 523.25].forEach((f, i) => tone(ctx, d, { type: 'triangle', f0: f, t: T(i * 0.05), dur: 0.9, gain: 0.18 }));
            sparkle(ctx, d, T(0.3), [G5, C6, E6, G5 * 2], 0.08, 0.15);
            return 1.1;
        }
        case 'poison': {
            tone(ctx, d, { f0: 90, t: T(0), dur: 0.5, gain: 0.4 });
            for (let i = 0; i < 5; i++) tone(ctx, d, { f0: 300 + i * 90, f1: 900 + i * 60, t: T(i * 0.07), dur: 0.1, gain: 0.4 });
            noise(ctx, d, { t: T(0), dur: 0.4, gain: 0.25, filter: 'highpass', f0: 3000 });
            return 0.6;
        }
        case 'proliferate': {
            [523, 587, 659, 784, 880, 1047].forEach((f, i) => tone(ctx, d, { f0: f, f1: f * 1.25, t: T(i * 0.05), dur: 0.12, gain: 0.4 }));
            return 0.45;
        }
        case 'zap': {
            tone(ctx, d, { type: 'sawtooth', f0: 1800, f1: 300, t: T(0), dur: 0.15, gain: 0.6, lowpass: 5000 });
            noise(ctx, d, { t: T(0), dur: 0.08, gain: 0.6, filter: 'highpass', f0: 3500 });
            tone(ctx, d, { f0: 3000, t: T(0), dur: 0.03, gain: 0.3 });
            return 0.25;
        }
        case 'overload': {
            for (let i = 0; i < 3; i++) tone(ctx, d, { type: 'sawtooth', f0: 1800, f1: 250, t: T(i * 0.08), dur: 0.12, gain: 0.3, lowpass: 5000 });
            noise(ctx, d, { t: T(0.2), dur: 0.6, gain: 0.7, filter: 'bandpass', f0: 4000, f1: 300, q: 0.9 });
            boom(ctx, d, T(0.2), 0.95);
            return 0.9;
        }
        case 'place': {
            // 駒を置く「ポン」
            tone(ctx, d, { type: 'triangle', f0: 520, f1: 880, t: T(0), dur: 0.09, gain: 0.8 });
            tone(ctx, d, { f0: 1040, t: T(0), dur: 0.05, gain: 0.3 });
            return 0.12;
        }
        case 'charge': {
            // コインを取ったような2音
            tone(ctx, d, { type: 'square', f0: 988, t: T(0), dur: 0.07, gain: 0.3, lowpass: 4000 });
            tone(ctx, d, { type: 'square', f0: 1319, t: T(0.07), dur: 0.35, gain: 0.3, lowpass: 4000 });
            return 0.45;
        }
        case 'win': {
            // ファンファーレ: 上昇アルペジオ → 最後に和音で締める
            [C5, E5, G5, C6].forEach((f, i) => tone(ctx, d, { type: 'triangle', f0: f, t: T(i * 0.1), dur: 0.3, gain: 0.3 }));
            for (const f of [C5, E5, G5, C6]) tone(ctx, d, { type: 'triangle', f0: f, t: T(0.5), dur: 1.0, gain: 0.2 });
            tone(ctx, d, { type: 'square', f0: C6, t: T(0.5), dur: 0.9, gain: 0.08, lowpass: 3000 });
            sparkle(ctx, d, T(0.55), [E6, G5 * 2, C6 * 2], 0.09, 0.14);
            boom(ctx, d, T(0.5), 0.5);
            return 1.6;
        }
        default: {
            // 未知の演出でも無音にはしない
            boom(ctx, d, T(0), 0.7);
            return 0.5;
        }
    }
};

// ===== 実機での再生 =====

const STORAGE_KEY = 'ticatactoe.sound';
const MASTER_GAIN = 0.5;

let muted = false;
try {
    muted = typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY) === 'off';
} catch {
    // localStorage が使えない環境では既定(オン)のまま
}

export const isMuted = (): boolean => muted;

export const setMuted = (value: boolean) => {
    muted = value;
    try {
        localStorage.setItem(STORAGE_KEY, value ? 'off' : 'on');
    } catch {
        // 保存できなくても今回のセッションでは有効
    }
};

type Live = { ctx: AudioContext; master: GainNode };
let live: Live | null = null;

const liveContext = (): Live | null => {
    if (live) return live;
    const Ctor: typeof AudioContext | undefined =
        typeof window === 'undefined' ? undefined : window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try {
        const ctx = new Ctor();
        const master = ctx.createGain();
        master.gain.value = MASTER_GAIN;
        // 重なっても割れないようコンプレッサーを通す
        const comp = ctx.createDynamicsCompressor();
        master.connect(comp);
        comp.connect(ctx.destination);
        live = { ctx, master };
        return live;
    } catch {
        return null;
    }
};

/** 効果音を鳴らす。ミュート中・音が使えない環境では何もしない(例外も出さない) */
export const playSfx = (sfx: Sfx) => {
    if (muted) return;
    const l = liveContext();
    if (!l) return;
    try {
        // ブラウザは最初のクリックまで音を止めている。操作後に呼ばれたここで再開する
        if (l.ctx.state === 'suspended') void l.ctx.resume();
        scheduleSfx(l.ctx, l.master, sfx, l.ctx.currentTime + 0.01);
    } catch {
        // 音が出せなくてもゲームは止めない
    }
};
