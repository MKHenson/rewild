import { IBehaviour } from './IBehaviour';
import { StateMachine } from './StateMachine';

export interface IAsset<T = any> {
  id: string;
  name: string;
  loaded: boolean;
  behaviours: IBehaviour[];
  stateMachine: StateMachine | null;
  data: T;
  load(): Promise<IAsset>;
  add(child: IAsset): IAsset;
  remove(child: IAsset): IAsset;
  mount(): void;
  /** Releases what the asset holds outside the scene, such as GPU resources. */
  dispose?(): void;
}
