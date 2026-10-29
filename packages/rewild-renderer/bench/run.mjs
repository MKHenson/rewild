/**
 * Bundles the benchmark the same way esbuild bundles the workers, then runs it.
 *
 *     npm run bench                                    # every case
 *     npm run bench -- --filter "lod 0"                # names that contain "lod 0"
 *     npm run bench -- --runs 30 --warmup 5
 *     npm run bench -- --json bench-results/js.json    # save the results
 *     npm run bench -- --compare bench-results/js.json # speedup against saved results
 *
 * Paths are relative to the directory npm runs in, which is the repo root.
 */
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const outfile = path.join(here, 'build', 'bench.mjs');

await build({
  entryPoints: [path.join(here, 'main.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  outfile,
  tsconfig: path.join(here, '..', 'tsconfig.json'),
  loader: { '.wgsl': 'text' },
  logLevel: 'warning',
});

// --expose-gc lets the harness collect garbage between runs. Recent Node warns
// about `localStorage` when bundled code touches it, which is noise here.
const result = spawnSync(
  process.execPath,
  [
    '--expose-gc',
    '--disable-warning=ExperimentalWarning',
    outfile,
    ...process.argv.slice(2),
  ],
  { stdio: 'inherit' }
);
process.exit(result.status ?? 1);
