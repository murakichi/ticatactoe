// 効果音: 音声ファイルは使わず Web Audio API で合成する(アセット不要・軽量)。
// 合成ロジック(scheduleSfx)は BaseAudioContext を受け取るので、実機の AudioContext でも
// OfflineAudioContext(テスト・波形確認)でも同じコードが動く。
import type { BurstType, SkillEffectType } from './components/game/BoardEffects';

export type Sfx = SkillEffectType | BurstType | 'place' | 'charge' | 'win' | 'lock' | 'gear';

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

// 腹に響きつつ音程が駆け上がる「ブォン↗」。ほぼ全スキルの頭に入れて、バナーが出る瞬間と合わせる。
// スキル発動は「強くなる・上がる」感じにしたいので、音程は下げず、低音から高音へ上げる
const boom = (ctx: BaseAudioContext, d: AudioNode, t: number, gain = 0.9) => {
    tone(ctx, d, { f0: 45, f1: 170, t, dur: 0.36, gain });
    noise(ctx, d, { t, dur: 0.16, gain: gain * 0.45, filter: 'lowpass', f0: 150, f1: 1000 });
    tone(ctx, d, { type: 'triangle', f0: 600, f1: 1500, t: t + 0.02, dur: 0.14, gain: gain * 0.3 });
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
            // 3連撃: 斬撃ラインが110msずつずれて走るのに合わせる。
            // 低い「ブォン↗」で構えてから、1撃ごとに高さを上げながら斬る(下がる印象にならないよう、低音を先に鳴らす)
            boom(ctx, d, T(0), 0.8);
            const up = sfx === 'backslash';
            for (let i = 0; i < 3; i++) {
                noise(ctx, d, { t: T(i * 0.11), dur: 0.2, gain: 0.8, filter: 'bandpass', f0: 2000 + i * 1500, f1: 7000 + i * 1800, q: 1.2 });
                tone(ctx, d, { type: 'triangle', f0: (up ? 1500 : 1100) + i * 350, f1: (up ? 2800 : 2200) + i * 500, t: T(i * 0.11), dur: 0.14, gain: 0.16 });
            }
            return 0.7;
        }
        case 'stomp': {
            // 影が広がる間は笛のような上昇音で溜め、足が落ちる瞬間にドンと低音、地割れ・瓦礫が続く(全体を通して音程は上がる)
            tone(ctx, d, { type: 'triangle', f0: 180, f1: 1400, t: T(0), dur: 0.5, gain: 0.22 });
            tone(ctx, d, { f0: 30, f1: 110, t: T(0.15), dur: 0.4, gain: 0.4 });
            tone(ctx, d, { f0: 32, f1: 150, t: T(0.5), dur: 0.6, gain: 1 });
            noise(ctx, d, { t: T(0.5), dur: 0.4, gain: 0.85, filter: 'lowpass', f0: 90, f1: 800 });
            // 衝撃波リングが広がるたびに音程が一段ずつ上がる
            tone(ctx, d, { f0: 40, f1: 110, t: T(0.64), dur: 0.3, gain: 0.35 });
            tone(ctx, d, { f0: 55, f1: 150, t: T(0.78), dur: 0.3, gain: 0.3 });
            tone(ctx, d, { f0: 75, f1: 210, t: T(0.92), dur: 0.3, gain: 0.25 });
            // 地割れ(ピシピシ)と瓦礫
            for (let i = 0; i < 8; i++) noise(ctx, d, { t: T(0.55 + i * 0.05), dur: 0.05, gain: 0.25, filter: 'highpass', f0: 2500 + i * 400 });
            for (let i = 0; i < 5; i++) noise(ctx, d, { t: T(0.9 + i * 0.08), dur: 0.06, gain: 0.2, filter: 'bandpass', f0: 600 + i * 300, f1: 1500 + i * 300, q: 1 });
            return 1.5;
        }
        case 'judge': {
            // 空が暗くなる低い唸り(上昇) → 光の筋が走る → 範囲内に雷が連続で落ち、最後に天秤の鐘
            tone(ctx, d, { type: 'sawtooth', f0: 70, f1: 420, t: T(0), dur: 0.55, gain: 0.2, lowpass: 1200 });
            noise(ctx, d, { t: T(0.5), dur: 1.2, gain: 0.8, filter: 'lowpass', f0: 180, f1: 3000 });
            for (const s of [0.5, 0.75, 0.95]) {
                tone(ctx, d, { type: 'sawtooth', f0: 100, f1: 2000, t: T(s), dur: 0.25, gain: 0.28, lowpass: 5000 });
                boom(ctx, d, T(s), 0.55);
            }
            for (let i = 0; i < 6; i++) noise(ctx, d, { t: T(0.8 + i * 0.07), dur: 0.05, gain: 0.35, filter: 'highpass', f0: 3000 + i * 300 });
            sparkle(ctx, d, T(1.2), [C6, E6, G5 * 2, C6 * 2], 0.1, 0.22);
            return 1.8;
        }
        case 'opium': {
            tone(ctx, d, { f0: 105, f1: 220, t: T(0), dur: 1.0, gain: 0.6 });
            tone(ctx, d, { f0: 110, f1: 226, t: T(0), dur: 1.0, gain: 0.5 });
            noise(ctx, d, { t: T(0), dur: 0.8, gain: 0.3, filter: 'bandpass', f0: 300, f1: 900, q: 0.7 });
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
            // 行進の太鼓(打つたびに音程が上がる)が騎馬の突進に合わせて続き、音階を駆け上がる突撃ラッパ → 着弾の連打
            for (let i = 0; i < 7; i++) {
                tone(ctx, d, { f0: 50 + i * 8, f1: 130 + i * 10, t: T(i * 0.1), dur: 0.14, gain: 0.8 });
                noise(ctx, d, { t: T(i * 0.1 + 0.06), dur: 0.06, gain: 0.3, filter: 'highpass', f0: 1800 });
            }
            [220, 330, 440].forEach((f, i) => tone(ctx, d, { type: 'sawtooth', f0: f, t: T(0.5 + i * 0.12), dur: i === 2 ? 0.6 : 0.3, gain: 0.2, lowpass: 1500 }));
            for (let i = 0; i < 6; i++) {
                boom(ctx, d, T(0.95 + i * 0.1), 0.35);
                noise(ctx, d, { t: T(0.95 + i * 0.1), dur: 0.1, gain: 0.4, filter: 'bandpass', f0: 1500 + i * 500, f1: 4000 + i * 400, q: 1 });
            }
            return 1.7;
        }
        case 'necromancy': {
            // 闇が降りる低音 → 魔法陣の詠唱(上昇する旋律) → 墓が割れて魂が立ち昇る
            boom(ctx, d, T(0), 0.6);
            [220, 261.6, 293.7, 329.6, 392].forEach((f, i) =>
                tone(ctx, d, { type: 'sawtooth', f0: f, t: T(0.1 + i * 0.16), dur: 0.4, gain: 0.22, lowpass: 900 })
            );
            tone(ctx, d, { f0: 880, f1: 1320, t: T(0.5), dur: 0.7, gain: 0.12 });
            noise(ctx, d, { t: T(0.9), dur: 0.4, gain: 0.35, filter: 'lowpass', f0: 200, f1: 1500 });
            tone(ctx, d, { type: 'triangle', f0: 500, f1: 2200, t: T(1.0), dur: 0.8, gain: 0.18 });
            return 1.8;
        }
        case 'yinyang': {
            // 墨が反転する上昇グリッサンド → 太極図の回転に合わせた鈴 → 最後に澄んだ音が駆け上がる
            tone(ctx, d, { f0: 200, f1: 1600, t: T(0), dur: 0.8, gain: 0.25 });
            for (const [s, f] of [[0.2, 880], [0.2, 1320], [0.55, 1175], [0.55, 1760], [0.9, 1568], [0.9, 2093]] as const) {
                tone(ctx, d, { f0: f, t: T(s), dur: 0.5, gain: 0.18 });
            }
            sparkle(ctx, d, T(1.1), [C6, E6, G5 * 2], 0.1, 0.2);
            return 1.6;
        }
        case 'harvest': {
            sparkle(ctx, d, T(0), [C5, E5, G5, C6, E6], 0.07, 0.3);
            tone(ctx, d, { f0: 2093, t: T(0.4), dur: 0.5, gain: 0.12 });
            return 0.95;
        }
        case 'famine':
        case 'auraRed': {
            [370, 392, 415.3, 440].forEach((f, i) =>
                tone(ctx, d, { type: 'sawtooth', f0: f, t: T(i * 0.12), dur: 0.3, gain: 0.4, lowpass: 1200 })
            );
            noise(ctx, d, { t: T(0.1), dur: 0.5, gain: 0.3, filter: 'lowpass', f0: 300, f1: 1200 });
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
        case 'freeze': {
            // 氷結: 高い澄んだ音が連なり、ぱきんと凍る
            [2093, 2637, 3136, 4186].forEach((f, i) => tone(ctx, d, { type: 'triangle', f0: f, t: T(i * 0.04), dur: 0.25, gain: 0.25 }));
            noise(ctx, d, { t: T(0.12), dur: 0.1, gain: 0.35, filter: 'highpass', f0: 6000 });
            return 0.5;
        }
        case 'flame': {
            // 火炎: 低く唸る炎のゴウッという噴き上がり
            noise(ctx, d, { t: T(0), dur: 0.55, gain: 0.5, filter: 'bandpass', f0: 400, f1: 1800, q: 0.7 });
            tone(ctx, d, { type: 'sawtooth', f0: 110, f1: 220, t: T(0), dur: 0.4, gain: 0.35, lowpass: 900 });
            return 0.6;
        }
        case 'glacier': {
            // 氷の枠が閉じていく冷気の上昇音 → 重い低音 → 結晶が降り注ぐ
            tone(ctx, d, { type: 'triangle', f0: 200, f1: 1800, t: T(0), dur: 0.6, gain: 0.22, lowpass: 5000 });
            boom(ctx, d, T(0.5), 0.8);
            tone(ctx, d, { type: 'triangle', f0: 300, f1: 2400, t: T(0.55), dur: 0.7, gain: 0.3, lowpass: 5000 });
            noise(ctx, d, { t: T(0.6), dur: 0.8, gain: 0.3, filter: 'highpass', f0: 4000 });
            sparkle(ctx, d, T(0.8), [C6, E6, G5 * 2, C6 * 2, E6 * 2], 0.1, 0.22);
            return 1.6;
        }
        case 'glacierBurst': {
            // 氷結崩壊: ガラスが砕ける連打と衝撃
            boom(ctx, d, T(0), 0.95);
            noise(ctx, d, { t: T(0), dur: 0.5, gain: 0.7, filter: 'highpass', f0: 3000 });
            for (let i = 0; i < 7; i++) tone(ctx, d, { f0: 1200 + i * 350, f1: 3800 + i * 100, t: T(0.04 + i * 0.05), dur: 0.12, gain: 0.3 });
            sparkle(ctx, d, T(0.4), [E6, C6, G5 * 2], 0.06, 0.2);
            return 0.9;
        }
        case 'inferno': {
            // 地鳴り(上昇) → 業火が噴き上がり、火柱が次々に爆ぜる
            tone(ctx, d, { type: 'sawtooth', f0: 50, f1: 300, t: T(0), dur: 0.5, gain: 0.25, lowpass: 700 });
            boom(ctx, d, T(0.45), 0.9);
            noise(ctx, d, { t: T(0.45), dur: 1.1, gain: 0.55, filter: 'bandpass', f0: 300, f1: 2400, q: 0.6 });
            tone(ctx, d, { type: 'sawtooth', f0: 90, f1: 260, t: T(0.45), dur: 1.0, gain: 0.4, lowpass: 900 });
            for (let i = 0; i < 8; i++) noise(ctx, d, { t: T(0.7 + i * 0.09), dur: 0.05, gain: 0.35, filter: 'highpass', f0: 2500 + i * 200 });
            return 1.7;
        }
        case 'miasma': {
            // 毒の靄が低く立ちこめ(上昇)、ぷくぷくと泡立ちながら敵へ流れていく
            tone(ctx, d, { type: 'sawtooth', f0: 70, f1: 300, t: T(0), dur: 0.8, gain: 0.22, lowpass: 700 });
            noise(ctx, d, { t: T(0.1), dur: 1.0, gain: 0.3, filter: 'bandpass', f0: 300, f1: 1400, q: 0.7 });
            for (let i = 0; i < 7; i++) tone(ctx, d, { f0: 250 + i * 70, f1: 700 + i * 80, t: T(0.3 + i * 0.1), dur: 0.1, gain: 0.35 });
            tone(ctx, d, { type: 'triangle', f0: 500, f1: 1800, t: T(1.0), dur: 0.5, gain: 0.15 });
            return 1.6;
        }
        case 'chainZap': {
            // 起点でバチッ → 電撃が枝分かれしながら次々に駆け上がる
            boom(ctx, d, T(0), 0.6);
            for (let i = 0; i < 6; i++) {
                tone(ctx, d, { type: 'sawtooth', f0: 300 + i * 120, f1: 1800 + i * 300, t: T(0.15 + i * 0.12), dur: 0.14, gain: 0.4, lowpass: 6000 });
                noise(ctx, d, { t: T(0.22 + i * 0.12), dur: 0.06, gain: 0.35, filter: 'highpass', f0: 3500 });
            }
            tone(ctx, d, { f0: 2000, f1: 3200, t: T(0.9), dur: 0.3, gain: 0.15 });
            return 1.3;
        }
        case 'thunderHeal': {
            // 雷鳴 → ⚡が落ちる → 温かい回復の和音が立ち上がる
            noise(ctx, d, { t: T(0), dur: 0.5, gain: 0.5, filter: 'lowpass', f0: 200, f1: 2500 });
            tone(ctx, d, { type: 'sawtooth', f0: 120, f1: 1800, t: T(0), dur: 0.3, gain: 0.3, lowpass: 5000 });
            boom(ctx, d, T(0.15), 0.6);
            sparkle(ctx, d, T(0.45), [C5, E5, G5, C6, E6], 0.09, 0.26);
            for (const f of [C5, G5]) tone(ctx, d, { type: 'triangle', f0: f, t: T(0.85), dur: 0.8, gain: 0.18 });
            return 1.7;
        }
        case 'thunderFall': {
            // 空が暗くなる唸り(上昇) → 落雷が連続で落ちる → 余韻の高い響き
            tone(ctx, d, { type: 'sawtooth', f0: 60, f1: 400, t: T(0), dur: 0.4, gain: 0.2, lowpass: 900 });
            noise(ctx, d, { t: T(0.35), dur: 1.0, gain: 0.7, filter: 'lowpass', f0: 180, f1: 3200 });
            for (let i = 0; i < 4; i++) {
                tone(ctx, d, { type: 'sawtooth', f0: 100 + i * 60, f1: 2000 + i * 300, t: T(0.35 + i * 0.12), dur: 0.22, gain: 0.3, lowpass: 5500 });
                boom(ctx, d, T(0.35 + i * 0.12), 0.5);
            }
            tone(ctx, d, { type: 'triangle', f0: 500, f1: 2600, t: T(0.9), dur: 0.7, gain: 0.2 });
            return 1.7;
        }
        case 'thunderFire': {
            // 落雷 → 爆ぜる → 炎がごうっと燃え広がる(音程は上がる)
            tone(ctx, d, { type: 'sawtooth', f0: 100, f1: 2200, t: T(0), dur: 0.25, gain: 0.35, lowpass: 6000 });
            noise(ctx, d, { t: T(0.2), dur: 0.25, gain: 0.7, filter: 'lowpass', f0: 300, f1: 3000 });
            boom(ctx, d, T(0.22), 0.9);
            noise(ctx, d, { t: T(0.45), dur: 0.9, gain: 0.45, filter: 'bandpass', f0: 300, f1: 2200, q: 0.6 });
            tone(ctx, d, { type: 'sawtooth', f0: 90, f1: 240, t: T(0.45), dur: 0.8, gain: 0.3, lowpass: 900 });
            for (let i = 0; i < 5; i++) noise(ctx, d, { t: T(0.7 + i * 0.09), dur: 0.05, gain: 0.3, filter: 'highpass', f0: 2500 + i * 300 });
            return 1.5;
        }
        case 'stash': {
            // ⚡が吸い込まれる上昇音 → 財布に貯まる → 小銭がチャリチャリと鳴る
            tone(ctx, d, { type: 'sawtooth', f0: 200, f1: 1500, t: T(0), dur: 0.5, gain: 0.25, lowpass: 4000 });
            tone(ctx, d, { f0: 392, t: T(0.55), dur: 0.1, gain: 0.3 });
            for (let i = 0; i < 6; i++) {
                tone(ctx, d, { type: 'square', f0: 1760 + i * 60, t: T(0.65 + i * 0.07), dur: 0.05, gain: 0.12, lowpass: 5000 });
                tone(ctx, d, { type: 'square', f0: 2349 + i * 60, t: T(0.69 + i * 0.07), dur: 0.1, gain: 0.12, lowpass: 5000 });
            }
            return 1.3;
        }
        case 'staticSeason': {
            // パチパチと静電気が走る音が、だんだん高く・細かくなる
            noise(ctx, d, { t: T(0), dur: 1.2, gain: 0.2, filter: 'highpass', f0: 3000, f1: 6000 });
            for (let i = 0; i < 12; i++) tone(ctx, d, { f0: 1500 + i * 220, f1: 3000 + i * 260, t: T(0.05 + i * 0.1), dur: 0.05, gain: 0.3 });
            tone(ctx, d, { type: 'triangle', f0: 400, f1: 2200, t: T(0.1), dur: 1.0, gain: 0.15 });
            return 1.4;
        }
        case 'bristle': {
            // ぞわっと総毛立つ: 小さな放電が次々に連なって駆け上がる
            for (let i = 0; i < 8; i++) {
                tone(ctx, d, { type: 'sawtooth', f0: 300 + i * 110, f1: 1500 + i * 220, t: T(i * 0.07), dur: 0.1, gain: 0.35, lowpass: 5500 });
                noise(ctx, d, { t: T(i * 0.07 + 0.04), dur: 0.04, gain: 0.3, filter: 'highpass', f0: 3500 });
            }
            tone(ctx, d, { type: 'triangle', f0: 800, f1: 2800, t: T(0.5), dur: 0.5, gain: 0.2 });
            return 1.1;
        }
        case 'darkPot': {
            // ぐつぐつ煮える低い音(上昇) → 具が弾け飛ぶ → 何が出るか分からない不穏な音階
            tone(ctx, d, { type: 'sawtooth', f0: 70, f1: 300, t: T(0), dur: 0.7, gain: 0.22, lowpass: 700 });
            for (let i = 0; i < 9; i++) tone(ctx, d, { f0: 220 + i * 60, f1: 600 + i * 90, t: T(0.1 + i * 0.08), dur: 0.09, gain: 0.35 });
            noise(ctx, d, { t: T(0.7), dur: 0.5, gain: 0.35, filter: 'bandpass', f0: 500, f1: 3000, q: 0.8 });
            [220, 261.6, 311.1, 370, 440].forEach((f, i) => tone(ctx, d, { type: 'triangle', f0: f, t: T(0.8 + i * 0.1), dur: 0.35, gain: 0.2 }));
            return 1.6;
        }
        case 'strip': {
            // 王冠が落ちる低音 → 服がはためいて飛んでいく風 → 間の抜けた上昇音
            tone(ctx, d, { type: 'triangle', f0: 392, f1: 784, t: T(0), dur: 0.3, gain: 0.25 });
            boom(ctx, d, T(0.3), 0.7);
            noise(ctx, d, { t: T(0.5), dur: 0.7, gain: 0.35, filter: 'bandpass', f0: 500, f1: 4000, q: 0.8 });
            [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(ctx, d, { type: 'triangle', f0: f, t: T(0.9 + i * 0.1), dur: 0.2, gain: 0.2 }));
            return 1.4;
        }
        case 'tinder': {
            // 火の粉が舞い降りる上昇音 → ぼっと燃え移る
            tone(ctx, d, { type: 'triangle', f0: 800, f1: 2400, t: T(0), dur: 0.5, gain: 0.18 });
            noise(ctx, d, { t: T(0.5), dur: 0.7, gain: 0.45, filter: 'bandpass', f0: 300, f1: 2000, q: 0.6 });
            tone(ctx, d, { type: 'sawtooth', f0: 90, f1: 220, t: T(0.5), dur: 0.6, gain: 0.3, lowpass: 900 });
            for (let i = 0; i < 4; i++) noise(ctx, d, { t: T(0.7 + i * 0.08), dur: 0.05, gain: 0.3, filter: 'highpass', f0: 3000 + i * 300 });
            return 1.3;
        }
        case 'scrollBless': {
            // 札が燃える小さな音 → 金色の光が降り注ぐ上昇アルペジオ
            noise(ctx, d, { t: T(0), dur: 0.25, gain: 0.25, filter: 'bandpass', f0: 1500, f1: 4000, q: 0.8 });
            sparkle(ctx, d, T(0.3), [C5, E5, G5, C6, E6, G5 * 2], 0.1, 0.24);
            for (const f of [C5, G5, C6]) tone(ctx, d, { type: 'triangle', f0: f, t: T(0.9), dur: 0.8, gain: 0.16 });
            return 1.7;
        }
        case 'scrollCurse': {
            // 低い呪文の唸り(上昇) → 呪いが這い寄る不穏な音階 → ぱちんと刻まれる
            tone(ctx, d, { type: 'sawtooth', f0: 70, f1: 320, t: T(0), dur: 0.7, gain: 0.22, lowpass: 800 });
            [220, 233, 261.6, 277, 311].forEach((f, i) => tone(ctx, d, { type: 'sawtooth', f0: f, t: T(0.3 + i * 0.13), dur: 0.35, gain: 0.18, lowpass: 1000 }));
            noise(ctx, d, { t: T(0.95), dur: 0.3, gain: 0.35, filter: 'highpass', f0: 3500 });
            tone(ctx, d, { type: 'triangle', f0: 500, f1: 1800, t: T(1.0), dur: 0.5, gain: 0.15 });
            return 1.6;
        }
        case 'scrollDiscount': {
            // 札が降る軽い音 → 値札がぽんと付く → 小銭
            noise(ctx, d, { t: T(0), dur: 0.5, gain: 0.2, filter: 'bandpass', f0: 1500, f1: 4500, q: 0.8 });
            tone(ctx, d, { f0: 600, f1: 1200, t: T(0.3), dur: 0.15, gain: 0.35 });
            for (let i = 0; i < 5; i++) {
                tone(ctx, d, { type: 'square', f0: 1760 + i * 60, t: T(0.6 + i * 0.07), dur: 0.05, gain: 0.12, lowpass: 5000 });
                tone(ctx, d, { type: 'square', f0: 2349 + i * 60, t: T(0.64 + i * 0.07), dur: 0.1, gain: 0.12, lowpass: 5000 });
            }
            return 1.2;
        }
        case 'scrollPurge': {
            // 札が燃え上がる → 黒い光線が走る重い上昇音 → ずしんと命を奪う
            noise(ctx, d, { t: T(0), dur: 0.5, gain: 0.35, filter: 'bandpass', f0: 400, f1: 2500, q: 0.7 });
            tone(ctx, d, { type: 'sawtooth', f0: 80, f1: 700, t: T(0.2), dur: 0.5, gain: 0.3, lowpass: 2500 });
            boom(ctx, d, T(0.65), 0.9);
            tone(ctx, d, { type: 'triangle', f0: 400, f1: 1500, t: T(0.8), dur: 0.5, gain: 0.15 });
            return 1.4;
        }
        case 'smallFry': {
            // 虫がちょろちょろ走る(上昇する細かい音) → ぷちっ、ぷちっと潰れる → 魂が昇る
            for (let i = 0; i < 6; i++) tone(ctx, d, { f0: 1200 + i * 150, f1: 1800 + i * 150, t: T(i * 0.08), dur: 0.05, gain: 0.18 });
            for (let i = 0; i < 5; i++) {
                tone(ctx, d, { f0: 150 + i * 30, f1: 350 + i * 40, t: T(0.5 + i * 0.1), dur: 0.1, gain: 0.45 });
                noise(ctx, d, { t: T(0.5 + i * 0.1), dur: 0.06, gain: 0.3, filter: 'highpass', f0: 2500 + i * 300 });
            }
            tone(ctx, d, { type: 'triangle', f0: 500, f1: 2200, t: T(0.95), dur: 0.7, gain: 0.15 });
            return 1.7;
        }
        case 'firstFrost': {
            // 冷たい風(上昇) → 霜が降りる → 氷が張る澄んだ音
            noise(ctx, d, { t: T(0), dur: 0.8, gain: 0.25, filter: 'highpass', f0: 3000, f1: 6000 });
            tone(ctx, d, { type: 'triangle', f0: 400, f1: 2200, t: T(0), dur: 0.7, gain: 0.18 });
            [2093, 2637, 3136, 4186].forEach((f, i) => tone(ctx, d, { type: 'triangle', f0: f, t: T(0.5 + i * 0.1), dur: 0.3, gain: 0.22 }));
            sparkle(ctx, d, T(1.0), [C5, E5, G5], 0.1, 0.2);
            return 1.5;
        }
        case 'gather': {
            // 風が吹き抜ける(上昇) → 色々な音が1点へ吸い寄せられて、くるっと渦になる
            noise(ctx, d, { t: T(0), dur: 0.9, gain: 0.4, filter: 'bandpass', f0: 400, f1: 3500, q: 0.8 });
            for (let i = 0; i < 8; i++) tone(ctx, d, { f0: 300 + i * 90, f1: 800 + i * 120, t: T(0.25 + i * 0.07), dur: 0.1, gain: 0.3 });
            tone(ctx, d, { type: 'triangle', f0: 400, f1: 1600, t: T(0.9), dur: 0.5, gain: 0.2 });
            return 1.5;
        }
        case 'burnOff': {
            // 地を這う炎(上昇) → 火柱が次々と立つ → 焼け跡に杭を打つ
            tone(ctx, d, { type: 'sawtooth', f0: 50, f1: 280, t: T(0), dur: 0.6, gain: 0.25, lowpass: 700 });
            noise(ctx, d, { t: T(0.1), dur: 1.1, gain: 0.5, filter: 'bandpass', f0: 300, f1: 2400, q: 0.6 });
            for (let i = 0; i < 7; i++) noise(ctx, d, { t: T(0.4 + i * 0.09), dur: 0.05, gain: 0.3, filter: 'highpass', f0: 2500 + i * 200 });
            tone(ctx, d, { f0: 110, f1: 260, t: T(1.0), dur: 0.2, gain: 0.6 });
            return 1.6;
        }
        case 'freeToken': {
            // クラッカーがパンッ → 宴会のファンファーレ(上昇)
            noise(ctx, d, { t: T(0), dur: 0.15, gain: 0.6, filter: 'lowpass', f0: 400, f1: 4000 });
            boom(ctx, d, T(0), 0.6);
            sparkle(ctx, d, T(0.15), [C5, E5, G5, C6, E6, G5 * 2], 0.07, 0.28);
            for (const f of [G5, C6, E6]) tone(ctx, d, { type: 'triangle', f0: f, t: T(0.6), dur: 0.7, gain: 0.18 });
            return 1.4;
        }
        case 'leafDrop': {
            // 木の葉がひらひら舞い降りる小さな上昇音 → そっと積もる
            noise(ctx, d, { t: T(0), dur: 0.8, gain: 0.25, filter: 'bandpass', f0: 900, f1: 2800, q: 1.1 });
            [262, 330, 392].forEach((f, i) => tone(ctx, d, { type: 'triangle', f0: f, f1: f * 1.5, t: T(0.15 + i * 0.2), dur: 0.3, gain: 0.2 }));
            noise(ctx, d, { t: T(1.0), dur: 0.1, gain: 0.25, filter: 'highpass', f0: 3500 });
            return 1.3;
        }
        case 'leafCloak': {
            // 葉が舞って取り巻く(上昇) → 衣がふわっと包む和音
            noise(ctx, d, { t: T(0), dur: 0.8, gain: 0.3, filter: 'bandpass', f0: 800, f1: 3000, q: 1.0 });
            for (let i = 0; i < 6; i++) tone(ctx, d, { type: 'triangle', f0: 330 + i * 60, f1: 600 + i * 90, t: T(i * 0.1), dur: 0.15, gain: 0.2 });
            for (const f of [C5, G5, C6]) tone(ctx, d, { type: 'triangle', f0: f, t: T(0.8), dur: 0.8, gain: 0.16 });
            return 1.6;
        }
        case 'kindling': {
            // 枯れ葉に火が移る: ぱちぱちと爆ぜながら炎が大きくなる(上昇)
            for (let i = 0; i < 9; i++) noise(ctx, d, { t: T(i * 0.08), dur: 0.05, gain: 0.3, filter: 'bandpass', f0: 900 + i * 150, f1: 2200 + i * 150, q: 1 });
            noise(ctx, d, { t: T(0.3), dur: 0.8, gain: 0.4, filter: 'bandpass', f0: 300, f1: 2000, q: 0.6 });
            tone(ctx, d, { type: 'sawtooth', f0: 90, f1: 240, t: T(0.3), dur: 0.7, gain: 0.28, lowpass: 900 });
            return 1.2;
        }
        case 'cleanse': {
            // 浄化: 澄んだ鐘の上昇アルペジオ
            tone(ctx, d, { f0: C5, t: T(0), dur: 0.6, gain: 0.25 });
            sparkle(ctx, d, T(0.05), [C5, E5, G5, C6, E6, G5 * 2], 0.07, 0.24);
            return 0.8;
        }
        case 'harvestEve': {
            // 刈り入れ前夜: 低い温かな音と、硬貨がチャリンと鳴る
            tone(ctx, d, { type: 'triangle', f0: 196, t: T(0), dur: 0.5, gain: 0.35 });
            for (let i = 0; i < 4; i++) {
                tone(ctx, d, { type: 'square', f0: 1760, t: T(0.12 + i * 0.09), dur: 0.05, gain: 0.14, lowpass: 5000 });
                tone(ctx, d, { type: 'square', f0: 2349, t: T(0.17 + i * 0.09), dur: 0.12, gain: 0.14, lowpass: 5000 });
            }
            return 0.7;
        }
        case 'solstice': {
            // 冬至の種子: 静かな低い和音に、小さな鐘
            [130.8, 196, 261.6].forEach((f, i) => tone(ctx, d, { type: 'triangle', f0: f, t: T(i * 0.04), dur: 0.9, gain: 0.22 }));
            sparkle(ctx, d, T(0.3), [G5, C6, E6], 0.12, 0.16);
            return 0.9;
        }
        case 'sprout': {
            // ひこばえ: ぽん、ぽん、ぽんと芽が出る
            [C5, E5, G5].forEach((f, i) => tone(ctx, d, { f0: f, f1: f * 1.6, t: T(i * 0.08), dur: 0.12, gain: 0.35 }));
            return 0.45;
        }
        case 'shikigami': {
            // 札がひらりと舞い降り、ぺたりと貼られる(上昇する小さな音)
            noise(ctx, d, { t: T(0), dur: 0.35, gain: 0.25, filter: 'bandpass', f0: 1500, f1: 4500, q: 0.8 });
            tone(ctx, d, { f0: 440, f1: 880, t: T(0.1), dur: 0.3, gain: 0.2 });
            tone(ctx, d, { f0: 660, f1: 990, t: T(0.45), dur: 0.12, gain: 0.3 });
            noise(ctx, d, { t: T(0.45), dur: 0.08, gain: 0.3, filter: 'lowpass', f0: 400, f1: 1500 });
            tone(ctx, d, { f0: 990, f1: 1480, t: T(0.6), dur: 0.2, gain: 0.2 });
            return 0.9;
        }
        case 'shikigamiBlast': {
            // 導火線がちりちり(上昇) → ぱん、と弾け、紙片が飛び散る
            tone(ctx, d, { type: 'square', f0: 600, f1: 2400, t: T(0), dur: 0.4, gain: 0.1, lowpass: 5000 });
            noise(ctx, d, { t: T(0), dur: 0.4, gain: 0.2, filter: 'highpass', f0: 4000 });
            noise(ctx, d, { t: T(0.42), dur: 0.3, gain: 0.6, filter: 'lowpass', f0: 300, f1: 3000 });
            tone(ctx, d, { f0: 80, f1: 300, t: T(0.42), dur: 0.3, gain: 0.55 });
            for (let i = 0; i < 6; i++) noise(ctx, d, { t: T(0.6 + i * 0.07), dur: 0.05, gain: 0.25, filter: 'highpass', f0: 2500 + i * 300 });
            tone(ctx, d, { type: 'triangle', f0: 400, f1: 1800, t: T(0.7), dur: 0.5, gain: 0.15 });
            return 1.2;
        }
        case 'windborne': {
            // 風の落とし子: 風が吹き抜け、種がぱらぱら落ちる
            noise(ctx, d, { t: T(0), dur: 0.6, gain: 0.4, filter: 'bandpass', f0: 600, f1: 3000, q: 0.8 });
            for (let i = 0; i < 3; i++) tone(ctx, d, { f0: 880 + i * 220, f1: 1400 + i * 200, t: T(0.35 + i * 0.07), dur: 0.08, gain: 0.25 });
            return 0.7;
        }
        case 'autumn': {
            // 🍂落ち葉系: 乾いた葉が擦れ合う音と、ひと呼吸の木枯らし
            noise(ctx, d, { t: T(0), dur: 0.5, gain: 0.35, filter: 'bandpass', f0: 900, f1: 2200, q: 1.1 });
            for (let i = 0; i < 4; i++) noise(ctx, d, { t: T(0.05 + i * 0.09), dur: 0.06, gain: 0.22, filter: 'highpass', f0: 4000 });
            tone(ctx, d, { type: 'triangle', f0: 262, f1: 392, t: T(0.1), dur: 0.35, gain: 0.2 });
            return 0.55;
        }
        case 'iceBreak': {
            // 氷結が砕けて身代わりになる: パリン
            noise(ctx, d, { t: T(0), dur: 0.1, gain: 0.6, filter: 'highpass', f0: 4500 });
            for (let i = 0; i < 4; i++) tone(ctx, d, { f0: 1500 + i * 500, f1: 3600 + i * 200, t: T(i * 0.04), dur: 0.1, gain: 0.28 });
            return 0.3;
        }
        case 'thaw': {
            // 解凍: 水滴がぴちょん↗
            tone(ctx, d, { f0: 500, f1: 1100, t: T(0), dur: 0.12, gain: 0.35 });
            tone(ctx, d, { f0: 420, f1: 900, t: T(0.12), dur: 0.12, gain: 0.28 });
            return 0.3;
        }
        case 'burn': {
            // 燃焼: ぱちぱちと爆ぜる
            for (let i = 0; i < 5; i++) noise(ctx, d, { t: T(i * 0.06), dur: 0.05, gain: 0.4, filter: 'bandpass', f0: 900, f1: 2200, q: 1 });
            tone(ctx, d, { type: 'sawtooth', f0: 90, f1: 140, t: T(0), dur: 0.3, gain: 0.2, lowpass: 600 });
            return 0.4;
        }
        case 'proliferate': {
            [523, 587, 659, 784, 880, 1047].forEach((f, i) => tone(ctx, d, { f0: f, f1: f * 1.25, t: T(i * 0.05), dur: 0.12, gain: 0.4 }));
            return 0.45;
        }
        case 'zap': {
            // 駆け上がる電撃 → 最後にバチッと弾ける
            tone(ctx, d, { type: 'sawtooth', f0: 300, f1: 1800, t: T(0), dur: 0.15, gain: 0.45, lowpass: 5000 });
            noise(ctx, d, { t: T(0.1), dur: 0.08, gain: 0.4, filter: 'highpass', f0: 3500 });
            tone(ctx, d, { f0: 3000, t: T(0.12), dur: 0.03, gain: 0.3 });
            return 0.25;
        }
        case 'overload': {
            // 低い「ブォン↗」で溜めてから、電撃が3連で駆け上がり、最後は高域まで爆ぜる
            boom(ctx, d, T(0), 0.95);
            for (let i = 0; i < 3; i++) tone(ctx, d, { type: 'sawtooth', f0: 250 + i * 150, f1: 1800 + i * 400, t: T(0.15 + i * 0.08), dur: 0.12, gain: 0.45, lowpass: 6000 });
            noise(ctx, d, { t: T(0.2), dur: 0.7, gain: 1.5, filter: 'bandpass', f0: 300, f1: 6000, q: 0.9 });
            return 0.9;
        }
        case 'silence': {
            // サイレンス: 音が上へ吸い上げられるように駆け上がり、最後にふっと消える
            tone(ctx, d, { type: 'triangle', f0: 110, f1: 1320, t: T(0), dur: 0.5, gain: 0.5, lowpass: 3000 });
            tone(ctx, d, { f0: 55, f1: 660, t: T(0.05), dur: 0.45, gain: 0.4 });
            noise(ctx, d, { t: T(0), dur: 0.3, gain: 0.3, filter: 'lowpass', f0: 120, f1: 2500 });
            return 0.6;
        }
        case 'lock': {
            // 錠が掛かる「ゴン→ガチャッ↗」: 重い低音が上がって掛かり、その直後に金属音が階段状に駆け上がる(チャリン↗)
            tone(ctx, d, { f0: 70, f1: 180, t: T(0), dur: 0.2, gain: 0.55 });
            noise(ctx, d, { t: T(0), dur: 0.08, gain: 0.3, filter: 'lowpass', f0: 200, f1: 900 });
            noise(ctx, d, { t: T(0.07), dur: 0.04, gain: 0.6, filter: 'highpass', f0: 3000 });
            ([[1180, 0.07, 0.28], [1770, 0.09, 0.2], [2650, 0.11, 0.14]] as const).forEach(([f, s, g]) =>
                tone(ctx, d, { type: 'square', f0: f, t: T(s), dur: 0.28, gain: g, lowpass: 6000 })
            );
            return 0.42;
        }
        case 'heal': {
            // ライフ3: やさしい上昇アルペジオ(ふんわり満ちていく)
            sparkle(ctx, d, T(0), [C5, E5, G5, C6], 0.08, 0.28);
            tone(ctx, d, { f0: 400, f1: 800, t: T(0), dur: 0.4, gain: 0.22 });
            tone(ctx, d, { f0: 2093, t: T(0.32), dur: 0.4, gain: 0.12 });
            return 0.75;
        }
        case 'double': {
            // バイバイン: 「ダブル!」と二段で跳ね上がる
            tone(ctx, d, { type: 'square', f0: 330, f1: 660, t: T(0), dur: 0.12, gain: 0.25, lowpass: 3500 });
            tone(ctx, d, { type: 'square', f0: 660, f1: 1320, t: T(0.13), dur: 0.2, gain: 0.25, lowpass: 3500 });
            tone(ctx, d, { f0: 45, f1: 170, t: T(0.13), dur: 0.3, gain: 0.6 });
            tone(ctx, d, { f0: 2640, t: T(0.28), dur: 0.35, gain: 0.12 });
            return 0.65;
        }
        case 'bloom': {
            // バッズ: ぽっ、ぽっ、ぽっと芽が出て、ふわっと開く
            [G5 / 2, C5, E5, G5].forEach((f, i) => tone(ctx, d, { f0: f, f1: f * 1.5, t: T(i * 0.07), dur: 0.12, gain: 0.35 }));
            tone(ctx, d, { type: 'triangle', f0: 600, f1: 1400, t: T(0.28), dur: 0.35, gain: 0.18 });
            return 0.7;
        }
        case 'discount': {
            // 割引: 硬貨がチャリンチャリンと弾み、音が上へ駆け上がる
            for (let i = 0; i < 4; i++) {
                tone(ctx, d, { type: 'square', f0: 1568 + i * 220, t: T(i * 0.07), dur: 0.05, gain: 0.14, lowpass: 5000 });
                tone(ctx, d, { type: 'square', f0: 2093 + i * 293, t: T(i * 0.07 + 0.04), dur: 0.14, gain: 0.14, lowpass: 5000 });
            }
            tone(ctx, d, { f0: 400, f1: 1200, t: T(0), dur: 0.35, gain: 0.2 });
            return 0.6;
        }
        case 'shuffle': {
            // シャッフル: カードをぱらぱらと切る(高さを上げながら小刻みに)
            for (let i = 0; i < 8; i++) {
                noise(ctx, d, { t: T(i * 0.04), dur: 0.04, gain: 0.35, filter: 'bandpass', f0: 2000 + i * 400, q: 2 });
                tone(ctx, d, { type: 'triangle', f0: 500 + i * 120, f1: 700 + i * 140, t: T(i * 0.04), dur: 0.05, gain: 0.12 });
            }
            tone(ctx, d, { type: 'triangle', f0: 800, f1: 1800, t: T(0.32), dur: 0.2, gain: 0.2 });
            return 0.55;
        }
        case 'token': {
            // トークン: コマが置かれる「ポン」に、星がはじける上昇音
            tone(ctx, d, { type: 'triangle', f0: 520, f1: 880, t: T(0), dur: 0.09, gain: 0.7 });
            tone(ctx, d, { f0: 880, f1: 1760, t: T(0.06), dur: 0.15, gain: 0.3 });
            sparkle(ctx, d, T(0.1), [G5, C6, E6], 0.05, 0.16);
            return 0.4;
        }
        case 'gear': {
            // ギアの発動: 「ピコン↗」と上がる2音に、小さなきらめき
            tone(ctx, d, { f0: 880, f1: 1100, t: T(0), dur: 0.1, gain: 0.5 });
            tone(ctx, d, { f0: 1318, f1: 1650, t: T(0.08), dur: 0.22, gain: 0.5 });
            tone(ctx, d, { type: 'triangle', f0: 2637, t: T(0.16), dur: 0.25, gain: 0.18 });
            return 0.45;
        }
        case 'gearKey': {
            // 道連れの鍵: カチッと鍵が掛かり、金属音が階段状に上がる
            tone(ctx, d, { f0: 90, f1: 220, t: T(0), dur: 0.12, gain: 0.5 });
            noise(ctx, d, { t: T(0.03), dur: 0.03, gain: 0.2, filter: 'highpass', f0: 3000 });
            ([[1180, 0.04], [1770, 0.08], [2650, 0.12]] as const).forEach(([f, st]) => tone(ctx, d, { type: 'square', f0: f, t: T(st), dur: 0.18, gain: 0.3, lowpass: 6000 }));
            return 0.3;
        }
        case 'gearBloom': {
            // 毒花: ぽん、と花が開く
            tone(ctx, d, { f0: 500, f1: 1000, t: T(0), dur: 0.1, gain: 0.6 });
            tone(ctx, d, { f0: 750, f1: 1500, t: T(0.07), dur: 0.14, gain: 0.5 });
            return 0.3;
        }
        case 'gearSpread': {
            // 伝播: 波が広がる風切り音と、小さな泡が上がる
            noise(ctx, d, { t: T(0), dur: 0.3, gain: 0.7, filter: 'bandpass', f0: 400, f1: 3000, q: 0.8 });
            for (let i = 0; i < 3; i++) tone(ctx, d, { f0: 700 + i * 250, f1: 1100 + i * 300, t: T(0.12 + i * 0.06), dur: 0.08, gain: 0.4 });
            return 0.4;
        }
        case 'gearEmpty': {
            // 空蔵: 空っぽのマスからコマが生まれる、ふわっと上がる音
            tone(ctx, d, { type: 'triangle', f0: 300, f1: 900, t: T(0), dur: 0.25, gain: 0.5 });
            tone(ctx, d, { f0: 600, f1: 1500, t: T(0.1), dur: 0.2, gain: 0.45 });
            return 0.35;
        }
        case 'bulwark': {
            // 土壇場の防壁: 低音が駆け上がる衝撃 → 衝撃波の掃引 → 防衛の和音が上がって決まる
            boom(ctx, d, T(0), 0.95);
            noise(ctx, d, { t: T(0), dur: 0.8, gain: 1.6, filter: 'bandpass', f0: 200, f1: 6000, q: 0.8 });
            [C5, G5, C6].forEach((f, i) => tone(ctx, d, { type: 'triangle', f0: f, t: T(0.25 + i * 0.12), dur: 0.7, gain: 0.5 }));
            sparkle(ctx, d, T(0.6), [E6, G5 * 2, C6 * 2], 0.08, 0.26);
            return 1.3;
        }
        case 'rain': {
            // 慈雨: 雨粒がぽつぽつと落ち、音が少しずつ上がって潤っていく
            noise(ctx, d, { t: T(0), dur: 0.7, gain: 0.1, filter: 'highpass', f0: 4000 });
            for (let i = 0; i < 7; i++) tone(ctx, d, { f0: 900 + i * 160, f1: 1200 + i * 200, t: T(i * 0.08), dur: 0.08, gain: 0.4 });
            tone(ctx, d, { type: 'triangle', f0: 300, f1: 900, t: T(0), dur: 0.7, gain: 0.3 });
            return 0.8;
        }
        case 'dash': {
            // 縮地: 風を切って駆け抜け、着地でポンと決まる
            noise(ctx, d, { t: T(0), dur: 0.25, gain: 0.6, filter: 'bandpass', f0: 500, f1: 6000, q: 1.0 });
            tone(ctx, d, { type: 'sawtooth', f0: 300, f1: 2400, t: T(0), dur: 0.22, gain: 0.2, lowpass: 5000 });
            tone(ctx, d, { type: 'triangle', f0: 520, f1: 880, t: T(0.22), dur: 0.1, gain: 0.5 });
            sparkle(ctx, d, T(0.26), [G5, C6, E6], 0.05, 0.14);
            return 0.5;
        }
        case 'clone': {
            // 写し身: ピュン、と分身が生まれ、もう一段高い音でそっくり返す
            tone(ctx, d, { f0: 500, f1: 1000, t: T(0), dur: 0.12, gain: 0.35 });
            tone(ctx, d, { f0: 750, f1: 1500, t: T(0.14), dur: 0.14, gain: 0.35 });
            tone(ctx, d, { type: 'triangle', f0: 1500, f1: 3000, t: T(0.14), dur: 0.14, gain: 0.12 });
            sparkle(ctx, d, T(0.3), [C6, E6, G5 * 2], 0.05, 0.14);
            return 0.5;
        }
        case 'plunder': {
            // 追い剥ぎ: 剣が風を切り(上がる)、奪った硬貨がチャリンと上がっていく
            noise(ctx, d, { t: T(0), dur: 0.15, gain: 0.4, filter: 'bandpass', f0: 2000, f1: 9000, q: 1.2 });
            tone(ctx, d, { type: 'sawtooth', f0: 800, f1: 2400, t: T(0), dur: 0.12, gain: 0.3, lowpass: 5000 });
            for (let i = 0; i < 4; i++) {
                tone(ctx, d, { type: 'square', f0: 1568 + i * 220, t: T(0.14 + i * 0.07), dur: 0.05, gain: 0.3, lowpass: 5000 });
                tone(ctx, d, { type: 'square', f0: 2093 + i * 293, t: T(0.18 + i * 0.07), dur: 0.12, gain: 0.3, lowpass: 5000 });
            }
            return 0.6;
        }
        case 'place': {
            // 駒を置く「ポン」
            tone(ctx, d, { type: 'triangle', f0: 520, f1: 880, t: T(0), dur: 0.09, gain: 0.8 });
            tone(ctx, d, { f0: 800, f1: 1400, t: T(0), dur: 0.06, gain: 0.3 });
            return 0.12;
        }
        case 'chargeUp':
        case 'charge': {
            // コインを取ったような2音
            tone(ctx, d, { type: 'square', f0: 988, t: T(0), dur: 0.07, gain: 0.3, lowpass: 4000 });
            tone(ctx, d, { type: 'square', f0: 1319, t: T(0.07), dur: 0.35, gain: 0.3, lowpass: 4000 });
            return 0.45;
        }
        case 'win': {
            // 勝利のファンファーレ(全体を通して音程は上がる):
            // ①ドラムロールが加速しながら高まる → ②金管の和音がドン、シンバルが鳴る → ③きらめきの上昇音階 → ④高い和音で締める
            for (let i = 0; i < 12; i++) {
                const t = i * (0.06 - i * 0.002);
                tone(ctx, d, { f0: 60 + i * 6, f1: 140 + i * 8, t: T(t), dur: 0.08, gain: 0.35 + i * 0.03 });
            }
            noise(ctx, d, { t: T(0), dur: 0.5, gain: 0.25, filter: 'bandpass', f0: 800, f1: 3000, q: 0.8 });
            // ②
            const hit = 0.55;
            for (const f of [C5, E5, G5, C6]) tone(ctx, d, { type: 'sawtooth', f0: f, t: T(hit), dur: 0.9, gain: 0.14, lowpass: 2600 });
            for (const f of [C5, E5, G5, C6]) tone(ctx, d, { type: 'triangle', f0: f, t: T(hit), dur: 1.2, gain: 0.2 });
            boom(ctx, d, T(hit), 0.9);
            noise(ctx, d, { t: T(hit), dur: 1.3, gain: 0.45, filter: 'highpass', f0: 5000 });
            // ③
            sparkle(ctx, d, T(hit + 0.25), [C6, E6, G5 * 2, C6 * 2, E6 * 2, G5 * 4], 0.08, 0.2);
            // ④
            const fin = hit + 0.95;
            for (const f of [G5, C6, E6, G5 * 2]) tone(ctx, d, { type: 'triangle', f0: f, t: T(fin), dur: 1.0, gain: 0.2 });
            tone(ctx, d, { type: 'square', f0: C6 * 2, t: T(fin), dur: 0.8, gain: 0.07, lowpass: 4000 });
            return 2.6;
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
