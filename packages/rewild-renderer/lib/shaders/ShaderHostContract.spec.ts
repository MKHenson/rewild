import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const SHADER_DIR = join(__dirname);

/**
 * Fragments that branch on a const the including host has to declare.
 *
 * Both shadow fragments take a cheaper path under HAS_FOLIAGE_SHADING. WGSL
 * resolves that name in the composed source, so a host that includes one
 * without declaring it fails to compile at device init — a long way from
 * whatever was actually added.
 */
const REQUIRED_CONSTS: Record<string, string[]> = {
  HAS_FOLIAGE_SHADING: [
    'directional-shadow.frag.wgsl',
    'spot-light-shadow.frag.wgsl',
  ],
  HAS_FOLIAGE_NORMAL_MAP: ['standard-material.wgsl'],
};

const hosts = readdirSync(SHADER_DIR).filter((name) => name.endsWith('.wgsl'));

describe('shader host contract', () => {
  it('finds the host shaders to check', () => {
    expect(hosts.length).toBeGreaterThan(5);
  });

  for (const [constName, fragments] of Object.entries(REQUIRED_CONSTS)) {
    it(`declares ${constName} in every host that includes ${fragments.join(
      ' or '
    )}`, () => {
      const missing: string[] = [];

      for (const host of hosts) {
        const source = readFileSync(join(SHADER_DIR, host), 'utf8');
        const includesAny = fragments.some((fragment) =>
          source.includes(fragment)
        );
        if (!includesAny) continue;
        if (!source.includes(`const ${constName}`)) missing.push(host);
      }

      expect(missing).toEqual([]);
    });
  }
});

// Fragments that write sceneIndirect, which scene-output.wgsl declares. The
// include does not dedupe, so the host includes it once itself.
const SCENE_OUTPUT_USERS = [
  'standard-material.wgsl',
  'foliage-lighting.wgsl',
  'SceneFragment',
];

describe('scene output contract', () => {
  it('includes scene-output.wgsl once in every host that writes it', () => {
    const missing: string[] = [];
    for (const host of hosts) {
      const source = readFileSync(join(SHADER_DIR, host), 'utf8');
      if (!SCENE_OUTPUT_USERS.some((user) => source.includes(user))) continue;
      const includes = source.match(
        /#include "\.\/shader-lib\/scene-output\.wgsl"/g
      );
      if (includes?.length !== 1) missing.push(host);
    }
    expect(missing).toEqual([]);
  });

  it('ends every SceneFragment entry point through sceneFragment()', () => {
    const bare: string[] = [];
    for (const host of hosts) {
      const source = readFileSync(join(SHADER_DIR, host), 'utf8');
      const entry = source.match(/\) -> SceneFragment \{([\s\S]*?)\n\}/);
      if (!entry) continue;
      for (const ret of entry[1].matchAll(/return\s+([^;]*);/g))
        if (!ret[1].startsWith('sceneFragment('))
          bare.push(`${host}: ${ret[0]}`);
    }
    expect(bare).toEqual([]);
  });
});

// WGSL reserves these as identifiers (a subset of the spec's list: the ones a
// shader author could plausibly reach for). Tint rejects them only when the
// device compiles the module, long after the edit that introduced them.
const RESERVED = new Set([
  'active', 'as', 'attribute', 'auto', 'become', 'cast', 'catch', 'class',
  'common', 'compile', 'do', 'enum', 'export', 'extends', 'filter', 'final',
  'from', 'get', 'goto', 'impl', 'import', 'layout', 'macro', 'match',
  'meta', 'mod', 'module', 'move', 'new', 'nil', 'of', 'pass', 'patch',
  'priv', 'public', 'ref', 'resource', 'self', 'set', 'shared', 'smooth',
  'static', 'target', 'this', 'type', 'union', 'unless', 'use', 'using',
  'varying', 'virtual', 'where', 'with', 'yield',
]);

// Every name a shader declares: let/var/const bindings and function
// parameters.
function declaredNames(source: string): string[] {
  const names: string[] = [];
  for (const match of source.matchAll(/\b(?:let|var|const)(?:<[^>]*>)?\s+(\w+)/g))
    names.push(match[1]);
  for (const match of source.matchAll(/\bfn\s+\w+\s*\(([^)]*)\)/g))
    for (const param of match[1].split(','))
      if (param.includes(':')) names.push(param.split(':')[0].replace(/@\w+(\([^)]*\))?/g, '').trim());
  return names;
}

describe('shader identifiers', () => {
  const sources = readdirSync(SHADER_DIR, { recursive: true })
    .map(String)
    .filter((name) => name.endsWith('.wgsl'));

  it.each(sources)('declares no reserved word in %s', (name) => {
    const source = readFileSync(join(SHADER_DIR, name), 'utf8');
    expect(declaredNames(source).filter((n) => RESERVED.has(n))).toEqual([]);
  });
});
