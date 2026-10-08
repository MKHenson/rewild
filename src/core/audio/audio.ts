import {
  AudioEngine,
  AudioScope,
  AudioSettings,
  SoundManifest,
} from 'rewild-audio';
import { resolveAssetUrl } from 'rewild-renderer/lib/managers/TextureManager';

/** The one audio engine, shared by the game and the editor. */
export const audio = new AudioEngine(resolveAssetUrl);

/** The player's volumes and background mute, restored from localStorage. */
export const audioSettings = new AudioSettings(audio);

let scene: AudioScope | null = null;

/** The scope of the running game, whose sounds stop when it ends. Null outside a game. */
export function sceneScope(): AudioScope | null {
  return scene;
}

/** Starts a new scene scope, ending any previous one. */
export function openSceneScope(): AudioScope {
  scene?.dispose();
  scene = audio.createScope();
  return scene;
}

/** Fades out a scene scope's sounds and lifts the menu duck. */
export function closeSceneScope(scope: AudioScope): void {
  if (scene === scope) scene = null;
  scope.dispose();
  audio.duckWorld(false);
}

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
