import { Matrix4, Vector3 } from 'rewild-common';
import { Renderer, SkinnedInstance, Transform } from 'rewild-renderer';

/** The model of the player's arms, posed for a camera at its origin. */
export const ARMS_MODEL = 'first-person-arms';
/** The arm coming up with the watch toward the eye. Ends in the held pose. */
export const ARMS_RAISE = 'personal-inventory';
/** A loop of the held pose. */
export const ARMS_HOLD = 'personal-inventory-hold';
/** The arm going back down from the held pose. */
export const ARMS_LOWER = 'personal-inventory-lower';
/** The bone at the watch face, its +Z out of the face. */
export const ARMS_WATCH = 'watch';

/** The player's arms, as the personal assistant drives them. */
export interface AssistantArms {
  /** Place it at the eye. Its space is the eye's. */
  readonly transform: Transform;
  /** The clip's length in seconds, or −1 if the arms have no such clip. */
  clipDuration(clip: string): number;
  /** Crossfades to `clip` over `fade` seconds, starting `time` seconds in. */
  play(clip: string, fade: number, loop: boolean, time: number): void;
  stop(): void;
  /** Writes the watch face's position in the arms' space. False with no watch. */
  watchPosition(out: Vector3): boolean;
}

const _joint = new Matrix4();

/** The arms as a skinned model, or null when the game has no arms model. */
export function createSkinnedArms(renderer: Renderer): AssistantArms | null {
  if (!renderer.geometryManager.hasModel(ARMS_MODEL)) return null;
  return new SkinnedArms(new SkinnedInstance(renderer, ARMS_MODEL));
}

class SkinnedArms implements AssistantArms {
  readonly transform: Transform;
  private readonly watch: number;

  constructor(private readonly instance: SkinnedInstance) {
    this.transform = instance.transform;
    this.transform.name = 'assistant-arms';
    this.watch = instance.jointIndex(ARMS_WATCH);
    // The body casting them is not drawn, so floating arms would cast alone.
    for (const mesh of instance.meshes) mesh.castShadow = false;
  }

  clipDuration(clip: string): number {
    return this.instance.clipDuration(clip);
  }

  play(clip: string, fade: number, loop: boolean, time: number): void {
    if (!this.instance.play(clip, fade, loop)) return;
    this.instance.setClipTime(clip, time);
  }

  stop(): void {
    this.instance.stopAll();
  }

  watchPosition(out: Vector3): boolean {
    if (this.watch < 0) return false;
    out.setFromMatrixPosition(this.instance.jointMatrix(this.watch, _joint));
    return true;
  }
}
