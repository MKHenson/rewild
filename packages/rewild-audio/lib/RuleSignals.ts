import { smoothstep } from 'rewild-common';
import {
  NumberSignalName,
  RuleSignalsSchema,
  StateSignalName,
  StateSignalValue,
} from './RuleTypes';

/** Seconds a state's weight takes to rise to 1 after it begins, and to fall to 0 after it ends. */
export const STATE_EASE = 4;

interface StateSlots {
  slots: Map<string, number>;
  first: number;
  count: number;
  current: number;
}

/**
 * The values rules read. Set the numbers and the states each frame, then
 * `update` to ease the state weights. Profiles compiled against one instance
 * read their signals from it by index, with no lookups by name.
 *
 * The schema's names become literal types, so a misspelt name in `set` or
 * `setState` fails to compile. Rules from JSON are checked when a RuleSet
 * compiles them.
 */
export class RuleSignals<
  const S extends RuleSignalsSchema = RuleSignalsSchema
> {
  readonly values: Float32Array;
  private readonly _numbers = new Map<string, number>();
  private readonly _states = new Map<string, StateSlots>();
  private readonly _stateWeights: Float32Array;

  constructor(schema: S, readonly ease: number = STATE_EASE) {
    schema.numbers.forEach((name, i) => this._numbers.set(name, i));
    this.values = new Float32Array(schema.numbers.length);
    let next = 0;
    for (const [name, values] of Object.entries(schema.states ?? {})) {
      const slots = new Map<string, number>();
      values.forEach((value, i) => slots.set(value, next + i));
      this._states.set(name, {
        slots,
        first: next,
        count: values.length,
        current: -1,
      });
      next += values.length;
    }
    this._stateWeights = new Float32Array(next);
  }

  /** The index of a number signal, or -1. */
  numberIndex(name: string): number {
    return this._numbers.get(name) ?? -1;
  }

  /** The weight index of one value of a state signal, or -1. */
  stateIndex(name: string, value: string): number {
    return this._states.get(name)?.slots.get(value) ?? -1;
  }

  isState(name: string): boolean {
    return this._states.has(name);
  }

  get(name: NumberSignalName<S>): number {
    const i = this.numberIndex(name);
    return i < 0 ? 0 : this.values[i];
  }

  set(name: NumberSignalName<S>, value: number): void {
    const i = this.numberIndex(name);
    if (i >= 0) this.values[i] = value;
  }

  /** Sets the value a state signal is in now. An unknown value leaves it in none. */
  setState<K extends StateSignalName<S>>(
    name: K,
    value: StateSignalValue<S, K>
  ): void {
    const state = this._states.get(name);
    if (state) state.current = state.slots.get(value) ?? -1;
  }

  /** Snaps every state weight to its state, as on a load. */
  settle(): void {
    for (const state of this._states.values())
      for (let i = state.first; i < state.first + state.count; i++)
        this._stateWeights[i] = i === state.current ? 1 : 0;
  }

  /** Eases each state weight toward its state by `seconds`. */
  update(seconds: number): void {
    const step = this.ease > 0 ? seconds / this.ease : 1;
    for (const state of this._states.values())
      for (let i = state.first; i < state.first + state.count; i++) {
        const w = this._stateWeights[i];
        this._stateWeights[i] =
          i === state.current ? Math.min(1, w + step) : Math.max(0, w - step);
      }
  }

  /** 0..1, eased: how far into the state at `index` the signal is. */
  stateWeight(index: number): number {
    return smoothstep(this._stateWeights[index], 0, 1);
  }
}
