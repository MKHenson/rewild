import { SoundBank, SoundEntry, createSoundPick } from './SoundBank';
import { FakeAudioContext } from './testing/FakeAudioContext';

/** Serves each file as that many bytes; a missing path fails like a 404. */
function loader(files: Record<string, number>) {
  return async (url: string) => {
    if (!(url in files)) throw new Error('HTTP 404');
    return new ArrayBuffer(files[url]);
  };
}

function entry(name: string, files: string[], extra: Partial<SoundEntry> = {}) {
  return { name, files, source: 'test', ...extra };
}

function ctx() {
  return new FakeAudioContext() as unknown as BaseAudioContext;
}

/** Returns the given values in turn, then repeats the last. */
function sequence(...values: number[]) {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

let errors: jest.SpyInstance;

beforeEach(() => {
  errors = jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  errors.mockRestore();
});

describe('SoundBank', () => {
  it('resolves each file path to a URL before loading it', async () => {
    const requested: string[] = [];
    const bank = new SoundBank(
      (path) => `https://media/${path}`,
      async (url) => {
        requested.push(url);
        return new ArrayBuffer(4);
      }
    );
    bank.setManifest({ sounds: [entry('a', ['audio/a.ogg'])] });
    await bank.decode(ctx());
    expect(requested).toEqual(['https://media/audio/a.ogg']);
  });

  it('downloads on setManifest, before any context exists', () => {
    const requested: string[] = [];
    const bank = new SoundBank(undefined, async (url) => {
      requested.push(url);
      return new ArrayBuffer(4);
    });
    bank.setManifest({ sounds: [entry('a', ['a1', 'a2'])] });
    expect(requested).toEqual(['a1', 'a2']);
  });

  it('cannot play a sound until it is decoded', async () => {
    const bank = new SoundBank(undefined, loader({ a1: 4 }));
    bank.setManifest({ sounds: [entry('a', ['a1'])] });
    expect(bank.has('a')).toBe(true);
    expect(bank.isLoaded('a')).toBe(false);
    expect(bank.pick('a', createSoundPick())).toBe(false);

    await bank.decode(ctx());
    expect(bank.isLoaded('a')).toBe(true);
    expect(bank.pick('a', createSoundPick())).toBe(true);
  });

  it('does not pick an unknown sound', async () => {
    const bank = new SoundBank(undefined, loader({}));
    bank.setManifest({ sounds: [] });
    await bank.decode(ctx());
    expect(bank.has('nope')).toBe(false);
    expect(bank.pick('nope', createSoundPick())).toBe(false);
  });

  it('decodes once per manifest, across contexts', async () => {
    const bank = new SoundBank(undefined, loader({ a1: 4 }));
    bank.setManifest({ sounds: [entry('a', ['a1'])] });
    const first = new FakeAudioContext();
    const second = new FakeAudioContext();
    await bank.decode(first as unknown as BaseAudioContext);
    await bank.decode(second as unknown as BaseAudioContext);
    expect(first.calls.decode).toBe(1);
    expect(second.calls.decode).toBe(0);
  });

  it('decodes again after a new manifest', async () => {
    const bank = new SoundBank(undefined, loader({ a1: 4, b1: 4 }));
    const context = new FakeAudioContext();
    bank.setManifest({ sounds: [entry('a', ['a1'])] });
    await bank.decode(context as unknown as BaseAudioContext);
    bank.setManifest({ sounds: [entry('b', ['b1'])] });
    await bank.decode(context as unknown as BaseAudioContext);
    expect(bank.names()).toEqual(['b']);
    expect(bank.isLoaded('b')).toBe(true);
  });

  it('defaults pitch and gain to 1 and loop to false', async () => {
    const bank = new SoundBank(undefined, loader({ a1: 4 }));
    bank.setManifest({ sounds: [entry('a', ['a1'])] });
    await bank.decode(ctx());
    const pick = createSoundPick();
    bank.pick('a', pick);
    expect(pick).toEqual(
      expect.objectContaining({ pitch: 1, gain: 1, loop: false })
    );
    expect(pick.buffer).not.toBeNull();
  });

  it('picks pitch and gain across their ranges', async () => {
    const bank = new SoundBank(undefined, loader({ a1: 4 }));
    bank.setManifest({
      sounds: [entry('a', ['a1'], { pitch: [0.9, 1.1], gain: [0.5, 1] })],
    });
    await bank.decode(ctx());
    const pick = createSoundPick();

    bank.random = () => 0;
    bank.pick('a', pick);
    expect(pick.pitch).toBeCloseTo(0.9, 10);
    expect(pick.gain).toBeCloseTo(0.5, 10);

    bank.random = () => 0.5;
    bank.pick('a', pick);
    expect(pick.pitch).toBeCloseTo(1, 10);
    expect(pick.gain).toBeCloseTo(0.75, 10);
  });

  it('never plays the same file twice in a row', async () => {
    const bank = new SoundBank(undefined, loader({ a1: 1, a2: 2, a3: 3 }));
    bank.setManifest({ sounds: [entry('a', ['a1', 'a2', 'a3'])] });
    await bank.decode(ctx());
    bank.random = () => 0;
    const pick = createSoundPick();

    const lengths: number[] = [];
    for (let i = 0; i < 6; i++) {
      bank.pick('a', pick);
      lengths.push(pick.buffer!.length);
    }
    for (let i = 1; i < lengths.length; i++)
      expect(lengths[i]).not.toBe(lengths[i - 1]);
  });

  it('reaches every file', async () => {
    const bank = new SoundBank(undefined, loader({ a1: 1, a2: 2, a3: 3 }));
    bank.setManifest({ sounds: [entry('a', ['a1', 'a2', 'a3'])] });
    await bank.decode(ctx());
    const pick = createSoundPick();
    const seen = new Set<number>();

    bank.random = sequence(0, 0, 0.99, 0, 0.99, 0, 0, 0);
    for (let i = 0; i < 6; i++) {
      bank.pick('a', pick);
      seen.add(pick.buffer!.length);
    }
    expect([...seen].sort()).toEqual([1, 2, 3]);
  });

  it('logs one error for a missing file and plays the others', async () => {
    const bank = new SoundBank(undefined, loader({ a1: 4 }));
    bank.setManifest({ sounds: [entry('a', ['a1', 'missing'])] });
    await bank.decode(ctx());

    expect(errors).toHaveBeenCalledTimes(1);
    expect(errors.mock.calls[0][0]).toContain('Sound "a"');
    expect(errors.mock.calls[0][0]).toContain('missing');

    const pick = createSoundPick();
    for (let i = 0; i < 4; i++) {
      expect(bank.pick('a', pick)).toBe(true);
      expect(pick.buffer!.length).toBe(4);
    }
  });

  it('logs one error for a file that will not decode', async () => {
    const bank = new SoundBank(undefined, loader({ a1: 4, bad: 0 }));
    bank.setManifest({ sounds: [entry('a', ['a1', 'bad'])] });
    await bank.decode(ctx());
    expect(errors).toHaveBeenCalledTimes(1);
    expect(errors.mock.calls[0][0]).toContain('could not decode bad');
    expect(bank.isLoaded('a')).toBe(true);
  });

  it('cannot play a sound whose files all failed, and does not throw', async () => {
    const bank = new SoundBank(undefined, loader({}));
    bank.setManifest({ sounds: [entry('a', ['x', 'y'])] });
    await expect(bank.decode(ctx())).resolves.toBeUndefined();
    expect(errors).toHaveBeenCalledTimes(2);
    expect(bank.pick('a', createSoundPick())).toBe(false);
  });

  it('reports a name listed twice', () => {
    const bank = new SoundBank(undefined, loader({ a1: 4 }));
    bank.setManifest({ sounds: [entry('a', ['a1']), entry('a', ['a1'])] });
    expect(errors).toHaveBeenCalledWith(
      'Sound "a" is listed twice in the manifest'
    );
  });

  it('counts files and decoded bytes', async () => {
    const bank = new SoundBank(undefined, loader({ a1: 100, b1: 50 }));
    bank.setManifest({
      sounds: [entry('a', ['a1', 'gone']), entry('b', ['b1'])],
    });
    expect(bank.stats()).toEqual({
      sounds: 2,
      files: 3,
      loaded: 0,
      failed: 0,
      pending: 3,
      bytes: 0,
    });

    await bank.decode(ctx());
    expect(bank.stats()).toEqual({
      sounds: 2,
      files: 3,
      loaded: 2,
      failed: 1,
      pending: 0,
      bytes: 150 * 4,
    });
  });
});
