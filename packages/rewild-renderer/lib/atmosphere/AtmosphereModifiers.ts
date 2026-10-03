import { AtmosphereModifier, ModifierOp, WeatherKnobs } from './WeatherTypes';

/**
 * Temporary changes to the output from gameplay, such as fog under water.
 * They never touch the weather beneath, so when one fades the output returns
 * to the current weather. Applied lowest priority first; each fades in and
 * out by its own weight.
 */
export class AtmosphereModifiers {
  private readonly list: AtmosphereModifier[] = [];
  private readonly removing = new Set<string>();

  add(modifier: Omit<AtmosphereModifier, 'weight'>): void {
    this.removeNow(modifier.id);
    this.list.push({ ...modifier, weight: 0 });
    this.list.sort((a, b) => a.priority - b.priority);
  }

  setWeight(id: string, weight: number): void {
    const modifier = this.find(id);
    if (modifier) modifier.targetWeight = saturate(weight);
  }

  /** Fades the modifier out, then removes it. */
  remove(id: string): void {
    const modifier = this.find(id);
    if (!modifier) return;
    modifier.targetWeight = 0;
    this.removing.add(id);
  }

  get(id: string): AtmosphereModifier | undefined {
    return this.find(id);
  }

  update(deltaSeconds: number): void {
    const list = this.list;
    for (let i = list.length - 1; i >= 0; i--) {
      const modifier = list[i];
      const diff = modifier.targetWeight - modifier.weight;
      if (diff !== 0) {
        const fade = diff > 0 ? modifier.fadeIn : modifier.fadeOut;
        const step = fade > 0 ? deltaSeconds / fade : 1;
        modifier.weight =
          Math.abs(diff) <= step
            ? modifier.targetWeight
            : modifier.weight + Math.sign(diff) * step;
      }
      if (modifier.weight === 0 && this.removing.has(modifier.id)) {
        this.removing.delete(modifier.id);
        list.splice(i, 1);
      }
    }
  }

  apply(knobs: WeatherKnobs): void {
    const list = this.list;
    for (let i = 0; i < list.length; i++) {
      const modifier = list[i];
      const weight = modifier.weight;
      if (weight <= 0) continue;
      const effects = modifier.effects;
      for (let j = 0; j < effects.length; j++) {
        const effect = effects[j];
        const knob = knobs[effect.knob];
        const changed = applyOp(effect.op, knob, effect.value);
        knobs[effect.knob] = saturate(knob + (changed - knob) * weight);
      }
    }
  }

  private find(id: string): AtmosphereModifier | undefined {
    for (const modifier of this.list) if (modifier.id === id) return modifier;
    return undefined;
  }

  private removeNow(id: string): void {
    const index = this.list.findIndex((m) => m.id === id);
    if (index >= 0) this.list.splice(index, 1);
    this.removing.delete(id);
  }
}

function applyOp(op: ModifierOp, knob: number, value: number): number {
  switch (op) {
    case 'set':
      return value;
    case 'add':
      return knob + value;
    case 'multiply':
      return knob * value;
    case 'min':
      return Math.min(knob, value);
    case 'max':
      return Math.max(knob, value);
  }
}

function saturate(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
