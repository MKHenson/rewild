/**
 * A condition: each key names a signal. A `[from, to]` range on a number
 * signal weighs 0 at `from` and 1 at `to`, eased between; with `from` above
 * `to` it rises as the signal falls. A string on a state signal weighs 1 a few
 * seconds after the state begins. The weights of all keys multiply.
 */
export type RuleCondition = Readonly<
  Record<string, readonly [number, number] | string>
>;

/** A layer id, a tag such as `"#birds"`, `"*"` for every layer, or a list of them. */
export type RuleTarget = string | readonly string[];

export interface RuleLayerDef {
  id: string;
  sound: string;
  tags?: readonly string[];
  /** When the layer plays. Without it, always. */
  when?: RuleCondition;
  gain?: number;
}

/**
 * A rule: one action, weighted by its `when`.
 * - `add` plays a new sound at `gain` × weight.
 * - `replace` crossfades each target to `with`: the old sound at 1 − weight, the
 *   new one at weight. The new sound takes the target's id, tags, gain and
 *   cutoff, so later rules on that target act on it too.
 * - `scale` multiplies each target's gain by a value between 1 and `by`.
 * - `muffle` moves each target's cutoff from open toward `cutoff` Hz. The lowest
 *   cutoff on a layer wins.
 */
export interface RuleDef {
  /** Names the rule, so a profile can turn a base rule off with `without`. */
  id?: string;
  when: RuleCondition;
  add?: string;
  replace?: RuleTarget;
  with?: string;
  scale?: RuleTarget;
  by?: number;
  muffle?: RuleTarget;
  cutoff?: number;
  /** Gain of the sound an `add` or a `replace` brings in. Defaults to 1. */
  gain?: number;
  /** Tags of the sound an `add` brings in. */
  tags?: readonly string[];
}

export interface RuleSetDef {
  layers?: readonly RuleLayerDef[];
  rules?: readonly RuleDef[];
  /** Ids of base rules this profile turns off. */
  without?: readonly string[];
}

/** The signals a rule set reads: number signals, and state signals with every value they can take. */
export interface RuleSignalsSchema {
  numbers: readonly string[];
  states?: Readonly<Record<string, readonly string[]>>;
}

/** The number signal names a schema declares. */
export type NumberSignalName<S extends RuleSignalsSchema> =
  S['numbers'][number];

/** The state signal names a schema declares. */
export type StateSignalName<S extends RuleSignalsSchema> = keyof NonNullable<
  S['states']
> &
  string;

/** The values the state signal `K` can take. */
export type StateSignalValue<
  S extends RuleSignalsSchema,
  K extends StateSignalName<S>
> = NonNullable<S['states']>[K][number];
