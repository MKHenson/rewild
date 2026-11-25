import { BehaviourState, IAsset, IBehaviour } from 'rewild-routing';
import { PortalAsset } from '../PortalAsset';
import { StateMachineData } from '../Types';

/** Extra reach past the sphere's surface at which the player is taken. */
const TOUCH_MARGIN = 0.4;
/** How far past the touch distance the player must be before it arms. */
const ARM_MARGIN = 1.5;

/**
 * Opens the portal as the player nears it and takes them to its target level
 * when they touch it once it is open. Arms only once the player has been clear
 * of it, so arriving next to a return portal does not send them straight back.
 * Its state also holds whether the portal is locked.
 */
export class PortalTrigger implements IBehaviour {
  name = 'portal-trigger';
  private armed = false;
  private portal: PortalAsset | null = null;

  onAdded(asset: IAsset): void {
    if (asset instanceof PortalAsset) this.portal = asset;
  }

  onRemoved(): void {
    this.portal = null;
  }

  onMount(): void {
    this.armed = false;
  }

  serialize(): BehaviourState {
    const state: BehaviourState = { armed: this.armed };
    if (this.portal) state.locked = this.portal.locked;
    return state;
  }

  restore(state: BehaviourState): void {
    if (typeof state.armed === 'boolean') this.armed = state.armed;
    if (typeof state.locked === 'boolean' && this.portal)
      this.portal.locked = state.locked;
  }

  onUpdate(delta: f32, _total: u32, asset: IAsset): void {
    if (!(asset instanceof PortalAsset)) return;
    const data = asset.stateMachine?.data as StateMachineData | undefined;
    if (!data?.gameManager) return;

    const eye = data.renderer.camera.camera.transform.position;
    asset.tick(delta, eye);
    if (!asset.targetLevel) return;

    const touch = asset.radius + TOUCH_MARGIN;
    const centre = asset.transform.position;
    // Nearest point on the body, feet to eye, so a swimmer held off the bed still reaches it.
    const bodyY = Math.min(Math.max(centre.y, data.player.feetY), eye.y);
    const dx = eye.x - centre.x;
    const dy = bodyY - centre.y;
    const dz = eye.z - centre.z;
    const distanceSq = dx * dx + dy * dy + dz * dz;

    if (!this.armed) {
      const armAt = touch + ARM_MARGIN;
      this.armed = distanceSq > armAt * armAt;
      return;
    }

    if (asset.opening.isOpen && distanceSq < touch * touch) {
      this.armed = false;
      asset.sound?.travel();
      data.gameManager.travelTo(asset.targetLevel);
    }
  }
}
