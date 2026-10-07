import { AudioEngine, MENU_DUCK_DB, OPEN_CUTOFF_HZ } from './AudioEngine';
import { BUS_NAMES, BusName, dbToGain } from './Buses';
import {
  FakeAudioContext,
  FakeAudioNode,
  FakeBiquadFilterNode,
  FakeGainNode,
  installFakeAudioContext,
} from './testing/FakeAudioContext';

let restore: () => void;

beforeEach(() => {
  restore = installFakeAudioContext();
});

afterEach(() => {
  restore();
});

function bus(engine: AudioEngine, name: BusName): FakeGainNode {
  return engine.bus(name) as unknown as FakeGainNode;
}

function context(engine: AudioEngine): FakeAudioContext {
  return engine.context as unknown as FakeAudioContext;
}

/** The world bus's insert chain: muffle filter, muffle gain, menu duck. */
function worldChain(engine: AudioEngine) {
  const filter = bus(engine, 'world').outputs[0] as FakeBiquadFilterNode;
  const muffle = filter.outputs[0] as FakeGainNode;
  const duck = muffle.outputs[0] as FakeGainNode;
  return { filter, muffle, duck };
}

describe('AudioEngine lifecycle', () => {
  it('has no context until started', () => {
    const engine = new AudioEngine();
    expect(engine.state).toBe('idle');
    expect(engine.context).toBeNull();
    expect(engine.bus('master')).toBeNull();
    expect(FakeAudioContext.instances).toHaveLength(0);
  });

  it('creates a running context on start', async () => {
    const engine = new AudioEngine();
    await engine.start();
    expect(engine.state).toBe('running');
    expect(FakeAudioContext.instances).toHaveLength(1);
    for (const name of BUS_NAMES) expect(engine.bus(name)).not.toBeNull();
  });

  it('resumes a context that starts suspended', async () => {
    FakeAudioContext.initialState = 'suspended';
    const engine = new AudioEngine();
    await engine.start();
    expect(engine.state).toBe('running');
    expect(context(engine).calls.resume).toBe(1);
  });

  it('builds the graph once across repeated starts', async () => {
    const engine = new AudioEngine();
    await engine.start();
    await engine.start();
    expect(FakeAudioContext.instances).toHaveLength(1);
  });

  it('suspends and resumes only from the matching state', async () => {
    const engine = new AudioEngine();
    await engine.suspend();
    await engine.resume();

    await engine.start();
    const ctx = context(engine);
    await engine.resume();
    expect(ctx.calls.resume).toBe(0);

    await engine.suspend();
    await engine.suspend();
    expect(ctx.calls.suspend).toBe(1);
    expect(engine.state).toBe('suspended');

    await engine.resume();
    expect(ctx.calls.resume).toBe(1);
    expect(engine.state).toBe('running');
  });

  it('closes the context and clears the buses', async () => {
    const engine = new AudioEngine();
    await engine.start();
    const ctx = context(engine);
    await engine.close();
    await engine.close();
    expect(ctx.calls.close).toBe(1);
    expect(engine.state).toBe('idle');
    expect(engine.bus('master')).toBeNull();
  });

  it('builds a fresh graph when started after close', async () => {
    const engine = new AudioEngine();
    await engine.start();
    const first = engine.bus('master');
    await engine.close();
    await engine.start();
    expect(FakeAudioContext.instances).toHaveLength(2);
    expect(engine.state).toBe('running');
    expect(engine.bus('master')).not.toBe(first);
  });
});

describe('AudioEngine graph', () => {
  let engine: AudioEngine;

  beforeEach(async () => {
    engine = new AudioEngine();
    await engine.start();
  });

  it('feeds ambience, weather and effects into world', () => {
    for (const name of ['ambience', 'weather', 'effects'] as const)
      expect(bus(engine, name).outputs).toEqual([bus(engine, 'world')]);
  });

  it('feeds player, music and ui straight into master', () => {
    for (const name of ['player', 'music', 'ui'] as const)
      expect(bus(engine, name).outputs).toEqual([bus(engine, 'master')]);
  });

  it('routes world through the muffle and the duck, never straight to master', () => {
    const world = bus(engine, 'world');
    expect(world.outputs).toHaveLength(1);

    const { filter, muffle, duck } = worldChain(engine);
    expect(filter.kind).toBe('biquad');
    expect(filter.type).toBe('lowpass');
    expect(filter.frequency.value).toBe(OPEN_CUTOFF_HZ);
    expect(muffle.kind).toBe('gain');
    expect(muffle.gain.value).toBe(1);
    expect(duck.kind).toBe('gain');
    expect(duck.gain.value).toBe(1);
    expect(duck.outputs).toEqual([bus(engine, 'master')]);
  });

  it('ends in the compressor and the destination', () => {
    const master = bus(engine, 'master');
    expect(master.outputs).toHaveLength(1);
    const compressor = master.outputs[0];
    expect(compressor.kind).toBe('compressor');
    expect(compressor.outputs).toEqual([context(engine).destination]);
  });

  it('reaches the destination from every bus', () => {
    const destination = context(engine).destination;
    const reaches = (node: FakeAudioNode): boolean =>
      node === destination || node.outputs.some(reaches);
    for (const name of BUS_NAMES) expect(reaches(bus(engine, name))).toBe(true);
  });
});

describe('AudioEngine settings before start', () => {
  it('applies volume, mute and solo when the graph is built', async () => {
    const engine = new AudioEngine();
    engine.setVolume('weather', 0.3);
    engine.setMuted('ui', true);
    engine.setSolo('world');
    await engine.start();

    expect(bus(engine, 'weather').gain.value).toBe(0.3);
    expect(bus(engine, 'ui').gain.value).toBe(0);
    expect(bus(engine, 'player').gain.value).toBe(0);
    expect(bus(engine, 'ambience').gain.value).toBe(1);
  });

  it('applies the muffle and the duck when the graph is built', async () => {
    const engine = new AudioEngine();
    engine.muffleWorld(600, 0.5, 0.1);
    engine.duckWorld(true);
    await engine.start();

    const { filter, muffle, duck } = worldChain(engine);
    expect(filter.frequency.value).toBe(600);
    expect(muffle.gain.value).toBe(0.5);
    expect(duck.gain.value).toBeCloseTo(dbToGain(MENU_DUCK_DB), 10);
  });
});

describe('AudioEngine changes after start', () => {
  let engine: AudioEngine;

  beforeEach(async () => {
    engine = new AudioEngine();
    await engine.start();
    context(engine).currentTime = 5;
  });

  it('moves bus gains with setTargetAtTime, not by writing the value', () => {
    engine.setVolume('weather', 0.4);
    const weather = bus(engine, 'weather');
    expect(weather.gain.value).toBe(1);
    expect(weather.gain.lastTarget).toEqual(
      expect.objectContaining({ value: 0.4, time: 5 })
    );
    expect(weather.gain.lastTarget!.timeConstant).toBeGreaterThan(0);
  });

  it('targets zero on mute and the volume again on unmute', () => {
    engine.setVolume('world', 0.6);
    engine.setMuted('world', true);
    expect(bus(engine, 'world').gain.lastTarget!.value).toBe(0);
    engine.setMuted('world', false);
    expect(bus(engine, 'world').gain.lastTarget!.value).toBe(0.6);
  });

  it('retargets every bus on solo', () => {
    engine.setSolo('weather');
    expect(bus(engine, 'weather').gain.lastTarget!.value).toBe(1);
    expect(bus(engine, 'world').gain.lastTarget!.value).toBe(1);
    expect(bus(engine, 'master').gain.lastTarget!.value).toBe(1);
    expect(bus(engine, 'ambience').gain.lastTarget!.value).toBe(0);
    expect(bus(engine, 'player').gain.lastTarget!.value).toBe(0);
  });

  it('muffles the world over the given time constant', () => {
    engine.muffleWorld(600, 0.4, 0.1);
    const { filter, muffle } = worldChain(engine);
    expect(filter.frequency.lastTarget).toEqual({
      value: 600,
      time: 5,
      timeConstant: 0.1,
    });
    expect(muffle.gain.lastTarget).toEqual({
      value: 0.4,
      time: 5,
      timeConstant: 0.1,
    });
    expect(engine.muffleCutoff).toBe(600);
    expect(engine.muffleLevel).toBe(0.4);
  });

  it('ducks the world by the menu duck and lifts it back', () => {
    const { duck } = worldChain(engine);
    engine.duckWorld(true);
    expect(duck.gain.lastTarget!.value).toBeCloseTo(dbToGain(MENU_DUCK_DB), 10);
    expect(engine.ducked).toBe(true);
    engine.duckWorld(false);
    expect(duck.gain.lastTarget!.value).toBe(1);
    expect(engine.ducked).toBe(false);
  });
});

describe('AudioEngine.startOnGesture', () => {
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  it('waits for a gesture before creating the context', async () => {
    const engine = new AudioEngine();
    const target = new EventTarget();
    engine.startOnGesture(target);
    await flush();
    expect(engine.state).toBe('idle');

    target.dispatchEvent(new Event('pointerdown'));
    await flush();
    expect(engine.state).toBe('running');
  });

  it('starts on a key press', async () => {
    const engine = new AudioEngine();
    const target = new EventTarget();
    engine.startOnGesture(target);
    target.dispatchEvent(new Event('keydown'));
    await flush();
    expect(engine.state).toBe('running');
  });

  it('stops listening once the context runs', async () => {
    FakeAudioContext.initialState = 'suspended';
    const engine = new AudioEngine();
    const target = new EventTarget();
    engine.startOnGesture(target);
    target.dispatchEvent(new Event('pointerdown'));
    await flush();

    await engine.suspend();
    target.dispatchEvent(new Event('pointerdown'));
    await flush();
    expect(engine.state).toBe('suspended');
    expect(context(engine).calls.resume).toBe(1);
  });

  it('keeps listening while the browser rejects the gesture', async () => {
    FakeAudioContext.initialState = 'suspended';
    FakeAudioContext.blocked = true;
    const engine = new AudioEngine();
    const target = new EventTarget();
    engine.startOnGesture(target);
    target.dispatchEvent(new Event('pointerdown'));
    await flush();
    expect(engine.state).toBe('suspended');

    FakeAudioContext.blocked = false;
    target.dispatchEvent(new Event('pointerup'));
    await flush();
    expect(engine.state).toBe('running');
    expect(FakeAudioContext.instances).toHaveLength(1);
  });
});
