import { BufferGeometry } from "../../core/BufferGeometry";
import { Object } from "../../core/Object";
import { Material } from "../../materials/Material";
import { Group } from "../../objects/Group";
import { Scene } from "../../scenes/Scene";
import { ShaderRef } from "./ShaderRef";
import { WebGLProperties } from "./WebGLProperties";

export type SortFn = (a: RenderItem, b: RenderItem) => i32;

export class RenderItem {
  public id: i32;
  public object: Object | null;
  public geometry: BufferGeometry | null;
  public material: Material | null;
  public program: ShaderRef | null;
  public groupOrder: i32;
  public renderOrder: i32;
  public z: i32;
  public group: Group | null;
}

export class WebGLRenderList {
  renderItems: RenderItem[];
  renderItemsIndex: i32;
  opaque: RenderItem[];
  transmissive: RenderItem[];
  transparent: RenderItem[];
  defaultProgram: ShaderRef | null;
  properties: WebGLProperties;

  constructor(properties: WebGLProperties) {
    this.properties = properties;
    this.renderItems = [];
    this.renderItemsIndex = 0;
    this.opaque = [];
    this.transmissive = [];
    this.transparent = [];
    this.defaultProgram = null;
  }

  init(): void {
    this.renderItemsIndex = 0;
    this.opaque = [];
    this.transmissive = [];
    this.transparent = [];
  }

  getNextRenderItem(
    object: Object,
    geometry: BufferGeometry,
    material: Material,
    groupOrder: i32,
    z: i32,
    group: Group | null
  ): RenderItem {
    const renderItems = this.renderItems;
    const renderItemsIndex = this.renderItemsIndex;

    let renderItem = renderItems[renderItemsIndex];
    const materialProperties = this.properties.get(material);

    if (renderItem === undefined) {
      renderItem = {
        id: object.id,
        object: object,
        geometry: geometry,
        material: material,
        program: materialProperties.program || this.defaultProgram,
        groupOrder: groupOrder,
        renderOrder: object.renderOrder,
        z: z,
        group: group,
      };

      renderItems[renderItemsIndex] = renderItem;
    } else {
      renderItem.id = object.id;
      renderItem.object = object;
      renderItem.geometry = geometry;
      renderItem.material = material;
      renderItem.program = materialProperties.program || this.defaultProgram;
      renderItem.groupOrder = groupOrder;
      renderItem.renderOrder = object.renderOrder;
      renderItem.z = z;
      renderItem.group = group;
    }

    this.renderItemsIndex++;

    return renderItem;
  }

  push(
    object: Object,
    geometry: BufferGeometry,
    material: Material,
    groupOrder: i32,
    z: i32,
    group: Group | null
  ): void {
    const renderItem = this.getNextRenderItem(object, geometry, material, groupOrder, z, group);

    if (material.transmission > 0.0) {
      this.transmissive.push(renderItem);
    } else if (material.transparent === true) {
      this.transparent.push(renderItem);
    } else {
      this.opaque.push(renderItem);
    }
  }

  unshift(
    object: Object,
    geometry: BufferGeometry,
    material: Material,
    groupOrder: i32,
    z: i32,
    group: Group | null
  ): void {
    const renderItem = this.getNextRenderItem(object, geometry, material, groupOrder, z, group);

    if (material.transmission > 0.0) {
      this.transmissive.unshift(renderItem);
    } else if (material.transparent === true) {
      this.transparent.unshift(renderItem);
    } else {
      this.opaque.unshift(renderItem);
    }
  }

  sort(customOpaqueSort: SortFn | null, customTransparentSort: SortFn | null): void {
    if (this.opaque.length > 1) this.opaque.sort(customOpaqueSort! || painterSortStable);
    if (this.transmissive.length > 1) this.transmissive.sort(customTransparentSort! || reversePainterSortStable);
    if (this.transparent.length > 1) this.transparent.sort(customTransparentSort! || reversePainterSortStable);
  }

  finish(): void {
    // Clear references from inactive renderItems in the list
    const renderItemsIndex = this.renderItemsIndex;
    const renderItems = this.renderItems;

    for (let i = renderItemsIndex, il = renderItems.length; i < il; i++) {
      const renderItem = renderItems[i];

      if (renderItem.id === -1) break;

      renderItem.id = -1;
      renderItem.object = null;
      renderItem.geometry = null;
      renderItem.material = null;
      renderItem.program = null;
      renderItem.group = null;
    }
  }
}

export class WebGLRenderLists {
  lists: Map<Scene, WebGLRenderList[]>;
  properties: WebGLProperties | null;

  constructor(properties: WebGLProperties) {
    this.properties = properties;
    this.lists = new Map();
  }

  get(scene: Scene, renderCallDepth: i32): WebGLRenderList {
    let list: WebGLRenderList | null = null;
    let lists = this.lists;

    if (lists.has(scene) === false) {
      list = new WebGLRenderList(this.properties!);
      lists.set(scene, [list]);
    } else {
      if (renderCallDepth >= lists.get(scene).length) {
        list = new WebGLRenderList(this.properties!);
        lists.get(scene).push(list);
      } else {
        list = lists.get(scene)[renderCallDepth];
      }
    }

    return list;
  }

  dispose(): void {
    this.properties = null;
    this.lists = new Map();
  }
}

const painterSortStable: SortFn = function (a: RenderItem, b: RenderItem): i32 {
  if (a.groupOrder !== b.groupOrder) {
    return a.groupOrder - b.groupOrder;
  } else if (a.renderOrder !== b.renderOrder) {
    return a.renderOrder - b.renderOrder;
  } else if (a.program !== b.program) {
    return a.program!.id - b.program!.id;
  } else if (a.material!.id !== b.material!.id) {
    return a.material!.id - b.material!.id;
  } else if (a.z !== b.z) {
    return a.z - b.z;
  } else {
    return a.id - b.id;
  }
};

const reversePainterSortStable: SortFn = function (a: RenderItem, b: RenderItem): i32 {
  if (a.groupOrder !== b.groupOrder) {
    return a.groupOrder - b.groupOrder;
  } else if (a.renderOrder !== b.renderOrder) {
    return a.renderOrder - b.renderOrder;
  } else if (a.z !== b.z) {
    return b.z - a.z;
  } else {
    return a.id - b.id;
  }
};
