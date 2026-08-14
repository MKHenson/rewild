import { IResource, ITemplateItems } from 'models';
import { IAsset } from 'rewild-routing/lib/IAsset';
import {
  Mesh,
  PointLight,
  Renderer,
  instantiateGltfModel,
} from 'rewild-renderer';
import { Asset3D } from './routing/Asset3D';
import { behaviourManager } from './routing/BehaviourManager';
import { PlayerStart } from './routing/PlayerStart';
import { GameManager } from './GameManager';
import { RigidBodyBehaviour } from './routing/behaviours/RigidBodyBehaviour';
import { LightAsset } from './routing/LightAsset';

export class TemplateLoader {
  templateLibrary: ITemplateItems;

  async load() {
    this.templateLibrary = (await fetch(
      '/templates/template-library.json'
    ).then((res) => res.json())) as ITemplateItems;
  }

  async createResource(
    resource: IResource,
    renderer: Renderer,
    gameManager?: GameManager
  ) {
    const template = resource.templateId
      ? this.templateLibrary.assets.find(
          (asset) => asset.name === resource.templateId
        )
      : null;

    let toReturn: IAsset<IResource>;

    if (resource?.type === 'player-start') {
      toReturn = new PlayerStart();
    } else if (template?.type === 'light') {
      toReturn = new LightAsset(new PointLight());
      if (toReturn instanceof LightAsset) {
        toReturn.initializeValues(resource || template.resource);

        // If no game manager then its in the editor
        if (!gameManager) toReturn.addVisualHelper(renderer);
      }
    } else if (template?.type === 'asset') {
      const { geometryId, materialId } = template.resource;

      const isModel =
        !!geometryId && renderer.geometryManager.models.has(geometryId);

      // A model carries its own materials, so `materialId` is optional for one
      // and an override when given. Anything else is a bare geometry with
      // nothing to shade it.
      if (!geometryId || (!materialId && !isModel))
        throw new Error(
          `Template ${template.name} is missing geometry or material ID.`
        );

      const override = materialId
        ? renderer.materialManager.get(materialId)
        : null;

      // An imported model brings its own hierarchy; a built-in geometry is a
      // single mesh.
      const transform = isModel
        ? instantiateGltfModel(
            renderer.geometryManager.getModel(geometryId),
            (primitive) =>
              override ?? renderer.materialManager.get(primitive.materialKey)
          )
        : new Mesh(renderer.geometryManager.get(geometryId), override!)
            .transform;

      toReturn = new Asset3D(transform);

      if (gameManager && template.resource.physics) {
        const R = gameManager.RAPIER;
        const phys = template.resource.physics;

        // Determine body type
        let rbDesc: import('@dimforge/rapier3d-compat').RigidBodyDesc;
        switch (phys.bodyType) {
          case 'fixed':
            rbDesc = R.RigidBodyDesc.fixed();
            break;
          case 'kinematic':
            rbDesc = R.RigidBodyDesc.kinematicPositionBased();
            break;
          case 'dynamic':
          default:
            rbDesc = R.RigidBodyDesc.dynamic();
            break;
        }

        // Create the rigid body
        const rb = gameManager.physicsWorld.createRigidBody(rbDesc);
        (toReturn as Asset3D).addBehavior(
          new RigidBodyBehaviour(rb, gameManager.renderer.sceneBVH)
        );

        rb.setEnabled(false); // Start disabled until mounted

        // Create collider based on shape definition
        if (phys.shape) {
          let colliderDesc:
            | import('@dimforge/rapier3d-compat').ColliderDesc
            | null = null;
          if (phys.shape.type === 'box') {
            const [w, h, d] = phys.shape.size;
            // Rapier cuboid takes half-extents
            colliderDesc = R.ColliderDesc.cuboid(w / 2, h / 2, d / 2);
          } else if (phys.shape.type === 'sphere') {
            colliderDesc = R.ColliderDesc.ball(phys.shape.radius);
          }

          if (colliderDesc) {
            const collider = gameManager.physicsWorld.createCollider(
              colliderDesc,
              rb
            );

            if (typeof phys.mass === 'number') collider.setMass(phys.mass);
            // Optional friction/restitution overrides
            if (typeof phys.friction === 'number')
              collider.setFriction(phys.friction);
            if (typeof phys.restitution === 'number')
              collider.setRestitution(phys.restitution);
          }
        }
      }

      if (template.behaviors) {
        for (const behaviorName of template.behaviors) {
          const behavior = behaviourManager.findByName(behaviorName);
          if (!behavior)
            throw new Error(`Could not find behavior ${behaviorName}`);
          (toReturn as Asset3D).addBehavior(behavior);
        }
      }
    } else
      throw new Error(`Could not find template for actor ${resource.name}`);

    toReturn.name = resource.name;
    toReturn.id = resource.id;
    toReturn.data = resource;
    if (toReturn instanceof Asset3D) toReturn.transform.name = resource.name;

    return toReturn;
  }
}
