import { Euler, EulerRotationOrder, Quaternion, Vector3 } from 'rewild-common';
import {
  Button,
  followPointerLight,
  glassSurface,
  Tabs,
  UINode,
} from 'rewild-gpu-ui';
import { Transform, UISurface3D } from 'rewild-renderer';
import { PortalTab, PortalTarget } from './PortalTab';

/** Seconds the hand takes to come up, and to go back down. */
export const ASSISTANT_MOVE_TIME = 1.0;
/** The share of the hand's rise before the panel's hologram starts to turn on. */
export const ASSISTANT_HOLOGRAM_FROM = 0.35;
/** Seconds the hologram takes to turn on, and to turn off. */
export const ASSISTANT_HOLOGRAM_TIME = 0.7;
/** Metres from the eye to the open panel. */
export const ASSISTANT_DISTANCE = 0.5;
/** The share of the view's height and width that the open panel covers. */
export const ASSISTANT_COVER = 0.85;
/** The panel's layout height in pixels, at any size, so text reads as on the screen. */
export const ASSISTANT_LAYOUT_HEIGHT = 900;
/** Seconds of one breath. The raised hand rises and falls with it. */
export const ASSISTANT_BREATH_TIME = 4.0;
/** Metres the raised hand rises and falls with each breath. */
export const ASSISTANT_BREATH_RISE = 0.008;
/** Metres the raised hand drifts to each side, more slowly than it breathes. */
export const ASSISTANT_BREATH_DRIFT = 0.003;
/** Radians the raised hand tilts back and forward with each breath. */
export const ASSISTANT_BREATH_TILT = 0.01;

// The hand at rest: low at the right side, its face turned up as a watch.
const REST_POSITION = new Vector3(0.3, -0.55, -0.25);
const REST_ROTATION = new Quaternion().setFromEuler(new Euler(-1.3, 0.5, 0));
// The hand open: in front of the eye, its face toward it.
const OPEN_POSITION = new Vector3(0, 0, -ASSISTANT_DISTANCE);
const OPEN_ROTATION = new Quaternion();

const _tilt = new Quaternion();
const _euler = new Euler();

/**
 * The player's personal assistant: a glass menu on the player's hand, as a
 * watch on the arm. Later it goes on a VR controller. Opening brings the
 * hand up from the side to in front of the eye. The panel is in the scene
 * only while it shows.
 */
export class PersonalAssistant {
  /** Add it to the camera's transform, so it moves with the view. */
  readonly hand = new Transform();
  readonly panel: UISurface3D;
  /**
   * The glass, which fills the panel. It is not the surface's root, so it
   * takes the pointer, and its light follows it.
   */
  readonly glass: UINode;
  readonly tabs: Tabs;
  readonly portalTab: PortalTab;
  readonly closeButton: Button;
  private _isOpen = false;
  /** 0 at rest, 1 in front of the eye. */
  private progress = 0;
  /** The hologram's effect value: 0 off, 1 on. */
  private hologram = 0;
  /** Seconds of breathing, for the raised hand's sway. */
  private breath = 0;

  /** `onClose` is called when the player clicks Close. */
  constructor(findPortal: () => PortalTarget | null, onClose: () => void) {
    this.hand.name = 'assistant-hand';
    this.panel = new UISurface3D({
      name: 'personal-assistant',
      input: 'none',
      depthTest: false,
      effect: 'hologram',
    });
    this.portalTab = new PortalTab(findPortal);
    this.tabs = new Tabs({
      tabs: [{ label: 'Portal', children: [this.portalTab] }],
      orientation: 'vertical',
      style: { flexGrow: 1, alignSelf: 'stretch' },
    });
    this.glass = new UINode({
      name: 'glass',
      style: {
        // The modal's glass.
        ...glassSurface(),
        borderWidth: 1,
        borderColor: 'glassEdge',
        borderRadius: 14,
        color: 'onSurface',
        boxShadow: [{ inset: true, y: 1, color: '#ffffff14' }],
        padding: 24,
        flexGrow: 1,
        alignSelf: 'stretch',
      },
    });
    followPointerLight(this.glass);
    this.closeButton = new Button({
      label: 'Close',
      icon: 'x',
      variant: 'text',
      name: 'close',
      style: { position: 'absolute', top: 24, right: 24 },
      onClick: onClose,
    });
    this.glass.append(this.tabs.node, this.closeButton.node);
    this.panel.surface.root.append(this.glass);
    this.place();
  }

  get isOpen(): boolean {
    return this._isOpen;
  }

  /**
   * Brings the hand up with the panel on it, sized for a camera's vertical
   * field of view in degrees and its aspect.
   */
  open(fov: number, aspect: number): void {
    this.fit(fov, aspect);
    this.portalTab.refresh();
    if (this.panel.transform.parent !== this.hand)
      this.hand.addChild(this.panel.transform);
    this._isOpen = true;
  }

  /** Takes the hand back down. The panel leaves the scene once it is down. */
  close(): void {
    this._isOpen = false;
  }

  /** Puts the hand down and takes the panel out of the scene now, with no move. */
  hide(): void {
    this._isOpen = false;
    this.progress = 0;
    this.hologram = 0;
    this.place();
  }

  /**
   * Moves the hand and turns the hologram toward where they go, and sways
   * the raised hand as the player breathes. Call it once per frame. Opening turns the hologram on once the hand is part way up.
   * Closing turns it off first, and then the hand goes down.
   */
  update(delta: number): void {
    const move = delta / ASSISTANT_MOVE_TIME;
    const turn = delta / ASSISTANT_HOLOGRAM_TIME;
    this.breath += delta;
    if (this._isOpen) {
      this.progress = Math.min(1, this.progress + move);
      if (this.progress >= ASSISTANT_HOLOGRAM_FROM)
        this.hologram = Math.min(1, this.hologram + turn);
    } else {
      if (this.progress === 0 && this.hologram === 0) return;
      if (this.hologram > 0) this.hologram = Math.max(0, this.hologram - turn);
      else this.progress = Math.max(0, this.progress - move);
    }
    this.place();
  }

  /** Sizes the panel to cover ASSISTANT_COVER of the view at ASSISTANT_DISTANCE. */
  fit(fov: number, aspect: number): void {
    const viewHeight =
      2 * ASSISTANT_DISTANCE * Math.tan(((fov / 2) * Math.PI) / 180);
    const height = viewHeight * ASSISTANT_COVER;
    const surface = this.panel.surface;
    surface.size = { width: height * aspect, height };
    surface.pixelsPerMetre = ASSISTANT_LAYOUT_HEIGHT / height;
  }

  // Sets the hand and the hologram from the progress, with an ease out, and
  // takes the panel off the hand once it is down.
  private place(): void {
    // The panel takes input only while the hand is up and the hologram is on.
    const surface = this.panel.surface;
    surface.effectValue = this.hologram;
    surface.input =
      this.progress === 1 && this.hologram === 1 ? 'nodes' : 'none';
    const t = 1 - (1 - this.progress) ** 3;
    this.hand.position.lerpVectors(REST_POSITION, OPEN_POSITION, t);
    this.hand.quaternion.slerpQuaternions(REST_ROTATION, OPEN_ROTATION, t);
    // The raised hand sways as the player breathes, so the panel feels held.
    // The sway grows as the hand rises.
    const phase = (2 * Math.PI * this.breath) / ASSISTANT_BREATH_TIME;
    this.hand.position.y += ASSISTANT_BREATH_RISE * Math.sin(phase) * t;
    this.hand.position.x +=
      ASSISTANT_BREATH_DRIFT * Math.sin(phase / 1.7 + 1) * t;
    _euler.set(
      ASSISTANT_BREATH_TILT * Math.cos(phase) * t,
      0,
      0,
      EulerRotationOrder.XYZ
    );
    this.hand.quaternion.multiply(_tilt.setFromEuler(_euler));
    if (this.progress === 0 && !this._isOpen)
      this.panel.transform.removeFromParent();
  }
}
