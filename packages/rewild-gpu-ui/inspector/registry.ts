import type { UISurface, UISurfaceOptions } from '../lib';

/** What an example builds into. The inspector mirrors the surface's tree as DOM elements. */
export interface ExampleView {
  surface: UISurface;
  /** The Mica canvas. Its own DOM listeners stand in for the game's. */
  canvas: HTMLCanvasElement;
  /** Adds a line to the event log of an example with `log` set. */
  log(line: string): void;
  /** Adds another surface on the same canvas, such as a modal. The DOM side does not mirror it. */
  createSurface(options: UISurfaceOptions): UISurface;
}

export interface Example {
  /** The part of Mica it checks, as listed on the left. */
  part: string;
  name: string;
  description?: string;
  /** The height of each side in CSS pixels. */
  height?: number;
  /** Shows an event log in place of the DOM side. */
  log?: boolean;
  /**
   * Builds the tree. An example that animates returns a function, which the
   * inspector calls with the time in seconds before each frame it draws.
   */
  build(view: ExampleView): void | ((seconds: number) => void);
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
