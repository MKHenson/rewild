import { IContainer } from 'models';
import { IAsset } from 'rewild-routing/lib/IAsset';
import { Container } from 'rewild-routing';
import { Asset3D } from './Asset3D';

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
    super.mount();
    const pod = this.resource.pod;

    this.objects.forEach((asset) => {
      const containerAssetData = pod.asset3D.find((a) => a.id === asset.id);
      if (containerAssetData && asset instanceof Asset3D) {
        asset.transform.position.fromArray(containerAssetData.position);
      }
    });
  }
}
