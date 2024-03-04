import { Container, Level, StateMachine } from 'rewild-routing';
import {
  Camera,
  Component,
  DirectionalLight,
  Object3D,
  wasm,
} from 'rewild-wasmtime';
import { geometryManager } from '../renderer/AssetManagers/GeometryManager';
import { Geometry } from '../renderer/geometry/Geometry';
import { pipelineManager } from '../renderer/AssetManagers/PipelineManager';
import { Renderer } from '../renderer/Renderer';
import { Mesh } from '../renderer/Mesh';
import { meshManager } from '../renderer/MeshManager';
import { degToRad } from 'packages/rewild-common';

export class MainMenuStateMachine extends StateMachine {
  private level: Level;
  private camera: Camera;

  constructor() {
    super();
  }

  activate() {
    this.sendSignal(this.level.getPortal('Enter')!, false);

    this.camera.setPosition(0, 5, 10);
    this.camera.lookAt(0, 0, 0);
  }

  deactivate() {
    this.sendSignal(this.level.getPortal('Exit')!, true);
  }

  async init(renderer: Renderer) {
    this.level = new Level(
      'Level',
      new Object3D('Scene', wasm.getScene()),
      false
    );

    this.level.parentObject3D.disposeObject3D = false;

    const container = new Container(
      'Main',
      true,
      this.level.parentObject3D,
      false
    );

    this.level.addChild(container);

    const earth = this.createMesh(
      renderer,
      geometryManager.getAsset('sphere'),
      'earth'
    );
    const stars = this.createMesh(
      renderer,
      geometryManager.getAsset('box'),
      'stars',
      'skybox'
    );

    earth.setPosition(0, -40, -50);
    earth.setScale(30, 30, 30);
    earth.setRotation(degToRad(180), -degToRad(180), 0);
    earth.addComponent(new Component(wasm.createPlanetComponent(30, 0.3)));

    stars.setScale(200, 200, 200);
    stars.setPosition(0, 0, 0);

    container.addAsset(earth);
    container.addAsset(stars);

    this.camera = new Camera();

    // Creates and adds the sun directional light
    const sun = new DirectionalLight('Sun');
    sun.intensity = 6;
    sun.setPosition(10, 10, 0);
    sun.setTarget(0, 0, 0);
    container.addAsset(sun);

    // Adds the level to the state machine
    this.addNode(this.level, true);
  }

  OnLoop(delta: f32, total: u32): void {
    super.OnLoop(delta, total);
  }

  createMesh(
    renderer: Renderer,
    geometry: Geometry,
    pipelineName: string,
    name?: string
  ) {
    const pipeline = pipelineManager.getAsset(pipelineName)!;
    const mesh = new Mesh(geometry, pipeline, renderer, name);
    return meshManager.addMesh(mesh);
  }
}
