import { IAsset } from './IAsset';

export type BehaviourValue =
  | string
  | number
  | boolean
  | null
  | BehaviourValue[]
  | { [key: string]: BehaviourValue };

/** A behaviour's state as plain data. Live objects are written as stable ids. */
export type BehaviourState = { [key: string]: BehaviourValue };

export interface IBehaviour {
  name: string;
  onAdded?(asset: IAsset): void;
  onRemoved?(asset: IAsset): void;
  onUpdate(delta: f32, total: u32, asset: IAsset): void;
  onMount?(asset: IAsset): void;
  serialize(): BehaviourState;
  /** Reads back what `serialize` wrote. Missing fields keep their values. */
  restore(state: BehaviourState): void;
}
