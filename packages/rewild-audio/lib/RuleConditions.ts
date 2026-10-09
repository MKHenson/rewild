import { smoothstep } from 'rewild-common';
import { RuleSignals } from './RuleSignals';
import { RuleCondition } from './RuleTypes';

export const RANGE = 0;
export const STATE = 1;

/** Flat condition lists: a kind, a signal or state index and a range for each. */
export class RuleConditions {
  readonly kinds: number[] = [];
  readonly indices: number[] = [];
  readonly froms: number[] = [];
  readonly tos: number[] = [];

  add(
    when: RuleCondition | undefined,
    signals: RuleSignals,
    owner: string
  ): [number, number] {
    const start = this.kinds.length;
    for (const [name, test] of Object.entries(when ?? {})) {
      if (typeof test === 'string') {
        const index = signals.stateIndex(name, test);
        if (index < 0)
          throw new Error(
            `${owner}: ${
              signals.isState(name)
                ? `"${test}" is not a value of`
                : 'no state signal'
            } "${name}"`
          );
        this.kinds.push(STATE);
        this.indices.push(index);
        this.froms.push(0);
        this.tos.push(0);
      } else {
        const index = signals.numberIndex(name);
        if (index < 0) throw new Error(`${owner}: no number signal "${name}"`);
        this.kinds.push(RANGE);
        this.indices.push(index);
        this.froms.push(test[0]);
        this.tos.push(test[1]);
      }
    }
    return [start, this.kinds.length - start];
  }
}

/** A range condition's weight: 0 at `from`, 1 at `to`, eased between. */
export function rangeWeight(value: number, from: number, to: number): number {
  if (from === to) return value >= to ? 1 : 0;
  return from < to
    ? smoothstep(value, from, to)
    : 1 - smoothstep(value, to, from);
}
