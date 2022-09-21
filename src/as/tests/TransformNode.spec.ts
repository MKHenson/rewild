import { TransformNode, createTransformNode, getDataProperties } from "../core/TransformNode";

function getVisible(node: TransformNode): boolean {
  return node.visible;
}
function setVisible(node: TransformNode, val: boolean): void {
  node.visible = val;
}

function getRenderOrder(node: TransformNode): i32 {
  return node.renderOrder;
}
function setRenderOrder(node: TransformNode, val: i32): void {
  node.renderOrder = val;
}

function getFrustumCulled(node: TransformNode): boolean {
  return node.frustumCulled;
}
function setFrustumCulled(node: TransformNode, val: boolean): void {
  node.frustumCulled = val;
}

function getMatrixAutoUpdate(node: TransformNode): boolean {
  return node.matrixAutoUpdate;
}
function setMatrixAutoUpdate(node: TransformNode, val: boolean): void {
  node.matrixAutoUpdate = val;
}

function getCastShadow(node: TransformNode): boolean {
  return node.castShadow;
}
function setCastShadow(node: TransformNode, val: boolean): void {
  node.castShadow = val;
}

function getReceiveShadow(node: TransformNode): boolean {
  return node.receiveShadow;
}
function setReceiveShadow(node: TransformNode, val: boolean): void {
  node.receiveShadow = val;
}

function getId(node: TransformNode): i32 {
  return node.id;
}
function setId(node: TransformNode, val: i32): void {
  node.id;
}

export {
  setReceiveShadow,
  getRenderOrder,
  getVisible,
  setMatrixAutoUpdate,
  setRenderOrder,
  setVisible,
  getId,
  setId,
  getCastShadow,
  setCastShadow,
  getFrustumCulled,
  setFrustumCulled,
  getMatrixAutoUpdate,
  getReceiveShadow,
  createTransformNode,
  getDataProperties,
};
