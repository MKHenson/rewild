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
