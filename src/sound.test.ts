import { scheduleSfx, playSfx, isMuted, setMuted, Sfx } from './sound';

// jsdom には Web Audio が無いので、予約された音源の数だけ数える最小のスタブを使う
const fakeParam = () => ({
    value: 0,
    setValueAtTime: jest.fn(),
    linearRampToValueAtTime: jest.fn(),
    exponentialRampToValueAtTime: jest.fn(),
});
const fakeNode = () => ({ connect: jest.fn(), start: jest.fn(), stop: jest.fn() });

// 周波数(音程)の動きを記録するためのパラメータ: 開始値と、スライドの終点
type Slide = { from: number; to: number };
const freqParam = (slides: Slide[]) => {
    let start = 0;
    return {
        value: 0,
        setValueAtTime: jest.fn((v: number) => {
            start = v;
        }),
        linearRampToValueAtTime: jest.fn(),
        exponentialRampToValueAtTime: jest.fn((v: number) => {
            slides.push({ from: start, to: v });
        }),
    };
};

const makeCtx = () => {
    const sources: unknown[] = [];
    const slides: Slide[] = [];
    // 音程を持つノート(のこぎり波)の開始時刻と周波数。音階の上下を確かめるのに使う
    const notes: { t: number; f: number; type: string }[] = [];
    const ctx = {
        sampleRate: 8000,
        currentTime: 0,
        createBuffer: () => ({ getChannelData: () => new Float32Array(12000) }),
        createGain: () => ({ ...fakeNode(), gain: fakeParam() }),
        createBiquadFilter: () => ({ ...fakeNode(), frequency: freqParam(slides), Q: { value: 0 }, type: '' }),
        createOscillator: () => {
            const o: { type: string; frequency: ReturnType<typeof freqParam>; start: jest.Mock; connect: jest.Mock; stop: jest.Mock } = {
                ...fakeNode(),
                type: '',
                frequency: freqParam(slides),
            };
            // start(t) の時点での初期周波数を、ノートとして記録する
            o.start = jest.fn((t: number) => {
                const first = o.frequency.setValueAtTime.mock.calls[0];
                if (first) notes.push({ t, f: first[0], type: o.type });
            });
            sources.push(o);
            return o;
        },
        createBufferSource: () => {
            const n = { ...fakeNode(), buffer: null };
            sources.push(n);
            return n;
        },
    };
    return { ctx: ctx as unknown as BaseAudioContext, sources, slides, notes, dest: fakeNode() as unknown as AudioNode };
};

const ALL: Sfx[] = [
    'slash', 'backslash', 'stomp', 'judge', 'opium', 'tsunami', 'assault', 'necromancy', 'yinyang',
    'harvest', 'famine', 'auraGreen', 'auraRed', 'poison', 'proliferate', 'zap', 'overload', 'silence', 'freeze', 'flame', 'glacier', 'glacierBurst', 'inferno', 'cleanse', 'harvestEve', 'solstice', 'sprout', 'windborne', 'iceBreak', 'thaw', 'burn',
    'place', 'charge', 'win', 'lock',
    'heal', 'double', 'bloom', 'discount', 'chargeUp', 'shuffle', 'token',
];

test.each(ALL)('%s は音源を予約し、2秒以内に鳴り終わる', (sfx) => {
    const { ctx, sources, dest } = makeCtx();
    const dur = scheduleSfx(ctx, dest, sfx, 0);
    expect(sources.length).toBeGreaterThan(0);
    expect(dur).toBeGreaterThan(0);
    expect(dur).toBeLessThanOrEqual(2);
});

test('未知の演出でも無音にならない', () => {
    const { ctx, sources, dest } = makeCtx();
    scheduleSfx(ctx, dest, 'unknown' as Sfx, 0);
    expect(sources.length).toBeGreaterThan(0);
});

test('音が使えない環境(jsdom)では playSfx は何もせず例外も出さない', () => {
    expect(() => playSfx('place')).not.toThrow();
});

test('ミュートの設定は保存され、ミュート中は鳴らさない', () => {
    setMuted(true);
    expect(isMuted()).toBe(true);
    expect(localStorage.getItem('ticatactoe.sound')).toBe('off');
    expect(() => playSfx('win')).not.toThrow();
    setMuted(false);
    expect(isMuted()).toBe(false);
    expect(localStorage.getItem('ticatactoe.sound')).toBe('on');
});

// スキル使用時の音は「上がる」音にする(下がる音は不採用)。音程のスライドが下向きになっていないことを守る
test.each(ALL)('%s は音程が下がらない(スライドは上向きのみ)', (sfx) => {
    const { ctx, slides, dest } = makeCtx();
    scheduleSfx(ctx, dest, sfx, 0);
    for (const s of slides) expect(s.to).toBeGreaterThanOrEqual(s.from);
});

test.each(['necromancy', 'famine', 'assault'] as Sfx[])('%s の旋律(のこぎり波の音階)は時間とともに上がっていく', (sfx) => {
    const { ctx, notes, dest } = makeCtx();
    scheduleSfx(ctx, dest, sfx, 0);
    const melody = notes.filter((n) => n.type === 'sawtooth').sort((a, b) => a.t - b.t);
    expect(melody.length).toBeGreaterThanOrEqual(3);
    // 同時に鳴る音(和音)は除き、時刻が進むたびに音程が下がらないこと
    const byTime = melody.filter((n, i) => i === 0 || n.t > melody[i - 1].t);
    for (let i = 1; i < byTime.length; i++) expect(byTime[i].f).toBeGreaterThanOrEqual(byTime[i - 1].f);
});
