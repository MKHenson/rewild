import { Vector2 } from 'rewild-common';
import { UIInput, UIPointerAction } from 'rewild-gpu-ui';
import { ICameraController, Raycaster } from 'rewild-renderer';

/** The pointer id of the mouse's ray. The look-at pointer is -2. */
export const MOUSE_RAY_ID = -3;

/** Metres along the mouse's ray that a world surface can be. */
const REACH = 3;

const EVENTS = [
  'pointerdown',
  'pointermove',
  'pointerup',
  'pointercancel',
] as const;

const ACTIONS: Record<typeof EVENTS[number], UIPointerAction> = {
  pointerdown: 'down',
  pointermove: 'move',
  pointerup: 'up',
  pointercancel: 'cancel',
};

/**
 * Points the free mouse into the world. A ray from the eye through the mouse
 * goes to `UIInput.ray`, as a VR controller's ray will. A locked mouse has no
 * point on the screen, so it sends nothing.
 */
export class MouseRay {
  private element: HTMLElement | null = null;
  private readonly raycaster = new Raycaster();
  private readonly coords = new Vector2();

  constructor(
    private readonly input: UIInput,
    private readonly camera: ICameraController
  ) {}

  attach(element: HTMLElement): void {
    this.detach();
    this.element = element;
    for (const type of EVENTS) element.addEventListener(type, this.onPointer);
  }

  /** Stops pointing. The node under the ray gets `pointercancel` and `pointerleave`. */
  detach(): void {
    const element = this.element;
    if (!element) return;
    for (const type of EVENTS)
      element.removeEventListener(type, this.onPointer);
    this.element = null;
    const { origin, direction } = this.raycaster.ray;
    this.input.ray('cancel', {
      pointerId: MOUSE_RAY_ID,
      origin,
      direction,
      reach: REACH,
    });
    this.input.pointerOut(MOUSE_RAY_ID);
  }

  private onPointer = (e: PointerEvent): void => {
    const element = this.element;
    if (!element || e.pointerType !== 'mouse') return;
    if (document.pointerLockElement) return;
    const rect = element.getBoundingClientRect();
    this.coords.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    this.raycaster.setFromCamera(this.coords, this.camera);
    const { origin, direction } = this.raycaster.ray;
    this.input.ray(ACTIONS[e.type as typeof EVENTS[number]], {
      pointerId: MOUSE_RAY_ID,
      origin,
      direction,
      reach: REACH,
      button: e.button,
      buttons: e.buttons,
    });
  };
}
