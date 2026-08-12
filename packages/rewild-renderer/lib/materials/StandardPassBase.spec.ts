import { readFileSync } from 'fs';
import { join } from 'path';
import { Geometry } from '../geometry/Geometry';
import { ShaderDefines, composeShader } from '../utils/shaderDefines';
import { StandardInstancedPass } from './StandardInstancedPass';
import { StandardPass } from './StandardPass';
import { StandardPassBase } from './StandardPassBase';

const shaderSource = (name: string) =>
  readFileSync(join(__dirname, '../shaders', name), 'utf8');

function geometryWith(colors: boolean, tangents = false): Geometry {
  const geometry = new Geometry();
  geometry.vertices = new Float32Array(9);
  geometry.uvs = new Float32Array(6);
  geometry.normals = new Float32Array(9);
  if (colors) geometry.colors = new Float32Array(12);
  if (tangents) geometry.tangents = new Float32Array(12);
  return geometry;
}

/** A geometry whose buffers are identifiable, and a pass encoder that records
 *  which slot each was bound to. */
function bufferBindings(pass: StandardPassBase) {
  const geometry = geometryWith(true, true);
  geometry.vertexBuffer = 'vertices' as unknown as GPUBuffer;
  geometry.uvBuffer = 'uvs' as unknown as GPUBuffer;
  geometry.normalBuffer = 'normals' as unknown as GPUBuffer;
  geometry.colorBuffer = 'colors' as unknown as GPUBuffer;
  geometry.tangentBuffer = 'tangents' as unknown as GPUBuffer;

  const slots: string[] = [];
  const encoder = {
    setVertexBuffer: (slot: number, buffer: string) => (slots[slot] = buffer),
    setIndexBuffer: () => {},
  } as unknown as GPURenderPassEncoder;

  // Protected because only a subclass's render() has any business calling them;
  // this is that call, made without a device.
  const internals = pass as unknown as {
    setVertexBuffers(p: GPURenderPassEncoder, g: Geometry): void;
    vertexBufferLayouts(): GPUVertexBufferLayout[];
  };
  internals.setVertexBuffers(encoder, geometry);

  return { slots, layouts: internals.vertexBufferLayouts() };
}

// Both passes are constructed device-free, so everything the base class decides
// can be tested without a GPU. Run identically against both, because the point
// of the base class is that a glTF material means the same thing whether it is
// drawn per mesh or per instance.
describe.each([
  [
    'StandardPass',
    () => new StandardPass() as StandardPassBase,
    'standard.wgsl',
  ],
  [
    'StandardInstancedPass',
    () => new StandardInstancedPass() as StandardPassBase,
    'standard-instanced.wgsl',
  ],
])('%s glTF semantics', (_name, create, shaderName) => {
  it('starts at the glTF defaults', () => {
    const pass = create();
    expect(pass.alphaMode).toBe('OPAQUE');
    expect(pass.doubleSided).toBe(false);
    expect(pass.vertexColors).toBe(false);
    expect(pass.vertexTangents).toBe(false);
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

  // Each of these changes pipeline state, and the pipeline is built with
  // layout 'auto' — so every bind group made against the old layout has to go
  // with it, or the next draw fails validation.
  it.each([
    'alphaMode',
    'doubleSided',
    'vertexColors',
    'vertexTangents',
  ] as const)(
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
    pass.vertexTangents = false;

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

  // Same bargain as COLOR_0: the attribute is in the layout, so the geometry
  // has to supply it. A procedural box carries no tangents, and assigning it a
  // tangent-shaded material is a mistake worth catching at assignment.
  it('requires TANGENT only when vertexTangents is on', () => {
    const pass = create();
    expect(pass.isGeometryCompatible(geometryWith(false))).toBe(true);

    pass.vertexTangents = true;
    expect(pass.isGeometryCompatible(geometryWith(false))).toBe(false);
    expect(pass.isGeometryCompatible(geometryWith(false, true))).toBe(true);
  });

  // The two optional attributes are bound by position, so a tangent binds to a
  // different slot depending on whether COLOR_0 is there — and a mismatch with
  // vertexBufferLayouts() would read colours as a tangent frame.
  it.each([
    [false, false, ['vertices', 'uvs', 'normals']],
    [true, false, ['vertices', 'uvs', 'normals', 'colors']],
    [false, true, ['vertices', 'uvs', 'normals', 'tangents']],
    [true, true, ['vertices', 'uvs', 'normals', 'colors', 'tangents']],
  ] as const)(
    'binds the vertex buffers its layout declares (colors: %s, tangents: %s)',
    (colors, tangents, expected) => {
      const pass = create();
      pass.vertexColors = colors;
      pass.vertexTangents = tangents;

      const { slots, layouts } = bufferBindings(pass);

      expect(slots).toEqual(expected);
      expect(layouts).toHaveLength(expected.length);
    }
  );

  // The frame choice is compiled in rather than read from a uniform, so the
  // define table and the host's placeholder have to agree — composeShader
  // throws on a placeholder the table does not answer, which is the failure
  // this would otherwise only show as a shader compile error on first draw.
  it.each([false, true])(
    'compiles the shader with vertexTangents = %s baked in',
    (tangents) => {
      const pass = create();
      pass.vertexTangents = tangents;
      const defines = (
        pass as unknown as { shaderDefines(): ShaderDefines }
      ).shaderDefines();

      const source = composeShader([shaderSource(shaderName)], defines);

      expect(source).toContain(
        `const HAS_VERTEX_TANGENTS: bool = ${tangents};`
      );
    }
  );

  it('names a vertex entry point for every attribute combination', () => {
    const pass = create();
    const internals = pass as unknown as { vertexEntryPoint(): string };
    const entryPoints = new Set<string>();

    for (const colors of [false, true]) {
      for (const tangents of [false, true]) {
        pass.vertexColors = colors;
        pass.vertexTangents = tangents;
        entryPoints.add(internals.vertexEntryPoint());
      }
    }

    expect([...entryPoints].sort()).toEqual([
      'vs',
      'vsTangents',
      'vsVertexColors',
      'vsVertexColorsTangents',
    ]);
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
      expect(source).toContain(
        '#include "./shader-lib/standard-material.wgsl"'
      );
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

  // One entry point per optional-attribute combination, in both hosts — the
  // pass names them by string, so a missing one is a pipeline creation failure
  // at runtime rather than a compile error here.
  it.each(['standard.wgsl', 'standard-instanced.wgsl'])(
    '%s declares an entry point for every attribute combination',
    (name) => {
      const source = shaderSource(name);
      for (const entryPoint of [
        'vs',
        'vsVertexColors',
        'vsTangents',
        'vsVertexColorsTangents',
      ]) {
        expect(source).toContain(`fn ${entryPoint}(`);
      }
    }
  );

  // Without a tangent reaching the fragment stage, the shared shading has
  // nothing to choose a frame with and every normal map falls back to the
  // derivative reconstruction.
  it.each(['standard.wgsl', 'standard-instanced.wgsl'])(
    '%s passes the tangent through to the shared shading',
    (name) => {
      const source = shaderSource(name);
      expect(source).toContain('@location(4) tangent : vec4f');
      expect(source).toContain('@location(4) tangent: vec4f');
    }
  );

  it('branches on the host-supplied define in the shared shading', () => {
    const source = shaderSource('shader-lib/standard-material.wgsl');

    expect(source).toContain('if (HAS_VERTEX_TANGENTS)');
    expect(source).toContain('perturbNormalTangent(');
    // The fallback stays: geometry without tangents is still the common case,
    // and every procedural geometry factory produces it.
    expect(source).toContain('perturbNormal(');
  });
});
