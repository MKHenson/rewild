import { Color } from 'rewild-common';
import { Mesh } from '../core/Mesh';
import { Transform } from '../core/Transform';
import { ConeGeometryFactory } from '../geometry/ConeGeometryFactory';
import { CylinderGeometryFactory } from '../geometry/CylinderGeometryFactory';
import { PlaneGeometryFactory } from '../geometry/PlaneGeometryFactory';
import { Geometry } from '../geometry/Geometry';
import { GizmoPass } from '../materials/GizmoPass';
import { RenderLayer } from '../core/RenderLayer';

const SHAFT_RADIUS = 0.02;
const SHAFT_HEIGHT = 0.8;
const HEAD_RADIUS = 0.06;
const HEAD_HEIGHT = 0.2;
const PLANE_SIZE = 0.6;
const PLANE_OFFSET = PLANE_SIZE / 2;
const PLANE_DEFAULT_OPACITY = 0.0;
const DEFAULT_OPACITY = 0.7;
const HIGHLIGHT_OPACITY = 1.0;

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

  xyPlaneMesh: Mesh;
  xzPlaneMesh: Mesh;
  yzPlaneMesh: Mesh;
  xyMaterial: GizmoPass;
  xzMaterial: GizmoPass;
  yzMaterial: GizmoPass;

  private shaftGeometry: Geometry;
  private headGeometry: Geometry;
  private planeGeometry: Geometry;

  constructor() {
    this.transform = new Transform();
    this.transform.name = 'Gizmo';
    this.transform.renderLayer = RenderLayer.Overlay;

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

    this.planeGeometry = PlaneGeometryFactory.new(PLANE_SIZE, PLANE_SIZE);

    // X axis (red)
    this.xMaterial = this.createMaterial(1, 0, 0, DEFAULT_OPACITY);
    const xArrow = this.createArrow(this.xMaterial);
    this.xShaftMesh = xArrow.shaft;
    this.xHeadMesh = xArrow.head;
    // Rotate to point along +X: rotate -90° around Z
    xArrow.root.rotation.z = -Math.PI / 2;
    this.transform.addChild(xArrow.root);

    // Y axis (green)
    this.yMaterial = this.createMaterial(0, 1, 0, DEFAULT_OPACITY);
    const yArrow = this.createArrow(this.yMaterial);
    this.yShaftMesh = yArrow.shaft;
    this.yHeadMesh = yArrow.head;
    // Default cylinder points along +Y, no rotation needed
    this.transform.addChild(yArrow.root);

    // Z axis (blue)
    this.zMaterial = this.createMaterial(0, 0, 1, DEFAULT_OPACITY);
    const zArrow = this.createArrow(this.zMaterial);
    this.zShaftMesh = zArrow.shaft;
    this.zHeadMesh = zArrow.head;
    // Rotate to point along +Z: rotate 90° around X
    zArrow.root.rotation.x = Math.PI / 2;
    this.transform.addChild(zArrow.root);

    // Plane handles (yellow, semi-transparent by default)
    this.xyMaterial = this.createMaterial(1, 1, 0, PLANE_DEFAULT_OPACITY);
    this.xzMaterial = this.createMaterial(1, 1, 0, PLANE_DEFAULT_OPACITY);
    this.yzMaterial = this.createMaterial(1, 1, 0, PLANE_DEFAULT_OPACITY);

    // XY plane
    const xyTransform = new Transform();
    xyTransform.position.x = PLANE_OFFSET;
    xyTransform.position.y = PLANE_OFFSET;
    this.xyPlaneMesh = new Mesh(
      this.planeGeometry,
      this.xyMaterial,
      xyTransform
    );
    this.transform.addChild(this.xyPlaneMesh.transform);

    // XZ plane (rotate the default XY plane -90° around X)
    const xzTransform = new Transform();
    xzTransform.position.x = PLANE_OFFSET;
    xzTransform.position.z = PLANE_OFFSET;
    xzTransform.rotation.x = -Math.PI / 2;
    this.xzPlaneMesh = new Mesh(
      this.planeGeometry,
      this.xzMaterial,
      xzTransform
    );
    this.transform.addChild(this.xzPlaneMesh.transform);

    // YZ plane (rotate the default XY plane 90° around Y)
    const yzTransform = new Transform();
    yzTransform.position.y = PLANE_OFFSET;
    yzTransform.position.z = PLANE_OFFSET;
    yzTransform.rotation.y = Math.PI / 2;
    this.yzPlaneMesh = new Mesh(
      this.planeGeometry,
      this.yzMaterial,
      yzTransform
    );
    this.transform.addChild(this.yzPlaneMesh.transform);
  }

  private createMaterial(
    r: number,
    g: number,
    b: number,
    opacity: number = 1.0
  ): GizmoPass {
    const material = new GizmoPass();
    material.gizmoUniforms.color = new Color(r, g, b);
    material.gizmoUniforms.opacity = opacity;
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

  setPlaneOpacity(plane: 'xy' | 'xz' | 'yz', opacity: number): void {
    switch (plane) {
      case 'xy':
        this.xyMaterial.gizmoUniforms.opacity = opacity;
        break;
      case 'xz':
        this.xzMaterial.gizmoUniforms.opacity = opacity;
        break;
      case 'yz':
        this.yzMaterial.gizmoUniforms.opacity = opacity;
        break;
    }
  }

  /** Update hover highlight based on the hovered mesh (or null for no hover). */
  updateHover(hoveredMesh: Mesh | null): void {
    // Axes: each axis has shaft + head meshes sharing one material
    const axes: { meshes: Mesh[]; axis: 'x' | 'y' | 'z' }[] = [
      { meshes: [this.xShaftMesh, this.xHeadMesh], axis: 'x' },
      { meshes: [this.yShaftMesh, this.yHeadMesh], axis: 'y' },
      { meshes: [this.zShaftMesh, this.zHeadMesh], axis: 'z' },
    ];

    for (const { meshes, axis } of axes) {
      const hovered = hoveredMesh !== null && meshes.includes(hoveredMesh);
      this.setAxisOpacity(axis, hovered ? HIGHLIGHT_OPACITY : DEFAULT_OPACITY);
    }

    // Planes
    const planes: { mesh: Mesh; plane: 'xy' | 'xz' | 'yz' }[] = [
      { mesh: this.xyPlaneMesh, plane: 'xy' },
      { mesh: this.xzPlaneMesh, plane: 'xz' },
      { mesh: this.yzPlaneMesh, plane: 'yz' },
    ];

    for (const { mesh, plane } of planes) {
      this.setPlaneOpacity(
        plane,
        hoveredMesh === mesh ? HIGHLIGHT_OPACITY : PLANE_DEFAULT_OPACITY
      );
    }
  }

  dispose(): void {
    this.xMaterial.dispose();
    this.yMaterial.dispose();
    this.zMaterial.dispose();
    this.xyMaterial.dispose();
    this.xzMaterial.dispose();
    this.yzMaterial.dispose();
    this.shaftGeometry.dispose();
    this.headGeometry.dispose();
    this.planeGeometry.dispose();
  }
}
