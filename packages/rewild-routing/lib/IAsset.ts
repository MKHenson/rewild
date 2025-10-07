import { IBehaviour } from './IBehaviour';
import { StateMachine } from './StateMachine';

export interface IAsset {
  id: string;
  name: string;
  loaded: boolean;
  behaviours: IBehaviour[];
  stateMachine: StateMachine | null;
  load(): Promise<IAsset>;
  add(child: IAsset): IAsset;
  remove(child: IAsset): IAsset;
  mount(): void;
}
