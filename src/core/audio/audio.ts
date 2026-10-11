import {
  AudioEngine,
  AudioScope,
  AudioSettings,
  SoundManifest,
} from 'rewild-audio';
import { resolveAssetUrl } from 'rewild-renderer/lib/managers/TextureManager';
import type { FootstepsDef } from './Footsteps';
import type { SoundscapesDef } from './Soundscape';
import type { VoiceDef } from './VoiceSound';

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

/** Fetches the audio templates: the sound manifest, whose files start downloading, the footsteps, the voice and the soundscapes. */
export async function loadAudioTemplates(): Promise<void> {
  await Promise.all([
    loadSoundManifest(),
    loadFootsteps(),
    loadVoice(),
    reloadSoundscapes(),
  ]);
}

/** Fetches `templates/sounds.json` and starts downloading its files. */
async function loadSoundManifest(): Promise<void> {
  try {
    const response = await fetch('/templates/sounds.json');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    audio.loadSounds((await response.json()) as SoundManifest);
  } catch (e) {
    console.error('Could not load templates/sounds.json', e);
  }
}

let footsteps: FootstepsDef | null = null;

/** `templates/footsteps.json`, or null until it has loaded. */
export function footstepsDef(): FootstepsDef | null {
  return footsteps;
}

/** Fetches `templates/footsteps.json`. */
async function loadFootsteps(): Promise<void> {
  try {
    const response = await fetch('/templates/footsteps.json');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    footsteps = (await response.json()) as FootstepsDef;
  } catch (e) {
    console.error('Could not load templates/footsteps.json', e);
  }
}

let voice: VoiceDef | null = null;

/** `templates/voice.json`, or null until it has loaded. */
export function voiceDef(): VoiceDef | null {
  return voice;
}

/** Fetches `templates/voice.json`. */
async function loadVoice(): Promise<void> {
  try {
    const response = await fetch('/templates/voice.json');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    voice = (await response.json()) as VoiceDef;
  } catch (e) {
    console.error('Could not load templates/voice.json', e);
  }
}

let soundscapes: SoundscapesDef | null = null;
let soundscapesVersion = 0;

/** `templates/soundscapes.json`, or null until it has loaded. */
export function soundscapesDef(): SoundscapesDef | null {
  return soundscapes;
}

/** Rises each time the soundscapes load, so their users can rebuild. */
export function soundscapesLoaded(): number {
  return soundscapesVersion;
}

/** Fetches `templates/soundscapes.json`, again if it has loaded before. */
export async function reloadSoundscapes(): Promise<boolean> {
  try {
    const response = await fetch('/templates/soundscapes.json', {
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    soundscapes = (await response.json()) as SoundscapesDef;
    soundscapesVersion++;
    return true;
  } catch (e) {
    console.error('Could not load templates/soundscapes.json', e);
    return false;
  }
}
