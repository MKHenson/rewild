/**
 * Serves the UI inspector with esbuild and rebuilds it on change.
 *
 *     npm run ui-inspector
 */
import * as esbuild from 'esbuild';
import { exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..', '..');
const outdir = path.join(here, 'build');
const port = 9002;

const fonts = path.join(here, '..', 'fonts');
const icons = path.join(here, '..', 'icons');
const staticFiles = [
  [path.join(here, 'index.html'), 'index.html'],
  [path.join(here, 'inspector.css'), 'inspector.css'],
  [path.join(root, 'style.css'), 'style.css'],
  [path.join(fonts, 'roboto-msdf.json'), 'fonts/roboto-msdf.json'],
  [path.join(fonts, 'roboto-msdf.png'), 'fonts/roboto-msdf.png'],
  [path.join(icons, 'lucide-icons.json'), 'icons/lucide-icons.json'],
  [path.join(icons, 'lucide-icons.png'), 'icons/lucide-icons.png'],
];

function copyStatic() {
  fs.mkdirSync(path.join(outdir, 'fonts'), { recursive: true });
  fs.mkdirSync(path.join(outdir, 'icons'), { recursive: true });
  for (const [src, name] of staticFiles)
    fs.copyFileSync(src, path.join(outdir, name));
}

const copyPlugin = {
  name: 'copy',
  setup(build) {
    build.onStart(copyStatic);
  },
};

const ctx = await esbuild.context({
  entryPoints: { inspector: path.join(here, 'main.ts') },
  bundle: true,
  sourcemap: true,
  tsconfig: path.join(here, '..', 'tsconfig.json'),
  outdir,
  loader: { '.wgsl': 'text' },
  plugins: [copyPlugin],
  logLevel: 'info',
});

await ctx.watch();
for (const [src] of staticFiles) fs.watch(src, copyStatic);
await ctx.serve({ servedir: outdir, port });

const url = `http://localhost:${port}`;
console.log(`UI inspector: ${url}`);
const open =
  process.platform === 'win32'
    ? `start ${url}`
    : process.platform === 'darwin'
    ? `open ${url}`
    : `xdg-open ${url}`;
exec(open);
