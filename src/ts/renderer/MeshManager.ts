import { Mesh } from "./Mesh";

class MeshManager {
  meshes: Mesh[];

  constructor() {
    this.meshes = [];
  }

  getPipeline(name: string) {
    return this.meshes.find((m) => m.name === name);
  }

  addMesh(mesh: Mesh) {
    const meshes = this.meshes;
    const index = meshes.indexOf(mesh);
    if (index === -1) {
      mesh.setRenderIndex(meshes.length);
      meshes.push(mesh);
    }

    return mesh;
  }

  removeMesh(mesh: Mesh) {
    const meshes = this.meshes;
    const index = meshes.indexOf(mesh);
    if (index !== -1) {
      mesh.setRenderIndex(-1);
      meshes.splice(index, 1);
    }

    return mesh;
  }
}

export const meshManager = new MeshManager();
