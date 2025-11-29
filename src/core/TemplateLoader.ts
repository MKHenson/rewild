import { IResource, ITemplateItems } from 'models';
import { IAsset } from 'rewild-routing/lib/IAsset';
import { Mesh, Renderer } from 'rewild-renderer';
import { Asset3D } from './routing/Asset3D';
import { behaviourManager } from './routing/BehaviourManager';
import { PlayerStart } from './routing/PlayerStart';
import { GameManager } from './GameManager';
import { RigidBodyBehaviour } from './routing/behaviours/RigidBodyBehaviour';

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
    } else if (template?.type === 'asset') {
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
        (toReturn as Asset3D).addBehavior(new RigidBodyBehaviour(rb));

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
    return toReturn;
  }
}
