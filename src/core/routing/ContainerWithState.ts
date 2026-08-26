import { IContainer } from 'models';
import { IAsset } from 'rewild-routing/lib/IAsset';
import { Container } from 'rewild-routing';
import { Asset3D } from './Asset3D';
import { resolvePlacement } from '../placement/ConformedPlacement';
import { StateMachineData } from './Types';

export class ContainerWithState extends Container {
  resource: IContainer;

  constructor(
    resource: IContainer,
    parentObject3D: IAsset,
    autoDispose = false
  ) {
    super(resource.name, resource.activeOnStartup, parentObject3D, autoDispose);
    this.resource = resource;
  }

  mount() {
    const pod = this.resource.pod;
    // Conformed placements read their Y off the heightfield here rather than
    // from the pod, so a sculpted level needs no fix-up pass. Dynamic bodies
    // conform at spawn only — Rapier owns the transform from then on.
    const terrain = (this.stateMachine?.data as StateMachineData | undefined)
      ?.renderer?.terrainRenderer;

    this.objects.forEach((asset) => {
      const containerAssetData = pod.asset3D.find((a) => a.id === asset.id);
      if (containerAssetData && asset instanceof Asset3D) {
        resolvePlacement(
          containerAssetData,
          terrain ?? null,
          asset.initialPosition,
          asset.initialRotation
        );
      }
    });

    super.mount();
  }
}
