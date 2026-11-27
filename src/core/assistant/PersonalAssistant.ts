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
import {
  ARMS_HOLD,
  ARMS_LOWER,
  ARMS_RAISE,
  AssistantArms,
} from './AssistantArms';

/** Seconds the arm takes to come up, and to go back down, with no arms clip. */
export const ASSISTANT_MOVE_TIME = 1.0;
/** The share of the arm's rise before the panel's hologram starts to turn on. */
export const ASSISTANT_HOLOGRAM_FROM = 0.6;
/** Seconds the hologram takes to turn on, and to turn off. */
export const ASSISTANT_HOLOGRAM_TIME = 0.7;
/** The hologram's value by which the panel has left the watch for its place. */
export const ASSISTANT_BEAM_END = 0.4;
/** Seconds of the crossfade from one arms clip to the next. */
export const ASSISTANT_ARMS_FADE = 0.15;
/** Metres from the eye to the open panel. */
export const ASSISTANT_DISTANCE = 0.5;
/** The share of the view's height and width that the open panel covers. */
export const ASSISTANT_COVER = 0.72;
/**
 * How far the panel sits up and to the right of the view's centre, as shares
 * of the view's height and width, so its lower left corner clears the watch.
 */
export const ASSISTANT_RAISE = 0.1;
export const ASSISTANT_SHIFT = 0.08;
/** The panel's layout height in pixels, at any size, so text reads as on the screen. */
export const ASSISTANT_LAYOUT_HEIGHT = 760;
/** Seconds of one breath. The raised arm rises and falls with it. */
export const ASSISTANT_BREATH_TIME = 4.0;
/** Metres the raised arm rises and falls with each breath. */
export const ASSISTANT_BREATH_RISE = 0.008;
/** Metres the raised arm drifts to each side, more slowly than it breathes. */
export const ASSISTANT_BREATH_DRIFT = 0.003;
/** Radians the raised arm tilts back and forward with each breath. */
export const ASSISTANT_BREATH_TILT = 0.01;
/** The raised watch, in the eye's space, for arms with no watch bone. */
export const ASSISTANT_WATCH = new Vector3(-0.14, -0.15, -0.3);

const _watch = new Vector3();
const _euler = new Euler();

/**
 * The player's personal assistant: a glass menu that a watch on the left
 * wrist projects. Later it goes on a VR controller. Opening raises the arm,
 * and the panel comes out of the watch to its place in front of the eye. The
 * arms and the panel are in the scene only while they show.
 */
export class PersonalAssistant {
  /** Add it to the camera's transform. It holds the arms and the panel. */
  readonly rig = new Transform();
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
  /** 0 with the arm down, 1 with it raised. */
  private progress = 0;
  /** The hologram's effect value: 0 off, 1 on. */
  private hologram = 0;
  /** Seconds of breathing, for the raised arm's sway. */
  private breath = 0;
  private readonly raiseTime: number;
  private readonly lowerTime: number;
  /** The panel's place in the rig, set by `fit`. */
  private readonly panelPosition = new Vector3(0, 0, -ASSISTANT_DISTANCE);

  /**
   * `onClose` is called when the player clicks Close. Without `arms`, the
   * panel opens on the same timing from where the watch would be.
   */
  constructor(
    findPortal: () => PortalTarget | null,
    onClose: () => void,
    private readonly arms: AssistantArms | null = null
  ) {
    this.rig.name = 'assistant';
    this.raiseTime = clipTime(arms, ARMS_RAISE);
    this.lowerTime = clipTime(arms, ARMS_LOWER);
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
   * Raises the arm and opens the panel, sized for a camera's vertical field
   * of view in degrees and its aspect.
   */
  open(fov: number, aspect: number): void {
    if (this._isOpen) return;
    this.fit(fov, aspect);
    this.portalTab.refresh();
    if (this.panel.transform.parent !== this.rig)
      this.rig.addChild(this.panel.transform);
    const arms = this.arms;
    if (arms) {
      if (arms.transform.parent !== this.rig) this.rig.addChild(arms.transform);
      // Opened again while the hologram turned off: the arm is still up.
      if (this.progress === 1)
        arms.play(ARMS_HOLD, ASSISTANT_ARMS_FADE, true, 0);
      else
        arms.play(
          ARMS_RAISE,
          ASSISTANT_ARMS_FADE,
          false,
          this.progress * this.raiseTime
        );
    }
    this._isOpen = true;
  }

  /** Turns the panel off, then lowers the arm. Both leave the scene once it is down. */
  close(): void {
    this._isOpen = false;
  }

  /** Puts the arm down and takes it and the panel out of the scene now, with no move. */
  hide(): void {
    this._isOpen = false;
    this.progress = 0;
    this.hologram = 0;
    this.arms?.stop();
    this.place();
  }

  /**
   * Moves the arm and turns the hologram toward where they go, and sways the
   * raised arm as the player breathes. Call it once per frame. Opening turns
   * the hologram on once the arm is part way up. Closing turns it off first,
   * and then the arm goes down.
   */
  update(delta: number): void {
    const turn = delta / ASSISTANT_HOLOGRAM_TIME;
    this.breath += delta;
    const arms = this.arms;
    if (this._isOpen) {
      const was = this.progress;
      this.progress = Math.min(1, this.progress + delta / this.raiseTime);
      if (this.progress === 1 && was < 1)
        arms?.play(ARMS_HOLD, ASSISTANT_ARMS_FADE, true, 0);
      if (this.progress >= ASSISTANT_HOLOGRAM_FROM)
        this.hologram = Math.min(1, this.hologram + turn);
    } else {
      if (this.progress === 0 && this.hologram === 0) return;
      if (this.hologram > 0) {
        this.hologram = Math.max(0, this.hologram - turn);
        if (this.hologram === 0)
          arms?.play(
            ARMS_LOWER,
            ASSISTANT_ARMS_FADE,
            false,
            (1 - this.progress) * this.lowerTime
          );
      } else {
        this.progress = Math.max(0, this.progress - delta / this.lowerTime);
        if (this.progress === 0) arms?.stop();
      }
    }
    this.place();
  }

  /**
   * Sizes the panel to cover ASSISTANT_COVER of the view at
   * ASSISTANT_DISTANCE, and moves it up and right of the view's centre.
   */
  fit(fov: number, aspect: number): void {
    const viewHeight =
      2 * ASSISTANT_DISTANCE * Math.tan(((fov / 2) * Math.PI) / 180);
    const height = viewHeight * ASSISTANT_COVER;
    const surface = this.panel.surface;
    surface.size = { width: height * aspect, height };
    surface.pixelsPerMetre = ASSISTANT_LAYOUT_HEIGHT / height;
    this.panelPosition.set(
      viewHeight * aspect * ASSISTANT_SHIFT,
      viewHeight * ASSISTANT_RAISE,
      -ASSISTANT_DISTANCE
    );
  }

  // Sways the rig as the player breathes, moves the panel out of the watch
  // with the hologram, and takes the arms and the panel out of the scene once
  // the arm is down.
  private place(): void {
    // The panel takes input only while the arm is up and the hologram is on.
    const surface = this.panel.surface;
    surface.effectValue = this.hologram;
    surface.input =
      this.progress === 1 && this.hologram === 1 ? 'nodes' : 'none';

    // The raised arm and its panel sway as the player breathes, so the panel
    // feels held. The sway grows as the arm rises.
    const t = 1 - (1 - this.progress) ** 3;
    const phase = (2 * Math.PI * this.breath) / ASSISTANT_BREATH_TIME;
    this.rig.position.set(
      ASSISTANT_BREATH_DRIFT * Math.sin(phase / 1.7 + 1) * t,
      ASSISTANT_BREATH_RISE * Math.sin(phase) * t,
      0
    );
    _euler.set(
      ASSISTANT_BREATH_TILT * Math.cos(phase) * t,
      0,
      0,
      EulerRotationOrder.XYZ
    );
    this.rig.quaternion.setFromEuler(_euler);

    // The panel comes out of the watch as its hologram opens.
    const watch = this.arms?.watchPosition(_watch)
      ? _watch
      : _watch.copy(ASSISTANT_WATCH);
    const beam = Math.min(1, this.hologram / ASSISTANT_BEAM_END);
    this.panel.transform.position.lerpVectors(
      watch,
      this.panelPosition,
      1 - (1 - beam) ** 2
    );
    this.panel.transform.quaternion.copy(IDENTITY);

    if (this.progress === 0 && !this._isOpen) {
      this.panel.transform.removeFromParent();
      this.arms?.transform.removeFromParent();
    }
  }
}

const IDENTITY = new Quaternion();

/** The clip's length, or ASSISTANT_MOVE_TIME without arms or the clip. */
function clipTime(arms: AssistantArms | null, clip: string): number {
  const duration = arms?.clipDuration(clip) ?? -1;
  return duration > 0 ? duration : ASSISTANT_MOVE_TIME;
}
