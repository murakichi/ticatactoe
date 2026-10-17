import { scheduleSfx, playSfx, isMuted, setMuted, Sfx } from './sound';

// jsdom には Web Audio が無いので、予約された音源の数だけ数える最小のスタブを使う
const fakeParam = () => ({
    value: 0,
    setValueAtTime: jest.fn(),
    linearRampToValueAtTime: jest.fn(),
    exponentialRampToValueAtTime: jest.fn(),
});
const fakeNode = () => ({ connect: jest.fn(), start: jest.fn(), stop: jest.fn() });

const makeCtx = () => {
    const sources: unknown[] = [];
    const ctx = {
        sampleRate: 8000,
        currentTime: 0,
        createBuffer: () => ({ getChannelData: () => new Float32Array(12000) }),
        createGain: () => ({ ...fakeNode(), gain: fakeParam() }),
        createBiquadFilter: () => ({ ...fakeNode(), frequency: { ...fakeParam() }, Q: { value: 0 }, type: '' }),
        createOscillator: () => {
            const o = { ...fakeNode(), type: '', frequency: fakeParam() };
            sources.push(o);
            return o;
        },
        createBufferSource: () => {
            const n = { ...fakeNode(), buffer: null };
            sources.push(n);
            return n;
        },
    };
    return { ctx: ctx as unknown as BaseAudioContext, sources, dest: fakeNode() as unknown as AudioNode };
};

const ALL: Sfx[] = [
    'slash', 'backslash', 'stomp', 'judge', 'opium', 'tsunami', 'assault', 'necromancy', 'yinyang',
    'harvest', 'famine', 'auraGreen', 'auraRed', 'poison', 'proliferate', 'zap', 'overload', 'silence',
    'place', 'charge', 'win', 'lock',
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
