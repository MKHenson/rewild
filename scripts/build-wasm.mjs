/**
 * Builds the rewild WASM module into packages/rewild-wasm/pkg.
 *
 *     npm run build:wasm
 *
 * Needs a Rust toolchain with the wasm32-unknown-unknown target, and wasm-pack.
 * See docs/wasm.md.
 */
import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workspace = path.join(root, 'packages', 'rewild-wasm');

const result = spawnSync(
  'wasm-pack',
  [
    'build',
    path.join(workspace, 'crates', 'rewild-wasm'),
    '--target',
    'web',
    '--release',
    '--no-pack',
    '--out-dir',
    path.join(workspace, 'pkg'),
    '--out-name',
    'rewild_wasm',
  ],
  // Windows resolves wasm-pack.exe and .cmd shims only through a shell.
  { stdio: 'inherit', shell: process.platform === 'win32' }
);

if (result.error) {
  console.error(
    `Could not run wasm-pack: ${result.error.message}. See docs/wasm.md.`
  );
  process.exit(1);
}
if (result.status !== 0) process.exit(result.status ?? 1);

// Types for the raw WASM exports. Nothing reads them, and TypeScript would pick
// them over the `*.wasm` URL declaration for `import url from '...wasm'`.
rmSync(path.join(workspace, 'pkg', 'rewild_wasm_bg.wasm.d.ts'), {
  force: true,
});
