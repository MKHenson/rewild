import { Color } from 'rewild-common';
import { Mesh } from '../core/Mesh';
import { Transform } from '../core/Transform';
import { ConeGeometryFactory } from '../geometry/ConeGeometryFactory';
import { CylinderGeometryFactory } from '../geometry/CylinderGeometryFactory';
import { Geometry } from '../geometry/Geometry';
import { GizmoPass } from '../materials/GizmoPass';

const SHAFT_RADIUS = 0.02;
const SHAFT_HEIGHT = 0.8;
const HEAD_RADIUS = 0.06;
const HEAD_HEIGHT = 0.2;

export class Gizmo {
  transform: Transform;

  xShaftMesh: Mesh;
  xHeadMesh: Mesh;
  yShaftMesh: Mesh;
  yHeadMesh: Mesh;
  zShaftMesh: Mesh;
  zHeadMesh: Mesh;

  xMaterial: GizmoPass;
  yMaterial: GizmoPass;
  zMaterial: GizmoPass;

  private shaftGeometry: Geometry;
  private headGeometry: Geometry;

  constructor() {
    this.transform = new Transform();
    this.transform.name = 'Gizmo';

    this.shaftGeometry = CylinderGeometryFactory.new(
      SHAFT_RADIUS,
      SHAFT_RADIUS,
      SHAFT_HEIGHT,
      8,
      1
    );
    this.headGeometry = ConeGeometryFactory.new(
      HEAD_RADIUS,
      HEAD_HEIGHT,
      12,
      1
    );

    // X axis (red)
    this.xMaterial = this.createMaterial(1, 0, 0);
    const xArrow = this.createArrow(this.xMaterial);
    this.xShaftMesh = xArrow.shaft;
    this.xHeadMesh = xArrow.head;
    // Rotate to point along +X: rotate -90° around Z
    xArrow.root.rotation.z = -Math.PI / 2;
    this.transform.addChild(xArrow.root);

    // Y axis (green)
    this.yMaterial = this.createMaterial(0, 1, 0);
    const yArrow = this.createArrow(this.yMaterial);
    this.yShaftMesh = yArrow.shaft;
    this.yHeadMesh = yArrow.head;
    // Default cylinder points along +Y, no rotation needed
    this.transform.addChild(yArrow.root);

    // Z axis (blue)
    this.zMaterial = this.createMaterial(0, 0, 1);
    const zArrow = this.createArrow(this.zMaterial);
    this.zShaftMesh = zArrow.shaft;
    this.zHeadMesh = zArrow.head;
    // Rotate to point along +Z: rotate 90° around X
    zArrow.root.rotation.x = Math.PI / 2;
    this.transform.addChild(zArrow.root);
  }

  private createMaterial(r: number, g: number, b: number): GizmoPass {
    const material = new GizmoPass();
    material.gizmoUniforms.color = new Color(r, g, b);
    material.gizmoUniforms.opacity = 1.0;
    return material;
  }

  private createArrow(material: GizmoPass) {
    const root = new Transform();

    const shaftTransform = new Transform();
    shaftTransform.position.y = SHAFT_HEIGHT / 2;
    const shaft = new Mesh(this.shaftGeometry, material, shaftTransform);

    const headTransform = new Transform();
    headTransform.position.y = SHAFT_HEIGHT + HEAD_HEIGHT / 2;
    const head = new Mesh(this.headGeometry, material, headTransform);

    root.addChild(shaft.transform);
    root.addChild(head.transform);

    return { root, shaft, head };
  }

  setAxisOpacity(axis: 'x' | 'y' | 'z', opacity: number): void {
    switch (axis) {
      case 'x':
        this.xMaterial.gizmoUniforms.opacity = opacity;
        break;
      case 'y':
        this.yMaterial.gizmoUniforms.opacity = opacity;
        break;
      case 'z':
        this.zMaterial.gizmoUniforms.opacity = opacity;
        break;
    }
  }

  dispose(): void {
    this.xMaterial.dispose();
    this.yMaterial.dispose();
    this.zMaterial.dispose();
    this.shaftGeometry.dispose();
    this.headGeometry.dispose();
  }
}
