import type { UISurface } from '../lib';

/** What an example builds into. The inspector mirrors the surface's tree as DOM elements. */
export interface ExampleView {
  surface: UISurface;
}

export interface Example {
  /** The part of Mica it checks, as listed on the left. */
  part: string;
  name: string;
  description?: string;
  /** The height of each side in CSS pixels. */
  height?: number;
  build(view: ExampleView): void;
}

export class ExampleRegistry {
  private byPart = new Map<string, Example[]>();

  add(example: Example): void {
    const list = this.byPart.get(example.part) ?? [];
    if (list.some((e) => e.name === example.name))
      throw new Error(`Example "${example.part} / ${example.name}" exists`);
    list.push(example);
    this.byPart.set(example.part, list);
  }

  /** The parts in the order their first example was added. */
  parts(): string[] {
    return [...this.byPart.keys()];
  }

  examples(part: string): Example[] {
    return this.byPart.get(part) ?? [];
  }
}

export const registry = new ExampleRegistry();

export function example(example: Example): void {
  registry.add(example);
}
