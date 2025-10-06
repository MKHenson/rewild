import { IResource, ITemplateItems } from 'models';
import { IAsset } from 'rewild-routing/lib/IAsset';
import { Mesh, Renderer } from 'rewild-renderer';
import { Asset3D } from './routing/Asset3D';
import { behaviourManager } from './routing/BehaviourManager';

export class TemplateLoader {
  templateLibrary: ITemplateItems;

  async load() {
    this.templateLibrary = (await fetch(
      '/templates/template-library.json'
    ).then((res) => res.json())) as ITemplateItems;
  }

  async createResource(actor: IResource, renderer: Renderer) {
    const template = actor.templateId
      ? this.templateLibrary.assets.find(
          (asset) => asset.name === actor.templateId
        )
      : null;

    let toReturn: IAsset;

    if (template?.type === 'asset') {
      if (template.resource.geometryId && template.resource.materialId) {
        const mesh = new Mesh(
          renderer.geometryManager.get(template.resource.geometryId),
          renderer.materialManager.get(template.resource.materialId)
        );
        toReturn = new Asset3D(mesh.transform);
      } else
        throw new Error(
          `Template ${template.name} is missing geometry or material ID.`
        );

      if (template.behaviors) {
        for (const behaviorName of template.behaviors) {
          const behavior = behaviourManager.findByName(behaviorName);
          if (!behavior)
            throw new Error(`Could not find behavior ${behaviorName}`);
          (toReturn as Asset3D).addBehavior(behavior);
        }
      }
    } else throw new Error(`Could not find template for actor ${actor.name}`);

    toReturn.name = actor.name;
    toReturn.id = actor.id;
    return toReturn;
  }
}
