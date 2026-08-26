import { IAssetPlacement, IContainer } from 'models';
import { IAsset } from 'rewild-routing/lib/IAsset';
import { Container } from 'rewild-routing';
import { Transform } from 'rewild-renderer';
import { Asset3D } from './Asset3D';
import { resolvePlacement } from '../placement/ConformedPlacement';
import { ConformedPlacementSync } from '../placement/ConformedPlacementSync';
import { RigidBodyBehaviour } from './behaviours/RigidBodyBehaviour';
import { StateMachineData } from './Types';

export class ContainerWithState extends Container {
  resource: IContainer;
  private placementSync: ConformedPlacementSync | null = null;

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
    // from the pod, so a sculpted level needs no fix-up pass.
    const renderer = (this.stateMachine?.data as StateMachineData | undefined)
      ?.renderer;
    const terrain = renderer?.terrainRenderer ?? null;

    this.objects.forEach((asset) => {
      const containerAssetData = pod.asset3D.find((a) => a.id === asset.id);
      if (containerAssetData && asset instanceof Asset3D) {
        resolvePlacement(
          containerAssetData,
          terrain,
          asset.initialPosition,
          asset.initialRotation
        );
      }
    });

    super.mount();

    // Chunks stream in long after a level mounts, so an object far from the
    // spawn point resolves against no heights above and would otherwise sit on
    // its stored fallback forever. The sync re-derives it when its chunk lands.
    if (renderer) {
      this.placementSync = new ConformedPlacementSync(renderer, (visit) =>
        this.visitConformTargets(visit)
      );
      this.placementSync.start();
    }
  }

  unMount(): void {
    this.placementSync?.stop();
    this.placementSync = null;
    super.unMount();
  }

  private visitConformTargets(
    visit: (placement: IAssetPlacement, transform: Transform) => boolean
  ): void {
    const pod = this.resource.pod;

    for (const asset of this.assets) {
      if (!(asset instanceof Asset3D)) continue;

      const body = asset.getBehavioursByName('rigid-body')[0] as
        | RigidBodyBehaviour
        | undefined;
      // Dynamic bodies conform at spawn only: Rapier owns the transform from
      // then on, and re-deriving Y under one would fight the solver.
      if (body && !body.isFixed) continue;

      const placement = pod.asset3D.find((a) => a.id === asset.id);
      if (!placement) continue;

      // A fixed body's collider does not follow its transform on its own, so
      // moving the object without this leaves the collision where it was.
      if (visit(placement, asset.transform)) body?.applyTransform(asset);
    }
  }
}
