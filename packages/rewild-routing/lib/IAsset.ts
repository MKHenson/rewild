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
}
