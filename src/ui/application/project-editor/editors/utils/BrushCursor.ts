import { Color, Vector3 } from 'rewild-common';
import { Mesh, Renderer, Geometry, RenderLayer, Transform } from 'rewild-renderer';
import { GizmoPass } from 'rewild-renderer/lib/materials/GizmoPass';
import { InteractionLayer } from 'src/core/InteractionLayer';
import { Raycaster, Intersection } from 'rewild-renderer/lib/core/Raycaster';

/**
 * The ring drawn on the terrain under a brush, shared by every terrain brush
 * tool (sculpt, biome paint). A flat unit-radius annulus scaled per frame to
 * the brush radius, on the Helper interaction layer so terrain and placement
 * raycasts pass straight through it.
 *
 * Colour is per-tool: the sculpt and paint brushes look and behave differently
 * enough that the ring should say which one has the pointer.
 */
export class BrushCursor {
  private mesh: Mesh | null = null;

  constructor(
    private renderer: Renderer,
    private color: Color,
    private name: string
  ) {}

  /**
   * Shows the ring on the terrain at `point`, scaled to `radius` world units,
   * or hides it when point is null.
   */
  update(point: Vector3 | null, radius: number) {
    if (!point) {
      this.hide();
      return;
    }
    if (!this.mesh) this.mesh = this.create();
    const ring = this.mesh;
    if (!ring.transform.parent) this.renderer.scene.addChild(ring.transform);
    ring.transform.visible = true;
    ring.visible = true;
    // Lifted slightly so the ring doesn't z-fight the surface it traces.
    ring.transform.position.set(point.x, point.y + 0.3, point.z);
    ring.transform.scale.set(radius, 1, radius);
  }

  hide() {
    if (!this.mesh) return;
    this.mesh.visible = false;
    this.mesh.transform.visible = false;
  }

  dispose() {
    if (!this.mesh) return;
    this.mesh.transform.removeFromParent();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.mesh = null;
  }

  private create(): Mesh {
    const segments = 64;
    const inner = 0.94;
    const vertices = new Float32Array(segments * 2 * 3);
    const normals = new Float32Array(segments * 2 * 3);
    const uvs = new Float32Array(segments * 2 * 2);
    const indices = new Uint32Array(segments * 6);

    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      const vi = i * 6;
      vertices[vi] = cos * inner;
      vertices[vi + 1] = 0;
      vertices[vi + 2] = sin * inner;
      vertices[vi + 3] = cos;
      vertices[vi + 4] = 0;
      vertices[vi + 5] = sin;
      normals[vi + 1] = 1;
      normals[vi + 4] = 1;
      uvs[i * 4] = 0;
      uvs[i * 4 + 1] = 0;
      uvs[i * 4 + 2] = 1;
      uvs[i * 4 + 3] = 0;

      const i0 = i * 2;
      const i1 = i * 2 + 1;
      const j0 = ((i + 1) % segments) * 2;
      const j1 = j0 + 1;
      const ti = i * 6;
      indices[ti] = i0;
      indices[ti + 1] = j0;
      indices[ti + 2] = i1;
      indices[ti + 3] = i1;
      indices[ti + 4] = j0;
      indices[ti + 5] = j1;
    }

    const geometry = new Geometry();
    geometry.vertices = vertices;
    geometry.normals = normals;
    geometry.uvs = uvs;
    geometry.indices = indices;

    const material = new GizmoPass();
    material.gizmoUniforms.color = this.color;
    material.gizmoUniforms.opacity = 0.75;

    const mesh = new Mesh(geometry, material);
    mesh.castShadow = false;
    mesh.transform.name = this.name;
    mesh.transform.renderLayer = RenderLayer.Overlay;
    mesh.transform.layers.set(InteractionLayer.Helper);
    mesh.transform.userData.isHelper = true;
    return mesh;
  }
}

/**
 * Raycasts against terrain chunk meshes only (ignoring actors, gizmos and
 * helpers) and returns the nearest hit, or null. `scratchTransforms` and
 * `scratchIntersections` are caller-owned so a per-move pick allocates nothing.
 */
export function pickTerrain(
  renderer: Renderer,
  raycaster: Raycaster,
  scratchTransforms: Transform[],
  scratchIntersections: Intersection[]
): Intersection | null {
  scratchTransforms.length = 0;
  scratchIntersections.length = 0;

  for (const chunk of renderer.terrainRenderer.terrainChunks.values()) {
    if (chunk.visible) scratchTransforms.push(chunk.transform);
  }

  const hits = raycaster.intersectObjects(
    scratchTransforms,
    true,
    scratchIntersections
  );
  return hits.length > 0 ? hits[0] : null;
}
