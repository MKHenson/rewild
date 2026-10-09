import { OPEN_CUTOFF_HZ } from './constants';
import { RuleConditions, STATE, rangeWeight } from './RuleConditions';
import { RuleSignals } from './RuleSignals';
import { RuleSetDef, RuleTarget } from './RuleTypes';

const ADD = 0;
const REPLACE = 1;
const SCALE = 2;
const MUFFLE = 3;

interface Slot {
  id: string;
  sound: string;
  tags: readonly string[];
}

/**
 * A compiled profile: its layers and the sounds its rules bring in are slots,
 * the layers first. `evaluate` writes each slot's gain and cutoff, and each
 * rule's weight, into arrays the profile owns, allocating nothing.
 */
export class RuleSet {
  readonly slotIds: readonly string[];
  readonly slotSounds: readonly string[];
  readonly slotTags: readonly (readonly string[])[];
  readonly layerCount: number;
  readonly gains: Float32Array;
  readonly cutoffs: Float32Array;
  readonly ruleIds: readonly string[];
  readonly ruleWeights: Float32Array;

  private readonly _layerGains: Float32Array;
  private readonly _layerConds: Int32Array;
  private readonly _ruleConds: Int32Array;
  private readonly _ops: Int32Array;
  private readonly _targets: Int32Array;
  private readonly _ruleTargets: Int32Array;
  private readonly _newSlots: Int32Array;
  private readonly _values: Float32Array;
  private readonly _condKinds: Int32Array;
  private readonly _condIndices: Int32Array;
  private readonly _condFroms: Float32Array;
  private readonly _condTos: Float32Array;

  /** Compiles `def` over `base`'s rules against `signals`. Throws on an unknown signal, layer or base rule. */
  constructor(
    readonly signals: RuleSignals,
    def: RuleSetDef,
    base?: RuleSetDef
  ) {
    const slots: Slot[] = [];
    const conds = new RuleConditions();
    const layerGains: number[] = [];
    const layerConds: number[] = [];

    for (const layer of def.layers ?? []) {
      slots.push({ id: layer.id, sound: layer.sound, tags: layer.tags ?? [] });
      layerGains.push(layer.gain ?? 1);
      layerConds.push(...conds.add(layer.when, signals, `Layer "${layer.id}"`));
    }
    this.layerCount = slots.length;

    const without = new Set(def.without ?? []);
    const baseRules = base?.rules ?? [];
    for (const id of without)
      if (!baseRules.some((rule) => rule.id === id))
        throw new Error(`without: no base rule "${id}"`);
    const rules = [
      ...baseRules.filter((rule) => !rule.id || !without.has(rule.id)),
      ...(def.rules ?? []),
    ];

    const ruleIds: string[] = [];
    const ruleConds: number[] = [];
    const ops: number[] = [];
    const targets: number[] = [];
    const ruleTargets: number[] = [];
    const newSlots: number[] = [];
    const values: number[] = [];

    rules.forEach((rule, r) => {
      const id = rule.id ?? `rule ${r}`;
      const name = `Rule "${id}"`;
      ruleIds.push(id);
      ruleConds.push(...conds.add(rule.when, signals, name));

      const actions = [rule.add, rule.replace, rule.scale, rule.muffle].filter(
        (a) => a !== undefined
      ).length;
      if (actions !== 1)
        throw new Error(`${name}: needs one of add, replace, scale or muffle`);

      const targetStart = targets.length;
      const newStart = slots.length;
      let op: number;
      let value: number;
      if (rule.add !== undefined) {
        op = ADD;
        value = rule.gain ?? 1;
        slots.push({ id, sound: rule.add, tags: rule.tags ?? [] });
      } else if (rule.replace !== undefined) {
        op = REPLACE;
        value = rule.gain ?? 1;
        if (rule.with === undefined)
          throw new Error(`${name}: replace needs with`);
        for (const t of resolve(slots, rule.replace, name)) {
          targets.push(t);
          slots.push({
            id: slots[t].id,
            sound: rule.with,
            tags: slots[t].tags,
          });
        }
      } else if (rule.scale !== undefined) {
        op = SCALE;
        value = rule.by ?? 1;
        targets.push(...resolve(slots, rule.scale, name));
      } else {
        op = MUFFLE;
        value = rule.cutoff ?? OPEN_CUTOFF_HZ;
        targets.push(...resolve(slots, rule.muffle!, name));
      }
      ops.push(op);
      values.push(value);
      ruleTargets.push(targetStart, targets.length - targetStart);
      newSlots.push(newStart);
    });

    this.slotIds = slots.map((s) => s.id);
    this.slotSounds = slots.map((s) => s.sound);
    this.slotTags = slots.map((s) => s.tags);
    this.gains = new Float32Array(slots.length);
    this.cutoffs = new Float32Array(slots.length).fill(OPEN_CUTOFF_HZ);
    this.ruleIds = ruleIds;
    this.ruleWeights = new Float32Array(rules.length);

    this._layerGains = new Float32Array(layerGains);
    this._layerConds = new Int32Array(layerConds);
    this._ruleConds = new Int32Array(ruleConds);
    this._ops = new Int32Array(ops);
    this._targets = new Int32Array(targets);
    this._ruleTargets = new Int32Array(ruleTargets);
    this._newSlots = new Int32Array(newSlots);
    this._values = new Float32Array(values);
    this._condKinds = new Int32Array(conds.kinds);
    this._condIndices = new Int32Array(conds.indices);
    this._condFroms = new Float32Array(conds.froms);
    this._condTos = new Float32Array(conds.tos);
  }

  /**
   * Works out every slot's gain and cutoff from the signals now. `layerGains`,
   * if given, scales each layer first, for layers whose level the caller sets,
   * such as the share of each surface under a footstep.
   */
  evaluate(layerGains?: ArrayLike<number>): void {
    const gains = this.gains;
    const cutoffs = this.cutoffs;
    cutoffs.fill(OPEN_CUTOFF_HZ);
    gains.fill(0);

    for (let s = 0; s < this.layerCount; s++) {
      const scale = layerGains ? layerGains[s] : 1;
      gains[s] =
        this._layerGains[s] *
        scale *
        this._weight(this._layerConds[s * 2], this._layerConds[s * 2 + 1]);
    }

    const targets = this._targets;
    for (let r = 0; r < this._ops.length; r++) {
      const w = this._weight(
        this._ruleConds[r * 2],
        this._ruleConds[r * 2 + 1]
      );
      this.ruleWeights[r] = w;
      const value = this._values[r];
      const first = this._ruleTargets[r * 2];
      const end = first + this._ruleTargets[r * 2 + 1];

      switch (this._ops[r]) {
        case ADD:
          gains[this._newSlots[r]] = value * w;
          break;
        case REPLACE:
          for (let k = first; k < end; k++) {
            const from = targets[k];
            const to = this._newSlots[r] + (k - first);
            const old = gains[from];
            gains[to] = old * w * value;
            cutoffs[to] = cutoffs[from];
            gains[from] = old * (1 - w);
          }
          break;
        case SCALE: {
          const by = 1 + (value - 1) * w;
          for (let k = first; k < end; k++) gains[targets[k]] *= by;
          break;
        }
        case MUFFLE: {
          const cutoff = OPEN_CUTOFF_HZ * Math.pow(value / OPEN_CUTOFF_HZ, w);
          for (let k = first; k < end; k++)
            if (cutoff < cutoffs[targets[k]]) cutoffs[targets[k]] = cutoff;
          break;
        }
      }
    }
  }

  /** The weight of the conditions from `start`, `count` of them, multiplied. */
  private _weight(start: number, count: number): number {
    const values = this.signals.values;
    let w = 1;
    for (let c = start; c < start + count; c++) {
      const index = this._condIndices[c];
      w *=
        this._condKinds[c] === STATE
          ? this.signals.stateWeight(index)
          : rangeWeight(values[index], this._condFroms[c], this._condTos[c]);
    }
    return w;
  }
}

/** The slots a target names, among those so far. A layer id must match one; a tag or `*` may match none. */
function resolve(
  slots: readonly Slot[],
  target: RuleTarget,
  owner: string
): number[] {
  const out: number[] = [];
  for (const name of typeof target === 'string' ? [target] : target) {
    let found = false;
    slots.forEach((slot, i) => {
      const hit =
        name === '*' ||
        (name.startsWith('#')
          ? slot.tags.includes(name.slice(1))
          : slot.id === name);
      if (!hit) return;
      found = true;
      if (!out.includes(i)) out.push(i);
    });
    if (!found && name !== '*' && !name.startsWith('#'))
      throw new Error(`${owner}: no layer "${name}"`);
  }
  return out;
}
