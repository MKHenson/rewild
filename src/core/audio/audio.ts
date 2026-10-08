import { AudioEngine, SoundManifest } from 'rewild-audio';
import { resolveAssetUrl } from 'rewild-renderer/lib/managers/TextureManager';

/** The one audio engine, shared by the game and the editor. */
export const audio = new AudioEngine(resolveAssetUrl);

/** Fetches `templates/sounds.json` and starts downloading its files. */
export async function loadSoundManifest(): Promise<void> {
  try {
    const response = await fetch('/templates/sounds.json');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    audio.loadSounds((await response.json()) as SoundManifest);
  } catch (e) {
    console.error('Could not load templates/sounds.json', e);
  }
}
