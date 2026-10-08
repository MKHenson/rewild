import type { AudioEngine } from './AudioEngine';
import { BusName } from './Buses';

/** localStorage key holding the audio settings, as a JSON object. */
export const AUDIO_SETTINGS_KEY = 'rewild.audio';

/** The volumes a player sets. The world slider covers ambience, weather and effects. */
export const VOLUME_SETTINGS = [
  'master',
  'music',
  'world',
  'player',
  'ui',
] as const;

export type VolumeSetting = typeof VOLUME_SETTINGS[number];

export const DEFAULT_VOLUMES: Readonly<Record<VolumeSetting, number>> = {
  master: 0.8,
  music: 1,
  world: 1,
  player: 1,
  ui: 1,
};

const BUS_FOR: Readonly<Record<VolumeSetting, BusName>> = {
  master: 'master',
  music: 'music',
  world: 'world',
  player: 'player',
  ui: 'ui',
};

export type SettingsStorage = Pick<Storage, 'getItem' | 'setItem'>;

/**
 * A slider position from 0 to 1 as a bus gain. Hearing is roughly logarithmic,
 * so a straight line would crowd most of the change into the bottom of the
 * slider. Squaring spreads it evenly: half way is -12 dB.
 */
export function volumeToGain(volume: number): number {
  const v = Math.min(1, Math.max(0, volume));
  return v * v;
}

export function isVolumeSetting(value: unknown): value is VolumeSetting {
  return (
    typeof value === 'string' &&
    (VOLUME_SETTINGS as readonly string[]).includes(value)
  );
}

/**
 * The player's audio settings. Each change applies to the engine at once and
 * persists to localStorage; the constructor restores them, so a reload keeps
 * them.
 */
export class AudioSettings {
  private readonly _volumes = { ...DEFAULT_VOLUMES };
  private _muteInBackground = true;

  constructor(
    private readonly _engine: AudioEngine,
    private readonly _storage: SettingsStorage | null = defaultStorage()
  ) {
    this._read();
    for (const setting of VOLUME_SETTINGS) this._apply(setting);
  }

  volume(setting: VolumeSetting): number {
    return this._volumes[setting];
  }

  setVolume(setting: VolumeSetting, volume: number): void {
    const v = Math.min(1, Math.max(0, volume));
    if (v === this._volumes[setting]) return;
    this._volumes[setting] = v;
    this._apply(setting);
    this._write();
  }

  get muteInBackground(): boolean {
    return this._muteInBackground;
  }

  set muteInBackground(value: boolean) {
    if (value === this._muteInBackground) return;
    this._muteInBackground = value;
    if (!value) this._engine.setSilenced('background', false);
    this._write();
  }

  /** Mutes the engine while `target` is blurred, if the setting is on. */
  bindBackgroundMute(target: EventTarget): () => void {
    const onBlur = () => {
      if (this._muteInBackground) this._engine.setSilenced('background', true);
    };
    const onFocus = () => this._engine.setSilenced('background', false);
    target.addEventListener('blur', onBlur);
    target.addEventListener('focus', onFocus);
    return () => {
      target.removeEventListener('blur', onBlur);
      target.removeEventListener('focus', onFocus);
    };
  }

  private _apply(setting: VolumeSetting): void {
    this._engine.setVolume(
      BUS_FOR[setting],
      volumeToGain(this._volumes[setting])
    );
  }

  /** Keeps only known settings with valid values; anything else stays at its default. */
  private _read(): void {
    try {
      const stored = this._storage?.getItem(AUDIO_SETTINGS_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored) as unknown;
      if (!parsed || typeof parsed !== 'object') return;
      const { volumes, muteInBackground } = parsed as Record<string, unknown>;

      if (volumes && typeof volumes === 'object')
        for (const [key, value] of Object.entries(volumes))
          if (
            isVolumeSetting(key) &&
            typeof value === 'number' &&
            isFinite(value)
          )
            this._volumes[key] = Math.min(1, Math.max(0, value));

      if (typeof muteInBackground === 'boolean')
        this._muteInBackground = muteInBackground;
    } catch {
      // Blocked storage, or JSON that is not JSON: the defaults stand.
    }
  }

  private _write(): void {
    try {
      this._storage?.setItem(
        AUDIO_SETTINGS_KEY,
        JSON.stringify({
          volumes: this._volumes,
          muteInBackground: this._muteInBackground,
        })
      );
    } catch {
      // Storage full or blocked: the settings still apply for this session.
    }
  }
}

function defaultStorage(): SettingsStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
