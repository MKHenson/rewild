export interface SoundEntry {
  name: string;
  files: string[];
  loop?: boolean;
  /** Playback rate range, picked at random per play. */
  pitch?: [number, number];
  /** Gain range, picked at random per play. */
  gain?: [number, number];
  source: string;
}

export interface SoundManifest {
  sounds: SoundEntry[];
}

/** One play's choice of file, pitch and gain. Reused by the caller. */
export interface SoundPick {
  buffer: AudioBuffer | null;
  pitch: number;
  gain: number;
  loop: boolean;
}

export interface SoundBankStats {
  sounds: number;
  files: number;
  loaded: number;
  failed: number;
  pending: number;
  bytes: number;
}

export type FileLoader = (url: string) => Promise<ArrayBuffer>;

interface BankSound {
  entry: SoundEntry;
  data: Promise<ArrayBuffer | null>[];
  buffers: (AudioBuffer | null)[];
  failed: boolean[];
  last: number;
}

const fetchFile: FileLoader = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.arrayBuffer();
};

export function createSoundPick(): SoundPick {
  return { buffer: null, pitch: 1, gain: 1, loop: false };
}

/**
 * The sounds in a manifest. Files download as soon as the manifest is set and
 * decode once a context exists. A file that fails logs one error and is left
 * out; the rest of its sound still plays.
 */
export class SoundBank {
  random: () => number = Math.random;

  private _sounds = new Map<string, BankSound>();
  private _decoding: Promise<void> | null = null;

  constructor(
    private readonly _resolveUrl: (path: string) => string = (path) => path,
    private readonly _load: FileLoader = fetchFile
  ) {}

  setManifest(manifest: SoundManifest): void {
    this._sounds.clear();
    this._decoding = null;

    for (const entry of manifest.sounds) {
      if (this._sounds.has(entry.name))
        console.error(`Sound "${entry.name}" is listed twice in the manifest`);

      const sound: BankSound = {
        entry,
        data: [],
        buffers: entry.files.map(() => null),
        failed: entry.files.map(() => false),
        last: -1,
      };
      sound.data = entry.files.map((file, i) => {
        const url = this._resolveUrl(file);
        return this._load(url).catch((e) => {
          this._fail(sound, i, `could not load ${url}`, e);
          return null;
        });
      });
      this._sounds.set(entry.name, sound);
    }
  }

  /** Decodes every downloaded file. Buffers outlive the context, so this runs once per manifest. */
  decode(ctx: BaseAudioContext): Promise<void> {
    if (!this._decoding) this._decoding = this._decodeAll(ctx);
    return this._decoding;
  }

  has(name: string): boolean {
    return this._sounds.has(name);
  }

  isLoaded(name: string): boolean {
    const sound = this._sounds.get(name);
    return !!sound && sound.buffers.some((b) => b !== null);
  }

  names(): string[] {
    return [...this._sounds.keys()];
  }

  /** Picks a file, pitch and gain into `out`. A sound with several files never repeats the last one. */
  pick(name: string, out: SoundPick): boolean {
    const sound = this._sounds.get(name);
    if (!sound) return false;

    const buffers = sound.buffers;
    let loaded = 0;
    for (let i = 0; i < buffers.length; i++) if (buffers[i]) loaded++;
    if (loaded === 0) return false;

    const skipLast = loaded > 1 && buffers[sound.last] ? 1 : 0;
    let n = Math.floor(this.random() * (loaded - skipLast));
    let index = -1;
    for (let i = 0; i < buffers.length; i++) {
      if (!buffers[i] || (skipLast && i === sound.last)) continue;
      if (n-- === 0) {
        index = i;
        break;
      }
    }

    const { pitch, gain, loop } = sound.entry;
    sound.last = index;
    out.buffer = buffers[index];
    out.pitch = pitch ? this._range(pitch[0], pitch[1]) : 1;
    out.gain = gain ? this._range(gain[0], gain[1]) : 1;
    out.loop = !!loop;
    return true;
  }

  stats(): SoundBankStats {
    const stats: SoundBankStats = {
      sounds: this._sounds.size,
      files: 0,
      loaded: 0,
      failed: 0,
      pending: 0,
      bytes: 0,
    };
    for (const sound of this._sounds.values()) {
      for (let i = 0; i < sound.buffers.length; i++) {
        const buffer = sound.buffers[i];
        stats.files++;
        if (buffer) {
          stats.loaded++;
          stats.bytes += buffer.length * buffer.numberOfChannels * 4;
        } else if (sound.failed[i]) stats.failed++;
        else stats.pending++;
      }
    }
    return stats;
  }

  private async _decodeAll(ctx: BaseAudioContext): Promise<void> {
    const jobs: Promise<void>[] = [];
    for (const sound of this._sounds.values())
      sound.data.forEach((data, i) =>
        jobs.push(this._decode(ctx, sound, i, data))
      );
    await Promise.all(jobs);
  }

  private async _decode(
    ctx: BaseAudioContext,
    sound: BankSound,
    index: number,
    data: Promise<ArrayBuffer | null>
  ): Promise<void> {
    const bytes = await data;
    if (!bytes || this._sounds.get(sound.entry.name) !== sound) return;
    try {
      sound.buffers[index] = await ctx.decodeAudioData(bytes);
    } catch (e) {
      this._fail(
        sound,
        index,
        `could not decode ${this._resolveUrl(sound.entry.files[index])}`,
        e
      );
    }
  }

  private _fail(sound: BankSound, index: number, what: string, e: unknown) {
    sound.failed[index] = true;
    const reason = e instanceof Error ? e.message : String(e);
    console.error(`Sound "${sound.entry.name}": ${what} (${reason})`);
  }

  private _range(min: number, max: number): number {
    return min + (max - min) * this.random();
  }
}
