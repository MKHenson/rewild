import { AudioEngine } from './AudioEngine';
import {
  AUDIO_SETTINGS_KEY,
  AudioSettings,
  DEFAULT_VOLUMES,
  SettingsStorage,
  VOLUME_SETTINGS,
  volumeToGain,
} from './AudioSettings';
import {
  FakeAudioContext,
  FakeGainNode,
  installFakeAudioContext,
} from './testing/FakeAudioContext';

function memoryStorage(initial?: unknown): SettingsStorage & {
  data: Map<string, string>;
} {
  const data = new Map<string, string>();
  if (initial !== undefined)
    data.set(
      AUDIO_SETTINGS_KEY,
      typeof initial === 'string' ? initial : JSON.stringify(initial)
    );
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
  };
}

function stored(storage: ReturnType<typeof memoryStorage>) {
  return JSON.parse(storage.data.get(AUDIO_SETTINGS_KEY)!);
}

let restore: () => void;

beforeEach(() => {
  restore = installFakeAudioContext();
});

afterEach(() => {
  restore();
});

describe('volumeToGain', () => {
  it('maps the ends to silence and unity', () => {
    expect(volumeToGain(0)).toBe(0);
    expect(volumeToGain(1)).toBe(1);
  });

  it('puts half way at about -12 dB', () => {
    expect(20 * Math.log10(volumeToGain(0.5))).toBeCloseTo(-12, 0);
  });

  it('clamps out-of-range values', () => {
    expect(volumeToGain(-1)).toBe(0);
    expect(volumeToGain(3)).toBe(1);
  });
});

describe('AudioSettings', () => {
  it('starts from the defaults with nothing stored', () => {
    const engine = new AudioEngine();
    const settings = new AudioSettings(engine, memoryStorage());
    for (const setting of VOLUME_SETTINGS)
      expect(settings.volume(setting)).toBe(DEFAULT_VOLUMES[setting]);
    expect(settings.muteInBackground).toBe(true);
    expect(engine.mix.volume('master')).toBeCloseTo(0.64, 10);
    expect(engine.mix.volume('world')).toBe(1);
  });

  it('restores stored settings and applies them to the engine', () => {
    const engine = new AudioEngine();
    const settings = new AudioSettings(
      engine,
      memoryStorage({
        volumes: { master: 0.5, ui: 0.2 },
        muteInBackground: false,
      })
    );
    expect(settings.volume('master')).toBe(0.5);
    expect(settings.volume('ui')).toBe(0.2);
    expect(settings.volume('music')).toBe(1);
    expect(settings.muteInBackground).toBe(false);
    expect(engine.mix.volume('master')).toBeCloseTo(0.25, 10);
    expect(engine.mix.volume('ui')).toBeCloseTo(0.04, 10);
  });

  it('ignores unknown and invalid stored values', () => {
    const settings = new AudioSettings(
      new AudioEngine(),
      memoryStorage({
        volumes: { master: 'loud', weather: 0.1, world: 7, music: null },
        muteInBackground: 'yes',
      })
    );
    expect(settings.volume('master')).toBe(DEFAULT_VOLUMES.master);
    expect(settings.volume('world')).toBe(1);
    expect(settings.volume('music')).toBe(1);
    expect(settings.muteInBackground).toBe(true);
  });

  it('survives storage that is not JSON', () => {
    const settings = new AudioSettings(
      new AudioEngine(),
      memoryStorage('{not json')
    );
    expect(settings.volume('master')).toBe(DEFAULT_VOLUMES.master);
  });

  it('survives storage that throws', () => {
    const storage: SettingsStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    const settings = new AudioSettings(new AudioEngine(), storage);
    expect(() => settings.setVolume('master', 0.3)).not.toThrow();
    expect(settings.volume('master')).toBe(0.3);
  });

  it('works with no storage at all', () => {
    const settings = new AudioSettings(new AudioEngine(), null);
    settings.setVolume('music', 0.4);
    expect(settings.volume('music')).toBe(0.4);
  });

  it('applies a change to the running engine at once and stores it', async () => {
    const engine = new AudioEngine();
    await engine.start();
    const storage = memoryStorage();
    const settings = new AudioSettings(engine, storage);

    settings.setVolume('world', 0.5);
    const world = engine.bus('world') as unknown as FakeGainNode;
    expect(world.gain.lastTarget!.value).toBeCloseTo(0.25, 10);
    expect(stored(storage).volumes.world).toBe(0.5);
  });

  it('clamps a volume to 0..1', () => {
    const settings = new AudioSettings(new AudioEngine(), memoryStorage());
    settings.setVolume('player', 2);
    expect(settings.volume('player')).toBe(1);
    settings.setVolume('player', -1);
    expect(settings.volume('player')).toBe(0);
  });

  it('stores the background mute setting', () => {
    const storage = memoryStorage();
    const settings = new AudioSettings(new AudioEngine(), storage);
    settings.muteInBackground = false;
    expect(stored(storage).muteInBackground).toBe(false);
    expect(new AudioSettings(new AudioEngine(), storage).muteInBackground).toBe(
      false
    );
  });
});

describe('background mute', () => {
  async function setup(muteInBackground: boolean) {
    const engine = new AudioEngine();
    await engine.start();
    const settings = new AudioSettings(engine, memoryStorage());
    settings.muteInBackground = muteInBackground;
    const target = new EventTarget();
    const unbind = settings.bindBackgroundMute(target);
    const master = engine.bus('master') as unknown as FakeGainNode;
    return { engine, settings, target, unbind, master };
  }

  it('silences the master on blur and restores it on focus', async () => {
    const { engine, target, master } = await setup(true);
    target.dispatchEvent(new Event('blur'));
    expect(engine.backgroundMuted).toBe(true);
    expect(master.gain.lastTarget!.value).toBe(0);

    target.dispatchEvent(new Event('focus'));
    expect(engine.backgroundMuted).toBe(false);
    expect(master.gain.lastTarget!.value).toBeCloseTo(0.64, 10);
  });

  it('keeps playing in the background when the setting is off', async () => {
    const { engine, target } = await setup(false);
    target.dispatchEvent(new Event('blur'));
    expect(engine.backgroundMuted).toBe(false);
  });

  it('unmutes when the setting is turned off while muted', async () => {
    const { engine, settings, target } = await setup(true);
    target.dispatchEvent(new Event('blur'));
    settings.muteInBackground = false;
    expect(engine.backgroundMuted).toBe(false);
  });

  it('does not undo a mute from the mixer on focus', async () => {
    const { engine, target, master } = await setup(true);
    engine.setMuted('master', true);
    target.dispatchEvent(new Event('blur'));
    target.dispatchEvent(new Event('focus'));
    expect(master.gain.lastTarget!.value).toBe(0);
    expect(engine.mix.muted('master')).toBe(true);
  });

  it('applies a background mute set before the engine starts', async () => {
    const engine = new AudioEngine();
    engine.setBackgroundMuted(true);
    await engine.start();
    const master = engine.bus('master') as unknown as FakeGainNode;
    expect(master.gain.value).toBe(0);
    expect((engine.context as unknown as FakeAudioContext).state).toBe(
      'running'
    );
  });

  it('stops listening once unbound', async () => {
    const { engine, target, unbind } = await setup(true);
    unbind();
    target.dispatchEvent(new Event('blur'));
    expect(engine.backgroundMuted).toBe(false);
  });
});
