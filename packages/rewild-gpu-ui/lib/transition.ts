import { mixColors, RGBA } from './color';
import type {
  UIEasing,
  UIStyle,
  UITransition,
  UITransitionProperty,
} from './style';

export const TRANSITION_PROPERTIES: readonly UITransitionProperty[] = [
  'backgroundColor',
  'borderColor',
  'color',
  'opacity',
  'transform',
];

const TRANSITION_NAMES = new Set<string>(TRANSITION_PROPERTIES);

export function isTransitionProperty(key: string): key is UITransitionProperty {
  return TRANSITION_NAMES.has(key);
}

/**
 * A property's value as numbers: a colour's straight alpha channels, an
 * opacity, or a transform's x, y and scale.
 */
export type TransitionValue = readonly number[];

/** The transition for a property, or null. A later entry wins, as in CSS. */
export function findTransition(
  style: UIStyle,
  key: UITransitionProperty
): UITransition | null {
  const value = style.transition;
  if (!value) return null;
  const list = Array.isArray(value) ? value : [value];
  for (let i = list.length - 1; i >= 0; i--)
    if (list[i].property === key || list[i].property === 'all') return list[i];
  return null;
}

interface Run {
  from: TransitionValue;
  /** In milliseconds. Null until the node first draws after the change. */
  start: number | null;
  transition: UITransition;
}

/**
 * A node's running transitions, and the value it last drew for each
 * property that has a transition. A change starts from the value the node
 * shows, so a change in the middle of a transition does not jump.
 */
export class NodeTransitions {
  private shownValues = new Map<UITransitionProperty, TransitionValue>();
  private runs = new Map<UITransitionProperty, Run>();

  /** The value the node last drew, or undefined. */
  shown(key: UITransitionProperty): TransitionValue | undefined {
    return this.shownValues.get(key);
  }

  /**
   * Starts a transition from the value the node shows. A node that has not
   * drawn the property jumps to its new value, as in CSS.
   */
  start(key: UITransitionProperty, transition: UITransition): void {
    const from = this.shownValues.get(key);
    if (from) this.runs.set(key, { from, start: null, transition });
  }

  /** Forgets the property, when it no longer has a transition. */
  clear(key: UITransitionProperty): void {
    this.shownValues.delete(key);
    this.runs.delete(key);
  }

  /**
   * The value to draw at `now`, in milliseconds, on the way to `target`. It
   * becomes the value the node shows. `running` is true when the transition
   * has not ended.
   */
  value(
    key: UITransitionProperty,
    target: TransitionValue,
    now: number
  ): { value: TransitionValue; running: boolean } {
    const run = this.runs.get(key);
    let value = target;
    let running = false;
    if (run) {
      run.start ??= now;
      const { duration, delay = 0, easing = 'ease' } = run.transition;
      const elapsed = now - run.start - delay;
      if (duration > 0 && elapsed < duration) {
        const t = ease(easing, Math.max(0, elapsed) / duration);
        value = mix(key, run.from, target, t);
        running = true;
      } else {
        this.runs.delete(key);
      }
    }
    this.shownValues.set(key, value);
    return { value, running };
  }
}

function mix(
  key: UITransitionProperty,
  a: TransitionValue,
  b: TransitionValue,
  t: number
): TransitionValue {
  if (key === 'opacity' || key === 'transform')
    return a.map((v, i) => v + (b[i] - v) * t);
  return mixColors(a as RGBA, b as RGBA, t);
}

/** The control points of the CSS easing keywords, as `cubic-bezier()`. */
const CURVES: Record<Exclude<UIEasing, 'linear'>, number[]> = {
  ease: [0.25, 0.1, 0.25, 1],
  'ease-in': [0.42, 0, 1, 1],
  'ease-out': [0, 0, 0.58, 1],
  'ease-in-out': [0.42, 0, 0.58, 1],
};

/** The eased progress at time `t`, both from 0 to 1. */
export function ease(easing: UIEasing, t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  if (easing === 'linear') return t;
  const [x1, y1, x2, y2] = CURVES[easing];
  return bezier(solveBezierX(t, x1, x2), y1, y2);
}

/** One axis of a cubic Bézier from 0 to 1 with control values `a` and `b`. */
function bezier(s: number, a: number, b: number): number {
  const u = 1 - s;
  return 3 * u * u * s * a + 3 * u * s * s * b + s * s * s;
}

function bezierSlope(s: number, a: number, b: number): number {
  const u = 1 - s;
  return 3 * u * u * a + 6 * u * s * (b - a) + 3 * s * s * (1 - b);
}

/** The curve parameter where x is `x`: Newton steps, then halving if they fail. */
function solveBezierX(x: number, x1: number, x2: number): number {
  let s = x;
  for (let i = 0; i < 8; i++) {
    const error = bezier(s, x1, x2) - x;
    if (Math.abs(error) < 1e-6) return s;
    const slope = bezierSlope(s, x1, x2);
    if (Math.abs(slope) < 1e-6) break;
    s -= error / slope;
  }
  let low = 0;
  let high = 1;
  s = x;
  for (let i = 0; i < 30; i++) {
    const value = bezier(s, x1, x2);
    if (Math.abs(value - x) < 1e-6) break;
    if (value < x) low = s;
    else high = s;
    s = (low + high) / 2;
  }
  return s;
}
