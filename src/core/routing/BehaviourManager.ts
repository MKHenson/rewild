import { IBehaviour } from 'rewild-routing';
import { Spin } from './behaviours/Spin';

export type BehaviourFactory = () => IBehaviour;

/** Maps a template's behaviour names to factories, so each asset gets its own. */
export class BehaviourManager {
  private readonly factories = new Map<string, BehaviourFactory>();

  constructor() {
    this.register('spin', () => new Spin());
  }

  register(name: string, factory: BehaviourFactory): void {
    this.factories.set(name, factory);
  }

  unregister(name: string): void {
    this.factories.delete(name);
  }

  has(name: string): boolean {
    return this.factories.has(name);
  }

  /** A new instance of the named behaviour, or null if none is registered. */
  create(name: string): IBehaviour | null {
    return this.factories.get(name)?.() ?? null;
  }

  /** New instances of every named behaviour. Throws on an unknown name. */
  createAll(names: string[]): IBehaviour[] {
    return names.map((name) => {
      const behaviour = this.create(name);
      if (!behaviour) throw new Error(`Could not find behavior ${name}`);
      return behaviour;
    });
  }
}

export const behaviourManager = new BehaviourManager();
