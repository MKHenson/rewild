import { readFileSync } from 'fs';
import { join } from 'path';
import { Geometry } from '../geometry/Geometry';
import { StandardInstancedPass } from './StandardInstancedPass';
import { StandardPass } from './StandardPass';
import { StandardPassBase } from './StandardPassBase';

const shaderSource = (name: string) =>
  readFileSync(join(__dirname, '../shaders', name), 'utf8');

function geometryWith(colors: boolean): Geometry {
  const geometry = new Geometry();
  geometry.vertices = new Float32Array(9);
  geometry.uvs = new Float32Array(6);
  geometry.normals = new Float32Array(9);
  if (colors) geometry.colors = new Float32Array(12);
  return geometry;
}

// Both passes are constructed device-free, so everything the base class decides
// can be tested without a GPU. Run identically against both, because the point
// of the base class is that a glTF material means the same thing whether it is
// drawn per mesh or per instance.
describe.each([
  ['StandardPass', () => new StandardPass() as StandardPassBase],
  ['StandardInstancedPass', () => new StandardInstancedPass() as StandardPassBase],
])('%s glTF semantics', (_name, create) => {
  it('starts at the glTF defaults', () => {
    const pass = create();
    expect(pass.alphaMode).toBe('OPAQUE');
    expect(pass.doubleSided).toBe(false);
    expect(pass.vertexColors).toBe(false);
    expect(pass.transparent).toBe(false);
  });

  it('reports BLEND as transparent, so the renderer draws it last', () => {
    const pass = create();
    pass.alphaMode = 'BLEND';
    expect(pass.transparent).toBe(true);
  });

  // MASK is order-independent by design — that is the whole reason a cutout
  // uses it rather than BLEND.
  it('does not report MASK as transparent', () => {
    const pass = create();
    pass.alphaMode = 'MASK';
    expect(pass.transparent).toBe(false);
  });

  it('pushes alphaMode into the uniform block as well as the pipeline', () => {
    const pass = create();
    pass.alphaMode = 'MASK';
    expect(pass.material.alphaMode).toBe('MASK');
  });

  // Each of the three changes pipeline state, and the pipeline is built with
  // layout 'auto' — so every bind group made against the old layout has to go
  // with it, or the next draw fails validation.
  it.each(['alphaMode', 'doubleSided', 'vertexColors'] as const)(
    'rebuilds the pipeline and its bind groups when %s changes',
    (property) => {
      const pass = create();
      pass.requiresRebuild = false;
      pass.material.requiresBuild = false;

      if (property === 'alphaMode') pass.alphaMode = 'BLEND';
      else pass[property] = true;

      expect(pass.requiresRebuild).toBe(true);
      expect(pass.material.requiresBuild).toBe(true);
    }
  );

  it('does not rebuild when a property is set to what it already was', () => {
    const pass = create();
    pass.requiresRebuild = false;

    pass.alphaMode = 'OPAQUE';
    pass.doubleSided = false;
    pass.vertexColors = false;

    expect(pass.requiresRebuild).toBe(false);
  });

  // vertexColors adds a vertex attribute, so a pass with it on genuinely cannot
  // draw geometry that has no COLOR_0 — better refused at assignment than as a
  // validation error on the first frame.
  it('requires COLOR_0 only when vertexColors is on', () => {
    const pass = create();
    expect(pass.isGeometryCompatible(geometryWith(false))).toBe(true);

    pass.vertexColors = true;
    expect(pass.isGeometryCompatible(geometryWith(false))).toBe(false);
    expect(pass.isGeometryCompatible(geometryWith(true))).toBe(true);
  });
});

// The two shaders differ only in their vertex stage and bind group layout. If a
// host ever grows its own copy of the shading, the passes can drift apart in
// ways nothing else here would catch.
describe('standard shader hosts', () => {
  it.each(['standard.wgsl', 'standard-instanced.wgsl'])(
    '%s shades through the shared include',
    (name) => {
      const source = shaderSource(name);
      expect(source).toContain('#include "./shader-lib/standard-material.wgsl"');
      expect(source).toContain('shadeStandardSurface(');
      // The struct belongs to the include; a second declaration here would be
      // a layout free to drift from the one StandardMaterial packs.
      expect(source).not.toContain('struct StandardParams');
    }
  );

  it.each(['standard.wgsl', 'standard-instanced.wgsl'])(
    '%s names the bindings the shared shading expects',
    (name) => {
      const source = shaderSource(name);
      for (const binding of [
        'mySampler',
        'baseColorMap',
        'normalMap',
        'metallicRoughnessMap',
        'occlusionMap',
        'emissiveMap',
        'standardParams',
        'spotLightShadowParams',
      ]) {
        expect(source).toMatch(new RegExp(`var(<uniform>)?\\s+${binding}\\b`));
      }
    }
  );

  it.each(['standard.wgsl', 'standard-instanced.wgsl'])(
    '%s offers both the plain and vertex-coloured entry points',
    (name) => {
      const source = shaderSource(name);
      expect(source).toContain('fn vs(');
      expect(source).toContain('fn vsVertexColors(');
    }
  );
});
