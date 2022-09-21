import { Mesh } from "./Mesh";

class MeshManager {
  meshes: Map<number, Mesh>;

  constructor() {
    this.meshes = new Map();
  }

  addMesh(mesh: Mesh) {
    const meshes = this.meshes;

    // @ts-expect-error
    const meshPtr = mesh.meshComponent | 0;

    if (!meshes.has(meshPtr)) {
      meshes.set(meshPtr, mesh);
    }

    return mesh;
  }

  removeMesh(mesh: Mesh) {
    const meshes = this.meshes;

    // @ts-expect-error
    const meshPtr = mesh.meshComponent | 0;

    if (meshes.has(meshPtr)) {
      meshes.delete(meshPtr);
    }

    return mesh;
  }
}

export const meshManager = new MeshManager();
