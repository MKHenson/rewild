import { Camera } from "../../cameras/Camera";
import { Object } from "../../core/Object";
import { WebGLRenderQueue } from "./WebGLRenderQueue";
import { Material } from "../../materials/Material";
// import { Frustum } from "../../math/Frustum";
import { Matrix4 } from "../../math/Matrix4";
// import { Vector3 } from "../../math/Vector3";
// import { Group } from "../../objects/Group";
// import { Mesh } from "../../objects/Mesh";
// import { SkinnedMesh } from "../../objects/SkinnedMesh";
import { Vao } from "../../objects/Vao";
import { ShaderRef } from "./ShaderRef";
import { WebGLPrograms } from "./WebGLPrograms";
import { WebGLProperties } from "./WebGLProperties";
import { RenderItem, SortFn, WebGLRenderList, WebGLRenderLists } from "./WebGLRenderLists";
import { Scene } from "../../scenes/Scene";
// import { WebGLAttributes } from "./WebGLAttributes";
// import { Sprite } from "../../objects/Sprite";
import { Vector4 } from "../../math/Vector4";
import { WebGLRenderState, WebGLRenderStates } from "./WebGLRenderStates";
// import { WebGLState } from "./WebGLState";
import { IBridge } from "../../../common/IBridge";
import { BridgeManager } from "../../core/BridgeManager";
import { WebGLBindingStates } from "./WebGLBindingStates";
import { WebGLAttributes } from "./WebGLAttributes";
const renderQueue = new WebGLRenderQueue();
// const _vector3: Vector3 = new Vector3();

export class Renderer {
  private _isContextLost: boolean;
  private _projScreenMatrix: Matrix4;
  // private _frustum: Frustum;
  private properties: WebGLProperties | null;
  private programs: WebGLPrograms | null;
  private bindingStates: WebGLBindingStates | null;
  private attributes: WebGLAttributes | null;
  private renderLists: WebGLRenderLists | null;
  private renderListStack: WebGLRenderList[];
  private currentRenderList: WebGLRenderList | null;
  private renderStates: WebGLRenderStates | null;
  private renderStateStack: WebGLRenderState[];
  private currentRenderState: WebGLRenderState | null;
  private _currentCamera: Camera | null;
  private _currentMaterialId: i32;
  // private state: WebGLState | null;
  // private objects: WebGLObjects;
  private sortObjects: boolean;
  private physicallyCorrectLights: boolean;

  private _opaqueSort: SortFn | null;
  private _transparentSort: SortFn | null;
  // private _currentViewport: Vector4;

  constructor(bridge: IBridge) {
    BridgeManager.init(bridge);

    this._isContextLost = false;
    this._projScreenMatrix = new Matrix4();
    // this._frustum = new Frustum();
    // this.state = null;
    this.properties = null;
    this.programs = null;
    this.bindingStates = null;
    this.attributes = null;
    this.renderLists = null;
    this.renderStates = null;
    this._currentCamera = null;
    this._currentMaterialId = -1;
    // this.objects = null;
    this.renderListStack = [];
    this.currentRenderList = null;
    this.currentRenderState = null;
    this.sortObjects = true;
    this.physicallyCorrectLights = true;
    this._opaqueSort = null;
    this._transparentSort = null;
    // this._currentViewport = new Vector4();
    this.renderStateStack = [];
  }

  init(viewport: Vector4): void {
    // this.state = new WebGLState(renderQueue, viewport);
    this.properties = new WebGLProperties();
    this.programs = new WebGLPrograms();
    this.attributes = new WebGLAttributes();
    this.bindingStates = new WebGLBindingStates(this.attributes!);
    this.renderLists = new WebGLRenderLists(this.properties!);
    this.renderStates = new WebGLRenderStates();
    // this.objects = new WebGLObjects(_gl, geometries, attributes, info);
  }

  setProgram(material: Material): ShaderRef | null {
    const materialProperties = this.properties!.get(material);

    let needsProgramChange = false;
    if (materialProperties.version !== material.version) {
      needsProgramChange = true;
    }

    if (needsProgramChange) {
      materialProperties.program = this.programs!.getProgram(material);
    }

    return materialProperties.program;
  }

  renderVao(mesh: Vao, camera: Camera): void {
    const materials = mesh.materials;
    const shader = materials && materials.length > 0 ? this.setProgram(materials[0]) : null;
    const vao = mesh.vao;

    if (vao !== -1 && shader) {
      mesh.modelViewMatrix.multiplyMatrices(camera.matrixWorldInverse, mesh.matrixWorld);
      mesh.normalMatrix.getNormalMatrix(mesh.modelViewMatrix);

      mesh.modelViewMatrix.multiplyMatrices(camera.matrixWorldInverse, mesh.matrixWorld);

      renderQueue.activateShader(shader);
      renderQueue.unifMat4(shader.uProjMatrix, camera.projectionMatrix.elements);
      renderQueue.unifMat4(shader.uModelViewMatrix, mesh.modelViewMatrix.elements);
      if (shader.mainTexture !== -1) renderQueue.unifTexture2D(shader.uMainTexture, shader.mainTexture);
      renderQueue.renderVao(mesh);
    }
  }

  // private renderScene(currentRenderList: WebGLRenderList, scene: Scene, camera: Camera, viewport: Vector4 | null ) {
  //   const opaqueObjects = currentRenderList.opaque;
  //   const transmissiveObjects = currentRenderList.transmissive;
  //   const transparentObjects = currentRenderList.transparent;

  //   this.currentRenderState!.setupLightsView(camera);

  //   if (transmissiveObjects.length > 0) renderTransmissionPass(opaqueObjects, scene, camera);

  //   if (viewport) this.state!.viewport(this._currentViewport.copy(viewport));

  //   if (opaqueObjects.length > 0) renderObjects(opaqueObjects, scene, camera);
  //   if (transmissiveObjects.length > 0) renderObjects(transmissiveObjects, scene, camera);
  //   if (transparentObjects.length > 0) renderObjects(transparentObjects, scene, camera);
  // }

  // renderTransmissionPass( opaqueObjects: RenderItem[], scene: Scene, camera: Camera ) {

  // 	if ( _transmissionRenderTarget === null ) {

  // 		const needsAntialias = _antialias === true && capabilities.isWebGL2 === true;
  // 		const renderTargetType = needsAntialias ? WebGLMultisampleRenderTarget : WebGLRenderTarget;

  // 		_transmissionRenderTarget = new renderTargetType( 1024, 1024, {
  // 			generateMipmaps: true,
  // 			type: utils.convert( HalfFloatType ) !== null ? HalfFloatType : UnsignedByteType,
  // 			minFilter: LinearMipmapLinearFilter,
  // 			magFilter: NearestFilter,
  // 			wrapS: ClampToEdgeWrapping,
  // 			wrapT: ClampToEdgeWrapping
  // 		} );

  // 	}

  // 	const currentRenderTarget = _this.getRenderTarget();
  // 	_this.setRenderTarget( _transmissionRenderTarget );
  // 	_this.clear();

  // 	// Turn off the features which can affect the frag color for opaque objects pass.
  // 	// Otherwise they are applied twice in opaque objects pass and transmission objects pass.
  // 	const currentToneMapping = _this.toneMapping;
  // 	_this.toneMapping = NoToneMapping;

  // 	renderObjects( opaqueObjects, scene, camera );

  // 	_this.toneMapping = currentToneMapping;

  // 	textures.updateMultisampleRenderTarget( _transmissionRenderTarget );
  // 	textures.updateRenderTargetMipmap( _transmissionRenderTarget );

  // 	_this.setRenderTarget( currentRenderTarget );

  // }

  // renderObjects( renderList, scene, camera ) {

  // 	const overrideMaterial = scene.isScene === true ? scene.overrideMaterial : null;

  // 	for ( let i = 0, l = renderList.length; i < l; i ++ ) {

  // 		const renderItem = renderList[ i ];

  // 		const object = renderItem.object;
  // 		const geometry = renderItem.geometry;
  // 		const material = overrideMaterial === null ? renderItem.material : overrideMaterial;
  // 		const group = renderItem.group;

  // 		if ( object.layers.test( camera.layers ) ) {

  // 			this.renderObject( object, scene, camera, geometry, material, group );

  // 		}

  // 	}

  // }

  // renderObject( object, scene, camera, geometry, material, group ) {

  // 	object.onBeforeRender( _this, scene, camera, geometry, material, group );

  // 	object.modelViewMatrix.multiplyMatrices( camera.matrixWorldInverse, object.matrixWorld );
  // 	object.normalMatrix.getNormalMatrix( object.modelViewMatrix );

  // 	material.onBeforeRender( _this, scene, camera, geometry, object, group );

  // 	if ( object.isImmediateRenderObject ) {

  // 		const program = setProgram( camera, scene, material, object );

  // 		state.setMaterial( material );

  // 		bindingStates.reset();

  // 		renderObjectImmediate( object, program );

  // 	} else {

  // 		if ( material.transparent === true && material.side === DoubleSide ) {

  // 			material.side = BackSide;
  // 			material.needsUpdate = true;
  // 			_this.renderBufferDirect( camera, scene, geometry, material, object, group );

  // 			material.side = FrontSide;
  // 			material.needsUpdate = true;
  // 			_this.renderBufferDirect( camera, scene, geometry, material, object, group );

  // 			material.side = DoubleSide;

  // 		} else {

  // 			this.renderBufferDirect( camera, scene, geometry, material, object, group );

  // 		}

  // 	}

  // 	object.onAfterRender( this, scene, camera, geometry, material, group );

  // }

  // projectObject(object: Object, camera: Camera, groupOrder: i32, sortObjects: boolean): void {
  //   if (object.visible === false) return;

  //   const _frustum = this._frustum;
  //   const currentRenderList = this.currentRenderList!;
  //   const _projScreenMatrix = this._projScreenMatrix;
  //   const visible = object.layers.test(camera.layers);
  //   const objects = this.objects;

  //   if (visible) {
  //     if (object instanceof Group) {
  //       groupOrder = object.renderOrder;
  //     }
  //     // else if (object.isLOD) {
  //     //   if (object.autoUpdate === true) object.update(camera);
  //     // } else if (object.isLight) {
  //     //   currentRenderState.pushLight(object);

  //     //   if (object.castShadow) {
  //     //     currentRenderState.pushShadow(object);
  //     //   }
  //     // }
  //     else if (object instanceof Sprite) {
  //       if (!object.frustumCulled || _frustum.intersectsSprite(object as Sprite)) {
  //         if (sortObjects) {
  //           _vector3.setFromMatrixPosition(object.matrixWorld).applyMatrix4(_projScreenMatrix);
  //         }

  //         const geometry = objects.update(object);
  //         const material = object.material;

  //         if (material.visible) {
  //           currentRenderList.push(object, geometry, material, groupOrder, _vector3.z, null);
  //         }
  //       }
  //     }
  //     // else if (object.isImmediateRenderObject) {
  //     //   if (sortObjects) {
  //     //     _vector3.setFromMatrixPosition(object.matrixWorld).applyMatrix4(_projScreenMatrix);
  //     //   }

  //     //   currentRenderList.push(object, null, object.material, groupOrder, _vector3.z, null);
  //     // }
  //     // TODO: (object.isMesh || object.isLine || object.isPoints) {
  //     else if (object instanceof Mesh) {
  //       if (object instanceof SkinnedMesh) {
  //         //   // update skeleton only once in a frame
  //         //   const skinned = object as SkinnedMesh;
  //         //   if (skinned.skeleton.frame !== info.render.frame) {
  //         //     skinned.skeleton.update();
  //         //     skinned.skeleton.frame = info.render.frame;
  //         //   }
  //       }

  //       if (!object.frustumCulled || this._frustum.intersectsObject(object)) {
  //         if (sortObjects) {
  //           _vector3.setFromMatrixPosition(object.matrixWorld).applyMatrix4(_projScreenMatrix);
  //         }

  //         const geometry = objects.update(object);
  //         const materials = object.materials;

  //         if (materials.length > 1) {
  //           const groups = geometry.groups;

  //           for (let i = 0, l = groups.length; i < l; i++) {
  //             const group = groups[i];
  //             const groupMaterial = materials[group.materialIndex];

  //             if (groupMaterial && groupMaterial.visible) {
  //               currentRenderList.push(object, geometry, groupMaterial, groupOrder, _vector3.z, group);
  //             }
  //           }
  //         } else if (materials.length > 0 && materials[0].visible) {
  //           currentRenderList.push(object, geometry, materials[0], groupOrder, _vector3.z, null);
  //         }
  //       }
  //     }
  //   }

  //   const children = object.children;

  //   for (let i = 0, l = children.length; i < l; i++) {
  //     this.projectObject(children[i], camera, groupOrder, sortObjects);
  //   }
  // }

  projectObject(object: Object, camera: Camera): void {
    // if (!object.frustumCulled || _frustum.intersectsObject(object)) {
    if (object.visible === false) return;
    if (object instanceof Vao) {
      this.renderVao(object as Vao, camera);
    }
    // }

    for (let i = 0, l = object.children.length; i < l; i++) this.projectObject(object.children[i], camera);
  }

  render(scene: Scene, camera: Camera): void {
    if (this._isContextLost === true) return;

    // update scene graph
    if (scene.autoUpdate === true) scene.updateMatrixWorld();

    // update camera matrices and frustum
    if (camera.parent === null) camera.updateMatrixWorld();

    scene.onBeforeRender();

    this.currentRenderState = this.renderStates!.get(scene, this.renderStateStack.length);
    this.currentRenderState!.init();

    this.renderStateStack.push(this.currentRenderState!);

    const _projScreenMatrix = this._projScreenMatrix;

    // const _frustum = this._frustum;

    _projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    // _frustum.setFromProjectionMatrix(_projScreenMatrix);

    const renderListStack = this.renderListStack;

    this.currentRenderList = this.renderLists!.get(scene, renderListStack.length);
    const currentRenderList = this.currentRenderList!;

    currentRenderList.init();
    renderListStack.push(this.currentRenderList!);

    renderQueue.begin();
    renderQueue.clear();

    // this.projectObject(scene, camera, 0, this.sortObjects);
    this.projectObject(scene, camera);

    this.currentRenderList!.finish();
    currentRenderList.finish();

    if (this.sortObjects === true) {
      currentRenderList.sort(this._opaqueSort, this._transparentSort);
    }

    // if ( _clippingEnabled === true ) clipping.beginShadows();

    // const shadowsArray = currentRenderState.state.shadowsArray;

    // shadowMap.render( shadowsArray, scene, camera );

    // if ( _clippingEnabled === true ) clipping.endShadows();

    // //

    // if ( this.info.autoReset === true ) this.info.reset();

    // //

    // background.render( currentRenderList, scene );

    // render scene

    // this.currentRenderState.setupLights(this.physicallyCorrectLights);

    // if ( camera instanceof ArrayCamera ) {

    // 	const cameras = camera.cameras;

    // 	for ( let i = 0, l = cameras.length; i < l; i ++ ) {

    // 		const camera2 = cameras[ i ];

    // 		renderScene( currentRenderList, scene, camera2, camera2.viewport );

    // 	}

    // }
    // else {

    // this.renderScene(currentRenderList, scene, camera, null);

    // }

    // //

    // if ( _currentRenderTarget !== null ) {

    // 	// resolve multisample renderbuffers to a single-sample texture if necessary

    // 	textures.updateMultisampleRenderTarget( _currentRenderTarget );

    // 	// Generate mipmap if we're using any kind of mipmap filtering

    // 	textures.updateRenderTargetMipmap( _currentRenderTarget );

    // }

    // //

    // if ( scene.isScene === true ) scene.onAfterRender( _this, scene, camera );

    // // Ensure depth buffer writing is enabled so it can be cleared on next render

    // state.buffers.depth.setTest( true );
    // state.buffers.depth.setMask( true );
    // state.buffers.color.setMask( true );

    // state.setPolygonOffset( false );

    // _gl.finish();

    this.bindingStates!.resetDefaultState();
    this._currentMaterialId = -1;
    this._currentCamera = null;

    this.renderStateStack.pop();

    if (this.renderStateStack.length > 0) {
      this.currentRenderState = this.renderStateStack[this.renderStateStack.length - 1];
    } else {
      this.currentRenderState = null;
    }

    renderListStack.pop();

    if (renderListStack.length > 0) {
      this.currentRenderList = renderListStack[renderListStack.length - 1];
    } else {
      this.currentRenderList = null;
    }

    renderQueue.push();
  }
}
